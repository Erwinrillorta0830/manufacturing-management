import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { buildQAYieldAssessments } from "@/app/api/manufacturing/production/_qa-accepted-output";
import { isJobOrderStatus, JOB_ORDER_STATUS, displayJobOrderStatus } from "@/modules/manufacturing-management/job-order-status";
import { parseProductionTimestamp } from "@/modules/manufacturing-management/production-workflow/operator-time";
import {
    earnedStandardLaborHours,
    laborEfficiencyPercent,
    laborProductivity,
    laborVarianceHours,
    roundHours,
    runningTimerHours
} from "@/modules/manufacturing-management/labor-efficiency-productivity-report/utils/labor-efficiency";
import type {
    ActualLaborLine,
    LaborEfficiencyFilters,
    LaborEfficiencyReportPayload,
    LaborEfficiencyRow,
    LaborEfficiencySortKey,
    LaborEfficiencySummary,
    LaborStandardLine
} from "@/modules/manufacturing-management/labor-efficiency-productivity-report/types";

type DirectusRow = Record<string, unknown>;

const PAGE_SIZE = 100;
const ID_CHUNK_SIZE = 100;
const DIRECTUS_CONCURRENCY = 4;
const INCLUDED_STATUSES = [
    JOB_ORDER_STATUS.IN_PRODUCTION,
    JOB_ORDER_STATUS.ON_HOLD,
    JOB_ORDER_STATUS.QA_HOLD,
    JOB_ORDER_STATUS.PRODUCTION_COMPLETED,
    JOB_ORDER_STATUS.FOR_QA_RECONCILIATION,
    JOB_ORDER_STATUS.CLOSED
];
const FINAL_STATUSES = [
    JOB_ORDER_STATUS.PRODUCTION_COMPLETED,
    JOB_ORDER_STATUS.FOR_QA_RECONCILIATION,
    JOB_ORDER_STATUS.CLOSED
];
const STATUS_ALIASES: Record<string, string[]> = {
    [JOB_ORDER_STATUS.IN_PRODUCTION]: [JOB_ORDER_STATUS.IN_PRODUCTION, "ongoing", "in progress", "in_progress", "in-production"],
    [JOB_ORDER_STATUS.ON_HOLD]: [JOB_ORDER_STATUS.ON_HOLD, "on_hold", "on-hold"],
    [JOB_ORDER_STATUS.QA_HOLD]: [JOB_ORDER_STATUS.QA_HOLD, "qa_hold", "qa-hold"],
    [JOB_ORDER_STATUS.PRODUCTION_COMPLETED]: [JOB_ORDER_STATUS.PRODUCTION_COMPLETED, "finished", "production_completed", "production-completed"],
    [JOB_ORDER_STATUS.FOR_QA_RECONCILIATION]: [JOB_ORDER_STATUS.FOR_QA_RECONCILIATION, "completed", "for_qa_and_reconciliation", "for-qa-and-reconciliation"],
    [JOB_ORDER_STATUS.CLOSED]: [JOB_ORDER_STATUS.CLOSED]
};
const ALLOWED_PAGE_SIZES = new Set([10, 20, 50, 100]);
const SORT_KEYS = new Set<LaborEfficiencySortKey>([
    "jobOrderNo", "productName", "branchName", "status", "goodOutputQuantity",
    "standardHours", "actualHours", "varianceHours", "efficiencyPercent", "productivity"
]);

export class ReportQueryError extends Error {}

function asRecord(value: unknown): DirectusRow | null {
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as DirectusRow : null;
}

