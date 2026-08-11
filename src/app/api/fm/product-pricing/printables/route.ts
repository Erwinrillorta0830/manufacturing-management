// src/app/api/fm/product-pricing/printables/route.ts
import { NextRequest, NextResponse } from "next/server";

import {
    chunkArray,
    fetchAllPages,
    fetchItemsWhereIn,
    getChildProductIdsForParents,
    getSupplierProductIdsForSuppliers,
} from "../_directusPaging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

const PRODUCTS = "products";
const PRODUCT_PER_SUPPLIER = "product_per_supplier";
const HYDRATE_CHUNK_SIZE = 150;

type ProductRow = {
    product_id: number;
    parent_id: number | null;
    product_code: string | null;
    barcode: string | null;
    product_name: string | null;
    product_category: number | string | null;
    product_brand: number | string | null;
    unit_of_measurement: number | string | null;
    isActive: number | string | null;
    price_per_unit?: number | string | null;
    priceA?: number | string | null;
    priceB?: number | string | null;
    priceC?: number | string | null;
    priceD?: number | string | null;
    priceE?: number | string | null;
};

function pickId(v: unknown): number | null {
    if (v === null || v === undefined) return null;
    const n = Number((v as Record<string, unknown>)?.product_id ?? (v as Record<string, unknown>)?.id ?? v);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Fetch all sibling variants for the given group IDs.
 * Chunked and deduped to avoid oversized Directus _in filters.
 */
async function fetchHydratedVariantsForGroupIds(
    groupIds: number[],
    activeOnly: boolean,
    unitIds: string[],
    fields: string,
): Promise<ProductRow[]> {
    if (groupIds.length === 0) return [];

    const byId = new Map<number, ProductRow>();

    for (const chunk of chunkArray(groupIds, HYDRATE_CHUNK_SIZE)) {
        const p = new URLSearchParams();
        p.set("fields", fields);
        let idx = 0;
        const add = (suffix: string, value: string) => { p.set(`filter[_and][${idx}]${suffix}`, value); idx += 1; };
        if (activeOnly) add("[isActive][_eq]", "1");
        add("[_or][0][product_id][_in]", chunk.join(","));
        p.set(`filter[_and][${idx - 1}][_or][1][parent_id][_in]`, chunk.join(","));
        if (unitIds.length) add("[unit_of_measurement][_in]", unitIds.join(","));

        const rows = await fetchAllPages<ProductRow>(PRODUCTS, () => p);
        for (const row of rows) {
            const id = pickId(row.product_id);
            if (id) byId.set(id, row);
        }
    }

    return Array.from(byId.values());
}

function buildProductParams(
    fields: string,
    activeOnly: boolean,
    categoryIds: string[],
    brandIds: string[],
    unitIds: string[],
    q: string,
    inProductIds?: number[],
): URLSearchParams {
    const params = new URLSearchParams();
    params.set("fields", fields);
    let andIdx = 0;
    const addAnd = (suffix: string, value: string) => { params.set(`filter[_and][${andIdx}]${suffix}`, value); andIdx += 1; };
    if (activeOnly) addAnd("[isActive][_eq]", "1");
    if (categoryIds.length) addAnd("[product_category][_in]", categoryIds.join(","));
    if (brandIds.length) addAnd("[product_brand][_in]", brandIds.join(","));
    if (unitIds.length) addAnd("[unit_of_measurement][_in]", unitIds.join(","));
    if (q) {
        addAnd("[_or][0][product_name][_contains]", q);
        params.set(`filter[_and][${andIdx - 1}][_or][1][product_code][_contains]`, q);
    }
    if (inProductIds && inProductIds.length > 0) {
        addAnd("[product_id][_in]", inProductIds.join(","));
    }
    return params;
}

export async function GET(req: NextRequest) {
    try {
        if (!DIRECTUS_URL) return NextResponse.json({ error: "API URL not set" }, { status: 500 });
        const { searchParams } = new URL(req.url);

        const page = Math.max(1, Number(searchParams.get("page") || 1));
        const pageSizeRaw = searchParams.get("page_size");
        const pageSize = pageSizeRaw === "-1" ? -1 : Math.max(1, Number(pageSizeRaw || 50));
        const q = searchParams.get("q") || "";
        const categoryIds = searchParams.get("category_ids")?.split(",").filter(Boolean) || [];
        const brandIds = searchParams.get("brand_ids")?.split(",").filter(Boolean) || [];
        const unitIds = searchParams.get("unit_ids")?.split(",").filter(Boolean) || [];
        const supplierIds = searchParams.get("supplier_ids")?.split(",").filter(Boolean) || [];
        const supplierScope = searchParams.get("supplier_scope") || "ALL";
        const activeOnly = searchParams.get("active_only") === "1";

        const fields = [
            "product_id", "parent_id", "product_code", "barcode", "product_name",
            "isActive", "product_category", "product_brand", "unit_of_measurement",
            "price_per_unit", "priceA", "priceB", "priceC", "priceD", "priceE", "cost_per_unit"
        ].join(",");

        let supplierProductIdsIn: number[] | undefined;

        // Handle Supplier Filtering
        if (supplierIds.length > 0 || supplierScope === "LINKED_ONLY") {
            let pids: number[];
            if (supplierIds.length > 0) {
                pids = await getSupplierProductIdsForSuppliers(supplierIds);
            } else {
                const ppsRows = await fetchAllPages<{ product_id?: unknown }>(PRODUCT_PER_SUPPLIER, () => {
                    const sp = new URLSearchParams();
                    sp.set("fields", "product_id");
                    return sp;
                });
                pids = ppsRows.map((p) => pickId(p.product_id)).filter((id): id is number => id !== null);
            }
            if (!pids.length) {
                return NextResponse.json({ data: [], meta: { total_groups: 0, total_pages: 0 } });
            }
            const productInfoRows = await fetchItemsWhereIn<{ product_id: number; parent_id: number | null }>(
                PRODUCTS, "product_id", pids,
                (params) => { params.set("fields", "product_id,parent_id"); },
            );
            const groupIds = new Set<number>();
            for (const item of productInfoRows) {
                const gid = pickId(item.parent_id) ?? item.product_id;
                groupIds.add(gid);
            }
            if (groupIds.size > 0) {
                const gidArr = Array.from(groupIds);
                const childIds = await getChildProductIdsForParents(gidArr);
                supplierProductIdsIn = Array.from(new Set([...gidArr, ...childIds]));
            } else {
                supplierProductIdsIn = pids;
            }
        }

        // Step 1: fetch matched products (all filters applied)
        let rows: ProductRow[];
        const buildParams = (ids?: number[]) => buildProductParams(fields, activeOnly, categoryIds, brandIds, unitIds, q, ids);

        if (supplierProductIdsIn && supplierProductIdsIn.length > 0) {
            const idChunks = chunkArray(supplierProductIdsIn, 200);
            const chunkRows = await Promise.all(
                idChunks.map((ids) => fetchAllPages<ProductRow>(PRODUCTS, () => buildParams(ids))),
            );
            const byId = new Map<number, ProductRow>();
            for (const arr of chunkRows) {
                for (const row of arr) {
                    const id = pickId(row.product_id);
                    if (id) byId.set(id, row);
                }
            }
            rows = Array.from(byId.values());
        } else {
            rows = await fetchAllPages<ProductRow>(PRODUCTS, () => buildParams());
        }

        // Step 2: group by parent_id ?? product_id
        const groupMap = new Map<number, ProductRow[]>();
        for (const r of rows) {
            const gid = pickId(r.parent_id) ?? pickId(r.product_id);
            if (gid === null) continue;
            if (!groupMap.has(gid)) groupMap.set(gid, []);
            groupMap.get(gid)!.push(r);
        }
        const matchedGids = Array.from(groupMap.keys());
        const totalGroups = matchedGids.length;
        const totalPages = Math.ceil(totalGroups / pageSize);

        // Step 3: paginate groups, then hydrate only the visible page
        if (pageSize === -1) {
            if (totalGroups > 500) {
                return NextResponse.json({
                    error: `Result set too large for full export (${totalGroups} groups). Use the paginated print/matrix endpoint instead.`,
                }, { status: 400 });
            }
            const hydrated = await fetchHydratedVariantsForGroupIds(matchedGids, activeOnly, unitIds, fields);
            return NextResponse.json({
                data: hydrated,
                meta: { total_groups: totalGroups, total_pages: 1, page: 1, page_size: totalGroups },
            });
        }

        const pagedGids = matchedGids.slice((page - 1) * pageSize, page * pageSize);
        const hydrated = await fetchHydratedVariantsForGroupIds(pagedGids, activeOnly, unitIds, fields);

        const pagedRows: ProductRow[] = [];
        const reGrouped = new Map<number, ProductRow[]>();
        for (const r of hydrated) {
            const gid = pickId(r.parent_id) ?? pickId(r.product_id);
            if (gid === null) continue;
            if (!reGrouped.has(gid)) reGrouped.set(gid, []);
            reGrouped.get(gid)!.push(r);
        }
        for (const gid of pagedGids) {
            const group = reGrouped.get(gid);
            if (group) pagedRows.push(...group);
        }

        return NextResponse.json({
            data: pagedRows,
            meta: { total_groups: totalGroups, total_pages: totalPages, page, page_size: pageSize },
        });

    } catch (error: unknown) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Internal Server Error" }, { status: 500 });
    }
}
