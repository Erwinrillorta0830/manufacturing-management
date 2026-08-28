import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPRING_API_BASE = process.env.SPRING_API_BASE_URL || "http://100.95.246.18:8188";

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const branch = searchParams.get("branch") || searchParams.get("branch_id");
    const product = searchParams.get("product") || searchParams.get("product_id");
    const lot = searchParams.get("lot") || searchParams.get("lot_id");
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
    if (lot) query.append("lot", lot);
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
    }

    // 1. Call Spring Boot with Authorization header
    const springUrl = query.toString()
      ? `${SPRING_API_BASE}/api/mm-batch-onhand/filter?${query.toString()}`
      : `${SPRING_API_BASE}/api/mm-batch-onhand/all`;

    console.log(`[BatchOnhand API] Calling Spring Boot: ${springUrl} (hasToken: ${!!token})`);

    try {
      const res = await fetch(springUrl, {
        headers: reqHeaders,
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data?.data || [];
        console.log(`[BatchOnhand API] Spring Boot returned ${list.length} batches:`, JSON.stringify(list));
        return NextResponse.json(list);
      } else {
        const errText = await res.text();
        console.error(`[BatchOnhand API] Spring Boot error HTTP ${res.status}:`, errText);
        return NextResponse.json(
          { error: `Spring Boot error HTTP ${res.status}: ${errText}`, status: res.status },
          { status: res.status }
        );
      }
    } catch (springErr) {
      console.error(`[BatchOnhand API] Spring Boot fetch exception:`, springErr);
      return NextResponse.json(
        { error: (springErr as Error).message || "Spring Boot connection failed" },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("[BatchOnhand API] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch batch onhand" },
      { status: 500 }
    );
  }
}
