# M-Pesa Paybill setup

The member portal supports Paybill STK Push for savings and loan repayments, plus manual M-Pesa reference submissions. STK payments are verified through Daraja before they are posted. Manual references remain pending until an administrator checks the Paybill statement and approves them. STK payments whose callback cannot be verified or posted automatically are also held for administrator reconciliation.

Members can submit one savings withdrawal request at a time from the **My savings** page. The request must not exceed the current available savings balance. An administrator can approve or reject it in **Savings & limits**; approval posts the withdrawal to the savings ledger. The group must arrange the actual payout separately.

## Before going live

Obtain a Safaricom Paybill and Daraja API credentials for the matching environment. Test with Daraja sandbox credentials and sandbox-enabled test numbers first. Production payments require the real Paybill, production credentials, and Safaricom approval.

Do not put the Daraja consumer secret, passkey, or Supabase service-role key in website files, browser code, or a public repository.

## Database and functions

1. Run the complete, latest `supabase-setup.sql` script in the Supabase SQL Editor. Re-run it after application updates so tables and functions for M-Pesa reconciliation and savings withdrawal requests are installed.
2. Set the following values in Supabase Edge Function secrets:
   - `MPESA_ENVIRONMENT`: `sandbox` for testing, or `production` after approval.
   - `MPESA_SHORTCODE`: the Paybill shortcode.
   - `MPESA_CONSUMER_KEY` and `MPESA_CONSUMER_SECRET`: the Daraja app credentials.
   - `MPESA_PASSKEY`: the Paybill Lipa Na M-Pesa passkey.
   - `MPESA_CALLBACK_URL`: `https://wleonhczrqupiwxyrdue.supabase.co/functions/v1/mpesa-callback`.
   - `SITE_ORIGIN`: the exact browser origin, without a path or trailing slash. For `http://localhost:5173/index.html`, set it to `http://localhost:5173`. `localhost` and `127.0.0.1` are different origins. For production, use the deployed website origin.
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` if they are not already provided to the functions by the Supabase project.
3. From the project directory, deploy both functions with the Supabase CLI:

   ```powershell
   supabase functions deploy mpesa-stk-push --project-ref wleonhczrqupiwxyrdue
   supabase functions deploy mpesa-callback --project-ref wleonhczrqupiwxyrdue
   ```

4. Sign in as an approved test member. Submit a small savings STK payment and a loan repayment STK payment. Confirm each M-Pesa callback appears as the correct savings contribution or loan repayment. Submit a manual reference and confirm it is not posted until an administrator approves it in **Savings & limits**.
5. If an STK payment is flagged for review, compare the requested and callback details with the Paybill statement. Enter the statement's M-Pesa receipt code before approving; mismatched callback amounts must be rejected and resubmitted with the verified amount as a manual reference.
6. Before switching to production, verify the Paybill, account reference, callback URL, Daraja environment, and posted ledgers with the group administrator.

The callback URL must be publicly reachable over HTTPS. A local `localhost` URL cannot receive Safaricom callbacks. The callback Edge Function verifies a successful STK result with Daraja before writing the member ledger. Payment submissions and status changes are captured in the administrator action log.

## Transactional email with Render and Resend

The Render service sends transactional messages through Resend. Supabase Auth remains responsible for registration confirmation and password-reset emails; configure it to use Resend SMTP. The Render service handles member access requests and decisions, loan requests and guarantor events, savings/repayment ledger records, and new group announcements.

### Deploy the Render email service

1. Verify a sending domain with Resend and create an API key. Configure the domain's SPF and DKIM records before sending production email.
2. In Render, create a **Blueprint** from this repository and use `render.yaml` to deploy `vyro-email-service`.
3. Set these environment variables on the Render service. Never put their secret values in the repository or browser code:
   - `SUPABASE_SERVICE_ROLE_KEY`: the Supabase service-role key.
   - `RESEND_API_KEY`: the Resend API key.
   - `EMAIL_WEBHOOK_SECRET`: a new, long random secret; use the same value in the Supabase webhook Authorization header.
   - `EMAIL_FROM`: a sender on the verified domain, for example `Vyro Self Help Group <notifications@your-verified-domain>`.
   - `SITE_URL`: the public website origin, with no path, for example `https://your-site.example`.
   - `ADMIN_NOTIFICATION_EMAIL`: optional; defaults to `admin@vyrosocial.com`.
