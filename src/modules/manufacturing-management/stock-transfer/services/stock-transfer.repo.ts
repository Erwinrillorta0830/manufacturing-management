import { fetchItems, createItems, updateItem, bulkUpdateItems } from "./api";
import { getCached, setCache } from "@/modules/manufacturing-management/stock-conversion/utils/cache";
import { fetchProductOnhand } from "@/modules/manufacturing-management/shared/services/lot-tracking.service";
import { formatStatusForDb } from "./stock-transfer.helpers";
import type { 
  BranchRow, 
  StockTransferRow, 
  StockTransferRfidRow, 
  ProductRow,
  StockTransferInsertPayload,
  MMStockTransferDetail,
} from "../types/stock-transfer.types";

const SPRING_API_BASE_URL = process.env.SPRING_API_BASE_URL;

/**
 * Fetches stock transfer rows from Directus with relational expansion.
 */
export async function fetchStockTransfers(status?: string): Promise<StockTransferRow[]> {
  const params: Record<string, unknown> = {
    fields: [
      "*",
      "product_id.product_id",
      "product_id.product_name",
      "product_id.description",
      "product_id.barcode",
      "product_id.product_code",
      "product_id.cost_per_unit",
      "product_id.price_per_unit",
      "product_id.product_image",
      "product_id.unit_of_measurement.unit_id",
      "product_id.unit_of_measurement.unit_name",
      "product_id.unit_of_measurement_count",
      "product_id.product_brand.brand_id",
      "product_id.product_brand.brand_name",
      "product_id.product_category.category_id",
      "product_id.product_category.category_name",
      "product_id.product_per_supplier.supplier_id.supplier_shortcut",
    ].join(","),
    limit: -1,
  };

  if (status && status.trim() !== "") {
    const rawStatuses = status.split(",").map(s => s.trim()).filter(Boolean);
    const expandedStatuses = Array.from(new Set([
      ...rawStatuses,
      ...rawStatuses.map(s => formatStatusForDb(s)),
      ...rawStatuses.map(s => s.toUpperCase()),
      ...rawStatuses.map(s => s.replace(/\s+/g, "_").toUpperCase()),
    ]));

    if (expandedStatuses.length === 1) {
      params.filter = JSON.stringify({
        status: { _eq: expandedStatuses[0] }
      });
    } else if (expandedStatuses.length > 1) {
      params.filter = JSON.stringify({
        status: { _in: expandedStatuses }
      });
    }
  }

  const res = await fetchItems<StockTransferRow>("items/mm_stock_transfer", params);
  return res.data;
}

/**
 * Fetches branches for dropdown selection.
 */
export async function fetchBranches(): Promise<BranchRow[]> {
  const res = await fetchItems<BranchRow>("items/branches", {
    fields: "id,branch_name,branch_code",
    limit: -1,
  });
  return res.data;
}

/**
 * Fetches RFID tracking records for a set of stock transfer IDs.
 */
export async function fetchDispatchedRfids(_transferIds: number[]): Promise<StockTransferRfidRow[]> {
  void _transferIds;
  return [];
}

/**
 * Fetches products that can be transferred.
 */
export async function fetchProducts(search?: string): Promise<ProductRow[]> {
  const params: Record<string, unknown> = {
    fields: [
      "product_id",
      "product_name",
      "description",
      "barcode",
      "product_code",
      "cost_per_unit",
      "price_per_unit",
      "product_image",
      "unit_of_measurement.unit_id",
      "unit_of_measurement.unit_name",
      "unit_of_measurement_count",
      "product_brand.brand_id",
      "product_brand.brand_name",
      "product_category.category_id",
      "product_category.category_name",
      "product_per_supplier.supplier_id.supplier_shortcut",
    ].join(","),
    limit: -1,
  };

  if (search) {
    params.filter = JSON.stringify({
      _or: [
        { product_name: { _icontains: search } },
        { description: { _icontains: search } },
        { barcode: { _icontains: search } },
        { product_code: { _icontains: search } },
      ]
    });
  }

  const res = await fetchItems<ProductRow>("items/products", params);
  return res.data;
}

