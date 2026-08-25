import { NextResponse, NextRequest } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { extractId, roundQty, roundMoney, recalculateHeaderTotals, parseBooleanFlag, resolveBatchPrices } from "../../helper";
import { fetchSpringMovements, aggregateMovementsToItems, AggregatedMovementItem } from "../../movements-helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
    params: Promise<{ id: string }>;
}

/**
 * POST /api/manufacturing/physical-inventory-manufacturing/[id]/populate
 * Auto-populate/snapshot detail line items and real-time system counts from the Movements API.
 */
export async function POST(_request: NextRequest, context: RouteParams) {
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
            return NextResponse.json({ success: false, error: `Items can only be populated on DRAFT sheets. Current status: ${sheet.status}` }, { status: 400 });
        }

        let reqBody: Record<string, unknown> = {};
        try {
            reqBody = await _request.json();
        } catch {
            // Optional body
        }

        const branchId = extractId(sheet.branch_id);
        const bodyPtId = extractId(reqBody.product_type_id || reqBody.productTypeId);
        const headerPtId = extractId(sheet.product_type_id);
        const productTypeId = bodyPtId > 0 ? bodyPtId : headerPtId;

        const bodyPriceTypeId = extractId(reqBody.price_type_id || reqBody.priceTypeId);
        const headerPriceTypeId = extractId(sheet.price_type_id);
        const priceTypeId = bodyPriceTypeId > 0 ? bodyPriceTypeId : headerPriceTypeId;

        const isOpening = sheet.stock_type === "OPENING";

        // 2. Fetch Spring movements
        let movements = await fetchSpringMovements(branchId, productTypeId);
        let items: AggregatedMovementItem[] = aggregateMovementsToItems(movements);

        // Resolve valid product_ids belonging to productTypeId from Directus catalog
        let allowedProductIds: Set<number> | null = null;
        if (productTypeId && productTypeId > 0) {
            try {
                const pRes = await fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_type,product_type_id`, { headers, cache: "no-store" });
                if (pRes.ok) {
                    const pJson = await pRes.json();
                    const pList: Array<Record<string, unknown>> = pJson.data || [];
                    const filtered = pList.filter((p) => {
                        const pt = p.product_type ?? p.product_type_id;
                        const ptId = typeof pt === "object" && pt !== null ? Number((pt as { id?: number }).id || 0) : Number(pt || 0);
                        return ptId === Number(productTypeId);
                    });
                    allowedProductIds = new Set<number>(filtered.map((p) => Number(p.product_id)));
                }
            } catch (e) {
                console.error("[Populate] Product type lookup failed:", e);
            }
        }

        // Fallback to Directus if Spring API returns no items
        if (items.length === 0) {
            try {
                const directusOnhandUrl = `${DIRECTUS_URL}/items/v_mm_batch_onhand?filter[branch_id][_eq]=${branchId}&limit=-1`;
                const directusRes = await fetch(directusOnhandUrl, { headers, cache: "no-store" });
                if (directusRes.ok) {
                    const dJson = await directusRes.json();
                    const rawList = dJson.data || [];
                    items = rawList.map((row: Record<string, unknown>) => ({
                        branchId,
                        inventoryLotId: extractId(row.inventory_lot_id),
                        lotId: extractId(row.lot_id),
                        productId: extractId(row.product_id),
                        productCode: String(row.product_code || `PROD-${row.product_id}`),
                        productName: String(row.product_name || `Product #${row.product_id}`),
                        unitId: extractId(row.unit_id) || 1,
                        batchNo: String(row.batch_no || `BATCH-${row.inventory_lot_id}`),
                        manufacturingDate: row.manufacturing_date ? String(row.manufacturing_date) : null,
                        expirationDate: row.expiration_date ? String(row.expiration_date) : null,
                        inventoryCondition: String(row.inventory_condition || "GOOD").toUpperCase(),
                        systemCount: roundQty(row.onhand_quantity as number | string | undefined),
                        unitCost: 0,
                    }));
                }
            } catch (e) {
                console.error("[Populate] Directus fallback failed:", e);
            }
        }

        // Strict product filtering against active Product Type
        if (productTypeId && productTypeId > 0) {
            items = items.filter((item) => {
                const pId = Number(item.productId || 0);
                if (allowedProductIds && allowedProductIds.size > 0) {
                    return allowedProductIds.has(pId);
                }
                const itemPtId = Number(item.productTypeId || 0);
                if (itemPtId > 0) {
                    return itemPtId === Number(productTypeId);
                }
                return false;
            });
        }

        // Override unit costs using the selected price_type_id from product_per_price_type / product_version_prices
        if (items.length > 0) {
            const productIds = items.map((i) => i.productId);
            const priceMap = await resolveBatchPrices(productIds, priceTypeId);
            items = items.map((item) => ({
                ...item,
                unitCost: priceMap.get(item.productId) || 0,
            }));
        }

        if (items.length === 0) {
            return NextResponse.json({
                success: true,
                message: "No active inventory movements or system stock records found for this branch and product type filter.",
                count: 0,
            });
        }

        // 3. Fetch existing details for this sheet to prevent duplicates
        const existingDetailsUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details?filter[physical_inventory_id][_eq]=${sheetId}&limit=-1`;
        const existingRes = await fetch(existingDetailsUrl, { headers, cache: "no-store" });
        const existingList: Array<Record<string, unknown>> = existingRes.ok ? ((await existingRes.json()).data || []) : [];

        const existingMap = new Map<string, number>();
        existingList.forEach((d) => {
            const invLotId = extractId(d.inventory_lot_id);
            const cond = String(d.inventory_condition || "GOOD").toUpperCase();
            const detailId = extractId(d.physical_inventory_detail_id || d.id);
            if (invLotId > 0) {
                existingMap.set(`${invLotId}:${cond}`, detailId);
            }
        });

        let insertedCount = 0;
        let updatedCount = 0;

        for (const item of items) {
            if (!item.inventoryLotId || !item.productId || !item.lotId) continue;

            const cond = item.inventoryCondition.toUpperCase();
            const existingDetailId = existingMap.get(`${item.inventoryLotId}:${cond}`);

            const systemCount = roundQty(item.systemCount);
            const physCount = roundQty(item.systemCount);

            if (existingDetailId) {
                // Update system_count on existing detail
                await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory_details/${existingDetailId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        system_count: systemCount,
                        unit_cost: item.unitCost,
                    }),
                });
                updatedCount++;
            } else {
                // Create detail row
                const payload = {
                    physical_inventory_id: sheetId,
                    inventory_lot_id: item.inventoryLotId,
                    lot_id: item.lotId,
                    product_id: item.productId,
                    unit_id: item.unitId || 1,
                    batch_no: item.batchNo,
                    manufacturing_date: item.manufacturingDate || null,
                    expiration_date: item.expirationDate || null,
                    inventory_condition: cond,
                    system_count: systemCount,
                    physical_count: physCount,
                    unit_cost: item.unitCost,
                    remarks: `Auto-populated from system movement log (Type: ${item.productTypeName || "Standard"})`,
                };

                const createRes = await fetch(`${DIRECTUS_URL}/items/mm_physical_inventory_details`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload),
                });
                if (createRes.ok) {
                    insertedCount++;
                }
            }
        }

        // 4. Recalculate totals on header
        await recalculateHeaderTotals(sheetId);

        return NextResponse.json({
            success: true,
            message: `Successfully populated physical count items: ${insertedCount} added, ${updatedCount} updated.`,
            count: insertedCount + updatedCount,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        console.error("POST /api/manufacturing/physical-inventory-manufacturing/[id]/populate error:", error);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
