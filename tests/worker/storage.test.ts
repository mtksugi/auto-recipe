import { describe, expect, it } from "vitest";
import { upsertRecipe, validateRecipe } from "../../worker/storage";
import type { Recipe } from "../../worker/types";

function recipe(id: string, title: string): Recipe {
  return {
    id,
    title,
    title_reading: "",
    source: { type: "unknown", url: null, site: null, filename: null },
    servings: null,
    ingredients: [],
    steps: [],
    categories: [],
    main_ingredients: [],
    tags: [],
    time_minutes: null,
    notes: [],
    review_flags: [],
  };
}

describe("recipe storage", () => {
  it("replaces an existing recipe by id", () => {
    const result = upsertRecipe([recipe("one", "古い名前")], recipe("one", "新しい名前"));
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("新しい名前");
  });

  it("requires id and title", () => {
    expect(() => validateRecipe({ id: "", title: "料理", ingredients: [], steps: [] })).toThrow("レシピID");
    expect(() => validateRecipe({ id: "id", title: "", ingredients: [], steps: [] })).toThrow("タイトル");
  });
});
