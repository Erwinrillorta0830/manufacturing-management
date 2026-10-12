"use client";

import * as React from "react";
import { format, subDays, startOfMonth, endOfDay } from "date-fns";
import {
    RotateCcw,
    Search,
    Layers
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import {
    ProductTracingFiltersType,
    BranchLookup,
    ProductTypeLookup,
    ProductLookup,
    LotLookup
} from "../types";
import { SearchableSelect } from "./SearchableSelect";

const DATE_PRESETS = [
    { key: "all", label: "All Time" },
    { key: "today", label: "Today" },
    { key: "7days", label: "Last 7 Days" },
    { key: "month", label: "This Month" }
];

type Props = {
    filters: ProductTracingFiltersType;
    branches: BranchLookup[];
    productTypes: ProductTypeLookup[];
    products: ProductLookup[];
    lots?: LotLookup[];
    onFilterChange: (filters: Partial<ProductTracingFiltersType>) => void;
    onReset: () => void;
    onSearch: () => void;
    isLoading?: boolean;
};

export function ProductTracingFilters({
    filters,
    branches,
    productTypes,
    products,
    onFilterChange,
    onReset,
    onSearch,
    isLoading
}: Props) {
    const branchOptions = React.useMemo(() => [
        { value: null as unknown as number, label: "All Branches / Warehouses" },
        ...branches.map(b => ({
            value: b.id,
            label: b.branchName || b.branch_name || `Branch #${b.id}`,
            description: b.branchCode ? `Code: ${b.branchCode}` : undefined
        }))
    ], [branches]);

    const productTypeOptions = React.useMemo(() => [
        { value: null as unknown as number, label: "All Product Types" },
        ...productTypes.map(pt => ({
            value: Number(pt.id),
            label: pt.name || pt.type_name || `Type #${pt.id}`,
            description: pt.description || undefined
        }))
    ], [productTypes]);

    // Parent products only (smallest unit)
    const productOptions = React.useMemo(() => [
        { value: null as unknown as number, label: "All Products" },
        ...products.map(p => ({
            value: p.productId,
            label: p.description || p.productName,
            description: [
                p.productCode ? `SKU: ${p.productCode}` : null
            ].filter(Boolean).join(" • ")
        }))
    ], [products]);

    const toDateInputValue = (isoString?: string | null) => {
        if (!isoString) return "";
        try {
            const d = new Date(isoString);
            if (isNaN(d.getTime())) return "";
            return format(d, "yyyy-MM-dd");
        } catch {
            return "";
        }
    };

    const handleStartDateChange = (val: string) => {
        if (!val) {
            onFilterChange({
                startDate: null,
                datePreset: filters.endDate ? "custom" : "all"
            });
            return;
        }
        const [year, month, day] = val.split("-").map(Number);
        const d = new Date(year, month - 1, day, 0, 0, 0, 0);
        onFilterChange({
            startDate: d.toISOString(),
            datePreset: "custom"
        });
    };

    const handleEndDateChange = (val: string) => {
        if (!val) {
            onFilterChange({
                endDate: null,
                datePreset: filters.startDate ? "custom" : "all"
            });
            return;
        }
        const [year, month, day] = val.split("-").map(Number);
        const d = new Date(year, month - 1, day, 23, 59, 59, 999);
        onFilterChange({
            endDate: d.toISOString(),
            datePreset: "custom"
        });
    };

    const handleDatePreset = (preset: "all" | "today" | "7days" | "month") => {
        const now = new Date();
        if (preset === "all") {
            onFilterChange({
                startDate: null,
                endDate: null,
                datePreset: "all"
            });
        } else if (preset === "today") {
            const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
            onFilterChange({
                startDate: start.toISOString(),
                endDate: end.toISOString(),
                datePreset: "today"
            });
        } else if (preset === "7days") {
            const start = subDays(now, 7);
            start.setHours(0, 0, 0, 0);
            const end = endOfDay(now);
            onFilterChange({
                startDate: start.toISOString(),
                endDate: end.toISOString(),
                datePreset: "7days"
            });
        } else if (preset === "month") {
            const start = startOfMonth(now);
            start.setHours(0, 0, 0, 0);
            const end = endOfDay(now);
            onFilterChange({
                startDate: start.toISOString(),
                endDate: end.toISOString(),
                datePreset: "month"
            });
        }
    };

    const activePreset = filters.datePreset || (!filters.startDate && !filters.endDate ? "all" : "custom");

    return (
        <Card className="rounded-2xl border shadow-sm overflow-visible bg-card">
            <CardContent className="px-4 sm:px-5 space-y-4">
                {/* Header title & Action buttons */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-muted/50">
                    <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4 text-primary" />
                        <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                            Trace Ledger Filters
                        </span>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 rounded-xl px-2.5 text-xs font-bold text-muted-foreground hover:bg-muted"
                            onClick={onReset}
                            disabled={isLoading}
                        >
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            Reset Filters
                        </Button>

                        <Button
                            size="sm"
                            className="h-8 rounded-xl px-4 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider shadow-xs hover:bg-primary/90 transition-all active:scale-95 shrink-0"
                            onClick={onSearch}
                            disabled={isLoading}
                        >
                            <Search className="h-3.5 w-3.5 mr-1.5" />
                            {isLoading ? "Loading..." : "Apply Filters"}
                        </Button>
                    </div>
                </div>

                {/* 1. Core entity filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Branch / Warehouse */}
                    <div className="relative">
                        <SearchableSelect
                            label="Branch / Warehouse"
                            placeholder="All Branches / Warehouses"
                            emptyText="No branch found."
                            value={filters.branch_id}
                            options={branchOptions}
                            onChange={(val) => onFilterChange({ branch_id: val })}
                            searchPlaceholder="Search branch name or code..."
                            disabled={isLoading}
                        />
                    </div>

                    {/* Product Type */}
                    <div className="relative">
                        <SearchableSelect
                            label="Product Type"
                            placeholder="All Product Types"
                            emptyText="No product type found."
                            value={filters.product_type_id}
                            options={productTypeOptions}
                            onChange={(val) => onFilterChange({ product_type_id: val })}
                            searchPlaceholder="Search product type..."
                            disabled={isLoading}
                        />
                    </div>

                    {/* Product / Item */}
                    <div className="relative">
                        <SearchableSelect
                            label="Product / Item (Parent / Smallest Unit)"
                            placeholder="All Products (Overall Ledger)"
                            emptyText="No parent product found."
                            value={filters.product_id}
                            options={productOptions}
                            onChange={(val) => onFilterChange({ product_id: val })}
                            searchPlaceholder="Search parent product or SKU..."
                            disabled={isLoading}
                        />
                    </div>
                </div>

                {/* 2. Date filters: Two separate inputs + Presets */}
                <div className="pt-3 border-t border-muted/40 flex flex-col xl:flex-row xl:items-end justify-start gap-4">
                    {/* Two separate date inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 max-w-xl">
                        {/* Start Date */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-70">
                                    Start Date (From)
                                </Label>
                                {filters.startDate && (
                                    <button
                                        type="button"
                                        onClick={() => handleStartDateChange("")}
                                        className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                            <div className="relative">
                                <Input
                                    type="date"
                                    value={toDateInputValue(filters.startDate)}
                                    onChange={(e) => handleStartDateChange(e.target.value)}
                                    disabled={isLoading}
                                    className="h-10 rounded-xl border-muted-foreground/20 px-3 text-xs bg-background focus-visible:ring-primary/20"
                                />
                            </div>
                        </div>

                        {/* End Date */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-70">
                                    End Date (To)
                                </Label>
                                {filters.endDate && (
                                    <button
                                        type="button"
                                        onClick={() => handleEndDateChange("")}
                                        className="text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                            <div className="relative">
                                <Input
                                    type="date"
                                    value={toDateInputValue(filters.endDate)}
                                    onChange={(e) => handleEndDateChange(e.target.value)}
                                    disabled={isLoading}
                                    className="h-10 rounded-xl border-muted-foreground/20 px-3 text-xs bg-background focus-visible:ring-primary/20"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Quick Presets */}
                    <div className="space-y-2 xl:self-end">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-70 block">
                            Quick Presets
                        </Label>
                        <div className="inline-flex flex-wrap rounded-xl bg-muted/60 p-1 gap-1">
                            {DATE_PRESETS.map((dp) => (
                                <button
                                    key={dp.key}
                                    type="button"
                                    onClick={() => handleDatePreset(dp.key as "all" | "today" | "7days" | "month")}
                                    className={cn(
                                        "px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer",
                                        activePreset === dp.key
                                            ? "bg-background text-foreground shadow-xs"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {dp.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
