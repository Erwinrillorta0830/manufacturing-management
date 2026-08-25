import { NextResponse, NextRequest } from "next/server";
import { extractId, parseBooleanFlag, resolveBatchPrices, recalculateHeaderTotals, roundQty, roundMoney } from "../helper";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * GET /api/manufacturing/physical-inventory-manufacturing/[id]
 * Get single Physical Inventory record with populated details
 */
export async function GET(_request: NextRequest, context: RouteParams) {
    try {
        const { id } = await context.params;
        const sheetId = Number(id);
        if (isNaN(sheetId) || sheetId <= 0) {
            return NextResponse.json({ success: false, error: "Invalid Physical Inventory ID" }, { status: 400 });
        }

        const headerUrl = `${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}?fields=*,branch_id.*,product_type_id.*,price_type_id.*,encoder_id.*,committed_by.*,cancelled_by.*`;
        const headerRes = await fetch(headerUrl, { headers, cache: "no-store" });
        if (!headerRes.ok) {
            return NextResponse.json({ success: false, error: "Physical Inventory sheet not found" }, { status: 404 });
        }

        const headerData = (await headerRes.json()).data;

        // Fetch details
        const detailsUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details?filter[physical_inventory_id][_eq]=${sheetId}&limit=-1&fields=*,inventory_lot_id.*,lot_id.*,product_id.*,product_id.product_type.*,product_id.unit_of_measurement.*,unit_id.*`;
        const detailsRes = await fetch(detailsUrl, { headers, cache: "no-store" });
        let detailsData = [];
        if (detailsRes.ok) {
            detailsData = (await detailsRes.json()).data || [];
        }

        return NextResponse.json({
            success: true,
            data: {
                ...headerData,
                details: detailsData,
            },
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}

/**
 * PATCH /api/manufacturing/physical-inventory-manufacturing/[id]
 * Update draft Physical Inventory header metadata (remarks, dates, product_type_id, price_type_id)
 */
export async function PATCH(request: NextRequest, context: RouteParams) {
    try {
        const { id } = await context.params;
        const sheetId = Number(id);
        if (isNaN(sheetId) || sheetId <= 0) {
            return NextResponse.json({ success: false, error: "Invalid Physical Inventory ID" }, { status: 400 });
        }

        const checkRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}`, { headers, cache: "no-store" });
        if (!checkRes.ok) {
            return NextResponse.json({ success: false, error: "Physical Inventory sheet not found" }, { status: 404 });
        }

        const sheet = (await checkRes.json()).data;
        const statusUpper = String(sheet.status || "").toUpperCase();
        const isCommitted = parseBooleanFlag(sheet.isCommitted);
        const isCancelled = parseBooleanFlag(sheet.isCancelled);

        if (statusUpper !== "DRAFT" || isCommitted || isCancelled) {
            return NextResponse.json({ success: false, error: "Committed or cancelled physical inventory records cannot be edited." }, { status: 400 });
        }

        const body = await request.json();
        const { starting_date, cutoff_date, remarks, stock_type, product_type_id, price_type_id } = body;

        const updatePayload: Record<string, unknown> = {};
        if (starting_date) updatePayload.starting_date = starting_date;
        if (cutoff_date) updatePayload.cutoff_date = cutoff_date;
        if (remarks !== undefined) updatePayload.remarks = remarks ? String(remarks).trim() : null;
        if (stock_type && (stock_type === "OPENING" || stock_type === "REGULAR")) {
            updatePayload.stock_type = stock_type;
        }
        if (product_type_id !== undefined) {
            updatePayload.product_type_id = product_type_id ? extractId(product_type_id) : null;
        }
        let newPriceTypeId: number | null = null;
        if (price_type_id !== undefined) {
            newPriceTypeId = price_type_id ? extractId(price_type_id) : null;
            updatePayload.price_type_id = newPriceTypeId;
        }

        const updateUrl = `${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}`;
        const res = await fetch(updateUrl, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updatePayload),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Failed to update PI header: ${errText}`);
        }

        // If price_type_id changed, recalculate prices for all detail rows
        if (newPriceTypeId !== null && newPriceTypeId !== extractId(sheet.price_type_id)) {
            try {
                const detailsUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details?filter[physical_inventory_id][_eq]=${sheetId}&limit=-1`;
                const detailsRes = await fetch(detailsUrl, { headers, cache: "no-store" });
                if (detailsRes.ok) {
                    const detailsList: Array<Record<string, unknown>> = (await detailsRes.json()).data || [];
                    if (detailsList.length > 0) {
                        const productIds = detailsList.map((d) => extractId(d.product_id));
                        const priceMap = await resolveBatchPrices(productIds, newPriceTypeId);

                        for (const d of detailsList) {
                            const dId = extractId(d.physical_inventory_detail_id || d.id);
                            const pId = extractId(d.product_id);
                            const newCost = priceMap.get(pId) || 0;
                            const sys = roundQty(d.system_count as number);
                            const phys = roundQty(d.physical_count as number);
                            const diffCost = roundMoney((phys - sys) * newCost);

                            await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory_details/${dId}`, {
                                method: "PATCH",
                                headers,
                                body: JSON.stringify({
                                    unit_cost: newCost,
                                    difference_cost: diffCost,
                                }),
                            });
                        }
                        await recalculateHeaderTotals(sheetId);
                    }
                }
            } catch (pErr) {
                console.error("[PATCH Header] Error updating detail row prices:", pErr);
            }
        }

        const updatedData = (await res.json()).data;
        return NextResponse.json({ success: true, data: updatedData });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
