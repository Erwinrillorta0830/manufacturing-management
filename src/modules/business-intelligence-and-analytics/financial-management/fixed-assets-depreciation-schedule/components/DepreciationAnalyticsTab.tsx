"use client";

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    LineChart,
    Line,
    Cell,
} from "recharts";
import { AssetDepreciationRecord, DepreciationScheduleSummary } from "../types";
import { formatCurrency } from "../utils/depreciationCalculations";

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface DepreciationAnalyticsTabProps {
    assets: AssetDepreciationRecord[];
    summary: DepreciationScheduleSummary | null;
}

const COLORS = {
    nbv: "#6366f1",          // indigo-500
    accumDepr: "#f59e0b",    // amber-500
    salvage: "#10b981",      // emerald-500
    sl: "#8b5cf6",           // violet-500
    uop: "#06b6d4",          // cyan-500
    line: "#f97316",         // orange-500
};

// Currency tick formatter — compact (₱1.2M, ₱500K)
function compactCurrency(value: number): string {
    if (Math.abs(value) >= 1_000_000) return `₱${(value / 1_000_000).toFixed(1)}M`;
    if (Math.abs(value) >= 1_000) return `₱${(value / 1_000).toFixed(0)}K`;
    return `₱${value.toFixed(0)}`;
}

// Custom tooltip wrapper — consistent across all charts
function ChartTooltip({
    active,
    payload,
    label,
}: {
    active?: boolean;
    payload?: Array<{ name: string; value: number; color: string }>;
    label?: string;
}) {
    if (!active || !payload || payload.length === 0) return null;

    return (
        <div className="rounded-lg border border-border bg-background/95 p-3 shadow-lg text-xs backdrop-blur-sm">
            {label && <p className="font-semibold text-foreground mb-2">{label}</p>}
            {payload.map((entry, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5">
                    <span
                        className="inline-block h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-muted-foreground">{entry.name}:</span>
                    <span className="font-medium text-foreground">
                        {formatCurrency(entry.value)}
                    </span>
                </div>
            ))}
        </div>
    );
}

// Section card wrapper
function ChartCard({
    title,
    subtitle,
    children,
    delay = 0,
}: {
    title: string;
    subtitle: string;
    children: React.ReactNode;
    delay?: number;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: "easeOut", delay }}
            className="rounded-xl border border-border bg-card p-5 shadow-sm"
        >
            <div className="mb-4">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            </div>
            {children}
        </motion.div>
    );
}

// Empty state for chart with no data
function EmptyChart({ label }: { label: string }) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-xs text-muted-foreground"
        >
            {label}
        </motion.div>
    );
}

// ---------------------------------------------------------------------------
// Chart 1 — Asset Carrying Value (stacked bar by category)
// ---------------------------------------------------------------------------

function AssetCarryingValueChart({ assets }: { assets: AssetDepreciationRecord[] }) {
    const data = useMemo(() => {
        const map: Record<
            string,
            { category: string; nbv: number; accumDepr: number; salvage: number }
        > = {};

        for (const a of assets) {
            const cat = a.asset_type ?? "Unassigned";
            if (!map[cat]) {
                map[cat] = { category: cat, nbv: 0, accumDepr: 0, salvage: 0 };
            }
            map[cat].nbv += a.net_book_value;
            map[cat].accumDepr += a.ending_accumulated_depreciation;
            map[cat].salvage += a.residual_value;
        }

        return Object.values(map).sort((a, b) => a.category.localeCompare(b.category));
    }, [assets]);

    if (data.length === 0) return <EmptyChart label="No asset data to display." />;

    return (
        <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                    dataKey="category"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                />
                <YAxis
                    tickFormatter={compactCurrency}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
                <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                />
                <Bar dataKey="accumDepr" name="Accumulated Depreciation" stackId="a" fill={COLORS.accumDepr} radius={[0, 0, 0, 0]} />
                <Bar dataKey="salvage" name="Salvage Value" stackId="a" fill={COLORS.salvage} radius={[0, 0, 0, 0]} />
                <Bar dataKey="nbv" name="Remaining NBV" stackId="a" fill={COLORS.nbv} radius={[4, 4, 0, 0]} />
            </BarChart>
        </ResponsiveContainer>
    );
}

