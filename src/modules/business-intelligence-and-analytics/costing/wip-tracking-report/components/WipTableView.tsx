"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    AlertTriangle,
    Layers,
    ChevronLeft,
    ChevronRight,
    ArrowUpRight,
    Building2
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WipJobOrder } from "../types";
import { JOB_ORDER_STATUS } from "../job-order-status";

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
                <div className="overflow-x-auto relative">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead className="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs border-b border-border/80 shadow-xs">
                            <tr className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                <th className="py-3 px-3.5 w-[180px] bg-muted/95 backdrop-blur-xs">Job Order & Location</th>
                                <th className="py-3 px-3.5 w-[220px] bg-muted/95 backdrop-blur-xs">Product</th>
                                <th className="py-3 px-3 w-[160px] bg-muted/95 backdrop-blur-xs">Status & Timeline</th>
                                <th className="py-3 px-3 w-[260px] bg-muted/95 backdrop-blur-xs">Current Stage & Progress</th>
                                <th className="py-3 px-3 w-[180px] bg-muted/95 backdrop-blur-xs">Production Output</th>
                                <th className="py-3 px-3.5 w-[120px] text-right bg-muted/95 backdrop-blur-xs">Actions</th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-border/50 font-sans">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={6} className="py-16 text-center text-muted-foreground">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                            <span className="text-xs">Loading active WIP jobs and stage queues...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedJobs.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-14 text-center text-muted-foreground">
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
                                            {/* 1. Job Order & Location */}
                                            <td className="py-3 px-3.5 align-top">
                                                <div className="space-y-0.5">
                                                    <span className="font-mono text-xs font-bold text-foreground block group-hover:text-primary transition-colors">
                                                        {job.job_order_no}
                                                    </span>
                                                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                                        <Building2 className="h-3 w-3 shrink-0" />
                                                        <span className="truncate">{job.branch_name}</span>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* 2. Product */}
                                            <td className="py-3 px-3.5 align-top">
                                                <div className="space-y-0.5">
                                                    <span className="text-xs font-semibold text-foreground block line-clamp-1" title={job.product_name}>
                                                        {job.product_name}
                                                    </span>
                                                    {job.product_code && (
                                                        <span className="font-mono text-[10px] text-muted-foreground block">
                                                            {job.product_code}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* 3. Status & Timeline */}
                                            <td className="py-3 px-3 align-top">
                                                <div className="space-y-1">
                                                    <div>{renderStatusBadge(job.status)}</div>
                                                    <div className="text-[11px] font-mono text-muted-foreground">
                                                        Due: <span className="text-foreground font-medium">{job.end_date || "—"}</span>
                                                    </div>
                                                    {job.is_delayed ? (
                                                        <div className="flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                                            <AlertTriangle className="h-3 w-3 shrink-0" />
                                                            <span>Delayed / Behind</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                                                            On Track
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* 4. Current Stage & Progress */}
                                            <td className="py-3 px-3 align-top">
                                                {job.current_stage ? (
                                                    <div className="space-y-1.5">
                                                        <div>
                                                            <span className="text-xs font-semibold text-foreground block line-clamp-1" title={job.current_stage.operation_name}>
                                                                {job.current_stage.operation_name}
                                                            </span>
                                                            <span className="text-[11px] text-muted-foreground block line-clamp-1">
                                                                Work Center: <span className="text-foreground/90">{job.current_stage.work_center_name || job.primary_work_center_name || "—"}</span>
                                                            </span>
                                                        </div>
                                                        <div
                                                            onClick={(e: React.MouseEvent) => {
                                                                e.stopPropagation();
                                                                onOpenDetail(job, "stages");
                                                            }}
                                                            className="w-full text-left space-y-1 group/bar hover:opacity-80 transition-opacity cursor-pointer"
                                                            title="Click to view stage details"
                                                        >
                                                            <div className="flex items-center justify-between text-[10px] font-mono">
                                                                <span className="text-muted-foreground">
                                                                    Step {job.completed_stages_count}/{job.total_stages}
                                                                </span>
                                                                <span className="font-bold text-foreground">
                                                                    {stageProgress}%
                                                                </span>
                                                            </div>
                                                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                                                <div
                                                                    className="h-full rounded-full bg-primary transition-all duration-300 group-hover/bar:bg-primary/80"
                                                                    style={{ width: `${stageProgress}%` }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1">
                                                        <span className="text-[11px] text-muted-foreground italic block">
                                                            No active stages
                                                        </span>
                                                        {job.total_stages > 0 && (
                                                            <div className="text-[10px] font-mono text-muted-foreground">
                                                                {job.completed_stages_count}/{job.total_stages} steps ({stageProgress}%)
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </td>

                                            {/* 5. Production Output */}
                                            <td className="py-3 px-3 align-bottom">
                                                <div className="space-y-1.5">
                                                    <div className="font-mono text-xs">
                                                        <strong className="font-bold text-foreground">
                                                            {job.actual_quantity_produced.toLocaleString()}
                                                        </strong>
                                                        <span className="text-muted-foreground"> / {job.target_quantity.toLocaleString()} {job.uom_name}</span>
                                                        <div className="flex items-center justify-end text-[10px] font-mono font-medium text-muted-foreground">
                                                            <span>{qtyProgress}% output</span>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                                            <div
                                                                className="h-full rounded-full bg-blue-600 dark:bg-blue-400 transition-all duration-300"
                                                                style={{ width: `${qtyProgress}%` }}
                                                            />
                                                        </div>

                                                    </div>
                                                </div>
                                            </td>

                                            {/* 6. Actions */}
                                            <td className="py-3 px-3.5 align-top text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={(e: React.MouseEvent) => {
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
                                                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                                        className="h-7 px-2 text-[11px] font-medium text-primary hover:text-primary hover:bg-primary/10 gap-0.5"
                                                    >
                                                        <Link href={`/mm/shop-floor-execution-terminal?id=${encodeURIComponent(job.job_order_id)}&jo=${encodeURIComponent(job.job_order_no)}`}>
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
                            className={`h-7 px-2.5 text-xs gap-1 ${page <= 1 ? "pointer-events-none opacity-40" : "cursor-pointer"
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
                                    className={`h-7 w-7 p-0 text-xs font-semibold cursor-pointer ${isCurrent
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
                            className={`h-7 px-2.5 text-xs gap-1 ${page >= totalPages ? "pointer-events-none opacity-40" : "cursor-pointer"
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
