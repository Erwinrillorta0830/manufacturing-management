import { fetchSupplierProducts } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-discount/services/products-per-suppliers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';


/**
 * GET /api/fm/supplier-discount/suppliers/[id]/products
 * Fetch all products for a specific supplier
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supplierId = parseInt(id);

    if (isNaN(supplierId)) {
      return NextResponse.json(
        { error: "Invalid supplier ID" },
        { status: 400 },
      );
    }

    const products = await fetchSupplierProducts(supplierId);

    return NextResponse.json(
      {
        data: products,
        count: products.length,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching supplier products:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch supplier products",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
