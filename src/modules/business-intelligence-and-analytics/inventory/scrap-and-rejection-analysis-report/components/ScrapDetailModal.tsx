"use client";

import React, { useState } from "react";
import { X, Layers, Clock, AlertTriangle, FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrapDetailBreakdown } from "../types/scrap-rejection.types";
import { formatPHP } from "../services/scrap-rejection.helpers";

interface ScrapDetailModalProps {
    data: ScrapDetailBreakdown | null;
    isLoading: boolean;
    onClose: () => void;
}

export function ScrapDetailModal({
    data,
    isLoading,
    onClose
}: ScrapDetailModalProps) {
    const [activeTab, setActiveTab] = useState<"materials" | "rework" | "qa">("materials");

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="relative flex max-h-[85vh] w-full max-w-4xl flex-col rounded-2xl border bg-card shadow-2xl overflow-hidden">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b px-5 py-3.5 bg-muted/30">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-foreground">
                                {data ? `Scrap & Rework Drilldown — ${data.job_order_no}` : "Loading Details..."}
                            </h2>
                            {data && (
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                    {data.status}
                                </span>
                            )}
                        </div>
                        {data && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {data.product_name} ({data.product_code}) • {data.branch_name}
                            </p>
                        )}
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {isLoading || !data ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        <span className="mt-3 text-xs text-muted-foreground">Loading drilldown records...</span>
                    </div>
                ) : (
                    <>
                        {/* KPI Mini-Bar */}
                        <div className="grid grid-cols-4 border-b bg-muted/10 divide-x divide-border text-center text-xs">
                            <div className="p-3">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground">Produced / Target</span>
                                <div className="mt-0.5 font-bold text-foreground">
                                    {data.actual_quantity_produced.toLocaleString()} / {data.target_quantity.toLocaleString()}
                                </div>
                            </div>
                            <div className="p-3">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground">Scrap Rate (%)</span>
                                <div className="mt-0.5 font-bold text-red-600 dark:text-red-400">
                                    {data.scrap_rate_percentage.toFixed(1)}% ({data.scrap_quantity.toLocaleString()} units)
                                </div>
                            </div>
                            <div className="p-3">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground">Total Material Loss</span>
                                <div className="mt-0.5 font-bold text-foreground">
                                    {formatPHP(data.total_material_loss_php)}
                                </div>
                            </div>
                            <div className="p-3">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground">Rework Incurred</span>
                                <div className="mt-0.5 font-bold text-blue-600 dark:text-blue-400">
                                    {data.total_rework_hours.toFixed(1)} hrs ({formatPHP(data.total_rework_labor_cost_php)})
                                </div>
                            </div>
                        </div>

                        {/* Navigation Tabs */}
                        <div className="flex border-b bg-muted/20 px-4 text-xs font-medium">
                            <button
                                type="button"
                                onClick={() => setActiveTab("materials")}
                                className={`flex items-center gap-1.5 border-b-2 py-2.5 px-3 transition-colors ${
                                    activeTab === "materials"
                                        ? "border-primary text-primary font-semibold"
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <Layers className="h-3.5 w-3.5" />
                                <span>BOM Material Loss ({data.material_losses.length})</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab("rework")}
                                className={`flex items-center gap-1.5 border-b-2 py-2.5 px-3 transition-colors ${
                                    activeTab === "rework"
                                        ? "border-primary text-primary font-semibold"
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <Clock className="h-3.5 w-3.5" />
                                <span>Rework Labor Operations ({data.rework_labor.length})</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab("qa")}
                                className={`flex items-center gap-1.5 border-b-2 py-2.5 px-3 transition-colors ${
                                    activeTab === "qa"
                                        ? "border-primary text-primary font-semibold"
                                        : "border-transparent text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <AlertTriangle className="h-3.5 w-3.5" />
                                <span>QA Inspection & Defect Logs ({data.inspection_logs.length})</span>
                            </button>
                        </div>

                        {/* Modal Tab Content */}
                        <div className="flex-1 overflow-y-auto p-4 text-xs">
                            {/* TAB 1: Material Losses */}
                            {activeTab === "materials" && (
                                <div>
                                    {data.material_losses.length === 0 ? (
                                        <div className="py-8 text-center text-muted-foreground">
                                            <Layers className="mx-auto h-6 w-6 opacity-30 mb-1" />
                                            No itemized BOM material loss records logged for this job order.
                                        </div>
                                    ) : (
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b bg-muted/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                                    <th className="py-2.5 px-3">Material / Component</th>
                                                    <th className="py-2.5 px-3 text-right">Allocated Qty</th>
                                                    <th className="py-2.5 px-3 text-right">Consumed Qty</th>
                                                    <th className="py-2.5 px-3 text-right">Scrap Qty</th>
                                                    <th className="py-2.5 px-3 text-right">Unit Cost</th>
                                                    <th className="py-2.5 px-3 text-right">Total Loss (PHP)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {data.material_losses.map((mat, i) => (
                                                    <tr key={i} className="hover:bg-muted/20">
                                                        <td className="py-2.5 px-3 font-medium text-foreground">
                                                            {mat.product_name}
                                                            <div className="text-[10px] text-muted-foreground">{mat.product_code}</div>
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right text-muted-foreground">
                                                            {mat.allocated_quantity.toLocaleString()}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right text-foreground">
                                                            {mat.actual_consumed_quantity.toLocaleString()}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right font-semibold text-red-600 dark:text-red-400">
                                                            {mat.scrap_quantity.toLocaleString()}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right text-muted-foreground">
                                                            {formatPHP(mat.unit_cost)}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right font-bold text-foreground">
                                                            {formatPHP(mat.total_material_loss_php)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {/* TAB 2: Rework Labor */}
                            {activeTab === "rework" && (
                                <div>
                                    {data.rework_labor.length === 0 ? (
                                        <div className="py-8 text-center text-muted-foreground">
                                            <Clock className="mx-auto h-6 w-6 opacity-30 mb-1" />
                                            No operator rework hours recorded for this job order.
                                        </div>
                                    ) : (
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b bg-muted/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                                    <th className="py-2.5 px-3">Operator</th>
                                                    <th className="py-2.5 px-3">Operation / Station</th>
                                                    <th className="py-2.5 px-3 text-right">Logged Hours</th>
                                                    <th className="py-2.5 px-3 text-right">Hourly Rate</th>
                                                    <th className="py-2.5 px-3 text-right">Labor Cost (PHP)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {data.rework_labor.map((op, i) => (
                                                    <tr key={i} className="hover:bg-muted/20">
                                                        <td className="py-2.5 px-3 font-medium text-foreground">
                                                            {op.operator_name}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-muted-foreground">
                                                            {op.operation_name || "Rework"} • {op.work_center_name || "Workstation"}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right font-semibold text-blue-600 dark:text-blue-400">
                                                            {op.logged_hours.toFixed(2)} hrs
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right text-muted-foreground">
                                                            {formatPHP(op.hourly_rate)}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right font-bold text-foreground">
                                                            {formatPHP(op.labor_cost_php)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {/* TAB 3: QA Inspection Logs */}
                            {activeTab === "qa" && (
                                <div>
                                    {data.inspection_logs.length === 0 ? (
                                        <div className="py-8 text-center text-muted-foreground">
                                            <AlertTriangle className="mx-auto h-6 w-6 opacity-30 mb-1" />
                                            No QA defect inspection records logged for this job order.
                                        </div>
                                    ) : (
                                        <table className="w-full text-left border-collapse">
                                            <thead>
                                                <tr className="border-b bg-muted/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                                    <th className="py-2.5 px-3">Date / Inspector</th>
                                                    <th className="py-2.5 px-3 text-right">Inspected</th>
                                                    <th className="py-2.5 px-3 text-right">Passed</th>
                                                    <th className="py-2.5 px-3 text-right">Rejected</th>
                                                    <th className="py-2.5 px-3">Defect Reason & Category</th>
                                                    <th className="py-2.5 px-3">Status / Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {data.inspection_logs.map((log) => (
                                                    <tr key={log.id} className="hover:bg-muted/20">
                                                        <td className="py-2.5 px-3">
                                                            <div className="font-medium text-foreground">
                                                                {log.inspected_at ? new Date(log.inspected_at).toLocaleDateString() : "—"}
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground">
                                                                {log.inspector_name || `User #${log.inspected_by ?? "—"}`}
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right text-muted-foreground">
                                                            {log.inspected_quantity.toLocaleString()}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right font-medium text-emerald-600 dark:text-emerald-400">
                                                            {log.passed_quantity.toLocaleString()}
                                                        </td>
                                                        <td className="py-2.5 px-3 text-right font-semibold text-red-600 dark:text-red-400">
                                                            {log.rejected_quantity.toLocaleString()}
                                                        </td>
                                                        <td className="py-2.5 px-3">
                                                            <div className="font-medium text-foreground">
                                                                {log.rejection_reason_name || "Unspecified Reason"}
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground">
                                                                {log.rejection_category || "General"}
                                                            </div>
                                                        </td>
                                                        <td className="py-2.5 px-3">
                                                            <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground">
                                                                {log.status}
                                                            </span>
                                                            {log.rework_job_order_no && (
                                                                <div className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">
                                                                    Triggered: {log.rework_job_order_no}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="flex items-center justify-end border-t p-3 bg-muted/20">
                            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
                                Close Drilldown
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
