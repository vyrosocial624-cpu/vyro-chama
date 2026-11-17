import { createHash, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";

const port = Number(process.env.PORT || 3000);
const maxBodyBytes = 1024 * 1024;
const allowedEvents = new Set([
  "member_profiles",
  "loan_requests",
  "loan_request_guarantors",
  "savings_transactions",
  "loan_repayments",
  "mpesa_payment_records",
  "savings_withdrawal_requests",
  "group_announcements",
  "group_meetings",
]);

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const supabase = createClient(
  requiredEnv("SUPABASE_URL"),
  requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { autoRefreshToken: false, persistSession: false } }
);
const webhookSecret = requiredEnv("EMAIL_WEBHOOK_SECRET");
const resendApiKey = requiredEnv("RESEND_API_KEY");
const emailFrom = requiredEnv("EMAIL_FROM");
const siteUrl = new URL(requiredEnv("SITE_URL"));
if (!["http:", "https:"].includes(siteUrl.protocol)) {
  throw new Error("SITE_URL must use HTTP or HTTPS.");
}
const adminRecipients = (process.env.ADMIN_NOTIFICATION_EMAIL || "admin@vyrosocial.com")
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function actionUrl(path = "/") {
  return new URL(path, siteUrl).toString();
}

function renderEmail({ greeting, paragraphs, actionLabel = "Open member portal", actionPath = "/" }) {
  const safeParagraphs = paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
  const url = escapeHtml(actionUrl(actionPath));
  return {
    text: `${greeting}\n\n${paragraphs.join("\n\n")}\n\n${actionLabel}: ${actionUrl(actionPath)}\n\nVyro Self Help Group`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#17245f"><h2>${escapeHtml(greeting)}</h2>${safeParagraphs}<p><a href="${url}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#1754db;color:#fff;text-decoration:none">${escapeHtml(actionLabel)}</a></p><p>Vyro Self Help Group</p></div>`,
  };
}

function makeIdempotencyKey(identity, recipient) {
  return createHash("sha256").update(`${identity}:${recipient.toLowerCase()}`).digest("hex");
}

async function sendEmail({ to, subject, greeting, paragraphs, actionLabel, actionPath, identity }) {
  if (!to) {
    throw new Error("Cannot send an email without a recipient.");
  }
  const content = renderEmail({ greeting, paragraphs, actionLabel, actionPath });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": makeIdempotencyKey(identity, to),
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [to],
      subject,
      text: content.text,
      html: content.html,
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend request failed with HTTP ${response.status}.`);
  }
}

async function sendToMember(memberId, message) {
  if (!memberId) {
    throw new Error("Email event is missing its member ID.");
  }
  const [{ data: profile, error: profileError }, { data: userResult, error: userError }] =
    await Promise.all([
      supabase.from("member_profiles").select("id, full_name").eq("id", memberId).maybeSingle(),
      supabase.auth.admin.getUserById(memberId),
    ]);
  if (profileError) throw new Error(`Unable to load member profile: ${profileError.message}`);
  if (userError) throw new Error(`Unable to load member email: ${userError.message}`);
  const email = userResult.user?.email;
  if (!profile || !email) {
    throw new Error("The member profile or its email address could not be found.");
  }
  await sendEmail({
    to: email,
    greeting: `Hello ${profile.full_name || "Vyro member"},`,
    ...message,
  });
}

async function notifyAdministrators(message) {
  await Promise.all(adminRecipients.map((to) => sendEmail({ to, ...message })));
}

async function getLoanRequest(requestId) {
  const { data, error } = await supabase
    .from("loan_requests")
    .select("id, member_id, requested_amount, purpose, status")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load loan request: ${error.message}`);
  if (!data) throw new Error("The loan request referenced by the email event was not found.");
  return data;
}

function eventIdentity(event, suffix) {
  const row = event.record || {};
  return [
    event.table,
    event.type,
    row.id || row.request_id || "unknown",
    row.status || "",
    suffix,
  ].join(":");
}

