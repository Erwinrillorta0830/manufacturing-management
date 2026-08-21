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
    type ProductRow,
} from "./_productGroups";

export type ProductsMeta = {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    totalVariants: number;
};

export type MatrixPageResult = {
    data: ProductRow[];
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
    const { filters, page, pageSize, supplierScope, supplierIdsRaw, pendingProductIds } = query;

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

    const meta: ProductsMeta = {
        page: safePage,
        pageSize,
        total: totalGroups,
        totalPages,
        totalVariants,
    };

    return {
        data: pageVariants,
        meta,
        prices,
        pending_price_requests,
        pending_cost_requests,
    };
}
