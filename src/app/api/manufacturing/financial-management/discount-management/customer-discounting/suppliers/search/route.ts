// src/app/api/fm/accounting/discount-management/customer-discounting/suppliers/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { asNumber, asString, directusFetch, DirectusList, jsonError, tradeSupplierParams } from "../../_utils";

type SupplierRow = {
  id?: unknown;
  supplier_name?: unknown;
  supplier_shortcut?: unknown;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Searches active trade suppliers for supplier/category rule assignment.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = asString(searchParams.get("q"));

    const res = await directusFetch<DirectusList<SupplierRow>>(
      `/items/suppliers?${tradeSupplierParams(q).toString()}`,
    );

    const data = (res.data ?? [])
      .map((row) => ({
        id: asNumber(row.id) ?? 0,
        supplierName: asString(row.supplier_name),
        supplierShortcut: asString(row.supplier_shortcut),
      }))
      .filter((row) => row.id > 0 && row.supplierName);

    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}
