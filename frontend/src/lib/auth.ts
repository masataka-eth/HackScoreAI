import { supabase } from './supabase'

export const auth = {
  // GitHubでログイン
  async signInWithGitHub() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        scopes: 'read:user user:email read:org repo',
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })
    return { data, error }
  },

  // ログアウト
  async signOut() {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  // 現在のユーザーセッションを取得
  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession()
    return { session, error }
  },

  // ユーザー情報を取得
  async getUser() {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  },

  // セッション変更をリスニング
  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback)
  }
}