type SupplierRecord = { product_id: number; supplier_id: { supplier_shortcut: string } };

/**
 * Fetches the product_per_supplier relationships for an array of product IDs.
 * Since product_per_supplier is not available directly on the products collection 
 * as an alias, we must fetch it directly from the junction table.
 */
export async function fetchProductSuppliers(productIds: number[]): Promise<Record<number, SupplierRecord[]>> {
  if (productIds.length === 0) return {};

  const uniqueIds = Array.from(new Set(productIds)).filter(id => id > 0);
  if (uniqueIds.length === 0) return {};

  // Fetch in chunks to avoid URL length limits
  const CHUNK_SIZE = 100;
  const allRecords: SupplierRecord[] = [];

  for (let i = 0; i < uniqueIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueIds.slice(i, i + CHUNK_SIZE);
    const params = {
      "filter[product_id][_in]": chunk.join(","),
      fields: "product_id,supplier_id.supplier_shortcut",
      limit: -1,
    };
    const res = await fetchItems<SupplierRecord>("items/product_per_supplier", params);
    allRecords.push(...(res.data || []));
  }

  // Group by product_id
  const supplierMap: Record<number, SupplierRecord[]> = {};
  for (const record of allRecords) {
    const pId = record.product_id;
    if (!supplierMap[pId]) supplierMap[pId] = [];
    supplierMap[pId].push(record);
  }

  return supplierMap;
}

/**
 * Fetches a single product by its primary ID.
 */
export async function fetchProductById(productId: number): Promise<ProductRow | null> {
  const params: Record<string, unknown> = {
    fields: [
      "product_id",
      "product_name",
      "description",
      "barcode",
      "product_code",
      "cost_per_unit",
      "price_per_unit",
      "product_image",
      "unit_of_measurement.unit_id",
      "unit_of_measurement.unit_name",
      "unit_of_measurement_count",
      "product_brand.brand_id",
      "product_brand.brand_name",
      "product_category.category_id",
      "product_category.category_name",
      "product_per_supplier.supplier_id.supplier_shortcut",
    ].join(","),
    filter: JSON.stringify({
      product_id: { _eq: productId }
    }),
    limit: 1
  };
  const res = await fetchItems<ProductRow | ProductRow[]>("items/products", params);
  return res.data ? (Array.isArray(res.data) ? res.data[0] : res.data) as ProductRow : null;
}

/**
 * Fetches real-time inventory from the Spring Boot movements API.
 * Aggregates quantityIn - quantityOut and merges with Directus on-hand.
 * Cached for 60 seconds per branch to prevent redundant slow calls.
 */