function relationId(value: unknown, keys: string[] = ["id"]): number {
    const record = asRecord(value);
    const raw = record
        ? [...keys, "id"].map((key) => record[key]).find((candidate) => candidate !== undefined && candidate !== null)
        : value;
    const parsed = Number(raw ?? 0);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function numeric(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function nonNegative(value: unknown): number {
    return Math.max(0, numeric(value) ?? 0);
}

async function fetchRows<T extends DirectusRow>(collection: string, fields: string, query = new URLSearchParams()): Promise<T[]> {
    const rows: T[] = [];
    let offset = 0;
    while (true) {
        const params = new URLSearchParams(query);
        params.set("fields", fields);
        params.set("limit", String(PAGE_SIZE));
        params.set("offset", String(offset));
        const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params.toString()}`, { headers, cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(payload?.data)) throw new Error(`${collection} lookup failed with HTTP ${response.status}.`);
        const page = payload.data as T[];
        rows.push(...page);
        offset += page.length;
        if (page.length < PAGE_SIZE) break;
    }
    return rows;
}

function chunks(values: number[]): number[][] {
    const result: number[][] = [];
    const unique = [...new Set(values.filter((value) => value > 0))];
    for (let index = 0; index < unique.length; index += ID_CHUNK_SIZE) result.push(unique.slice(index, index + ID_CHUNK_SIZE));
    return result;
}

async function fetchRowsByIds<T extends DirectusRow>(collection: string, fields: string, field: string, values: number[]): Promise<T[]> {
    const batches = chunks(values);
    const rows: T[] = [];
    for (let index = 0; index < batches.length; index += DIRECTUS_CONCURRENCY) {
        const pages = await Promise.all(batches.slice(index, index + DIRECTUS_CONCURRENCY).map(async (ids) => {
            const params = new URLSearchParams({ [`filter[${field}][_in]`]: ids.join(","), fields, limit: "-1" });
            const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params.toString()}`, { headers, cache: "no-store" });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !Array.isArray(payload?.data)) throw new Error(`${collection} lookup failed with HTTP ${response.status}.`);
            return payload.data as T[];
        }));
        rows.push(...pages.flat());
    }
    return rows;
}

function nextDateBoundary(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ReportQueryError("Dates must use YYYY-MM-DD.");
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ReportQueryError("A date filter is invalid.");
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
}

function parseRequest(request: Request) {
    const params = new URL(request.url).searchParams;
    const filters: LaborEfficiencyFilters = {
        branchId: params.get("branchId") || "all",
        productId: params.get("productId") || "all",
        status: params.get("status") || "all",
        dateFrom: params.get("dateFrom") || "",
        dateTo: params.get("dateTo") || "",
        jobOrder: (params.get("jobOrder") || "").trim()
    };
    if (filters.jobOrder.length > 200) throw new ReportQueryError("Job Order search must be 200 characters or fewer.");
    for (const [label, value] of [["Branch", filters.branchId], ["Product", filters.productId]] as const) {
        if (value !== "all" && (!/^\d+$/.test(value) || Number(value) <= 0)) throw new ReportQueryError(`${label} filter must be a positive ID.`);
    }
    if (filters.status !== "all" && !INCLUDED_STATUSES.includes(filters.status as typeof INCLUDED_STATUSES[number])) {
        throw new ReportQueryError("The selected Job Order status is invalid.");
    }
    if (filters.dateFrom) nextDateBoundary(filters.dateFrom);
    if (filters.dateTo) nextDateBoundary(filters.dateTo);
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) throw new ReportQueryError("Start date must be on or before end date.");

    const readPositiveInt = (key: string, fallback: number) => {
        const raw = params.get(key);
        if (!raw) return fallback;
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1) throw new ReportQueryError(`${key} must be a positive integer.`);
        return Number(raw);
    };
    const page = readPositiveInt("page", 1);
    const pageSize = readPositiveInt("pageSize", 20);
    if (!ALLOWED_PAGE_SIZES.has(pageSize)) throw new ReportQueryError("Page size must be 10, 20, 50, or 100.");
    const sortKey = (params.get("sortBy") || "jobOrderNo") as LaborEfficiencySortKey;
    if (!SORT_KEYS.has(sortKey)) throw new ReportQueryError("The requested sort column is not supported.");
    const sortDirection = params.get("sortDirection") || "desc";
    if (sortDirection !== "asc" && sortDirection !== "desc") throw new ReportQueryError("Sort direction must be asc or desc.");
    return { filters, page, pageSize, sortKey, sortDirection: sortDirection as "asc" | "desc" };
}

