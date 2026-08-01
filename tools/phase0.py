#!/usr/bin/env python3
"""Phase 0: normalize recipe source files with the OpenAI Responses API.

Uses only the Python standard library so the first experiment does not require
an SDK installation. PDFs are sent as input_file items; the Responses API can
process both extracted PDF text and page images.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INPUT = ROOT / "original-sample-data"
DEFAULT_OUTPUT = ROOT / "phase0-output"
SCHEMA_PATH = ROOT / "schemas" / "recipe.schema.json"
PROMPT_PATH = ROOT / "prompts" / "recipe_normalizer.md"
SUPPORTED = {".txt", ".pdf", ".jpg", ".jpeg", ".png", ".webp", ".gif"}


def source_type(path: Path) -> str:
    return {
        ".txt": "text",
        ".pdf": "pdf",
        ".jpg": "image",
        ".jpeg": "image",
        ".png": "image",
        ".webp": "image",
        ".gif": "image",
    }.get(path.suffix.lower(), "unknown")


def file_data(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def build_request(path: Path, model: str, prompt: str, schema: dict) -> dict:
    content_type = "input_file" if path.suffix.lower() in SUPPORTED else "input_text"
    if content_type == "input_file":
        file_item = {
            "type": "input_file",
            "filename": path.name,
            "file_data": file_data(path),
        }
        if path.suffix.lower() == ".pdf":
            file_item["detail"] = "high"
        content = [file_item, {"type": "input_text", "text": prompt}]
    else:
        content = [{"type": "input_text", "text": prompt + "\n\n" + path.read_text(encoding="utf-8")}]

    return {
        "model": model,
        "input": [{"role": "user", "content": content}],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "auto_recipe",
                "strict": True,
                "schema": schema,
            }
        },
    }


def call_openai(request_body: dict) -> dict:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(request_body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"OpenAI API error {exc.code}: {body}") from exc


def response_text(response: dict) -> str:
    if isinstance(response.get("output_text"), str):
        return response["output_text"]
    chunks = []
    for item in response.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                chunks.append(content.get("text", ""))
    return "\n".join(chunks)


def slugify(title: str, fallback: str) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return value or fallback


def prepare_manifest(input_dir: Path, output_dir: Path) -> list[dict]:
    files = sorted(p for p in input_dir.iterdir() if p.is_file() and p.suffix.lower() in SUPPORTED)
    manifest = []
    for path in files:
        item = {
            "filename": path.name,
            "path": str(path),
            "type": source_type(path),
            "bytes": path.stat().st_size,
        }
        if path.suffix.lower() == ".txt":
            text = path.read_text(encoding="utf-8", errors="replace")
            item["text_chars"] = len(text)
            item["text_preview"] = text[:200]
        manifest.append(item)
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path, default=DEFAULT_INPUT)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--limit", type=int, default=0, help="process only the first N files")
    parser.add_argument("--model", default=os.environ.get("OPENAI_MODEL", "gpt-5.6"))
    parser.add_argument("--prepare-only", action="store_true", help="write manifest without calling OpenAI")
    args = parser.parse_args()

    manifest = prepare_manifest(args.input_dir, args.output_dir)
    print(f"Prepared {len(manifest)} input files in {args.output_dir / 'manifest.json'}")
    if args.prepare_only:
        return 0
    if not os.environ.get("OPENAI_API_KEY"):
        print("OPENAI_API_KEY is not set; manifest preparation succeeded, normalization skipped.", file=sys.stderr)
        return 2

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    prompt = PROMPT_PATH.read_text(encoding="utf-8")
    files = manifest[: args.limit or None]
    results_dir = args.output_dir / "recipes"
    errors_dir = args.output_dir / "errors"
    results_dir.mkdir(parents=True, exist_ok=True)
    errors_dir.mkdir(parents=True, exist_ok=True)

    for index, item in enumerate(files, start=1):
        path = Path(item["path"])
        stem = path.stem
        print(f"[{index}/{len(files)}] {path.name}", flush=True)
        try:
            response = call_openai(build_request(path, args.model, prompt, schema))
            text = response_text(response)
            recipe = json.loads(text)
            if not recipe.get("id"):
                recipe["id"] = slugify(recipe.get("title", ""), stem)
            recipe.setdefault("source", {})["filename"] = path.name
            (results_dir / f"{stem}.json").write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        except Exception as exc:  # keep the batch moving and record the bad input
            error = {"filename": path.name, "error": str(exc)}
            (errors_dir / f"{stem}.json").write_text(json.dumps(error, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"  ERROR: {exc}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
