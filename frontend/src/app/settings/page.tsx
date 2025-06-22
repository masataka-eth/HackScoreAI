"use client"

import { useAuth } from "@/app/providers"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Key, Github, Save, Eye, EyeOff } from "lucide-react"
import { OctocatCharacter } from "@/components/octocat-character"

export default function SettingsPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [showAnthropicKey, setShowAnthropicKey] = useState(false)
  const [showGitHubToken, setShowGitHubToken] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  
  const [formData, setFormData] = useState({
    anthropicKey: '',
    githubToken: ''
  })

  useEffect(() => {
    if (loading) return

    if (!user) {
      router.push('/login')
    }
  }, [user, loading, router])

  const handleSave = async () => {
    setIsSaving(true)
    
    try {
      const userId = user?.id
      if (!userId) throw new Error('ユーザーIDが取得できません')

      // Supabase Vault にキーを保存
      const { vaultOperations } = await import('@/lib/supabase')
      
      if (formData.anthropicKey) {
        const result = await vaultOperations.storeKey(userId, 'anthropic_key', formData.anthropicKey)
        if (!result.success) throw new Error('Anthropic API キーの保存に失敗しました')
      }

      if (formData.githubToken) {
        const result = await vaultOperations.storeKey(userId, 'github_token', formData.githubToken)
        if (!result.success) throw new Error('GitHub トークンの保存に失敗しました')
      }

      // ローカルには暗号化されたマーカーのみ保存
      localStorage.setItem('hackscoreai_keys_saved', JSON.stringify({
        anthropicKey: formData.anthropicKey ? '***' : '',
        githubToken: formData.githubToken ? '***' : '',
        savedAt: new Date().toISOString()
      }))
      
      alert('設定を安全に保存しました')
    } catch (error) {
      console.error('Error saving keys:', error)
      alert(`設定の保存に失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
    } finally {
      setIsSaving(false)
    }
  }

  useEffect(() => {
    // 保存済みの設定を読み込み
    const loadSavedKeys = async () => {
      if (!user) return

      const userId = user.id
      if (!userId) return

      try {
        const { vaultOperations } = await import('@/lib/supabase')
        
        // Anthropic Key を取得
        const anthropicResult = await vaultOperations.getKey(userId, 'anthropic_key')
        const githubResult = await vaultOperations.getKey(userId, 'github_token')

        setFormData({
          anthropicKey: anthropicResult.success && anthropicResult.data ? '***' : '',
          githubToken: githubResult.success && githubResult.data ? '***' : ''
        })
      } catch (error) {
        console.error('Error loading saved keys:', error)
        // フォールバック: ローカルストレージから読み込み
        const saved = localStorage.getItem('hackscoreai_keys_saved')
        if (saved) {
          const parsedSaved = JSON.parse(saved)
          setFormData({
            anthropicKey: parsedSaved.anthropicKey || '',
            githubToken: parsedSaved.githubToken || ''
          })
        }
      }
    }

    loadSavedKeys()
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
                設定
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="space-y-6">
          <div className="text-center mb-8">
            <p className="text-muted-foreground">
              ハッカソンの評価を開始するために、必要なAPI キーを設定してください
            </p>
          </div>

          {/* Anthropic API Key */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="w-5 h-5 text-primary" />
                Anthropic API Key
              </CardTitle>
              <CardDescription>
                Claude Code による解析に必要なAPIキーです
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="anthropic-key">API Key</Label>
                <div className="relative">
                  <Input
                    id="anthropic-key"
                    type={showAnthropicKey ? "text" : "password"}
                    placeholder="sk-ant-..."
                    value={formData.anthropicKey}
                    onChange={(e) => setFormData({...formData, anthropicKey: e.target.value})}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-0 h-full px-2"
                    onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                  >
                    {showAnthropicKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                APIキーは暗号化されてSupabase Vaultに安全に保存されます
              </div>
            </CardContent>
          </Card>

          {/* GitHub Personal Access Token */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Github className="w-5 h-5 text-primary" />
                GitHub Personal Access Token
              </CardTitle>
              <CardDescription>
                プライベートリポジトリのアクセスに必要です（オプション）
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="github-token">Personal Access Token</Label>
                <div className="relative">
                  <Input
                    id="github-token"
                    type={showGitHubToken ? "text" : "password"}
                    placeholder="ghp_..."
                    value={formData.githubToken}
                    onChange={(e) => setFormData({...formData, githubToken: e.target.value})}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-0 h-full px-2"
                    onClick={() => setShowGitHubToken(!showGitHubToken)}
                  >
                    {showGitHubToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                必要な権限: repo, read:org
                <br />
                パブリックリポジトリのみの場合は設定不要です
              </div>
            </CardContent>
          </Card>

          {/* 保存ボタン */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isSaving || !formData.anthropicKey}
              className="flex items-center gap-2"
            >
              {isSaving ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-background"></div>
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? '保存中...' : '設定を保存'}
            </Button>
          </div>

          {/* 注意事項 */}
          <Card className="border-yellow-500/20 bg-yellow-500/10">
            <CardContent className="pt-6">
              <div className="text-sm space-y-2">
                <div className="font-medium text-yellow-700 dark:text-yellow-300">
                  ⚠️ 重要な注意事項
                </div>
                <ul className="list-disc list-inside space-y-1 text-yellow-600 dark:text-yellow-400">
                  <li>Anthropic API Keyは必須です。この設定がないと評価を開始できません</li>
                  <li>GitHub Personal Access Tokenはプライベートリポジトリへのアクセス時のみ必要です</li>
                  <li>すべてのAPIキーはSupabase Vaultで暗号化して保存されます</li>
                  <li>APIキーは第三者と共有しないでください</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}