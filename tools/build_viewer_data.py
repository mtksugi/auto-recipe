#!/usr/bin/env python3
"""Build the static Phase 1 viewer data from Phase 0 recipe JSON files."""

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCES = [ROOT / "phase0-output" / "recipes", ROOT / "phase2-output" / "recipes"]
DEST = ROOT / "web" / "data" / "recipes.json"


def main() -> None:
    files = [path for source in SOURCES for path in sorted(source.glob("*.json"))]
    if not files:
        raise SystemExit("No recipe JSON files found")
    by_id = {}
    id_by_title = {}
    for path in files:
        recipe = json.loads(path.read_text(encoding="utf-8"))
        recipe_id = recipe.get("id", path.stem)
        title = recipe.get("title", "").strip()
        previous_id = id_by_title.get(title)
        if previous_id and previous_id != recipe_id:
            by_id.pop(previous_id, None)
        by_id[recipe_id] = recipe
        if title:
            id_by_title[title] = recipe_id
    recipes = list(by_id.values())
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(recipes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built {len(recipes)} recipes -> {DEST}")


if __name__ == "__main__":
    main()
