import { NextResponse, NextRequest } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { extractId, roundQty, recalculateHeaderTotals, parseBooleanFlag, resolveProductPrice } from "../../helper";
import { getSingleItemSystemOnhand } from "../../movements-helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/manufacturing/physical-inventory-manufacturing/[id]/details
 * Add a detail row to a draft physical inventory sheet.
 */
export async function POST(request: NextRequest, context: RouteParams) {
    try {
        const { id } = await context.params;
        const sheetId = Number(id);
        if (isNaN(sheetId) || sheetId <= 0) {
            return NextResponse.json({ success: false, error: "Invalid Physical Inventory ID" }, { status: 400 });
        }

        // 1. Fetch PI Header
        const headerRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory/${sheetId}`, { headers, cache: "no-store" });
        if (!headerRes.ok) {
            return NextResponse.json({ success: false, error: "Physical Inventory sheet not found" }, { status: 404 });
        }
        const sheet = (await headerRes.json()).data;
        const statusUpper = String(sheet.status || "").toUpperCase();
        const isCommitted = parseBooleanFlag(sheet.isCommitted);
        const isCancelled = parseBooleanFlag(sheet.isCancelled);

        if (statusUpper !== "DRAFT" || isCommitted || isCancelled) {
            return NextResponse.json({ success: false, error: `Details can only be added to DRAFT sheets. Current status: ${sheet.status}` }, { status: 400 });
        }

        const piBranchId = extractId(sheet.branch_id);
        const isOpening = sheet.stock_type === "OPENING";

        const body = await request.json();
        const {
            inventory_lot_id,
            lot_id,
            product_id,
            physical_count,
            inventory_condition,
            remarks,
        } = body;

        const inventoryLotId = extractId(inventory_lot_id);
        const lotId = extractId(lot_id);
        const productId = extractId(product_id);

        if (!inventoryLotId || !lotId || !productId) {
            return NextResponse.json({ success: false, error: "Batch, Lot, and Product are required." }, { status: 400 });
        }

        const physCountNum = roundQty(physical_count);
        if (physCountNum < 0) {
            return NextResponse.json({ success: false, error: "Physical count cannot be negative." }, { status: 400 });
        }

        const conditionStr = (inventory_condition || "GOOD").trim().toUpperCase();

        // 2. Load & Server-Validate Batch from mm_inventory_lots
        const batchRes = await fetch(`${DIRECTUS_URL}/items/mm_inventory_lots/${inventoryLotId}?fields=*,lot_id.*,product_id.*,product_id.unit_of_measurement.*`, { headers, cache: "no-store" });
        if (!batchRes.ok) {
            return NextResponse.json({ success: false, error: "Selected batch does not exist." }, { status: 404 });
        }
        const batch = (await batchRes.json()).data;

        const batchLotId = extractId(batch.lot_id);
        const batchBranchId = extractId(batch.branch_id);
        const batchProductId = extractId(batch.product_id);

        if (batchLotId !== lotId) {
            return NextResponse.json({ success: false, error: "Batch does not belong to the selected lot." }, { status: 400 });
        }
        if (batchProductId !== productId) {
            return NextResponse.json({ success: false, error: "Batch does not belong to the selected product." }, { status: 400 });
        }
        if (batchBranchId !== piBranchId) {
            return NextResponse.json({ success: false, error: "Batch branch does not match the Physical Inventory branch." }, { status: 400 });
        }

        // 2.5 Check if this inventory batch is ALREADY added to this Physical Inventory sheet
        const dupBatchUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details?filter[physical_inventory_id][_eq]=${sheetId}&filter[inventory_lot_id][_eq]=${inventoryLotId}&limit=1`;
        const dupBatchRes = await fetch(dupBatchUrl, { headers, cache: "no-store" });
        if (dupBatchRes.ok) {
            const dupBatchJson = await dupBatchRes.json();
            if (dupBatchJson.data && dupBatchJson.data.length > 0) {
                return NextResponse.json({
                    success: false,
                    error: `Batch #${batch.batch_no || inventoryLotId} has already been added to this physical inventory sheet.`
                }, { status: 400 });
            }
        }

        // 3. Load & Validate Lot from mm_lots
        const lotRes = await fetch(`${DIRECTUS_URL}/items/mm_lots/${lotId}`, { headers, cache: "no-store" });
        if (!lotRes.ok) {
            return NextResponse.json({ success: false, error: "Selected lot does not exist." }, { status: 404 });
        }
        const lot = (await lotRes.json()).data;
        const lotBranchId = extractId(lot.branch_id);
        const lotUnitId = extractId(lot.unit_id);

        if (lotBranchId !== piBranchId) {
            return NextResponse.json({ success: false, error: "Lot does not belong to the Physical Inventory branch." }, { status: 400 });
        }

        // 4. Load & Validate Product from products
        const prodRes = await fetch(`${DIRECTUS_URL}/items/products/${productId}?fields=*,unit_of_measurement.*`, { headers, cache: "no-store" });
        if (!prodRes.ok) {
            return NextResponse.json({ success: false, error: "Selected product does not exist." }, { status: 404 });
        }
        const product = (await prodRes.json()).data;
        const prodUnitId = extractId(product.unit_of_measurement, "unit_id");

        if (prodUnitId !== lotUnitId) {
            return NextResponse.json({ success: false, error: "The selected product uses a different UOM from this lot." }, { status: 400 });
        }

        // 5. Expiration & Manufacturing Date Rules
        const shelfLife = Number(product.product_shelf_life || 0);
        const expDate = batch.expiry_date || batch.expiration_date || null;
        const mfgDate = batch.manufacturing_date || null;

        if (shelfLife > 0 && !expDate) {
            return NextResponse.json({ success: false, error: "Expiration date is required for this product." }, { status: 400 });
        }
        if (mfgDate && expDate && new Date(mfgDate) > new Date(expDate)) {
            return NextResponse.json({ success: false, error: "Manufacturing date cannot be after expiration date." }, { status: 400 });
        }

        // 6. Check Duplicate Batch + Condition combination in this PI
        const dupCheckUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details?filter[physical_inventory_id][_eq]=${sheetId}&filter[inventory_lot_id][_eq]=${inventoryLotId}&filter[inventory_condition][_eq]=${encodeURIComponent(conditionStr)}&limit=1`;
        const dupRes = await fetch(dupCheckUrl, { headers, cache: "no-store" });
        if (dupRes.ok) {
            const dupJson = await dupRes.json();
            if (dupJson.data && dupJson.data.length > 0) {
                return NextResponse.json({ success: false, error: "Duplicate batch and condition combinations are not allowed in the same Physical Inventory." }, { status: 409 });
            }
        }

        // 7. Load System Count from Movements API
        const productTypeId = extractId(sheet.product_type_id);
        const systemCount = await getSingleItemSystemOnhand(piBranchId, inventoryLotId, lotId, productId, conditionStr, productTypeId);

        const calculatedVariance = roundQty(physCountNum - systemCount);
        if (!isOpening && calculatedVariance !== 0 && (!remarks || !String(remarks).trim())) {
            return NextResponse.json({ success: false, error: "Variance reason is required when a Regular Physical Inventory has a nonzero variance." }, { status: 400 });
        }

        const priceTypeId = extractId(sheet.price_type_id);
        const unitCost = await resolveProductPrice(productId, priceTypeId);

        // DO NOT include generated columns `variance` and `difference_cost` in INSERT!
        const detailPayload = {
            physical_inventory_id: sheetId,
            inventory_lot_id: inventoryLotId,
            lot_id: lotId,
            product_id: productId,
            unit_id: prodUnitId,
            batch_no: batch.batch_no,
            manufacturing_date: mfgDate,
            expiration_date: expDate,
            inventory_condition: conditionStr,
            system_count: systemCount,
            physical_count: physCountNum,
            unit_cost: unitCost,
            remarks: remarks ? String(remarks).trim() : null,
        };

        const createDetailUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details`;
        const res = await fetch(createDetailUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(detailPayload),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to insert detail row: ${errText}`);
        }

        const createdDetail = (await res.json()).data;
        // Recalculate totals on header
        await recalculateHeaderTotals(sheetId);

        return NextResponse.json({ success: true, data: createdDetail }, { status: 201 });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        console.error("POST detail error:", error);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}

/**
 * PATCH /api/manufacturing/physical-inventory-manufacturing/[id]/details
 * Update an existing detail row (physical_count, inventory_condition, remarks).
 */
export async function PATCH(request: NextRequest, context: RouteParams) {
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

        if (statusUpper !== "DRAFT" || isCommitted || isCancelled) {
            return NextResponse.json({ success: false, error: `Details can only be updated on DRAFT sheets. Current status: ${sheet.status}` }, { status: 400 });
        }

        const body = await request.json();
        const detailId = extractId(body.physical_inventory_detail_id || body.id);
        if (!detailId || detailId <= 0) {
            return NextResponse.json({ success: false, error: "Detail ID is required." }, { status: 400 });
        }

        const existingDetailRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory_details/${detailId}`, { headers, cache: "no-store" });
        if (!existingDetailRes.ok) {
            return NextResponse.json({ success: false, error: "Detail row not found." }, { status: 404 });
        }
        const existingDetail = (await existingDetailRes.json()).data;

        const isOpening = sheet.stock_type === "OPENING";
        const physCountNum = body.physical_count !== undefined ? roundQty(body.physical_count) : roundQty(existingDetail.physical_count);
        if (physCountNum < 0) {
            return NextResponse.json({ success: false, error: "Physical count cannot be negative." }, { status: 400 });
        }

        const conditionStr = body.inventory_condition ? String(body.inventory_condition).trim().toUpperCase() : existingDetail.inventory_condition;
        const remarksStr = body.remarks !== undefined ? (body.remarks ? String(body.remarks).trim() : null) : existingDetail.remarks;

        const systemCount = roundQty(existingDetail.system_count);
        const calculatedVariance = roundQty(physCountNum - systemCount);
        if (!isOpening && calculatedVariance !== 0 && (!remarksStr || !remarksStr.trim())) {
            return NextResponse.json({ success: false, error: "Variance reason is required when a Regular Physical Inventory has a nonzero variance." }, { status: 400 });
        }

        // DO NOT send generated columns `variance` or `difference_cost`
        const updatePayload: Record<string, unknown> = {
            physical_count: physCountNum,
            inventory_condition: conditionStr,
            remarks: remarksStr,
        };

        const updateUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details/${detailId}`;
        const res = await fetch(updateUrl, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updatePayload),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to update detail: ${errText}`);
        }

        const updatedDetail = (await res.json()).data;
        await recalculateHeaderTotals(sheetId);

        return NextResponse.json({ success: true, data: updatedDetail });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}

/**
 * DELETE /api/manufacturing/physical-inventory-manufacturing/[id]/details
 * Remove a detail row from a draft physical inventory sheet.
 */
export async function DELETE(request: NextRequest, context: RouteParams) {
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

        if (statusUpper !== "DRAFT" || isCommitted || isCancelled) {
            return NextResponse.json({ success: false, error: `Details can only be removed from DRAFT sheets. Current status: ${sheet.status}` }, { status: 400 });
        }

        const { searchParams } = new URL(request.url);
        const detailIdParam = searchParams.get("detail_id") || searchParams.get("id");
        const detailId = Number(detailIdParam);
        if (!detailId || detailId <= 0) {
            return NextResponse.json({ success: false, error: "Detail ID parameter is required." }, { status: 400 });
        }

        const deleteUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details/${detailId}`;
        const res = await fetch(deleteUrl, { method: "DELETE", headers });
        if (!res.ok && res.status !== 204) {
            const errText = await res.text();
            throw new Error(`Directus failed to delete detail: ${errText}`);
        }

        await recalculateHeaderTotals(sheetId);
        return NextResponse.json({ success: true, message: "Detail removed successfully." });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
