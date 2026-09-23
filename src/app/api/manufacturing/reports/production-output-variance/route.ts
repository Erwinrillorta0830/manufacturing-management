import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { authorizeProductionOutputVarianceReport } from "./_auth";
import type {
    ProductionOutputVarianceFilters,
    ProductionOutputVarianceRow,
    ProductionOutputVarianceSortKey,
    ProductionOutputVarianceSummary
} from "@/modules/manufacturing-management/production-output-variance-report/types";
import { completionVarianceDays, roundQuantity } from "@/modules/manufacturing-management/production-output-variance-report/utils/report-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DirectusRow = Record<string, unknown>;

const ROW_FIELDS = [
    "job_order_id",
    "job_order_no",
    "product_id.product_id",
    "product_id.product_name",
    "product_id.product_code",
    "product_id.unit_of_measurement.unit_shortcut",
    "product_id.unit_of_measurement.unit_name",
    "branch_id.id",
    "branch_id.branch_name",
    "target_quantity",
    "status",
    "end_date",
    "production_completed_at"
].join(",");

const SUMMARY_FIELDS = [
    "job_order_id",
    "target_quantity",
    "product_id.unit_of_measurement.unit_shortcut",
    "product_id.unit_of_measurement.unit_name"
].join(",");

const ALLOWED_PAGE_SIZES = new Set([10, 20, 50, 100]);
const ALLOWED_SORT_KEYS = new Set<ProductionOutputVarianceSortKey>([
    "jobOrderNo", "productName", "branchName", "status", "plannedQuantity",
    "actualGoodQuantity", "rejectedQuantity", "quantityVariance",
    "quantityVariancePercent", "plannedCompletionDate", "actualCompletionDate",
    "completionVarianceDays"
]);

const DIRECTUS_SORT_FIELDS: Partial<Record<ProductionOutputVarianceSortKey, string>> = {
    plannedQuantity: "target_quantity",
    plannedCompletionDate: "end_date",
    actualCompletionDate: "production_completed_at"
};

class ReportQueryError extends Error {}

function asRecord(value: unknown): DirectusRow | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as DirectusRow
        : null;
}

function relationId(value: unknown, keys: string[]): number {
    const record = asRecord(value);
    const raw = record
        ? keys.map((key) => record[key]).find((candidate) => candidate !== undefined && candidate !== null)
        : value;
    const parsed = Number(raw || 0);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function finiteNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
}

function requiredInteger(value: string | null, fallback: number, label: string): number {
    if (value === null || value === "") return fallback;
    if (!/^\d+$/.test(value)) throw new ReportQueryError(`${label} must be a positive integer.`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed < 1) throw new ReportQueryError(`${label} must be a positive integer.`);
    return parsed;
}

function validDate(value: string, label: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ReportQueryError(`${label} must use YYYY-MM-DD.`);
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new ReportQueryError(`${label} is not a valid date.`);
    }
    return value;
}

