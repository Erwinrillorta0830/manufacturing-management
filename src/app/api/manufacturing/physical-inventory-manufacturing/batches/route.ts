import { NextResponse, NextRequest } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { extractId, roundMoney } from "../helper";
import { getJwtSubFromReq } from "@/lib/directus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturing/physical-inventory-manufacturing/batches
 * Fetch active inventory batches (mm_inventory_lots) by lot_id and product_id
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const lotId = searchParams.get("lot_id");
        const productId = searchParams.get("product_id");

        if (!lotId || !productId) {
            return NextResponse.json({ success: false, error: "lot_id and product_id are required." }, { status: 400 });
        }

        const masterUrl = `${DIRECTUS_URL}/items/mm_inventory_lots?filter[lot_id][_eq]=${encodeURIComponent(lotId)}&filter[product_id][_eq]=${encodeURIComponent(productId)}&sort=-inventory_lot_id&limit=-1&fields=*,lot_id.*,product_id.*`;
        const masterRes = await fetch(masterUrl, { headers, cache: "no-store" });
        const masterBatches = masterRes.ok ? (await masterRes.json()).data || [] : [];

        // Check if there are draft batches in mm_physical_inventory_draft_batches
        let draftBatches: unknown[] = [];
        const draftUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_draft_batches?filter[lot_id][_eq]=${encodeURIComponent(lotId)}&filter[product_id][_eq]=${encodeURIComponent(productId)}&limit=-1&fields=*,lot_id.*,product_id.*`;
        const draftRes = await fetch(draftUrl, { headers, cache: "no-store" });
        if (draftRes.ok) {
            const draftJson = await draftRes.json();
            draftBatches = (draftJson.data || []).map((d: Record<string, unknown>) => {
                const dbId = extractId(d.draft_batch_id || d.id);
                return {
                    ...d,
                    inventory_lot_id: dbId,
                    id: dbId,
                    draft_batch_id: dbId,
                    is_draft: true,
                };
            });
        }

        // Combine and dedup by batch_no
        const combined = [...draftBatches, ...masterBatches];
        const seenBatchNos = new Set();
        const merged = combined.filter((b) => {
            const bObj = b as Record<string, unknown>;
            const bNo = String(bObj.batch_no || "").trim().toUpperCase();
            if (!bNo) return true;
            if (seenBatchNos.has(bNo)) return false;
            seenBatchNos.add(bNo);
            return true;
        });

        return NextResponse.json({ success: true, data: merged });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}

/**
 * POST /api/manufacturing/physical-inventory-manufacturing/batches
 * Create a new inventory batch in mm_inventory_lots
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
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

        const batchNoClean = (batch_no || "").trim();
        if (!batchNoClean) {
            return NextResponse.json({ success: false, error: "Batch number is required." }, { status: 400 });
        }

        const lotId = extractId(lot_id);
        const branchId = extractId(branch_id);
        const productId = extractId(product_id);

        if (!lotId || !branchId || !productId) {
            return NextResponse.json({ success: false, error: "Lot, Branch, and Product IDs are required." }, { status: 400 });
        }

        // 1. Fetch Lot to check capacity & branch & UOM
        const lotRes = await fetch(`${DIRECTUS_URL}/items/mm_lots/${lotId}`, { headers, cache: "no-store" });
        if (!lotRes.ok) {
            return NextResponse.json({ success: false, error: "Selected lot does not exist." }, { status: 404 });
        }
        const lot = (await lotRes.json()).data;
        const lotBranchId = extractId(lot.branch_id);
        const lotUnitId = extractId(lot.unit_id);
        const maxCapacity = Number(lot.max_batch_capacity || 0);

        if (lotBranchId !== branchId) {
            return NextResponse.json({ success: false, error: "Batch branch must match lot branch." }, { status: 400 });
        }

        // 2. Fetch Product to check UOM & shelf life
        const prodRes = await fetch(`${DIRECTUS_URL}/items/products/${productId}?fields=*,unit_of_measurement.*`, { headers, cache: "no-store" });
        if (!prodRes.ok) {
            return NextResponse.json({ success: false, error: "Selected product does not exist." }, { status: 404 });
        }
        const product = (await prodRes.json()).data;
        const prodUnitId = extractId(product.unit_of_measurement, "unit_id");

        if (prodUnitId !== lotUnitId) {
            return NextResponse.json({ success: false, error: "The selected product uses a different UOM from this lot." }, { status: 400 });
        }

        // 3. Count active batches currently assigned to this lot
        const countUrl = `${DIRECTUS_URL}/items/mm_inventory_lots?filter[lot_id][_eq]=${lotId}&aggregate[count]=*`;
        const countRes = await fetch(countUrl, { headers, cache: "no-store" });
        if (countRes.ok) {
            const countJson = await countRes.json();
            const currentBatchCount = Number(countJson.data?.[0]?.count || 0);
            if (maxCapacity > 0 && currentBatchCount >= maxCapacity) {
                return NextResponse.json({ success: false, error: "This lot has reached its maximum batch capacity." }, { status: 409 });
            }
        }

        // 4. Global Batch Number uniqueness check across products & lots
        const dupUrl = `${DIRECTUS_URL}/items/mm_inventory_lots?filter[batch_no][_eq]=${encodeURIComponent(batchNoClean)}&limit=1&fields=*,product_id.*,lot_id.*`;
        const dupRes = await fetch(dupUrl, { headers, cache: "no-store" });
        if (dupRes.ok) {
            const dupJson = await dupRes.json();
            if (dupJson.data && dupJson.data.length > 0) {
                const existingBatch = dupJson.data[0];
                const existingProdId = extractId(existingBatch.product_id);
                const existingProdName = typeof existingBatch.product_id === "object" && existingBatch.product_id !== null
                    ? existingBatch.product_id.product_name
                    : `Product #${existingProdId}`;

                if (existingProdId !== productId) {
                    return NextResponse.json({
                        success: false,
                        error: `Batch number '${batchNoClean}' already exists and is assigned to product '${existingProdName}'. One batch cannot belong to multiple products.`
                    }, { status: 409 });
                }

                return NextResponse.json({
                    success: false,
                    error: `Batch number '${batchNoClean}' already exists for product '${existingProdName}'.`
                }, { status: 409 });
            }
        }

        // 5. Expiration & Manufacturing Date Validations
        const expDateVal = expiry_date || expiration_date || null;
        const mfgDateVal = manufacturing_date || null;
        const shelfLife = Number(product.product_shelf_life || 0);

        if (shelfLife > 0 && !expDateVal) {
            return NextResponse.json({ success: false, error: "Expiration date is required for shelf-life controlled products." }, { status: 400 });
        }

        if (mfgDateVal && expDateVal && new Date(mfgDateVal) > new Date(expDateVal)) {
            return NextResponse.json({ success: false, error: "Manufacturing date cannot be after expiration date." }, { status: 400 });
        }

        const costVal = roundMoney(unit_cost !== undefined ? unit_cost : product.cost_per_unit);
        const authUserId = getJwtSubFromReq(request);
        const createdBy = authUserId || extractId(body.created_by) || null;

        const payload = {
            lot_id: lotId,
            branch_id: branchId,
            product_id: productId,
            batch_no: batchNoClean,
            manufacturing_date: mfgDateVal,
            expiry_date: expDateVal,
            expiration_date: expDateVal,
            unit_cost: costVal,
            qa_status: "GOOD",
            status: "ACTIVE",
            source_type: "PHYSICAL_INVENTORY",
            source_reference: source_reference ? String(source_reference).trim() : null,
            created_by: createdBy,
        };

        const createUrl = `${DIRECTUS_URL}/items/mm_inventory_lots`;
        const res = await fetch(createUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to create batch: ${errText}`);
        }

        const rawCreated = (await res.json()).data;
        const bId = extractId(rawCreated.inventory_lot_id || rawCreated.id);
        const created = {
            ...rawCreated,
            inventory_lot_id: bId,
            id: bId,
        };
        return NextResponse.json({ success: true, data: created }, { status: 201 });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
