import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Vault操作用の関数
export const vaultOperations = {
  // キーを保存
  async storeKey(userId: string, keyType: 'anthropic_key' | 'github_token', keyValue: string) {
    try {
      const { data, error } = await supabase.rpc('store_user_secret', {
        p_user_id: userId,
        p_secret_type: keyType,
        p_secret_name: 'default',
        p_secret_value: keyValue
      })

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Error storing key:', error)
      return { success: false, error }
    }
  },

  // キーを取得
  async getKey(userId: string, keyType: 'anthropic_key' | 'github_token') {
    try {
      const { data, error } = await supabase.rpc('get_user_secret', {
        p_user_id: userId,
        p_secret_type: keyType,
        p_secret_name: 'default'
      })

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Error getting key:', error)
      return { success: false, error }
    }
  },

  // キーを削除（削除機能は未実装、必要に応じて追加）
  async deleteKey(userId: string, keyType: 'anthropic_key' | 'github_token') {
    try {
      // user_secretsテーブルから直接削除
      const { data, error } = await supabase
        .from('user_secrets')
        .delete()
        .eq('user_id', userId)
        .eq('secret_type', keyType)
        .eq('secret_name', 'default')

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Error deleting key:', error)
      return { success: false, error }
    }
  }
}

// ハッカソン操作用の関数
export const hackathonOperations = {
  // ハッカソンを登録（Edge Functionのenqueueエンドポイントを使用）
  async createHackathon(hackathonData: {
    name: string
    repositories: string[]
    userId: string
  }) {
    try {
      const { data, error } = await supabase.functions.invoke('enqueue', {
        body: {
          repositories: hackathonData.repositories,
          userId: hackathonData.userId,
          evaluationCriteria: {
            hackathonName: hackathonData.name
          }
        }
      })

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Error creating hackathon:', error)
      return { success: false, error }
    }
  },

  // ハッカソン一覧を取得
  async getHackathons(userId: string) {
    try {
      // 進行中のジョブとペンディング中のジョブを取得
      const { data: jobs, error: jobsError } = await supabase
        .from('job_status')
        .select('id, payload, status, created_at')
        .eq('payload->>userId', userId)
        .order('created_at', { ascending: false })

      if (jobsError) throw jobsError

      // 完了済みの評価結果を取得
      const { data: evaluations, error: evalsError } = await supabase.rpc('get_evaluation_summary', {
        p_user_id: userId
      })

      if (evalsError) console.warn('Error fetching evaluations:', evalsError)

      const hackathons: any[] = []

      // ジョブからハッカソンを作成
      jobs?.forEach((job: any) => {
        const payload = job.payload
        if (payload?.repositories) {
          // 各リポジトリの評価結果を探す
          const repoEvaluations = evaluations?.filter((evaluation: any) => 
            payload.repositories.includes(evaluation.repository_name)
          ) || []

          const averageScore = repoEvaluations.length > 0 
            ? Math.round(repoEvaluations.reduce((sum: number, evaluation: any) => sum + evaluation.total_score, 0) / repoEvaluations.length)
            : null

          hackathons.push({
            id: job.id,
            name: payload.evaluationCriteria?.hackathonName || `ハッカソン ${new Date(job.created_at).toLocaleDateString()}`,
            repositories: payload.repositories,
            status: repoEvaluations.length === payload.repositories.length ? 'completed' : 
                   job.status === 'failed' ? 'failed' : 'analyzing',
            score: averageScore,
            rank: 1, // ランクは後で実装
            totalParticipants: 1, // 参加者数は後で実装
            createdAt: new Date(job.created_at).toLocaleDateString()
          })
        }
      })

      return { success: true, data: hackathons }
    } catch (error) {
      console.error('Error getting hackathons:', error)
      return { success: false, error }
    }
  },

  // ハッカソン詳細を取得
  async getHackathonDetails(evaluationId: string) {
    try {
      const { data, error } = await supabase.rpc('get_evaluation_details', {
        p_evaluation_id: evaluationId
      })

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Error getting hackathon details:', error)
      return { success: false, error }
    }
  },

  // 手動でワーカー処理をトリガー
  async triggerWorkerProcessing() {
    try {
      const { data, error } = await supabase.functions.invoke('repo_worker', {
        body: {}
      })

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Error triggering worker:', error)
      return { success: false, error }
    }
  }
}