import {
  MMInventoryLot,
  StockAllocationPlan,
  BatchAllocationResult,
  AllocateStockOptions,
  AllocationStrategy,
  QAStatus,
} from "../types/lot-tracking.types";
import { fetchInventoryLots, fetchBatchOnhand } from "./lot-tracking.service";

/**
 * Calculates days remaining until expiration from today.
 * Returns negative numbers for already-expired dates.
 */
export function getDaysUntilExpiry(expiryDateStr?: string | null): number | null {
  if (!expiryDateStr) return null;
  const expiry = new Date(expiryDateStr);
  if (isNaN(expiry.getTime())) return null;

  const now = new Date();
  // Reset hours to start of day for clean day comparison
  now.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - now.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Checks if a batch is eligible for normal stock-out/allocation.
 */
export function checkBatchEligibility(
  batch: MMInventoryLot,
  options?: AllocateStockOptions
): { isEligible: boolean; isExpired: boolean; daysUntilExpiry: number | null; reason?: string } {
  const daysUntilExpiry = getDaysUntilExpiry(batch.expiry_date);
  const isExpired = daysUntilExpiry !== null && daysUntilExpiry < 0;

  // 1. Check QA Status (Block DAMAGED, QUARANTINED, EXPIRED by default)
  if (!options?.includeNonGoodQA && batch.qa_status !== "GOOD") {
    return {
      isEligible: false,
      isExpired,
      daysUntilExpiry,
      reason: `QA Status is ${batch.qa_status} (Requires GOOD for stock-out)`,
    };
  }

  // 2. Check Master Status (Block CLOSED, INACTIVE)
  if (batch.status !== "ACTIVE") {
    return {
      isEligible: false,
      isExpired,
      daysUntilExpiry,
      reason: `Batch status is ${batch.status} (Requires ACTIVE)`,
    };
  }

  // 3. Check Expiration Policy (Block already-expired stock unless explicitly overridden)
  if (isExpired && !options?.includeExpired) {
    return {
      isEligible: false,
      isExpired: true,
      daysUntilExpiry,
      reason: `Batch expired ${Math.abs(daysUntilExpiry)} days ago on ${batch.expiry_date} (Blocked by FEFO policy)`,
    };
  }

  // 4. Check Available Quantity (Default to available_quantity or assume full if not initialized)
  const available = batch.available_quantity !== undefined ? batch.available_quantity : 999999;
  if (available <= 0) {
    return {
      isEligible: false,
      isExpired,
      daysUntilExpiry,
      reason: "Batch has zero available quantity in stock",
    };
  }

  return { isEligible: true, isExpired, daysUntilExpiry };
}

/**
 * Sorts batches according to FEFO (First Expired, First Out) or FIFO rules.
 */
export function sortBatchesByStrategy(
  batches: MMInventoryLot[],
  strategy: AllocationStrategy = "FEFO"
): MMInventoryLot[] {
  return [...batches].sort((a, b) => {
    if (strategy === "FEFO") {
      // 1. Has expiry date vs no expiry date
      const aExp = a.expiry_date ? new Date(a.expiry_date).getTime() : Infinity;
      const bExp = b.expiry_date ? new Date(b.expiry_date).getTime() : Infinity;

      if (aExp !== bExp) {
        return aExp - bExp; // Earliest expiry first
      }

      // 2. Oldest manufacturing date / receipt date
      const aMfg = a.manufacturing_date ? new Date(a.manufacturing_date).getTime() : (a.created_at ? new Date(a.created_at).getTime() : Infinity);
      const bMfg = b.manufacturing_date ? new Date(b.manufacturing_date).getTime() : (b.created_at ? new Date(b.created_at).getTime() : Infinity);

      if (aMfg !== bMfg) {
        return aMfg - bMfg; // Oldest receipt first
      }

      // 3. Tie breaker: deterministic by batch ID
      return (a.inventory_lot_id || 0) - (b.inventory_lot_id || 0);
    }

    if (strategy === "FIFO") {
      // Oldest manufacturing/receipt date first
      const aMfg = a.manufacturing_date ? new Date(a.manufacturing_date).getTime() : (a.created_at ? new Date(a.created_at).getTime() : Infinity);
      const bMfg = b.manufacturing_date ? new Date(b.manufacturing_date).getTime() : (b.created_at ? new Date(b.created_at).getTime() : Infinity);

      if (aMfg !== bMfg) {
        return aMfg - bMfg;
      }
      return (a.inventory_lot_id || 0) - (b.inventory_lot_id || 0);
    }

    // Default / Manual: retain given order
    return 0;
  });
}

/**
 * Executes synchronous stock allocation against an array of batches in memory.
 */
export function allocateStockSync(
  batches: MMInventoryLot[],
  requestedQuantity: number,
  options?: AllocateStockOptions
): StockAllocationPlan {
  const strategy = options?.strategy || "FEFO";
  const sorted = sortBatchesByStrategy(batches, strategy);

  const eligibleBatches: BatchAllocationResult[] = [];
  const ineligibleBatches: BatchAllocationResult[] = [];

  let priorityCounter = 1;

  for (const b of sorted) {
    const { isEligible, isExpired, daysUntilExpiry, reason } = checkBatchEligibility(b, options);
    const available = b.available_quantity !== undefined ? b.available_quantity : 999999;

    let priorityLabel = "";
    if (isEligible) {
      if (daysUntilExpiry !== null) {
        priorityLabel = `${priorityCounter}${getOrdinalSuffix(priorityCounter)} (Exp: ${b.expiry_date} - in ${daysUntilExpiry}d)`;
      } else {
        priorityLabel = `${priorityCounter}${getOrdinalSuffix(priorityCounter)} (No Expiry)`;
      }
      priorityCounter++;
    } else {
      priorityLabel = "Ineligible / Blocked";
    }

    const itemResult: BatchAllocationResult = {
      inventory_lot_id: b.inventory_lot_id,
      lot_id: b.lot_id,
      lot_name: b.lot_name,
      lot_code: b.lot_code || b.lot_name,
      branch_name: b.branch_name,
      branch_code: b.branch_code,
      batch_no: b.batch_no,
      expiry_date: b.expiry_date,
      manufacturing_date: b.manufacturing_date,
      unit_cost: b.unit_cost,
      qa_status: b.qa_status,
      status: b.status,
      available_quantity: available,
      allocated_quantity: 0,
      priority_index: isEligible ? priorityCounter - 1 : 999,
      priority_label: priorityLabel,
      days_until_expiry: daysUntilExpiry,
      is_expired: isExpired,
      is_eligible: isEligible,
      ineligibility_reason: reason,
    };

    if (isEligible) {
      eligibleBatches.push(itemResult);
    } else {
      ineligibleBatches.push(itemResult);
    }
  }

  // Greedily allocate quantity across eligible batches
  let remainingNeeded = requestedQuantity;
  const allocations: BatchAllocationResult[] = [];
  const unallocatedBatches: BatchAllocationResult[] = [];

  for (const item of eligibleBatches) {
    if (remainingNeeded <= 0) {
      unallocatedBatches.push({ ...item, allocated_quantity: 0 });
      continue;
    }

    const allocQty = Math.min(remainingNeeded, item.available_quantity);
    if (allocQty > 0) {
      const allocatedItem = { ...item, allocated_quantity: allocQty };
      allocations.push(allocatedItem);
      remainingNeeded -= allocQty;

      // If batch still has leftover stock
      if (item.available_quantity > allocQty) {
        unallocatedBatches.push({
          ...item,
          available_quantity: item.available_quantity - allocQty,
          allocated_quantity: 0,
        });
      }
    } else {
      unallocatedBatches.push({ ...item, allocated_quantity: 0 });
    }
  }

  const totalAllocated = requestedQuantity - remainingNeeded;
  const shortage = Math.max(0, remainingNeeded);

  const firstBatch = batches[0];

  return {
    productId: firstBatch ? firstBatch.product_id : 0,
    productName: firstBatch?.product_name,
    branchId: firstBatch ? firstBatch.branch_id : 0,
    requestedQuantity,
    totalAllocated,
    shortage,
    isFullyAllocated: shortage === 0,
    strategy,
    allocations,
    unallocatedBatches,
    ineligibleBatches,
  };
}

/**
 * Asynchronously loads inventory lots from backend and calculates FEFO allocation plan.
 */
export async function allocateStock(params: {
  productId: number;
  branchId: number;
  requestedQuantity: number;
  options?: AllocateStockOptions;
}): Promise<StockAllocationPlan> {
  let liveBatches: MMInventoryLot[] = [];

  // 1. Try authoritative batch onhand first
  try {
    const onhandData = await fetchBatchOnhand({
      branchId: params.branchId,
      productId: params.productId,
    });

    if (onhandData && onhandData.length > 0) {
      const batchMap = new Map<string, MMInventoryLot>();
      for (const oh of onhandData) {
        if (Number(oh.branchId) !== Number(params.branchId)) continue;
        const key = oh.batchNo || `lot-${oh.inventoryLotId || oh.lotId}`;
        const existing = batchMap.get(key);
        const qty = Number(oh.onhandQuantity || 0);

        if (existing) {
          existing.available_quantity = (existing.available_quantity || 0) + qty;
          if (!existing.expiry_date && oh.expirationDate) {
            existing.expiry_date = oh.expirationDate;
          }
          if (!existing.manufacturing_date && oh.manufacturingDate) {
            existing.manufacturing_date = oh.manufacturingDate;
          }
          if (oh.inventoryLotId && Number(oh.inventoryLotId) > 0) {
            existing.inventory_lot_id = Number(oh.inventoryLotId);
          }
        } else {
          batchMap.set(key, {
            inventory_lot_id: Number(oh.inventoryLotId || oh.lotId || 1),
            lot_id: Number(oh.lotId || 1),
            branch_id: Number(oh.branchId),
            product_id: Number(oh.productId || params.productId),
            batch_no: oh.batchNo,
            manufacturing_date: oh.manufacturingDate || null,
            expiry_date: oh.expirationDate || null,
            qa_status: (oh.inventoryCondition as QAStatus) || "GOOD",
            status: "ACTIVE",
            unit_cost: 0,
            available_quantity: qty,
            lot_name: oh.lotName || `Lot #${oh.lotId}`,
            product_name: oh.productName,
            product_code: oh.productCode,
          });
        }
      }
      liveBatches = Array.from(batchMap.values()).filter(
        (b) => (b.available_quantity || 0) > 0
      );
    }
  } catch (err) {
    console.warn("[StockAllocation] fetchBatchOnhand warning:", err);
  }

  // 2. Fallback to fetchInventoryLots if no live batches were found
  if (liveBatches.length === 0) {
    const rawLots = await fetchInventoryLots({
      branchId: params.branchId,
      productId: params.productId,
      token: params.options?.token,
    });
    liveBatches = rawLots;
  }

  return allocateStockSync(liveBatches, params.requestedQuantity, params.options);
}

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}
