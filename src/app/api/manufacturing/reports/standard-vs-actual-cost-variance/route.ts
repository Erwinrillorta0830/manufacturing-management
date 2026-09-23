import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getBOMDetailsForVersion } from "@/app/api/manufacturing/finished-goods/versions/versions-helper";
import { buildQAYieldAssessments } from "@/app/api/manufacturing/production/_qa-accepted-output";
import { calculateProductionMetrics } from "@/modules/manufacturing-management/planning-engineering/utils/production-metrics";
import { calculateRecipeMaterialCostPerUnit } from "@/modules/manufacturing-management/planning-engineering/utils/cogs-helper";
import { displayJobOrderStatus, isJobOrderStatus, JOB_ORDER_STATUS } from "@/modules/manufacturing-management/job-order-status";
import type { VersionOverheadItem } from "@/modules/manufacturing-management/finished-goods-master/types";
import { combineCostComparisons, compareCost, roundCost } from "@/modules/manufacturing-management/standard-vs-actual-cost-variance/utils/cost-variance";
import { authorizeStandardVsActualCostVarianceReport } from "./auth";
import type {
    CostVarianceOption,
    LaborCostLine,
    MaterialConsumptionLine,
    OverheadCostLine,
    StandardVsActualCostRow
} from "@/modules/manufacturing-management/standard-vs-actual-cost-variance/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DirectusRow = Record<string, unknown>;
type StandardCosts = { material: number; labor: number; overhead: number };
type StandardRoute = {
    sequence_order: number;
    setup_time_hours: number;
    run_time_hours: number;
    step_batch_size?: number;
    work_center_overhead_cost_per_hour: number;
};
type StandardCostContext = {
    baseQuantity: number;
    targetUomId: number | null;
    baseUomId: number | null;
    routes: StandardRoute[];
    bomItems: Array<{ quantity_required: number; wastage_factor_percentage: number; cost_per_unit: number }>;
    laborPositions: DirectusRow[];
    overheadItems: VersionOverheadItem[];
    customOverhead: number | null;
    expectedYieldPercentage: number | null;
    materialCostPerUnit: number;
};

type ReportFilters = {
    branchId: string;
    productId: string;
    status: string;
    dateFrom: string;
    dateTo: string;
    jobOrder: string;
};

type ReportSummary = {
    comparableCount: number;
    incompleteCount: number;
    standard: number;
    actual: number;
    variance: number;
};

const DIRECTUS_PAGE_SIZE = 100;
const DIRECTUS_ID_CHUNK_SIZE = 100;
const DIRECTUS_CONCURRENCY = 4;
const REPORTABLE_STATUS_VALUES: Record<string, string[]> = {
    [JOB_ORDER_STATUS.IN_PRODUCTION]: [JOB_ORDER_STATUS.IN_PRODUCTION, "ongoing", "in progress", "in_progress", "in-production"],
    [JOB_ORDER_STATUS.ON_HOLD]: [JOB_ORDER_STATUS.ON_HOLD, "on_hold", "on-hold"],
    [JOB_ORDER_STATUS.QA_HOLD]: [JOB_ORDER_STATUS.QA_HOLD, "qa_hold", "qa-hold"],
    [JOB_ORDER_STATUS.PRODUCTION_COMPLETED]: [JOB_ORDER_STATUS.PRODUCTION_COMPLETED, "finished", "production_completed", "production-completed"],
    [JOB_ORDER_STATUS.FOR_QA_RECONCILIATION]: [JOB_ORDER_STATUS.FOR_QA_RECONCILIATION, "completed", "for_qa_and_reconciliation", "for-qa-and-reconciliation"],
    [JOB_ORDER_STATUS.CLOSED]: [JOB_ORDER_STATUS.CLOSED]
};

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

