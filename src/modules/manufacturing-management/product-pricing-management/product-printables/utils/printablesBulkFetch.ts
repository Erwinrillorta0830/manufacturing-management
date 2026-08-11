import type { Brand, Category, FilterState, MatrixRow, PriceType, ProductRow, VariantCell } from "../types";
import { getPricesForProducts } from "../../product-pricing/providers/pricingApi";
import { emptyPivot, pivotPrices } from "../../product-pricing/utils/pivot";

export const PRINTABLES_EXPORT_PAGE_SIZE = 250;

type PrintablesMeta = {
    total_groups?: number;
    total_pages?: number;
    page?: number;
    page_size?: number;
};

type PrintablesPageResponse = {
    data?: ProductRow[];
    meta?: PrintablesMeta;
    error?: string;
};

type PrintablesProgress = {
    done: number;
    total: number;
};

function pickId(v: string | number | null | undefined | Record<string, unknown>): number | null {
    if (v === null || v === undefined) return null;
    const n = Number((v as Record<string, unknown>)?.product_id ?? (v as Record<string, unknown>)?.id ?? v);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function countProductGroups(rows: ProductRow[] | undefined): number {
    const groupIds = new Set<number>();
    for (const row of rows ?? []) {
        const groupId = pickId(row.parent_id) ?? pickId(row.product_id);
        if (groupId !== null) {
            groupIds.add(groupId);
        }
    }
    return groupIds.size;
}

export function buildPrintablesSearchParams(
    filters: FilterState,
    page: number,
    pageSize: number,
): URLSearchParams {
    const sp = new URLSearchParams();
    if (filters.q) sp.set("q", filters.q);
    if (filters.category_ids.length) sp.set("category_ids", filters.category_ids.join(","));
    if (filters.brand_ids.length) sp.set("brand_ids", filters.brand_ids.join(","));
    if (filters.unit_ids.length) sp.set("unit_ids", filters.unit_ids.join(","));
    if (filters.supplier_ids.length) sp.set("supplier_ids", filters.supplier_ids.join(","));
    sp.set("supplier_scope", filters.supplier_scope);
    sp.set("active_only", filters.active_only ? "1" : "0");
    sp.set("page", String(page));
    sp.set("page_size", String(pageSize));
    return sp;
}

export async function fetchPrintablesPage(
    params: URLSearchParams,
    init?: { signal?: AbortSignal },
): Promise<PrintablesPageResponse> {
    const res = await fetch(`/api/fm/product-pricing/printables?${params.toString()}`, {
        signal: init?.signal,
    });
    const json = (await res.json().catch(() => ({}))) as PrintablesPageResponse;

    if (!res.ok) {
        const message =
            typeof json.error === "string" && json.error.trim()
                ? json.error
                : `Request failed (${res.status})`;
        throw new Error(message);
    }

    return json;
}

export async function fetchAllPrintableProducts(
    filters: FilterState,
    init?: {
        pageSize?: number;
        signal?: AbortSignal;
        onProgress?: (progress: PrintablesProgress) => void;
    },
): Promise<ProductRow[]> {
    const pageSize = init?.pageSize ?? PRINTABLES_EXPORT_PAGE_SIZE;
    const firstPage = await fetchPrintablesPage(buildPrintablesSearchParams(filters, 1, pageSize), {
        signal: init?.signal,
    });
    const totalPages = Math.max(1, Number(firstPage.meta?.total_pages ?? 1));
    const totalGroups = Math.max(0, Number(firstPage.meta?.total_groups ?? 0));
    const productsById = new Map<number, ProductRow>();
    let preparedGroups = 0;

    const mergeProducts = (rows: ProductRow[] | undefined) => {
        for (const row of rows ?? []) {
            const productId = pickId(row.product_id);
            if (productId) {
                productsById.set(productId, row);
            }
        }
    };

    mergeProducts(firstPage.data);
    preparedGroups += countProductGroups(firstPage.data);
    init?.onProgress?.({
        done: totalGroups > 0 ? Math.min(preparedGroups, totalGroups) : preparedGroups,
        total: totalGroups,
    });

    for (let page = 2; page <= totalPages; page++) {
        const pageResult = await fetchPrintablesPage(buildPrintablesSearchParams(filters, page, pageSize), {
            signal: init?.signal,
        });
        mergeProducts(pageResult.data);
        preparedGroups += countProductGroups(pageResult.data);
        init?.onProgress?.({
            done: totalGroups > 0 ? Math.min(preparedGroups, totalGroups) : preparedGroups,
            total: totalGroups,
        });
    }

    return Array.from(productsById.values());
}

export function assembleMatrixRowsFromProducts(
    products: ProductRow[],
    categories: Category[],
    brands: Brand[],
): { matrixRows: MatrixRow[]; usedUnitIds: Set<number> } {
    const catMap = new Map(categories.map((c) => [Number(c.category_id), c.category_name]));
    const brandMap = new Map(brands.map((b) => [Number(b.brand_id), b.brand_name]));
    const groups = new Map<number, ProductRow[]>();
    const unitIds = new Set<number>();

    for (const product of products) {
        const groupId = pickId(product.parent_id) ?? pickId(product.product_id);
        if (groupId === null) continue;

        if (!groups.has(groupId)) groups.set(groupId, []);
        groups.get(groupId)!.push(product);

        const uomId = pickId(product.unit_of_measurement);
        if (uomId) unitIds.add(uomId);
    }

    const matrixRows: MatrixRow[] = [];
    for (const [groupId, variants] of groups.entries()) {
        const display = variants.find((v) => pickId(v.product_id) === groupId) || variants[0];
        const variantsByUnitId: Record<number, VariantCell> = {};

        for (const variant of variants) {
            const uomId = Number(variant.unit_of_measurement);
            if (!Number.isFinite(uomId)) continue;

            variantsByUnitId[uomId] = {
                product: variant,
                tiers: {
                    LIST: variant.cost_per_unit ? Number(variant.cost_per_unit) : null,
                    A: variant.priceA ? Number(variant.priceA) : null,
                    B: variant.priceB ? Number(variant.priceB) : null,
                    C: variant.priceC ? Number(variant.priceC) : null,
                    D: variant.priceD ? Number(variant.priceD) : null,
                    E: variant.priceE ? Number(variant.priceE) : null,
                },
            };
        }

        matrixRows.push({
            group_id: groupId,
            display,
            variantsByUnitId,
            category_name: catMap.get(Number(display.product_category)) || "—",
            brand_name: brandMap.get(Number(display.product_brand)) || "—",
        });
    }

    return { matrixRows, usedUnitIds: unitIds };
}

export async function assembleMatrixRowsWithPrices(
    products: ProductRow[],
    categories: Category[],
    brands: Brand[],
    priceTypes: PriceType[],
    init?: { signal?: AbortSignal },
): Promise<{ matrixRows: MatrixRow[]; usedUnitIds: Set<number> }> {
    const catMap = new Map(categories.map((c) => [Number(c.category_id), c.category_name]));
    const brandMap = new Map(brands.map((b) => [Number(b.brand_id), b.brand_name]));

    const productIds = products
        .map((p) => pickId(p.product_id))
        .filter((id): id is number => id !== null);

    let priceMap = new Map<number, Record<string, number | null>>();
    if (productIds.length > 0) {
        const priceRes = await getPricesForProducts(productIds, { signal: init?.signal });
        priceMap = pivotPrices(priceTypes, priceRes.data ?? []);
    }

    const emptyTierValues = emptyPivot(priceTypes);
    const groups = new Map<number, ProductRow[]>();
    const unitIds = new Set<number>();

    for (const product of products) {
        const groupId = pickId(product.parent_id) ?? pickId(product.product_id);
        if (groupId === null) continue;

        if (!groups.has(groupId)) groups.set(groupId, []);
        groups.get(groupId)!.push(product);

        const uomId = pickId(product.unit_of_measurement);
        if (uomId) unitIds.add(uomId);
    }

    const matrixRows: MatrixRow[] = [];
    for (const [groupId, variants] of groups.entries()) {
        const display = variants.find((v) => pickId(v.product_id) === groupId) || variants[0];
        const variantsByUnitId: Record<number, VariantCell> = {};

        for (const variant of variants) {
            const uomId = Number(variant.unit_of_measurement);
            if (!Number.isFinite(uomId)) continue;

            const pid = pickId(variant.product_id);
            const piv = pid ? (priceMap.get(pid) ?? emptyTierValues) : emptyTierValues;

            variantsByUnitId[uomId] = {
                product: variant,
                tiers: {
            ...piv,
            LIST: variant.cost_per_unit ? Number(variant.cost_per_unit) : null,
                },
            };
        }

        matrixRows.push({
            group_id: groupId,
            display,
            variantsByUnitId,
            category_name: catMap.get(Number(display.product_category)) || "—",
            brand_name: brandMap.get(Number(display.product_brand)) || "—",
        });
    }

    return { matrixRows, usedUnitIds: unitIds };
}
