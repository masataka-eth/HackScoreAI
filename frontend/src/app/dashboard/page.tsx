"use client";

/**
 * ダッシュボードページ
 * 
 * 機能:
 * - ログイン済みユーザーのハッカソン評価履歴を一覧表示
 * - ハッカソンの分析状況をリアルタイムで監視・更新
 * - ハッカソンの削除機能
 * - 新しいハッカソン作成への導線
 * 
 * リアルタイム更新:
 * - 30秒間隔で自動更新
 * - ページフォーカス時に手動更新
 * - visibilitychange イベントでの更新
 */

import { useAuth } from "@/app/providers";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  Trophy,
  Code,
  Clock,
  Trash2,
  MoreVertical,
} from "lucide-react";
import { BinaryBackground } from "@/components/binary-background";
import { CommonHeader } from "@/components/common-header";

// ハッカソンデータの型定義
interface Hackathon {
  id: string;                          // ハッカソンの一意ID
  name: string;                        // ハッカソン名
  repositories: string[];              // 評価対象のリポジトリ一覧（"owner/repo"形式）
  status: "pending" | "analyzing" | "completed" | "failed"; // 分析状況
  score?: number;                      // 評価スコア（完了時のみ）
  rank?: number;                       // ランキング（完了時のみ）
  totalParticipants?: number;          // 総参加者数（完了時のみ）
  createdAt: string;                   // 作成日時
}

