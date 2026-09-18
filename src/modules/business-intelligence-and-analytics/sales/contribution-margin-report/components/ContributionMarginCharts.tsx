"use client";

import React from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Cell
} from "recharts";
import {
    CategoryLineSummary,
    BrandLineSummary
} from "../types/contribution-margin.types";
import { formatCurrency } from "@/lib/utils";

interface ContributionMarginChartsProps {
    categorySummaries: CategoryLineSummary[];
    brandSummaries: BrandLineSummary[];
    activeLineType: "category" | "brand";
}

export function ContributionMarginCharts({
    categorySummaries,
    brandSummaries,
    activeLineType
}: ContributionMarginChartsProps) {
    const data = activeLineType === "category" ? categorySummaries : brandSummaries;

    if (!data || data.length === 0) {
        return null;
    }

    const chartData = data.slice(0, 8).map(item => ({
        name: "category_name" in item ? item.category_name : item.brand_name,
        netRevenue: item.net_sales_revenue,
        tmcCost: item.total_manufacturing_cost,
        contributionMargin: item.contribution_margin_amount,
        cmRatio: item.contribution_margin_ratio
    }));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Chart 1: Revenue vs TMC vs CM Amount */}
            <div className="rounded-xl border bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between pb-3 mb-2 border-b">
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">
                            Revenue vs. Manufacturing Cost (TMC)
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Comparison by top {activeLineType === "category" ? "Categories" : "Brands"}
                        </p>
                    </div>
                </div>

                <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                interval={0}
                                angle={-25}
                                textAnchor="end"
                                height={45}
                            />
                            <YAxis
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                tickFormatter={(val) => `₱${(val / 1000).toFixed(0)}k`}
                            />
                            <Tooltip
                                formatter={(value: any, name: any) => {
                                    const num = Number(value) || 0;
                                    const label = name === "netRevenue"
                                        ? "Net Sales Revenue"
                                        : name === "tmcCost"
                                        ? "Total Manufacturing Cost (TMC)"
                                        : "Contribution Margin";
                                    return [formatCurrency(num), label];
                                }}
                                contentStyle={{
                                    backgroundColor: "hsl(var(--popover))",
                                    borderColor: "hsl(var(--border))",
                                    borderRadius: "8px",
                                    fontSize: "12px"
                                }}
                            />
                            <Legend
                                wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                                formatter={(val) => val === "netRevenue" ? "Net Sales" : val === "tmcCost" ? "Total Mfg Cost (TMC)" : "Contribution Margin"}
                            />
                            <Bar dataKey="netRevenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="netRevenue" />
                            <Bar dataKey="tmcCost" fill="#f59e0b" radius={[4, 4, 0, 0]} name="tmcCost" />
                            <Bar dataKey="contributionMargin" fill="#10b981" radius={[4, 4, 0, 0]} name="contributionMargin" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Chart 2: Contribution Margin Ratio (%) Comparison */}
            <div className="rounded-xl border bg-card p-4 shadow-2xs">
                <div className="flex items-center justify-between pb-3 mb-2 border-b">
                    <div>
                        <h3 className="text-sm font-semibold text-foreground">
                            Contribution Margin Ratio (%)
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Percentage efficiency by {activeLineType === "category" ? "Category Line" : "Brand Line"}
                        </p>
                    </div>
                </div>

                <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={chartData}
                            margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis
                                dataKey="name"
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                interval={0}
                                angle={-25}
                                textAnchor="end"
                                height={45}
                            />
                            <YAxis
                                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                                tickFormatter={(val) => `${val}%`}
                                domain={[0, 'auto']}
                            />
                            <Tooltip
                                formatter={(value: any) => [`${Number(value).toFixed(1)}%`, "Contribution Margin Ratio"]}
                                contentStyle={{
                                    backgroundColor: "hsl(var(--popover))",
                                    borderColor: "hsl(var(--border))",
                                    borderRadius: "8px",
                                    fontSize: "12px"
                                }}
                            />
                            <Bar dataKey="cmRatio" radius={[4, 4, 0, 0]} name="CM Ratio (%)">
                                {chartData.map((entry, index) => {
                                    const ratio = entry.cmRatio;
                                    const color = ratio >= 40 ? "#10b981" : ratio >= 20 ? "#3b82f6" : ratio >= 0 ? "#f59e0b" : "#ef4444";
                                    return <Cell key={`cell-${index}`} fill={color} />;
                                })}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
