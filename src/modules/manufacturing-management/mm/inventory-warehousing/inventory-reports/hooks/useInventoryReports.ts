"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { toast } from "sonner";
import {
    InventoryReportProduct,
    InventoryReportMetrics,
    InventoryReportFilterState,
    BranchLookup,
    CategoryLookup,
    ProductTypeLookup,
} from "../types";
import { fetchInventoryReports } from "../services/inventory-reports.service";

const initialMetrics: InventoryReportMetrics = {
    totalProducts: 0,
    belowMaintainingCount: 0,
    outOfStockCount: 0,
    lowStockCount: 0,
    totalDeficitQuantity: 0,
    totalReplenishmentCost: 0,
};

export function useInventoryReports() {
    const [filters, setFilters] = useState<InventoryReportFilterState>({
        branchId: null,
        categoryId: null,
        productTypeId: null,
        status: "below_maintaining",
        search: "",
    });

    const [searchInput, setSearchInput] = useState("");
    const [loading, setLoading] = useState(true);
    const [products, setProducts] = useState<InventoryReportProduct[]>([]);
    const [metrics, setMetrics] = useState<InventoryReportMetrics>(initialMetrics);
    const [branches, setBranches] = useState<BranchLookup[]>([]);
    const [categories, setCategories] = useState<CategoryLookup[]>([]);
    const [productTypes, setProductTypes] = useState<ProductTypeLookup[]>([]);
    const [expandedProductIds, setExpandedProductIds] = useState<Set<number>>(new Set());
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [, startTransition] = useTransition();

    const loadData = useCallback(async (currentFilters: InventoryReportFilterState) => {
        setLoading(true);
        try {
            const res = await fetchInventoryReports(currentFilters);
            if (res.success) {
                const newProducts = res.data || [];
                setProducts(newProducts);
                setMetrics(res.summary || initialMetrics);
                if (res.branches) setBranches(res.branches);
                if (res.categories) setCategories(res.categories);
                if (res.productTypes) setProductTypes(res.productTypes);

                // Clean up stale expanded IDs that no longer exist in new product list
                const validIds = new Set(newProducts.map((p) => p.productId));
                setExpandedProductIds((prev) => {
                    const next = new Set([...prev].filter((id) => validIds.has(id)));
                    return next.size === prev.size ? prev : next;
                });
            } else {
                toast.error(res.error || "Failed to load inventory reports");
            }
        } catch (error) {
            console.error("[useInventoryReports] Load error:", error);
            toast.error((error as Error).message || "An unexpected error occurred while loading reports");
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load and whenever filters change
    useEffect(() => {
        loadData(filters);
    }, [filters, loadData]);

    const handleFilterChange = <K extends keyof InventoryReportFilterState>(
        key: K,
        value: InventoryReportFilterState[K]
    ) => {
        startTransition(() => {
            setFilters((prev) => ({
                ...prev,
                [key]: value,
            }));
        });
    };

    const handleSearchSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        handleFilterChange("search", searchInput.trim());
    };

    const handleClearSearch = () => {
        setSearchInput("");
        handleFilterChange("search", "");
    };

    const toggleProductExpand = (productId: number) => {
        setExpandedProductIds((prev) => {
            const next = new Set(prev);
            if (next.has(productId)) {
                next.delete(productId);
            } else {
                next.add(productId);
            }
            return next;
        });
    };

    const expandAll = () => {
        setExpandedProductIds(new Set(products.map((p) => p.productId)));
    };

    const collapseAll = () => {
        setExpandedProductIds(new Set());
    };

    return {
        filters,
        searchInput,
        setSearchInput,
        loading,
        products,
        metrics,
        branches,
        categories,
        productTypes,
        expandedProductIds,
        isExportModalOpen,
        setIsExportModalOpen,
        loadData: () => loadData(filters),
        handleFilterChange,
        handleSearchSubmit,
        handleClearSearch,
        toggleProductExpand,
        expandAll,
        collapseAll,
    };
}
