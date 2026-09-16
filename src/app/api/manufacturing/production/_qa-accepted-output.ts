/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    deriveDailyQAOutcome,
    type DailyQAOutcome,
    type DailyQAOutcomeStatus,
} from "@/modules/manufacturing-management/manufacturing-qa/daily-qa-outcome";
import { isCancelledJobOrderStatus } from "@/modules/manufacturing-management/job-order-status";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";
const QUANTITY_EPSILON = 0.000001;

const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(DIRECTUS_STATIC_TOKEN
        ? { Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}` }
        : {})
};

type DirectusRow = Record<string, any>;

export interface QAYieldAssessment {
    ledgerId: number;
    jobOrderId: number;
    goodQuantity: number;
    rejectedQuantity: number;
    scrapQuantity: number;
    totalQuantity: number;
    acceptedQuantity: number;
    qaStatus: DailyQAOutcomeStatus;
    outcome: DailyQAOutcome;
    audits: DirectusRow[];
}

export interface SalesOrderQACoverage {
    producedQuantity: number;
    producedQuantityByDetail: Map<number, number>;
    fulfilledQuantityByDetail: Map<number, number>;
    fulfilled: boolean;
}

function relationId(value: unknown, keys: string[] = ["id"]): number {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of [...keys, "id"]) {
            const candidate = relationId(record[key], keys);
            if (candidate > 0) return candidate;
        }
        return 0;
    }
    const candidate = Number(value);
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 0;
}

function numberValue(value: unknown): number {
    const candidate = Number(value ?? 0);
    return Number.isFinite(candidate) ? candidate : 0;
}

function positiveQuantity(value: unknown): number {
    return Math.max(0, numberValue(value));
}

function jobOrderId(row: DirectusRow): number {
    return relationId(row.job_order_id, ["job_order_id", "id"])
        || relationId(row.id, ["id"]);
}

function ledgerId(row: DirectusRow): number {
    return relationId(row.ledger_id, ["ledger_id", "id"])
        || relationId(row.id, ["id"]);
}

function routeId(row: DirectusRow): number {
    return relationId(row.jo_route_id, ["jo_route_id", "id"])
        || relationId(row.id, ["id"]);
}

function detailId(row: DirectusRow): number {
    return relationId(row.sales_order_detail_id, ["sales_order_detail_id", "detail_id", "id"])
        || relationId(row.detail_id, ["detail_id", "id"]);
}

function allocationJobOrderId(row: DirectusRow): number {
    return relationId(row.job_order_id, ["job_order_id", "id"]);
}

function allocationQuantity(row: DirectusRow): number {
    return positiveQuantity(row.allocated_quantity ?? row.quantity);
}

export function isCancelledAllocation(row: DirectusRow): boolean {
    const status = String(row.status || row.reservation_status || "").trim().toLowerCase();
    return ["cancelled", "canceled", "void", "inactive"].includes(status);
}

export function buildQAYieldAssessments(
    yieldRows: DirectusRow[],
    inspectionRows: DirectusRow[],
    routeRows: DirectusRow[]
): QAYieldAssessment[] {
    const routeIdsByJobOrder = new Map<number, number[]>();
    for (const route of routeRows) {
        const currentJobOrderId = jobOrderId(route);
        const currentRouteId = routeId(route);
        if (!currentJobOrderId || !currentRouteId) continue;
        const ids = routeIdsByJobOrder.get(currentJobOrderId) || [];
        ids.push(currentRouteId);
        routeIdsByJobOrder.set(currentJobOrderId, ids);
    }

    const inspectionsByLedger = new Map<number, DirectusRow[]>();
    for (const inspection of inspectionRows) {
        const currentLedgerId = ledgerId(inspection);
        if (!currentLedgerId) continue;
        const audits = inspectionsByLedger.get(currentLedgerId) || [];
        audits.push(inspection);
        inspectionsByLedger.set(currentLedgerId, audits);
    }

    return yieldRows
        .map((yieldRow) => {
            const currentLedgerId = ledgerId(yieldRow);
            const currentJobOrderId = jobOrderId(yieldRow);
            const audits = inspectionsByLedger.get(currentLedgerId) || [];
            const outcome = deriveDailyQAOutcome(
                audits,
                routeIdsByJobOrder.get(currentJobOrderId) || []
            );
            const goodQuantity = positiveQuantity(yieldRow.yield_quantity);
            const rejectedQuantity = positiveQuantity(yieldRow.rejected_quantity);
            const scrapQuantity = positiveQuantity(yieldRow.scrap_quantity);
            const totalQuantity = goodQuantity + rejectedQuantity + scrapQuantity;

            return {
                ledgerId: currentLedgerId,
                jobOrderId: currentJobOrderId,
                goodQuantity,
                rejectedQuantity,
                scrapQuantity,
                totalQuantity,
                acceptedQuantity:
                    outcome.status === "Passed" ? goodQuantity + rejectedQuantity : 0,
                qaStatus: outcome.status,
                outcome,
                audits,
            };
        })
        .filter((row) => row.ledgerId > 0 && row.jobOrderId > 0);
}

export function acceptedQuantityByJobOrder(
    assessments: QAYieldAssessment[],
    excludedJobOrderIds: ReadonlySet<number> = new Set()
): Map<number, number> {
    const acceptedByJobOrder = new Map<number, number>();
    for (const assessment of assessments) {
        if (excludedJobOrderIds.has(assessment.jobOrderId)) continue;
        acceptedByJobOrder.set(
            assessment.jobOrderId,
            (acceptedByJobOrder.get(assessment.jobOrderId) || 0) + assessment.acceptedQuantity
        );
    }
    return acceptedByJobOrder;
}

export function calculateSalesOrderQACoverage(
    details: DirectusRow[],
    allocations: DirectusRow[],
    jobOrders: DirectusRow[],
    assessments: QAYieldAssessment[]
): SalesOrderQACoverage {
    const cancelledJobOrderIds = new Set(
        jobOrders
            .filter((jobOrder) => isCancelledJobOrderStatus(jobOrder.status))
            .map((jobOrder) => jobOrderId(jobOrder))
            .filter(Boolean)
    );
    const acceptedByJobOrder = acceptedQuantityByJobOrder(assessments, cancelledJobOrderIds);
    const detailById = new Map<number, DirectusRow>();
    for (const detail of details) {
        const currentDetailId = relationId(detail.detail_id, ["detail_id", "id"])
            || relationId(detail.id, ["id"]);
        if (currentDetailId) detailById.set(currentDetailId, detail);
    }

    const activeAllocations = allocations
        .filter((allocation) => !isCancelledAllocation(allocation))
        .filter((allocation) => !cancelledJobOrderIds.has(allocationJobOrderId(allocation)))
        .filter((allocation) => detailById.has(detailId(allocation)))
        .filter((allocation) => allocationJobOrderId(allocation) > 0 && allocationQuantity(allocation) > 0)
        .sort((left, right) => (
            allocationJobOrderId(left) - allocationJobOrderId(right)
            || detailId(left) - detailId(right)
        ));
    const linkedActiveJobOrderIds = new Set(
        activeAllocations.map((allocation) => allocationJobOrderId(allocation))
    );

    const remainingAcceptedByJobOrder = new Map(acceptedByJobOrder);
    const producedQuantityByDetail = new Map<number, number>();
    const fulfilledQuantityByDetail = new Map<number, number>();

    for (const allocation of activeAllocations) {
        const currentJobOrderId = allocationJobOrderId(allocation);
        const currentDetailId = detailId(allocation);
        const remainingProduced = positiveQuantity(remainingAcceptedByJobOrder.get(currentJobOrderId));
        if (remainingProduced <= QUANTITY_EPSILON) continue;

        const creditedQuantity = Math.min(remainingProduced, allocationQuantity(allocation));
        if (creditedQuantity <= QUANTITY_EPSILON) continue;

        remainingAcceptedByJobOrder.set(currentJobOrderId, remainingProduced - creditedQuantity);
        producedQuantityByDetail.set(
            currentDetailId,
            (producedQuantityByDetail.get(currentDetailId) || 0) + creditedQuantity
        );

        const detail = detailById.get(currentDetailId);
        const orderedQuantity = positiveQuantity(detail?.ordered_quantity ?? detail?.quantity);
        const alreadyFulfilled = positiveQuantity(fulfilledQuantityByDetail.get(currentDetailId));
        const newlyFulfilled = Math.min(
            Math.max(0, orderedQuantity - alreadyFulfilled),
            creditedQuantity
        );
        fulfilledQuantityByDetail.set(currentDetailId, alreadyFulfilled + newlyFulfilled);
    }

    const fulfilled = details.length > 0 && details.every((detail) => {
        const currentDetailId = relationId(detail.detail_id, ["detail_id", "id"])
            || relationId(detail.id, ["id"]);
        const orderedQuantity = positiveQuantity(detail.ordered_quantity ?? detail.quantity);
        const fulfilledQuantity = positiveQuantity(fulfilledQuantityByDetail.get(currentDetailId));
        return orderedQuantity > 0 && fulfilledQuantity + QUANTITY_EPSILON >= orderedQuantity;
    });

    return {
        producedQuantity: [...linkedActiveJobOrderIds].reduce(
            (sum, linkedJobOrderId) => sum + (acceptedByJobOrder.get(linkedJobOrderId) || 0),
            0
        ),
        producedQuantityByDetail,
        fulfilledQuantityByDetail,
        fulfilled,
    };
}

async function readRows(path: string, label: string): Promise<DirectusRow[]> {
    let response: Response;
    try {
        response = await fetch(`${DIRECTUS_URL}${path}`, {
            headers,
            cache: "no-store",
        });
    } catch (error) {
        throw new Error(`${label} could not be reached: ${error instanceof Error ? error.message : "network error"}.`);
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(`${label} failed with HTTP ${response.status}.`);
    }
    if (!payload || !Array.isArray(payload.data)) {
        throw new Error(`${label} returned an invalid collection.`);
    }
    return payload.data;
}

async function readSalesOrderAllocations(detailIds: number[], label: string): Promise<DirectusRow[]> {
    const basePath = `/items/manufacturing_job_order_allocations?filter[sales_order_detail_id][_in]=${detailIds.join(",")}&limit=-1`;
    try {
        return await readRows(
            `${basePath}&fields=sales_order_detail_id,job_order_id,allocated_quantity,status`,
            label
        );
    } catch (error) {
        if (!(error instanceof Error) || !/HTTP (400|403)/.test(error.message)) throw error;
        return readRows(
            `${basePath}&fields=sales_order_detail_id,job_order_id,allocated_quantity`,
            label
        );
    }
}

export async function loadSalesOrderQACoverage(
    orderId: number,
    providedDetails?: DirectusRow[]
): Promise<SalesOrderQACoverage> {
    const details = providedDetails || await readRows(
        `/items/sales_order_details?filter[order_id][_eq]=${encodeURIComponent(String(orderId))}&limit=-1&fields=detail_id,order_id,ordered_quantity,quantity`,
        `Sales Order ${orderId} detail lookup`
    );
    const detailIds = [...new Set(
        details
            .map((detail) => relationId(detail.detail_id, ["detail_id", "id"]) || relationId(detail.id, ["id"]))
            .filter(Boolean)
    )];
    if (detailIds.length === 0) {
        return {
            producedQuantity: 0,
            producedQuantityByDetail: new Map(),
            fulfilledQuantityByDetail: new Map(),
            fulfilled: false,
        };
    }

    const allocations = await readSalesOrderAllocations(
        detailIds,
        `Sales Order ${orderId} Job Order allocation lookup`
    );
    const jobOrderIds = [...new Set(
        allocations
            .filter((allocation) => !isCancelledAllocation(allocation))
            .map((allocation) => allocationJobOrderId(allocation))
            .filter(Boolean)
    )];
    if (jobOrderIds.length === 0) {
        return {
            producedQuantity: 0,
            producedQuantityByDetail: new Map(),
            fulfilledQuantityByDetail: new Map(),
            fulfilled: false,
        };
    }

    const filter = jobOrderIds.join(",");
    const [jobOrders, yields, routes, inspections] = await Promise.all([
        readRows(
            `/items/manufacturing_job_orders?filter[job_order_id][_in]=${filter}&limit=-1&fields=job_order_id,status`,
            `Sales Order ${orderId} Job Order lookup`
        ),
        readRows(
            `/items/manufacturing_job_order_yield_ledger?filter[job_order_id][_in]=${filter}&limit=-1&fields=*`,
            `Sales Order ${orderId} yield ledger lookup`
        ),
        readRows(
            `/items/manufacturing_job_order_routes?filter[job_order_id][_in]=${filter}&limit=-1&fields=*`,
            `Sales Order ${orderId} routing lookup`
        ),
        readRows(
            `/items/manufacturing_daily_qa_inspections?filter[job_order_id][_in]=${filter}&limit=-1&fields=*`,
            `Sales Order ${orderId} daily QA lookup`
        ),
    ]);

    return calculateSalesOrderQACoverage(
        details,
        allocations,
        jobOrders,
        buildQAYieldAssessments(yields, inspections, routes)
    );
}
