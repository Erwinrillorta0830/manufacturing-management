"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { 
    AlertTriangle, 
    Layers, 
    Clock, 
    PackageSearch,
    ChevronLeft,
    ChevronRight,
    ArrowUpRight,
    Building2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WipJobOrder } from "../types";
import { JOB_ORDER_STATUS } from "@/modules/manufacturing-management/job-order-status";

interface WipTableViewProps {
    jobs: WipJobOrder[];
    isLoading: boolean;
    page: number;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
    onOpenDetail: (job: WipJobOrder, tab?: "stages" | "materials") => void;
}

export function WipTableView({
    jobs,
    isLoading,
    page,
    pageSize,
    onPageChange,
    onPageSizeChange,
    onOpenDetail
}: WipTableViewProps) {
    const totalJobs = jobs.length;
    const totalPages = Math.ceil(totalJobs / pageSize) || 1;
    const paginatedJobs = jobs.slice((page - 1) * pageSize, page * pageSize);

    // Status Badge Styler
    const renderStatusBadge = (status: string) => {
        switch (status) {
            case JOB_ORDER_STATUS.IN_PRODUCTION:
                return (
                    <Badge className="bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30 hover:bg-blue-500/20 font-semibold px-2 py-0.5 text-[11px]">
                        In Production
                    </Badge>
                );
            case JOB_ORDER_STATUS.PICKED:
                return (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20 font-semibold px-2 py-0.5 text-[11px]">
                        Staged (Ready)
                    </Badge>
                );
            case JOB_ORDER_STATUS.ON_HOLD:
                return (
                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20 font-semibold px-2 py-0.5 text-[11px]">
                        On Hold
                    </Badge>
                );
            case JOB_ORDER_STATUS.FOR_QA_RECONCILIATION:
                return (
                    <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 hover:bg-purple-500/20 font-semibold px-2 py-0.5 text-[11px]">
                        For QA & Reconciliation
                    </Badge>
                );
            case JOB_ORDER_STATUS.CLOSED:
                return (
                    <Badge className="bg-muted text-muted-foreground border-border font-semibold px-2 py-0.5 text-[11px]">
                        Closed
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline" className="capitalize font-semibold px-2 py-0.5 text-[11px]">
                        {status}
                    </Badge>
                );
        }
    };

    // Pagination numbers calculation
    const getPageNumbers = () => {
        const pages: (number | "ellipsis")[] = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (page > 3) {
                pages.push("ellipsis");
            }
            const start = Math.max(2, page - 1);
            const end = Math.min(totalPages - 1, page + 1);
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }
            if (page < totalPages - 2) {
                pages.push("ellipsis");
            }
            pages.push(totalPages);
        }
        return pages;
    };

    return (
        <div className="space-y-3">
            {/* Table Container */}
            <div className="rounded-xl border border-border/70 bg-card overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-border/70 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                <th className="py-3 px-3.5 w-[190px]">Job Order #</th>
                                <th className="py-3 px-3.5 w-[220px]">Finished Good Product</th>
                                <th className="py-3 px-3 w-[150px]">Status</th>
                                <th className="py-3 px-3 w-[200px]">Current Active Stage</th>
                                <th className="py-3 px-3 w-[130px]">Stage Progress</th>
                                <th className="py-3 px-3 w-[120px]">Produced vs Target</th>
                                <th className="py-3 px-3 w-[150px]">Floor WIP Materials</th>
                                <th className="py-3 px-3 w-[150px]">Schedule & Timing</th>
                                <th className="py-3 px-3.5 w-[110px] text-right">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-border/50 font-sans">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={9} className="py-16 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                            <span className="text-xs">Loading active WIP jobs and stage queues...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedJobs.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-14 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-1.5">
                                            <Layers className="h-8 w-8 text-muted-foreground/50 mb-1" />
                                            <p className="text-sm font-semibold text-foreground">No active WIP orders found</p>
                                            <p className="text-xs text-muted-foreground">
                                                Try adjusting your search criteria or resetting filters.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                paginatedJobs.map((job, idx) => {
                                    const stageProgress = job.stage_progress_percent;
                                    const qtyProgress = job.quantity_progress_percent;

                                    return (
                                        <motion.tr 
                                            key={job.job_order_id}
                                            initial={{ opacity: 0, y: -8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ duration: 0.2, delay: idx * 0.025 }}
                                            onClick={() => onOpenDetail(job, "stages")}
                                            className="hover:bg-muted/30 transition-colors group cursor-pointer"
                                        >
                                            {/* Job Order # */}
                                            <td className="py-3 px-3.5 align-top">
                                                <div className="space-y-0.5">
                                                    <span className="font-mono text-xs font-bold text-foreground block group-hover:text-primary transition-colors">
                                                        {job.job_order_no}
                                                    </span>
                                                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                        <Building2 className="h-3 w-3 shrink-0" />
                                                        <span className="truncate">{job.branch_name}</span>
                                                    </div>
                                                    {job.shift_option && (
                                                        <span className="text-[10px] text-muted-foreground/80 block font-mono">
                                                            {job.shift_option}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Finished Good Product */}
                                            <td className="py-3 px-3.5 align-top">
                                                <div className="space-y-0.5">
                                                    <span className="text-xs font-semibold text-foreground block line-clamp-1">
                                                        {job.product_name}
                                                    </span>
                                                    {job.product_code && (
                                                        <span className="font-mono text-[10px] text-muted-foreground block">
                                                            {job.product_code}
                                                        </span>
                                                    )}
                                                    {job.primary_work_center_name && (
                                                        <span className="text-[10px] text-primary/80 block line-clamp-1">
                                                            Line: {job.primary_work_center_name}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Status */}
                                            <td className="py-3 px-3 align-top">
                                                <div className="space-y-1">
                                                    {renderStatusBadge(job.status)}
                                                    {job.is_delayed && (
                                                        <div className="flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                                            <AlertTriangle className="h-3 w-3 shrink-0" />
                                                            <span>Delayed / Behind</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Current Active Stage */}
                                            <td className="py-3 px-3 align-top">
                                                {job.current_stage ? (
                                                    <div className="space-y-0.5">
                                                        <span className="text-xs font-semibold text-foreground block line-clamp-1">
                                                            {job.current_stage.operation_name}
                                                        </span>
                                                        <span className="text-[11px] text-muted-foreground block line-clamp-1">
                                                            {job.current_stage.work_center_name}
                                                        </span>
                                                        <span className="font-mono text-[10px] text-muted-foreground block">
                                                            {job.current_stage.total_actual_hours}h / {job.current_stage.total_planned_hours}h
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <span className="text-[11px] text-muted-foreground italic">
                                                        No active stages
                                                    </span>
                                                )}
                                            </td>

                                            {/* Stage Progress */}
                                            <td className="py-3 px-3 align-top">
                                                <div
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onOpenDetail(job, "stages");
                                                    }}
                                                    className="w-full text-left space-y-1 group/bar hover:opacity-80 transition-opacity"
                                                    title="Click to view stage details"
                                                >
                                                    <div className="flex items-center justify-between text-[11px]">
                                                        <span className="font-bold text-foreground font-mono">
                                                            {stageProgress}%
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground font-mono">
                                                            {job.completed_stages_count}/{job.total_stages} steps
                                                        </span>
                                                    </div>
                                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                                        <div
                                                            className="h-full rounded-full bg-primary transition-all duration-300 group-hover/bar:bg-primary/80"
                                                            style={{ width: `${stageProgress}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Produced vs Target */}
                                            <td className="py-3 px-3 align-top">
                                                <div className="space-y-1">
                                                    <div className="font-mono text-xs">
                                                        <strong className="font-bold text-foreground">
                                                            {job.actual_quantity_produced.toLocaleString()}
                                                        </strong>
                                                        <span className="text-muted-foreground"> / {job.target_quantity.toLocaleString()} {job.uom_name}</span>
                                                    </div>
                                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                                        <div
                                                            className="h-full rounded-full bg-blue-600 dark:bg-blue-400 transition-all duration-300"
                                                            style={{ width: `${qtyProgress}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Floor WIP Materials */}
                                            <td className="py-3 px-3 align-top">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onOpenDetail(job, "materials");
                                                    }}
                                                    className="inline-flex flex-col items-start rounded-lg border border-border/70 bg-muted/20 px-2 py-1 hover:bg-muted/40 transition-colors text-left"
                                                    title="Click to view floor materials"
                                                >
                                                    <div className="flex items-center gap-1 text-[11px] font-mono font-semibold text-foreground">
                                                        <PackageSearch className="h-3 w-3 text-cyan-600 dark:text-cyan-400 shrink-0" />
                                                        <span>{job.total_wip_remaining_quantity.toLocaleString()}</span>
                                                    </div>
                                                    <span className="text-[10px] text-muted-foreground">
                                                        {job.total_wip_materials_count} items on floor
                                                    </span>
                                                </button>
                                            </td>

                                            {/* Schedule & Timing */}
                                            <td className="py-3 px-3 align-top">
                                                <div className="space-y-0.5 text-[11px] font-mono">
                                                    {job.start_date && (
                                                        <div className="text-muted-foreground">
                                                            Start: <span className="text-foreground">{job.start_date}</span>
                                                        </div>
                                                    )}
                                                    {job.end_date && (
                                                        <div className="text-muted-foreground">
                                                            Due: <span className="text-foreground">{job.end_date}</span>
                                                        </div>
                                                    )}
                                                    {job.elapsed_hours > 0 && (
                                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                            <Clock className="h-2.5 w-2.5" />
                                                            Elapsed: {job.elapsed_hours}h
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td className="py-3 px-3.5 align-top text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onOpenDetail(job, "stages");
                                                        }}
                                                        className="h-7 px-2 text-[11px] font-medium border-border/80 hover:bg-muted/60"
                                                    >
                                                        Details
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        asChild
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="h-7 px-2 text-[11px] font-medium text-primary hover:text-primary hover:bg-primary/10 gap-0.5"
                                                    >
                                                        <Link href={`/mm/production-workflow?id=${encodeURIComponent(job.job_order_id)}&jo=${encodeURIComponent(job.job_order_no)}`}>
                                                            <span>Control</span>
                                                            <ArrowUpRight className="h-3 w-3" />
                                                        </Link>
                                                    </Button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1 py-1 text-xs text-muted-foreground">
                {/* Left side: showing 10(dropdown) of {wipjobordercount} */}
                <div className="flex items-center gap-1.5">
                    <span>Showing</span>
                    <select
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                        className="h-7 rounded-md border border-input bg-background px-2 py-0.5 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer"
                    >
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                    </select>
                    <span>of <strong className="font-semibold text-foreground font-mono">{totalJobs}</strong> active WIP job orders</span>
                </div>

                {/* Right side: < Previous ... 4 5 6 ... Next > */}
                {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                        {/* Previous Button */}
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => onPageChange(page - 1)}
                            className={`h-7 px-2.5 text-xs gap-1 ${
                                page <= 1 ? "pointer-events-none opacity-40" : "cursor-pointer"
                            }`}
                        >
                            <ChevronLeft className="h-3.5 w-3.5" />
                            <span>Previous</span>
                        </Button>

                        {/* Numbered Page Buttons & Ellipsis */}
                        {getPageNumbers().map((p, idx) => {
                            if (p === "ellipsis") {
                                return (
                                    <span 
                                        key={`ellipsis-${idx}`} 
                                        className="px-1.5 py-0.5 text-xs text-muted-foreground font-bold tracking-widest select-none"
                                    >
                                        ...
                                    </span>
                                );
                            }

                            const isCurrent = p === page;
                            return (
                                <Button
                                    key={p}
                                    variant={isCurrent ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => onPageChange(p)}
                                    className={`h-7 w-7 p-0 text-xs font-semibold cursor-pointer ${
                                        isCurrent 
                                            ? "bg-primary text-primary-foreground font-bold shadow-xs" 
                                            : "hover:bg-muted"
                                    }`}
                                >
                                    {p}
                                </Button>
                            );
                        })}

                        {/* Next Button */}
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= totalPages}
                            onClick={() => onPageChange(page + 1)}
                            className={`h-7 px-2.5 text-xs gap-1 ${
                                page >= totalPages ? "pointer-events-none opacity-40" : "cursor-pointer"
                            }`}
                        >
                            <span>Next</span>
                            <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
