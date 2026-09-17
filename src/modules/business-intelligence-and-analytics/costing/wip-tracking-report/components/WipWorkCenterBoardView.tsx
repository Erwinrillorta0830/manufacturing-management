"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    Factory,
    PlayCircle,
    Clock,
    AlertTriangle,
    ArrowUpRight,
    Layers,
    PackageSearch
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { WorkCenterQueueSummary, WipJobOrder } from "../types";

interface WipWorkCenterBoardViewProps {
    queues: WorkCenterQueueSummary[];
    isLoading: boolean;
    onOpenDetail: (job: WipJobOrder, tab?: "stages" | "materials") => void;
}

export function WipWorkCenterBoardView({
    queues,
    isLoading,
    onOpenDetail
}: WipWorkCenterBoardViewProps) {
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-border/70 bg-card p-6 shadow-xs">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
                <span className="mt-3 text-xs font-medium text-muted-foreground">
                    Aggregating work center queues and line stage completions...
                </span>
            </div>
        );
    }

    if (queues.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-64 rounded-xl border border-dashed border-border/80 bg-card p-6 text-center shadow-xs">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted/60 text-muted-foreground mb-3">
                    <Factory className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-semibold text-foreground">No Work Center Queues Found</h3>
                <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                    There are currently no active production lines or work centers with queued jobs.
                </p>
            </div>
        );
    }

    const cardVariants = {
        hidden: { opacity: 0, y: 10 },
        visible: (idx: number) => ({
            opacity: 1,
            y: 0,
            transition: { delay: idx * 0.03, duration: 0.25 }
        })
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {queues.map((center, idx) => {
                const hasActiveJobs = center.jobs.length > 0;

                return (
                    <motion.div
                        key={center.work_center_id}
                        custom={idx}
                        initial="hidden"
                        animate="visible"
                        variants={cardVariants}
                        className={`flex flex-col justify-between rounded-xl border shadow-xs transition-all ${
                            hasActiveJobs
                                ? "bg-card border-border/80 hover:border-border"
                                : "bg-muted/10 border-border/50 opacity-70"
                        }`}
                    >
                        {/* Work Center Header */}
                        <div className="p-4 border-b border-border/60 bg-muted/20 rounded-t-xl">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
                                        <Factory className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-bold text-foreground truncate max-w-[200px]">
                                            {center.work_center_name}
                                        </h3>
                                        <span className="text-[11px] text-muted-foreground font-mono">
                                            Cap: {center.capacity_per_hour > 0 ? `${center.capacity_per_hour} units/hr` : "Standard"}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 font-mono text-xs">
                                    <Badge variant="outline" className="bg-background">
                                        {center.active_jobs_count} Jobs
                                    </Badge>
                                </div>
                            </div>

                            {/* Center Status Indicators */}
                            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/40 font-mono">
                                <span className="flex items-center gap-1">
                                    <PlayCircle className="h-3 w-3 text-blue-500" />
                                    <span>Running: <strong>{center.running_stages_count}</strong></span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3 text-amber-500" />
                                    <span>Queued: <strong>{center.pending_stages_count}</strong></span>
                                </span>
                            </div>
                        </div>

                        {/* Queued Jobs List */}
                        <div className="p-3 space-y-2.5 flex-1 overflow-y-auto max-h-[380px]">
                            {center.jobs.length === 0 ? (
                                <div className="py-8 text-center text-xs text-muted-foreground italic">
                                    No jobs scheduled on this line
                                </div>
                            ) : (
                                center.jobs.map((job) => {
                                    const currentStageOnCenter = job.stages.find(
                                        (s) => s.work_center_id === center.work_center_id
                                    );

                                    return (
                                        <div
                                            key={job.job_order_id}
                                            onClick={() => onOpenDetail(job, "stages")}
                                            className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-xs hover:border-primary/50 hover:shadow-sm transition-all space-y-2 cursor-pointer group"
                                        >
                                            <div className="flex items-start justify-between gap-1.5">
                                                <div>
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-mono text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                                                            {job.job_order_no}
                                                        </span>
                                                        {job.is_delayed && (
                                                            <span title="Delayed">
                                                                <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs font-medium text-foreground line-clamp-1">
                                                        {job.product_name}
                                                    </div>
                                                </div>

                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] px-1.5 py-0 capitalize shrink-0 font-medium"
                                                >
                                                    {job.status}
                                                </Badge>
                                            </div>

                                            {/* Stage on this center */}
                                            {currentStageOnCenter && (
                                                <div className="rounded-md bg-muted/40 p-2 text-xs flex items-center justify-between">
                                                    <div className="flex items-center gap-1.5 truncate">
                                                        <Layers className="h-3 w-3 text-primary shrink-0" />
                                                        <span className="font-semibold text-foreground truncate">
                                                            {currentStageOnCenter.operation_name}
                                                        </span>
                                                    </div>
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-[9px] px-1 py-0 capitalize"
                                                    >
                                                        {currentStageOnCenter.status}
                                                    </Badge>
                                                </div>
                                            )}

                                            {/* Overall Progress Bar */}
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                                                    <span>Stage Completion</span>
                                                    <span className="font-bold text-foreground">
                                                        {job.stage_progress_percent}%
                                                    </span>
                                                </div>
                                                <Progress value={job.stage_progress_percent} className="h-1.5" />
                                            </div>

                                            {/* Footer details & modal triggers */}
                                            <div className="flex items-center justify-between pt-1 border-t border-border/40 text-[10px] text-muted-foreground font-mono">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onOpenDetail(job, "materials");
                                                    }}
                                                    className="hover:text-foreground flex items-center gap-1"
                                                >
                                                    <PackageSearch className="h-3 w-3 text-cyan-600" />
                                                    <span>WIP: {job.total_wip_remaining_quantity}</span>
                                                </button>

                                                <div className="flex items-center gap-1.5 font-sans">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            onOpenDetail(job, "stages");
                                                        }}
                                                        className="h-6 px-1.5 text-[10px] text-primary hover:bg-primary/10"
                                                    >
                                                        Details
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        asChild
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                                                    >
                                                        <Link href="/mm/production">
                                                            <ArrowUpRight className="h-3 w-3" />
                                                        </Link>
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}
