import {
  createServiceClient,
  darajaAccessToken,
  darajaBaseUrl,
  darajaTimestamp,
  jsonResponse,
  requiredEnv,
  stkPassword,
} from "../_shared/mpesa.ts";

function callbackMetadata(items: Array<{ Name: string; Value?: string | number }> = []) {
  return Object.fromEntries(items.map((item) => [item.Name, item.Value]));
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ ResultCode: 0, ResultDesc: "Accepted" });
  }

  const service = createServiceClient();
  let checkoutRequestId: string | null = null;
  try {
    const payload = await request.json();
    const callback = payload?.Body?.stkCallback;
    checkoutRequestId = callback?.CheckoutRequestID || null;
    if (!checkoutRequestId) {
      return jsonResponse({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    if (Number(callback.ResultCode) !== 0) {
      const { error } = await service.rpc("flag_mpesa_stk_review", {
        p_checkout_request_id: checkoutRequestId,
        p_result_description: String(callback.ResultDesc || "M-Pesa did not confirm the payment."),
      });
      if (error) {
        console.error("Could not flag failed M-Pesa callback for review:", error.message);
      }
      return jsonResponse({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const shortcode = requiredEnv("MPESA_SHORTCODE");
    const timestamp = darajaTimestamp();
    const accessToken = await darajaAccessToken();
    const queryResponse = await fetch(`${darajaBaseUrl()}/mpesa/stkpushquery/v1/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: stkPassword(timestamp),
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
    });
    const queryResult = await queryResponse.json();
    if (!queryResponse.ok || String(queryResult.ResultCode) !== "0") {
      const { error } = await service.rpc("flag_mpesa_stk_review", {
        p_checkout_request_id: checkoutRequestId,
        p_result_description: String(queryResult.ResultDesc || queryResult.errorMessage || "Could not independently verify M-Pesa payment."),
      });
      if (error) {
        console.error("Could not flag unverified M-Pesa callback for review:", error.message);
      }
      return jsonResponse({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    const metadata = callbackMetadata(callback.CallbackMetadata?.Item || []);
    const { data: result, error } = await service.rpc("confirm_mpesa_stk_payment", {
      p_checkout_request_id: checkoutRequestId,
      p_amount: Number(metadata.Amount),
      p_phone_number: String(metadata.PhoneNumber || ""),
      p_mpesa_receipt_number: String(metadata.MpesaReceiptNumber || ""),
    });
    if (error || result !== "completed") {
      const { error: flagError } = await service.rpc("flag_mpesa_stk_review", {
        p_checkout_request_id: checkoutRequestId,
        p_result_description: error?.message || "Payment details require administrator reconciliation.",
      });
      if (flagError) {
        console.error("Could not flag mismatched M-Pesa callback for review:", flagError.message);
      }
    }
    return jsonResponse({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    if (checkoutRequestId) {
      const { error: flagError } = await service.rpc("flag_mpesa_stk_review", {
        p_checkout_request_id: checkoutRequestId,
        p_result_description: error instanceof Error ? error.message : "Payment callback needs administrator review.",
      });
      if (flagError) {
        console.error("Could not flag M-Pesa callback after processing error:", flagError.message);
      }
    }
    console.error("M-Pesa callback processing failed:", error);
    return jsonResponse({ ResultCode: 0, ResultDesc: "Accepted" });
  }
});
