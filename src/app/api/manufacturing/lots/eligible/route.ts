import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    loadMmLots,
    loadMmInventoryLots,
    mmInventoryLotId,
    mmLotId,
    resolveProductUnitId,
    unitId,
    MmLotError
} from "../../services/mm-lots.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BranchRow {
    id?: number;
    branch_name?: string;
    branch_code?: string;
}

interface UnitRow {
    unit_id?: number;
    unit_name?: string;
    unit_shortcut?: string;
}

async function readOptionalRow<T>(path: string, label: string): Promise<T | null> {
    try {
        const response = await fetch(`${DIRECTUS_URL}${path}`, { headers, cache: "no-store" });
        if (!response.ok) return null;
        const payload = await response.json().catch(() => null) as { data?: unknown } | null;
        const data = payload?.data;
        if (Array.isArray(data)) return (data[0] as T) || null;
        return (data as T) || null;
    } catch (error) {
        console.warn(`[Eligible lots] ${label} lookup failed:`, error);
        return null;
    }
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const branchId = Number(searchParams.get("branchId"));
        const productId = Number(searchParams.get("productId"));

        if (!Number.isSafeInteger(branchId) || branchId <= 0) {
            return NextResponse.json({ error: "A valid branchId is required." }, { status: 400 });
        }
        if (!Number.isSafeInteger(productId) || productId <= 0) {
            return NextResponse.json({ error: "A valid productId is required." }, { status: 400 });
        }

        const expectedUnitId = await resolveProductUnitId(productId);
        const [lots, branch, unit] = await Promise.all([
            loadMmLots({ branchId, onlyActive: true }),
            readOptionalRow<BranchRow>(`/items/branches/${branchId}?fields=id,branch_name,branch_code`, "branch"),
            readOptionalRow<UnitRow>(`/items/units/${expectedUnitId}?fields=unit_id,unit_name,unit_shortcut`, "unit")
        ]);

        const eligibleLots = lots.filter((lot) => unitId(lot.unit_id) === expectedUnitId);
        const lotIds = eligibleLots
            .map((lot) => mmLotId(lot.lot_id))
            .filter((lotId): lotId is number => Boolean(lotId));

        const batches = lotIds.length > 0
            ? await loadMmInventoryLots({ mmLotIds: lotIds, productId, onlyActive: true })
            : [];

        const batchesByLot = new Map<number, Array<{
            inventoryLotId: number;
            batchNo: string;
            manufacturingDate: string | null;
            expiryDate: string | null;
            unitCost: number | null;
            qaStatus: string | null;
        }>>();
        for (const batch of batches) {
            const lotId = mmLotId(batch.lot_id);
            const inventoryLotId = mmInventoryLotId(batch.inventory_lot_id);
            if (!lotId || !inventoryLotId) continue;
            const list = batchesByLot.get(lotId) || [];
            list.push({
                inventoryLotId,
                batchNo: String(batch.batch_no || ""),
                manufacturingDate: batch.manufacturing_date ? String(batch.manufacturing_date) : null,
                expiryDate: batch.expiry_date ? String(batch.expiry_date) : null,
                unitCost: batch.unit_cost === null || batch.unit_cost === undefined ? null : Number(batch.unit_cost),
                qaStatus: batch.qa_status ? String(batch.qa_status) : null
            });
            batchesByLot.set(lotId, list);
        }

        const branchName = branch?.branch_name || `Branch #${branchId}`;
        const unitName = unit?.unit_name || unit?.unit_shortcut || "Pieces";
        const unitShortcut = unit?.unit_shortcut || unitName;

        return NextResponse.json({
            success: true,
            data: {
                branchId,
                branchName,
                productId,
                unitId: expectedUnitId,
                unitName,
                unitShortcut,
                lots: eligibleLots.map((lot) => {
                    const lotId = mmLotId(lot.lot_id);
                    return {
                        lotId,
                        lotName: String(lot.lot_name || `Lot #${lotId}`),
                        branchId,
                        branchName,
                        unitId: expectedUnitId,
                        unitShortcut,
                        status: lot.status ? String(lot.status) : "ACTIVE",
                        maxBatchCapacity: Number(lot.max_batch_capacity || 0),
                        batches: lotId ? batchesByLot.get(lotId) || [] : []
                    };
                })
            }
        });
    } catch (error) {
        if (error instanceof MmLotError) {
            return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
        }
        console.error("API Error in eligible finished-goods lots lookup:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to load eligible storage lots." },
            { status: 500 }
        );
    }
}
