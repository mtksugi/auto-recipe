export function recipeIdFromLocation(locationLike) {
  return new URL(locationLike.href).searchParams.get("recipe") ?? "";
}

export function recipeUrl(locationLike, recipeId) {
  const url = new URL(locationLike.href);
  if (recipeId) url.searchParams.set("recipe", recipeId);
  else url.searchParams.delete("recipe");
  return `${url.pathname}${url.search}${url.hash}`;
}
