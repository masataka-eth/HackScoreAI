/**
 * 認証関連ユーティリティ
 * 
 * Supabase Authを使用したGitHub認証の管理を行うユーティリティクラス。
 * 主な機能：
 * - GitHub OAuth認証（repo権限付きでサインイン）
 * - ログアウト処理
 * - セッション管理とユーザー情報取得
 * - 認証状態の変更監視
 * 
 * 使用箇所：
 * - providers.tsx でのAuthContextでの認証状態管理
 * - 各コンポーネントでのログイン/ログアウト処理
 * 
 * 依存関係：
 * - ./supabase からのSupabaseクライアント
 * - GitHub OAuth設定（Supabase Dashboard）
 */

import { supabase } from './supabase'

export const auth = {
  /**
   * GitHubでログイン
   * 
   * GitHub OAuthを使用してユーザーをサインインさせる。
   * リポジトリアクセス権限（repo）を含む必要なスコープを要求。
   * 
   * @returns {Object} data: 認証データ, error: エラー情報
   */
  async signInWithGitHub() {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        scopes: 'read:user user:email read:org repo', // リポジトリ解析に必要な権限
        redirectTo: `${window.location.origin}/auth/callback`
      }
    })
    return { data, error }
  },

  /**
   * ログアウト
   * 
   * 現在のユーザーセッションを終了する。
   * 
   * @returns {Object} error: エラー情報
   */
  async signOut() {
    const { error } = await supabase.auth.signOut()
    return { error }
  },

  /**
   * 現在のユーザーセッションを取得
   * 
   * アクティブなセッション情報を取得。
   * 初期化時やページリロード時の認証状態確認に使用。
   * 
   * @returns {Object} session: セッション情報, error: エラー情報
   */
  async getSession() {
    const { data: { session }, error } = await supabase.auth.getSession()
    return { session, error }
  },

  /**
   * ユーザー情報を取得
   * 
   * 現在認証されているユーザーの詳細情報を取得。
   * 
   * @returns {Object} user: ユーザー情報, error: エラー情報
   */
  async getUser() {
    const { data: { user }, error } = await supabase.auth.getUser()
    return { user, error }
  },

  /**
   * セッション変更をリスニング
   * 
   * 認証状態の変更（ログイン、ログアウト、トークンリフレッシュなど）を
   * リアルタイムで監視する。
   * 
   * @param {Function} callback - 認証状態変更時に呼び出されるコールバック関数
   * @returns {Object} subscription - サブスクリプションオブジェクト（解除用）
   */
  onAuthStateChange(callback: (event: string, session: any) => void) {
    return supabase.auth.onAuthStateChange(callback)
  }
}