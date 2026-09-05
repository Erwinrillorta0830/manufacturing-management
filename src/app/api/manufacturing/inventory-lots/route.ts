import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const branchId = searchParams.get("branch_id");
    const productId = searchParams.get("product_id");
    const lotId = searchParams.get("lot_id");
    const qaStatus = searchParams.get("qa_status");
    const status = searchParams.get("status");

    const filters: Record<string, unknown> = {};
    if (branchId) filters.branch_id = { _eq: Number(branchId) };
    if (productId) filters.product_id = { _eq: Number(productId) };
    if (lotId) filters.lot_id = { _eq: Number(lotId) };
    if (qaStatus) filters.qa_status = { _eq: qaStatus };
    if (status) filters.status = { _eq: status };

    const queryStr = Object.keys(filters).length > 0
      ? `&filter=${encodeURIComponent(JSON.stringify(filters))}`
      : "";

    const fields = "*,lot_id.lot_id,lot_id.lot_name,lot_id.branch_id,branch_id.id,branch_id.branch_name,branch_id.branch_code,product_id.product_id,product_id.product_name,product_id.product_code,product_id.product_type,product_id.product_category.category_name,product_id.unit_of_measurement.unit_name";

    // Try mm_inventory_lots first
    let res = await fetch(`${DIRECTUS_URL}/items/mm_inventory_lots?limit=-1&fields=${fields}${queryStr}`, {
      headers,
      cache: "no-store",
    });

    if (!res.ok) {
      // Fallback to inventory_lots
      res = await fetch(`${DIRECTUS_URL}/items/inventory_lots?limit=-1&fields=${fields}${queryStr}`, {
        headers,
        cache: "no-store",
      });
    }

    if (!res.ok) {
      const errTxt = await res.text();
      console.warn(`[InventoryLots API] Directus fetch failed (${res.status}): ${errTxt}`);
      return NextResponse.json([]);
    }

    const data = await res.json();
    return NextResponse.json(data.data || []);
  } catch (error) {
    console.error("[InventoryLots API] GET error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to fetch inventory lots" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Get logged in user ID from cookie if available
    let userId: number | null = body.created_by || null;
    if (!userId) {
      try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        if (token) {
          const parts = token.split(".");
          if (parts.length >= 2) {
            const base64Url = parts[1];
            let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
            while (base64.length % 4) base64 += "=";
            const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
            const payload = JSON.parse(jsonPayload);
            userId = payload?.id || payload?.user_id || payload?.sub || null;
          }
        }
      } catch {
        // ignore cookie parse error
      }
    }

    const postBody = {
      ...body,
      created_by: userId ? Number(userId) : body.created_by || 24,
    };

    let res = await fetch(`${DIRECTUS_URL}/items/mm_inventory_lots`, {
      method: "POST",
      headers,
      body: JSON.stringify(postBody),
    });

    if (!res.ok) {
      res = await fetch(`${DIRECTUS_URL}/items/inventory_lots`, {
        method: "POST",
        headers,
        body: JSON.stringify(postBody),
      });
    }

    if (!res.ok) {
      const errTxt = await res.text();
      return NextResponse.json(
        { error: `Directus create error: ${errTxt}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ success: true, data: data.data });
  } catch (error) {
    console.error("[InventoryLots API] POST error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to create inventory lot" },
      { status: 500 }
    );
  }
}
