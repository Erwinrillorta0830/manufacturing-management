/* eslint-disable */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { fetchMmInventoryMovements, MmInventoryMovementError } from "../../services/mm-inventory-movements.service";

class DirectusReadError extends Error {
    readonly status = 502;

    constructor(message: string) {
        super(message);
        this.name = "DirectusReadError";
    }
}

async function directusRows<T = any>(url: string, label: string): Promise<T[]> {
    let response: Response;
    let responseText = "";

    try {
        response = await fetch(url, { headers, cache: "no-store" });
        responseText = await response.text();
    } catch (error) {
        throw new DirectusReadError(`${label} failed: ${(error as Error).message || "Directus request failed"}`);
    }

    let payload: any = null;
    try {
        payload = responseText ? JSON.parse(responseText) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        throw new DirectusReadError(`${label} failed with HTTP ${response.status}: ${responseText || "No response body"}`);
    }

    if (!payload || !Array.isArray(payload.data)) {
        throw new DirectusReadError(`${label} returned an invalid collection response.`);
    }

    return payload.data as T[];
}

function normalizeGenealogyRecord(row: any): any {
    return {
        ...row,
        genealogy_id: row.genealogy_id ?? row.id,
        job_order_no: row.job_order_no || row.job_order_id?.job_order_no || "",
        finished_batch_no: row.batch_no ?? row.finished_batch_no,
        raw_product_id: row.component_product_id ?? row.raw_product_id,
        component_mm_lot_id: row.component_mm_lot_id ?? null,
        raw_lot_id: row.component_mm_lot_id ?? row.component_lot_id ?? row.raw_lot_id,
        raw_batch_no: row.component_batch_no ?? row.raw_batch_no,
        quantity_consumed: row.consumed_quantity ?? row.quantity_consumed,
        created_by: row.created_by ?? null
    };
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const joId = searchParams.get("joId");
        const batchNo = searchParams.get("batchNo");

        if (!joId && !batchNo) {
            return NextResponse.json({ error: "Missing joId or batchNo query parameter" }, { status: 400 });
        }

        const jobOrderId = joId ? Number(joId) : 0;
        if (joId && (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0)) {
            return NextResponse.json({ error: "joId must be a positive integer" }, { status: 400 });
        }

        const genealogyFilters: Record<string, any>[] = [];
        if (joId) genealogyFilters.push({ job_order_id: { _eq: joId } });
        if (batchNo) genealogyFilters.push({ batch_no: { _eq: batchNo } });

        const genealogyFilter = genealogyFilters.length === 1
            ? genealogyFilters[0]
            : { _and: genealogyFilters };
        const genUrl = `${DIRECTUS_URL}/items/jo_material_genealogy?filter=${encodeURIComponent(JSON.stringify(genealogyFilter))}&limit=-1&sort=-created_at`;
        // These are the required audit sources. Any upstream failure must be
        // visible to the caller instead of being represented as empty data.
        const [rawGen, movements] = await Promise.all([
            directusRows<any>(genUrl, "Genealogy records lookup"),
            jobOrderId > 0
                ? fetchMmInventoryMovements({ referenceId: jobOrderId })
                : Promise.resolve([])
        ]);

        // Display enrichment is best-effort. Primary audit rows remain valid
        // when product or user metadata is temporarily unavailable.
        const [prods, users] = await Promise.all([
            directusRows<any>(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,unit_of_measurement.unit_shortcut`, "Product enrichment lookup").catch((error) => {
                console.warn("Product enrichment unavailable for genealogy audit:", error);
                return [];
            }),
            directusRows<any>(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, "User enrichment lookup").catch((error) => {
                console.warn("User enrichment unavailable for genealogy audit:", error);
                return [];
            })
        ]);

        const prodMap = new Map<number, { name: string; uom: string }>();
        prods.forEach((p: any) => {
            prodMap.set(Number(p.product_id), {
                name: p.product_name,
                uom: p.unit_of_measurement?.unit_shortcut || "units"
            });
        });

        const userMap = new Map<number, string>();
        users.forEach((u: any) => {
            const name = [u.user_fname, u.user_lname].filter(Boolean).join(" ") || `User #${u.user_id}`;
            userMap.set(Number(u.user_id), name);
        });

        const enrichedGenealogy = rawGen.map((rawRecord: any) => {
            const g = normalizeGenealogyRecord(rawRecord);
            const prodInfo = prodMap.get(Number(g.raw_product_id));
            return {
                ...g,
                raw_product_name: prodInfo?.name || `Product #${g.raw_product_id}`,
                unit_shortcut: prodInfo?.uom || "units",
                created_by_name: userMap.get(Number(g.created_by)) || (g.created_by ? `User #${g.created_by}` : "Operator")
            };
        });

        // Also enrich backflushed inventory movements
        const enrichedMovements = movements.map((m: any) => {
            const prodInfo = prodMap.get(Number(m.product_id?.product_id || m.product_id));
            return {
                ...m,
                product_name: prodInfo?.name || `Product #${m.product_id}`,
                unit_shortcut: prodInfo?.uom || "units",
                created_by_name: userMap.get(Number(m.created_by)) || (m.created_by ? `User #${m.created_by}` : "Operator")
            };
        });

        return NextResponse.json({
            success: true,
            genealogy: enrichedGenealogy,
            movements: enrichedMovements
        });
    } catch (e: any) {
        console.error("Error in genealogy GET API:", e);
        const status = e instanceof DirectusReadError
            ? e.status
            : e instanceof MmInventoryMovementError
                ? e.status
                : 500;
        return NextResponse.json({
            success: false,
            error: e.message || "Failed to load genealogy records"
        }, { status });
    }
}
