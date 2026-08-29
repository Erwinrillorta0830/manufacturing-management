import type {
    ActionPayload,
    BulkCostActionPayload,
    BulkCostActionResponse,
    CreatePriceChangeBatchPayload,
    CreateCCRPayload,
    ListQuery,
    PriceActionPayload,
    PriceChangeBatchDetail,
    PriceChangeBatchHeader,
    UnifiedBatchDetail,
    PriceChangeRequestRow,
    CostChangeRequestRow,
    ListMeta,
    ListCostBatchDetail,
    UnifiedApprovalRow,
} from "../types";
import { apiStatusParam } from "../utils/pcrQuery";
import { readApiResponse } from "../../shared/apiHttp";

/** Existing consolidated lookups route */
const LOOKUPS_ENDPOINT = "/api/manufacturing/financial-management/price-control/lookups";

/** Existing products route (DO NOT CHANGE route.ts; we only consume it) */
const PRODUCT_SEARCH_ENDPOINT = "/api/manufacturing/financial-management/price-control/products";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function toNullableNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function toStringSafe(value: unknown, fallback = ""): string {
    const s = String(value ?? "").trim();
    return s || fallback;
}

async function http<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
    const res = await fetch(input, { cache: "no-store", ...init });
    return readApiResponse<T>(res);
}

function appendListQuery(sp: URLSearchParams, query: ListQuery) {
    const status = apiStatusParam(query.status);
    if (status) sp.set("status", status);
    if (query.q) sp.set("q", query.q);
    if (query.supplier_ids?.length) sp.set("supplier_ids", query.supplier_ids.join(","));
    if (query.product_type_ids?.length) sp.set("product_type_ids", query.product_type_ids.join(","));
    if (query.date_from) sp.set("date_from", query.date_from);
    if (query.date_to) sp.set("date_to", query.date_to);
    sp.set("page", String(query.page ?? 1));
    sp.set("page_size", String(query.page_size ?? 50));
}

export async function listRequests(query: ListQuery) {
    const sp = new URLSearchParams();
    appendListQuery(sp, query);
    if (query.product_id) sp.set("product_id", String(query.product_id));
    if (query.price_type_id) sp.set("price_type_id", String(query.price_type_id));
    if (query.requested_by) sp.set("requested_by", String(query.requested_by));

    return http<{ data: PriceChangeRequestRow[]; meta: ListMeta | null }>(
        `/api/manufacturing/financial-management/price-control/price-change-requests?${sp.toString()}`,
    );
}

export async function listCostRequests(query: ListQuery) {
    const sp = new URLSearchParams();
    appendListQuery(sp, query);
    if (query.product_id) sp.set("product_id", String(query.product_id));
    if (query.requested_by) sp.set("requested_by", String(query.requested_by));

    return http<{ data: CostChangeRequestRow[]; meta: ListMeta | null }>(
        `/api/manufacturing/financial-management/price-control/cost-change-requests?${sp.toString()}`,
    );
}

