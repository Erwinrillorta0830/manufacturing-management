import React from "react";

interface LotCapacityBarProps {
    currentStock: number;
    maxCapacity: number;
}

export default function LotCapacityBar({ currentStock, maxCapacity }: LotCapacityBarProps) {
    const utilization = maxCapacity > 0 ? Math.min((currentStock / maxCapacity) * 100, 100) : 0;

    let color = "hsl(var(--muted))";
    if (utilization >= 90) {
        color = "hsl(var(--destructive))";
    } else if (utilization >= 70) {
        color = "hsl(var(--warning))";
    } else if (utilization >= 30) {
        color = "hsl(var(--primary))";
    } else if (utilization > 0) {
        color = "hsl(var(--success))";
    }

    return (
        <div className="flex flex-col gap-1 w-full min-w-[120px]">
            <div className="bg-muted rounded-full h-2.5 w-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                        width: `${utilization}%`,
                        backgroundColor: color
                    }}
                />
            </div>
            <span className="text-xs text-muted-foreground font-medium">
                {utilization.toFixed(1)}%
            </span>
        </div>
    );
}
