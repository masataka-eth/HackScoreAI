"use client";

/**
 * 共通ヘッダーコンポーネント
 * 
 * 【役割・機能】
 * - 認証されたユーザーの共通ヘッダーUI
 * - ユーザー情報（メールアドレス）の表示
 * - APIコストの表示（累計使用料金）
 * - ブランディング（ロゴ・キャラクター）の表示
 * - 設定画面へのナビゲーション
 * - ログアウト機能
 * 
 * 【配置箇所】
 * - ダッシュボード画面の上部
 * - 各メイン画面で共通して使用
 */

import { useAuth } from "@/app/providers";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Settings, LogOut, DollarSign } from "lucide-react";
import { OctocatCharacter } from "@/components/octocat-character";
import Image from "next/image";
import { hackathonOperations } from "@/lib/supabase";

export function CommonHeader() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [totalCost, setTotalCost] = useState<number | null>(null);

  /**
   * APIコスト取得のuseEffect
   * 
   * 【動作】
   * - ユーザーがログイン状態の場合、累計APIコストをSupabaseから取得
   * - ユーザーIDをキーにしてhackathonOperations.getTotalApiCostを呼び出し
   * - 取得成功時は状態（totalCost）を更新してヘッダーに表示
   * 
   * 【依存配列】
   * - user: ユーザー情報が変更された際に再実行
   */
  useEffect(() => {
    if (!user) return;

    const loadCost = async () => {
      const result = await hackathonOperations.getTotalApiCost(user.id);
      if (result.success && result.data !== undefined) {
        setTotalCost(result.data);
      }
    };

    loadCost();
  }, [user]);

  return (
    // ヘッダー全体のコンテナ（下部ボーダー・背景・z-index設定）
    <header className="border-b border-border bg-card relative z-10">
      <div className="container mx-auto px-4 py-4">
        {/* 左右に要素を配置するFlexコンテナ */}
        <div className="flex items-center justify-between">
          {/* 左側：ユーザー情報エリア */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {user?.email}
            </span>
          </div>

          {/* 中央：ブランディングエリア（キャラクター + ロゴ） */}
          <div className="flex items-center gap-4">
            {/* GitHubマスコットキャラクター（Octocat風） */}
            <div className="w-12 h-12">
              <OctocatCharacter size="48" />
            </div>
            {/* アプリケーションロゴ */}
            <Image
              src="/logo.png"
              alt="HackScore AI"
              width={200}
              height={40}
              className="w-auto h-8"
              priority
            />
          </div>

          {/* 右側：機能エリア（APIコスト表示 + アクションボタン） */}
          <div className="flex items-center gap-4">
            {/* APIコスト表示（取得済みの場合のみ表示） */}
            {totalCost !== null && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <DollarSign className="w-4 h-4" />
                <span>{totalCost.toFixed(2)} USD</span>
              </div>
            )}
            {/* アクションボタン群 */}
            <div className="flex items-center gap-2">
              {/* 設定画面へのナビゲーションボタン */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push("/settings")}
              >
                <Settings className="w-4 h-4" />
              </Button>
              {/* ログアウトボタン（実行後はログイン画面へリダイレクト） */}
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await signOut();
                  router.push("/login");
                }}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}