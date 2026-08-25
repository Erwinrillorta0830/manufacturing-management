import { NextResponse } from "next/server";
import { stockAdjustmentManualService } from "@/modules/manufacturing-management/stock-adjustment-registration/services/stock-adjustment-manual-service";
import { handleApiError } from "@/modules/manufacturing-management/stock-adjustment-registration/utils/error-handler";

export async function GET() {
  try {
    const data = await stockAdjustmentManualService.fetchBranches();
    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
