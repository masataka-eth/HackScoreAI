-- Create a wrapper function for pgmq.send that can be called via RPC
CREATE OR REPLACE FUNCTION pgmq_send(queue_name TEXT, message JSONB)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    message_id BIGINT;
BEGIN
    SELECT * INTO message_id FROM pgmq.send(queue_name, message);
    RETURN message_id;
END;
$$;

-- Create a wrapper function for pgmq.read that can be called via RPC
CREATE OR REPLACE FUNCTION pgmq_read(queue_name TEXT, visibility_timeout INTEGER DEFAULT 30)
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
    SELECT * FROM pgmq.read(queue_name, visibility_timeout, 1);
END;
$$;

-- Create a wrapper function for pgmq.delete that can be called via RPC
CREATE OR REPLACE FUNCTION pgmq_delete(queue_name TEXT, msg_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    deleted BOOLEAN;
BEGIN
    SELECT * INTO deleted FROM pgmq.delete(queue_name, msg_id);
    RETURN deleted;
END;
$$;

-- Create a wrapper function for pgmq.archive that can be called via RPC
CREATE OR REPLACE FUNCTION pgmq_archive(queue_name TEXT, msg_id BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    archived BOOLEAN;
BEGIN
    SELECT * INTO archived FROM pgmq.archive(queue_name, msg_id);
    RETURN archived;
END;
$$;