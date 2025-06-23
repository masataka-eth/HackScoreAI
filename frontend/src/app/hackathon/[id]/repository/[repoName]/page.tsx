"use client";

import { useAuth } from "@/app/providers";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Download,
  Star,
  AlertTriangle,
  GitBranch,
  Calendar,
  Trophy,
  Target,
} from "lucide-react";
import { OctocatCharacter } from "@/components/octocat-character";
import { BinaryBackground } from "@/components/binary-background";

interface EvaluationItem {
  id: string;
  name: string;
  score: number;
  max_score?: number;
  positives: string;
  negatives: string;
}

interface EvaluationDetails {
  totalScore: number;
  items: EvaluationItem[];
  overallComment: string;
}

interface RepositoryEvaluation {
  id: string;
  repository_name: string;
  total_score: number;
  evaluation_data: EvaluationDetails;
  created_at: string;
}

export default function RepositoryEvaluationDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const [evaluation, setEvaluation] = useState<RepositoryEvaluation | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(true);

  const evaluationId = searchParams.get("evaluationId");
  const repoName = decodeURIComponent(params.repoName as string);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const loadEvaluationDetails = async () => {
      if (!evaluationId || !user) {
        console.log("Missing evaluationId or user:", {
          evaluationId,
          user: !!user,
        });
        setIsLoading(false);
        return;
      }

      console.log("Loading evaluation details for:", evaluationId);

      try {
        const { supabase } = await import("@/lib/supabase");

        // evaluation_resultsテーブルから直接データを取得
        const { data: evalResult, error: evalError } = await supabase
          .from("evaluation_results")
          .select(
            "id, repository_name, total_score, evaluation_data, created_at"
          )
          .eq("id", evaluationId)
          .single();

        console.log("Evaluation result:", { evalResult, evalError });

        if (evalError) {
          console.error("Evaluation query error:", evalError);
          setIsLoading(false);
          return;
        }

        if (!evalResult) {
          console.log("No evaluation result found");
          setIsLoading(false);
          return;
        }

        // evaluation_itemsテーブルから関連データを取得
        const { data: evalItems, error: itemsError } = await supabase
          .from("evaluation_items")
          .select("item_id, name, score, max_score, positives, negatives")
          .eq("evaluation_result_id", evaluationId)
          .order("item_id");

        console.log("Evaluation items:", { evalItems, itemsError });

        // データを構築
        const items: EvaluationItem[] =
          evalItems?.map((item: any) => ({
            id: item.item_id,
            name: item.name,
            score: item.score,
            // max_score: item.max_score || 5, // デフォルト5点満点
            max_score: 5, // 固定で5点満点
            positives: item.positives || "",
            negatives: item.negatives || "",
          })) || [];

        // evaluation_dataから項目データを取得（フォールバック）
        let finalItems = items;
        if (items.length === 0 && evalResult.evaluation_data?.items) {
          finalItems = evalResult.evaluation_data.items.map((item: any) => ({
            id: item.id || item.item_id || "",
            name: item.name || "",
            score: item.score || 0,
            // max_score: item.max_score || 5, // デフォルト5点満点
            max_score: 5, // 固定で5点満点
            positives: item.positives || "",
            negatives: item.negatives || "",
          }));
        }

        console.log("Final items:", finalItems);

        setEvaluation({
          id: evalResult.id,
          repository_name: evalResult.repository_name,
          total_score: evalResult.total_score,
          evaluation_data: {
            totalScore: evalResult.total_score,
            items: finalItems,
            overallComment:
              evalResult.evaluation_data?.overallComment ||
              "総合コメントが見つかりません",
          },
          created_at: evalResult.created_at,
        });
      } catch (error) {
        console.error("Error loading evaluation details:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadEvaluationDetails();
  }, [evaluationId, user]);

  const generateMarkdownReport = () => {
    if (!evaluation) return;

    const { evaluation_data, repository_name, total_score, created_at } =
      evaluation;

    const markdown = `# ${repository_name} - 評価レポート

## 📊 評価概要

- **リポジトリ**: ${repository_name}
- **総合スコア**: ${total_score}/20
- **評価日**: ${new Date(created_at).toLocaleString()}

## 📋 項目別評価

${evaluation_data.items
  .map(
    (item) => `### ${item.name} - ${item.score} / 5点

#### ✨ 良かった点
${item.positives || "コメントなし"}

#### 🔧 改善点  
${item.negatives || "コメントなし"}

`
  )
  .join("")}

## 💬 総合コメント

${evaluation_data.overallComment}

---

*このレポートはHackScoreAIにより自動生成されました*
`;

    // マークダウンファイルをダウンロード
    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${repository_name.replace("/", "_")}_evaluation_report.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  if (!user || !evaluation) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-muted-foreground">評価結果が見つかりません</div>
          <div className="text-sm text-muted-foreground space-y-2">
            <div>リポジトリ: {repoName}</div>
            <div>評価ID: {evaluationId}</div>
            <div>ユーザー: {user ? "ログイン済み" : "未ログイン"}</div>
          </div>
          <div className="text-xs text-muted-foreground max-w-md">
            この評価結果は存在しないか、まだ処理が完了していない可能性があります。
            ハッカソンが完了するまでお待ちください。
          </div>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => router.back()}>戻る</Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              再読み込み
            </Button>
          </div>
        </div>
      </div>
    );
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
              <div className="w-8 h-8">
                <OctocatCharacter />
              </div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-foreground">
                  {evaluation.repository_name}
                </h1>
                <div className="text-sm text-muted-foreground">
                  評価レポート
                </div>
              </div>
            </div>
            <Button onClick={generateMarkdownReport} className="ml-auto">
              <Download className="w-4 h-4 mr-2" />
              レポートダウンロード
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl relative z-10">
        <div className="space-y-6">
          {/* 総合評価カード */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-6 h-6 text-primary" />
                総合評価
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-4xl font-bold text-primary">
                    {evaluation.evaluation_data.totalScore}
                  </div>
                  <div className="text-sm text-muted-foreground">/ 20点</div>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    評価日:{" "}
                    {new Date(evaluation.created_at).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <GitBranch className="w-4 h-4" />
                    {evaluation.repository_name}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 項目別評価 */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                項目別評価
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {evaluation.evaluation_data.items.map((item, index) => (
                <div
                  key={item.id}
                  className="border border-border rounded-lg p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold">{item.name}</h3>
                    <div className="text-2xl font-bold text-primary">
                      {item.score} / {item.max_score || 5}点
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {item.positives && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-green-700 dark:text-green-300 flex items-center gap-2">
                          <Star className="w-4 h-4" />
                          良かった点
                        </h4>
                        <p className="text-sm text-green-600 dark:text-green-400 leading-relaxed">
                          {item.positives}
                        </p>
                      </div>
                    )}

                    {item.negatives && (
                      <div className="space-y-2">
                        <h4 className="font-medium text-orange-700 dark:text-orange-300 flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4" />
                          改善点
                        </h4>
                        <p className="text-sm text-orange-600 dark:text-orange-400 leading-relaxed">
                          {item.negatives}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* 総合コメント */}
          <Card>
            <CardHeader>
              <CardTitle>総合コメント</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                {evaluation.evaluation_data.overallComment}
              </p>
            </CardContent>
          </Card>

          {/* アクション */}
          <div className="flex gap-4 justify-center">
            <Button
              variant="outline"
              onClick={() =>
                window.open(
                  `https://github.com/${evaluation.repository_name}`,
                  "_blank"
                )
              }
            >
              <GitBranch className="w-4 h-4 mr-2" />
              GitHubで見る
            </Button>

            <Button onClick={generateMarkdownReport}>
              <Download className="w-4 h-4 mr-2" />
              レポートダウンロード
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
