"use client";

import React, { useState, useMemo } from "react";
import {
    Search,
    GitCompare,
    TrendingDown,
    TrendingUp,
    Scale,
    CheckCircle2,
    Clock,
    AlertCircle,
    Building2,
    Calendar,
    ChevronRight,
    RefreshCw,
    Printer
} from "lucide-react";
import { OffsettingSheetQueueItem, Branch } from "../types";
import { fetchOffsettingSheetById } from "../services/offsetting-api";
import OffsettingPrintModal from "./OffsettingPrintModal";

interface OffsettingSheetsListProps {
    sheets: OffsettingSheetQueueItem[];
    branches: Branch[];
    loading: boolean;
    onRefresh: () => void;
    onSelectSheet: (sheet: OffsettingSheetQueueItem) => void;
}

function formatCurrency(val: number): string {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2
    }).format(val || 0);
}

export default function OffsettingSheetsList({
    sheets,
    branches,
    loading,
    onRefresh,
    onSelectSheet
}: OffsettingSheetsListProps) {
    const [search, setSearch] = useState("");
    const [selectedBranchId, setSelectedBranchId] = useState<string>("ALL");
    const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
    const [printSheet, setPrintSheet] = useState<OffsettingSheetQueueItem | null>(null);
    const [printLoading, setPrintLoading] = useState(false);

    const handleOpenPrintModal = async (sheet: OffsettingSheetQueueItem, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        try {
            setPrintLoading(true);
            const full = await fetchOffsettingSheetById(sheet.physical_inventory_id);
            setPrintSheet(full || sheet);
        } catch {
            setPrintSheet(sheet);
        } finally {
            setPrintLoading(false);
        }
    };

    // Filter sheets
    const filteredSheets = useMemo(() => {
        return sheets.filter(s => {
            const bIdStr = typeof s.branch_id === "object" ? String(s.branch_id.id) : String(s.branch_id);
            if (selectedBranchId !== "ALL" && bIdStr !== selectedBranchId) return false;

            if (selectedStatus !== "ALL") {
                const isCommitted = s.offsetting_status === "COMMITTED" || s.status === "COMMITTED" || Boolean(s.isCommitted);
                if (selectedStatus === "COMMITTED" && !isCommitted) return false;
                if ((selectedStatus === "PENDING_REVIEW" || selectedStatus === "PENDING_OFFSETTING") && isCommitted) return false;
                if (selectedStatus !== "COMMITTED" && selectedStatus !== "PENDING_REVIEW" && selectedStatus !== "PENDING_OFFSETTING") {
                    if (s.offsetting_status !== selectedStatus && s.status !== selectedStatus) return false;
                }
            }

            if (search.trim()) {
                const q = search.toLowerCase();
                const matchPi = s.pi_no.toLowerCase().includes(q);
                const matchBranch = (s.branch_name || "").toLowerCase().includes(q);
                if (!matchPi && !matchBranch) return false;
            }
            return true;
        });
    }, [sheets, selectedBranchId, selectedStatus, search]);

    // KPI Metrics calculation across queue
    const kpis = useMemo(() => {
        let pendingCount = 0;
        let totalShortageValue = 0;
        let totalSurplusValue = 0;
        let totalOffsetQty = 0;

        for (const s of sheets) {
            if (s.offsetting_status === "PENDING_OFFSETTING" || s.offsetting_status === "PARTIALLY_OFFSET") {
                pendingCount++;
            }
            totalShortageValue += s.total_shortage_cost;
            totalSurplusValue += s.total_surplus_cost;
            totalOffsetQty += s.total_offset_qty;
        }

        return {
            pendingCount,
            totalShortageValue,
            totalSurplusValue,
            totalOffsetQty,
            netVarianceValue: totalSurplusValue - totalShortageValue
        };
    }, [sheets]);

    return (
        <div className="space-y-6">
            {/* Auditor Summary KPI Header Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 shadow-xs">
                    <div className="flex items-center justify-between text-amber-600 dark:text-amber-400">
                        <span className="text-xs font-bold uppercase tracking-wider">Queue Shortages Value</span>
                        <TrendingDown className="h-4 w-4" />
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-xl font-extrabold text-foreground">{formatCurrency(kpis.totalShortageValue)}</span>
                        <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">Deficits in queue</span>
                    </div>
                </div>

                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 shadow-xs">
                    <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                        <span className="text-xs font-bold uppercase tracking-wider">Queue Overages Value</span>
                        <TrendingUp className="h-4 w-4" />
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-xl font-extrabold text-foreground">{formatCurrency(kpis.totalSurplusValue)}</span>
                        <span className="text-[11px] text-emerald-700 dark:text-emerald-300 font-medium">Surpluses in queue</span>
                    </div>
                </div>

                <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4 shadow-xs">
                    <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
                        <span className="text-xs font-bold uppercase tracking-wider">Offset Allocated</span>
                        <Scale className="h-4 w-4" />
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-xl font-extrabold text-foreground">{kpis.totalOffsetQty} units</span>
                        <span className="text-[11px] text-muted-foreground font-medium">Balanced items</span>
                    </div>
                </div>

                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 shadow-xs">
                    <div className="flex items-center justify-between text-blue-600 dark:text-blue-400">
                        <span className="text-xs font-bold uppercase tracking-wider">Pending Reconciliation</span>
                        <Clock className="h-4 w-4" />
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-xl font-extrabold text-foreground">{kpis.pendingCount} sheets</span>
                        <span className="text-[11px] text-muted-foreground font-medium">Requires audit review</span>
                    </div>
                </div>
            </div>

            {/* Filter & Action Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border shadow-xs">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                    {/* Search input */}
                    <div className="relative flex-1 min-w-[200px] max-w-xs">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search by Sheet # or Branch..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full h-9 rounded-lg border border-input bg-background pl-9 pr-3 text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>

                    {/* Branch filter */}
                    <select
                        value={selectedBranchId}
                        onChange={e => setSelectedBranchId(e.target.value)}
                        className="h-9 rounded-lg border border-input bg-background px-3 text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                    >
                        <option value="ALL">All Branches</option>
                        {branches.map(b => (
                            <option key={b.id} value={String(b.id)}>
                                {b.branch_name || b.branchName || `Branch #${b.id}`}
                            </option>
                        ))}
                    </select>

                    {/* Status filter */}
                    <select
                        value={selectedStatus}
                        onChange={e => setSelectedStatus(e.target.value)}
                        className="h-9 rounded-lg border border-input bg-background px-3 text-xs focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
                    >
                        <option value="ALL">All Offsetting Statuses</option>
                        <option value="PENDING_REVIEW">Pending Review</option>
                        <option value="COMMITTED">Committed</option>
                    </select>
                </div>

                <button
                    type="button"
                    onClick={onRefresh}
                    className="h-9 inline-flex items-center justify-center gap-1.5 rounded-lg border border-input bg-background px-3 text-xs font-semibold text-foreground hover:bg-accent transition-colors"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    Refresh Queue
                </button>
            </div>

            {/* Offsetting Queue Table */}
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead className="bg-muted/60 border-b text-[11px] font-bold text-muted-foreground uppercase">
                            <tr>
                                <th className="px-4 py-3.5">Sheet Number</th>
                                <th className="px-4 py-3.5">Branch & Type</th>
                                <th className="px-4 py-3.5">Cutoff Date</th>
                                <th className="px-4 py-3.5 text-right">Shortage Value</th>
                                <th className="px-4 py-3.5 text-right">Surplus Value</th>
                                <th className="px-4 py-3.5 text-right">Net Financial Variance</th>
                                <th className="px-4 py-3.5 text-center">Offset Status</th>
                                <th className="px-4 py-3.5 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {filteredSheets.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                                        <AlertCircle className="mx-auto h-8 w-8 text-muted-foreground/50" />
                                        <p className="mt-2 text-xs font-medium">No count sheets found matching the offsetting filters.</p>
                                    </td>
                                </tr>
                            ) : (
                                filteredSheets.map(sheet => {
                                    const netCostVar = sheet.total_surplus_cost - sheet.total_shortage_cost;
                                    return (
                                        <tr key={sheet.physical_inventory_id} className="hover:bg-muted/30 transition-colors">
                                            <td className="px-4 py-3.5 font-bold text-foreground">
                                                <div className="flex items-center gap-2">
                                                    <GitCompare className="h-4 w-4 text-indigo-500 shrink-0" />
                                                    <span>{sheet.pi_no}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5">
                                                <div className="font-semibold text-foreground flex items-center gap-1">
                                                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                                    {sheet.branch_name}
                                                </div>
                                                <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                                                    Type: {sheet.stock_type}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 text-muted-foreground font-mono">
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="h-3.5 w-3.5" />
                                                    {sheet.cutoff_date ? new Date(sheet.cutoff_date).toLocaleDateString() : "N/A"}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3.5 text-right font-mono font-bold text-amber-600 dark:text-amber-400">
                                                -{formatCurrency(sheet.total_shortage_cost)}
                                            </td>
                                            <td className="px-4 py-3.5 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                                +{formatCurrency(sheet.total_surplus_cost)}
                                            </td>
                                            <td className="px-4 py-3.5 text-right font-mono font-bold">
                                                <span className={netCostVar > 0 ? "text-emerald-600" : netCostVar < 0 ? "text-amber-600" : "text-foreground"}>
                                                    {formatCurrency(netCostVar)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3.5 text-center">
                                                {sheet.offsetting_status === "COMMITTED" ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                                        <CheckCircle2 className="h-3 w-3" />
                                                        Committed
                                                    </span>
                                                ) : sheet.offsetting_status === "FULLY_RECONCILED" ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                                        <Scale className="h-3 w-3" />
                                                        Fully Reconciled
                                                    </span>
                                                ) : sheet.offsetting_status === "PARTIALLY_OFFSET" ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                                        <Clock className="h-3 w-3" />
                                                        Partially Offset
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                                        <AlertCircle className="h-3 w-3" />
                                                        Pending Offsetting
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3.5 text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={(e) => handleOpenPrintModal(sheet, e)}
                                                        disabled={printLoading}
                                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg transition-colors shadow-xs"
                                                        title="Print Physical Inventory Reconciliation Sheet"
                                                    >
                                                        <Printer className="h-3.5 w-3.5" />
                                                        Print
                                                    </button>

                                                    <button
                                                        type="button"
                                                        onClick={() => onSelectSheet(sheet)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 rounded-lg transition-colors shadow-xs"
                                                    >
                                                        Open Workspace
                                                        <ChevronRight className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {printSheet && (
                <OffsettingPrintModal
                    isOpen={Boolean(printSheet)}
                    onClose={() => setPrintSheet(null)}
                    sheet={printSheet}
                    activePairings={printSheet.offset_pairings || []}
                />
            )}
        </div>
    );
}
