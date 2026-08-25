import type { ParsedProductCatalogQuery } from "./_productCatalogQuery";
import {
    fetchPendingCcrByProductIds,
    fetchPendingPcrByProductIds,
    type PendingCcrRow,
    type PendingPcrRow,
} from "./_fetchPendingByProductIds";
import { fetchDirectusPricesByProductIds, type DirectusProductPriceRow } from "./_fetchProductPrices";
import {
    fetchPaginatedProductGroups,
    resolveSupplierScopedProductIds,
    pickId,
    type ProductRow,
} from "./_productGroups";
import { chunkArray, fetchAllPages } from "./_directusPaging";

export type VersionPriceEntry = {
    price_type_id: number;
    cost_per_unit: number;
    price_per_unit: number;
};

export type ManufacturingVersion = {
    version_id: number;
    product_id: number;
    version_name: string;
    base_quantity: number;
    uom_id: number;
    expected_yield_percentage: number | null;
    status: string;
    is_primary: boolean;
    prices: Record<number, VersionPriceEntry>;
};

export type ProductsMeta = {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    totalVariants: number;
};

export type MatrixPageResult = {
    data: (ProductRow & { versions?: ManufacturingVersion[] })[];
    meta: ProductsMeta;
    prices: DirectusProductPriceRow[];
    pending_price_requests: PendingPcrRow[];
    pending_cost_requests: PendingCcrRow[];
};

function pickProductId(row: ProductRow): number | null {
    const id = Number(row.product_id);
    return Number.isFinite(id) && id > 0 ? id : null;
}

function uniqPositiveIds(ids: number[]): number[] {
    return Array.from(new Set(ids.filter((id) => Number.isFinite(id) && id > 0)));
}

export async function fetchMatrixPage(query: ParsedProductCatalogQuery): Promise<MatrixPageResult> {
    const { filters, page, pageSize, supplierScope, supplierIdsRaw, pendingProductIds, show_versions } = query;

    const emptyMeta: ProductsMeta = {
        page,
        pageSize,
        total: 0,
        totalPages: 0,
        totalVariants: 0,
    };

    const supplierProductIds = await resolveSupplierScopedProductIds({
        supplierScope,
        supplierIdsRaw,
    });

    if (supplierProductIds && supplierProductIds.length === 0) {
        return {
            data: [],
            meta: emptyMeta,
            prices: [],
            pending_price_requests: [],
            pending_cost_requests: [],
        };
    }

    const { pageGroups, totalGroups, totalVariants, safePage } = await fetchPaginatedProductGroups({
        page,
        pageSize,
        supplierProductIds,
        filters,
    });

    const totalPages = totalGroups > 0 ? Math.ceil(totalGroups / pageSize) : 0;

    const pageVariants: ProductRow[] = [];
    for (const group of pageGroups) {
        for (const variant of group.variants) {
            pageVariants.push({ ...variant, __group_id: group.group_id });
        }
    }

    const pageProductIds = uniqPositiveIds(
        pageVariants.map((variant) => pickProductId(variant)).filter((id): id is number => id !== null),
    );

    const pendingScopeIds = uniqPositiveIds([...pageProductIds, ...pendingProductIds]);

    const [prices, pending_price_requests, pending_cost_requests] = await Promise.all([
        fetchDirectusPricesByProductIds(pageProductIds),
        fetchPendingPcrByProductIds(pendingScopeIds, "PENDING"),
        fetchPendingCcrByProductIds(pendingScopeIds, "PENDING"),
    ]);

    let finalPageVariants: (ProductRow & { versions?: ManufacturingVersion[] })[] = pageVariants;

    if (show_versions && pageProductIds.length > 0) {
        let versionRows: Record<string, unknown>[] = [];
        let versionPriceRows: Record<string, unknown>[] = [];

        const versionChunks = chunkArray(pageProductIds, 150);
        const vRows = await Promise.all(versionChunks.map(chunk =>
            fetchAllPages<Record<string, unknown>>("product_manufacturing_version", () => {
                const sp = new URLSearchParams();
                sp.set("fields", "version_id,product_id,version_name,base_quantity,uom_id,expected_yield_percentage,status,is_primary");
                sp.set("filter[product_id][_in]", chunk.join(","));
                return sp;
            })
        ));
        versionRows = vRows.flat();

        const versionIds = Array.from(new Set(versionRows.map(v => pickId(v.version_id)).filter((id): id is number => id !== null)));
        if (versionIds.length > 0) {
            const vpChunks = chunkArray(versionIds, 200);
            const vpRows = await Promise.all(vpChunks.map(chunk =>
                fetchAllPages<Record<string, unknown>>("product_version_prices", () => {
                    const sp = new URLSearchParams();
                    sp.set("fields", "version_price_id,version_id,price_type_id,cost_per_unit,price_per_unit");
                    sp.set("filter[version_id][_in]", chunk.join(","));
                    sp.set("filter[is_active][_eq]", "1");
                    return sp;
                })
            ));
            versionPriceRows = vpRows.flat();
        }

        const pricesByVersion = new Map<number, Record<number, VersionPriceEntry>>();
        for (const vp of versionPriceRows) {
            const vid = pickId(vp.version_id);
            const ptid = pickId(vp.price_type_id);
            if (vid === null || ptid === null) continue;

            if (!pricesByVersion.has(vid)) pricesByVersion.set(vid, {});
            pricesByVersion.get(vid)![ptid] = {
                price_type_id: ptid,
                cost_per_unit: Number(vp.cost_per_unit) || 0,
                price_per_unit: Number(vp.price_per_unit) || 0,
            };
        }

        const versionsByProduct = new Map<number, ManufacturingVersion[]>();
        for (const v of versionRows) {
            const pid = pickId(v.product_id);
            const vid = pickId(v.version_id);
            if (pid === null || vid === null) continue;

            if (!versionsByProduct.has(pid)) versionsByProduct.set(pid, []);
            versionsByProduct.get(pid)!.push({
                version_id: vid,
                product_id: pid,
                version_name: String(v.version_name || ""),
                base_quantity: Number(v.base_quantity) || 0,
                uom_id: Number(v.uom_id) || 0,
                expected_yield_percentage: v.expected_yield_percentage !== null ? Number(v.expected_yield_percentage) : null,
                status: String(v.status || ""),
                is_primary: Boolean(v.is_primary),
                prices: pricesByVersion.get(vid) || {},
            });
        }

        finalPageVariants = pageVariants.map(p => {
            const pid = pickId(p.product_id);
            const gid = pickId(p.parent_id) ?? pid;

            const v1 = pid ? versionsByProduct.get(pid) || [] : [];
            const v2 = (gid && gid !== pid) ? versionsByProduct.get(gid) || [] : [];

            return {
                ...p,
                versions: [...v1, ...v2],
            };
        });
    }

    const meta: ProductsMeta = {
        page: safePage,
        pageSize,
        total: totalGroups,
        totalPages,
        totalVariants,
    };

    return {
        data: finalPageVariants,
        meta,
        prices,
        pending_price_requests,
        pending_cost_requests,
    };
}
