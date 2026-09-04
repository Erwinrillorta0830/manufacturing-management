// ─── Stock Transfer Module — Pure Helpers ───────────────────
// No I/O — only pure functions that produce values.

import type { BranchRow, OrderGroup, OrderGroupItem, StockTransferRow, ProductRow } from "../types/stock-transfer.types";

/**
 * Generates a unique order number: ST-YYYYMMDDHHMMSS-{src}-{tgt}
 */
export function generateOrderNo(sourceBranch: string, targetBranch: string): string {
  const now = new Date().toISOString();
  const datePart = now.replace(/[-:.TZ]/g, "").slice(0, 14);
  return `ST-${datePart}-${sourceBranch ?? "0"}-${targetBranch ?? "0"}`;
}

/**
 * Derives a display name from a branch record.
 * Tries common field names used across the Directus schema.
 */
export function getBranchLabel(branch: BranchRow): string {
  return branch.branch_name || branch.name || `Branch ${branch.id}`;
}

/**
 * Resolves a branch name from an ID using the branches array.
 */
export function resolveBranchName(
  branchId: number | null,
  branches: BranchRow[],
): string {
  if (!branchId) return "Unknown";
  const branch = branches.find((b) => b.id === branchId);
  return branch ? getBranchLabel(branch) : `Branch ${branchId}`;
}

export function formatStatusForUi(status?: string | null): string {
  if (!status) return "Requested";
  switch (status.toUpperCase()) {
    case "REQUESTED":
      return "Requested";
    case "FOR_PICKING":
      return "For Picking";
    case "PICKING":
      return "Picking";
    case "PICKED":
      return "Picked";
    case "FOR_LOADING":
      return "For Loading";
    case "DISPATCHED":
      return "Dispatched";
    case "RECEIVED":
      return "Received";
    case "REJECTED":
      return "Rejected";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

export function formatStatusForDb(status?: string | null): string {
  if (!status) return "REQUESTED";
  const s = status.trim().toUpperCase().replace(/\s+/g, "_");
  const valid = ["REQUESTED", "FOR_PICKING", "PICKING", "PICKED", "FOR_LOADING", "DISPATCHED", "RECEIVED", "REJECTED", "CANCELLED"];
  if (valid.includes(s)) return s;
  return status;
}

/**
 * Groups flat stock transfer rows by `order_no` into OrderGroup objects.
 * Used by all downstream modules (approval, dispatching, receive).
 */
export function groupByOrderNo(transfers: StockTransferRow[]): OrderGroup[] {
  const groups: Record<string, OrderGroup> = {};

  transfers.forEach((st) => {
    const rawSource = st.source_branch_id ?? st.source_branch ?? null;
    const sourceBranch = typeof rawSource === "object" && rawSource !== null ? (rawSource as BranchRow).id : (typeof rawSource === "number" ? rawSource : null);

    const rawTarget = st.target_branch_id ?? st.target_branch ?? null;
    const targetBranch = typeof rawTarget === "object" && rawTarget !== null ? (rawTarget as BranchRow).id : (typeof rawTarget === "number" ? rawTarget : null);

    const uiStatus = formatStatusForUi(st.status);

    if (!groups[st.order_no]) {
      groups[st.order_no] = {
        orderNo: st.order_no,
        sourceBranch,
        targetBranch,
        leadDate: st.lead_date,
        dateRequested: st.date_requested,
        dateEncoded: st.date_encoded || "",
        items: [],
        totalAmount: 0,
        status: uiStatus,
      };
    }

    const product = typeof st.product_id === 'object' && st.product_id !== null ? (st.product_id as ProductRow) : null;
    let amount = Number(st.amount || 0);
    let unitPrice = st.ordered_quantity > 0 ? amount / st.ordered_quantity : 0;
    
    if (amount === 0 && product?.cost_per_unit) {
      unitPrice = Number(product.cost_per_unit);
      const qty = st.received_quantity || st.allocated_quantity || st.ordered_quantity || 0;
      amount = qty * unitPrice;
    }

    // Cast to OrderGroupItem with defaults for enrichment fields
    const item: OrderGroupItem = {
      ...st,
      amount,
      scannedQty: 0,
      receivedQty: 0,
      scannedRfids: [],
      receivedRfids: [],
      qtyAvailable: 0,
      isLoosePack: false,
    };

    groups[st.order_no].items.push(item);

    // Calculate total using received, allocated, or ordered quantity
    const qty = Number(st.received_quantity) || Number(st.allocated_quantity) || Number(st.ordered_quantity) || 0;
    groups[st.order_no].totalAmount += Number((qty * unitPrice).toFixed(2));
  });

  // Sort by date encoded descending (newest first)
  return Object.values(groups).sort(
    (a, b) =>
      new Date(b.dateEncoded).getTime() - new Date(a.dateEncoded).getTime(),
  );
}

/**
 * Calculates the unit price for a stock transfer line item.
 */
export function calculateUnitPrice(item: StockTransferRow): number {
  const product = typeof item.product_id === 'object' && item.product_id !== null ? (item.product_id as ProductRow) : null;
  const amount = Number(item.amount || 0);
  
  if (product?.cost_per_unit) {
    const qty = item.received_quantity || item.allocated_quantity || item.ordered_quantity || 0;
    if (amount === 0 || amount === qty * Number(product.cost_per_unit)) {
      return Number(product.cost_per_unit);
    }
  }
  
  return item.ordered_quantity > 0
    ? amount / item.ordered_quantity
    : 0;
}

/**
 * Calculates total amount for scanned items.
 */
export function calculateGrandTotal(
  items: { unitPrice: number; unitQty: number }[],
): number {
  return items.reduce(
    (sum, item) => sum + parseFloat((item.unitPrice * item.unitQty).toFixed(2)),
    0,
  );
}

/**
 * Formats a quantity value by parsing decimals and stripping unnecessary trailing zeros.
 * e.g. "7.000000" -> "7", "7.500000" -> "7.5", null/undefined/"" -> "—"
 */
export function formatQuantity(val: unknown): string {
  if (val === null || val === undefined || val === '') return '—';
  const num = Number(val);
  if (isNaN(num)) return String(val);
  return num.toLocaleString('en-PH', { maximumFractionDigits: 4 });
}

/**
 * Resolves the designated salesman / representative name for a branch.
 * Checks target branch description / branch head or assigned representative.
 */
export function resolveBranchSalesman(
  branchId: number | string | null | undefined,
  branches: BranchRow[],
): string | undefined {
  if (!branchId) {
    console.log('[resolveBranchSalesman:Debug] No branchId provided.');
    return undefined;
  }
  const branch = branches.find((b) => b.id.toString() === branchId.toString());
  if (!branch) {
    console.log(`[resolveBranchSalesman:Debug] Branch with id ${branchId} not found in available branches:`, branches.map(b => ({ id: b.id, name: b.branch_name })));
    return undefined;
  }

  console.log(`[resolveBranchSalesman:Debug] Branch found:`, {
    id: branch.id,
    branch_name: branch.branch_name,
    branch_code: branch.branch_code,
    salesman_name: branch.salesman_name,
  });

  if (branch.salesman_name && branch.salesman_name.trim()) {
    console.log(`[resolveBranchSalesman:Debug] Resolved salesman: "${branch.salesman_name.trim()}"`);
    return branch.salesman_name.trim();
  }

  console.log(`[resolveBranchSalesman:Debug] No salesman configured for branch ${branchId}. Returning undefined.`);
  return undefined;
}

