"use client";

import * as React from "react";
import { format, subDays, startOfMonth, endOfDay } from "date-fns";
import {
    CalendarIcon,
    RotateCcw,
    Search,
    Filter,
    X,
    SlidersHorizontal,
    ChevronDown,
    Building2,
    Layers,
    Package,
    Boxes,
    Tag,
    Clock,
    Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    ProductTracingFiltersType,
    BranchLookup,
    ProductTypeLookup,
    ProductLookup,
    LotLookup
} from "../types";
import { SearchableSelect } from "./SearchableSelect";

const TRANSACTION_TYPES = [
    { value: "ALL", label: "All Types" },
    { value: "STOCK_TRANSFER", label: "Stock Transfer" },
    { value: "STOCK_ADJUSTMENT", label: "Stock Adjustment" },
    { value: "PHYSICAL_INVENTORY", label: "Physical Inventory" },
    { value: "MATERIAL_ISSUANCE", label: "Material Issuance" },
    { value: "PRODUCTION_RECEIPT", label: "Production Receipt" },
    { value: "PURCHASE_RECEIPT", label: "Purchase Receipt" },
    { value: "SALES_DISPATCH", label: "Sales Dispatch" }
];

const CONDITIONS = [
    { value: "ALL", label: "All Conditions" },
    { value: "GOOD", label: "Good" },
    { value: "EXPIRED", label: "Expired" },
    { value: "DAMAGED", label: "Damaged" },
    { value: "QUARANTINED", label: "Quarantined" }
];

const DATE_PRESETS = [
    { key: "all", label: "All Time" },
    { key: "today", label: "Today" },
    { key: "7days", label: "Last 7 Days" },
    { key: "month", label: "This Month" },
    { key: "custom", label: "Custom" }
];

