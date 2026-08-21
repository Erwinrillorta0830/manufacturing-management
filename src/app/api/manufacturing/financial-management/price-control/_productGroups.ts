import {
    chunkArray,
    DEFAULT_PAGE_SIZE,
    fetchAllPages,
    fetchOnePage,
    getChildProductIdsForParents,
    getSupplierProductIdsForSuppliers,
} from "./_directusPaging";
import { buildGroupIndexCacheKey, getOrBuildGroupIndex } from "./_productGroupIndexCache";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const PRODUCTS = "products";
const SUPPLIERS = "suppliers";

export type ProductRow = {
    product_id?: number | string | null;
    parent_id?: number | string | { product_id?: number | string | null; id?: number | string | null } | null;
    product_code?: string | null;
    barcode?: string | null;
    product_name?: string | null;
    isActive?: number | string | null;
    product_category?: number | string | null;
    product_brand?: number | string | null;
    unit_of_measurement?: number | string | null;
    price_per_unit?: number | string | null;
    priceA?: number | string | null;
    priceB?: number | string | null;
    priceC?: number | string | null;
    priceD?: number | string | null;
    priceE?: number | string | null;
    cost_per_unit?: number | string | null;
    __group_id?: number | null;
};

export type ProductGroupEntry = {
    group_id: number;
    display: ProductRow;
    variants: ProductRow[];
    variant_product_ids: number[];
};

export const PRODUCT_LIST_FIELDS = [
    "product_id",
    "parent_id",
    "product_code",
    "barcode",
    "product_name",
    "isActive",
    "product_category",
    "product_brand",
    "unit_of_measurement",
    "price_per_unit",
    "priceA",
    "priceB",
    "priceC",
    "priceD",
    "priceE",
    "cost_per_unit",
].join(",");

