"use client";

import React from "react";
import Image from "next/image";
import {
    AlertCircle,
    Calendar,
    ChevronRight,
    ClipboardCheck,
    Expand,
    ImageIcon,
    MapPin,
    Tag,
    User,
    Users,
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

function formatAuditTimestamp(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
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
    const isVerified = yieldRecord?.qaStatus === "Passed";
    const [evidenceExpanded, setEvidenceExpanded] = React.useState(false);
    React.useEffect(() => {
        setEvidenceExpanded(false);
    }, [yieldRecord?.ledgerId]);
    const sortedAuditRoutes = React.useMemo(
        () => [...(controller.routes ?? [])].sort((left, right) => left.sequenceOrder - right.sequenceOrder),
        [controller.routes]
    );
    const inspectorDisplayName = controller.inspectorName?.trim() || "Current signed-in inspector";
    const auditTrailEntries = React.useMemo(() => {
        type TrailEntry = {
            key: string;
            label: string;
            routeName: string | null;
            detail: string | null;
            timestamp: unknown;
            inspectorId: number | null;
            remarks: string | null;
        };
        const textValue = (record: Record<string, unknown>, keys: string[]): string | null => {
            for (const key of keys) {
                const value = record[key];
                if (typeof value === "string" && value.trim()) return value.trim();
            }
            return null;
        };
        const numberValue = (record: Record<string, unknown>, keys: string[]): number | null => {
            for (const key of keys) {
                const value = Number(record[key]);
                if (Number.isFinite(value) && value > 0) return value;
            }
            return null;
        };
        const entries: TrailEntry[] = [];
        if (yieldRecord?.loggedAt) {
            entries.push({
                key: "yield-logged",
                label: "Yield logged",
                routeName: null,
                detail: null,
                timestamp: yieldRecord.loggedAt,
                inspectorId: null,
                remarks: null
            });
        }
        const audits = Array.isArray(yieldRecord?.audits) ? yieldRecord.audits : [];
        audits.forEach((audit, index) => {
            const record = (audit && typeof audit === "object" ? audit : {}) as Record<string, unknown>;
            const routeIdValue = numberValue(record, ["jo_route_id", "joRouteId"]);
            const route = routeIdValue
                ? sortedAuditRoutes.find((item) => item.id === routeIdValue)
                : undefined;
            const readings = [
                textValue(record, ["sensory_status", "sensoryStatus"]) ? `Sensory ${textValue(record, ["sensory_status", "sensoryStatus"])}` : null,
                textValue(record, ["lab_status", "laboratory_status", "labStatus"]) ? `Lab ${textValue(record, ["lab_status", "laboratory_status", "labStatus"])}` : null,
                record.moisture_percentage !== undefined && record.moisture_percentage !== null && String(record.moisture_percentage).trim() !== ""
                    ? `Moisture ${String(record.moisture_percentage).trim()}%`
                    : null,
                record.acidity_ph !== undefined && record.acidity_ph !== null && String(record.acidity_ph).trim() !== ""
                    ? `pH ${String(record.acidity_ph).trim()}`
                    : null,
                textValue(record, ["action_taken", "actionTaken"]) ? `Action: ${textValue(record, ["action_taken", "actionTaken"])}` : null
            ].filter((part): part is string => part !== null);
            entries.push({
                key: `inspection-${String(record.daily_qa_id ?? record.id ?? index)}`,
                label: "Inspection",
                routeName: route ? `Step ${route.sequenceOrder}: ${route.name}` : null,
                detail: readings.length > 0 ? readings.join(" · ") : null,
                timestamp: record.inspected_at ?? record.created_at ?? null,
                inspectorId: numberValue(record, ["inspector_id", "inspectorId", "created_by", "user_id"]),
                remarks: textValue(record, ["remarks"])
            });
        });
        const epoch = (value: unknown): number => {
            if (typeof value !== "string" || !value.trim()) return 0;
            const time = new Date(value).getTime();
            return Number.isFinite(time) ? time : 0;
        };
        return entries
            .map((entry, index) => ({ entry, index }))
            .sort((left, right) => epoch(left.entry.timestamp) - epoch(right.entry.timestamp) || left.index - right.index)
            .map(({ entry }) => entry);
    }, [yieldRecord, sortedAuditRoutes]);

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
                {isVerified && (
                    <div role="status" className="flex shrink-0 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        <ClipboardCheck className="h-4 w-4 shrink-0" />
                        This daily yield has been verified. Details are read-only.
                    </div>
                )}

                <form onSubmit={(event) => { event.preventDefault(); void controller.submitAudit(); }} className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2 text-sm scrollbar-thin">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-xl border border-border bg-muted/20 p-3">
                            <p className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><User className="h-3 w-3" />Audited By</p>
                            <p className="mt-1 truncate text-sm font-bold" title={inspectorDisplayName}>{inspectorDisplayName}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-muted/20 p-3">
                            <p className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />Assigned Operators</p>
                            <div className="mt-1 space-y-0.5 text-xs max-h-20 overflow-y-auto">
                                {sortedAuditRoutes.length === 0 && (
                                    <p className="text-muted-foreground">—</p>
                                )}
                                {sortedAuditRoutes.map((route) => {
                                    const names = controller.routeOperatorsByRouteId?.[route.id] ?? [];
                                    const line = names.length > 0 ? names.join(", ") : "No operators assigned";
                                    return (
                                        <p key={route.id} className="truncate" title={`Route ${route.sequenceOrder}: ${line}`}>
                                            <span className="font-semibold">Route {route.sequenceOrder}:</span>{" "}
                                            <span className="text-muted-foreground">{line}</span>
                                        </p>
                                    );
                                })}
                            </div>
                        </div>
                        <div className="rounded-xl border border-border bg-muted/20 p-3">
                            <p className="text-[10px] uppercase text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />Audit Timestamp</p>
                            <p className="mt-1 font-mono text-sm font-bold">{formatAuditTimestamp(controller.auditStartedAt)}</p>
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

                        <div className="grid grid-cols-1 gap-4 max-h-[520px] overflow-y-auto pr-1 scrollbar-thin">
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
                                                <div key={parameter.parameter_id} className="flex flex-col gap-1.5 py-1.5 border-b border-border/40 last:border-b-0">
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
                                                                <label className="flex items-center gap-1 cursor-pointer text-foreground"><input type="radio" name={`daily-yield-param-${parameter.parameter_id}`} checked={value === "Pass"} disabled={isVerified} onChange={() => controller.setQaParamValues({ ...controller.qaParamValues, [parameter.parameter_id]: "Pass" })} />Pass</label>
                                                                <label className="flex items-center gap-1 cursor-pointer text-foreground"><input type="radio" name={`daily-yield-param-${parameter.parameter_id}`} checked={value === "Fail"} disabled={isVerified} onChange={() => controller.setQaParamValues({ ...controller.qaParamValues, [parameter.parameter_id]: "Fail" })} />Fail</label>
                                                            </div>
                                                        ) : (
                                                            <Input type={parameter.test_type === "Numeric" ? "number" : "text"} step={parameter.test_type === "Numeric" ? "any" : undefined} required placeholder={parameter.test_type === "Numeric" ? `Target: ${parameter.target_value || "N/A"}` : "Reading..."} className="h-7 text-[11px] font-mono w-full bg-background border-border text-foreground py-0" disabled={isVerified} value={value} onChange={(event) => controller.setQaParamValues({ ...controller.qaParamValues, [parameter.parameter_id]: event.target.value })} />
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

                    {yieldRecord?.evidenceImage && (
                        <div className="bg-sky-500/[0.03] border border-sky-500/20 rounded-xl p-4 space-y-3 shadow-sm">
                            <div className="flex items-center gap-2 pb-2 border-b border-sky-500/10">
                                <div className="p-1.5 bg-sky-500/10 rounded-lg text-sky-600 dark:text-sky-400">
                                    <ImageIcon className="h-4 w-4" />
                                </div>
                                <div>
                                    <h4 className="font-bold text-sky-800 dark:text-sky-300 uppercase tracking-wider text-[10px]">
                                        End-of-Shift Evidence
                                    </h4>
                                    <p className="text-[9px] text-muted-foreground mt-0.5">
                                        Photo attached to this production session for audit reference.
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-sky-500/20 bg-background/70 p-2">
                                <button
                                    type="button"
                                    onClick={() => setEvidenceExpanded(true)}
                                    aria-label="Expand end-of-shift evidence image"
                                    title="Expand image"
                                    className="group relative shrink-0 cursor-zoom-in rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                                >
                                    <Image
                                        src={yieldRecord.evidenceImage.url}
                                        alt={yieldRecord.evidenceImage.fileName || "End-of-shift evidence"}
                                        width={112}
                                        height={112}
                                        unoptimized
                                        className="h-28 w-28 rounded-md object-cover border border-border"
                                    />
                                    <span className="absolute bottom-1 right-1 rounded-md bg-background/90 p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                        <Expand className="h-3.5 w-3.5" />
                                    </span>
                                </button>
                                <div className="min-w-0 space-y-1 text-[10px]">
                                    <p className="truncate font-semibold text-foreground" title={yieldRecord.evidenceImage.fileName || undefined}>
                                        {yieldRecord.evidenceImage.fileName || "End-of-shift evidence image"}
                                    </p>
                                    {yieldRecord.evidenceImage.mimeType && (
                                        <p className="text-muted-foreground">{yieldRecord.evidenceImage.mimeType}</p>
                                    )}
                                    {yieldRecord.evidenceImage.fileSize && (
                                        <p className="text-muted-foreground">{(yieldRecord.evidenceImage.fileSize / 1024 / 1024).toFixed(2)} MB</p>
                                    )}
                                    <a
                                        href={yieldRecord.evidenceImage.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex font-semibold text-primary hover:underline"
                                    >
                                        Open full image
                                    </a>
                                </div>
                            </div>
                        </div>
                    )}

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
                                    disabled={controller.actionLoading || !requiresOutputTraceability || isVerified}
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
                                    disabled={controller.actionLoading || !requiresOutputTraceability || isVerified}
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
                                    disabled={controller.actionLoading || !requiresOutputTraceability || isVerified}
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
                                    disabled={controller.actionLoading || !requiresOutputTraceability || isVerified}
                                    required={requiresOutputTraceability}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
                            <p className="text-[10px] uppercase text-muted-foreground">Good Stock</p>
                            <p className="mt-1 text-xl font-bold text-emerald-600">{numericText(yieldRecord?.goodQuantity)}</p>
                        </div>
                        <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-3">
                            <p className="text-[10px] uppercase text-muted-foreground">Rejected FG Stock</p>
                            <p className="mt-1 text-xl font-bold text-rose-600">{numericText(yieldRecord?.rejectedQuantity)}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="daily-yield-sensory" className="text-foreground font-bold">Sensory Status</Label>
                            <select id="daily-yield-sensory" disabled={isVerified} value={controller.sensoryStatus} onChange={(event) => controller.setSensoryStatus(event.target.value as "Passed" | "Failed")} className="flex min-h-11 w-full rounded-md border border-border bg-background text-foreground px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer">
                                <option value="Passed">Passed (Color/Texture Pass)</option>
                                <option value="Failed">Failed (Deviation/Reject)</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="daily-yield-action" className="text-foreground font-bold">QA Disposition Action</Label>
                            <select id="daily-yield-action" disabled={isVerified} value={controller.dailyActionTaken} onChange={(event) => controller.setDailyActionTaken(event.target.value as "Released" | "Quarantined" | "Scrapped")} className="flex min-h-11 w-full rounded-md border border-border bg-background text-foreground px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer">
                                <option value="Released">Release Shift Yield</option>
                                <option value="Quarantined">Hold / Quarantine Yield</option>
                                <option value="Scrapped">Scrap Yield Lot</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="daily-yield-lab" className="text-foreground font-bold">Lab status</Label>
                            <select id="daily-yield-lab" disabled={isVerified} value={controller.dailyLabStatus} onChange={(event) => controller.setDailyLabStatus(event.target.value as "Pending" | "Passed" | "Failed")} className="flex min-h-11 w-full rounded-md border border-border bg-background text-foreground px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer">
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
                        <textarea id="daily-yield-remarks" disabled={isVerified} value={controller.dailyRemarks} onChange={(event) => controller.setDailyRemarks(event.target.value)} className="flex min-h-[60px] w-full rounded-md border border-border bg-background text-foreground px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary" placeholder="Details about moisture logs, physicochemical traits or sensory notes..." />
                    </div>

                    <div className="space-y-2">
                        <h4 className="text-foreground font-bold text-sm">Audit Trail</h4>
                        {auditTrailEntries.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No audit events have been recorded yet.</p>
                        ) : (
                            <ol className="space-y-2">
                                {auditTrailEntries.map((entry) => {
                                    const inspectorLabel = entry.inspectorId
                                        ? controller.inspectorNamesById?.[entry.inspectorId] || `Inspector #${entry.inspectorId}`
                                        : "—";
                                    return (
                                        <li key={entry.key} className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-xs font-bold">
                                                    {entry.label}
                                                    {entry.routeName ? <span className="font-semibold text-muted-foreground"> · {entry.routeName}</span> : null}
                                                </p>
                                                <span className="font-mono text-[11px] text-muted-foreground shrink-0">{formatAuditTimestamp(entry.timestamp)}</span>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">Inspector: <span className="font-semibold text-foreground">{inspectorLabel}</span></p>
                                            {entry.detail && (
                                                <p className="text-[11px]">{entry.detail}</p>
                                            )}
                                            {entry.remarks && (
                                                <p className="text-[11px] text-muted-foreground">{entry.remarks}</p>
                                            )}
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                    </div>

                    <DialogFooter className="sticky bottom-0 z-10 pt-3 border-t border-border gap-2 flex items-center justify-end bg-background/95 backdrop-blur">
                        <Button type="button" variant="outline" onClick={controller.closeAudit} className="border-border hover:bg-muted text-foreground min-h-11 text-sm font-semibold">Cancel</Button>
                        <Button type="submit" disabled={controller.actionLoading || isVerified} title={isVerified ? "This yield has been verified and can no longer be edited." : undefined} className="bg-primary hover:bg-primary/95 text-white font-bold min-h-11 text-sm px-4">
                            {controller.actionLoading ? "Saving Audit..." : "Save Audit & Authorize"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
            {yieldRecord?.evidenceImage && (
                <Dialog open={evidenceExpanded} onOpenChange={setEvidenceExpanded}>
                    <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl p-4 sm:p-5 gap-3">
                        <DialogHeader>
                            <DialogTitle className="truncate text-sm font-bold" title={yieldRecord.evidenceImage.fileName || undefined}>
                                {yieldRecord.evidenceImage.fileName || "End-of-shift evidence"}
                            </DialogTitle>
                            <DialogDescription className="text-[11px]">
                                {yieldRecord.evidenceImage.mimeType || "Evidence image"}
                                {typeof yieldRecord.evidenceImage.fileSize === "number"
                                    ? ` · ${(yieldRecord.evidenceImage.fileSize / 1024 / 1024).toFixed(2)} MB`
                                    : ""}
                            </DialogDescription>
                        </DialogHeader>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={yieldRecord.evidenceImage.url}
                            alt={yieldRecord.evidenceImage.fileName || "End-of-shift evidence"}
                            className="mx-auto max-h-[75vh] w-auto max-w-full rounded-lg border border-border object-contain bg-muted/20"
                        />
                        <DialogFooter className="sm:justify-end">
                            <Button type="button" variant="outline" onClick={() => setEvidenceExpanded(false)}>
                                Close
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}
        </Dialog>
    );
}
