import {
  fetchAllProducts,
  searchProducts,
} from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/services/products";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';


/**
 * GET /api/manufacturing/financial-management/discount-management/supplier-registration/products
 * Fetch all products or search by query
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search");

    let products;
    if (search && search.trim() !== "") {
      products = await searchProducts(search.trim());
    } else {
      products = await fetchAllProducts();
    }

    return NextResponse.json(
      {
        data: products,
        count: products.length,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch products",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

