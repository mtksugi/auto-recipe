#!/usr/bin/env python3
"""Extract every recipe from legacy files that contain multiple recipes."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path
from urllib.parse import urlparse

from import_cooking import (
    DEFAULT_INPUT,
    DEFAULT_OUTPUT,
    ENV_PATH,
    PROMPT_PATH,
    SCHEMA_PATH,
    call_openai,
    data_url,
    load_env,
    response_text,
    sha256,
    validate_recipe,
)


TARGETS = {
    "なす×豚肉炒め 定番の美味しい味付け5選.pdf": {
        "url": "https://www.nichireifoods.co.jp/media/9412/",
        "titles": [
            "なすと豚肉の味噌炒め",
            "なすと豚肉のみりん炒め",
            "なすと豚肉のマヨ＆オイスター炒め",
            "なすと豚肉の韓国風焼肉炒め",
            "なすと豚肉の梅ポン酢炒め",
        ],
    },
    "冷凍揚げなすレシピ.pdf": {
        "url": "https://www.nichireifoods.co.jp/media/15131/",
        "titles": [
            "冷凍揚げなすのマリネ",
            "冷凍揚げなすのミートナポリタン",
            "冷凍揚げなすと鶏の黒酢炒め",
        ],
    },
    "至高の麻婆豆腐 - リュウジ + 笠原シェフ麻婆豆腐.txt": {
        "titles": [
            {"title": "至高の麻婆豆腐", "url": "https://www.youtube.com/watch?v=Myqnk5iOb30"},
            {"title": "まかない麻婆豆腐", "url": "https://www.youtube.com/watch?v=7SqEaLpN_js"},
        ],
    },
}


def find_source(name: str) -> Path:
    normalized = unicodedata.normalize("NFC", name)
    for path in DEFAULT_INPUT.iterdir():
        if unicodedata.normalize("NFC", path.name) == normalized:
            return path
    raise FileNotFoundError(name)


def output_path(output_dir: Path, path: Path, title: str, digest: str) -> Path:
    safe = re.sub(r'[\\/:*?"<>|]+', "-", unicodedata.normalize("NFC", title)).strip()
    title_hash = hashlib.sha256(title.encode("utf-8")).hexdigest()[:8]
    return output_dir / f"{safe}-{digest[:8]}-{title_hash}.json"


def request_body(path: Path, title: str, url: str, prompt: str, schema: dict) -> dict:
    instruction = f"""{prompt}

## 複数レシピ資料の分割抽出

入力には複数のレシピが含まれています。今回は「{title}」だけを独立した1レシピとして抽出してください。
別レシピの材料や手順を混ぜないでください。入力に手順がない場合は推測で補わず、stepsを空配列にしてください。
source.type は url、source.url は {url}、source.site は {urlparse(url).netloc}、source.filename は {path.name!r} にしてください。
review_flags に複数レシピ資料から分割した旨を残す必要はありません。
"""
    if path.suffix.lower() == ".txt":
        content = [{
            "type": "input_text",
            "text": instruction + "\n\n## 入力テキスト\n\n" + path.read_text(encoding="utf-8", errors="replace"),
        }]
    else:
        content = [
            {"type": "input_file", "filename": path.name, "file_data": data_url(path), "detail": "high"},
            {"type": "input_text", "text": instruction},
        ]
    return {
        "model": "gpt-5.6-terra",
        "store": False,
        "input": [{"role": "user", "content": content}],
        "text": {"format": {"type": "json_schema", "name": "auto_recipe", "strict": True, "schema": schema}},
    }


def main() -> int:
    load_env(ENV_PATH)
    prompt = PROMPT_PATH.read_text(encoding="utf-8")
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    output_dir = DEFAULT_OUTPUT / "split-recipes"
    output_dir.mkdir(parents=True, exist_ok=True)

    for source_name, config in TARGETS.items():
        path = find_source(source_name)
        entries = config["titles"]
        if entries and isinstance(entries[0], str):
            entries = [{"title": title, "url": config["url"]} for title in entries]
        for entry in entries:
            title = entry["title"]
            url = entry["url"]
            digest = sha256(path)
            destination = output_path(output_dir, path, title, digest)
            if destination.exists():
                print(f"SKIP {source_name}: {title}", flush=True)
                continue
            print(f"EXTRACT {source_name}: {title}", flush=True)
            response = call_openai(request_body(path, title, url, prompt, schema))
            recipe = json.loads(response_text(response))
            validate_recipe(recipe, path.name, url, [])
            payload = {
                "source_sha256": digest,
                "source_bytes": path.stat().st_size,
                "model": "gpt-5.6-terra",
                "response_id": response.get("id"),
                "usage": response.get("usage"),
                "searched_urls": [],
                "split_target": title,
                "recipe": recipe,
            }
            destination.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
