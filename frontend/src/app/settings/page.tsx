"use client";

import { useAuth } from "@/app/providers";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowLeft, Key, Github, Save, Eye, EyeOff } from "lucide-react";
import { OctocatCharacter } from "@/components/octocat-character";
import { BinaryBackground } from "@/components/binary-background";

export default function SettingsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showGitHubToken, setShowGitHubToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    anthropicKey: "",
    githubToken: "",
  });

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  const handleSave = async () => {
    setIsSaving(true);

    try {
      console.log("🔍 Debug: User object:", user);
      console.log("🔍 Debug: User ID:", user?.id);

      const userId = user?.id;
      if (!userId) {
        console.error("❌ User ID is missing");
        throw new Error(
          "ユーザーIDが取得できません。再度ログインしてください。"
        );
      }

      // Supabase Vault にキーを保存
      const { vaultOperations } = await import("@/lib/supabase");

      if (formData.anthropicKey) {
        console.log("🔑 Storing Anthropic key for user:", userId);
        const result = await vaultOperations.storeKey(
          userId,
          "anthropic_key",
          formData.anthropicKey
        );
        console.log("🔑 Anthropic key store result:", result);
        if (!result.success) {
          console.error("❌ Anthropic key store failed:", result.error);
          throw new Error(
            `Anthropic API キーの保存に失敗しました: ${
              (result.error as any)?.message || result.error
            }`
          );
        }
      }

      if (formData.githubToken) {
        console.log("🔑 Storing GitHub token for user:", userId);
        const result = await vaultOperations.storeKey(
          userId,
          "github_token",
          formData.githubToken
        );
        console.log("🔑 GitHub token store result:", result);
        if (!result.success) {
          console.error("❌ GitHub token store failed:", result.error);
          throw new Error(
            `GitHub トークンの保存に失敗しました: ${
              (result.error as any)?.message || result.error
            }`
          );
        }
      }

      // ローカルには暗号化されたマーカーのみ保存
      localStorage.setItem(
        "hackscoreai_keys_saved",
        JSON.stringify({
          anthropicKey: formData.anthropicKey ? "***" : "",
          githubToken: formData.githubToken ? "***" : "",
          savedAt: new Date().toISOString(),
        })
      );

      console.log("✅ Keys saved successfully");
      alert("設定を安全に保存しました");
    } catch (error) {
      console.error("❌ Error saving keys:", error);

      // エラーの詳細情報をアラートに表示
      let errorMessage =
        error instanceof Error ? error.message : "不明なエラー";
      if (error && typeof error === "object" && "code" in error) {
        errorMessage += ` (コード: ${error.code})`;
      }
      if (error && typeof error === "object" && "details" in error) {
        errorMessage += ` 詳細: ${error.details}`;
      }

      alert(`設定の保存に失敗しました: ${errorMessage}`);
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    // 保存済みの設定を読み込み
    const loadSavedKeys = async () => {
      if (!user) return;

      const userId = user.id;
      if (!userId) return;

      try {
        const { vaultOperations } = await import("@/lib/supabase");

        // Anthropic Key を取得
        const anthropicResult = await vaultOperations.getKey(
          userId,
          "anthropic_key"
        );
        const githubResult = await vaultOperations.getKey(
          userId,
          "github_token"
        );

        setFormData({
          anthropicKey:
            anthropicResult.success && anthropicResult.data ? "***" : "",
          githubToken: githubResult.success && githubResult.data ? "***" : "",
        });
      } catch (error) {
        console.error("Error loading saved keys:", error);
        // フォールバック: ローカルストレージから読み込み
        const saved = localStorage.getItem("hackscoreai_keys_saved");
        if (saved) {
          const parsedSaved = JSON.parse(saved);
          setFormData({
            anthropicKey: parsedSaved.anthropicKey || "",
            githubToken: parsedSaved.githubToken || "",
          });
        }
      }
    };

    loadSavedKeys();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background relative">
      <BinaryBackground />
      {/* ヘッダー */}
      <header className="border-b border-border bg-card relative z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10">
                <OctocatCharacter size="48" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">設定</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-2xl relative z-10">
        <div className="space-y-6">
          <div className="text-center mb-8">
            <p className="text-muted-foreground">
              ハッカソンの評価を開始するために、必要なAPI キーを設定してください
            </p>
          </div>

          {/* デバッグ情報 - 開発時は以下のコメントを外してください */}
          {/* <Card className="border-blue-500/20 bg-blue-500/10">
            <CardContent className="pt-6">
              <div className="text-sm space-y-2">
                <div className="font-medium text-blue-700 dark:text-blue-300">
                  🔍 認証デバッグ情報
                </div>
                <div className="space-y-1 text-blue-600 dark:text-blue-400 font-mono">
                  <div>ユーザーID: {user?.id || "未設定"}</div>
                  <div>メール: {user?.email || "未設定"}</div>
                  <div>認証状態: {user ? "✅ 認証済み" : "❌ 未認証"}</div>
                  <div>ロール: {user?.role || "未設定"}</div>
                  {user?.app_metadata &&
                    Object.keys(user.app_metadata).length > 0 && (
                      <div>
                        アプリメタデータ:{" "}
                        {JSON.stringify(user.app_metadata, null, 2)}
                      </div>
                    )}
                </div>
              </div>
            </CardContent>
          </Card> */}

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
                    onChange={(e) =>
                      setFormData({ ...formData, anthropicKey: e.target.value })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-0 h-full px-2"
                    onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                  >
                    {showAnthropicKey ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
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
                    onChange={(e) =>
                      setFormData({ ...formData, githubToken: e.target.value })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-0 h-full px-2"
                    onClick={() => setShowGitHubToken(!showGitHubToken)}
                  >
                    {showGitHubToken ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
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
              {isSaving ? "保存中..." : "設定を保存"}
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
                  <li>
                    Anthropic API
                    Keyは必須です。この設定がないと評価を開始できません
                  </li>
                  <li>
                    GitHub Personal Access
                    Tokenはプライベートリポジトリへのアクセス時のみ必要です
                  </li>
                  <li>
                    すべてのAPIキーはSupabase Vaultで暗号化して保存されます
                  </li>
                  <li>APIキーは第三者と共有しないでください</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
