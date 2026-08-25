// src/modules/supply-chain-management/product-pricing-management/product-pricing/providers/pricingApi.ts
import type {
    Brand,
    Category,
    MatrixRow,
    PriceRow,
    PriceType,
    ProductRow,
    Unit,
    UpsertLine,
    Supplier,
    ProductType,
    PriceChangeRequest,
    CostChangeRequest,
    PriceChangeBatchLineInput,
    SavePriceChangeBatchInput,
} from "../types";
import { http } from "./fetchProvider";

type ProductsMeta = {
    total?: number;
    page?: number;
    page_size?: number;
    pageCount?: number;
    [key: string]: string | number | boolean | null | undefined;
};

export async function getPriceTypes() {
    return http<{ data: PriceType[] }>("/api/manufacturing/financial-management/price-control/price-types");
}

export async function createPriceType(data: Partial<PriceType>) {
    return http<{ data: PriceType }>("/api/manufacturing/financial-management/price-control/price-types", {
        method: "POST",
        body: JSON.stringify(data),
    });
}

export async function updatePriceType(id: number, data: Partial<PriceType>) {
    return http<{ data: PriceType }>(`/api/manufacturing/financial-management/price-control/price-types/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
    });
}

export async function deletePriceType(id: number) {
    return http<{ ok: boolean }>(`/api/manufacturing/financial-management/price-control/price-types/${id}`, {
        method: "DELETE",
    });
}

export async function getLookups(params?: {
    supplier_ids?: string;
    supplier_scope?: "ALL" | "LINKED_ONLY";
    category_id?: string;
    brand_id?: string;
}) {
    const sp = new URLSearchParams();
    if (params?.supplier_ids) sp.set("supplier_ids", String(params.supplier_ids));
    if (params?.supplier_scope) sp.set("supplier_scope", String(params.supplier_scope));
    if (params?.category_id) sp.set("category_id", String(params.category_id));
    if (params?.brand_id) sp.set("brand_id", String(params.brand_id));

    const qs = sp.toString();
    return http<{ data: { categories: Category[]; brands: Brand[]; units: Unit[]; suppliers?: Supplier[]; productTypes?: ProductType[] } }>(
        `/api/manufacturing/financial-management/price-control/lookups${qs ? `?${qs}` : ""}`,
    );
}

export async function getProducts(params: {
    q?: string;
    category_id?: string;
    category_ids?: string;
    brand_id?: string;
    brand_ids?: string;
    unit_id?: string;
    unit_ids?: string;
    supplier_id?: string;
    supplier_ids?: string;
    supplier_scope?: "ALL" | "LINKED_ONLY";
    active_only?: "0" | "1";
    missing_tier?: "0" | "1";
    page?: string;
    page_size?: string;
}) {
    const sp = new URLSearchParams();

    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        const s = String(v).trim();
        if (!s || s === "undefined" || s === "null") continue;
        sp.set(k, s);
    }

    return http<{ data: ProductRow[]; meta: ProductsMeta }>(
        `/api/manufacturing/financial-management/price-control/products?${sp.toString()}`,
    );
}

export async function getMatrixPage(params: {
    q?: string;
    category_id?: string;
    category_ids?: string;
    brand_id?: string;
    brand_ids?: string;
    unit_id?: string;
    unit_ids?: string;
    supplier_id?: string;
    supplier_ids?: string;
    supplier_scope?: "ALL" | "LINKED_ONLY";
    active_only?: "0" | "1";
    missing_tier?: "0" | "1";
    page?: string;
    page_size?: string;
    pending_product_ids?: string;
    product_type_ids?: string;
    show_versions?: "0" | "1";
}) {
    const sp = new URLSearchParams();

    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        const s = String(v).trim();
        if (!s || s === "undefined" || s === "null") continue;
        sp.set(k, s);
    }

    return http<{
        data: ProductRow[];
        meta: ProductsMeta;
        prices: PriceRow[];
        pending_price_requests: PriceChangeRequest[];
        pending_cost_requests: CostChangeRequest[];
    }>(`/api/manufacturing/financial-management/price-control/products/matrix-page?${sp.toString()}`);
}

export type PrintFilterParams = {
    q?: string;
    category_id?: string;
    category_ids?: string;
    brand_id?: string;
    brand_ids?: string;
    unit_id?: string;
    unit_ids?: string;
    supplier_id?: string;
    supplier_ids?: string;
    supplier_scope?: "ALL" | "LINKED_ONLY";
    active_only?: "0" | "1";
    missing_tier?: "0" | "1";
    product_type_ids?: string;
};

export type PrintMatrixMetaResponse = {
    meta: {
        totalGroups: number;
        totalVariants: number;
    };
    groupIds: number[];
};

export type PrintMatrixPageResponse = {
    data: MatrixRow[];
    usedUnitIds: number[];
};

function buildPrintSearchParams(params: PrintFilterParams): URLSearchParams {
    const sp = new URLSearchParams();

    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue;
        const s = String(v).trim();
        if (!s || s === "undefined" || s === "null") continue;
        sp.set(k, s);
    }

    return sp;
}

export async function getPrintProducts(params: PrintFilterParams) {
    const sp = buildPrintSearchParams(params);

    return http<{ data: ProductRow[] }>(
        `/api/manufacturing/financial-management/price-control/print/products?${sp.toString()}`,
    );
}

export async function getPrintMatrixMeta(params: PrintFilterParams, init?: RequestInit) {
    const sp = buildPrintSearchParams(params);
    sp.set("step", "meta");

    return http<PrintMatrixMetaResponse>(
        `/api/manufacturing/financial-management/price-control/print/matrix?${sp.toString()}`,
        init,
    );
}

export async function getPrintMatrixPage(
    params: PrintFilterParams & { group_ids: string },
    init?: RequestInit,
) {
    const sp = buildPrintSearchParams(params);
    sp.set("step", "page");
    sp.set("group_ids", params.group_ids);

    return http<PrintMatrixPageResponse>(
        `/api/manufacturing/financial-management/price-control/print/matrix?${sp.toString()}`,
        init,
    );
}

export async function getPricesForProducts(productIds: number[], init?: RequestInit) {
    if (productIds.length === 0) {
        return { data: [] as PriceRow[] };
    }

    const CHUNK_SIZE = 200;
    const chunks: number[][] = [];
    for (let i = 0; i < productIds.length; i += CHUNK_SIZE) {
        chunks.push(productIds.slice(i, i + CHUNK_SIZE));
    }

    const results = await Promise.all(
        chunks.map(async (chunk) => {
            const sp = new URLSearchParams({ product_ids: chunk.join(",") });
            return http<{ data: PriceRow[] }>(
                `/api/manufacturing/financial-management/price-control/prices?${sp.toString()}`,
                init,
            );
        }),
    );

    const data = results.flatMap((res) => res.data ?? []);
    return { data };
}

export async function upsertPrices(lines: UpsertLine[]) {
    return http<{ ok: boolean; affected: number }>(`/api/manufacturing/financial-management/price-control/prices-upsert`, {
        method: "POST",
        body: JSON.stringify({ lines }),
    });
}

export async function upsertVersionPrices(lines: { version_id: number; price_type_id: number; price_per_unit: number | null }[]) {
    return http<{ ok: boolean; affected: number }>(`/api/manufacturing/financial-management/price-control/version-prices-upsert`, {
        method: "POST",
        body: JSON.stringify({ lines }),
    });
}

export async function createPriceChangeBatch(
    batch: SavePriceChangeBatchInput,
    lines: PriceChangeBatchLineInput[],
) {
    return http<{
        data: { id: number; header_id: number; line_count?: number };
        created: number;
        skipped_duplicates?: number;
        skipped_existing_pending?: number;
    }>(`/api/manufacturing/financial-management/price-control/price-change-batches`, {
        method: "POST",
        body: JSON.stringify({
            supplier_id: batch.supplier_id,
            reference_no: batch.reference_no,
            remarks: batch.remarks,
            lines,
        }),
    });
}

export async function bulkUpdateProducts(items: { product_id: number; cost_per_unit: number | null }[]) {
    return http<{ ok: boolean; affected: number }>(`/api/manufacturing/financial-management/price-control/products/bulk-patch`, {
        method: "POST",
        body: JSON.stringify({ items }),
    });
}

export async function createCostChangeRequests(
    payload: {
        items: {
            product_id: number;
            proposed_cost: number;
            current_cost?: number | null;
        }[];
        supplier_id: number;
        reference_no?: string;
        remarks?: string;
    },
) {
    return http<{
        created: number;
        header_id?: number;
        reference_no?: string | null;
        skipped_duplicates?: number;
        skipped_existing_pending?: number;
    }>(`/api/manufacturing/financial-management/price-control/cost-change-requests/bulk`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

export type MixedSavePreflightSide = {
    would_create: number;
    skipped_duplicates?: number;
    skipped_existing_pending?: number;
};

export type MixedSaveResponse = {
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
};

export async function saveMixedPricingChanges(payload: {
    batch: SavePriceChangeBatchInput;
    price_lines: PriceChangeBatchLineInput[];
    cost_items: {
        product_id: number;
        proposed_cost: number;
        current_cost?: number | null;
    }[];
}) {
    return http<MixedSaveResponse>(`/api/manufacturing/financial-management/price-control/mixed-save`, {
        method: "POST",
        body: JSON.stringify(payload),
    });
}

export async function getPendingPriceRequests(productIds: number[]) {
    if (productIds.length === 0) return { data: [] as PriceChangeRequest[] };

    const sp = new URLSearchParams({
        status: "PENDING",
        product_ids: productIds.join(","),
    });
    return http<{ data: PriceChangeRequest[] }>(`/api/manufacturing/financial-management/price-control/price-change-requests?${sp.toString()}`);
}

export async function getPendingCostRequests(productIds: number[]) {
    if (productIds.length === 0) return { data: [] as CostChangeRequest[] };

    const sp = new URLSearchParams({
        status: "PENDING",
        product_ids: productIds.join(","),
    });
    return http<{ data: CostChangeRequest[] }>(`/api/manufacturing/financial-management/price-control/cost-change-requests?${sp.toString()}`);
}
