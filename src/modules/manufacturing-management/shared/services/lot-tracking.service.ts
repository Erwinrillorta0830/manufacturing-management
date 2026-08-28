import { MMLot, MMInventoryLot, CreateInventoryLotPayload, QAStatus } from "../types/lot-tracking.types";

const DIRECTUS_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_DIRECTUS_URL ||
  process.env.DIRECTUS_URL ||
  ""
).replace(/\/$/, "");

const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || process.env.DIRECTUS_TOKEN || "";
const SPRING_API_BASE = process.env.SPRING_API_BASE_URL || "";

const getHeaders = (token?: string) => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const authToken = token || DIRECTUS_TOKEN;
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }
  return headers;
};

/**
 * Fetch lots by branch ID with active status
 */
export async function fetchLotsByBranch(branchId?: number, token?: string): Promise<MMLot[]> {
  try {
    // If running in browser (Client Component), call Next.js API BFF route
    if (typeof window !== "undefined") {
      const url = branchId ? `/api/manufacturing/lots?branch_id=${branchId}` : "/api/manufacturing/lots";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        console.warn(`[LotTracking] Failed to fetch lots from BFF: ${res.status}`);
        return [];
      }
      const data = await res.json();
      const mapped = (data || []).map((r: Record<string, unknown>) => {
        const rawBranch = r.branch_id ?? r.branchId;
        const bId = typeof rawBranch === "object" && rawBranch !== null
          ? Number((rawBranch as { id?: number; branch_id?: number }).id || (rawBranch as { id?: number; branch_id?: number }).branch_id || 0)
          : Number(rawBranch || 0);

        return {
          lot_id: Number(r.lot_id || r.lotId || r.id),
          lot_name: String(r.lot_name || r.lotName || `Lot #${r.lot_id || r.lotId || r.id}`),
          branch_id: bId,
          unit_id: r.unit_id ? Number(r.unit_id) : (r.uomId ? Number(r.uomId) : null),
          max_batch_capacity: Number(r.max_batch_capacity || r.maxBatchCapacity || 10),
          description: (r.description as string) || null,
          status: (r.status as 'ACTIVE' | 'CLOSED' | 'INACTIVE') || 'ACTIVE',
          unit_name: (r.unit_name || r.uomName) as string | undefined,
          branch_name: (r.branch_name || r.branchName) as string | undefined,
        };
      });

      if (branchId) {
        return mapped.filter((l: MMLot) => Number(l.branch_id) === Number(branchId));
      }
      return mapped;
    }

    // Server-side direct Directus call
    const filterParts: string[] = [];
    if (branchId) {
      filterParts.push(`filter[branch_id][_eq]=${branchId}`);
    }
    const queryStr = filterParts.length > 0 ? `&${filterParts.join("&")}` : "";
    
    let res = await fetch(`${DIRECTUS_URL}/items/mm_lots?limit=-1&fields=*,unit_id.unit_name,branch_id.branch_name${queryStr}`, {
      headers: getHeaders(token),
      cache: "no-store",
    });

    if (!res.ok) {
      res = await fetch(`${DIRECTUS_URL}/items/lots?limit=-1&fields=*,unit_id.unit_name,branch_id.branch_name${queryStr}`, {
        headers: getHeaders(token),
        cache: "no-store",
      });
    }

    if (!res.ok) {
      console.warn(`[LotTracking] Failed to fetch lots server-side: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const rows = data.data || [];
    return rows.map((r: Record<string, unknown>) => ({
      lot_id: Number(r.lot_id || r.id),
      lot_name: String(r.lot_name || `Lot #${r.lot_id || r.id}`),
      branch_id: Number(typeof r.branch_id === "object" && r.branch_id !== null ? (r.branch_id as { id?: number }).id : r.branch_id || branchId || 0),
      unit_id: r.unit_id ? Number(typeof r.unit_id === "object" ? (r.unit_id as { unit_id?: number; id?: number }).unit_id || (r.unit_id as { unit_id?: number; id?: number }).id : r.unit_id) : null,
      max_batch_capacity: Number(r.max_batch_capacity || 10),
      description: (r.description as string) || null,
      status: (r.status as 'ACTIVE' | 'CLOSED' | 'INACTIVE') || 'ACTIVE',
      unit_name: typeof r.unit_id === "object" && r.unit_id !== null ? (r.unit_id as { unit_name?: string }).unit_name : undefined,
      branch_name: typeof r.branch_id === "object" && r.branch_id !== null ? (r.branch_id as { branch_name?: string }).branch_name : undefined,
    }));
  } catch (err) {
    console.error("[LotTracking] Error fetching lots:", err);
    return [];
  }
}

