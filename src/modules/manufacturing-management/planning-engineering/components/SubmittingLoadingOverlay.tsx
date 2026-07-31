"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Layers, Cpu, CheckCircle2, ShieldCheck } from "lucide-react";

interface SubmittingLoadingOverlayProps {
    isOpen: boolean;
    title?: string;
    description?: string;
}

export function SubmittingLoadingOverlay({
    isOpen,
    title = "Processing Job Order Release...",
    description = "Configuring targets, allocating FIFO stock, calculating lead times, and auto-spawning sub-assemblies."
}: SubmittingLoadingOverlayProps) {
    const [progress, setProgress] = useState(15);
    const [currentStepText, setCurrentStepText] = useState("Resolving product recipe versions...");

    useEffect(() => {
        if (!isOpen) {
            setProgress(15);
            setCurrentStepText("Resolving product recipe versions...");
            return;
        }

        const t1 = setTimeout(() => {
            setProgress(40);
            setCurrentStepText("Exploding BOM & verifying raw material stock levels...");
        }, 600);

        const t2 = setTimeout(() => {
            setProgress(70);
            setCurrentStepText("Reserving inventory lots & calculating route duration...");
        }, 1400);

        const t3 = setTimeout(() => {
            setProgress(90);
            setCurrentStepText("Auto-spawning child Job Orders for sub-assemblies...");
        }, 2200);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md transition-all duration-300 animate-in fade-in">
            <div className="bg-card text-card-foreground border border-border shadow-2xl rounded-2xl p-6 w-[90vw] max-w-lg space-y-5 relative overflow-hidden">
                {/* Background glow effects */}
                <div className="absolute -top-12 -right-12 w-32 h-32 bg-primary/20 rounded-full blur-2xl pointer-events-none" />
                <div className="absolute -bottom-12 -left-12 w-32 h-32 bg-sky-500/20 rounded-full blur-2xl pointer-events-none" />

                {/* Header Icon */}
                <div className="flex items-center gap-3">
                    <div className="relative p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary shrink-0">
                        <Cpu className="h-6 w-6 animate-pulse" />
                        <Loader2 className="h-4 w-4 animate-spin absolute -top-1 -right-1 text-sky-500" />
                    </div>
                    <div>
                        <h3 className="font-bold text-base text-foreground tracking-tight">{title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
                    </div>
                </div>

                {/* Progress Bar Container */}
                <div className="space-y-2 pt-1">
                    <div className="flex justify-between items-center text-xs font-semibold">
                        <span className="text-primary flex items-center gap-1.5 font-mono text-[11px] truncate">
                            <Layers className="h-3.5 w-3.5 text-sky-500 animate-bounce shrink-0" />
                            {currentStepText}
                        </span>
                        <span className="font-bold font-mono text-primary text-sm shrink-0 ml-2">{progress}%</span>
                    </div>

                    <div className="h-2.5 w-full bg-muted/60 rounded-full overflow-hidden p-0.5 border border-border/50">
                        <div
                            className="h-full bg-gradient-to-r from-sky-500 via-primary to-emerald-500 rounded-full transition-all duration-700 ease-out shadow-sm"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {/* Processing Steps Checklist */}
                <div className="grid grid-cols-2 gap-2 text-[10.5px] pt-1 border-t border-border/50 text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                        <CheckCircle2 className={`h-3.5 w-3.5 ${progress >= 30 ? "text-emerald-500" : "text-muted-foreground/40"}`} />
                        <span>BOM Explosion</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <CheckCircle2 className={`h-3.5 w-3.5 ${progress >= 60 ? "text-emerald-500" : "text-muted-foreground/40"}`} />
                        <span>FIFO Material Lock</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <CheckCircle2 className={`h-3.5 w-3.5 ${progress >= 80 ? "text-emerald-500" : "text-muted-foreground/40"}`} />
                        <span>Route Lead Times</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <ShieldCheck className={`h-3.5 w-3.5 ${progress >= 90 ? "text-emerald-500" : "text-muted-foreground/40"}`} />
                        <span>Sub-Assembly Spawner</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
