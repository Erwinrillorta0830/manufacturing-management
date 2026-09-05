import {
  fetchSupplierProducts,
  addProductToSupplier,
  isProductAlreadyAdded,
} from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/services/products-per-suppliers";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';


/**
 * GET /api/fm/supplier-registration/suppliers/[id]/products
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

/**
 * POST /api/fm/supplier-registration/suppliers/[id]/products
 * Add a product to a supplier
 */
export async function POST(
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

    const body = await request.json();
    const { product_id, discount_type } = body;

    if (!product_id) {
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400 },
      );
    }

    // Check if product already exists for this supplier
    const exists = await isProductAlreadyAdded(supplierId, product_id);
    if (exists) {
      return NextResponse.json(
        { error: "This product is already assigned to this supplier" },
        { status: 409 },
      );
    }

    const result = await addProductToSupplier({
      supplier_id: supplierId,
      product_id,
      discount_type: discount_type || null,
    });

    return NextResponse.json(
      {
        data: result,
        message: "Product added successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Error adding product to supplier:", error);
    return NextResponse.json(
      {
        error: "Failed to add product to supplier",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