type SupplierRow = {
    id?: number | string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function directusToken() {
    return process.env.DIRECTUS_STATIC_TOKEN || process.env.DIRECTUS_SERVICE_TOKEN || "";
}

function directusHeaders(): Record<string, string> {
    const token = directusToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

function mergeHeaders(initHeaders?: HeadersInit): HeadersInit {
    return {
        ...directusHeaders(),
        ...(initHeaders instanceof Headers ? Object.fromEntries(initHeaders.entries()) : initHeaders ?? {}),
    };
}

async function fetchDirectusRaw(url: string, init?: RequestInit) {
    const res = await fetch(url, {
        cache: "no-store",
        ...init,
        headers: mergeHeaders(init?.headers),
    });

    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text };
}

function uniqNums(arr: number[]) {
    return Array.from(new Set(arr.filter((n) => Number.isFinite(n) && n > 0)));
}

export function pickId(v: unknown): number | null {
    if (v === null || v === undefined) return null;

    if (typeof v === "number") return Number.isFinite(v) ? v : null;

    if (typeof v === "string") {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    if (isRecord(v)) {
        const candidates: unknown[] = [
            v.product_id,
            v.id,
            isRecord(v.data) ? v.data.product_id : undefined,
            isRecord(v.data) ? v.data.id : undefined,
        ];

        for (const candidate of candidates) {
            const n = Number(candidate);
            if (Number.isFinite(n) && n > 0) return n;
        }
    }

    return null;
}

export function normalizeProductRow(row: ProductRow): ProductRow {
    const parentId = pickId(row.parent_id);
    return { ...row, parent_id: parentId ?? null };
}

export function groupKey(product: ProductRow): number {
    const parentId = pickId(product.parent_id);
    if (parentId) return parentId;

    const selfId = pickId(product.product_id);
    return selfId ?? 0;
}

export async function resolveSupplierId(input: string): Promise<string> {
    if (!DIRECTUS_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not set");

    const asNum = Number(input);
    if (Number.isFinite(asNum) && asNum > 0) return String(asNum);

    const sp = new URLSearchParams();
    sp.set("limit", "5");
    sp.set("fields", "id,supplier_name,supplier_shortcut");
    sp.set("filter[_or][0][supplier_shortcut][_eq]", input);
    sp.set("filter[_or][1][supplier_name][_contains]", input);

    const url = `${DIRECTUS_URL}/items/${SUPPLIERS}?${sp.toString()}`;
    const { ok, status, text } = await fetchDirectusRaw(url);

    if (!ok) {
        throw new Error(
            JSON.stringify({
                message: "Directus request failed (suppliers resolve)",
                status,
                url,
                body: text,
            }),
        );
    }

    const json = JSON.parse(text) as { data?: SupplierRow[] };
    const first = (json.data ?? [])[0];
    const id = pickId(first?.id);
    if (!id) return "";
    return String(id);
}

export function applyCommonFilters(args: {
    params: URLSearchParams;
    q: string;
    categoryIds: string[];
    brandIds: string[];
    unitIds: string[];
    activeOnly: boolean;
    missingTier: boolean;
    productIdsIn?: number[];
}) {
    const { params, q, categoryIds, brandIds, unitIds, activeOnly, missingTier, productIdsIn } = args;

    let andIdx = 0;
    const addAnd = (suffix: string, value: string) => {
        params.set(`filter[_and][${andIdx}]${suffix}`, value);
        andIdx += 1;
    };

    if (activeOnly) addAnd("[isActive][_eq]", "1");

    if (categoryIds.length > 0) addAnd("[product_category][_in]", categoryIds.join(","));
    if (brandIds.length > 0) addAnd("[product_brand][_in]", brandIds.join(","));
    if (unitIds.length > 0) addAnd("[unit_of_measurement][_in]", unitIds.join(","));

    if (q) {
        addAnd("[_or][0][product_name][_contains]", q);
        params.set(`filter[_and][${andIdx - 1}][_or][1][product_code][_contains]`, q);
        params.set(`filter[_and][${andIdx - 1}][_or][2][barcode][_contains]`, q);
    }

    if (missingTier) {
        addAnd("[_or][0][priceA][_null]", "true");
        params.set(`filter[_and][${andIdx - 1}][_or][1][priceB][_null]`, "true");
        params.set(`filter[_and][${andIdx - 1}][_or][2][priceC][_null]`, "true");
        params.set(`filter[_and][${andIdx - 1}][_or][3][priceD][_null]`, "true");
        params.set(`filter[_and][${andIdx - 1}][_or][4][priceE][_null]`, "true");
    }

    if (productIdsIn && productIdsIn.length > 0) {
        addAnd("[product_id][_in]", productIdsIn.join(","));
    }
}

export type ProductCatalogFilters = {
    q?: string;
    categoryIds?: string[];
    brandIds?: string[];
    unitIds?: string[];
    activeOnly?: boolean;
    missingTier?: boolean;
};

export type GroupIndexEntry = {
    group_id: number;
    sort_name: string;
};

function buildFilteredProductParams(
    args: ProductCatalogFilters & { productIdsIn?: number[] },
    offset: number,
    limit: number,
): URLSearchParams {
    const {
        q = "",
        categoryIds = [],
        brandIds = [],
        unitIds = [],
        activeOnly = true,
        missingTier = false,
        productIdsIn,
    } = args;

    const params = new URLSearchParams();
    params.set("fields", PRODUCT_LIST_FIELDS);
    params.set("sort", "product_name");
    applyCommonFilters({
        params,
        q,
        categoryIds,
        brandIds,
        unitIds,
        activeOnly,
        missingTier,
        productIdsIn,
    });
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    return params;
}

export function ingestVariantsIntoGroupIndex(
    index: Map<number, string>,
    variants: ProductRow[],
): void {
    for (const row of variants) {
        const gid = groupKey(row);
        if (!gid) continue;

        const name = String(row.product_name ?? "");
        const existing = index.get(gid);
        if (existing === undefined) {
            index.set(gid, name);
            continue;
        }

        if (name.localeCompare(existing) < 0) {
            index.set(gid, name);
        }
    }
}

export function finalizeGroupIndex(index: Map<number, string>): GroupIndexEntry[] {
    return Array.from(index.entries())
        .map(([group_id, sort_name]) => ({ group_id, sort_name }))
        .sort((a, b) => a.sort_name.localeCompare(b.sort_name));
}

async function streamMatchingVariants(
    args: {
        supplierProductIds: number[] | null;
        filters: ProductCatalogFilters;
    },
    onChunk: (rows: ProductRow[]) => boolean | void,
): Promise<number> {
    const { supplierProductIds, filters } = args;
    let totalVariants = 0;

    const streamProductIds = async (productIdsIn?: number[]) => {
        let offset = 0;

        while (true) {
            const { rows } = await fetchOnePage<ProductRow>(
                PRODUCTS,
                (pageOffset, pageLimit) =>
                    buildFilteredProductParams(
                        { ...filters, productIdsIn },
                        pageOffset,
                        pageLimit,
                    ),
                offset,
                DEFAULT_PAGE_SIZE,
            );

            if (rows.length === 0) break;

            const normalized = rows.map(normalizeProductRow);
            totalVariants += normalized.length;

            const shouldContinue = onChunk(normalized);
            if (shouldContinue === false) return false;

            if (rows.length < DEFAULT_PAGE_SIZE) break;
            offset += DEFAULT_PAGE_SIZE;
        }

        return true;
    };

    if (!supplierProductIds) {
        await streamProductIds();
        return totalVariants;
    }

    if (supplierProductIds.length === 0) {
        return 0;
    }

    for (const productIdsIn of chunkArray(supplierProductIds, 150)) {
        const shouldContinue = await streamProductIds(productIdsIn);
        if (shouldContinue === false) break;
    }

    return totalVariants;
}

export async function buildGroupIndex(args: {
    supplierProductIds: number[] | null;
    filters: ProductCatalogFilters;
}): Promise<{ groups: GroupIndexEntry[]; totalVariants: number }> {
    const key = buildGroupIndexCacheKey(args.filters, args.supplierProductIds);

    return getOrBuildGroupIndex(key, async () => {
        const index = new Map<number, string>();

        const totalVariants = await streamMatchingVariants(args, (rows) => {
            ingestVariantsIntoGroupIndex(index, rows);
        });

        return {
            groups: finalizeGroupIndex(index),
            totalVariants,
        };
    });
}

export async function fetchPaginatedProductGroups(args: {
    page: number;
    pageSize: number;
    supplierProductIds: number[] | null;
    filters: ProductCatalogFilters;
}): Promise<{
    pageGroups: ProductGroupEntry[];
    totalGroups: number;
    totalVariants: number;
    safePage: number;
}> {
    const { page, pageSize, supplierProductIds, filters } = args;
    const { groups: groupIndex, totalVariants } = await buildGroupIndex({
        supplierProductIds,
        filters,
    });

    const totalGroups = groupIndex.length;
    const totalPages = totalGroups > 0 ? Math.ceil(totalGroups / pageSize) : 0;
    const safePage = Math.min(Math.max(1, page), Math.max(1, totalPages || 1));
    const start = (safePage - 1) * pageSize;
    const pageIndex = groupIndex.slice(start, start + pageSize);

    const pageGroups: ProductGroupEntry[] = pageIndex.map((entry) => ({
        group_id: entry.group_id,
        display: {
            product_id: entry.group_id,
            product_name: entry.sort_name,
        },
        variants: [],
        variant_product_ids: [],
    }));

    const completeByGroup = await fetchCompleteVariantsForGroups({
        groupIds: pageGroups.map((group) => group.group_id),
        activeOnly: filters.activeOnly ?? true,
        unitIds: filters.unitIds,
    });

    mergeCompleteVariantsIntoGroups(pageGroups, completeByGroup);

    return {
        pageGroups,
        totalGroups,
        totalVariants,
        safePage,
    };
}

export async function resolveSupplierScopedProductIds(args: {
    supplierScope: "ALL" | "LINKED_ONLY";
    supplierIdsRaw: string[];
}): Promise<number[] | null> {
    const { supplierScope, supplierIdsRaw } = args;

    if (supplierScope !== "LINKED_ONLY" || supplierIdsRaw.length === 0) {
        return null;
    }

    const resolvedSupplierIds: string[] = [];
    for (const supplierRaw of supplierIdsRaw) {
        const supplierId = await resolveSupplierId(supplierRaw);
        if (supplierId) resolvedSupplierIds.push(supplierId);
    }

    const directIds = uniqNums(await getSupplierProductIdsForSuppliers(resolvedSupplierIds));
    if (directIds.length === 0) return [];

    const childIds = await getChildProductIdsForParents(directIds);
    return uniqNums([...directIds, ...childIds]);
}

export async function fetchProductRows(args: ProductCatalogFilters & { productIdsIn?: number[] }): Promise<ProductRow[]> {
    const {
        q = "",
        categoryIds = [],
        brandIds = [],
        unitIds = [],
        activeOnly = true,
        missingTier = false,
        productIdsIn,
    } = args;

    const rows = await fetchAllPages<ProductRow>(PRODUCTS, () => {
        const params = new URLSearchParams();
        params.set("fields", PRODUCT_LIST_FIELDS);
        params.set("sort", "product_name");
        applyCommonFilters({
            params,
            q,
            categoryIds,
            brandIds,
            unitIds,
            activeOnly,
            missingTier,
            productIdsIn,
        });
        return params;
    });

    return rows.map(normalizeProductRow);
}

export async function fetchAllMatchingVariants(args: {
    supplierProductIds: number[] | null;
    filters: ProductCatalogFilters;
}): Promise<ProductRow[]> {
    const { supplierProductIds, filters } = args;

    if (!supplierProductIds) {
        return fetchProductRows(filters);
    }

    if (supplierProductIds.length === 0) {
        return [];
    }

    const idChunks = chunkArray(supplierProductIds, 150);
    const arrays = await Promise.all(idChunks.map((ids) => fetchProductRows({ ...filters, productIdsIn: ids })));

    const byId = new Map<number, ProductRow>();
    for (const arr of arrays) {
        for (const row of arr) {
            const id = pickId(row.product_id);
            if (id) byId.set(id, row);
        }
    }

    return Array.from(byId.values());
}

export function buildGroupEntries(allVariants: ProductRow[]): ProductGroupEntry[] {
    const groups = new Map<number, ProductRow[]>();

    for (const product of allVariants) {
        const gid = groupKey(product);
        if (!gid) continue;

        const existing = groups.get(gid);
        if (existing) {
            existing.push(product);
        } else {
            groups.set(gid, [product]);
        }
    }

    const entries = Array.from(groups.entries()).map(([gid, variants]) => {
        const display =
            variants.find((v) => Number(v.product_id) === Number(gid)) ??
            variants.find((v) => v.parent_id == null) ??
            variants[0];

        const variantProductIds = variants
            .map((v) => pickId(v.product_id))
            .filter((id): id is number => id !== null);

        return {
            group_id: gid,
            display,
            variants,
            variant_product_ids: Array.from(new Set(variantProductIds)),
        };
    });

    entries.sort((a, b) =>
        String(a.display?.product_name ?? "").localeCompare(String(b.display?.product_name ?? "")),
    );

    return entries;
}

export async function fetchCompleteVariantsForGroups(args: {
    groupIds: number[];
    activeOnly: boolean;
    unitIds?: string[];
}): Promise<Map<number, ProductRow[]>> {
    const { groupIds, activeOnly, unitIds = [] } = args;
    const fetchedGroups = new Map<number, ProductRow[]>();

    if (groupIds.length === 0) return fetchedGroups;

    const fetchedVariants: ProductRow[] = [];
    for (const groupIdChunk of chunkArray(groupIds, 150)) {
        const rows = await fetchAllPages<ProductRow>(PRODUCTS, () => {
            const params = new URLSearchParams();
            params.set("fields", PRODUCT_LIST_FIELDS);

            let andIdx = 0;
            const addAnd = (suffix: string, value: string) => {
                params.set(`filter[_and][${andIdx}]${suffix}`, value);
                andIdx += 1;
            };

            if (activeOnly) {
                addAnd("[isActive][_eq]", "1");
            }

            addAnd("[_or][0][product_id][_in]", groupIdChunk.join(","));
            params.set(`filter[_and][${andIdx - 1}][_or][1][parent_id][_in]`, groupIdChunk.join(","));
            return params;
        });
        fetchedVariants.push(...rows.map(normalizeProductRow));
    }

    for (const v of fetchedVariants) {
        const gid = groupKey(v);
        if (!gid) continue;

        let variants = fetchedGroups.get(gid);
        if (variants) {
            variants.push(v);
        } else {
            variants = [v];
            fetchedGroups.set(gid, variants);
        }
    }

    if (unitIds.length > 0) {
        for (const [gid, variants] of fetchedGroups) {
            fetchedGroups.set(
                gid,
                variants.filter((v) => v.unit_of_measurement && unitIds.includes(String(v.unit_of_measurement))),
            );
        }
    }

    return fetchedGroups;
}

export function mergeCompleteVariantsIntoGroups(
    groupEntries: ProductGroupEntry[],
    completeByGroup: Map<number, ProductRow[]>,
): void {
    for (const group of groupEntries) {
        const completeVariants = completeByGroup.get(group.group_id) ?? [];
        if (completeVariants.length === 0) continue;

        group.variants = completeVariants;
        group.variant_product_ids = Array.from(
            new Set(
                completeVariants
                    .map((v) => pickId(v.product_id))
                    .filter((id): id is number => id !== null),
            ),
        );
        group.display =
            completeVariants.find((v) => Number(v.product_id) === Number(group.group_id)) ??
            completeVariants.find((v) => v.parent_id == null) ??
            completeVariants[0];
    }
}

export async function buildSupplierProductGroups(args: {
    supplierScope: "ALL" | "LINKED_ONLY";
    supplierIdsRaw: string[];
    filters: ProductCatalogFilters;
}): Promise<{ groups: ProductGroupEntry[]; totalVariants: number }> {
    const supplierProductIds = await resolveSupplierScopedProductIds({
        supplierScope: args.supplierScope,
        supplierIdsRaw: args.supplierIdsRaw,
    });

    if (supplierProductIds && supplierProductIds.length === 0) {
        return { groups: [], totalVariants: 0 };
    }

    const allVariants = await fetchAllMatchingVariants({
        supplierProductIds,
        filters: args.filters,
    });

    const groups = buildGroupEntries(allVariants);

    const completeByGroup = await fetchCompleteVariantsForGroups({
        groupIds: groups.map((g) => g.group_id),
        activeOnly: args.filters.activeOnly ?? true,
        unitIds: args.filters.unitIds,
    });

    mergeCompleteVariantsIntoGroups(groups, completeByGroup);

    const totalVariants = groups.reduce((sum, group) => sum + group.variants.length, 0);

    return { groups, totalVariants };
}

export async function fetchProductsByIds(productIds: number[], activeOnly = true): Promise<ProductRow[]> {
    if (productIds.length === 0) return [];

    const idChunks = chunkArray(productIds, 200);
    const arrays = await Promise.all(
        idChunks.map((ids) =>
            fetchProductRows({
                activeOnly,
                productIdsIn: ids,
            }),
        ),
    );

    const byId = new Map<number, ProductRow>();
    for (const arr of arrays) {
        for (const row of arr) {
            const id = pickId(row.product_id);
            if (id) byId.set(id, row);
        }
    }

    return Array.from(byId.values());
}
