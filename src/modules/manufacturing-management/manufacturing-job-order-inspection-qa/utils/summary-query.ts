import type {
    JobOrderDailyYieldSummary,
    JobOrderDailyYieldSummaryPage,
    JobOrderDailyYieldSummaryQuery,
} from "../types";

const ALLOWED_PAGE_SIZES = new Set([8, 16, 32]);
const PHT_TIME_ZONE = "Asia/Manila";

function phtTimestampEpoch(value: string | null): number {
    if (!value) return 0;
    const normalized = value.trim();
    if (!normalized) return 0;
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
    const timestamp = hasTimezone
        ? normalized
        : `${normalized.replace(" ", "T")}${normalized.length === 10 ? "T00:00:00" : ""}+08:00`;
    const epoch = Date.parse(timestamp);
    return Number.isFinite(epoch) ? epoch : 0;
}

function phtDateKey(value: string | null): string | null {
    if (!value) return null;
    const normalized = value.trim();
    if (!normalized) return null;
    if (/^\d{4}-\d{2}-\d{2}(?:[ T].*)?$/.test(normalized)
        && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)) {
        return normalized.slice(0, 10);
    }

    const timestamp = phtTimestampEpoch(normalized);
    if (!timestamp) return null;
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: PHT_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date(timestamp));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

function productKey(jobOrder: JobOrderDailyYieldSummary): string {
    return jobOrder.productId ? String(jobOrder.productId) : `name:${jobOrder.productName}`;
}

export function buildJobOrderDailyYieldSummaryPage(
    rows: JobOrderDailyYieldSummary[],
    query: JobOrderDailyYieldSummaryQuery
): JobOrderDailyYieldSummaryPage {
    const pageSize = ALLOWED_PAGE_SIZES.has(query.pageSize) ? query.pageSize : 8;
    const requestedPage = Number.isSafeInteger(query.page) && query.page > 0 ? query.page : 1;
    const search = query.search.trim().toLowerCase();

    const statusOptions = [...new Set(rows.map((row) => row.status).filter(Boolean))]
        .sort((left, right) => left.localeCompare(right));
    const productOptions = new Map<string, string>();
    rows.forEach((row) => productOptions.set(productKey(row), row.productName));
    const facets = {
        totalAvailable: rows.length,
        unresolvedJobOrderCount: rows.filter((row) => row.unresolvedYieldCount > 0).length,
        statusOptions,
        productOptions: [...productOptions.entries()]
            .map(([value, label]) => ({ value, label }))
            .sort((left, right) => left.label.localeCompare(right.label)),
    };

    const filtered = rows.filter((row) => {
        const matchesSearch = !search
            || row.jobOrderNo.toLowerCase().includes(search)
            || row.productName.toLowerCase().includes(search)
            || Boolean(row.productCode?.toLowerCase().includes(search));
        const matchesStatus = !query.status || row.status === query.status;
        const matchesProduct = !query.productId || productKey(row) === query.productId;
        const latestDate = phtDateKey(row.latestYieldAt);
        const matchesDate = (!query.dateFrom || Boolean(latestDate && latestDate >= query.dateFrom))
            && (!query.dateTo || Boolean(latestDate && latestDate <= query.dateTo));
        const matchesFlagged = !query.flaggedOnly || row.unresolvedYieldCount > 0;
        return matchesSearch && matchesStatus && matchesProduct && matchesDate && matchesFlagged;
    }).sort((left, right) => (
        (query.flaggedOnly
            ? ((right.discrepancyYieldCount || 0) - (left.discrepancyYieldCount || 0))
                || ((right.pendingYieldCount || 0) - (left.pendingYieldCount || 0))
            : 0)
        || phtTimestampEpoch(right.latestYieldAt) - phtTimestampEpoch(left.latestYieldAt)
        || right.jobOrderId - left.jobOrderId
    ));

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, Math.max(totalPages, 1));
    const offset = (page - 1) * pageSize;

    return {
        data: filtered.slice(offset, offset + pageSize),
        meta: { page, pageSize, total, totalPages },
        facets,
    };
}
