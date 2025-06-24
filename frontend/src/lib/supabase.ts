// Supabaseクライアントライブラリをインポート
import { createClient } from "@supabase/supabase-js";

// 環境変数からSupabaseの接続情報を取得
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Supabaseクライアントインスタンスを作成・エクスポート
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Vault操作用の関数群
 * ユーザーの機密情報（APIキー等）をSupabase Vaultで暗号化して安全に保存・取得
 */
export const vaultOperations = {
  /**
   * APIキーをVaultに保存
   * @param userId ユーザーID
   * @param keyType キーの種類（Anthropic API キーまたはGitHub Token）
   * @param keyValue 保存するキーの値
   * @returns 保存結果
   */
  async storeKey(
    userId: string,
    keyType: "anthropic_key" | "github_token",
    keyValue: string
  ) {
    try {
      // Supabase RPC関数を呼び出してキーを暗号化保存
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

  /**
   * Vaultからキーを取得
   * @param userId ユーザーID
   * @param keyType キーの種類（Anthropic API キーまたはGitHub Token）
   * @returns 取得結果
   */
  async getKey(userId: string, keyType: "anthropic_key" | "github_token") {
    try {
      // Supabase RPC関数を呼び出してキーを復号化取得
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

  /**
   * Vaultからキーを削除
   * @param userId ユーザーID
   * @param keyType キーの種類（Anthropic API キーまたはGitHub Token）
   * @returns 削除結果
   */
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

/**
 * ハッカソン操作用の関数群
 * ハッカソンの作成、取得、削除等の管理機能を提供
 */
export const hackathonOperations = {
  /**
   * 新しいハッカソンを作成して評価キューに投入
   * @param hackathonData ハッカソン情報（名前、リポジトリリスト、ユーザーID）
   * @returns 作成結果
   */
  async createHackathon(hackathonData: {
    name: string;
    repositories: string[];
    userId: string;
  }) {
    try {
      // 認証状態を確認（セッションが有効かチェック）
      const {
        data: { session },
        error: authError,
      } = await supabase.auth.getSession();

      if (authError || !session) {
        console.error("❌ Authentication error:", authError);
        throw new Error("認証が必要です。ログインしてください。");
      }

      console.log("🔐 Auth session exists:", !!session);

      // Supabase Edge Function「enqueue」を呼び出してハッカソン作成とジョブキューへの投入を実行
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

  /**
   * ハッカソン一覧を取得
   * 指定されたユーザーが作成したハッカソンの一覧を取得し、基本情報をフロントエンド表示用にフォーマットして返す
   * @param userId - 取得対象のユーザーID
   * @returns ハッカソン一覧（ID、名前、ステータス、スコア、作成日等）
   */
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

  /**
   * ハッカソン詳細を取得
   * 指定されたハッカソンの詳細情報（リポジトリリスト、評価結果、実行状況等）を取得
   * @param hackathonId - 取得対象のハッカソンID
   * @returns ハッカソン詳細情報（基本情報、リポジトリ状況、評価結果等）
   */
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

  /**
   * ワーカー処理手動実行
   * キューに蓄積されたジョブを手動で処理するためにrepo_worker Edge Functionを呼び出す
   * @returns 処理実行結果
   */
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

  /**
   * 評価詳細取得
   * 指定された評価IDの詳細情報（スコア、評価項目、コメント等）をRPC関数経由で取得
   * @param evaluationId - 取得対象の評価ID
   * @returns 評価詳細情報（項目別スコア、ポジティブ・ネガティブ要素等）
   */
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

  /**
   * 評価サマリー取得
   * 指定されたユーザーの全評価結果の統計情報をRPC関数経由で取得
   * @param userId - 取得対象のユーザーID
   * @returns 評価サマリー（総合スコア、評価数、平均値等の統計情報）
   */
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

  /**
   * リポジトリ追加
   * 既存のハッカソンに新しいリポジトリを追加し、評価キューに投入する
   * @param hackathonId - 追加先のハッカソンID
   * @param repositoryName - 追加するリポジトリ名（例: "owner/repo"）
   * @returns 追加処理結果
   */
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

  /**
   * リポジトリ削除
   * ハッカソンから指定されたリポジトリとその評価結果を削除する
   * @param hackathonId - 削除元のハッカソンID
   * @param repositoryName - 削除するリポジトリ名（例: "owner/repo"）
   * @returns 削除処理結果
   */
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

  /**
   * ハッカソン削除
   * 指定されたハッカソンとその関連データ（評価結果、ジョブ等）を完全に削除する
   * @param hackathonId - 削除対象のハッカソンID
   * @returns 削除処理結果
   */
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

  /**
   * 失敗リポジトリ再実行
   * 評価に失敗したリポジトリを再度評価キューに投入して処理を再実行する
   * @param hackathonId - 対象のハッカソンID
   * @param repositoryName - 再実行するリポジトリ名（例: "owner/repo"）
   * @returns 再実行処理結果
   */
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

  /**
   * APIコスト合計取得
   * 指定されたユーザーの全評価処理で消費されたAPIコスト（USD）の合計金額を計算
   * @param userId - 取得対象のユーザーID
   * @returns 総APIコスト（USD建て）
   */
  async getTotalApiCost(userId: string) {
    try {
      // evaluation_resultsテーブルから該当ユーザーの全てのコストを取得
      const { data, error } = await supabase
        .from("evaluation_results")
        .select("processing_metadata")
        .eq("user_id", userId);

      if (error) throw error;

      // 合計コストを計算
      let totalCost = 0;
      if (data) {
        data.forEach((result) => {
          if (result.processing_metadata?.totalCostUsd) {
            totalCost += result.processing_metadata.totalCostUsd;
          }
        });
      }

      return { success: true, data: totalCost };
    } catch (error) {
      console.error("Error getting total API cost:", error);
      return { success: false, error };
    }
  },
};
