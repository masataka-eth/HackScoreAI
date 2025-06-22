"use client";

import { useAuth } from "@/app/providers";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Clock,
  Trophy,
  GitBranch,
  Calendar,
  ExternalLink,
  Medal,
  Crown,
  Loader2,
} from "lucide-react";
import { OctocatCharacter } from "@/components/octocat-character";
import { BinaryBackground } from "@/components/binary-background";

interface HackathonDetails {
  id: string;
  name: string;
  repositories: string[];
  status: "pending" | "analyzing" | "completed" | "failed";
  score?: number;
  rank?: number;
  totalParticipants?: number;
  createdAt: string;
  completedAt?: string;
  results?: {
    overview: string;
    strengths: string[];
    improvements: string[];
    repositoryScores: Array<{
      repository: string;
      score: number;
      analysis: string;
      evaluationId?: string;
    }>;
  };
}

interface RepositoryEvaluation {
  id: string;
  repository_name: string;
  total_score: number;
  overall_comment: string;
  created_at: string;
  job_id: string;
}

interface RepositoryStatus {
  repository_name: string;
  status: "completed" | "evaluating";
  evaluation?: RepositoryEvaluation;
  rank?: number;
}

export default function HackathonDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const [hackathon, setHackathon] = useState<HackathonDetails | null>(null);
  const [repositoryEvaluations, setRepositoryEvaluations] = useState<
    RepositoryEvaluation[]
  >([]);
  const [repositoryStatuses, setRepositoryStatuses] = useState<
    RepositoryStatus[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const loadHackathonDetails = async () => {
      if (!params?.id || !user) return;

      try {
        const { hackathonOperations, supabase } = await import(
          "@/lib/supabase"
        );

        // ハッカソンの基本情報を取得
        const result = await hackathonOperations.getHackathonDetails(
          params.id as string
        );

        if (result.success && result.data) {
          setHackathon(result.data as HackathonDetails);
        }

        // 評価サマリーを取得（順位表示用）
        const { data: evaluationSummary, error } = await supabase.rpc(
          "get_evaluation_summary",
          {
            p_user_id: user.id,
          }
        );

        if (evaluationSummary && !error) {
          // 現在のジョブに関連するリポジトリの評価結果をフィルタリング
          const currentJobEvaluations = evaluationSummary.filter(
            (evaluation: any) => evaluation.job_id === params.id
          );

          // スコア順に並び替え（降順）
          const sortedEvaluations = currentJobEvaluations.sort(
            (a: any, b: any) => b.total_score - a.total_score
          );

          setRepositoryEvaluations(sortedEvaluations);

          // ハッカソンデータが取得できている場合、全リポジトリの状態を構築
          if (result.success && result.data) {
            const allRepositories = result.data.repositories;
            const repositoryStatusList: RepositoryStatus[] = [];

            // 評価完了済みリポジトリを追加
            sortedEvaluations.forEach((evaluation: any, index: number) => {
              repositoryStatusList.push({
                repository_name: evaluation.repository_name,
                status: "completed",
                evaluation: evaluation,
                rank: index + 1,
              });
            });

            // 評価中のリポジトリを追加
            allRepositories.forEach((repoName: string) => {
              const isCompleted = sortedEvaluations.some(
                (evaluation: any) => evaluation.repository_name === repoName
              );
              if (!isCompleted) {
                repositoryStatusList.push({
                  repository_name: repoName,
                  status: "evaluating",
                });
              }
            });

            setRepositoryStatuses(repositoryStatusList);
          }
        }

        // フォールバック: ローカルストレージから読み込み
        if (!result.success) {
          const saved = localStorage.getItem("hackscoreai_hackathons");
          if (saved) {
            const hackathons = JSON.parse(saved) as HackathonDetails[];
            const found = hackathons.find(
              (h: HackathonDetails) => h.id === params.id
            );
            if (found) {
              setHackathon(found);
            }
          }
        }
      } catch (error) {
        console.error("Error loading hackathon details:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadHackathonDetails();
  }, [params?.id, user]);

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <OctocatCharacter />
          <div className="text-muted-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user || !hackathon) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-muted-foreground">
            ハッカソンが見つかりません
          </div>
          <Button onClick={() => router.push("/dashboard")}>
            ダッシュボードに戻る
          </Button>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "text-green-500";
      case "analyzing":
        return "text-yellow-500";
      case "failed":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed":
        return "評価完了";
      case "analyzing":
        return "分析中";
      case "failed":
        return "評価失敗";
      default:
        return "待機中";
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-6 h-6 text-yellow-500" />;
      case 2:
        return <Medal className="w-6 h-6 text-gray-400" />;
      case 3:
        return <Medal className="w-6 h-6 text-amber-600" />;
      default:
        return (
          <div className="w-6 h-6 flex items-center justify-center text-sm font-bold text-muted-foreground">
            #{rank}
          </div>
        );
    }
  };

  const navigateToRepositoryDetail = (
    repoName: string,
    evaluationId: string
  ) => {
    router.push(
      `/hackathon/${params.id}/repository/${encodeURIComponent(
        repoName
      )}?evaluationId=${evaluationId}`
    );
  };

  // 平均スコアを計算
  const averageScore =
    repositoryEvaluations.length > 0
      ? Math.round(
          repositoryEvaluations.reduce(
            (sum, repo) => sum + repo.total_score,
            0
          ) / repositoryEvaluations.length
        )
      : null;

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

      <main className="container mx-auto px-4 py-8 max-w-4xl relative z-10">
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
                    {averageScore || hackathon.score || "-"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    平均総合スコア
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {hackathon.repositories.length}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    リポジトリ数
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground">
                    {repositoryEvaluations.length}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    評価完了数
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>
                    開始日: {new Date(hackathon.createdAt).toLocaleString()}
                  </span>
                </div>
                {hackathon.completedAt && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>
                      完了日: {new Date(hackathon.completedAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* リポジトリ一覧（順位付き） */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />
                リポジトリ順位
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {repositoryStatuses.length > 0
                  ? repositoryStatuses.map((repoStatus, index) => {
                      const isCompleted = repoStatus.status === "completed";
                      const isClickable = isCompleted && repoStatus.evaluation;

                      return (
                        <div
                          key={repoStatus.repository_name}
                          className={`flex items-center gap-4 p-4 border border-border rounded-lg transition-colors ${
                            isClickable
                              ? "hover:bg-accent/50 cursor-pointer"
                              : ""
                          } ${
                            !isCompleted
                              ? "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800"
                              : ""
                          }`}
                          onClick={() => {
                            if (isClickable && repoStatus.evaluation) {
                              navigateToRepositoryDetail(
                                repoStatus.repository_name,
                                repoStatus.evaluation.id
                              );
                            }
                          }}
                        >
                          <div className="flex items-center gap-3">
                            {isCompleted && repoStatus.rank ? (
                              <>
                                {getRankIcon(repoStatus.rank)}
                                <div className="text-lg font-bold text-muted-foreground">
                                  #{repoStatus.rank}
                                </div>
                              </>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-5 h-5 animate-spin text-yellow-600" />
                                <div className="text-lg font-bold text-yellow-600">
                                  評価中
                                </div>
                              </div>
                            )}
                          </div>
                          <GitBranch className="w-4 h-4 text-muted-foreground" />
                          <div className="flex-1">
                            <div className="font-medium text-lg">
                              {repoStatus.repository_name}
                            </div>
                            {!isCompleted && (
                              <div className="text-sm text-yellow-600 dark:text-yellow-400">
                                AIエージェントによる解析を実行中...
                              </div>
                            )}
                          </div>
                          {isCompleted && repoStatus.evaluation && (
                            <div className="text-2xl font-bold text-primary">
                              {repoStatus.evaluation.total_score}点
                            </div>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(
                                `https://github.com/${repoStatus.repository_name}`,
                                "_blank"
                              );
                            }}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })
                  : // データがない場合のフォールバック
                    hackathon?.repositories.map((repo, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-4 p-4 border border-border rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800"
                      >
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-5 h-5 animate-spin text-yellow-600" />
                          <div className="text-lg font-bold text-yellow-600">
                            評価中
                          </div>
                        </div>
                        <GitBranch className="w-4 h-4 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-medium text-lg">{repo}</div>
                          <div className="text-sm text-yellow-600 dark:text-yellow-400">
                            Claude Codeによる解析を実行中...
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            window.open(`https://github.com/${repo}`, "_blank")
                          }
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </div>
                    )) || []}
              </div>
            </CardContent>
          </Card>

          {/* 分析中の場合 */}
          {hackathon.status === "analyzing" && (
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

          {/* エラーの場合 */}
          {hackathon.status === "failed" && (
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
                    onClick={() => router.push("/settings")}
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
  );
}
