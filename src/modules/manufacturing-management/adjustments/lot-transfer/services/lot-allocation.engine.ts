export type ProductClassification = "RM" | "PKG" | "FG" | "OTHER";

export interface BatchCandidate {
  inventory_lot_id: number;
  lot_id: number;
  branch_id: number;
  product_id: number;
  batch_no: string;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
  unit_cost?: number | null;
  qa_status?: string;
  available_quantity: number;
  created_at?: string;
}

export interface BatchEligibilityResult {
  isEligible: boolean;
  isExpired: boolean;
  daysUntilExpiry: number | null;
  reason?: string;
  priorityRank?: number;
  priorityLabel?: string;
}

export function resolveProductClassification(productType: unknown, categoryName?: string): {
  code: ProductClassification;
  label: string;
  strategy: "FEFO" | "FIFO";
} {
  const raw = String(productType || categoryName || "").toUpperCase();

  if (raw.includes("RAW") || raw.includes("INGREDIENT") || raw.includes("RM")) {
    return { code: "RM", label: "Raw Materials / Ingredients", strategy: "FEFO" };
  }
  if (raw.includes("FINISH") || raw.includes("FG") || raw.includes("PRODUCT")) {
    return { code: "FG", label: "Finished Goods", strategy: "FEFO" };
  }
  if (raw.includes("PACKAG") || raw.includes("BOX") || raw.includes("BOTTLE") || raw.includes("CAP") || raw.includes("PKG")) {
    return { code: "PKG", label: "Packaging Materials", strategy: "FIFO" };
  }
  return { code: "OTHER", label: "General Stock", strategy: "FEFO" };
}

export function checkBatchEligibility(
  batch: BatchCandidate,
  referenceDate: Date = new Date(),
  options?: { targetIsBadStock?: boolean }
): BatchEligibilityResult {
  let isExpired = false;
  let daysUntilExpiry: number | null = null;

  if (batch.expiry_date) {
    const exp = new Date(batch.expiry_date);
    if (isNaN(exp.getTime())) {
      // invalid date
    } else {
      const diffMs = exp.getTime() - referenceDate.getTime();
      daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry <= 0) {
        isExpired = true;
      }
    }
  }

  // Zero or negative quantity check
  if (Number(batch.available_quantity || 0) <= 0) {
    return {
      isEligible: false,
      isExpired,
      daysUntilExpiry,
      reason: `Batch ${batch.batch_no} has no available stock (${batch.available_quantity || 0}).`,
    };
  }

  // Non-good QA status check
  const qa = String(batch.qa_status || "GOOD").toUpperCase();
  const isBadStock = qa === "EXPIRED" || qa === "DAMAGED" || qa === "QUARANTINED" || isExpired;

  // If destination is a designated quarantine/bad-stock lot, allow non-releasable batches for isolation
  if (options?.targetIsBadStock) {
    return {
      isEligible: true,
      isExpired,
      daysUntilExpiry,
      reason: isBadStock ? `Allowing relocation of ${qa} stock into designated Quarantine / Bad Stock storage.` : undefined,
    };
  }

  if (qa === "EXPIRED" || isExpired) {
    return {
      isEligible: false,
      isExpired: true,
      daysUntilExpiry,
      reason: `Batch ${batch.batch_no} is expired (${batch.expiry_date || "date passed"}). Can only be relocated to a Quarantine / Bad Stock lot.`,
    };
  }

  if (qa === "DAMAGED") {
    return {
      isEligible: false,
      isExpired: false,
      daysUntilExpiry,
      reason: `Batch ${batch.batch_no} is marked as DAMAGED. Can only be relocated to a Quarantine / Bad Stock lot.`,
    };
  }

  if (qa === "QUARANTINED") {
    return {
      isEligible: false,
      isExpired: false,
      daysUntilExpiry,
      reason: `Batch ${batch.batch_no} is in QUARANTINE. Can only be relocated to a Quarantine / Bad Stock lot.`,
    };
  }

  return { isEligible: true, isExpired: false, daysUntilExpiry };
}

export function sortBatchesByStrategy(
  batches: BatchCandidate[],
  strategy: "FEFO" | "FIFO"
): BatchCandidate[] {
  return [...batches].sort((a, b) => {
    if (strategy === "FEFO") {
      // Earliest expiry date first
      const aExp = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
      const bExp = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;

      if (aExp !== bExp) {
        return aExp - bExp;
      }

      // Tie breaker: Oldest manufacturing date or created date
      const aMfg = a.manufacturing_date ? new Date(a.manufacturing_date).getTime() : (a.created_at ? new Date(a.created_at).getTime() : Infinity);
      const bMfg = b.manufacturing_date ? new Date(b.manufacturing_date).getTime() : (b.created_at ? new Date(b.created_at).getTime() : Infinity);
      return aMfg - bMfg;
    }

    // FIFO: Oldest manufacturing date or created_at date first
    const aMfg = a.manufacturing_date ? new Date(a.manufacturing_date).getTime() : (a.created_at ? new Date(a.created_at).getTime() : Infinity);
    const bMfg = b.manufacturing_date ? new Date(b.manufacturing_date).getTime() : (b.created_at ? new Date(b.created_at).getTime() : Infinity);
    return aMfg - bMfg;
  });
}
