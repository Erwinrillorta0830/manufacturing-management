"use client";

import React, { useMemo } from "react";
import {
    BarChart,
    Bar,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Cell,
    ReferenceLine,
    LabelList
} from "recharts";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui/card";
import {
    ChartConfig,
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent
} from "@/components/ui/chart";
import { JobOrderProfitabilityRow } from "../types";

interface ProfitabilityAnalyticsChartsProps {
    rows: JobOrderProfitabilityRow[];
}

const barChartConfig = {
    marginPercent: {
        label: "Gross Margin",
        color: "hsl(var(--primary))"
    }
} satisfies ChartConfig;

const lineChartConfig = {
    marginPercent: {
        label: "Daily Avg Margin",
        color: "#3b82f6"
    }
} satisfies ChartConfig;

export function ProfitabilityAnalyticsCharts({ rows }: ProfitabilityAnalyticsChartsProps) {
    const fmtCurrency = (val: number | null | undefined): string => {
        return "₱" + (val || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // 1. Group by Product for Horizontal Bar Chart
    const productData = useMemo(() => {
        const map = new Map<number, {
            name: string;
            code: string;
            revenue: number;
            cogs: number;
            profit: number;
            jobCount: number;
        }>();

        rows.forEach(r => {
            const cur = map.get(r.product_id) || {
                name: r.product_name,
                code: r.product_code,
                revenue: 0,
                cogs: 0,
                profit: 0,
                jobCount: 0
            };
            cur.revenue += r.total_revenue;
            cur.cogs += r.total_cogs;
            cur.profit += r.gross_profit;
            cur.jobCount += 1;
            map.set(r.product_id, cur);
        });

        const list = Array.from(map.values()).map(p => {
            const marginPct = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
            return {
                displayName: p.name.length > 16 ? `${p.name.slice(0, 14)}...` : p.name,
                fullName: p.name,
                code: p.code,
                revenue: Math.round(p.revenue * 100) / 100,
                cogs: Math.round(p.cogs * 100) / 100,
                profit: Math.round(p.profit * 100) / 100,
                marginPercent: Math.round(marginPct * 10) / 10,
                jobCount: p.jobCount
            };
        });

        list.sort((a, b) => b.revenue - a.revenue);
        return list.slice(0, 6); // Top 6 products for optimal vertical layout height
    }, [rows]);

    // 2. Group by Date for Labeled Line Chart (7 Days)
    const trendData = useMemo(() => {
        const dateMap = new Map<string, {
            totalRevenue: number;
            totalCogs: number;
            totalProfit: number;
            jobCount: number;
        }>();

        rows.forEach(r => {
            if (!r.start_date) return;
            const d = r.start_date.split("T")[0];
            const cur = dateMap.get(d) || {
                totalRevenue: 0,
                totalCogs: 0,
                totalProfit: 0,
                jobCount: 0
            };
            cur.totalRevenue += r.total_revenue;
            cur.totalCogs += r.total_cogs;
            cur.totalProfit += r.gross_profit;
            cur.jobCount += 1;
            dateMap.set(d, cur);
        });

        const sortedDates = Array.from(dateMap.keys()).sort();
        const recentDates = sortedDates.slice(-7); // Last 7 chronological days

        return recentDates.map(dateStr => {
            const stats = dateMap.get(dateStr)!;
            const marginPct = stats.totalRevenue > 0
                ? (stats.totalProfit / stats.totalRevenue) * 100
                : 0;

            let formattedDate = dateStr;
            try {
                const parts = dateStr.split("-");
                if (parts.length === 3) {
                    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                    formattedDate = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                }
            } catch {
                formattedDate = dateStr;
            }

            return {
                date: formattedDate,
                rawDate: dateStr,
                marginPercent: Math.round(marginPct * 10) / 10,
                revenue: Math.round(stats.totalRevenue * 100) / 100,
                cogs: Math.round(stats.totalCogs * 100) / 100,
                profit: Math.round(stats.totalProfit * 100) / 100,
                jobCount: stats.jobCount
            };
        });
    }, [rows]);

    if (rows.length === 0) {
        return null;
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Chart 1: shadcn Horizontal Bar Chart */}
            <Card className="rounded-xl border shadow-2xs">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">Product Margin Distribution</CardTitle>
                    <CardDescription className="text-xs">
                        Gross margin (%) across top manufactured finished goods
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    {productData.length === 0 ? (
                        <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">
                            No product records available for chart.
                        </div>
                    ) : (
                        <ChartContainer config={barChartConfig} className="h-[260px] w-full">
                            <BarChart
                                accessibilityLayer
                                data={productData}
                                layout="vertical"
                                margin={{ top: 10, right: 35, left: 10, bottom: 10 }}
                            >
                                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                                <YAxis
                                    dataKey="displayName"
                                    type="category"
                                    tickLine={false}
                                    tickMargin={8}
                                    axisLine={false}
                                    width={95}
                                    tick={{ fontSize: 11 }}
                                />
                                <XAxis
                                    type="number"
                                    tickFormatter={(val) => `${val}%`}
                                    tickLine={false}
                                    axisLine={false}
                                    tick={{ fontSize: 10 }}
                                />
                                <ChartTooltip
                                    cursor={false}
                                    content={
                                        <ChartTooltipContent
                                            formatter={(value, _name, item) => {
                                                const p = item.payload;
                                                return (
                                                    <div className="flex flex-col gap-0.5 text-xs">
                                                        <span className="font-semibold text-foreground">
                                                            {Number(value).toFixed(1)}% Margin
                                                        </span>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            Revenue: {fmtCurrency(p?.revenue)} &bull; Cost: {fmtCurrency(p?.cogs)}
                                                        </span>
                                                    </div>
                                                );
                                            }}
                                            labelFormatter={(_label, payload) => {
                                                const item = payload?.[0]?.payload;
                                                return item?.fullName ? `${item.fullName} (${item.code})` : String(_label);
                                            }}
                                        />
                                    }
                                />
                                <Bar
                                    dataKey="marginPercent"
                                    layout="vertical"
                                    radius={5}
                                >
                                    <LabelList
                                        dataKey="marginPercent"
                                        position="right"
                                        offset={8}
                                        formatter={(val: number) => `${val.toFixed(1)}%`}
                                        className="fill-foreground text-[10px] font-mono font-medium"
                                    />
                                    {productData.map((entry, index) => {
                                        const m = entry.marginPercent;
                                        const color = m >= 45 ? "#10b981" : m >= 25 ? "#06b6d4" : m >= 10 ? "#f59e0b" : "#ef4444";
                                        return <Cell key={`cell-${index}`} fill={color} />;
                                    })}
                                </Bar>
                            </BarChart>
                        </ChartContainer>
                    )}
                </CardContent>
            </Card>

            {/* Chart 2: shadcn Labeled Line Chart */}
            <Card className="rounded-xl border shadow-2xs">
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold">7-Day Job Order Margin Trend</CardTitle>
                    <CardDescription className="text-xs">
                        Daily average gross margin % trajectory over the last week
                    </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                    {trendData.length === 0 ? (
                        <div className="flex h-[260px] items-center justify-center text-xs text-muted-foreground">
                            No chronological job order date records in the selected range.
                        </div>
                    ) : (
                        <ChartContainer config={lineChartConfig} className="h-[260px] w-full">
                            <LineChart
                                accessibilityLayer
                                data={trendData}
                                margin={{ top: 28, right: 28, left: 16, bottom: 10 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                    dataKey="date"
                                    tickLine={false}
                                    axisLine={false}
                                    tickMargin={8}
                                    padding={{ left: 24, right: 24 }}
                                    tick={{ fontSize: 11 }}
                                />
                                <YAxis
                                    tickFormatter={(val) => `${val}%`}
                                    tickLine={false}
                                    axisLine={false}
                                    width={55}
                                    tick={{ fontSize: 10 }}
                                    domain={[(dataMin: number) => Math.floor(Math.min(dataMin - 15, -10) / 10) * 10, (dataMax: number) => Math.ceil(Math.max(dataMax + 15, 100) / 10) * 10]}
                                />
                                <ReferenceLine
                                    y={25}
                                    stroke="#10b981"
                                    strokeDasharray="3 3"
                                    label={{ value: "Target 25%", fill: "#10b981", fontSize: 10, position: "insideTopRight" }}
                                />
                                <ChartTooltip
                                    cursor={false}
                                    content={
                                        <ChartTooltipContent
                                            formatter={(value, _name, item) => {
                                                const p = item.payload;
                                                return (
                                                    <div className="flex flex-col gap-0.5 text-xs">
                                                        <span className="font-semibold text-foreground">
                                                            {Number(value).toFixed(1)}% Avg Margin
                                                        </span>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            {p?.jobCount || 0} JOs &bull; Profit: {fmtCurrency(p?.profit)}
                                                        </span>
                                                    </div>
                                                );
                                            }}
                                        />
                                    }
                                />
                                <Line
                                    type="monotone"
                                    dataKey="marginPercent"
                                    stroke="#3b82f6"
                                    strokeWidth={2.5}
                                    dot={{ r: 4, fill: "#3b82f6", strokeWidth: 1.5, stroke: "#ffffff" }}
                                    activeDot={{ r: 6 }}
                                >
                                    <LabelList
                                        dataKey="marginPercent"
                                        content={(props: { x?: number | string; y?: number | string; value?: number | string; index?: number }) => {
                                            const { x, y, value, index } = props;
                                            if (x === undefined || y === undefined || value === undefined || value === null) return null;
                                            const numX = Number(x);
                                            const numY = Number(y);
                                            const numVal = Number(value);

                                            // Determine vertical offset based on whether value is negative or positive
                                            const yOffset = numVal < 0 ? 14 : -10;
                                            // Slight horizontal nudge for first data point to keep away from Y axis
                                            const xOffset = index === 0 ? 6 : 0;

                                            return (
                                                <text
                                                    x={numX + xOffset}
                                                    y={numY + yOffset}
                                                    textAnchor="middle"
                                                    fill="currentColor"
                                                    className="fill-foreground font-mono text-[10px] font-semibold select-none"
                                                >
                                                    {`${numVal.toFixed(1)}%`}
                                                </text>
                                            );
                                        }}
                                    />
                                </Line>
                            </LineChart>
                        </ChartContainer>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
