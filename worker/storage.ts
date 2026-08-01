import recipeSchema from "../schemas/recipe.schema.json";
import type { Env, Recipe } from "./types";

const LEGACY_INDEX_KEY = "data/recipes.json";
const LEGACY_CLAIM_KEY = "migrations/legacy-owner.json";

interface JsonSchema {
  type?: string | string[];
  enum?: unknown[];
  minimum?: number;
  required?: string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  additionalProperties?: boolean;
}

interface LegacyClaim {
  userId: string;
  claimedAt: string;
  completedAt: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesType(value: unknown, type: string): boolean {
  if (type === "null") return value === null;
  if (type === "object") return isRecord(value);
  if (type === "array") return Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  return typeof value === type;
}

function validateSchema(value: unknown, schema: JsonSchema, path = "recipe"): void {
  const expectedTypes = schema.type ? (Array.isArray(schema.type) ? schema.type : [schema.type]) : [];
  if (expectedTypes.length && !expectedTypes.some((type) => matchesType(value, type))) {
    throw new Error(`${path}の形式が不正です`);
  }
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`${path}の値が不正です`);
  if (schema.minimum != null && typeof value === "number" && value < schema.minimum) {
    throw new Error(`${path}は${schema.minimum}以上にしてください`);
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validateSchema(item, schema.items!, `${path}[${index}]`));
  }
  if (isRecord(value) && schema.properties) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) throw new Error(`${path}.${key}がありません`);
    }
    if (schema.additionalProperties === false) {
      const unexpected = Object.keys(value).find((key) => !(key in schema.properties!));
      if (unexpected) throw new Error(`${path}.${unexpected}は保存できません`);
    }
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (key in value) validateSchema(value[key], childSchema, `${path}.${key}`);
    }
  }
}

