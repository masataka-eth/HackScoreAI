-- 既存のハッカソンにリポジトリを追加する関数（既存のものを置き換え）
DROP FUNCTION IF EXISTS add_repository_to_hackathon(UUID, VARCHAR, UUID);

CREATE OR REPLACE FUNCTION add_repository_to_hackathon(
    p_hackathon_id UUID,
    p_repository_name VARCHAR(255),
    p_user_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job_data JSONB;
    v_current_repos JSONB;
    v_evaluation_criteria JSONB;
    v_new_job_id UUID;
BEGIN
    -- 既存のジョブデータを取得
    SELECT payload INTO v_job_data
    FROM job_status
    WHERE id = p_hackathon_id AND payload->>'userId' = p_user_id::text;

    IF v_job_data IS NULL THEN
        RAISE EXCEPTION 'Hackathon not found or access denied';
    END IF;

    -- 現在のリポジトリリストを取得
    v_current_repos := v_job_data->'repositories';
    v_evaluation_criteria := v_job_data->'evaluationCriteria';

    -- リポジトリが既に存在するかチェック
    IF v_current_repos ? p_repository_name THEN
        RAISE EXCEPTION 'Repository already exists in this hackathon';
    END IF;

    -- 新しいリポジトリを追加
    v_current_repos := v_current_repos || jsonb_build_array(p_repository_name);

    -- 元のジョブのペイロードを更新
    UPDATE job_status
    SET 
        payload = jsonb_set(payload, '{repositories}', v_current_repos),
        updated_at = NOW()
    WHERE id = p_hackathon_id;

    -- 新しいリポジトリ用の個別ジョブを作成
    v_new_job_id := gen_random_uuid();
    
    INSERT INTO job_status (id, status, payload)
    VALUES (v_new_job_id, 'pending', jsonb_build_object(
        'repositories', jsonb_build_array(p_repository_name),
        'userId', p_user_id,
        'evaluationCriteria', v_evaluation_criteria,
        'parentHackathonId', p_hackathon_id,
        'isAddition', true,
        'timestamp', NOW()
    ));

    -- キューにエンキュー
    PERFORM pgmq.send(
        'repo_analysis_queue',
        jsonb_build_object(
            'jobId', v_new_job_id,
            'repositories', jsonb_build_array(p_repository_name),
            'userId', p_user_id,
            'evaluationCriteria', v_evaluation_criteria,
            'parentHackathonId', p_hackathon_id,
            'isAddition', true
        ),
        0
    );

    RETURN v_new_job_id;
END;
$$;

-- ハッカソンからリポジトリを削除する関数（既存のものを置き換え）
DROP FUNCTION IF EXISTS remove_repository_from_hackathon(UUID, VARCHAR, UUID);

CREATE OR REPLACE FUNCTION remove_repository_from_hackathon(
    p_hackathon_id UUID,
    p_repository_name VARCHAR(255),
    p_user_id UUID
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job_data JSONB;
    v_current_repos JSONB;
    v_repo_array JSONB[];
    v_repo JSONB;
    v_new_repos JSONB := '[]'::jsonb;
BEGIN
    -- 既存のジョブデータを取得
    SELECT payload INTO v_job_data
    FROM job_status
    WHERE id = p_hackathon_id AND payload->>'userId' = p_user_id::text;

    IF v_job_data IS NULL THEN
        RAISE EXCEPTION 'Hackathon not found or access denied';
    END IF;

    -- 現在のリポジトリリストを取得
    v_current_repos := v_job_data->'repositories';

    -- リポジトリが存在するかチェック
    IF NOT (v_current_repos ? p_repository_name) THEN
        RAISE EXCEPTION 'Repository not found in this hackathon';
    END IF;

    -- リポジトリリストから該当リポジトリを除去
    SELECT array_agg(elem) INTO v_repo_array
    FROM jsonb_array_elements(v_current_repos) AS elem
    WHERE elem::text != ('"' || p_repository_name || '"');

    -- 新しいJSONB配列を構築
    IF v_repo_array IS NOT NULL THEN
        SELECT jsonb_agg(elem) INTO v_new_repos
        FROM unnest(v_repo_array) AS elem;
    END IF;

    -- ジョブのペイロードを更新
    UPDATE job_status
    SET 
        payload = jsonb_set(payload, '{repositories}', v_new_repos),
        updated_at = NOW()
    WHERE id = p_hackathon_id;

    -- 関連する評価結果を削除
    DELETE FROM evaluation_results
    WHERE job_id = p_hackathon_id 
      AND repository_name = p_repository_name
      AND user_id = p_user_id;

    RETURN true;
END;
$$;

-- delete_hackathon関数は既存のマイグレーションで定義されているため、ここでは削除のみ
-- 既存の関数が使用される

-- 失敗したリポジトリを再実行する関数
CREATE OR REPLACE FUNCTION retry_failed_repository(
    p_hackathon_id UUID,
    p_repository_name VARCHAR(255),
    p_user_id UUID
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job_data JSONB;
    v_evaluation_criteria JSONB;
    v_new_job_id UUID;
BEGIN
    -- 既存のジョブデータを取得
    SELECT payload INTO v_job_data
    FROM job_status
    WHERE id = p_hackathon_id AND payload->>'userId' = p_user_id::text;

    IF v_job_data IS NULL THEN
        RAISE EXCEPTION 'Hackathon not found or access denied';
    END IF;

    -- リポジトリが存在するかチェック
    IF NOT (v_job_data->'repositories' ? p_repository_name) THEN
        RAISE EXCEPTION 'Repository not found in this hackathon';
    END IF;

    v_evaluation_criteria := v_job_data->'evaluationCriteria';

    -- 失敗した評価結果を削除
    DELETE FROM evaluation_results
    WHERE job_id = p_hackathon_id 
      AND repository_name = p_repository_name
      AND user_id = p_user_id;

    -- 再実行用の新しいジョブを作成
    v_new_job_id := gen_random_uuid();
    
    INSERT INTO job_status (id, status, payload)
    VALUES (v_new_job_id, 'pending', jsonb_build_object(
        'repositories', jsonb_build_array(p_repository_name),
        'userId', p_user_id,
        'evaluationCriteria', v_evaluation_criteria,
        'parentHackathonId', p_hackathon_id,
        'isRetry', true,
        'timestamp', NOW()
    ));

    -- キューにエンキュー
    PERFORM pgmq.send(
        'repo_analysis_queue',
        jsonb_build_object(
            'jobId', v_new_job_id,
            'repositories', jsonb_build_array(p_repository_name),
            'userId', p_user_id,
            'evaluationCriteria', v_evaluation_criteria,
            'parentHackathonId', p_hackathon_id,
            'isRetry', true
        ),
        0
    );

    RETURN true;
END;
$$;

-- 権限設定
GRANT EXECUTE ON FUNCTION public.add_repository_to_hackathon TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_repository_from_hackathon TO authenticated;
GRANT EXECUTE ON FUNCTION public.retry_failed_repository TO authenticated;