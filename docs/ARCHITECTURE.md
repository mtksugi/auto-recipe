# アーキテクチャ

## 全体構成

```text
Cloudflare Access
  ↓
Cloudflare Worker
  ├─ Static Assets: web/
  ├─ Hono API: worker/
  ├─ Durable Object: ユーザー単位の保存直列化
  ├─ R2: ユーザー別レシピJSONと保存履歴
  └─ OpenAI Responses API
```

公開バックエンドはTypeScriptとし、Python Workersには依存しない。Pythonはローカルの一括変換や過去データの移行ツールに限定する。

## コンポーネント

### フロントエンド

`web/`のHTML、CSS、JavaScriptをCloudflare Workers Static Assetsで配信する。

小規模な個人用アプリであり、現時点ではフレームワークを導入しない。画面ロジックと純粋なドメインロジックは`web/js/`内で分離し、後者をVitestで検証する。

### Worker API

`worker/`にHonoを使ったAPIを置く。

- `POST /api/normalize`: URLまたはファイルをレシピJSONへ変換
- `POST /api/save`: 確認済みレシピをR2へ保存
- `GET /data/recipes.json`: レシピ一覧を返す

OpenAI APIキーはWorker Secretだけに保存し、ブラウザ、Git、R2には保存しない。

### R2

当面は単一ユーザー・JSON中心のため、データベースを導入せずR2を使用する。

```text
users/{access-sub}/data/recipes.json
users/{access-sub}/recipes/{recipe-id}.json
users/{access-sub}/history/{recipe-id}/{timestamp}.json
```

- `users/{access-sub}/data/recipes.json`: ユーザーごとの一覧・検索用レシピ
- `users/{access-sub}/recipes/`: ユーザーごとの各レシピ最新版
- `users/{access-sub}/history/`: ユーザーごとの保存時点スナップショット

`access-sub`はブラウザから受け取らず、WorkerがCloudflare Access JWTの署名、issuer、AUDを検証した後に`sub` claimから取得する。メールアドレスはR2キーに使わない。

保存処理は`access-sub`ごとのDurable Objectを経由し、同じユーザーによる複数端末からの保存を直列化する。

R2が空の場合は、デプロイに同梱した`web/data/recipes.json`を返す。初回保存時にこの一覧を基にR2の一覧を作る。

公開Repositoryに実レシピを含めないため、同梱データは架空サンプルだけとする。本人用データはR2を正本とする。

複雑な検索やユーザー横断の管理機能が必要になった時点でD1などのDBを再検討する。

## データの流れ

### 閲覧

```text
ブラウザ → Worker → R2の一覧JSON → ブラウザ内で検索・表示・人数換算
```

閲覧時にはOpenAIを呼ばない。

### 登録

```text
URLまたはファイル
  → Worker
  → OpenAI Responses API
  → 編集可能な候補JSON
  → ユーザーが確認
  → Worker
  → R2へ確定保存
```

## セキュリティ

- アプリ全体をCloudflare Accessで保護する
- 本人のメールアドレスだけをAllowする
- WorkerでもAccess JWTの署名、issuer、AUDを検証する
- R2キーはAccess JWTの`sub`でユーザー分離する
- `OPENAI_API_KEY`はWorker Secretで管理する
- GitHub Actionsのデプロイ資格情報はGitHub Secretsで管理する
- `workers.dev`を使う場合も、公開前にWorker自体をAccessの対象にする

登録APIを認証なしで公開すると第三者がOpenAI APIを利用できるため、試験URLであってもAccessを先に設定する。

## 現在の制約

- ファイル入力はBase64処理の負荷を考慮し15MBまで
- 長い変換処理はブラウザ切断の影響を受ける可能性がある
- 手順内分量の人数連動は今後の改善項目
