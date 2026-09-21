"use client";

import { useState, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Calculator,
    Download,
    Calendar,
    Building2,
    ChevronLeft,
    ChevronRight
} from "lucide-react";
import { AssetDepreciationRecord } from "../types";
import {
    generateAssetAmortizationSchedule,
    formatCurrency,
    formatPercent,
    formatDateString
} from "../utils/depreciationCalculations";

interface AssetAmortizationModalProps {
    asset: AssetDepreciationRecord | null;
    asOfDate: string;
    isOpen: boolean;
    onClose: () => void;
}

export default function AssetAmortizationModal({
    asset,
    asOfDate,
    isOpen,
    onClose
}: AssetAmortizationModalProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const detail = useMemo(() => {
        if (!asset) return null;
        return generateAssetAmortizationSchedule(asset, asOfDate);
    }, [asset, asOfDate]);

    // Reset page whenever asset changes or modal opens
    const [prevKey, setPrevKey] = useState("");
    const currentKey = `${isOpen}-${asset?.id}`;
    if (currentKey !== prevKey) {
        setPrevKey(currentKey);
        if (isOpen && currentPage !== 1) {
            setCurrentPage(1);
        }
    }

    if (!asset || !detail) return null;

    const totalPages = Math.max(1, Math.ceil(detail.schedule.length / pageSize));
    const startIndex = (currentPage - 1) * pageSize;
    const paginatedSchedule = detail.schedule.slice(startIndex, startIndex + pageSize);

    const handleExportCsv = () => {
        const headers = [
            "Period",
            "Period Start",
            "Period End",
            "Opening NBV",
            "Depreciation Expense",
            "Ending Accumulated Depreciation",
            "Ending NBV",
            "% Depreciated"
        ];

        const rows = detail.schedule.map((r) => [
            `"${r.period_label}"`,
            r.period_start_date,
            r.period_end_date,
            r.opening_nbv.toFixed(2),
            r.depreciation_expense.toFixed(2),
            r.ending_accumulated_depreciation.toFixed(2),
            r.ending_nbv.toFixed(2),
            `${r.percent_depreciated.toFixed(1)}%`
        ]);

        const bom = "\uFEFF";
        const csvContent = bom + [headers.join(","), ...rows.map((e) => e.join(","))].join("\r\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute(
            "download",
            `Amortization_${asset.item_name.replace(/[^a-zA-Z0-9_-]/g, "_")}_${asOfDate}.csv`
        );
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-6xl sm:max-w-6xl lg:max-w-7xl xl:max-w-8xl w-[95vw] max-h-[92vh] overflow-y-auto p-6">
                <DialogHeader className="space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <div className="rounded-lg bg-primary/10 p-2 text-primary">
                                <Calculator className="h-5 w-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-bold tracking-tight">
                                    Asset Depreciation Amortization Schedule
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground">
                                    Audit trail and projected period-by-period carrying values for {asset.item_name}
                                </DialogDescription>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleExportCsv}
                                className="h-8 text-xs gap-1.5"
                            >
                                <Download className="h-3.5 w-3.5" />
                                Export CSV
                            </Button>
                        </div>
                    </div>
                </DialogHeader>

                <div className="space-y-4 pt-2">
                    {/* Header Details Card */}
                    <div className="rounded-xl border border-border/80 bg-muted/30 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <h3 className="text-base font-semibold text-foreground">{asset.item_name}</h3>
                                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span className="inline-flex items-center gap-1">
                                        <Building2 className="h-3.5 w-3.5" />
                                        {asset.department_name}
                                    </span>
                                    <span>•</span>
                                    <span className="inline-flex items-center gap-1">
                                        <Calendar className="h-3.5 w-3.5" />
                                        In-Service: {formatDateString(asset.depreciation_start_date)}
                                    </span>
                                    {asset.serial && (
                                        <>
                                            <span>•</span>
                                            <span>SN: {asset.serial}</span>
                                        </>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                                <Badge variant="outline" className="text-xs">
                                    {asset.asset_type}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                    {asset.depreciation_method}
                                </Badge>
                                <Badge
                                    className={`text-xs ${
                                        asset.asset_origin === "Existing"
                                            ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                            : "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30"
                                    }`}
                                >
                                    {asset.asset_origin} Origin
                                </Badge>
                            </div>
                        </div>

                        <Separator className="my-3" />

                        {/* Financial Parameters Grid */}
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 text-xs">
                            <div>
                                <span className="text-muted-foreground">Acquisition Cost</span>
                                <p className="font-semibold font-mono text-foreground text-sm">
                                    {formatCurrency(asset.acquisition_cost)}
                                </p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Salvage Value</span>
                                <p className="font-semibold font-mono text-foreground text-sm">
                                    {formatCurrency(asset.residual_value)}
                                </p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Depreciable Base</span>
                                <p className="font-semibold font-mono text-foreground text-sm">
                                    {formatCurrency(asset.depreciable_base)}
                                </p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Useful Life</span>
                                <p className="font-semibold font-mono text-foreground text-sm">
                                    {asset.depreciation_method === "Straight Line"
                                        ? `${asset.life_span_years} Years`
                                        : `${(asset.maximum_unit_produced_capacity || 0).toLocaleString()} ${asset.production_unit_name || "units"}`}
                                </p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Ending Accum. Depr.</span>
                                <p className="font-semibold font-mono text-rose-600 dark:text-rose-400 text-sm">
                                    {formatCurrency(asset.ending_accumulated_depreciation)}
                                </p>
                            </div>
                            <div>
                                <span className="text-muted-foreground">Current NBV</span>
                                <p className="font-semibold font-mono text-emerald-600 dark:text-emerald-400 text-sm">
                                    {formatCurrency(asset.net_book_value)}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Calculation Audit Trail Card */}
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 text-xs space-y-1.5">
                        <div className="flex items-center gap-1.5 font-semibold text-primary">
          
                            <span>Authoritative Calculation Formula</span>
                        </div>
                        <p className="font-mono text-foreground/90">{detail.audit_trail.formula_used}</p>
                        <p className="text-muted-foreground">
                            Rate / Allocation: <span className="font-mono font-medium text-foreground">{detail.audit_trail.rate_description}</span>
                        </p>
                        {detail.audit_trail.notes.length > 0 && (
                            <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                                {detail.audit_trail.notes.map((note, i) => (
                                    <li key={i}>{note}</li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Amortization Table */}
                    <div className="rounded-xl border border-border overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-muted/60 text-muted-foreground border-b border-border">
                                    <tr>
                                        <th className="px-3.5 py-2.5 font-medium">Period</th>
                                        <th className="px-3.5 py-2.5 font-medium text-right">Opening NBV</th>
                                        <th className="px-3.5 py-2.5 font-medium text-right">Depreciation Expense</th>
                                        <th className="px-3.5 py-2.5 font-medium text-right">Accumulated Depr.</th>
                                        <th className="px-3.5 py-2.5 font-medium text-right">Ending NBV</th>
                                        <th className="px-3.5 py-2.5 font-medium text-right">% Depreciated</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {paginatedSchedule.map((row) => (
                                        <tr
                                            key={row.period_index}
                                            className={`transition-colors ${
                                                row.is_cutoff_period
                                                    ? "bg-primary/10 font-medium"
                                                    : "hover:bg-muted/30"
                                            }`}
                                        >
                                            <td className="px-3.5 py-2.5 flex items-center gap-2">
                                                <span>{row.period_label}</span>
                                                {row.is_cutoff_period && (
                                                    <Badge variant="default" className="text-[10px] h-4 px-1 leading-none">
                                                        Cutoff
                                                    </Badge>
                                                )}
                                            </td>
                                            <td className="px-3.5 py-2.5 text-right font-mono">
                                                {formatCurrency(row.opening_nbv)}
                                            </td>
                                            <td className="px-3.5 py-2.5 text-right font-mono text-rose-600 dark:text-rose-400">
                                                {formatCurrency(row.depreciation_expense)}
                                            </td>
                                            <td className="px-3.5 py-2.5 text-right font-mono">
                                                {formatCurrency(row.ending_accumulated_depreciation)}
                                            </td>
                                            <td className="px-3.5 py-2.5 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                                                {formatCurrency(row.ending_nbv)}
                                            </td>
                                            <td className="px-3.5 py-2.5 text-right font-mono">
                                                <div className="flex items-center justify-end gap-2">
                                                    <span>{formatPercent(row.percent_depreciated)}</span>
                                                    <div className="h-1.5 w-12 rounded-full bg-muted overflow-hidden">
                                                        <div
                                                            className="h-full bg-primary transition-all"
                                                            style={{ width: `${Math.min(100, row.percent_depreciated)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Pagination and Rows-per-page Selector */}
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground pt-1 px-1">
                        <div className="flex items-center gap-2">
                            <span>Showing</span>
                            <span className="font-semibold font-mono text-foreground">
                                {detail.schedule.length === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + pageSize, detail.schedule.length)}
                            </span>
                            <span>of</span>
                            <span className="font-semibold font-mono text-foreground">{detail.schedule.length}</span>
                            <span>periods</span>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5">
                                <span>Periods per page:</span>
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
                                    disabled={currentPage <= 1}
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
                                    disabled={currentPage >= totalPages}
                                    className="h-7 w-7 p-0"
                                >
                                    <ChevronRight className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