function addDays(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

function readRequest(request: Request) {
    const params = new URL(request.url).searchParams;
    const page = requiredInteger(params.get("page"), 1, "Page");
    const pageSize = requiredInteger(params.get("pageSize"), 20, "Page size");
    if (!ALLOWED_PAGE_SIZES.has(pageSize)) throw new ReportQueryError("Page size must be 10, 20, 50, or 100.");

    const rawSortKey = params.get("sortBy") || "plannedCompletionDate";
    if (!ALLOWED_SORT_KEYS.has(rawSortKey as ProductionOutputVarianceSortKey)) {
        throw new ReportQueryError("The requested sort column is not supported.");
    }
    const sortDirection = params.get("sortDirection") || "desc";
    if (sortDirection !== "asc" && sortDirection !== "desc") {
        throw new ReportQueryError("Sort direction must be asc or desc.");
    }

    const search = (params.get("search") || "").trim();
    if (search.length > 200) throw new ReportQueryError("Search must be 200 characters or fewer.");
    const dateFrom = params.get("dateFrom") ? validDate(params.get("dateFrom")!, "Start date") : "";
    const dateTo = params.get("dateTo") ? validDate(params.get("dateTo")!, "End date") : "";
    if (dateFrom && dateTo && dateFrom > dateTo) throw new ReportQueryError("Start date must be on or before end date.");

    const branchId = params.get("branchId") || "all";
    const productId = params.get("productId") || "all";
    if (branchId !== "all") requiredInteger(branchId, 0, "Branch ID");
    if (productId !== "all") requiredInteger(productId, 0, "Product ID");
    const status = params.get("status") || "all";
    if (status.length > 80) throw new ReportQueryError("Status must be 80 characters or fewer.");

    const exportAll = params.get("export") === "all";
    if (params.has("export") && !exportAll) throw new ReportQueryError("Export mode is not supported.");

    return {
        page,
        pageSize,
        filters: { search, branchId, productId, status, dateFrom, dateTo } satisfies ProductionOutputVarianceFilters,
        sortKey: rawSortKey as ProductionOutputVarianceSortKey,
        sortDirection: sortDirection as "asc" | "desc",
        exportAll
    };
}

function filterKey(parts: string[]): string {
    return `filter${parts.map((part) => `[${part}]`).join("")}`;
}

function addFilters(params: URLSearchParams, filters: ProductionOutputVarianceFilters, relationPrefix: string[] = []) {
    let andIndex = 0;
    const addCondition = (fieldPath: string[], operator: string, value: string) => {
        params.set(filterKey(["_and", String(andIndex++), ...relationPrefix, ...fieldPath, operator]), value);
    };

    if (filters.branchId !== "all") addCondition(["branch_id"], "_eq", filters.branchId);
    if (filters.productId !== "all") addCondition(["product_id"], "_eq", filters.productId);
    if (filters.status !== "all") {
        const base = ["_and", String(andIndex++), ...relationPrefix];
        if (filters.status === "Unknown") {
            params.set(filterKey([...base, "_or", "0", "status", "_null"]), "true");
            params.set(filterKey([...base, "_or", "1", "status", "_eq"]), "");
            params.set(filterKey([...base, "_or", "2", "status", "_eq"]), "Unknown");
        } else {
            params.set(filterKey([...base, "status", "_eq"]), filters.status);
        }
    }
    if (filters.dateFrom) addCondition(["end_date"], "_gte", filters.dateFrom);
    if (filters.dateTo) addCondition(["end_date"], "_lt", addDays(filters.dateTo, 1));

    if (filters.search) {
        const base = ["_and", String(andIndex++), ...relationPrefix, "_or"];
        const searchableFields = [
            ["job_order_no"],
            ["product_id", "product_name"],
            ["product_id", "product_code"],
            ["branch_id", "branch_name"],
            ["status"]
        ];
        searchableFields.forEach((field, index) => {
            params.set(filterKey([...base, String(index), ...field, "_icontains"]), filters.search);
        });
        const joNumber = /^JO-(\d+)$/i.exec(filters.search);
        if (joNumber) params.set(filterKey([...base, String(searchableFields.length), "job_order_id", "_eq"]), joNumber[1]);
    }
}

async function fetchRows<T extends DirectusRow>(collection: string, params: URLSearchParams): Promise<T[]> {
    const url = `${DIRECTUS_URL}/items/${collection}?${params.toString()}`;
    const response = await fetch(url, { headers, cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload?.data)) {
        throw new Error(`${collection} lookup failed with HTTP ${response.status}.`);
    }
    return payload.data as T[];
}

function jobOrderParams(filters: ProductionOutputVarianceFilters, limit: number, offset = 0, fields = ROW_FIELDS) {
    const params = new URLSearchParams({ fields, limit: String(limit), offset: String(offset) });
    addFilters(params, filters);
    return params;
}

async function fetchJobOrders(filters: ProductionOutputVarianceFilters, limit: number, offset = 0): Promise<DirectusRow[]> {
    return fetchRows("manufacturing_job_orders", jobOrderParams(filters, limit, offset));
}

async function fetchYieldAggregates(
    filters: ProductionOutputVarianceFilters,
    quantityField: "yield_quantity" | "rejected_quantity"
): Promise<DirectusRow[]> {
    const params = new URLSearchParams({
        "aggregate[sum]": quantityField,
        "groupBy[]": "job_order_id",
        limit: "-1"
    });
    params.append("groupBy[]", "commit_status");
    params.set(filterKey([quantityField, "_gt"]), "0");
    addFilters(params, filters, ["job_order_id"]);
    return fetchRows("manufacturing_job_order_yield_ledger", params);
}

function readAggregateValue(row: DirectusRow, field: string): number {
    const sums = asRecord(row.sum);
    return finiteNumber(sums?.[field] ?? row[`sum.${field}`]);
}

function aggregateYields(
    goodRows: DirectusRow[],
    rejectedRows: DirectusRow[]
): Map<number, { good: number; rejected: number }> {
    const totalsByJobOrder = new Map<number, { good: number; rejected: number }>();
    const accumulate = (rows: DirectusRow[], field: "good" | "rejected", aggregateField: string) => {
        for (const row of rows) {
            const group = asRecord(row.group);
            const commitStatus = String(row.commit_status ?? group?.commit_status ?? "").trim().toUpperCase();
            if (commitStatus && commitStatus !== "COMMITTED") continue;
            const id = relationId(row.job_order_id ?? group?.job_order_id, ["job_order_id", "id"]);
            if (!id) continue;
            const totals = totalsByJobOrder.get(id) || { good: 0, rejected: 0 };
            totals[field] += Math.max(0, readAggregateValue(row, aggregateField));
            totalsByJobOrder.set(id, totals);
        }
    };
    accumulate(goodRows, "good", "yield_quantity");
    accumulate(rejectedRows, "rejected", "rejected_quantity");
    return totalsByJobOrder;
}

function mapJobOrder(jobOrder: DirectusRow, yieldsByJobOrder: Map<number, { good: number; rejected: number }>): ProductionOutputVarianceRow | null {
    const jobOrderId = relationId(jobOrder.job_order_id, ["job_order_id", "id"]);
    if (!jobOrderId) return null;
    const product = asRecord(jobOrder.product_id);
    const branch = asRecord(jobOrder.branch_id);
    const unit = asRecord(product?.unit_of_measurement);
    const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
    const branchId = relationId(jobOrder.branch_id, ["id", "branch_id"]) || null;
    const uom = String(unit?.unit_shortcut || unit?.unit_name || "units");
    const targetQuantity = Math.max(0, finiteNumber(jobOrder.target_quantity));
    const actuals = yieldsByJobOrder.get(jobOrderId) || { good: 0, rejected: 0 };
    const actualGoodQuantity = roundQuantity(actuals.good);
    const rejectedQuantity = roundQuantity(actuals.rejected);
    const quantityVariance = roundQuantity(actualGoodQuantity - targetQuantity);
    const plannedCompletionDate = jobOrder.end_date ? String(jobOrder.end_date) : null;
    const actualCompletionDate = jobOrder.production_completed_at ? String(jobOrder.production_completed_at) : null;

    return {
        jobOrderId,
        jobOrderNo: String(jobOrder.job_order_no || `JO-${jobOrderId}`),
        productId,
        productName: String(product?.product_name || `Product #${productId}`),
        productCode: String(product?.product_code || ""),
        uom,
        branchId,
        branchName: branchId ? String(branch?.branch_name || `Branch #${branchId}`) : "—",
        status: String(jobOrder.status || "Unknown"),
        plannedQuantity: roundQuantity(targetQuantity),
        actualGoodQuantity,
        rejectedQuantity,
        quantityVariance,
        quantityVariancePercent: targetQuantity > 0 ? roundQuantity((quantityVariance / targetQuantity) * 100) : null,
        plannedCompletionDate,
        actualCompletionDate,
        completionVarianceDays: completionVarianceDays(plannedCompletionDate, actualCompletionDate)
    };
}

function compareRows(sortKey: ProductionOutputVarianceSortKey, direction: "asc" | "desc") {
    return (left: ProductionOutputVarianceRow, right: ProductionOutputVarianceRow) => {
        const a = left[sortKey] ?? "";
        const b = right[sortKey] ?? "";
        const compare = typeof a === "number" && typeof b === "number"
            ? a - b
            : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
        return (direction === "asc" ? compare : -compare) || left.jobOrderId - right.jobOrderId;
    };
}

function buildSummary(rows: ProductionOutputVarianceRow[]): ProductionOutputVarianceSummary {
    const quantities = new Map<string, ProductionOutputVarianceSummary["quantitiesByUom"][number]>();
    for (const row of rows) {
        const uom = row.uom || "units";
        const totals = quantities.get(uom) || {
            uom,
            plannedQuantity: 0,
            actualGoodQuantity: 0,
            rejectedQuantity: 0,
            quantityVariance: 0
        };
        totals.plannedQuantity += row.plannedQuantity;
        totals.actualGoodQuantity += row.actualGoodQuantity;
        totals.rejectedQuantity += row.rejectedQuantity;
        totals.quantityVariance += row.quantityVariance;
        quantities.set(uom, totals);
    }
    return {
        jobCount: rows.length,
        quantitiesByUom: Array.from(quantities.values())
            .map((totals) => ({
                ...totals,
                plannedQuantity: roundQuantity(totals.plannedQuantity),
                actualGoodQuantity: roundQuantity(totals.actualGoodQuantity),
                rejectedQuantity: roundQuantity(totals.rejectedQuantity),
                quantityVariance: roundQuantity(totals.quantityVariance)
            }))
            .sort((a, b) => a.uom.localeCompare(b.uom))
    };
}

function buildSummaryFromJobOrders(
    jobOrders: DirectusRow[],
    yieldsByJobOrder: Map<number, { good: number; rejected: number }>
): ProductionOutputVarianceSummary {
    const totalsByUom = new Map<string, ProductionOutputVarianceSummary["quantitiesByUom"][number]>();
    let jobCount = 0;
    for (const jobOrder of jobOrders) {
        const jobOrderId = relationId(jobOrder.job_order_id, ["job_order_id", "id"]);
        if (!jobOrderId) continue;
        jobCount += 1;
        const product = asRecord(jobOrder.product_id);
        const unit = asRecord(product?.unit_of_measurement);
        const uom = String(unit?.unit_shortcut || unit?.unit_name || "units");
        const plannedQuantity = roundQuantity(Math.max(0, finiteNumber(jobOrder.target_quantity)));
        const actuals = yieldsByJobOrder.get(jobOrderId) || { good: 0, rejected: 0 };
        const actualGoodQuantity = roundQuantity(actuals.good);
        const rejectedQuantity = roundQuantity(actuals.rejected);
        const totals = totalsByUom.get(uom) || {
            uom,
            plannedQuantity: 0,
            actualGoodQuantity: 0,
            rejectedQuantity: 0,
            quantityVariance: 0
        };
        totals.plannedQuantity += plannedQuantity;
        totals.actualGoodQuantity += actualGoodQuantity;
        totals.rejectedQuantity += rejectedQuantity;
        totals.quantityVariance += roundQuantity(actualGoodQuantity - plannedQuantity);
        totalsByUom.set(uom, totals);
    }
    return {
        jobCount,
        quantitiesByUom: [...totalsByUom.values()]
            .map((totals) => ({
                ...totals,
                plannedQuantity: roundQuantity(totals.plannedQuantity),
                actualGoodQuantity: roundQuantity(totals.actualGoodQuantity),
                rejectedQuantity: roundQuantity(totals.rejectedQuantity),
                quantityVariance: roundQuantity(totals.quantityVariance)
            }))
            .sort((a, b) => a.uom.localeCompare(b.uom))
    };
}

export async function GET(request: Request) {
    const access = await authorizeProductionOutputVarianceReport();
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    const startedAt = Date.now();
    try {
        const query = readRequest(request);
        if (query.exportAll) {
            const [goodYieldGroups, rejectedYieldGroups, allJobOrders] = await Promise.all([
                fetchYieldAggregates(query.filters, "yield_quantity"),
                fetchYieldAggregates(query.filters, "rejected_quantity"),
                fetchJobOrders(query.filters, -1)
            ]);
            const yieldsByJobOrder = aggregateYields(goodYieldGroups, rejectedYieldGroups);
            const rows = allJobOrders
                .map((jobOrder) => mapJobOrder(jobOrder, yieldsByJobOrder))
                .filter((row): row is ProductionOutputVarianceRow => row !== null);
            const body = { data: { rows, totalCount: rows.length } };
            console.info("[Production Output & Variance Report]", JSON.stringify({
                mode: "export",
                durationMs: Date.now() - startedAt,
                totalCount: rows.length,
                aggregateGroups: goodYieldGroups.length + rejectedYieldGroups.length,
                responseBytes: Buffer.byteLength(JSON.stringify(body), "utf8")
            }));
            return NextResponse.json(body);
        }

        let rows: ProductionOutputVarianceRow[];
        let summary: ProductionOutputVarianceSummary;
        let totalCount: number;
        let aggregateGroupCount: number;

        if (DIRECTUS_SORT_FIELDS[query.sortKey]) {
            const [summaryJobOrders, goodYieldGroups, rejectedYieldGroups] = await Promise.all([
                fetchRows("manufacturing_job_orders", jobOrderParams(query.filters, -1, 0, SUMMARY_FIELDS)),
                fetchYieldAggregates(query.filters, "yield_quantity"),
                fetchYieldAggregates(query.filters, "rejected_quantity")
            ]);
            const yieldsByJobOrder = aggregateYields(goodYieldGroups, rejectedYieldGroups);
            summary = buildSummaryFromJobOrders(summaryJobOrders, yieldsByJobOrder);
            totalCount = summary.jobCount;
            aggregateGroupCount = goodYieldGroups.length + rejectedYieldGroups.length;
            const pageCount = Math.max(1, Math.ceil(totalCount / query.pageSize));
            const page = Math.min(query.page, pageCount);
            const directSortField = DIRECTUS_SORT_FIELDS[query.sortKey]!;
            const pageParams = jobOrderParams(query.filters, query.pageSize, (page - 1) * query.pageSize);
            pageParams.set("sort", `${query.sortDirection === "desc" ? "-" : ""}${directSortField},job_order_id`);
            const pageJobOrders = await fetchRows("manufacturing_job_orders", pageParams);
            rows = pageJobOrders
                .map((jobOrder) => mapJobOrder(jobOrder, yieldsByJobOrder))
                .filter((row): row is ProductionOutputVarianceRow => row !== null);
            const body = { data: { rows, totalCount, page, pageSize: query.pageSize, summary } };
            console.info("[Production Output & Variance Report]", JSON.stringify({
                mode: "page",
                durationMs: Date.now() - startedAt,
                totalCount,
                returnedRows: rows.length,
                aggregateGroups: aggregateGroupCount,
                responseBytes: Buffer.byteLength(JSON.stringify(body), "utf8")
            }));
            return NextResponse.json(body);
        }

        const [allJobOrders, goodYieldGroups, rejectedYieldGroups] = await Promise.all([
            fetchJobOrders(query.filters, -1),
            fetchYieldAggregates(query.filters, "yield_quantity"),
            fetchYieldAggregates(query.filters, "rejected_quantity")
        ]);
        const yieldsByJobOrder = aggregateYields(goodYieldGroups, rejectedYieldGroups);
        const allRows = allJobOrders
            .map((jobOrder) => mapJobOrder(jobOrder, yieldsByJobOrder))
            .filter((row): row is ProductionOutputVarianceRow => row !== null);
        const sortedRows = allRows.sort(compareRows(query.sortKey, query.sortDirection));
        summary = buildSummary(sortedRows);
        totalCount = summary.jobCount;
        aggregateGroupCount = goodYieldGroups.length + rejectedYieldGroups.length;
        const pageCount = Math.max(1, Math.ceil(totalCount / query.pageSize));
        const page = Math.min(query.page, pageCount);
        rows = sortedRows.slice((page - 1) * query.pageSize, page * query.pageSize);
        const body = { data: { rows, totalCount, page, pageSize: query.pageSize, summary } };
        console.info("[Production Output & Variance Report]", JSON.stringify({
            mode: "page",
            durationMs: Date.now() - startedAt,
            totalCount,
            returnedRows: rows.length,
            aggregateGroups: aggregateGroupCount,
            responseBytes: Buffer.byteLength(JSON.stringify(body), "utf8")
        }));
        return NextResponse.json(body);
    } catch (error) {
        if (error instanceof ReportQueryError) return NextResponse.json({ error: error.message }, { status: 400 });
        console.error("[Production Output & Variance Report] Failed to load report data:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load production output report." }, { status: 503 });
    }
}