// ---------------------------------------------------------------------------
// Chart 2 — Monthly Depreciation Trend (line, actual recorded only)
// ---------------------------------------------------------------------------

// Build monthly buckets from current_period_depreciation
// Since the API returns a single period's depreciation per asset, we use that
// as the "as-of period" data point. We cannot generate future months.
function MonthlyDepreciationTrendChart({ assets }: { assets: AssetDepreciationRecord[] }) {
    const data = useMemo(() => {
        // Group assets by depreciation_start_date month to plot actual data points
        // The API returns current_period_depreciation for the selected period window.
        // We represent this as a single data point for the current reporting period.
        const monthTotals: Record<string, number> = {};

        for (const a of assets) {
            if (!a.depreciation_start_date) continue;
            // Use depreciation_start_date month as the earliest possible start
            // We plot by the month of depreciation_start_date up through today
            // But since we only have period totals, show aggregate per start month
            const d = new Date(a.depreciation_start_date);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            monthTotals[key] = (monthTotals[key] ?? 0) + a.current_period_depreciation;
        }

        return Object.entries(monthTotals)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, total]) => {
                const [year, month] = key.split("-");
                const label = new Date(Number(year), Number(month) - 1).toLocaleString("en-PH", {
                    month: "short",
                    year: "numeric",
                });
                return { period: label, depreciation: total };
            });
    }, [assets]);

    if (data.length === 0) return <EmptyChart label="No recorded depreciation activity to display." />;

    return (
        <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                    dataKey="period"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                />
                <YAxis
                    tickFormatter={compactCurrency}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
                <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                />
                <Line
                    type="monotone"
                    dataKey="depreciation"
                    name="Period Depreciation"
                    stroke={COLORS.line}
                    strokeWidth={2}
                    dot={{ r: 4, fill: COLORS.line, strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                />
            </LineChart>
        </ResponsiveContainer>
    );
}

// ---------------------------------------------------------------------------
// Chart 3 — NBV by Asset Category (horizontal bar)
// ---------------------------------------------------------------------------

function NBVByCategoryChart({ assets }: { assets: AssetDepreciationRecord[] }) {
    const data = useMemo(() => {
        const map: Record<string, { category: string; nbv: number }> = {};
        for (const a of assets) {
            const cat = a.asset_type ?? "Unassigned";
            if (!map[cat]) map[cat] = { category: cat, nbv: 0 };
            map[cat].nbv += a.net_book_value;
        }
        return Object.values(map).sort((a, b) => b.nbv - a.nbv);
    }, [assets]);

    if (data.length === 0) return <EmptyChart label="No asset data to display." />;

    const barColors = [COLORS.nbv, COLORS.sl, COLORS.line, COLORS.uop];

    return (
        <ResponsiveContainer width="100%" height={260}>
            <BarChart
                layout="vertical"
                data={data}
                margin={{ top: 4, right: 32, left: 8, bottom: 4 }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                    type="number"
                    tickFormatter={compactCurrency}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                />
                <YAxis
                    type="category"
                    dataKey="category"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={100}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
                <Bar dataKey="nbv" name="Net Book Value" radius={[0, 4, 4, 0]}>
                    {data.map((_, i) => (
                        <Cell key={i} fill={barColors[i % barColors.length]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

// ---------------------------------------------------------------------------
// Chart 4 — Depreciation Method Mix (bar: depreciable base by method)
// ---------------------------------------------------------------------------

function DepreciationMethodMixChart({ assets }: { assets: AssetDepreciationRecord[] }) {
    const data = useMemo(() => {
        const map: Record<string, { method: string; depreciableBase: number; assetCount: number }> =
            {};

        for (const a of assets) {
            const method = a.depreciation_method ?? "Unknown";
            const base = Math.max(0, a.acquisition_cost - a.residual_value);
            if (!map[method]) map[method] = { method, depreciableBase: 0, assetCount: 0 };
            map[method].depreciableBase += base;
            map[method].assetCount += 1;
        }

        return Object.values(map).sort((a, b) => b.depreciableBase - a.depreciableBase);
    }, [assets]);

    if (data.length === 0) return <EmptyChart label="No asset data to display." />;

    const methodColors: Record<string, string> = {
        "Straight Line": COLORS.sl,
        "Units of Production": COLORS.uop,
    };

    return (
        <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                    dataKey="method"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                />
                <YAxis
                    tickFormatter={compactCurrency}
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted)/0.3)" }} />
                <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                />
                <Bar dataKey="depreciableBase" name="Depreciable Base" radius={[4, 4, 0, 0]}>
                    {data.map((entry, i) => (
                        <Cell
                            key={i}
                            fill={methodColors[entry.method] ?? COLORS.nbv}
                        />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}

// ---------------------------------------------------------------------------
// Main Analytics Tab
// ---------------------------------------------------------------------------

const containerVariants = {
    hidden: {},
    show: {
        transition: { staggerChildren: 0.08 },
    },
};

export default function DepreciationAnalyticsTab({
    assets,
    summary,
}: DepreciationAnalyticsTabProps) {
    const hasAssets = assets.length > 0;

    return (
        <motion.div
            key="analytics-tab"
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="space-y-4"
        >
            {/* Summary strip */}
            {summary && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex flex-wrap gap-4 rounded-xl border border-border bg-muted/40 px-5 py-3 text-xs"
                >
                    <span className="text-muted-foreground">
                        Assets:{" "}
                        <span className="font-semibold text-foreground">
                            {summary.total_assets_count}
                        </span>
                    </span>
                    <span className="text-muted-foreground">
                        Historical Cost:{" "}
                        <span className="font-semibold text-foreground">
                            {formatCurrency(summary.total_acquisition_cost)}
                        </span>
                    </span>
                    <span className="text-muted-foreground">
                        Accumulated Depreciation:{" "}
                        <span className="font-semibold text-foreground">
                            {formatCurrency(summary.total_ending_accum_depreciation)}
                        </span>
                    </span>
                    <span className="text-muted-foreground">
                        Net Book Value:{" "}
                        <span className="font-semibold text-foreground">
                            {formatCurrency(summary.total_net_book_value)}
                        </span>
                    </span>
                </motion.div>
            )}

            {!hasAssets ? (
                <EmptyChart label="No assets match the current filters. Adjust filters to see analytics." />
            ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <ChartCard
                        title="Asset Carrying Value"
                        subtitle="Accumulated depreciation vs. remaining NBV vs. salvage, grouped by asset category."
                        delay={0}
                    >
                        <AssetCarryingValueChart assets={assets} />
                    </ChartCard>

                    <ChartCard
                        title="Depreciation Activity by In-Service Cohort"
                        subtitle="Actual recorded period depreciation grouped by the month assets were placed in service."
                        delay={0.08}
                    >
                        <MonthlyDepreciationTrendChart assets={assets} />
                    </ChartCard>

                    <ChartCard
                        title="Net Book Value by Category"
                        subtitle="Remaining carrying value per asset category as of the selected reporting date."
                        delay={0.16}
                    >
                        <NBVByCategoryChart assets={assets} />
                    </ChartCard>

                    <ChartCard
                        title="Depreciation Method Mix"
                        subtitle="Depreciable base allocated to each depreciation method."
                        delay={0.24}
                    >
                        <DepreciationMethodMixChart assets={assets} />
                    </ChartCard>
                </div>
            )}
        </motion.div>
    );
}
