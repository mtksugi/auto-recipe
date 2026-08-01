#!/usr/bin/env python3
"""Local Phase 2 server: convert and save recipe candidates without exposing the API key."""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from phase0 import SCHEMA_PATH, PROMPT_PATH, call_openai, response_text
from build_viewer_data import main as build_viewer_data

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
SAVE_DIR = ROOT / "phase2-output" / "recipes"


def load_dotenv() -> None:
    env_path = ROOT / "tools" / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


def web_request(url: str, prompt: str, schema: dict) -> dict:
    text = f"""{prompt}

登録用のURL変換です。web_searchツールで、次のURLそのものを確認してください。
URL: {url}

ページ内の対象レシピだけを抽出し、別レシピや関連レシピを混ぜないでください。
ページにない人数・分量・手順は推測せず、nullまたはreview_flagsに記録してください。
"""
    return {
        "model": os.environ.get("OPENAI_MODEL", "gpt-5.6"),
        "tools": [{"type": "web_search"}],
        "tool_choice": "required",
        "input": [{"role": "user", "content": [{"type": "input_text", "text": text}]}],
        "text": {"format": {"type": "json_schema", "name": "auto_recipe", "strict": True, "schema": schema}},
    }


def file_request(filename: str, mime: str, data: str, prompt: str, schema: dict) -> dict:
    file_data = f"data:{mime};base64,{data}"
    content = [{"type": "input_file", "filename": filename, "file_data": file_data}, {"type": "input_text", "text": prompt}]
    return {
        "model": os.environ.get("OPENAI_MODEL", "gpt-5.6"),
        "input": [{"role": "user", "content": content}],
        "text": {"format": {"type": "json_schema", "name": "auto_recipe", "strict": True, "schema": schema}},
    }


def safe_filename(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9ぁ-んァ-ン一-龥_-]+", "-", value).strip("-") or "recipe"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def send_json(self, status: int, value: dict) -> None:
        body = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length))
        schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
        prompt = PROMPT_PATH.read_text(encoding="utf-8")
        try:
            if self.path == "/api/normalize":
                if payload.get("url"):
                    request = web_request(payload["url"], prompt, schema)
                elif payload.get("data"):
                    request = file_request(payload.get("filename", "recipe"), payload.get("mime", "application/octet-stream"), payload["data"], prompt, schema)
                else:
                    raise ValueError("URLまたはファイルが必要です")
                recipe = json.loads(response_text(call_openai(request)))
                self.send_json(200, {"recipe": recipe})
                return
            if self.path == "/api/save":
                recipe = payload.get("recipe")
                if not recipe or not recipe.get("title"):
                    raise ValueError("タイトルが必要です")
                SAVE_DIR.mkdir(parents=True, exist_ok=True)
                filename = safe_filename(recipe["title"]) + ".json"
                (SAVE_DIR / filename).write_text(json.dumps(recipe, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                build_viewer_data()
                viewer_data = json.loads((WEB / "data" / "recipes.json").read_text(encoding="utf-8"))
                self.send_json(200, {"saved": f"phase2-output/recipes/{filename}", "recipe": recipe, "viewer_count": len(viewer_data)})
                return
            self.send_json(404, {"error": "not found"})
        except Exception as exc:
            self.send_json(400, {"error": str(exc)})


def main() -> None:
    load_dotenv()
    if not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit("OPENAI_API_KEY is not set; put it in tools/.env")
    port = int(os.environ.get("AUTO_RECIPE_PORT", "8001"))
    print(f"auto-recipe Phase 2: http://localhost:{port}/admin.html")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
