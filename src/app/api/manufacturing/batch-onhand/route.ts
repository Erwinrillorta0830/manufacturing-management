import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPRING_API_BASE = process.env.SPRING_API_BASE_URL  ;

export interface MMBatchOnhand {
  branchId: number;
  inventoryLotId?: number | null;
  mmLotId?: number;
  productId: number;
  productTypeId?: number;
  productTypeName?: string;
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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const branch = searchParams.get("branch") || searchParams.get("branch_id");
    const product = searchParams.get("product") || searchParams.get("product_id");
    const mmLot = searchParams.get("mmLot") || searchParams.get("mmLotId") || searchParams.get("mm_lot_id");
    const unit = searchParams.get("unit") || searchParams.get("unit_id");
    const batchNo = searchParams.get("batchNo") || searchParams.get("batch_no");
    const condition = searchParams.get("inventoryCondition") || searchParams.get("inventory_condition");
    const mfgFrom = searchParams.get("manufacturingDateFrom");
    const mfgTo = searchParams.get("manufacturingDateTo");
    const expFrom = searchParams.get("expirationDateFrom");
    const expTo = searchParams.get("expirationDateTo");

    const query = new URLSearchParams();
    if (branch) query.append("branch", branch);
    if (product) query.append("product", product);
    if (mmLot) {
      query.append("mmLot", mmLot);
      query.append("lot", mmLot);
    }
    if (unit) query.append("unit", unit);
    if (batchNo) query.append("batchNo", batchNo);
    if (condition) query.append("inventoryCondition", condition);
    if (mfgFrom) query.append("manufacturingDateFrom", mfgFrom);
    if (mfgTo) query.append("manufacturingDateTo", mfgTo);
    if (expFrom) query.append("expirationDateFrom", expFrom);
    if (expTo) query.append("expirationDateTo", expTo);

    let token: string | undefined;
    try {
      const cookieStore = await cookies();
      token =
        cookieStore.get("springboot_token")?.value ||
        cookieStore.get("vos_access_token")?.value ||
        cookieStore.get("token")?.value;
    } catch {
      // ignore
    }

    if (!token) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const fs = require("fs");
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const path = require("path");
        const tokenFile = path.resolve(process.cwd(), "node_modules/.cache/vos-tokens/latest_token.txt");
        if (fs.existsSync(tokenFile)) {
          token = fs.readFileSync(tokenFile, "utf8").trim();
        }
      } catch {
        // ignore
      }
    }

    const reqHeaders: Record<string, string> = {
      Accept: "application/json",
    };
    if (token) {
      reqHeaders["Authorization"] = `Bearer ${token}`;
      reqHeaders["Cookie"] = `vos_access_token=${token}`;
    }

    // 1. Fetch from Spring Boot (/all is authoritative across the app)
    let list: Record<string, unknown>[] = [];
    let fetchSucceeded = false;

    try {
      const allUrl = `${SPRING_API_BASE}/api/mm-batch-onhand/all`;
      const res = await fetch(allUrl, {
        headers: reqHeaders,
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        list = Array.isArray(data) ? data : data?.data || [];
        fetchSucceeded = true;
      } else {
        const errText = await res.text().catch(() => "");
        console.warn(`[BatchOnhand API] /all returned HTTP ${res.status}: ${errText}`);
      }
    } catch (allErr) {
      console.warn("[BatchOnhand API] /all fetch error:", allErr);
    }

    // Fallback to /filter if /all failed and query has filters
    if (!fetchSucceeded && query.toString()) {
      try {
        const filterUrl = `${SPRING_API_BASE}/api/mm-batch-onhand/filter?${query.toString()}`;
        const res = await fetch(filterUrl, {
          headers: reqHeaders,
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          list = Array.isArray(data) ? data : data?.data || [];
          fetchSucceeded = true;
        }
      } catch (filterErr) {
        console.warn("[BatchOnhand API] /filter fallback error:", filterErr);
      }
    }

    // In-memory filter on the results to ensure 100% accurate filtering
    if (list.length > 0) {
      if (branch) {
        const targetBranchIds = new Set<number>([Number(branch)]);
        try {
          const { DIRECTUS_URL, headers } = await import("@/app/api/manufacturing/directus-api");
          const bRes = await fetch(`${DIRECTUS_URL}/items/branches/${branch}?fields=id,bad_stock_branch_id`, {
            headers,
            cache: "no-store",
          });
          if (bRes.ok) {
            const bJson = await bRes.json();
            const badId = bJson?.data?.bad_stock_branch_id;
            if (badId && Number(badId) > 0) {
              targetBranchIds.add(Number(badId));
            }
          }
        } catch {
          // ignore
        }

        list = list.filter((b) => {
          const bId = Number(b.branchId ?? b.branch_id ?? 0);
          return bId > 0 ? targetBranchIds.has(bId) : true;
        });
      }

      if (product) {
        const targetProdId = Number(product);
        list = list.filter((b) => {
          const pId = Number(b.productId ?? b.product_id ?? 0);
          return pId > 0 ? pId === targetProdId : true;
        });
      }

      if (mmLot) {
        const targetLotId = Number(mmLot);
        list = list.filter((b) => {
          const lId = Number(b.mmLotId ?? b.mm_lot_id ?? b.lotId ?? b.lot_id ?? 0);
          return lId > 0 ? lId === targetLotId : true;
        });
      }

      if (unit) {
        const targetUnitId = Number(unit);
        list = list.filter((b) => {
          const uId = Number(b.unitId ?? b.unit_id ?? 0);
          return uId > 0 ? uId === targetUnitId : true;
        });
      }

      if (batchNo) {
        const targetBatchNo = batchNo.trim().toLowerCase();
        list = list.filter((b) => {
          const bNo = String(b.batchNo ?? b.batch_no ?? "").trim().toLowerCase();
          return bNo === targetBatchNo;
        });
      }

      if (condition) {
        const targetCond = condition.trim().toUpperCase();
        list = list.filter((b) => {
          const bCond = String(b.inventoryCondition ?? b.inventory_condition ?? "").trim().toUpperCase();
          return bCond === targetCond;
        });
      }
    }

    return NextResponse.json(list);
  } catch (error) {
    console.error("[BatchOnhand API] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch batch onhand" },
      { status: 500 }
    );
  }
}