function statusQueryValues(status: string): string[] {
    if (status !== "all") return STATUS_ALIASES[status] || [status];
    return [...new Set(Object.values(STATUS_ALIASES).flat())];
}

function jobOrderQuery(filters: LaborEfficiencyFilters): URLSearchParams {
    const params = new URLSearchParams();
    params.set("filter[status][_in]", statusQueryValues(filters.status).join(","));
    if (filters.branchId !== "all") params.set("filter[branch_id][_eq]", filters.branchId);
    if (filters.productId !== "all") params.set("filter[product_id][_eq]", filters.productId);
    if (filters.jobOrder) params.set("filter[job_order_no][_icontains]", filters.jobOrder);
    if (filters.dateFrom) params.set("filter[created_at][_gte]", filters.dateFrom);
    if (filters.dateTo) params.set("filter[created_at][_lt]", nextDateBoundary(filters.dateTo));
    params.set("sort", "-created_at,-job_order_id");
    return params;
}

function matchesFilters(row: DirectusRow, filters: LaborEfficiencyFilters): boolean {
    if (!INCLUDED_STATUSES.some((status) => isJobOrderStatus(row.status, status))) return false;
    if (filters.status !== "all" && !isJobOrderStatus(row.status, filters.status as typeof INCLUDED_STATUSES[number])) return false;
    if (filters.branchId !== "all" && String(relationId(row.branch_id, ["branch_id", "id"])) !== filters.branchId) return false;
    if (filters.productId !== "all" && String(relationId(row.product_id, ["product_id", "id"])) !== filters.productId) return false;
    if (filters.jobOrder && !String(row.job_order_no || "").toLowerCase().includes(filters.jobOrder.toLowerCase())) return false;
    const created = row.created_at ? String(row.created_at).slice(0, 10) : "";
    return (!filters.dateFrom || created >= filters.dateFrom) && (!filters.dateTo || created <= filters.dateTo);
}

function acceptedGoodOutput(yields: DirectusRow[], inspections: DirectusRow[], jobRoutes: DirectusRow[]): Map<number, number> {
    const byLedger = new Map(yields.map((row) => [relationId(row.ledger_id, ["ledger_id", "id"]), row]));
    const totals = new Map<number, number>();
    for (const assessment of buildQAYieldAssessments(yields, inspections, jobRoutes)) {
        const ledger = byLedger.get(assessment.ledgerId);
        const commitStatus = String(ledger?.commit_status || "").trim().toUpperCase();
        if ((commitStatus && commitStatus !== "COMMITTED") || assessment.qaStatus !== "Passed") continue;
        totals.set(assessment.jobOrderId, (totals.get(assessment.jobOrderId) || 0) + assessment.goodQuantity);
    }
    return totals;
}

function activeValue(value: unknown): boolean {
    if (value === undefined || value === null || value === "") return true;
    if (value === true || value === 1) return true;
    return !["0", "false", "no", "inactive"].includes(String(value).trim().toLowerCase());
}

function buildActualLines(
    operators: DirectusRow[],
    routeById: Map<number, DirectusRow>,
    usersById: Map<number, DirectusRow>,
    now: number,
    includeLines = true
): { hours: number; lines: ActualLaborLine[]; provisional: boolean; invalidTimerCount: number } {
    let hours = 0;
    let provisional = false;
    let invalidTimerCount = 0;
    const lines: ActualLaborLine[] = [];
    for (const operator of operators) {
        const loggedHours = roundHours(nonNegative(operator.logged_hours));
        const startedAt = operator.started_at ? String(operator.started_at) : "";
        const stoppedAt = operator.stopped_at ? String(operator.stopped_at) : "";
        const timerRunning = Boolean(startedAt && !stoppedAt && activeValue(operator.is_active));
        let runningHours = 0;
        if (timerRunning) {
            provisional = true;
            const parsedStart = parseProductionTimestamp(startedAt);
            if (parsedStart === null) invalidTimerCount += 1;
            else runningHours = runningTimerHours(startedAt, now) || 0;
        }
        const totalHours = roundHours(loggedHours + runningHours);
        hours += totalHours;
        if (includeLines) {
            const routeId = relationId(operator.jo_route_id, ["jo_route_id", "id"]);
            const route = routeById.get(routeId);
            const userId = relationId(operator.operator_id, ["user_id", "id"]);
            const user = usersById.get(userId);
            const operatorName = [user?.user_fname, user?.user_lname].filter(Boolean).join(" ").trim();
            lines.push({
                operatorName: operatorName || `Operator #${userId || "Unknown"}`,
                operationName: String(route?.operation_name || `Step ${route?.sequence_order || ""}`.trim()),
                loggedHours,
                runningHours,
                totalHours,
                timerRunning
            });
        }
    }
    return { hours: roundHours(hours), lines, provisional, invalidTimerCount };
}

