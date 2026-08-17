/* eslint-disable */
import React from "react";
import { Loader2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface FamilyGroup {
    familyId: string;
    parentJo: any;
    childJos: any[];
    isFamily: boolean;
}

export interface JOTableProps {
    unreleasedJobs: any[];
    familyGroups: FamilyGroup[];
    loadingJobs: boolean;
    handleOpenDetails: (jo: any) => void;
}

export function JOTable({
    unreleasedJobs,
    familyGroups,
    loadingJobs,
    handleOpenDetails
}: JOTableProps) {
    if (unreleasedJobs.length === 0) {
        return (
            <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                No unreleased (Draft or Planned) job orders found in this branch.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm text-left text-muted-foreground border-collapse">
                <thead className="text-xs uppercase bg-muted/40 font-bold border-b text-foreground">
                    <tr>
                        <th className="px-4 py-3">Job Order ID</th>
                        <th className="px-4 py-3">Product Name</th>
                        <th className="px-4 py-3 text-right">Target Qty</th>
                        <th className="px-4 py-3">Duration / Lead Time</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Remarks / Constraints</th>
                        <th className="px-4 py-3 text-center">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y text-foreground/90">
                    {familyGroups.map((fg) => {
                        const computeJoMetrics = (jo: any) => {
                            const tasks = jo.routing_tasks || [];
                            const shiftHrs = Number(jo.shiftOption || jo.shift_option || 8) || 8;
                            if (tasks.length === 0) {
                                return { leadTimeHours: 0, leadTimeDays: 0, cumulativeHours: 0, shiftHrs };
                            }
                            const totalSetup = tasks.reduce((sum: number, t: any) => sum + Number(t.planned_setup_hours || 0), 0);
                            const totalRun = tasks.reduce((sum: number, t: any) => sum + Number(t.planned_run_hours || 0), 0);
                            const cumulativeHours = totalSetup + totalRun;
                            const maxRun = Math.max(...tasks.map((t: any) => Number(t.planned_run_hours || 0)));
                            const initialSetup = Number(tasks[0]?.planned_setup_hours || 0);
                            const leadTimeHours = maxRun + initialSetup;
                            const leadTimeDays = leadTimeHours / shiftHrs;
                            return { leadTimeHours, leadTimeDays, cumulativeHours, shiftHrs };
                        };

                        if (!fg.isFamily) {
                            const jo = fg.parentJo;
                            const metrics = computeJoMetrics(jo);
                            return (
                                <tr key={jo.jo_id || jo.id} className="hover:bg-muted/10">
                                    <td className="px-4 py-3 font-semibold text-primary">{jo.jo_id}</td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-foreground">{jo.product_name}</span>
                                            <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md shrink-0">
                                                {jo.uom_name || jo.unit_of_measurement || "Pieces"}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold">
                                        {jo.quantity?.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">{jo.uom_name || jo.uom_shortcut || "pcs"}</span>
                                    </td>
                                    <td className="px-4 py-3 font-medium">
                                        {metrics.leadTimeHours > 0 ? (
                                            <div className="text-xs font-mono space-y-0.5">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-bold text-foreground text-[13px]">{metrics.leadTimeDays.toFixed(1)} days</span>
                                                    <span className="text-[10px] text-muted-foreground">({metrics.leadTimeHours.toFixed(1)} line hrs)</span>
                                                </div>
                                                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                    <span>Effort:</span>
                                                    <span className="font-semibold text-foreground/80">{metrics.cumulativeHours.toFixed(1)} mach-hrs</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                            jo.status === "Draft" 
                                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                                : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                        }`}>
                                            {jo.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs max-w-xs truncate text-muted-foreground" title={jo.remarks || ""}>
                                        {jo.remarks || "No planning constraints logged."}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleOpenDetails(jo)}
                                            className="border-primary/30 hover:border-primary text-primary hover:bg-primary/5 font-bold h-8 text-xs px-3 transition-all duration-200"
                                        >
                                            Manage / View Details
                                        </Button>
                                    </td>
                                </tr>
                            );
                        }

                        // Family pipelined lead time and cumulative workload
                        const pMetrics = computeJoMetrics(fg.parentJo);
                        const cMetricsList = fg.childJos.map((c: any) => computeJoMetrics(c));
                        const totalChildLeadTime = cMetricsList.reduce((sum: number, m: any) => sum + m.leadTimeHours, 0);
                        const totalChildCumulative = cMetricsList.reduce((sum: number, m: any) => sum + m.cumulativeHours, 0);

                        const totalFamilyLeadHours = pMetrics.leadTimeHours + totalChildLeadTime;
                        const totalFamilyLeadDays = totalFamilyLeadHours / pMetrics.shiftHrs;
                        const totalFamilyCumulative = pMetrics.cumulativeHours + totalChildCumulative;

                        return (
                            <React.Fragment key={`family-group-${fg.familyId}`}>
                                {/* Family Header Banner */}
                                <tr className="bg-sky-500/10 dark:bg-sky-950/40 border-t-2 border-b border-sky-500/30">
                                    <td colSpan={7} className="px-4 py-2.5">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 text-xs font-bold text-sky-700 dark:text-sky-300">
                                                <span className="bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                                                    <Layers className="h-3 w-3" /> Family JO Group
                                                </span>
                                                <span className="font-mono text-foreground font-extrabold">{fg.familyId}</span>
                                                <span className="text-[11px] text-muted-foreground font-medium">
                                                    ({1 + fg.childJos.length} Jobs in Family: 1 Parent Assembly + {fg.childJos.length} Sub-Assembly Runs)
                                                </span>
                                                {totalFamilyLeadHours > 0 && (
                                                    <span className="text-[11px] font-mono text-sky-700 dark:text-sky-300 bg-sky-500/15 px-2 py-0.5 rounded border border-sky-500/20 flex items-center gap-1.5">
                                                        <span>⏱️ Realistic Family Lead Time: <strong>{totalFamilyLeadDays.toFixed(1)} days</strong> ({totalFamilyLeadHours.toFixed(1)} line hrs)</span>
                                                        <span className="text-muted-foreground">•</span>
                                                        <span className="text-[10px] text-muted-foreground font-normal">Effort: {totalFamilyCumulative.toFixed(1)} mach-hrs</span>
                                                    </span>
                                                )}
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={() => handleOpenDetails(fg.parentJo)}
                                                className="h-7 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-sm px-3"
                                            >
                                                Manage Entire Family ({1 + fg.childJos.length} JOs)
                                            </Button>
                                        </div>
                                    </td>
                                </tr>

                                {/* Parent JO Row */}
                                <tr className="hover:bg-muted/10 bg-card/60">
                                    <td className="px-4 py-3 font-semibold text-primary flex items-center gap-2">
                                        <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded uppercase font-black shrink-0">
                                            📦 Parent JO
                                        </span>
                                        <span>{fg.parentJo.jo_id}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-foreground">{fg.parentJo.product_name}</span>
                                            <span className="text-[10px] font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-md shrink-0">
                                                {fg.parentJo.uom_name || fg.parentJo.unit_of_measurement || "Pieces"}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right font-semibold">
                                        {fg.parentJo.quantity?.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">{fg.parentJo.uom_name || fg.parentJo.uom_shortcut || "pcs"}</span>
                                    </td>
                                    <td className="px-4 py-3 font-medium">
                                        {pMetrics.leadTimeHours > 0 ? (
                                            <div className="text-xs font-mono space-y-0.5">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="font-bold text-foreground text-[13px]">{pMetrics.leadTimeDays.toFixed(1)} days</span>
                                                    <span className="text-[10px] text-muted-foreground">({pMetrics.leadTimeHours.toFixed(1)} line hrs)</span>
                                                </div>
                                                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                    <span>Effort:</span>
                                                    <span className="font-semibold text-foreground/80">{pMetrics.cumulativeHours.toFixed(1)} mach-hrs</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">—</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                            fg.parentJo.status === "Draft" 
                                                ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                                : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                        }`}>
                                            {fg.parentJo.status}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs max-w-xs truncate text-muted-foreground" title={fg.parentJo.remarks || ""}>
                                        {fg.parentJo.remarks || "No planning constraints logged."}
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleOpenDetails(fg.parentJo)}
                                            className="border-primary/30 hover:border-primary text-primary hover:bg-primary/5 font-bold h-8 text-xs px-3 transition-all duration-200"
                                        >
                                            Manage Family
                                        </Button>
                                    </td>
                                </tr>

                                {/* Child Sub-Assembly JO Rows */}
                                {fg.childJos.map((cJo: any) => {
                                    const cMetrics = computeJoMetrics(cJo);
                                    return (
                                        <tr key={cJo.jo_id} className="hover:bg-sky-500/5 bg-sky-500/[0.02]">
                                            <td className="px-4 py-3 font-semibold text-sky-600 dark:text-sky-400 pl-8 flex items-center gap-2">
                                                <span className="text-muted-foreground font-normal">↳</span>
                                                <span className="text-[9px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded uppercase font-black shrink-0">
                                                    🧩 Sub-Assembly
                                                </span>
                                                <span>{cJo.jo_id}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-medium text-foreground">{cJo.product_name}</span>
                                                    <span className="text-[10px] font-semibold text-sky-700 dark:text-sky-300 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-md shrink-0">
                                                        {cJo.uom_name || cJo.unit_of_measurement || "Pieces"}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-semibold">
                                                {cJo.quantity?.toLocaleString()} <span className="text-xs text-muted-foreground font-normal">{cJo.uom_name || cJo.uom_shortcut || "pcs"}</span>
                                            </td>
                                            <td className="px-4 py-3 font-medium">
                                                {cMetrics.leadTimeHours > 0 ? (
                                                    <div className="text-xs font-mono space-y-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-bold text-sky-700 dark:text-sky-300 text-[13px]">{cMetrics.leadTimeDays.toFixed(1)} days</span>
                                                            <span className="text-[10px] text-muted-foreground">({cMetrics.leadTimeHours.toFixed(1)} line hrs)</span>
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                            <span>Effort:</span>
                                                            <span className="font-semibold text-foreground/80">{cMetrics.cumulativeHours.toFixed(1)} mach-hrs</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                    cJo.status === "Draft" 
                                                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                                        : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                                }`}>
                                                    {cJo.status}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs max-w-xs truncate text-muted-foreground" title={cJo.remarks || ""}>
                                                {cJo.remarks || "Auto-spawned for sub-assembly shortfall."}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleOpenDetails(cJo)}
                                                    className="text-sky-600 hover:text-sky-700 hover:bg-sky-500/10 font-bold h-8 text-xs px-3 transition-all duration-200"
                                                >
                                                    View Details
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </React.Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
