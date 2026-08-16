import { editRecipeId, updateIngredient, updateStep } from "./admin-model.js";
import { recipeViewerUrl } from "./navigation.js";

const $ = (selector) => document.querySelector(selector);
let candidate = null;
let editingRecipeId = "";
let deletingRecipe = false;

const importState = { method: "url", loading: false };
const importTabs = [$("#urlTab"), $("#fileTab")];

function setImportMethod(method, focus = false) {
  if (importState.loading) return;
  importState.method = method;
  const urlSelected = method === "url";
  $("#urlPanel").hidden = !urlSelected;
  $("#filePanel").hidden = urlSelected;
  importTabs.forEach((tab) => {
    const selected = tab.id === (urlSelected ? "urlTab" : "fileTab");
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  if (focus) $(urlSelected ? "#urlInput" : "#fileInput").focus();
}

function setImportLoading(loading) {
  importState.loading = loading;
  $("#importForm").setAttribute("aria-busy", String(loading));
  $("#loadingStatus").hidden = !loading;
  $("#importButton").disabled = loading;
  $("#importButton").textContent = loading ? "読み取り中…" : "レシピを取り込む";
  [$("#urlInput"), $("#fileInput"), ...importTabs].forEach((control) => { control.disabled = loading; });
}

importTabs.forEach((tab, index) => {
  tab.addEventListener("click", () => setImportMethod(tab.id === "urlTab" ? "url" : "file", true));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const next = importTabs[index === 0 ? 1 : 0];
    setImportMethod(next.id === "urlTab" ? "url" : "file", true);
    next.focus();
  });
});

function setStatus(message, error = false) { const el = $("#status"); el.textContent = message; el.classList.toggle("error", error); }
function rowInput(value = "", placeholder = "") { const input = document.createElement("input"); input.value = value ?? ""; input.placeholder = placeholder; return input; }

function renderEditor(recipe) {
  candidate = structuredClone(recipe);
  $("#editor").hidden = false;
  $("#recipeId").value = recipe.id ?? "";
  $("#titleInput").value = recipe.title ?? "";
  $("#servingsInput").value = recipe.servings ?? "";
  $("#timeInput").value = recipe.time_minutes ?? "";
  $("#tagsInput").value = (recipe.tags ?? []).join(", ");
  $("#notesInput").value = (recipe.notes ?? []).join("\n");
  renderIngredients(recipe.ingredients ?? []);
  renderSteps(recipe.steps ?? []);
  $("#editor").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadRecipeForEditing() {
  editingRecipeId = editRecipeId(window.location);
  if (!editingRecipeId) return;
  const returnUrl = recipeViewerUrl(editingRecipeId);
  $("#importCard").hidden = true;
  $("#cancelEdit").hidden = false;
  $("#cancelEdit").href = returnUrl;
  $("#headerReturnLink").href = returnUrl;
  $("#headerReturnLink").textContent = "レシピへ戻る";
  try {
    const response = await fetch("/data/recipes.json", { cache: "no-store" });
    if (!response.ok) throw new Error("レシピ一覧を取得できませんでした");
    const recipes = await response.json();
    const recipe = recipes.find((item) => item.id === editingRecipeId);
    if (!recipe) throw new Error("編集するレシピが見つかりません");
    document.title = `${recipe.title}を編集 | auto-recipe`;
    $("#pageTitle").textContent = "レシピを編集";
    $("#editorTitle").textContent = "保存済みレシピを編集";
    $("#editorHelp").textContent = "変更内容を確認して保存してください";
    $("#dangerZone").hidden = false;
    renderEditor(recipe);
  } catch (error) {
    $("#importCard").hidden = false;
    setStatus(error.message, true);
  }
}

function renderIngredients(items) {
  const root = $("#ingredientsEditor"); root.innerHTML = "";
  items.forEach((item) => {
    const row = document.createElement("div"); row.className = "ingredient-row"; row.dataset.id = item.id ?? "";
    row.append(rowInput(item.name, "材料名"), rowInput(item.amount, "分量"), rowInput(item.unit, "単位"));
    const label = document.createElement("label"); const check = document.createElement("input"); check.type = "checkbox"; check.checked = item.scalable !== false; label.append(check, "換算"); row.append(label);
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove-button"; remove.textContent = "削除"; remove.addEventListener("click", () => row.remove()); row.append(remove); root.append(row);
  });
}

function renderSteps(items) {
  const root = $("#stepsEditor"); root.innerHTML = "";
  items.forEach((item, index) => {
    appendStepRow(root, item, index + 1, index);
  });
}

function appendStepRow(root, item, numberValue, originalIndex) {
  const row = document.createElement("div"); row.className = "step-row"; row.dataset.originalIndex = originalIndex;
  const number = document.createElement("span"); number.className = "step-number"; number.textContent = numberValue;
  const text = document.createElement("textarea"); text.rows = 2; text.value = item.text ?? "";
  const remove = document.createElement("button"); remove.type = "button"; remove.className = "remove-button"; remove.textContent = "削除"; remove.addEventListener("click", () => row.remove());
  row.append(number, text, remove); root.append(row);
}

function collectRecipe() {
  const recipe = structuredClone(candidate ?? {});
  recipe.id = $("#recipeId").value || recipe.id;
  recipe.title = $("#titleInput").value.trim();
  recipe.servings = $("#servingsInput").value ? Number($("#servingsInput").value) : null;
  recipe.time_minutes = $("#timeInput").value ? Number($("#timeInput").value) : null;
  recipe.tags = $("#tagsInput").value.split(",").map((x) => x.trim()).filter(Boolean);
  recipe.notes = $("#notesInput").value.split("\n").map((x) => x.trim()).filter(Boolean);
  recipe.ingredients = [...document.querySelectorAll("#ingredientsEditor .ingredient-row")].map((row, index) => {
    const inputs = row.querySelectorAll("input");
    const original = (candidate?.ingredients ?? []).find((item) => item.id === row.dataset.id);
    return updateIngredient(original, {
      name: inputs[0].value.trim(),
      amount: inputs[1].value.trim(),
      unit: inputs[2].value.trim(),
      scalable: row.querySelector('input[type="checkbox"]').checked,
    }, row.dataset.id || `ingredient_${index + 1}`);
  }).filter((item) => item.name);
  recipe.steps = [...document.querySelectorAll("#stepsEditor .step-row")].map((row, index) => {
    const original = (candidate?.steps ?? [])[Number(row.dataset.originalIndex)];
    return updateStep(original, row.querySelector("textarea").value.trim(), index + 1);
  }).filter((item) => item.text);
  return recipe;
}

$("#importForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("");
  setImportLoading(true);
  try {
    const url = $("#urlInput").value.trim(); const file = $("#fileInput").files[0]; const payload = {};
    if (importState.method === "url" && url) payload.url = url;
    else if (importState.method === "file" && file) {
      if (file.size > 15 * 1024 * 1024) throw new Error("ファイルは15MB以下にしてください");
      payload.filename = file.name; payload.mime = file.type || "application/octet-stream"; payload.data = (await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); })); }
    else throw new Error(importState.method === "url" ? "URLを入力してください" : "ファイルを選択してください");
    const response = await fetch("/api/normalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "レシピを読み取れませんでした");
    renderEditor(data.recipe); setStatus("内容を読み取りました。確認して保存してください。");
  } catch (error) { setStatus(`${error.message} 入力内容を確認して、もう一度お試しください。`, true); }
  finally { setImportLoading(false); }
});

