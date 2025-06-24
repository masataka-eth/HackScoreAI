"use client";

/**
 * 設定ページ
 * 
 * 機能:
 * - Anthropic API キーの設定（必須）
 * - GitHub Personal Access Tokenの設定（オプション）
 * - Supabase Vaultへの安全なキー保存
 * - 保存済みキーの読み込みと表示
 * 
 * セキュリティ:
 * - APIキーは暗号化してSupabase Vaultに保存
 * - ローカルストレージにはマーカーのみ保存
 * - パスワードフィールドで機密情報を隠蔽
 * 
 * 処理フロー:
 * 1. 現在のキー設定状態を取得・表示
 * 2. ユーザーがキーを入力
 * 3. Supabase Vaultに安全に保存
 * 4. ローカルストレージにマーカーを保存
 */

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
import { BinaryBackground } from "@/components/binary-background";
import { CommonHeader } from "@/components/common-header";

export default function SettingsPage() {
  // 認証情報とページナビゲーション
  const { user, loading } = useAuth();
  const router = useRouter();
  
  // パスワードフィールドの表示・非表示状態
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);    // Anthropic API Keyの表示状態
  const [showGitHubToken, setShowGitHubToken] = useState(false);     // GitHub Tokenの表示状態
  
  // 保存処理状態
  const [isSaving, setIsSaving] = useState(false);                   // 保存中フラグ

  // フォーム入力データ
  const [formData, setFormData] = useState({
    anthropicKey: "",     // Anthropic API Key（必須）
    githubToken: "",      // GitHub Personal Access Token（オプション）
  });

  // 認証状態チェック - ログインしていない場合はログインページへリダイレクト
  useEffect(() => {
    if (loading) return; // 認証状態確認中は待機

    if (!user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  /**
   * APIキー保存処理
   * - Supabase Vaultへの安全なキー保存
   * - ローカルストレージにマーカー保存
   * - エラーハンドリングとユーザーフィードバック
   */
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

      // Supabase Vault 操作モジュールを動的インポート
      const { vaultOperations } = await import("@/lib/supabase");

      // Anthropic API Keyの保存（入力されている場合のみ）
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

      // GitHub Personal Access Tokenの保存（入力されている場合のみ）
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

      // ローカルストレージにはマーカーのみ保存（セキュリティ対策）
      localStorage.setItem(
        "hackscoreai_keys_saved",
        JSON.stringify({
          anthropicKey: formData.anthropicKey ? "***" : "",  // 実際のキーではなくマーカー
          githubToken: formData.githubToken ? "***" : "",    // 実際のトークンではなくマーカー
          savedAt: new Date().toISOString(),
        })
      );

      console.log("✅ Keys saved successfully");
      alert("設定を安全に保存しました");
    } catch (error) {
      console.error("❌ Error saving keys:", error);

      // エラーメッセージの詳細抽出とユーザー向け表示
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

  /**
   * 保存済みキーの読み込み処理
   * - Supabase Vaultからキーの存在確認
   * - 存在する場合はマーカーで表示
   * - エラー時はローカルストレージからフォールバック
   */
  useEffect(() => {
    const loadSavedKeys = async () => {
      if (!user) return;

      const userId = user.id;
      if (!userId) return;

      try {
        const { vaultOperations } = await import("@/lib/supabase");

        // 各キーの存在確認（実際の値は取得しない）
        const anthropicResult = await vaultOperations.getKey(
          userId,
          "anthropic_key"
        );
        const githubResult = await vaultOperations.getKey(
          userId,
          "github_token"
        );

        // キーが存在する場合はマーカーで表示
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

  // 認証状態確認中のローディング表示
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // 未認証の場合は何も表示しない（リダイレクト処理中）
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background relative">
      <BinaryBackground />
      {/* 共通ヘッダー */}
      <CommonHeader />

      {/* ページタイトルとナビゲーション */}
      <div className="border-b border-border bg-card relative z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">設定</h1>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-8 max-w-2xl relative z-10">
        <div className="space-y-6">
          {/* ページの説明文 */}
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

          {/* Anthropic API Key 設定カード（必須） */}
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
                {/* パスワードフィールドと表示切り替えボタン */}
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
                  {/* キー表示・非表示切り替えボタン */}
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
              {/* セキュリティに関する注意書き */}
              <div className="text-xs text-muted-foreground">
                APIキーは暗号化されてSupabase Vaultに安全に保存されます
              </div>
            </CardContent>
          </Card>

          {/* GitHub Personal Access Token 設定カード（オプション） */}
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
                {/* パスワードフィールドと表示切り替えボタン */}
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
                  {/* トークン表示・非表示切り替えボタン */}
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
              {/* GitHubトークンの権限と使用方法の説明 */}
              <div className="text-xs text-muted-foreground">
                必要な権限: repo, read:org
                <br />
                パブリックリポジトリのみの場合は設定不要です
              </div>
            </CardContent>
          </Card>

          {/* 設定保存ボタン */}
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isSaving || !formData.anthropicKey}  // Anthropic Keyは必須
              className="flex items-center gap-2"
            >
              {isSaving ? (
                // 保存中のスピナー表示
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-background"></div>
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? "保存中..." : "設定を保存"}
            </Button>
          </div>

          {/* 重要な注意事項のカード */}
          <Card className="border-yellow-500/20 bg-yellow-500/10">
            <CardContent className="pt-6">
              <div className="text-sm space-y-2">
                <div className="font-medium text-yellow-700 dark:text-yellow-300">
                  ⚠️ 重要な注意事項
                </div>
                {/* APIキー設定に関する注意点一覧 */}
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
