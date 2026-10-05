import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers as baseHeaders } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN;
const HEADERS: Record<string, string> = {
  ...baseHeaders,
  ...(STATIC_TOKEN ? { Authorization: `Bearer ${STATIC_TOKEN}` } : {}),
};

async function directusGet<T>(path: string): Promise<T[]> {
  try {
    const url = `${DIRECTUS_URL?.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : json?.data || [];
  } catch (err) {
    console.warn(`[LotTransfer Lookups] Error fetching ${path}:`, err);
    return [];
  }
}

export async function GET() {
  try {
    const [rawLots, rawBranches, rawUnits, rawUsers, rawProducts] = await Promise.all([
      directusGet<Record<string, unknown>>("/items/mm_lots?limit=-1&fields=lot_id,lot_name,branch_id,unit_id,max_batch_capacity,status"),
      directusGet<Record<string, unknown>>("/items/branches?limit=-1&fields=id,branch_name,branch_code,isActive"),
      directusGet<Record<string, unknown>>("/items/units?limit=-1&fields=unit_id,unit_name,unit_shortcut"),
      directusGet<Record<string, unknown>>("/items/user?limit=-1&fields=user_id,user_fname,user_lname"),
      directusGet<Record<string, unknown>>("/items/products?limit=-1&fields=product_id,product_name,product_code,sku_code,uom_id,cost_per_unit,price_per_unit,estimated_unit_cost,description"),
    ]);

    const lotNames: Record<string, string> = {};
    const lots = rawLots.map((l) => {
      const lotId = Number(l.lot_id || l.id);
      const lotName = String(l.lot_name || `Lot #${lotId}`);
      if (lotId > 0) lotNames[String(lotId)] = lotName;
      return {
        lotId,
        lotName,
        branchId: Number(l.branch_id || 0),
        unitId: l.unit_id ? Number(l.unit_id) : null,
        maxBatchCapacity: Number(l.max_batch_capacity || 10),
        status: String(l.status || "ACTIVE"),
      };
    });

    const branchNames: Record<string, string> = {};
    const branches = rawBranches.map((b) => {
      const id = Number(b.id || b.branch_id);
      const branchName = String(b.branch_name || b.name || `Branch #${id}`);
      const isActiveRaw = b.isActive ?? b.is_active;
      const isActive = Number(isActiveRaw) === 1 || isActiveRaw === true || isActiveRaw === "1";
      if (id > 0) branchNames[String(id)] = branchName;
      return {
        id,
        branchName,
        branchCode: (b.branch_code || b.code) as string | undefined,
        isActive,
      };
    });

    const unitNames: Record<string, string> = {};
    const units = rawUnits.map((u) => {
      const unitId = Number(u.unit_id || u.id);
      const unitName = String(u.unit_name || u.name || `Unit #${unitId}`);
      const unitShortcut = (u.unit_shortcut || u.shortcut) as string | undefined;
      const display = unitShortcut ? `${unitName} (${unitShortcut})` : unitName;
      if (unitId > 0) unitNames[String(unitId)] = display;
      return {
        unitId,
        unitName,
        unitShortcut,
      };
    });

    const userNames: Record<string, string> = {};
    const users = rawUsers.map((u) => {
      const userId = Number(u.user_id || u.id);
      const fname = String(u.user_fname || "").trim();
      const lname = String(u.user_lname || "").trim();
      const fullName = [fname, lname].filter(Boolean).join(" ") || `User #${userId}`;
      if (userId > 0) userNames[String(userId)] = fullName;
      return {
        userId,
        fullName,
        fname,
        lname,
      };
    });

    const productNames: Record<string, string> = {};
    const productDescriptions: Record<string, string> = {};
    const products = rawProducts.map((p) => {
      const productId = Number(p.product_id || p.id);
      const productName = String(p.product_name || p.name || `Product #${productId}`);
      const productCode = (p.product_code || p.code || p.sku_code) as string | undefined;
      const description = (p.description as string | undefined)?.trim();
      const rawCost = p.cost_per_unit ?? p.price_per_unit ?? p.estimated_unit_cost;
      const unitCost = rawCost !== null && rawCost !== undefined && !isNaN(Number(rawCost)) ? Number(rawCost) : 0;
      if (productId > 0) {
        productNames[String(productId)] = productName;
        if (description) {
          productDescriptions[String(productId)] = description;
        }
      }
      return {
        productId,
        productName,
        productCode,
        description,
        unitCost,
      };
    });

    return NextResponse.json({
      lots,
      branches,
      units,
      users,
      products,
      maps: {
        lotNames,
        branchNames,
        unitNames,
        userNames,
        productNames,
        productDescriptions,
      },
    });
  } catch (error) {
    console.error("[LotTransfer Lookups API] Error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to load lookup dictionaries" },
      { status: 500 }
    );
  }
}
