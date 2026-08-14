import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    extractId,
    roundMoney,
    roundQty,
    PhysicalInventoryDetail,
    DirectusProductMeta,
} from "../physical-inventory-helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteParams {
    params: Promise<{ id: string }>;
}

function parseBufferOrBool(val: unknown): boolean {
    if (val === true || val === 1 || val === "1") return true;
    if (val === false || val === 0 || val === "0" || val === null || val === undefined) return false;
    if (typeof val === "object" && val !== null) {
        const obj = val as Record<string, unknown>;
        if (Array.isArray(obj.data) && obj.data.length > 0) {
            return Number(obj.data[0]) === 1;
        }
        if (typeof obj.data === "number") {
            return obj.data === 1;
        }
    }
    return false;
}

export async function GET(_request: Request, context: RouteParams) {
    try {
        const { id } = await context.params;
        const sheetId = Number(id);

        if (isNaN(sheetId) || sheetId <= 0) {
            return NextResponse.json({ success: false, error: "Invalid count sheet ID" }, { status: 400 });
        }

        const sheetRes = await fetch(`${DIRECTUS_URL}/items/physical_inventory/${sheetId}?fields=*,branch_id.*,encoded_by.*,committed_by.*`, {
            headers,
            cache: "no-store",
        });

        if (!sheetRes.ok) {
            if (sheetRes.status === 404) {
                return NextResponse.json({ success: false, error: "Physical count sheet not found" }, { status: 404 });
            }
            const errText = await sheetRes.text();
            throw new Error(`Directus returned HTTP ${sheetRes.status}: ${errText}`);
        }

        const sheetData = (await sheetRes.json()).data;
        if (!sheetData) {
            return NextResponse.json({ success: false, error: "Physical count sheet not found" }, { status: 404 });
        }

        const detailsRes = await fetch(
            `${DIRECTUS_URL}/items/physical_inventory_details?filter[ph_id][_eq]=${sheetId}&limit=-1&fields=*,product_id.*,lot_id.*,version_id.*`,
            { headers, cache: "no-store" }
        );

        const detailsData: PhysicalInventoryDetail[] = detailsRes.ok ? ((await detailsRes.json()).data || []) : [];

        const productIds = new Set<number>();
        const lotIds = new Set<number>();
        const versionIds = new Set<number>();

        detailsData.forEach((item: PhysicalInventoryDetail) => {
            const pId = extractId(item.product_id, "product_id");
            if (pId) productIds.add(pId);
            const lId = extractId(item.lot_id, "lot_id");
            if (lId) lotIds.add(lId);
            const vId = extractId(item.version_id, "version_id");
            if (vId) versionIds.add(vId);
        });

        const [productsRes, lotsRes, versionsRes, binLotsRes, allMasterLotsRes, allMasterVersionsRes, allMasterProductsRes] = await Promise.all([
            productIds.size > 0
                ? fetch(`${DIRECTUS_URL}/items/products?filter[product_id][_in]=${Array.from(productIds).join(",")}&limit=-1&fields=product_id,product_name,product_code,barcode,cost_per_unit,price_per_unit,category_id.*,unit_of_measurement.*`, { headers, cache: "no-store" })
                : Promise.resolve(null),
            lotIds.size > 0
                ? fetch(`${DIRECTUS_URL}/items/inventory_movements?filter[lot_id][_in]=${Array.from(lotIds).join(",")}&limit=-1&fields=*,lot_id.*`, { headers, cache: "no-store" })
                : Promise.resolve(null),
            versionIds.size > 0
                ? fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?filter[version_id][_in]=${Array.from(versionIds).join(",")}&limit=-1`, { headers, cache: "no-store" })
                : Promise.resolve(null),
            lotIds.size > 0
                ? fetch(`${DIRECTUS_URL}/items/lots?filter[lot_id][_in]=${Array.from(lotIds).join(",")}&limit=-1`, { headers, cache: "no-store" })
                : Promise.resolve(null),
            fetch(`${DIRECTUS_URL}/items/lots?limit=-1&fields=lot_id,lot_name`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?limit=-1&fields=version_id,version_name,product_id,status`, { headers, cache: "no-store" }).catch(() => null),
            fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,barcode,cost_per_unit,price_per_unit,category_id.*,unit_of_measurement.*`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        const productsMap = new Map<number, DirectusProductMeta>();
        if (productsRes && productsRes.ok) {
            const prodList: DirectusProductMeta[] = (await productsRes.json()).data || [];
            prodList.forEach((p) => productsMap.set(p.product_id, p));
        }

        const lotsMap = new Map<number, Record<string, unknown>>();
        if (lotsRes && lotsRes.ok) {
            const lotList: Record<string, unknown>[] = (await lotsRes.json()).data || [];
            lotList.forEach((l) => lotsMap.set(Number(l.id || l.lot_id), l));
        }
        if (binLotsRes && binLotsRes.ok) {
            const binList: Record<string, unknown>[] = (await binLotsRes.json()).data || [];
            binList.forEach((b) => {
                const lotId = Number(b.lot_id);
                if (isNaN(lotId)) return;
                const existing = lotsMap.get(lotId) || {};
                lotsMap.set(lotId, { 
                    ...existing, 
                    ...b, 
                    lot_name: (b.lot_name as string) || (b.name as string) || (existing.lot_name as string) 
                });
            });
        }

        const versionsMap = new Map<number, Record<string, unknown>>();
        if (versionsRes && versionsRes.ok) {
            const verList: Record<string, unknown>[] = (await versionsRes.json()).data || [];
            verList.forEach((v) => versionsMap.set(Number(v.version_id), v));
        }

        const availableLots = allMasterLotsRes && allMasterLotsRes.ok ? ((await allMasterLotsRes.json()).data || []) : [];
        const availableVersions = allMasterVersionsRes && allMasterVersionsRes.ok ? ((await allMasterVersionsRes.json()).data || []) : [];
        const allMasterProducts = allMasterProductsRes && allMasterProductsRes.ok ? ((await allMasterProductsRes.json()).data || []) : [];

        const enrichedDetails = detailsData.map((item: PhysicalInventoryDetail) => {
            const pId = extractId(item.product_id, "product_id");
            const lId = extractId(item.lot_id, "lot_id");
            const vId = extractId(item.version_id, "version_id");

            const productObj = pId ? (productsMap.get(pId) || item.product_id) : item.product_id;
            const lotObj = lId ? (lotsMap.get(lId) || item.lot_id) : item.lot_id;
            const versionObj = vId ? (versionsMap.get(vId) || item.version_id) : item.version_id;

            return {
                ...item,
                product_id: productObj,
                lot_id: lotObj,
                version_id: versionObj,
            };
        });

        // Parse offset_pairings if stored in remarks / metadata
        let offsetPairings = [];
        if (sheetData.remarks && typeof sheetData.remarks === "string" && sheetData.remarks.includes("__OFFSET_DATA__:")) {
            try {
                const parts = sheetData.remarks.split("__OFFSET_DATA__:");
                if (parts.length > 1) {
                    offsetPairings = JSON.parse(parts[1].trim());
                }
            } catch {
                offsetPairings = [];
            }
        }

        let resolvedInvType = (sheetData.inventory_type as string) || "";
        if (!resolvedInvType && sheetData.remarks && typeof sheetData.remarks === "string") {
            const match = sheetData.remarks.match(/\[Type:\s*([^\]]+)\]/i);
            if (match) resolvedInvType = match[1].trim();
        }
        if (!resolvedInvType) {
            resolvedInvType = (sheetData.stock_type as string) || "Finished Goods";
        }

        return NextResponse.json({
            success: true,
            data: {
                ...sheetData,
                inventory_type: resolvedInvType,
                details: enrichedDetails,
                available_lots: availableLots,
                available_versions: availableVersions,
                available_products: allMasterProducts,
                offset_pairings: offsetPairings
            },
        });
    } catch (e) {
        console.error("[Physical Inventory GET ID] Error:", e);
        return NextResponse.json(
            { success: false, error: (e as Error).message || "Failed to fetch physical count sheet details" },
            { status: 500 }
        );
    }
}

export async function PATCH(request: Request, context: RouteParams) {
    try {
        const { id } = await context.params;
        const sheetId = Number(id);

        if (isNaN(sheetId) || sheetId <= 0) {
            return NextResponse.json({ success: false, error: "Invalid count sheet ID" }, { status: 400 });
        }

        const body = (await request.json()) as {
            items?: {
                id?: string | number;
                physical_count?: number | string;
                lot_id?: unknown;
                version_id?: unknown;
                batch_no?: string;
                product_id?: unknown;
                unit_price?: number | string;
                system_count?: number | string;
                offset_qty?: number;
            }[];
            remarks?: string;
            offset_pairings?: unknown[];
        };
        const { items, remarks, offset_pairings } = body;

        if (!Array.isArray(items)) {
            return NextResponse.json({ success: false, error: "Missing required parameter: items array" }, { status: 400 });
        }

        const sheetRes = await fetch(`${DIRECTUS_URL}/items/physical_inventory/${sheetId}?fields=id,is_committed,is_cancelled,isComitted,isCancelled,remarks`, {
            headers,
            cache: "no-store",
        });

        if (!sheetRes.ok) {
            return NextResponse.json({ success: false, error: "Physical count sheet not found" }, { status: 404 });
        }

        const sheetData = (await sheetRes.json()).data;
        const isCommitted = parseBufferOrBool(sheetData.isComitted) || parseBufferOrBool(sheetData.is_committed);
        const isCancelled = parseBufferOrBool(sheetData.isCancelled) || parseBufferOrBool(sheetData.is_cancelled);

        if (isCommitted || isCancelled) {
            return NextResponse.json(
                { success: false, error: "Cannot edit a count sheet that is already committed or cancelled" },
                { status: 400 }
            );
        }

        let totalAmountAcc = 0;

        for (const item of items) {
            const rawIdStr = String(item.id || "");
            const isNewItem = !item.id || rawIdStr.startsWith("new_") || isNaN(Number(item.id));
            const physCount = roundQty(item.physical_count);
            const lotIdVal = extractId(item.lot_id, "lot_id") || extractId(item.lot_id, "id") || null;
            const versionIdVal = extractId(item.version_id, "version_id") || extractId(item.version_id, "id") || null;

            if (isNewItem) {
                // Insert new detail item (e.g. No-Count product found on floor or split location)
                const productIdVal = extractId(item.product_id, "product_id");
                const unitPrice = roundMoney(item.unit_price);
                const systemCount = roundQty(item.system_count);
                const variance = roundQty(physCount - systemCount);
                const diffCost = roundMoney(variance * unitPrice);
                const amount = roundMoney(physCount * unitPrice);

                totalAmountAcc += amount;

                const createPayload = {
                    ph_id: sheetId,
                    date_encoded: new Date().toISOString(),
                    product_id: productIdVal,
                    version_id: versionIdVal,
                    lot_id: lotIdVal,
                    batch_no: null,
                    unit_price: unitPrice,
                    system_count: systemCount,
                    physical_count: physCount,
                    variance,
                    difference_cost: diffCost,
                    amount,
                };

                await fetch(`${DIRECTUS_URL}/items/physical_inventory_details`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(createPayload),
                });
            } else {
                // Update existing detail line item
                const detailId = Number(item.id);
                const detailRes = await fetch(`${DIRECTUS_URL}/items/physical_inventory_details/${detailId}`, {
                    headers,
                    cache: "no-store",
                });

                if (!detailRes.ok) continue;

                const currentDetail = (await detailRes.json()).data;
                const systemCount = roundQty(currentDetail.system_count);
                const unitPrice = roundMoney(currentDetail.unit_price);

                const variance = roundQty(physCount - systemCount);
                const diffCost = roundMoney(variance * unitPrice);
                const amount = roundMoney(physCount * unitPrice);

                totalAmountAcc += amount;

                const updatePayload = {
                    physical_count: physCount,
                    lot_id: lotIdVal,
                    version_id: versionIdVal,
                    variance,
                    difference_cost: diffCost,
                    amount,
                };

                await fetch(`${DIRECTUS_URL}/items/physical_inventory_details/${detailId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify(updatePayload),
                });
            }
        }

        // Update sheet header total_amount & remarks (with offset_pairings embedded)
        let finalRemarks = remarks !== undefined ? String(remarks) : (sheetData.remarks || "");
        if (finalRemarks.includes("__OFFSET_DATA__:")) {
            finalRemarks = finalRemarks.split("__OFFSET_DATA__:")[0].trim();
        }
        if (Array.isArray(offset_pairings) && offset_pairings.length > 0) {
            finalRemarks = `${finalRemarks}\n__OFFSET_DATA__:${JSON.stringify(offset_pairings)}`;
        }

        const sheetUpdatePayload: Record<string, unknown> = {
            total_amount: roundMoney(totalAmountAcc),
            remarks: finalRemarks,
        };

        await fetch(`${DIRECTUS_URL}/items/physical_inventory/${sheetId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(sheetUpdatePayload),
        });

        return NextResponse.json({
            success: true,
            message: "Physical count sheet draft updated successfully",
        });
    } catch (e) {
        console.error("[Physical Inventory PATCH ID] Error:", e);
        return NextResponse.json(
            { success: false, error: (e as Error).message || "Failed to update physical count sheet draft" },
            { status: 500 }
        );
    }
}
