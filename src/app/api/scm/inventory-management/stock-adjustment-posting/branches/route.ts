import { NextResponse } from "next/server";
import { stockAdjustmentService } from "@/modules/manufacturing-management/stock-adjustment-posting/services/stock-adjustment-service";
import { handleApiError } from "@/modules/manufacturing-management/stock-adjustment-posting/utils/error-handler";

export async function GET() {
  try {
    const data = await stockAdjustmentService.fetchBranches();
    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
