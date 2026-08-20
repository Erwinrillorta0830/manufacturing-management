// src/app/api/fm/accounting/discount-management/supplier-discounting/module-data/route.ts
import { NextResponse } from "next/server";
import { getSupplierDiscountingModuleData } from "../_module-data";
import { jsonError } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getSupplierDiscountingModuleData());
  } catch (error) {
    return jsonError(error);
  }
}
