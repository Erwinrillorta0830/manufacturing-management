"use client";

import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { JobOrderJourney } from "../job-order-journey";

interface JobOrderJourneyBarProps {
    journey: JobOrderJourney;
    /** Dots-only variant for dense rows and cards. */
    compact?: boolean;
    className?: string;
}

export function JobOrderJourneyBar({ journey, compact = false, className }: JobOrderJourneyBarProps) {
    if (journey.isCancelled) {
        return (
            <div
                className={cn("flex items-center gap-1.5 text-[10px] font-bold text-destructive", className)}
                title={journey.statusDescription}
            >
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
                Cancelled — no further action
            </div>
        );
    }

    const dots = (
        <div className="flex items-center gap-1">
            {journey.steps.map((step, index) => (
                <span key={step.id} className="flex items-center gap-1">
                    <span
                        title={`${step.label}: ${step.description}`}
                        className={cn(
                            "h-2 w-2 rounded-full border",
                            step.state === "complete" && "border-emerald-500 bg-emerald-500",
                            step.state === "current" && "border-primary bg-primary",
                            step.state === "upcoming" && "border-muted-foreground/40 bg-transparent"
                        )}
                    />
                    {index < journey.steps.length - 1 && <span className="h-px w-2 bg-border" />}
                </span>
            ))}
        </div>
    );

    if (compact) {
        return (
            <div className={cn("flex items-center gap-2", className)} title={journey.statusDescription}>
                {dots}
                <span className="text-[10px] font-semibold text-muted-foreground whitespace-nowrap">{journey.stageLabel}</span>
            </div>
        );
    }

    return (
        <div className={cn("flex flex-wrap items-center gap-1", className)} title={journey.statusDescription}>
            {journey.steps.map((step, index) => (
                <span key={step.id} className="flex items-center gap-1">
                    <span
                        title={step.description}
                        className={cn(
                            "flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap",
                            step.state === "complete" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
                            step.state === "current" && "border-primary/40 bg-primary/10 text-primary",
                            step.state === "exception" && "border-destructive/30 bg-destructive/10 text-destructive",
                            step.state === "upcoming" && "border-border bg-muted/40 text-muted-foreground"
                        )}
                    >
                        {step.state === "complete" ? (
                            <CheckCircle2 className="h-3 w-3" />
                        ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                        )}
                        {step.label}
                    </span>
                    {index < journey.steps.length - 1 && <span className="h-px w-2 bg-border sm:w-3" />}
                </span>
            ))}
        </div>
    );
}
