export interface EligibleFinishedGoodsBatch {
    inventoryLotId: number;
    batchNo: string;
    manufacturingDate: string | null;
    expiryDate: string | null;
    unitCost: number | null;
    qaStatus: string | null;
}

export interface EligibleFinishedGoodsLot {
    lotId: number;
    lotName: string;
    branchId: number;
    branchName: string;
    unitId: number;
    unitShortcut: string;
    status: string;
    maxBatchCapacity: number;
    batches: EligibleFinishedGoodsBatch[];
}

export interface EligibleFinishedGoodsLotsResponse {
    branchId: number;
    branchName: string;
    productId: number;
    unitId: number;
    unitName: string;
    unitShortcut: string;
    lots: EligibleFinishedGoodsLot[];
}

export async function fetchEligibleFinishedGoodsLots(
    branchId: number,
    productId: number
): Promise<EligibleFinishedGoodsLotsResponse> {
    const res = await fetch(
        `/api/manufacturing/lots/eligible?branchId=${encodeURIComponent(String(branchId))}&productId=${encodeURIComponent(String(productId))}`,
        { cache: "no-store" }
    );
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || "Failed to load eligible storage lots.");
    return json.data;
}
