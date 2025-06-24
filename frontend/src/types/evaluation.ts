/**
 * 評価関連の型定義
 * 
 * リポジトリ評価システムで使用される全ての型定義を管理。
 * バックエンドAPIのレスポンス形式とフロントエンドでの表示形式の
 * 両方に対応した型を定義している。
 * 
 * 主な用途：
 * - バックエンドAPIとのデータ交換
 * - 評価結果の表示コンポーネント
 * - ハッカソン管理機能
 * - データベースとの型安全な連携
 * 
 * 依存関係：
 * - Supabaseデータベーススキーマ
 * - バックエンドAPI仕様
 */

/**
 * 評価項目の詳細情報
 * 
 * 各評価項目（技術力、創造性など）の個別スコアと
 * ポジティブ・ネガティブなコメントを含む。
 */
export interface EvaluationItem {
  id: string        // 評価項目の一意識別子
  name: string      // 評価項目名（例：「技術力」「創造性」）
  score: number     // 当該項目のスコア
  positives: string // ポジティブなコメント・評価点
  negatives: string // ネガティブなコメント・改善点
}

/**
 * 評価の詳細情報
 * 
 * 1つのリポジトリに対する完全な評価結果を表現。
 * 総合スコア、各項目の詳細、全体コメントを含む。
 */
export interface EvaluationDetails {
  totalScore: number      // 全項目の合計スコア
  items: EvaluationItem[] // 各評価項目の詳細配列
  overallComment: string  // 全体的な評価コメント
}

/**
 * リポジトリ評価の完全な情報
 * 
 * データベースに保存される評価結果の完全な形式。
 * 評価詳細とメタデータを含む。
 */
export interface RepositoryEvaluation {
  id: string                          // 評価結果の一意識別子
  repository_name: string             // 対象リポジトリ名
  total_score: number                 // 総合スコア
  evaluation_data: EvaluationDetails  // 詳細な評価データ
  created_at: string                  // 評価実行日時
  job_id: string                      // 評価ジョブID
  overall_comment?: string            // 追加の全体コメント（オプション）
}

/**
 * ハッカソンの詳細情報
 * 
 * 複数のリポジトリをまとめて評価するハッカソン機能の
 * 完全な情報を表現。進行状況と結果を管理。
 */
export interface HackathonDetails {
  id: string                    // ハッカソンの一意識別子
  name: string                  // ハッカソン名
  repositories: string[]        // 評価対象リポジトリ一覧
  status: 'pending' | 'analyzing' | 'completed' | 'failed' // 処理状況
  score?: number                // 総合スコア（完了時）
  rank?: number                 // 順位（完了時）
  totalParticipants?: number    // 参加者総数
  createdAt: string            // 作成日時
  completedAt?: string         // 完了日時（完了時）
  results?: {                  // 評価結果（完了時）
    overview: string           // 総評
    strengths: string[]        // 強みの一覧
    improvements: string[]     // 改善点の一覧
    repositoryScores: Array<{  // リポジトリ別スコア
      repository: string       // リポジトリ名
      score: number           // スコア
      analysis: string        // 個別分析
      evaluationId?: string   // 評価ID（詳細参照用）
    }>
  }
}

/**
 * 評価サマリー項目
 * 
 * 評価結果の一覧表示用の軽量な情報。
 * 詳細な評価データを含まない簡易版。
 */
export interface EvaluationSummaryItem {
  id: string              // 評価結果の一意識別子
  repository_name: string // 対象リポジトリ名
  total_score: number     // 総合スコア
  overall_comment: string // 全体コメント
  created_at: string      // 評価実行日時
  job_id: string          // 評価ジョブID
}

/**
 * データベースから取得される評価詳細の生データ
 * 
 * Supabaseのクエリ結果として取得される正規化されていない
 * データ形式。フロントエンドで適切な形式に変換される。
 */
export interface EvaluationDetailsRaw {
  evaluation_result_id: string  // 評価結果ID
  repository_name: string       // リポジトリ名
  total_score: number          // 総合スコア
  evaluation_data: any         // 評価データ（JSON）
  created_at: string           // 作成日時
  item_id: string              // 項目ID
  name: string                 // 項目名
  score: number                // 項目スコア
  max_score: number            // 最大スコア
  positives: string            // ポジティブコメント
  negatives: string            // ネガティブコメント
}