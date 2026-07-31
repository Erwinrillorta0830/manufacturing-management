import React from "react";
import { 
    PieChart, 
    Pie, 
    Cell, 
    Tooltip, 
    ResponsiveContainer, 
    Legend 
} from "recharts";
import { DashboardData } from "../types/dashboard.types";

interface SelloutReportsTabProps {
    data: DashboardData | null;
    selloutChartData: Array<{ name: string; value: number }>;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6"];

export function SelloutReportsTab({
    data,
    selloutChartData
}: SelloutReportsTabProps) {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sellout Pie Chart */}
                <div className="lg:col-span-2 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 p-4 rounded-xl">
                    <h3 className="text-xs font-bold text-foreground mb-3 uppercase tracking-wider">Top-Selling Finished Goods Distribution</h3>
                    <div className="h-[260px] w-full flex items-center justify-center">
                        {selloutChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={selloutChartData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        outerRadius={70}
                                        fill="#8884d8"
                                        dataKey="value"
                                        label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                                    >
                                        {selloutChartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
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
                                        labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600 }}
                                        formatter={(value: number | string) => `₱${Number(value).toLocaleString()}`}
                                    />
                                    <Legend 
                                        layout="horizontal" 
                                        align="center" 
                                        verticalAlign="bottom" 
                                        iconSize={8} 
                                        wrapperStyle={{ fontSize: '9px', color: 'var(--muted-foreground)' }} 
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <span className="text-xs text-muted-foreground italic">No sellout transactions logged in period.</span>
                        )}
                    </div>
                </div>

                {/* Top products summary list */}
                <div className="border border-slate-200 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/5 p-4 rounded-xl flex flex-col justify-between">
                    <div>
                        <h3 className="text-xs font-bold text-amber-500 mb-3 uppercase tracking-wider">Top Products by Revenue</h3>
                        <div className="space-y-3">
                            {data?.sellout.items && data.sellout.items.length > 0 ? (
                                data.sellout.items.slice(0, 6).map((item, i) => (
                                    <div key={i} className="flex justify-between items-center border-b border-slate-200 dark:border-slate-800/60 pb-2 last:border-0 last:pb-0">
                                        <div>
                                            <span className="text-xs font-bold text-foreground block truncate max-w-[160px]">{item.name}</span>
                                            <span className="text-[9px] text-muted-foreground">{item.code}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-xs font-bold text-foreground block">₱{item.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                            <span className="text-[9px] text-muted-foreground">{item.qty.toLocaleString()} units sold</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-xs text-muted-foreground italic text-center py-8">No sales data compiled.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Sales Detail Grid */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-50/50 dark:bg-slate-900/10">
                <div className="px-4 py-3 bg-slate-100 dark:bg-slate-950/40 border-b border-slate-200 dark:border-slate-800">
                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Detailed Sellout Ledger Log</h4>
                </div>
                <table className="w-full border-collapse text-left text-xs">
                    <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-muted-foreground bg-slate-50 dark:bg-slate-950/20 font-bold">
                            <th className="py-2.5 px-4">SKU Product</th>
                            <th className="py-2.5 px-4 text-right">Units Sold</th>
                            <th className="py-2.5 px-4 text-right">Total Net Revenue</th>
                        </tr>
                    </thead>
                    <tbody>
                        {data?.sellout.items && data.sellout.items.length > 0 ? (
                            data.sellout.items.map((item, i) => (
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
                                    <td className="py-3 px-4 text-right font-extrabold text-amber-500">
                                        ₱{item.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={3} className="py-8 text-center text-muted-foreground italic">No sellout transactions logged.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
