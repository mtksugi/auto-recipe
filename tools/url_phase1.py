#!/usr/bin/env python3
"""Phase 1 URL spike: normalize public recipe URLs with Responses web search."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

from phase0 import SCHEMA_PATH, PROMPT_PATH, call_openai, response_text


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "phase1-url-output"


def build_request(url: str, model: str, prompt: str, schema: dict) -> dict:
    instruction = f"""{prompt}

This is a URL-input validation run.
Use the web_search tool to open and inspect this exact URL:
{url}

Extract only the recipe on that page. Do not substitute a similar recipe from
another page. If the page has insufficient recipe details, preserve what is
known and add a review flag explaining what is missing. Set source.type to
\"url\" and source.url to the exact URL above.
"""
    return {
        "model": model,
        "tools": [{"type": "web_search"}],
        "tool_choice": "required",
        "input": [{"role": "user", "content": [{"type": "input_text", "text": instruction}]}],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "auto_recipe",
                "strict": True,
                "schema": schema,
            }
        },
    }


def slug(value: str, fallback: str) -> str:
    text = re.sub(r"[^a-z0-9ぁ-んァ-ン一-龥]+", "-", value.lower()).strip("-")
    return text or fallback


def check_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError(f"invalid URL: {url}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("urls", nargs="+", help="public recipe URLs")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--model", default=os.environ.get("OPENAI_MODEL", "gpt-5.6"))
    args = parser.parse_args()

    if not os.environ.get("OPENAI_API_KEY"):
        print("OPENAI_API_KEY is not set", file=sys.stderr)
        return 2

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    prompt = PROMPT_PATH.read_text(encoding="utf-8")
    output_dir = args.output_dir
    recipes_dir = output_dir / "recipes"
    errors_dir = output_dir / "errors"
    recipes_dir.mkdir(parents=True, exist_ok=True)
    errors_dir.mkdir(parents=True, exist_ok=True)

    for index, url in enumerate(args.urls, start=1):
        print(f"[{index}/{len(args.urls)}] {url}", flush=True)
        try:
            check_url(url)
            recipe = json.loads(response_text(call_openai(build_request(url, args.model, prompt, schema))))
            recipe.setdefault("source", {})["type"] = "url"
            recipe["source"]["url"] = url
            recipe["source"]["site"] = urlparse(url).netloc
            filename = f"{slug(recipe.get('title', ''), f'recipe-{index}')}.json"
            (recipes_dir / filename).write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        except Exception as exc:
            error = {"url": url, "error": str(exc)}
            filename = f"error-{index}.json"
            (errors_dir / filename).write_text(json.dumps(error, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"  ERROR: {exc}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
