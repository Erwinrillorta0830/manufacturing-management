// src/app/api/fm/accounting/discount-management/customer-discounting/customers/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  asNumber,
  asString,
  directusFetch,
  discountLabel,
  DirectusList,
  jsonError,
  relationId,
  relationName,
} from "../../_utils";

type CustomerRow = {
  id?: unknown;
  customer_code?: unknown;
  customer_name?: unknown;
  store_name?: unknown;
  store_type?: unknown;
  discount_type?: unknown;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Searches active customers for the module quick-open combobox.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = asString(searchParams.get("q"));

    if (q.length < 2) return NextResponse.json({ data: [] });

    const params = new URLSearchParams();
    params.set("limit", "30");
    params.set("sort", "customer_name");
    params.set(
      "fields",
      [
        "id",
        "customer_code",
        "customer_name",
        "store_name",
        "store_type",
        "store_type.id",
        "store_type.store_type",
        "isActive",
        "discount_type",
        "discount_type.id",
        "discount_type.discount_type",
        "discount_type.total_percent",
      ].join(","),
    );
    params.set("filter[_and][0][isActive][_eq]", "1");
    params.set("filter[_and][1][_or][0][customer_name][_contains]", q);
    params.set("filter[_and][1][_or][1][customer_code][_contains]", q);
    params.set("filter[_and][1][_or][2][store_name][_contains]", q);

    const res = await directusFetch<DirectusList<CustomerRow>>(`/items/customer?${params.toString()}`);
    const data = (res.data ?? [])
      .map((row) => ({
        id: asNumber(row.id) ?? 0,
        customerCode: asString(row.customer_code),
        customerName: asString(row.customer_name),
        storeName: asString(row.store_name),
        storeTypeId: relationId(row.store_type),
        storeTypeName: relationName(row.store_type, "store_type"),
        globalDiscount: discountLabel(row.discount_type),
      }))
      .filter((row) => row.id > 0 && row.customerCode && row.customerName);

    return NextResponse.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}
