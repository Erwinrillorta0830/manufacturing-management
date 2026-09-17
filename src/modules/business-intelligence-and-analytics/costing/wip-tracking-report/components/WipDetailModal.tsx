"use client";

import React from "react";
import Link from "next/link";
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
    Clock, 
    ShieldCheck, 
    User, 
    ExternalLink,
    AlertTriangle,
    Building2,
    Calendar
} from "lucide-react";
import { WipJobOrder } from "../types";

interface WipDetailModalProps {
    job: WipJobOrder | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    activeTab: "stages" | "materials";
    onTabChange: (tab: "stages" | "materials") => void;
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

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[1250px] w-[96vw] h-[88vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden border border-border shadow-2xl">
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
                                {job.shift_option && (
                                    <span className="text-[11px] text-muted-foreground font-mono">
                                        ({job.shift_option})
                                    </span>
                                )}
                            </DialogDescription>
                        </div>

                        {/* Top KPI Summary Pills */}
                        <div className="flex items-center gap-4 bg-background/90 rounded-xl border border-border/80 p-3 shadow-xs shrink-0 font-mono text-xs">
                            <div>
                                <span className="text-muted-foreground block text-[10px] uppercase font-sans font-semibold">Routing Progress</span>
                                <span className="font-bold text-foreground text-sm">
                                    {completedStages}/{totalStages} ({progressPercent}%)
                                </span>
                            </div>
                            <div className="border-l border-border/70 pl-3">
                                <span className="text-muted-foreground block text-[10px] uppercase font-sans font-semibold">Planned Hours</span>
                                <span className="font-bold text-foreground text-sm">
                                    {job.total_planned_hours}h
                                </span>
                            </div>
                            <div className="border-l border-border/70 pl-3">
                                <span className="text-muted-foreground block text-[10px] uppercase font-sans font-semibold">Actual Hours</span>
                                <span className={`font-bold text-sm ${job.total_actual_hours > job.total_planned_hours ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
                                    {job.total_actual_hours}h
                                </span>
                            </div>
                            <div className="border-l border-border/70 pl-3">
                                <span className="text-muted-foreground block text-[10px] uppercase font-sans font-semibold">Floor Volume</span>
                                <span className="font-bold text-cyan-600 dark:text-cyan-400 text-sm">
                                    {job.total_wip_remaining_quantity.toLocaleString()}
                                </span>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                {/* Tabs Container */}
                <Tabs
                    value={activeTab}
                    onValueChange={(val) => onTabChange(val as "stages" | "materials")}
                    className="flex-1 flex flex-col overflow-hidden min-h-0"
                >
                    {/* Navigation Tab Bar */}
                    <div className="px-5 pt-3 pb-2 border-b border-border/60 bg-muted/10 shrink-0">
                        <TabsList className="bg-muted/60 p-1 h-10 gap-1 rounded-lg">
                            <TabsTrigger
                                value="stages"
                                className="h-8 gap-2 px-4 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
                            >
                                <Layers className="h-4 w-4 text-primary shrink-0" />
                                <span className="whitespace-nowrap">Stages & Routing</span>
                                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 font-mono shrink-0">
                                    {completedStages}/{totalStages}
                                </Badge>
                            </TabsTrigger>

                            <TabsTrigger
                                value="materials"
                                className="h-8 gap-2 px-4 text-xs font-semibold whitespace-nowrap data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-xs"
                            >
                                <PackageSearch className="h-4 w-4 text-cyan-600 dark:text-cyan-400 shrink-0" />
                                <span className="whitespace-nowrap">Floor WIP Materials</span>
                                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0 font-mono shrink-0">
                                    {totalMaterials} items
                                </Badge>
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* Tab 1: Stages Timeline & Operations */}
                    <TabsContent value="stages" className="flex-1 overflow-y-auto p-5 space-y-4 m-0">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Layers className="h-4 w-4 text-primary" />
                                    Routing Steps & Work Center Progression
                                </h4>
                                <p className="text-[11px] text-muted-foreground">
                                    Detailed step-by-step cycle times, operation status, and shop floor operator hours.
                                </p>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
                                {job.start_date && (
                                    <span className="flex items-center gap-1">
                                        <Calendar className="h-3 w-3" />
                                        Start: <strong className="text-foreground">{job.start_date}</strong>
                                    </span>
                                )}
                                {job.end_date && (
                                    <span className="flex items-center gap-1">
                                        Due: <strong className="text-foreground">{job.end_date}</strong>
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Overall Progress Bar */}
                        <div className="h-2 w-full overflow-hidden rounded-full bg-muted/80">
                            <div
                                className="h-full rounded-full bg-primary transition-all duration-500"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>

                        {job.stages.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-border/80 p-12 text-center text-sm text-muted-foreground">
                                No routing stages configured for this job order.
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
                                {job.stages.map((stage, idx) => {
                                    const isCompleted = stage.status === "Completed" || stage.status === "Done";
                                    const isInProgress = stage.status === "In Progress" || stage.status === "Ongoing";
                                    const isQaHold = stage.status === "QA Hold";
                                    const hasOverrun = stage.total_planned_hours > 0 && stage.total_actual_hours > stage.total_planned_hours;

                                    return (
                                        <motion.div
                                            key={stage.jo_route_id || idx}
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.2, delay: idx * 0.03 }}
                                            className={`relative flex flex-col justify-between rounded-xl border p-4 transition-all ${
                                                isInProgress
                                                    ? "bg-primary/5 border-primary/40 shadow-xs ring-1 ring-primary/30"
                                                    : isCompleted
                                                    ? "bg-emerald-500/5 border-emerald-500/30"
                                                    : isQaHold
                                                    ? "bg-amber-500/5 border-amber-500/30"
                                                    : "bg-card border-border/70"
                                            }`}
                                        >
                                            <div className="space-y-3">
                                                {/* Stage Header */}
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex items-center gap-2">
                                                        <div
                                                            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                                                isCompleted
                                                                    ? "bg-emerald-500 text-white"
                                                                    : isInProgress
                                                                    ? "bg-primary text-primary-foreground animate-pulse"
                                                                    : isQaHold
                                                                    ? "bg-amber-500 text-white"
                                                                    : "bg-muted text-muted-foreground"
                                                            }`}
                                                        >
                                                            {isCompleted ? (
                                                                <CheckCircle2 className="h-4 w-4" />
                                                            ) : (
                                                                stage.sequence_order || idx + 1
                                                            )}
                                                        </div>
                                                        <span className="text-sm font-semibold text-foreground line-clamp-1">
                                                            {stage.operation_name}
                                                        </span>
                                                    </div>

                                                    <Badge
                                                        variant="outline"
                                                        className={`text-[11px] px-2 py-0.5 capitalize font-medium ${
                                                            isCompleted
                                                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                                                : isInProgress
                                                                ? "bg-primary/10 text-primary border-primary/30"
                                                                : isQaHold
                                                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                                                                : "bg-muted text-muted-foreground border-border"
                                                        }`}
                                                    >
                                                        {stage.status}
                                                    </Badge>
                                                </div>

                                                {/* Work Center */}
                                                <div className="text-xs font-medium text-muted-foreground">
                                                    Line / Center:{" "}
                                                    <span className="text-foreground font-semibold">
                                                        {stage.work_center_name}
                                                    </span>
                                                </div>

                                                {/* Hours Breakdown */}
                                                <div className="grid grid-cols-2 gap-2 rounded-lg bg-background/80 p-2.5 text-xs border border-border/50 font-mono">
                                                    <div>
                                                        <span className="text-muted-foreground block text-[10px] uppercase">Planned</span>
                                                        <span className="font-semibold text-foreground">
                                                            {stage.total_planned_hours}h
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground block">
                                                            ({stage.planned_setup_hours}s / {stage.planned_run_hours}r)
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="text-muted-foreground block text-[10px] uppercase">Actual</span>
                                                        <span className={`font-semibold ${hasOverrun ? "text-rose-600 dark:text-rose-400" : "text-foreground"}`}>
                                                            {stage.total_actual_hours}h
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground block">
                                                            ({stage.actual_setup_hours}s / {stage.actual_run_hours}r)
                                                        </span>
                                                    </div>
                                                </div>

                                                {stage.requires_qa && (
                                                    <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                                                        <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
                                                        <span>QA Inspection Required</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Assigned Operators Section */}
                                            <div className="mt-3 border-t border-border/50 pt-2.5">
                                                <div className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                                                    <User className="h-3.5 w-3.5 text-primary" />
                                                    <span>Assigned Operators ({stage.operators.length})</span>
                                                </div>
                                                {stage.operators.length > 0 ? (
                                                    <div className="space-y-1.5">
                                                        {stage.operators.map((op) => (
                                                            <div
                                                                key={op.id}
                                                                className="flex items-center justify-between rounded-md bg-muted/40 px-2.5 py-1 text-xs"
                                                            >
                                                                <div className="flex flex-col">
                                                                    <span className="font-semibold text-foreground">
                                                                        {op.operator_name}
                                                                    </span>
                                                                    {op.operator_position && (
                                                                        <span className="text-[10px] text-muted-foreground">
                                                                            {op.operator_position}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span className="font-mono text-[11px] bg-background border border-border/60 px-1.5 py-0.5 rounded font-medium">
                                                                    {op.logged_hours}h
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="text-xs text-muted-foreground italic py-0.5">
                                                        No operators logged for this stage
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}
                    </TabsContent>

                    {/* Tab 2: Floor WIP Materials */}
                    <TabsContent value="materials" className="flex-1 overflow-y-auto p-5 space-y-4 m-0">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <PackageSearch className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
                                    Active Raw Materials & Component Balances in WIP
                                </h4>
                                <p className="text-[11px] text-muted-foreground">
                                    Inventory staged, issued to shop floor, actual consumption, and remaining WIP volume.
                                </p>
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                                Total Floor Balance: <strong className="text-cyan-600 dark:text-cyan-400 font-bold">{job.total_wip_remaining_quantity.toLocaleString()} {job.uom_name}</strong>
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
                                            <th className="py-3 px-3.5 min-w-[220px]">Material Component</th>
                                            <th className="py-3 px-3 min-w-[120px]">Batch / Lot #</th>
                                            <th className="py-3 px-3 min-w-[140px]">Staging Bin</th>
                                            <th className="py-3 px-3 min-w-[100px] text-right">Reserved</th>
                                            <th className="py-3 px-3 min-w-[100px] text-right">Staged</th>
                                            <th className="py-3 px-3 min-w-[110px] text-right">Issued WIP</th>
                                            <th className="py-3 px-3 min-w-[100px] text-right">Used</th>
                                            <th className="py-3 px-3 min-w-[140px] text-right">Floor WIP Remaining</th>
                                            <th className="py-3 px-3 min-w-[110px] text-center">Status</th>
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
                                                        {mat.product_code && (
                                                            <div className="text-[10px] text-muted-foreground font-mono">
                                                                {mat.product_code}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-3">
                                                        {mat.batch_no ? (
                                                            <span className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                                                                {mat.batch_no}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground italic">—</span>
                                                        )}
                                                    </td>
                                                    <td className="py-2.5 px-3 font-sans">
                                                        {mat.staging_bin || <span className="text-muted-foreground italic">—</span>}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right text-muted-foreground">
                                                        {mat.reserved_quantity} {mat.uom_name}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right text-muted-foreground">
                                                        {mat.staged_quantity} {mat.uom_name}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right font-semibold text-foreground">
                                                        {mat.issued_to_wip_quantity} {mat.uom_name}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right text-muted-foreground">
                                                        {mat.actual_used_quantity} {mat.uom_name}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-right">
                                                        <span className={`inline-block px-2 py-0.5 rounded font-bold ${
                                                            hasWipBalance 
                                                                ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30" 
                                                                : "text-muted-foreground"
                                                        }`}>
                                                            {mat.remaining_wip_quantity} {mat.uom_name}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center font-sans">
                                                        <Badge
                                                            variant="outline"
                                                            className="text-[10px] px-2 py-0.5 capitalize font-medium"
                                                        >
                                                            {mat.reservation_status}
                                                        </Badge>
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

                {/* Footer */}
                <DialogFooter className="p-4 border-t border-border/80 bg-muted/20 flex flex-row items-center justify-between shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="text-xs gap-1.5"
                    >
                        <Link href="/mm/production">
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span>Open Shop Floor Execution</span>
                        </Link>
                    </Button>

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
