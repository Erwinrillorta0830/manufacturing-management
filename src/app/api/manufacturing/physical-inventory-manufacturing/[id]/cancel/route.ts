import { NextResponse, NextRequest } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getJwtSubFromReq } from "@/lib/directus";
import { parseBooleanFlag } from "../../helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/manufacturing/physical-inventory-manufacturing/[id]/cancel
 * Cancel a DRAFT or PENDING_REVIEW Physical Inventory sheet.
 */
export async function POST(request: NextRequest, context: RouteParams) {
    try {
        const { id } = await context.params;
        const sheetId = Number(id);
        if (isNaN(sheetId) || sheetId <= 0) {
            return NextResponse.json({ success: false, error: "Invalid Physical Inventory ID" }, { status: 400 });
        }

        const body = await request.json();
        const { cancellation_reason } = body;
        if (!cancellation_reason || !String(cancellation_reason).trim()) {
            return NextResponse.json({ success: false, error: "Cancellation reason is required." }, { status: 400 });
        }

        const headerRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}`, { headers, cache: "no-store" });
        if (!headerRes.ok) {
            return NextResponse.json({ success: false, error: "Physical Inventory sheet not found" }, { status: 404 });
        }
        const sheet = (await headerRes.json()).data;

        const statusUpper = String(sheet.status || "").toUpperCase();
        const isCommitted = parseBooleanFlag(sheet.isCommitted) || statusUpper === "COMMITTED";
        const isCancelled = parseBooleanFlag(sheet.isCancelled) || statusUpper === "CANCELLED";

        if (isCommitted) {
            return NextResponse.json({ success: false, error: "Committed Physical Inventory sheets cannot be cancelled. Post a new Regular Physical Inventory count instead." }, { status: 409 });
        }
        if (isCancelled) {
            return NextResponse.json({ success: false, error: "Physical Inventory sheet is already cancelled." }, { status: 400 });
        }

        const authUserId = getJwtSubFromReq(request);
        const cancelledBy = authUserId || null;

        const updatePayload = {
            status: "CANCELLED",
            isCancelled: 1,
            cancelled_at: new Date().toISOString(),
            cancelled_by: cancelledBy,
            cancellation_reason: String(cancellation_reason).trim(),
        };

        const updateUrl = `${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}`;
        const res = await fetch(updateUrl, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updatePayload),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to cancel physical inventory: ${errText}`);
        }

        const cancelledData = (await res.json()).data;
        return NextResponse.json({ success: true, data: cancelledData, message: "Physical Inventory sheet cancelled successfully." });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
