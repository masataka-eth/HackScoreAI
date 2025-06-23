import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Vault操作用の関数
export const vaultOperations = {
  // キーを保存
  async storeKey(
    userId: string,
    keyType: "anthropic_key" | "github_token",
    keyValue: string
  ) {
    try {
      const { data, error } = await supabase.rpc("store_user_secret", {
        p_user_id: userId,
        p_secret_type: keyType,
        p_secret_name: "default",
        p_secret_value: keyValue,
      });

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Error storing key:", error);
      return { success: false, error };
    }
  },

  // キーを取得
  async getKey(userId: string, keyType: "anthropic_key" | "github_token") {
    try {
      const { data, error } = await supabase.rpc("get_user_secret", {
        p_user_id: userId,
        p_secret_type: keyType,
        p_secret_name: "default",
      });

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Error getting key:", error);
      return { success: false, error };
    }
  },

  // キーを削除（削除機能は未実装、必要に応じて追加）
  async deleteKey(userId: string, keyType: "anthropic_key" | "github_token") {
    try {
      // user_secretsテーブルから直接削除
      const { data, error } = await supabase
        .from("user_secrets")
        .delete()
        .eq("user_id", userId)
        .eq("secret_type", keyType)
        .eq("secret_name", "default");

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Error deleting key:", error);
      return { success: false, error };
    }
  },
};

