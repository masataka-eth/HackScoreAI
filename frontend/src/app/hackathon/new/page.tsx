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
import { BinaryBackground } from "@/components/binary-background"

interface GitHubOrg {
  id: number
  login: string
  description: string | null
  avatar_url: string
  public_repos: number
  type: 'User' | 'Organization'
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
  
  // デバッグ用: セッション情報をログ出力
  useEffect(() => {
    if (session) {
      console.log('Session Data:', session)
      console.log('Provider Token:', session.provider_token)
    }
  }, [session])
  
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
    if (!searchQuery.trim()) return

    // まずはアクセストークンがあるかチェック
    if (!session?.provider_token) {
      alert('GitHub認証が完了していません。再度ログインしてください。')
      return
    }

    setIsSearching(true)
    setSearchResults([])
    
    try {
      // GitHub Search API を使用して組織とユーザーを検索
      const [orgResponse, userResponse] = await Promise.all([
        // 組織を検索
        fetch(`https://api.github.com/search/users?q=${encodeURIComponent(searchQuery)}+type:org&per_page=5`, {
          headers: {
            'Authorization': `Bearer ${session.provider_token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'HackScore-AI'
          }
        }),
        // ユーザーを検索
        fetch(`https://api.github.com/search/users?q=${encodeURIComponent(searchQuery)}+type:user&per_page=5`, {
          headers: {
            'Authorization': `Bearer ${session.provider_token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'HackScore-AI'
          }
        })
      ])

      const combinedResults: GitHubOrg[] = []

      if (orgResponse.ok) {
        const orgData = await orgResponse.json()
        combinedResults.push(...orgData.items.map((item: any) => ({
          ...item,
          type: 'Organization' as const
        })))
      }

      if (userResponse.ok) {
        const userData = await userResponse.json()
        combinedResults.push(...userData.items.map((item: any) => ({
          ...item,
          type: 'User' as const
        })))
      }

      console.log('GitHub Search Results:', combinedResults)
      setSearchResults(combinedResults)
      
      if (combinedResults.length === 0) {
        alert('検索結果が見つかりませんでした。別のキーワードで試してください。')
      }
    } catch (error) {
      console.error('Search error:', error)
      alert('ネットワークエラーが発生しました。インターネット接続を確認してください。')
      setSearchResults([])
    } finally {
      setIsSearching(false)
    }
  }

  // 組織またはユーザーのリポジトリ一覧取得
  const loadOrganizationRepos = async (org: GitHubOrg) => {
    if (!session?.provider_token) return

    setIsLoadingRepos(true)
    setSelectedOrg(org)
    setOrgRepos([])
    
    try {
      const userId = user?.id
      if (!userId) throw new Error('ユーザーIDが取得できません')

      // Vault からGitHub Personal Access Tokenを取得
      const { vaultOperations } = await import('@/lib/supabase')
      const githubTokenResult = await vaultOperations.getKey(userId, 'github_token')
      
      // 使用するトークンを決定（設定されたトークンがあればそれを優先、なければOAuthトークンを使用）
      const accessToken = (githubTokenResult.success && githubTokenResult.data) 
        ? githubTokenResult.data 
        : session.provider_token

      console.log('Using token type:', githubTokenResult.success && githubTokenResult.data ? 'Personal Access Token' : 'OAuth Token')

      // 組織の場合は /orgs/{org}/repos、ユーザーの場合は /users/{user}/repos
      const apiUrl = org.type === 'Organization' 
        ? `https://api.github.com/orgs/${org.login}/repos?sort=updated&per_page=100&type=all`
        : `https://api.github.com/users/${org.login}/repos?sort=updated&per_page=100&type=all`
        
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'HackScore-AI'
        }
      })

      if (response.ok) {
        const repos = await response.json()
        console.log(`Loaded ${repos.length} repositories (including private ones if accessible)`)
        setOrgRepos(repos)
      } else {
        console.error('GitHub API error:', response.status, response.statusText)
        if (response.status === 401) {
          alert('GitHubトークンの権限が不足しています。設定画面でPersonal Access Tokenを設定してください。')
        } else if (response.status === 403) {
          alert('APIレート制限に達しました。しばらく待ってから再試行してください。')
        }
      }
    } catch (error) {
      console.error('Load repos error:', error)
      alert(`リポジトリの取得に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
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
        // ハッカソン登録成功後、自動的に評価処理を開始
        console.log('✅ Hackathon registered successfully, starting evaluation automatically...')
        
        try {
          const workerResult = await hackathonOperations.triggerWorkerProcessing()
          if (workerResult.success) {
            console.log('✅ Evaluation started automatically')
            alert('ハッカソンを登録し、評価を開始しました！\n\nダッシュボードで進行状況を確認できます。評価には数分かかる場合があります。')
          } else {
            console.warn('⚠️ Automatic evaluation start failed, but hackathon was registered')
            alert('ハッカソンを登録しました。評価はダッシュボードから手動で開始してください。')
          }
        } catch (workerError) {
          console.error('⚠️ Auto-worker trigger failed:', workerError)
          alert('ハッカソンを登録しました。評価はダッシュボードから手動で開始してください。')
        }
        
        router.push('/dashboard')
      } else {
        console.error('Hackathon creation failed:', result)
        const errorMsg = result.error?.message || result.error || 'ハッカソンの登録に失敗しました'
        throw new Error(errorMsg)
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
    <div className="min-h-screen bg-background relative">
      <BinaryBackground />
      {/* ヘッダー */}
      <header className="border-b border-border bg-card relative z-10">
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
              <div className="w-10 h-10">
                <OctocatCharacter size="48" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                新しいハッカソンを登録
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl relative z-10">
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
                  placeholder="組織名を入力（例: microsoft, google, facebook）..."
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
              
              {/* デバッグ情報表示 */}
              {session && (
                <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
                  認証状態: {session.provider_token ? '✅ GitHub トークン取得済み' : '❌ トークン未取得'}
                </div>
              )}

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
                            {org.type === 'Organization' ? (
                              <Building className="w-4 h-4 text-blue-500" />
                            ) : (
                              <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                                <span className="text-xs text-white">U</span>
                              </div>
                            )}
                            <span className="font-medium">{org.login}</span>
                            <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                              {org.type === 'Organization' ? '組織' : 'ユーザー'}
                            </span>
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