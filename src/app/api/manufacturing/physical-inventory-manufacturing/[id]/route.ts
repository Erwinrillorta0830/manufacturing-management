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

        // Extract offset_pairings if stored in remarks
        let offsetPairings = [];
        if (headerData?.remarks && typeof headerData.remarks === "string" && headerData.remarks.includes("__OFFSET_DATA__:")) {
            try {
                const parts = headerData.remarks.split("__OFFSET_DATA__:");
                if (parts.length > 1) {
                    offsetPairings = JSON.parse(parts[1].trim());
                }
            } catch {
                offsetPairings = [];
            }
        }

        // Fetch details
        const detailsUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details?filter[physical_inventory_id][_eq]=${sheetId}&limit=-1&fields=*,inventory_lot_id.*,lot_id.*,lot_id.unit_id.*,product_id.*,product_id.product_type.*,product_id.unit_of_measurement.*,unit_id.*`;
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
                offset_pairings: offsetPairings,
            },
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}

function areDatesEqual(d1: unknown, d2: unknown): boolean {
    if (!d1 && !d2) return true;
    if (!d1 || !d2) return false;
    const str1 = String(d1).trim();
    const str2 = String(d2).trim();
    if (str1 === str2) return true;

    const toMinuteStr = (val: string): string => {
        if (!val) return "";
        const s = val.trim();
        let datePart = "";
        let timePart = "00:00";
        if (s.includes("T")) {
            const parts = s.split("T");
            datePart = parts[0];
            timePart = (parts[1] || "").slice(0, 5);
        } else if (s.includes(" ")) {
            const parts = s.split(" ");
            datePart = parts[0];
            timePart = (parts[1] || "").slice(0, 5);
        } else {
            datePart = s;
        }
        return `${datePart}T${timePart}`;
    };

    const m1 = toMinuteStr(str1);
    const m2 = toMinuteStr(str2);
    if (m1 && m2 && m1 === m2) return true;

    const t1 = new Date(str1).getTime();
    const t2 = new Date(str2).getTime();
    if (!isNaN(t1) && !isNaN(t2)) {
        return Math.abs(t1 - t2) < 60000;
    }
    return false;
}

/**
 * PATCH /api/manufacturing/physical-inventory-manufacturing/[id]
 * Update draft Physical Inventory header metadata (remarks, dates, product_type_id, price_type_id, offset_pairings)
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

        const body = await request.json();
        const { starting_date, cutoff_date, remarks, stock_type, product_type_id, price_type_id, offset_pairings } = body;

        const hasStructuralChange =
            (starting_date !== undefined && !areDatesEqual(starting_date, sheet.starting_date)) ||
            (cutoff_date !== undefined && !areDatesEqual(cutoff_date, sheet.cutoff_date)) ||
            (price_type_id !== undefined && extractId(price_type_id, "price_type_id") !== extractId(sheet.price_type_id, "price_type_id")) ||
            (product_type_id !== undefined && extractId(product_type_id, "product_type_id") !== extractId(sheet.product_type_id, "product_type_id")) ||
            (stock_type !== undefined && stock_type !== sheet.stock_type);

        if (isCancelled || (hasStructuralChange && (statusUpper !== "DRAFT" || isCommitted))) {
            return NextResponse.json({ success: false, error: "Cancelled physical inventory records or committed structural headers cannot be edited." }, { status: 400 });
        }

        // Check if count details already exist for this sheet
        const detailsCheckUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details?filter[physical_inventory_id][_eq]=${sheetId}&limit=1`;
        const detailsRes = await fetch(detailsCheckUrl, { headers, cache: "no-store" });
        const existingDetails = detailsRes.ok ? ((await detailsRes.json()).data || []) : [];
        const hasDetails = existingDetails.length > 0;

        if (hasDetails && hasStructuralChange) {
            return NextResponse.json({
                success: false,
                error: "Critical header controls (Starting Date, Cutoff Date, Price Type Basis, Product Type Filter, Stock Count Type) cannot be modified once line items have been logged in an active audit sheet."
            }, { status: 400 });
        }

        const updatePayload: Record<string, unknown> = {};
        if (starting_date) updatePayload.starting_date = starting_date;
        if (cutoff_date) updatePayload.cutoff_date = cutoff_date;
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

        // Process remarks and embedded offset_pairings
        let baseRemarks = remarks !== undefined ? (remarks ? String(remarks).trim() : "") : (sheet.remarks ? String(sheet.remarks) : "");
        if (baseRemarks.includes("__OFFSET_DATA__:")) {
            baseRemarks = baseRemarks.split("__OFFSET_DATA__:")[0].trim();
        }

        if (Array.isArray(offset_pairings)) {
            updatePayload.remarks = offset_pairings.length > 0
                ? (baseRemarks ? `${baseRemarks}\n__OFFSET_DATA__:${JSON.stringify(offset_pairings)}` : `__OFFSET_DATA__:${JSON.stringify(offset_pairings)}`)
                : (baseRemarks || null);
        } else if (remarks !== undefined) {
            if (sheet.remarks && typeof sheet.remarks === "string" && sheet.remarks.includes("__OFFSET_DATA__:")) {
                const offsetPart = sheet.remarks.substring(sheet.remarks.indexOf("__OFFSET_DATA__:"));
                updatePayload.remarks = baseRemarks ? `${baseRemarks}\n${offsetPart}` : offsetPart;
            } else {
                updatePayload.remarks = baseRemarks || null;
            }
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

        // Recalculate prices for all detail rows using the active price_type_id if updated
        const activePriceTypeId = newPriceTypeId !== null ? newPriceTypeId : extractId(sheet.price_type_id);
        if (newPriceTypeId !== null && activePriceTypeId > 0) {
            try {
                const detailsUrl = `${DIRECTUS_URL}/items/mm_physical_inventory_details?filter[physical_inventory_id][_eq]=${sheetId}&limit=-1`;
                const detailsRes = await fetch(detailsUrl, { headers, cache: "no-store" });
                if (detailsRes.ok) {
                    const detailsList: Array<Record<string, unknown>> = (await detailsRes.json()).data || [];
                    if (detailsList.length > 0) {
                        const productIds = detailsList.map((d) => extractId(d.product_id));
                        const priceMap = await resolveBatchPrices(productIds, activePriceTypeId);

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
        let parsedOffsetPairings = Array.isArray(offset_pairings) ? offset_pairings : [];
        if (!Array.isArray(offset_pairings) && updatedData?.remarks && typeof updatedData.remarks === "string" && updatedData.remarks.includes("__OFFSET_DATA__:")) {
            try {
                const parts = updatedData.remarks.split("__OFFSET_DATA__:");
                if (parts.length > 1) {
                    parsedOffsetPairings = JSON.parse(parts[1].trim());
                }
            } catch {
                parsedOffsetPairings = [];
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                ...updatedData,
                offset_pairings: parsedOffsetPairings,
            },
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
