import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SPRING_API_BASE = process.env.SPRING_API_BASE_URL || "http://100.95.246.18:8188";

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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const branch = searchParams.get("branch") || searchParams.get("branch_id");
    const product = searchParams.get("product") || searchParams.get("product_id");
    const unit = searchParams.get("unit") || searchParams.get("unit_id");

    const query = new URLSearchParams();
    if (branch) query.append("branch", branch);
    if (product) query.append("product", product);
    if (unit) query.append("unit", unit);

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
      ? `${SPRING_API_BASE}/api/mm-product-onhand/filter?${query.toString()}`
      : `${SPRING_API_BASE}/api/mm-product-onhand/all`;

    try {
      const res = await fetch(springUrl, {
        headers: reqHeaders,
        cache: "no-store",
      });

      if (res.ok) {
        const data = await res.json();
        const list = Array.isArray(data) ? data : data?.data || [];
        return NextResponse.json(list);
      } else {
        const errText = await res.text();
        console.error(`[ProductOnhand API] Spring Boot error HTTP ${res.status}:`, errText);
        return NextResponse.json(
          { error: `Spring Boot error HTTP ${res.status}: ${errText}`, status: res.status },
          { status: res.status }
        );
      }
    } catch (springErr) {
      console.error(`[ProductOnhand API] Spring Boot fetch exception:`, springErr);
      return NextResponse.json(
        { error: (springErr as Error).message || "Spring Boot connection failed" },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error("[ProductOnhand API] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch product onhand" },
      { status: 500 }
    );
  }
}
