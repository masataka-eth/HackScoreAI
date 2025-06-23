-- Remove duplicate pgmq_send functions to fix "function not unique" error
-- This removes the old 2-parameter version, keeping only the 3-parameter version with delay support

DROP FUNCTION IF EXISTS pgmq_send(TEXT, JSONB);