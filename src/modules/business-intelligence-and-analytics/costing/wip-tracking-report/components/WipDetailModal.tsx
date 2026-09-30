"use client";

import React from "react";
import { motion } from "framer-motion";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
    Layers, 
    PackageSearch, 
    CheckCircle2, 
    ShieldCheck, 
    User, 
    AlertTriangle,
    Building2,
    Calendar,
    Clock,
    Activity,
    History,
    TrendingUp,
    Gauge,
    Boxes
} from "lucide-react";
import { WipJobOrder, WipDetailTab } from "../types";

interface WipDetailModalProps {
    job: WipJobOrder | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activeTab: WipDetailTab;
    onTabChange: (tab: WipDetailTab) => void;
}

export function WipDetailModal({
    job,
    open,
    onOpenChange,
    activeTab,
    onTabChange
}: WipDetailModalProps) {
    if (!job) return null;

    const completedStages = job.stages.filter(
        (s) => s.status === "Completed" || s.status === "Done"
    ).length;
    const totalStages = job.stages.length;
    const progressPercent = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0;
    const totalMaterials = job.materials.length;
    const totalTransactions = job.transactions?.length || 0;

    // Target range calculation (0.9x to 1.1x)
    const minTarget = Math.round(job.target_quantity * 0.9);
    const maxTarget = Math.round(job.target_quantity * 1.1);

    // Sum of material WIP values
    const totalMaterialWipValue = job.materials.reduce((sum, m) => sum + (m.total_value || 0), 0);
    const totalMaterialWipQty = job.materials.reduce((sum, m) => sum + m.remaining_wip_quantity, 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[1380px] w-[96vw] h-[88vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden border border-border shadow-2xl">
                {/* Persistent Modal Header */}
                <DialogHeader className="p-5 pb-3 border-b border-border/80 bg-muted/20 shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-base font-extrabold text-foreground tracking-tight">
                                    {job.job_order_no}
                                </span>
                                <Badge
                                    variant="outline"
                                    className="text-xs px-2.5 py-0.5 font-medium capitalize bg-background"
                                >
                                    {job.status}
                                </Badge>
                                {job.is_delayed && (
                                    <Badge
                                        variant="destructive"
                                        className="text-xs px-2.5 py-0.5 gap-1 font-semibold"
                                    >
                                        <AlertTriangle className="h-3 w-3" />
                                        <span>Delayed / Behind</span>
                                    </Badge>
                                )}
                            </div>
                            <DialogTitle className="text-xl font-bold text-foreground">
                                {job.product_name}
                            </DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                                {job.product_code && (
                                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">
                                        {job.product_code}
                                    </span>
                                )}
                                <span className="flex items-center gap-1">
                                    <Building2 className="h-3.5 w-3.5" />
                                    {job.branch_name}
                                </span>
                                <span>•</span>
                                <span>Target: <strong className="text-foreground">{job.target_quantity.toLocaleString()} {job.uom_name}</strong></span>
                                {job.lot_number && (
                                    <>
                                        <span>•</span>
                                        <span className="font-mono">
                                            Lot: <strong className="text-foreground">{job.lot_number}</strong>
                                        </span>
                                    </>
                                )}
                                {job.shift_option && (
                                    <>
                                        <span>•</span>
                                        <span className="text-[11px] text-muted-foreground font-mono">
                                            Shift: <strong className="text-foreground">{job.shift_option}</strong>
                                        </span>
                                    </>
                                )}
                                {job.end_date && (
                                    <>
                                        <span>•</span>
                                        <span className="flex items-center gap-1 font-mono">
                                            <Clock className="h-3 w-3 text-muted-foreground" />
                                            Due: <strong className="text-foreground">{job.end_date}</strong>
                                        </span>
                                    </>
                                )}
                            </DialogDescription>
                        </div>

                        {/* Top KPI Summary Header Pills */}
                        <div className="flex items-center gap-3 bg-background/90 rounded-xl border border-border/80 p-2.5 shadow-xs shrink-0 font-mono text-xs">
                            <div>
                                <span className="text-muted-foreground block text-[10px] uppercase font-sans font-semibold">Current WIP</span>
                                <span className="font-bold text-foreground text-sm">
                                    {job.current_wip_quantity.toLocaleString()} {job.uom_name}
                                </span>
                            </div>
                            <div className="border-l border-border/70 pl-3">
                                <span className="text-muted-foreground block text-[10px] uppercase font-sans font-semibold">WIP Value</span>
                                <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                                    ₱{job.wip_value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                </span>
                            </div>
                            <div className="border-l border-border/70 pl-3">
                                <span className="text-muted-foreground block text-[10px] uppercase font-sans font-semibold">Attainment</span>
                                <span className="font-bold text-blue-600 dark:text-blue-400 text-sm">
                                    {job.rate_attainment_percent > 0 ? `${job.rate_attainment_percent}%` : "—"}
                                </span>
                            </div>
                            <div className="border-l border-border/70 pl-3">
                                <span className="text-muted-foreground block text-[10px] uppercase font-sans font-semibold">Yield</span>
                                <span className="font-bold text-cyan-600 dark:text-cyan-400 text-sm">
                                    {job.material_yield_percent}%
                                </span>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                {/* Tabs Container */}
                <Tabs
                    value={activeTab}
                    onValueChange={(val) => onTabChange(val as WipDetailTab)}
                    className="flex-1 flex flex-col overflow-hidden min-h-0"
                >
                    {/* Navigation Tab Bar */}
                    <div className="px-5 pt-3 pb-2 border-b border-border/60 bg-muted/10 shrink-0">
                        <TabsList className="bg-muted/60 p-1 h-10 gap-1 rounded-lg">
                            <TabsTrigger
                                value="overview"
                                className="h-8 gap-2 px-4 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
                            >
                                <Activity className="h-4 w-4 text-primary shrink-0" />
                                <span className="whitespace-nowrap">Overview</span>
                            </TabsTrigger>

                            <TabsTrigger
                                value="stages"
                                className="h-8 gap-2 px-4 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
                            >
                                <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                                <span className="whitespace-nowrap">Stage Routing</span>
                                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 font-mono shrink-0">
                                    {completedStages}/{totalStages}
                                </Badge>
                            </TabsTrigger>

                            <TabsTrigger
                                value="materials"
                                className="h-8 gap-2 px-4 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
                            >
                                <PackageSearch className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                                <span className="whitespace-nowrap">WIP Raw Materials</span>
                                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 font-mono shrink-0">
                                    {totalMaterials} items
                                </Badge>
                            </TabsTrigger>

                            <TabsTrigger
                                value="transactions"
                                className="h-8 gap-2 px-4 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
                            >
                                <History className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                <span className="whitespace-nowrap">Transactions</span>
                                {totalTransactions > 0 && (
                                    <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 font-mono shrink-0">
                                        {totalTransactions}
                                    </Badge>
                                )}
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* Tab 1: Overview (Media Image 1 Alignment) */}
                    <TabsContent value="overview" className="flex-1 overflow-y-auto p-5 space-y-5 m-0">
                        {/* Section Header */}
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Activity className="h-4 w-4 text-primary" />
                                    Continuous Production Run Overview
                                </h4>
                                <p className="text-[11px] text-muted-foreground">
                                    Key performance indicators, rate attainment, residence time, and mass balance.
                                </p>
                            </div>
                        </div>

                        {/* 4-Column Grid of Metric Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                            {/* Card 1: Branch */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Branch
                                </span>
                                <div className="mt-1 font-bold text-sm text-foreground flex items-center gap-1.5">
                                    <Building2 className="h-4 w-4 text-muted-foreground" />
                                    <span>{job.branch_name}</span>
                                </div>
                            </div>

                            {/* Card 2: Category / Product Code */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Category / Code
                                </span>
                                <div className="mt-1 font-bold text-sm text-foreground truncate" title={job.product_category || job.product_code || "—"}>
                                    {job.product_category || "Continuous Process"}
                                    {job.product_code && (
                                        <span className="ml-1.5 font-mono text-xs font-normal text-muted-foreground">
                                            ({job.product_code})
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Card 3: Lot Number */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Lot Number
                                </span>
                                <div className="mt-1 font-mono font-bold text-sm text-foreground">
                                    {job.lot_number || "—"}
                                </div>
                            </div>

                            {/* Card 4: Due Date */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Due Date
                                </span>
                                <div className="mt-1 flex items-center gap-2">
                                    <span className="font-mono font-bold text-sm text-foreground">
                                        {job.end_date || "—"}
                                    </span>
                                    {job.is_delayed && (
                                        <Badge variant="destructive" className="text-[9px] px-1.5 py-0 leading-none">
                                            Delayed
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            {/* Card 5: Current WIP */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Current WIP
                                </span>
                                <div className="mt-1 flex items-baseline justify-between gap-2">
                                    <span className="font-mono font-bold text-lg text-foreground">
                                        {job.current_wip_quantity.toLocaleString()} {job.uom_name}
                                    </span>
                                    <Badge
                                        variant="outline"
                                        className={`text-[10px] px-2 py-0 font-medium ${
                                            job.wip_level_status === "in_range"
                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                                : job.wip_level_status === "below_target"
                                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                                : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                                        }`}
                                    >
                                        {job.wip_level_status === "in_range"
                                            ? "In range"
                                            : job.wip_level_status === "below_target"
                                            ? "Below target"
                                            : "Above target"}
                                    </Badge>
                                </div>
                            </div>

                            {/* Card 6: Target Range */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Target Range
                                </span>
                                <div className="mt-1 font-mono font-bold text-sm text-foreground">
                                    {minTarget.toLocaleString()} – {maxTarget.toLocaleString()} {job.uom_name}
                                </div>
                                <span className="text-[10px] text-muted-foreground block mt-0.5">
                                    Target: {job.target_quantity.toLocaleString()} {job.uom_name}
                                </span>
                            </div>

                            {/* Card 7: Floor WIP Value */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Floor WIP Value
                                </span>
                                <div className="mt-1 font-mono font-bold text-lg text-emerald-600 dark:text-emerald-400">
                                    ₱{job.wip_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                            </div>

                            {/* Card 8: Residence Time */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Residence Time
                                </span>
                                <div className="mt-1 font-mono font-bold text-lg text-foreground">
                                    {job.residence_hours !== null && job.residence_hours > 0 ? `${job.residence_hours} h` : "—"}
                                </div>
                                <span className="text-[10px] text-muted-foreground block mt-0.5">
                                    Elapsed: {job.elapsed_hours > 0 ? `${job.elapsed_hours} h` : "—"}
                                </span>
                            </div>

                            {/* Card 9: Actual Throughput */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Throughput
                                </span>
                                <div className="mt-1 font-mono font-bold text-base text-foreground">
                                    {job.actual_throughput_rate > 0 ? `${job.actual_throughput_rate} ${job.uom_name}/h` : "—"}
                                </div>
                                <span className="text-[10px] text-muted-foreground block mt-0.5">
                                    vs Rated: {job.rated_capacity_per_hour > 0 ? `${job.rated_capacity_per_hour} ${job.uom_name}/h` : "—"}
                                </span>
                            </div>

                            {/* Card 10: Rated Capacity */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Rated Capacity
                                </span>
                                <div className="mt-1 font-mono font-bold text-base text-foreground">
                                    {job.rated_capacity_per_hour > 0 ? `${job.rated_capacity_per_hour} ${job.uom_name}/h` : "—"}
                                </div>
                            </div>

                            {/* Card 11: Rate Attainment */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Rate Attainment
                                </span>
                                <div className="mt-1 flex items-baseline gap-2">
                                    <span className="font-mono font-bold text-lg text-blue-600 dark:text-blue-400">
                                        {job.rate_attainment_percent > 0 ? `${job.rate_attainment_percent}%` : "—"}
                                    </span>
                                </div>
                                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/80">
                                    <div
                                        className="h-full rounded-full bg-blue-500 transition-all duration-300"
                                        style={{ width: `${Math.min(100, Math.max(0, job.rate_attainment_percent))}%` }}
                                    />
                                </div>
                            </div>

                            {/* Card 12: Stage Completion */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Stage Completion
                                </span>
                                <div className="mt-1 font-mono font-bold text-base text-foreground">
                                    {completedStages} / {totalStages} ({progressPercent}%)
                                </div>
                                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted/80">
                                    <div
                                        className="h-full rounded-full bg-primary transition-all duration-300"
                                        style={{ width: `${Math.min(100, progressPercent)}%` }}
                                    />
                                </div>
                            </div>

                            {/* Card 13: Raw Material Input */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Raw Material Input
                                </span>
                                <div className="mt-1 font-mono font-bold text-base text-foreground">
                                    {job.total_material_input.toLocaleString()} {job.uom_name}
                                </div>
                            </div>

                            {/* Card 14: Good Output */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Good Output
                                </span>
                                <div className="mt-1 font-mono font-bold text-base text-cyan-600 dark:text-cyan-400">
                                    {job.actual_quantity_produced.toLocaleString()} {job.uom_name}
                                </div>
                            </div>

                            {/* Card 15: Scrap / Loss */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Scrap / Trim Loss
                                </span>
                                <div className="mt-1 font-mono font-bold text-base text-foreground">
                                    {job.rejected_quantity > 0 ? `${job.rejected_quantity.toLocaleString()} ${job.uom_name}` : "—"}
                                </div>
                            </div>

                            {/* Card 16: Yield % */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Yield %
                                </span>
                                <div className="mt-1 font-mono font-bold text-lg text-emerald-600 dark:text-emerald-400">
                                    {job.material_yield_percent}%
                                </div>
                            </div>

                            {/* Card 17: Remaining Output */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Remaining Output
                                </span>
                                <div className="mt-1 font-mono font-bold text-base text-foreground">
                                    {job.remaining_output.toLocaleString()} {job.uom_name}
                                </div>
                            </div>

                            {/* Card 18: Hours to Finish */}
                            <div className="rounded-xl border border-border/70 bg-card p-3.5 shadow-xs">
                                <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider block">
                                    Hours to Finish
                                </span>
                                <div className="mt-1 font-mono font-bold text-base text-foreground">
                                    {job.hours_to_finish !== null ? `${job.hours_to_finish} h` : (job.remaining_output === 0 ? "Completed" : "—")}
                                </div>
                            </div>
                        </div>
                    </TabsContent>

                    {/* Tab 2: Stage Routing Table (Work Center column removed) */}
                    <TabsContent value="stages" className="flex-1 overflow-y-auto p-5 space-y-4 m-0">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                    Stage Routing Sequence
                                </h4>
                                <p className="text-[11px] text-muted-foreground">
                                    Continuous process operation progression, planned vs actual durations, and assigned personnel.
                                </p>
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                                Completion: <strong className="text-foreground">{completedStages} / {totalStages} ({progressPercent}%)</strong>
                            </div>
                        </div>

                        {job.stages.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border/80 p-12 text-center text-sm text-muted-foreground">
                                No routing stages configured for this job order.
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-xs">
                                <table className="w-full text-left text-xs border-collapse min-w-[850px]">
                                    <thead>
                                        <tr className="border-b border-border/70 bg-muted/60 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                            <th className="py-3 px-3.5 w-16 text-center">Step</th>
                                            <th className="py-3 px-3 min-w-[220px]">Operation</th>
                                            <th className="py-3 px-3 min-w-[130px]">Status</th>
                                            <th className="py-3 px-3 min-w-[110px] text-right">Planned</th>
                                            <th className="py-3 px-3 min-w-[150px]">Actual Start</th>
                                            <th className="py-3 px-3 min-w-[150px]">Actual End</th>
                                            <th className="py-3 px-3 min-w-[120px] text-right">Actual Duration</th>
                                            <th className="py-3 px-3 min-w-[180px]">Assigned Operators</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50 font-mono text-[11px]">
                                        {job.stages.map((stage, idx) => {
                                            const isCompleted = stage.status === "Completed" || stage.status === "Done";
                                            const isInProgress = stage.status === "In Progress" || stage.status === "Ongoing";
                                            const isQaHold = stage.status === "QA Hold";
                                            const hasOverrun = stage.total_planned_hours > 0 && stage.total_actual_hours > stage.total_planned_hours;

                                            return (
                                                <tr
                                                    key={stage.jo_route_id || idx}
                                                    className={`hover:bg-muted/30 transition-colors ${
                                                        isInProgress ? "bg-primary/5" : ""
                                                    }`}
                                                >
                                                    <td className="py-3 px-3.5 text-center font-bold text-foreground">
                                                        #{stage.sequence_order || idx + 1}
                                                    </td>
                                                    <td className="py-3 px-3 font-sans">
                                                        <div className="font-semibold text-foreground">
                                                            {stage.operation_name}
                                                        </div>
                                                        {stage.requires_qa && (
                                                            <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 mt-0.5">
                                                                <ShieldCheck className="h-3 w-3" /> QA Check Required
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="py-3 px-3">
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[10px] px-2 py-0.5 capitalize font-medium ${
                                                                isCompleted
                                                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                                                    : isInProgress
                                                                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 font-semibold"
                                                                    : isQaHold
                                                                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                                                    : "bg-muted text-muted-foreground border-border"
                                                            }`}
                                                        >
                                                            {stage.status}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-3 px-3 text-right">
                                                        {stage.total_planned_hours > 0 ? `${stage.total_planned_hours} h` : "—"}
                                                    </td>
                                                    <td className="py-3 px-3 text-muted-foreground">
                                                        {stage.total_actual_hours > 0 && job.production_started_at
                                                            ? job.production_started_at
                                                            : (isInProgress || isCompleted ? (job.production_started_at || "In progress") : "—")}
                                                    </td>
                                                    <td className="py-3 px-3 text-muted-foreground">
                                                        {isCompleted
                                                            ? (stage.completed_at || job.production_completed_at || "Completed")
                                                            : "—"}
                                                    </td>
                                                    <td className={`py-3 px-3 text-right font-bold ${
                                                        hasOverrun ? "text-rose-600 dark:text-rose-400" : "text-foreground"
                                                    }`}>
                                                        {stage.total_actual_hours > 0 ? `${stage.total_actual_hours} h` : "—"}
                                                    </td>
                                                    <td className="py-3 px-3 font-sans">
                                                        {stage.operators && stage.operators.length > 0 ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {stage.operators.map((op) => (
                                                                    <span
                                                                        key={op.id}
                                                                        className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono"
                                                                        title={`${op.operator_name} (${op.logged_hours}h)`}
                                                                    >
                                                                        <User className="h-2.5 w-2.5" />
                                                                        <span>{op.operator_name}</span>
                                                                        <strong className="text-foreground">({op.logged_hours}h)</strong>
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground italic text-[11px]">—</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </TabsContent>

                    {/* Tab 3: WIP Raw Materials Table */}
                    <TabsContent value="materials" className="flex-1 overflow-y-auto p-5 space-y-4 m-0">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <PackageSearch className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                                    Active Raw Materials in WIP Buffer
                                </h4>
                                <p className="text-[11px] text-muted-foreground">
                                    Share of recipe, current quantity held on shop floor, unit cost, and valuation.
                                </p>
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                                Total Floor Balance: <strong className="text-cyan-600 dark:text-cyan-400 font-bold">{totalMaterialWipQty.toLocaleString()} {job.uom_name}</strong>
                            </div>
                        </div>

                        {job.materials.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border/80 p-12 text-center text-sm text-muted-foreground">
                                No materials reserved or issued to WIP for this job order.
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-xs">
                                <table className="w-full text-left text-xs border-collapse min-w-[950px]">
                                    <thead>
                                        <tr className="border-b border-border/70 bg-muted/60 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                            <th className="py-3 px-3.5 min-w-[220px]">Material</th>
                                            <th className="py-3 px-3 min-w-[110px]">Code</th>
                                            <th className="py-3 px-3 min-w-[110px] text-right">Share %</th>
                                            <th className="py-3 px-3 min-w-[140px] text-right">Quantity in WIP</th>
                                            <th className="py-3 px-3 min-w-[120px] text-right">Unit Cost (₱)</th>
                                            <th className="py-3 px-3 min-w-[130px] text-right">Value (₱)</th>
                                            <th className="py-3 px-3 min-w-[140px]">Batch / Lot #</th>
                                            <th className="py-3 px-3 min-w-[100px] text-center">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50 font-mono text-[11px]">
                                        {job.materials.map((mat, idx) => {
                                            const hasWipBalance = mat.remaining_wip_quantity > 0;
                                            return (
                                                <tr 
                                                    key={mat.jo_materials_reservation_id || idx}
                                                    className={`hover:bg-muted/30 transition-colors ${
                                                        hasWipBalance ? "bg-cyan-500/5 font-medium" : ""
                                                    }`}
                                                >
                                                    <td className="py-2.5 px-3.5 font-sans">
                                                        <div className="font-semibold text-foreground">
                                                            {mat.product_name}
                                                        </div>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-muted-foreground">
                                                        {mat.product_code || "—"}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right">
                                                        <div className="flex items-center justify-end gap-1.5">
                                                            <span>{mat.share_percent ?? 0}%</span>
                                                            <div className="w-10 h-1 bg-muted rounded-full overflow-hidden">
                                                                <div 
                                                                    className="h-full bg-cyan-500 rounded-full"
                                                                    style={{ width: `${Math.min(100, mat.share_percent ?? 0)}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-bold text-foreground">
                                                        {mat.remaining_wip_quantity.toLocaleString()} {mat.uom_name}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right text-muted-foreground">
                                                        {mat.unit_cost !== undefined ? `₱${mat.unit_cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-bold text-emerald-600 dark:text-emerald-400">
                                                        {mat.total_value !== undefined ? `₱${mat.total_value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                                                    </td>
                                                    <td className="py-2.5 px-3">
                                                        {(!mat.batch_no && !mat.lot_name) ? (
                                                            <span className="text-muted-foreground italic">—</span>
                                                        ) : (
                                                            <div className="flex flex-col gap-0.5 items-start">
                                                                {mat.lot_name && (
                                                                    <span className="text-[10px] font-semibold text-foreground truncate max-w-[140px]" title={mat.lot_name}>
                                                                        {mat.lot_name}
                                                                    </span>
                                                                )}
                                                                {mat.batch_no && (
                                                                    <span className="text-[9px] text-muted-foreground truncate max-w-[140px]">
                                                                        Batch: {mat.batch_no}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center">
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[10px] px-1.5 py-0 capitalize font-medium bg-background"
                                                        >
                                                            {mat.reservation_status}
                                                        </Badge>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    {/* Footer summary matching floor WIP value */}
                                    <tfoot>
                                        <tr className="border-t-2 border-border/80 bg-muted/40 font-mono text-xs font-bold text-foreground">
                                            <td className="py-3 px-3.5 font-sans" colSpan={3}>
                                                Total Material WIP Floor Valuation
                                            </td>
                                            <td className="py-3 px-3 text-right font-bold text-cyan-600 dark:text-cyan-400">
                                                {totalMaterialWipQty.toLocaleString()} {job.uom_name}
                                            </td>
                                            <td className="py-3 px-3 text-right">—</td>
                                            <td className="py-3 px-3 text-right text-emerald-600 dark:text-emerald-400">
                                                ₱{totalMaterialWipValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="py-3 px-3" colSpan={2}></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </TabsContent>

                    {/* Tab 4: Transactions Table */}
                    <TabsContent value="transactions" className="flex-1 overflow-y-auto p-5 space-y-4 m-0">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <History className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                    Continuous WIP Stream Ledger & Movements
                                </h4>
                                <p className="text-[11px] text-muted-foreground">
                                    Audited material feeds, continuous stream yield receipts, scrap logs, and line state events.
                                </p>
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                                Total Events: <strong className="text-foreground">{totalTransactions}</strong>
                            </div>
                        </div>

                        {!job.transactions || job.transactions.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border/80 p-12 text-center text-sm text-muted-foreground">
                                No WIP event records logged yet for this production run.
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-border/70 bg-card shadow-xs">
                                <table className="w-full text-left text-xs border-collapse min-w-[850px]">
                                    <thead>
                                        <tr className="border-b border-border/70 bg-muted/60 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                            <th className="py-3 px-3.5 min-w-[150px]">Timestamp</th>
                                            <th className="py-3 px-3 min-w-[200px]">Transaction Type</th>
                                            <th className="py-3 px-3 min-w-[220px]">Material / Item</th>
                                            <th className="py-3 px-3 min-w-[130px]">Lot / Batch</th>
                                            <th className="py-3 px-3 min-w-[130px] text-right">Quantity</th>
                                            <th className="py-3 px-3 min-w-[200px]">Operator / Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50 font-mono text-[11px]">
                                        {job.transactions.map((tx, idx) => {
                                            const isYield = tx.type.toLowerCase().includes("yield") || tx.type.toLowerCase().includes("output");
                                            const isScrap = tx.type.toLowerCase().includes("scrap") || tx.type.toLowerCase().includes("loss");
                                            const isFeed = tx.type.toLowerCase().includes("feed") || tx.type.toLowerCase().includes("material");

                                            return (
                                                <tr
                                                    key={tx.id || idx}
                                                    className="hover:bg-muted/30 transition-colors"
                                                >
                                                    <td className="py-2.5 px-3.5 text-muted-foreground">
                                                        {tx.timestamp ? (
                                                            tx.timestamp.includes("T") ? tx.timestamp.replace("T", " ").substring(0, 19) : tx.timestamp
                                                        ) : "—"}
                                                    </td>
                                                    <td className="py-2.5 px-3 font-sans">
                                                        <Badge
                                                            variant="outline"
                                                            className={`text-[10px] px-2 py-0.5 font-medium ${
                                                                isYield
                                                                    ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30"
                                                                    : isScrap
                                                                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                                                                    : isFeed
                                                                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                                                                    : "bg-muted text-foreground border-border"
                                                            }`}
                                                        >
                                                            {tx.type}
                                                        </Badge>
                                                    </td>
                                                    <td className="py-2.5 px-3 font-sans">
                                                        <div className="font-semibold text-foreground">
                                                            {tx.material_name || "—"}
                                                        </div>
                                                        {tx.material_code && (
                                                            <div className="text-[10px] text-muted-foreground font-mono">
                                                                {tx.material_code}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-muted-foreground">
                                                        {tx.batch_no || "—"}
                                                    </td>
                                                    <td className={`py-2.5 px-3 text-right font-bold ${
                                                        isYield
                                                            ? "text-cyan-600 dark:text-cyan-400"
                                                            : isScrap
                                                            ? "text-rose-600 dark:text-rose-400"
                                                            : "text-foreground"
                                                    }`}>
                                                        {isYield ? "+" : isScrap ? "-" : ""}{tx.quantity.toLocaleString()} {tx.uom}
                                                    </td>
                                                    <td className="py-2.5 px-3 font-sans text-muted-foreground text-[11px]">
                                                        {tx.notes || tx.operator_name || "—"}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </TabsContent>
                </Tabs>

                {/* Persistent Footer */}
                <DialogFooter className="p-4 border-t border-border/80 bg-muted/20 flex flex-row items-center justify-between shrink-0">
                    <div className="text-xs text-muted-foreground font-mono">
                        Run ID: <strong className="text-foreground">{job.job_order_no}</strong> • Status: <strong className="capitalize text-foreground">{job.status}</strong>
                    </div>
                    <Button
                        variant="default"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        className="text-xs px-4"
                    >
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
