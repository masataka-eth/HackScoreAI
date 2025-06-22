-- pgmqの代替実装 - シンプルなキューシステム
DROP TABLE IF EXISTS public.queue_messages;

-- メッセージキューテーブル
CREATE TABLE public.queue_messages (
    id BIGSERIAL PRIMARY KEY,
    queue_name TEXT NOT NULL,
    message JSONB NOT NULL,
    enqueued_at TIMESTAMPTZ DEFAULT NOW(),
    visible_at TIMESTAMPTZ DEFAULT NOW(),
    read_count INTEGER DEFAULT 0
);

-- インデックス作成
CREATE INDEX idx_queue_messages_queue_name ON public.queue_messages(queue_name);
CREATE INDEX idx_queue_messages_visible_at ON public.queue_messages(visible_at);

-- pgmq_send関数の代替実装
CREATE OR REPLACE FUNCTION public.pgmq_send(
    queue_name TEXT,
    message JSONB,
    delay_seconds INTEGER DEFAULT 0
) RETURNS BIGINT AS $$
DECLARE
    message_id BIGINT;
BEGIN
    INSERT INTO public.queue_messages (queue_name, message, visible_at)
    VALUES (queue_name, message, NOW() + (delay_seconds || ' seconds')::INTERVAL)
    RETURNING id INTO message_id;
    
    RETURN message_id;
END;
$$ LANGUAGE plpgsql;

-- pgmq_read関数の代替実装
CREATE OR REPLACE FUNCTION public.pgmq_read(
    queue_name TEXT,
    visibility_timeout INTEGER DEFAULT 30,
    qty INTEGER DEFAULT 1
) RETURNS TABLE(msg_id BIGINT, read_ct INTEGER, enqueued_at TIMESTAMPTZ, message JSONB) AS $$
BEGIN
    RETURN QUERY
    UPDATE public.queue_messages 
    SET 
        read_count = read_count + 1,
        visible_at = NOW() + (visibility_timeout || ' seconds')::INTERVAL
    FROM (
        SELECT id 
        FROM public.queue_messages 
        WHERE queue_messages.queue_name = pgmq_read.queue_name
        AND visible_at <= NOW()
        ORDER BY id
        LIMIT qty
        FOR UPDATE SKIP LOCKED
    ) AS selected
    WHERE queue_messages.id = selected.id
    RETURNING queue_messages.id, queue_messages.read_count, queue_messages.enqueued_at, queue_messages.message;
END;
$$ LANGUAGE plpgsql;

-- pgmq_delete関数の代替実装
CREATE OR REPLACE FUNCTION public.pgmq_delete(
    queue_name TEXT,
    msg_id BIGINT
) RETURNS BOOLEAN AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM public.queue_messages 
    WHERE queue_messages.queue_name = pgmq_delete.queue_name 
    AND id = msg_id;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count > 0;
END;
$$ LANGUAGE plpgsql;

-- pgmq_archive関数の代替実装
CREATE OR REPLACE FUNCTION public.pgmq_archive(
    queue_name TEXT,
    msg_id BIGINT
) RETURNS BOOLEAN AS $$
BEGIN
    -- シンプルに削除（アーカイブテーブルは後で実装可能）
    RETURN public.pgmq_delete(queue_name, msg_id);
END;
$$ LANGUAGE plpgsql;