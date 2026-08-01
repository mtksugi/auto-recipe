# Phase 0 実行手順

## 目的

現在のサンプルデータをOpenAI APIへ渡し、料理で使える統一レシピJSONになるかを確認する。

PDFはローカルOCRを必須にせず、Responses APIの `input_file` として直接送る。PDF入力では、抽出テキストに加えてページ画像もモデルに渡されるため、画像として保存されたレシピも同じ入口で検証できる。

出力はStructured OutputsでJSON Schemaに合わせる。ただし、スキーマに適合していても材料の読み違いは起こり得るため、人間によるレビューをPhase 0の必須工程とする。

## 前提

- Python 3.9以上
- ネットワーク接続
- OpenAI APIキー
- APIキーはリポジトリに保存しない

## 実行

まずAPIを呼ばず、入力ファイルの一覧を作る。

```bash
python3 tools/phase0.py --prepare-only
```

APIキーを環境変数に設定する。

```bash
export OPENAI_API_KEY="..."
```

1件だけ変換して確認する。

```bash
python3 tools/phase0.py --limit 1
```

問題なければ10件を変換する。

```bash
python3 tools/phase0.py
```

モデルを変更したい場合は、実行時に指定できる。

```bash
OPENAI_MODEL="gpt-5.6" python3 tools/phase0.py --limit 1
```

## 出力

```text
phase0-output/
├── manifest.json
├── recipes/       # 変換成功したレシピJSON
└── errors/        # 失敗した入力とエラー内容
```

変換結果は `schemas/recipe.schema.json`、指示文は `prompts/recipe_normalizer.md` で管理する。

## レビュー項目

最初は全件を細かく採点するより、次を確認する。

- 材料の漏れ・重複
- 分量と単位の取り違え
- 元の人数
- 手順の順番と分割単位
- 手順内の分量
- `少々`、`適量`、分数、範囲
- メモや注意事項
- `review_flags` が必要な問題を出しているか
- 修正後のJSONが料理中に読みやすいか

## 注意

APIキーを設定していない状態でも `--prepare-only` は実行できる。キーが未設定のまま通常実行した場合は、入力マニフェストだけ作成して終了する。
