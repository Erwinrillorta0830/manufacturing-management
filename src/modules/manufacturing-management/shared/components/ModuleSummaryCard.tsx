import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ModuleSummaryCard({
    icon: Icon,
    label,
    value,
    hint,
    className
}: {
    icon?: LucideIcon;
    label: string;
    value: ReactNode;
    hint?: string;
    className?: string;
}) {
    return (
        <div className={cn("flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm", className)}>
            {Icon && (
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
            )}
            <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                <p className="mt-1 break-words text-sm font-bold tabular-nums text-foreground">{value}</p>
                {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
            </div>
        </div>
    );
}
