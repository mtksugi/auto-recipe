import { Hono } from "hono";
import { requireAuthenticatedUser } from "./auth";
import { listUserRecipes, saveUserRecipe } from "./coordinator";
import { normalizeRecipe } from "./openai";
import type { Env, Recipe } from "./types";

export { UserRecipeCoordinator } from "./coordinator";

const app = new Hono<{ Bindings: Env }>();

app.onError((error, context) => {
  console.error(error);
  return context.json({ error: error.message || "処理に失敗しました" }, 400);
});

app.post("/api/normalize", async (context) => {
  await requireAuthenticatedUser(context.req.raw, context.env);
  const payload = await context.req.json();
  const recipe = await normalizeRecipe(payload, context.env);
  return context.json({ recipe });
});

app.post("/api/save", async (context) => {
  const user = await requireAuthenticatedUser(context.req.raw, context.env);
  const payload = await context.req.json<{ recipe?: Recipe }>();
  if (!payload.recipe) throw new Error("レシピが必要です");
  const recipes = await saveUserRecipe(context.env, user.id, payload.recipe);
  return context.json({ saved: `recipes/${payload.recipe.id}.json`, recipe: payload.recipe, viewer_count: recipes.length });
});

app.get("/data/recipes.json", async (context) => {
  const user = await requireAuthenticatedUser(context.req.raw, context.env);
  const recipes = await listUserRecipes(context.env, user.id);
  if (recipes) return context.json(recipes);
  return context.env.ASSETS.fetch(context.req.raw);
});

app.all("*", (context) => context.env.ASSETS.fetch(context.req.raw));

export default app;
