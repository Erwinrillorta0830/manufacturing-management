import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { displayJobOrderStatus, normalizeJobOrderStatus } from "../../job-order-status";
import { jobOrderStatusDescription } from "../job-order-journey";

const STATUS_STYLES: Record<string, string> = {
    Draft: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
    Planned: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
    Planning: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-400",
    Shortage: "bg-red-500/10 text-red-700 border-red-500/30 dark:text-red-400",
    Released: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400",
    Proceed: "bg-blue-500/10 text-blue-700 border-blue-500/30 dark:text-blue-400",
    Reserved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
    Ongoing: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
    "In Progress": "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
    "On Hold": "bg-orange-500/10 text-orange-700 border-orange-500/30 dark:text-orange-400",
    "QA Hold": "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-400",
    Finished: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-400",
    Completed: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400",
    Closed: "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-400",
    Cancelled: "bg-destructive/10 text-destructive border-destructive/30"
};

export function JobOrderStatusBadge({
    status,
    className,
    showDescription = true
}: {
    status?: string | null;
    className?: string;
    showDescription?: boolean;
}) {
    const normalized = normalizeJobOrderStatus(status);
    const style = (normalized && STATUS_STYLES[normalized]) || "bg-muted text-muted-foreground border-border";
    return (
        <Badge
            variant="outline"
            className={cn("text-[10px] font-semibold", style, className)}
            title={showDescription ? jobOrderStatusDescription(status) : undefined}
        >
            {displayJobOrderStatus(status)}
        </Badge>
    );
}