function relationId(value: unknown, keys: string[] = ["id"]): number {
    if (value === null || value === undefined || value === "") return 0;
    const raw = typeof value === "object"
        ? keys.map((key) => (value as DirectusRow)[key]).find((candidate) => candidate !== undefined && candidate !== null)
        : value;
    const parsed = Number(raw);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function numberOrNull(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function nonNegative(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

async function fetchRows<T extends DirectusRow>(collection: string, fields: string, query = new URLSearchParams()): Promise<T[]> {
    const rows: T[] = [];
    let offset = 0;
    let totalCount: number | null = null;

    do {
        const params = new URLSearchParams(query);
        params.set("fields", fields);
        params.set("limit", String(DIRECTUS_PAGE_SIZE));
        params.set("offset", String(offset));
        params.set("meta", "filter_count");
        const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params.toString()}`, { headers, cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(payload?.data)) {
            throw new Error(`${collection} lookup failed with HTTP ${response.status}.`);
        }

        rows.push(...payload.data as T[]);
        const count = Number(payload.meta?.filter_count);
        if (Number.isFinite(count)) totalCount = count;
        offset += payload.data.length;
        if (payload.data.length === 0 || (totalCount !== null ? offset >= totalCount : payload.data.length < DIRECTUS_PAGE_SIZE)) break;
    } while (true);

    return rows;
}

function chunkValues(values: number[], size = DIRECTUS_ID_CHUNK_SIZE): number[][] {
    const chunks: number[][] = [];
    for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
    return chunks;
}

async function fetchRowsByIds<T extends DirectusRow>(
    collection: string,
    fields: string,
    field: string,
    values: number[]
): Promise<T[]> {
    const chunks = chunkValues([...new Set(values.filter((value) => value > 0))]);
    const rows: T[] = [];
    for (let index = 0; index < chunks.length; index += DIRECTUS_CONCURRENCY) {
        const batch = chunks.slice(index, index + DIRECTUS_CONCURRENCY);
        const result = await Promise.all(batch.map((ids) => {
            const query = new URLSearchParams();
            query.set(`filter[${field}][_in]`, ids.join(","));
            query.set("fields", fields);
            query.set("limit", "-1");
            return fetch(`${DIRECTUS_URL}/items/${collection}?${query.toString()}`, { headers, cache: "no-store" })
                .then(async (response) => {
                    const payload = await response.json().catch(() => null);
                    if (!response.ok || !Array.isArray(payload?.data)) {
                        throw new Error(`${collection} lookup failed with HTTP ${response.status}.`);
                    }
                    return payload.data as T[];
                });
        }));
        rows.push(...result.flat());
    }
    return rows;
}

function reportStatusFilterValues(status: string): string[] {
    if (status !== "all") return REPORTABLE_STATUS_VALUES[status] || [status];
    return [...new Set(Object.values(REPORTABLE_STATUS_VALUES).flat())];
}

function nextDateBoundary(date: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) throw new Error("Date filters must use YYYY-MM-DD.");
    const boundary = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (boundary.toISOString().slice(0, 10) !== date) throw new Error("Date filter is invalid.");
    boundary.setUTCDate(boundary.getUTCDate() + 1);
    return boundary.toISOString().slice(0, 10);
}

function buildJobOrderQuery(filters: ReportFilters): URLSearchParams {
    const query = new URLSearchParams();
    query.set("filter[status][_in]", reportStatusFilterValues(filters.status).join(","));
    if (filters.branchId !== "all") query.set("filter[branch_id][_eq]", filters.branchId);
    if (filters.productId !== "all") query.set("filter[product_id][_eq]", filters.productId);
    if (filters.jobOrder.trim()) query.set("filter[job_order_no][_icontains]", filters.jobOrder.trim());
    if (filters.dateFrom) {
        nextDateBoundary(filters.dateFrom);
        query.set("filter[created_at][_gte]", filters.dateFrom);
    }
    if (filters.dateTo) query.set("filter[created_at][_lt]", nextDateBoundary(filters.dateTo));
    query.set("sort", "-created_at,-job_order_id");
    return query;
}

function matchesReportFilters(jobOrder: DirectusRow, filters: ReportFilters): boolean {
    if (!isReportableStatus(jobOrder.status)) return false;
    if (filters.status !== "all" && !isJobOrderStatus(jobOrder.status, filters.status as typeof INCLUDED_STATUSES[number])) return false;
    if (filters.branchId !== "all" && String(relationId(jobOrder.branch_id, ["branch_id", "id"])) !== filters.branchId) return false;
    if (filters.productId !== "all" && String(relationId(jobOrder.product_id, ["product_id", "id"])) !== filters.productId) return false;
    if (filters.jobOrder.trim() && !String(jobOrder.job_order_no || "").toLowerCase().includes(filters.jobOrder.trim().toLowerCase())) return false;
    const createdDate = jobOrder.created_at ? String(jobOrder.created_at).slice(0, 10) : "";
    if (filters.dateFrom && (!createdDate || createdDate < filters.dateFrom)) return false;
    if (filters.dateTo && (!createdDate || createdDate > filters.dateTo)) return false;
    return true;
}

function lookupRelationLabel(value: unknown, preferredKeys: string[]): string {
    if (value && typeof value === "object") {
        const record = value as DirectusRow;
        for (const key of preferredKeys) {
            if (record[key] !== undefined && record[key] !== null && String(record[key]).trim()) {
                return String(record[key]).trim();
            }
        }
    }
    return "";
}

function sumGoodOutputByJobOrder(yields: DirectusRow[], inspections: DirectusRow[], routes: DirectusRow[]): Map<number, number> {
    const assessments = buildQAYieldAssessments(yields, inspections, routes);
    const yieldsByLedgerId = new Map<number, DirectusRow>(yields.map((row) => [
        relationId(row.ledger_id),
        row
    ]));
    const totals = new Map<number, number>();

    for (const assessment of assessments) {
        const yieldRow = yieldsByLedgerId.get(assessment.ledgerId);
        const commitStatus = String(yieldRow?.commit_status ?? "").trim().toUpperCase();
        if ((commitStatus && commitStatus !== "COMMITTED") || assessment.qaStatus !== "Passed") continue;
        totals.set(assessment.jobOrderId, (totals.get(assessment.jobOrderId) || 0) + assessment.goodQuantity);
    }

    return totals;
}

async function loadStandardContext(
    jobOrder: DirectusRow,
    product: DirectusRow | undefined,
    workCenterById: Map<number, DirectusRow>
): Promise<StandardCostContext | null> {
    try {
        const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
        const versionId = relationId(jobOrder.version_id, ["version_id", "id"]);
        if (!productId || !versionId) return null;

        const details = await getBOMDetailsForVersion(productId, versionId);
        const version = details.version as (DirectusRow & { routes?: DirectusRow[] }) | null;
        if (!version || nonNegative(version.base_quantity) <= 0) return null;

        const routes = details.routes || [];
        const bomItems = (version.bom_items as DirectusRow[] | undefined)
            || routes.flatMap((route) => Array.isArray(route.bom_items) ? route.bom_items : []);
        if (bomItems.length === 0 || bomItems.some((item) => item.cost_per_unit === null || item.cost_per_unit === undefined)) return null;

        const materialCostPerUnit = calculateRecipeMaterialCostPerUnit(bomItems.map((item) => ({
            quantity_required: Number(item.quantity_required || 0),
            wastage_factor_percentage: Number(item.wastage_factor_percentage || 0),
            cost_per_unit: Number(item.cost_per_unit || 0)
        })));
        const productUomId = relationId(product?.unit_of_measurement, ["unit_id", "id"]);
        const standardRoutes = routes.map((route) => {
                const workCenterId = relationId(route.work_center_id, ["work_center_id", "id"]);
                const workCenter = workCenterById.get(workCenterId);
                return {
                    sequence_order: Number(route.sequence_order || 0),
                    setup_time_hours: Number(route.setup_time_hours || 0),
                    run_time_hours: Number(route.run_time_hours || 0),
                    step_batch_size: route.step_batch_size == null ? undefined : Number(route.step_batch_size),
                    work_center_overhead_cost_per_hour: Number(
                        lookupRelationLabel(route.work_center_id, ["overhead_cost_per_hour"])
                        || workCenter?.overhead_cost_per_hour
                        || 0
                    )
                };
            });

        return {
            baseQuantity: Number(version.base_quantity),
            targetUomId: productUomId || null,
            baseUomId: relationId(version.uom_id, ["unit_id", "id"]) || null,
            routes: standardRoutes,
            bomItems: bomItems.map((item) => ({
                quantity_required: Number(item.quantity_required || 0),
                wastage_factor_percentage: Number(item.wastage_factor_percentage || 0),
                cost_per_unit: Number(item.cost_per_unit || 0)
            })),
            laborPositions: Array.isArray(version.labor_positions) ? version.labor_positions as DirectusRow[] : [],
            overheadItems: Array.isArray(version.overhead_items)
                ? version.overhead_items.map((item: DirectusRow) => ({
                    id: String(item.id ?? ""),
                    overhead_type_id: relationId(item.overhead_type_id) || undefined,
                    overhead_name: String(item.overhead_name ?? item.remarks ?? "Overhead Item"),
                    cost_per_unit: Number(item.cost_per_unit ?? item.cost ?? 0),
                    is_active: item.is_active !== false
                        && item.is_active !== 0
                        && item.is_active !== "0"
                        && item.is_active !== "false",
                    remarks: String(item.remarks ?? "")
                }))
                : [],
            customOverhead: numberOrNull(version.custom_overhead),
            expectedYieldPercentage: numberOrNull(version.expected_yield_percentage),
            materialCostPerUnit
        };
    } catch (error) {
        console.error(`[Standard vs Actual Cost Variance] Standard costs unavailable for JO ${jobOrder.job_order_no}:`, error);
        return null;
    }
}

function readDirectusBoolean(value: unknown, fallback: boolean): boolean {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const normalized = String(value).trim().toLowerCase();
    if (["false", "0", "no", "off", "inactive"].includes(normalized)) return false;
    if (["true", "1", "yes", "on", "active"].includes(normalized)) return true;
    return fallback;
}

function mapVersionPosition(item: DirectusRow, versionId: number): DirectusRow {
    return {
        id: item.id,
        version_id: versionId,
        position_id: item.position_id == null ? null : Number(item.position_id),
        position_name: String(item.position_name || "Operator"),
        category: item.category === "maintenance" ? "maintenance" : "direct_labor",
        manpower_count: Number(item.manpower_count || 1),
        hourly_rate: Number(item.hourly_rate || 0),
        hours_required: item.hours_required == null ? undefined : Number(item.hours_required),
        daily_rate: item.daily_rate == null ? undefined : Number(item.daily_rate),
        ot_hours: item.ot_hours == null ? 0 : Number(item.ot_hours),
        include_mandates: readDirectusBoolean(item.include_mandates, true),
        sss_amount: item.sss_amount == null ? undefined : Number(item.sss_amount),
        phic_amount: item.phic_amount == null ? undefined : Number(item.phic_amount),
        hdmf_amount: item.hdmf_amount == null ? undefined : Number(item.hdmf_amount)
    };
}

async function loadStandardContexts(
    jobOrders: DirectusRow[],
    productsById: Map<number, DirectusRow>,
    workCenterById: Map<number, DirectusRow>
): Promise<Map<string, StandardCostContext | null>> {
    const uniqueJobOrders = new Map<string, DirectusRow>();
    for (const jobOrder of jobOrders) {
        const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
        const versionId = relationId(jobOrder.version_id, ["version_id", "id"]);
        if (productId && versionId) uniqueJobOrders.set(`${productId}:${versionId}`, jobOrder);
    }
    const pairs = [...uniqueJobOrders.entries()];
    const versionIds = [...new Set(pairs.map(([key]) => Number(key.split(":")[1])))];

    const loadLegacyContexts = async () => {
        const contexts = new Map<string, StandardCostContext | null>();
        for (let index = 0; index < pairs.length; index += DIRECTUS_CONCURRENCY) {
            const batch = pairs.slice(index, index + DIRECTUS_CONCURRENCY);
            const values = await Promise.all(batch.map(([, jobOrder]) => {
                const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
                return loadStandardContext(jobOrder, productsById.get(productId), workCenterById);
            }));
            batch.forEach(([key], offset) => contexts.set(key, values[offset]));
        }
        return contexts;
    };

    if (pairs.length === 0) return new Map();

    let versions: DirectusRow[];
    let routes: DirectusRow[];
    try {
        [versions, routes] = await Promise.all([
            fetchRowsByIds("product_manufacturing_version", "version_id,product_id,base_quantity,uom_id,custom_overhead,expected_yield_percentage", "version_id", versionIds),
            fetchRowsByIds("manufacturing_routes", "route_id,version_id,sequence_order,setup_time_hours,run_time_hours,step_batch_size,work_center_id", "version_id", versionIds)
        ]);
    } catch (error) {
        console.warn("[Standard vs Actual Cost Variance] Bulk standard lookup failed; using version resolver.", error);
        return loadLegacyContexts();
    }

    const versionById = new Map(versions.map((version) => [relationId(version.version_id, ["version_id", "id"]), version]));
    const routesByVersion = new Map<number, DirectusRow[]>();
    const versionIdByRouteId = new Map<number, number>();
    for (const route of routes) {
        const versionId = relationId(route.version_id, ["version_id", "id"]);
        const routeId = relationId(route.route_id, ["route_id", "id"]);
        if (!versionId || !routeId) continue;
        const rows = routesByVersion.get(versionId) || [];
        rows.push(route);
        routesByVersion.set(versionId, rows);
        versionIdByRouteId.set(routeId, versionId);
    }
    const routeIds = [...versionIdByRouteId.keys()];
    let bomRows: DirectusRow[];
    try {
        bomRows = await fetchRowsByIds(
            "manufacturing_routes_bom",
            "id,route_id,product_id,quantity_required,wastage_factor_percentage,cost_per_unit",
            "route_id",
            routeIds
        );
    } catch (error) {
        console.warn("[Standard vs Actual Cost Variance] Bulk BOM lookup failed; using version resolver.", error);
        return loadLegacyContexts();
    }

    const overheadRows = await fetchRowsByIds(
        "product_version_overheads",
        "id,version_id,overhead_type_id,cost,is_active,remarks",
        "version_id",
        versionIds
    ).catch(() => []);
    const overheadTypeIds = [...new Set(overheadRows.map((item) => relationId(item.overhead_type_id)).filter(Boolean))];
    const overheadTypes = await fetchRowsByIds("overhead_types", "id,overhead_name", "id", overheadTypeIds).catch(() => []);
    const overheadNameById = new Map(overheadTypes.map((item) => [relationId(item.id), String(item.overhead_name || "")]));

    let versionPositions: DirectusRow[];
    try {
        versionPositions = await fetchRowsByIds(
            "product_version_positions",
            "id,version_id,position_id,position_name,category,manpower_count,hourly_rate,hours_required,daily_rate,ot_hours,include_mandates,sss_amount,phic_amount,hdmf_amount",
            "version_id",
            versionIds
        );
    } catch {
        versionPositions = await fetchRowsByIds(
            "manufacturing_version_positions",
            "id,version_id,position_id,position_name,category,manpower_count,hourly_rate,hours_required,daily_rate,ot_hours,include_mandates,sss_amount,phic_amount,hdmf_amount",
            "version_id",
            versionIds
        ).catch(() => []);
    }
    if (versionPositions.length === 0 && routeIds.length > 0) {
        versionPositions = await fetchRowsByIds(
            "manufacturing_route_positions",
            "id,route_id,position_id,position_name,category,manpower_count,hourly_rate,hours_required,daily_rate,ot_hours,include_mandates,sss_amount,phic_amount,hdmf_amount",
            "route_id",
            routeIds
        ).catch(() => []);
    }

    const bomRowsByVersion = new Map<number, DirectusRow[]>();
    for (const bomRow of bomRows) {
        const versionId = versionIdByRouteId.get(relationId(bomRow.route_id, ["route_id", "id"]));
        if (!versionId) continue;
        const rows = bomRowsByVersion.get(versionId) || [];
        rows.push(bomRow);
        bomRowsByVersion.set(versionId, rows);
    }
    const positionsByVersion = new Map<number, DirectusRow[]>();
    for (const position of versionPositions) {
        const versionId = relationId(position.version_id, ["version_id", "id"])
            || versionIdByRouteId.get(relationId(position.route_id, ["route_id", "id"]));
        if (!versionId) continue;
        const rows = positionsByVersion.get(versionId) || [];
        rows.push(mapVersionPosition(position, versionId));
        positionsByVersion.set(versionId, rows);
    }
    const overheadsByVersion = new Map<number, VersionOverheadItem[]>();
    for (const item of overheadRows) {
        const versionId = relationId(item.version_id, ["version_id", "id"]);
        const overheadTypeId = relationId(item.overhead_type_id);
        if (!versionId) continue;
        const rows = overheadsByVersion.get(versionId) || [];
        rows.push({
            id: String(item.id ?? ""),
            overhead_type_id: overheadTypeId || undefined,
            overhead_name: overheadNameById.get(overheadTypeId) || String(item.remarks || "Overhead Item"),
            cost_per_unit: Number(item.cost ?? item.cost_per_unit ?? 0),
            is_active: readDirectusBoolean(item.is_active, true),
            remarks: String(item.remarks || "")
        });
        overheadsByVersion.set(versionId, rows);
    }

    const contexts = new Map<string, StandardCostContext | null>();
    for (const [key, jobOrder] of pairs) {
        const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
        const versionId = relationId(jobOrder.version_id, ["version_id", "id"]);
        const version = versionById.get(versionId);
        if (!version) {
            contexts.set(key, await loadStandardContext(jobOrder, productsById.get(productId), workCenterById));
            continue;
        }

        const versionRoutes = routesByVersion.get(versionId) || [];
        const versionBOM = bomRowsByVersion.get(versionId) || [];
        const versionLabor = positionsByVersion.get(versionId) || [];
        if (nonNegative(version.base_quantity) <= 0 || versionBOM.length === 0 || versionBOM.some((item) => item.cost_per_unit == null)) {
            contexts.set(key, null);
            continue;
        }

        const bomItems = versionBOM.map((item) => ({
            quantity_required: Number(item.quantity_required || 0),
            wastage_factor_percentage: Number(item.wastage_factor_percentage || 0),
            cost_per_unit: Number(item.cost_per_unit || 0)
        }));
        const standardRoutes = versionRoutes.map((route) => {
            const workCenterId = relationId(route.work_center_id, ["work_center_id", "id"]);
            const workCenter = workCenterById.get(workCenterId);
            return {
                sequence_order: Number(route.sequence_order || 0),
                setup_time_hours: Number(route.setup_time_hours || 0),
                run_time_hours: Number(route.run_time_hours || 0),
                step_batch_size: route.step_batch_size == null ? undefined : Number(route.step_batch_size),
                work_center_overhead_cost_per_hour: Number(
                    lookupRelationLabel(route.work_center_id, ["overhead_cost_per_hour"])
                    || workCenter?.overhead_cost_per_hour
                    || 0
                )
            };
        });
        const product = productsById.get(productId);
        contexts.set(key, {
            baseQuantity: Number(version.base_quantity),
            targetUomId: relationId(product?.unit_of_measurement, ["unit_id", "id"]) || null,
            baseUomId: relationId(version.uom_id, ["unit_id", "id"]) || null,
            routes: standardRoutes,
            bomItems,
            laborPositions: versionLabor,
            overheadItems: overheadsByVersion.get(versionId) || [],
            customOverhead: numberOrNull(version.custom_overhead ?? 0),
            expectedYieldPercentage: numberOrNull(version.expected_yield_percentage),
            materialCostPerUnit: calculateRecipeMaterialCostPerUnit(bomItems)
        });
    }
    return contexts;
}

function calculateStandardCosts(context: StandardCostContext | null, goodOutputQuantity: number): StandardCosts | null {
    if (!context) return null;
    try {
        const metrics = calculateProductionMetrics({
            targetQuantity: goodOutputQuantity > 0 ? goodOutputQuantity : context.baseQuantity,
            baseQuantity: context.baseQuantity,
            targetUomId: context.targetUomId,
            baseUomId: context.baseUomId,
            routes: context.routes,
            bomItems: context.bomItems,
            laborPositions: context.laborPositions,
            overheadItems: context.overheadItems,
            customOverhead: context.customOverhead,
            expectedYieldPercentage: context.expectedYieldPercentage,
            materialCostPerUnit: context.materialCostPerUnit
        });
        return {
            material: roundCost(metrics.cogsBreakdown.materialCostPerUnit * goodOutputQuantity),
            labor: roundCost(metrics.cogsBreakdown.directLaborCostPerUnit * goodOutputQuantity),
            overhead: roundCost(metrics.cogsBreakdown.factoryOverheadCostPerUnit * goodOutputQuantity)
        };
    } catch {
        return null;
    }
}

function buildActualMaterials(
    jobOrderId: number,
    jobMaterials: DirectusRow[],
    reservations: DirectusRow[],
    inventoryLots: DirectusRow[],
    productsById: Map<number, DirectusRow>,
    includeDetails = true
): { amount: number | null; lines: MaterialConsumptionLine[]; complete: boolean } {
    const materialById = new Map(jobMaterials.map((row) => [
        relationId(row.jo_material_id, ["jo_material_id", "id"]),
        row
    ]));
    const lotsById = new Map(inventoryLots.map((row) => [
        relationId(row.inventory_lot_id, ["inventory_lot_id", "id"]),
        row
    ]));
    const consumedByMaterial = new Map<number, number>();
    let total = 0;
    let complete = true;
    const lines: MaterialConsumptionLine[] = [];

    for (const reservation of reservations) {
        const joMaterialId = relationId(reservation.jo_material_id, ["jo_material_id", "id"]);
        const material = materialById.get(joMaterialId);
        if (relationId(material?.job_order_id, ["job_order_id", "id"]) !== jobOrderId) continue;

        const usedQuantity = nonNegative(reservation.actual_used_quantity);
        consumedByMaterial.set(joMaterialId, (consumedByMaterial.get(joMaterialId) || 0) + usedQuantity);
        if (usedQuantity <= 0) continue;

        const inventoryLotId = relationId(reservation.inventory_lot_id, ["inventory_lot_id", "id"]);
        const lot = lotsById.get(inventoryLotId);
        const productId = relationId(reservation.product_id, ["product_id", "id"])
            || relationId(material?.product_id, ["product_id", "id"]);
        const product = productsById.get(productId);
        const unitCost = numberOrNull(lot?.unit_cost);
        const actualCost = unitCost === null ? null : roundCost(usedQuantity * unitCost);
        if (actualCost === null) complete = false;
        else total += actualCost;

        if (includeDetails) {
            lines.push({
                productId,
                productName: String(product?.product_name || `Product #${productId}`),
                lotNumber: String(reservation.batch_no || lot?.batch_no || `Inventory lot #${inventoryLotId || "N/A"}`),
                consumedQuantity: usedQuantity,
                currentUnitCost: unitCost,
                actualCost
            });
        }
    }

    for (const [joMaterialId, material] of materialById) {
        const recordedConsumed = nonNegative(material.actual_consumed_quantity);
        const reservationConsumed = consumedByMaterial.get(joMaterialId) || 0;
        if (recordedConsumed > reservationConsumed + 0.000001) complete = false;
    }

    return { amount: complete ? roundCost(total) : null, lines, complete };
}

