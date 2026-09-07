/* eslint-disable @typescript-eslint/no-explicit-any */
import type { 
  SalesReturnItem, 
  Product, 
  ProductSupplierConnection, 
  SupplierCategoryDiscount 
} from "../types/sales-return.types";
import * as repo from "./sales-return.repo";

// =============================================================================
// PARSING & FORMATTING HELPERS
// =============================================================================

export const parseBoolean = (val: any): boolean => {
  if (typeof val === "number") return val === 1;
  if (val && val.type === "Buffer" && Array.isArray(val.data)) {
    return val.data[0] === 1;
  }
  return val === true;
};

export const nowPH = (): string => {
  // Add 8 hours (UTC+8) to UTC time to get Manila time.
  // Uses getUTC* methods to avoid any server local-timezone influence.
  const manilaMs = Date.now() + 8 * 60 * 60 * 1000;
  const d = new Date(manilaMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const hour = String(d.getUTCHours()).padStart(2, "0");
  const minute = String(d.getUTCMinutes()).padStart(2, "0");
  const second = String(d.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

export const formatDateForAPI = (dateString: string | Date) => {
  try {
    if (!dateString) {
      return nowPH();
    }
    let dateStr = "";
    if (typeof dateString === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      dateStr = dateString;
    } else {
      const date = typeof dateString === "string" ? new Date(dateString) : dateString;
      const manilaMs = date.getTime() + 8 * 60 * 60 * 1000;
      const d = new Date(manilaMs);
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, "0");
      const day = String(d.getUTCDate()).padStart(2, "0");
      dateStr = `${year}-${month}-${day}`;
    }
    return `${dateStr}T00:00:00.000Z`;
  } catch {
    return nowPH();
  }
};

export const cleanId = (id: any) => {
  if (id === null || id === undefined || id === "") return null;
  const num = Number(id);
  return isNaN(num) ? id : num;
};

export const formatCurrency = (value: number) => {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

// =============================================================================
// CALCULATION HELPERS
// =============================================================================

export const calculateTotals = (items: SalesReturnItem[]) => {
  const totalGross = items.reduce(
    (sum, item) => sum + (item.grossAmount || 0),
    0,
  );
  const totalDiscount = items.reduce(
    (sum, item) => sum + (item.discountAmount || 0),
    0,
  );
  const totalNet = items.reduce(
    (sum, item) => sum + (item.totalAmount || 0),
    0,
  );

  return { totalGross, totalDiscount, totalNet };
};

/**
 * Resolves the final discount type based on a 2-level override hierarchy:
 * 1. Specific Match: Customer + Supplier + Category
 * 2. General Match: Customer + Supplier (where Category is NULL)
 * 
 * If a match is found but discount_type is NULL, it returns NULL (No Discount).
 * If no match is found, it returns NULL (No Fallback).
 */
export function resolveFinalDiscount(
  product: Product,
  customerCode: string | undefined,
  catalog: {
    connections: ProductSupplierConnection[];
    supplierCategoryDiscount?: SupplierCategoryDiscount[];
  }
): string | number | null {
  if (!customerCode) return null;

  const productId = product.product_id;
  const categoryId = product.product_category;

  // 1. Find supplier ID from connections
  const psc = catalog.connections?.find(
    (c) => c.product_id === productId
  );
  const supplierId = psc?.supplier_id;

  if (!supplierId) return null;

  // 2. TIER 1: Specific Category Match (Priority A)
  const specificMatch = catalog.supplierCategoryDiscount?.find(
    (c) => 
      c.customer_code === customerCode && 
      c.supplier_id === supplierId && 
      c.category_id === categoryId
  );
  if (specificMatch) {
    // Terminal: Use whatever is in the record (even if NULL)
    return specificMatch.discount_type || null;
  }

  // 3. TIER 2: Supplier-wide Match (Category is NULL) (Priority B)
  const generalMatch = catalog.supplierCategoryDiscount?.find(
    (c) => 
      c.customer_code === customerCode && 
      c.supplier_id === supplierId && 
      (c.category_id === null || c.category_id === undefined)
  );
  if (generalMatch) {
    // Terminal: Use whatever is in the record (even if NULL)
    return generalMatch.discount_type || null;
  }

  // 4. Default: No match found = No Discount
  return null;
}

/**
 * Builds a Map<discount_type_id, total_percentage> by retrieving pre-calculated
 * sequential compounded percentages from the discount_type collection.
 */
export async function buildDiscountPercentMap(): Promise<Map<number, number>> {
  const result = await repo.getRawDiscountTypes();
  const rows = (result.data || []) as { id: number; total_percent: string | number }[];

  const discountMap = new Map<number, number>();
  rows.forEach((dt) => {
    discountMap.set(dt.id, parseFloat(String(dt.total_percent)) || 0);
  });

  return discountMap;
}

// =============================================================================
// BUSINESS HELPERS
// =============================================================================

/**
 * Synchronizes an inventory lot based on unique keys.
 * Finds existing or creates a new one.
 */
export async function syncInventoryLot(
  lotId: number,
  productId: number,
  branchId: number,
  batchNo: string,
  returnNo: string,
  userId: number,
  mfgDate: string | null,
  expDate: string | null
): Promise<number | null> {
  try {
    const existing = await repo.getInventoryLotByUniqueKeys(lotId, productId, batchNo);
    const data = existing.data || [];
    if (data.length > 0 && data[0].inventory_lot_id) {
      return Number(data[0].inventory_lot_id);
    }

    const payload = {
      lot_id: lotId,
      product_id: productId,
      branch_id: branchId,
      batch_no: batchNo,
      manufacturing_date: mfgDate,
      expiry_date: expDate,
      unit_cost: 0,
      qa_status: "GOOD",
      status: "ACTIVE",
      source_type: "Sales Return",
      source_reference: returnNo,
      created_by: userId,
      created_at: nowPH(),
      updated_at: nowPH(),
    };

    const created = await repo.createInventoryLot(payload);
    return created.data ? Number(created.data.inventory_lot_id) : null;
  } catch (e) {
    console.error("Failed to sync inventory lot:", e);
    return null;
  }
}

// =============================================================================
// JWT HELPERS
// =============================================================================

/**
 * Decodes the base64url payload of a JWT without verifying the signature.
 */
export function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    if (!base64Url) return null;

    let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }

    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Failed to decode JWT payload:", error);
    return null;
  }
}

/**
 * Helper to extract user ID from a token.
 */
export function getUserIdFromToken(token: string | undefined): number | null {
  if (!token) return null;
  const payload = decodeJwtPayload(token);
  if (!payload) return null;
  const idValue = payload.id ?? payload.sub ?? payload.userId ?? payload.user_id;
  if (idValue === undefined || idValue === null) return null;
  const num = Number(idValue);
  return isNaN(num) ? null : num;
}
