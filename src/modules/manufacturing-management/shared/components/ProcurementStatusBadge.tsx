import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { StatusTone } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

const STATUS_TONES: Record<string, StatusTone> = {
    Received: "success",
    Approved: "success",
    Completed: "success",
    Posted: "success",
    "Fully Received": "success",
    "For Approval": "warning",
    Requested: "warning",
    "Pending Payment": "warning",
    "Awaiting Payment": "warning",
    "For Pickup": "warning",
    "Force Received": "warning",
    "Partially Received": "info",
    "Receiving (QA)": "info",
    "Warehouse Receiving": "info",
    Ordered: "info",
    "In Progress": "info",
    Rejected: "destructive",
    Cancelled: "neutral"
};

const TONE_CLASSES: Record<StatusTone, string> = {
    neutral: "border bg-muted text-foreground",
    success: "border-transparent bg-success-bg text-success",
    warning: "border-transparent bg-warning-bg text-warning",
    info: "border-transparent bg-info-bg text-info",
    destructive: "border-transparent bg-destructive/10 text-destructive"
};

export function procurementStatusTone(status: string): StatusTone {
    return STATUS_TONES[status] ?? "neutral";
}

export function ProcurementStatusBadge({
    status,
    tone,
    icon: Icon,
    className
}: {
    status: string;
    tone?: StatusTone;
    icon?: LucideIcon;
    className?: string;
}) {
    return (
        <Badge
            className={cn(
                TONE_CLASSES[tone ?? procurementStatusTone(status)],
                "gap-1 text-[10px] font-extrabold uppercase tracking-wider",
                className
            )}
        >
            {Icon && <Icon className="h-3 w-3" aria-hidden="true" />}
            {status}
        </Badge>
    );
}
