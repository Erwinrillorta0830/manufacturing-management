"use client";

import React from "react";
import {
    AlertCircle,
    Calendar,
    ChevronRight,
    ClipboardCheck,
    MapPin,
    Tag,
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FinishedGoodsLotSelect } from "../../shared/FinishedGoodsLotSelect";
import type { DailyYieldAuditController } from "../hooks/useDailyYieldAudit";
import type { DailyYieldQALog, DailyYieldQAParameter } from "../types";

interface DailyYieldAuditDialogProps {
    controller: DailyYieldAuditController;
}

function numericText(value: unknown): string {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric.toLocaleString() : "0";
}

function isParameterFailed(parameter: DailyYieldQAParameter, value: string): boolean {
    if (!value) return false;
    if (parameter.test_type === "Numeric") {
        const numeric = Number(value);
        return Number.isFinite(numeric)
            && ((parameter.min_value !== null && numeric < Number(parameter.min_value))
                || (parameter.max_value !== null && numeric > Number(parameter.max_value)));
    }
    return ["Boolean", "Pass/Fail", "Yes/No"].includes(parameter.test_type || "")
        && ["Fail", "false", "No"].includes(value);
}

export function DailyYieldAuditDialog({ controller }: DailyYieldAuditDialogProps) {
    const yieldRecord = controller.selectedYield;
    const details = controller.selectedDetails;
    const requiresOutputTraceability = Number(yieldRecord?.goodQuantity || 0) > 0;

    return (
        <Dialog open={controller.isOpen} onOpenChange={(open) => open ? controller.setIsOpen(true) : controller.closeAudit()}>
            <DialogContent className="w-[calc(100vw-1rem)] max-w-none sm:max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-1rem)] overflow-hidden bg-background border border-border text-foreground flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-primary font-bold text-base">
                        <ClipboardCheck className="h-5 w-5" /> Record In-Process QA Audit
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground text-xs">
                        Record physicochemical specifications and sensory audits for {details?.jobOrderNo || "the selected Job Order"} ({yieldRecord?.shiftName || "shift not specified"}).
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={(event) => { event.preventDefault(); void controller.submitAudit(); }} className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2 text-sm scrollbar-thin">
                    <div className="border-b pb-2 mb-1 border-border">
                        <details className="group cursor-pointer">
                            <summary className="flex justify-between items-center text-foreground font-bold text-xs select-none">
                                <span>Operator Checklist Parameter Entries (Read-Only)</span>
                                <span className="text-[10px] text-primary group-open:hidden font-semibold">Show logs</span>
                                <span className="text-[10px] text-primary hidden group-open:inline font-semibold">Hide logs</span>
                            </summary>
                            <div className="mt-2 space-y-2">
                                {controller.matchingLogs.length === 0 ? (
                                    <div className="text-[10px] text-muted-foreground italic p-2 bg-muted/45 rounded-md border border-border">
                                        No matching operator checklist logs found for this shift.
                                    </div>
                                ) : (
                                    <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                                        {controller.matchingLogs.map((log: DailyYieldQALog, index: number) => {
                                            const task = typeof log.task_id === "object" ? log.task_id : null;
                                            return (
                                                <div key={log.id || index} className="p-2 bg-muted/50 border border-border rounded-md text-[10px] space-y-1">
                                                    <div className="flex justify-between items-center gap-2">
                                                        <span className="font-semibold text-foreground">{task?.operation_name || task?.name || "Routing Task"}</span>
                                                        <Badge variant={log.qa_status === "Passed" ? "secondary" : "destructive"} className="text-[10px] py-0 px-1 min-h-5 leading-none">
                                                            {log.qa_status || "Pending"}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-muted-foreground font-medium">{log.comments || "No comments recorded."}</p>
                                                    <div className="text-[10px] text-muted-foreground/80 font-mono">
                                                        Qty: Expected {numericText(log.expected_quantity)} | Actual {numericText(log.actual_quantity)} | Defect {numericText(log.deviation_quantity)}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </details>
                    </div>

                    <div className="bg-emerald-500/[0.015] dark:bg-emerald-500/[0.005] border border-emerald-500/20 rounded-xl p-4 space-y-4 shadow-sm">
                        <div className="flex items-center gap-2 pb-2 border-b border-emerald-500/10">
                            <div className="p-1.5 bg-emerald-500/10 rounded-lg text-emerald-600 dark:text-emerald-400">
                                <Tag className="h-4 w-4" />
                            </div>
                            <div>
                                <h4 className="font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider text-[10px]">
                                    Batch &amp; Lot Traceability Log (WIP Output)
                                </h4>
                                <p className="text-[9px] text-muted-foreground mt-0.5">
                                    Assign finished-goods identity before authorizing this in-process QA result.
                                </p>
                            </div>
                        </div>

                        {requiresOutputTraceability && controller.dailyOutputLotsError && (
                            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive flex items-start gap-2 text-xs" role="alert">
                                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                <div className="space-y-2">
                                    <p className="font-semibold">Finished-goods storage lots are unavailable.</p>
                                    <p>{controller.dailyOutputLotsError}</p>
                                </div>
                            </div>
                        )}

                        {controller.referenceError && (
                            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-700 dark:text-amber-300 text-xs" role="alert">
                                {controller.referenceError}
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="daily-yield-output-batch" className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]">
                                    <Tag className="h-3.5 w-3.5 text-emerald-500" /> Output Batch / Lot No <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="daily-yield-output-batch"
                                    type="text"
                                    maxLength={100}
                                    value={controller.dailyOutputBatchNo}
                                    onChange={(event) => controller.setDailyOutputBatchNo(event.target.value)}
                                    className="h-10 rounded-xl bg-background border-border/80 text-foreground text-xs font-bold font-mono"
                                    placeholder="e.g. JO-2026-YLD-001"
                                    disabled={controller.actionLoading || !requiresOutputTraceability}
                                    required={requiresOutputTraceability}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="daily-yield-storage-lot" className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]">
                                    <MapPin className="h-3.5 w-3.5 text-emerald-500" /> Storage Lot <span className="text-destructive">*</span>
                                </Label>
                                <FinishedGoodsLotSelect
                                    lots={controller.dailyOutputEligibleLots}
                                    value={controller.dailyOutputMmLotId}
                                    onValueChange={controller.setDailyOutputMmLotId}
                                    loading={controller.dailyOutputLotsLoading}
                                    disabled={controller.actionLoading || !requiresOutputTraceability}
                                    placeholder="Select storage lot..."
                                    className="h-10 w-full justify-between rounded-xl border-border/80 text-xs font-semibold"
                                    showBatchSummary
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="daily-yield-manufacturing-date" className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]">
                                    <Calendar className="h-3.5 w-3.5 text-emerald-500" /> Manufacturing Date <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="daily-yield-manufacturing-date"
                                    type="date"
                                    value={controller.dailyOutputManufacturingDate}
                                    onChange={(event) => controller.setDailyOutputManufacturingDate(event.target.value)}
                                    className="h-10 rounded-xl bg-background border-border/80 text-foreground text-xs"
                                    disabled={controller.actionLoading || !requiresOutputTraceability}
                                    required={requiresOutputTraceability}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="daily-yield-expiry-date" className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]">
                                    <Calendar className="h-3.5 w-3.5 text-emerald-500" /> Expiry Date <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="daily-yield-expiry-date"
                                    type="date"
                                    value={controller.dailyOutputExpiryDate}
                                    onChange={(event) => controller.setDailyOutputExpiryDate(event.target.value)}
                                    className="h-10 rounded-xl bg-background border-border/80 text-foreground text-xs"
                                    disabled={controller.actionLoading || !requiresOutputTraceability}
                                    required={requiresOutputTraceability}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2 border-b pb-2 mb-1 border-border">
                        <Label className="text-foreground font-bold text-[12px] block border-b pb-1">
                            Daily Quality Control Sheet (All Routing Steps)
                        </Label>
                        <div className="flex flex-wrap items-center gap-1.5 p-2 bg-muted/20 border border-border rounded-xl text-[10px] font-bold">
                            {controller.routes.length > 0 ? controller.routes.map((route, index) => {
                                const audited = controller.selectedYield?.audits.some((audit) => Number(audit.jo_route_id) === route.id);
                                return (
                                    <React.Fragment key={route.id}>
                                        <button
                                            type="button"
                                            className={`flex items-center gap-1 px-2 py-0.5 rounded-md border ${audited ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}
                                            onClick={() => controller.setSelectedRouteId(route.id)}
                                        >
                                            <span>{route.sequenceOrder}. {route.name}</span>
                                        </button>
                                        {index < controller.routes.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />}
                                    </React.Fragment>
                                );
                            }) : (
                                <span className="text-amber-400">General daily yield audit</span>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[360px] overflow-y-auto pr-1 scrollbar-thin">
                            {controller.routes.length > 0 ? controller.routes.map((route) => {
                                const template = controller.qaTemplates.find((item) => Number(item.template_id ?? item.id) === Number(route.qaTemplateId));
                                const parameters = Array.isArray(template?.parameters) ? template.parameters : [];
                                const audited = controller.selectedYield?.audits.some((audit) => Number(audit.jo_route_id) === route.id);
                                return (
                                    <div key={route.id} className="space-y-1.5 p-2 sm:p-2.5 border border-border rounded-xl bg-muted/10">
                                        <div className="flex justify-between items-center border-b pb-1 border-border/60 gap-2">
                                            <span className="font-bold text-foreground text-xs">Step {route.sequenceOrder}: {route.name}</span>
                                            <Badge variant="secondary" className={audited ? "text-[10px] py-0 px-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "text-[10px] py-0 px-1 border-amber-500/30 text-amber-400"}>
                                                {audited ? "Audited" : "Pending"}
                                            </Badge>
                                        </div>
                                        {parameters.length > 0 ? parameters.map((parameter) => {
                                            const value = controller.qaParamValues[parameter.parameter_id] || "";
                                            const failed = isParameterFailed(parameter, value);
                                            return (
                                                <div key={parameter.parameter_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-1.5 border-b border-border/40 last:border-b-0">
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-foreground/90 text-[11px] flex items-center gap-1">
                                                            {parameter.test_name}
                                                            {parameter.is_critical && <span className="bg-red-500/10 text-red-500 text-[10px] font-bold px-1 py-0.5 rounded border border-red-500/20">CRITICAL</span>}
                                                        </span>
                                                        {parameter.test_type === "Numeric" && <span className="text-[10px] text-muted-foreground font-medium">Limit: [{parameter.min_value ?? "-∞"} – {parameter.max_value ?? "+∞"}]</span>}
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {value && <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${failed ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>{failed ? "FAIL" : "PASS"}</span>}
                                                        {["Boolean", "Pass/Fail", "Yes/No"].includes(parameter.test_type || "") ? (
                                                            <div className="flex gap-2.5 text-[10px]">
                                                                <label className="flex items-center gap-1 cursor-pointer text-foreground"><input type="radio" name={`daily-yield-param-${parameter.parameter_id}`} checked={value === "Pass"} onChange={() => controller.setQaParamValues({ ...controller.qaParamValues, [parameter.parameter_id]: "Pass" })} />Pass</label>
                                                                <label className="flex items-center gap-1 cursor-pointer text-foreground"><input type="radio" name={`daily-yield-param-${parameter.parameter_id}`} checked={value === "Fail"} onChange={() => controller.setQaParamValues({ ...controller.qaParamValues, [parameter.parameter_id]: "Fail" })} />Fail</label>
                                                            </div>
                                                        ) : (
                                                            <Input type={parameter.test_type === "Numeric" ? "number" : "text"} step={parameter.test_type === "Numeric" ? "any" : undefined} required placeholder={parameter.test_type === "Numeric" ? `Target: ${parameter.target_value || "N/A"}` : "Reading..."} className="h-7 text-[11px] font-mono w-[105px] bg-background border-border text-foreground py-0" value={value} onChange={(event) => controller.setQaParamValues({ ...controller.qaParamValues, [parameter.parameter_id]: event.target.value })} />
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        }) : <div className="text-[10px] text-muted-foreground/80 italic pt-1 pl-1">No parameter checklist needed.</div>}
                                    </div>
                                );
                            }) : <div className="text-[10px] text-muted-foreground italic p-3 border border-dashed border-border rounded-lg">No routing steps are configured; the general audit fields below will be recorded.</div>}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="daily-yield-sensory" className="text-foreground font-bold">Sensory Status</Label>
                            <select id="daily-yield-sensory" value={controller.sensoryStatus} onChange={(event) => controller.setSensoryStatus(event.target.value as "Passed" | "Failed")} className="flex min-h-11 w-full rounded-md border border-border bg-background text-foreground px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer">
                                <option value="Passed">Passed (Color/Texture Pass)</option>
                                <option value="Failed">Failed (Deviation/Reject)</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="daily-yield-action" className="text-foreground font-bold">QA Disposition Action</Label>
                            <select id="daily-yield-action" value={controller.dailyActionTaken} onChange={(event) => controller.setDailyActionTaken(event.target.value as "Released" | "Quarantined" | "Scrapped")} className="flex min-h-11 w-full rounded-md border border-border bg-background text-foreground px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer">
                                <option value="Released">Release Shift Yield</option>
                                <option value="Quarantined">Hold / Quarantine Yield</option>
                                <option value="Scrapped">Scrap Yield Lot</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="daily-yield-lab" className="text-foreground font-bold">Lab status</Label>
                            <select id="daily-yield-lab" value={controller.dailyLabStatus} onChange={(event) => controller.setDailyLabStatus(event.target.value as "Pending" | "Passed" | "Failed")} className="flex min-h-11 w-full rounded-md border border-border bg-background text-foreground px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer">
                                <option value="Passed">Passed (Lab Verified)</option>
                                <option value="Pending">Pending Analysis</option>
                                <option value="Failed">Failed (Contamination)</option>
                            </select>
                        </div>
                        <div className="space-y-1.5 flex flex-col justify-end pb-1">
                            {controller.hasFailedParam && <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md text-destructive flex items-center gap-1.5 text-[11px] font-semibold"><AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />Warning: Parameters out of range!</div>}
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="daily-yield-remarks" className="text-foreground font-bold">Inspector remarks / Lab Comments</Label>
                        <textarea id="daily-yield-remarks" value={controller.dailyRemarks} onChange={(event) => controller.setDailyRemarks(event.target.value)} className="flex min-h-[60px] w-full rounded-md border border-border bg-background text-foreground px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary" placeholder="Details about moisture logs, physicochemical traits or sensory notes..." />
                    </div>

                    <DialogFooter className="sticky bottom-0 z-10 pt-3 border-t border-border gap-2 flex items-center justify-end bg-background/95 backdrop-blur">
                        <Button type="button" variant="outline" onClick={controller.closeAudit} className="border-border hover:bg-muted text-foreground min-h-11 text-sm font-semibold">Cancel</Button>
                        <Button type="submit" disabled={controller.actionLoading} className="bg-primary hover:bg-primary/95 text-white font-bold min-h-11 text-sm px-4">
                            {controller.actionLoading ? "Saving Audit..." : "Save Audit & Authorize"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