function buildActualLabor(
    jobOrderId: number,
    jobRoutes: DirectusRow[],
    operatorRows: DirectusRow[],
    usersById: Map<number, DirectusRow>,
    includeDetails = true
): { amount: number | null; lines: LaborCostLine[]; complete: boolean } {
    const jobRouteIds = new Set(jobRoutes.map((route) => relationId(route.jo_route_id, ["jo_route_id", "id"])));
    const routeById = new Map(jobRoutes.map((route) => [relationId(route.jo_route_id, ["jo_route_id", "id"]), route]));
    const lines: LaborCostLine[] = [];
    let total = 0;
    let complete = true;

    for (const record of operatorRows) {
        const routeId = relationId(record.jo_route_id, ["jo_route_id", "id"]);
        if (!jobRouteIds.has(routeId)) continue;
        const hours = nonNegative(record.logged_hours);
        const hourlyRate = numberOrNull(record.hourly_rate);
        const actualCost = hours <= 0 ? 0 : hourlyRate === null ? null : roundCost(hours * hourlyRate);
        if (hours > 0 && actualCost === null) complete = false;
        if (actualCost !== null) total += actualCost;

        const route = routeById.get(routeId);
        const operatorId = relationId(record.operator_id, ["user_id", "id"]);
        const user = usersById.get(operatorId);
        const fullName = [user?.user_fname, user?.user_lname].filter(Boolean).join(" ").trim();
        if (includeDetails) {
            lines.push({
                operatorName: fullName || `Operator #${operatorId}`,
                operationName: String(route?.operation_name || `Step ${route?.sequence_order || ""}`.trim()),
                hours,
                hourlyRate,
                actualCost
            });
        }
    }

    return { amount: complete ? roundCost(total) : null, lines, complete };
}

