-- save_evaluation_result関数を削除してから再作成
DROP FUNCTION IF EXISTS save_evaluation_result(UUID, UUID, VARCHAR(255), JSONB, JSONB);

-- save_evaluation_result関数を更新してhackathon_idを保存
CREATE OR REPLACE FUNCTION save_evaluation_result(
    p_job_id UUID,
    p_user_id UUID,
    p_repository_name VARCHAR(255),
    p_evaluation_data JSONB,
    p_processing_metadata JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_evaluation_id UUID;
    v_hackathon_id UUID;
BEGIN
    -- job_statusからhackathon_idを取得
    SELECT hackathon_id INTO v_hackathon_id
    FROM job_status
    WHERE id = p_job_id;

    -- 既存の評価結果があれば更新、なければ挿入
    INSERT INTO evaluation_results (
        id,
        job_id,
        user_id,
        repository_name,
        total_score,
        evaluation_data,
        processing_metadata,
        hackathon_id,
        created_at
    ) VALUES (
        gen_random_uuid(),
        p_job_id,
        p_user_id,
        p_repository_name,
        (p_evaluation_data->>'totalScore')::INTEGER,
        p_evaluation_data,
        p_processing_metadata,
        v_hackathon_id,
        NOW()
    )
    ON CONFLICT (job_id, repository_name) 
    DO UPDATE SET
        total_score = EXCLUDED.total_score,
        evaluation_data = EXCLUDED.evaluation_data,
        processing_metadata = EXCLUDED.processing_metadata,
        hackathon_id = EXCLUDED.hackathon_id,
        created_at = NOW()
    RETURNING id INTO v_evaluation_id;

    -- 評価項目を挿入
    INSERT INTO evaluation_items (
        evaluation_result_id,
        item_id,
        name,
        score,
        max_score,
        positives,
        negatives
    )
    SELECT 
        v_evaluation_id,
        (item->>'id')::VARCHAR(10),
        item->>'name',
        (item->>'score')::INTEGER,
        CASE 
            WHEN item->>'id' IN ('2', '3') THEN 20
            WHEN item->>'id' IN ('4', '5') THEN 15
            ELSE 10
        END,
        item->>'positives',
        item->>'negatives'
    FROM jsonb_array_elements(p_evaluation_data->'items') AS item
    ON CONFLICT (evaluation_result_id, item_id) 
    DO UPDATE SET
        name = EXCLUDED.name,
        score = EXCLUDED.score,
        positives = EXCLUDED.positives,
        negatives = EXCLUDED.negatives;

    RETURN v_evaluation_id;
END;
$$;

-- 既存の関数を削除してから再作成
DROP FUNCTION IF EXISTS add_repository_to_hackathon(UUID, VARCHAR(255), UUID);
DROP FUNCTION IF EXISTS remove_repository_from_hackathon(UUID, VARCHAR(255), UUID);
DROP FUNCTION IF EXISTS delete_hackathon(UUID, UUID);
DROP FUNCTION IF EXISTS retry_failed_repository(UUID, VARCHAR(255), UUID);

-- 新しい関数：ハッカソンを作成
CREATE OR REPLACE FUNCTION create_hackathon(
    p_name VARCHAR(255),
    p_user_id UUID,
    p_repositories TEXT[],
    p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_hackathon_id UUID;
    v_job_id UUID;
BEGIN
    -- ハッカソンレコードを作成
    INSERT INTO hackathons (
        name,
        user_id,
        total_repositories,
        metadata
    ) VALUES (
        p_name,
        p_user_id,
        array_length(p_repositories, 1),
        p_metadata
    ) RETURNING id INTO v_hackathon_id;

    -- ジョブを作成
    v_job_id := gen_random_uuid();
    INSERT INTO job_status (
        id,
        hackathon_id,
        status,
        payload
    ) VALUES (
        v_job_id,
        v_hackathon_id,
        'pending',
        jsonb_build_object(
            'repositories', to_jsonb(p_repositories),
            'userId', p_user_id,
            'evaluationCriteria', p_metadata->'evaluationCriteria',
            'hackathonId', v_hackathon_id
        )
    );

    -- キューにエンキュー
    PERFORM pgmq_send(
        'repo_analysis_queue',
        jsonb_build_object(
            'jobId', v_job_id,
            'hackathonId', v_hackathon_id,
            'repositories', to_jsonb(p_repositories),
            'userId', p_user_id,
            'evaluationCriteria', p_metadata->'evaluationCriteria'
        ),
        0
    );

    RETURN v_hackathon_id;
END;
$$;

-- add_repository_to_hackathon関数を更新
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
    v_new_job_id UUID;
    v_evaluation_criteria JSONB;
    v_existing_repos TEXT[];
BEGIN
    -- ハッカソンの存在確認とユーザー権限確認
    IF NOT EXISTS (
        SELECT 1 FROM hackathons 
        WHERE id = p_hackathon_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Hackathon not found or access denied';
    END IF;

    -- 既存のリポジトリリストを取得（重複チェック用）
    SELECT array_agg(DISTINCT repo_name) INTO v_existing_repos
    FROM (
        SELECT jsonb_array_elements_text(js.payload->'repositories') as repo_name
        FROM job_status js
        WHERE js.hackathon_id = p_hackathon_id
    ) repos;

    -- リポジトリが既に存在するかチェック
    IF p_repository_name = ANY(v_existing_repos) THEN
        RAISE EXCEPTION 'Repository already exists in this hackathon';
    END IF;

    -- メタデータから評価基準を取得
    SELECT metadata->'evaluationCriteria' INTO v_evaluation_criteria
    FROM hackathons
    WHERE id = p_hackathon_id;

    -- 新しいジョブを作成
    v_new_job_id := gen_random_uuid();
    
    INSERT INTO job_status (
        id,
        hackathon_id,
        status,
        payload
    ) VALUES (
        v_new_job_id,
        p_hackathon_id,
        'pending',
        jsonb_build_object(
            'repositories', jsonb_build_array(p_repository_name),
            'userId', p_user_id,
            'evaluationCriteria', v_evaluation_criteria,
            'hackathonId', p_hackathon_id,
            'isAddition', true
        )
    );

    -- キューにエンキュー
    PERFORM pgmq_send(
        'repo_analysis_queue',
        jsonb_build_object(
            'jobId', v_new_job_id,
            'hackathonId', p_hackathon_id,
            'repositories', jsonb_build_array(p_repository_name),
            'userId', p_user_id,
            'evaluationCriteria', v_evaluation_criteria,
            'isAddition', true
        ),
        0
    );

    -- ハッカソンの統計を更新
    PERFORM update_hackathon_stats(p_hackathon_id);

    RETURN v_new_job_id;
END;
$$;

-- remove_repository_from_hackathon関数を更新
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
BEGIN
    -- ハッカソンの存在確認とユーザー権限確認
    IF NOT EXISTS (
        SELECT 1 FROM hackathons 
        WHERE id = p_hackathon_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Hackathon not found or access denied';
    END IF;

    -- 関連する評価結果を削除
    DELETE FROM evaluation_results
    WHERE hackathon_id = p_hackathon_id 
      AND repository_name = p_repository_name
      AND user_id = p_user_id;

    -- 該当リポジトリのみを含むジョブを削除
    DELETE FROM job_status
    WHERE hackathon_id = p_hackathon_id
      AND payload->'repositories' = jsonb_build_array(p_repository_name);

    -- ハッカソンの統計を更新
    PERFORM update_hackathon_stats(p_hackathon_id);

    RETURN true;
END;
$$;

-- delete_hackathon関数を更新
CREATE OR REPLACE FUNCTION delete_hackathon(
    p_hackathon_id UUID,
    p_user_id UUID
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- ハッカソンの存在確認とユーザー権限確認
    IF NOT EXISTS (
        SELECT 1 FROM hackathons 
        WHERE id = p_hackathon_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Hackathon not found or access denied';
    END IF;

    -- 関連するデータは外部キー制約のON DELETE CASCADEで自動削除される
    DELETE FROM hackathons
    WHERE id = p_hackathon_id AND user_id = p_user_id;

    RETURN true;
END;
$$;

-- retry_failed_repository関数を更新
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
    v_evaluation_criteria JSONB;
    v_new_job_id UUID;
BEGIN
    -- ハッカソンの存在確認とユーザー権限確認
    IF NOT EXISTS (
        SELECT 1 FROM hackathons 
        WHERE id = p_hackathon_id AND user_id = p_user_id
    ) THEN
        RAISE EXCEPTION 'Hackathon not found or access denied';
    END IF;

    -- メタデータから評価基準を取得
    SELECT metadata->'evaluationCriteria' INTO v_evaluation_criteria
    FROM hackathons
    WHERE id = p_hackathon_id;

    -- 失敗した評価結果を削除
    DELETE FROM evaluation_results
    WHERE hackathon_id = p_hackathon_id 
      AND repository_name = p_repository_name
      AND user_id = p_user_id;

    -- 再実行用の新しいジョブを作成
    v_new_job_id := gen_random_uuid();
    
    INSERT INTO job_status (
        id,
        hackathon_id,
        status,
        payload
    ) VALUES (
        v_new_job_id,
        p_hackathon_id,
        'pending',
        jsonb_build_object(
            'repositories', jsonb_build_array(p_repository_name),
            'userId', p_user_id,
            'evaluationCriteria', v_evaluation_criteria,
            'hackathonId', p_hackathon_id,
            'isRetry', true
        )
    );

    -- キューにエンキュー
    PERFORM pgmq_send(
        'repo_analysis_queue',
        jsonb_build_object(
            'jobId', v_new_job_id,
            'hackathonId', p_hackathon_id,
            'repositories', jsonb_build_array(p_repository_name),
            'userId', p_user_id,
            'evaluationCriteria', v_evaluation_criteria,
            'isRetry', true
        ),
        0
    );

    RETURN true;
END;
$$;

-- 権限設定
GRANT EXECUTE ON FUNCTION create_hackathon TO authenticated;
GRANT EXECUTE ON FUNCTION update_hackathon_stats TO service_role; 