export async function createCostRequest(payload: CreateCCRPayload) {
    return http<{
        data: CostChangeRequestRow;
        header_id?: number;
        reference_no?: string | null;
    }>(`/api/manufacturing/financial-management/price-control/cost-change-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function createBulkCostChangeRequests(payload: {
    items: CreateCCRPayload[];
    supplier_id: number;
    reference_no?: string;
    remarks?: string;
}) {
    return http<{
        created: number;
        header_id?: number;
        reference_no?: string | null;
        skipped_duplicates?: number;
        skipped_existing_pending?: number;
    }>(`/api/manufacturing/financial-management/price-control/cost-change-requests/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function saveMixedPricingChanges(payload: {
    batch: {
        supplier_id: number;
        reference_no?: string;
        remarks: string;
    };
    price_lines: CreatePriceChangeBatchPayload["lines"];
    cost_items: CreateCCRPayload[];
}) {
    return http<{
        created: number;
        price: {
            created: number;
            skipped_duplicates?: number;
            skipped_existing_pending?: number;
            header_id?: number;
        };
        cost: {
            created: number;
            skipped_duplicates?: number;
            skipped_existing_pending?: number;
            header_id?: number;
            reference_no?: string | null;
        };
    }>(`/api/manufacturing/financial-management/price-control/mixed-save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function actionCostRequest(payload: ActionPayload) {
    return http<{ data: CostChangeRequestRow }>(`/api/manufacturing/financial-management/price-control/cost-change-requests/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function actionCostRequestsBulk(payload: BulkCostActionPayload) {
    return http<BulkCostActionResponse>(`/api/manufacturing/financial-management/price-control/cost-change-requests/actions/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function actionPriceRequest(payload: PriceActionPayload) {
    return http<{ data: PriceChangeRequestRow }>(`/api/manufacturing/financial-management/price-control/price-change-requests/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

/** Lookups */
export type CategoryOption = { category_id: number; category_name: string };
export type BrandOption = { brand_id: number; brand_name: string };
export type UnitOption = {
    unit_id: number;
    unit_name?: string | null;
    unit_shortcut?: string | null;
    order?: number | null;
};
export type SupplierOption = {
    id: number;
    supplier_name: string;
    supplier_shortcut?: string | null;
    isActive?: number | boolean | null;
};

export type ProductTypeOption = {
    id: number;
    name: string;
};

export type PriceTypeOption = {
    price_type_id: number;
    price_type_name?: string | null;
    sort?: number | null;
};

export type ProductsMeta = {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
    totalVariants?: number;
};

export type LookupsResponse = {
    categories: CategoryOption[];
    brands: BrandOption[];
    units: UnitOption[];
    suppliers: SupplierOption[];
    product_types?: ProductTypeOption[];
};

export async function getLookups(params?: {
    supplier_scope?: "ALL" | "LINKED_ONLY";
    supplier_ids?: string;
    category_id?: number | null;
    brand_id?: number | null;
}) {
    const sp = new URLSearchParams();
    if (params?.supplier_scope) sp.set("supplier_scope", params.supplier_scope);
    if (params?.supplier_ids) sp.set("supplier_ids", params.supplier_ids);
    if (params?.category_id) sp.set("category_id", String(params.category_id));
    if (params?.brand_id) sp.set("brand_id", String(params.brand_id));

    const url = sp.toString() ? `${LOOKUPS_ENDPOINT}?${sp.toString()}` : LOOKUPS_ENDPOINT;

    const res = await http<{ data: LookupsResponse }>(url);
    const d = res.data ?? ({} as LookupsResponse);

    return {
        categories: Array.isArray(d.categories) ? d.categories : [],
        brands: Array.isArray(d.brands) ? d.brands : [],
        units: Array.isArray(d.units) ? d.units : [],
        suppliers: Array.isArray(d.suppliers) ? d.suppliers : [],
    };
}

export async function getSuppliers() {
    const res = await http<{ data: Pick<LookupsResponse, "suppliers"> }>(
        `${LOOKUPS_ENDPOINT}?fields=suppliers`,
    );
    const d = res.data ?? ({} as Pick<LookupsResponse, "suppliers">);
    return {
        suppliers: Array.isArray(d.suppliers) ? d.suppliers : [],
    };
}

export async function getProductTypes() {
    const res = await http<{ data: Pick<LookupsResponse, "product_types"> }>(
        `${LOOKUPS_ENDPOINT}?fields=product_types`,
    );
    const d = res.data ?? ({} as Pick<LookupsResponse, "product_types">);
    return {
        product_types: Array.isArray(d.product_types) ? d.product_types : [],
    };
}

/** Products */
export type ProductSearchRow = {
    product_id: number;
    product_name: string;
    parent_id?: number | null;
    product_code?: string | null;
    barcode?: string | null;
    __group_id?: number | null;
    unit_of_measurement?: number | null;
    price_per_unit?: number | null;
    priceA?: number | null;
    priceB?: number | null;
    priceC?: number | null;
    priceD?: number | null;
    priceE?: number | null;
    cost_per_unit?: number | null;
};

export type TierPriceRow = {
    product_id: number;
    price_type_id: number;
    price: number | null;
};

export type PendingPriceRequestLookupRow = {
    product_id: number;
    price_type_id: number;
    proposed_price: number | null;
};

export type PendingCostRequestLookupRow = {
    product_id: number;
    proposed_cost: number | null;
};

function mapProductSearchRow(item: unknown): ProductSearchRow | null {
    if (!isRecord(item)) return null;

    const productId = Number(item.product_id ?? 0);
    if (!Number.isFinite(productId) || productId <= 0) return null;

    return {
        product_id: productId,
        product_name: toStringSafe(item.product_name, "-"),
        parent_id: toNullableNumber(item.parent_id),
        product_code: toStringSafe(item.product_code) || null,
        barcode: toStringSafe(item.barcode) || null,
        __group_id: toNullableNumber(item.__group_id),
        unit_of_measurement: toNullableNumber(item.unit_of_measurement),
        price_per_unit: toNullableNumber(item.price_per_unit),
        priceA: toNullableNumber(item.priceA),
        priceB: toNullableNumber(item.priceB),
        priceC: toNullableNumber(item.priceC),
        priceD: toNullableNumber(item.priceD),
        priceE: toNullableNumber(item.priceE),
        cost_per_unit: toNullableNumber(item.cost_per_unit),
    };
}

export async function getPriceTypes() {
    const res = await http<{ data: PriceTypeOption[] }>("/api/manufacturing/financial-management/price-control/price-types");
    return {
        data: (res.data ?? [])
            .map((item) => ({
                price_type_id: Number(item.price_type_id),
                price_type_name: item.price_type_name ?? "",
                sort: toNullableNumber(item.sort),
            }))
            .filter((item) => Number.isFinite(item.price_type_id) && item.price_type_id > 0),
    };
}

export async function searchProducts(params: {
    q: string;
    limit?: number;
    category_id?: number | null;
    brand_id?: number | null;
    supplier_scope?: "ALL" | "LINKED_ONLY";
    supplier_ids?: string;
}) {
    const sp = new URLSearchParams();
    sp.set("q", params.q ?? "");
    sp.set("page", "1");
    sp.set("page_size", String(params.limit ?? 25));

    if (params.category_id) sp.set("category_id", String(params.category_id));
    if (params.brand_id) sp.set("brand_id", String(params.brand_id));

    if (params.supplier_scope) sp.set("supplier_scope", params.supplier_scope);
    if (params.supplier_ids) sp.set("supplier_ids", params.supplier_ids);

    const res = await fetch(`${PRODUCT_SEARCH_ENDPOINT}?${sp.toString()}`, { cache: "no-store" });
    const json: unknown = await res.json().catch(() => null);

    if (!res.ok) {
        let message = `Request failed (${res.status})`;

        if (isRecord(json)) {
            message =
                typeof json.error === "string"
                    ? json.error
                    : typeof json.details === "string"
                        ? json.details
                        : typeof json.message === "string"
                            ? json.message
                            : message;
        }

        throw new Error(message);
    }

    const raw = isRecord(json) ? (Array.isArray(json.data) ? json.data : json) : json;
    const list: unknown[] = Array.isArray(raw) ? raw : [];

    return list
        .map((item): ProductSearchRow | null => {
            if (!isRecord(item)) return null;

            const productId = Number(item.product_id ?? 0);
            if (!Number.isFinite(productId) || productId <= 0) return null;

            return {
                product_id: productId,
                product_name: toStringSafe(item.product_name, "—"),
                unit_of_measurement: toNullableNumber(item.unit_of_measurement),
                price_per_unit: toNullableNumber(item.price_per_unit),
                priceA: toNullableNumber(item.priceA),
                priceB: toNullableNumber(item.priceB),
                priceC: toNullableNumber(item.priceC),
                priceD: toNullableNumber(item.priceD),
                priceE: toNullableNumber(item.priceE),
                cost_per_unit: toNullableNumber(item.cost_per_unit),
            };
        })
        .filter((row): row is ProductSearchRow => row !== null);
}

const PRODUCT_IDS_CHUNK_SIZE = 200;

export async function getProductsByIds(
    productIds: number[],
    active_only: "0" | "1" = "1",
): Promise<ProductSearchRow[]> {
    if (productIds.length === 0) return [];

    const chunks: number[][] = [];
    for (let i = 0; i < productIds.length; i += PRODUCT_IDS_CHUNK_SIZE) {
        chunks.push(productIds.slice(i, i + PRODUCT_IDS_CHUNK_SIZE));
    }

    const results = await Promise.all(
        chunks.map(async (chunk) => {
            const sp = new URLSearchParams({
                product_ids: chunk.join(","),
                active_only,
            });
            const res = await http<{ data: unknown[] }>(
                `/api/manufacturing/financial-management/price-control/products?${sp.toString()}`,
            );
            return (res.data ?? [])
                .map(mapProductSearchRow)
                .filter((row): row is ProductSearchRow => row !== null);
        }),
    );

    const byId = new Map<number, ProductSearchRow>();
    for (const rows of results) {
        for (const row of rows) {
            byId.set(row.product_id, row);
        }
    }

    return Array.from(byId.values());
}

export async function getProductsPage(params: {
    q?: string;
    supplier_ids?: string;
    supplier_scope?: "ALL" | "LINKED_ONLY";
    active_only?: "0" | "1";
    page?: string;
    page_size?: string;
}) {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        const text = String(value).trim();
        if (!text) continue;
        sp.set(key, text);
    }

    const res = await http<{ data: unknown[]; meta?: ProductsMeta }>(
        `/api/manufacturing/financial-management/price-control/products?${sp.toString()}`,
    );

    return {
        data: (res.data ?? [])
            .map(mapProductSearchRow)
            .filter((row): row is ProductSearchRow => row !== null),
        meta: res.meta ?? null,
    };
}

export async function getPricesForProducts(productIds: number[]) {
    if (productIds.length === 0) {
        return { data: [] as TierPriceRow[] };
    }

    const chunks: number[][] = [];
    for (let i = 0; i < productIds.length; i += PRODUCT_IDS_CHUNK_SIZE) {
        chunks.push(productIds.slice(i, i + PRODUCT_IDS_CHUNK_SIZE));
    }

    const results = await Promise.all(
        chunks.map(async (chunk) => {
            const sp = new URLSearchParams({ product_ids: chunk.join(",") });
            const res = await http<{ data: unknown[] }>(`/api/manufacturing/financial-management/price-control/prices?${sp.toString()}`);

            return (res.data ?? [])
                .map((item): TierPriceRow | null => {
                    if (!isRecord(item)) return null;

                    const productId = Number(item.product_id);
                    const priceTypeId = Number(item.price_type_id);
                    if (!Number.isFinite(productId) || productId <= 0) return null;
                    if (!Number.isFinite(priceTypeId) || priceTypeId <= 0) return null;

                    const price = toNullableNumber(item.price);

                    return {
                        product_id: productId,
                        price_type_id: priceTypeId,
                        price,
                    };
                })
                .filter((row): row is TierPriceRow => row !== null);
        }),
    );

    return { data: results.flat() };
}

function relationId(value: unknown, field: string): number | null {
    if (isRecord(value)) return toNullableNumber(value[field]);
    return toNullableNumber(value);
}

export async function getPendingPriceRequestsForProducts(productIds: number[]) {
    if (productIds.length === 0) {
        return { data: [] as PendingPriceRequestLookupRow[] };
    }

    const chunks: number[][] = [];
    for (let i = 0; i < productIds.length; i += PRODUCT_IDS_CHUNK_SIZE) {
        chunks.push(productIds.slice(i, i + PRODUCT_IDS_CHUNK_SIZE));
    }

    const results = await Promise.all(
        chunks.map(async (chunk) => {
            const sp = new URLSearchParams({
                status: "PENDING",
                product_ids: chunk.join(","),
            });
            const res = await http<{ data: unknown[] }>(
                `/api/manufacturing/financial-management/price-control/price-change-requests?${sp.toString()}`,
            );

            return (res.data ?? [])
                .map((item): PendingPriceRequestLookupRow | null => {
                    if (!isRecord(item)) return null;

                    const productId = relationId(item.product_id, "product_id");
                    const priceTypeId = relationId(item.price_type_id, "price_type_id");
                    if (productId === null || priceTypeId === null) return null;

                    return {
                        product_id: productId,
                        price_type_id: priceTypeId,
                        proposed_price: toNullableNumber(item.proposed_price),
                    };
                })
                .filter((row): row is PendingPriceRequestLookupRow => row !== null);
        }),
    );

    return { data: results.flat() };
}

export async function getPendingCostRequestsForProducts(productIds: number[]) {
    if (productIds.length === 0) {
        return { data: [] as PendingCostRequestLookupRow[] };
    }

    const chunks: number[][] = [];
    for (let i = 0; i < productIds.length; i += PRODUCT_IDS_CHUNK_SIZE) {
        chunks.push(productIds.slice(i, i + PRODUCT_IDS_CHUNK_SIZE));
    }

    const results = await Promise.all(
        chunks.map(async (chunk) => {
            const sp = new URLSearchParams({
                status: "PENDING",
                product_ids: chunk.join(","),
            });
            const res = await http<{ data: unknown[] }>(
                `/api/manufacturing/financial-management/price-control/cost-change-requests?${sp.toString()}`,
            );

            return (res.data ?? [])
                .map((item): PendingCostRequestLookupRow | null => {
                    if (!isRecord(item)) return null;

                    const productId = relationId(item.product_id, "product_id");
                    if (productId === null) return null;

                    return {
                        product_id: productId,
                        proposed_cost: toNullableNumber(item.proposed_cost),
                    };
                })
                .filter((row): row is PendingCostRequestLookupRow => row !== null);
        }),
    );

    return { data: results.flat() };
}

export async function listPriceChangeBatches(query: ListQuery) {
    const sp = new URLSearchParams();
    appendListQuery(sp, query);

    return http<{ data: PriceChangeBatchHeader[]; meta: ListMeta | null }>(
        `/api/manufacturing/financial-management/price-control/price-change-batches?${sp.toString()}`,
    );
}

export async function listUnifiedApprovals(query: ListQuery, scope: "all" | "price" | "cost" = "all") {
    const sp = new URLSearchParams();
    appendListQuery(sp, query);
    sp.set("scope", scope);

    return http<{ data: UnifiedApprovalRow[]; meta: ListMeta | null }>(
        `/api/manufacturing/financial-management/price-control/price-change-approvals?${sp.toString()}`,
    );
}

export async function getPriceChangeBatch(headerId: number) {
    return http<{ data: PriceChangeBatchDetail }>(
        `/api/manufacturing/financial-management/price-control/price-change-batches/${headerId}`,
    );
}

export async function getListCostBatch(headerId: number) {
    return http<{ data: ListCostBatchDetail }>(
        `/api/manufacturing/financial-management/price-control/cost-change-batches/${headerId}`,
    );
}

export async function getUnifiedBatch(headerId: number) {
    return http<{ data: UnifiedBatchDetail }>(
        `/api/manufacturing/financial-management/price-control/unified-batches/${headerId}`,
    );
}

export async function createPriceChangeBatch(payload: CreatePriceChangeBatchPayload) {
    return http<{
        data: PriceChangeBatchHeader;
        created: number;
        skipped_duplicates?: number;
        skipped_existing_pending?: number;
    }>(`/api/manufacturing/financial-management/price-control/price-change-batches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

type ApprovalResponse = {
    ok: boolean;
    committed?: boolean;
    header_id: number;
    affected: number;
    applied?: number;
    failed?: number;
    scheduled?: boolean;
    application_status?: string | null;
    effective_at?: string | null;
    warning?: string | null;
    retryable?: boolean;
};

export type BatchDecisionKind = "price_batch" | "cost_batch" | "mixed_batch";
export type BatchDecisionStatus = "APPROVED" | "REJECTED";

type BatchDecisionSnapshot = {
    status?: string | null;
    application_status?: string | null;
    application_error?: string | null;
    details?: Array<{ status?: string | null }>;
    price_details?: Array<{
        status?: string | null;
        application_status?: string | null;
        application_error?: string | null;
    }>;
    cost_details?: Array<{
        status?: string | null;
        application_status?: string | null;
        application_error?: string | null;
    }>;
};

function decisionDetails(kind: BatchDecisionKind, data: BatchDecisionSnapshot) {
    if (kind === "mixed_batch") {
        return [...(data.price_details ?? []), ...(data.cost_details ?? [])];
    }
    return data.details ?? [];
}

async function readBatchDecision(kind: BatchDecisionKind, headerId: number) {
    if (kind === "price_batch") return (await getPriceChangeBatch(headerId)).data as BatchDecisionSnapshot;
    if (kind === "cost_batch") return (await getListCostBatch(headerId)).data as BatchDecisionSnapshot;
    return (await getUnifiedBatch(headerId)).data as BatchDecisionSnapshot;
}

export async function waitForBatchDecision(args: {
    kind: BatchDecisionKind;
    headerId: number;
    expectedStatus: BatchDecisionStatus;
    expectedApplicationStatus?: "APPLIED" | "SCHEDULED";
    timeoutMs?: number;
    intervalMs?: number;
}) {
    const timeoutMs = args.timeoutMs ?? 30_000;
    const intervalMs = args.intervalMs ?? 750;
    const startedAt = Date.now();
    let lastError: unknown = null;

    while (Date.now() - startedAt <= timeoutMs) {
        try {
            const data = await readBatchDecision(args.kind, args.headerId);
            const details = decisionDetails(args.kind, data);
            const headerReached = String(data.status ?? "").toUpperCase() === args.expectedStatus;
            const detailsReached = details.length > 0 && details.every(
                (detail) => String(detail.status ?? "").toUpperCase() === args.expectedStatus,
            );
            const applicationDetails = details as Array<{
                application_status?: string | null;
                application_error?: string | null;
            }>;
            const applicationReached = !args.expectedApplicationStatus || (
                String(data.application_status ?? "").toUpperCase() === args.expectedApplicationStatus &&
                applicationDetails.length > 0 &&
                applicationDetails.every(
                    (detail) => String(detail.application_status ?? "").toUpperCase() === args.expectedApplicationStatus,
                )
            );
            const failedApplication = [
                { application_status: data.application_status, application_error: data.application_error },
                ...applicationDetails,
            ].find((row) => String(row.application_status ?? "").toUpperCase() === "FAILED");

            if (failedApplication) {
                throw new Error(
                    failedApplication.application_error ||
                    "One or more pricing changes failed to apply. Retry the application from the batch details.",
                );
            }

            if (headerReached && detailsReached && applicationReached) return data;
            lastError = null;
        } catch (error: unknown) {
            lastError = error;
        }

        await new Promise<void>((resolve) => window.setTimeout(resolve, intervalMs));
    }

    if (lastError instanceof Error) {
        throw lastError;
    }
    throw new Error(`The request did not reach ${args.expectedStatus} within ${Math.round(timeoutMs / 1000)} seconds.`);
}

export type ScheduledOverrideKind = "price_request" | "price_batch" | "cost_request" | "cost_batch" | "mixed_batch";
export type ScheduledOverrideAction = "apply_now" | "reject_schedule" | "retry_application";

export type ScheduledOverrideResponse = {
    ok: boolean;
    kind: ScheduledOverrideKind;
    action: ScheduledOverrideAction;
    id: number;
    affected?: number;
};

function approvalBody(effectiveAt?: string | null) {
    return {
        action: "approve",
        ...(effectiveAt ? { effective_at: effectiveAt } : {}),
    };
}

export async function overrideScheduledPriceChange(payload: {
    kind: ScheduledOverrideKind;
    id: number;
    action: ScheduledOverrideAction;
    reject_reason?: string;
}) {
    return http<ScheduledOverrideResponse>(`/api/manufacturing/financial-management/price-control/scheduled-price-changes/override`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function approvePriceChangeBatch(headerId: number, effectiveAt?: string | null) {
    return http<ApprovalResponse>(
        `/api/manufacturing/financial-management/price-control/price-change-batches/${headerId}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(approvalBody(effectiveAt)),
        },
    );
}

export async function approveListCostBatch(headerId: number, effectiveAt?: string | null) {
    return http<ApprovalResponse>(
        `/api/manufacturing/financial-management/price-control/cost-change-batches/${headerId}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(approvalBody(effectiveAt)),
        },
    );
}

export async function rejectPriceChangeBatch(headerId: number, reject_reason: string) {
    return http<{ ok: boolean; header_id: number; rejected: number }>(
        `/api/manufacturing/financial-management/price-control/price-change-batches/${headerId}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reject", reject_reason }),
        },
    );
}

export async function rejectListCostBatch(headerId: number, reject_reason: string) {
    return http<{ ok: boolean; header_id: number; rejected: number }>(
        `/api/manufacturing/financial-management/price-control/cost-change-batches/${headerId}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reject", reject_reason }),
        },
    );
}

export async function approveUnifiedBatch(headerId: number, effectiveAt?: string | null) {
    return http<ApprovalResponse>(
        `/api/manufacturing/financial-management/price-control/unified-batches/${headerId}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(approvalBody(effectiveAt)),
        },
    );
}

export async function retryUnifiedBatch(headerId: number) {
    return http<ApprovalResponse>(
        `/api/manufacturing/financial-management/price-control/unified-batches/${headerId}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "retry_application" }),
        },
    );
}

export async function rejectUnifiedBatch(headerId: number, reject_reason: string) {
    return http<{ ok: boolean; header_id: number; rejected: number }>(
        `/api/manufacturing/financial-management/price-control/unified-batches/${headerId}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "reject", reject_reason }),
        },
    );
}