// ハッカソン操作用の関数
export const hackathonOperations = {
  // ハッカソンを登録（Edge Functionのenqueueエンドポイントを使用）
  async createHackathon(hackathonData: {
    name: string;
    repositories: string[];
    userId: string;
  }) {
    try {
      // 認証状態を確認
      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession();

      if (authError || !session) {
        console.error("❌ Authentication error:", authError);
        throw new Error("認証が必要です。ログインしてください。");
      }

      console.log("🔐 Auth session exists:", !!session);

      const { data, error } = await supabase.functions.invoke("enqueue", {
        body: {
          repositories: hackathonData.repositories,
          userId: hackathonData.userId,
          evaluationCriteria: {
            hackathonName: hackathonData.name,
          },
        },
      });

      console.log("🔍 Edge Function response:", { data, error });

      if (error) throw error;

      // Edge Functionのレスポンスを正確にチェック
      if (data && data.success === true) {
        return { success: true, data: { ...data, id: data.hackathonId } };
      } else {
        // エラーの詳細を正確に伝える
        const errorMessage =
          data?.error || error?.message || "Unknown error occurred";
        if (
          errorMessage.includes("Auth session missing") ||
          errorMessage.includes("Invalid token")
        ) {
          throw new Error(
            "認証セッションが無効です。一度ログアウトして再度ログインしてください。"
          );
        }
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error("Error creating hackathon:", error);
      return { success: false, error };
    }
  },

  // ハッカソン一覧を取得
  async getHackathons(userId: string) {
    try {
      // hackathonsテーブルから直接取得
      const { data: hackathons, error: hackathonsError } = await supabase
        .from("hackathons")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (hackathonsError) throw hackathonsError;

      // 各ハッカソンをフロントエンド用の形式に変換
      const formattedHackathons =
        hackathons?.map((hackathon) => ({
          id: hackathon.id,
          name: hackathon.name,
          repositories: [], // リポジトリリストは詳細画面で取得
          status: hackathon.status,
          score: hackathon.average_score,
          rank: 1, // ランクは後で実装
          totalParticipants: 1, // 参加者数は後で実装
          createdAt: new Date(hackathon.created_at).toLocaleDateString(),
          totalRepositories: hackathon.total_repositories,
          completedRepositories: hackathon.completed_repositories,
        })) || [];

      return { success: true, data: formattedHackathons };
    } catch (error) {
      console.error("Error getting hackathons:", error);
      return { success: false, error };
    }
  },

  // ハッカソン詳細を取得
  async getHackathonDetails(hackathonId: string) {
    try {
      // ハッカソンの基本情報を取得
      const { data: hackathonData, error: hackathonError } = await supabase
        .from("hackathons")
        .select("*")
        .eq("id", hackathonId)
        .single();

      if (hackathonError) throw hackathonError;

      if (!hackathonData) {
        return { success: false, error: "ハッカソンが見つかりません" };
      }

      // 関連するジョブからリポジトリリストと状態を取得
      const { data: jobs, error: jobsError } = await supabase
        .from("job_status")
        .select("payload, status")
        .eq("hackathon_id", hackathonId);

      if (jobsError) console.warn("Error loading jobs:", jobsError);

      // すべてのリポジトリを重複なく取得し、job_statusと関連付け
      const allRepositories: string[] = [];
      const repositoryJobStatus: { [repo: string]: string } = {};
      
      jobs?.forEach((job) => {
        // 新しい構造（単一リポジトリ）と古い構造（複数リポジトリ）の両方に対応
        if (job.payload?.repository) {
          // 新しい構造: 単一のリポジトリ
          const repo = job.payload.repository;
          if (!allRepositories.includes(repo)) {
            allRepositories.push(repo);
          }
          repositoryJobStatus[repo] = job.status;
        } else if (job.payload?.repositories) {
          // 古い構造: 複数のリポジトリ（後方互換性）
          const repos = job.payload.repositories || [];
          repos.forEach((repo: string) => {
            if (!allRepositories.includes(repo)) {
              allRepositories.push(repo);
            }
            repositoryJobStatus[repo] = job.status;
          });
        }
      });

      // 関連する評価結果を取得
      const { data: evaluationResults, error: evalError } = await supabase
        .from("evaluation_results")
        .select(
          `
          id,
          repository_name,
          total_score,
          evaluation_data,
          processing_metadata,
          created_at,
          evaluation_items (
            item_id,
            name,
            score,
            max_score,
            positives,
            negatives
          )
        `
        )
        .eq("hackathon_id", hackathonId);

      if (evalError)
        console.warn("Error loading evaluation results:", evalError);

      // 評価結果がある場合の処理
      let results = null;
      let completedAt = null;

      if (evaluationResults && evaluationResults.length > 0) {
        completedAt = evaluationResults[0]?.created_at;

        // 評価結果のサマリーを作成
        const allPositives: string[] = [];
        const allNegatives: string[] = [];

        evaluationResults.forEach((result) => {
          if (result.evaluation_items) {
            result.evaluation_items.forEach((item: any) => {
              if (item.positives) allPositives.push(item.positives);
              if (item.negatives) allNegatives.push(item.negatives);
            });
          }
        });

        results = {
          overview: `${
            allRepositories.length
          }個のリポジトリを分析し、総合スコア${
            hackathonData.average_score || 0
          }点を獲得しました。`,
          strengths: allPositives.slice(0, 5), // 上位5つの強み
          improvements: allNegatives.slice(0, 5), // 上位5つの改善点
          repositoryScores: evaluationResults.map((result) => ({
            repository: result.repository_name,
            score: result.total_score,
            analysis:
              result.evaluation_data?.overallComment ||
              result.evaluation_data?.summary ||
              "分析結果が利用できません",
            evaluationId: result.id,
          })),
        };
      }

      // 実際のリポジトリ評価状況に基づいて正確なステータスを計算
      let actualStatus = hackathonData.status;
      
      if (allRepositories.length > 0) {
        const completedRepositoriesCount = evaluationResults?.length || 0;
        const totalRepositoriesCount = allRepositories.length;
        
        // job_statusで失敗したリポジトリの数をカウント
        const failedRepositoriesCount = allRepositories.filter(repo => 
          repositoryJobStatus[repo] === "failed"
        ).length;
        
        // job_statusで処理中のリポジトリの数をカウント
        const processingRepositoriesCount = allRepositories.filter(repo => 
          repositoryJobStatus[repo] === "pending" || repositoryJobStatus[repo] === "processing"
        ).length;
        
        if (completedRepositoriesCount === totalRepositoriesCount) {
          // 全てのリポジトリが評価完了している場合のみ完了
          actualStatus = "completed";
        } else if (processingRepositoriesCount > 0) {
          // pending または processing のリポジトリがある場合は分析中
          actualStatus = "analyzing";
        } else if (failedRepositoriesCount > 0 && completedRepositoriesCount === 0) {
          // 全て失敗で完了済みが0の場合は失敗
          actualStatus = "failed";
        } else {
          // 一部完了している場合は分析中
          actualStatus = "analyzing";
        }
        
        console.log(`📊 Status calculation: ${completedRepositoriesCount}/${totalRepositoriesCount} completed, ${failedRepositoriesCount} failed, ${processingRepositoriesCount} processing, status: ${actualStatus}`);
      }

      // 最終的なハッカソン詳細オブジェクト
      const hackathonDetails = {
        id: hackathonData.id,
        name: hackathonData.name,
        repositories: allRepositories,
        repositoryJobStatus, // job_statusの状態を追加
        status: actualStatus,
        score: hackathonData.average_score,
        rank: 1, // 今後ランキング機能を実装
        totalParticipants: 1, // 今後参加者数機能を実装
        createdAt: hackathonData.created_at,
        completedAt: actualStatus === "completed" ? completedAt : null, // 完了時のみcompletedAtを設定
        results,
      };

      return { success: true, data: hackathonDetails };
    } catch (error) {
      console.error("Error getting hackathon details:", error);
      return { success: false, error };
    }
  },

  // 手動でワーカー処理をトリガー
  async triggerWorkerProcessing() {
    try {
      const { data, error } = await supabase.functions.invoke("repo_worker", {
        body: {},
      });

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Error triggering worker:", error);
      return { success: false, error };
    }
  },

  // 評価詳細を取得
  async getEvaluationDetails(evaluationId: string) {
    try {
      const { data, error } = await supabase.rpc("get_evaluation_details", {
        p_evaluation_id: evaluationId,
      });

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Error getting evaluation details:", error);
      return { success: false, error };
    }
  },

  // 評価サマリーを取得
  async getEvaluationSummary(userId: string) {
    try {
      const { data, error } = await supabase.rpc("get_evaluation_summary", {
        p_user_id: userId,
      });

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error("Error getting evaluation summary:", error);
      return { success: false, error };
    }
  },

  // ハッカソンにリポジトリを追加
  async addRepositoryToHackathon(hackathonId: string, repositoryName: string) {
    try {
      console.log("🔄 Adding repository to hackathon:", {
        hackathonId,
        repositoryName,
      });

      // Check authentication status
      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession();
      console.log("🔐 Current session:", { session: !!session, authError });

      if (!session) {
        console.error("❌ No active session found");
        throw new Error("認証が必要です。ログインしてください。");
      }

      console.log("📞 Calling Edge Function add-repository...");

      // タイムアウト付きでEdge Functionを呼び出し
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Edge Function timeout (30s)")),
          30000
        )
      );

      const edgeFunctionPromise = supabase.functions.invoke("add-repository", {
        body: {
          hackathonId,
          repositoryName,
        },
      });

      const { data, error } = (await Promise.race([
        edgeFunctionPromise,
        timeoutPromise,
      ])) as any;

      console.log("📡 Edge Function response:", { data, error });

      if (error) {
        console.error("❌ Edge Function error:", error);
        throw error;
      }

      console.log("✅ Repository added successfully");
      return { success: true, data };
    } catch (error) {
      console.error("❌ Error adding repository to hackathon:", error);
      return { success: false, error };
    }
  },

  // ハッカソンからリポジトリを削除
  async removeRepositoryFromHackathon(
    hackathonId: string,
    repositoryName: string
  ) {
    try {
      console.log("🗑️ Removing repository from hackathon:", {
        hackathonId,
        repositoryName,
      });

      // Check authentication status
      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession();
      console.log("🔐 Current session:", { session: !!session, authError });

      if (!session) {
        console.error("❌ No active session found");
        throw new Error("認証が必要です。ログインしてください。");
      }

      const { data, error } = await supabase.functions.invoke(
        "remove-repository",
        {
          body: {
            hackathonId,
            repositoryName,
          },
        }
      );

      console.log("📡 Edge Function response:", { data, error });

      if (error) {
        console.error("❌ Edge Function error:", error);
        throw error;
      }

      return { success: true, data };
    } catch (error) {
      console.error("Error removing repository from hackathon:", error);
      return { success: false, error };
    }
  },

  // ハッカソンを削除
  async deleteHackathon(hackathonId: string) {
    try {
      console.log("🗑️ Deleting hackathon:", { hackathonId });

      // Check authentication status
      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession();
      console.log("🔐 Current session:", { session: !!session, authError });

      if (!session) {
        console.error("❌ No active session found");
        throw new Error("認証が必要です。ログインしてください。");
      }

      const { data, error } = await supabase.functions.invoke(
        "delete-hackathon",
        {
          body: {
            hackathonId,
          },
        }
      );

      console.log("📡 Edge Function response:", { data, error });

      if (error) {
        console.error("❌ Edge Function error:", error);
        throw error;
      }

      return { success: true, data };
    } catch (error) {
      console.error("Error deleting hackathon:", error);
      return { success: false, error };
    }
  },

  // 失敗したリポジトリを再実行
  async retryFailedRepository(hackathonId: string, repositoryName: string) {
    try {
      console.log("🔄 Retrying failed repository:", {
        hackathonId,
        repositoryName,
      });

      // Check authentication status
      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession();
      console.log("🔐 Current session:", { session: !!session, authError });

      if (!session) {
        console.error("❌ No active session found");
        throw new Error("認証が必要です。ログインしてください。");
      }

      const { data, error } = await supabase.functions.invoke(
        "retry-repository",
        {
          body: {
            hackathonId,
            repositoryName,
          },
        }
      );

      console.log("📡 Edge Function response:", { data, error });

      if (error) {
        console.error("❌ Edge Function error:", error);
        throw error;
      }

      return { success: true, data };
    } catch (error) {
      console.error("Error retrying repository:", error);
      return { success: false, error };
    }
  },
};
