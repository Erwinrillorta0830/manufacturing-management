import type {
  LotStoredProductSummary,
  ProductClassification,
} from "../../shared/types/lot-tracking.types";

export function findQALotContentConflicts(
  summary: LotStoredProductSummary | undefined,
  targetClassification: ProductClassification,
  targetProductId?: number
): LotStoredProductSummary["stored_products"] {
  if (
    !summary ||
    summary.is_empty ||
    summary.total_stored_quantity <= 0 ||
    targetClassification === "OTHER"
  ) {
    return [];
  }

  return summary.stored_products.filter((stored) => {
    if (targetProductId && stored.product_id === targetProductId) return false;
    if (stored.classification === "OTHER" || stored.classification === targetClassification) return false;
    return stored.onhand_quantity > 0 || Number(stored.draft_quantity || 0) > 0;
  });
}
