import type { LotBalance } from "../services/lot-balance.service";
import { cn } from "@/lib/utils";

interface LotOccupancyIndicatorProps {
    balance: LotBalance | null | undefined;
    maxCapacity: number;
    uomLabel?: string;
    loading?: boolean;
    error?: string | null;
    isGhost?: boolean;
    className?: string;
}

function formatQuantity(value: number) {
    return value.toLocaleString();
}

export function LotOccupancyIndicator({
    balance,
    maxCapacity,
    uomLabel = "",
    loading = false,
    error = null,
    isGhost = false,
    className
}: LotOccupancyIndicatorProps) {
    if (error) {
        return (
            <div className={cn("mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-700 dark:text-amber-300", className)} role="status">
                Occupancy unavailable. {error}
            </div>
        );
    }

    if (loading || !balance) {
        return (
            <div className={cn("mt-3 space-y-1.5", className)} aria-live="polite" aria-busy="true">
                <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-muted-foreground">Loading occupancy...</span>
                    <span className="h-4 w-12 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
            </div>
        );
    }

    const capacity = Number(maxCapacity);
    const hasCapacity = Number.isFinite(capacity) && capacity > 0;
    const occupiedQuantity = balance.occupiedQuantity;
    const negativeQuantity = balance.negativeQuantity;
    const isNegative = negativeQuantity > 0;
    const isOverCapacity = hasCapacity && occupiedQuantity > capacity;
    const occupancyPercent = balance.occupancyPercent ?? 0;
    const progressPercent = Math.max(0, Math.min(100, occupancyPercent));

    let progressColorClass = "bg-emerald-500";
    let progressBadgeClass = "text-emerald-600 bg-emerald-500/10 border-emerald-500/20";
    if (isGhost) {
        progressColorClass = "bg-amber-500";
        progressBadgeClass = "text-amber-600 bg-amber-500/10 border-amber-500/20 font-bold";
    } else if (isNegative) {
        progressBadgeClass = "text-rose-600 bg-rose-500/15 border-rose-500/30 font-bold";
    } else if (isOverCapacity || occupancyPercent >= 90) {
        progressColorClass = "bg-rose-500";
        progressBadgeClass = "text-rose-600 bg-rose-500/10 border-rose-500/20";
    } else if (occupancyPercent >= 70) {
        progressColorClass = "bg-amber-500";
        progressBadgeClass = "text-amber-600 bg-amber-500/10 border-amber-500/20";
    }

    const capacityText = hasCapacity
        ? `${formatQuantity(capacity)} ${uomLabel}`
        : "Capacity not configured";
    const occupancyText = `${formatQuantity(occupiedQuantity)} / ${capacityText}`;
    const title = `Physical Occupancy: ${occupancyText}${isNegative ? ` (-${formatQuantity(negativeQuantity)} Shortfall)` : ""}`;

    return (
        <div className={cn("mt-3 space-y-1.5", className)}>
            <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 font-semibold text-muted-foreground">
                    Occupancy: <span className="font-mono font-bold text-foreground">{formatQuantity(occupiedQuantity)}</span> / {capacityText}
                    {isNegative && (
                        <span className="ml-1 font-bold text-rose-600 dark:text-rose-400">
                            (-{formatQuantity(negativeQuantity)} Shortfall)
                        </span>
                    )}
                </span>
                <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold", progressBadgeClass)}>
                    {isNegative ? "Shortfall" : !hasCapacity ? "Not configured" : `${occupancyPercent}%`}
                </span>
            </div>
            <div
                className="relative flex h-2 w-full overflow-hidden rounded-full bg-muted/60"
                title={title}
                aria-label={title}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={hasCapacity ? capacity : undefined}
                aria-valuenow={occupiedQuantity}
            >
                {occupiedQuantity > 0 && hasCapacity && (
                    <div
                        className={cn("h-full shrink-0 rounded-full transition-all duration-300", progressColorClass)}
                        style={{ width: `${progressPercent}%` }}
                        title={`Current Positive Stock: ${occupancyText} (${occupancyPercent}%)`}
                    />
                )}
            </div>
        </div>
    );
}