$("#addIngredient").addEventListener("click", () => renderIngredients([...collectRecipe().ingredients, { id: `ingredient_${Date.now()}`, name: "", amount: null, unit: null, scalable: true }]));
$("#addStep").addEventListener("click", () => {
  const root = $("#stepsEditor");
  appendStepRow(root, { text: "" }, root.querySelectorAll(".step-row").length + 1, -1);
});
$("#recipeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = event.submitter;
  if (submitButton) submitButton.disabled = true;
  $("#saveError").textContent = "";
  setStatus("保存中です。");
  try {
    const recipe = collectRecipe();
    const response = await fetch("/api/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipe }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "保存に失敗しました");
    sessionStorage.setItem("recipeSaved", recipe.title);
    window.location.href = recipeViewerUrl(recipe.id);
  } catch (error) { setStatus("保存できませんでした。", true); $("#saveError").textContent = error.message; }
  finally { if (submitButton) submitButton.disabled = false; }
});

$("#deleteRecipe").addEventListener("click", async () => {
  if (!candidate || !editingRecipeId) return;
  const title = $("#titleInput").value.trim() || candidate.title;
  $("#deleteDialogDescription").textContent = `「${title}」を完全に削除します。`;
  $("#deleteDialog").showModal();
  $("#cancelDelete").focus();
});

$("#deleteDialog").addEventListener("cancel", (event) => {
  if (deletingRecipe) event.preventDefault();
});

$("#confirmDelete").addEventListener("click", async () => {
  if (!candidate || !editingRecipeId || deletingRecipe) return;
  deletingRecipe = true;
  $("#confirmDelete").disabled = true;
  $("#cancelDelete").disabled = true;
  $("#saveError").textContent = "";
  setStatus("削除中です。");
  try {
    const response = await fetch(`/api/recipes/${encodeURIComponent(editingRecipeId)}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "削除に失敗しました");
    sessionStorage.setItem("recipeDeleted", candidate.title);
    window.location.href = "/";
  } catch (error) {
    $("#deleteDialog").close();
    setStatus("削除できませんでした。", true);
    $("#saveError").textContent = error.message;
  } finally {
    deletingRecipe = false;
    $("#confirmDelete").disabled = false;
    $("#cancelDelete").disabled = false;
  }
});

loadRecipeForEditing();
