"use client";

import React, { useState } from "react";
import { ProductCostBreakdownDetail } from "../types/contribution-margin.types";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { X, Package, Users, Cpu, DollarSign, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ContributionMarginDetailModalProps {
    detail: ProductCostBreakdownDetail | null;
    isOpen: boolean;
    onClose: () => void;
    isLoading?: boolean;
}

export function ContributionMarginDetailModal({
    detail,
    isOpen,
    onClose,
    isLoading = false
}: ContributionMarginDetailModalProps) {
    const [activeTab, setActiveTab] = useState<"materials" | "labor" | "overheads">("materials");

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border bg-background shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="flex items-start justify-between border-b p-4 sm:p-5 bg-muted/30">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                                {detail?.product_code || "SKU Detail"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {detail?.category_name} • {detail?.brand_name}
                            </span>
                        </div>
                        <h2 className="mt-1 text-lg font-bold text-foreground">
                            {detail?.product_name || "Loading Cost Breakdown..."}
                        </h2>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onClose}
                        className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {/* Economics Quick Banner */}
                {detail && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border-b bg-card p-3 sm:px-5 text-xs">
                        <div>
                            <span className="text-muted-foreground block">Invoiced Qty:</span>
                            <span className="font-bold text-foreground">{formatNumber(detail.invoiced_quantity)} units</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground block">Avg Selling Price:</span>
                            <span className="font-bold text-foreground">{formatCurrency(detail.average_selling_price)}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground block">Unit Variable Cost:</span>
                            <span className="font-bold text-amber-600 dark:text-amber-400">{formatCurrency(detail.unit_variable_cost)}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground block">Unit CM / Ratio:</span>
                            <span className={`font-bold ${detail.contribution_margin_amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                                {formatCurrency(detail.average_selling_price - detail.unit_variable_cost)} ({detail.contribution_margin_ratio}%)
                            </span>
                        </div>
                    </div>
                )}

                {/* Tab Controls */}
                <div className="flex items-center gap-2 border-b px-4 pt-3 bg-muted/10">
                    <button
                        type="button"
                        onClick={() => setActiveTab("materials")}
                        className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                            activeTab === "materials"
                                ? "border-primary text-primary font-semibold"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <Package className="h-3.5 w-3.5" />
                        <span>Direct Materials ({detail?.materials.length || 0})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("labor")}
                        className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                            activeTab === "labor"
                                ? "border-primary text-primary font-semibold"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <Users className="h-3.5 w-3.5" />
                        <span>Direct Labor ({detail?.labor.length || 0})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab("overheads")}
                        className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                            activeTab === "overheads"
                                ? "border-primary text-primary font-semibold"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <Cpu className="h-3.5 w-3.5" />
                        <span>Variable Overhead ({detail?.overheads.length || 0})</span>
                    </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                    {isLoading ? (
                        <div className="py-12 text-center text-xs text-muted-foreground animate-pulse">
                            Loading itemized cost tracking details...
                        </div>
                    ) : !detail ? (
                        <div className="py-12 text-center text-xs text-muted-foreground">
                            No detail data available for this product.
                        </div>
                    ) : (
                        <>
                            {/* Materials Table */}
                            {activeTab === "materials" && (
                                <div className="rounded-lg border overflow-hidden">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                                <th className="p-2.5">Material Name</th>
                                                <th className="p-2.5">Code</th>
                                                <th className="p-2.5">Batch #</th>
                                                <th className="p-2.5 text-right">Qty Consumed</th>
                                                <th className="p-2.5 text-right">Unit Valuation</th>
                                                <th className="p-2.5 text-right">Total Cost (PHP)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {detail.materials.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} className="p-4 text-center text-muted-foreground">
                                                        No direct materials consumage records logged. Sourced via standard cost estimation.
                                                    </td>
                                                </tr>
                                            ) : (
                                                detail.materials.map((m, idx) => (
                                                    <tr key={idx} className="hover:bg-muted/10">
                                                        <td className="p-2.5 font-medium text-foreground">{m.product_name}</td>
                                                        <td className="p-2.5 text-muted-foreground">{m.product_code}</td>
                                                        <td className="p-2.5 font-mono text-[11px] text-muted-foreground">{m.batch_no || "-"}</td>
                                                        <td className="p-2.5 text-right font-medium">{formatNumber(m.quantity_consumed, "en-PH", 4)}</td>
                                                        <td className="p-2.5 text-right text-muted-foreground">{formatCurrency(m.unit_cost)}</td>
                                                        <td className="p-2.5 text-right font-bold text-foreground">{formatCurrency(m.total_cost)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Labor Table */}
                            {activeTab === "labor" && (
                                <div className="rounded-lg border overflow-hidden">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                                <th className="p-2.5">Operator Name</th>
                                                <th className="p-2.5 text-right">Logged Hours</th>
                                                <th className="p-2.5 text-right">Hourly Rate</th>
                                                <th className="p-2.5 text-right">Total Labor Cost (PHP)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {detail.labor.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                                                        No operator labor time records logged. Sourced via route standard labor estimation.
                                                    </td>
                                                </tr>
                                            ) : (
                                                detail.labor.map((l, idx) => (
                                                    <tr key={idx} className="hover:bg-muted/10">
                                                        <td className="p-2.5 font-medium text-foreground">{l.operator_name}</td>
                                                        <td className="p-2.5 text-right font-medium">{formatNumber(l.logged_hours, "en-PH", 2)} hrs</td>
                                                        <td className="p-2.5 text-right text-muted-foreground">{formatCurrency(l.hourly_rate)}/hr</td>
                                                        <td className="p-2.5 text-right font-bold text-foreground">{formatCurrency(l.labor_cost)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Variable Overhead Table */}
                            {activeTab === "overheads" && (
                                <div className="rounded-lg border overflow-hidden">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="border-b bg-muted/40 font-semibold text-muted-foreground">
                                                <th className="p-2.5">Work Center / Machine</th>
                                                <th className="p-2.5 text-right">Run Hours</th>
                                                <th className="p-2.5 text-right">Overhead Rate</th>
                                                <th className="p-2.5 text-right">Total Overhead (PHP)</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {detail.overheads.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                                                        No workstation run records found. Sourced via product overhead profile.
                                                    </td>
                                                </tr>
                                            ) : (
                                                detail.overheads.map((o, idx) => (
                                                    <tr key={idx} className="hover:bg-muted/10">
                                                        <td className="p-2.5 font-medium text-foreground">{o.work_center_name}</td>
                                                        <td className="p-2.5 text-right font-medium">{formatNumber(o.actual_run_hours, "en-PH", 2)} hrs</td>
                                                        <td className="p-2.5 text-right text-muted-foreground">{formatCurrency(o.overhead_cost_per_hour)}/hr</td>
                                                        <td className="p-2.5 text-right font-bold text-foreground">{formatCurrency(o.total_overhead_cost)}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end border-t p-3 bg-muted/20">
                    <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
