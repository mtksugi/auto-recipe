# 公開・運用手順

## 方針

- GitHub Repositoryをコードの正本とする
- Pull Requestでは型チェックとテストだけを行う
- mainへのpushでは、テスト成功後にCloudflareへデプロイする
- 最初は無料の`workers.dev` URLを利用する
- 独自ドメインは必要になってから追加する

## 1. Cloudflareの初回準備

R2バケットとOpenAI Secretは初回だけ作成する。

```bash
pnpm exec wrangler login
pnpm exec wrangler r2 bucket create auto-recipe
pnpm exec wrangler secret put OPENAI_API_KEY
```

`OPENAI_API_KEY`はGitHub Actionsに渡さない。Worker側へ登録済みのSecretは、通常の再デプロイでも維持される。

## 2. workers.devでの試験公開

独自ドメインがなくても、Cloudflareが割り当てる`*.workers.dev`で公開できる。

このアプリはOpenAIを呼ぶ登録APIを含むため、次の順番を守る。

1. Cloudflare Zero TrustのAccess controlsからSelf-hosted applicationを作る
2. DestinationにWorker `auto-recipe`を指定する
3. PolicyをAllow、自分のメールアドレスだけを対象にする
4. `wrangler.jsonc`の`workers_dev`を`true`へ変更する
5. デプロイし、未認証ブラウザでAccess画面になることを確認する
6. 認証後、閲覧・URL変換・保存を確認する

AccessはWorker自体を対象にできるため、独自ドメインは必須ではない。

## 3. GitHub Repository

GitHub Projectボードは不要で、通常のRepositoryを1つ作ればよい。

公開Repositoryでは、次の実データをGit管理しない。

- `original-sample-data/`
- `phase2-output/recipes/`
- APIキーを含む`.env`

`web/data/recipes.json`には、画面確認用の架空サンプルだけを置く。本人用の実レシピはR2に保存する。

GitHub CLIを使う場合は、認証後に次のように作成できる。

```bash
gh auth login -h github.com
gh repo create auto-recipe --public --source=. --remote=origin --push
```

## 4. GitHub Actions Secrets

RepositoryのSettings → Secrets and variables → Actionsに次を登録する。

- `CLOUDFLARE_ACCOUNT_ID`: 対象CloudflareアカウントのID
- `CLOUDFLARE_API_TOKEN`: 対象アカウントに限定したWorkersデプロイ用API Token

続いてRepository variableを登録する。

- `CLOUDFLARE_DEPLOY_ENABLED`: `true`

API TokenそのものをGitへ保存しない。

この変数を登録するまでは、mainへpushしても検証だけが動き、デプロイは安全にスキップされる。

## 5. 自動デプロイ

`.github/workflows/ci.yml`が次を行う。

- Pull Request: install → typecheck → test
- mainへのpush: install → typecheck → test → `wrangler deploy`
- 手動実行: 同じ検証後にデプロイ

デプロイの二重実行を避けるため、同時に動かす本番デプロイは1つに制限する。

## 6. 独自ドメインへの移行

日常利用を続ける段階で、Cloudflare管理下のサブドメインをWorkerへ割り当てる。AccessのAllow Policyはそのまま利用できる。

独自ドメインは本番運用では推奨されるが、MVPの試験利用には必須ではない。
