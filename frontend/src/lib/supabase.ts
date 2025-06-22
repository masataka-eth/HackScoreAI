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
  // ハッカソンを登録
  async createHackathon(hackathonData: {
    name: string
    repositories: string[]
    userId: string
  }) {
    try {
      const { data, error } = await supabase.rpc('enqueue_hackathon_evaluation', {
        p_hackathon_name: hackathonData.name,
        p_repositories: hackathonData.repositories,
        p_user_id: hackathonData.userId
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
      const { data, error } = await supabase.rpc('get_user_evaluations', {
        p_user_id: userId
      })

      if (error) throw error
      return { success: true, data }
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
  }
}