function compareRows(left: LaborEfficiencyRow, right: LaborEfficiencyRow, key: LaborEfficiencySortKey, direction: "asc" | "desc"): number {
    const multiplier = direction === "asc" ? 1 : -1;
    const a = left[key];
    const b = right[key];
    if (typeof a === "string" && typeof b === "string") return multiplier * a.localeCompare(b);
    const leftValue = a === null ? Number.NEGATIVE_INFINITY : Number(a);
    const rightValue = b === null ? Number.NEGATIVE_INFINITY : Number(b);
    return multiplier * (leftValue - rightValue);
}

function summarize(rows: LaborEfficiencyRow[]): LaborEfficiencySummary {
    const comparable = rows.filter((row) => row.standardHours !== null && row.goodOutputQuantity > 0 && row.incompleteReasons.length === 0);
    const standardHours = roundHours(comparable.reduce((sum, row) => sum + (row.standardHours || 0), 0));
    const actualHours = roundHours(comparable.reduce((sum, row) => sum + row.actualHours, 0));
    const byUom = new Map<string, { goodOutputQuantity: number; actualHours: number }>();
    for (const row of comparable) {
        const current = byUom.get(row.uom) || { goodOutputQuantity: 0, actualHours: 0 };
        current.goodOutputQuantity += row.goodOutputQuantity;
        current.actualHours += row.actualHours;
        byUom.set(row.uom, current);
    }
    const productivityByUom = [...byUom.entries()].map(([uom, values]) => ({
        uom,
        goodOutputQuantity: values.goodOutputQuantity,
        actualHours: roundHours(values.actualHours),
        productivity: laborProductivity(values.goodOutputQuantity, values.actualHours)
    })).sort((left, right) => left.uom.localeCompare(right.uom));
    return {
        comparableCount: comparable.length,
        incompleteCount: rows.length - comparable.length,
        standardHours,
        actualHours,
        varianceHours: roundHours(actualHours - standardHours),
        efficiencyPercent: laborEfficiencyPercent(standardHours, actualHours),
        productivityByUom
    };
}

