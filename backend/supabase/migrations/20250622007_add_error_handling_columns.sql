-- Add error handling columns to evaluation_results table
ALTER TABLE public.evaluation_results
ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS error_code VARCHAR(50),
ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_error_at TIMESTAMP WITH TIME ZONE;

-- Add index for status queries
CREATE INDEX IF NOT EXISTS idx_evaluation_results_status ON public.evaluation_results(status);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_user_status ON public.evaluation_results(user_id, status);

-- Update RLS policies to include status filtering
CREATE POLICY "Users can view their failed evaluations" ON public.evaluation_results
    FOR SELECT
    USING (auth.uid() = user_id);

-- Function to update evaluation status
CREATE OR REPLACE FUNCTION public.update_evaluation_status(
    p_evaluation_id UUID,
    p_status VARCHAR(50),
    p_error_message TEXT DEFAULT NULL,
    p_error_code VARCHAR(50) DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE evaluation_results
    SET 
        status = p_status,
        error_message = p_error_message,
        error_code = p_error_code,
        last_error_at = CASE WHEN p_status = 'failed' THEN NOW() ELSE last_error_at END,
        retry_count = CASE WHEN p_status = 'pending' AND status = 'failed' THEN retry_count + 1 ELSE retry_count END,
        updated_at = NOW()
    WHERE id = p_evaluation_id;
END;
$$;

-- Function to create retry job
CREATE OR REPLACE FUNCTION public.create_retry_job(
    p_repository_name VARCHAR(255),
    p_user_id UUID,
    p_evaluation_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job_id UUID;
    v_evaluation_criteria JSONB;
BEGIN
    -- Get evaluation criteria from the last evaluation
    SELECT evaluation_data->'evaluationCriteria'
    INTO v_evaluation_criteria
    FROM evaluation_results
    WHERE user_id = p_user_id
    ORDER BY created_at DESC
    LIMIT 1;

    -- Create a new job
    INSERT INTO job_status (status, payload)
    VALUES ('pending', jsonb_build_object(
        'repositories', jsonb_build_array(p_repository_name),
        'userId', p_user_id,
        'evaluationCriteria', COALESCE(v_evaluation_criteria, '[]'::jsonb),
        'isRetry', true,
        'originalEvaluationId', p_evaluation_id
    ))
    RETURNING id INTO v_job_id;

    -- Reset evaluation status if provided
    IF p_evaluation_id IS NOT NULL THEN
        PERFORM update_evaluation_status(p_evaluation_id, 'pending');
    END IF;

    -- Enqueue the job
    PERFORM pgmq.send(
        'repo_analysis_queue',
        jsonb_build_object(
            'jobId', v_job_id,
            'repositories', jsonb_build_array(p_repository_name),
            'userId', p_user_id,
            'evaluationCriteria', COALESCE(v_evaluation_criteria, '[]'::jsonb)
        )
    );

    RETURN v_job_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.update_evaluation_status TO service_role;
GRANT EXECUTE ON FUNCTION public.create_retry_job TO authenticated;