/**
 * Ensure an active lot exists for a given branch, or create one if none exists.
 */
export async function ensureLotForBranch(branchId: number, token?: string): Promise<MMLot | null> {
  const existing = await fetchLotsByBranch(branchId, token);
  const activeLot = existing.find(l => l.status === "ACTIVE" || !l.status);
  if (activeLot && activeLot.lot_id) {
    return activeLot;
  }
  if (existing.length > 0 && existing[0].lot_id) {
    return existing[0];
  }

  // Create a default master lot for this branch
  try {
    const lotPayload = {
      lot_name: `Main Lot - Branch ${branchId}`,
      branch_id: branchId,
      unit_id: 1,
      max_batch_capacity: 100,
      status: "ACTIVE",
      description: "Auto-generated lot for stock operations",
      created_by: 1,
    };

    if (typeof window !== "undefined") {
      const res = await fetch("/api/manufacturing/lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lotPayload),
      });
      if (res.ok) {
        const json = await res.json();
        const r = json.data || json;
        return {
          lot_id: Number(r.lot_id || r.lotId || r.id),
          lot_name: String(r.lot_name || r.lotName || `Lot - Branch ${branchId}`),
          branch_id: branchId,
          max_batch_capacity: 100,
          status: "ACTIVE",
        };
      }
    }

    let res = await fetch(`${DIRECTUS_URL}/items/mm_lots`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify(lotPayload),
    });
    if (!res.ok) {
      res = await fetch(`${DIRECTUS_URL}/items/lots`, {
        method: "POST",
        headers: getHeaders(token),
        body: JSON.stringify(lotPayload),
      });
    }
    if (res.ok) {
      const json = await res.json();
      const r = json.data;
      return {
        lot_id: Number(r.lot_id || r.id),
        lot_name: String(r.lot_name || `Lot - Branch ${branchId}`),
        branch_id: branchId,
        max_batch_capacity: 100,
        status: "ACTIVE",
      };
    }
  } catch (err) {
    console.warn("[LotTracking] Error ensuring lot for branch:", err);
  }
  return null;
}


/**
 * Fetch inventory lots (batch records) with filtering by branch, product, and QA status
 */