4. In the Render dashboard, open the `vyro-email-service` web service and wait until its status is **Live**. Open the service's public URL in a new tab with `/healthz` appended; it should return `{"status":"ok"}`. For example, if Render shows `https://vyro-email-service-abc1.onrender.com`, test `https://vyro-email-service-abc1.onrender.com/healthz`. Copy the base service URL (do not include `/healthz`). The webhook endpoint is that base URL plus `/webhooks/supabase`, for example `https://vyro-email-service-abc1.onrender.com/webhooks/supabase`.

If Render does not reach **Live**, open the service's **Events** or **Logs** page and inspect the latest deploy. A failed build usually means the repository root or `package-lock.json` is missing from the deployed branch; a service that starts and exits should show the missing environment variable in its logs. Do not send API keys or other secret values in chat when asking for help.

Use an always-on Render instance for production. A free instance can sleep while idle, which may delay database webhook delivery.

### Configure Supabase Auth email

In Supabase **Authentication → SMTP Settings**, enable custom SMTP and use the SMTP host and credentials shown in Resend's SMTP settings. Set the sender email to the verified address used by `EMAIL_FROM`. Set the production site URL and allowed redirect URLs in Supabase Auth URL Configuration.

To use a six-digit verification code for member registration, open **Authentication → Email Templates → Confirm signup** and change the message body to include `{{ .Token }}` instead of `{{ .ConfirmationURL }}`. For example:

```html
<h2>Confirm your Vyro member portal email</h2>
<p>Enter this six-digit code in the Vyro member portal:</p>
<p style="font-size: 28px; font-weight: bold; letter-spacing: 8px">{{ .Token }}</p>
<p>This code expires according to the email OTP expiration setting in Supabase Auth.</p>
```

For member sign-in, open **Authentication → Email Templates → Magic Link** (shown as **Magic Link or OTP** in some dashboards) and make its body display `{{ .Token }}` rather than only `{{ .ConfirmationURL }}`. Members first sign in with their email and password; after the password is confirmed, the app sends an email code that they must enter to finish signing in. For code-based password reset, open **Authentication → Email Templates → Reset Password** and include `{{ .Token }}` there too. Save all three templates. The app uses `verifyOtp` with the `signup`, `email`, and `recovery` types respectively; password reset then asks the verified member to choose a new password. Do not remove the OTP variable from these templates or users will receive a link without a code.

The **Change Email Address** and other security notification templates are separate and do not control these registration, sign-in, or reset flows.

### Create database webhooks

In Supabase **Database → Webhooks**, create POST webhooks to the Render `/webhooks/supabase` endpoint. Set the `Authorization` header to `Bearer <the same EMAIL_WEBHOOK_SECRET configured in Render>` and `Content-Type` to `application/json`. Enable these events:

| Table | Events |
|---|---|
| `member_profiles` | INSERT, UPDATE |
| `loan_requests` | INSERT, UPDATE |
| `loan_request_guarantors` | INSERT, UPDATE |
| `savings_transactions` | INSERT |
| `loan_repayments` | INSERT |
| `mpesa_payment_records` | INSERT, UPDATE |
| `savings_withdrawal_requests` | INSERT, UPDATE |
| `group_announcements` | INSERT |
| `group_meetings` | INSERT |

Run the latest complete `supabase-setup.sql` before enabling these hooks. It configures full replica identity for status tables so the service can distinguish status changes from unrelated updates. The email service sends notices for M-Pesa manual-reference submissions and payment failures/reviews, withdrawal requests and decisions, and new meetings, in addition to the member, loan, savings, repayment, and announcement events. The webhook secret protects the endpoint; the service-role key stays only in Render.

### Test

Use a test member and confirm registration, sign-in, and password-reset messages arrive through Supabase Auth. Then submit a member request, submit a loan request and guarantor response, record a savings contribution and repayment, submit a manual M-Pesa reference, create a withdrawal request, publish an announcement, and schedule a meeting. Savings transaction emails include the member's current ledger balance and administrator-set loan limit. Confirm member messages go only to the relevant members and admin alerts go to `ADMIN_NOTIFICATION_EMAIL`. Review Render logs and Resend delivery logs for errors; do not use real member payments while testing email.
