import { fetchAllDiscountTypes } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/services/discount-types";
import { NextResponse } from "next/server";

/**
 * GET /api/manufacturing/financial-management/discount-management/supplier-registration/discount_types
 * Fetch all discount types
 */
export async function GET() {
  try {
    const discountTypes = await fetchAllDiscountTypes();

    return NextResponse.json(
      {
        data: discountTypes,
        count: discountTypes.length,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("Error fetching discount types:", error);
    return NextResponse.json(
      {
        error: "Failed to fetch discount types",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

