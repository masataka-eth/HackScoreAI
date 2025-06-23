-- 1ジョブ1リポジトリの構造に変更するマイグレーション

-- create_hackathon関数を更新：各リポジトリごとに個別のジョブを作成
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
    v_repository TEXT;
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

    -- 各リポジトリごとに個別のジョブを作成
    FOREACH v_repository IN ARRAY p_repositories
    LOOP
        v_job_id := gen_random_uuid();
        
        -- ジョブを作成
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
                'repository', v_repository,  -- 単一のリポジトリ
                'userId', p_user_id,
                'evaluationCriteria', p_metadata->'evaluationCriteria',
                'hackathonId', v_hackathon_id
            )
        );

        -- キューにエンキュー（1リポジトリごと）
        PERFORM pgmq_send(
            'repo_analysis_queue',
            jsonb_build_object(
                'jobId', v_job_id,
                'hackathonId', v_hackathon_id,
                'repository', v_repository,  -- 単一のリポジトリ
                'userId', p_user_id,
                'evaluationCriteria', p_metadata->'evaluationCriteria'
            ),
            0
        );
    END LOOP;

    RETURN v_hackathon_id;
END;
$$;

-- add_repository_to_hackathon関数も更新（既に1リポジトリ1ジョブだが、一貫性のため）
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
        SELECT js.payload->>'repository' as repo_name  -- 'repositories'から'repository'に変更
        FROM job_status js
        WHERE js.hackathon_id = p_hackathon_id
          AND js.payload->>'repository' IS NOT NULL
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
            'repository', p_repository_name,  -- 単一のリポジトリ
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
            'repository', p_repository_name,  -- 単一のリポジトリ
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

-- retry_failed_repository関数も更新
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
            'repository', p_repository_name,  -- 単一のリポジトリ
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
            'repository', p_repository_name,  -- 単一のリポジトリ
            'userId', p_user_id,
            'evaluationCriteria', v_evaluation_criteria,
            'isRetry', true
        ),
        0
    );

    RETURN true;
END;
$$;

-- remove_repository_from_hackathon関数も更新（repositoriesからrepositoryへの参照を修正）
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

    -- 該当リポジトリのジョブを削除
    DELETE FROM job_status
    WHERE hackathon_id = p_hackathon_id
      AND payload->>'repository' = p_repository_name;

    -- ハッカソンの統計を更新
    PERFORM update_hackathon_stats(p_hackathon_id);

    RETURN true;
END;
$$; 