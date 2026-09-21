"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Building2,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Eye,
    Tag,
    AlertCircle,
    CheckCircle2,
    Clock,
    AlertTriangle,
    Calculator
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
import { AssetDepreciationRecord, AssetReportingStatus } from "../types";
import {
    formatCurrency,
    formatPercent,
    formatDateString
} from "../utils/depreciationCalculations";

interface DepreciationScheduleTableProps {
    assets: AssetDepreciationRecord[];
    isLoading: boolean;
    onSelectAssetForSchedule: (asset: AssetDepreciationRecord) => void;
}

type SortField =
    | "id"
    | "item_name"
    | "department_name"
    | "acquisition_cost"
    | "residual_value"
    | "ending_accumulated_depreciation"
    | "current_period_depreciation"
    | "net_book_value"
    | "depreciated_percent"
    | "depreciation_start_date";

type SortOrder = "asc" | "desc";

export default function DepreciationScheduleTable({
    assets,
    isLoading,
    onSelectAssetForSchedule
}: DepreciationScheduleTableProps) {
    const [sortField, setSortField] = useState<SortField>("id");
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

    const sortedAssets = useMemo(() => {
        return [...assets].sort((a, b) => {
            let aVal: string | number = a[sortField] ?? "";
            let bVal: string | number = b[sortField] ?? "";

            if (typeof aVal === "string" && typeof bVal === "string") {
                const cmp = aVal.localeCompare(bVal);
                return sortOrder === "asc" ? cmp : -cmp;
            }

            aVal = Number(aVal) || 0;
            bVal = Number(bVal) || 0;
            return sortOrder === "asc" ? aVal - bVal : bVal - aVal;
        });
    }, [assets, sortField, sortOrder]);

    // Pagination calculations
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

    const getStatusBadge = (status: AssetReportingStatus) => {
        switch (status) {
            case "Active":
                return (
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 text-[11px] gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Active
                    </Badge>
                );
            case "Fully Depreciated":
                return (
                    <Badge variant="outline" className="border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-500/10 text-[11px] gap-1">
                        <Clock className="h-3 w-3" />
                        Fully Depr.
                    </Badge>
                );
            case "Under Maintenance":
                return (
                    <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 text-[11px] gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Maintenance
                    </Badge>
                );
            case "Discontinued":
            case "Bad":
                return (
                    <Badge variant="outline" className="border-slate-500/40 text-slate-600 dark:text-slate-400 bg-slate-500/10 text-[11px] gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {status}
                    </Badge>
                );
            default:
                return <Badge variant="secondary">{status}</Badge>;
        }
    };

    return (
        <div className="space-y-3">
            {/* Table Container */}
            <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-muted/50 text-muted-foreground border-b border-border select-none">
                            <tr>
                                <th
                                    onClick={() => handleSort("item_name")}
                                    className="px-3.5 py-3 font-medium cursor-pointer hover:text-foreground"
                                >
                                    <div className="flex items-center">
                                        <span>Asset / Item Description</span>
                                        {renderSortIcon("item_name")}
                                    </div>
                                </th>
                                <th
                                    onClick={() => handleSort("department_name")}
                                    className="px-3.5 py-3 font-medium cursor-pointer hover:text-foreground"
                                >
                                    <div className="flex items-center">
                                        <span>Department</span>
                                        {renderSortIcon("department_name")}
                                    </div>
                                </th>
                                <th className="px-3.5 py-3 font-medium">Type & Method</th>
                                <th
                                    onClick={() => handleSort("depreciation_start_date")}
                                    className="px-3.5 py-3 font-medium cursor-pointer hover:text-foreground"
                                >
                                    <div className="flex items-center">
                                        <span>In-Service</span>
                                        {renderSortIcon("depreciation_start_date")}
                                    </div>
                                </th>
                                <th
                                    onClick={() => handleSort("acquisition_cost")}
                                    className="px-3.5 py-3 font-medium text-right cursor-pointer hover:text-foreground"
                                >
                                    <div className="flex items-center justify-end">
                                        <span>Historical Cost</span>
                                        {renderSortIcon("acquisition_cost")}
                                    </div>
                                </th>
                                <th
                                    onClick={() => handleSort("residual_value")}
                                    className="px-3.5 py-3 font-medium text-right cursor-pointer hover:text-foreground"
                                >
                                    <div className="flex items-center justify-end">
                                        <span>Salvage</span>
                                        {renderSortIcon("residual_value")}
                                    </div>
                                </th>
                                <th
                                    onClick={() => handleSort("ending_accumulated_depreciation")}
                                    className="px-3.5 py-3 font-medium text-right cursor-pointer hover:text-foreground"
                                >
                                    <div className="flex items-center justify-end">
                                        <span>Accum. Depr.</span>
                                        {renderSortIcon("ending_accumulated_depreciation")}
                                    </div>
                                </th>
                                <th
                                    onClick={() => handleSort("current_period_depreciation")}
                                    className="px-3.5 py-3 font-medium text-right cursor-pointer hover:text-foreground"
                                >
                                    <div className="flex items-center justify-end">
                                        <span>Period Exp.</span>
                                        {renderSortIcon("current_period_depreciation")}
                                    </div>
                                </th>
                                <th
                                    onClick={() => handleSort("net_book_value")}
                                    className="px-3.5 py-3 font-medium text-right cursor-pointer hover:text-foreground"
                                >
                                    <div className="flex items-center justify-end">
                                        <span>Net Book Value</span>
                                        {renderSortIcon("net_book_value")}
                                    </div>
                                </th>
                                <th
                                    onClick={() => handleSort("depreciated_percent")}
                                    className="px-3.5 py-3 font-medium text-right cursor-pointer hover:text-foreground"
                                >
                                    <div className="flex items-center justify-end">
                                        <span>% Depr.</span>
                                        {renderSortIcon("depreciated_percent")}
                                    </div>
                                </th>
                                <th className="px-3.5 py-3 font-medium text-center">Status</th>
                                <th className="px-3.5 py-3 font-medium text-right">Audit Schedule</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-border/60">
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, idx) => (
                                    <tr key={idx} className="animate-pulse">
                                        <td colSpan={12} className="px-3.5 py-4">
                                            <div className="h-4 w-full bg-muted rounded" />
                                        </td>
                                    </tr>
                                ))
                            ) : paginatedAssets.length === 0 ? (
                                <tr>
                                    <td colSpan={12} className="px-3.5 py-12 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <AlertCircle className="h-8 w-8 text-muted-foreground/60" />
                                            <p className="text-sm font-medium">No assets matching the selected filters.</p>
                                            <p className="text-xs text-muted-foreground">Try adjusting your reporting date cutoff, search query, or status filters.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                <AnimatePresence initial={false}>
                                    {paginatedAssets.map((asset, i) => (
                                        <motion.tr
                                            key={asset.id}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.15, delay: i * 0.02 }}
                                            className="hover:bg-muted/40 transition-colors group cursor-pointer"
                                            onClick={() => onSelectAssetForSchedule(asset)}
                                        >
                                            {/* Item Name */}
                                            <td className="px-3.5 py-2.5">
                                                <div className="font-semibold text-foreground group-hover:text-primary transition-colors">
                                                    {asset.item_name}
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                                    {asset.serial && <span>SN: {asset.serial}</span>}
                                                    {asset.barcode && <span>• BC: {asset.barcode}</span>}
                                                </div>
                                            </td>

                                            {/* Department */}
                                            <td className="px-3.5 py-2.5 text-muted-foreground whitespace-nowrap">
                                                <span className="inline-flex items-center gap-1">
                                                    <Building2 className="h-3 w-3 text-muted-foreground/70" />
                                                    {asset.department_name}
                                                </span>
                                            </td>

                                            {/* Type & Method */}
                                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                                                <div className="flex flex-col gap-0.5">
                                                    <span className="text-[11px] font-medium text-foreground">
                                                        {asset.asset_type}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {asset.depreciation_method === "Units of Production" ? "UOP" : "Straight Line"}
                                                        {asset.asset_origin === "Existing" && " (Migrated)"}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* In-Service Date */}
                                            <td className="px-3.5 py-2.5 text-muted-foreground font-mono whitespace-nowrap">
                                                {formatDateString(asset.depreciation_start_date)}
                                            </td>

                                            {/* Cost */}
                                            <td className="px-3.5 py-2.5 text-right font-mono font-medium whitespace-nowrap">
                                                {formatCurrency(asset.acquisition_cost)}
                                            </td>

                                            {/* Salvage */}
                                            <td className="px-3.5 py-2.5 text-right font-mono text-muted-foreground whitespace-nowrap">
                                                {formatCurrency(asset.residual_value)}
                                            </td>

                                            {/* Accum Depr */}
                                            <td className="px-3.5 py-2.5 text-right font-mono text-rose-600 dark:text-rose-400 whitespace-nowrap font-medium">
                                                {formatCurrency(asset.ending_accumulated_depreciation)}
                                            </td>

                                            {/* Current Period Expense */}
                                            <td className="px-3.5 py-2.5 text-right font-mono text-amber-600 dark:text-amber-400 whitespace-nowrap font-medium">
                                                {formatCurrency(asset.current_period_depreciation)}
                                            </td>

                                            {/* Net Book Value */}
                                            <td className="px-3.5 py-2.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                                                {formatCurrency(asset.net_book_value)}
                                            </td>

                                            {/* % Depreciated with Progress Bar */}
                                            <td className="px-3.5 py-2.5 text-right font-mono whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <span>{formatPercent(asset.depreciated_percent)}</span>
                                                    <div className="h-1.5 w-10 rounded-full bg-muted overflow-hidden">
                                                        <div
                                                            className={`h-full ${
                                                                asset.depreciated_percent >= 100
                                                                    ? "bg-blue-500"
                                                                    : asset.depreciated_percent >= 75
                                                                    ? "bg-amber-500"
                                                                    : "bg-emerald-500"
                                                            }`}
                                                            style={{ width: `${Math.min(100, asset.depreciated_percent)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Status Badge */}
                                            <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                                                {getStatusBadge(asset.status)}
                                            </td>

                                            {/* Audit Button */}
                                            <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSelectAssetForSchedule(asset);
                                                    }}
                                                    className="h-7 px-2 text-[11px] gap-1 hover:bg-primary/10 hover:text-primary"
                                                >
                                                    <Eye className="h-3 w-3" />
                                                    Schedule
                                                </Button>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </AnimatePresence>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination and Rows-per-page Selector */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground px-1">
                <div className="flex items-center gap-2">
                    <span>Showing</span>
                    <span className="font-semibold font-mono text-foreground">
                        {assets.length === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + pageSize, assets.length)}
                    </span>
                    <span>of</span>
                    <span className="font-semibold font-mono text-foreground">{assets.length}</span>
                    <span>assets</span>
                </div>

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
            </div>
        </div>
    );
}