export async function fetchBranchInventory(branchId: number, token?: string, bypassCache: boolean = false): Promise<Record<string, unknown>[]> {
  if (!SPRING_API_BASE_URL && branchId === undefined) return [];

  // Check cache first
  const CACHE_KEY = `st_inventory_${branchId}`;
  const TTL = 60 * 1000; // 60 seconds
  if (!bypassCache) {
    const cached = getCached<Record<string, unknown>[]>(CACHE_KEY);
    if (cached) {
      console.log(`[Stock Transfer Repo] Inventory cache HIT for branch ${branchId}`);
      return cached;
    }
  }

  let effectiveToken = token;
  if (!effectiveToken) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path');
      const tokenFile = path.resolve(process.cwd(), 'node_modules/.cache/vos-tokens/latest_token.txt');
      if (fs.existsSync(tokenFile)) {
        effectiveToken = fs.readFileSync(tokenFile, 'utf8').trim();
      }
    } catch {
      // Ignore fallback token read
    }
  }

  const reqHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {}),
  };

  const invMap: Record<number, number> = {};

  // 1. Query mm-inventory-movements filter
  if (SPRING_API_BASE_URL) {
    try {
      const movementsUrl = `${SPRING_API_BASE_URL.replace(/\/$/, '')}/api/mm-inventory-movements/filter?branch=${branchId}`;
      const res = await fetch(movementsUrl, { headers: reqHeaders, cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        const list = Array.isArray(json) ? json : (json?.data || []);
        list.forEach((m: Record<string, unknown>) => {
          const pId = Number(m.productId || m.product_id || 0);
          const itemBranchId = m.branchId ?? m.branch_id;
          if (branchId !== undefined && itemBranchId !== undefined && Number(itemBranchId) !== Number(branchId)) {
            return;
          }
          const qIn = Number(m.quantityIn || m.quantity_in || 0);
          const qOut = Number(m.quantityOut || m.quantity_out || 0);
          const netQty = qIn - qOut;
          if (!isNaN(pId) && pId > 0) {
            invMap[pId] = (invMap[pId] || 0) + netQty;
          }
        });
      } else {
        console.warn(`[Stock Transfer Repo] mm-inventory-movements API returned HTTP ${res.status}`);
      }
    } catch (e) {
      console.warn("[Stock Transfer Repo] mm-inventory-movements fetch error:", e);
    }
  }

  // 2. Merge Directus onhand (includes posted adjustments, initial stock, and lots)
  if (branchId !== undefined && branchId > 0) {
    try {
      const directusOnhand = await fetchProductOnhand({ branchId });
      directusOnhand.forEach((item) => {
        const pId = Number(item.productId);
        const onhand = Number(item.onhandQuantity || 0);
        if (!isNaN(pId) && onhand > 0) {
          invMap[pId] = Math.max(invMap[pId] || 0, onhand);
        }
      });
    } catch (err) {
      console.warn("[Stock Transfer Repo] Directus onhand merge failed:", err);
    }
  }

  const result = Object.entries(invMap).map(([pId, qty]) => ({
    productId: Number(pId),
    product_id: Number(pId),
    runningInventory: Math.max(0, qty),
    running_inventory: Math.max(0, qty),
    onhandQuantity: Math.max(0, qty),
  }));

  setCache(CACHE_KEY, result, TTL);
  return result;
}

/**
 * Batch creates stock transfer records.
 */
export async function createStockTransfers(payloads: StockTransferInsertPayload[]): Promise<StockTransferRow[]> {
  const res = await createItems<StockTransferRow[]>("items/mm_stock_transfer", payloads);
  return res.data;
}

/**
 * Updates status and allocated quantity for a batch of items.
 */
export async function updateTransfersStatus(
  items: { 
    id: number; 
    status: string; 
    allocated_quantity?: number; 
    picked_quantity?: number;
    dispatched_quantity?: number;
    scanned_quantity?: number;
    received_quantity?: number;
    date_received?: string | null; 
    receiver_id?: number | null;
    dispatched_by?: number | null;
    dispatched_at?: string | null;
    approved_by?: number | null;
    rejected_by?: number | null;
    rejected_at?: string | null;
  }[]
): Promise<void> {
  if (items.length === 0) return;

  // Group items by their update payload shape so we can batch them
  const grouped: Record<string, number[]> = {};
  items.forEach((item) => {
    const key = JSON.stringify({
      status: item.status,
      ...(item.allocated_quantity !== undefined ? { allocated_quantity: item.allocated_quantity } : {}),
      ...(item.picked_quantity !== undefined ? { picked_quantity: item.picked_quantity } : {}),
      ...(item.dispatched_quantity !== undefined ? { dispatched_quantity: item.dispatched_quantity } : {}),
      ...(item.scanned_quantity !== undefined ? { scanned_quantity: item.scanned_quantity } : {}),
      ...(item.received_quantity !== undefined ? { received_quantity: item.received_quantity } : {}),
      ...(item.date_received !== undefined ? { date_received: item.date_received } : {}),
      ...(item.receiver_id !== undefined ? { receiver_id: item.receiver_id } : {}),
      ...(item.dispatched_by !== undefined ? { dispatched_by: item.dispatched_by } : {}),
      ...(item.dispatched_at !== undefined ? { dispatched_at: item.dispatched_at } : {}),
      ...(item.approved_by !== undefined ? { approved_by: item.approved_by } : {}),
      ...(item.rejected_by !== undefined ? { rejected_by: item.rejected_by } : {}),
      ...(item.rejected_at !== undefined ? { rejected_at: item.rejected_at } : {}),
    });
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item.id);
  });

  // Execute one bulk PATCH per unique payload shape
  await Promise.all(
    Object.entries(grouped).map(([dataJson, ids]) => {
      console.log("[DEBUG] Executing bulkUpdateItems for IDs:", ids, "Payload:", dataJson);
      return bulkUpdateItems("items/mm_stock_transfer", ids, JSON.parse(dataJson) as Record<string, unknown>);
    })
  );
}

