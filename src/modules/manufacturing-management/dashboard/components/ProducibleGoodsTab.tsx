import React from "react";
import { TrendingUp, Search } from "lucide-react";
import { DashboardData, ProducibleGood } from "../types/dashboard.types";

interface ProducibleGoodsTabProps {
    data: DashboardData | null;
    searchQuery: string;
    setSearchQuery: (v: string) => void;
}

export function ProducibleGoodsTab({
    data,
    searchQuery,
    setSearchQuery
}: ProducibleGoodsTabProps) {
    return (
        <div className="space-y-6">
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-900/10">
                <div className="px-4 py-4 bg-slate-100 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                    <div>
                        <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <TrendingUp className="h-4.5 w-4.5 text-primary" />
                            Maximum Producible Quantities (MRP Engine)
                        </h4>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                            Real-time inventory calculation analyzing active recipes (BOMs) against raw material stock levels.
                        </p>
                    </div>
                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search finished goods..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-background border border-slate-200 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary text-foreground"
                        />
                    </div>
                </div>
                <div className="p-4 space-y-4">
                    {(!data?.producibleGoods || data.producibleGoods.length === 0) ? (
                        <div className="p-8 text-center text-xs text-muted-foreground italic">
                            No active recipe formulas (BOMs) loaded to compute MRP potentials.
                        </div>
                    ) : (
                        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl bg-card">
                            <table className="w-full border-collapse text-left text-xs">
                                <thead>
                                    <tr className="border-b border-slate-200 dark:border-slate-800 text-[10px] text-muted-foreground uppercase font-black bg-slate-50 dark:bg-slate-900/50">
                                        <th className="py-3 px-4 font-bold border-r border-slate-200/80 dark:border-slate-800/80">Category</th>
                                        <th className="py-3 px-4 font-bold border-r border-slate-200/80 dark:border-slate-800/80">SKU Code</th>
                                        <th className="py-3 px-4 font-bold border-r border-slate-200/80 dark:border-slate-800/80">Product</th>
                                        <th className="py-3 px-4 font-bold border-r border-slate-200/80 dark:border-slate-800/80">UOM</th>
                                        <th className="py-3 px-4 font-bold border-r border-slate-200/80 dark:border-slate-800/80">Recipe Version</th>
                                        <th className="py-3 px-4 font-bold border-r border-slate-200/80 dark:border-slate-800/80 text-right">Producible RN</th>
                                        <th className="py-3 px-4 font-bold border-r border-slate-200/80 dark:border-slate-800/80 text-right text-blue-500">If Bottleneck Solved</th>
                                        <th className="py-3 px-4 font-bold">Raw Mats Breakdown</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.producibleGoods
                                        .filter(good => 
                                            good.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                            good.product_code.toLowerCase().includes(searchQuery.toLowerCase())
                                        )
                                        .map((good: ProducibleGood, idx: number) => {
                                            return (
                                                <tr key={idx} className="border-b border-slate-200/60 dark:border-slate-800/60 hover:bg-slate-50/50 dark:hover:bg-slate-900/10 transition-colors font-mono">
                                                    <td className="py-2.5 px-4 text-muted-foreground border-r border-slate-200/60 dark:border-slate-800/60 font-sans">{good.category}</td>
                                                    <td className="py-2.5 px-4 text-muted-foreground border-r border-slate-200/60 dark:border-slate-800/60">{good.product_code}</td>
                                                    <td className="py-2.5 px-4 font-bold text-foreground border-r border-slate-200/60 dark:border-slate-800/60 font-sans">{good.product_name}</td>
                                                    <td className="py-2.5 px-4 text-muted-foreground border-r border-slate-200/60 dark:border-slate-800/60 font-sans">{good.uom_name || "-"}</td>
                                                    <td className="py-2.5 px-4 text-primary font-bold border-r border-slate-200/60 dark:border-slate-800/60 font-sans">{good.bom_name}</td>
                                                    <td className="py-2.5 px-4 text-right border-r border-slate-200/60 dark:border-slate-800/60">
                                                        <div>
                                                            {good.max_producible > 0 ? (
                                                                <span className="text-emerald-500 font-extrabold">{good.max_producible.toLocaleString()} units</span>
                                                            ) : (
                                                                <span className="text-rose-500 font-extrabold">0 (Shortage)</span>
                                                            )}
                                                        </div>
                                                        {good.max_producible > 0 && good.estimated_time_hours !== undefined && (
                                                            <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
                                                                Est: {good.estimated_time_hours.toLocaleString()} hrs
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-4 text-right border-r border-slate-200/60 dark:border-slate-800/60 text-blue-500">
                                                        <div>
                                                            {good.producible_if_fulfilled !== undefined && good.producible_if_fulfilled !== null ? (
                                                                good.producible_if_fulfilled === Infinity ? (
                                                                    <span className="text-blue-500 font-extrabold">Unlimited</span>
                                                                ) : (
                                                                    <span className="text-blue-500 font-extrabold">{good.producible_if_fulfilled.toLocaleString()} units</span>
                                                                )
                                                            ) : (
                                                                <span className="text-muted-foreground">-</span>
                                                            )}
                                                        </div>
                                                        {good.producible_if_fulfilled !== undefined && good.producible_if_fulfilled !== null && good.estimated_time_hours_if_fulfilled !== undefined && good.estimated_time_hours_if_fulfilled !== null && (
                                                            <div className="text-[10px] text-muted-foreground font-semibold mt-0.5">
                                                                Est: {good.estimated_time_hours_if_fulfilled.toLocaleString()} hrs
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-4">
                                                        <div className="space-y-1 font-sans text-[10px] min-w-[240px]">
                                                            {good.components.map((c, ci) => {
                                                                const isBottleneck = c.max_producible_with_this === good.max_producible;
                                                                return (
                                                                    <div key={ci} className={`flex justify-between items-center gap-2 border-b border-slate-100 dark:border-slate-800/40 pb-0.5 last:border-0 last:pb-0 ${isBottleneck ? "text-rose-500 font-extrabold bg-rose-500/[0.03] px-1 rounded" : "text-muted-foreground"}`}>
                                                                        <span className="truncate max-w-[120px] font-semibold" title={c.component_name}>{c.component_name}</span>
                                                                        <span className="font-mono text-[9px] font-semibold">{c.available.toLocaleString()} / {c.required_per_unit.toFixed(2)} ({c.max_producible_with_this.toLocaleString()})</span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
