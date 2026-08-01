# アーキテクチャ

## 全体構成

```text
Cloudflare Access
  ↓
Cloudflare Worker
  ├─ Static Assets: web/
  ├─ Hono API: worker/
  ├─ R2: レシピJSONと保存履歴
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
data/recipes.json
recipes/{recipe-id}.json
history/{recipe-id}/{timestamp}.json
```

- `data/recipes.json`: 一覧・検索用の全レシピ
- `recipes/`: 各レシピの最新版
- `history/`: 保存時点のスナップショット

R2が空の場合は、デプロイに同梱した`web/data/recipes.json`を返す。初回保存時にこの一覧を基にR2の一覧を作る。

公開Repositoryに実レシピを含めないため、同梱データは架空サンプルだけとする。本人用データはR2を正本とする。

複数ユーザー、同時更新、複雑な検索が必要になった時点でD1などのDBを再検討する。

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
- `OPENAI_API_KEY`はWorker Secretで管理する
- GitHub Actionsのデプロイ資格情報はGitHub Secretsで管理する
- `workers.dev`を使う場合も、公開前にWorker自体をAccessの対象にする

登録APIを認証なしで公開すると第三者がOpenAI APIを利用できるため、試験URLであってもAccessを先に設定する。

## 現在の制約

- 単一ユーザーを前提とし、同時更新の排他制御は行わない
- ファイル入力はBase64処理の負荷を考慮し15MBまで
- 長い変換処理はブラウザ切断の影響を受ける可能性がある
- 手順内分量の人数連動は今後の改善項目
