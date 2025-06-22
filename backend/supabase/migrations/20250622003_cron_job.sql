-- Install pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage on cron schema to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Create a cron job that runs every minute to process the queue
-- Note: In production, adjust the schedule based on your needs
SELECT cron.schedule(
    'process-repo-analysis-queue', -- name of the cron job
    '* * * * *', -- every minute
    $$
    SELECT
      net.http_post(
          url := current_setting('app.settings.supabase_url') || '/functions/v1/repo_worker/cron',
          headers := jsonb_build_object(
              'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
              'Content-Type', 'application/json'
          ),
          body := '{}'::jsonb
      ) AS request_id;
    $$
);

-- Create a function to manually trigger the worker (for testing)
CREATE OR REPLACE FUNCTION trigger_repo_worker()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result jsonb;
BEGIN
    SELECT content::jsonb INTO result
    FROM net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/repo_worker/process',
        headers := jsonb_build_object(
            'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key'),
            'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb
    );
    
    RETURN result;
END;
$$;