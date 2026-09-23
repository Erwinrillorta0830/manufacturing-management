import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    buildQAYieldAssessments,
    isCancelledAllocation,
    type QAYieldAssessment
} from "@/app/api/manufacturing/production/_qa-accepted-output";
import { authorizeJobOrderProfitabilityReport } from "./auth";
import {
    buildLaborCost as calculateLaborCost,
    buildMaterialCost as calculateMaterialCost,
    buildOverheadCost as calculateOverheadCost,
    inventoryCostKey as makeInventoryCostKey,
    type JobOrderCostLine
} from "./_cost-calculations";
import { isCancelledJobOrderStatus } from "@/modules/manufacturing-management/job-order-status";
import {
    allocateOutputProportionally,
    allocatedBatchCost,
    weightedNetUnitPrice
} from "@/modules/manufacturing-management/job-order-profitability-report/utils/profitability-calculations";
import type {
    JobOrderProfitabilityFilters,
    JobOrderProfitabilityPayload,
    JobOrderProfitabilityRow,
    ProfitabilityOption
} from "@/modules/manufacturing-management/job-order-profitability-report/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DirectusRow = Record<string, unknown>;
type BatchAssessment = QAYieldAssessment & { yieldRow: DirectusRow };

const PAGE_SIZE = 100;
const ID_CHUNK_SIZE = 100;
const CONCURRENCY = 4;
class ReportQueryError extends Error {}

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

function dateOnly(value: unknown): string | null {
    const candidate = text(value);
    return candidate ? candidate.slice(0, 10) : null;
}

function normalizedBatch(value: unknown): string {
    return text(value).toUpperCase();
}

function validDate(value: string, label: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ReportQueryError(`${label} must use YYYY-MM-DD.`);
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new ReportQueryError(`${label} is not a valid date.`);
    }
    return value;
}

function requiredInteger(value: string | null, fallback: number, label: string): number {
    if (value === null || value === "") return fallback;
    if (!/^\d+$/.test(value)) throw new ReportQueryError(`${label} must be a positive integer.`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new ReportQueryError(`${label} must be a positive integer.`);
    return parsed;
}

function readRequest(request: Request) {
    const params = new URL(request.url).searchParams;
    const page = requiredInteger(params.get("page"), 1, "Page");
    const pageSize = requiredInteger(params.get("pageSize"), 20, "Page size");
    if (![10, 20, 50, 100].includes(pageSize)) {
        throw new ReportQueryError("Page size must be 10, 20, 50, or 100.");
    }
    const filters: JobOrderProfitabilityFilters = {
        search: (params.get("search") || "").trim(),
        branchId: params.get("branchId") || "all",
        productId: params.get("productId") || "all",
        status: params.get("status") || "all",
        dateFrom: params.get("dateFrom") ? validDate(params.get("dateFrom")!, "Start date") : "",
        dateTo: params.get("dateTo") ? validDate(params.get("dateTo")!, "End date") : ""
    };
    if (filters.search.length > 200) throw new ReportQueryError("Search must be 200 characters or fewer.");
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
        throw new ReportQueryError("Start date must be on or before end date.");
    }
    for (const [label, value] of [["Branch", filters.branchId], ["Product", filters.productId]] as const) {
        if (value !== "all") requiredInteger(value, 0, `${label} ID`);
    }
    if (filters.status.length > 100) throw new ReportQueryError("Status must be 100 characters or fewer.");
    const exportAll = params.get("export") === "all";
    if (params.has("export") && !exportAll) throw new ReportQueryError("Export mode is not supported.");
    return {
        page,
        pageSize,
        filters,
        exportAll,
        includeOptions: params.get("includeOptions") !== "false"
    };
}

