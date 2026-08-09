#!/usr/bin/env python3
"""Normalize the legacy Cooking archive and identify each original URL.

The importer is resumable: one JSON file is written per source hash, and
completed files are skipped on subsequent runs. PDF/image sources use the
Responses API's visual file input together with hosted web search. Text files
with an embedded URL keep that URL as requested by the archive owner.
"""

from __future__ import annotations

import argparse
import base64
import concurrent.futures
import hashlib
import json
import mimetypes
import os
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = Path("/Users/mtk/Downloads/Cooking")
DEFAULT_OUTPUT = ROOT / "cooking-import-output"
SCHEMA_PATH = ROOT / "schemas" / "recipe.schema.json"
PROMPT_PATH = ROOT / "prompts" / "recipe_normalizer.md"
ENV_PATH = ROOT / "tools" / ".env"
SUPPORTED = {".txt", ".pdf", ".jpg", ".jpeg", ".png", ".webp"}
URL_RE = re.compile(r"https?://[^\s<>\"'）)]+")
PRINT_LOCK = threading.Lock()


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        os.environ.setdefault(key, value)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def output_name(path: Path, digest: str) -> str:
    safe_stem = re.sub(r"[\\/:*?\"<>|]+", "-", unicodedata.normalize("NFC", path.stem)).strip()
    return f"{safe_stem}-{digest[:10]}.json"


