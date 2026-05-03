# Supabase functions for Chordpad

## `weekly-signup-digest`

Sends a weekly HTML email to `hello@chordpad.app` listing new sign-ups from
the last 7 days plus the running total.

Stack: pg_cron → pg_net.http_post → Edge Function → Resend → email.

### One-time setup

#### 1. Resend (sender)

1. Sign up at <https://resend.com>.
2. Domains → Add Domain → `chordpad.app`. Resend gives you 3–5 DNS records
   (SPF TXT, DKIM CNAMEs, return-path MX/CNAME).
3. Add those records to Porkbun → DNS for chordpad.app, save.
4. Wait for Resend to verify (usually a few minutes).
5. API Keys → Create API Key (full sending access). Copy the value.

#### 2. Supabase extensions

Dashboard → Database → Extensions, enable both:

- `pg_cron`
- `pg_net`

#### 3. Edge Function deploy

Dashboard → Edge Functions → Create a new function → name
`weekly-signup-digest`. Paste the contents of
`functions/weekly-signup-digest/index.ts`. Click Deploy.

Then on the function's settings:

- Toggle **Verify JWT** OFF (the function checks `x-cron-secret` instead).
- Add Secrets:
  - `RESEND_API_KEY`  → the key from step 1.5
  - `CRON_SECRET`     → any long random string (e.g. `openssl rand -hex 32`)
  - `DIGEST_FROM`     → `Chordpad Reports <reports@chordpad.app>`
  - `DIGEST_TO`       → `hello@chordpad.app`

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected.)

#### 4. Schedule

Dashboard → SQL Editor, paste `cron-schedule.sql`, replace
`<CRON_SECRET_HERE>` with the same value you set on the function, run it.

### Manual test

Smoke-test the function before the first cron firing:

```bash
curl -X POST https://mjgctqprbecwkdinpcbp.supabase.co/functions/v1/weekly-signup-digest \
  -H "x-cron-secret: <CRON_SECRET_HERE>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

You should get back `{"sent":true,"new":<n>,"total":<n>}` and an email
within a few seconds.

### Editing the schedule

```sql
SELECT cron.unschedule('weekly-signup-digest');
-- then re-run cron-schedule.sql with a new cron expression
```

Useful queries:

```sql
SELECT * FROM cron.job;
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```
