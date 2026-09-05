import { NextRequest, NextResponse } from "next/server";
import {
  fetchAllSuppliers,
  createSupplier,
  searchSuppliers,
} from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/services/supplier";
import { SupplierFormSchema } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/types/supplier.schema";

/**
 * GET /api/suppliers
 * Query params:
 * - search: string (optional) - Search by name, TIN, or contact person
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search");

    let suppliers;

    if (search && search.trim() !== "") {
      suppliers = await searchSuppliers(search.trim());
    } else {
      suppliers = await fetchAllSuppliers();
    }

    return NextResponse.json({
      success: true,
      data: suppliers,
      count: suppliers.length,
    });
  } catch (error) {
    console.error("GET /api/suppliers error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to fetch suppliers",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/suppliers
 * Create new supplier
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate with Zod schema
    const validatedData = SupplierFormSchema.parse(body);

    const supplierWithMetadata = {
      ...validatedData,
      date_added: new Date().toISOString(),
    };

    // Create supplier
    const newSupplier = await createSupplier(supplierWithMetadata);

    return NextResponse.json(
      {
        success: true,
        data: newSupplier,
        message: "Supplier created successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/suppliers error:", error);

    // Zod validation error
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: error,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to create supplier",
      },
      { status: 500 },
    );
  }
}

