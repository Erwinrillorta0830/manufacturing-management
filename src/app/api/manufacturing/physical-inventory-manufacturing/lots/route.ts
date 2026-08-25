import { NextResponse, NextRequest } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { extractId } from "../helper";
import { getJwtSubFromReq } from "@/lib/directus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturing/physical-inventory-manufacturing/lots
 * Fetch active lots for a given branch
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const branchId = searchParams.get("branch_id");

        if (!branchId) {
            return NextResponse.json({ success: false, error: "branch_id parameter is required." }, { status: 400 });
        }

        const url = `${DIRECTUS_URL}/items/mm_lots?filter[branch_id][_eq]=${encodeURIComponent(branchId)}&sort=lot_name&limit=-1&fields=*,unit_id.*,branch_id.*`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to list lots: ${errText}`);
        }

        const json = await res.json();
        return NextResponse.json({ success: true, data: json.data || [] });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}

/**
 * POST /api/manufacturing/physical-inventory-manufacturing/lots
 * Create a new lot in mm_lots
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { lot_name, branch_id, unit_id, max_batch_capacity, description } = body;

        const lotNameClean = (lot_name || "").trim();
        if (!lotNameClean) {
            return NextResponse.json({ success: false, error: "Lot name is required." }, { status: 400 });
        }

        const branchId = extractId(branch_id);
        const unitId = extractId(unit_id);
        const capacity = Math.max(Number(max_batch_capacity) || 1, 1);

        if (!branchId || branchId <= 0) {
            return NextResponse.json({ success: false, error: "Branch ID is required." }, { status: 400 });
        }
        if (!unitId || unitId <= 0) {
            return NextResponse.json({ success: false, error: "Unit of measurement (UOM) is required." }, { status: 400 });
        }

        // Validate unique lot_name within branch
        const dupCheckUrl = `${DIRECTUS_URL}/items/mm_lots?filter[branch_id][_eq]=${branchId}&filter[lot_name][_eq]=${encodeURIComponent(lotNameClean)}&limit=1`;
        const dupRes = await fetch(dupCheckUrl, { headers, cache: "no-store" });
        if (dupRes.ok) {
            const dupJson = await dupRes.json();
            if (dupJson.data && dupJson.data.length > 0) {
                return NextResponse.json({ success: false, error: `A lot named '${lotNameClean}' already exists in this branch.` }, { status: 409 });
            }
        }

        const authUserId = getJwtSubFromReq(request);
        const createdBy = authUserId || extractId(body.created_by) || null;

        const payload = {
            lot_name: lotNameClean,
            branch_id: branchId,
            unit_id: unitId,
            max_batch_capacity: capacity,
            description: description ? String(description).trim() : null,
            created_by: createdBy,
            isActive: 1,
        };

        const createUrl = `${DIRECTUS_URL}/items/mm_lots`;
        const res = await fetch(createUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to create lot: ${errText}`);
        }

        const created = (await res.json()).data;
        return NextResponse.json({ success: true, data: created }, { status: 201 });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
