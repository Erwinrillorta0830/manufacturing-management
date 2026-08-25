import { NextResponse } from "next/server";
import { stockAdjustmentManualService } from "@/modules/manufacturing-management/stock-adjustment-registration/services/stock-adjustment-manual-service";
import { handleApiError } from "@/modules/manufacturing-management/stock-adjustment-registration/utils/error-handler";

/**
 * GET /api/scm/inventory-management/stock-adjustment-manual/suppliers
 * Returns active suppliers (nonBuy = 0) for the supplier filter dropdown.
 */
export async function GET() {
  try {
    const data = await stockAdjustmentManualService.fetchSuppliers();
    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
