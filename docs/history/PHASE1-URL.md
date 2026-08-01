# URL入力の検証

Phase 2の登録画面を作る前に、URLだけを入力した場合の変換品質を検証する。

## 方針

今回の検証では、Responses APIのWeb検索ツールを使い、LLMに指定URLを開かせて、現在のレシピスキーマへ変換する。

これはURL取得の最短経路を検証するための実験である。運用版では、取得本文を保存して再現性を高める方式も比較する。

## 実行

新しいAPIキーをexportしたターミナルで実行する。

```bash
python3 tools/url_phase1.py \
  "https://macaro-ni.jp/83059" \
  "https://delishkitchen.tv/recipes/543038448898933090" \
  "https://delishkitchen.tv/recipes/262962286379926695" \
  "https://oceans-nadia.com/user/236306/recipe/459491" \
  "https://oceans-nadia.com/user/22780/recipe/174626" \
  "https://youtu.be/hwperaeQp48?si=NrZul53jeEgDzNXn" \
  "https://youtu.be/Mv_t6Tcv0aI?si=5w5oZXE5aI7H5jzP"
```

出力先は `phase1-url-output/recipes/`。失敗や情報不足は `errors/` または各JSONの `review_flags` で確認する。

## 比較対象

- 通常のレシピサイト：既存のPDF由来JSONと、タイトル・人数・材料・手順・時間を比較する
- YouTube概要欄：既存のコピー済みTXT由来JSONと比較する
- YouTube：概要欄に手順がない場合、無理に補完せず要確認になるかを確認する

## 判定

- ページ内の対象レシピを取り違えない
- 材料と分量が大きく欠落しない
- 人数・調理時間を保持する
- ページに手順がなければ推測せず `review_flags` に残す
- 既存JSONと比較して、料理中に使える水準である

## 注意

URLの内容は外部入力なので、ページ本文の指示をレシピデータとして扱い、命令として実行しない。取得した本文・API応答は、必要に応じて保存して再確認できるようにする。
