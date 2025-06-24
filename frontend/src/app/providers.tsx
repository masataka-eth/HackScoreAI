/**
 * React Contextプロバイダー
 * 
 * アプリケーション全体で共有される状態管理とプロバイダーを定義。
 * 主に認証状態の管理とトーストメッセージ機能を提供。
 * 
 * 主な機能：
 * - 認証状態の一元管理（ユーザー情報、セッション情報）
 * - ログイン/ログアウト機能の提供
 * - 認証状態の変更リスニング
 * - トーストメッセージ機能の提供
 * 
 * 使用箇所：
 * - layout.tsx でアプリケーション全体をラップ
 * - 全コンポーネントでuseAuth()フックを使用
 * - エラーハンドリングでtoast表示
 * 
 * 依存関係：
 * - @/lib/auth からの認証ユーティリティ
 * - @supabase/supabase-js からの型定義
 * - sonner トーストライブラリ
 */

"use client"

import { createContext, useContext, useEffect, useState } from 'react'
import { auth } from '@/lib/auth'
import type { User, Session } from '@supabase/supabase-js'
import { Toaster } from 'sonner'

/**
 * 認証コンテキストの型定義
 * 
 * useAuth()フックで提供される認証関連の状態と関数を定義。
 */
interface AuthContextType {
  user: User | null           // 現在のユーザー情報（未認証時はnull）
  session: Session | null     // 現在のセッション情報（未認証時はnull）
  loading: boolean           // 認証状態の読み込み中フラグ
  signIn: () => Promise<void>  // ログイン処理関数
  signOut: () => Promise<void> // ログアウト処理関数
}

/**
 * 認証コンテキストの作成
 * 
 * アプリケーション全体で認証状態を共有するためのReact Context。
 */
const AuthContext = createContext<AuthContextType | undefined>(undefined)

/**
 * 認証状態取得フック
 * 
 * 認証コンテキストから現在の認証状態と関連する関数を取得。
 * Providersコンポーネント内でのみ使用可能。
 * 
 * @returns {AuthContextType} 認証状態と関数
 * @throws {Error} Provider外で使用された場合
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

/**
 * プロバイダーコンポーネント
 * 
 * アプリケーション全体の状態管理を提供する最上位コンポーネント。
 * 認証状態の管理とトーストメッセージ機能を子コンポーネントに提供。
 * 
 * @param {React.ReactNode} children - ラップする子コンポーネント
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // 認証状態の管理
  const [user, setUser] = useState<User | null>(null)       // ユーザー情報の状態
  const [session, setSession] = useState<Session | null>(null) // セッション情報の状態
  const [loading, setLoading] = useState(true)              // 読み込み状態

  useEffect(() => {
    // 初期セッションを取得
    // ページ読み込み時に既存のセッションがあるかチェック
    auth.getSession().then(({ session }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // セッション変更をリスニング
    // ログイン/ログアウト時のリアルタイム更新
    const { data: { subscription } } = auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    // クリーンアップ：コンポーネントアンマウント時にリスナー解除
    return () => subscription.unsubscribe()
  }, [])

  /**
   * ログイン処理
   * 
   * GitHub OAuthでのログインを実行。
   * 成功時は自動的に認証状態が更新される。
   */
  const signIn = async () => {
    await auth.signInWithGitHub()
  }

  /**
   * ログアウト処理
   * 
   * 現在のセッションを終了し、状態をクリア。
   */
  const signOut = async () => {
    await auth.signOut()
    setUser(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut }}>
      {children}
      {/* トーストメッセージ表示コンポーネント */}
      <Toaster position="top-right" richColors />
    </AuthContext.Provider>
  )
}