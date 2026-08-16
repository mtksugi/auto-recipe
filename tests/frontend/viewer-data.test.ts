import { describe, expect, it, vi } from "vitest";
import { fetchRecipeIndex } from "../../web/js/viewer-data.js";

describe("viewer recipe loading", () => {
  it("bypasses the cache when loading recipes after a save", async () => {
    const recipes = [{ id: "updated", title: "更新済みレシピ" }];
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => recipes,
    });

    await expect(fetchRecipeIndex(fetcher)).resolves.toEqual(recipes);
    expect(fetcher).toHaveBeenCalledWith("data/recipes.json", { cache: "no-store" });
  });
});
