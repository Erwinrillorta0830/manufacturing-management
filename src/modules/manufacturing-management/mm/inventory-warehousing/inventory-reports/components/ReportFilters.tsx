"use client";

import React from "react";
import { Search, X, RefreshCw, FileDown, ChevronsDown, ChevronsUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchableSelect, SearchableSelectOption } from "@/modules/manufacturing-management/shared/components/SearchableSelect";
import { BranchLookup, CategoryLookup, ProductTypeLookup, InventoryReportFilterState } from "../types";

interface ReportFiltersProps {
    filters: InventoryReportFilterState;
    searchInput: string;
    setSearchInput: (value: string) => void;
    branches: BranchLookup[];
    categories: CategoryLookup[];
    productTypes: ProductTypeLookup[];
    loading: boolean;
    expandedCount?: number;
    totalProducts?: number;
    onFilterChange: <K extends keyof InventoryReportFilterState>(
        key: K,
        value: InventoryReportFilterState[K]
    ) => void;
    onSearchSubmit: (e?: React.FormEvent) => void;
    onClearSearch: () => void;
    onRefresh: () => void;
    onOpenExport: () => void;
    onExpandAll: () => void;
    onCollapseAll: () => void;
}

export function ReportFilters({
    filters,
    searchInput,
    setSearchInput,
    branches,
    categories,
    productTypes,
    loading,
    expandedCount = 0,
    totalProducts = 0,
    onFilterChange,
    onSearchSubmit,
    onClearSearch,
    onRefresh,
    onOpenExport,
    onExpandAll,
    onCollapseAll,
}: ReportFiltersProps) {
    const branchOptions: SearchableSelectOption[] = [
        { value: "0", label: "All Branches" },
        ...branches.map((b) => ({
            value: String(b.id),
            label: b.name,
            subLabel: b.code ? `Code: ${b.code}` : undefined,
        })),
    ];

    const categoryOptions: SearchableSelectOption[] = [
        { value: "0", label: "All Categories" },
        ...categories.map((c) => ({
            value: String(c.id),
            label: c.name,
        })),
    ];

    const productTypeOptions: SearchableSelectOption[] = [
        { value: "0", label: "All Product Types" },
        ...productTypes.map((pt) => ({
            value: String(pt.id),
            label: pt.name,
        })),
    ];

    const statusOptions: SearchableSelectOption[] = [
        { value: "below_maintaining", label: "Below Maintaining Qty (Alerts)" },
        { value: "out_of_stock", label: "Out of Stock (Zero On-Hand)" },
        { value: "low_stock", label: "Low Stock / Reorder Needed" },
        { value: "healthy", label: "Healthy Stock Level" },
        { value: "zero_threshold", label: "No Limit Set (Zero Threshold)" },
        { value: "all", label: "All Inventory Items" },
    ];

    const isAllExpanded = totalProducts > 0 && expandedCount >= totalProducts;
    const isPartiallyExpanded = expandedCount > 0 && !isAllExpanded;

    return (
        <div className="flex flex-col gap-3 p-4 rounded-xl border bg-card/80 backdrop-blur-xs shadow-xs">
            {/* Top row: Search and Filter Selects */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 items-center">
                {/* Search Bar */}
                <div className="lg:col-span-3 relative">
                    <form onSubmit={onSearchSubmit} className="relative flex items-center">
                        <Search className="absolute left-3 w-4 h-4 text-muted-foreground pointer-events-none" />
                        <Input
                            placeholder="Search SKU, Product..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") onSearchSubmit();
                            }}
                            className="pl-9 pr-8 h-9 text-xs"
                        />
                        {searchInput && (
                            <button
                                type="button"
                                onClick={onClearSearch}
                                className="absolute right-2.5 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </form>
                </div>

                {/* Branch Combobox */}
                <div className="lg:col-span-2">
                    <SearchableSelect
                        options={branchOptions}
                        value={String(filters.branchId || "0")}
                        onValueChange={(val) => onFilterChange("branchId", val === "0" ? null : Number(val))}
                        placeholder="Select Branch..."
                        searchPlaceholder="Search branch..."
                        className="w-full"
                        triggerClassName="h-9 text-xs"
                    />
                </div>

                {/* Category Combobox */}
                <div className="lg:col-span-2">
                    <SearchableSelect
                        options={categoryOptions}
                        value={String(filters.categoryId || "0")}
                        onValueChange={(val) => onFilterChange("categoryId", val === "0" ? null : Number(val))}
                        placeholder="Select Category..."
                        searchPlaceholder="Search category..."
                        className="w-full"
                        triggerClassName="h-9 text-xs"
                    />
                </div>

                {/* Product Type Combobox */}
                <div className="lg:col-span-2">
                    <SearchableSelect
                        options={productTypeOptions}
                        value={String(filters.productTypeId || "0")}
                        onValueChange={(val) => onFilterChange("productTypeId", val === "0" ? null : Number(val))}
                        placeholder="Product Type..."
                        searchPlaceholder="Search product type..."
                        className="w-full"
                        triggerClassName="h-9 text-xs"
                    />
                </div>

                {/* Status Filter Combobox */}
                <div className="lg:col-span-3">
                    <SearchableSelect
                        options={statusOptions}
                        value={filters.status}
                        onValueChange={(val) => onFilterChange("status", val as InventoryReportFilterState["status"])}
                        placeholder="Stock Status..."
                        searchPlaceholder="Filter status..."
                        className="w-full"
                        triggerClassName="h-9 text-xs"
                    />
                </div>
            </div>

            {/* Bottom Row: Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                    {isAllExpanded ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onCollapseAll}
                            disabled={totalProducts === 0}
                            className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ChevronsUp className="w-3.5 h-3.5 mr-1 text-primary" />
                            Collapse All Batches
                        </Button>
                    ) : isPartiallyExpanded ? (
                        <div className="flex items-center gap-1.5">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onExpandAll}
                                className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <ChevronsDown className="w-3.5 h-3.5 mr-1 text-primary" />
                                Expand Batches
                                <span className="ml-1.5 text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                                    {expandedCount}/{totalProducts}
                                </span>
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onCollapseAll}
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <ChevronsUp className="w-3.5 h-3.5 mr-1" />
                                Collapse All
                            </Button>
                        </div>
                    ) : (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onExpandAll}
                            disabled={totalProducts === 0}
                            className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <ChevronsDown className="w-3.5 h-3.5 mr-1 text-primary" />
                            Expand Batches
                        </Button>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onRefresh}
                        disabled={loading}
                        className="h-8 px-3 text-xs"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                    <Button
                        size="sm"
                        onClick={onOpenExport}
                        className="h-8 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs"
                    >
                        <FileDown className="w-3.5 h-3.5 mr-1.5" />
                        Export Report
                    </Button>
                </div>
            </div>
        </div>
    );
}
