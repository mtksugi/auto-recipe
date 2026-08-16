import { describe, expect, it } from "vitest";
import { configureEditNavigation } from "../../web/js/admin-edit.js";

describe("admin edit navigation", () => {
  it("returns the cancel link to the recipe selected for editing", () => {
    const importCard = { hidden: false };
    const cancelEdit = { hidden: true, href: "/" };
    const headerReturnLink = { href: "/", textContent: "一覧へ戻る" };

    const recipeId = configureEditNavigation(
      { href: "https://example.com/admin.html?recipe=special%2Fid" },
      { importCard, cancelEdit, headerReturnLink },
    );

    expect(recipeId).toBe("special/id");
    expect(importCard.hidden).toBe(true);
    expect(cancelEdit).toMatchObject({ hidden: false, href: "/?recipe=special%2Fid" });
    expect(headerReturnLink).toMatchObject({
      href: "/?recipe=special%2Fid",
      textContent: "レシピへ戻る",
    });
  });
});
