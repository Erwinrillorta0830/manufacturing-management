import { NextRequest, NextResponse } from "next/server";
import { createBulkSupplierProducts } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-discount/services/products-per-suppliers";
import { ProductCategoryTypeValidationError, validateSupplierProductIds } from "@/app/api/manufacturing/procurement/_category-type";

/**
 * POST /api/fm/supplier-discount/suppliers/[id]/products/bulk
 * Bulk add products to a supplier
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supplierId = parseInt(id);
    if (isNaN(supplierId)) {
      return NextResponse.json(
        { success: false, error: "Invalid supplier ID" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { product_ids } = body;

    if (!Array.isArray(product_ids) || product_ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "No products provided" },
        { status: 400 }
      );
    }

    await validateSupplierProductIds(product_ids.map((productId: number) => Number(productId)));

    // Map product IDs to the format expected by the service
    const items = product_ids.map((productId: number) => ({
      supplier_id: supplierId,
      product_id: productId,
      discount_type: null,
    }));

    const result = await createBulkSupplierProducts(items);

    return NextResponse.json({
      success: true,
      data: result,
      message: `Successfully added ${result.length} products`,
    });
  } catch (error) {
    console.error("Bulk product assignment error:", error);
    if (error instanceof ProductCategoryTypeValidationError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
          details: error.details,
        },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Bulk assignment failed",
      },
      { status: 500 }
    );
  }
}
