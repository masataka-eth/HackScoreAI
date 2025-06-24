/**
 * PostCSS 設定ファイル
 * 
 * 【役割と目的】
 * - CSS の後処理（Post-Processing）を定義
 * - Tailwind CSS の変換とブラウザ互換性の確保
 * - Next.js のビルドプロセスに組み込まれる重要な設定
 * 
 * 【プラグインの説明】
 * 1. tailwindcss: Tailwind CSS のユーティリティクラスを実際の CSS に変換
 * 2. autoprefixer: ブラウザ別のベンダープレフィックスを自動付与
 * 
 * 【処理フロー】
 * 1. Tailwind CSS が設定ファイルに基づいてユーティリティ CSS を生成
 * 2. Autoprefixer が対象ブラウザに応じたプレフィックスを追加
 * 3. Next.js が最適化・圧縮して最終的な CSS を出力
 * 
 * 【ブラウザサポート】
 * - Autoprefixer は package.json の browserslist 設定または
 * - .browserslistrc ファイルの設定に基づいて動作
 * - デフォルトでは主要モダンブラウザをサポート
 * 
 * 【開発・本番での動作】
 * - 開発時: Fast Refresh での CSS の即座反映
 * - 本番時: 未使用 CSS の削除（purge）と圧縮を実行
 * - 両環境で同じ PostCSS 設定が適用される
 */
module.exports = {
  plugins: {
    // Tailwind CSS: ユーティリティファーストの CSS フレームワーク
    // tailwind.config.js の設定に基づいて CSS を生成
    tailwindcss: {},
    
    // Autoprefixer: ブラウザ互換性のためのベンダープレフィックス自動付与
    // 例: display: flex → display: -webkit-box; display: -ms-flexbox; display: flex;
    autoprefixer: {},
  },
};