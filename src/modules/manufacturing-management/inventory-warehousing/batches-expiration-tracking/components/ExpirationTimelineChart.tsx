import React from "react";
import { motion } from "framer-motion";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import {
    AlertOctagon,
    AlertTriangle,
    Clock,
    Calendar,
    ShieldCheck,
    Building2,
    Layers,
    Flame,
    PieChart as PieChartIcon,
} from "lucide-react";
import { TimelineWindow, BatchExpirationItem } from "../types";
import { Badge } from "@/components/ui/badge";

interface ExpirationTimelineChartProps {
    timeline: TimelineWindow[];
    items: BatchExpirationItem[];
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

function getWindowIcon(id: string) {
    switch (id) {
        case "expired":
            return <AlertOctagon className="h-4 w-4 text-rose-500" />;
        case "critical":
            return <AlertTriangle className="h-4 w-4 text-orange-500" />;
        case "warning":
            return <Clock className="h-4 w-4 text-amber-500" />;
        case "upcoming":
            return <Calendar className="h-4 w-4 text-blue-500" />;
        case "safe":
        default:
            return <ShieldCheck className="h-4 w-4 text-emerald-500" />;
    }
}

function getRecommendedAction(id: string): { action: string; badgeVariant: "destructive" | "default" | "outline" | "secondary" } {
    switch (id) {
        case "expired":
            return { action: "Disposition: Quarantine & Write-off", badgeVariant: "destructive" };
        case "critical":
            return { action: "Priority 1: Immediate FEFO Staging (Month 1)", badgeVariant: "default" };
        case "warning":
            return { action: "Priority 2: Schedule in Monthly JO (Months 1–3)", badgeVariant: "secondary" };
        case "upcoming":
            return { action: "Priority 3: 6-Month FEFO Allocation Pipeline", badgeVariant: "outline" };
        case "safe":
        default:
            return { action: "Routine: Normal Storage Inward (> 6 Months)", badgeVariant: "outline" };
    }
}

interface CustomPieTooltipProps {
    active?: boolean;
    payload?: Array<{
        payload: {
            id: string;
            name: string;
            sublabel: string;
            value: number;
            count: number;
            color: string;
        };
    }>;
}

function CustomPieTooltip({ active, payload }: CustomPieTooltipProps) {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="rounded-lg border border-border/80 bg-popover/95 p-2.5 shadow-lg backdrop-blur-sm text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: data.color }} />
                    <span>{data.name}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">{data.sublabel}</div>
                <div className="pt-1 border-t border-border/50 flex items-center justify-between gap-3 text-[11px]">
                    <span className="font-semibold text-foreground">{data.count} batches</span>
                    <span className="font-mono font-bold text-foreground">{formatCurrency(data.value)}</span>
                </div>
            </div>
        );
    }
    return null;
}

