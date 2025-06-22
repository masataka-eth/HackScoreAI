"use client"

import { useAuth } from "@/app/providers"
import { useRouter, useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Clock, Code, Trophy, Star, GitBranch, Calendar, ExternalLink } from "lucide-react"
import { OctocatCharacter } from "@/components/octocat-character"

interface HackathonDetails {
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
    }>
  }
}

export default function HackathonDetailPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const [hackathon, setHackathon] = useState<HackathonDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (loading) return

    if (!user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    const loadHackathonDetails = async () => {
      if (!params?.id || !user) return

      try {
        const { hackathonOperations } = await import('@/lib/supabase')
        const result = await hackathonOperations.getHackathonDetails(params.id as string)
        
        if (result.success && result.data) {
          setHackathon(result.data)
        } else {
          // フォールバック: ローカルストレージから読み込み
          const saved = localStorage.getItem('hackscoreai_hackathons')
          if (saved) {
            const hackathons = JSON.parse(saved) as HackathonDetails[]
            const found = hackathons.find((h: HackathonDetails) => h.id === params.id)
            if (found) {
              setHackathon(found)
            }
          }
        }
      } catch (error) {
        console.error('Error loading hackathon details:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadHackathonDetails()
  }, [params?.id, user])

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <OctocatCharacter />
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    )
  }

  if (!user || !hackathon) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-muted-foreground">ハッカソンが見つかりません</div>
          <Button onClick={() => router.push('/dashboard')}>
            ダッシュボードに戻る
          </Button>
        </div>
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-500'
      case 'analyzing': return 'text-yellow-500'
      case 'failed': return 'text-red-500'
      default: return 'text-gray-500'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return '評価完了'
      case 'analyzing': return '分析中'
      case 'failed': return '評価失敗'
      default: return '待機中'
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.back()}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-4">
              <div className="w-8 h-8">
                <OctocatCharacter />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">
                  {hackathon.name}
                </h1>
                <div className={`text-sm ${getStatusColor(hackathon.status)}`}>
                  {getStatusText(hackathon.status)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* 概要カード */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />
                ハッカソン概要
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {hackathon.score || '-'}
                  </div>
                  <div className="text-sm text-muted-foreground">総合スコア</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {hackathon.rank ? `#${hackathon.rank}` : '-'}
                  </div>
                  <div className="text-sm text-muted-foreground">順位</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {hackathon.repositories.length}
                  </div>
                  <div className="text-sm text-muted-foreground">リポジトリ数</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>開始日: {new Date(hackathon.createdAt).toLocaleString()}</span>
                </div>
                {hackathon.completedAt && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>完了日: {new Date(hackathon.completedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* リポジトリ一覧 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="w-5 h-5 text-primary" />
                対象リポジトリ
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {hackathon.repositories.map((repo, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-3 p-3 border border-border rounded-lg"
                  >
                    <GitBranch className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium flex-1">{repo}</span>
                    {hackathon.results?.repositoryScores && (
                      <div className="text-right">
                        <div className="font-bold text-primary">
                          {hackathon.results.repositoryScores.find(r => r.repository === repo)?.score || '-'}
                        </div>
                        <div className="text-xs text-muted-foreground">スコア</div>
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(`https://github.com/${repo}`, '_blank')}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 分析中の場合 */}
          {hackathon.status === 'analyzing' && (
            <Card className="border-yellow-500/20 bg-yellow-500/10">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500 mx-auto"></div>
                  <div className="text-yellow-700 dark:text-yellow-300">
                    Claude Code による解析を実行中です...
                  </div>
                  <div className="text-sm text-yellow-600 dark:text-yellow-400">
                    このプロセスには数分から数十分かかる場合があります
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 評価結果 */}
          {hackathon.status === 'completed' && hackathon.results && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>総合評価</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-foreground leading-relaxed">
                    {hackathon.results.overview}
                  </p>
                </CardContent>
              </Card>

              <div className="grid gap-6 md:grid-cols-2">
                <Card className="border-green-500/20 bg-green-500/10">
                  <CardHeader>
                    <CardTitle className="text-green-700 dark:text-green-300">
                      ✨ 優れている点
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {hackathon.results.strengths.map((strength, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <Star className="w-4 h-4 text-green-500 mt-1 flex-shrink-0" />
                          <span className="text-green-700 dark:text-green-300">
                            {strength}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card className="border-blue-500/20 bg-blue-500/10">
                  <CardHeader>
                    <CardTitle className="text-blue-700 dark:text-blue-300">
                      🚀 改善提案
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {hackathon.results.improvements.map((improvement, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <span className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0">•</span>
                          <span className="text-blue-700 dark:text-blue-300">
                            {improvement}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {/* リポジトリ別詳細分析 */}
              {hackathon.results.repositoryScores && (
                <Card>
                  <CardHeader>
                    <CardTitle>リポジトリ別詳細分析</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {hackathon.results.repositoryScores.map((repoScore, index) => (
                      <div key={index} className="border border-border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-medium">{repoScore.repository}</h4>
                          <div className="text-xl font-bold text-primary">
                            {repoScore.score}点
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {repoScore.analysis}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* エラーの場合 */}
          {hackathon.status === 'failed' && (
            <Card className="border-red-500/20 bg-red-500/10">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <div className="text-red-700 dark:text-red-300">
                    評価処理中にエラーが発生しました
                  </div>
                  <div className="text-sm text-red-600 dark:text-red-400">
                    APIキーの設定を確認するか、しばらく待ってから再度お試しください
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => router.push('/settings')}
                  >
                    設定を確認
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}