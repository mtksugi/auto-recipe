import { editRecipeId } from "./admin-model.js";
import { recipeViewerUrl } from "./navigation.js";

export function configureEditNavigation(location, { importCard, cancelEdit, headerReturnLink }) {
  const recipeId = editRecipeId(location);
  if (!recipeId) return "";
  const returnUrl = recipeViewerUrl(recipeId);
  importCard.hidden = true;
  cancelEdit.hidden = false;
  cancelEdit.href = returnUrl;
  headerReturnLink.href = returnUrl;
  headerReturnLink.textContent = "レシピへ戻る";
  return recipeId;
}
