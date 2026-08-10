"use client";

import React from "react";
import { TrendingUp, AlertTriangle, CheckCircle, Calendar, ShoppingBag } from "lucide-react";
import {
    ResponsiveContainer,
    Area,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ComposedChart
} from "recharts";
import { ProductFamily } from "../types";

interface FinancialOverviewTabProps {
    isUsingMockProducts: boolean;
    isUsingSimulatedData: boolean;
    activeFamily?: ProductFamily;
    next30DaysForecastVolume: number;
    next90DaysForecastVolume: number;
    productsWithShortages: number;
    forecastModel: "sma" | "exponential" | "seasonal";
    chartData: {
        month: string;
        "Historical Sales": number | null;
        "Projected Demand": number | null;
    }[];
}

export function FinancialOverviewTab({
    isUsingMockProducts,
    isUsingSimulatedData,
    activeFamily,
    next30DaysForecastVolume,
    next90DaysForecastVolume,
    productsWithShortages,
    forecastModel,
    chartData
}: FinancialOverviewTabProps) {
    return (
        <div className="space-y-6">
            {/* Data Source Alerts */}
            {(isUsingMockProducts || isUsingSimulatedData) && (
                <div className="flex flex-col gap-2">
                    {isUsingMockProducts && (
                        <div className="flex items-center gap-2 p-3 bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 rounded-lg text-xs font-semibold">
                            <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                            <div>
                                No products found in the database. Showing sandbox mock products for demonstration.
                            </div>
                        </div>
                    )}
                    {!isUsingMockProducts && isUsingSimulatedData && (
                        <div className="flex items-center gap-2 p-3 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 rounded-lg text-xs font-semibold">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                            <div>
                                No transaction history (sales invoices or returns) found in the database. Displaying simulated forecasting data.
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Metrics Dashboard */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                <div className="rounded-xl border bg-muted/10 p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active Family Selected</span>
                        <ShoppingBag className="h-4 w-4 text-primary" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-extrabold text-foreground truncate">{activeFamily?.title}</p>
                        <p className="text-[10px] text-muted-foreground">SKU: {activeFamily?.sku}</p>
                    </div>
                </div>

                <div className="rounded-xl border bg-muted/10 p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Forecast 30-Day Demand</span>
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-lg font-extrabold text-foreground">
                            {next30DaysForecastVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {activeFamily?.displayUom}
                        </p>
                        <p className="text-[10px] text-emerald-600 font-semibold">
                            Projected revenue: ₱{(next30DaysForecastVolume * (activeFamily?.targetSellingPrice || 0) * (activeFamily?.displayDivisor || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                    </div>
                </div>

                <div className="rounded-xl border bg-muted/10 p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">90-Day Accumulation</span>
                        <Calendar className="h-4 w-4 text-violet-500" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-lg font-extrabold text-foreground">
                            {next90DaysForecastVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {activeFamily?.displayUom}
                        </p>
                        <p className="text-[10px] text-muted-foreground">July to September Projection</p>
                    </div>
                </div>

                <div className="rounded-xl border bg-muted/10 p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Supply Alerts</span>
                        {productsWithShortages > 0 ? (
                            <AlertTriangle className="h-4 w-4 text-amber-500 animate-pulse" />
                        ) : (
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                        )}
                    </div>
                    <div className="space-y-1">
                        <p className={`text-lg font-extrabold ${productsWithShortages > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                            {productsWithShortages} Family Shortage
                        </p>
                        <p className="text-[10px] text-muted-foreground">Requires raw material POs</p>
                    </div>
                </div>
            </div>

            {/* Visual Chart */}
            <div className="border rounded-xl p-4 sm:p-5 bg-background space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                    <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
                            <TrendingUp className="h-4.5 w-4.5 text-primary" />
                            Trendline Forecast Analysis (in {activeFamily?.displayUom})
                        </h3>
                        {isUsingSimulatedData ? (
                            <span className="text-[9px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                Simulated
                            </span>
                        ) : (
                            <span className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                Live DB Data
                            </span>
                        )}
                    </div>
                    <div className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        Model: {forecastModel.toUpperCase()}
                    </div>
                </div>

                <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted)/0.3)" />
                            <XAxis
                                dataKey="month"
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={11}
                                tickLine={false}
                            />
                            <YAxis
                                stroke="hsl(var(--muted-foreground))"
                                fontSize={11}
                                tickLine={false}
                                axisLine={false}
                                tickFormatter={(val) => val.toLocaleString()}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: "hsl(var(--popover))",
                                    borderColor: "hsl(var(--border))",
                                    color: "hsl(var(--popover-foreground))",
                                    borderRadius: "8px",
                                    fontSize: "12px",
                                    boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)"
                                }}
                                itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                                labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600, marginBottom: "4px" }}
                            />
                            <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                            <defs>
                                <linearGradient id="historyColor" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.0} />
                                </linearGradient>
                            </defs>
                            <Area
                                type="monotone"
                                dataKey="Historical Sales"
                                stroke="hsl(var(--primary))"
                                strokeWidth={2.5}
                                fillOpacity={1}
                                fill="url(#historyColor)"
                            />
                            <Line
                                type="monotone"
                                dataKey="Projected Demand"
                                stroke="hsl(var(--emerald-500)/0.8)"
                                strokeDasharray="4 4"
                                strokeWidth={2.5}
                                dot={{ stroke: "hsl(var(--emerald-500))", strokeWidth: 2, r: 4 }}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
