-- Create evaluation results table
CREATE TABLE IF NOT EXISTS public.evaluation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES public.job_status(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    repository_name VARCHAR(255) NOT NULL,
    total_score INTEGER NOT NULL CHECK (total_score >= 0 AND total_score <= 100),
    evaluation_data JSONB NOT NULL, -- Complete evaluation result JSON
    processing_metadata JSONB, -- Claude Code execution metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create evaluation items table for detailed scoring
CREATE TABLE IF NOT EXISTS public.evaluation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_result_id UUID REFERENCES public.evaluation_results(id) ON DELETE CASCADE,
    item_id VARCHAR(10) NOT NULL,
    name VARCHAR(100) NOT NULL,
    score INTEGER NOT NULL,
    max_score INTEGER NOT NULL DEFAULT 20,
    positives TEXT NOT NULL,
    negatives TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX idx_evaluation_results_job_id ON public.evaluation_results(job_id);
CREATE INDEX idx_evaluation_results_user_id ON public.evaluation_results(user_id);
CREATE INDEX idx_evaluation_results_repository ON public.evaluation_results(repository_name);
CREATE INDEX idx_evaluation_results_created_at ON public.evaluation_results(created_at);
CREATE INDEX idx_evaluation_items_result_id ON public.evaluation_items(evaluation_result_id);

-- Create updated_at trigger for evaluation_results
CREATE TRIGGER update_evaluation_results_updated_at 
    BEFORE UPDATE ON public.evaluation_results
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at_column();

-- RLS policies for evaluation_results
ALTER TABLE public.evaluation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_items ENABLE ROW LEVEL SECURITY;

-- Users can only access their own evaluation results
CREATE POLICY "Users can view their own evaluation results"
    ON public.evaluation_results
    FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can access all evaluation results (for Edge Functions)
CREATE POLICY "Service role can manage all evaluation results"
    ON public.evaluation_results
    FOR ALL
    TO service_role
    USING (true);

-- Similar policies for evaluation_items
CREATE POLICY "Users can view their own evaluation items"
    ON public.evaluation_items
    FOR SELECT
    USING (
        evaluation_result_id IN (
            SELECT id FROM public.evaluation_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all evaluation items"
    ON public.evaluation_items
    FOR ALL
    TO service_role
    USING (true);

-- Function to save evaluation result
CREATE OR REPLACE FUNCTION save_evaluation_result(
    p_job_id UUID,
    p_user_id UUID,
    p_repository_name VARCHAR(255),
    p_evaluation_data JSONB,
    p_processing_metadata JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    evaluation_result_id UUID;
    item JSONB;
BEGIN
    -- Insert main evaluation result
    INSERT INTO public.evaluation_results (
        job_id,
        user_id,
        repository_name,
        total_score,
        evaluation_data,
        processing_metadata
    ) VALUES (
        p_job_id,
        p_user_id,
        p_repository_name,
        (p_evaluation_data->>'totalScore')::INTEGER,
        p_evaluation_data,
        p_processing_metadata
    ) RETURNING id INTO evaluation_result_id;
    
    -- Insert individual evaluation items
    FOR item IN SELECT * FROM jsonb_array_elements(p_evaluation_data->'items')
    LOOP
        INSERT INTO public.evaluation_items (
            evaluation_result_id,
            item_id,
            name,
            score,
            max_score,
            positives,
            negatives
        ) VALUES (
            evaluation_result_id,
            item->>'id',
            item->>'name',
            (item->>'score')::INTEGER,
            CASE item->>'name'
                WHEN 'テーマ適合度' THEN 10
                WHEN '独創性・革新性' THEN 20
                WHEN '技術的完成度' THEN 20
                WHEN '機能実装・完成度' THEN 15
                WHEN 'ユーザー体験（UX/UI）' THEN 15
                WHEN '実世界インパクト／ビジネス価値' THEN 10
                WHEN 'ドキュメント' THEN 10
                ELSE 20
            END,
            item->>'positives',
            item->>'negatives'
        );
    END LOOP;
    
    RETURN evaluation_result_id;
END;
$$;

-- Function to get evaluation summary
CREATE OR REPLACE FUNCTION get_evaluation_summary(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    repository_name VARCHAR(255),
    total_score INTEGER,
    overall_comment TEXT,
    created_at TIMESTAMPTZ,
    job_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        er.id,
        er.repository_name,
        er.total_score,
        er.evaluation_data->>'overallComment' as overall_comment,
        er.created_at,
        er.job_id
    FROM public.evaluation_results er
    WHERE (p_user_id IS NULL OR er.user_id = p_user_id)
    ORDER BY er.created_at DESC;
END;
$$;

-- Function to get detailed evaluation
CREATE OR REPLACE FUNCTION get_evaluation_details(p_evaluation_id UUID)
RETURNS TABLE (
    evaluation_result JSONB,
    evaluation_items JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        to_jsonb(er.*) as evaluation_result,
        (
            SELECT jsonb_agg(to_jsonb(ei.*))
            FROM public.evaluation_items ei
            WHERE ei.evaluation_result_id = p_evaluation_id
            ORDER BY ei.item_id
        ) as evaluation_items
    FROM public.evaluation_results er
    WHERE er.id = p_evaluation_id;
END;
$$;