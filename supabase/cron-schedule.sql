-- Weekly sign-up digest cron schedule.
--
-- Run this once in Supabase SQL editor AFTER deploying the
-- weekly-signup-digest Edge Function and setting its CRON_SECRET env var.
-- Replace <CRON_SECRET_HERE> with the same value you set on the function.

-- Pre-req: enable extensions in Supabase dashboard → Database → Extensions
--   - pg_cron   (schedule SQL jobs)
--   - pg_net    (HTTP from SQL)

-- Schedules a Monday 13:00 UTC = 09:00 ET (EDT) call to the function.
-- Adjust the cron expression to taste:
--   '0 13 * * 1'  → Monday 13:00 UTC weekly  (default)
--   '0 13 * * *'  → daily 13:00 UTC
--   '0 13 1 * *'  → 13:00 UTC on day-1 of each month
SELECT cron.schedule(
  'weekly-signup-digest',
  '0 13 * * 1',
  $$
  SELECT net.http_post(
    url     := 'https://mjgctqprbecwkdinpcbp.supabase.co/functions/v1/weekly-signup-digest',
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'x-cron-secret',  '<CRON_SECRET_HERE>'
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Useful operations:
--   SELECT * FROM cron.job;                            -- list scheduled jobs
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
--   SELECT cron.unschedule('weekly-signup-digest');    -- remove the schedule