function buildActualOverhead(
    jobRoutes: DirectusRow[],
    workCenterById: Map<number, DirectusRow>,
    includeDetails = true
): { amount: number | null; lines: OverheadCostLine[]; complete: boolean } {
    const lines: OverheadCostLine[] = [];
    let total = 0;
    let complete = true;

    for (const route of jobRoutes) {
        const hours = nonNegative(route.actual_setup_hours) + nonNegative(route.actual_run_hours);
        const workCenterId = relationId(route.work_center_id, ["work_center_id", "id"]);
        const workCenter = workCenterById.get(workCenterId);
        const hourlyRate = numberOrNull(workCenter?.overhead_cost_per_hour);
        const actualCost = hours <= 0 ? 0 : hourlyRate === null ? null : roundCost(hours * hourlyRate);
        if (hours > 0 && actualCost === null) complete = false;
        if (actualCost !== null) total += actualCost;

        if (includeDetails) {
            lines.push({
                operationName: String(route.operation_name || `Step ${route.sequence_order || ""}`.trim()),
                workCenterName: String(workCenter?.work_center_name || `Work center #${workCenterId || "N/A"}`),
                hours,
                hourlyRate,
                actualCost
            });
        }
    }

    return { amount: complete ? roundCost(total) : null, lines, complete };
}

