"use client"

import { useAuth } from "@/app/providers"
import { useRouter } from "next/navigation"
import { useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Github } from "lucide-react"
import { OctocatCharacter } from "@/components/octocat-character"

export default function LoginPage() {
  const { user, loading, signIn } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user) {
      router.push('/dashboard')
    }
  }, [user, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* ハッカー風の背景アニメーション */}
      <div className="absolute inset-0 opacity-20">
        <div className="relative h-full w-full">
          {Array.from({ length: 50 }).map((_, i) => (
            <div
              key={i}
              className="absolute text-primary font-mono text-xs animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
              }}
            >
              {Math.random() > 0.5 ? '1' : '0'}
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            {/* 8bit Octocat マスコットキャラクター */}
            <div className="mb-8 flex justify-center">
              <OctocatCharacter size="128" />
            </div>
            
            <h1 className="text-4xl font-bold text-foreground mb-2">
              HackScore AI
            </h1>
            <p className="text-muted-foreground mb-8">
              ハッカソンのリポジトリを自動評価する
              <br />
              AI 分析プラットフォーム
            </p>
          </div>

          <div className="space-y-6">
            <div className="bg-card border border-border rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4 text-center">
                ログイン
              </h2>
              <Button
                onClick={signIn}
                className="w-full flex items-center justify-center gap-2"
                size="lg"
              >
                <Github className="w-5 h-5" />
                GitHub アカウントでログイン
              </Button>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">✨ 機能</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  GitHub リポジトリの自動解析
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  Claude Code によるコード品質評価
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  ハッカソン向けスコアリング
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  結果の可視化とランキング
                </li>
              </ul>
            </div>

            <div className="bg-card border border-border rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">🔧 技術スタック</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  フロントエンド: Next.js 13 + shadcn/ui
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  バックエンド: Supabase Edge Functions
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  AI解析: Claude Code + GitHub MCP
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary">•</span>
                  データベース: PostgreSQL + pgmq
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}