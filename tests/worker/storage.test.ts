import { describe, expect, it } from "vitest";
import { deleteRecipe, normalizeLegacyRecipe, readRecipeIndex, saveRecipe, upsertRecipe, userPrefix, validateRecipe } from "../../worker/storage";
import type { Env, Recipe } from "../../worker/types";

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

class MemoryBucket {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<R2ObjectBody | null> {
    const value = this.values.get(key);
    if (value == null) return null;
    return {
      json: async <T>() => JSON.parse(value) as T,
      text: async () => value,
    } as R2ObjectBody;
  }

  async put(key: string, value: string | ReadableStream | ArrayBuffer | ArrayBufferView | Blob | null, options?: R2PutOptions): Promise<R2Object | null> {
    if (options?.onlyIf && !(options.onlyIf instanceof Headers) && options.onlyIf.etagDoesNotMatch === "*" && this.values.has(key)) {
      return null;
    }
    this.values.set(key, String(value ?? ""));
    return {} as R2Object;
  }


  async list(options?: R2ListOptions): Promise<R2Objects> {
    const objects = [...this.values.keys()]
      .filter((key) => !options?.prefix || key.startsWith(options.prefix))
      .map((key) => ({ key }) as R2Object);
    return { objects, truncated: false } as R2Objects;
  }

  async delete(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.values.delete(key);
  }
}

function environment(bucket: MemoryBucket): Env {
  return {
    RECIPES: bucket as unknown as R2Bucket,
    ASSETS: { fetch: async () => Response.json([recipe("sample", "サンプル")]) } as unknown as Fetcher,
  } as Env;
}

describe("recipe storage", () => {
  it("replaces an existing recipe by id", () => {
    const result = upsertRecipe([recipe("one", "古い名前")], recipe("one", "新しい名前"));
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("新しい名前");
  });

  it("validates the complete schema and source URL", () => {
    const missingId = recipe("", "料理");
    expect(() => validateRecipe(missingId)).toThrow("レシピID");
    expect(() => validateRecipe({ ...recipe("id", "料理"), categories: "主菜" })).toThrow("categories");
    expect(() => validateRecipe({
      ...recipe("id", "料理"),
      source: { type: "url", url: "javascript:alert(1)", site: null, filename: null },
    })).toThrow("httpまたはhttps");
  });

  it("rejects dangling ingredient references", () => {
    const value = recipe("id", "料理");
    value.steps = [{ number: 1, text: "炒める", ingredient_refs: ["missing"], time_minutes: null }];
    expect(() => validateRecipe(value)).toThrow("存在しない材料ID");
  });

  it("uses an encoded user prefix", () => {
    expect(userPrefix("access/user id")).toBe("users/access%2Fuser%20id");
  });

  it("adds nullable step times while migrating old data", () => {
    const old = recipe("old", "旧レシピ") as unknown as Record<string, unknown>;
    old.steps = [{ number: 1, text: "加熱する", ingredient_refs: [] }];
    expect(normalizeLegacyRecipe(old).steps[0].time_minutes).toBeNull();
  });

  it("claims and migrates the legacy index for only the first Access user", async () => {
    const bucket = new MemoryBucket();
    bucket.values.set("data/recipes.json", JSON.stringify([recipe("legacy", "既存レシピ")]));
    const env = environment(bucket);

    expect(await readRecipeIndex(env, "owner-sub")).toEqual([recipe("legacy", "既存レシピ")]);
    expect(bucket.values.has("users/owner-sub/data/recipes.json")).toBe(true);
    expect(bucket.values.has("users/owner-sub/recipes/legacy.json")).toBe(true);
    expect(await readRecipeIndex(env, "other-sub")).toBeNull();
  });

  it("saves different users into different R2 prefixes", async () => {
    const bucket = new MemoryBucket();
    const env = environment(bucket);

    await saveRecipe(env, "user-a", recipe("a", "Aの料理"));
    await saveRecipe(env, "user-b", recipe("b", "Bの料理"));

    expect(bucket.values.has("users/user-a/data/recipes.json")).toBe(true);
    expect(bucket.values.has("users/user-b/data/recipes.json")).toBe(true);
    expect(bucket.values.get("users/user-a/data/recipes.json")).toContain("Aの料理");
    expect(bucket.values.get("users/user-a/data/recipes.json")).not.toContain("Bの料理");
  });

  it("deletes the recipe from the index, individual JSON, and all history", async () => {
    const bucket = new MemoryBucket();
    const env = environment(bucket);
    await saveRecipe(env, "user-a", recipe("special/id", "削除対象"));
    await saveRecipe(env, "user-a", recipe("special/id", "更新後"));
    await saveRecipe(env, "user-a", recipe("keep", "残す料理"));

    const recipes = await deleteRecipe(env, "user-a", "special/id");

    expect(recipes.map((item) => item.id)).not.toContain("special/id");
    expect(recipes.map((item) => item.id)).toContain("keep");
    expect(bucket.values.get("users/user-a/data/recipes.json")).not.toContain("special/id");
    expect(bucket.values.has("users/user-a/recipes/special%2Fid.json")).toBe(false);
    expect([...bucket.values.keys()].some((key) => key.startsWith("users/user-a/history/special%2Fid/"))).toBe(false);
    expect(bucket.values.has("users/user-a/recipes/keep.json")).toBe(true);
  });

  it("does not change storage when the deletion target is missing", async () => {
    const bucket = new MemoryBucket();
    const env = environment(bucket);
    await saveRecipe(env, "user-a", recipe("keep", "残す料理"));
    const before = new Map(bucket.values);

    await expect(deleteRecipe(env, "user-a", "missing")).rejects.toThrow("見つかりません");
    expect(bucket.values).toEqual(before);
  });
});
