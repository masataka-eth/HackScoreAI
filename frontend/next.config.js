/**
 * Next.js 設定ファイル
 * 
 * 【役割と目的】
 * - Next.js アプリケーションのビルド・実行時の動作を制御
 * - HackScoreAI フロントエンドの Next.js 13 (App Router) 設定
 * - Vercel へのデプロイ時にも適用される設定
 * 
 * 【現在の設定】
 * - 基本構成: デフォルト設定を使用（カスタマイズなし）
 * - App Router: Next.js 13+ の新しいルーティングシステムを使用
 * - 自動最適化: Next.js の標準最適化機能を全て有効化
 * 
 * 【開発・本番での動作】
 * - 開発時: `next dev` で Hot Reload、Fast Refresh が有効
 * - 本番時: `next build` で静的最適化、コード分割、圧縮を実行
 * - Vercel: 自動で Edge Functions、ISR などの最適化を適用
 * 
 * 【必要に応じて追加する設定例】
 * - experimental: 実験的機能の有効化
 * - images: 外部画像ドメインの許可
 * - env: 環境変数の設定
 * - redirects/rewrites: URL リダイレクト・リライト設定
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  /* 
   * 現在は基本設定のみ使用
   * プロジェクトの要件に応じて以下のような設定を追加可能：
   * - GitHub API や Supabase との連携用の外部ドメイン設定
   * - 認証コールバック用の rewrites 設定
   * - パフォーマンス最適化のための experimental features
   */
};

module.exports = nextConfig;
