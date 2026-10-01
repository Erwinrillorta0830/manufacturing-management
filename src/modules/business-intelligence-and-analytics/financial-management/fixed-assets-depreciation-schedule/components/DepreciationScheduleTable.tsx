"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Building2,
    ChevronDown,
    ChevronRight,
    ChevronLeft,
    AlertCircle,
    Layers,
    ListTree,
    FolderKanban,
    ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    AssetDepreciationRecord,
    DepreciationScheduleSummary,
    ScheduleGroupingMode,
    AssetDepreciationGroup
} from "../types";
import {
    formatCurrency,
    formatPercent,
    formatDateString
} from "../utils/depreciationCalculations";

interface DepreciationScheduleTableProps {
    assets: AssetDepreciationRecord[];
    isLoading: boolean;
    onSelectAssetForSchedule: (asset: AssetDepreciationRecord) => void;
    summary?: DepreciationScheduleSummary | null;
}

type SortField =
    | "item_name"
    | "acquisition_cost"
    | "current_period_depreciation"
    | "net_book_value"
    | "depreciation_start_date";

type SortOrder = "asc" | "desc";

export default function DepreciationScheduleTable({
    assets,
    isLoading,
    onSelectAssetForSchedule,
    summary
}: DepreciationScheduleTableProps) {
    const [groupingMode, setGroupingMode] = useState<ScheduleGroupingMode>("category");
    const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
    const [sortField, setSortField] = useState<SortField>("item_name");
    const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(15);

    // Sorting logic
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === "asc" ? "desc" : "asc");
        } else {
            setSortField(field);
            setSortOrder("asc");
        }
    };

    // Sort comparator
    const sortComparator = useMemo(() => {
        return (a: AssetDepreciationRecord, b: AssetDepreciationRecord) => {
            let aVal: string | number = a[sortField] ?? "";
            let bVal: string | number = b[sortField] ?? "";

            if (typeof aVal === "string" && typeof bVal === "string") {
                const cmp = aVal.localeCompare(bVal);
                return sortOrder === "asc" ? cmp : -cmp;
            }

            aVal = Number(aVal) || 0;
            bVal = Number(bVal) || 0;
            return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
        };
    }, [sortField, sortOrder]);

    // Flat sorted assets
    const sortedAssets = useMemo(() => {
        return [...assets].sort(sortComparator);
    }, [assets, sortComparator]);

    // Grouped assets computation
    const groups = useMemo<AssetDepreciationGroup[]>(() => {
        if (groupingMode === "none") return [];

        const groupMap: Record<string, AssetDepreciationRecord[]> = {};

        for (const asset of assets) {
            let groupKey = "Unassigned";
            if (groupingMode === "category") {
                groupKey = asset.asset_type || "Unclassified";
            } else if (groupingMode === "department") {
                groupKey = asset.department_name?.trim() || "Unassigned";
            }

            if (!groupMap[groupKey]) {
                groupMap[groupKey] = [];
            }
            groupMap[groupKey].push(asset);
        }

        const result: AssetDepreciationGroup[] = Object.keys(groupMap).map((key) => {
            const groupAssets = groupMap[key].sort(sortComparator);
            const totalAcquisitionCost = groupAssets.reduce((sum, a) => sum + (Number(a.acquisition_cost) || 0), 0);
            const totalSalvageValue = groupAssets.reduce((sum, a) => sum + (Number(a.residual_value) || 0), 0);
            const totalBeginningAccumDepreciation = groupAssets.reduce((sum, a) => sum + (Number(a.beginning_accumulated_depreciation) || 0), 0);
            const totalCurrentPeriodDepreciation = groupAssets.reduce((sum, a) => sum + (Number(a.current_period_depreciation) || 0), 0);
            const totalEndingAccumDepreciation = groupAssets.reduce((sum, a) => sum + (Number(a.ending_accumulated_depreciation) || 0), 0);
            const totalNetBookValue = groupAssets.reduce((sum, a) => sum + (Number(a.net_book_value) || 0), 0);
            const groupDepreciableBase = Math.max(0, totalAcquisitionCost - totalSalvageValue);
            const avgDepreciatedPercent = groupDepreciableBase > 0 ? (totalEndingAccumDepreciation / groupDepreciableBase) * 100 : null;

            let title = key;
            if (groupingMode === "category") {
                title = `${key} Assets`;
            } else if (groupingMode === "department") {
                title = key === "Unassigned" ? "Unassigned Department" : `${key} Department`;
            }

            return {
                key,
                title,
                count: groupAssets.length,
                totalAcquisitionCost,
                totalSalvageValue,
                totalBeginningAccumDepreciation,
                totalCurrentPeriodDepreciation,
                totalEndingAccumDepreciation,
                totalNetBookValue,
                avgDepreciatedPercent,
                assets: groupAssets
            };
        });

        return result.sort((a, b) => a.title.localeCompare(b.title));
    }, [assets, groupingMode, sortComparator]);

    // Grand Totals computation
    const grandTotals = useMemo(() => {
        const totalHistoricalCost = summary?.total_acquisition_cost ?? assets.reduce((sum, a) => sum + (Number(a.acquisition_cost) || 0), 0);
        const totalSalvage = summary?.total_salvage_value ?? assets.reduce((sum, a) => sum + (Number(a.residual_value) || 0), 0);
        const totalAccumDepr = summary?.total_ending_accum_depreciation ?? assets.reduce((sum, a) => sum + (Number(a.ending_accumulated_depreciation) || 0), 0);
        const totalPeriodExp = summary?.total_current_period_depreciation ?? assets.reduce((sum, a) => sum + (Number(a.current_period_depreciation) || 0), 0);
        const totalNBV = summary?.total_net_book_value ?? assets.reduce((sum, a) => sum + (Number(a.net_book_value) || 0), 0);
        const totalDepreciableBase = summary?.total_depreciable_base ?? Math.max(0, totalHistoricalCost - totalSalvage);
        const overallDeprPercent = totalDepreciableBase > 0 ? (totalAccumDepr / totalDepreciableBase) * 100 : null;

        return {
            count: summary?.total_assets_count ?? assets.length,
            totalHistoricalCost,
            totalSalvage,
            totalDepreciableBase,
            totalAccumDepr,
            totalPeriodExp,
            totalNBV,
            overallDeprPercent
        };
    }, [assets, summary]);

    // Helper to check if group is collapsed (collapsed by default for clean BIA presentation)
    const isGroupCollapsed = (groupKey: string) => {
        return collapsedGroups[groupKey] !== undefined ? collapsedGroups[groupKey] : true;
    };

    // Group toggle actions
    const toggleGroup = (groupKey: string) => {
        setCollapsedGroups((prev) => {
            const currentlyCollapsed = prev[groupKey] !== undefined ? prev[groupKey] : true;
            return {
                ...prev,
                [groupKey]: !currentlyCollapsed
            };
        });
    };

    const handleExpandAll = () => {
        const allExpanded: Record<string, boolean> = {};
        for (const g of groups) {
            allExpanded[g.key] = false;
        }
        setCollapsedGroups(allExpanded);
    };

    const handleCollapseAll = () => {
        const allCollapsed: Record<string, boolean> = {};
        for (const g of groups) {
            allCollapsed[g.key] = true;
        }
        setCollapsedGroups(allCollapsed);
    };

    // Flat pagination calculations
    const totalPages = Math.max(1, Math.ceil(sortedAssets.length / pageSize));
    const startIndex = (currentPage - 1) * pageSize;
    const paginatedAssets = sortedAssets.slice(startIndex, startIndex + pageSize);

    const renderSortIcon = (field: SortField) => {
        if (sortField !== field) {
            return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/40" />;
        }
        return sortOrder === "asc" ? (
            <ArrowUp className="ml-1 h-3 w-3 text-primary" />
        ) : (
            <ArrowDown className="ml-1 h-3 w-3 text-primary" />
        );
    };

    // Helper for useful life string
    const formatUsefulLife = (asset: AssetDepreciationRecord) => {
        if (asset.depreciation_method === "Straight Line") {
            if (asset.life_span_years && asset.life_span_years > 0) {
                return `Straight Line · ${asset.life_span_years} ${asset.life_span_years === 1 ? "Year" : "Years"}`;
            }
            if (asset.life_span_months && asset.life_span_months > 0) {
                return `Straight Line · ${asset.life_span_months} Months`;
            }
            return "Straight Line";
        }
        if (asset.maximum_unit_produced_capacity) {
            return `Units of Production · Capacity: ${asset.maximum_unit_produced_capacity.toLocaleString()} ${asset.production_unit_shortcut || "Units"}`;
        }
        return "Units of Production";
    };

    // Render an asset row in 5 clean columns
    const renderAssetRow = (asset: AssetDepreciationRecord) => (
        <tr
            key={asset.id}
            onClick={() => onSelectAssetForSchedule(asset)}
            className="hover:bg-muted/40 transition-colors group cursor-pointer border-b border-border/50 last:border-b-0"
        >
            {/* Column 1: Asset Information Hierarchy (36%) */}
            <td className="px-4 py-3.5 align-top w-[36%]">
                <div className="space-y-0.5">
                    <div className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">
                        {asset.item_name}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span>{asset.department_name || "Unassigned"}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="font-mono">{formatDateString(asset.depreciation_start_date)}</span>
                    </div>
                    {asset.depreciation_method === "Units of Production" ? (
                        <div className="text-[11px] text-muted-foreground/85 space-y-0.5 pt-0.5">
                            <div className="font-medium text-foreground/80">Units of Production</div>
                            <div className="text-muted-foreground/75">
                                {asset.maximum_unit_produced_capacity
                                    ? `Est. Lifetime Capacity: ${asset.maximum_unit_produced_capacity.toLocaleString()} ${asset.production_unit_shortcut || "Units"}`
                                    : "Est. Lifetime Capacity: Unspecified"}
                            </div>
                            <div className="font-mono text-[11px]">
                                {asset.actual_units_produced && asset.actual_units_produced > 0 ? (
                                    <span className="text-foreground/90 font-medium">
                                        Actual: {asset.actual_units_produced.toLocaleString()} {asset.production_unit_shortcut || "Units"}
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground/60 italic">No activity recorded</span>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-[11px] text-muted-foreground/80">
                            {formatUsefulLife(asset)}
                        </div>
                    )}
                </div>
            </td>

            {/* Column 2: Cost (18%) */}
            <td className="px-4 py-3.5 text-right align-top whitespace-nowrap w-[18%]">
                <div className="space-y-0.5">
                    <div className="font-bold text-sm font-mono text-foreground">
                        {formatCurrency(asset.acquisition_cost)}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">
                        Salvage {formatCurrency(asset.residual_value)}
                    </div>
                </div>
            </td>

            {/* Column 3: Depreciation (18%) */}
            <td className="px-4 py-3.5 text-right align-top whitespace-nowrap w-[18%]">
                <div className="space-y-0.5">
                    <div className="font-bold text-sm font-mono text-foreground">
                        {formatCurrency(asset.current_period_depreciation)}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">
                        Accum. {formatCurrency(asset.ending_accumulated_depreciation)}
                    </div>
                </div>
            </td>

            {/* Column 4: Net Book Value (18%) */}
            <td className="px-4 py-3.5 text-right align-top whitespace-nowrap w-[18%]">
                <div className="space-y-0.5">
                    <div className="font-bold text-sm font-mono text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(asset.net_book_value)}
                    </div>
                    <div className="text-xs font-mono text-muted-foreground">
                        {asset.depreciated_percent !== null && asset.depreciated_percent !== undefined
                            ? `${formatPercent(asset.depreciated_percent)} depreciated`
                            : "N/A"}
                    </div>
                </div>
            </td>

            {/* Column 5: Action Link (10%) - Strictly whitespace-nowrap to prevent two-line wrapping */}
            <td className="px-4 py-3.5 text-right align-middle whitespace-nowrap w-[10%]">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        onSelectAssetForSchedule(asset);
                    }}
                    className="h-8 px-2 text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 gap-1 whitespace-nowrap shrink-0"
                >
                    <span className="whitespace-nowrap">View Schedule</span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                </Button>
            </td>
        </tr>
    );

    return (
        <div className="space-y-4">
            {/* View Mode & Reporting Controls Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-card px-4 py-2.5 rounded-xl border border-border/70 shadow-xs">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                        <FolderKanban className="h-3.5 w-3.5 text-primary" />
                        Report Grouping:
                    </span>
                    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
                        <button
                            type="button"
                            onClick={() => setGroupingMode("category")}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all font-medium ${
                                groupingMode === "category"
                                    ? "bg-background text-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Layers className="h-3 w-3" />
                            By Category
                        </button>
                        <button
                            type="button"
                            onClick={() => setGroupingMode("department")}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all font-medium ${
                                groupingMode === "department"
                                    ? "bg-background text-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Building2 className="h-3 w-3" />
                            By Department
                        </button>
                        <button
                            type="button"
                            onClick={() => setGroupingMode("none")}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-all font-medium ${
                                groupingMode === "none"
                                    ? "bg-background text-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <ListTree className="h-3 w-3" />
                            Flat Ledger
                        </button>
                    </div>
                </div>

                {groupingMode !== "none" && (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleExpandAll}
                            className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                        >
                            Expand All
                        </Button>
                        <span className="text-muted-foreground/40">•</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleCollapseAll}
                            className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground"
                        >
                            Collapse All
                        </Button>
                    </div>
                )}
            </div>

            {/* Empty State */}
            {!isLoading && assets.length === 0 && (
                <div className="rounded-xl border border-border/80 bg-card p-12 text-center text-muted-foreground shadow-xs">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col items-center justify-center gap-2"
                    >
                        <AlertCircle className="h-8 w-8 text-muted-foreground/60" />
                        <p className="text-sm font-medium">No assets matching the selected filters.</p>
                        <p className="text-xs text-muted-foreground">Try adjusting your reporting date cutoff, search query, or status filters.</p>
                    </motion.div>
                </div>
            )}

            {/* Loading State */}
            {isLoading && (
                <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, idx) => (
                        <div key={idx} className="rounded-xl border border-border/70 bg-card p-6 shadow-xs animate-pulse">
                            <div className="h-5 w-48 bg-muted rounded mb-4" />
                            <div className="space-y-2">
                                <div className="h-10 bg-muted/60 rounded" />
                                <div className="h-10 bg-muted/40 rounded" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Grouped View (Section / Accordion Cards) */}
            {!isLoading && groupingMode !== "none" && assets.length > 0 && (
                <div className="space-y-4">
                    {groups.map((group) => {
                        const isCollapsed = isGroupCollapsed(group.key);
                        return (
                            <div
                                key={group.key}
                                className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs transition-all"
                            >
                                {/* Accordion Card Header with Integrated Subtotals */}
                                <div
                                    onClick={() => toggleGroup(group.key)}
                                    className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-muted/50 hover:bg-muted/70 cursor-pointer select-none transition-colors ${
                                        isCollapsed ? "" : "border-b border-border/60"
                                    }`}
                                >
                                    {/* Left: Group Title + Asset Count */}
                                    <div className="flex items-center gap-2.5 min-w-[240px]">
                                        <div className="rounded-md p-1 bg-background/80 text-foreground shadow-xs">
                                            {isCollapsed ? (
                                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                            ) : (
                                                <ChevronDown className="h-4 w-4 text-primary" />
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-foreground text-sm">
                                                    {group.title}
                                                </span>
                                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                                    {group.count} {group.count === 1 ? "asset" : "assets"}
                                                </Badge>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Subtotals Strip */}
                                    <div className="flex items-center gap-6 sm:gap-10 text-right ml-auto">
                                        <div className="space-y-0.5">
                                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                                                Subtotal Cost
                                            </div>
                                            <div className="font-bold text-xs sm:text-sm font-mono text-foreground">
                                                {formatCurrency(group.totalAcquisitionCost)}
                                            </div>
                                        </div>

                                        <div className="space-y-0.5">
                                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                                                Subtotal Depr.
                                            </div>
                                            <div className="font-bold text-xs sm:text-sm font-mono text-foreground">
                                                {formatCurrency(group.totalCurrentPeriodDepreciation)}
                                            </div>
                                        </div>

                                        <div className="space-y-0.5">
                                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
                                                Subtotal NBV
                                            </div>
                                            <div className="font-bold text-xs sm:text-sm font-mono text-emerald-600 dark:text-emerald-400">
                                                {formatCurrency(group.totalNetBookValue)}
                                            </div>
                                        </div>

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hidden sm:inline-flex"
                                        >
                                            {isCollapsed ? "Expand" : "Collapse"}
                                        </Button>
                                    </div>
                                </div>

                                {/* Accordion Card Content (Child Assets Table) */}
                                <AnimatePresence initial={false}>
                                    {!isCollapsed && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-x-auto"
                                        >
                                            <table className="w-full text-left text-xs border-collapse">
                                                <thead className="bg-muted/20 text-muted-foreground border-b border-border/50 select-none">
                                                    <tr>
                                                        <th
                                                            onClick={() => handleSort("item_name")}
                                                            className="px-4 py-2.5 font-medium cursor-pointer hover:text-foreground w-[36%]"
                                                        >
                                                            <div className="flex items-center">
                                                                <span>Asset</span>
                                                                {renderSortIcon("item_name")}
                                                            </div>
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("acquisition_cost")}
                                                            className="px-4 py-2.5 font-medium text-right cursor-pointer hover:text-foreground w-[18%]"
                                                        >
                                                            <div className="flex items-center justify-end">
                                                                <span>Cost</span>
                                                                {renderSortIcon("acquisition_cost")}
                                                            </div>
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("current_period_depreciation")}
                                                            className="px-4 py-2.5 font-medium text-right cursor-pointer hover:text-foreground w-[18%]"
                                                        >
                                                            <div className="flex items-center justify-end">
                                                                <span>Depreciation</span>
                                                                {renderSortIcon("current_period_depreciation")}
                                                            </div>
                                                        </th>
                                                        <th
                                                            onClick={() => handleSort("net_book_value")}
                                                            className="px-4 py-2.5 font-medium text-right cursor-pointer hover:text-foreground w-[18%]"
                                                        >
                                                            <div className="flex items-center justify-end">
                                                                <span>Net Book Value</span>
                                                                {renderSortIcon("net_book_value")}
                                                            </div>
                                                        </th>
                                                        <th className="px-4 py-2.5 text-right w-[10%]"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {group.assets.map((asset) => renderAssetRow(asset))}
                                                </tbody>
                                            </table>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Flat Ledger View */}
            {!isLoading && groupingMode === "none" && assets.length > 0 && (
                <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead className="bg-muted/50 text-muted-foreground border-b border-border select-none">
                                <tr>
                                    <th
                                        onClick={() => handleSort("item_name")}
                                        className="px-4 py-3 font-medium cursor-pointer hover:text-foreground w-[36%]"
                                    >
                                        <div className="flex items-center">
                                            <span>Asset</span>
                                            {renderSortIcon("item_name")}
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSort("acquisition_cost")}
                                        className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground w-[18%]"
                                    >
                                        <div className="flex items-center justify-end">
                                            <span>Cost</span>
                                            {renderSortIcon("acquisition_cost")}
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSort("current_period_depreciation")}
                                        className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground w-[18%]"
                                    >
                                        <div className="flex items-center justify-end">
                                            <span>Depreciation</span>
                                            {renderSortIcon("current_period_depreciation")}
                                        </div>
                                    </th>
                                    <th
                                        onClick={() => handleSort("net_book_value")}
                                        className="px-4 py-3 font-medium text-right cursor-pointer hover:text-foreground w-[18%]"
                                    >
                                        <div className="flex items-center justify-end">
                                            <span>Net Book Value</span>
                                            {renderSortIcon("net_book_value")}
                                        </div>
                                    </th>
                                    <th className="px-4 py-3 text-right w-[10%]"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedAssets.map((asset) => renderAssetRow(asset))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Grand Totals Summary Card (Sticky/Permanent Accounting Totals) */}
            {!isLoading && assets.length > 0 && (
                <div className="rounded-xl border border-border/90 bg-muted/80 p-4 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-2.5">
                            <div className="rounded-lg bg-primary/10 p-2 text-primary">
                                <Layers className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm text-foreground">Grand Total Balance Sheet Values</h3>
                                <p className="text-xs text-muted-foreground">
                                    Total capitalized cost, periodic depreciation, and carrying NBV across all {grandTotals.count} registered assets
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-6 sm:gap-12 text-right">
                            <div className="space-y-0.5">
                                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                                    Historical Cost
                                </span>
                                <div className="font-bold text-base font-mono text-foreground">
                                    {formatCurrency(grandTotals.totalHistoricalCost)}
                                </div>
                                <div className="text-[11px] font-mono text-muted-foreground">
                                    Salvage {formatCurrency(grandTotals.totalSalvage)}
                                </div>
                            </div>

                            <div className="space-y-0.5">
                                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                                    Current Period Exp.
                                </span>
                                <div className="font-bold text-base font-mono text-foreground">
                                    {formatCurrency(grandTotals.totalPeriodExp)}
                                </div>
                                <div className="text-[11px] font-mono text-muted-foreground">
                                    Accum. {formatCurrency(grandTotals.totalAccumDepr)}
                                </div>
                            </div>

                            <div className="space-y-0.5">
                                <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                                    Net Book Value
                                </span>
                                <div className="font-bold text-base font-mono text-emerald-600 dark:text-emerald-400">
                                    {formatCurrency(grandTotals.totalNBV)}
                                </div>
                                <div className="text-[11px] font-mono text-muted-foreground">
                                    {grandTotals.overallDeprPercent !== null && grandTotals.overallDeprPercent !== undefined
                                        ? `${formatPercent(grandTotals.overallDeprPercent)} depreciated`
                                        : "N/A"}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Controls / Pagination Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground px-1">
                <div className="flex items-center gap-2">
                    {groupingMode === "none" ? (
                        <>
                            <span>Showing</span>
                            <span className="font-semibold font-mono text-foreground">
                                {assets.length === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + pageSize, assets.length)}
                            </span>
                            <span>of</span>
                            <span className="font-semibold font-mono text-foreground">{assets.length}</span>
                            <span>assets</span>
                        </>
                    ) : (
                        <>
                            <span>Showing</span>
                            <span className="font-semibold font-mono text-foreground">{groups.length}</span>
                            <span>groups with</span>
                            <span className="font-semibold font-mono text-foreground">{assets.length}</span>
                            <span>total assets</span>
                        </>
                    )}
                </div>

                {groupingMode === "none" && (
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                            <span>Rows per page:</span>
                            <Select
                                value={String(pageSize)}
                                onValueChange={(val) => {
                                    setPageSize(Number(val));
                                    setCurrentPage(1);
                                }}
                            >
                                <SelectTrigger className="h-7 w-16 text-xs bg-background">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">10</SelectItem>
                                    <SelectItem value="15">15</SelectItem>
                                    <SelectItem value="25">25</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                disabled={currentPage <= 1 || isLoading}
                                className="h-7 w-7 p-0"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <span className="px-2 font-mono text-xs">
                                {currentPage} / {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                                disabled={currentPage >= totalPages || isLoading}
                                className="h-7 w-7 p-0"
                            >
                                <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
