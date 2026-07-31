import React from "react";
import { Activity } from "lucide-react";
import { DashboardData, ProductionRun } from "../types/dashboard.types";

interface OngoingProductionRunProps {
    data: DashboardData | null;
}

export function OngoingProductionRun({ data }: OngoingProductionRunProps) {
    if (!data?.ongoingProduction?.runs || data.ongoingProduction.runs.length === 0) {
        return null;
    }

    return (
        <div className="bg-card border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                    <h3 className="text-xs font-black text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                        <Activity className="h-4 w-4 text-primary animate-pulse" />
                        Ongoing Production Run Progress
                    </h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                        Real-time completion rates of active job orders compiled from shopfloor execution checklists.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-bold uppercase">Overall Completion:</span>
                    <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-black px-2.5 py-0.5 rounded-lg">
                        {data.ongoingProduction.overallPercentage}%
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.ongoingProduction.runs.map((run: ProductionRun) => (
                    <div key={run.jo_id} className="bg-slate-50 dark:bg-slate-950/20 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 hover:border-slate-200 dark:border-slate-800 transition-colors">
                        <div className="flex justify-between items-start gap-3">
                            <div className="space-y-0.5">
                                <span className="text-[10px] font-black text-primary uppercase tracking-wide">
                                    {run.jo_id}
                                </span>
                                <h4 className="text-xs font-bold text-foreground line-clamp-1 font-sans">
                                    {run.product_name}
                                </h4>
                            </div>
                            <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg border ${
                                    run.status === "Ongoing" 
                                        ? "bg-primary/10 border-primary/25 text-primary" 
                                        : run.status === "On Hold" 
                                            ? "bg-amber-500/10 border-amber-500/25 text-amber-500" 
                                            : "bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-muted-foreground"
                                }`}>
                                    {run.status}
                                </span>
                                {run.due_date && (
                                    <span className="text-[8px] text-muted-foreground font-semibold">
                                        Due: {run.due_date}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex justify-between items-center text-[10px]">
                                <span className="text-muted-foreground font-semibold">{run.progress_text}</span>
                                <span className="font-extrabold text-foreground">{run.percentage}%</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-200 dark:border-slate-800">
                                <div 
                                    className="bg-primary h-full rounded-full transition-all duration-500" 
                                    style={{ width: `${run.percentage}%` }}
                                />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
