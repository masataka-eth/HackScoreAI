-- Update max_score default value to 5 and migrate existing data

-- First, update existing evaluation items to use 5 as max_score
UPDATE public.evaluation_items
SET max_score = 5
WHERE max_score IS NOT NULL;

-- Update the default value for max_score column
ALTER TABLE public.evaluation_items
ALTER COLUMN max_score SET DEFAULT 5;

-- Update the save_evaluation_result function to use max_score of 5
CREATE OR REPLACE FUNCTION save_evaluation_result(
    p_job_id UUID,
    p_user_id UUID,
    p_repository_name VARCHAR(255),
    p_evaluation_data JSONB,
    p_processing_metadata JSONB DEFAULT NULL
) RETURNS UUID
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
    
    -- Insert individual evaluation items with max_score of 5
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
            5,  -- All items now have max_score of 5
            item->>'positives',
            item->>'negatives'
        );
    END LOOP;
    
    RETURN evaluation_result_id;
END;
$$; 