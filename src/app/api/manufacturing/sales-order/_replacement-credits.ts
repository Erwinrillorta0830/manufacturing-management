type Row = Record<string, unknown>;

export interface ReplacementCreditAttribution {
    predecessorJobOrderId: number;
    predecessorJobOrderNo: string;
    detailId: number;
    creditedQuantity: number;
    allocationCreatedAt: string | null;
    allocationId: number;
}

export interface ReplacementCreditData {
    byDetail: Map<number, number>;
    attributions: ReplacementCreditAttribution[];
}

export type ReplacementCreditReader = (
    collection: string,
    params: URLSearchParams
) => Promise<{ data: Row[] }>;

export type FinishedGoodsReceiptReader = (jobOrderIds: number[]) => Promise<Row[]>;

const QUANTITY_EPSILON = 0.000001;

export function effectiveReplacementCreditQuantity(
    orderedQuantity: unknown,
    allocatedQuantity: unknown,
    servedQuantity: unknown,
    plannedQuantity: unknown,
    availableCredit: unknown
): number {
    const ordered = Number(orderedQuantity || 0);
    const allocated = Number(allocatedQuantity || 0);
    const served = Number(servedQuantity || 0);
    const planned = Number(plannedQuantity || 0);
    const credit = Number(availableCredit || 0);
    if (![ordered, allocated, served, planned, credit].every(Number.isFinite)) return 0;
    const outstandingBeforeCredit = Math.max(0, ordered - Math.max(allocated, served) - Math.max(0, planned));
    return Math.min(outstandingBeforeCredit, Math.max(0, credit));
}

export function remainingSalesOrderDemand(
    orderedQuantity: unknown,
    allocatedQuantity: unknown,
    servedQuantity: unknown,
    plannedQuantity = 0,
    availableCredit = 0
): number {
    const outstandingBeforeCredit = effectiveReplacementCreditQuantity(
        orderedQuantity,
        allocatedQuantity,
        servedQuantity,
        plannedQuantity,
        Number.MAX_SAFE_INTEGER
    );
    const appliedCredit = effectiveReplacementCreditQuantity(
        orderedQuantity,
        allocatedQuantity,
        servedQuantity,
        plannedQuantity,
        availableCredit
    );
    return Math.max(0, outstandingBeforeCredit - appliedCredit);
}

function relationId(value: unknown, ...keys: string[]): number {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "object") {
        const record = value as Row;
        for (const key of [...keys, "id"]) {
            const id = relationId(record[key], ...keys);
            if (id > 0) return id;
        }
        return 0;
    }
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
}

