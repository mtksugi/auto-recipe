import {
  allMainIngredientTerms,
  canonicalMainIngredient,
  displayAmount,
  escapeHtml,
  filterRecipes,
  resolveSelection,
  safeHttpUrl,
  uniqueValues,
} from "./recipe.js";

const state = {
  recipes: [],
  query: "",
  category: "",
  mainIngredient: "",
  selectedId: "",
  servings: null,
};

const $ = (selector) => document.querySelector(selector);

function filteredRecipes() {
  return filterRecipes(state.recipes, state);
}

function renderFilters() {
  const categories = uniqueValues(state.recipes.flatMap((recipe) => recipe.categories ?? []));
  const mainIngredients = uniqueValues(state.recipes.flatMap((recipe) => (recipe.main_ingredients ?? []).map((item) => canonicalMainIngredient(item.name))));
  $("#categoryFilters").innerHTML = [chip("", "すべて", state.category === "", "category"), ...categories.map((value) => chip(value, value, state.category === value, "category"))].join("");
  $("#ingredientFilters").innerHTML = [chip("", "すべて", state.mainIngredient === "", "mainIngredient"), ...mainIngredients.map((value) => chip(value, value, state.mainIngredient === value, "mainIngredient"))].join("");
  document.querySelectorAll("[data-category]").forEach((button) => button.addEventListener("click", () => { state.category = button.dataset.category; render(); }));
  document.querySelectorAll("[data-main-ingredient]").forEach((button) => button.addEventListener("click", () => { state.mainIngredient = button.dataset.mainIngredient; render(); }));
}

function chip(value, label, active, kind) {
  const attribute = kind === "mainIngredient" ? `data-main-ingredient="${escapeHtml(value)}"` : `data-category="${escapeHtml(value)}"`;
  return `<button class="chip${active ? " active" : ""}" type="button" ${attribute}>${escapeHtml(label)}</button>`;
}

