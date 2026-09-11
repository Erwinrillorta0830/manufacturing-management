"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { JobOrderNextAction } from "../job-order-journey";

interface NextStepCalloutProps {
    action?: JobOrderNextAction | null;
    blockers?: string[];
    title?: string;
    className?: string;
    /** Handles in-page actions that have no href. */
    onAction?: () => void;
}

export function NextStepCallout({
    action = null,
    blockers = [],
    title = "Next step",
    className,
    onAction
}: NextStepCalloutProps) {
    const blockedReason = action?.blockedReason || null;
    const isBlocked = Boolean(blockedReason) || blockers.length > 0;

    if (!action && blockers.length === 0) {
        return (
            <div className={cn("flex items-center gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground", className)}>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                No action is required for this Job Order right now.
            </div>
        );
    }

    return (
        <div
            className={cn(
                "flex flex-col gap-2 rounded-lg border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
                isBlocked
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-primary/25 bg-primary/[0.04]",
                className
            )}
        >
            <div className="flex items-start gap-2 min-w-0">
                {isBlocked ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                ) : (
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                )}
                <div className="min-w-0 space-y-0.5">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
                    {action && <p className="text-xs font-semibold text-foreground">{action.label}</p>}
                    {action && <p className="text-[11px] text-muted-foreground">{action.description}</p>}
                    {blockedReason && <p className="text-[11px] font-medium text-amber-600">{blockedReason}</p>}
                    {blockers.map((blocker) => (
                        <p key={blocker} className="text-[11px] font-medium text-amber-600">
                            {blocker}
                        </p>
                    ))}
                </div>
            </div>

            {action && !isBlocked && (
                action.href ? (
                    <Button asChild size="sm" className="h-8 shrink-0 text-xs font-semibold">
                        <Link href={action.href}>
                            {action.label}
                            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Link>
                    </Button>
                ) : onAction ? (
                    <Button size="sm" onClick={onAction} className="h-8 shrink-0 text-xs font-semibold">
                        {action.label}
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Button>
                ) : null
            )}
        </div>
    );
}