async function handleMemberProfile(event) {
  const { record, old_record: oldRecord } = event;
  const statusChanged = oldRecord?.status !== record.status;
  const identity = eventIdentity(event, "member");
  if (event.type === "INSERT" && record.status === "pending" && record.role !== "admin") {
    const [{ data: userResult, error }] = await Promise.all([
      supabase.auth.admin.getUserById(record.id),
    ]);
    if (error) throw new Error(`Unable to load registration email: ${error.message}`);
    const user = userResult.user;
    await notifyAdministrators({
      identity,
      subject: "New Vyro membership request",
      greeting: "A new member has requested access.",
      paragraphs: [
        `Name: ${record.full_name || "Not provided"}`,
        `Email: ${user?.email || "Not available"}`,
        "Review the request in the administrator dashboard.",
      ],
      actionLabel: "Open administrator portal",
      actionPath: "/admin/",
    });
    return;
  }
  if (event.type === "UPDATE" && statusChanged && ["approved", "rejected", "suspended"].includes(record.status)) {
    const approved = record.status === "approved";
    await sendToMember(record.id, {
      identity,
      subject: approved ? "Your Vyro membership is approved" : "Your Vyro membership status changed",
      paragraphs: [approved
        ? "Your membership has been approved. You can now sign in to the member portal."
        : `Your membership status is ${record.status}. Contact a group administrator if you need more information.`],
    });
  }
}

async function handleLoanRequest(event) {
  const { record, old_record: oldRecord } = event;
  const identity = eventIdentity(event, "loan");
  if (event.type === "INSERT") {
    await Promise.all([
      sendToMember(record.member_id, {
        identity: `${identity}:member`,
        subject: "Loan request received",
        paragraphs: [
          `Your request for KES ${Number(record.requested_amount).toLocaleString("en-KE")} has been received.`,
          "You can follow its progress in the member portal. The request will be reviewed after the required guarantors respond.",
        ],
      }),
      notifyAdministrators({
        identity: `${identity}:admin`,
        subject: "New loan request",
        greeting: "A member has submitted a loan request.",
        paragraphs: [
          `Requested amount: KES ${Number(record.requested_amount).toLocaleString("en-KE")}`,
          `Purpose: ${record.purpose}`,
          "Review the request in the administrator dashboard.",
        ],
        actionLabel: "Open administrator portal",
        actionPath: "/admin/",
      }),
    ]);
    return;
  }
  if (event.type !== "UPDATE" || oldRecord?.status === record.status) return;
  if (record.status === "pending" && oldRecord?.status === "awaiting_guarantors") {
    await notifyAdministrators({
      identity,
      subject: "Loan request ready for review",
      greeting: "A loan request is ready for administrator review.",
      paragraphs: [
        `Requested amount: KES ${Number(record.requested_amount).toLocaleString("en-KE")}`,
        `Purpose: ${record.purpose}`,
      ],
      actionLabel: "Open administrator portal",
      actionPath: "/admin/",
    });
  } else if (["approved", "rejected"].includes(record.status)) {
    await sendToMember(record.member_id, {
      identity,
      subject: record.status === "approved" ? "Loan request approved" : "Loan request update",
      paragraphs: [
        record.status === "approved"
          ? "Your loan request has been approved. Sign in to review the loan and repayment details."
          : `Your loan request was not approved.${record.admin_note ? ` Administrator note: ${record.admin_note}` : " Contact a group administrator if you need more information."}`,
      ],
    });
  }
}

async function handleGuarantor(event) {
  const row = event.record;
  const request = await getLoanRequest(row.request_id);
  const identity = eventIdentity(event, "guarantor");
  if (event.type === "INSERT") {
    const { data: profile, error } = await supabase
      .from("member_profiles")
      .select("full_name")
      .eq("id", request.member_id)
      .maybeSingle();
    if (error) throw new Error(`Unable to load borrower profile: ${error.message}`);
    await sendToMember(row.guarantor_id, {
      identity,
      subject: "Loan guarantor consent requested",
      paragraphs: [
        `${profile?.full_name || "A group member"} selected you as a loan guarantor.`,
        `Requested amount: KES ${Number(request.requested_amount).toLocaleString("en-KE")}. Sign in to review and respond.`,
      ],
    });
    return;
  }
  if (event.type !== "UPDATE" || event.old_record?.status === row.status) return;
  const response = row.status === "accepted" ? "accepted" : row.status === "declined" ? "declined" : null;
  if (!response) return;
  await sendToMember(request.member_id, {
    identity,
    subject: `A guarantor ${response} your loan request`,
    paragraphs: [`One of your selected guarantors ${response} your request. Sign in to review its progress.`],
  });
}