function quantity(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function lotKeys(row: Row): string[] {
    const mmLotId = relationId(row.mm_lot_id, "lot_id");
    const legacyLotId = relationId(row.lot_id, "lot_id")
        || relationId(row.canonical_lot_id, "canonical_lot_id");
    return [
        ...(mmLotId ? [`mm:${mmLotId}`] : []),
        ...(legacyLotId ? [`legacy:${legacyLotId}`] : [])
    ];
}

function jobOrderId(row: Row): number {
    return relationId(row.job_order_id, "job_order_id");
}

function detailId(row: Row): number {
    return relationId(row.sales_order_detail_id, "sales_order_detail_id", "detail_id");
}

function allocationId(row: Row): number {
    return relationId(row.allocation_id, "allocation_id") || relationId(row.id, "id");
}

function compareAllocationOrder(left: Row, right: Row): number {
    const leftTime = Date.parse(String(left.created_at || ""));
    const rightTime = Date.parse(String(right.created_at || ""));
    const normalizedLeftTime = Number.isFinite(leftTime) ? leftTime : 0;
    const normalizedRightTime = Number.isFinite(rightTime) ? rightTime : 0;
    return normalizedLeftTime - normalizedRightTime
        || allocationId(left) - allocationId(right)
        || jobOrderId(left) - jobOrderId(right);
}

/**
 * Approved QA output is creditable only to the extent that a positive finished-
 * goods receipt exists for the same Job Order and lot. Multiple receipt rows
 * are summed, but a lot's receipts can never credit more than its accepted QA
 * quantity.
 */
export function acceptedReceiptedOutputByJobOrder(
    qaReleases: Row[],
    finishedGoodsReceipts: Row[]
): Map<number, number> {
    const receiptByJobOrderAndLot = new Map<string, number>();
    for (const receipt of finishedGoodsReceipts) {
        const currentJobOrderId = relationId(receipt.source_document_id, "job_order_id")
            || jobOrderId(receipt);
        const currentLotKeys = lotKeys(receipt);
        const transactionTypeId = relationId(receipt.transaction_type_id, "transaction_type_id");
        const receivedQuantity = Number(receipt.quantity ?? 0);
        if (!currentJobOrderId || currentLotKeys.length === 0 || transactionTypeId !== 2
            || !Number.isFinite(receivedQuantity) || receivedQuantity <= QUANTITY_EPSILON) continue;
        for (const currentLotKey of currentLotKeys) {
            const key = `${currentJobOrderId}:${currentLotKey}`;
            receiptByJobOrderAndLot.set(key, (receiptByJobOrderAndLot.get(key) || 0) + receivedQuantity);
        }
    }

    const acceptedByJobOrderAndLot = new Map<string, { jobOrderId: number; quantity: number }>();
    for (const release of qaReleases) {
        const currentJobOrderId = jobOrderId(release);
        const currentLotKeys = lotKeys(release);
        if (!currentJobOrderId || currentLotKeys.length === 0
            || String(release.overall_disposition || "").trim().toLowerCase() !== "approved") continue;
        const acceptedQuantity = Math.max(
            0,
            quantity(release.inspected_quantity) - quantity(release.defect_quantity)
        );
        if (acceptedQuantity <= QUANTITY_EPSILON) continue;
        const key = currentLotKeys
            .map((currentLotKey) => `${currentJobOrderId}:${currentLotKey}`)
            .find((candidate) => (receiptByJobOrderAndLot.get(candidate) || 0) > QUANTITY_EPSILON);
        if (!key) continue;
        const current = acceptedByJobOrderAndLot.get(key) || { jobOrderId: currentJobOrderId, quantity: 0 };
        current.quantity += acceptedQuantity;
        acceptedByJobOrderAndLot.set(key, current);
    }

    const acceptedByJobOrder = new Map<number, number>();
    for (const [key, accepted] of acceptedByJobOrderAndLot) {
        const received = receiptByJobOrderAndLot.get(key) || 0;
        const credited = Math.min(accepted.quantity, received);
        if (credited > QUANTITY_EPSILON) {
            acceptedByJobOrder.set(
                accepted.jobOrderId,
                (acceptedByJobOrder.get(accepted.jobOrderId) || 0) + credited
            );
        }
    }
    return acceptedByJobOrder;
}

/**
 * Distribute each terminated predecessor's accepted output across its Sales
 * Order detail allocations in creation order. Every allocation is capped, and
 * zero-credit allocations are retained so replacement JOs can still carry an
 * auditable predecessor reference.
 */
export function attributeReplacementCredits(
    allocations: Row[],
    jobOrders: Row[],
    acceptedOutputByJobOrder: Map<number, number>
): ReplacementCreditAttribution[] {
    const jobOrderById = new Map<number, Row>();
    for (const jobOrder of jobOrders) {
        const id = jobOrderId(jobOrder);
        if (id > 0) jobOrderById.set(id, jobOrder);
    }

    const remainingOutputByJobOrder = new Map(acceptedOutputByJobOrder);
    const attributedByKey = new Map<string, ReplacementCreditAttribution>();
    const orderedAllocations = [...allocations].sort(compareAllocationOrder);

    for (const allocation of orderedAllocations) {
        const currentJobOrderId = jobOrderId(allocation);
        const currentDetailId = detailId(allocation);
        const jobOrder = jobOrderById.get(currentJobOrderId);
        if (!currentJobOrderId || !currentDetailId || !jobOrder) continue;
        const isTerminated = String(jobOrder.status || "").trim().toLowerCase() === "cancelled"
            && jobOrder.isTerminated === true;
        if (!isTerminated) continue;

        const availableOutput = quantity(remainingOutputByJobOrder.get(currentJobOrderId));
        const allocatedQuantity = quantity(allocation.allocated_quantity ?? allocation.quantity);
        const creditedQuantity = Math.min(availableOutput, allocatedQuantity);
        remainingOutputByJobOrder.set(currentJobOrderId, Math.max(0, availableOutput - creditedQuantity));

        const key = `${currentJobOrderId}:${currentDetailId}`;
        const existing = attributedByKey.get(key);
        if (existing) {
            existing.creditedQuantity += creditedQuantity;
            if (compareAllocationOrder(allocation, { created_at: existing.allocationCreatedAt, id: existing.allocationId }) < 0) {
                existing.allocationCreatedAt = String(allocation.created_at || "") || null;
                existing.allocationId = allocationId(allocation);
            }
            continue;
        }

        attributedByKey.set(key, {
            predecessorJobOrderId: currentJobOrderId,
            predecessorJobOrderNo: String(jobOrder.job_order_no || `JO-${currentJobOrderId}`),
            detailId: currentDetailId,
            creditedQuantity,
            allocationCreatedAt: String(allocation.created_at || "") || null,
            allocationId: allocationId(allocation)
        });
    }

    return [...attributedByKey.values()].sort((left, right) => {
        const leftTime = Date.parse(left.allocationCreatedAt || "");
        const rightTime = Date.parse(right.allocationCreatedAt || "");
        return (Number.isFinite(leftTime) ? leftTime : 0)
            - (Number.isFinite(rightTime) ? rightTime : 0)
            || left.allocationId - right.allocationId
            || left.predecessorJobOrderId - right.predecessorJobOrderId;
    });
}

export async function loadReplacementCreditData(
    read: ReplacementCreditReader,
    details: Row[],
    readFinishedGoodsReceipts?: FinishedGoodsReceiptReader
): Promise<ReplacementCreditData> {
    const detailIds = [...new Set(details.map((detail) => relationId(detail.detail_id ?? detail.id, "detail_id")).filter(Boolean))];
    if (detailIds.length === 0) return { byDetail: new Map(), attributions: [] };

    const allocationParams = new URLSearchParams({
        "filter[sales_order_detail_id][_in]": detailIds.join(","),
        fields: "*",
        limit: "-1"
    });
    const allocations = (await read("manufacturing_job_order_allocations", allocationParams)).data;
    const jobOrderIds = [...new Set(allocations.map(jobOrderId).filter(Boolean))];
    if (jobOrderIds.length === 0) return { byDetail: new Map(), attributions: [] };

    const jobOrderParams = new URLSearchParams({
        "filter[job_order_id][_in]": jobOrderIds.join(","),
        fields: "job_order_id,job_order_no,status",
        limit: "-1"
    });
    const jobOrders = (await read("manufacturing_job_orders", jobOrderParams)).data;
    const cancelledIds = jobOrders
        .filter((jobOrder) => String(jobOrder.status || "").trim().toLowerCase() === "cancelled")
        .map(jobOrderId)
        .filter(Boolean);
    if (cancelledIds.length === 0) return { byDetail: new Map(), attributions: [] };

    const historyParams = new URLSearchParams({
        "filter[job_order_id][_in]": cancelledIds.join(","),
        "filter[workflow_action][_eq]": "terminate-production",
        "filter[new_status][_eq]": "Cancelled",
        fields: "job_order_id,workflow_action,new_status",
        limit: "-1"
    });
    const terminationHistory = (await read("manufacturing_job_order_status_history", historyParams)).data;
    const terminatedIds = new Set(terminationHistory.map(jobOrderId).filter(Boolean));
    const terminatedOrders = jobOrders
        .filter((jobOrder) => terminatedIds.has(jobOrderId(jobOrder)))
        .map((jobOrder) => ({ ...jobOrder, isTerminated: true }));
    if (terminatedOrders.length === 0) return { byDetail: new Map(), attributions: [] };

    const terminatedJobOrderIds = terminatedOrders.map(jobOrderId);
    const qaReleases = await read("manufacturing_final_qa_releases", new URLSearchParams({
        "filter[job_order_id][_in]": terminatedJobOrderIds.join(","),
        fields: "job_order_id,mm_lot_id,lot_id,inspected_quantity,defect_quantity,overall_disposition",
        limit: "-1"
    }));
    const finishedGoodsReceipts = readFinishedGoodsReceipts
        ? await readFinishedGoodsReceipts(terminatedJobOrderIds)
        : (await read("inventory_movements", new URLSearchParams({
            "filter[source_document_id][_in]": terminatedJobOrderIds.join(","),
            "filter[transaction_type_id][_eq]": "2",
            "filter[quantity][_gt]": "0",
            fields: "source_document_id,job_order_id,mm_lot_id,lot_id,transaction_type_id,quantity",
            limit: "-1"
        }))).data;

    const acceptedOutput = acceptedReceiptedOutputByJobOrder(qaReleases.data, finishedGoodsReceipts);
    const predecessorAllocations = allocations.filter((allocation) => terminatedIds.has(jobOrderId(allocation)));
    const attributions = attributeReplacementCredits(predecessorAllocations, terminatedOrders, acceptedOutput);
    const byDetail = new Map<number, number>();
    for (const attribution of attributions) {
        byDetail.set(
            attribution.detailId,
            (byDetail.get(attribution.detailId) || 0) + attribution.creditedQuantity
        );
    }
    return { byDetail, attributions };
}

export function capReplacementCreditsToRemainingDemand(
    attributions: ReplacementCreditAttribution[],
    detailId: number,
    remainingDemand: number
): ReplacementCreditAttribution[] {
    let remainingCredit = Math.max(0, Number.isFinite(remainingDemand) ? remainingDemand : 0);
    const result: ReplacementCreditAttribution[] = [];
    for (const attribution of attributions.filter((item) => item.detailId === detailId)) {
        if (remainingCredit <= QUANTITY_EPSILON) break;
        const creditedQuantity = Math.min(attribution.creditedQuantity, remainingCredit);
        if (creditedQuantity <= QUANTITY_EPSILON) continue;
        result.push({ ...attribution, creditedQuantity });
        remainingCredit -= creditedQuantity;
    }
    return result;
}
