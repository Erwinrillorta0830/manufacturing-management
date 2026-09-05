import { NextRequest, NextResponse } from "next/server";
import {
  updateSupplier,
  // deleteSupplier,
  fetchSupplierById, // Assuming you have these in your supplier service
} from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/services/supplier";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET: Fetch a single supplier's details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const data = await fetchSupplierById(parseInt(id));
    return NextResponse.json({ success: true, data });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

/**
 * PATCH: This fixes your 405 error when editing a supplier!
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Call the service to update Directus
    const result = await updateSupplier(parseInt(id), body);

    return NextResponse.json({
      success: true,
      data: result,
      message: "Supplier updated successfully",
    });
  } catch (error: unknown) {
    console.error("PATCH Supplier Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update supplier" },
      { status: 500 },
    );
  }
}

/**
 * DELETE: Remove a supplier
 */
// export async function DELETE(request: NextRequest, { params }: RouteParams) {
//   try {
//     const { id } = await params;
//     await deleteSupplier(parseInt(id));
//     return NextResponse.json({ success: true, message: "Supplier deleted" });
//   } catch (error: unknown) {
//     return NextResponse.json(
//       { success: false, error: error.message },
//       { status: 500 },
//     );
//   }
// }
