-- Queue monitoring functions

-- Get queue metrics
CREATE OR REPLACE FUNCTION pgmq_metrics(queue_name_param TEXT)
RETURNS TABLE (
    queue_name TEXT,
    queue_length BIGINT,
    newest_msg_age_sec INTEGER,
    oldest_msg_age_sec INTEGER,
    total_messages BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM pgmq.metrics(queue_name_param);
END;
$$;

-- List all messages in queue
CREATE OR REPLACE FUNCTION pgmq_list_messages(queue_name_param TEXT, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    msg_id BIGINT,
    read_ct INTEGER,
    enqueued_at TIMESTAMPTZ,
    vt TIMESTAMPTZ,
    message JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    EXECUTE format('SELECT msg_id, read_ct, enqueued_at, vt, message FROM pgmq.q_%I ORDER BY enqueued_at DESC LIMIT %s', queue_name_param, limit_count);
END;
$$;

-- Get archived messages
CREATE OR REPLACE FUNCTION pgmq_list_archived(queue_name_param TEXT, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    msg_id BIGINT,
    read_ct INTEGER,
    enqueued_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    message JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    EXECUTE format('SELECT msg_id, read_ct, enqueued_at, archived_at, message FROM pgmq.a_%I ORDER BY archived_at DESC LIMIT %s', queue_name_param, limit_count);
END;
$$;

-- Enhanced job status view
CREATE OR REPLACE VIEW job_status_summary AS
SELECT 
    j.id,
    j.queue_message_id,
    j.status,
    j.payload->>'requestId' as request_id,
    jsonb_array_length(j.payload->'repositories') as repository_count,
    j.created_at,
    j.updated_at,
    EXTRACT(EPOCH FROM (j.updated_at - j.created_at)) as processing_time_seconds,
    CASE 
        WHEN j.status = 'completed' THEN (j.result->>'totalScore')::INTEGER
        ELSE NULL 
    END as total_score,
    j.error
FROM job_status j
ORDER BY j.created_at DESC;