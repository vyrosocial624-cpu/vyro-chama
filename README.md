# Vyro Self Help Group

The site is built with React and Vite. Existing page layouts and their interaction
modules are kept as a migration bridge so current member and administrator
workflows continue to work while the UI is moved into React components.

## Run locally

```sh
npm install
npm run dev
```

Vite serves the public site at `/`, the administrator dashboard at `/admin/`,
and the policy pages at `/loan-rules.html` and `/privacy.html`.

## Build and preview

```sh
npm run build
npm run preview
```

The production site is written to `dist/`. Deploy the contents of that folder.

## Supabase

The browser client is configured in `supabase-client.js`. Its publishable key is
intended for browser use; access to group data is enforced by Supabase policies
and database functions.

## Transactional email

The Render-hosted webhook service in `email-service/` sends app notifications
through Resend. Supabase Auth sends registration confirmation and password-reset
messages through Resend SMTP. Configure the Render service and Supabase database
webhooks using the steps in [supabase/SETUP.md](./supabase/SETUP.md).

Keep the Supabase service-role key, Resend API key, and webhook secret in Render
environment variables only. Do not add them to the website, repository, or
client-side configuration.
