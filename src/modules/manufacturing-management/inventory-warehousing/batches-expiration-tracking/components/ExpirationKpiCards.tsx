import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Clock, CalendarDays, ShieldAlert } from "lucide-react";
import { BatchExpirationKpis } from "../types";

interface ExpirationKpiCardsProps {
    kpis: BatchExpirationKpis;
    loading: boolean;
    onSelectStatusFilter?: (status: string) => void;
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

export default function ExpirationKpiCards({
    kpis,
    loading,
    onSelectStatusFilter,
}: ExpirationKpiCardsProps) {
    const cards = [
        {
            title: "EXPIRED",
            subtitle: "Quarantine & Write-Off",
            count: kpis.expired_count,
            value: kpis.expired_value,
            icon: ShieldAlert,
            colorScheme: {
                border: "border-rose-500/20 dark:border-rose-500/30",
                badgeBg: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
                iconColor: "text-rose-500",
                hoverBg: "hover:border-rose-500/40 hover:bg-rose-500/[0.02]",
                glow: "from-rose-500/5 to-transparent",
            },
            statusFilter: "EXPIRED",
        },
        {
            title: "CRITICAL (0–30 DAYS)",
            subtitle: "Month 1: Immediate FEFO",
            count: kpis.critical_count,
            value: kpis.critical_value,
            icon: AlertTriangle,
            colorScheme: {
                border: "border-orange-500/20 dark:border-orange-500/30",
                badgeBg: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
                iconColor: "text-orange-500",
                hoverBg: "hover:border-orange-500/40 hover:bg-orange-500/[0.02]",
                glow: "from-orange-500/5 to-transparent",
            },
            statusFilter: "CRITICAL",
        },
        {
            title: "1–3 MONTHS (31–90 DAYS)",
            subtitle: "Schedule in Monthly JO",
            count: kpis.warning_count ?? kpis.next_90_days_count,
            value: kpis.warning_value ?? kpis.next_90_days_value,
            icon: Clock,
            colorScheme: {
                border: "border-amber-500/20 dark:border-amber-500/30",
                badgeBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
                iconColor: "text-amber-500",
                hoverBg: "hover:border-amber-500/40 hover:bg-amber-500/[0.02]",
                glow: "from-amber-500/5 to-transparent",
            },
            statusFilter: "WARNING",
        },
        {
            title: "4–6 MONTHS (91–180 DAYS)",
            subtitle: "6-Month Planning Horizon",
            count: kpis.upcoming_count ?? 0,
            value: kpis.upcoming_value ?? 0,
            icon: CalendarDays,
            colorScheme: {
                border: "border-blue-500/20 dark:border-blue-500/30",
                badgeBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
                iconColor: "text-blue-500",
                hoverBg: "hover:border-blue-500/40 hover:bg-blue-500/[0.02]",
                glow: "from-blue-500/5 to-transparent",
            },
            statusFilter: "UPCOMING",
        },
    ];

    if (loading) {
        return (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[1, 2, 3, 4].map((i) => (
                    <div
                        key={i}
                        className="h-28 rounded-xl border border-border/60 bg-card p-4 animate-pulse space-y-3"
                    >
                        <div className="flex justify-between items-center">
                            <div className="h-3 w-24 bg-muted rounded" />
                            <div className="h-6 w-6 bg-muted rounded-full" />
                        </div>
                        <div className="h-6 w-20 bg-muted rounded" />
                        <div className="h-3 w-28 bg-muted rounded" />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card, idx) => {
                const IconComponent = card.icon;
                return (
                    <motion.div
                        key={card.title}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: idx * 0.05 }}
                        whileHover={{ y: -2 }}
                        onClick={() => onSelectStatusFilter?.(card.statusFilter)}
                        className={`relative cursor-pointer overflow-hidden rounded-xl border ${card.colorScheme.border} bg-card/90 p-4 shadow-sm backdrop-blur-sm transition-all duration-200 ${card.colorScheme.hoverBg}`}
                    >
                        {/* Subtle top glow gradient */}
                        <div
                            className={`pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${card.colorScheme.glow}`}
                        />

                        <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                                <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase">
                                    {card.title}
                                </span>
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black tracking-tight text-foreground">
                                        {card.count.toLocaleString()}
                                    </span>
                                    <span className="text-xs font-semibold text-muted-foreground">
                                        Batches
                                    </span>
                                </div>
                            </div>
                            <div
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${card.colorScheme.badgeBg}`}
                            >
                                <IconComponent className={`h-4.5 w-4.5 ${card.colorScheme.iconColor}`} />
                            </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2.5">
                            <span className="text-xs font-bold text-foreground">
                                {formatCurrency(card.value)}
                            </span>
                            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
                                {card.subtitle}
                            </span>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}
