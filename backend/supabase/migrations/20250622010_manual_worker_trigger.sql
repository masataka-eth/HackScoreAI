-- 手動でワーカーをトリガーするためのRPC関数
CREATE OR REPLACE FUNCTION trigger_worker_processing()
RETURNS json AS $$
DECLARE
    worker_response json;
BEGIN
    -- repo_worker Edge Functionを呼び出し
    SELECT net.http_post(
        url := 'http://127.0.0.1:54321/functions/v1/repo_worker',
        headers := jsonb_build_object(
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
            'Content-Type', 'application/json'
        )
    ) INTO worker_response;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Worker triggered successfully',
        'response', worker_response
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;