function validSourceUrl(url: string | null): boolean {
  if (url === null) return true;
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function validateRecipe(value: unknown): asserts value is Recipe {
  validateSchema(value, recipeSchema as JsonSchema);
  const recipe = value as Recipe;
  if (!recipe.id.trim()) throw new Error("レシピIDが必要です");
  if (!recipe.title.trim()) throw new Error("タイトルが必要です");
  if (!validSourceUrl(recipe.source.url)) throw new Error("元ソースURLはhttpまたはhttpsにしてください");

  const ingredientIds = new Set<string>();
  for (const ingredient of recipe.ingredients) {
    if (!ingredient.id.trim()) throw new Error("材料IDが必要です");
    if (ingredientIds.has(ingredient.id)) throw new Error(`材料IDが重複しています: ${ingredient.id}`);
    ingredientIds.add(ingredient.id);
  }
  const danglingRef = [...recipe.steps.flatMap((step) => step.ingredient_refs),
    ...recipe.main_ingredients.flatMap((item) => item.ingredient_refs)]
    .find((ref) => !ingredientIds.has(ref));
  if (danglingRef) throw new Error(`存在しない材料IDが参照されています: ${danglingRef}`);
}

export function upsertRecipe(recipes: Recipe[], recipe: Recipe): Recipe[] {
  const next = recipes.filter((item) => item.id !== recipe.id);
  next.push(recipe);
  return next.sort((a, b) => a.title.localeCompare(b.title, "ja"));
}

export function userPrefix(userId: string): string {
  if (!userId.trim()) throw new Error("ユーザーIDが必要です");
  return `users/${encodeURIComponent(userId)}`;
}

function userIndexKey(userId: string): string {
  return `${userPrefix(userId)}/data/recipes.json`;
}

async function readIndexAt(bucket: R2Bucket, key: string): Promise<Recipe[] | null> {
  const object = await bucket.get(key);
  if (!object) return null;
  const recipes = await object.json<Recipe[]>();
  if (!Array.isArray(recipes)) throw new Error("レシピ一覧の形式が不正です");
  recipes.forEach(validateRecipe);
  return recipes;
}

export function normalizeLegacyRecipe(value: unknown): Recipe {
  if (!isRecord(value)) throw new Error("旧レシピの形式が不正です");
  const normalized = structuredClone(value);
  if (Array.isArray(normalized.steps)) {
    for (const step of normalized.steps) {
      if (isRecord(step) && !("time_minutes" in step)) step.time_minutes = null;
    }
  }
  validateRecipe(normalized);
  return normalized;
}

async function readLegacyClaim(bucket: R2Bucket): Promise<LegacyClaim | null> {
  const object = await bucket.get(LEGACY_CLAIM_KEY);
  return object ? object.json<LegacyClaim>() : null;
}

async function claimLegacyIndex(bucket: R2Bucket, userId: string): Promise<LegacyClaim | null> {
  let claim = await readLegacyClaim(bucket);
  if (!claim) {
    const claimedAt = new Date().toISOString();
    const candidate: LegacyClaim = { userId, claimedAt, completedAt: null };
    const created = await bucket.put(LEGACY_CLAIM_KEY, JSON.stringify(candidate, null, 2) + "\n", {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/json; charset=utf-8" },
    });
    claim = created ? candidate : await readLegacyClaim(bucket);
  }
  return claim?.userId === userId ? claim : null;
}

async function writeRecipeSnapshot(
  bucket: R2Bucket,
  userId: string,
  recipe: Recipe,
  historyName: string,
): Promise<void> {
  const prefix = userPrefix(userId);
  const encodedId = encodeURIComponent(recipe.id);
  const body = JSON.stringify(recipe, null, 2) + "\n";
  const options = {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { title: recipe.title },
  };
  await bucket.put(`${prefix}/history/${encodedId}/${historyName}.json`, body, options);
  await bucket.put(`${prefix}/recipes/${encodedId}.json`, body, options);
}

async function migrateLegacyIndex(env: Env, userId: string): Promise<Recipe[] | null> {
  const claim = await claimLegacyIndex(env.RECIPES, userId);
  if (!claim) return null;
  const legacyObject = await env.RECIPES.get(LEGACY_INDEX_KEY);
  if (!legacyObject) return null;
  const rawRecipes = await legacyObject.json<unknown>();
  if (!Array.isArray(rawRecipes)) throw new Error("旧レシピ一覧の形式が不正です");
  const recipes = rawRecipes.map(normalizeLegacyRecipe);

  const historyName = `migration-${claim.claimedAt.replaceAll(":", "-")}`;
  for (const recipe of recipes) await writeRecipeSnapshot(env.RECIPES, userId, recipe, historyName);
  await env.RECIPES.put(userIndexKey(userId), JSON.stringify(recipes, null, 2) + "\n", {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  const completed: LegacyClaim = { ...claim, completedAt: new Date().toISOString() };
  await env.RECIPES.put(LEGACY_CLAIM_KEY, JSON.stringify(completed, null, 2) + "\n", {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  return recipes;
}

export async function readRecipeIndex(env: Env, userId: string): Promise<Recipe[] | null> {
  return await readIndexAt(env.RECIPES, userIndexKey(userId)) ?? await migrateLegacyIndex(env, userId);
}

export async function readBundledRecipeIndex(env: Env): Promise<Recipe[]> {
  const response = await env.ASSETS.fetch(new Request("https://assets.local/data/recipes.json"));
  if (!response.ok) return [];
  const recipes = await response.json<Recipe[]>();
  recipes.forEach(validateRecipe);
  return recipes;
}

export async function saveRecipe(env: Env, userId: string, recipe: Recipe): Promise<Recipe[]> {
  validateRecipe(recipe);
  const current = await readRecipeIndex(env, userId) ?? await readBundledRecipeIndex(env);
  const recipes = upsertRecipe(current, recipe);
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  await writeRecipeSnapshot(env.RECIPES, userId, recipe, timestamp);
  await env.RECIPES.put(userIndexKey(userId), JSON.stringify(recipes, null, 2) + "\n", {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
  });
  return recipes;
}
