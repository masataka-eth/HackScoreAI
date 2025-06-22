// 評価関連の型定義

export interface EvaluationItem {
  id: string
  name: string
  score: number
  positives: string
  negatives: string
}

export interface EvaluationDetails {
  totalScore: number
  items: EvaluationItem[]
  overallComment: string
}

export interface RepositoryEvaluation {
  id: string
  repository_name: string
  total_score: number
  evaluation_data: EvaluationDetails
  created_at: string
  job_id: string
  overall_comment?: string
}

export interface HackathonDetails {
  id: string
  name: string
  repositories: string[]
  status: 'pending' | 'analyzing' | 'completed' | 'failed'
  score?: number
  rank?: number
  totalParticipants?: number
  createdAt: string
  completedAt?: string
  results?: {
    overview: string
    strengths: string[]
    improvements: string[]
    repositoryScores: Array<{
      repository: string
      score: number
      analysis: string
      evaluationId?: string
    }>
  }
}

export interface EvaluationSummaryItem {
  id: string
  repository_name: string
  total_score: number
  overall_comment: string
  created_at: string
  job_id: string
}

// データベースから取得される評価詳細の生データ
export interface EvaluationDetailsRaw {
  evaluation_result_id: string
  repository_name: string
  total_score: number
  evaluation_data: any
  created_at: string
  item_id: string
  name: string
  score: number
  max_score: number
  positives: string
  negatives: string
}