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
  async getHackathonDetails(jobId: string) {
    try {
      // ジョブの基本情報を取得
      const { data: jobData, error: jobError } = await supabase
        .from('job_status')
        .select('id, payload, status, created_at, updated_at')
        .eq('id', jobId)
        .single()

      if (jobError) throw jobError

      if (!jobData) {
        return { success: false, error: 'ハッカソンが見つかりません' }
      }

      // 関連する評価結果を取得
      const { data: evaluationResults, error: evalError } = await supabase
        .from('evaluation_results')
        .select(`
          id,
          repository_name,
          total_score,
          evaluation_data,
          processing_metadata,
          created_at,
          evaluation_items (
            item_id,
            name,
            score,
            max_score,
            positives,
            negatives
          )
        `)
        .eq('job_id', jobId)

      if (evalError) console.warn('Error loading evaluation results:', evalError)

      // データを詳細ページ用の形式に変換
      const payload = jobData.payload
      const repositories = payload?.repositories || []
      const hackathonName = payload?.evaluationCriteria?.hackathonName || `ハッカソン ${new Date(jobData.created_at).toLocaleDateString()}`

      // 評価結果がある場合の処理
      let results = null
      let averageScore = null
      let completedAt = null

      if (evaluationResults && evaluationResults.length > 0) {
        // 平均スコアを計算
        averageScore = Math.round(
          evaluationResults.reduce((sum, result) => sum + result.total_score, 0) / evaluationResults.length
        )

        completedAt = evaluationResults[0]?.created_at

        // 評価結果のサマリーを作成
        const allPositives: string[] = []
        const allNegatives: string[] = []
        
        evaluationResults.forEach(result => {
          if (result.evaluation_items) {
            result.evaluation_items.forEach((item: any) => {
              if (item.positives) allPositives.push(item.positives)
              if (item.negatives) allNegatives.push(item.negatives)
            })
          }
        })

        results = {
          overview: `${repositories.length}個のリポジトリを分析し、総合スコア${averageScore}点を獲得しました。`,
          strengths: allPositives.slice(0, 5), // 上位5つの強み
          improvements: allNegatives.slice(0, 5), // 上位5つの改善点
          repositoryScores: evaluationResults.map(result => ({
            repository: result.repository_name,
            score: result.total_score,
            analysis: result.evaluation_data?.overallComment || 
                     result.evaluation_data?.summary || 
                     '分析結果が利用できません'
          }))
        }
      }

      // 最終的なハッカソン詳細オブジェクト
      const hackathonDetails = {
        id: jobData.id,
        name: hackathonName,
        repositories,
        status: evaluationResults && evaluationResults.length === repositories.length ? 'completed' :
                jobData.status === 'failed' ? 'failed' :
                jobData.status === 'processing' ? 'analyzing' : 'pending',
        score: averageScore,
        rank: 1, // 今後ランキング機能を実装
        totalParticipants: 1, // 今後参加者数機能を実装
        createdAt: jobData.created_at,
        completedAt,
        results
      }

      return { success: true, data: hackathonDetails }
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
  },

  // 評価詳細を取得
  async getEvaluationDetails(evaluationId: string) {
    try {
      const { data, error } = await supabase.rpc('get_evaluation_details', {
        p_evaluation_id: evaluationId
      })

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Error getting evaluation details:', error)
      return { success: false, error }
    }
  },

  // 評価サマリーを取得
  async getEvaluationSummary(userId: string) {
    try {
      const { data, error } = await supabase.rpc('get_evaluation_summary', {
        p_user_id: userId
      })

      if (error) throw error
      return { success: true, data }
    } catch (error) {
      console.error('Error getting evaluation summary:', error)
      return { success: false, error }
    }
  },

  // ハッカソンにリポジトリを追加
  async addRepositoryToHackathon(hackathonId: string, repositoryName: string) {
    try {
      console.log('🔄 Adding repository to hackathon:', { hackathonId, repositoryName })
      
      // Check authentication status
      const { data: { session }, error: authError } = await supabase.auth.getSession()
      console.log('🔐 Current session:', { session: !!session, authError })
      
      if (!session) {
        console.error('❌ No active session found')
        throw new Error('認証が必要です。ログインしてください。')
      }
      
      const { data, error } = await supabase.functions.invoke('add-repository', {
        body: {
          hackathonId,
          repositoryName
        }
      })

      console.log('📡 Edge Function response:', { data, error })

      if (error) {
        console.error('❌ Edge Function error:', error)
        throw error
      }
      
      return { success: true, data }
    } catch (error) {
      console.error('Error adding repository to hackathon:', error)
      return { success: false, error }
    }
  },

  // ハッカソンからリポジトリを削除
  async removeRepositoryFromHackathon(hackathonId: string, repositoryName: string) {
    try {
      console.log('🗑️ Removing repository from hackathon:', { hackathonId, repositoryName })
      
      // Check authentication status
      const { data: { session }, error: authError } = await supabase.auth.getSession()
      console.log('🔐 Current session:', { session: !!session, authError })
      
      if (!session) {
        console.error('❌ No active session found')
        throw new Error('認証が必要です。ログインしてください。')
      }
      
      const { data, error } = await supabase.functions.invoke('remove-repository', {
        body: {
          hackathonId,
          repositoryName
        }
      })

      console.log('📡 Edge Function response:', { data, error })

      if (error) {
        console.error('❌ Edge Function error:', error)
        throw error
      }
      
      return { success: true, data }
    } catch (error) {
      console.error('Error removing repository from hackathon:', error)
      return { success: false, error }
    }
  },

  // ハッカソンを削除
  async deleteHackathon(hackathonId: string) {
    try {
      console.log('🗑️ Deleting hackathon:', { hackathonId })
      
      // Check authentication status
      const { data: { session }, error: authError } = await supabase.auth.getSession()
      console.log('🔐 Current session:', { session: !!session, authError })
      
      if (!session) {
        console.error('❌ No active session found')
        throw new Error('認証が必要です。ログインしてください。')
      }
      
      const { data, error } = await supabase.functions.invoke('delete-hackathon', {
        body: {
          hackathonId
        }
      })

      console.log('📡 Edge Function response:', { data, error })

      if (error) {
        console.error('❌ Edge Function error:', error)
        throw error
      }
      
      return { success: true, data }
    } catch (error) {
      console.error('Error deleting hackathon:', error)
      return { success: false, error }
    }
  }
}