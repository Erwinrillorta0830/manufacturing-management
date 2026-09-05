import { NextRequest, NextResponse } from "next/server";
import { deleteRepresentative } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/services/representative";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }, // 1. Define params as a Promise
) {
  try {
    const resolvedParams = await params;
    const id = parseInt(resolvedParams.id);

    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid representative ID" },
        { status: 400 },
      );
    }

    await deleteRepresentative(id);

    return NextResponse.json({
      success: true,
      message: "Representative removed successfully",
    });
  } catch (error) {
    console.error("DELETE error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to delete",
      },
      { status: 500 },
    );
  }
}
