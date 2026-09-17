"use client";

import React, { useState, useMemo } from "react";
import { FPYDetailBreakdown } from "../types/fpy.types";
import {
    X,
    ClipboardCheck,
    GitBranch,
    RotateCcw,
    Layers,
    Search,
    ChevronLeft,
    ChevronRight,
    Award,
    CheckCircle2,
    AlertCircle,
    Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface FPYDetailModalProps {
    data: FPYDetailBreakdown | null;
    isLoading: boolean;
    onClose: () => void;
}

const MODAL_PAGE_SIZE = 10;

export function FPYDetailModal({
    data,
    isLoading,
    onClose
}: FPYDetailModalProps) {
    const [activeTab, setActiveTab] = useState<"inspections" | "routes" | "yields" | "reworks">("inspections");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [currentPage, setCurrentPage] = useState<number>(1);

    // Filter Inspection Logs
    const filteredInspections = useMemo(() => {
        if (!data?.inspectionLogs) return [];
        if (!searchQuery.trim()) return data.inspectionLogs;
        const q = searchQuery.toLowerCase().trim();
        return data.inspectionLogs.filter(log =>
            (log.inspector_name && log.inspector_name.toLowerCase().includes(q)) ||
            (log.rejection_reason_name && log.rejection_reason_name.toLowerCase().includes(q)) ||
            (log.status && log.status.toLowerCase().includes(q)) ||
            (log.remarks && log.remarks.toLowerCase().includes(q))
        );
    }, [data?.inspectionLogs, searchQuery]);

    // Filter Route Steps
    const filteredRoutes = useMemo(() => {
        if (!data?.routeSteps) return [];
        if (!searchQuery.trim()) return data.routeSteps;
        const q = searchQuery.toLowerCase().trim();
        return data.routeSteps.filter(r =>
            r.work_center_name.toLowerCase().includes(q) ||
            r.operation_name.toLowerCase().includes(q) ||
            r.status.toLowerCase().includes(q)
        );
    }, [data?.routeSteps, searchQuery]);

    // Filter Yield Ledgers
    const filteredYields = useMemo(() => {
        if (!data?.yieldLedgers) return [];
        if (!searchQuery.trim()) return data.yieldLedgers;
        const q = searchQuery.toLowerCase().trim();
        return data.yieldLedgers.filter(y =>
            y.shift_name.toLowerCase().includes(q) ||
            (y.lot_number && y.lot_number.toLowerCase().includes(q)) ||
            y.qa_status.toLowerCase().includes(q)
        );
    }, [data?.yieldLedgers, searchQuery]);

    // Paginated datasets
    const paginatedInspections = useMemo(() => {
        const start = (currentPage - 1) * MODAL_PAGE_SIZE;
        return filteredInspections.slice(start, start + MODAL_PAGE_SIZE);
    }, [filteredInspections, currentPage]);

    const paginatedRoutes = useMemo(() => {
        const start = (currentPage - 1) * MODAL_PAGE_SIZE;
        return filteredRoutes.slice(start, start + MODAL_PAGE_SIZE);
    }, [filteredRoutes, currentPage]);

    const paginatedYields = useMemo(() => {
        const start = (currentPage - 1) * MODAL_PAGE_SIZE;
        return filteredYields.slice(start, start + MODAL_PAGE_SIZE);
    }, [filteredYields, currentPage]);

    const jo = data?.jobOrder;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div
                className="relative flex flex-col w-full max-w-5xl max-h-[90vh] rounded-2xl border bg-card shadow-2xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b px-6 py-4 bg-muted/30">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            <ClipboardCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-lg font-bold text-foreground">
                                    {jo?.job_order_no || "Job Order Quality Inspection"}
                                </h2>
                                {jo && (
                                    <Badge
                                        className={`text-xs ${jo.fpy_percentage >= 95 ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" : jo.fpy_percentage >= 85 ? "bg-amber-500/10 text-amber-600 border-amber-500/30" : "bg-destructive/10 text-destructive border-destructive/30"}`}
                                    >
                                        FPY: {jo.fpy_percentage.toFixed(1)}%
                                    </Badge>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                                {jo ? `${jo.product_name} (${jo.product_code}) • ${jo.branch_name}` : "Loading Job Order QA breakdown..."}
                            </p>
                        </div>
                    </div>

                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="h-8 w-8 p-0 rounded-full text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Main Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {isLoading ? (
                        <div className="py-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                            <p className="text-xs font-medium">Fetching inspection audit logs and station yield records...</p>
                        </div>
                    ) : !data ? (
                        <div className="py-16 text-center text-muted-foreground">
                            <AlertCircle className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                            <p className="text-sm font-medium">No inspection details available for this Job Order.</p>
                        </div>
                    ) : (
                        <>
                            {/* Summary Metadata Strip */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3.5 rounded-xl border bg-muted/20 text-xs">
                                <div>
                                    <span className="text-muted-foreground block text-[11px]">Target vs Produced</span>
                                    <span className="font-bold text-foreground">
                                        {jo?.target_quantity.toLocaleString()} / {jo?.actual_quantity_produced.toLocaleString()} units
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[11px]">Quality Rating</span>
                                    <span className={`font-bold ${jo?.quality_tier === "Excellent" ? "text-emerald-600" : jo?.quality_tier === "Acceptable" ? "text-amber-600" : "text-destructive"}`}>
                                        {jo?.quality_tier}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[11px]">Production Started</span>
                                    <span className="font-medium text-foreground">
                                        {jo?.production_started_at ? new Date(jo.production_started_at).toLocaleDateString() : "—"}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[11px]">QA Completed</span>
                                    <span className="font-medium text-foreground">
                                        {jo?.closed_at ? new Date(jo.closed_at).toLocaleDateString() : jo?.production_completed_at ? new Date(jo.production_completed_at).toLocaleDateString() : "In Progress"}
                                    </span>
                                </div>
                            </div>

                            {/* Tab Switcher & Search */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b pb-3">
                                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                                    <Button
                                        variant={activeTab === "inspections" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => { setActiveTab("inspections"); setCurrentPage(1); }}
                                        className="h-8 text-xs gap-1.5"
                                    >
                                        <ClipboardCheck className="h-3.5 w-3.5" />
                                        <span>Inspection Logs ({data.inspectionLogs.length})</span>
                                    </Button>

                                    <Button
                                        variant={activeTab === "routes" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => { setActiveTab("routes"); setCurrentPage(1); }}
                                        className="h-8 text-xs gap-1.5"
                                    >
                                        <GitBranch className="h-3.5 w-3.5" />
                                        <span>Route Stations ({data.routeSteps.length})</span>
                                    </Button>

                                    <Button
                                        variant={activeTab === "yields" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => { setActiveTab("yields"); setCurrentPage(1); }}
                                        className="h-8 text-xs gap-1.5"
                                    >
                                        <Layers className="h-3.5 w-3.5" />
                                        <span>Shift Yields ({data.yieldLedgers.length})</span>
                                    </Button>

                                    <Button
                                        variant={activeTab === "reworks" ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => { setActiveTab("reworks"); setCurrentPage(1); }}
                                        className="h-8 text-xs gap-1.5"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        <span>Rework Orders ({data.reworkOrders.length})</span>
                                    </Button>
                                </div>

                                {activeTab !== "reworks" && (
                                    <div className="relative w-full sm:w-64">
                                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                        <Input
                                            type="text"
                                            placeholder="Search items in tab..."
                                            value={searchQuery}
                                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                                            className="h-8 pl-8 pr-2 text-xs"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* TAB 1: Inspection Logs */}
                            {activeTab === "inspections" && (
                                <div className="space-y-3">
                                    <div className="rounded-xl border overflow-hidden">
                                        <table className="w-full text-left border-collapse text-xs">
                                            <thead>
                                                <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                                    <th className="py-2.5 px-3">Date / Time</th>
                                                    <th className="py-2.5 px-3">Inspector</th>
                                                    <th className="py-2.5 px-3 text-right">Inspected</th>
                                                    <th className="py-2.5 px-3 text-right">Passed</th>
                                                    <th className="py-2.5 px-3 text-right">Rejected</th>
                                                    <th className="py-2.5 px-3">Rejection Reason</th>
                                                    <th className="py-2.5 px-3 text-center">Status</th>
                                                    <th className="py-2.5 px-3">Remarks</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/60">
                                                {paginatedInspections.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={8} className="py-8 text-center text-muted-foreground">
                                                            No inspection logs found.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    paginatedInspections.map((log) => (
                                                        <tr key={log.id} className="hover:bg-muted/20">
                                                            <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">
                                                                {log.inspected_at ? new Date(log.inspected_at).toLocaleString() : "—"}
                                                            </td>
                                                            <td className="py-2.5 px-3 font-medium text-foreground">
                                                                {log.inspector_name || "QA Inspector"}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right font-medium">
                                                                {log.inspected_quantity.toLocaleString()}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                                {log.passed_quantity.toLocaleString()}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right font-bold text-destructive">
                                                                {log.rejected_quantity > 0 ? log.rejected_quantity.toLocaleString() : "0"}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-muted-foreground">
                                                                {log.rejection_reason_name ? (
                                                                    <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                                                                        {log.rejection_reason_name}
                                                                    </Badge>
                                                                ) : (
                                                                    <span className="text-muted-foreground/40">—</span>
                                                                )}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-center">
                                                                <Badge
                                                                    variant={log.status === "PASSED" ? "default" : log.status === "REWORK_TRIGGERED" ? "destructive" : "secondary"}
                                                                    className="text-[10px]"
                                                                >
                                                                    {log.status}
                                                                </Badge>
                                                            </td>
                                                            <td className="py-2.5 px-3 text-muted-foreground max-w-xs truncate" title={log.remarks || ""}>
                                                                {log.remarks || "—"}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* TAB 2: Route Steps & In-line QA */}
                            {activeTab === "routes" && (
                                <div className="space-y-4">
                                    <div className="rounded-xl border overflow-hidden">
                                        <table className="w-full text-left border-collapse text-xs">
                                            <thead>
                                                <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                                    <th className="py-2.5 px-3">Step</th>
                                                    <th className="py-2.5 px-3">Station / Work Center</th>
                                                    <th className="py-2.5 px-3">Operation</th>
                                                    <th className="py-2.5 px-3 text-right">Planned (Hrs)</th>
                                                    <th className="py-2.5 px-3 text-right">Actual (Hrs)</th>
                                                    <th className="py-2.5 px-3 text-center">QA Required</th>
                                                    <th className="py-2.5 px-3 text-center">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/60">
                                                {paginatedRoutes.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={7} className="py-8 text-center text-muted-foreground">
                                                            No routing steps found.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    paginatedRoutes.map((r) => (
                                                        <tr key={r.jo_route_id} className="hover:bg-muted/20">
                                                            <td className="py-2.5 px-3 font-bold text-foreground">
                                                                #{r.sequence_order}
                                                            </td>
                                                            <td className="py-2.5 px-3 font-medium text-foreground">
                                                                {r.work_center_name}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-muted-foreground">
                                                                {r.operation_name}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right text-muted-foreground">
                                                                {r.planned_run_hours.toFixed(1)}h
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right font-medium text-foreground">
                                                                {r.actual_run_hours.toFixed(1)}h
                                                            </td>
                                                            <td className="py-2.5 px-3 text-center">
                                                                {r.requires_qa ? (
                                                                    <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-500/30">
                                                                        Required
                                                                    </Badge>
                                                                ) : (
                                                                    <span className="text-muted-foreground/40">—</span>
                                                                )}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-center">
                                                                <Badge variant="secondary" className="text-[10px]">
                                                                    {r.status}
                                                                </Badge>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* QA Parameter Test Checklist */}
                                    {data.qaRecords.length > 0 && (
                                        <div className="space-y-2">
                                            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                <ClipboardCheck className="h-4 w-4 text-primary" />
                                                <span>Station QA Parameter Checks ({data.qaRecords.length})</span>
                                            </h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                {data.qaRecords.map((rec) => (
                                                    <div key={rec.qa_record_id} className="flex items-center justify-between p-2.5 rounded-lg border bg-muted/20 text-xs">
                                                        <div>
                                                            <span className="font-semibold text-foreground block">{rec.parameter_name}</span>
                                                            <span className="text-[11px] text-muted-foreground">
                                                                Result: {rec.value_numeric !== null ? rec.value_numeric : rec.value_text || (rec.value_boolean ? "Passed" : "Failed")}
                                                            </span>
                                                        </div>
                                                        <Badge
                                                            variant={rec.is_passed ? "default" : "destructive"}
                                                            className="text-[10px]"
                                                        >
                                                            {rec.is_passed ? "PASSED" : "FAILED"}
                                                        </Badge>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 3: Shift Yields */}
                            {activeTab === "yields" && (
                                <div className="space-y-3">
                                    <div className="rounded-xl border overflow-hidden">
                                        <table className="w-full text-left border-collapse text-xs">
                                            <thead>
                                                <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                                    <th className="py-2.5 px-3">Date / Shift</th>
                                                    <th className="py-2.5 px-3">Lot Number</th>
                                                    <th className="py-2.5 px-3 text-right">Yield Qty</th>
                                                    <th className="py-2.5 px-3 text-right">Scrap Qty</th>
                                                    <th className="py-2.5 px-3 text-right">Rejected Qty</th>
                                                    <th className="py-2.5 px-3 text-center">QA Status</th>
                                                    <th className="py-2.5 px-3">Remarks</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border/60">
                                                {paginatedYields.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={7} className="py-8 text-center text-muted-foreground">
                                                            No shift yield ledger entries recorded yet.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    paginatedYields.map((y) => (
                                                        <tr key={y.ledger_id} className="hover:bg-muted/20">
                                                            <td className="py-2.5 px-3">
                                                                <div className="font-medium text-foreground">{y.shift_name}</div>
                                                                <div className="text-[10px] text-muted-foreground">{y.production_date || "—"}</div>
                                                            </td>
                                                            <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                                                                {y.lot_number || "—"}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                                {y.yield_quantity.toLocaleString()}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right font-medium text-destructive">
                                                                {y.scrap_quantity > 0 ? y.scrap_quantity.toLocaleString() : "0"}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right font-medium text-amber-600 dark:text-amber-400">
                                                                {y.rejected_quantity > 0 ? y.rejected_quantity.toLocaleString() : "0"}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-center">
                                                                <Badge variant={y.qa_status === "Passed" ? "default" : "destructive"} className="text-[10px]">
                                                                    {y.qa_status}
                                                                </Badge>
                                                            </td>
                                                            <td className="py-2.5 px-3 text-muted-foreground max-w-xs truncate" title={y.remarks || ""}>
                                                                {y.remarks || "—"}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* TAB 4: Linked Spawned Rework Job Orders */}
                            {activeTab === "reworks" && (
                                <div className="space-y-3">
                                    {data.reworkOrders.length === 0 ? (
                                        <div className="py-12 text-center text-muted-foreground rounded-xl border bg-muted/10">
                                            <RotateCcw className="h-7 w-7 mx-auto mb-2 opacity-30 text-emerald-600" />
                                            <p className="text-sm font-semibold text-foreground">Zero Rework Orders Spawned</p>
                                            <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                                                This production run achieved clean first-pass execution without triggering secondary rework orders.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="rounded-xl border overflow-hidden">
                                            <table className="w-full text-left border-collapse text-xs">
                                                <thead>
                                                    <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                                        <th className="py-2.5 px-3">Rework JO #</th>
                                                        <th className="py-2.5 px-3 text-right">Target Qty to Rework</th>
                                                        <th className="py-2.5 px-3 text-right">Actual Produced</th>
                                                        <th className="py-2.5 px-3 text-center">Status</th>
                                                        <th className="py-2.5 px-3">Created Date</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border/60">
                                                    {data.reworkOrders.map((rwk) => (
                                                        <tr key={rwk.job_order_id} className="hover:bg-muted/20">
                                                            <td className="py-2.5 px-3 font-bold text-amber-600 dark:text-amber-400">
                                                                {rwk.job_order_no}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right font-medium">
                                                                {rwk.target_quantity.toLocaleString()}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-right font-medium text-foreground">
                                                                {rwk.actual_quantity_produced.toLocaleString()}
                                                            </td>
                                                            <td className="py-2.5 px-3 text-center">
                                                                <Badge variant="outline" className="text-[10px]">
                                                                    {rwk.status}
                                                                </Badge>
                                                            </td>
                                                            <td className="py-2.5 px-3 text-muted-foreground">
                                                                {rwk.created_at ? new Date(rwk.created_at).toLocaleDateString() : "—"}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-between border-t px-6 py-3 bg-muted/20 text-xs">
                    <span className="text-muted-foreground">
                        Detailed QA inspection & yield timeline audit record.
                    </span>
                    <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
