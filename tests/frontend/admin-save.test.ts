import { describe, expect, it, vi } from "vitest";
import { saveRecipeAndRedirect } from "../../web/js/admin-save.js";

describe("admin recipe submission", () => {
  it("redirects to the saved recipe after a successful submission", async () => {
    const recipe = { id: "special/id", title: "保存したレシピ" };
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ recipe }),
    });
    const storage = { setItem: vi.fn() };
    const navigate = vi.fn();

    await saveRecipeAndRedirect(recipe, { fetcher, storage, navigate });

    expect(fetcher).toHaveBeenCalledWith("/api/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipe }),
    });
    expect(storage.setItem).toHaveBeenCalledWith("recipeSaved", recipe.title);
    expect(navigate).toHaveBeenCalledWith("/?recipe=special%2Fid");
  });
});
