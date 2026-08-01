import { describe, expect, it } from "vitest";
import {
  canonicalMainIngredient,
  displayAmount,
  filterRecipes,
  normalize,
  parseNumber,
  resolveSelection,
  scaledAmount,
} from "../../web/js/recipe.js";

const eggRecipe = {
  id: "egg",
  title: "トマトと卵の炒め物",
  title_reading: "とまととたまごのいためもの",
  servings: 2,
  categories: ["主菜"],
  tags: [],
  main_ingredients: [{ name: "卵", reading: "たまご", aliases: ["玉子"] }],
  ingredients: [{ name: "トマト", reading: "とまと", aliases: [] }],
};

const porkRecipe = {
  id: "pork",
  title: "豚ニラ玉",
  title_reading: "ぶたにらたま",
  servings: 2,
  categories: ["主菜"],
  tags: [],
  main_ingredients: [{ name: "豚肉", reading: "ぶたにく", aliases: ["豚こま"] }],
  ingredients: [{ name: "卵", reading: "たまご", aliases: [] }],
};

describe("frontend recipe behavior", () => {
  it("normalizes width, spaces and katakana", () => {
    expect(normalize(" ナ ス ")).toBe("なす");
  });

  it("merges eggplant spelling variants", () => {
    expect(canonicalMainIngredient("茄子")).toBe("なす");
    expect(canonicalMainIngredient("ナス")).toBe("なす");
  });

  it("parses fractions and mixed fractions", () => {
    expect(parseNumber("1/2")).toBe(0.5);
    expect(parseNumber("1と1/2")).toBe(1.5);
  });

  it("scales ranges", () => {
    expect(scaledAmount("2〜3", 2)).toBe("4〜6");
  });

  it("keeps non-scalable ingredients unchanged", () => {
    expect(displayAmount({ amount: "少々", unit: null, scalable: false }, eggRecipe, 4)).toBe("少々");
  });

  it("formats Japanese spoon units", () => {
    expect(displayAmount({ amount: "1", unit: "大さじ", scalable: true }, eggRecipe, 4)).toBe("大さじ2");
  });

  it("ranks a main ingredient match above an ordinary ingredient match", () => {
    const results = filterRecipes([porkRecipe, eggRecipe], { query: "卵" });
    expect(results.map((recipe: { id: string }) => recipe.id)).toEqual(["egg", "pork"]);
  });

  it("filters by category and main ingredient", () => {
    const results = filterRecipes([porkRecipe, eggRecipe], { category: "主菜", mainIngredient: "豚肉" });
    expect(results.map((recipe: { id: string }) => recipe.id)).toEqual(["pork"]);
  });

  it("selects the first filtered recipe when the previous selection disappeared", () => {
    expect(resolveSelection([porkRecipe], "egg")).toEqual({ recipe: porkRecipe, changed: true });
    expect(resolveSelection([porkRecipe], "pork")).toEqual({ recipe: porkRecipe, changed: false });
  });
});
