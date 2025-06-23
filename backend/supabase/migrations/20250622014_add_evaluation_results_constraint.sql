-- evaluation_resultsテーブルにユニーク制約を追加
-- 同じジョブで同じリポジトリの評価は1つだけ
ALTER TABLE public.evaluation_results
ADD CONSTRAINT unique_job_repository 
UNIQUE (job_id, repository_name);

-- evaluation_itemsテーブルにもユニーク制約を追加
-- 同じ評価結果で同じ評価項目は1つだけ
ALTER TABLE public.evaluation_items
ADD CONSTRAINT unique_evaluation_item
UNIQUE (evaluation_result_id, item_id); 