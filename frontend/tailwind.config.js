/**
 * Tailwind CSS 設定ファイル
 * 
 * 【役割と目的】
 * - HackScoreAI の UI デザインシステムを定義
 * - shadcn/ui コンポーネントライブラリとの統合設定
 * - CSS Variables を使用したテーマシステムの構築
 * - レスポンシブデザインとアクセシビリティの基盤提供
 * 
 * 【主要設定の説明】
 * 1. content: Tailwind が CSS を生成する対象ファイルの指定
 * 2. theme.extend: デフォルトテーマの拡張（既存クラスは維持）
 * 3. colors: CSS Variables ベースのカラーシステム（ダークモード対応）
 * 4. typography: Inter フォントを優先したフォントスタック
 * 5. animations: アコーディオンなどのマイクロインタラクション
 * 
 * 【shadcn/ui との連携】
 * - CSS Variables（--background, --primary など）でテーマを管理
 * - HSL カラーフォーマットでより柔軟な色彩制御
 * - コンポーネント単位での一貫したデザイン言語
 * 
 * 【カスタマイズポイント】
 * - globals.css で CSS Variables の値を変更してテーマ調整
 * - borderRadius の --radius 変数でコンポーネントの角丸を統一制御
 * - fontFamily で プロジェクト専用フォントの追加が可能
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  // Tailwind CSS が監視・処理する対象ファイルの指定
  // Next.js 13 App Router の src/ 構造に対応
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',      // Pages Router（互換性のため）
    './src/components/**/*.{js,ts,jsx,tsx,mdx}', // 共通コンポーネント
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',        // App Router のページ・レイアウト
  ],
  theme: {
    extend: {
      // shadcn/ui 準拠のカラーシステム
      // CSS Variables を使用してライト・ダークテーマを動的切り替え
      colors: {
        // 基本色（背景・文字色）
        background: 'hsl(var(--background))',     // メイン背景色
        foreground: 'hsl(var(--foreground))',     // メイン文字色
        
        // カードコンポーネント用
        card: {
          DEFAULT: 'hsl(var(--card))',            // カード背景
          foreground: 'hsl(var(--card-foreground))', // カード内文字色
        },
        
        // ポップオーバー・ドロップダウン用
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        
        // プライマリアクション用（ボタン・リンクなど）
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        
        // セカンダリアクション用
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        
        // 控えめな表示用（ヘルプテキストなど）
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        
        // アクセント色（強調表示用）
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        
        // 危険・削除アクション用
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        
        // UI要素用
        border: 'hsl(var(--border))',             // ボーダー色
        input: 'hsl(var(--input))',               // インput背景色
        ring: 'hsl(var(--ring))',                 // フォーカスリング色
      },
      
      // CSS Variables による動的な角丸制御
      // --radius 変数を変更するだけで全コンポーネントの角丸を調整可能
      borderRadius: {
        lg: 'var(--radius)',                      // 大きい角丸
        md: 'calc(var(--radius) - 2px)',          // 中程度の角丸
        sm: 'calc(var(--radius) - 4px)',          // 小さい角丸
      },
      
      // フォントファミリーの設定
      // Inter フォントを最優先、フォールバック付き
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui'],
      },
      
      // アニメーション用のキーフレーム定義
      // Radix UI のアコーディオンコンポーネント用
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      
      // 実際のアニメーション定義
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  
  // プラグインは現在未使用
  // 必要に応じて @tailwindcss/forms、@tailwindcss/typography などを追加可能
  plugins: [],
}