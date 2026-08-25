import { NextResponse, NextRequest } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getJwtSubFromReq } from "@/lib/directus";
import { parseBooleanFlag, extractId, roundQty, recalculateHeaderTotals } from "../../helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/manufacturing/physical-inventory-manufacturing/[id]/commit
 * Finalizes and commits the Physical Inventory sheet.
 */
export async function POST(request: NextRequest, context: RouteParams) {
    try {
        const { id } = await context.params;
        const sheetId = Number(id);
        if (isNaN(sheetId) || sheetId <= 0) {
            return NextResponse.json({ success: false, error: "Invalid Physical Inventory ID" }, { status: 400 });
        }

        // 1. Fetch PI Header
        const headerRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}?fields=*,branch_id.*`, { headers, cache: "no-store" });
        if (!headerRes.ok) {
            return NextResponse.json({ success: false, error: "Physical Inventory sheet not found" }, { status: 404 });
        }
        const sheet = (await headerRes.json()).data;

        // 2. Validate current status
        const isCommitted = parseBooleanFlag(sheet.isCommitted);
        const isCancelled = parseBooleanFlag(sheet.isCancelled);

        if (sheet.status !== "PENDING_REVIEW") {
            return NextResponse.json({ success: false, error: `Only PENDING_REVIEW sheets can be committed. Current status: ${sheet.status}` }, { status: 400 });
        }
        if (isCommitted || isCancelled) {
            return NextResponse.json({ success: false, error: "This physical inventory record is already committed or cancelled." }, { status: 409 });
        }

        const piBranchId = extractId(sheet.branch_id);
        const isOpening = sheet.stock_type === "OPENING";

        // 3. Fetch details
        const detailsRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory_details?filter[physical_inventory_id][_eq]=${sheetId}&limit=-1&fields=*,inventory_lot_id.*,lot_id.*,product_id.*,product_id.unit_of_measurement.*,unit_id.*`, { headers, cache: "no-store" });
        if (!detailsRes.ok) {
            return NextResponse.json({ success: false, error: "Failed to load detail records." }, { status: 500 });
        }
        const details = (await detailsRes.json()).data || [];
        if (details.length === 0) {
            return NextResponse.json({ success: false, error: "Cannot commit a Physical Inventory sheet with no detail rows." }, { status: 400 });
        }

        // 4. Revalidate all line items
        for (const d of details) {
            const batchId = extractId(d.inventory_lot_id, "inventory_lot_id");
            const lotId = extractId(d.lot_id, "lot_id");
            const productId = extractId(d.product_id, "product_id");
            const unitId = extractId(d.unit_id, "unit_id");
            const conditionStr = (d.inventory_condition || "GOOD").trim().toUpperCase();

            if (!batchId || !lotId || !productId) {
                return NextResponse.json({ success: false, error: `Invalid detail row ID ${d.physical_inventory_detail_id || d.id}: Batch, lot, or product missing.` }, { status: 400 });
            }

            // Verify lot UOM matches product UOM
            const lotRes = await fetch(`${DIRECTUS_URL}/items/mm_lots/${lotId}`, { headers, cache: "no-store" });
            if (!lotRes.ok) {
                return NextResponse.json({ success: false, error: `Lot ID ${lotId} not found.` }, { status: 404 });
            }
            const lot = (await lotRes.json()).data;
            const lotUnitId = extractId(lot.unit_id);
            if (lotUnitId !== unitId) {
                return NextResponse.json({ success: false, error: `Product UOM mismatch for detail batch ${d.batch_no || batchId}.` }, { status: 400 });
            }

            // 5. For REGULAR Physical Inventory: Verify system count is NOT stale
            if (!isOpening) {
                let currentOnhand = 0;
                const onhandUrl = `${DIRECTUS_URL}/items/v_mm_batch_onhand?filter[branch_id][_eq]=${piBranchId}&filter[inventory_lot_id][_eq]=${batchId}&filter[lot_id][_eq]=${lotId}&filter[product_id][_eq]=${productId}&filter[inventory_condition][_eq]=${encodeURIComponent(conditionStr)}&limit=1`;
                const onhandRes = await fetch(onhandUrl, { headers, cache: "no-store" });
                if (onhandRes.ok) {
                    const onhandJson = await onhandRes.json();
                    if (onhandJson.data && onhandJson.data.length > 0) {
                        currentOnhand = roundQty(onhandJson.data[0].onhand_quantity || 0);
                    }
                }

                const savedSysCount = roundQty(d.system_count);
                if (Math.abs(currentOnhand - savedSysCount) > 0.000001) {
                    return NextResponse.json({
                        success: false,
                        error: `System count for batch ${d.batch_no || batchId} is stale (Saved: ${savedSysCount}, Current On-hand: ${currentOnhand}). Please refresh system counts before committing.`,
                    }, { status: 409 });
                }
            }
        }

        // 6. Recalculate totals
        await recalculateHeaderTotals(sheetId);

        // 7. Extract committing user
        const authUserId = getJwtSubFromReq(request);
        const committedBy = authUserId || null;

        // 8. Execute Commit Update
        const commitPayload = {
            status: "COMMITTED",
            isCommitted: 1,
            committed_at: new Date().toISOString(),
            committed_by: committedBy,
        };

        const updateUrl = `${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}`;
        const commitRes = await fetch(updateUrl, {
            method: "PATCH",
            headers,
            body: JSON.stringify(commitPayload),
        });

        if (!commitRes.ok) {
            const errText = await commitRes.text();
            throw new Error(`Directus failed to commit physical inventory: ${errText}`);
        }

        const committedData = (await commitRes.json()).data;
        return NextResponse.json({
            success: true,
            data: committedData,
            message: "Physical inventory sheet committed successfully.",
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        console.error("Commit API error:", error);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
