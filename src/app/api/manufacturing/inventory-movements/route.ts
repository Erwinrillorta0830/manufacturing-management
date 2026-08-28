import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPRING_API_BASE = process.env.SPRING_API_BASE_URL || "http://100.95.246.18:8188";

export interface MMInventoryMovement {
  movementKey?: string;
  transactionType?: string;
  movementDirection?: string; // "IN" | "OUT"
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

async function fetchDirectusMovementsFallback(): Promise<MMInventoryMovement[]> {
  const directusList: MMInventoryMovement[] = [];
  
  // 1. Stock Adjustments (Posted)
  try {
    const postedHeaderRes = await fetch(
      `${DIRECTUS_URL}/items/mm_stock_adjustment_header?filter={"isPosted":{"_eq":1}}&fields=doc_no,posted_by,postedAt,date_created,date_updated&limit=-1`,
      { headers: directusHeaders, cache: "no-store" }
    );
    if (postedHeaderRes.ok) {
      const headerJson = await postedHeaderRes.json();
      const headersMap = new Map<string, Record<string, unknown>>();
      (headerJson.data || []).forEach((h: Record<string, unknown>) => {
        if (h.doc_no) headersMap.set(String(h.doc_no), h);
      });

      const postedDocNos = Array.from(headersMap.keys());
      if (postedDocNos.length > 0) {
        const adjUrl = `${DIRECTUS_URL}/items/mm_stock_adjustment?limit=-1&fields=*,lot_id.lot_name,lot_id.lot_id,product_id.description,product_id.product_name,product_id.product_code,product_id.sku_code,product_id.product_id,product_id.unit_of_measurement&filter={"doc_no":{"_in":${JSON.stringify(postedDocNos)}}}`;
        const adjRes = await fetch(adjUrl, { headers: directusHeaders, cache: "no-store" });
        if (adjRes.ok) {
          const adjJson = await adjRes.json();
          const adjRows = adjJson.data || [];
          for (const adj of adjRows) {
            const h = headersMap.get(String(adj.doc_no));
            const isOut = adj.type === "OUT";
            const qty = Number(adj.quantity || 0);
            const prodObj = typeof adj.product_id === "object" && adj.product_id !== null ? (adj.product_id as Record<string, unknown>) : null;
            const lotObj = typeof adj.lot_id === "object" && adj.lot_id !== null ? (adj.lot_id as Record<string, unknown>) : null;

            directusList.push({
              movementKey: `MM-SA-${adj.id}`,
              transactionType: "STOCK_ADJUSTMENT",
              movementDirection: isOut ? "OUT" : "IN",
              sourceModule: "MM_STOCK_ADJUSTMENT",
              referenceId: Number(adj.id),
              referenceNo: String(adj.doc_no || ""),
              transactionDate: String(adj.date_created || adj.created_at || h?.date_created || ""),
              postedAt: String(adj.postedAt || adj.posted_at || h?.postedAt || h?.date_updated || ""),
              postedBy: Number(typeof h?.posted_by === "object" && h?.posted_by !== null ? (h.posted_by as { id?: number }).id : h?.posted_by || 22),
              branchId: Number(adj.branch_id || 0),
              inventoryLotId: Number(adj.inventory_lot_id || adj.id),
              lotId: Number(lotObj ? lotObj.lot_id || lotObj.id : adj.lot_id || 0),
              productId: Number(prodObj ? prodObj.product_id || prodObj.id : adj.product_id || 0),
              productCode: prodObj ? String(prodObj.product_code || prodObj.sku_code || "") : undefined,
              productName: prodObj ? String(prodObj.description || prodObj.product_name || "") : undefined,
              unitId: Number(adj.unit_id || 1),
              batchNo: String(adj.batch_no || ""),
              manufacturingDate: (adj.manufacturing_date as string) || null,
              expirationDate: (adj.expiration_date || adj.expiry_date as string) || null,
              inventoryCondition: String(adj.inventory_condition || "GOOD").toUpperCase(),
              quantityIn: isOut ? 0 : qty,
              quantityOut: isOut ? qty : 0,
              unitCost: Number(adj.unit_cost || 0),
              differenceCost: Number(adj.difference_cost || 0),
              remarks: String(adj.remarks || "Stock Adjustment"),
              sourceStatus: "POSTED",
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn("[InventoryMovements API] Directus stock adjustment fallback error:", err);
  }

  // 2. Physical Inventory (Committed)
  try {
    const piUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_item?limit=-1&fields=*,physical_inventory_id.doc_no,physical_inventory_id.status,physical_inventory_id.branch_id,product_id.description,product_id.product_name,product_id.product_code,product_id.sku_code&filter={"physical_inventory_id":{"status":{"_in":["COMMITTED","POSTED","APPROVED"]}}}`;
    const piRes = await fetch(piUrl, { headers: directusHeaders, cache: "no-store" });
    if (piRes.ok) {
      const piJson = await piRes.json();
      const piRows = piJson.data || [];
      for (const item of piRows) {
        const h = item.physical_inventory_id || {};
        const isOut = item.system_adjustment_type === "OUT" || Number(item.variance_quantity) < 0;
        const qty = Math.abs(Number(item.actual_quantity || item.variance_quantity || 0));
        const prodObj = typeof item.product_id === "object" && item.product_id !== null ? (item.product_id as Record<string, unknown>) : null;

        directusList.push({
          movementKey: `MM-PI-${item.id}`,
          transactionType: "PHYSICAL_INVENTORY_OPENING",
          movementDirection: isOut ? "OUT" : "IN",
          sourceModule: "MM_PHYSICAL_INVENTORY",
          referenceId: Number(item.id),
          referenceNo: String(h.doc_no || ""),
          transactionDate: String(item.date_created || item.created_at || ""),
          postedAt: String(item.date_updated || item.updated_at || ""),
          branchId: Number(h.branch_id || item.branch_id || 0),
          productId: Number(prodObj ? prodObj.product_id || prodObj.id : item.product_id || 0),
          productCode: prodObj ? String(prodObj.product_code || prodObj.sku_code || "") : undefined,
          productName: prodObj ? String(prodObj.description || prodObj.product_name || "") : undefined,
          batchNo: String(item.batch_no || ""),
          quantityIn: isOut ? 0 : qty,
          quantityOut: isOut ? qty : 0,
          inventoryCondition: String(item.inventory_condition || "GOOD").toUpperCase(),
          remarks: item.remarks || null,
          sourceStatus: "COMMITTED",
        });
      }
    }
  } catch (err) {
    console.warn("[InventoryMovements API] Directus physical inventory fallback error:", err);
  }

  return directusList;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const branch = searchParams.get("branch") || searchParams.get("branch_id");
    const productType = searchParams.get("productType") || searchParams.get("product_type_id");
    const referenceNo = searchParams.get("referenceNo") || searchParams.get("reference_no");
    const referenceId = searchParams.get("referenceId") || searchParams.get("reference_id");
    const productId = searchParams.get("productId") || searchParams.get("product_id");
    const lotId = searchParams.get("lotId") || searchParams.get("lot_id") || searchParams.get("lot");
    const batchNo = searchParams.get("batchNo") || searchParams.get("batch_no") || searchParams.get("batch");
    const direction = searchParams.get("direction") || searchParams.get("movementDirection");
    const transactionType = searchParams.get("transactionType") || searchParams.get("transaction_type");
    const fetchAll = searchParams.get("all") === "true";

    const query = new URLSearchParams();
    if (branch) query.append("branch", branch);
    if (productType) query.append("productType", productType);

    let token: string | undefined;
    try {
      const cookieStore = await cookies();
      token = cookieStore.get("vos_access_token")?.value;
    } catch {
      // ignore
    }

    const reqHeaders: Record<string, string> = {
      Accept: "application/json",
    };
    if (token) {
      reqHeaders["Authorization"] = `Bearer ${token}`;
      reqHeaders["Cookie"] = `vos_access_token=${token}`;
    }

    let list: MMInventoryMovement[] = [];

    // If fetchAll or no specific query params, try /api/mm-inventory-movements/all first
    const queryString = query.toString();
    const primaryUrl = (fetchAll || !queryString)
      ? `${SPRING_API_BASE}/api/mm-inventory-movements/all`
      : `${SPRING_API_BASE}/api/mm-inventory-movements/filter?${queryString}`;

    try {
      const res = await fetch(primaryUrl, {
        headers: reqHeaders,
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        list = Array.isArray(data) ? data : data?.data || [];
      } else {
        // Fallback to alternative endpoint
        const fallbackUrl = (primaryUrl.includes("/all"))
          ? `${SPRING_API_BASE}/api/mm-inventory-movements/filter?${queryString}`
          : `${SPRING_API_BASE}/api/mm-inventory-movements/all`;

        const fallbackRes = await fetch(fallbackUrl, {
          headers: reqHeaders,
          cache: "no-store",
        });

        if (fallbackRes.ok) {
          const fbData = await fallbackRes.json();
          list = Array.isArray(fbData) ? fbData : fbData?.data || [];
        } else {
          console.warn(`[InventoryMovements API] Spring Boot returned HTTP ${res.status}, executing Directus fallback...`);
          list = await fetchDirectusMovementsFallback();
        }
      }
    } catch (fetchErr) {
      console.warn("[InventoryMovements API] Fetch error from Spring Boot, executing Directus fallback...", fetchErr);
      list = await fetchDirectusMovementsFallback();
    }

    // Client/BFF level filtering for rich query parameters
    if (branch) {
      const branchNum = Number(branch);
      list = list.filter((m) => m.branchId && Number(m.branchId) === branchNum);
    }
    if (productType) {
      const pTypeNum = Number(productType);
      list = list.filter((m) => m.productTypeId && Number(m.productTypeId) === pTypeNum);
    }
    if (referenceNo) {
      const refNoUpper = referenceNo.trim().toUpperCase();
      list = list.filter((m) => m.referenceNo && m.referenceNo.trim().toUpperCase() === refNoUpper);
    }
    if (referenceId) {
      const refIdNum = Number(referenceId);
      list = list.filter((m) => Number(m.referenceId) === refIdNum);
    }
    if (productId) {
      const pIdNum = Number(productId);
      list = list.filter((m) => Number(m.productId) === pIdNum);
    }
    if (lotId) {
      const lotIdNum = Number(lotId);
      list = list.filter((m) => Number(m.lotId) === lotIdNum);
    }
    if (batchNo) {
      const batchLower = batchNo.trim().toLowerCase();
      list = list.filter((m) => m.batchNo && m.batchNo.trim().toLowerCase() === batchLower);
    }
    if (direction) {
      const dirUpper = direction.trim().toUpperCase();
      list = list.filter((m) => m.movementDirection && m.movementDirection.toUpperCase() === dirUpper);
    }
    if (transactionType) {
      const typeUpper = transactionType.trim().toUpperCase();
      list = list.filter((m) => m.transactionType && m.transactionType.toUpperCase() === typeUpper);
    }

    return NextResponse.json(list);
  } catch (error) {
    console.error("[InventoryMovements API] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch inventory movements" },
      { status: 500 }
    );
  }
}