async function fetchRows<T extends DirectusRow>(collection: string, fields: string, query = new URLSearchParams(), signal?: AbortSignal): Promise<T[]> {
    const rows: T[] = [];
    let offset = 0;
    let count: number | null = null;
    while (true) {
        const params = new URLSearchParams(query);
        params.set("fields", fields);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));
        params.set("meta", "filter_count");
        const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params.toString()}`, {
            headers,
            cache: "no-store",
            signal
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(payload?.data)) {
            throw new Error(`${collection} lookup failed with HTTP ${response.status}.`);
        }
        const pageRows = payload.data as T[];
        rows.push(...pageRows);
        const reportedCount = Number(payload.meta?.filter_count);
        if (Number.isFinite(reportedCount)) count = reportedCount;
        offset += pageRows.length;
        if (pageRows.length === 0 || (count !== null ? offset >= count : pageRows.length < PAGE_SIZE)) break;
    }
    return rows;
}

function chunks(values: number[], size = ID_CHUNK_SIZE): number[][] {
    const result: number[][] = [];
    const unique = [...new Set(values.filter((value) => Number.isSafeInteger(value) && value > 0))];
    for (let index = 0; index < unique.length; index += size) result.push(unique.slice(index, index + size));
    return result;
}

async function fetchRowsByIds<T extends DirectusRow>(
    collection: string,
    fields: string,
    field: string,
    values: number[],
    signal?: AbortSignal
): Promise<T[]> {
    const valueChunks = chunks(values);
    const rows: T[] = [];
    for (let index = 0; index < valueChunks.length; index += CONCURRENCY) {
        const group = valueChunks.slice(index, index + CONCURRENCY);
        const pages = await Promise.all(group.map(async (ids) => {
            const params = new URLSearchParams({
                [`filter[${field}][_in]`]: ids.join(","),
                fields,
                limit: "-1"
            });
            const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params.toString()}`, {
                headers,
                cache: "no-store",
                signal
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !Array.isArray(payload?.data)) {
                throw new Error(`${collection} lookup failed with HTTP ${response.status}.`);
            }
            return payload.data as T[];
        }));
        rows.push(...pages.flat());
    }
    return rows;
}

function directusId(row: DirectusRow, field: string, relationKeys: string[] = ["id"]): number {
    return relationId(row[field], relationKeys);
}

function branchQuery(filters: JobOrderProfitabilityFilters): URLSearchParams {
    const query = new URLSearchParams();
    if (filters.branchId !== "all") query.set("filter[branch_id][_eq]", filters.branchId);
    if (filters.productId !== "all") query.set("filter[product_id][_eq]", filters.productId);
    if (filters.status !== "all") query.set("filter[status][_eq]", filters.status);
    query.set("sort", "-job_order_id");
    return query;
}

function groupById(rows: DirectusRow[], field: string, relationKeys: string[] = ["id"]): Map<number, DirectusRow[]> {
    const grouped = new Map<number, DirectusRow[]>();
    for (const row of rows) {
        const id = directusId(row, field, relationKeys);
        if (!id) continue;
        const items = grouped.get(id) || [];
        items.push(row);
        grouped.set(id, items);
    }
    return grouped;
}

function buildAcceptedBatches(
    yields: DirectusRow[],
    inspections: DirectusRow[],
    routes: DirectusRow[]
): BatchAssessment[] {
    const yieldById = new Map(yields.map((row) => [directusId(row, "ledger_id", ["ledger_id", "id"]), row]));
    return buildQAYieldAssessments(yields, inspections, routes)
        .filter((assessment) => {
            const yieldRow = yieldById.get(assessment.ledgerId);
            return String(yieldRow?.commit_status || "").trim().toUpperCase() === "COMMITTED"
                && assessment.qaStatus === "Passed"
                && assessment.goodQuantity > 0;
        })
        .map((assessment) => ({ ...assessment, yieldRow: yieldById.get(assessment.ledgerId) || {} }));
}

function inventoryCostKey(lotId: number, productId: number, branchId: number, batchNo: string): string {
    return makeInventoryCostKey(lotId, productId, branchId, batchNo);
}

