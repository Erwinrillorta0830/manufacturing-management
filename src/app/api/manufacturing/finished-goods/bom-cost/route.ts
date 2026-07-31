import { NextResponse } from "next/server";
import { calculateRollupCost } from "../products/products-helper";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const productIdStr = searchParams.get("productId");
        const versionIdStr = searchParams.get("versionId");
        const forexRateStr = searchParams.get("forexRate");

        const forexRate = forexRateStr ? parseFloat(forexRateStr) : 58.00;

        if (!productIdStr) {
            return NextResponse.json({ cost: 0, hasCogs: false });
        }

        const productId = parseInt(productIdStr);
        const versionId = versionIdStr ? parseInt(versionIdStr) : undefined;

        // Calculate cost using rollup engine helper (which handles version -> routes -> bom_items)
        const rollup = await calculateRollupCost(productId, new Set(), undefined, forexRate, undefined, versionId);
        const hasCogs = rollup.bomId !== null && rollup.costTree.length > 0;

        return NextResponse.json({
            cost: hasCogs ? rollup.unitCost : 0,
            batchCost: rollup.batchCost,
            hasCogs,
            rollup
        });

    } catch (e) {
        console.error("API Error calculating BOM cost:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to calculate cost" }, { status: 500 });
    }
}