type Props = {
    filters: ProductTracingFiltersType;
    branches: BranchLookup[];
    productTypes: ProductTypeLookup[];
    products: ProductLookup[];
    lots: LotLookup[];
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
    lots,
    onFilterChange,
    onReset,
    onSearch,
    isLoading
}: Props) {
    const [showAdvanced, setShowAdvanced] = React.useState(false);

    const branchOptions = React.useMemo(() => [
        { value: null as unknown as number, label: "All Branches" },
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

    const productOptions = React.useMemo(() => [
        { value: null as unknown as number, label: "All Products" },
        ...products.map(p => ({
            value: p.productId,
            label: p.productName,
            description: p.productCode ? `SKU: ${p.productCode}` : undefined
        }))
    ], [products]);

    const lotOptions = React.useMemo(() => [
        { value: null as unknown as number, label: "All Lots" },
        ...lots.map(l => ({
            value: l.lotId,
            label: l.lotName,
            description: l.status ? `Status: ${l.status}` : undefined
        }))
    ], [lots]);

    const safeStartDate = filters.startDate ? new Date(filters.startDate) : null;
    const safeEndDate = filters.endDate ? new Date(filters.endDate) : null;

    const handleDatePreset = (preset: "all" | "today" | "7days" | "month" | "custom") => {
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
            const end = endOfDay(now);
            onFilterChange({
                startDate: start.toISOString(),
                endDate: end.toISOString(),
                datePreset: "month"
            });
        } else {
            onFilterChange({ datePreset: "custom" });
        }
    };

    // Count active filters
    const activeFiltersCount = React.useMemo(() => {
        let count = 0;
        if (filters.branch_id) count++;
        if (filters.product_type_id) count++;
        if (filters.product_id) count++;
        if (filters.lot_id) count++;
        if (filters.batch_no) count++;
        if (filters.transaction_type && filters.transaction_type !== "ALL") count++;
        if (filters.movement_direction && filters.movement_direction !== "ALL") count++;
        if (filters.inventory_condition && filters.inventory_condition !== "ALL") count++;
        if (filters.search_query) count++;
        if (filters.startDate || filters.endDate) count++;
        return count;
    }, [filters]);

    return (
        <Card className="rounded-2xl border shadow-sm overflow-visible bg-card">
            <CardContent className="p-4 sm:p-6 space-y-4">
                {/* Search Bar & Primary Actions Row */}
                <div className="flex flex-col md:flex-row items-center gap-3">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by Reference No, Product Code, Batch No, Remarks..."
                            className="pl-10 h-10 rounded-xl bg-muted/30 border-muted-foreground/20 text-sm focus-visible:ring-primary"
                            value={filters.search_query || ""}
                            onChange={(e) => onFilterChange({ search_query: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") onSearch();
                            }}
                        />
                        {filters.search_query && (
                            <button
                                onClick={() => onFilterChange({ search_query: "" })}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto shrink-0">
                        <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                                "h-10 rounded-xl px-3.5 text-xs font-bold gap-2 transition-all",
                                showAdvanced || activeFiltersCount > 0 ? "border-primary/40 bg-primary/5 text-primary" : "text-muted-foreground"
                            )}
                            onClick={() => setShowAdvanced(!showAdvanced)}
                        >
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            <span>Filters</span>
                            {activeFiltersCount > 0 && (
                                <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-black rounded-full bg-primary text-primary-foreground">
                                    {activeFiltersCount}
                                </Badge>
                            )}
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-10 rounded-xl px-3 text-xs font-bold text-muted-foreground hover:bg-muted"
                            onClick={onReset}
                            disabled={isLoading}
                        >
                            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                            Reset
                        </Button>

                        <Button
                            size="sm"
                            className="h-10 rounded-xl px-5 bg-primary text-primary-foreground font-bold text-xs uppercase tracking-wider shadow-sm hover:bg-primary/90 transition-all active:scale-95 shrink-0"
                            onClick={onSearch}
                            disabled={isLoading}
                        >
                            <Search className="h-3.5 w-3.5 mr-2" />
                            {isLoading ? "Tracing..." : "Trace Movements"}
                        </Button>
                    </div>
                </div>

                {/* Main Filter Dropdowns */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <SearchableSelect
                        label="Branch / Warehouse"
                        placeholder="Select Branch"
                        emptyText="No branch found."
                        value={filters.branch_id}
                        options={branchOptions}
                        onChange={(val) => onFilterChange({ branch_id: val })}
                        searchPlaceholder="Search branch name or code..."
                        disabled={isLoading}
                    />

                    <SearchableSelect
                        label="Product Type"
                        placeholder="Select Product Type"
                        emptyText="No product type found."
                        value={filters.product_type_id}
                        options={productTypeOptions}
                        onChange={(val) => onFilterChange({ product_type_id: val })}
                        searchPlaceholder="Search product type..."
                        disabled={isLoading}
                    />

                    <SearchableSelect
                        label="Product / Item"
                        placeholder="Select Product"
                        emptyText="No product found."
                        value={filters.product_id}
                        options={productOptions}
                        onChange={(val) => onFilterChange({ product_id: val })}
                        searchPlaceholder="Search product name or SKU..."
                        disabled={isLoading}
                    />

                    <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-70">
                            Batch Number
                        </Label>
                        <Input
                            placeholder="e.g. BATCH-001 or dsaf"
                            className="h-10 rounded-xl text-xs border-muted-foreground/20"
                            value={filters.batch_no || ""}
                            onChange={(e) => onFilterChange({ batch_no: e.target.value })}
                            disabled={isLoading}
                        />
                    </div>
                </div>

                {/* Advanced Filter Drawers (Expanded) */}
                {showAdvanced && (
                    <div className="pt-3 border-t space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <SearchableSelect
                                label="Lot Assignment"
                                placeholder="Select Lot"
                                emptyText="No lot found."
                                value={filters.lot_id}
                                options={lotOptions}
                                onChange={(val) => onFilterChange({ lot_id: val })}
                                searchPlaceholder="Search lot name..."
                                disabled={isLoading}
                            />

                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-70">
                                    Transaction Type
                                </Label>
                                <div className="relative">
                                    <select
                                        className="w-full h-10 rounded-xl px-3 bg-background border border-muted-foreground/20 text-xs font-semibold text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                                        value={filters.transaction_type || "ALL"}
                                        onChange={(e) => onFilterChange({ transaction_type: e.target.value })}
                                        disabled={isLoading}
                                    >
                                        {TRANSACTION_TYPES.map(t => (
                                            <option key={t.value} value={t.value}>{t.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-70">
                                    Inventory Condition
                                </Label>
                                <div className="relative">
                                    <select
                                        className="w-full h-10 rounded-xl px-3 bg-background border border-muted-foreground/20 text-xs font-semibold text-foreground focus:ring-1 focus:ring-primary focus:outline-none"
                                        value={filters.inventory_condition || "ALL"}
                                        onChange={(e) => onFilterChange({ inventory_condition: e.target.value as "ALL" | "GOOD" | "EXPIRED" | "DAMAGED" | "QUARANTINED" })}
                                        disabled={isLoading}
                                    >
                                        {CONDITIONS.map(c => (
                                            <option key={c.value} value={c.value}>{c.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Direction Pills & Date Preset Bar */}
                        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pt-2">
                            {/* Direction Selector */}
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                                    Direction:
                                </span>
                                <div className="inline-flex rounded-xl bg-muted/60 p-1">
                                    {(["ALL", "IN", "OUT"] as const).map((dir) => (
                                        <button
                                            key={dir}
                                            type="button"
                                            onClick={() => onFilterChange({ movement_direction: dir })}
                                            className={cn(
                                                "px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-lg transition-all",
                                                (filters.movement_direction || "ALL") === dir
                                                    ? "bg-background text-foreground shadow-xs"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {dir === "ALL" ? "All" : dir === "IN" ? "Inbound (IN)" : "Outbound (OUT)"}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Date Presets & Picker */}
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                                    Date Range:
                                </span>
                                <div className="inline-flex rounded-xl bg-muted/60 p-1">
                                    {DATE_PRESETS.map((dp) => (
                                        <button
                                            key={dp.key}
                                            type="button"
                                            onClick={() => handleDatePreset(dp.key as "all" | "today" | "7days" | "month" | "custom")}
                                            className={cn(
                                                "px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all",
                                                (filters.datePreset || "all") === dp.key
                                                    ? "bg-background text-foreground shadow-xs"
                                                    : "text-muted-foreground hover:text-foreground"
                                            )}
                                        >
                                            {dp.label}
                                        </button>
                                    ))}
                                </div>

                                <Popover>
                                    <PopoverTrigger asChild>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className={cn(
                                                "h-8 rounded-xl px-3 text-xs font-normal border-muted-foreground/20 gap-1.5",
                                                !safeStartDate && "text-muted-foreground"
                                            )}
                                            disabled={isLoading}
                                        >
                                            <CalendarIcon className="h-3.5 w-3.5 opacity-60" />
                                            {safeStartDate && safeEndDate ? (
                                                <span className="font-semibold text-[11px]">
                                                    {format(safeStartDate, "MMM dd")} - {format(safeEndDate, "MMM dd, yyyy")}
                                                </span>
                                            ) : safeStartDate ? (
                                                <span className="font-semibold text-[11px]">
                                                    From {format(safeStartDate, "MMM dd, yyyy")}
                                                </span>
                                            ) : (
                                                <span className="text-[11px]">Select Range</span>
                                            )}
                                        </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 rounded-2xl border shadow-xl" align="end">
                                        <Calendar
                                            mode="range"
                                            defaultMonth={safeStartDate || undefined}
                                            selected={{
                                                from: safeStartDate || undefined,
                                                to: safeEndDate || undefined
                                            }}
                                            onSelect={(range) => {
                                                const s = range?.from ? new Date(range.from) : null;
                                                const e = range?.to ? new Date(range.to) : null;
                                                if (s) s.setHours(0, 0, 0, 0);
                                                if (e) e.setHours(23, 59, 59, 999);

                                                onFilterChange({
                                                    startDate: s ? s.toISOString() : null,
                                                    endDate: e ? e.toISOString() : null,
                                                    datePreset: "custom"
                                                });
                                            }}
                                            numberOfMonths={2}
                                        />
                                    </PopoverContent>
                                </Popover>
                            </div>
                        </div>
                    </div>
                )}

                {/* Active Filter Chips */}
                {activeFiltersCount > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1 text-xs">
                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mr-1">
                            Active Filters:
                        </span>

                        {filters.branch_id && (
                            <Badge variant="secondary" className="gap-1 rounded-lg font-bold text-[10px] py-1 px-2">
                                Branch: {branches.find(b => b.id === filters.branch_id)?.branchName || `#${filters.branch_id}`}
                                <X className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100" onClick={() => onFilterChange({ branch_id: null })} />
                            </Badge>
                        )}

                        {filters.product_type_id && (
                            <Badge variant="secondary" className="gap-1 rounded-lg font-bold text-[10px] py-1 px-2">
                                Type: {productTypes.find(pt => Number(pt.id) === filters.product_type_id)?.name || `#${filters.product_type_id}`}
                                <X className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100" onClick={() => onFilterChange({ product_type_id: null })} />
                            </Badge>
                        )}

                        {filters.product_id && (
                            <Badge variant="secondary" className="gap-1 rounded-lg font-bold text-[10px] py-1 px-2">
                                Product: {products.find(p => p.productId === filters.product_id)?.productName || `#${filters.product_id}`}
                                <X className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100" onClick={() => onFilterChange({ product_id: null })} />
                            </Badge>
                        )}

                        {filters.batch_no && (
                            <Badge variant="secondary" className="gap-1 rounded-lg font-bold text-[10px] py-1 px-2">
                                Batch: {filters.batch_no}
                                <X className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100" onClick={() => onFilterChange({ batch_no: "" })} />
                            </Badge>
                        )}

                        {filters.lot_id && (
                            <Badge variant="secondary" className="gap-1 rounded-lg font-bold text-[10px] py-1 px-2">
                                Lot: #{filters.lot_id}
                                <X className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100" onClick={() => onFilterChange({ lot_id: null })} />
                            </Badge>
                        )}

                        {filters.transaction_type && filters.transaction_type !== "ALL" && (
                            <Badge variant="secondary" className="gap-1 rounded-lg font-bold text-[10px] py-1 px-2">
                                Type: {filters.transaction_type}
                                <X className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100" onClick={() => onFilterChange({ transaction_type: "ALL" })} />
                            </Badge>
                        )}

                        {filters.movement_direction && filters.movement_direction !== "ALL" && (
                            <Badge variant="secondary" className="gap-1 rounded-lg font-bold text-[10px] py-1 px-2">
                                Direction: {filters.movement_direction}
                                <X className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100" onClick={() => onFilterChange({ movement_direction: "ALL" })} />
                            </Badge>
                        )}

                        {filters.inventory_condition && filters.inventory_condition !== "ALL" && (
                            <Badge variant="secondary" className="gap-1 rounded-lg font-bold text-[10px] py-1 px-2">
                                Condition: {filters.inventory_condition}
                                <X className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100" onClick={() => onFilterChange({ inventory_condition: "ALL" })} />
                            </Badge>
                        )}

                        {(filters.startDate || filters.endDate) && (
                            <Badge variant="secondary" className="gap-1 rounded-lg font-bold text-[10px] py-1 px-2">
                                Date: {safeStartDate ? format(safeStartDate, "MMM dd") : "Any"} - {safeEndDate ? format(safeEndDate, "MMM dd, yyyy") : "Any"}
                                <X className="h-3 w-3 cursor-pointer opacity-70 hover:opacity-100" onClick={() => onFilterChange({ startDate: null, endDate: null, datePreset: "all" })} />
                            </Badge>
                        )}

                        <button
                            onClick={onReset}
                            className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline ml-1"
                        >
                            Clear all
                        </button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