function buildMaterialCost(
    jobOrderId: number,
    batchNo: string,
    branchId: number,
    genealogyByJobOrderBatch: Map<string, DirectusRow[]>,
    inventoryLotsByKey: Map<string, DirectusRow[]>,
    lotNameById: Map<number, string>,
    productById: Map<number, DirectusRow>,
    includeDetails = true
) {
    return calculateMaterialCost(
        jobOrderId,
        batchNo,
        branchId,
        genealogyByJobOrderBatch,
        inventoryLotsByKey,
        lotNameById,
        productById,
        includeDetails
    );
}

type JoCostLine = JobOrderCostLine;

function buildLaborCost(
    jobOrderId: number,
    routeIdsByJobOrder: Map<number, number[]>,
    operatorsByRoute: Map<number, DirectusRow[]>,
    routeById: Map<number, DirectusRow>,
    userById: Map<number, DirectusRow>,
    includeDetails = true
): JoCostLine {
    return calculateLaborCost(jobOrderId, routeIdsByJobOrder, operatorsByRoute, routeById, userById, includeDetails);
}

function buildOverheadCost(
    jobOrderId: number,
    routeIdsByJobOrder: Map<number, number[]>,
    routeById: Map<number, DirectusRow>,
    workCenterById: Map<number, DirectusRow>,
    includeDetails = true
): JoCostLine {
    return calculateOverheadCost(jobOrderId, routeIdsByJobOrder, routeById, workCenterById, includeDetails);
}

function matchesSearch(row: JobOrderProfitabilityRow, search: string): boolean {
    if (!search) return true;
    const needle = search.toLowerCase();
    return [row.jobOrderNo, row.productName, row.productCode, row.branchName, row.status, row.batchNumber, row.lotNumber, ...row.salesOrderNumbers]
        .some((value) => value.toLowerCase().includes(needle));
}

function makeOptions(rows: DirectusRow[], idField: string, labelField: string, codeField?: string): ProfitabilityOption[] {
    return rows.map((row) => {
        const id = directusId(row, idField, [idField, "id"]);
        const name = text(row[labelField]) || `#${id}`;
        const code = codeField ? text(row[codeField]) : "";
        return { id, label: `${name}${code ? ` · ${code}` : ""}` };
    }).filter((option) => option.id > 0).sort((left, right) => left.label.localeCompare(right.label));
}

function withServerTiming(response: NextResponse, requestStarted: number, authMs: number, directusMs: number): NextResponse {
    const totalMs = performance.now() - requestStarted;
    const reportMs = Math.max(0, totalMs - authMs - directusMs);
    response.headers.set("Server-Timing", `auth;dur=${authMs.toFixed(1)}, directus;dur=${directusMs.toFixed(1)}, report;dur=${reportMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`);
    return response;
}

