"use client";

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

interface Hackathon {
  id: string;
  name: string;
  repositories: string[];
  status: "pending" | "analyzing" | "completed" | "failed";
  score?: number;
  rank?: number;
  totalParticipants?: number;
  createdAt: string;
}

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [hackathons, setHackathons] = useState<Hackathon[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  // ハッカソンデータを読み込み
  const loadHackathons = async () => {
    if (!user) return;

    const userId = user.id;
    if (!userId) return;

    try {
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

  useEffect(() => {
    loadHackathons();
  }, [user]);


  // 定期的にハッカソン一覧を更新
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      loadHackathons();
    }, 30000); // 30秒ごとに更新

    return () => clearInterval(interval);
  }, [user]);

  // ページにフォーカスが戻ってきたときにデータを再取得
  useEffect(() => {
    const handleFocus = () => {
      loadHackathons();
    };

    window.addEventListener('focus', handleFocus);
    
    // visibilitychange イベントも監視
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

  // ハッカソンを削除
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
      <CommonHeader />

      <main className="container mx-auto px-4 py-8 relative z-10">
        {/* ハッカソン一覧 */}
        <div className="space-y-6">
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

          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <div className="text-muted-foreground">
                ハッカソンデータを読み込み中...
              </div>
            </div>
          ) : hackathons.length === 0 ? (
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
            <div className="grid gap-4">
              {hackathons.map((hackathon) => (
                <div
                  key={hackathon.id}
                  className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => router.push(`/hackathon/${hackathon.id}`)}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold mb-2 text-foreground">
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

                    <div className="flex items-center gap-2">
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
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
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
