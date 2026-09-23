import type { ProfitabilityMaterialLine } from "@/modules/manufacturing-management/job-order-profitability-report/types";

export type DirectusRow = Record<string, unknown>;

export interface JobOrderCostLine {
    amount: number | null;
    complete: boolean;
    reason?: string;
    lines: Array<{
        label: string;
        operationName: string;
        hours: number;
        hourlyRate: number | null;
        amount: number | null;
    }>;
}

function asRecord(value: unknown): DirectusRow | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as DirectusRow
        : null;
}

function relationId(value: unknown, keys: string[] = ["id"]): number {
    const record = asRecord(value);
    const raw = record
        ? [...keys, "id"].map((key) => record[key]).find((candidate) => candidate !== undefined && candidate !== null)
        : value;
    const parsed = Number(raw || 0);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function nonNegative(value: unknown): number {
    return Math.max(0, numberOrNull(value) ?? 0);
}

function roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function text(value: unknown): string {
    return String(value ?? "").trim();
}

function normalizedBatch(value: unknown): string {
    return text(value).toUpperCase();
}

export function inventoryCostKey(lotId: number, productId: number, branchId: number, batchNo: string): string {
    return `${lotId}:${productId}:${branchId}:${normalizedBatch(batchNo)}`;
}

export function buildMaterialCost(
    jobOrderId: number,
    batchNo: string,
    branchId: number,
    genealogyByJobOrderBatch: Map<string, DirectusRow[]>,
    inventoryLotsByKey: Map<string, DirectusRow[]>,
    lotNameById: Map<number, string>,
    productById: Map<number, DirectusRow>,
    includeDetails = true
): { amount: number | null; complete: boolean; lines: ProfitabilityMaterialLine[]; reason?: string } {
    const genealogy = genealogyByJobOrderBatch.get(`${jobOrderId}:${normalizedBatch(batchNo)}`) || [];
    if (genealogy.length === 0) {
        return { amount: null, complete: false, lines: [], reason: "Batch-linked material genealogy is missing." };
    }

    let total = 0;
    let complete = true;
    let positiveConsumptionFound = false;
    const lines: ProfitabilityMaterialLine[] = [];
    for (const row of genealogy) {
        const productId = relationId(row.component_product_id, ["product_id", "id"]);
        const lotId = relationId(row.component_mm_lot_id, ["lot_id", "id"])
            || relationId(row.component_lot_id, ["lot_id", "id"]);
        const componentBatch = text(row.component_batch_no);
        const quantity = nonNegative(row.consumed_quantity);
        if (quantity > 0) positiveConsumptionFound = true;
        const matches = inventoryLotsByKey.get(inventoryCostKey(lotId, productId, branchId, componentBatch)) || [];
        const unitCost = matches.length === 1 ? numberOrNull(matches[0].unit_cost) : null;
        const totalCost = unitCost === null ? null : roundMoney(quantity * unitCost);
        if (totalCost === null) complete = false;
        else total += totalCost;
        if (includeDetails) {
            const product = productById.get(productId);
            lines.push({
                productName: text(product?.product_name) || `Product #${productId || "N/A"}`,
                productCode: text(product?.product_code),
                lotNumber: lotNameById.get(lotId) || (lotId ? `Lot #${lotId}` : "N/A"),
                batchNumber: componentBatch || "N/A",
                quantity,
                unitCost,
                totalCost
            });
        }
    }
    if (!positiveConsumptionFound) complete = false;
    return {
        amount: complete ? roundMoney(total) : null,
        complete,
        lines,
        reason: complete ? undefined : "One or more consumed components lack a matching lot cost or positive genealogy quantity."
    };
}

export function buildLaborCost(
    jobOrderId: number,
    routeIdsByJobOrder: Map<number, number[]>,
    operatorsByRoute: Map<number, DirectusRow[]>,
    routeById: Map<number, DirectusRow>,
    userById: Map<number, DirectusRow>,
    includeDetails = true
): JobOrderCostLine {
    const routeIds = routeIdsByJobOrder.get(jobOrderId) || [];
    const operators = routeIds.flatMap((routeId) => operatorsByRoute.get(routeId) || []);
    if (operators.length === 0) {
        return { amount: null, complete: false, reason: "Actual operator labor records are missing.", lines: [] };
    }
    let total = 0;
    let complete = true;
    let positiveHoursFound = false;
    const lines: JobOrderCostLine["lines"] = [];
    for (const row of operators) {
        const routeId = relationId(row.jo_route_id, ["jo_route_id", "id"]);
        const hoursValue = numberOrNull(row.logged_hours);
        const hours = Math.max(0, hoursValue ?? 0);
        const hourlyRate = numberOrNull(row.hourly_rate);
        const amount = hoursValue === null || (hours > 0 && hourlyRate === null)
            ? null
            : roundMoney(hours * (hourlyRate ?? 0));
        if (hours > 0) positiveHoursFound = true;
        if (amount === null) complete = false;
        else total += amount;
        if (!includeDetails) continue;
        const operatorId = relationId(row.operator_id, ["user_id", "id"]);
        const user = userById.get(operatorId);
        const operatorName = [text(user?.user_fname), text(user?.user_lname)].filter(Boolean).join(" ");
        const route = routeById.get(routeId);
        lines.push({
            label: operatorName || `Operator #${operatorId || "N/A"}`,
            operationName: text(route?.operation_name) || `Step ${text(route?.sequence_order) || "N/A"}`,
            hours,
            hourlyRate,
            amount
        });
    }
    if (!positiveHoursFound) complete = false;
    return {
        amount: complete ? roundMoney(total) : null,
        complete,
        reason: complete ? undefined : "Actual labor hours or an applicable operator rate are missing.",
        lines
    };
}

export function buildOverheadCost(
    jobOrderId: number,
    routeIdsByJobOrder: Map<number, number[]>,
    routeById: Map<number, DirectusRow>,
    workCenterById: Map<number, DirectusRow>,
    includeDetails = true
): JobOrderCostLine {
    const routeIds = routeIdsByJobOrder.get(jobOrderId) || [];
    if (routeIds.length === 0) {
        return { amount: null, complete: false, reason: "Job Order route records are missing.", lines: [] };
    }
    let total = 0;
    let complete = true;
    let positiveHoursFound = false;
    const lines: JobOrderCostLine["lines"] = [];
    for (const routeId of routeIds) {
        const route = routeById.get(routeId) || {};
        const setupValue = numberOrNull(route.actual_setup_hours);
        const runValue = numberOrNull(route.actual_run_hours);
        const hours = Math.max(0, setupValue ?? 0) + Math.max(0, runValue ?? 0);
        const workCenterId = relationId(route.work_center_id, ["work_center_id", "id"]);
        const workCenter = workCenterById.get(workCenterId);
        const hourlyRate = numberOrNull(workCenter?.overhead_cost_per_hour);
        const amount = setupValue === null && runValue === null
            ? null
            : hours > 0 && hourlyRate === null
                ? null
                : roundMoney(hours * (hourlyRate ?? 0));
        if (hours > 0) positiveHoursFound = true;
        if (amount === null) complete = false;
        else total += amount;
        if (includeDetails) {
            lines.push({
                label: text(workCenter?.work_center_name) || `Work center #${workCenterId || "N/A"}`,
                operationName: text(route.operation_name) || `Step ${text(route.sequence_order) || "N/A"}`,
                hours,
                hourlyRate,
                amount
            });
        }
    }
    if (!positiveHoursFound) complete = false;
    return {
        amount: complete ? roundMoney(total) : null,
        complete,
        reason: complete ? undefined : "Actual route hours or an applicable work-center overhead rate are missing.",
        lines
    };
}
