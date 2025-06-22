"use client";

import { useAuth } from "@/app/providers";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Github,
  Brain,
  Trophy,
  Code2,
  BarChart3,
  Sparkles,
} from "lucide-react";
import { OctocatCharacter } from "@/components/octocat-character";
import { BinaryBackground } from "@/components/binary-background";

export default function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.push("/dashboard");
    }
  }, [user, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const features = [
    {
      icon: <Brain className="w-6 h-6" />,
      title: "AI自動解析",
      description: "最先端のAIがコードを深く理解し、品質を多角的に評価",
    },
    {
      icon: <Code2 className="w-6 h-6" />,
      title: "コード品質評価",
      description: "可読性、保守性、パフォーマンスなど多面的な指標で評価",
    },
    {
      icon: <Trophy className="w-6 h-6" />,
      title: "スコアリング",
      description: "ハッカソン特化の評価基準でプロジェクトをランク付け",
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: "詳細レポート",
      description: "改善点や強みを可視化し、次のステップを明確に提示",
    },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* 動く数字の背景 */}
      <BinaryBackground />

      <div className="relative z-10 min-h-screen flex flex-col">
        {/* ヒーローセクション */}
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="max-w-6xl w-full mx-auto">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* 左側：メインコンテンツ */}
              <div className="text-center lg:text-left space-y-8">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium">
                    <Sparkles className="w-4 h-4" />
                    AI-Powered Code Analysis
                  </div>

                  <h1 className="text-5xl lg:text-7xl font-bold text-foreground">
                    HackScore
                    <span className="text-primary"> AI</span>
                  </h1>

                  <p className="text-xl lg:text-2xl text-muted-foreground max-w-xl">
                    Githubリポジトリから
                    <br />
                    <span className="text-foreground font-semibold">
                      AIエージェントが即座に分析
                    </span>
                    して
                    <br />
                    価値あるフィードバックを提供
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                  <Button
                    onClick={signIn}
                    className="flex items-center justify-center gap-2 text-lg px-8 py-6"
                    size="lg"
                  >
                    <Github className="w-6 h-6" />
                    GitHubでログイン
                  </Button>
                  {/* <Button
                    variant="outline"
                    className="text-lg px-8 py-6"
                    size="lg"
                    disabled
                  >
                    <Zap className="w-6 h-6 mr-2" />
                    デモを見る
                  </Button> */}
                </div>
              </div>

              {/* 右側：キャラクター */}
              <div className="flex justify-center lg:justify-end">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-[100px] rounded-full"></div>
                  <OctocatCharacter size="128" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 機能セクション */}
        <div className="py-20 px-4 bg-black/50 backdrop-blur-sm border-t border-border/50">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-3xl lg:text-4xl font-bold text-foreground mb-4">
                強力な機能で開発を加速
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                AIの力で、あなたのコードの可能性を最大限に引き出します
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="group relative bg-card/50 backdrop-blur-sm border border-border/50 rounded-xl p-6 hover:bg-card/80 hover:border-primary/50 transition-all duration-300"
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 rounded-xl transition-opacity duration-300"></div>

                  <div className="relative space-y-4">
                    <div className="inline-flex p-3 bg-primary/10 text-primary rounded-lg group-hover:bg-primary/20 transition-colors">
                      {feature.icon}
                    </div>

                    <h3 className="text-lg font-semibold text-foreground">
                      {feature.title}
                    </h3>

                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* フッター */}
        <footer className="py-8 px-4 border-t border-border/50">
          <div className="max-w-6xl mx-auto text-center text-sm text-muted-foreground">
            <p>© 2024 HackScore AI. Built with ❤️ for developers.</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
