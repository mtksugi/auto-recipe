import { describe, expect, it } from "vitest";
import { recipeIdFromLocation, recipeUrl, recipeViewerUrl } from "../../web/js/navigation.js";

describe("recipe URL navigation", () => {
  it("reads a selected recipe from the query string", () => {
    expect(recipeIdFromLocation({ href: "https://example.com/?recipe=pork" })).toBe("pork");
  });

  it("preserves other query parameters when selecting a recipe", () => {
    expect(recipeUrl({ href: "https://example.com/?query=egg" }, "pork")).toBe("/?query=egg&recipe=pork");
  });

  it("removes only the recipe parameter when returning to the list", () => {
    expect(recipeUrl({ href: "https://example.com/?recipe=pork&query=egg" }, "")).toBe("/?query=egg");
  });

  it("builds a viewer URL for the edited recipe", () => {
    expect(recipeViewerUrl("special/id")).toBe("/?recipe=special%2Fid");
  });

  it("builds the recipe list URL when no recipe is selected", () => {
    expect(recipeViewerUrl("")).toBe("/");
  });
});
