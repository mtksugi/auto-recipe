import {
  canonicalMainIngredient,
  displayAmount,
  escapeHtml,
  filterRecipes,
  resolveSelection,
  safeHttpUrl,
  uniqueValues,
} from "./recipe.js";
import { recipeIdFromLocation, recipeUrl } from "./navigation.js";
import { fetchRecipeIndex } from "./viewer-data.js";
import { ScreenWakeLock } from "./wake-lock.js";

const state = {
  recipes: [],
  query: "",
  category: "",
  mainIngredient: "",
  selectedId: "",
  servings: null,
};
const screenWakeLock = new ScreenWakeLock();
let wakeLockMessage = "";

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
  return `<button class="chip${active ? " active" : ""}" type="button" aria-pressed="${active}" ${attribute}>${escapeHtml(label)}</button>`;
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
    selectRecipe(button.dataset.recipeId, true);
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
      <div class="detail-title-row">
        <div>
          <p class="detail-kicker">${escapeHtml((recipe.categories ?? []).join(" · ") || "RECIPE")}</p>
          <h2>${escapeHtml(recipe.title)}</h2>
        </div>
        <a class="edit-recipe-link" href="admin.html?recipe=${encodeURIComponent(recipe.id)}"><span aria-hidden="true">✎</span> 編集</a>
      </div>
    </header>
    <div class="detail-body">
      <div class="detail-actions">
        <button id="backToList" class="back-to-list" type="button">← レシピ一覧へ</button>
        <button id="wakeLockButton" class="wake-lock-button${screenWakeLock.requested ? " active" : ""}" type="button" aria-pressed="${screenWakeLock.requested}">${screenWakeLock.requested ? "画面を消さない：オン" : "画面を消さない"}</button>
        ${wakeLockMessage ? `<p class="wake-lock-message">${escapeHtml(wakeLockMessage)}</p>` : ""}
      </div>
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
  $("#backToList")?.addEventListener("click", () => showList(true));
  $("#wakeLockButton")?.addEventListener("click", toggleWakeLock);
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

async function toggleWakeLock() {
  wakeLockMessage = "";
  try {
    if (screenWakeLock.requested) await screenWakeLock.disable();
    else if (!await screenWakeLock.enable()) wakeLockMessage = "この端末では画面消灯の防止を利用できません。";
  } catch (error) {
    screenWakeLock.requested = false;
    wakeLockMessage = "画面を消さない設定を有効にできませんでした。端末の設定をご確認ください。";
    console.error(error);
  }
  renderDetail();
}

async function showList(addHistory) {
  await screenWakeLock.disable();
  wakeLockMessage = "";
  state.selectedId = "";
  state.servings = null;
  if (addHistory) history.pushState({}, "", recipeUrl(window.location, ""));
  render();
  $("#recipeList")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function selectRecipe(id, addHistory) {
  const recipe = state.recipes.find((item) => item.id === id);
  if (!recipe) return false;
  state.selectedId = recipe.id;
  state.servings = recipe.servings ?? null;
  if (addHistory) history.pushState({}, "", recipeUrl(window.location, recipe.id));
  render();
  $("#recipeDetail").scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
}

function render() {
  renderFilters();
  const recipes = filteredRecipes();
  const selection = resolveSelection(recipes, state.selectedId);
  if (state.selectedId && selection.changed) {
    state.selectedId = "";
    state.servings = null;
    history.replaceState({}, "", recipeUrl(window.location, ""));
    screenWakeLock.disable().catch(console.error);
  }
  renderList(recipes);
  renderDetail();
}

async function init() {
  try {
    state.recipes = await fetchRecipeIndex(fetch);
    const savedRecipe = sessionStorage.getItem("recipeSaved");
    const deletedRecipe = sessionStorage.getItem("recipeDeleted");
    if (savedRecipe || deletedRecipe) {
      sessionStorage.removeItem("recipeSaved");
      sessionStorage.removeItem("recipeDeleted");
      const notice = document.createElement("p");
      notice.className = "toast";
      notice.setAttribute("role", "status");
      notice.textContent = savedRecipe ? `「${savedRecipe}」を保存しました` : `「${deletedRecipe}」を完全に削除しました`;
      document.body.append(notice);
      setTimeout(() => notice.remove(), 4500);
    }
    $("#searchInput").addEventListener("input", (event) => { state.query = event.target.value; render(); });
    $("#clearFilters").addEventListener("click", () => { state.query = ""; state.category = ""; state.mainIngredient = ""; $("#searchInput").value = ""; render(); });
    const requestedId = recipeIdFromLocation(window.location);
    if (requestedId && !selectRecipe(requestedId, false)) {
      history.replaceState({}, "", recipeUrl(window.location, ""));
      render();
    } else if (!requestedId) render();
  } catch (error) {
    $("#recipeDetail").innerHTML = `<div class="empty-detail"><h2>レシピを読み込めませんでした</h2><p>HTTPサーバー経由で web/ を開いてください。</p></div>`;
    console.error(error);
  }
}

window.addEventListener("popstate", () => {
  const recipeId = recipeIdFromLocation(window.location);
  if (recipeId) selectRecipe(recipeId, false);
  else showList(false);
});

document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !state.selectedId) return;
  try { await screenWakeLock.reacquire(); }
  catch (error) { console.error(error); }
  renderDetail();
});

init();