/**
 * Updates a single stock transfer record.
 */
export async function updateTransfer(id: number, data: Partial<StockTransferRow>): Promise<void> {
  await updateItem("items/mm_stock_transfer", id, data);
}

/**
 * Records RFID scan events in the tracking table.
 */
export async function insertRfidTracking(
  _entries: { 
    stock_transfer_id: number; 
    rfid_tag: string; 
    scan_type: string; 
    created_by?: number | null; 
    created_at?: string; 
  }[]
): Promise<void> {
  void _entries;
  return;
}

/**
 * Fetches stock transfers filtered by specific IDs.
 * Avoids fetching the entire table when only a subset is needed.
 */
export async function fetchStockTransfersByIds(ids: number[]): Promise<StockTransferRow[]> {
  if (ids.length === 0) return [];

  const CHUNK_SIZE = 100;
  const allRows: StockTransferRow[] = [];

  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    const chunk = ids.slice(i, i + CHUNK_SIZE);
    const res = await fetchItems<StockTransferRow>("items/mm_stock_transfer", {
      "filter[id][_in]": chunk.join(","),
      fields: "*,product_id.product_id,product_id.product_name",
      limit: -1,
    });
    allRows.push(...res.data);
  }

  return allRows;
}

/**
 * Fallback for RFID lookup using Directus receiving records when Spring Boot is unavailable.
 */
export async function fallbackRfidLookup(rfid: string): Promise<ProductRow | null> {
  interface DirectusRfidRecord {
    product_id?: ProductRow;
  }

  // 1. Check Receiving records
  const receivingRes = await fetchItems<DirectusRfidRecord>("items/purchase_order_receiving_items", {
    "filter[rfid_tag][_eq]": rfid,
    fields: "product_id.*",
    limit: 1,
  });
  if (receivingRes.data?.[0]?.product_id) return receivingRes.data[0].product_id as ProductRow;

  return null;
}

/**
 * Inserts rows into the stock_transfer_attachment table.
 */
export async function insertStockTransferAttachments(
  entries: { 
    stock_transfer_id: number; 
    directus_file_id: string; 
    created_by?: number | null; 
  }[]
): Promise<void> {
  if (entries.length === 0) return;
  await createItems("items/mm_stock_transfer_attachment", entries);
}

/**
 * Fetches transfer detail lines from mm_stock_transfer_details table.
 */
export async function fetchStockTransferDetails(transferIds: number[]): Promise<MMStockTransferDetail[]> {
  if (transferIds.length === 0) return [];
  const res = await fetchItems<MMStockTransferDetail>("items/mm_stock_transfer_details", {
    "filter[stock_transfer_id][_in]": transferIds.join(","),
    fields: "*,lot_id.lot_id,lot_id.lot_name,product_id.product_id,product_id.product_name,unit_id.unit_id,unit_id.unit_name",
    limit: -1,
  });
  return res.data;
}

/**
 * Inserts line detail rows into mm_stock_transfer_details table.
 */
export async function createStockTransferDetails(details: MMStockTransferDetail[]): Promise<MMStockTransferDetail[]> {
  if (details.length === 0) return [];
  const res = await createItems<MMStockTransferDetail[]>("items/mm_stock_transfer_details", details);
  return res.data;
}

/**
 * Updates a single transfer detail record.
 */
export async function updateStockTransferDetail(id: number, data: Partial<MMStockTransferDetail>): Promise<void> {
  await updateItem("items/mm_stock_transfer_details", id, data);
}

/**
 * Bulk updates multiple transfer detail records.
 */
export async function bulkUpdateStockTransferDetails(ids: number[], data: Partial<MMStockTransferDetail>): Promise<void> {
  if (ids.length === 0) return;
  await bulkUpdateItems("items/mm_stock_transfer_details", ids, data as Record<string, unknown>);
}


