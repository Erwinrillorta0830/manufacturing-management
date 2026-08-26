import { NextResponse, NextRequest } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { recalculateHeaderTotals, parseBooleanFlag } from "../../helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/manufacturing/physical-inventory-manufacturing/[id]/submit
 * Submit physical inventory for review (DRAFT -> PENDING_REVIEW)
 */
export async function POST(_request: NextRequest, context: RouteParams) {
    try {
        const { id } = await context.params;
        const sheetId = Number(id);
        if (isNaN(sheetId) || sheetId <= 0) {
            return NextResponse.json({ success: false, error: "Invalid Physical Inventory ID" }, { status: 400 });
        }

        const headerRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}`, { headers, cache: "no-store" });
        if (!headerRes.ok) {
            return NextResponse.json({ success: false, error: "Physical Inventory sheet not found" }, { status: 404 });
        }
        const sheet = (await headerRes.json()).data;

        const statusUpper = String(sheet.status || "").toUpperCase();
        const isCommitted = parseBooleanFlag(sheet.isCommitted);
        const isCancelled = parseBooleanFlag(sheet.isCancelled);

        if (statusUpper !== "DRAFT") {
            return NextResponse.json({ success: false, error: `Only DRAFT sheets can be submitted. Current status: ${sheet.status}` }, { status: 400 });
        }
        if (isCommitted || isCancelled) {
            return NextResponse.json({ success: false, error: "Committed or cancelled records cannot be submitted." }, { status: 400 });
        }

        // Verify at least one detail exists
        const detailsRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory_details?filter[physical_inventory_id][_eq]=${sheetId}&limit=-1`, { headers, cache: "no-store" });
        if (!detailsRes.ok) {
            return NextResponse.json({ success: false, error: "Failed to load sheet details." }, { status: 500 });
        }
        const details = (await detailsRes.json()).data || [];
        if (details.length === 0) {
            return NextResponse.json({ success: false, error: "Cannot submit a Physical Inventory sheet with no detail rows." }, { status: 400 });
        }

        // Recalculate totals first
        await recalculateHeaderTotals(sheetId);

        const updateUrl = `${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}`;
        const res = await fetch(updateUrl, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                status: "PENDING_REVIEW",
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to submit physical inventory: ${errText}`);
        }

        const updated = (await res.json()).data;
        return NextResponse.json({ success: true, data: updated, message: "Physical Inventory submitted for review successfully." });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
