// src/app/api/fm/accounting/discount-management/customer-discounting/module-data/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCustomerDiscountingModuleData } from "../_module-data";
import { asNumber, asString, jsonError } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns paginated customer discounting dashboard data for client refreshes.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const data = await getCustomerDiscountingModuleData({
      page: asNumber(searchParams.get("page")) ?? 1,
      pageSize: asNumber(searchParams.get("page_size") ?? searchParams.get("pageSize")) ?? 10,
      search: asString(searchParams.get("q") ?? searchParams.get("search")),
      storeTypeId: asNumber(searchParams.get("store_type_id") ?? searchParams.get("storeTypeId")),
    });

    return NextResponse.json(data);
  } catch (error) {
    return jsonError(error);
  }
}
