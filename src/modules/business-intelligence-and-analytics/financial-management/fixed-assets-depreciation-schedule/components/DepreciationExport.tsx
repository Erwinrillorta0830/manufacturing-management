"use client";

import React, { useState } from "react";
import {
    Download,
    Printer,
    FileSpreadsheet,
    FileText 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
 
import { toast } from "sonner";
import { AssetDepreciationRecord, DepreciationScheduleSummary } from "../types";
import {
    formatCurrency,
    formatDateString,
    formatPercent
} from "../utils/depreciationCalculations";

interface DepreciationExportProps {
    assets: AssetDepreciationRecord[];
    summary: DepreciationScheduleSummary | null;
    asOfDate: string;
    periodPreset: string;
}

export default function DepreciationExport({
    assets,
    summary,
    asOfDate,
    periodPreset
}: DepreciationExportProps) {
    const [isExporting, setIsExporting] = useState(false);
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

    const handleExportCsv = () => {
        if (assets.length === 0) {
            toast.error("No assets available to export.");
            return;
        }

        try {
            setIsExporting(true);

            // Balance Sheet carrying values and depreciation schedule data for tax/audit review (No Asset ID)
            const headers = [
                "Item / Asset Description",
                "Department",
                "Custodian",
                "Serial Number",
                "Barcode",
                "Asset Classification",
                "Depreciation Method",
                "In-Service Date",
                "Acquisition Date",
                "System Origin",
                "Capitalized Historical Cost (Gross Asset)",
                "Estimated Salvage Value (Floor)",
                "Depreciable Base Amount",
                "Useful Life (Years)",
                "Beginning Accumulated Depreciation",
                "Current Period Depreciation Expense",
                "Ending Accumulated Depreciation (Contra-Asset)",
                "Net Book Value (Balance Sheet Carrying Amount)",
                "% Depreciated",
                "Lifecycle State"
            ];

            const rows = assets.map((a) => [
                `"${(a.item_name || "").replace(/"/g, '""')}"`,
                `"${(a.department_name || "").replace(/"/g, '""')}"`,
                `"${(a.employee_name || "").replace(/"/g, '""')}"`,
                `"${(a.serial || "").replace(/"/g, '""')}"`,
                `"${(a.barcode || "").replace(/"/g, '""')}"`,
                `"${a.asset_type}"`,
                `"${a.depreciation_method}"`,
                a.depreciation_start_date,
                a.date_acquired,
                a.asset_origin,
                a.acquisition_cost.toFixed(2),
                a.residual_value.toFixed(2),
                a.depreciable_base.toFixed(2),
                a.life_span_years,
                a.beginning_accumulated_depreciation.toFixed(2),
                a.current_period_depreciation.toFixed(2),
                a.ending_accumulated_depreciation.toFixed(2),
                a.net_book_value.toFixed(2),
                `${a.depreciated_percent.toFixed(1)}%`,
                `"${a.status}"`
            ]);

            // Summary row at the bottom for Balance Sheet verification
            if (summary) {
                rows.push([
                    '"--- BALANCE SHEET TOTALS ---"',
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    "",
                    summary.total_acquisition_cost.toFixed(2),
                    summary.total_salvage_value.toFixed(2),
                    summary.total_depreciable_base.toFixed(2),
                    "",
                    summary.total_beginning_accum_depreciation.toFixed(2),
                    summary.total_current_period_depreciation.toFixed(2),
                    summary.total_ending_accum_depreciation.toFixed(2),
                    summary.total_net_book_value.toFixed(2),
                    "",
                    ""
                ]);
            }

            const bom = "\uFEFF";
            const csvContent = bom + [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", `Fixed_Asset_Depreciation_Schedule_${asOfDate}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast.success(`Exported ${assets.length} assets to CSV for tax/audit review.`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Export failed";
            toast.error(msg);
        } finally {
            setIsExporting(false);
        }
    };

    const handleOpenPrintPreview = () => {
        setIsPrintModalOpen(true);
    };

    const handleExecutePrint = () => {
        window.print();
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs shadow-xs">
                        <Download className="h-3.5 w-3.5" />
                        <span>Export Schedule</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 text-xs">
                    <DropdownMenuItem onClick={handleExportCsv} disabled={isExporting} className="gap-2 cursor-pointer">
                        <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                        <span>Export to CSV (Excel)</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleOpenPrintPreview} className="gap-2 cursor-pointer">
                        <Printer className="h-4 w-4 text-blue-600" />
                        <span>Printable Audit Report</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Printable Report Modal & Print Layout */}
            <Dialog open={isPrintModalOpen} onOpenChange={setIsPrintModalOpen}>
                <DialogContent className="max-w-6xl w-[96vw] max-h-[92vh] overflow-y-auto p-6 printable-dialog">
                    <DialogHeader className="space-y-1 print:hidden">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                                    <FileText className="h-5 w-5" />
                                </div>
                                <div>
                                    <DialogTitle className="text-base font-bold">
                                        Fixed Asset Depreciation Schedule — Printable Audit View
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-muted-foreground">
                                        Balance Sheet carrying amount schedule and periodic tax depreciation deduction summary
                                    </DialogDescription>
                                </div>
                            </div>
                            <Button onClick={handleExecutePrint} size="sm" className="h-8 gap-1.5 text-xs">
                                <Printer className="h-3.5 w-3.5" />
                                Print Now
                            </Button>
                        </div>
                    </DialogHeader>

                    {/* Clean Print Canvas */}
                    <div className="space-y-6 pt-3 text-foreground print:p-0">
                        {/* Report Header */}
                        <div className="border-b border-border pb-4">
                            <div className="flex justify-between items-start">
                                <div>
                                    <span className="text-[11px] font-semibold uppercase tracking-widest text-primary">
                                        VOS Manufacturing ERP • Financial Management
                                    </span>
                                    <h2 className="text-xl font-bold tracking-tight text-foreground">
                                        FIXED ASSET DEPRECIATION SCHEDULE
                                    </h2>
                                    <p className="text-xs text-muted-foreground">
                                        Carrying Value & Tax Allowable Depreciation Schedule
                                    </p>
                                </div>
                                <div className="text-right text-xs text-muted-foreground">
                                    <p className="font-semibold text-foreground">Cutoff Date: {formatDateString(asOfDate)}</p>
                                    <p>Period: {periodPreset.replace("_", " ").toUpperCase()}</p>
                                    <p>Generated: {new Date().toLocaleDateString()}</p>
                                </div>
                            </div>
                        </div>

                        {/* Executive Balance Sheet Summary Box */}
                        {summary && (
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 rounded-xl border border-border/80 bg-muted/30 p-3.5 text-xs">
                                <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase">Historical Cost</span>
                                    <span className="font-mono font-bold text-sm text-foreground">
                                        {formatCurrency(summary.total_acquisition_cost)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase">Salvage Value</span>
                                    <span className="font-mono font-semibold text-sm text-foreground">
                                        {formatCurrency(summary.total_salvage_value)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase">Depreciable Base</span>
                                    <span className="font-mono font-semibold text-sm text-foreground">
                                        {formatCurrency(summary.total_depreciable_base)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase">Beginning Accum.</span>
                                    <span className="font-mono font-semibold text-sm text-muted-foreground">
                                        {formatCurrency(summary.total_beginning_accum_depreciation)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase">Period Expense (Tax)</span>
                                    <span className="font-mono font-bold text-sm text-amber-600 dark:text-amber-400">
                                        {formatCurrency(summary.total_current_period_depreciation)}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase">Net Book Value (NBV)</span>
                                    <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                                        {formatCurrency(summary.total_net_book_value)}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Schedule Table (Without Asset ID) */}
                        <div className="overflow-x-auto border border-border rounded-lg">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead className="bg-muted/70 text-muted-foreground border-b border-border text-[11px]">
                                    <tr>
                                        <th className="p-2 font-semibold">Asset Description</th>
                                        <th className="p-2 font-semibold">Department</th>
                                        <th className="p-2 font-semibold">Method</th>
                                        <th className="p-2 font-semibold">In-Service</th>
                                        <th className="p-2 font-semibold text-right">Cost</th>
                                        <th className="p-2 font-semibold text-right">Salvage</th>
                                        <th className="p-2 font-semibold text-right">Accum. Depr.</th>
                                        <th className="p-2 font-semibold text-right">Period Exp.</th>
                                        <th className="p-2 font-semibold text-right">Net Book Value</th>
                                        <th className="p-2 font-semibold text-right">% Depr.</th>
                                        <th className="p-2 font-semibold text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/60">
                                    {assets.map((asset) => (
                                        <tr key={asset.id} className="hover:bg-muted/20">
                                            <td className="p-2 font-medium text-foreground">
                                                <div>{asset.item_name}</div>
                                                {asset.serial && (
                                                    <div className="text-[10px] text-muted-foreground">SN: {asset.serial}</div>
                                                )}
                                            </td>
                                            <td className="p-2 text-muted-foreground">{asset.department_name}</td>
                                            <td className="p-2 text-muted-foreground">
                                                {asset.depreciation_method === "Units of Production" ? "UOP" : "SL"}
                                            </td>
                                            <td className="p-2 font-mono text-muted-foreground">
                                                {formatDateString(asset.depreciation_start_date)}
                                            </td>
                                            <td className="p-2 text-right font-mono font-medium">
                                                {formatCurrency(asset.acquisition_cost)}
                                            </td>
                                            <td className="p-2 text-right font-mono text-muted-foreground">
                                                {formatCurrency(asset.residual_value)}
                                            </td>
                                            <td className="p-2 text-right font-mono text-rose-600 dark:text-rose-400">
                                                {formatCurrency(asset.ending_accumulated_depreciation)}
                                            </td>
                                            <td className="p-2 text-right font-mono text-amber-600 dark:text-amber-400 font-medium">
                                                {formatCurrency(asset.current_period_depreciation)}
                                            </td>
                                            <td className="p-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                                {formatCurrency(asset.net_book_value)}
                                            </td>
                                            <td className="p-2 text-right font-mono">
                                                {formatPercent(asset.depreciated_percent)}
                                            </td>
                                            <td className="p-2 text-center">
                                                <span className="text-[10px] font-semibold">{asset.status}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Signatures / Audit Section */}
                        <div className="grid grid-cols-3 gap-6 pt-8 text-xs text-muted-foreground border-t border-border">
                            <div>
                                <p className="font-semibold text-foreground mb-6">Prepared by:</p>
                                <div className="border-b border-border w-3/4" />
                                <p className="mt-1 text-[11px]">Asset Accountant / Encoder</p>
                            </div>
                            <div>
                                <p className="font-semibold text-foreground mb-6">Reviewed by:</p>
                                <div className="border-b border-border w-3/4" />
                                <p className="mt-1 text-[11px]">Finance Manager / Controller</p>
                            </div>
                            <div>
                                <p className="font-semibold text-foreground mb-6">Approved by:</p>
                                <div className="border-b border-border w-3/4" />
                                <p className="mt-1 text-[11px]">Chief Financial Officer</p>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
