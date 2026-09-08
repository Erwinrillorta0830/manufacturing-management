import { NextResponse } from "next/server";
import { stockAdjustmentManualService } from "@/modules/manufacturing-management/stock-adjustment-manual-registration/services/stock-adjustment-manual-service";
import { handleApiError } from "@/modules/manufacturing-management/stock-adjustment-manual-registration/utils/error-handler";

/**
 * GET /api/scm/inventory-management/stock-adjustment-manual/products
 *
 * Query params:
 *   - search   (optional) — filter by product name/code/barcode
 *   - supplierId (optional) — when provided, only products linked to this supplier
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || undefined;
    const supplierId = searchParams.get("supplierId");

    const inventoryType = searchParams.get("inventoryType");

    let data;
    if (inventoryType === "FINISHED_GOODS") {
      data = await stockAdjustmentManualService.fetchFinishedGoodsProducts(search);
    } else if (supplierId) {
      // Supplier-filtered product fetch
      data = await stockAdjustmentManualService.fetchProductsBySupplier(
        Number(supplierId),
        search
      );
    } else {
      // Fallback: fetch finished goods or all products
      data = await stockAdjustmentManualService.fetchFinishedGoodsProducts(search);
    }

    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error);
  }
}
