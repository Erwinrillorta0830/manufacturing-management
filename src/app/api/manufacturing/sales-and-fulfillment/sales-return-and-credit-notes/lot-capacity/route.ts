import { NextResponse } from "next/server";
import { fetchMmInventoryMovements } from "@/app/api/manufacturing/services/mm-inventory-movements.service";
import { handleApiError } from "@/modules/manufacturing-management/sales-and-fulfillment/sales-return-and-credit-notes/lib/handle-api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const branch = searchParams.get("branch_id");
    const unit = searchParams.get("unit_id");

    if (!branch || !unit) {
      return NextResponse.json({ error: "branch_id and unit_id are required" }, { status: 400 });
    }

    const list = await fetchMmInventoryMovements({
      branch: Number(branch),
      unit: Number(unit)
    });

    // Aggregate onhandQuantity strictly by mm_lot_id (lot_id)
    const lotOnhandMap: Record<number, number> = {};
    for (const item of list) {
      const lotId = item.mm_lot_id ?? item.lot_id;
      if (lotId != null) {
        const idNum = Number(lotId);
        if (!isNaN(idNum)) {
          lotOnhandMap[idNum] = (lotOnhandMap[idNum] || 0) + (Number(item.quantity) || 0);
        }
      }
    }
    return NextResponse.json({ data: lotOnhandMap });
  } catch (error) {
    return handleApiError(error, "Failed to calculate capacity");
  }
}
