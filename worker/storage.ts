import type { Env, Recipe } from "./types";

const INDEX_KEY = "data/recipes.json";

export function validateRecipe(value: unknown): asserts value is Recipe {
  if (!value || typeof value !== "object") throw new Error("レシピが必要です");
  const recipe = value as Partial<Recipe>;
  if (!recipe.id?.trim()) throw new Error("レシピIDが必要です");
  if (!recipe.title?.trim()) throw new Error("タイトルが必要です");
  if (!Array.isArray(recipe.ingredients) || !Array.isArray(recipe.steps)) {
    throw new Error("材料または作り方の形式が不正です");
  }
}

export function upsertRecipe(recipes: Recipe[], recipe: Recipe): Recipe[] {
  const next = recipes.filter((item) => item.id !== recipe.id);
  next.push(recipe);
  return next.sort((a, b) => a.title.localeCompare(b.title, "ja"));
}

export async function readRecipeIndex(bucket: R2Bucket): Promise<Recipe[] | null> {
  const object = await bucket.get(INDEX_KEY);
  if (!object) return null;
  return object.json<Recipe[]>();
}

export async function readBundledRecipeIndex(env: Env, requestUrl: string): Promise<Recipe[]> {
  const url = new URL("/data/recipes.json", requestUrl);
  const response = await env.ASSETS.fetch(new Request(url));
  if (!response.ok) return [];
  return response.json<Recipe[]>();
}

export async function saveRecipe(env: Env, recipe: Recipe, requestUrl: string): Promise<Recipe[]> {
  validateRecipe(recipe);
  const current = await readRecipeIndex(env.RECIPES) ?? await readBundledRecipeIndex(env, requestUrl);
  const recipes = upsertRecipe(current, recipe);
  const body = JSON.stringify(recipe, null, 2) + "\n";
  const encodedId = encodeURIComponent(recipe.id);
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  await env.RECIPES.put(`history/${encodedId}/${timestamp}.json`, body, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { title: recipe.title },
  });
  await env.RECIPES.put(`recipes/${encodedId}.json`, body, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { title: recipe.title },
  });
  await env.RECIPES.put(INDEX_KEY, JSON.stringify(recipes, null, 2) + "\n", {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  return recipes;
}
