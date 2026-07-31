import React from "react";
import { ChevronRight } from "lucide-react";
import { InventoryProductItem, DashboardData } from "../types/dashboard.types";

interface FinishedGoodsInventoryTabProps {
    data: DashboardData | null;
    filteredFG: InventoryProductItem[];
    expandedRows: Record<string, boolean>;
    toggleRow: (key: string) => void;
}

export function FinishedGoodsInventoryTab({
    data,
    filteredFG,
    expandedRows,
    toggleRow
}: FinishedGoodsInventoryTabProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-950/20 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-muted-foreground font-bold">Valuation of Finished Lots:</span>
                <span className="text-xs font-black text-primary">
                    ₱{data?.inventory.finishedGoods.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ({data?.inventory.finishedGoods.totalSKUs} manufactured products)
                </span>
            </div>

            <table className="w-full border-collapse text-left text-xs">
                <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-muted-foreground font-bold bg-slate-50 dark:bg-slate-950/20">
                        <th className="py-2.5 px-4">SKU Name / Category</th>
                        <th className="py-2.5 px-4 text-right">Manufactured Stock Balance</th>
                        <th className="py-2.5 px-4 text-right hidden sm:table-cell">Production Landed Cost</th>
                        <th className="py-2.5 px-4 text-right hidden md:table-cell font-bold">Asset Inventory Value</th>
                        <th className="py-2.5 px-4">Status</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredFG.map((item, idx) => {
                        const isLow = item.stock < 50;
                        const isRowExpanded = !!expandedRows[`fg-${item.product_id}`];
                        return (
                            <React.Fragment key={item.product_id || idx}>
                                <tr 
                                    className="border-b border-slate-200/30 dark:border-slate-800/30 last:border-b-0 hover:bg-slate-50/50 dark:bg-slate-950/10 cursor-pointer select-none"
                                    onClick={() => toggleRow(`fg-${item.product_id}`)}
                                >
                                    <td className="py-3 px-4">
                                        <div className="flex items-center gap-1.5">
                                            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${isRowExpanded ? "rotate-90 text-primary" : ""}`} />
                                            <div>
                                                <span className="font-bold text-foreground block">{item.product_name}</span>
                                                <span className="text-[9px] text-muted-foreground font-mono">{item.product_code} • {item.category}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-right font-semibold text-foreground">
                                        {item.stock.toLocaleString()} {item.unit_shortcut}
                                    </td>
                                    <td className="py-3 px-4 text-right font-medium text-muted-foreground hidden sm:table-cell">
                                        ₱{item.cost.toFixed(2)}
                                    </td>
                                    <td className="py-3 px-4 text-right font-bold text-foreground hidden md:table-cell">
                                        ₱{item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-3 px-4">
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${
                                            item.stock < 0
                                                ? "bg-red-500/10 text-red-500 border-red-500/20"
                                                : isLow 
                                                ? "bg-amber-500/10 text-amber-500 border-amber-500/20" 
                                                : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                        }`}>
                                            {item.stock < 0 ? "Shortage Deficit" : isLow ? "Low Stock" : "Available Safe"}
                                        </span>
                                    </td>
                                </tr>
                                {isRowExpanded && (
                                    <tr className="bg-slate-50/50 dark:bg-slate-950/15 border-b border-slate-200/30 dark:border-slate-800/30">
                                        <td colSpan={5} className="p-4">
                                            <div className="border-l-2 border-primary/45 pl-4 py-1.5 space-y-2">
                                                <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Manufactured Item Inventory Valuation</div>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                                                    <div className="p-2 rounded-lg bg-slate-100/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                                                        <div className="text-[9px] text-muted-foreground uppercase font-bold">Standard Cost</div>
                                                        <div className="text-xs font-semibold text-foreground mt-0.5">₱{item.cost.toFixed(2)} / {item.unit}</div>
                                                    </div>
                                                    <div className="p-2 rounded-lg bg-slate-100/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                                                        <div className="text-[9px] text-muted-foreground uppercase font-bold">Suggested Base Selling Price</div>
                                                        <div className="text-xs font-semibold text-foreground mt-0.5">₱{item.price.toFixed(2)}</div>
                                                    </div>
                                                    <div className="p-2 rounded-lg bg-slate-100/50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                                                        <div className="text-[9px] text-muted-foreground uppercase font-bold">Consolidated Valuation</div>
                                                        <div className="text-xs font-semibold text-foreground mt-0.5">₱{item.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </React.Fragment>
                        );
                    })}

                    {filteredFG.length === 0 && (
                        <tr>
                            <td colSpan={5} className="py-8 text-center text-muted-foreground">No finished goods matched search filters.</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}
