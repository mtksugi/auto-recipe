export function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ァ-ン]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s　]/g, "");
}

export function allMainIngredientTerms(recipe) {
  return (recipe.main_ingredients ?? []).flatMap((item) => [item.name, item.reading, ...(item.aliases ?? [])]);
}

export function allIngredientTerms(recipe) {
  return (recipe.ingredients ?? []).flatMap((item) => [item.name, item.reading, ...(item.aliases ?? [])]);
}

export function canonicalMainIngredient(value) {
  const key = normalize(value);
  if (["なす", "茄子", "ナス"].map(normalize).includes(key)) return "なす";
  return value;
}

export function safeHttpUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function searchableTerms(recipe) {
  return [
    recipe.title,
    recipe.title_reading,
    ...(recipe.tags ?? []),
    ...(recipe.categories ?? []),
    ...allMainIngredientTerms(recipe),
    ...allIngredientTerms(recipe),
  ].map(normalize);
}

export function scoreRecipe(recipe, query) {
  if (!query) return 0;
  const q = normalize(query);
  const title = [recipe.title, recipe.title_reading].map(normalize);
  const main = allMainIngredientTerms(recipe).map(normalize);
  const categories = (recipe.categories ?? []).map(normalize);
  const ingredients = allIngredientTerms(recipe).map(normalize);
  if (title.some((term) => term.includes(q))) return 100;
  if (main.some((term) => term.includes(q))) return 80;
  if (categories.some((term) => term.includes(q))) return 60;
  if (ingredients.some((term) => term.includes(q))) return 40;
  if (searchableTerms(recipe).some((term) => term.includes(q))) return 20;
  return -1;
}

export function filterRecipes(recipes, filters = {}) {
  const query = normalize(filters.query);
  return recipes
    .map((recipe) => ({ recipe, score: scoreRecipe(recipe, query) }))
    .filter(({ recipe, score }) => {
      const queryMatches = !query || score >= 0;
      const categoryMatches = !filters.category || (recipe.categories ?? []).includes(filters.category);
      const ingredientMatches = !filters.mainIngredient || allMainIngredientTerms(recipe)
        .some((term) => canonicalMainIngredient(term) === filters.mainIngredient);
      return queryMatches && categoryMatches && ingredientMatches;
    })
    .sort((a, b) => b.score - a.score || a.recipe.title.localeCompare(b.recipe.title, "ja"))
    .map(({ recipe }) => recipe);
}

export function uniqueValues(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "ja"));
}

export function resolveSelection(recipes, selectedId) {
  const selected = recipes.find((recipe) => recipe.id === selectedId);
  if (selected) return { recipe: selected, changed: false };
  return { recipe: recipes[0] ?? null, changed: true };
}

export function parseNumber(value) {
  const text = String(value ?? "").replace(/と/g, " ").replace(/／/g, "/").trim();
  const mixed = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  return null;
}

export function formatNumber(value) {
  if (Math.abs(value - Math.round(value)) < 0.0001) return String(Math.round(value));
  return `約${value.toFixed(1).replace(/\.0$/, "")}`;
}

export function scaledAmount(amount, factor) {
  if (amount == null || factor === 1) return amount;
  const range = String(amount).match(/^(.*?)\s*[〜～-]\s*(.*?)$/);
  if (range) {
    const low = parseNumber(range[1]);
    const high = parseNumber(range[2]);
    if (low != null && high != null) return `${formatNumber(low * factor)}〜${formatNumber(high * factor)}`;
  }
  const value = parseNumber(amount);
  return value == null ? amount : formatNumber(value * factor);
}

export function displayAmount(ingredient, recipe, targetServings) {
  const amount = ingredient.amount;
  const unit = ingredient.unit ?? "";
  if (amount == null && !unit) return "適量";
  const factor = recipe.servings && targetServings ? targetServings / recipe.servings : 1;
  const shown = ingredient.scalable ? scaledAmount(amount, factor) : amount;
  if (!unit) return shown ?? "適量";
  if (/^(大さじ|小さじ|カップ)$/.test(unit)) return `${unit}${shown ?? ""}`;
  if (/^(本|個|枚|袋|缶|束|片|パック|g|kg|ml|cc)$/.test(unit)) return `${shown ?? ""}${unit}`;
  return `${shown ?? ""} ${unit}`.trim();
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}
