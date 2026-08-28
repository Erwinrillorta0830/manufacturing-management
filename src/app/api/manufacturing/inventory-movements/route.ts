import { NextResponse } from "next/server";
import { cookies } from "next/headers";

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
    if (branch && branch !== "ALL") query.append("branch", branch);
    if (productType && productType !== "ALL") query.append("productType", productType);

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

    // If query has branch or productType, call /api/mm-inventory-movements/filter?branch=&productType=
    // Otherwise call /api/mm-inventory-movements/all
    const queryString = query.toString();
    const targetUrl = queryString
      ? `${SPRING_API_BASE}/api/mm-inventory-movements/filter?${queryString}`
      : `${SPRING_API_BASE}/api/mm-inventory-movements/all`;

    console.log("=================================================");
    console.log("[MM-INVENTORY-MOVEMENTS DEBUG] Fetching from Spring Boot API");
    console.log("[MM-INVENTORY-MOVEMENTS DEBUG] Target URL:", targetUrl);
    console.log("[MM-INVENTORY-MOVEMENTS DEBUG] Query Params:", Object.fromEntries(searchParams.entries()));
    console.log("[MM-INVENTORY-MOVEMENTS DEBUG] Auth Token Present:", !!token);
    console.log("=================================================");

    const res = await fetch(targetUrl, {
      headers: reqHeaders,
      cache: "no-store",
    });

    console.log("[MM-INVENTORY-MOVEMENTS DEBUG] Response Status:", res.status, res.statusText);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[MM-INVENTORY-MOVEMENTS DEBUG] Spring Boot HTTP ${res.status} Error Body:`, errText);
      return NextResponse.json(
        { error: `Spring Boot Inventory Movements API error (HTTP ${res.status}): ${errText || res.statusText}` },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
      );
    }

    const data = await res.json();
    let list: MMInventoryMovement[] = Array.isArray(data) ? data : data?.data || [];

    console.log(`[MM-INVENTORY-MOVEMENTS DEBUG] Successfully received ${list.length} records from Spring Boot.`);
    if (list.length > 0) {
      console.log("[MM-INVENTORY-MOVEMENTS DEBUG] Sample Item #1:", JSON.stringify(list[0], null, 2));
    }

    // Client/BFF level filtering for additional query parameters
    if (branch && branch !== "ALL") {
      const branchNum = Number(branch);
      list = list.filter((m) => m.branchId && Number(m.branchId) === branchNum);
    }
    if (productType && productType !== "ALL") {
      const pTypeNum = Number(productType);
      list = list.filter((m) => m.productTypeId && Number(m.productTypeId) === pTypeNum);
    }
    if (referenceNo) {
      const refNoUpper = referenceNo.trim().toUpperCase();
      list = list.filter((m) => m.referenceNo && m.referenceNo.trim().toUpperCase().includes(refNoUpper));
    }
    if (referenceId) {
      const refIdNum = Number(referenceId);
      list = list.filter((m) => Number(m.referenceId) === refIdNum);
    }
    if (productId && productId !== "ALL") {
      const pIdNum = Number(productId);
      list = list.filter((m) => Number(m.productId) === pIdNum);
    }
    if (lotId && lotId !== "ALL") {
      const lotIdNum = Number(lotId);
      list = list.filter((m) => Number(m.lotId) === lotIdNum);
    }
    if (batchNo) {
      const batchLower = batchNo.trim().toLowerCase();
      list = list.filter((m) => m.batchNo && m.batchNo.trim().toLowerCase().includes(batchLower));
    }
    if (direction && direction !== "ALL") {
      const dirUpper = direction.trim().toUpperCase();
      list = list.filter((m) => m.movementDirection && m.movementDirection.toUpperCase() === dirUpper);
    }
    if (transactionType && transactionType !== "ALL") {
      const typeUpper = transactionType.trim().toUpperCase();
      list = list.filter((m) => m.transactionType && m.transactionType.toUpperCase() === typeUpper);
    }

    console.log(`[MM-INVENTORY-MOVEMENTS DEBUG] Returning ${list.length} movements after query filters.`);

    return NextResponse.json(list);
  } catch (error) {
    console.error("[MM-INVENTORY-MOVEMENTS DEBUG] Network/Fetch Error:", error);
    return NextResponse.json(
      { error: `Spring Boot API connection failed: ${(error as Error).message || "Unable to reach Spring Boot server"}` },
      { status: 502 }
    );
  }
}
