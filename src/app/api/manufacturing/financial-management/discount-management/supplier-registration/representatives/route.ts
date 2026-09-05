import { NextRequest, NextResponse } from "next/server";
import {
  fetchRepresentativesBySupplier,
  fetchAllRepresentatives,
  createRepresentative,
  checkRepresentativeDuplicate,
} from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/services/representative";
import { RepresentativeFormSchema } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/types/representative.schema";

/**
 * GET /api/representatives
 * Query params:
 * - supplier_id: number (optional) - Filter by supplier
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const supplierIdParam = searchParams.get("supplier_id");

    let representatives;

    if (supplierIdParam) {
      const supplierId = parseInt(supplierIdParam);
      if (isNaN(supplierId)) {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid supplier_id parameter",
          },
          { status: 400 },
        );
      }
      representatives = await fetchRepresentativesBySupplier(supplierId);
    } else {
      representatives = await fetchAllRepresentatives();
    }

    return NextResponse.json({
      success: true,
      data: representatives,
      count: representatives.length,
    });
  } catch (error) {
    console.error("GET /api/representatives error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch representatives",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/representatives
 * Create new representative
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate with Zod schema
    const validatedData = RepresentativeFormSchema.parse(body);

    // Check for duplicates (Email, Contact, or Name) for this supplier
    const duplicateCheck = await checkRepresentativeDuplicate(
      validatedData,
      validatedData.supplier_id,
    );

    if (duplicateCheck.isDuplicate) {
      let errorMessage = "A representative with these details already exists for this supplier";
      
      if (duplicateCheck.type === "email") {
        errorMessage = "A representative with this email already exists for this supplier";
      } else if (duplicateCheck.type === "contact") {
        errorMessage = "A representative with this contact number already exists for this supplier";
      } else if (duplicateCheck.type === "name") {
        errorMessage = "A representative with this name already exists for this supplier";
      }

      return NextResponse.json(
        {
          success: false,
          error: errorMessage,
        },
        { status: 409 }, // Conflict
      );
    }

    // Create representative
    const newRepresentative = await createRepresentative(validatedData);

    return NextResponse.json(
      {
        success: true,
        data: newRepresentative,
        message: "Representative added successfully",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/representatives error:", error);

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
          error instanceof Error
            ? error.message
            : "Failed to create representative",
      },
      { status: 500 },
    );
  }
}

