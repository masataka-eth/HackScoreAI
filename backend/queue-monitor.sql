-- キューの監視用SQLクエリ集

-- 1. 現在のキューの状態を確認
SELECT 
    queue_name,
    queue_length,
    newest_msg_age_sec,
    oldest_msg_age_sec,
    total_messages
FROM pgmq.metrics('repo_analysis_queue');

-- 2. キュー内のメッセージ一覧
SELECT 
    msg_id,
    read_ct,
    enqueued_at,
    vt,
    message->>'requestId' as request_id,
    message->'repositories' as repositories
FROM pgmq.q_repo_analysis_queue 
ORDER BY enqueued_at DESC;

-- 3. ジョブステータステーブル
SELECT 
    id,
    queue_message_id,
    status,
    payload->>'requestId' as request_id,
    array_length((payload->'repositories')::json[], 1) as repo_count,
    created_at,
    updated_at,
    CASE 
        WHEN status = 'completed' THEN result->>'totalScore'
        ELSE null 
    END as total_score
FROM job_status 
ORDER BY created_at DESC;

-- 4. アーカイブされたメッセージ
SELECT 
    msg_id,
    read_ct,
    enqueued_at,
    archived_at,
    message->>'requestId' as request_id
FROM pgmq.a_repo_analysis_queue 
ORDER BY archived_at DESC;

-- 5. ステータス別の集計
SELECT 
    status,
    COUNT(*) as count,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_processing_time_sec
FROM job_status 
GROUP BY status;

-- 6. 最近の処理状況（過去1時間）
SELECT 
    DATE_TRUNC('minute', created_at) as minute,
    COUNT(*) as jobs_created,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as jobs_completed,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as jobs_failed
FROM job_status 
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY DATE_TRUNC('minute', created_at)
ORDER BY minute DESC;