async function handleMpesaPayment(event) {
  const { record, old_record: oldRecord } = event;
  const identity = eventIdentity(event, "mpesa");
  const amount = `KES ${Number(record.amount).toLocaleString("en-KE")}`;
  const paymentType = record.payment_type === "loan_repayment" ? "loan repayment" : "savings contribution";

  if (event.type === "INSERT" && record.source === "manual" && record.status === "pending") {
    await Promise.all([
      sendToMember(record.member_id, {
        identity: `${identity}:member`,
        subject: "M-Pesa reference submitted",
        paragraphs: [
          `Your ${paymentType} reference for ${amount} was submitted for administrator verification.`,
          `Reference: ${record.manual_reference}`,
        ],
      }),
      notifyAdministrators({
        identity: `${identity}:admin`,
        subject: "M-Pesa reference requires review",
        greeting: "A member submitted an M-Pesa reference.",
        paragraphs: [
          `Payment type: ${paymentType}`,
          `Amount: ${amount}`,
          `Reference: ${record.manual_reference}`,
        ],
        actionLabel: "Open administrator portal",
        actionPath: "/admin/",
      }),
    ]);
    return;
  }

  if (event.type !== "UPDATE" || oldRecord?.status === record.status) return;
  const statusMessages = {
    failed: "Your M-Pesa payment could not be completed. Check the payment details and try again.",
    needs_review: "Your M-Pesa payment needs administrator review. We will update you when it has been checked.",
    rejected: `Your M-Pesa reference was not approved.${record.review_note ? ` Administrator note: ${record.review_note}` : " Contact a group administrator if you need more information."}`,
  };
  const message = statusMessages[record.status];
  if (!message) return;
  await sendToMember(record.member_id, {
    identity,
    subject: record.status === "rejected" ? "M-Pesa reference not approved" : "M-Pesa payment update",
    paragraphs: [message, `Payment amount: ${amount}.`],
  });
}

async function handleSavingsWithdrawal(event) {
  const { record, old_record: oldRecord } = event;
  const identity = eventIdentity(event, "withdrawal");
  const amount = `KES ${Number(record.amount).toLocaleString("en-KE")}`;

  if (event.type === "INSERT") {
    await Promise.all([
      sendToMember(record.member_id, {
        identity: `${identity}:member`,
        subject: "Savings withdrawal request received",
        paragraphs: [
          `Your request to withdraw ${amount} has been received and is awaiting administrator review.`,
          `Reason: ${record.reason}`,
        ],
      }),
      notifyAdministrators({
        identity: `${identity}:admin`,
        subject: "Savings withdrawal request",
        greeting: "A member requested a savings withdrawal.",
        paragraphs: [`Requested amount: ${amount}`, `Reason: ${record.reason}`],
        actionLabel: "Open administrator portal",
        actionPath: "/admin/",
      }),
    ]);
    return;
  }

  if (event.type !== "UPDATE" || oldRecord?.status === record.status) return;
  if (!["approved", "rejected"].includes(record.status)) return;
  await sendToMember(record.member_id, {
    identity,
    subject: record.status === "approved" ? "Savings withdrawal request approved" : "Savings withdrawal request update",
    paragraphs: [
      record.status === "approved"
        ? `Your savings withdrawal request for ${amount} was approved. The group will arrange the payout separately.`
        : `Your savings withdrawal request for ${amount} was not approved.${record.admin_note ? ` Administrator note: ${record.admin_note}` : " Contact a group administrator if you need more information."}`,
    ],
  });
}

