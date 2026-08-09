#!/usr/bin/env python3
"""Upload a prepared Cooking import to a user-scoped R2 prefix."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import subprocess
import threading
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WRANGLER = ROOT / "node_modules" / ".bin" / "wrangler"
WRITE_LOCK = threading.Lock()


def write_state(path: Path, completed: set[str]) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps({"completed": sorted(completed)}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def put_object(bucket: str, user_id: str, item: dict, retries: int) -> str:
    local = Path(item["local"])
    key = f"{bucket}/users/{user_id}/{item['key']}"
    command = [
        str(WRANGLER), "r2", "object", "put", key,
        "--remote", "--file", str(local), "--content-type", "application/json; charset=utf-8",
    ]
    last_error = ""
    for attempt in range(retries + 1):
        result = subprocess.run(command, cwd=ROOT, env=os.environ.copy(), text=True, capture_output=True)
        if result.returncode == 0:
            return item["key"]
        last_error = (result.stderr or result.stdout).strip()
        if attempt < retries:
            time.sleep(2 ** attempt)
    raise RuntimeError(f"{item['key']}: {last_error}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=ROOT / "cooking-import-output" / "r2" / "upload-manifest.json")
    parser.add_argument("--bucket", default="auto-recipe")
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--retries", type=int, default=2)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    objects = manifest["objects"]
    index_items = [item for item in objects if item.get("index")]
    data_items = [item for item in objects if not item.get("index")]
    if len(index_items) != 1:
        raise ValueError("アップロード対象のインデックスは1件である必要があります")

    state_path = args.manifest.with_name("upload-state.json")
    completed = set()
    if state_path.exists():
        completed = set(json.loads(state_path.read_text(encoding="utf-8")).get("completed", []))
    pending = [item for item in data_items if item["key"] not in completed]
    print(json.dumps({"objects": len(objects), "completed": len(completed), "pending_data": len(pending)}, ensure_ascii=False), flush=True)

    done_count = len(completed)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        futures = [executor.submit(put_object, args.bucket, args.user_id, item, args.retries) for item in pending]
        for future in concurrent.futures.as_completed(futures):
            key = future.result()
            with WRITE_LOCK:
                completed.add(key)
                done_count += 1
                write_state(state_path, completed)
                if done_count % 20 == 0 or done_count == len(data_items):
                    print(f"uploaded {done_count}/{len(data_items)} data objects", flush=True)

    index = index_items[0]
    put_object(args.bucket, args.user_id, index, args.retries)
    completed.add(index["key"])
    write_state(state_path, completed)
    print(f"uploaded index last: {index['key']}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
