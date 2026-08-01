# auto-recipe

気に入った料理を統一形式で保存し、材料やカテゴリから探して、人数に合わせた分量を見ながら料理するための個人用レシピアプリ。

現在はMVPの主要機能が動作しており、Cloudflare上で継続運用する段階にある。

## できること

- URL・PDF・画像・テキストからレシピ候補を生成する
- 生成結果を確認・修正して保存する
- タイトル、カテゴリ、主要材料から検索する
- 人数に合わせて材料の分量を換算する
- スマートフォンで料理中に閲覧する

## 技術構成

- フロントエンド: HTML、CSS、JavaScript
- API: Cloudflare Workers、TypeScript、Hono
- 保存先: Cloudflare R2
- レシピ変換: OpenAI Responses API
- CI/CD: GitHub Actions

詳細は[アーキテクチャ](docs/ARCHITECTURE.md)を参照する。

## ローカル開発

必要なものはNode.js 22.13以上、pnpm、`tools/.env`の`OPENAI_API_KEY`。

```bash
pnpm install
pnpm dev
```

- ビューア: <http://localhost:8787/>
- 登録画面: <http://localhost:8787/admin.html>

すべての型チェックとテストを実行する。

```bash
pnpm check
```

## ドキュメント

- [プロダクト方針](docs/PRODUCT.md)
- [アーキテクチャ](docs/ARCHITECTURE.md)
- [開発ロードマップ](docs/ROADMAP.md)
- [公開・運用手順](docs/DEPLOYMENT.md)
- [MVPまでの検証記録](docs/history/README.md)

## 主なディレクトリ

```text
web/                 静的フロントエンド
worker/              Cloudflare Worker API
tests/               フロントエンド・Workerの自動テスト
tools/               ローカル変換・データ移行ツール
schemas/             レシピJSON Schema
prompts/             レシピ変換プロンプト
docs/                 現行仕様と運用資料
docs/history/         MVPまでの検証記録
```