export default function DashboardPage() {
  // 認証情報とページナビゲーション
  const { user, loading } = useAuth();
  const router = useRouter();
  
  // ハッカソン一覧の状態管理
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);  // ハッカソンリスト
  const [isLoading, setIsLoading] = useState(true);              // 初回読み込み状態

  // 認証状態チェック - ログインしていない場合はログインページへリダイレクト
  useEffect(() => {
    if (loading) return; // 認証状態確認中は待機

    if (!user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  /**
   * Supabaseからハッカソンデータを取得する関数
   * - ユーザーIDに紐付くハッカソン一覧を取得
   * - 分析状況（pending/analyzing/completed/failed）も含む
   * - エラー時は空配列を設定してUIを正常表示
   */
  const loadHackathons = async () => {
    if (!user) return;

    const userId = user.id;
    if (!userId) return;

    try {
      // Supabase操作モジュールを動的インポート（バンドルサイズ最適化）
      const { hackathonOperations } = await import("@/lib/supabase");
      const result = await hackathonOperations.getHackathons(userId);

      if (result.success && result.data) {
        setHackathons(result.data);
      } else {
        console.warn("Failed to load hackathons from database");
        setHackathons([]);
      }
    } catch (error) {
      console.error("Error loading hackathons:", error);
      setHackathons([]);
    } finally {
      setIsLoading(false);
    }
  };

  // ユーザー認証完了後にハッカソンデータを初回読み込み
  useEffect(() => {
    loadHackathons();
  }, [user]);


  /**
   * 定期的にハッカソン一覧を更新 - リアルタイム監視
   * - 30秒間隔で自動更新
   * - 分析中のハッカソンの状況を追跡
   * - コンポーネントアンマウント時にクリーンアップ
   */
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      loadHackathons();
    }, 30000); // 30秒ごとに更新

    return () => clearInterval(interval);
  }, [user]);

  /**
   * ページフォーカス復帰時の手動更新
   * - ブラウザタブにフォーカスが戻った時
   * - 別タブから戻ってきた時（visibilitychange）
   * - 長時間離席後の状況確認に有効
   */
  useEffect(() => {
    const handleFocus = () => {
      loadHackathons();
    };

    window.addEventListener('focus', handleFocus);
    
    // visibilitychange イベントも監視（よりアクティブな検出）
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadHackathons();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  /**
   * ハッカソン削除処理
   * - 確認ダイアログで誤操作を防止
   * - Supabaseからハッカソンデータを完全削除
   * - 削除成功後は一覧を自動更新
   */
  const handleDeleteHackathon = async (hackathonId: string, hackathonName: string) => {
    if (!confirm(`ハッカソン「${hackathonName}」を削除しますか？この操作は取り消せません。`)) {
      return;
    }
    
    try {
      const { hackathonOperations } = await import("@/lib/supabase");
      const result = await hackathonOperations.deleteHackathon(hackathonId);
      
      if (result.success) {
        // ハッカソン一覧を再読み込み
        loadHackathons();
      } else {
        alert("ハッカソンの削除に失敗しました");
      }
    } catch (error) {
      console.error("Error deleting hackathon:", error);
      alert("ハッカソンの削除に失敗しました");
    }
  };

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
      {/* 背景のバイナリアニメーション */}
      <BinaryBackground />
      {/* 共通ヘッダー（ナビゲーション・ユーザー情報など） */}
      <CommonHeader />

      <main className="container mx-auto px-4 py-8 relative z-10">
        {/* ハッカソン一覧セクション */}
        <div className="space-y-6">
          {/* ヘッダー部分 - タイトルと新規作成ボタン */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">ハッカソン履歴</h2>
            <Button
              onClick={() => router.push("/hackathon/new")}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              新しいハッカソン
            </Button>
          </div>

          {/* コンテンツ表示の分岐処理 */}
          {isLoading ? (
            // 初回読み込み中のローディング表示
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <div className="text-muted-foreground">
                ハッカソンデータを読み込み中...
              </div>
            </div>
          ) : hackathons.length === 0 ? (
            // ハッカソン未登録時の案内表示
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">
                まだハッカソンが登録されていません
              </div>
              <Button onClick={() => router.push("/hackathon/new")}>
                <Plus className="w-4 h-4 mr-2" />
                最初のハッカソンを登録
              </Button>
            </div>
          ) : (
            // ハッカソン一覧のグリッド表示
            <div className="grid gap-4">
              {hackathons.map((hackathon) => (
                // 各ハッカソンカード - クリックで詳細ページへ遷移
                <div
                  key={hackathon.id}
                  className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/hackathon/${hackathon.id}`)}
                >
                  <div className="flex items-start justify-between mb-4">
                    {/* ハッカソン基本情報エリア */}
                    <div>
                      <h3 className="text-lg font-semibold mb-2 text-foreground">
                        {hackathon.name}
                      </h3>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {/* リポジトリ数表示 */}
                        <div className="flex items-center gap-1">
                          <Code className="w-4 h-4" />
                          {hackathon.repositories.length} リポジトリ
                        </div>
                        {/* 作成日時表示 */}
                        <div className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {hackathon.createdAt}
                        </div>
                      </div>
                    </div>

                    {/* ステータス表示と操作メニューエリア */}
                    <div className="flex items-center gap-2">
                      {/* 分析状況のステータス表示 */}
                      <div className="text-right">
                        {hackathon.status === "completed" ? (
                          <div className="flex items-center gap-2 text-green-500">
                            <Trophy className="w-4 h-4" />
                            分析完了
                          </div>
                        ) : hackathon.status === "failed" ? (
                          <div className="flex items-center gap-2 text-red-500">
                            <Trophy className="w-4 h-4" />
                            分析失敗
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-yellow-500">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-500"></div>
                            分析中...
                          </div>
                        )}
                      </div>
                      
                      {/* ドロップダウンメニュー（削除機能など） */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => e.stopPropagation()} // カード全体のクリックイベントを防止
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation(); // カード全体のクリックイベントを防止
                              handleDeleteHackathon(hackathon.id, hackathon.name);
                            }}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            削除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* 関連リポジトリのタグ表示 */}
                  <div className="flex flex-wrap gap-2">
                    {hackathon.repositories.map((repo) => (
                      <span
                        key={repo}
                        className="px-2 py-1 bg-yellow-300 text-black rounded text-xs"
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
  );
}
