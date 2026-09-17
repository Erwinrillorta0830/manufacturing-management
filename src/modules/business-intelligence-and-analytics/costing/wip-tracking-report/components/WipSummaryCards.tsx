"use client";

import React from "react";
import { motion } from "framer-motion";
import { 
    PlayCircle, 
    PauseCircle, 
    CheckCircle2, 
    ClipboardCheck, 
    AlertTriangle, 
    Layers, 
    TrendingUp, 
    PackageSearch 
} from "lucide-react";
import { WipSummaryMetrics, WipFilterState } from "../types";
import { JOB_ORDER_STATUS } from "@/modules/manufacturing-management/job-order-status";

interface WipSummaryCardsProps {
    summary: WipSummaryMetrics | null;
    filters: WipFilterState;
    onStatusClick: (statusValue: string) => void;
    onDelayedToggle: () => void;
}

export function WipSummaryCards({
    summary,
    filters,
    onStatusClick,
    onDelayedToggle
}: WipSummaryCardsProps) {
    if (!summary) return null;

    const cards = [
        {
            title: "Active WIP Orders",
            value: summary.total_active_jobs,
            subtitle: "Total active on shop floor",
            icon: Layers,
            iconColor: "text-primary",
            bgColor: "bg-primary/10",
            isActive: filters.status === "ALL_ACTIVE" && !filters.delayedOnly,
            onClick: () => onStatusClick("ALL_ACTIVE")
        },
        {
            title: "In Production",
            value: summary.jobs_in_production,
            subtitle: "Processing on active lines",
            icon: PlayCircle,
            iconColor: "text-blue-500 dark:text-blue-400",
            bgColor: "bg-blue-500/10",
            isActive: filters.status === JOB_ORDER_STATUS.IN_PRODUCTION && !filters.delayedOnly,
            onClick: () => onStatusClick(JOB_ORDER_STATUS.IN_PRODUCTION)
        },
        {
            title: "Staged / Picked Ready",
            value: summary.jobs_picked_ready,
            subtitle: "Materials staged for lines",
            icon: CheckCircle2,
            iconColor: "text-emerald-500 dark:text-emerald-400",
            bgColor: "bg-emerald-500/10",
            isActive: filters.status === JOB_ORDER_STATUS.PICKED && !filters.delayedOnly,
            onClick: () => onStatusClick(JOB_ORDER_STATUS.PICKED)
        },
        {
            title: "On Hold",
            value: summary.jobs_on_hold,
            subtitle: "Production paused",
            icon: PauseCircle,
            iconColor: "text-amber-500 dark:text-amber-400",
            bgColor: "bg-amber-500/10",
            isActive: filters.status === JOB_ORDER_STATUS.ON_HOLD && !filters.delayedOnly,
            onClick: () => onStatusClick(JOB_ORDER_STATUS.ON_HOLD)
        },
        {
            title: "For QA / Reconciliation",
            value: summary.jobs_in_qa,
            subtitle: "Quality check & closing",
            icon: ClipboardCheck,
            iconColor: "text-purple-500 dark:text-purple-400",
            bgColor: "bg-purple-500/10",
            isActive: filters.status === JOB_ORDER_STATUS.FOR_QA_RECONCILIATION && !filters.delayedOnly,
            onClick: () => onStatusClick(JOB_ORDER_STATUS.FOR_QA_RECONCILIATION)
        },
        {
            title: "Avg Stage Progress",
            value: `${summary.average_stage_progress_percent}%`,
            subtitle: "Average completion rate",
            icon: TrendingUp,
            iconColor: "text-teal-500 dark:text-teal-400",
            bgColor: "bg-teal-500/10",
            showProgress: true,
            progressPercent: summary.average_stage_progress_percent
        },
        {
            title: "Delayed / At Risk",
            value: summary.delayed_jobs_count,
            subtitle: "Past due or duration exceeded",
            icon: AlertTriangle,
            iconColor: "text-rose-500 dark:text-rose-400",
            bgColor: "bg-rose-500/10",
            isActive: filters.delayedOnly,
            onClick: onDelayedToggle
        },
        {
            title: "Floor WIP Volume",
            value: summary.total_wip_materials_volume.toLocaleString(),
            subtitle: "Raw materials in WIP",
            icon: PackageSearch,
            iconColor: "text-cyan-500 dark:text-cyan-400",
            bgColor: "bg-cyan-500/10"
        }
    ];

    return (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
            {cards.map((card, idx) => {
                const Icon = card.icon;
                const isClickable = Boolean(card.onClick);

                return (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: idx * 0.03 }}
                        onClick={card.onClick}
                        role={isClickable ? "button" : undefined}
                        tabIndex={isClickable ? 0 : undefined}
                        className={`group relative flex flex-col justify-between rounded-xl border p-3 transition-all duration-200 ${
                            card.isActive
                                ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-xs"
                                : "border-border/70 bg-card hover:border-border hover:shadow-xs"
                        } ${isClickable ? "cursor-pointer" : ""}`}
                    >
                        <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[11px] font-semibold text-muted-foreground line-clamp-1">
                                {card.title}
                            </span>
                            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${card.bgColor} ${card.iconColor}`}>
                                <Icon className="h-3.5 w-3.5" />
                            </div>
                        </div>

                        <div className="mt-1">
                            <div className="text-xl font-bold tracking-tight text-foreground font-mono">
                                {card.value}
                            </div>
                            <div className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                                {card.subtitle}
                            </div>
                        </div>

                        {card.showProgress && (
                            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full rounded-full bg-teal-500 transition-all duration-500"
                                    style={{ width: `${Math.min(100, Math.max(0, card.progressPercent || 0))}%` }}
                                />
                            </div>
                        )}
                    </motion.div>
                );
            })}
        </div>
    );
}
