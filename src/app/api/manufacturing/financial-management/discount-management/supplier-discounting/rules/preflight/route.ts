// src/app/api/fm/accounting/discount-management/supplier-discounting/rules/preflight/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  asNumber,
  directusFetch,
  DirectusList,
  jsonError,
  relationId,
} from "../../_utils";

type RuleRow = {
  id?: unknown;
  product_id?: unknown;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => asNumber(item)).filter((item): item is number => !!item)))
    : [];
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const supplierId = asNumber(body.supplierId ?? body.supplier_id);
    const productIds = numberArray(body.productIds ?? body.product_ids);

    if (!supplierId || productIds.length === 0) {
      return NextResponse.json({ error: "supplierId and productIds are required" }, { status: 400 });
    }

    const params = new URLSearchParams();
    params.set("limit", "-1");
    params.set("fields", "id,product_id,product_id.product_id");
    params.set("filter[_and][0][supplier_id][_eq]", String(supplierId));
    params.set("filter[_and][1][product_id][_in]", productIds.join(","));

    const res = await directusFetch<DirectusList<RuleRow>>(`/items/product_per_supplier?${params.toString()}`);
    const existingLinks = (res.data ?? [])
      .map((row) => ({
        id: asNumber(row.id) ?? 0,
        productId: relationId(row.product_id, "product_id") ?? 0,
      }))
      .filter((row) => row.id > 0 && row.productId > 0);
    const existingIds = new Set(existingLinks.map((row) => row.productId));
    const newLinks = productIds.filter((productId) => !existingIds.has(productId));

    return NextResponse.json({ newLinks, existingLinks });
  } catch (error) {
    return jsonError(error);
  }
}
