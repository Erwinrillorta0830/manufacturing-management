import React from "react";
import { Bookmark, X } from "lucide-react";
import { ReceivingJO, ReceivingResult } from "../types/inventory.types";

interface ReceivingResultModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedReceivingJO: ReceivingJO | null;
    receivingResult: ReceivingResult | null;
}

export function ReceivingResultModal({
    isOpen,
    onClose,
    selectedReceivingJO,
    receivingResult
}: ReceivingResultModalProps) {
    if (!isOpen || !receivingResult) return null;

    const yieldAllocations = receivingResult.yieldAllocations || receivingResult.allocations || [];
    const materialCostVariances = receivingResult.materialCostVariances;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/90 backdrop-blur-md animate-in fade-in duration-300">
            <div className="bg-card border border-border w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-border flex items-center justify-between bg-primary/5">
                    <div>
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                            <Bookmark className="h-4.5 w-4.5 text-primary" />
                            Production Closure Summary: {selectedReceivingJO?.jo_id}
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Yield allocations back to Sales Orders and Material Cost Variance analysis.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground border-none bg-transparent cursor-pointer transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto max-h-[80vh]">
                    {/* Yield Allocations section */}
                    <div className="space-y-2">
                        <h4 className="text-[11px] font-black uppercase tracking-wider text-primary">Proportional Yield Split back to Sales Orders</h4>
                        <div className="border border-border rounded-xl overflow-hidden bg-card">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-muted/40 border-b border-border text-muted-foreground">
                                        <th className="p-2.5 font-bold">Sales Order No</th>
                                        <th className="p-2.5 font-bold">Customer Name</th>
                                        <th className="p-2.5 font-bold">Consolidated Target</th>
                                        <th className="p-2.5 font-bold text-right">Proportionally Allocated Yield</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {yieldAllocations && yieldAllocations.length > 0 ? (
                                        yieldAllocations.map((allocItem, idx: number) => {
                                            const alloc = allocItem as { order_no?: string; customer_name?: string; target_qty?: number; allocated_yield?: number };
                                            return (
                                                <tr key={idx} className="border-b border-border/40 last:border-0 hover:bg-muted/5">
                                                    <td className="p-2.5 font-extrabold text-foreground">{alloc.order_no}</td>
                                                    <td className="p-2.5 font-semibold text-muted-foreground">{alloc.customer_name}</td>
                                                    <td className="p-2.5 text-foreground font-semibold">{alloc.target_qty?.toLocaleString()} units</td>
                                                    <td className="p-2.5 text-right font-black text-primary">{alloc.allocated_yield?.toLocaleString()} units</td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="p-4 text-center text-muted-foreground font-semibold">
                                                No Sales Orders were linked to this Job Order. Yield loaded directly to branch warehouse stock.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Material Cost Variance section */}
                    {materialCostVariances && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <h4 className="text-[11px] font-black uppercase tracking-wider text-primary">Material Cost Variance Analysis</h4>
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${materialCostVariances.total_variance <= 0
                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                    }`}>
                                    {materialCostVariances.total_variance <= 0 ? "Favorable Variance" : "Unfavorable Variance"}
                                </span>
                            </div>

                            {/* Cost Summary Cards */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-3 bg-muted/15 border border-border rounded-xl">
                                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider block">Standard Material Cost</span>
                                    <h4 className="text-sm font-bold text-foreground mt-1">
                                        PHP {materialCostVariances.standard_total_cost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </h4>
                                </div>
                                <div className="p-3 bg-muted/15 border border-border rounded-xl">
                                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider block">Actual Picked Cost</span>
                                    <h4 className="text-sm font-bold text-foreground mt-1">
                                        PHP {materialCostVariances.actual_total_cost?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </h4>
                                </div>
                                <div className="p-3 bg-muted/15 border border-border rounded-xl">
                                    <span className="text-[9px] text-muted-foreground uppercase font-black tracking-wider block">Material Cost Variance</span>
                                    <h4 className={`text-sm font-black mt-1 ${materialCostVariances.total_variance <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                                        }`}>
                                        {materialCostVariances.total_variance > 0 ? "+" : ""}
                                        PHP {materialCostVariances.total_variance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </h4>
                                </div>
                            </div>

                            {/* Component Cost Breakdowns */}
                            <div className="border border-border rounded-xl overflow-hidden bg-card">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-muted/40 border-b border-border text-muted-foreground">
                                            <th className="p-2.5 font-bold">Component Name</th>
                                            <th className="p-2.5 font-bold">Standard Usage (BOM)</th>
                                            <th className="p-2.5 font-bold">Actual Usage (WIP)</th>
                                            <th className="p-2.5 font-bold">Std cost</th>
                                            <th className="p-2.5 font-bold">Act cost</th>
                                            <th className="p-2.5 font-bold text-right">Variance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {materialCostVariances.details && materialCostVariances.details.map((detail, idx: number) => (
                                            <tr key={idx} className="border-b border-border/40 last:border-0 hover:bg-muted/5">
                                                <td className="p-2.5 font-bold text-foreground">{detail.productName}</td>
                                                <td className="p-2.5 text-muted-foreground font-semibold">
                                                    {detail.standardQty?.toLocaleString(undefined, { maximumFractionDigits: 2 })} units
                                                </td>
                                                <td className="p-2.5 font-bold text-foreground">
                                                    {detail.actualQty?.toLocaleString(undefined, { maximumFractionDigits: 2 })} units
                                                </td>
                                                <td className="p-2.5 text-muted-foreground font-semibold">
                                                    PHP {detail.standardTotalCost?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                </td>
                                                <td className="p-2.5 text-foreground font-semibold">
                                                    PHP {detail.actualTotalCost?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                </td>
                                                {(() => {
                                                    const varVal = detail.variance ?? 0;
                                                    return (
                                                        <td className={`p-2.5 text-right font-bold ${varVal <= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                                            {varVal > 0 ? "+" : ""}
                                                            PHP {varVal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                                        </td>
                                                    );
                                                })()}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold px-6 py-2 rounded-lg cursor-pointer shadow-sm transition-all border-none"
                        >
                            Done & Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
