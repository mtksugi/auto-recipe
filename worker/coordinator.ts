import { readRecipeIndex, saveRecipe } from "./storage";
import type { Env, Recipe } from "./types";

const USER_ID_HEADER = "x-auto-recipe-user-id";

export class UserRecipeCoordinator {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {}

  fetch(request: Request): Promise<Response> {
    const result = this.queue.then(() => this.handle(request));
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async handle(request: Request): Promise<Response> {
    const userId = request.headers.get(USER_ID_HEADER)?.trim();
    if (!userId) return Response.json({ error: "ユーザーIDがありません" }, { status: 400 });

    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/recipes") {
      const recipes = await readRecipeIndex(this.env, userId);
      return Response.json({ recipes });
    }
    if (request.method === "POST" && path === "/recipes") {
      const payload = await request.json<{ recipe?: Recipe }>();
      if (!payload.recipe) return Response.json({ error: "レシピが必要です" }, { status: 400 });
      const recipes = await saveRecipe(this.env, userId, payload.recipe);
      return Response.json({ recipes });
    }
    return new Response("Not found", { status: 404 });
  }
}

async function coordinatorResponse(
  env: Env,
  userId: string,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const id = env.RECIPE_COORDINATOR.idFromName(userId);
  const stub = env.RECIPE_COORDINATOR.get(id);
  const headers = new Headers(init?.headers);
  headers.set(USER_ID_HEADER, userId);
  return stub.fetch(new Request(`https://recipe-coordinator${path}`, { ...init, headers }));
}

export async function listUserRecipes(env: Env, userId: string): Promise<Recipe[] | null> {
  const response = await coordinatorResponse(env, userId, "/recipes");
  if (!response.ok) throw new Error(`レシピ一覧を取得できませんでした (${response.status})`);
  return (await response.json<{ recipes: Recipe[] | null }>()).recipes;
}

export async function saveUserRecipe(env: Env, userId: string, recipe: Recipe): Promise<Recipe[]> {
  const response = await coordinatorResponse(env, userId, "/recipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipe }),
  });
  const payload = await response.json<{ recipes?: Recipe[]; error?: string }>();
  if (!response.ok || !payload.recipes) throw new Error(payload.error || `レシピを保存できませんでした (${response.status})`);
  return payload.recipes;
}
