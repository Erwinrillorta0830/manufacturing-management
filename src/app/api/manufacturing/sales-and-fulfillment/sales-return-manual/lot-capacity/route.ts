import { NextResponse } from "next/server";
import { fetchMmInventoryMovements } from "@/app/api/manufacturing/services/mm-inventory-movements.service";

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
      if (item.lot_id != null) {
        lotOnhandMap[item.lot_id] = (lotOnhandMap[item.lot_id] || 0) + (Number(item.quantity) || 0);
      }
    }
    return NextResponse.json({ data: lotOnhandMap });
  } catch (error: unknown) {
    console.error("[LotCapacity API] Failed to calculate lot capacity", error);
    const msg = error instanceof Error ? error.message : "Failed to calculate capacity";
    const status = (error as { status?: number })?.status || 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
