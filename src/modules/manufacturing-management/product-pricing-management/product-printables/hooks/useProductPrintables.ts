// src/modules/financial-management/printables-management/product-printables/hooks/useProductPrintables.ts
"use client";

import * as React from "react";
import type { ProductRow, FilterState, MatrixRow, VariantCell, Category, Brand, PriceType } from "../types";
import { getPricesForProducts } from "../../product-pricing/providers/pricingApi";
import { emptyPivot, pivotPrices } from "../../product-pricing/utils/pivot";

export const defaultFilters: FilterState = {
    q: "",
    category_ids: [],
    brand_ids: [],
    unit_ids: [],
    supplier_ids: [],
    price_type_ids: [],
    supplier_scope: "ALL",
    active_only: true,
    page: 1,
    total_pages: 0,
};

const EMPTY_CATEGORIES: Category[] = [];
const EMPTY_BRANDS: Brand[] = [];
const EMPTY_PRICE_TYPES: PriceType[] = [];

function pickId(v: string | number | null | undefined | Record<string, unknown>): number | null {
    if (v === null || v === undefined) return null;
    const n = Number((v as Record<string, unknown>)?.product_id ?? (v as Record<string, unknown>)?.id ?? v);
    return Number.isFinite(n) && n > 0 ? n : null;
}

export function useProductPrintables(
    filters: FilterState,
    setFilters: React.Dispatch<React.SetStateAction<FilterState>>,
    categories: Category[] = EMPTY_CATEGORIES,
    brands: Brand[] = EMPTY_BRANDS,
    priceTypes: PriceType[] = EMPTY_PRICE_TYPES,
    enabled = true,
) {
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [matrixRows, setMatrixRows] = React.useState<MatrixRow[]>([]);
    const [usedUnitIds, setUsedUnitIds] = React.useState<Set<number>>(new Set());


    const refresh = React.useCallback(async () => {
        if (!enabled) return;

        setLoading(true);
        setError(null);
        try {
            const sp = new URLSearchParams();
            if (filters.q) sp.set("q", filters.q);
            if (filters.category_ids.length) sp.set("category_ids", filters.category_ids.join(","));
            if (filters.brand_ids.length) sp.set("brand_ids", filters.brand_ids.join(","));
            if (filters.unit_ids.length) sp.set("unit_ids", filters.unit_ids.join(","));
            if (filters.supplier_ids.length) sp.set("supplier_ids", filters.supplier_ids.join(","));
            sp.set("supplier_scope", filters.supplier_scope);
            sp.set("active_only", filters.active_only ? "1" : "0");
            sp.set("page", String(filters.page));
            sp.set("page_size", "50");

            const res = await fetch(`/api/fm/product-pricing/printables?${sp.toString()}`);
            if (!res.ok) throw new Error("Failed to fetch products");
            const json = await res.json();
            const products: ProductRow[] = json.data ?? [];
            const meta = json.meta ?? { total_pages: 0 };

            const productIds = products.map((p) => pickId(p.product_id)).filter((id): id is number => id !== null);
            let priceMap = new Map<number, Record<string, number | null>>();
            
            if (productIds.length > 0) {
                const priceRes = await getPricesForProducts(productIds);
                priceMap = pivotPrices(priceTypes, priceRes.data ?? []);
            }

            const emptyTierValues = emptyPivot(priceTypes);

            const catMap = new Map(categories.map(c => [Number(c.category_id), c.category_name]));
            const brandMap = new Map(brands.map(b => [Number(b.brand_id), b.brand_name]));

            // Grouping logic (now just assembling since server paginates groups)
            const groups = new Map<number, ProductRow[]>();
            const unitIds = new Set<number>();

            for (const p of products) {
                const groupId = pickId(p.parent_id) ?? pickId(p.product_id);
                if (groupId === null) continue;
                if (!groups.has(groupId)) groups.set(groupId, []);
                groups.get(groupId)!.push(p);

                const uomId = Number(p.unit_of_measurement);
                if (Number.isFinite(uomId)) unitIds.add(uomId);
            }

            const assembled: MatrixRow[] = [];
            for (const [groupId, variants] of groups.entries()) {
                const display = variants.find(v => pickId(v.product_id) === groupId) || variants[0];
                const variantsByUnitId: Record<number, VariantCell> = {};

                for (const v of variants) {
                    const uomId = Number(v.unit_of_measurement);
                    if (!Number.isFinite(uomId)) continue;
                    
                    const pid = pickId(v.product_id);
                    const piv = pid ? (priceMap.get(pid) ?? emptyTierValues) : emptyTierValues;

                    variantsByUnitId[uomId] = {
                        product: v,
                        tiers: {
                            ...piv,
                            LIST: v.cost_per_unit ? Number(v.cost_per_unit) : null,
                        }
                    };
                }

                assembled.push({
                    group_id: groupId,
                    display,
                    variantsByUnitId,
                    category_name: catMap.get(Number(display.product_category)) || "—",
                    brand_name: brandMap.get(Number(display.product_brand)) || "—",
                });
            }

            setMatrixRows(assembled);
            setUsedUnitIds(unitIds);
            setFilters(prev => {
                const totalPages = Number(meta.total_pages ?? 0);
                return prev.total_pages === totalPages ? prev : { ...prev, total_pages: totalPages };
            });
        } catch (error: unknown) {
            setError(error instanceof Error ? error.message : "Failed to load products");
            setMatrixRows([]);
            setUsedUnitIds(new Set());
            setFilters(prev => prev.total_pages === 0 ? prev : { ...prev, total_pages: 0 });
        } finally {
            setLoading(false);
        }
    }, [categories, brands, enabled, priceTypes, setFilters, filters.active_only, filters.brand_ids, filters.category_ids, filters.page, filters.q, filters.supplier_ids, filters.supplier_scope, filters.unit_ids]);

    React.useEffect(() => {
        if (!enabled) {
            setLoading(true);
            return;
        }

        void refresh();
    }, [enabled, refresh]);

    return {
        loading,
        error,
        matrixRows,
        usedUnitIds,
        filters,
        setFilters,
        refresh,
        resetFilters: () => setFilters(defaultFilters),
    };
}