export async function GET(request: Request) {
    const requestStarted = performance.now();
    let authMs = 0;
    let directusMs = 0;
    try {
        const authStarted = performance.now();
        const access = await authorizeJobOrderProfitabilityReport(request.signal);
        authMs = performance.now() - authStarted;
        if (!access.ok) return withServerTiming(NextResponse.json({ error: access.error }, { status: access.status }), requestStarted, authMs, directusMs);

        const { page, pageSize, filters, exportAll, includeOptions } = readRequest(request);
        const includeDetails = exportAll;
        let directusStarted = performance.now();
        const [jobOrders, branchesForOptions, productsForOptions] = await Promise.all([
            fetchRows("manufacturing_job_orders", "job_order_id,job_order_no,product_id,branch_id,status", branchQuery(filters), request.signal),
            includeOptions ? fetchRows("branches", "id,branch_name", new URLSearchParams(), request.signal) : Promise.resolve([]),
            includeOptions ? fetchRows("products", "product_id,product_name,product_code", new URLSearchParams(), request.signal) : Promise.resolve([])
        ]);
        directusMs += performance.now() - directusStarted;
        const jobOrderIds = jobOrders.map((row) => directusId(row, "job_order_id", ["job_order_id", "id"])).filter(Boolean);
        const jobOrderById = new Map(jobOrders.map((row) => [directusId(row, "job_order_id", ["job_order_id", "id"]), row]));

        directusStarted = performance.now();
        const [yieldRows, routes, genealogy] = await Promise.all([
            fetchRowsByIds("manufacturing_job_order_yield_ledger", "ledger_id,job_order_id,yield_quantity,rejected_quantity,commit_status,lot_number,mm_lot_id,manufacturing_date", "job_order_id", jobOrderIds, request.signal),
            fetchRowsByIds("manufacturing_job_order_routes", "jo_route_id,job_order_id,sequence_order,work_center_id,actual_setup_hours,actual_run_hours", "job_order_id", jobOrderIds, request.signal),
            fetchRowsByIds("jo_material_genealogy", "job_order_id,batch_no,component_product_id,component_mm_lot_id,component_lot_id,component_batch_no,consumed_quantity", "job_order_id", jobOrderIds, request.signal)
        ]);
        directusMs += performance.now() - directusStarted;
        const ledgerIds = yieldRows.map((row) => directusId(row, "ledger_id", ["ledger_id", "id"])).filter(Boolean);
        directusStarted = performance.now();
        const [inspections, allocations] = await Promise.all([
            fetchRowsByIds("manufacturing_daily_qa_inspections", "ledger_id,jo_route_id,sensory_status,lab_status,action_taken,weight_check_passed", "ledger_id", ledgerIds, request.signal),
            (async () => {
                try {
                    return await fetchRowsByIds("manufacturing_job_order_allocations", "job_order_id,sales_order_detail_id,allocated_quantity,status", "job_order_id", jobOrderIds, request.signal);
                } catch (error) {
                    if (!(error instanceof Error) || !/HTTP (400|403)/.test(error.message)) throw error;
                    return fetchRowsByIds("manufacturing_job_order_allocations", "job_order_id,sales_order_detail_id,allocated_quantity", "job_order_id", jobOrderIds, request.signal);
                }
            })()
        ]);
        directusMs += performance.now() - directusStarted;
        const acceptedBatches = buildAcceptedBatches(yieldRows, inspections, routes);
        const acceptedJobOrderIds = [...new Set(acceptedBatches.map((row) => row.jobOrderId))];
        const activeAllocations = allocations
            .filter((row) => !isCancelledAllocation(row))
            .filter((row) => !isCancelledJobOrderStatus(jobOrderById.get(directusId(row, "job_order_id", ["job_order_id", "id"]))?.status));
        const detailIds = activeAllocations.map((row) => directusId(row, "sales_order_detail_id", ["sales_order_detail_id", "detail_id", "id"])).filter(Boolean);
        directusStarted = performance.now();
        const [details, routeOperators] = await Promise.all([
            fetchRowsByIds("sales_order_details", "detail_id,order_id,product_id,ordered_quantity,net_amount", "detail_id", detailIds, request.signal),
            fetchRowsByIds("manufacturing_job_order_route_operators", "jo_route_operator_id,jo_route_id,operator_id,logged_hours,hourly_rate", "jo_route_id", routes.map((row) => directusId(row, "jo_route_id", ["jo_route_id", "id"])), request.signal)
        ]);
        directusMs += performance.now() - directusStarted;
        const orderIds = details.map((row) => directusId(row, "order_id", ["order_id", "id"])).filter(Boolean);
        const inventoryLotIds = genealogy.map((row) =>
            directusId(row, "component_mm_lot_id", ["lot_id", "id"])
            || directusId(row, "component_lot_id", ["lot_id", "id"])
        ).filter(Boolean);
        const componentProductIds = includeDetails
            ? genealogy.map((row) => directusId(row, "component_product_id", ["product_id", "id"])).filter(Boolean)
            : [];
        const productIds = [
            ...jobOrders.map((row) => directusId(row, "product_id", ["product_id", "id"])),
            ...componentProductIds
        ];
        const branchIds = jobOrders.map((row) => directusId(row, "branch_id", ["branch_id", "id"])).filter(Boolean);
        const workCenterIds = routes.map((row) => directusId(row, "work_center_id", ["work_center_id", "id"])).filter(Boolean);
        const operatorIds = routeOperators.map((row) => directusId(row, "operator_id", ["user_id", "id"])).filter(Boolean);
        const mmLotIds = includeDetails ? inventoryLotIds : [];
        directusStarted = performance.now();
        const [products, branchRows, workCenters, users, orders, inventoryLots, mmLots] = await Promise.all([
            fetchRowsByIds("products", "product_id,product_name,product_code,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name", "product_id", productIds, request.signal),
            fetchRowsByIds("branches", "id,branch_name", "id", branchIds, request.signal),
            fetchRowsByIds("manufacturing_work_centers", includeDetails ? "work_center_id,work_center_name,overhead_cost_per_hour" : "work_center_id,overhead_cost_per_hour", "work_center_id", workCenterIds, request.signal),
            includeDetails ? fetchRowsByIds("user", "user_id,user_fname,user_lname", "user_id", operatorIds, request.signal).catch((error) => {
                if (request.signal.aborted) throw error;
                return [];
            }) : Promise.resolve([]),
            fetchRowsByIds("sales_order", "order_id,order_no", "order_id", orderIds, request.signal),
            fetchRowsByIds("mm_inventory_lots", "inventory_lot_id,lot_id,product_id,branch_id,batch_no,unit_cost", "lot_id", inventoryLotIds, request.signal),
            includeDetails ? fetchRowsByIds("mm_lots", "lot_id,lot_name", "lot_id", mmLotIds, request.signal) : Promise.resolve([])
        ]);
        directusMs += performance.now() - directusStarted;

        const routeById = new Map(routes.map((row) => [directusId(row, "jo_route_id", ["jo_route_id", "id"]), row]));
        const routeIdsByJobOrder = new Map<number, number[]>();
        for (const route of routes) {
            const joId = directusId(route, "job_order_id", ["job_order_id", "id"]);
            const routeId = directusId(route, "jo_route_id", ["jo_route_id", "id"]);
            if (!joId || !routeId) continue;
            const ids = routeIdsByJobOrder.get(joId) || [];
            ids.push(routeId);
            routeIdsByJobOrder.set(joId, ids);
        }
        const operatorsByRoute = groupById(routeOperators, "jo_route_id", ["jo_route_id", "id"]);
        const genealogyByJobOrderBatch = new Map<string, DirectusRow[]>();
        for (const row of genealogy) {
            const joId = directusId(row, "job_order_id", ["job_order_id", "id"]);
            const batch = normalizedBatch(row.batch_no);
            if (!joId || !batch) continue;
            const key = `${joId}:${batch}`;
            const items = genealogyByJobOrderBatch.get(key) || [];
            items.push(row);
            genealogyByJobOrderBatch.set(key, items);
        }
        const inventoryLotsByKey = new Map<string, DirectusRow[]>();
        for (const lot of inventoryLots) {
            const key = inventoryCostKey(
                directusId(lot, "lot_id", ["lot_id", "id"]),
                directusId(lot, "product_id", ["product_id", "id"]),
                directusId(lot, "branch_id", ["branch_id", "id"]),
                text(lot.batch_no)
            );
            const matches = inventoryLotsByKey.get(key) || [];
            matches.push(lot);
            inventoryLotsByKey.set(key, matches);
        }
        const allocationsByJobOrder = groupById(activeAllocations, "job_order_id", ["job_order_id", "id"]);
        const detailById = new Map(details.map((row) => [directusId(row, "detail_id", ["detail_id", "id"]), row]));
        const orderById = new Map(orders.map((row) => [directusId(row, "order_id", ["order_id", "id"]), row]));
        const productById = new Map(products.map((row) => [directusId(row, "product_id", ["product_id", "id"]), row]));
        const branchById = new Map(branchRows.map((row) => [directusId(row, "id"), row]));
        const workCenterById = new Map(workCenters.map((row) => [directusId(row, "work_center_id", ["work_center_id", "id"]), row]));
        const userById = new Map(users.map((row) => [directusId(row, "user_id", ["user_id", "id"]), row]));
        const lotNameById = new Map(mmLots.map((row) => [directusId(row, "lot_id", ["lot_id", "id"]), text(row.lot_name)]));

        const batchesByJobOrder = new Map<number, BatchAssessment[]>();
        for (const batch of acceptedBatches) {
            const batches = batchesByJobOrder.get(batch.jobOrderId) || [];
            batches.push(batch);
            batchesByJobOrder.set(batch.jobOrderId, batches);
        }
        const batchSharesByLedger = new Map<number, { allocatedQuantity: number; unallocatedQuantity: number }>();
        const allocationDataByJobOrder = new Map<number, {
            quantity: number;
            unitPrice: number | null;
            priceComplete: boolean;
            salesOrderNumbers: string[];
        }>();
        for (const jobOrderId of acceptedJobOrderIds) {
            const jo = jobOrderById.get(jobOrderId);
            const joProductId = directusId(jo || {}, "product_id", ["product_id", "id"]);
            const activeRows = allocationsByJobOrder.get(jobOrderId) || [];
            let quantity = 0;
            let priceComplete = activeRows.length > 0;
            const weightedLines: Array<{ allocatedQuantity: number; netUnitPrice: number }> = [];
            const salesOrderNumbers = new Set<string>();
            for (const allocation of activeRows) {
                const allocatedQuantity = nonNegative(allocation.allocated_quantity);
                const detailId = directusId(allocation, "sales_order_detail_id", ["sales_order_detail_id", "detail_id", "id"]);
                const detail = detailById.get(detailId);
                const orderedQuantity = numberOrNull(detail?.ordered_quantity);
                const netAmount = numberOrNull(detail?.net_amount);
                const detailProductId = directusId(detail || {}, "product_id", ["product_id", "id"]);
                const orderId = directusId(detail || {}, "order_id", ["order_id", "id"]);
                const orderNo = text(orderById.get(orderId)?.order_no) || (orderId ? `SO-${orderId}` : "");
                if (orderNo) salesOrderNumbers.add(orderNo);
                quantity += allocatedQuantity;
                if (allocatedQuantity <= 0 || !detail || !orderedQuantity || orderedQuantity <= 0 || netAmount === null || detailProductId !== joProductId) {
                    priceComplete = false;
                    continue;
                }
                weightedLines.push({ allocatedQuantity, netUnitPrice: netAmount / orderedQuantity });
            }
            const unitPrice = priceComplete ? weightedNetUnitPrice(weightedLines) : null;
            allocationDataByJobOrder.set(jobOrderId, {
                quantity,
                unitPrice,
                priceComplete: priceComplete && unitPrice !== null,
                salesOrderNumbers: [...salesOrderNumbers].sort((left, right) => left.localeCompare(right))
            });
            const batches = batchesByJobOrder.get(jobOrderId) || [];
            const shares = allocateOutputProportionally(batches.map((batch) => ({
                key: String(batch.ledgerId),
                goodQuantity: batch.goodQuantity
            })), quantity);
            for (const share of shares) {
                const ledgerId = Number(share.key);
                batchSharesByLedger.set(ledgerId, {
                    allocatedQuantity: share.allocatedQuantity,
                    unallocatedQuantity: share.unallocatedQuantity
                });
            }
        }

        const totalGoodByJobOrder = new Map<number, number>();
        for (const batch of acceptedBatches) {
            totalGoodByJobOrder.set(batch.jobOrderId, (totalGoodByJobOrder.get(batch.jobOrderId) || 0) + batch.goodQuantity);
        }
        const rows: JobOrderProfitabilityRow[] = [];
        for (const batch of acceptedBatches) {
            const jobOrder = jobOrderById.get(batch.jobOrderId) || {};
            const productId = directusId(jobOrder, "product_id", ["product_id", "id"]);
            const product = productById.get(productId);
            const branchIdValue = directusId(jobOrder, "branch_id", ["branch_id", "id"]);
            const branchId = branchIdValue || null;
            const branchName = text(branchById.get(branchIdValue)?.branch_name) || (branchId ? `Branch #${branchId}` : "N/A");
            const ledger = batch.yieldRow;
            const batchNumber = text(ledger.lot_number) || text(ledger.batch_no) || "N/A";
            const lotNumber = text(ledger.lot_number) || batchNumber;
            const date = dateOnly(ledger.manufacturing_date);
            const reasons: string[] = [];
            const material = buildMaterialCost(batch.jobOrderId, batchNumber, branchIdValue, genealogyByJobOrderBatch, inventoryLotsByKey, lotNameById, productById, includeDetails);
            if (!material.complete && material.reason) reasons.push(material.reason);
            const labor = buildLaborCost(batch.jobOrderId, routeIdsByJobOrder, operatorsByRoute, routeById, userById, includeDetails);
            if (!labor.complete && labor.reason) reasons.push(labor.reason);
            const overhead = buildOverheadCost(batch.jobOrderId, routeIdsByJobOrder, routeById, workCenterById, includeDetails);
            if (!overhead.complete && overhead.reason) reasons.push(overhead.reason);

            const goodForJob = totalGoodByJobOrder.get(batch.jobOrderId) || 0;
            const share = batchSharesByLedger.get(batch.ledgerId) || { allocatedQuantity: 0, unallocatedQuantity: batch.goodQuantity };
            const allocation = allocationDataByJobOrder.get(batch.jobOrderId) || {
                quantity: 0,
                unitPrice: null,
                priceComplete: false,
                salesOrderNumbers: []
            };
            if (allocation.quantity <= 0) reasons.push("No active Sales Order allocation is linked; this output has no revenue or margin.");
            else if (!allocation.priceComplete) reasons.push("One or more linked Sales Order lines are missing a usable net unit price.");
            const batchShare = goodForJob > 0 ? batch.goodQuantity / goodForJob : 0;
            const laborBatch = labor.amount === null ? null : roundMoney(labor.amount * batchShare);
            const overheadBatch = overhead.amount === null ? null : roundMoney(overhead.amount * batchShare);
            const totalBatchCogs = material.amount === null || laborBatch === null || overheadBatch === null
                ? null
                : roundMoney(material.amount + laborBatch + overheadBatch);
            const allocatedCogs = allocatedBatchCost(totalBatchCogs, batch.goodQuantity, share.allocatedQuantity);
            const unallocatedCogs = totalBatchCogs === null
                ? null
                : roundMoney(totalBatchCogs - (allocatedCogs ?? 0));
            const revenue = allocation.priceComplete && allocation.unitPrice !== null && share.allocatedQuantity > 0
                ? roundMoney(share.allocatedQuantity * allocation.unitPrice)
                : null;
            const grossProfit = revenue !== null && allocatedCogs !== null ? roundMoney(revenue - allocatedCogs) : null;
            const grossMarginPercent = revenue !== null && revenue > 0 && grossProfit !== null
                ? Math.round((grossProfit / revenue) * 10_000) / 100
                : null;
            const complete = reasons.length === 0 && grossProfit !== null;
            const uomRelation = asRecord(product?.unit_of_measurement);
            const laborLines = includeDetails ? labor.lines.map((line) => ({
                operatorName: line.label,
                operationName: line.operationName,
                hours: line.hours,
                hourlyRate: line.hourlyRate,
                batchCost: line.amount === null ? null : roundMoney(line.amount * batchShare)
            })) : [];
            const overheadLines = includeDetails ? overhead.lines.map((line) => ({
                operationName: line.operationName,
                workCenterName: line.label,
                hours: line.hours,
                hourlyRate: line.hourlyRate,
                batchCost: line.amount === null ? null : roundMoney(line.amount * batchShare)
            })) : [];
            rows.push({
                key: `${batch.jobOrderId}:${batch.ledgerId}`,
                yieldLedgerId: batch.ledgerId,
                jobOrderId: batch.jobOrderId,
                jobOrderNo: text(jobOrder.job_order_no) || `JO-${batch.jobOrderId}`,
                salesOrderNumbers: allocation.salesOrderNumbers,
                productId,
                productName: text(product?.product_name) || `Product #${productId}`,
                productCode: text(product?.product_code),
                branchId,
                branchName,
                status: text(jobOrder.status) || "Unknown",
                manufacturingDate: date,
                batchNumber,
                lotNumber,
                uom: text(uomRelation?.unit_shortcut) || text(uomRelation?.unit_name) || "units",
                goodQuantity: batch.goodQuantity,
                rejectedQuantity: batch.rejectedQuantity,
                allocatedQuantity: share.allocatedQuantity,
                unallocatedQuantity: share.unallocatedQuantity,
                directMaterialsCost: material.amount,
                directLaborCost: laborBatch,
                manufacturingOverheadCost: overheadBatch,
                totalBatchCogs,
                allocatedCogs,
                unallocatedCogs,
                revenue,
                grossProfit,
                grossMarginPercent,
                complete,
                incompleteReasons: reasons,
                ...(includeDetails ? { detail: {
                    materials: material.lines,
                    labor: laborLines,
                    overhead: overheadLines
                } } : {})
            });
        }

        const filteredRows = rows.filter((row) => {
            if (filters.dateFrom && (!row.manufacturingDate || row.manufacturingDate < filters.dateFrom)) return false;
            if (filters.dateTo && (!row.manufacturingDate || row.manufacturingDate > filters.dateTo)) return false;
            return matchesSearch(row, filters.search);
        }).sort((left, right) => String(right.manufacturingDate || "").localeCompare(String(left.manufacturingDate || ""))
            || right.jobOrderId - left.jobOrderId
            || right.yieldLedgerId - left.yieldLedgerId);

        const totalRows = filteredRows.length;
        const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
        const safePage = Math.min(page, pageCount);
        const start = exportAll ? 0 : (safePage - 1) * pageSize;
        const pageRows = exportAll ? filteredRows : filteredRows.slice(start, start + pageSize);
        const completeRows = filteredRows.filter((row) => row.complete && row.revenue !== null && row.allocatedCogs !== null);
        const totalRevenue = completeRows.reduce((sum, row) => sum + (row.revenue || 0), 0);
        const totalCogs = completeRows.reduce((sum, row) => sum + (row.allocatedCogs || 0), 0);
        const grossProfit = roundMoney(totalRevenue - totalCogs);
        const summary: JobOrderProfitabilityPayload["summary"] = {
            batchCount: totalRows,
            completeBatchCount: completeRows.length,
            incompleteBatchCount: totalRows - completeRows.length,
            revenue: roundMoney(totalRevenue),
            cogs: roundMoney(totalCogs),
            grossProfit,
            grossMarginPercent: totalRevenue > 0 ? Math.round((grossProfit / totalRevenue) * 10_000) / 100 : null,
            unallocatedOutput: roundMoney(filteredRows.reduce((sum, row) => sum + row.unallocatedQuantity, 0))
        };
        const branchOptions = includeOptions ? makeOptions(branchesForOptions, "id", "branch_name") : [];
        const productOptions = includeOptions ? makeOptions(productsForOptions, "product_id", "product_name", "product_code") : [];
        const statuses = [...new Set(jobOrders.map((row) => text(row.status)).filter(Boolean))].sort((left, right) => left.localeCompare(right));
        const payload: JobOrderProfitabilityPayload = {
            rows: pageRows,
            branches: branchOptions,
            products: productOptions,
            statuses,
            page: safePage,
            pageSize: exportAll ? totalRows : pageSize,
            totalRows,
            pageCount,
            summary
        };
        return withServerTiming(NextResponse.json({ data: payload }), requestStarted, authMs, directusMs);
    } catch (error) {
        if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
            return withServerTiming(new NextResponse(null, { status: 499 }), requestStarted, authMs, directusMs);
        }
        if (error instanceof ReportQueryError) return withServerTiming(NextResponse.json({ error: error.message }, { status: 400 }), requestStarted, authMs, directusMs);
        console.error("[Job Order Profitability] Failed to load report:", error);
        return withServerTiming(NextResponse.json({
            error: error instanceof Error ? error.message : "Failed to load the Job Order Profitability Report."
        }, { status: 503 }), requestStarted, authMs, directusMs);
    }
}
