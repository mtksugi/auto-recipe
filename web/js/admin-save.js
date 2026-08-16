import { recipeViewerUrl } from "./navigation.js";

export async function saveRecipeAndRedirect(recipe, { fetcher, storage, navigate }) {
  const response = await fetcher("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ recipe }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "保存に失敗しました");
  storage.setItem("recipeSaved", recipe.title);
  navigate(recipeViewerUrl(recipe.id));
}