export async function buildLaborEfficiencyReportPayload(
    request: Request,
    { includeAllRows = false }: { includeAllRows?: boolean } = {}
): Promise<LaborEfficiencyReportPayload> {
    const startedAt = performance.now();
    const stageMs: Record<string, number> = {};
    const query = parseRequest(request);
    let stageStartedAt = performance.now();
    const jobOrders = (await fetchRows("manufacturing_job_orders", "job_order_id,job_order_no,product_id,branch_id,target_quantity,status,version_id,created_at", jobOrderQuery(query.filters)))
        .filter((row) => matchesFilters(row, query.filters))
        .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || ""))
            || relationId(right.job_order_id, ["job_order_id", "id"]) - relationId(left.job_order_id, ["job_order_id", "id"]));
    stageMs.jobOrders = performance.now() - stageStartedAt;
    const jobOrderIds = jobOrders.map((row) => relationId(row.job_order_id, ["job_order_id", "id"])).filter(Boolean);
    const pageCount = Math.max(1, Math.ceil(jobOrders.length / query.pageSize));
    const page = Math.min(query.page, pageCount);
    stageStartedAt = performance.now();
    const [jobRouteRows, yields, versions] = await Promise.all([
        fetchRowsByIds("manufacturing_job_order_routes", "jo_route_id,job_order_id,sequence_order,operation_id", "job_order_id", jobOrderIds),
        fetchRowsByIds("manufacturing_job_order_yield_ledger", "ledger_id,job_order_id,yield_quantity,rejected_quantity,scrap_quantity,commit_status", "job_order_id", jobOrderIds),
        fetchRowsByIds("product_manufacturing_version", "version_id,product_id,base_quantity", "version_id", jobOrders.map((row) => relationId(row.version_id, ["version_id", "id"]))).catch(() => [])
    ]);
    const ledgerIds = yields.map((row) => relationId(row.ledger_id, ["ledger_id", "id"])).filter(Boolean);
    const routeIds = jobRouteRows.map((row) => relationId(row.jo_route_id, ["jo_route_id", "id"])).filter(Boolean);
    const [inspections, operators] = await Promise.all([
        fetchRowsByIds("manufacturing_daily_qa_inspections", "ledger_id,jo_route_id,sensory_status,lab_status,action_taken,weight_check_passed", "ledger_id", ledgerIds),
        fetchRowsByIds("manufacturing_job_order_route_operators", "jo_route_operator_id,jo_route_id,operator_id,logged_hours,started_at,stopped_at,is_active", "jo_route_id", routeIds)
    ]);

    const versionIds = versions.map((row) => relationId(row.version_id, ["version_id", "id"])).filter(Boolean);
    const versionRouteRows = await fetchRowsByIds("manufacturing_routes", "route_id,version_id,sequence_order,operation_id", "version_id", versionIds).catch(() => []);
    let positions: DirectusRow[] = [];
    let positionsCollection = "product_version_positions";
    let positionsByRoute = false;
    try {
        positions = await fetchRowsByIds("product_version_positions", "id,version_id,category,manpower_count,hours_required", "version_id", versionIds);
    } catch {
        positionsCollection = "manufacturing_version_positions";
        positions = await fetchRowsByIds(positionsCollection, "id,version_id,category,manpower_count,hours_required", "version_id", versionIds).catch(() => []);
    }
    if (positions.length === 0 && versionRouteRows.length > 0) {
        positionsCollection = "manufacturing_route_positions";
        positionsByRoute = true;
        positions = await fetchRowsByIds(positionsCollection, "id,route_id,category,manpower_count,hours_required", "route_id", versionRouteRows.map((row) => relationId(row.route_id, ["route_id", "id"]))).catch(() => []);
    }
    stageMs.productionData = performance.now() - stageStartedAt;

    const productIds = [...new Set(jobOrders.map((row) => relationId(row.product_id, ["product_id", "id"])).filter(Boolean))];
    const branchIds = [...new Set(jobOrders.map((row) => relationId(row.branch_id, ["branch_id", "id"])).filter(Boolean))];
    const includeOptions = new URL(request.url).searchParams.get("includeOptions") !== "false";
    stageStartedAt = performance.now();
    const [products, branches, allProducts, allBranches] = await Promise.all([
        fetchRowsByIds("products", "product_id,product_name,product_code,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name", "product_id", productIds),
        fetchRowsByIds("branches", "id,branch_name", "id", branchIds),
        includeOptions ? fetchRows("products", "product_id,product_name,product_code") : Promise.resolve([]),
        includeOptions ? fetchRows("branches", "id,branch_name") : Promise.resolve([])
    ]);
    stageMs.dimensions = performance.now() - stageStartedAt;

    const routesByJobOrder = new Map<number, DirectusRow[]>();
    for (const route of jobRouteRows) {
        const joId = relationId(route.job_order_id, ["job_order_id", "id"]);
        if (joId) {
            const rows = routesByJobOrder.get(joId);
            if (rows) rows.push(route);
            else routesByJobOrder.set(joId, [route]);
        }
    }
    const operatorsByRoute = new Map<number, DirectusRow[]>();
    for (const operator of operators) {
        const routeId = relationId(operator.jo_route_id, ["jo_route_id", "id"]);
        const rows = operatorsByRoute.get(routeId);
        if (rows) rows.push(operator);
        else operatorsByRoute.set(routeId, [operator]);
    }
    const versionsById = new Map(versions.map((version) => [relationId(version.version_id, ["version_id", "id"]), version]));
    const positionsByVersion = new Map<number, DirectusRow[]>();
    const versionIdByRoute = new Map<number, number>();
    for (const route of versionRouteRows) {
        const versionId = relationId(route.version_id, ["version_id", "id"]);
        const routeId = relationId(route.route_id, ["route_id", "id"]);
        if (versionId && routeId) versionIdByRoute.set(routeId, versionId);
    }
    for (const position of positions) {
        const versionId = relationId(position.version_id, ["version_id", "id"])
            || versionIdByRoute.get(relationId(position.route_id, ["route_id", "id"])) || 0;
        if (versionId) {
            const rows = positionsByVersion.get(versionId);
            if (rows) rows.push(position);
            else positionsByVersion.set(versionId, [position]);
        }
    }
    const goodOutputByJobOrder = acceptedGoodOutput(yields, inspections, jobRouteRows);
    const productById = new Map(products.map((row) => [relationId(row.product_id, ["product_id", "id"]), row]));
    const branchById = new Map(branches.map((row) => [relationId(row.id), row]));
    const now = Date.now();
    stageStartedAt = performance.now();
    const reportRows: LaborEfficiencyRow[] = jobOrders.map((jobOrder) => {
        const jobOrderId = relationId(jobOrder.job_order_id, ["job_order_id", "id"]);
        const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
        const branchId = relationId(jobOrder.branch_id, ["branch_id", "id"]);
        const versionId = relationId(jobOrder.version_id, ["version_id", "id"]);
        const version = versionsById.get(versionId);
        const baseQuantity = numeric(version?.base_quantity);
        const goodOutputQuantity = roundHours(goodOutputByJobOrder.get(jobOrderId) || 0);
        const joRoutes = routesByJobOrder.get(jobOrderId) || [];
        const joRouteIds = new Set(joRoutes.map((route) => relationId(route.jo_route_id, ["jo_route_id", "id"])));
        const joOperators = [...joRouteIds].flatMap((routeId) => operatorsByRoute.get(routeId) || []);
        const actual = buildActualLines(joOperators, new Map(), new Map(), now, false);
        const rawPositions = (positionsByVersion.get(versionId) || []).filter((position) => String(position.category || "direct_labor").toLowerCase() !== "maintenance");
        const normalizedPositions = rawPositions.map((position) => ({
            hoursRequired: numeric(position.hours_required),
            manpowerCount: numeric(position.manpower_count) ?? 1
        }));
        const standardHours = baseQuantity !== null
            ? earnedStandardLaborHours(normalizedPositions, goodOutputQuantity, baseQuantity)
            : null;
        const incompleteReasons: string[] = [];
        if (!versionId || !version) incompleteReasons.push("The Job Order's linked product version could not be loaded.");
        if (!baseQuantity || baseQuantity <= 0) incompleteReasons.push("The linked version has no valid base quantity.");
        if (rawPositions.length === 0) incompleteReasons.push("No direct-labor standard positions are configured for the linked version.");
        else if (normalizedPositions.some((position) => position.hoursRequired === null || position.hoursRequired < 0 || position.manpowerCount <= 0)) {
            incompleteReasons.push("One or more direct-labor positions have missing or invalid hours/manpower standards.");
        }
        if (goodOutputQuantity <= 0) incompleteReasons.push("No QA-passed good output is recorded; earned standard hours are unavailable.");
        if (goodOutputQuantity > 0 && joOperators.length === 0) incompleteReasons.push("No operator labor time is recorded for this Job Order.");
        if (actual.invalidTimerCount > 0) incompleteReasons.push("An active operator timer has an invalid start timestamp; its elapsed hours are not included.");

        const product = productById.get(productId);
        const uomRelation = asRecord(product?.unit_of_measurement);
        const uom = String(uomRelation?.unit_shortcut || uomRelation?.unit_name || "units");
        const varianceHours = laborVarianceHours(standardHours, actual.hours);
        return {
            jobOrderId,
            jobOrderNo: String(jobOrder.job_order_no || `JO-${jobOrderId}`),
            productId,
            productName: String(product?.product_name || `Product #${productId}`),
            productCode: String(product?.product_code || ""),
            branchId: branchId || null,
            branchName: String(branchById.get(branchId)?.branch_name || (branchId ? `Branch #${branchId}` : "N/A")),
            status: displayJobOrderStatus(jobOrder.status),
            createdAt: jobOrder.created_at ? String(jobOrder.created_at) : null,
            versionId: versionId || null,
            targetQuantity: nonNegative(jobOrder.target_quantity),
            goodOutputQuantity,
            uom,
            standardHours,
            actualHours: actual.hours,
            varianceHours,
            efficiencyPercent: laborEfficiencyPercent(standardHours, actual.hours),
            productivity: laborProductivity(goodOutputQuantity, actual.hours),
            provisional: actual.provisional || !FINAL_STATUSES.some((status) => isJobOrderStatus(jobOrder.status, status)),
            incompleteReasons,
            standardLines: [],
            actualLines: []
        };
    });
    reportRows.sort((left, right) => compareRows(left, right, query.sortKey, query.sortDirection));
    const summary = summarize(reportRows);
    stageMs.calculation = performance.now() - stageStartedAt;
    const rows = includeAllRows ? reportRows : reportRows.slice((page - 1) * query.pageSize, page * query.pageSize);

    stageStartedAt = performance.now();
    const selectedJobOrderIds = new Set(rows.map((row) => row.jobOrderId));
    const selectedRoutes = jobRouteRows.filter((route) => selectedJobOrderIds.has(relationId(route.job_order_id, ["job_order_id", "id"])));
    const selectedRouteIds = new Set(selectedRoutes.map((route) => relationId(route.jo_route_id, ["jo_route_id", "id"])));
    const selectedOperators = operators.filter((operator) => selectedRouteIds.has(relationId(operator.jo_route_id, ["jo_route_id", "id"])));
    const selectedVersionIds = new Set(rows.map((row) => row.versionId).filter((id): id is number => id !== null));
    const selectedVersionRoutes = versionRouteRows.filter((route) => selectedVersionIds.has(relationId(route.version_id, ["version_id", "id"])));
    const detailPositionRouteIds = selectedVersionRoutes.map((route) => relationId(route.route_id, ["route_id", "id"])).filter(Boolean);
    const detailOperationIds = [...selectedRoutes, ...selectedVersionRoutes]
        .map((route) => relationId(route.operation_id, ["id"]))
        .filter(Boolean);
    const detailOperatorIds = [...new Set(selectedOperators.map((operator) => relationId(operator.operator_id, ["user_id", "id"])).filter(Boolean))];
    const [detailOperations, users, detailPositions] = await Promise.all([
        fetchRowsByIds("manufacturing_operations", "id,operation_name", "id", detailOperationIds).catch(() => []),
        fetchRowsByIds("user", "user_id,user_fname,user_lname", "user_id", detailOperatorIds).catch(() => []),
        positionsByRoute
            ? fetchRowsByIds(positionsCollection, "id,route_id,position_name,category,manpower_count,hours_required", "route_id", detailPositionRouteIds).catch(() => [])
            : fetchRowsByIds(positionsCollection, "id,version_id,position_name,category,manpower_count,hours_required", "version_id", [...selectedVersionIds]).catch(() => [])
    ]);
    const operationNameById = new Map(detailOperations.map((operation) => [relationId(operation.id), String(operation.operation_name || "")]));
    const routesById = new Map<number, DirectusRow>(selectedRoutes.map((route): [number, DirectusRow] => {
        const id = relationId(route.jo_route_id, ["jo_route_id", "id"]);
        return [id, { ...route, operation_name: operationNameById.get(relationId(route.operation_id, ["id"])) || "" }];
    }));
    const versionRoutesById = new Map<number, DirectusRow>(selectedVersionRoutes.map((route): [number, DirectusRow] => {
        const id = relationId(route.route_id, ["route_id", "id"]);
        return [id, { ...route, operation_name: operationNameById.get(relationId(route.operation_id, ["id"])) || "" }];
    }));
    const userById = new Map(users.map((row) => [relationId(row.user_id, ["user_id", "id"]), row]));
    const detailVersionIdByRoute = new Map(selectedVersionRoutes.map((route) => [
        relationId(route.route_id, ["route_id", "id"]),
        relationId(route.version_id, ["version_id", "id"])
    ]));
    const detailPositionsByVersion = new Map<number, DirectusRow[]>();
    for (const position of detailPositions) {
        const versionId = relationId(position.version_id, ["version_id", "id"])
            || detailVersionIdByRoute.get(relationId(position.route_id, ["route_id", "id"])) || 0;
        if (versionId) {
            const rows = detailPositionsByVersion.get(versionId);
            if (rows) rows.push(position);
            else detailPositionsByVersion.set(versionId, [position]);
        }
    }
    const detailRows = rows.map((row) => {
        const baseQuantity = numeric(versionsById.get(row.versionId || 0)?.base_quantity);
        const rawPositions = (detailPositionsByVersion.get(row.versionId || 0) || []).filter((position) => String(position.category || "direct_labor").toLowerCase() !== "maintenance");
        const standardLines: LaborStandardLine[] = rawPositions.map((position) => {
            const hoursRequired = numeric(position.hours_required);
            const manpowerCount = numeric(position.manpower_count) ?? 1;
            const valid = hoursRequired !== null && hoursRequired >= 0 && manpowerCount > 0 && baseQuantity !== null && baseQuantity > 0;
            const standardHoursPerBatch = valid ? roundHours(hoursRequired * manpowerCount) : null;
            const earned = valid && row.goodOutputQuantity > 0 ? roundHours((standardHoursPerBatch || 0) * row.goodOutputQuantity / (baseQuantity || 1)) : null;
            const route = versionRoutesById.get(relationId(position.route_id, ["route_id", "id"]));
            return {
                positionName: String(position.position_name || "Direct labor"),
                routeName: route ? String(route.operation_name || `Step ${route.sequence_order || ""}`.trim()) : "Version labor standard",
                manpowerCount,
                hoursRequired,
                standardHoursPerBatch,
                earnedStandardHours: earned
            };
        });
        const joRoutes = routesByJobOrder.get(row.jobOrderId) || [];
        const joRouteIds = new Set(joRoutes.map((route) => relationId(route.jo_route_id, ["jo_route_id", "id"])));
        const joOperators = [...joRouteIds].flatMap((routeId) => operatorsByRoute.get(routeId) || []);
        const actual = buildActualLines(joOperators, routesById, userById, now);
        return { ...row, standardLines, actualLines: actual.lines };
    });
    stageMs.pageDetails = performance.now() - stageStartedAt;

    const options = includeOptions ? {
        branches: allBranches.map((row) => ({ id: relationId(row.id), label: String(row.branch_name || `Branch #${relationId(row.id)}`) }))
            .filter((row) => row.id > 0).sort((left, right) => left.label.localeCompare(right.label)),
        products: allProducts.map((row) => {
            const id = relationId(row.product_id, ["product_id", "id"]);
            const code = String(row.product_code || "").trim();
            return { id, label: `${String(row.product_name || `Product #${id}`)}${code ? ` · ${code}` : ""}` };
        }).filter((row) => row.id > 0).sort((left, right) => left.label.localeCompare(right.label))
    } : { branches: [], products: [] };
    const totalMs = performance.now() - startedAt;
    console.info("[Labor Efficiency & Productivity Report] timings", JSON.stringify({
        jobOrderCount: jobOrders.length,
        returnedRowCount: detailRows.length,
        includeAllRows,
        stagesMs: Object.fromEntries(Object.entries(stageMs).map(([key, value]) => [key, Math.round(value)])),
        totalMs: Math.round(totalMs)
    }));
    return {
        rows: detailRows,
        ...options,
        page,
        pageSize: query.pageSize,
        totalRows: reportRows.length,
        pageCount,
        summary
    };
}
