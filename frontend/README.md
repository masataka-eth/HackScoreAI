# HackScore AI Frontend

エンジニア・ハッカー向けの GitHub リポジトリ自動評価プラットフォームのフロントエンド

## 🚀 技術スタック

- **フレームワーク**: Next.js 13 (App Router)
- **UI ライブラリ**: shadcn/ui + Tailwind CSS
- **認証**: NextAuth.js (GitHub OAuth)
- **言語**: TypeScript
- **ホスティング**: Vercel

## 📁 プロジェクト構成

```
frontend/
├── src/
│   ├── app/                    # App Router ページ
│   │   ├── api/auth/          # NextAuth.js API routes
│   │   ├── dashboard/         # ダッシュボード
│   │   ├── hackathon/         # ハッカソン管理
│   │   ├── login/             # ログイン画面
│   │   └── settings/          # 設定画面
│   ├── components/            # 再利用可能コンポーネント
│   │   └── ui/               # shadcn/ui コンポーネント
│   └── lib/                   # ユーティリティ・設定
├── public/                    # 静的ファイル
└── package.json              # 依存関係・スクリプト
```

## 🛠️ セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.local` ファイルを作成し、以下の変数を設定してください：

```bash
# NextAuth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here

# GitHub OAuth (https://github.com/settings/developers)
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Backend API (Supabase)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. GitHub OAuth アプリの設定

1. [GitHub Developer Settings](https://github.com/settings/developers) にアクセス
2. "New OAuth App" をクリック
3. 以下の設定で作成：
   - **Application name**: HackScore AI
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
4. 作成後、Client ID と Client Secret を環境変数に設定

### 4. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで `http://localhost:3000` にアクセスしてください。

## 🎨 デザインシステム

### カラーパレット

- **Primary**: `#00ffaa` (ハッカー風の緑)
- **Background**: `#0a0a0a` (濃い黒)
- **Card**: `#161616` (ダークグレー)
- **Border**: `#262626` (グレー)

### マスコットキャラクター

- **8bit Octocat**: SVGベースの8bit風Octocatキャラクター
- **アニメーション**: 瞬き、コード文字の流れ、アクティビティインジケーター

## 📱 主要機能

### 1. 認証システム
- GitHub OAuth によるログイン
- セッション管理
- 自動リダイレクト

### 2. ダッシュボード
- ハッカソン履歴の表示
- 評価状況の確認
- スコア・順位の表示

### 3. ハッカソン登録
- GitHub 組織検索
- リポジトリ複数選択
- 評価実行の開始

### 4. 設定管理
- Anthropic API キーの安全な保存
- GitHub Personal Access Token の管理
- Supabase Vault 統合

### 5. 評価結果表示
- 総合スコア・順位
- リポジトリ別詳細分析
- 強み・改善点の可視化

## 🔗 バックエンド統合

フロントエンドは以下のバックエンド API と統合されています：

- **Supabase Edge Functions**: ジョブ投入・状態管理
- **Supabase Vault**: 機密情報の暗号化保存
- **Cloud Run Worker**: Claude Code による解析実行
- **GitHub API**: リポジトリ情報取得

## 🚀 本番デプロイ

### Vercel へのデプロイ

1. [Vercel](https://vercel.com) にログイン
2. GitHub リポジトリを連携
3. 環境変数を設定：
   - `NEXTAUTH_URL`: 本番URL
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. デプロイ実行

### GitHub OAuth の本番設定

1. GitHub OAuth アプリの設定を更新
2. **Homepage URL**: 本番URL
3. **Authorization callback URL**: `https://your-domain.com/api/auth/callback/github`

## 🧪 開発・テスト

### ビルドテスト

```bash
npm run build
```

### Lint チェック

```bash
npm run lint
```

### 本番プレビュー

```bash
npm run start
```

## 📄 ライセンス

このプロジェクトは MIT ライセンスの下でライセンスされています。

## 🤝 コントリビューション

バグ報告や機能要求は GitHub Issues にお願いします。