function renderList(recipes) {
  $("#resultCount").textContent = `${recipes.length}件のレシピ`;
  $("#recipeList").innerHTML = recipes.length ? recipes.map((recipe) => {
    const meta = [...(recipe.categories ?? []), ...(recipe.main_ingredients ?? []).slice(0, 2).map((item) => item.name)];
    return `<button class="recipe-card${recipe.id === state.selectedId ? " selected" : ""}" type="button" data-recipe-id="${escapeHtml(recipe.id)}">
      <h3>${escapeHtml(recipe.title)}</h3>
      <div class="card-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>
    </button>`;
  }).join("") : `<p class="empty-detail">条件に合うレシピがありません。</p>`;
  document.querySelectorAll("[data-recipe-id]").forEach((button) => button.addEventListener("click", () => {
    state.selectedId = button.dataset.recipeId;
    const recipe = state.recipes.find((item) => item.id === state.selectedId);
    state.servings = recipe?.servings ?? null;
    render();
    $("#recipeDetail").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

function renderDetail() {
  const recipe = state.recipes.find((item) => item.id === state.selectedId);
  if (!recipe) {
    $("#recipeDetail").innerHTML = `<div class="empty-detail"><span class="empty-icon">🍳</span><h2>レシピを選んでください</h2><p>手元にある材料や料理名から探せます。</p></div>`;
    return;
  }
  const targetServings = recipe.servings ? (state.servings || recipe.servings) : null;
  const flags = recipe.review_flags ?? [];
  const sourceUrl = safeHttpUrl(recipe.source?.url);
  const source = sourceUrl ? `<a class="source-link" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer noopener">元ソースを開く</a>` : "";
  $("#recipeDetail").innerHTML = `<article>
    <header class="detail-header">
      <p class="detail-kicker">${escapeHtml((recipe.categories ?? []).join(" · ") || "RECIPE")}</p>
      <h2>${escapeHtml(recipe.title)}</h2>
      <p class="detail-reading">${escapeHtml(recipe.title_reading ?? "")}</p>
    </header>
    <div class="detail-body">
      ${flags.length ? `<p class="warning"><strong>要確認：</strong>${flags.map(escapeHtml).join(" / ")}</p>` : ""}
      <div class="detail-toolbar">
        ${recipe.servings ? `<div class="servings-control"><span>何人分？</span><button class="servings-step" type="button" data-servings-delta="-1" aria-label="人数を1人減らす">−</button><input id="servingsInput" type="number" inputmode="numeric" pattern="[0-9]*" min="1" max="30" value="${targetServings}" aria-label="人数"><button class="servings-step" type="button" data-servings-delta="1" aria-label="人数を1人増やす">＋</button><span>人</span><button class="servings-reset" type="button" id="resetServings">標準に戻す</button></div>` : `<span class="servings-note">人数換算なし（原文量）</span>`}
        <div class="detail-meta">${recipe.time_minutes ? `<span class="time-badge"><span aria-hidden="true">◷</span> 調理時間 <strong>${recipe.time_minutes}分</strong></span>` : ""}${source}</div>
      </div>
      <section class="detail-section"><h3>材料</h3><ul class="ingredient-list">${(recipe.ingredients ?? []).map((ingredient) => `<li><span>${escapeHtml(ingredient.name)}</span><span class="ingredient-amount">${escapeHtml(displayAmount(ingredient, recipe, targetServings))}</span></li>`).join("")}</ul></section>
      <section class="detail-section"><h3>作り方</h3><ol class="step-list">${(recipe.steps ?? []).map((step) => `<li><span class="step-number">${step.number}</span><span>${escapeHtml(step.text)}</span></li>`).join("")}</ol></section>
      ${(recipe.notes ?? []).length ? `<section class="detail-section"><h3>メモ</h3><ul class="notes">${recipe.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul></section>` : ""}
      ${(recipe.tags ?? []).length ? `<section class="detail-section"><div class="detail-tags">${recipe.tags.map((tag) => `<span class="detail-tag">${escapeHtml(tag)}</span>`).join("")}</div></section>` : ""}
    </div>
  </article>`;
  const servingsInput = $("#servingsInput");
  const commitServings = () => {
    if (!servingsInput) return;
    const value = Number(servingsInput.value);
    state.servings = Math.min(30, Math.max(1, value || recipe.servings));
    renderDetail();
  };
  servingsInput?.addEventListener("input", (event) => {
    state.servings = event.target.value === "" ? null : Math.min(30, Math.max(1, Number(event.target.value)));
  });
  servingsInput?.addEventListener("change", commitServings);
  servingsInput?.addEventListener("blur", commitServings);
  document.querySelectorAll("[data-servings-delta]").forEach((button) => button.addEventListener("click", () => {
    const current = Number(servingsInput?.value) || recipe.servings;
    state.servings = Math.min(30, Math.max(1, current + Number(button.dataset.servingsDelta)));
    renderDetail();
  }));
  $("#resetServings")?.addEventListener("click", () => {
    state.servings = recipe.servings;
    renderDetail();
  });
}

function render() {
  renderFilters();
  const recipes = filteredRecipes();
  const selection = resolveSelection(recipes, state.selectedId);
  if (selection.changed) {
    state.selectedId = selection.recipe?.id ?? "";
    state.servings = selection.recipe?.servings ?? null;
  }
  renderList(recipes);
  renderDetail();
}

async function init() {
  try {
    state.recipes = await fetch("data/recipes.json").then((response) => response.json());
    $("#searchInput").addEventListener("input", (event) => { state.query = event.target.value; render(); });
    $("#clearFilters").addEventListener("click", () => { state.query = ""; state.category = ""; state.mainIngredient = ""; $("#searchInput").value = ""; render(); });
    render();
  } catch (error) {
    $("#recipeDetail").innerHTML = `<div class="empty-detail"><h2>レシピを読み込めませんでした</h2><p>HTTPサーバー経由で web/ を開いてください。</p></div>`;
    console.error(error);
  }
}

init();
