# Phase 2 登録・修正（ローカル試作品）

> 現在の公開アプリ構成は [`../ARCHITECTURE.md`](../ARCHITECTURE.md) を参照する。このPythonサーバーは検証と後方確認のために残している。

## 目的

URLまたはファイルからレシピ候補を作り、人間が確認・修正してから確定保存する。

## 起動

`tools/.env` に `OPENAI_API_KEY` を設定したうえで、プロジェクトルートから起動する。

```bash
python3 tools/phase2_server.py
```

登録画面：<http://localhost:8001/admin.html>

## 対応する入力

- 通常の公開レシピURL
- YouTube URL（概要欄などから取得できた範囲。手順不足は要確認）
- `.txt`, `.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`

APIキーはローカルサーバーだけが読み込み、ブラウザには渡さない。

## 登録フロー

```text
URLまたはファイルを入力
  ↓
LLM変換
  ↓
タイトル・人数・材料・手順・タグ・メモを確認・修正
  ↓
確定保存
  ↓
ビューア用JSONを再生成
```

保存先は `phase2-output/recipes/`。保存時に `web/data/recipes.json` も更新される。

## 現在の制限

- 編集UIは候補JSONを簡単に修正するためのMVPで、詳細な差分表示はない
- 保存済みレシピの一覧・再編集画面は未実装
- URL取得はWeb検索経路を使うため、取得結果が不安定なサイトは要確認
- YouTube動画本体の映像解析・字幕取得は未実装