async function getApprovedMemberEmails() {
  const { data: profiles, error: profilesError } = await supabase
    .from("member_profiles")
    .select("id")
    .eq("status", "approved");
  if (profilesError) throw new Error(`Unable to load approved members: ${profilesError.message}`);
  const memberIds = new Set((profiles || []).map((profile) => profile.id));
  const emails = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Unable to load member email addresses: ${error.message}`);
    for (const user of data.users) {
      if (user.email && memberIds.has(user.id)) emails.push(user.email);
    }
    if (data.users.length < perPage) break;
  }
  return emails;
}

async function handleWebhook(event) {
  if (
    event.schema !== "public" ||
    !allowedEvents.has(event.table) ||
    !["INSERT", "UPDATE"].includes(event.type) ||
    !event.record
  ) {
    return;
  }
  switch (event.table) {
    case "member_profiles":
      await handleMemberProfile(event);
      break;
    case "loan_requests":
      await handleLoanRequest(event);
      break;
    case "loan_request_guarantors":
      await handleGuarantor(event);
      break;
    case "mpesa_payment_records":
      await handleMpesaPayment(event);
      break;
    case "savings_withdrawal_requests":
      await handleSavingsWithdrawal(event);
      break;
    case "savings_transactions": {
      const { record } = event;
      const withdrawal = record.entry_type === "withdrawal";
      await sendToMember(record.member_id, {
        identity: eventIdentity(event, "savings"),
        subject: withdrawal ? "Savings withdrawal recorded" : "Savings contribution recorded",
        paragraphs: [
          `${withdrawal ? "A withdrawal" : "A savings contribution"} of KES ${Number(record.amount).toLocaleString("en-KE")} was recorded.`,
          record.description || "Sign in to review your updated savings balance.",
        ],
      });
      break;
    }
    case "loan_repayments": {
      const { data: loan, error } = await supabase
        .from("loans")
        .select("member_id")
        .eq("id", event.record.loan_id)
        .maybeSingle();
      if (error) throw new Error(`Unable to load repayment member: ${error.message}`);
      if (!loan) throw new Error("The loan referenced by the repayment was not found.");
      await sendToMember(loan.member_id, {
        identity: eventIdentity(event, "repayment"),
        subject: "Loan repayment recorded",
        paragraphs: [`A loan repayment of KES ${Number(event.record.amount).toLocaleString("en-KE")} was recorded.`],
      });
      break;
    }
    case "group_announcements": {
      const recipients = await getApprovedMemberEmails();
      const identity = eventIdentity(event, "announcement");
      await Promise.all(recipients.map((to) => sendEmail({
        to,
        identity,
        subject: `Vyro Chama: ${event.record.title}`,
        greeting: event.record.title,
        paragraphs: [event.record.body],
      })));
      break;
    }
    case "group_meetings": {
      const recipients = await getApprovedMemberEmails();
      const startsAt = new Intl.DateTimeFormat("en-KE", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(event.record.starts_at));
      const identity = eventIdentity(event, "meeting");
      await Promise.all(recipients.map((to) => sendEmail({
        to,
        identity,
        subject: "Vyro group meeting scheduled",
        greeting: "A new group meeting has been scheduled.",
        paragraphs: [`${event.record.title} · ${startsAt}`],
      })));
      break;
    }
  }
}

function authorized(request) {
  const provided = request.headers.authorization || "";
  const expected = `Bearer ${webhookSecret}`;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer);
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBodyBytes) {
      throw new Error("Request body exceeds the allowed size.");
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/healthz") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ status: "ok" }));
    return;
  }
  if (request.method !== "POST" || request.url !== "/webhooks/supabase") {
    response.writeHead(404);
    response.end();
    return;
  }
  if (!authorized(request)) {
    response.writeHead(401);
    response.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }
  if (!request.headers["content-type"]?.includes("application/json")) {
    response.writeHead(415);
    response.end(JSON.stringify({ error: "Expected application/json" }));
    return;
  }
  try {
    const event = await readJson(request);
    await handleWebhook(event);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ received: true }));
  } catch (error) {
    console.error("Email webhook processing failed:", error instanceof Error ? error.message : "Unknown error");
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: "Email notification could not be processed." }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Vyro email service listening on port ${port}`);
});
