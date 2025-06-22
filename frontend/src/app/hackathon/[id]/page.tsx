"use client";

import { useAuth } from "@/app/providers";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  Plus,
  Trash2,
  RefreshCw,
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
  
  // リポジトリ追加関連のstate
  const [isAddRepositoryOpen, setIsAddRepositoryOpen] = useState(false);
  const [githubOrg, setGithubOrg] = useState("");
  const [availableRepos, setAvailableRepos] = useState<string[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isAddingRepositories, setIsAddingRepositories] = useState(false);

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

  // GitHubリポジトリ一覧を取得
  const loadGitHubRepositories = async () => {
    if (!githubOrg.trim()) return;
    
    setIsLoadingRepos(true);
    try {
      const { vaultOperations } = await import("@/lib/supabase");
      const result = await vaultOperations.getKey(user!.id, "github_token");
      
      if (!result.success || !result.data) {
        alert("GitHubトークンが設定されていません。設定ページで設定してください。");
        return;
      }

      const response = await fetch(`https://api.github.com/orgs/${githubOrg}/repos?type=all&per_page=100`, {
        headers: {
          Authorization: `Bearer ${result.data}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!response.ok) {
        throw new Error(`GitHub API エラー: ${response.status}`);
      }

      const repos = await response.json();
      const repoNames = repos.map((repo: any) => repo.full_name);
      
      // 既存のリポジトリを除外
      const existingRepos = hackathon?.repositories || [];
      const newRepos = repoNames.filter((repo: string) => !existingRepos.includes(repo));
      
      setAvailableRepos(newRepos);
    } catch (error) {
      console.error("Error loading repositories:", error);
      alert("リポジトリの取得に失敗しました");
    } finally {
      setIsLoadingRepos(false);
    }
  };

  // リポジトリを追加
  const handleAddRepositories = async () => {
    if (selectedRepos.length === 0) return;
    
    setIsAddingRepositories(true);
    try {
      const { hackathonOperations } = await import("@/lib/supabase");
      
      // 選択されたリポジトリを順番に追加
      for (const repo of selectedRepos) {
        const result = await hackathonOperations.addRepositoryToHackathon(
          params.id as string,
          repo
        );
        
        if (!result.success) {
          console.error(`Failed to add repository ${repo}:`, result.error);
          alert(`リポジトリ ${repo} の追加に失敗しました`);
        }
      }
      
      // モーダルを閉じて状態をリセット
      setIsAddRepositoryOpen(false);
      setGithubOrg("");
      setAvailableRepos([]);
      setSelectedRepos([]);
      
      // ハッカソン詳細を再読み込み
      setTimeout(() => {
        window.location.reload();
      }, 1000);
      
    } catch (error) {
      console.error("Error adding repositories:", error);
      alert("リポジトリの追加に失敗しました");
    } finally {
      setIsAddingRepositories(false);
    }
  };

  // リポジトリを削除
  const handleRemoveRepository = async (repositoryName: string) => {
    if (!confirm(`リポジトリ「${repositoryName}」を削除しますか？関連する評価結果も削除されます。`)) {
      return;
    }
    
    try {
      const { hackathonOperations } = await import("@/lib/supabase");
      const result = await hackathonOperations.removeRepositoryFromHackathon(
        params.id as string,
        repositoryName
      );
      
      if (result.success) {
        // ハッカソン詳細を再読み込み
        window.location.reload();
      } else {
        alert("リポジトリの削除に失敗しました");
      }
    } catch (error) {
      console.error("Error removing repository:", error);
      alert("リポジトリの削除に失敗しました");
    }
  };

  // 失敗したリポジトリを再実行
  const handleRetryRepository = async (repositoryName: string) => {
    try {
      const { hackathonOperations } = await import("@/lib/supabase");
      const result = await hackathonOperations.retryFailedRepository(
        params.id as string,
        repositoryName
      );
      
      if (result.success) {
        alert("リポジトリの再分析を開始しました");
        // ハッカソン詳細を再読み込み
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        alert("再分析の開始に失敗しました");
      }
    } catch (error) {
      console.error("Error retrying repository:", error);
      alert("再分析の開始に失敗しました");
    }
  };

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
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-primary" />
                  リポジトリ順位
                </div>
                <Dialog open={isAddRepositoryOpen} onOpenChange={setIsAddRepositoryOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      リポジトリを追加
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>リポジトリを追加</DialogTitle>
                      <DialogDescription>
                        GitHub組織名を入力してリポジトリを選択してください
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="github-org">GitHub組織名</Label>
                        <div className="flex gap-2">
                          <Input
                            id="github-org"
                            placeholder="例: microsoft"
                            value={githubOrg}
                            onChange={(e) => setGithubOrg(e.target.value)}
                          />
                          <Button 
                            onClick={loadGitHubRepositories}
                            disabled={isLoadingRepos || !githubOrg.trim()}
                          >
                            {isLoadingRepos ? "読み込み中..." : "取得"}
                          </Button>
                        </div>
                      </div>
                      
                      {availableRepos.length > 0 && (
                        <div className="space-y-2">
                          <Label>リポジトリを選択</Label>
                          <div className="max-h-48 overflow-y-auto space-y-2 border rounded p-2">
                            {availableRepos.map((repo) => (
                              <div key={repo} className="flex items-center space-x-2">
                                <Checkbox
                                  id={repo}
                                  checked={selectedRepos.includes(repo)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      setSelectedRepos([...selectedRepos, repo]);
                                    } else {
                                      setSelectedRepos(selectedRepos.filter(r => r !== repo));
                                    }
                                  }}
                                />
                                <Label 
                                  htmlFor={repo}
                                  className="text-sm font-normal cursor-pointer"
                                >
                                  {repo}
                                </Label>
                              </div>
                            ))}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {selectedRepos.length} 個のリポジトリが選択されています
                          </p>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setIsAddRepositoryOpen(false);
                          setGithubOrg("");
                          setAvailableRepos([]);
                          setSelectedRepos([]);
                        }}
                      >
                        キャンセル
                      </Button>
                      <Button 
                        onClick={handleAddRepositories}
                        disabled={selectedRepos.length === 0 || isAddingRepositories}
                      >
                        {isAddingRepositories ? "追加中..." : `${selectedRepos.length}個を追加`}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
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
                                <div className="text-lg font-bold text-yellow-900 dark:text-yellow-100">
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
                              <div className="text-sm text-yellow-900 dark:text-yellow-100">
                                AIエージェントによる解析を実行中...
                              </div>
                            )}
                          </div>
                          {isCompleted && repoStatus.evaluation && (
                            <div className="text-2xl font-bold text-primary">
                              {repoStatus.evaluation.total_score}点
                            </div>
                          )}
                          <div className="flex gap-2">
                            {/* 失敗の場合は再実行ボタンを表示 */}
                            {!isCompleted && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRetryRepository(repoStatus.repository_name);
                                }}
                                title="再実行"
                              >
                                <RefreshCw className="w-4 h-4" />
                              </Button>
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
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRemoveRepository(repoStatus.repository_name);
                              }}
                              className="text-red-500 hover:text-red-700"
                              title="削除"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
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
                          <div className="text-lg font-bold text-yellow-900 dark:text-yellow-100">
                            評価中
                          </div>
                        </div>
                        <GitBranch className="w-4 h-4 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-medium text-lg">{repo}</div>
                          <div className="text-sm text-yellow-900 dark:text-yellow-100">
                            Claude Codeによる解析を実行中...
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetryRepository(repo);
                            }}
                            title="再実行"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              window.open(`https://github.com/${repo}`, "_blank")
                            }
                          >
                            <ExternalLink className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveRepository(repo);
                            }}
                            className="text-red-500 hover:text-red-700"
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
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
