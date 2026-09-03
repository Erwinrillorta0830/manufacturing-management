import { NextResponse, NextRequest } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { extractId, roundMoney } from "../../helper";
import { getJwtSubFromReq } from "@/lib/directus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/manufacturing/physical-inventory-manufacturing/batches/draft
 * Create a draft batch record held in mm_physical_inventory_draft_batches or mm_inventory_lots (status=INACTIVE)
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            physical_inventory_id,
            lot_id,
            branch_id,
            product_id,
            batch_no,
            manufacturing_date,
            expiry_date,
            expiration_date,
            unit_cost,
            source_reference,
        } = body;

        const lotId = extractId(lot_id);
        const branchId = extractId(branch_id);
        const productId = extractId(product_id);
        const sheetId = physical_inventory_id ? extractId(physical_inventory_id) : null;
        const batchNoClean = (batch_no || "").trim();

        if (!lotId || !branchId || !productId || !batchNoClean) {
            return NextResponse.json(
                { success: false, error: "lot_id, branch_id, product_id, and batch_no are required." },
                { status: 400 }
            );
        }

        const authUserId = getJwtSubFromReq(request);
        const mfgDateVal = manufacturing_date || null;
        const expDateVal = expiry_date || expiration_date || null;
        const costVal = roundMoney(unit_cost);

        // First attempt: Create in mm_physical_inventory_draft_batches
        const draftPayload = {
            physical_inventory_id: sheetId,
            lot_id: lotId,
            branch_id: branchId,
            product_id: productId,
            batch_no: batchNoClean,
            manufacturing_date: mfgDateVal,
            expiry_date: expDateVal,
            expiration_date: expDateVal,
            unit_cost: costVal,
            qa_status: "GOOD",
            status: "DRAFT",
            created_by: authUserId || null,
        };

        const draftUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_draft_batches`;
        const draftRes = await fetch(draftUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(draftPayload),
        });

        if (draftRes.ok) {
            const createdDraft = (await draftRes.json()).data;
            const draftId = extractId(createdDraft.draft_batch_id || createdDraft.id);
            return NextResponse.json(
                {
                    success: true,
                    data: {
                        ...createdDraft,
                        inventory_lot_id: draftId,
                        id: draftId,
                        draft_batch_id: draftId,
                        is_draft: true,
                    },
                },
                { status: 201 }
            );
        }

        // Fallback: If table mm_physical_inventory_draft_batches is not created in Directus yet,
        // create in mm_inventory_lots with status='INACTIVE' and source_type='PHYSICAL_INVENTORY_DRAFT'
        const fallbackPayload = {
            lot_id: lotId,
            branch_id: branchId,
            product_id: productId,
            batch_no: batchNoClean,
            manufacturing_date: mfgDateVal,
            expiry_date: expDateVal,
            expiration_date: expDateVal,
            unit_cost: costVal,
            qa_status: "GOOD",
            status: "INACTIVE", // Held in uncommitted status until sheet commit
            source_type: "PHYSICAL_INVENTORY_DRAFT",
            source_reference: source_reference || (sheetId ? `PI-#${sheetId}` : "PHYSICAL_INVENTORY_DRAFT"),
            created_by: authUserId || null,
        };

        const fallbackUrl = `${DIRECTUS_URL}/items/mm_inventory_lots`;
        const fallbackRes = await fetch(fallbackUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(fallbackPayload),
        });

        if (!fallbackRes.ok) {
            const errText = await fallbackRes.text();
            throw new Error(`Directus failed to create draft batch: ${errText}`);
        }

        const createdFallback = (await fallbackRes.json()).data;
        const bId = extractId(createdFallback.inventory_lot_id || createdFallback.id);
        return NextResponse.json(
            {
                success: true,
                data: {
                    ...createdFallback,
                    inventory_lot_id: bId,
                    id: bId,
                    is_draft: true,
                },
            },
            { status: 201 }
        );
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