export default function ExpirationTimelineChart({
    timeline,
    items,
}: ExpirationTimelineChartProps) {
    const totalExposure = timeline.reduce((acc, curr) => acc + curr.value, 0) || 1;
    const atRiskWindows = timeline.filter((w) => w.id !== "safe");
    const atRiskValue = atRiskWindows.reduce((acc, curr) => acc + curr.value, 0);
    const atRiskBatches = atRiskWindows.reduce((acc, curr) => acc + curr.count, 0);
    const safeWindow = timeline.find((w) => w.id === "safe");
    const safeValue = safeWindow?.value || 0;
    const safeBatches = safeWindow?.count || 0;

    const atRiskSharePct = totalExposure > 0 ? (atRiskValue / totalExposure) * 100 : 0;
    const safeSharePct = totalExposure > 0 ? (safeValue / totalExposure) * 100 : 0;

    const pieData = timeline
        .filter((w) => w.value > 0)
        .map((w) => ({
            id: w.id,
            name: w.label,
            sublabel: w.sublabel,
            value: w.value,
            count: w.count,
            color: w.color,
        }));

    // Branch breakdown for batches expiring within 180 days (6-month threshold)
    const branchExposureMap = new Map<string, { count: number; value: number; criticalCount: number }>();
    for (const item of items) {
        if (item.on_hand_quantity > 0 && item.days_remaining !== null && item.days_remaining <= 180) {
            const bName = item.branch_name || `Branch ${item.branch_id}`;
            const existing = branchExposureMap.get(bName) || { count: 0, value: 0, criticalCount: 0 };
            const isCritical = item.days_remaining <= 30;
            branchExposureMap.set(bName, {
                count: existing.count + 1,
                value: existing.value + item.inventory_value,
                criticalCount: existing.criticalCount + (isCritical ? 1 : 0),
            });
        }
    }

    const branchList = Array.from(branchExposureMap.entries()).sort(
        (a, b) => b[1].value - a[1].value
    );

    const total180DayBranchExposure = branchList.reduce((acc, curr) => acc + curr[1].value, 0) || 1;

    return (
        <div className="space-y-5">
            {/* Top Row: Dual Cards (1. Valuation Breakdown + 2. Portfolio Risk Donut) */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {/* 1. Inventory Value by Expiration Window */}
                <div className="rounded-xl border border-border/70 bg-card p-5 sm:p-6 shadow-sm space-y-4 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-extrabold text-foreground tracking-tight flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-primary" />
                                    Inventory Value by Expiration Window
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Cumulative financial liability categorized by shelf-life stages.
                                </p>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold block">Total Valuation</span>
                                <span className="font-mono text-sm sm:text-base font-black text-foreground">
                                    {formatCurrency(totalExposure)}
                                </span>
                            </div>
                        </div>

                        {/* Continuous Multi-Segment Portfolio Distribution Bar */}
                        <div className="space-y-1.5 mt-4">
                            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted/60 flex p-0.5 gap-0.5 border border-border/40 shadow-inner">
                                {timeline.map((w) => {
                                    const pct = (w.value / totalExposure) * 100;
                                    if (pct <= 0) return null;
                                    return (
                                        <motion.div
                                            key={w.id}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${pct}%` }}
                                            transition={{ duration: 0.6, ease: "easeOut" }}
                                            className={`h-full rounded-xs ${w.barColorClass} transition-opacity hover:opacity-85`}
                                            title={`${w.label}: ${formatCurrency(w.value)} (${pct.toFixed(1)}%)`}
                                        />
                                    );
                                })}
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px] text-muted-foreground pt-0.5">
                                {timeline.map((w) => (
                                    <div key={w.id} className="flex items-center gap-1">
                                        <div className={`h-2 w-2 rounded-full ${w.barColorClass}`} />
                                        <span className="font-medium text-foreground">{w.label}</span>
                                        <span className="font-mono">
                                            ({((w.value / totalExposure) * 100).toFixed(0)}%)
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Compact Window Breakdown Rows */}
                    <div className="space-y-2 pt-1">
                        {timeline.map((window, idx) => {
                            const pct = (window.value / totalExposure) * 100;
                            const actionInfo = getRecommendedAction(window.id);

                            return (
                                <motion.div
                                    key={window.id}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2, delay: idx * 0.03 }}
                                    className="flex items-center justify-between p-2.5 rounded-lg border border-border/60 bg-muted/15 hover:bg-muted/30 transition-all text-xs"
                                >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background border border-border/60">
                                            {getWindowIcon(window.id)}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <Badge
                                                    variant="outline"
                                                    className={`${window.borderClass} ${window.bgClass} ${window.textClass} text-[9px] font-bold uppercase px-1.5 py-0 leading-tight`}
                                                >
                                                    {window.label}
                                                </Badge>
                                                <span className="text-[11px] text-muted-foreground truncate">
                                                    {actionInfo.action}
                                                </span>
                                            </div>
                                            <div className="text-[10px] text-muted-foreground mt-0.5">
                                                <span className="font-semibold text-foreground">{window.count} batches</span>
                                                <span className="mx-1">•</span>
                                                <span>{window.sublabel}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-right shrink-0 pl-2">
                                        <div className="font-mono font-bold text-foreground text-xs">
                                            {formatCurrency(window.value)}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground">
                                            {pct.toFixed(1)}% share
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                {/* 2. Portfolio Risk Distribution (Donut & Risk Share Ratio) */}
                <div className="rounded-xl border border-border/70 bg-card p-5 sm:p-6 shadow-sm space-y-4 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-extrabold text-foreground tracking-tight flex items-center gap-2">
                                <PieChartIcon className="h-4 w-4 text-primary" />
                                Portfolio Risk Share &amp; Exposure
                            </h3>
                            <Badge variant="outline" className="text-[10px] font-semibold uppercase px-2 py-0.5">
                                6-Month Horizon
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Visual proportion comparing immediate 6-month liabilities vs safe buffer stock.
                        </p>
                    </div>

                    {/* Donut Chart with Centered Metric */}
                    <div className="relative flex items-center justify-center my-1">
                        <div className="h-[210px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={pieData}
                                        innerRadius={62}
                                        outerRadius={92}
                                        paddingAngle={3}
                                        dataKey="value"
                                        stroke="none"
                                    >
                                        {pieData.map((entry) => (
                                            <Cell key={entry.id} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip content={<CustomPieTooltip />} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>

                        {/* Centered Overlay */}
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                            <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                                At Risk
                            </span>
                            <span className="font-mono text-xl font-black text-rose-500">
                                {atRiskSharePct.toFixed(1)}%
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                                ≤ 180 Days
                            </span>
                        </div>
                    </div>

                    {/* Bottom Exposure Split Cards */}
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
                        {/* 6-Month Risk Exposure */}
                        <div className="rounded-lg border border-rose-500/25 bg-rose-500/5 p-3 space-y-1">
                            <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                                <Flame className="h-3.5 w-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">
                                    6-Mo Risk Pipeline
                                </span>
                            </div>
                            <div className="font-mono text-sm sm:text-base font-black text-rose-600 dark:text-rose-400">
                                {formatCurrency(atRiskValue)}
                            </div>
                            <div className="text-[10px] text-muted-foreground flex items-center justify-between">
                                <span>{atRiskBatches} batches</span>
                                <span className="font-semibold text-rose-500 font-mono">{atRiskSharePct.toFixed(1)}% share</span>
                            </div>
                        </div>

                        {/* Safe Stock */}
                        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-1">
                            <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                                <ShieldCheck className="h-3.5 w-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-wider">
                                    Safe Inventory
                                </span>
                            </div>
                            <div className="font-mono text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400">
                                {formatCurrency(safeValue)}
                            </div>
                            <div className="text-[10px] text-muted-foreground flex items-center justify-between">
                                <span>{safeBatches} batches</span>
                                <span className="font-semibold text-emerald-500 font-mono">{safeSharePct.toFixed(1)}% share</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2 & 3. Critical Threshold Milestones & Branch Risk Exposure */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {/* 2. Critical Threshold Milestones */}
                <div className="rounded-xl border border-border/70 bg-card p-5 sm:p-6 shadow-sm space-y-4 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Layers className="h-3.5 w-3.5 text-primary" />
                                Critical Threshold Milestones
                            </h4>
                            <span className="text-[11px] font-medium text-muted-foreground">
                                Action Directives
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Operational timeline stages requiring prompt plant manufacturing or logistics response.
                        </p>
                    </div>

                    {/* Stepper Pipeline Stage Cards */}
                    <div className="space-y-2.5">
                        {timeline.map((item, index) => {
                            const actionInfo = getRecommendedAction(item.id);
                            return (
                                <div
                                    key={item.id}
                                    className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors text-xs"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div
                                            className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black border ${item.borderClass} ${item.bgClass} ${item.textClass}`}
                                        >
                                            {index + 1}
                                        </div>
                                        <div>
                                            <div className="font-bold text-foreground flex items-center gap-1.5">
                                                {item.label}
                                                <span className="text-[10px] text-muted-foreground font-normal">
                                                    ({item.count} batches)
                                                </span>
                                            </div>
                                            <div className="text-[11px] text-muted-foreground">
                                                {actionInfo.action}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="font-mono font-bold text-foreground text-right">
                                        {formatCurrency(item.value)}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="pt-2 border-t border-border/40 text-[11px] text-muted-foreground flex items-center justify-between">
                        <span>Nearest-Expiry Priority: <strong>FEFO Enforced</strong></span>
                        <span className="text-primary font-semibold">Immediate Execution</span>
                    </div>
                </div>

                {/* 3. Branch Risk Exposure (Within 180 Days / 6 Months) */}
                <div className="rounded-xl border border-border/70 bg-card p-5 sm:p-6 shadow-sm space-y-4 flex flex-col justify-between">
                    <div>
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5 text-primary" />
                                Branch Risk Exposure (Within 180 Days / 6 Months)
                            </h4>
                            <span className="text-[11px] font-semibold text-rose-500 font-mono">
                                {formatCurrency(total180DayBranchExposure)}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Plant and warehouse locations ranked by near-term financial expiration liability.
                        </p>
                    </div>

                    {branchList.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 rounded-lg border border-dashed border-border text-center">
                            <ShieldCheck className="h-8 w-8 text-emerald-500 mb-2" />
                            <span className="text-xs font-semibold text-foreground">Zero Branch Liabilities</span>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                No inventory batches are expiring within the next 180 days across any branches.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[330px] overflow-y-auto pr-1">
                            {branchList.map(([bName, data], rankIdx) => {
                                const branchSharePct = (data.value / total180DayBranchExposure) * 100;
                                const isTopRisk = rankIdx === 0 && data.value > 0;

                                return (
                                    <div
                                        key={bName}
                                        className={`rounded-lg border p-3 transition-all space-y-2 ${
                                            isTopRisk
                                                ? "border-rose-500/40 bg-rose-500/5 shadow-xs"
                                                : "border-border/60 bg-muted/20 hover:bg-muted/40"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between text-xs">
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className={`flex h-5 w-5 items-center justify-center rounded font-mono text-[10px] font-bold ${
                                                        rankIdx === 0
                                                            ? "bg-rose-500 text-white"
                                                            : rankIdx === 1
                                                            ? "bg-orange-500 text-white"
                                                            : "bg-muted text-muted-foreground"
                                                    }`}
                                                >
                                                    #{rankIdx + 1}
                                                </div>
                                                <div>
                                                    <span className="font-bold text-foreground block">
                                                        {bName}
                                                    </span>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {data.count} expiring batches
                                                        {data.criticalCount > 0 && (
                                                            <span className="text-rose-500 font-bold ml-1">
                                                                ({data.criticalCount} critical)
                                                            </span>
                                                        )}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="text-right">
                                                <div className="font-mono font-bold text-foreground">
                                                    {formatCurrency(data.value)}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground">
                                                    {branchSharePct.toFixed(1)}% of 6-mo risk
                                                </div>
                                            </div>
                                        </div>

                                        {/* Branch Risk Progress Bar */}
                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.min(100, Math.max(branchSharePct, 2))}%` }}
                                                transition={{ duration: 0.5, delay: rankIdx * 0.06 }}
                                                className={`h-full rounded-full ${
                                                    isTopRisk ? "bg-rose-500" : "bg-primary/70"
                                                }`}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="pt-2 border-t border-border/40 text-[11px] text-muted-foreground flex items-center justify-between">
                        <span>Active Monitoring: <strong>{branchList.length} Branches</strong></span>
                        <span className="text-muted-foreground font-mono">Live On-Hand</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
