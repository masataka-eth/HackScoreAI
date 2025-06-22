"use client"

import { useAuth } from "@/app/providers"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Settings, LogOut, Trophy, Code, Clock } from "lucide-react"
import { OctocatCharacter } from "@/components/octocat-character"

interface Hackathon {
  id: string
  name: string
  repositories: string[]
  status: 'pending' | 'analyzing' | 'completed' | 'failed'
  score?: number
  rank?: number
  totalParticipants?: number
  createdAt: string
}

export default function DashboardPage() {
  const { user, loading, signOut } = useAuth()
  const router = useRouter()
  const [hackathons, setHackathons] = useState<Hackathon[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (loading) return

    if (!user) {
      router.push('/login')
    }
  }, [user, loading, router])

  // ハッカソンデータを読み込み
  useEffect(() => {
    const loadHackathons = async () => {
      if (!user) return

      const userId = user.id
      if (!userId) return

      try {
        const { hackathonOperations } = await import('@/lib/supabase')
        const result = await hackathonOperations.getHackathons(userId)
        
        if (result.success && result.data) {
          setHackathons(result.data)
        } else {
          // フォールバック: ローカルストレージから読み込み
          const saved = localStorage.getItem('hackscoreai_hackathons')
          if (saved) {
            setHackathons(JSON.parse(saved))
          }
        }
      } catch (error) {
        console.error('Error loading hackathons:', error)
        // フォールバック: ローカルストレージから読み込み
        const saved = localStorage.getItem('hackscoreai_hackathons')
        if (saved) {
          setHackathons(JSON.parse(saved))
        }
      } finally {
        setIsLoading(false)
      }
    }

    loadHackathons()
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ヘッダー */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8">
                <OctocatCharacter />
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                HackScore AI
              </h1>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {user.email}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/settings')}
              >
                <Settings className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await signOut()
                  router.push('/login')
                }}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* アクションボタン */}
        <div className="mb-8">
          <Button
            size="lg"
            onClick={() => router.push('/hackathon/new')}
            className="flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            新しいハッカソンを登録
          </Button>
        </div>

        {/* ハッカソン一覧 */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">ハッカソン履歴</h2>
          
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <div className="text-muted-foreground">ハッカソンデータを読み込み中...</div>
            </div>
          ) : hackathons.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                まだハッカソンが登録されていません
              </div>
              <Button onClick={() => router.push('/hackathon/new')}>
                <Plus className="w-4 h-4 mr-2" />
                最初のハッカソンを登録
              </Button>
            </div>
          ) : (
            <div className="grid gap-4">
              {hackathons.map((hackathon) => (
                <div
                  key={hackathon.id}
                  className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/hackathon/${hackathon.id}`)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold mb-2">
                        {hackathon.name}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Code className="w-4 h-4" />
                          {hackathon.repositories.length} リポジトリ
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {hackathon.createdAt}
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      {hackathon.status === "completed" ? (
                        <div className="space-y-1">
                          <div className="flex items-center gap-1 text-primary">
                            <Trophy className="w-4 h-4" />
                            #{hackathon.rank} / {hackathon.totalParticipants}
                          </div>
                          <div className="text-2xl font-bold text-foreground">
                            {hackathon.score}点
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-yellow-500">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-500"></div>
                          分析中...
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2">
                    {hackathon.repositories.map((repo) => (
                      <span
                        key={repo}
                        className="px-2 py-1 bg-secondary text-secondary-foreground rounded text-xs"
                      >
                        {repo}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}