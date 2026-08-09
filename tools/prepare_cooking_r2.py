#!/usr/bin/env python3
"""Merge normalized Cooking recipes with a production R2 index safely."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import unicodedata
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "cooking-import-output"
DEFAULT_OUTPUT = DEFAULT_INPUT / "r2"
MULTI_SOURCE_FILES = {
    "なす×豚肉炒め 定番の美味しい味付け5選.pdf",
    "冷凍揚げなすレシピ.pdf",
    "至高の麻婆豆腐 - リュウジ + 笠原シェフ麻婆豆腐.txt",
}
SOURCE_OVERRIDES = {
    "麻婆豆腐 - キッコーマン.pdf": "https://www.kikkoman.co.jp/homecook/search/recipe/00002028/",
    "肉じゃが.pdf": "https://park.ajinomoto.co.jp/recipe/card/705645/",
    "ラーメンショップのネギ.pdf": "https://son59.me/2021/04/16/post-1054/",
    "冷凍肉で作る豚のしゃぶしゃぶ.pdf": "https://www.lemon8-app.com/clubfitnista/%E5%86%B7%E5%87%8D_%E8%82%89_%E4%BD%9C%E3%82%8B_%E8%B1%9A_%E3%81%97%E3%82%83%E3%81%B6%E3%81%97%E3%82%83%E3%81%B6?region=jp",
    "豚肉とレタスのオイスター炒め.pdf": "https://www.lettuceclub.net/recipe/dish/33866/",
    "電子レンジで簡単温泉卵.pdf": "https://www.lettuceclub.net/recipe/dish/23993/",
}


def nfc(value: str) -> str:
    return unicodedata.normalize("NFC", value)


def normalized_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"[\s\W_]+", "", unicodedata.normalize("NFKC", value)).lower()


def canonical_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlparse(value)
    host = parsed.netloc.lower().removeprefix("www.")
    if host == "youtu.be":
        return f"youtube:{parsed.path.strip('/')}"
    if host in {"youtube.com", "m.youtube.com"}:
        video_id = parse_qs(parsed.query).get("v", [None])[0]
        if video_id:
            return f"youtube:{video_id}"
    return f"{host}{parsed.path.rstrip('/') or '/'}"


def ingredient_signature(recipe: dict) -> tuple[tuple[str, str, str], ...]:
    return tuple(sorted(
        (
            normalized_text(item.get("name")),
            normalized_text(item.get("amount")),
            normalized_text(item.get("unit")),
        )
        for item in recipe.get("ingredients", [])
    ))


def content_key(recipe: dict) -> tuple[str, tuple[tuple[str, str, str], ...]]:
    return normalized_text(recipe.get("title")), ingredient_signature(recipe)


def source_key(recipe: dict) -> tuple[str, str] | None:
    url = canonical_url(recipe.get("source", {}).get("url"))
    if not url:
        return None
    if url.startswith("youtube:"):
        return url, ""
    return url, normalized_text(recipe.get("title"))


def validate_recipe(recipe: dict) -> None:
    if not isinstance(recipe.get("id"), str) or not recipe["id"].strip():
        raise ValueError("レシピIDがありません")
    if not isinstance(recipe.get("title"), str) or not recipe["title"].strip():
        raise ValueError("タイトルがありません")
    ingredients = recipe.get("ingredients")
    steps = recipe.get("steps")
    main = recipe.get("main_ingredients")
    if not all(isinstance(value, list) for value in (ingredients, steps, main)):
        raise ValueError(f"配列項目が不正です: {recipe['title']}")
    ids = [item.get("id") for item in ingredients]
    if len(ids) != len(set(ids)) or any(not value for value in ids):
        raise ValueError(f"材料IDが不正です: {recipe['title']}")
    refs = [ref for item in [*steps, *main] for ref in item.get("ingredient_refs", [])]
    dangling = set(refs) - set(ids)
    if dangling:
        raise ValueError(f"材料参照が不正です: {recipe['title']}: {sorted(dangling)}")


def load_generated(input_dir: Path) -> list[tuple[dict, str]]:
    wrappers: list[tuple[dict, str]] = []
    for path in sorted((input_dir / "recipes").glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        recipe = payload["recipe"]
        filename = nfc(recipe.get("source", {}).get("filename") or "")
        if filename in MULTI_SOURCE_FILES:
            continue
        wrappers.append((recipe, payload["source_sha256"]))
    for path in sorted((input_dir / "split-recipes").glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        wrappers.append((payload["recipe"], payload["source_sha256"]))
    return wrappers


def apply_source_override(recipe: dict) -> None:
    filename = nfc(recipe.get("source", {}).get("filename") or "")
    url = SOURCE_OVERRIDES.get(filename)
    if not url:
        return
    parsed = urlparse(url)
    recipe["source"].update({"type": "url", "url": url, "site": parsed.netloc})
    recipe["review_flags"] = [flag for flag in recipe.get("review_flags", []) if flag != "元URLを特定できない"]


def unique_id(recipe: dict, used_ids: set[str], source_hash: str) -> None:
    if recipe["id"] not in used_ids:
        return
    base = recipe["id"]
    candidate = f"{base}-{source_hash[:8]}"
    counter = 2
    while candidate in used_ids:
        candidate = f"{base}-{source_hash[:8]}-{counter}"
        counter += 1
    recipe["id"] = candidate


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--existing-index", type=Path, required=True)
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    existing = json.loads(args.existing_index.read_text(encoding="utf-8"))
    if not isinstance(existing, list):
        raise ValueError("既存インデックスが配列ではありません")
    for recipe in existing:
        validate_recipe(recipe)

    merged = [copy.deepcopy(recipe) for recipe in existing]
    used_ids = {recipe["id"] for recipe in merged}
    source_keys = {key for recipe in merged if (key := source_key(recipe))}
    content_keys = {content_key(recipe) for recipe in merged}
    existing_filenames = {
        nfc(recipe.get("source", {}).get("filename") or "")
        for recipe in existing
        if recipe.get("source", {}).get("filename")
    }
    existing_unsourced_titles = {
        normalized_text(recipe.get("title"))
        for recipe in existing
        if not recipe.get("source", {}).get("url")
    }
    additions: list[tuple[dict, str]] = []
    skipped: list[dict] = []

    for original, source_hash in load_generated(args.input_dir):
        recipe = copy.deepcopy(original)
        apply_source_override(recipe)
        validate_recipe(recipe)
        s_key = source_key(recipe)
        c_key = content_key(recipe)
        filename = nfc(recipe.get("source", {}).get("filename") or "")
        reason = None
        if filename and filename in existing_filenames:
            reason = "same_existing_file"
        elif normalized_text(recipe.get("title")) in existing_unsourced_titles:
            reason = "same_unsourced_existing_title"
        elif s_key and s_key in source_keys:
            reason = "same_source"
        elif c_key in content_keys:
            reason = "same_content"
        if reason:
            skipped.append({"title": recipe["title"], "id": recipe["id"], "reason": reason})
            continue
        unique_id(recipe, used_ids, source_hash)
        validate_recipe(recipe)
        additions.append((recipe, source_hash))
        merged.append(recipe)
        used_ids.add(recipe["id"])
        if s_key:
            source_keys.add(s_key)
        content_keys.add(c_key)

    merged.sort(key=lambda recipe: nfc(recipe["title"]))
    if len({recipe["id"] for recipe in merged}) != len(merged):
        raise ValueError("マージ後にIDが重複しています")

    timestamp = datetime.now(UTC).isoformat(timespec="seconds").replace(":", "-")
    index_path = args.output_dir / "data" / "recipes.json"
    write_json(index_path, merged)
    objects = []
    for recipe, source_hash in additions:
        encoded_id = quote(recipe["id"], safe="")
        latest = args.output_dir / "recipes" / f"{encoded_id}.json"
        history = args.output_dir / "history" / encoded_id / f"bulk-import-{timestamp}.json"
        write_json(latest, recipe)
        write_json(history, recipe)
        objects.extend([
            {"local": str(latest), "key": f"recipes/{encoded_id}.json"},
            {"local": str(history), "key": f"history/{encoded_id}/{history.name}"},
        ])
    objects.append({"local": str(index_path), "key": "data/recipes.json", "index": True})

    report = {
        "existing": len(existing),
        "generated_candidates": len(load_generated(args.input_dir)),
        "added": len(additions),
        "skipped_duplicates": len(skipped),
        "final": len(merged),
        "without_source_url": sum(not recipe.get("source", {}).get("url") for recipe in merged),
        "without_steps": sum(not recipe.get("steps") for recipe in merged),
        "skipped": skipped,
        "objects": objects,
    }
    write_json(args.output_dir / "upload-manifest.json", report)
    print(json.dumps({key: report[key] for key in (
        "existing", "generated_candidates", "added", "skipped_duplicates", "final", "without_source_url", "without_steps"
    )}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
