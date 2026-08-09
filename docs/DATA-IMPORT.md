# 既存レシピの一括移行

PDF、画像、TXTで保存された既存レシピは、再開可能なローカル処理でJSONへ変換し、既存のR2データを残したまま追加できる。

## 処理の流れ

1. `tools/import_cooking.py` が入力フォルダを走査し、OpenAI Responses APIで1資料ずつ正規化する
2. Web検索結果またはTXT内のURLから元ページを特定する
3. 複数レシピを含む既知の資料は `tools/split_cooking_import.py` で個別JSONへ分割する
4. `tools/prepare_cooking_r2.py` が本番の既存一覧と重複排除し、ユーザー単位のR2オブジェクトを準備する
5. `tools/upload_cooking_r2.py` が個別JSONと履歴を先に保存し、一覧JSONを最後に更新する

中間出力は `cooking-import-output/` に保存され、Git管理から除外される。API処理はファイルのSHA-256単位で再開でき、完了済みファイルを再課金しない。

## 実行例

`tools/.env` に `OPENAI_API_KEY` を設定してから実行する。

```bash
python3 tools/import_cooking.py --input-dir /path/to/cooking --workers 2
python3 tools/split_cooking_import.py
python3 tools/prepare_cooking_r2.py --existing-index /path/to/current-recipes.json
python3 tools/upload_cooking_r2.py --user-id USER_ID
```

R2へアップロードする前に、必ず本番の `users/{userId}/data/recipes.json` を取得して `--existing-index` に渡す。アップローダーは途中経過を `upload-state.json` に保存するため、失敗時は同じコマンドで再開できる。

## 2026年8月の移行結果

- 入力ファイル: 191（PDF 150、TXT 39、画像 2）
- 画像と説明TXTの組み合わせを1資料として扱った資料数: 190
- 複数レシピ資料の分割後: 197レシピ
- 既存18件との重複: 17件
- 新規追加: 180件
- R2反映後: 198件
- 元URLを設定できたレシピ: 184件（既存データを含む）
- 手順が原資料に存在しないレシピ: 9件

元URLを断定できない場合は推測値を保存せず、`source.url` を `null`、`review_flags` を確認対象として残す。
