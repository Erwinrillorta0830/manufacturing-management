import { NextResponse, NextRequest } from "next/server";
import { getSingleItemSystemOnhand } from "../movements-helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturing/physical-inventory-manufacturing/onhand
 * Fetch real-time system on-hand count from Spring movements API (with Directus fallback)
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get("branch_id");
        const inventoryLotId = searchParams.get("inventory_lot_id");
        const lotId = searchParams.get("lot_id");
        const productId = searchParams.get("product_id");
        const condition = searchParams.get("condition") || "GOOD";
        const productTypeId = searchParams.get("product_type_id");

        if (!branchId || (!inventoryLotId && !productId)) {
            return NextResponse.json({ success: false, error: "branch_id and (inventory_lot_id or product_id) are required." }, { status: 400 });
        }

        const bId = Number(branchId);
        const invLotId = inventoryLotId ? Number(inventoryLotId) : null;
        const lId = lotId ? Number(lotId) : null;
        const pId = productId ? Number(productId) : null;
        const ptId = productTypeId ? Number(productTypeId) : null;

        const onhandQuantity = await getSingleItemSystemOnhand(bId, invLotId, lId, pId, condition, ptId);

        return NextResponse.json({
            success: true,
            data: {
                branch_id: bId,
                inventory_lot_id: invLotId,
                lot_id: lId,
                product_id: pId,
                inventory_condition: condition.toUpperCase(),
                onhand_quantity: onhandQuantity,
            },
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