def data_url(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def embedded_url(path: Path) -> str | None:
    if path.suffix.lower() != ".txt":
        return None
    text = path.read_text(encoding="utf-8", errors="replace")
    match = URL_RE.search(text)
    return match.group(0) if match else None


def companion_text(path: Path) -> Path | None:
    if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        return None
    match = re.fullmatch(r"(.+?)[-_ ]1", path.stem)
    if not match:
        return None
    candidate = path.with_name(f"{match.group(1)}-2.txt")
    return candidate if candidate.exists() else None


def import_instruction(path: Path, known_url: str | None) -> str:
    if known_url:
        source_rule = f"""このテキストに記載された次のURLを元ソースとしてそのまま使用してください。
URL: {known_url}
source.type は url、source.url はこのURL、source.site はホスト名にしてください。"""
    else:
        source_rule = """web_searchを使い、この入力ファイルが保存された元の公開ページを特定してください。
ファイル内の料理名だけで判断せず、サイト名・材料・分量・手順・固有表現を検索結果と照合してください。
同一ページである強い根拠がある場合だけ source.type を url とし、source.url にそのページの正規URL、source.site にホスト名を入れてください。
類似レシピしか見つからない場合は source.url と source.site を null のままにし、review_flags に「元URLを特定できない」と記録してください。推測URLは保存しないでください。"""
    return f"""{source_rule}

source.filename は必ず {path.name!r} にしてください。
入力ファイルそのものを正としてレシピを抽出し、検索先ページの現在の内容が異なる場合は材料・分量・手順を検索結果で置き換えないでください。
出力前に、材料IDの重複と ingredient_refs の参照切れがないことを確認してください。"""


def build_request(path: Path, model: str, prompt: str, schema: dict) -> tuple[dict, str | None]:
    known_url = embedded_url(path)
    instruction = f"{prompt}\n\n## 既存アーカイブ一括移行\n\n{import_instruction(path, known_url)}"
    suffix = path.suffix.lower()
    if suffix == ".txt":
        content = [{
            "type": "input_text",
            "text": instruction + "\n\n## 入力テキスト\n\n" + path.read_text(encoding="utf-8", errors="replace"),
        }]
    elif suffix == ".pdf":
        content = [
            {"type": "input_file", "filename": path.name, "file_data": data_url(path), "detail": "high"},
            {"type": "input_text", "text": instruction},
        ]
    else:
        content = [
            {"type": "input_image", "image_url": data_url(path), "detail": "high"},
            {"type": "input_text", "text": instruction},
        ]

    body: dict = {
        "model": model,
        "store": False,
        "input": [{"role": "user", "content": content}],
        "text": {"format": {"type": "json_schema", "name": "auto_recipe", "strict": True, "schema": schema}},
    }
    if not known_url:
        body["tools"] = [{"type": "web_search"}]
        body["tool_choice"] = "required"
        body["include"] = ["web_search_call.action.sources"]
    return body, known_url


def call_openai(body: dict, timeout: int = 240) -> dict:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI API error {exc.code}: {detail}") from exc


def response_text(response: dict) -> str:
    if isinstance(response.get("output_text"), str):
        return response["output_text"]
    chunks: list[str] = []
    for item in response.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                chunks.append(content.get("text", ""))
    return "".join(chunks)


def searched_urls(response: dict) -> list[str]:
    found: list[str] = []
    for item in response.get("output", []):
        action = item.get("action") if isinstance(item, dict) else None
        if not isinstance(action, dict):
            continue
        for source in action.get("sources", []):
            if isinstance(source, dict) and isinstance(source.get("url"), str):
                found.append(source["url"])
    return list(dict.fromkeys(found))


def comparable_url(value: str) -> tuple[str, str]:
    parsed = urlparse(value)
    return parsed.netloc.lower(), parsed.path.rstrip("/") or "/"


def validate_recipe(
    recipe: dict,
    filename: str,
    known_url: str | None,
    web_urls: list[str],
) -> None:
    if not isinstance(recipe, dict) or not recipe.get("id") or not recipe.get("title"):
        raise ValueError("idまたはtitleがありません")
    source = recipe.get("source")
    if not isinstance(source, dict):
        raise ValueError("sourceがありません")
    source["filename"] = filename
    if known_url:
        source.update({"type": "url", "url": known_url, "site": urlparse(known_url).netloc})
    url = source.get("url")
    if url is not None and urlparse(url).scheme not in {"http", "https"}:
        raise ValueError("source.urlがhttp/httpsではありません")
    if url and not known_url and comparable_url(url) not in {comparable_url(item) for item in web_urls}:
        source.update({"type": "file", "url": None, "site": None})
        flags = recipe.setdefault("review_flags", [])
        if "元URLを特定できない" not in flags:
            flags.append("元URLを特定できない")
    if not source.get("url"):
        flags = recipe.setdefault("review_flags", [])
        if "元URLを特定できない" not in flags:
            flags.append("元URLを特定できない")

    ingredients = recipe.get("ingredients")
    steps = recipe.get("steps")
    main_ingredients = recipe.get("main_ingredients")
    if not isinstance(ingredients, list) or not isinstance(steps, list) or not isinstance(main_ingredients, list):
        raise ValueError("ingredients/steps/main_ingredientsの形式が不正です")
    ids = [item.get("id") for item in ingredients if isinstance(item, dict)]
    if len(ids) != len(set(ids)) or any(not isinstance(item, str) or not item for item in ids):
        raise ValueError("材料IDが空または重複しています")
    valid_ids = set(ids)
    refs = []
    for item in [*steps, *main_ingredients]:
        if isinstance(item, dict) and isinstance(item.get("ingredient_refs"), list):
            refs.extend(item["ingredient_refs"])
    dangling = [ref for ref in refs if ref not in valid_ids]
    if dangling:
        raise ValueError(f"材料参照が不正です: {dangling[:3]}")


def normalize_one(
    path: Path,
    recipes_dir: Path,
    errors_dir: Path,
    model: str,
    prompt: str,
    schema: dict,
    retries: int,
    position: int,
    total: int,
) -> dict:
    digest = sha256(path)
    name = output_name(path, digest)
    recipe_path = recipes_dir / name
    error_path = errors_dir / name
    if recipe_path.exists():
        return {"status": "skipped", "filename": path.name, "output": str(recipe_path)}

    body, known_url = build_request(path, model, prompt, schema)
    with PRINT_LOCK:
        print(f"[{position}/{total}] {path.name}", flush=True)
    last_error: Exception | None = None
    for attempt in range(1, retries + 2):
        try:
            response = call_openai(body)
            recipe = json.loads(response_text(response))
            web_urls = searched_urls(response)
            validate_recipe(recipe, path.name, known_url, web_urls)
            payload = {
                "source_sha256": digest,
                "source_bytes": path.stat().st_size,
                "model": model,
                "response_id": response.get("id"),
                "usage": response.get("usage"),
                "searched_urls": web_urls,
                "recipe": recipe,
            }
            recipe_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            error_path.unlink(missing_ok=True)
            return {"status": "ok", "filename": path.name, "output": str(recipe_path)}
        except Exception as exc:  # keep the batch resumable and preserve diagnostics
            last_error = exc
            if attempt <= retries:
                with PRINT_LOCK:
                    print(f"  RETRY {attempt}/{retries}: {path.name}: {exc}", flush=True)
                time.sleep(min(30, 2 ** attempt))
    error = {
        "filename": path.name,
        "source_sha256": digest,
        "error": str(last_error),
        "attempts": retries + 1,
    }
    error_path.write_text(json.dumps(error, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with PRINT_LOCK:
        print(f"  ERROR: {last_error}", flush=True)
    return {"status": "error", "filename": path.name, "error": str(last_error)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--model", default=os.environ.get("OPENAI_MODEL", "gpt-5.6-terra"))
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--match", action="append", default=[], help="process filenames containing this text")
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()

    load_env(ENV_PATH)
    all_files = sorted(
        (path for path in args.input_dir.iterdir() if path.is_file() and path.suffix.lower() in SUPPORTED),
        key=lambda path: unicodedata.normalize("NFC", path.name),
    )
    companions = {path: companion_text(path) for path in all_files if companion_text(path)}
    files = [path for path in all_files if path not in companions]
    if args.match:
        files = [path for path in files if any(text in unicodedata.normalize("NFC", path.name) for text in args.match)]
    if args.limit:
        files = files[: args.limit]

    args.output_dir.mkdir(parents=True, exist_ok=True)
    recipes_dir = args.output_dir / "recipes"
    errors_dir = args.output_dir / "errors"
    recipes_dir.mkdir(exist_ok=True)
    errors_dir.mkdir(exist_ok=True)
    manifest = [{
        "filename": path.name,
        "path": str(path),
        "bytes": path.stat().st_size,
        "type": path.suffix.lower().lstrip("."),
        "embedded_url": embedded_url(path),
    } for path in files]
    manifest.extend({
        "filename": path.name,
        "path": str(path),
        "bytes": path.stat().st_size,
        "type": path.suffix.lower().lstrip("."),
        "embedded_url": None,
        "companion_of": companion.name,
    } for path, companion in companions.items() if companion in files)
    (args.output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Prepared {len(files)} files", flush=True)
    if args.prepare_only:
        return 0
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY is not set")

    prompt = PROMPT_PATH.read_text(encoding="utf-8")
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    results: list[dict] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = [executor.submit(
            normalize_one,
            path,
            recipes_dir,
            errors_dir,
            args.model,
            prompt,
            schema,
            args.retries,
            index,
            len(files),
        ) for index, path in enumerate(files, start=1)]
        for future in concurrent.futures.as_completed(futures):
            results.append(future.result())

    summary = {
        "total": len(files),
        "ok": sum(item["status"] == "ok" for item in results),
        "skipped": sum(item["status"] == "skipped" for item in results),
        "errors": sum(item["status"] == "error" for item in results),
        "results": sorted(results, key=lambda item: item["filename"]),
    }
    (args.output_dir / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: summary[key] for key in ("total", "ok", "skipped", "errors")}, ensure_ascii=False))
    return 1 if summary["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
