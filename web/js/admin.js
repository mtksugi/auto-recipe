import { updateIngredient, updateStep } from "./admin-model.js";

const $ = (selector) => document.querySelector(selector);
let candidate = null;

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
  event.preventDefault(); setStatus("変換中です。しばらくお待ちください。");
  const submitButton = event.submitter;
  if (submitButton) submitButton.disabled = true;
  try {
    const url = $("#urlInput").value.trim(); const file = $("#fileInput").files[0]; const payload = {};
    if (url) payload.url = url;
    else if (file) { payload.filename = file.name; payload.mime = file.type || "application/octet-stream"; payload.data = (await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = reject; reader.readAsDataURL(file); })); }
    else throw new Error("URLまたはファイルを指定してください");
    const response = await fetch("/api/normalize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || "変換に失敗しました");
    renderEditor(data.recipe); setStatus("変換しました。内容を確認して保存してください。");
  } catch (error) { setStatus(error.message, true); }
  finally { if (submitButton) submitButton.disabled = false; }
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
    window.location.href = "/";
  } catch (error) { setStatus("保存できませんでした。", true); $("#saveError").textContent = error.message; }
  finally { if (submitButton) submitButton.disabled = false; }
});