export async function fetchInventoryLots(params: {
  branchId?: number;
  productId?: number;
  lotId?: number;
  qaStatus?: QAStatus;
  status?: string;
  token?: string;
}): Promise<MMInventoryLot[]> {
  try {
    // If running in browser (Client Component), call Next.js API BFF route
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams();
      if (params.branchId) searchParams.set("branch_id", String(params.branchId));
      if (params.productId) searchParams.set("product_id", String(params.productId));
      if (params.lotId) searchParams.set("lot_id", String(params.lotId));
      if (params.qaStatus) searchParams.set("qa_status", params.qaStatus);
      if (params.status) searchParams.set("status", params.status);

      const qs = searchParams.toString();
      const res = await fetch(`/api/manufacturing/inventory-lots${qs ? `?${qs}` : ""}`, { cache: "no-store" });
      if (!res.ok) {
        console.warn(`[LotTracking] Failed to fetch inventory lots from BFF: ${res.status}`);
        return [];
      }
      const rows = await res.json();
      return (rows || []).map((r: Record<string, unknown>) => {
        const lotObj = typeof r.lot_id === "object" && r.lot_id !== null ? (r.lot_id as Record<string, unknown>) : null;
        const prodObj = typeof r.product_id === "object" && r.product_id !== null ? (r.product_id as Record<string, unknown>) : null;
        const uomObj = prodObj && typeof prodObj.unit_of_measurement === "object" && prodObj.unit_of_measurement !== null ? (prodObj.unit_of_measurement as Record<string, unknown>) : null;

        return {
          inventory_lot_id: Number(r.inventory_lot_id || r.id),
          lot_id: Number(lotObj ? lotObj.lot_id || lotObj.id : r.lot_id || 0),
          branch_id: Number(typeof r.branch_id === "object" && r.branch_id !== null ? (r.branch_id as { id?: number }).id : r.branch_id || params.branchId || 0),
          product_id: Number(prodObj ? prodObj.product_id || prodObj.id : r.product_id || params.productId || 0),
          batch_no: String(r.batch_no || ""),
          manufacturing_date: (r.manufacturing_date as string) || null,
          expiry_date: (r.expiry_date as string) || null,
          unit_cost: Number(r.unit_cost || 0),
          qa_status: (r.qa_status as QAStatus) || 'GOOD',
          status: (r.status as 'ACTIVE' | 'CLOSED' | 'INACTIVE') || 'ACTIVE',
          source_type: (r.source_type as string) || null,
          source_reference: (r.source_reference as string) || null,
          remarks: (r.remarks as string) || null,
          created_at: (r.created_at as string) || undefined,
          updated_at: (r.updated_at as string) || undefined,
          lot_name: lotObj ? String(lotObj.lot_name || "") : undefined,
          product_name: prodObj ? String(prodObj.product_name || "") : undefined,
          product_code: prodObj ? String(prodObj.product_code || "") : undefined,
          unit_name: uomObj ? String(uomObj.unit_name || "") : undefined,
          available_quantity: Number(r.quantity || r.available_quantity || 0),
        };
      });
    }

    // Server-side direct Directus call
    const filters: Record<string, unknown> = {};
    if (params.branchId) filters.branch_id = { _eq: params.branchId };
    if (params.productId) filters.product_id = { _eq: params.productId };
    if (params.lotId) filters.lot_id = { _eq: params.lotId };
    if (params.qaStatus) filters.qa_status = { _eq: params.qaStatus };
    if (params.status) filters.status = { _eq: params.status };

    const queryStr = Object.keys(filters).length > 0
      ? `&filter=${encodeURIComponent(JSON.stringify(filters))}`
      : "";

    const fields = "*,lot_id.lot_id,lot_id.lot_name,product_id.product_id,product_id.product_name,product_id.product_code,product_id.unit_of_measurement.unit_name";
    
    let res = await fetch(`${DIRECTUS_URL}/items/mm_inventory_lots?limit=-1&fields=${fields}${queryStr}`, {
      headers: getHeaders(params.token),
      cache: "no-store",
    });

    if (!res.ok) {
      res = await fetch(`${DIRECTUS_URL}/items/inventory_lots?limit=-1&fields=${fields}${queryStr}`, {
        headers: getHeaders(params.token),
        cache: "no-store",
      });
    }

    if (!res.ok) {
      console.warn(`[LotTracking] Failed to fetch inventory lots server-side: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const rows = data.data || [];
    return rows.map((r: Record<string, unknown>) => {
      const lotObj = typeof r.lot_id === "object" && r.lot_id !== null ? (r.lot_id as Record<string, unknown>) : null;
      const prodObj = typeof r.product_id === "object" && r.product_id !== null ? (r.product_id as Record<string, unknown>) : null;
      const uomObj = prodObj && typeof prodObj.unit_of_measurement === "object" && prodObj.unit_of_measurement !== null ? (prodObj.unit_of_measurement as Record<string, unknown>) : null;

      return {
        inventory_lot_id: Number(r.inventory_lot_id || r.id),
        lot_id: Number(lotObj ? lotObj.lot_id || lotObj.id : r.lot_id || 0),
        branch_id: Number(typeof r.branch_id === "object" && r.branch_id !== null ? (r.branch_id as { id?: number }).id : r.branch_id || params.branchId || 0),
        product_id: Number(prodObj ? prodObj.product_id || prodObj.id : r.product_id || params.productId || 0),
        batch_no: String(r.batch_no || ""),
        manufacturing_date: (r.manufacturing_date as string) || null,
        expiry_date: (r.expiry_date as string) || null,
        unit_cost: Number(r.unit_cost || 0),
        qa_status: (r.qa_status as QAStatus) || 'GOOD',
        status: (r.status as 'ACTIVE' | 'CLOSED' | 'INACTIVE') || 'ACTIVE',
        source_type: (r.source_type as string) || null,
        source_reference: (r.source_reference as string) || null,
        remarks: (r.remarks as string) || null,
        created_at: (r.created_at as string) || undefined,
        updated_at: (r.updated_at as string) || undefined,
        lot_name: lotObj ? String(lotObj.lot_name || "") : undefined,
        product_name: prodObj ? String(prodObj.product_name || "") : undefined,
        product_code: prodObj ? String(prodObj.product_code || "") : undefined,
        unit_name: uomObj ? String(uomObj.unit_name || "") : undefined,
        available_quantity: Number(r.quantity || r.available_quantity || 0),
      };
    });
  } catch (err) {
    console.error("[LotTracking] Error fetching inventory lots:", err);
    return [];
  }
}

/**
 * Create a new inventory lot batch entry
 */
export async function createInventoryLot(payload: CreateInventoryLotPayload, token?: string): Promise<{ success: boolean; data?: MMInventoryLot; error?: string }> {
  try {
    const body = {
      lot_id: payload.lot_id,
      branch_id: payload.branch_id,
      product_id: payload.product_id,
      batch_no: payload.batch_no,
      manufacturing_date: payload.manufacturing_date || null,
      expiry_date: payload.expiry_date || null,
      unit_cost: payload.unit_cost || 0,
      qa_status: payload.qa_status || "GOOD",
      status: payload.status || "ACTIVE",
      source_type: payload.source_type || null,
      source_reference: payload.source_reference || null,
      remarks: payload.remarks || null,
      created_by: payload.created_by,
    };

    if (typeof window !== "undefined") {
      const res = await fetch("/api/manufacturing/inventory-lots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || `HTTP ${res.status}` };
      }
      return { success: true, data: data.data };
    }

    let res = await fetch(`${DIRECTUS_URL}/items/mm_inventory_lots`, {
      method: "POST",
      headers: getHeaders(token),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      res = await fetch(`${DIRECTUS_URL}/items/inventory_lots`, {
        method: "POST",
        headers: getHeaders(token),
        body: JSON.stringify(body),
      });
    }

    if (!res.ok) {
      const errTxt = await res.text();
      return { success: false, error: `Directus create error: ${errTxt}` };
    }

    const data = await res.json();
    return { success: true, data: data.data };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Update an existing inventory lot batch record
 */
export async function updateInventoryLot(
  inventoryLotId: number,
  payload: Partial<MMInventoryLot>,
  token?: string
): Promise<{ success: boolean; data?: MMInventoryLot; error?: string }> {
  try {
    let res = await fetch(`${DIRECTUS_URL}/items/mm_inventory_lots/${inventoryLotId}`, {
      method: "PATCH",
      headers: getHeaders(token),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      res = await fetch(`${DIRECTUS_URL}/items/inventory_lots/${inventoryLotId}`, {
        method: "PATCH",
        headers: getHeaders(token),
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) {
      const errTxt = await res.text();
      return { success: false, error: `Directus update error: ${errTxt}` };
    }

    const data = await res.json();
    return { success: true, data: data.data };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

export interface MMProductOnhand {
  branchId: number;
  productId: number;
  unitId?: number;
  totalQuantityIn: number;
  totalQuantityOut: number;
  onhandQuantity: number;
  firstMovementDate?: string | null;
  lastMovementDate?: string | null;
}

export interface MMBatchOnhand {
  branchId: number;
  inventoryLotId: number;
  lotId: number;
  productId: number;
  unitId?: number;
  batchNo: string;
  manufacturingDate?: string | null;
  expirationDate?: string | null;
  inventoryCondition: string;
  totalQuantityIn: number;
  totalQuantityOut: number;
  onhandQuantity: number;
  firstMovementDate?: string | null;
  lastMovementDate?: string | null;
  lotName?: string;
  productName?: string;
  productCode?: string;
  unitName?: string;
}

export interface MMInventoryMovement {
  movementKey?: string;
  transactionType?: string;
  movementDirection?: string;
  sourceModule?: string;
  referenceId?: number;
  referenceDetailId?: number;
  referenceNo?: string;
  transactionDate?: string;
  postedAt?: string;
  postedBy?: number;
  branchId?: number;
  inventoryLotId?: number;
  lotId?: number;
  productId?: number;
  productCode?: string;
  productName?: string;
  productTypeId?: number;
  productTypeName?: string;
  unitId?: number;
  batchNo?: string;
  manufacturingDate?: string | null;
  expirationDate?: string | null;
  inventoryCondition?: string;
  quantityIn?: number;
  quantityOut?: number;
  unitCost?: number;
  differenceCost?: number;
  remarks?: string | null;
  stockType?: string;
  sourceStatus?: string;
}

/**
 * Fetch real-time on-hand balances per product
 */
export async function fetchProductOnhand(params: {
  branchId?: number;
  productId?: number;
  unitId?: number;
}): Promise<MMProductOnhand[]> {
  try {
    const searchParams = new URLSearchParams();
    if (params.branchId) searchParams.set("branch", String(params.branchId));
    if (params.productId) searchParams.set("product", String(params.productId));
    if (params.unitId) searchParams.set("unit", String(params.unitId));

    const qs = searchParams.toString();

    // Client-side execution
    if (typeof window !== "undefined") {
      const url = `/api/manufacturing/product-onhand${qs ? `?${qs}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return [];
      return await res.json();
    }

    // Server-side execution: Try Spring Boot directly
    const springUrl = `${SPRING_API_BASE}/api/mm-product-onhand/filter?${qs}`;
    try {
      const res = await fetch(springUrl, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : data?.data || [];
      }
    } catch {
      // ignore and fallback
    }

    // Server-side Directus fallback
    const filterParts: string[] = [];
    if (params.branchId) filterParts.push(`filter[branch_id][_eq]=${params.branchId}`);
    if (params.productId) filterParts.push(`filter[product_id][_eq]=${params.productId}`);

    const queryStr = filterParts.length > 0 ? `&${filterParts.join("&")}` : "";
    const directusUrl = `${DIRECTUS_URL}/items/v_mm_batch_onhand?limit=-1${queryStr}`;
    const dirRes = await fetch(directusUrl, { headers: getHeaders(), cache: "no-store" });
    const productMap = new Map<number, MMProductOnhand>();
    if (dirRes.ok) {
      const dirJson = await dirRes.json();
      const rows = dirJson.data || [];
      for (const row of rows) {
        const pId = Number(row.product_id);
        const bId = Number(row.branch_id || params.branchId || 0);
        const onhand = Number(row.onhand_quantity || 0);
        const existing = productMap.get(pId);
        if (existing) {
          existing.onhandQuantity += onhand;
        } else {
          productMap.set(pId, {
            branchId: bId,
            productId: pId,
            unitId: Number(row.unit_id || 1),
            totalQuantityIn: onhand,
            totalQuantityOut: 0,
            onhandQuantity: onhand,
          });
        }
      }
    }

    // Also enrich / fallback from mm_stock_adjustment (posted items)
    try {
      const postedHeaderRes = await fetch(
        `${DIRECTUS_URL}/items/mm_stock_adjustment_header?filter={"isPosted":{"_eq":1}}&fields=doc_no&limit=-1`,
        { headers: getHeaders(), cache: "no-store" }
      );
      if (postedHeaderRes.ok) {
        const headerJson = await postedHeaderRes.json();
        const postedDocNos = (headerJson.data || []).map((h: { doc_no: string }) => h.doc_no).filter(Boolean);
        if (postedDocNos.length > 0) {
          const adjFilterParts: string[] = [
            `filter[doc_no][_in]=${encodeURIComponent(postedDocNos.join(","))}`
          ];
          if (params.branchId) adjFilterParts.push(`filter[branch_id][_eq]=${params.branchId}`);
          if (params.productId) adjFilterParts.push(`filter[product_id][_eq]=${params.productId}`);

          const adjUrl = `${DIRECTUS_URL}/items/mm_stock_adjustment?limit=-1&${adjFilterParts.join("&")}`;
          const adjRes = await fetch(adjUrl, { headers: getHeaders(), cache: "no-store" });
          if (adjRes.ok) {
            const adjJson = await adjRes.json();
            const adjRows = adjJson.data || [];
            for (const adj of adjRows) {
              const pId = Number(adj.product_id);
              const bId = Number(adj.branch_id || params.branchId || 0);
              const qty = Number(adj.quantity || 0);
              const isOut = adj.type === "OUT";
              const netQty = isOut ? -qty : qty;
              
              const existing = productMap.get(pId);
              if (existing) {
                existing.onhandQuantity = Math.max(0, existing.onhandQuantity + netQty);
                if (netQty > 0) {
                  existing.totalQuantityIn += netQty;
                } else {
                  existing.totalQuantityOut += Math.abs(netQty);
                }
              } else if (netQty > 0) {
                productMap.set(pId, {
                  branchId: bId,
                  productId: pId,
                  unitId: Number(adj.unit_id || 1),
                  totalQuantityIn: netQty,
                  totalQuantityOut: 0,
                  onhandQuantity: netQty,
                });
              }
            }
          }
        }
      }
    } catch (adjErr) {
      console.warn("[LotTracking] Stock adjustment fallback failed:", adjErr);
    }

    if (productMap.size > 0) {
      return Array.from(productMap.values());
    }

    return [];
  } catch (err) {
    console.error("[LotTracking] Error fetching product onhand:", err);
    return [];
  }
}

/**
 * Fetch real-time on-hand balances per batch
 */
export async function fetchBatchOnhand(params: {
  branchId?: number;
  productId?: number;
  lotId?: number;
  batchNo?: string;
  inventoryCondition?: string;
}): Promise<MMBatchOnhand[]> {
  try {
    const searchParams = new URLSearchParams();
    if (params.branchId) searchParams.set("branch", String(params.branchId));
    if (params.productId) searchParams.set("product", String(params.productId));
    if (params.lotId) searchParams.set("lot", String(params.lotId));
    if (params.batchNo) searchParams.set("batchNo", params.batchNo);
    if (params.inventoryCondition) searchParams.set("inventoryCondition", params.inventoryCondition);

    const qs = searchParams.toString();

    // Client-side execution
    if (typeof window !== "undefined") {
      const url = `/api/manufacturing/batch-onhand${qs ? `?${qs}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return [];
      return await res.json();
    }

    // Server-side execution: Try Spring Boot directly
    const springUrl = `${SPRING_API_BASE}/api/mm-batch-onhand/filter?${qs}`;
    try {
      const res = await fetch(springUrl, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        return Array.isArray(data) ? data : data?.data || [];
      }
    } catch {
      // ignore and fallback
    }

    // Server-side Directus fallback
    const filterParts: string[] = [];
    if (params.branchId) filterParts.push(`filter[branch_id][_eq]=${params.branchId}`);
    if (params.productId) filterParts.push(`filter[product_id][_eq]=${params.productId}`);
    if (params.lotId) filterParts.push(`filter[lot_id][_eq]=${params.lotId}`);
    if (params.batchNo) filterParts.push(`filter[batch_no][_eq]=${encodeURIComponent(params.batchNo)}`);

    const queryStr = filterParts.length > 0 ? `&${filterParts.join("&")}` : "";
    const directusUrl = `${DIRECTUS_URL}/items/v_mm_batch_onhand?limit=-1${queryStr}`;
    let dirRes = await fetch(directusUrl, { headers: getHeaders(), cache: "no-store" });
    if (!dirRes.ok) {
      const invLotUrl = `${DIRECTUS_URL}/items/mm_inventory_lots?limit=-1&fields=*,lot_id.lot_name,product_id.product_name,product_id.product_code${queryStr}`;
      dirRes = await fetch(invLotUrl, { headers: getHeaders(), cache: "no-store" });
    }

    if (dirRes.ok) {
      const dirJson = await dirRes.json();
      const rows = dirJson.data || [];
      const mapped: MMBatchOnhand[] = rows.map((r: Record<string, unknown>) => {
        const lotObj = typeof r.lot_id === "object" && r.lot_id !== null ? (r.lot_id as Record<string, unknown>) : null;
        const prodObj = typeof r.product_id === "object" && r.product_id !== null ? (r.product_id as Record<string, unknown>) : null;

        return {
          branchId: Number(r.branch_id || params.branchId || 0),
          inventoryLotId: Number(r.inventory_lot_id || r.id),
          lotId: Number(lotObj ? lotObj.lot_id || lotObj.id : r.lot_id || 0),
          productId: Number(prodObj ? prodObj.product_id || prodObj.id : r.product_id || params.productId || 0),
          unitId: Number(r.unit_id || 1),
          batchNo: String(r.batch_no || ""),
          manufacturingDate: (r.manufacturing_date as string) || null,
          expirationDate: (r.expiration_date || r.expiry_date as string) || null,
          inventoryCondition: String(r.inventory_condition || r.qa_status || "GOOD").toUpperCase(),
          totalQuantityIn: Number(r.total_quantity_in || r.onhand_quantity || r.quantity || 0),
          totalQuantityOut: Number(r.total_quantity_out || 0),
          onhandQuantity: Number(r.onhand_quantity !== undefined ? r.onhand_quantity : r.quantity || 0),
          lotName: lotObj ? String(lotObj.lot_name || "") : (r.lot_name as string | undefined),
          productName: prodObj ? String(prodObj.product_name || "") : (r.product_name as string | undefined),
          productCode: prodObj ? String(prodObj.product_code || "") : (r.product_code as string | undefined),
        };
      });

      // Also check posted mm_stock_adjustment for missing batches
      try {
        const postedHeaderRes = await fetch(
          `${DIRECTUS_URL}/items/mm_stock_adjustment_header?filter={"isPosted":{"_eq":1}}&fields=doc_no&limit=-1`,
          { headers: getHeaders(), cache: "no-store" }
        );
        if (postedHeaderRes.ok) {
          const headerJson = await postedHeaderRes.json();
          const postedDocNos = (headerJson.data || []).map((h: { doc_no: string }) => h.doc_no).filter(Boolean);
          if (postedDocNos.length > 0) {
            const adjFilterParts: string[] = [
              `filter[doc_no][_in]=${encodeURIComponent(postedDocNos.join(","))}`
            ];
            if (params.branchId) adjFilterParts.push(`filter[branch_id][_eq]=${params.branchId}`);
            if (params.productId) adjFilterParts.push(`filter[product_id][_eq]=${params.productId}`);
            if (params.lotId) adjFilterParts.push(`filter[lot_id][_eq]=${params.lotId}`);
            if (params.batchNo) adjFilterParts.push(`filter[batch_no][_eq]=${encodeURIComponent(params.batchNo)}`);

            const adjUrl = `${DIRECTUS_URL}/items/mm_stock_adjustment?limit=-1&fields=*,lot_id.lot_name,product_id.product_name,product_id.product_code&${adjFilterParts.join("&")}`;
            const adjRes = await fetch(adjUrl, { headers: getHeaders(), cache: "no-store" });
            if (adjRes.ok) {
              const adjJson = await adjRes.json();
              const adjRows = adjJson.data || [];
              for (const adj of adjRows) {
                const cleanBatch = String(adj.batch_no || "").trim();
                const pId = Number(typeof adj.product_id === "object" && adj.product_id !== null ? (adj.product_id as Record<string, unknown>).product_id || (adj.product_id as Record<string, unknown>).id : adj.product_id);
                const lotObj = typeof adj.lot_id === "object" && adj.lot_id !== null ? (adj.lot_id as Record<string, unknown>) : null;
                const prodObj = typeof adj.product_id === "object" && adj.product_id !== null ? (adj.product_id as Record<string, unknown>) : null;
                const lId = Number(lotObj ? lotObj.lot_id || lotObj.id : adj.lot_id || 0);

                const existingBatch = mapped.find(m => m.productId === pId && m.lotId === lId && m.batchNo === cleanBatch);
                const qty = Number(adj.quantity || 0);
                const isOut = adj.type === "OUT";
                const netQty = isOut ? -qty : qty;
                if (existingBatch) {
                  existingBatch.onhandQuantity = Math.max(0, existingBatch.onhandQuantity + netQty);
                  if (netQty > 0) {
                    existingBatch.totalQuantityIn += netQty;
                  } else {
                    existingBatch.totalQuantityOut += Math.abs(netQty);
                  }
                } else if (cleanBatch && qty > 0) {
                  mapped.push({
                    branchId: Number(adj.branch_id || params.branchId || 0),
                    inventoryLotId: Number(adj.inventory_lot_id || adj.id),
                    lotId: lId,
                    productId: pId,
                    unitId: Number(adj.unit_id || 1),
                    batchNo: cleanBatch,
                    manufacturingDate: (adj.manufacturing_date as string) || null,
                    expirationDate: (adj.expiration_date || adj.expiry_date as string) || null,
                    inventoryCondition: String(adj.inventory_condition || "GOOD").toUpperCase(),
                    totalQuantityIn: qty,
                    totalQuantityOut: 0,
                    onhandQuantity: qty,
                    lotName: lotObj ? String(lotObj.lot_name || "") : undefined,
                    productName: prodObj ? String(prodObj.product_name || "") : undefined,
                    productCode: prodObj ? String(prodObj.product_code || "") : undefined,
                  });
                }
              }
            }
          }
        }
      } catch (adjErr) {
        console.warn("[LotTracking] Stock adjustment batch fallback failed:", adjErr);
      }

      return mapped;
    }

    return [];
  } catch (err) {
    console.error("[LotTracking] Error fetching batch onhand:", err);
    return [];
  }
}

/**
 * Fetch inventory movement logs for audit trail
 */
export async function fetchInventoryMovements(params: {
  branchId?: number;
  productTypeId?: number;
  referenceNo?: string;
  referenceId?: number;
  productId?: number;
}): Promise<MMInventoryMovement[]> {
  try {
    const searchParams = new URLSearchParams();
    if (params.branchId) searchParams.set("branch", String(params.branchId));
    if (params.productTypeId) searchParams.set("productType", String(params.productTypeId));
    if (params.referenceNo) searchParams.set("referenceNo", params.referenceNo);
    if (params.referenceId) searchParams.set("referenceId", String(params.referenceId));
    if (params.productId) searchParams.set("productId", String(params.productId));

    const qs = searchParams.toString();

    // Client-side execution
    if (typeof window !== "undefined") {
      const url = `/api/manufacturing/inventory-movements${qs ? `?${qs}` : ""}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) return [];
      return await res.json();
    }

    // Server-side execution
    const springUrl = `${SPRING_API_BASE}/api/mm-inventory-movements/filter?${qs}`;
    const res = await fetch(springUrl, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    let list: MMInventoryMovement[] = Array.isArray(data) ? data : data?.data || [];

    if (params.referenceNo) {
      const refNoUpper = params.referenceNo.trim().toUpperCase();
      list = list.filter((m) => m.referenceNo && m.referenceNo.trim().toUpperCase() === refNoUpper);
    }
    if (params.referenceId) {
      const refIdNum = Number(params.referenceId);
      list = list.filter((m) => Number(m.referenceId) === refIdNum);
    }
    if (params.productId) {
      const pIdNum = Number(params.productId);
      list = list.filter((m) => Number(m.productId) === pIdNum);
    }

    return list;
  } catch (err) {
    console.error("[LotTracking] Error fetching inventory movements:", err);
    return [];
  }
}


