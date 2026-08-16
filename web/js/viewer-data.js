export async function fetchRecipeIndex(fetcher) {
  const response = await fetcher("data/recipes.json", { cache: "no-store" });
  if (!response.ok) throw new Error("レシピ一覧を取得できませんでした");
  return response.json();
}
