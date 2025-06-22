"use client"

import { useAuth } from "@/app/providers"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Search, Plus, Building, Code, ChevronRight } from "lucide-react"
import { OctocatCharacter } from "@/components/octocat-character"

interface GitHubOrg {
  id: number
  login: string
  description: string | null
  avatar_url: string
  public_repos: number
}

interface GitHubRepo {
  id: number
  name: string
  full_name: string
  description: string | null
  private: boolean
  language: string | null
  stargazers_count: number
  updated_at: string
}

export default function NewHackathonPage() {
  const { user, session, loading } = useAuth()
  const router = useRouter()
  
  const [hackathonName, setHackathonName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<GitHubOrg[]>([])
  const [selectedOrg, setSelectedOrg] = useState<GitHubOrg | null>(null)
  const [orgRepos, setOrgRepos] = useState<GitHubRepo[]>([])
  const [selectedRepos, setSelectedRepos] = useState<GitHubRepo[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [isLoadingRepos, setIsLoadingRepos] = useState(false)

  useEffect(() => {
    if (loading) return

    if (!user) {
      router.push('/login')
    }
  }, [user, loading, router])

  // GitHub 組織検索
  const searchOrganizations = async () => {
    if (!searchQuery.trim() || !session?.provider_token) return

    setIsSearching(true)
    try {
      const response = await fetch(`https://api.github.com/search/users?q=${encodeURIComponent(searchQuery)}+type:org`, {
        headers: {
          'Authorization': `Bearer ${session.provider_token}`,
          'Accept': 'application/vnd.github.v3+json',
        }
      })

      if (response.ok) {
        const data = await response.json()
        setSearchResults(data.items || [])
      } else {
        console.error('GitHub API error:', response.statusText)
        setSearchResults([])
      }
    } catch (error) {
      console.error('Search error:', error)
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  // 組織のリポジトリ一覧取得
  const loadOrganizationRepos = async (org: GitHubOrg) => {
    if (!session?.provider_token) return

    setIsLoadingRepos(true)
    setSelectedOrg(org)
    setOrgRepos([])
    
    try {
      const response = await fetch(`https://api.github.com/orgs/${org.login}/repos?sort=updated&per_page=100`, {
        headers: {
          'Authorization': `Bearer ${session.provider_token}`,
          'Accept': 'application/vnd.github.v3+json',
        }
      })

      if (response.ok) {
        const repos = await response.json()
        setOrgRepos(repos)
      } else {
        console.error('GitHub API error:', response.statusText)
      }
    } catch (error) {
      console.error('Load repos error:', error)
    } finally {
      setIsLoadingRepos(false)
    }
  }

  // リポジトリ選択の切り替え
  const toggleRepoSelection = (repo: GitHubRepo) => {
    setSelectedRepos(prev => {
      const isSelected = prev.some(r => r.id === repo.id)
      if (isSelected) {
        return prev.filter(r => r.id !== repo.id)
      } else {
        return [...prev, repo]
      }
    })
  }

  // ハッカソン登録処理
  const handleSubmit = async () => {
    if (!hackathonName.trim() || selectedRepos.length === 0) {
      alert('ハッカソン名とリポジトリを選択してください')
      return
    }

    try {
      const userId = user?.id
      if (!userId) throw new Error('ユーザーIDが取得できません')

      // APIキーが設定されているか確認
      const { vaultOperations } = await import('@/lib/supabase')
      const anthropicKeyResult = await vaultOperations.getKey(userId, 'anthropic_key')
      
      if (!anthropicKeyResult.success || !anthropicKeyResult.data) {
        alert('先に設定画面でAnthropic API キーを設定してください')
        router.push('/settings')
        return
      }

      // Supabase経由でハッカソンを登録
      const { hackathonOperations } = await import('@/lib/supabase')
      const result = await hackathonOperations.createHackathon({
        name: hackathonName,
        repositories: selectedRepos.map(repo => repo.full_name),
        userId
      })

      if (result.success) {
        alert('ハッカソンを登録し、評価を開始しました！')
        router.push('/dashboard')
      } else {
        throw new Error('ハッカソンの登録に失敗しました')
      }
    } catch (error) {
      console.error('Submit error:', error)
      alert(`登録に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
    }
  }

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
              <h1 className="text-2xl font-bold text-foreground">
                新しいハッカソンを登録
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* ステップ1: ハッカソン名入力 */}
          <Card>
            <CardHeader>
              <CardTitle>ステップ 1: ハッカソン名</CardTitle>
              <CardDescription>
                評価したいハッカソンの名前を入力してください
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="hackathon-name">ハッカソン名</Label>
                <Input
                  id="hackathon-name"
                  placeholder="例: AI ハッカソン 2024"
                  value={hackathonName}
                  onChange={(e) => setHackathonName(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* ステップ2: 組織検索 */}
          <Card>
            <CardHeader>
              <CardTitle>ステップ 2: GitHub 組織を検索</CardTitle>
              <CardDescription>
                リポジトリが含まれる GitHub 組織を検索してください
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="組織名を入力..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchOrganizations()}
                />
                <Button onClick={searchOrganizations} disabled={isSearching}>
                  {isSearching ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-background"></div>
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-medium">検索結果:</h3>
                  <div className="grid gap-2">
                    {searchResults.map((org) => (
                      <div
                        key={org.id}
                        className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedOrg?.id === org.id
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => loadOrganizationRepos(org)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={org.avatar_url}
                          alt={org.login}
                          className="w-8 h-8 rounded"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Building className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium">{org.login}</span>
                          </div>
                          {org.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {org.description}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ステップ3: リポジトリ選択 */}
          {selectedOrg && (
            <Card>
              <CardHeader>
                <CardTitle>ステップ 3: リポジトリを選択</CardTitle>
                <CardDescription>
                  {selectedOrg.login} のリポジトリから評価対象を選択してください
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingRepos ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                    <div className="text-muted-foreground">リポジトリを読み込み中...</div>
                  </div>
                ) : (
                  <>
                    {orgRepos.length > 0 ? (
                      <div className="grid gap-2 max-h-96 overflow-y-auto">
                        {orgRepos.map((repo) => {
                          const isSelected = selectedRepos.some(r => r.id === repo.id)
                          return (
                            <div
                              key={repo.id}
                              className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                                isSelected
                                  ? 'border-primary bg-primary/10'
                                  : 'border-border hover:border-primary/50'
                              }`}
                              onClick={() => toggleRepoSelection(repo)}
                            >
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <Code className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-medium">{repo.name}</span>
                                  {repo.private && (
                                    <span className="px-2 py-1 bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 rounded text-xs">
                                      Private
                                    </span>
                                  )}
                                </div>
                                {repo.description && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {repo.description}
                                  </p>
                                )}
                                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                  {repo.language && (
                                    <span>{repo.language}</span>
                                  )}
                                  <span>★ {repo.stargazers_count}</span>
                                  <span>更新: {new Date(repo.updated_at).toLocaleDateString()}</span>
                                </div>
                              </div>
                              {isSelected && (
                                <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                                  <Plus className="w-3 h-3 text-primary-foreground rotate-45" />
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        この組織にリポジトリが見つかりませんでした
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* 選択されたリポジトリの概要 */}
          {selectedRepos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>選択されたリポジトリ ({selectedRepos.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {selectedRepos.map((repo) => (
                    <span
                      key={repo.id}
                      className="px-3 py-1 bg-primary/20 text-primary rounded-full text-sm"
                    >
                      {repo.name}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 実行ボタン */}
          <div className="flex justify-end">
            <Button
              onClick={handleSubmit}
              disabled={!hackathonName.trim() || selectedRepos.length === 0}
              size="lg"
              className="flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              評価を開始
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}