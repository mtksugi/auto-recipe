export function updateIngredient(original, edits, fallbackId) {
  return {
    id: original?.id || fallbackId,
    name: edits.name,
    reading: original?.reading ?? "",
    aliases: original?.aliases ?? [],
    amount: edits.amount || null,
    unit: edits.unit || null,
    scalable: edits.scalable,
    section: original?.section ?? null,
  };
}

export function updateStep(original, text, number) {
  return {
    number,
    text,
    ingredient_refs: original?.ingredient_refs ?? [],
    time_minutes: original?.time_minutes ?? null,
  };
}
