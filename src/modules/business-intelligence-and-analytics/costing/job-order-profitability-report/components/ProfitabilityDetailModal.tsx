"use client";

import React, { useState, useMemo } from "react";
import { JobOrderCostBreakdown } from "../types";
import { X, Layers, Users, Cpu, FileText, CheckCircle2, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ProfitabilityDetailModalProps {
    data: JobOrderCostBreakdown | null;
    isLoading: boolean;
    onClose: () => void;
}

const MODAL_PAGE_SIZE = 15;

export function ProfitabilityDetailModal({
    data,
    isLoading,
    onClose
}: ProfitabilityDetailModalProps) {
    const [activeTab, setActiveTab] = useState<"materials" | "labor" | "overhead">("materials");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [currentPage, setCurrentPage] = useState<number>(1);

    const fmt = (val: number | null | undefined): string => {
        return "₱" + (val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // Filter Direct Materials
    const materials = data?.materials;
    const filteredMaterials = useMemo(() => {
        if (!materials) return [];
        if (!searchQuery.trim()) return materials;
        const q = searchQuery.toLowerCase().trim();
        return materials.filter(m =>
            m.product_name.toLowerCase().includes(q) ||
            m.product_code.toLowerCase().includes(q) ||
            (m.batch_no && m.batch_no.toLowerCase().includes(q))
        );
    }, [materials, searchQuery]);

    // Filter Direct Labor
    const labor = data?.labor;
    const filteredLabor = useMemo(() => {
        if (!labor) return [];
        if (!searchQuery.trim()) return labor;
        const q = searchQuery.toLowerCase().trim();
        return labor.filter(l =>
            (l.operator_name && l.operator_name.toLowerCase().includes(q)) ||
            String(l.operator_id).includes(q) ||
            String(l.jo_route_id).includes(q)
        );
    }, [labor, searchQuery]);

    // Filter Overheads
    const overheads = data?.overheads;
    const filteredOverheads = useMemo(() => {
        if (!overheads) return [];
        if (!searchQuery.trim()) return overheads;
        const q = searchQuery.toLowerCase().trim();
        return overheads.filter(o =>
            o.work_center_name.toLowerCase().includes(q) ||
            o.status.toLowerCase().includes(q) ||
            String(o.jo_route_id).includes(q)
        );
    }, [overheads, searchQuery]);

    // Active Tab Item Counts and Pagination
    const currentTabTotalCount = activeTab === "materials"
        ? filteredMaterials.length
        : activeTab === "labor"
        ? filteredLabor.length
        : filteredOverheads.length;

    const totalPages = Math.ceil(currentTabTotalCount / MODAL_PAGE_SIZE) || 1;

    const paginatedMaterials = useMemo(() => {
        const start = (currentPage - 1) * MODAL_PAGE_SIZE;
        return filteredMaterials.slice(start, start + MODAL_PAGE_SIZE);
    }, [filteredMaterials, currentPage]);

    const paginatedLabor = useMemo(() => {
        const start = (currentPage - 1) * MODAL_PAGE_SIZE;
        return filteredLabor.slice(start, start + MODAL_PAGE_SIZE);
    }, [filteredLabor, currentPage]);

    const paginatedOverheads = useMemo(() => {
        const start = (currentPage - 1) * MODAL_PAGE_SIZE;
        return filteredOverheads.slice(start, start + MODAL_PAGE_SIZE);
    }, [filteredOverheads, currentPage]);

    const handleTabChange = (tab: "materials" | "labor" | "overhead") => {
        setActiveTab(tab);
        setCurrentPage(1);
    };

    if (!data && !isLoading) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
            {/* Fixed-size Modal Container */}
            <div className="relative flex h-[680px] max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border bg-card shadow-2xl overflow-hidden">
                {/* Modal Header */}
                <div className="flex items-center justify-between border-b px-5 py-3.5 bg-muted/20 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                            <FileText className="h-4 w-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                                <span>{data?.job_order_no || "Job Order Breakdown"}</span>
                                {data && (
                                    <span className={`text-[11px] px-2 py-0.5 rounded-md font-semibold border ${data.grossProfit >= 0 ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20"}`}>
                                        {data.grossMarginPercent.toFixed(1)}% Margin
                                    </span>
                                )}
                            </h2>
                            <p className="text-xs text-muted-foreground">{data?.product_name || "Loading..."}</p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                </div>

                {isLoading ? (
                    <div className="flex flex-1 flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        <span className="text-xs">Loading itemized BOM and routing records...</span>
                    </div>
                ) : data ? (
                    <>
                        {/* Financial Snapshot Bar */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-4 bg-muted/40 border-b text-xs shrink-0">
                            <div className="rounded-lg border bg-card p-2.5">
                                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Yield / Produced</span>
                                <div className="text-sm font-bold text-foreground font-mono mt-0.5">
                                    {data.actualQuantity.toLocaleString()} units
                                </div>
                            </div>
                            <div className="rounded-lg border bg-card p-2.5">
                                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Selling Unit Price</span>
                                <div className="text-sm font-bold text-foreground font-mono mt-0.5">
                                    {fmt(data.sellingPrice)}
                                </div>
                            </div>
                            <div className="rounded-lg border bg-card p-2.5">
                                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Unit COGS (Cost/u)</span>
                                <div className="text-sm font-bold text-foreground font-mono mt-0.5">
                                    {fmt(data.unitCogs)}
                                </div>
                            </div>
                            <div className="rounded-lg border bg-card p-2.5">
                                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Gross Profit (Batch)</span>
                                <div className={`text-sm font-bold font-mono mt-0.5 ${data.grossProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                                    {fmt(data.grossProfit)}
                                </div>
                            </div>
                        </div>

                        {/* Navigation Tabs and Search Bar Filter */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-2 border-b bg-muted/10 shrink-0">
                            <div className="flex gap-1.5 overflow-x-auto">
                                <button
                                    type="button"
                                    onClick={() => handleTabChange("materials")}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${activeTab === "materials" ? "bg-card border-indigo-600/40 text-indigo-600 dark:text-indigo-400 shadow-2xs" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                                >
                                    <Layers className="h-3.5 w-3.5" />
                                    <span>Materials ({data.materials.length})</span>
                                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-muted font-mono">{fmt(data.totalMaterialsCost)}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleTabChange("labor")}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${activeTab === "labor" ? "bg-card border-amber-600/40 text-amber-600 dark:text-amber-400 shadow-2xs" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                                >
                                    <Users className="h-3.5 w-3.5" />
                                    <span>Labor ({data.labor.length})</span>
                                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-muted font-mono">{fmt(data.totalLaborCost)}</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleTabChange("overhead")}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${activeTab === "overhead" ? "bg-card border-teal-600/40 text-teal-600 dark:text-teal-400 shadow-2xs" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                                >
                                    <Cpu className="h-3.5 w-3.5" />
                                    <span>Overhead ({data.overheads.length})</span>
                                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-muted font-mono">{fmt(data.totalOverheadCost)}</span>
                                </button>
                            </div>

                            {/* Searchbar Filter */}
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                <Input
                                    type="text"
                                    placeholder={
                                        activeTab === "materials"
                                            ? "Search material, SKU, batch..."
                                            : activeTab === "labor"
                                            ? "Search operator, ID, route..."
                                            : "Search work center, status..."
                                    }
                                    value={searchQuery}
                                    onChange={(e) => {
                                        setSearchQuery(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                    className="h-8 pl-8 pr-7 text-xs"
                                />
                                {searchQuery && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearchQuery("");
                                            setCurrentPage(1);
                                        }}
                                        className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Tab Content (Scrollable fixed-height body) */}
                        <div className="flex-1 min-h-0 overflow-y-auto p-4">
                            {activeTab === "materials" && (
                                <div className="space-y-2">
                                    {paginatedMaterials.length === 0 ? (
                                        <div className="py-12 text-center text-xs text-muted-foreground">
                                            {searchQuery ? "No matching materials found." : "No BOM raw materials consumed records logged in yield ledger for this JO."}
                                        </div>
                                    ) : (
                                        <table className="w-full text-left text-xs">
                                            <thead className="border-b bg-muted/40 text-[10px] font-semibold text-muted-foreground sticky top-0 bg-card">
                                                <tr>
                                                    <th className="py-2 px-2.5">Material / SKU</th>
                                                    <th className="py-2 px-2.5">Batch / Lot</th>
                                                    <th className="py-2 px-2.5 text-right">Quantity Consumed</th>
                                                    <th className="py-2 px-2.5 text-right">Unit Cost</th>
                                                    <th className="py-2 px-2.5 text-right">Total Cost</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {paginatedMaterials.map((m) => (
                                                    <tr key={m.consumage_id} className="hover:bg-muted/20">
                                                        <td className="py-2 px-2.5">
                                                            <div className="font-medium text-foreground">{m.product_name}</div>
                                                            <div className="text-[10px] text-muted-foreground">{m.product_code}</div>
                                                        </td>
                                                        <td className="py-2 px-2.5 font-mono text-[11px] text-muted-foreground">
                                                            {m.batch_no || "N/A"}
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right font-mono font-medium">
                                                            {m.quantity_consumed.toLocaleString()}
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right font-mono text-muted-foreground">
                                                            {fmt(m.unit_cost)}
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right font-mono font-bold text-foreground">
                                                            {fmt(m.total_cost)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {activeTab === "labor" && (
                                <div className="space-y-2">
                                    {paginatedLabor.length === 0 ? (
                                        <div className="py-12 text-center text-xs text-muted-foreground">
                                            {searchQuery ? "No matching labor records found." : "No direct operator hours logged for this Job Order routing."}
                                        </div>
                                    ) : (
                                        <table className="w-full text-left text-xs">
                                            <thead className="border-b bg-muted/40 text-[10px] font-semibold text-muted-foreground sticky top-0 bg-card">
                                                <tr>
                                                    <th className="py-2 px-2.5">Operator</th>
                                                    <th className="py-2 px-2.5">Route Task ID</th>
                                                    <th className="py-2 px-2.5 text-right">Logged Hours</th>
                                                    <th className="py-2 px-2.5 text-right">Hourly Rate</th>
                                                    <th className="py-2 px-2.5 text-right">Total Labor Cost</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {paginatedLabor.map((l) => (
                                                    <tr key={l.jo_route_operator_id} className="hover:bg-muted/20">
                                                        <td className="py-2 px-2.5">
                                                            <div className="font-medium text-foreground">
                                                                {l.operator_name || `Operator #${l.operator_id}`}
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground">
                                                                ID: {l.operator_id}
                                                            </div>
                                                        </td>
                                                        <td className="py-2 px-2.5 font-mono text-muted-foreground">
                                                            Route #{l.jo_route_id}
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right font-mono font-medium">
                                                            {l.logged_hours.toFixed(2)} hrs
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right font-mono text-muted-foreground">
                                                            {fmt(l.hourly_rate)}/hr
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right font-mono font-bold text-foreground">
                                                            {fmt(l.labor_cost)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}

                            {activeTab === "overhead" && (
                                <div className="space-y-2">
                                    {paginatedOverheads.length === 0 ? (
                                        <div className="py-12 text-center text-xs text-muted-foreground">
                                            {searchQuery ? "No matching work center overhead records found." : "No workstation routes configured for this Job Order."}
                                        </div>
                                    ) : (
                                        <table className="w-full text-left text-xs">
                                            <thead className="border-b bg-muted/40 text-[10px] font-semibold text-muted-foreground sticky top-0 bg-card">
                                                <tr>
                                                    <th className="py-2 px-2.5">Work Center</th>
                                                    <th className="py-2 px-2.5">Status</th>
                                                    <th className="py-2 px-2.5 text-right">Actual Hours</th>
                                                    <th className="py-2 px-2.5 text-right">Overhead Rate</th>
                                                    <th className="py-2 px-2.5 text-right">Total Overhead Cost</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {paginatedOverheads.map((o) => (
                                                    <tr key={o.jo_route_id} className="hover:bg-muted/20">
                                                        <td className="py-2 px-2.5 font-medium text-foreground">
                                                            {o.work_center_name}
                                                        </td>
                                                        <td className="py-2 px-2.5">
                                                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                                                <CheckCircle2 className="h-3 w-3 text-primary" />
                                                                {o.status}
                                                            </span>
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right font-mono font-medium">
                                                            {o.actual_run_hours.toFixed(2)} hrs
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right font-mono text-muted-foreground">
                                                            {fmt(o.overhead_cost_per_hour)}/hr
                                                        </td>
                                                        <td className="py-2 px-2.5 text-right font-mono font-bold text-foreground">
                                                            {fmt(o.total_overhead_cost)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                ) : null}

                {/* Footer with Pagination Controls */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-2 border-t p-3 bg-muted/20 text-xs text-muted-foreground shrink-0">
                    <div>
                        {currentTabTotalCount > 0 ? (
                            <span>
                                Showing {(currentPage - 1) * MODAL_PAGE_SIZE + 1} - {Math.min(currentPage * MODAL_PAGE_SIZE, currentTabTotalCount)} of {currentTabTotalCount} {activeTab === "materials" ? "materials" : activeTab === "labor" ? "labor logs" : "work centers"}
                            </span>
                        ) : (
                            <span>0 records</span>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        {totalPages > 1 && (
                            <div className="flex items-center gap-1.5">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage <= 1}
                                    className="h-7 w-7 p-0"
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" />
                                </Button>
                                <span className="px-1.5 font-medium text-foreground text-[11px]">
                                    Page {currentPage} of {totalPages}
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
                        )}
                        <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
                            Close
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
