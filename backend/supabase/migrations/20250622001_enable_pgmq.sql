-- Enable pgmq extension
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Create a queue for repository analysis jobs
SELECT pgmq.create('repo_analysis_queue');

-- Create a table to track job status
CREATE TABLE IF NOT EXISTS public.job_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_message_id BIGINT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    payload JSONB,
    result JSONB,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index for faster queries
CREATE INDEX idx_job_status_queue_message_id ON public.job_status(queue_message_id);
CREATE INDEX idx_job_status_status ON public.job_status(status);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically update the updated_at column
CREATE TRIGGER update_job_status_updated_at BEFORE UPDATE ON public.job_status
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();