import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  createServiceClient,
  darajaAccessToken,
  darajaBaseUrl,
  darajaTimestamp,
  jsonResponse,
  normalizeKenyanPhone,
  requiredEnv,
  stkPassword,
} from "../_shared/mpesa.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let service: ReturnType<typeof createServiceClient> | null = null;
  let paymentId: string | null = null;
  let stkSubmitted = false;
  let stkAccepted = false;
  let checkoutRequestId: string | null = null;
  try {
    const authorization = request.headers.get("Authorization");
    const token = authorization?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return jsonResponse({ error: "Sign in before starting an M-Pesa payment." }, 401);
    }

    const supabaseUrl = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userResult, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userResult.user) {
      return jsonResponse({ error: "Your session is invalid or expired. Sign in again." }, 401);
    }
    const user = userResult.user;
    service = createServiceClient();
    const { data: member, error: memberError } = await service
      .from("member_profiles")
      .select("id, status, phone")
      .eq("id", user.id)
      .maybeSingle();
    if (memberError) {
      throw new Error(`Could not verify member status: ${memberError.message}`);
    }
    if (member?.status !== "approved") {
      return jsonResponse({ error: "An approved member account is required to make a payment." }, 403);
    }

    const body = await request.json();
    const paymentType = body.payment_type;
    const amount = Number(body.amount);
    const phoneNumber = normalizeKenyanPhone(String(body.phone_number || ""));
    const loanId = body.loan_id ? String(body.loan_id) : null;
    if (!["savings", "loan_repayment"].includes(paymentType)
      || !Number.isInteger(amount) || amount < 1 || amount > 250000
      || (paymentType === "savings" && loanId)
      || (paymentType === "loan_repayment" && !loanId)) {
      return jsonResponse({ error: "Choose savings or a loan, and enter a whole KES amount from 1 to 250,000." }, 400);
    }

    if (paymentType === "loan_repayment") {
      const { data: loan, error: loanError } = await service
        .from("loans")
        .select("id, member_id, principal, status")
        .eq("id", loanId)
        .eq("member_id", user.id)
        .in("status", ["active", "approved"])
        .maybeSingle();
      if (loanError) {
        throw new Error(`Could not verify the selected loan: ${loanError.message}`);
      }
      if (!loan) {
        return jsonResponse({ error: "Choose one of your active loans." }, 400);
      }
      const { data: installments, error: scheduleError } = await service
        .from("loan_repayment_schedule")
        .select("amount, paid_amount")
        .eq("loan_id", loanId);
      if (scheduleError) {
        throw new Error(`Could not verify the loan balance: ${scheduleError.message}`);
      }
      let outstanding = (installments || []).reduce(
        (total, row) => total + Number(row.amount) - Number(row.paid_amount),
        0,
      );
      if (!installments?.length) {
        const { data: repayments, error: repaymentError } = await service
          .from("loan_repayments")
          .select("amount")
          .eq("loan_id", loanId);
        if (repaymentError) {
          throw new Error(`Could not verify previous repayments: ${repaymentError.message}`);
        }
        outstanding = Math.max(
          0,
          Number(loan.principal) - (repayments || []).reduce((total, row) => total + Number(row.amount), 0),
        );
      }
      if (amount > outstanding) {
        return jsonResponse({ error: "The payment exceeds the current outstanding loan balance." }, 400);
      }
    }

    const shortcode = requiredEnv("MPESA_SHORTCODE");
    const callbackUrl = requiredEnv("MPESA_CALLBACK_URL");
    if (!callbackUrl.startsWith("https://")) {
      throw new Error("MPESA_CALLBACK_URL must be a publicly reachable HTTPS URL.");
    }
    const accountReference = `VC${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
    const { data: payment, error: insertError } = await service
      .from("mpesa_payment_records")
      .insert({
        member_id: user.id,
        payment_type: paymentType,
        loan_id: loanId,
        source: "stk_push",
        amount,
        phone_number: phoneNumber,
        account_reference: accountReference,
        status: "pending",
      })
      .select("id")
      .single();
    if (insertError) {
      throw new Error(`Could not create the payment record: ${insertError.message}`);
    }
    paymentId = payment.id;

    const timestamp = darajaTimestamp();
    const accessToken = await darajaAccessToken();
    stkSubmitted = true;
    const stkResponse = await fetch(`${darajaBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: stkPassword(timestamp),
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phoneNumber,
        PartyB: shortcode,
        PhoneNumber: phoneNumber,
        CallBackURL: callbackUrl,
        AccountReference: accountReference,
        TransactionDesc: paymentType === "savings" ? "Vyro savings" : "Loan repay",
      }),
    });
    const stkResult = await stkResponse.json();
    if (!stkResponse.ok || stkResult.ResponseCode !== "0" || !stkResult.CheckoutRequestID) {
      const { error: updateError } = await service.from("mpesa_payment_records")
        .update({
          status: "failed",
          result_description: String(stkResult.errorMessage || stkResult.ResponseDescription || "M-Pesa did not accept the payment request.").slice(0, 300),
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);
      if (updateError) {
        console.error("Could not save failed M-Pesa request status:", updateError.message);
      }
      return jsonResponse({
        error: String(stkResult.errorMessage || stkResult.ResponseDescription || "M-Pesa did not accept the payment request."),
      }, stkSubmitted ? 502 : 400);
    }
    stkAccepted = true;
    checkoutRequestId = stkResult.CheckoutRequestID;

    const { error: updateError } = await service
      .from("mpesa_payment_records")
      .update({
        checkout_request_id: checkoutRequestId,
        merchant_request_id: stkResult.MerchantRequestID || null,
        result_description: stkResult.CustomerMessage || "STK prompt sent.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id);
    if (updateError) {
      await service.from("mpesa_payment_records")
        .update({
          status: "needs_review",
          result_description: "M-Pesa accepted the prompt, but its callback reference could not be saved.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);
      throw new Error(`M-Pesa prompt started, but the callback reference could not be saved: ${updateError.message}`);
    }

    return jsonResponse({
      message: stkResult.CustomerMessage || "Check your phone and enter your M-Pesa PIN to complete payment.",
      paybillNumber: shortcode,
      accountReference,
      paymentId: payment.id,
    });
  } catch (error) {
    if (service && paymentId) {
      const status = stkAccepted ? "needs_review" : stkSubmitted ? "needs_review" : "failed";
      const { error: updateError } = await service.from("mpesa_payment_records")
        .update({
          status,
          checkout_request_id: checkoutRequestId,
          result_description: String(error instanceof Error ? error.message : "The payment request could not be completed.").slice(0, 300),
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentId)
        .in("status", ["pending", "needs_review"]);
      if (updateError) {
        console.error("Could not save M-Pesa request status after error:", updateError.message);
      }
    }
    return jsonResponse({
      error: error instanceof Error ? error.message : "The M-Pesa request could not be completed.",
    }, 502);
  }
});
