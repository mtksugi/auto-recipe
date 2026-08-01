import { describe, expect, it } from "vitest";
import { updateIngredient, updateStep } from "../../web/js/admin-model.js";

describe("admin editor model", () => {
  it("keeps ingredient metadata while applying edits", () => {
    const original = {
      id: "egg",
      name: "卵",
      reading: "たまご",
      aliases: ["玉子"],
      amount: "2",
      unit: "個",
      scalable: true,
      section: "具材",
    };
    expect(updateIngredient(original, {
      name: "卵（Mサイズ）",
      amount: "3",
      unit: "個",
      scalable: true,
    }, "fallback")).toEqual({
      ...original,
      name: "卵（Mサイズ）",
      amount: "3",
    });
  });

  it("keeps step references and time while renumbering", () => {
    const original = { number: 4, text: "炒める", ingredient_refs: ["egg"], time_minutes: 3 };
    expect(updateStep(original, "中火で炒める", 2)).toEqual({
      number: 2,
      text: "中火で炒める",
      ingredient_refs: ["egg"],
      time_minutes: 3,
    });
  });
});
