
import { NextResponse } from "next/server";
import { stockAdjustmentManualService } from "@/modules/manufacturing-management/stock-adjustment-registration/services/stock-adjustment-manual-service";

export async function GET() {
  try {
    const data = await stockAdjustmentManualService.fetchUnits();
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
