import { NextResponse, NextRequest } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { parseBooleanFlag } from "../../helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/manufacturing/physical-inventory-manufacturing/[id]/return-to-draft
 * Return physical inventory from PENDING_REVIEW to DRAFT
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

        const isCommitted = parseBooleanFlag(sheet.isCommitted);
        const isCancelled = parseBooleanFlag(sheet.isCancelled);

        if (sheet.status !== "PENDING_REVIEW") {
            return NextResponse.json({ success: false, error: "Only PENDING_REVIEW sheets can be returned to DRAFT." }, { status: 400 });
        }
        if (isCommitted || isCancelled) {
            return NextResponse.json({ success: false, error: "Committed or cancelled records cannot be modified." }, { status: 400 });
        }

        const updateUrl = `${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}`;
        const res = await fetch(updateUrl, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                status: "DRAFT",
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to return to draft: ${errText}`);
        }

        const updated = (await res.json()).data;
        return NextResponse.json({ success: true, data: updated, message: "Physical Inventory returned to DRAFT status." });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