function isReportableStatus(status: unknown): boolean {
    return INCLUDED_STATUSES.some((candidate) => isJobOrderStatus(status, candidate));
}

function numericQueryValue(value: string | null, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: Request) {
    const access = await authorizeStandardVsActualCostVarianceReport();
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const requestStarted = performance.now();
    try {
        const searchParams = new URL(request.url).searchParams;
        const statusValues = ["all", ...Object.keys(REPORTABLE_STATUS_VALUES)];
        const filters: ReportFilters = {
            branchId: searchParams.get("branchId") || "all",
            productId: searchParams.get("productId") || "all",
            status: searchParams.get("status") || "all",
            dateFrom: searchParams.get("dateFrom") || "",
            dateTo: searchParams.get("dateTo") || "",
            jobOrder: searchParams.get("jobOrder") || ""
        };
        if (!statusValues.includes(filters.status)) {
            return NextResponse.json({ error: "The selected Job Order status is invalid." }, { status: 400 });
        }
        for (const [label, value] of [["Branch", filters.branchId], ["Product", filters.productId]] as const) {
            if (value !== "all" && (!/^\d+$/.test(value) || Number(value) <= 0)) {
                return NextResponse.json({ error: `${label} filter must be a positive ID.` }, { status: 400 });
            }
        }
        try {
            if (filters.dateFrom) nextDateBoundary(filters.dateFrom);
            if (filters.dateTo) nextDateBoundary(filters.dateTo);
        } catch (error) {
            return NextResponse.json({ error: error instanceof Error ? error.message : "Date filter is invalid." }, { status: 400 });
        }

        const page = numericQueryValue(searchParams.get("page"), 1);
        const requestedPageSize = numericQueryValue(searchParams.get("pageSize"), 20);
        const pageSize = [10, 20, 50, 100].includes(requestedPageSize) ? requestedPageSize : 20;
        const exportAll = searchParams.get("export") === "all";
        const includeOptions = searchParams.get("includeOptions") !== "false";
        const directusStarted = performance.now();
        const [jobOrders, productsForOptions, branchesForOptions, workCenters] = await Promise.all([
            fetchRows("manufacturing_job_orders", "job_order_id,job_order_no,product_id,branch_id,target_quantity,status,version_id,created_at", buildJobOrderQuery(filters)),
            includeOptions
                ? fetchRows("products", "product_id,product_name,product_code,unit_of_measurement.unit_id,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name")
                : Promise.resolve([]),
            includeOptions ? fetchRows("branches", "id,branch_name") : Promise.resolve([]),
            fetchRows("manufacturing_work_centers", "work_center_id,work_center_name,overhead_cost_per_hour")
        ]);

        const eligibleJobOrders = jobOrders
            .filter((jobOrder) => matchesReportFilters(jobOrder, filters))
            .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || ""))
                || relationId(right.job_order_id, ["job_order_id", "id"]) - relationId(left.job_order_id, ["job_order_id", "id"]));
        const eligibleJobOrderIds = eligibleJobOrders
            .map((jobOrder) => relationId(jobOrder.job_order_id, ["job_order_id", "id"]))
            .filter((id) => id > 0);
        const reportPageCount = Math.max(1, Math.ceil(eligibleJobOrders.length / pageSize));
        const safePage = Math.min(page, reportPageCount);
        const pageStart = exportAll ? 0 : (safePage - 1) * pageSize;
        const pageEnd = exportAll ? eligibleJobOrders.length : pageStart + pageSize;

        const [yieldRows, routes, jobMaterials] = await Promise.all([
            fetchRowsByIds("manufacturing_job_order_yield_ledger", "ledger_id,job_order_id,yield_quantity,rejected_quantity,scrap_quantity,commit_status", "job_order_id", eligibleJobOrderIds),
            fetchRowsByIds("manufacturing_job_order_routes", "jo_route_id,job_order_id,sequence_order,work_center_id,actual_setup_hours,actual_run_hours", "job_order_id", eligibleJobOrderIds),
            fetchRowsByIds("manufacturing_job_order_materials", "jo_material_id,job_order_id,product_id,actual_consumed_quantity", "job_order_id", eligibleJobOrderIds)
        ]);

        const routeIds = routes.map((route) => relationId(route.jo_route_id, ["jo_route_id", "id"])).filter(Boolean);
        const materialIds = jobMaterials.map((material) => relationId(material.jo_material_id, ["jo_material_id", "id"])).filter(Boolean);
        const ledgerIds = yieldRows.map((row) => relationId(row.ledger_id, ["ledger_id", "id"])).filter(Boolean);
        const [reservations, inspections, operators] = await Promise.all([
            fetchRowsByIds("manufacturing_job_order_materials_reservations", "jo_materials_reservation_id,jo_material_id,product_id,inventory_lot_id,mm_lot_id,batch_no,actual_used_quantity,reservation_status", "jo_material_id", materialIds),
            fetchRowsByIds("manufacturing_daily_qa_inspections", "ledger_id,jo_route_id,sensory_status,lab_status,action_taken,weight_check_passed", "ledger_id", ledgerIds),
            fetchRowsByIds("manufacturing_job_order_route_operators", "jo_route_operator_id,jo_route_id,operator_id,logged_hours,hourly_rate", "jo_route_id", routeIds)
        ]);

        const inventoryLotIds = reservations.map((row) => relationId(row.inventory_lot_id, ["inventory_lot_id", "id"])).filter(Boolean);
        const productIds = [
            ...eligibleJobOrders.map((row) => relationId(row.product_id, ["product_id", "id"])),
            ...jobMaterials.map((row) => relationId(row.product_id, ["product_id", "id"])),
            ...reservations.map((row) => relationId(row.product_id, ["product_id", "id"]))
        ].filter(Boolean);
        const branchIds = eligibleJobOrders.map((row) => relationId(row.branch_id, ["branch_id", "id"])).filter(Boolean);
        const operatorIds = operators.map((row) => relationId(row.operator_id, ["user_id", "id"])).filter(Boolean);
        const [inventoryLots, products, branchRows, users] = await Promise.all([
            fetchRowsByIds("mm_inventory_lots", "inventory_lot_id,lot_id,product_id,batch_no,unit_cost", "inventory_lot_id", inventoryLotIds),
            includeOptions
                ? Promise.resolve(productsForOptions)
                : fetchRowsByIds("products", "product_id,product_name,product_code,unit_of_measurement.unit_id,unit_of_measurement.unit_shortcut,unit_of_measurement.unit_name", "product_id", productIds),
            includeOptions ? Promise.resolve(branchesForOptions) : fetchRowsByIds("branches", "id,branch_name", "id", branchIds),
            fetchRowsByIds("user", "user_id,user_fname,user_lname", "user_id", operatorIds).catch(() => [])
        ]);
        const directusMs = performance.now() - directusStarted;

        const eligibleIds = new Set(eligibleJobOrderIds);
        const jobRoutesByJobOrder = new Map<number, DirectusRow[]>();
        const routeJobOrderById = new Map<number, number>();
        const jobMaterialsByJobOrder = new Map<number, DirectusRow[]>();
        const jobOrderByMaterialId = new Map<number, number>();
        const reservationsByJobOrder = new Map<number, DirectusRow[]>();
        const operatorsByJobOrder = new Map<number, DirectusRow[]>();
        for (const route of routes) {
            const jobOrderId = relationId(route.job_order_id, ["job_order_id", "id"]);
            const routeId = relationId(route.jo_route_id, ["jo_route_id", "id"]);
            if (!eligibleIds.has(jobOrderId) || !routeId) continue;
            const rows = jobRoutesByJobOrder.get(jobOrderId) || [];
            rows.push(route);
            jobRoutesByJobOrder.set(jobOrderId, rows);
            routeJobOrderById.set(routeId, jobOrderId);
        }
        for (const material of jobMaterials) {
            const jobOrderId = relationId(material.job_order_id, ["job_order_id", "id"]);
            const materialId = relationId(material.jo_material_id, ["jo_material_id", "id"]);
            if (!eligibleIds.has(jobOrderId) || !materialId) continue;
            const rows = jobMaterialsByJobOrder.get(jobOrderId) || [];
            rows.push(material);
            jobMaterialsByJobOrder.set(jobOrderId, rows);
            jobOrderByMaterialId.set(materialId, jobOrderId);
        }
        for (const reservation of reservations) {
            const jobOrderId = jobOrderByMaterialId.get(relationId(reservation.jo_material_id, ["jo_material_id", "id"]));
            if (!jobOrderId) continue;
            const rows = reservationsByJobOrder.get(jobOrderId) || [];
            rows.push(reservation);
            reservationsByJobOrder.set(jobOrderId, rows);
        }
        for (const operator of operators) {
            const jobOrderId = routeJobOrderById.get(relationId(operator.jo_route_id, ["jo_route_id", "id"]));
            if (!jobOrderId) continue;
            const rows = operatorsByJobOrder.get(jobOrderId) || [];
            rows.push(operator);
            operatorsByJobOrder.set(jobOrderId, rows);
        }

        const goodOutputByJobOrder = sumGoodOutputByJobOrder(yieldRows, inspections, routes);
        const productById = new Map(products.map((product) => [relationId(product.product_id, ["product_id", "id"]), product]));
        const branchById = new Map(branchRows.map((branch) => [relationId(branch.id), branch]));
        const workCenterById = new Map(workCenters.map((workCenter) => [relationId(workCenter.work_center_id, ["work_center_id", "id"]), workCenter]));
        const usersById = new Map(users.map((user) => [relationId(user.user_id, ["user_id", "id"]), user]));
        const standardStarted = performance.now();
        const loadedStandardContexts = await loadStandardContexts(eligibleJobOrders, productById, workCenterById);
        const standardMs = performance.now() - standardStarted;

        const rows: StandardVsActualCostRow[] = [];
        const summaryAccumulator = { comparableCount: 0, standard: 0, actual: 0, variance: 0 };

        const calculationStarted = performance.now();
        for (let index = 0; index < eligibleJobOrders.length; index += 1) {
            const jobOrder = eligibleJobOrders[index];
            const jobOrderId = relationId(jobOrder.job_order_id, ["job_order_id", "id"]);
            if (!jobOrderId) continue;
            const includeDetails = exportAll || (index >= pageStart && index < pageEnd);
            const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
            const product = productById.get(productId);
            const branchId = relationId(jobOrder.branch_id, ["id", "branch_id"]) || null;
            const status = displayJobOrderStatus(jobOrder.status);
            const goodOutputQuantity = nonNegative(goodOutputByJobOrder.get(jobOrderId));
            const versionId = relationId(jobOrder.version_id, ["version_id", "id"]) || null;
            const cacheKey = `${productId}:${versionId || 0}`;
            const jobRoutes = jobRoutesByJobOrder.get(jobOrderId) || [];
            const currentJobMaterials = jobMaterialsByJobOrder.get(jobOrderId) || [];
            const jobReservations = reservationsByJobOrder.get(jobOrderId) || [];
            const jobOperators = operatorsByJobOrder.get(jobOrderId) || [];
            const actualMaterials = buildActualMaterials(jobOrderId, currentJobMaterials, jobReservations, inventoryLots, productById, includeDetails);
            const actualLabor = buildActualLabor(jobOrderId, jobRoutes, jobOperators, usersById, includeDetails);
            const actualOverhead = buildActualOverhead(jobRoutes, workCenterById, includeDetails);
            const standard = calculateStandardCosts(loadedStandardContexts.get(cacheKey) || null, goodOutputQuantity);
            const incompleteReasons: string[] = [];
            if (!standard) incompleteReasons.push("The JO-linked recipe version or its standard costs could not be loaded.");
            if (!actualMaterials.complete) incompleteReasons.push("One or more consumed material quantities or lot costs are missing.");
            if (!actualLabor.complete) incompleteReasons.push("An operator labor rate is missing for recorded hours.");
            if (!actualOverhead.complete) incompleteReasons.push("A work-center overhead rate is missing for recorded route hours.");
            if (goodOutputQuantity <= 0) incompleteReasons.push("No QA-passed good output is recorded yet; variance is unavailable.");

            const costs = {
                directMaterials: compareCost(standard?.material ?? null, actualMaterials.amount, goodOutputQuantity),
                directLabor: compareCost(standard?.labor ?? null, actualLabor.amount, goodOutputQuantity),
                manufacturingOverhead: compareCost(standard?.overhead ?? null, actualOverhead.amount, goodOutputQuantity),
                total: combineCostComparisons([
                    compareCost(standard?.material ?? null, actualMaterials.amount, goodOutputQuantity),
                    compareCost(standard?.labor ?? null, actualLabor.amount, goodOutputQuantity),
                    compareCost(standard?.overhead ?? null, actualOverhead.amount, goodOutputQuantity)
                ], goodOutputQuantity)
            };
            const uom = product?.unit_of_measurement && typeof product.unit_of_measurement === "object"
                ? String((product.unit_of_measurement as DirectusRow).unit_shortcut || (product.unit_of_measurement as DirectusRow).unit_name || "units")
                : "units";

            const reportRow: StandardVsActualCostRow = {
                jobOrderId,
                jobOrderNo: String(jobOrder.job_order_no || `JO-${jobOrderId}`),
                productId,
                productName: String(product?.product_name || `Product #${productId}`),
                productCode: String(product?.product_code || ""),
                branchId,
                branchName: String(branchById.get(branchId || 0)?.branch_name || (branchId ? `Branch #${branchId}` : "N/A")),
                status,
                createdAt: jobOrder.created_at ? String(jobOrder.created_at) : null,
                versionId,
                targetQuantity: nonNegative(jobOrder.target_quantity),
                goodOutputQuantity,
                uom,
                provisional: !FINAL_STATUSES.some((candidate) => isJobOrderStatus(status, candidate)),
                incompleteReasons,
                costs,
                detail: {
                    materials: actualMaterials.lines,
                    labor: actualLabor.lines,
                    overhead: actualOverhead.lines
                }
            };
            if (reportRow.costs.total.complete) {
                summaryAccumulator.comparableCount += 1;
                summaryAccumulator.standard += reportRow.costs.total.standard || 0;
                summaryAccumulator.actual += reportRow.costs.total.actual || 0;
                summaryAccumulator.variance += reportRow.costs.total.variance || 0;
            }
            if (includeDetails) rows.push(reportRow);
        }

        const summary: ReportSummary = {
            comparableCount: summaryAccumulator.comparableCount,
            incompleteCount: eligibleJobOrders.length - summaryAccumulator.comparableCount,
            standard: roundCost(summaryAccumulator.standard),
            actual: roundCost(summaryAccumulator.actual),
            variance: roundCost(summaryAccumulator.variance)
        };
        const calculationMs = performance.now() - calculationStarted;
        const branchOptions: CostVarianceOption[] = (includeOptions ? branchRows : []).map((branch) => ({
            id: relationId(branch.id),
            label: String(branch.branch_name || `Branch #${relationId(branch.id)}`)
        })).filter((option) => option.id > 0).sort((left, right) => left.label.localeCompare(right.label));
        const productOptions: CostVarianceOption[] = (includeOptions ? products : []).map((product) => ({
            id: relationId(product.product_id, ["product_id", "id"]),
            label: `${String(product.product_name || `Product #${relationId(product.product_id, ["product_id", "id"])}`)}${product.product_code ? ` · ${product.product_code}` : ""}`
        })).filter((option) => option.id > 0).sort((left, right) => left.label.localeCompare(right.label));

        const response = NextResponse.json({ data: {
            rows,
            branches: branchOptions,
            products: productOptions,
            page: safePage,
            pageSize: exportAll ? eligibleJobOrders.length : pageSize,
            totalRows: eligibleJobOrders.length,
            pageCount: reportPageCount,
            summary
        } });
        response.headers.set("Server-Timing", `directus;dur=${directusMs.toFixed(1)}, standards;dur=${standardMs.toFixed(1)}, report;dur=${calculationMs.toFixed(1)}, total;dur=${(performance.now() - requestStarted).toFixed(1)}`);
        return response;
    } catch (error) {
        console.error("[Standard vs Actual Cost Variance] Failed to load report:", error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : "Failed to load the cost variance report."
        }, { status: 503 });
    }
}
