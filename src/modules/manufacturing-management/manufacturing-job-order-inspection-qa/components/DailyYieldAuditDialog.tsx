"use client";

import React from "react";
import Image from "next/image";
import {
    AlertCircle,
    Calendar,
    ChevronRight,
    ClipboardCheck,
    Expand,
    History,
    ImageIcon,
    MapPin,
    Package,
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
    const [showAllAuditTrail, setShowAllAuditTrail] = React.useState(false);
    const [showAllOperators, setShowAllOperators] = React.useState(false);
    React.useEffect(() => {
        setEvidenceExpanded(false);
        setShowAllAuditTrail(false);
        setShowAllOperators(false);
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
            <DialogContent className="w-[calc(100vw-1rem)] sm:w-[75vw] sm:max-w-[75vw] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden bg-background border border-border text-foreground flex flex-col p-4 sm:p-5 gap-3">
                <DialogHeader className="shrink-0 pb-1 border-b border-border/40">
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

                <form onSubmit={(event) => { event.preventDefault(); void controller.submitAudit(); }} className="min-h-0 flex-1 flex flex-col overflow-hidden text-sm">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 overflow-hidden py-1">
                        {/* LEFT COLUMN: Header, Shift Yield Stats, Logs, Evidence & Audit Trail */}
                        <div className="lg:col-span-5 flex flex-col space-y-4 overflow-y-auto pr-1 scrollbar-thin">
                            {/* Product Details Card */}
                            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1.5 shadow-2xs">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                            <Package className="h-3.5 w-3.5 text-primary" /> Finished Good Product
                                        </p>
                                        <p className="text-sm font-bold text-foreground truncate mt-0.5" title={details?.productName}>
                                            {details?.productName || "Product not specified"}
                                        </p>
                                    </div>
                                    {details?.productCode && (
                                        <Badge variant="outline" className="font-mono text-[10px] bg-background shrink-0">
                                            {details.productCode}
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 pt-1 border-t border-primary/10 text-xs text-muted-foreground">
                                    <span>Target: <strong className="text-foreground font-mono">{numericText(details?.targetQuantity)}</strong> units</span>
                                    <span>•</span>
                                    <span>Produced: <strong className="text-emerald-600 font-mono">{numericText(details?.producedQuantity)}</strong> units</span>
                                </div>
                            </div>

                            {/* Session Meta (Audited By & Timestamp) */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-xl border border-border bg-muted/20 p-2.5">
                                    <p className="text-[10px] uppercase text-muted-foreground flex items-center gap-1 font-semibold"><User className="h-3 w-3" />Audited By</p>
                                    <p className="mt-1 truncate text-xs font-bold" title={inspectorDisplayName}>{inspectorDisplayName}</p>
                                </div>
                                <div className="rounded-xl border border-border bg-muted/20 p-2.5">
                                    <p className="text-[10px] uppercase text-muted-foreground flex items-center gap-1 font-semibold"><Calendar className="h-3 w-3" />Timestamp</p>
                                    <p className="mt-1 font-mono text-xs font-bold">{formatAuditTimestamp(controller.auditStartedAt)}</p>
                                </div>
                            </div>

                            {/* Assigned Operators Card */}
                            <div className="rounded-xl border border-border bg-muted/20 p-2.5">
                                <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                                    <p className="text-[10px] uppercase text-muted-foreground flex items-center gap-1 font-semibold">
                                        <Users className="h-3 w-3 text-primary" /> Assigned Route Operators
                                    </p>
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] text-muted-foreground font-mono">
                                            {sortedAuditRoutes.length} {sortedAuditRoutes.length === 1 ? "route" : "routes"}
                                        </span>
                                        {sortedAuditRoutes.length > 2 && (
                                            <button
                                                type="button"
                                                onClick={() => setShowAllOperators(true)}
                                                className="text-[10px] text-primary hover:underline font-semibold"
                                            >
                                                Show all
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    {sortedAuditRoutes.length === 0 ? (
                                        <p className="text-muted-foreground text-xs italic">No route operators assigned.</p>
                                    ) : (
                                        <>
                                            {sortedAuditRoutes.slice(0, 2).map((route) => {
                                                const names = controller.routeOperatorsByRouteId?.[route.id] ?? [];
                                                const hasOps = names.length > 0;
                                                return (
                                                    <div
                                                        key={route.id}
                                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium ${
                                                            hasOps
                                                                ? "bg-background border-border text-foreground"
                                                                : "bg-muted/40 border-border/50 text-muted-foreground"
                                                        }`}
                                                        title={`Route ${route.sequenceOrder}: ${route.name} — ${hasOps ? names.join(", ") : "No operators assigned"}`}
                                                    >
                                                        <span className="font-semibold text-primary">R{route.sequenceOrder}:</span>
                                                        <span className="truncate max-w-[130px]">{hasOps ? names.join(", ") : "None"}</span>
                                                    </div>
                                                );
                                            })}
                                            {sortedAuditRoutes.length > 2 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAllOperators(true)}
                                                    className="text-[10px] font-semibold text-primary hover:underline px-1 py-0.5 rounded"
                                                >
                                                    +{sortedAuditRoutes.length - 2} more...
                                                </button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Shift Stock Yield Summary */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-2.5">
                                    <p className="text-[10px] uppercase font-semibold text-emerald-700 dark:text-emerald-400">Good Stock</p>
                                    <p className="mt-1 text-lg font-bold text-emerald-600">{numericText(yieldRecord?.goodQuantity)}</p>
                                </div>
                                <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-2.5">
                                    <p className="text-[10px] uppercase font-semibold text-rose-700 dark:text-rose-400">Rejected FG Stock</p>
                                    <p className="mt-1 text-lg font-bold text-rose-600">{numericText(yieldRecord?.rejectedQuantity)}</p>
                                </div>
                            </div>

                            {/* Operator Checklist Parameter Entries (Read-Only) */}
                            <div className="border border-border rounded-xl p-3 bg-muted/10">
                                <details className="group cursor-pointer">
                                    <summary className="flex justify-between items-center text-foreground font-bold text-xs select-none">
                                        <span>Operator Checklist Logs (Read-Only)</span>
                                        <span className="text-[10px] text-primary group-open:hidden font-semibold">Show logs</span>
                                        <span className="text-[10px] text-primary hidden group-open:inline font-semibold">Hide logs</span>
                                    </summary>
                                    <div className="mt-2 space-y-2">
                                        {controller.matchingLogs.length === 0 ? (
                                            <div className="text-[10px] text-muted-foreground italic p-2 bg-muted/45 rounded-md border border-border">
                                                No matching operator checklist logs found for this shift.
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
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

                            {/* End-of-shift Evidence Image */}
                            {yieldRecord?.evidenceImage && (
                                <div className="bg-sky-500/[0.03] border border-sky-500/20 rounded-xl p-3 space-y-2 shadow-sm">
                                    <div className="flex items-center gap-2 pb-1.5 border-b border-sky-500/10">
                                        <div className="p-1 bg-sky-500/10 rounded-lg text-sky-600 dark:text-sky-400">
                                            <ImageIcon className="h-3.5 w-3.5" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-sky-800 dark:text-sky-300 uppercase tracking-wider text-[10px]">
                                                End-of-Shift Evidence
                                            </h4>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 rounded-lg border border-sky-500/20 bg-background/70 p-2">
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
                                                width={80}
                                                height={80}
                                                unoptimized
                                                className="h-20 w-20 rounded-md object-cover border border-border"
                                            />
                                            <span className="absolute bottom-1 right-1 rounded-md bg-background/90 p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                                                <Expand className="h-3 w-3" />
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

                            {/* Audit Trail (Contained, No Overflow) */}
                            <div className="space-y-2 border border-border rounded-xl p-3 bg-muted/5 overflow-hidden">
                                <div className="flex items-center justify-between border-b pb-1.5 border-border/60">
                                    <h4 className="text-foreground font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                                        <History className="h-3.5 w-3.5 text-primary" /> Audit Trail
                                    </h4>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-muted-foreground font-mono">
                                            {auditTrailEntries.length} {auditTrailEntries.length === 1 ? "entry" : "entries"}
                                        </span>
                                        {auditTrailEntries.length > 2 && (
                                            <button
                                                type="button"
                                                onClick={() => setShowAllAuditTrail(true)}
                                                className="text-[10px] text-primary hover:underline font-semibold"
                                            >
                                                Show all ({auditTrailEntries.length})
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {auditTrailEntries.length === 0 ? (
                                    <p className="text-xs text-muted-foreground py-3 text-center">No audit events have been recorded yet.</p>
                                ) : (
                                    <ol className="space-y-2 overflow-hidden">
                                        {auditTrailEntries.slice(0, 2).map((entry) => {
                                            const inspectorLabel = entry.inspectorId
                                                ? controller.inspectorNamesById?.[entry.inspectorId] || `Inspector #${entry.inspectorId}`
                                                : "—";
                                            return (
                                                <li key={entry.key} className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-1 overflow-hidden">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-xs font-bold truncate">
                                                            {entry.label}
                                                            {entry.routeName ? <span className="font-semibold text-muted-foreground"> · {entry.routeName}</span> : null}
                                                        </p>
                                                        <span className="font-mono text-[10px] text-muted-foreground shrink-0">{formatAuditTimestamp(entry.timestamp)}</span>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground">Inspector: <span className="font-semibold text-foreground">{inspectorLabel}</span></p>
                                                    {entry.detail && (
                                                        <p className="text-[10px] text-foreground/80">{entry.detail}</p>
                                                    )}
                                                    {entry.remarks && (
                                                        <p className="text-[10px] text-muted-foreground italic">{entry.remarks}</p>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ol>
                                )}
                            </div>
                        </div>

                        {/* RIGHT COLUMN: The Steps, Parameters, WIP Output Traceability, and QA Decisions (7 of 12) */}
                        <div className="lg:col-span-7 flex flex-col space-y-4 overflow-y-auto pl-1 pr-1 scrollbar-thin">
                            {/* Step QC Sheet Header & Routing Checklist */}
                            <div className="space-y-2 border border-border rounded-xl p-3 bg-muted/10">
                                <Label className="text-foreground font-bold text-xs block border-b pb-1.5 border-border/60">
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

                                <div className="grid grid-cols-1 gap-3 max-h-[360px] overflow-y-auto pr-1 scrollbar-thin">
                                    {controller.routes.length > 0 ? controller.routes.map((route) => {
                                        const template = controller.qaTemplates.find((item) => Number(item.template_id ?? item.id) === Number(route.qaTemplateId));
                                        const parameters = Array.isArray(template?.parameters) ? template.parameters : [];
                                        const audited = controller.selectedYield?.audits.some((audit) => Number(audit.jo_route_id) === route.id);
                                        return (
                                            <div key={route.id} className="space-y-1.5 p-2.5 border border-border rounded-xl bg-background/50">
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

                            {/* Batch & Lot Traceability Log (WIP Output) */}
                            <div className="bg-emerald-500/[0.015] dark:bg-emerald-500/[0.005] border border-emerald-500/20 rounded-xl p-3.5 space-y-3.5 shadow-sm">
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

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label htmlFor="daily-yield-output-batch" className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]">
                                            <Tag className="h-3.5 w-3.5 text-emerald-500" /> Output Batch / Lot No <span className="text-destructive">*</span>
                                        </Label>
                                        <Input
                                            id="daily-yield-output-batch"
                                            type="text"
                                            maxLength={100}
                                            value={controller.dailyOutputBatchNo}
                                            onChange={(event) => controller.setDailyOutputBatchNo(event.target.value)}
                                            className="h-9 rounded-lg bg-background border-border/80 text-foreground text-xs font-bold font-mono"
                                            placeholder="e.g. JO-2026-YLD-001"
                                            disabled={controller.actionLoading || !requiresOutputTraceability || isVerified}
                                            required={requiresOutputTraceability}
                                        />
                                    </div>

                                    <div className="space-y-1">
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
                                            className="h-9 w-full justify-between rounded-lg border-border/80 text-xs font-semibold"
                                            showBatchSummary
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <Label htmlFor="daily-yield-manufacturing-date" className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]">
                                            <Calendar className="h-3.5 w-3.5 text-emerald-500" /> Manufacturing Date <span className="text-destructive">*</span>
                                        </Label>
                                        <Input
                                            id="daily-yield-manufacturing-date"
                                            type="date"
                                            value={controller.dailyOutputManufacturingDate}
                                            onChange={(event) => controller.setDailyOutputManufacturingDate(event.target.value)}
                                            className="h-9 rounded-lg bg-background border-border/80 text-foreground text-xs"
                                            disabled={controller.actionLoading || !requiresOutputTraceability || isVerified}
                                            required={requiresOutputTraceability}
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <Label htmlFor="daily-yield-expiry-date" className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]">
                                            <Calendar className="h-3.5 w-3.5 text-emerald-500" /> Expiry Date <span className="text-destructive">*</span>
                                        </Label>
                                        <Input
                                            id="daily-yield-expiry-date"
                                            type="date"
                                            value={controller.dailyOutputExpiryDate}
                                            onChange={(event) => controller.setDailyOutputExpiryDate(event.target.value)}
                                            className="h-9 rounded-lg bg-background border-border/80 text-foreground text-xs"
                                            disabled={controller.actionLoading || !requiresOutputTraceability || isVerified}
                                            required={requiresOutputTraceability}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Sensory & QA Dispositions */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div className="space-y-1">
                                    <Label htmlFor="daily-yield-sensory" className="text-foreground font-bold text-xs">Sensory Status</Label>
                                    <select id="daily-yield-sensory" disabled={isVerified} value={controller.sensoryStatus} onChange={(event) => controller.setSensoryStatus(event.target.value as "Passed" | "Failed")} className="flex h-9 w-full rounded-lg border border-border bg-background text-foreground px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer font-medium">
                                        <option value="Passed">Passed (Color/Texture Pass)</option>
                                        <option value="Failed">Failed (Deviation/Reject)</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="daily-yield-action" className="text-foreground font-bold text-xs">QA Disposition Action</Label>
                                    <select id="daily-yield-action" disabled={isVerified} value={controller.dailyActionTaken} onChange={(event) => controller.setDailyActionTaken(event.target.value as "Released" | "Quarantined" | "Scrapped")} className="flex h-9 w-full rounded-lg border border-border bg-background text-foreground px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer font-medium">
                                        <option value="Released">Release Shift Yield</option>
                                        <option value="Quarantined">Hold / Quarantine Yield</option>
                                        <option value="Scrapped">Scrap Yield Lot</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="daily-yield-lab" className="text-foreground font-bold text-xs">Lab Status</Label>
                                    <select id="daily-yield-lab" disabled={isVerified} value={controller.dailyLabStatus} onChange={(event) => controller.setDailyLabStatus(event.target.value as "Pending" | "Passed" | "Failed")} className="flex h-9 w-full rounded-lg border border-border bg-background text-foreground px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary cursor-pointer font-medium">
                                        <option value="Passed">Passed (Lab Verified)</option>
                                        <option value="Pending">Pending Analysis</option>
                                        <option value="Failed">Failed (Contamination)</option>
                                    </select>
                                </div>
                            </div>

                            {/* Failed Parameter Warning Alert */}
                            {controller.hasFailedParam && (
                                <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive flex items-center gap-1.5 text-xs font-semibold">
                                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                                    Warning: Parameters out of range! Review routing inspection checklist.
                                </div>
                            )}

                            {/* Inspector Remarks / Notes */}
                            <div className="space-y-1">
                                <Label htmlFor="daily-yield-remarks" className="text-foreground font-bold text-xs">Inspector remarks / Lab Comments</Label>
                                <textarea id="daily-yield-remarks" disabled={isVerified} value={controller.dailyRemarks} onChange={(event) => controller.setDailyRemarks(event.target.value)} className="flex min-h-[52px] w-full rounded-md border border-border bg-background text-foreground px-3 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary" placeholder="Details about moisture logs, physicochemical traits or sensory notes..." />
                            </div>
                        </div>
                    </div>

                    {/* Dialog Footer */}
                    <DialogFooter className="shrink-0 pt-3 mt-1 border-t border-border gap-2 flex items-center justify-end bg-background">
                        <Button type="button" variant="outline" onClick={controller.closeAudit} className="border-border hover:bg-muted text-foreground min-h-10 text-xs font-semibold">Cancel</Button>
                        <Button type="submit" disabled={controller.actionLoading || isVerified} title={isVerified ? "This yield has been verified and can no longer be edited." : undefined} className="bg-primary hover:bg-primary/95 text-white font-bold min-h-10 text-xs px-4">
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

            {/* Show All Operators Dialog */}
            <Dialog open={showAllOperators} onOpenChange={setShowAllOperators}>
                <DialogContent className="w-[calc(100vw-2rem)] max-w-lg p-4 sm:p-5 gap-4">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-primary font-bold text-sm">
                            <Users className="h-4 w-4" /> All Assigned Route Operators
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Routing operations and operators assigned for {details?.jobOrderNo || "this Job Order"}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin">
                        {sortedAuditRoutes.map((route) => {
                            const names = controller.routeOperatorsByRouteId?.[route.id] ?? [];
                            return (
                                <div key={route.id} className="p-2.5 rounded-lg border border-border bg-muted/20 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-foreground">
                                            Step {route.sequenceOrder}: {route.name}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">
                                            {names.length > 0 ? names.join(", ") : "No operators assigned"}
                                        </p>
                                    </div>
                                    <Badge variant={names.length > 0 ? "secondary" : "outline"} className="text-[10px] shrink-0">
                                        {names.length > 0 ? `${names.length} operator${names.length > 1 ? "s" : ""}` : "Unassigned"}
                                    </Badge>
                                </div>
                            );
                        })}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowAllOperators(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Show Complete Audit Trail Dialog */}
            <Dialog open={showAllAuditTrail} onOpenChange={setShowAllAuditTrail}>
                <DialogContent className="w-[calc(100vw-2rem)] max-w-xl p-4 sm:p-5 gap-4">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-primary font-bold text-sm">
                            <History className="h-4 w-4" /> Complete Audit Trail History
                        </DialogTitle>
                        <DialogDescription className="text-xs">
                            Full chronological record of inspections and yield lifecycle events for {details?.jobOrderNo || "this Job Order"}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2.5 max-h-[65vh] overflow-y-auto pr-1 scrollbar-thin">
                        {auditTrailEntries.map((entry, index) => {
                            const inspectorLabel = entry.inspectorId
                                ? controller.inspectorNamesById?.[entry.inspectorId] || `Inspector #${entry.inspectorId}`
                                : "—";
                            return (
                                <div key={`full-${entry.key}-${index}`} className="rounded-xl border border-border bg-muted/20 p-3 space-y-1.5">
                                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1">
                                        <p className="text-xs font-bold text-foreground">
                                            {entry.label}
                                            {entry.routeName ? <span className="font-semibold text-muted-foreground"> · {entry.routeName}</span> : null}
                                        </p>
                                        <span className="font-mono text-[11px] text-muted-foreground shrink-0">{formatAuditTimestamp(entry.timestamp)}</span>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">Inspector: <span className="font-semibold text-foreground">{inspectorLabel}</span></p>
                                    {entry.detail && (
                                        <p className="text-xs text-foreground/90 font-medium">{entry.detail}</p>
                                    )}
                                    {entry.remarks && (
                                        <p className="text-[11px] text-muted-foreground italic bg-background/50 rounded p-1.5 border border-border/40">{entry.remarks}</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowAllAuditTrail(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Dialog>
    );
}
