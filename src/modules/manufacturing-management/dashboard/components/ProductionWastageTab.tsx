import React from "react";
import { Trash2 } from "lucide-react";
import { 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    ResponsiveContainer, 
    Legend 
} from "recharts";
import { DashboardData } from "../types/dashboard.types";

interface ProductionWastageTabProps {
    data: DashboardData | null;
    productionWastageChartData: Array<{ name: string; Produced: number; Wasted: number }>;
    yieldEfficiency: number;
}

export function ProductionWastageTab({
    data,
    productionWastageChartData,
    yieldEfficiency
}: ProductionWastageTabProps) {
    return (
        <div className="space-y-6">
            {/* KPI Metrics row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-card border border-slate-200 dark:border-slate-800/80 p-4 rounded-xl space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-black tracking-wider">Total Production Cost</span>
                    <div className="text-lg font-black text-emerald-500">
                        ₱{data?.production.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <span className="text-[9px] text-muted-foreground block">{data?.production.totalQuantity.toLocaleString()} units produced</span>
                </div>
                <div className="bg-card border border-slate-200 dark:border-slate-800/80 p-4 rounded-xl space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-black tracking-wider">Total Wastage Cost</span>
                    <div className="text-lg font-black text-rose-500">
                        ₱{data?.wastage.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    <span className="text-[9px] text-muted-foreground block">{data?.wastage.totalQuantity.toLocaleString()} units wasted</span>
                </div>
                <div className="bg-card border border-slate-200 dark:border-slate-800/80 p-4 rounded-xl space-y-1">
                    <span className="text-[10px] text-muted-foreground uppercase font-black tracking-wider">Yield Efficiency Rate</span>
                    <div className={`text-lg font-black ${yieldEfficiency >= 90 ? "text-emerald-500" : yieldEfficiency >= 75 ? "text-amber-500" : "text-rose-500"}`}>
                        {yieldEfficiency.toFixed(1)}%
                    </div>
                    <span className="text-[9px] text-muted-foreground block">Cost balance ratio</span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* chart */}
                <div className="lg:col-span-2 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-4 rounded-xl">
                    <h3 className="text-xs font-bold text-foreground mb-3 uppercase tracking-wider">Production vs. Wastage Valuation (Top Products)</h3>
                    <div className="h-[260px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={productionWastageChartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.5} />
                                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} />
                                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={9} tickLine={false} axisLine={false} tickFormatter={(val) => `₱${(val / 1000).toFixed(0)}k`} />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: "hsl(var(--popover))", 
                                        borderColor: "hsl(var(--border))",
                                        color: "hsl(var(--popover-foreground))",
                                        borderRadius: "8px",
                                        fontSize: "11px",
                                        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)"
                                    }}
                                    itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                                    labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600, marginBottom: "4px" }}
                                    formatter={(value: string | number) => [`₱${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, undefined]}
                                />
                                <Legend 
                                    layout="horizontal" 
                                    align="right" 
                                    verticalAlign="top" 
                                    iconSize={8}
                                    wrapperStyle={{ fontSize: '10px', paddingBottom: '10px' }}
                                />
                                <Bar dataKey="Produced" fill="#10b981" radius={[3, 3, 0, 0]} name="Produced Cost" />
                                <Bar dataKey="Wasted" fill="#ef4444" radius={[3, 3, 0, 0]} name="Wastage Cost" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Wastage Summary List */}
                <div className="border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/5 p-4 rounded-xl flex flex-col justify-between">
                    <div>
                        <h3 className="text-xs font-bold text-rose-500 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                            <Trash2 className="h-4 w-4" /> Period Wastage Breakdown
                        </h3>
                        <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                            {data?.wastage.items && data.wastage.items.length > 0 ? (
                                data.wastage.items.map((item, i) => (
                                    <div key={i} className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800/60 pb-2 last:border-0 last:pb-0">
                                        <div>
                                            <span className="text-xs font-bold text-foreground block truncate max-w-[150px]">{item.name}</span>
                                            <span className="text-[9px] text-muted-foreground">{item.code} • {item.reason}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs font-bold text-rose-400 block">₱{item.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                            <span className="text-[9px] text-muted-foreground">{item.qty.toLocaleString()} units lost</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-xs text-muted-foreground italic text-center py-8">No scrap or wastage records registered in this time period.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Produced Items Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-900/10">
                <div className="px-4 py-3 bg-slate-100 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800">
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Manufactured Output Items Log</h4>
                </div>
                <table className="w-full border-collapse text-left text-xs">
                    <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-muted-foreground bg-slate-50 dark:bg-slate-950/20 font-bold">
                            <th className="py-2.5 px-4">Product Details</th>
                            <th className="py-2.5 px-4 text-right">Quantity Manufactured</th>
                            <th className="py-2.5 px-4 text-right">Production Cost Valuation</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.production.items && data.production.items.length > 0 ? (
                            data.production.items.map((item, i) => (
                                <tr key={i} className="border-b border-slate-200/30 dark:border-slate-800/30 last:border-0 hover:bg-slate-50/50 dark:bg-slate-950/10">
                                    <td className="py-3 px-4">
                                        <div>
                                            <span className="font-bold text-foreground block">{item.name}</span>
                                            <span className="text-[9px] text-muted-foreground">Code: {item.code}</span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-right font-semibold text-foreground">
                                        {item.qty.toLocaleString()} Units
                                    </td>
                                    <td className="py-3 px-4 text-right font-extrabold text-primary">
                                        ₱{item.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={3} className="py-8 text-center text-muted-foreground italic">No job order output lots received in this range.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
