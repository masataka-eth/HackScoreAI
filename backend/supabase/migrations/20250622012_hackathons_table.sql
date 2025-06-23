-- ハッカソンマスターテーブルの作成
CREATE TABLE IF NOT EXISTS hackathons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'pending', -- pending, analyzing, completed, failed
    total_repositories INTEGER DEFAULT 0,
    completed_repositories INTEGER DEFAULT 0,
    average_score NUMERIC(5,2),
    metadata JSONB DEFAULT '{}'::jsonb, -- 追加情報（テーマ、説明など）
    CONSTRAINT unique_hackathon_per_user UNIQUE(user_id, name)
);

-- 既存テーブルへのhackathon_id追加
ALTER TABLE job_status ADD COLUMN IF NOT EXISTS hackathon_id UUID REFERENCES hackathons(id) ON DELETE CASCADE;
ALTER TABLE evaluation_results ADD COLUMN IF NOT EXISTS hackathon_id UUID REFERENCES hackathons(id) ON DELETE CASCADE;

-- インデックスの追加
CREATE INDEX IF NOT EXISTS idx_job_status_hackathon_id ON job_status(hackathon_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_hackathon_id ON evaluation_results(hackathon_id);
CREATE INDEX IF NOT EXISTS idx_hackathons_user_id ON hackathons(user_id);
CREATE INDEX IF NOT EXISTS idx_hackathons_status ON hackathons(status);

-- 既存データの移行（既存のjob_statusからhackathonsテーブルへのデータ移行）
DO $$
DECLARE
    job_record RECORD;
    hackathon_id_new UUID;
BEGIN
    -- parentHackathonIdを持たないジョブをハッカソンとして移行
    FOR job_record IN 
        SELECT DISTINCT 
            js.id,
            js.payload,
            js.created_at,
            js.status,
            js.updated_at
        FROM job_status js
        WHERE js.payload->>'parentHackathonId' IS NULL
        AND js.hackathon_id IS NULL
    LOOP
        -- 新しいハッカソンレコードを作成
        hackathon_id_new := gen_random_uuid();
        
        INSERT INTO hackathons (
            id,
            name,
            user_id,
            created_at,
            updated_at,
            status,
            total_repositories,
            metadata
        ) VALUES (
            hackathon_id_new,
            COALESCE(
                job_record.payload->'evaluationCriteria'->>'hackathonName',
                'ハッカソン ' || to_char(job_record.created_at, 'YYYY/MM/DD')
            ),
            (job_record.payload->>'userId')::UUID,
            job_record.created_at,
            job_record.updated_at,
            job_record.status,
            jsonb_array_length(job_record.payload->'repositories'),
            jsonb_build_object(
                'originalJobId', job_record.id,
                'evaluationCriteria', job_record.payload->'evaluationCriteria'
            )
        );
        
        -- メインジョブのhackathon_idを更新
        UPDATE job_status 
        SET hackathon_id = hackathon_id_new 
        WHERE id = job_record.id;
        
        -- 関連するサブジョブ（parentHackathonIdを持つ）のhackathon_idも更新
        UPDATE job_status 
        SET hackathon_id = hackathon_id_new 
        WHERE payload->>'parentHackathonId' = job_record.id::text;
        
        -- 関連する評価結果のhackathon_idを更新
        UPDATE evaluation_results 
        SET hackathon_id = hackathon_id_new 
        WHERE job_id = job_record.id
        OR job_id IN (
            SELECT id FROM job_status 
            WHERE payload->>'parentHackathonId' = job_record.id::text
        );
    END LOOP;
END $$;

-- ハッカソンの統計情報を更新する関数
CREATE OR REPLACE FUNCTION update_hackathon_stats(p_hackathon_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_total_repos INTEGER;
    v_completed_repos INTEGER;
    v_avg_score NUMERIC(5,2);
    v_status VARCHAR(50);
BEGIN
    -- 総リポジトリ数を計算（重複を除外）
    SELECT COUNT(DISTINCT repo_name) INTO v_total_repos
    FROM (
        SELECT jsonb_array_elements_text(js.payload->'repositories') as repo_name
        FROM job_status js
        WHERE js.hackathon_id = p_hackathon_id
    ) repos;
    
    -- 完了したリポジトリ数と平均スコアを計算
    SELECT 
        COUNT(DISTINCT repository_name),
        AVG(total_score)
    INTO v_completed_repos, v_avg_score
    FROM evaluation_results
    WHERE hackathon_id = p_hackathon_id;
    
    -- ステータスを決定
    IF v_completed_repos = 0 THEN
        v_status := 'pending';
    ELSIF v_completed_repos < v_total_repos THEN
        v_status := 'analyzing';
    ELSE
        v_status := 'completed';
    END IF;
    
    -- 失敗したジョブがある場合はfailedステータスに
    IF EXISTS (
        SELECT 1 FROM job_status 
        WHERE hackathon_id = p_hackathon_id 
        AND status = 'failed'
    ) AND v_completed_repos = 0 THEN
        v_status := 'failed';
    END IF;
    
    -- ハッカソンテーブルを更新
    UPDATE hackathons
    SET 
        total_repositories = v_total_repos,
        completed_repositories = COALESCE(v_completed_repos, 0),
        average_score = v_avg_score,
        status = v_status,
        updated_at = NOW()
    WHERE id = p_hackathon_id;
END;
$$;

-- トリガー：評価結果が挿入された時にハッカソンの統計を更新
CREATE OR REPLACE FUNCTION trigger_update_hackathon_stats()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.hackathon_id IS NOT NULL THEN
        PERFORM update_hackathon_stats(NEW.hackathon_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_hackathon_stats_on_evaluation
    AFTER INSERT OR UPDATE ON evaluation_results
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_hackathon_stats();

-- トリガー：job_statusが更新された時にハッカソンの統計を更新
CREATE OR REPLACE FUNCTION trigger_update_hackathon_stats_on_job()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.hackathon_id IS NOT NULL THEN
        PERFORM update_hackathon_stats(NEW.hackathon_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_hackathon_stats_on_job_status
    AFTER UPDATE OF status ON job_status
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_hackathon_stats_on_job();

-- RLSポリシー
ALTER TABLE hackathons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own hackathons"
    ON hackathons FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own hackathons"
    ON hackathons FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own hackathons"
    ON hackathons FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own hackathons"
    ON hackathons FOR DELETE
    USING (auth.uid() = user_id);

-- 権限設定
GRANT ALL ON hackathons TO authenticated;
GRANT EXECUTE ON FUNCTION update_hackathon_stats TO authenticated; 