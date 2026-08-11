import { NextRequest, NextResponse } from "next/server";

import { parseApprovalSearchQuery, shouldFetchCostStreamInUnifiedSearch, shouldFetchPriceStreamInUnifiedSearch } from "../_approvalSearch";
import {
    addActorNames,
    addSuppliersToRows,
    fetchCostBatchesPage,
    fetchCostRequestsPage,
    fetchPriceBatchesPage,
    fetchPriceRequestsPage,
    getAllCostBatchHeaderIds,
    getAllPriceBatchHeaderIds,
    getBatchHeaderIdsForProductSearch,
    getCostHeaderIdsForProductSearch,
    getCostHeaderIdsForProducts,
    intersectHeaderIds,
    isCostHeaderAccessError,
    type ApprovalFilters,
} from "../_approvalSourceAdapters";
import {
    getBatchHeaderIdsForProducts,
    getSupplierScopedProductIdsForSuppliers,
    resolveSupplierIds,
} from "../_supplierFilters";
import {
    fetchMergedUnifiedPage,
} from "../_unifiedApprovalMerge";
import {
    decodeUserIdFromJwtCookie,
    directusErrorResponse,
    mustBase,
} from "../price-change-batches/_batch";

const MAX_UNIFIED_PAGE_WINDOW = 10_000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function norm(value: string | null) {
    const text = String(value ?? "").trim();
    if (!text || text === "undefined" || text === "null") return "";
    return text;
}

export async function GET(req: NextRequest) {
    try {
        mustBase();
        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const status = norm(searchParams.get("status"));
        const supplierIds = resolveSupplierIds(searchParams);
        const q = norm(searchParams.get("q"));
        const dateFrom = norm(searchParams.get("date_from"));
        const dateTo = norm(searchParams.get("date_to"));
        const scope = norm(searchParams.get("scope"));
        const rawPage = Number(searchParams.get("page") ?? 1);
        const rawPageSize = Number(searchParams.get("page_size") ?? 50);
        const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
        const pageSize = Math.min(100, Math.max(10,
            Number.isFinite(rawPageSize) && rawPageSize >= 1 ? rawPageSize : 50,
        ));

        if ((page - 1) * pageSize >= MAX_UNIFIED_PAGE_WINDOW) {
            return NextResponse.json({
                error: "Requested page is too deep. Narrow the filters or search term and try again.",
            }, { status: 400 });
        }

        const filters: ApprovalFilters = { status, supplierIds, q, dateFrom, dateTo };

        const searchParse = q ? parseApprovalSearchQuery(q) : null;
        const includePriceScope = scope !== "cost";
        const includeCostScope = scope !== "price";
        const includePrice = includePriceScope && (!searchParse || shouldFetchPriceStreamInUnifiedSearch(searchParse));
        const includeCost = includeCostScope && (!searchParse || shouldFetchCostStreamInUnifiedSearch(searchParse));
        const includeBatch =
            includePrice &&
            (!searchParse ||
                searchParse.batchHeaderId != null ||
                searchParse.numericId != null ||
                searchParse.textContains != null);
        const includeCostBatch =
            includeCost &&
            (!searchParse ||
                searchParse.costRequestId != null ||
                searchParse.numericId != null ||
                searchParse.textContains != null);
        const includeStandalonePrice =
            includePrice &&
            !(
                searchParse &&
                searchParse.batchHeaderId != null &&
                searchParse.numericId == null &&
                searchParse.priceRequestId == null &&
                searchParse.costRequestId == null
            );

        const supplierProductIds =
            supplierIds.length > 0
                ? await getSupplierScopedProductIdsForSuppliers(supplierIds)
                : undefined;
        let priceBatchHeaderIds: number[] = [];
        if (includeBatch) {
            const allPriceBatchHeaderIds = await getAllPriceBatchHeaderIds();
            if (supplierIds.length > 0) {
                const supplierPriceBatchHeaderIds = supplierProductIds
                    ? await getBatchHeaderIdsForProducts(supplierProductIds)
                    : [];
                priceBatchHeaderIds = intersectHeaderIds(allPriceBatchHeaderIds, supplierPriceBatchHeaderIds);
            } else {
                priceBatchHeaderIds = allPriceBatchHeaderIds;
            }
        }
        let costBatchHeaderIds: number[] = [];
        if (includeCostBatch) {
            try {
                costBatchHeaderIds = supplierProductIds
                    ? await getCostHeaderIdsForProducts(supplierProductIds)
                    : await getAllCostBatchHeaderIds();
            } catch (error: unknown) {
                if (!isCostHeaderAccessError(error)) throw error;
                costBatchHeaderIds = [];
            }
        }
        const batchHeaderIdsFromSearch =
            includeBatch && searchParse?.textContains
                ? await getBatchHeaderIdsForProductSearch(searchParse.textContains)
                : undefined;
        let costHeaderIdsFromSearch: number[] | undefined;
        if (includeCostBatch && searchParse?.textContains) {
            try {
                costHeaderIdsFromSearch = await getCostHeaderIdsForProductSearch(searchParse.textContains);
            } catch (error: unknown) {
                if (!isCostHeaderAccessError(error)) throw error;
                costHeaderIdsFromSearch = [];
            }
        }

        const sources = [
            includeBatch
                ? (streamOffset: number, streamLimit: number) =>
                      fetchPriceBatchesPage(filters, streamOffset, streamLimit, priceBatchHeaderIds, batchHeaderIdsFromSearch)
                : null,
            includeStandalonePrice
                ? (streamOffset: number, streamLimit: number) =>
                      fetchPriceRequestsPage(filters, streamOffset, streamLimit, supplierProductIds)
                : null,
            includeCost
                ? (streamOffset: number, streamLimit: number) =>
                      fetchCostRequestsPage(filters, streamOffset, streamLimit, supplierProductIds)
                : null,
            includeCostBatch
                ? (streamOffset: number, streamLimit: number) =>
                      fetchCostBatchesPage(
                          filters,
                          streamOffset,
                          streamLimit,
                          costBatchHeaderIds,
                          costHeaderIdsFromSearch,
                          priceBatchHeaderIds,
                      )
                : null,
        ];

        const { rows, total: actualTotalCount } = await fetchMergedUnifiedPage(page, pageSize, sources);
        const pageableTotalCount = Math.min(actualTotalCount, MAX_UNIFIED_PAGE_WINDOW);
        let enrichedData = await addActorNames(rows);
        enrichedData = await addSuppliersToRows(enrichedData);

        return NextResponse.json({
            data: enrichedData,
            meta: {
                total_count: pageableTotalCount,
                actual_total_count: actualTotalCount,
                result_window: MAX_UNIFIED_PAGE_WINDOW,
                total_count_capped: actualTotalCount > MAX_UNIFIED_PAGE_WINDOW,
            },
        });
    } catch (error: unknown) {
        return directusErrorResponse(error);
    }
}
