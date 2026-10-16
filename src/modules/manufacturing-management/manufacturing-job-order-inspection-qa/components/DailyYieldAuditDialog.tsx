"use client";

import React from "react";
import Image from "next/image";
import {
    AlertCircle,
    Calendar,
    ChevronRight,
    ClipboardCheck,
    History,
    ImageIcon,
    Loader2,
    MapPin,
    Package,
    Plus,
    Tag,
    Trash2,
    User,
    Users,
} from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { FinishedGoodsLotSelect } from "../../shared/FinishedGoodsLotSelect";
import { formatPhtTimestamp12Hour, phtTimestampToEpoch } from "../../shared/pht-date";
import { isManufacturingEvidenceVideo } from "@/modules/manufacturing-management/production-workflow/services/production-yield-image";
import {
    parseQAOutputQuantity,
    qaOutputAllocationCapacityErrorMessage,
    qaOutputAllocationMatchesLoggedTotal,
    qaOutputAllocationWithinCapacity,
    sumQAOutputQuantities
} from "@/modules/manufacturing-management/manufacturing-qa/qa-output-allocation";
import {
    dailyQAAuditStateError,
    type DailyQALabStatus
} from "@/modules/manufacturing-management/manufacturing-qa/daily-qa-outcome";
import { dailyQAParameterValueKey } from "../utils/saved-daily-qa-parameters";
import type { DailyYieldAuditController } from "../hooks/useDailyYieldAudit";
import type { DailyYieldQALog, DailyYieldQAParameter, JobOrderDailyYieldEvidence } from "../types";
import { EvidenceMediaInput } from "../../production-workflow/components/EvidenceMediaInput";

function auditActorName(actorId: number | null, actorLabel: string, namesById: Record<number, string> | undefined) {
    if (!actorId) return "Not recorded";
    const name = namesById?.[actorId];
    if (name && name !== `Inspector #${actorId}`) return name;
    return `${actorLabel === "Logged By" ? "User" : "Inspector"} #${actorId}`;
}

interface DailyYieldAuditDialogProps {
    controller: DailyYieldAuditController;
    displayShiftName?: string;
}

function numericText(value: unknown): string {
    const numeric = Number(value ?? 0);
    return Number.isFinite(numeric) ? numeric.toLocaleString() : "0";
}

function formatAuditTimestamp(value: unknown): string {
    if (typeof value !== "string" || !value.trim()) return "—";
    return formatPhtTimestamp12Hour(value);
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

export function DailyYieldAuditDialog({ controller, displayShiftName }: DailyYieldAuditDialogProps) {
    const yieldRecord = controller.selectedYield;
    const details = controller.selectedDetails;
    const shiftName = displayShiftName || yieldRecord?.shiftName || "Shift not specified";
    const parsedAcceptedOutputQuantity = parseQAOutputQuantity(controller.dailyAcceptedOutputQuantity);
    const parsedRejectedOutputQuantity = parseQAOutputQuantity(controller.dailyRejectedOutputQuantity);
    const acceptedOutputQuantity = parsedAcceptedOutputQuantity ?? 0;
    const rejectedOutputQuantity = parsedRejectedOutputQuantity ?? 0;
    const loggedOutputQuantity = sumQAOutputQuantities(
        yieldRecord?.goodQuantity,
        yieldRecord?.rejectedQuantity,
        yieldRecord?.scrapQuantity
    ) ?? 0;
    const auditedOutputQuantity = parsedAcceptedOutputQuantity !== null && parsedRejectedOutputQuantity !== null
        ? sumQAOutputQuantities(parsedAcceptedOutputQuantity, parsedRejectedOutputQuantity)
        : null;
    const hasAllocationVariance = auditedOutputQuantity !== null && Boolean(yieldRecord)
        && !qaOutputAllocationMatchesLoggedTotal(
            { acceptedQuantity: acceptedOutputQuantity, rejectedQuantity: rejectedOutputQuantity },
            yieldRecord?.goodQuantity,
            sumQAOutputQuantities(yieldRecord?.rejectedQuantity, yieldRecord?.scrapQuantity)
        );
    const allocationExceedsCapacity = auditedOutputQuantity !== null && Boolean(yieldRecord)
        && !qaOutputAllocationWithinCapacity(
            { acceptedQuantity: acceptedOutputQuantity, rejectedQuantity: rejectedOutputQuantity },
            yieldRecord?.qaAllocationLimit
        );
    const quantityAllocationError = controller.quantityAllocationError || (allocationExceedsCapacity
        ? qaOutputAllocationCapacityErrorMessage(
            yieldRecord?.qaAllocationLimit,
            details?.totalProducedQuantity,
            details?.productUom
        )
        : null);
    const hasOutput = loggedOutputQuantity > 0;
    const requiresOutputTraceability = acceptedOutputQuantity > 0;
    const requiresRejectedOutputTraceability = rejectedOutputQuantity > 0;
    const hasSavedAcceptedEvidence = (yieldRecord?.evidence?.acceptedStock.length || 0) > 0;
    const hasSavedRejectedEvidence = (yieldRecord?.evidence?.rejectedStock.length || 0) > 0;
    const shelfLifeDays = Number(details?.productShelfLifeDays);
    const hasValidShelfLifeDays = Number.isSafeInteger(shelfLifeDays) && shelfLifeDays > 0;
    const isVerified = yieldRecord?.qaStatus === "Passed";
    const labDispositionError = dailyQAAuditStateError(controller.dailyLabStatus, controller.dailyActionTaken);
    const confirmsLabVerification = controller.savedLabStatus === "Pending" && controller.dailyLabStatus === "Passed";
    const rejectedOutputRegistered = Boolean(yieldRecord?.rejectedMmLotId);
    const canRegisterRejectedOutput = Boolean(
        requiresRejectedOutputTraceability
        && yieldRecord?.outcome.isComplete
        && !rejectedOutputRegistered
    );
    const rejectedOutputLocked = controller.actionLoading || rejectedOutputRegistered;
    const [evidenceExpanded, setEvidenceExpanded] = React.useState(false);
    const [previewEvidence, setPreviewEvidence] = React.useState<JobOrderDailyYieldEvidence | null>(null);
    const [showAllAuditTrail, setShowAllAuditTrail] = React.useState(false);
    const [showAllOperators, setShowAllOperators] = React.useState(false);
    const [checklistSectionOpen, setChecklistSectionOpen] = React.useState(false);
    const [evidenceSectionOpen, setEvidenceSectionOpen] = React.useState(false);
    const [auditTrailSectionOpen, setAuditTrailSectionOpen] = React.useState(false);
    const [revokeDialogOpen, setRevokeDialogOpen] = React.useState(false);
    const [revokeReason, setRevokeReason] = React.useState("");
    React.useEffect(() => {
        setEvidenceExpanded(false);
        setPreviewEvidence(null);
        setShowAllAuditTrail(false);
        setShowAllOperators(false);
        const shouldStartOpen = window.matchMedia("(min-width: 64rem)").matches;
        setChecklistSectionOpen(shouldStartOpen);
        setEvidenceSectionOpen(shouldStartOpen);
        setAuditTrailSectionOpen(shouldStartOpen);
    }, [controller.isOpen, yieldRecord?.ledgerId]);
    const sortedAuditRoutes = React.useMemo(
        () => [...(controller.routes ?? [])].sort((left, right) => left.sequenceOrder - right.sequenceOrder),
        [controller.routes]
    );
    const inspectorDisplayName = controller.inspectorName?.trim() || "Current signed-in inspector";
    const evidenceChannels: Array<{ key: string; label: string; items: JobOrderDailyYieldEvidence[] }> = [
        {
            key: "inspectorShift",
            label: "Inspector / Shift Evidence",
            items: yieldRecord?.evidence?.inspectorShift ?? (yieldRecord?.evidenceImage ? [{
                evidenceId: `legacy-${yieldRecord.ledgerId}`,
                channel: "INSPECTOR_SHIFT",
                fileId: yieldRecord.evidenceImage.fileId,
                fileName: yieldRecord.evidenceImage.fileName,
                mimeType: yieldRecord.evidenceImage.mimeType,
                fileSize: yieldRecord.evidenceImage.fileSize,
                url: yieldRecord.evidenceImage.url,
                uploadedById: yieldRecord.loggedById,
                uploadedAt: yieldRecord.loggedAt,
                sortOrder: -1
            }] : [])
        },
        { key: "acceptedStock", label: "QA Accepted Stock Evidence", items: yieldRecord?.evidence?.acceptedStock ?? [] },
        { key: "rejectedStock", label: "QA Rejected Stock Evidence", items: yieldRecord?.evidence?.rejectedStock ?? [] }
    ];
    const auditTrailEntries = React.useMemo(() => {
        type TrailEntry = {
            key: string;
            label: string;
            routeName: string | null;
            detail: string | null;
            timestamp: unknown;
            actorId: number | null;
            actorLabel: "Logged By" | "Inspector";
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
                actorId: yieldRecord.loggedById,
                actorLabel: "Logged By",
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
                actorId: numberValue(record, ["inspector_id", "inspectorId", "created_by", "user_id"]),
                actorLabel: "Inspector",
                remarks: textValue(record, ["remarks"])
            });
        });
        return entries
            .map((entry, index) => ({ entry, index }))
            .sort((left, right) => phtTimestampToEpoch(String(left.entry.timestamp || "")) - phtTimestampToEpoch(String(right.entry.timestamp || "")) || left.index - right.index)
            .map(({ entry }) => entry);
    }, [yieldRecord, sortedAuditRoutes]);

    return (
        <Dialog open={controller.isOpen} onOpenChange={(open) => open ? controller.setIsOpen(true) : controller.closeAudit()}>
            <DialogContent showCloseButton={!controller.actionLoading} className="w-[calc(100vw-1rem)] sm:w-[75vw] sm:max-w-[75vw] h-[calc(100dvh-1rem)] sm:h-[calc(100dvh-2rem)] max-h-[calc(100dvh-1rem)] sm:max-h-[calc(100dvh-2rem)] overflow-hidden bg-background border border-border text-foreground flex flex-col p-4 sm:p-5 gap-3">
                <DialogHeader className="shrink-0 pb-1 border-b border-border/40">
                    <DialogTitle className="flex items-center gap-2 text-primary font-bold text-base">
                        <ClipboardCheck className="h-5 w-5" /> Record In-Process QA Audit
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground text-xs">
                        Record physicochemical specifications and sensory audits for {details?.jobOrderNo || "the selected Job Order"} ({shiftName}).
                    </DialogDescription>
                </DialogHeader>
                {details?.yieldEvidenceAvailable === false && (
                    <div role="status" className="flex shrink-0 items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-200">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {details.yieldEvidenceWarning || "Yield evidence is temporarily unavailable. Only legacy shift evidence is displayed."}
                    </div>
                )}
                {isVerified && (
                    <div role="status" className="flex shrink-0 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                        <ClipboardCheck className="h-4 w-4 shrink-0" />
                        This daily yield has been verified. Details are read-only.
                    </div>
                )}
                {yieldRecord?.qaRevocation && (
                    <div role="status" className="flex shrink-0 items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                            <p className="font-semibold">This yield has a prior QA release revocation ({formatAuditTimestamp(yieldRecord.qaRevocation.revokedAt)}).</p>
                            {yieldRecord.qaRevocation.reason && <p className="mt-0.5">Reason: {yieldRecord.qaRevocation.reason}</p>}
                            {yieldRecord.qaRevocation.revokedById && <p className="mt-0.5">Recorded by {yieldRecord.qaRevocation.revokedByName || controller.inspectorNamesById[yieldRecord.qaRevocation.revokedById] || "Name unavailable"}.</p>}
                        </div>
                    </div>
                )}

                <form onSubmit={(event) => { event.preventDefault(); void controller.submitAudit(); }} className="min-h-0 flex-1 flex flex-col overflow-hidden text-sm" aria-busy={controller.actionLoading}>
                    <fieldset disabled={controller.actionLoading} className="contents">
                    {controller.saveError && (
                        <div role="alert" className="mb-2 shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                            {controller.saveError}
                        </div>
                    )}
                    <div className="mb-2 shrink-0 rounded-xl border border-primary/20 bg-primary/5 p-3 lg:hidden">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                            <div className="min-w-0">
                                <p className="font-mono text-xs font-bold text-primary">{details?.jobOrderNo || "Selected Job Order"}</p>
                                <p className="mt-0.5 truncate text-xs font-semibold" title={details?.productName}>{details?.productName || "Product not specified"}</p>
                                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                                    {shiftName}
                                    {controller.auditStartedAt ? ` · ${formatAuditTimestamp(controller.auditStartedAt)}` : ""}
                                </p>
                            </div>
                            {details?.productUom && <Badge variant="secondary" className="shrink-0 text-[10px]">{details.productUom}</Badge>}
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-primary/10 pt-2 text-[10px] sm:grid-cols-4">
                            <div className="min-w-0">
                                <p className="text-muted-foreground">Target</p>
                                <p className="mt-0.5 truncate font-mono font-semibold">{numericText(details?.targetQuantity)} {details?.productUom || "units"}</p>
                            </div>
                            <div className="min-w-0">
                                <p className="text-muted-foreground">Produced</p>
                                <p className="mt-0.5 truncate font-mono font-semibold text-emerald-700 dark:text-emerald-300">{numericText(details?.producedQuantity)} {details?.productUom || "units"}</p>
                            </div>
                            <div className="min-w-0">
                                <p className="text-muted-foreground">Good Stock</p>
                                <p className="mt-0.5 truncate font-mono font-semibold text-emerald-700 dark:text-emerald-300">{numericText(yieldRecord?.goodQuantity)}</p>
                            </div>
                            <div className="min-w-0">
                                <p className="text-muted-foreground">Rejected FG</p>
                                <p className="mt-0.5 truncate font-mono font-semibold text-rose-700 dark:text-rose-300">{numericText(yieldRecord?.rejectedQuantity)}</p>
                            </div>
                        </div>
                    </div>
                    <div
                        role="region"
                        aria-label="Audit form content"
                        tabIndex={0}
                        className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                    >
                    <div className="grid min-h-0 grid-cols-1 gap-5 lg:grid-cols-12">
                        {/* LEFT COLUMN: Header, Shift Yield Stats, Logs, Evidence & Audit Trail */}
                        <div className="flex min-w-0 flex-col space-y-4 lg:col-span-5 lg:pr-1">
                            {/* Product Details Card */}
                            <div className="hidden rounded-xl border border-primary/20 bg-primary/5 p-3 shadow-2xs lg:block lg:space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                            <Package className="h-3.5 w-3.5 text-primary" /> Finished Good Product
                                        </p>
                                        <p className="text-sm font-bold text-foreground truncate mt-0.5" title={details?.productName}>
                                            {details?.productName || "Product not specified"}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {details?.productUom && (
                                            <Badge variant="secondary" className="font-medium text-[10px] bg-primary/10 text-primary border border-primary/20 shrink-0">
                                                {details.productUom}
                                            </Badge>
                                        )}
                                        {details?.productCode && (
                                            <Badge variant="outline" className="font-mono text-[10px] bg-background shrink-0">
                                                {details.productCode}
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 pt-1 border-t border-primary/10 text-xs text-muted-foreground">
                                    <span>Target: <strong className="text-foreground font-mono">{numericText(details?.targetQuantity)}</strong> {details?.productUom || "units"}</span>
                                    <span>•</span>
                                    <span>Produced: <strong className="text-emerald-600 font-mono">{numericText(details?.producedQuantity)}</strong> {details?.productUom || "units"}</span>
                                </div>
                            </div>

                            {/* Session Meta (Audited By & Timestamp) */}
                            <div className="hidden grid-cols-2 gap-2 lg:grid">
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
                                    {controller.referenceLoading && sortedAuditRoutes.length > 0 ? (
                                        <div role="status" aria-label="Loading assigned route operators" aria-busy="true" className="flex flex-wrap items-center gap-1.5">
                                            <span className="sr-only">Loading assigned route operators...</span>
                                            {sortedAuditRoutes.slice(0, 2).map((route) => (
                                                <div key={route.id} aria-hidden="true" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5">
                                                    <Skeleton className="h-3 w-5" />
                                                    <Skeleton className="h-3 w-24" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : sortedAuditRoutes.length === 0 ? (
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
                                <details
                                    className="group cursor-pointer"
                                    open={checklistSectionOpen}
                                    onToggle={(event) => setChecklistSectionOpen(event.currentTarget.open)}
                                >
                                    <summary className="flex select-none items-center justify-between text-xs font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                        <span>Operator Checklist Logs (Read-Only)</span>
                                        <span className="text-[10px] text-primary group-open:hidden font-semibold">Show logs</span>
                                        <span className="text-[10px] text-primary hidden group-open:inline font-semibold">Hide logs</span>
                                    </summary>
                                    <div className="mt-2 space-y-2">
                                        {controller.referenceLoading ? (
                                            <div role="status" aria-label="Loading operator checklist logs" aria-busy="true" className="space-y-1.5">
                                                <span className="sr-only">Loading operator checklist logs...</span>
                                                {Array.from({ length: 2 }).map((_, index) => (
                                                    <div key={`checklist-log-skeleton-${index}`} aria-hidden="true" className="space-y-2 rounded-md border border-border bg-muted/50 p-2">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <Skeleton className="h-3 w-36" />
                                                            <Skeleton className="h-5 w-16 rounded-full" />
                                                        </div>
                                                        <Skeleton className="h-3 w-full" />
                                                        <Skeleton className="h-3 w-4/5" />
                                                    </div>
                                                ))}
                                            </div>
                                        ) : controller.matchingLogs.length === 0 ? (
                                            <div className="text-[10px] text-muted-foreground italic p-2 bg-muted/45 rounded-md border border-border">
                                                No matching operator checklist logs found for this shift.
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5">
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

                            {/* Role-separated yield evidence */}
                            {yieldRecord && (
                                <details
                                    className="group rounded-xl border border-sky-500/20 bg-sky-500/[0.03] p-3 shadow-sm"
                                    open={evidenceSectionOpen}
                                    onToggle={(event) => setEvidenceSectionOpen(event.currentTarget.open)}
                                >
                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold text-sky-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-sky-300">
                                        <span className="flex min-w-0 items-center gap-2">
                                        <div className="p-1 bg-sky-500/10 rounded-lg text-sky-600 dark:text-sky-400">
                                            <ImageIcon className="h-3.5 w-3.5" />
                                        </div>
                                            <span className="truncate uppercase tracking-wider">Yield Evidence by Stage</span>
                                        </span>
                                        <span className="shrink-0 text-[10px] font-semibold text-primary">{evidenceSectionOpen ? "Hide" : "Show"}</span>
                                    </summary>
                                    <div className="mt-2 space-y-2">
                                        {evidenceChannels.map((channel) => (
                                            <section key={channel.key} className="rounded-lg border border-border bg-background/70 p-2.5">
                                                <div className="mb-2 flex items-center justify-between gap-2">
                                                    <h5 className="text-[10px] font-bold uppercase tracking-wide text-foreground">{channel.label}</h5>
                                                    <span className="text-[10px] text-muted-foreground">{channel.items.length} {channel.items.length === 1 ? "file" : "files"}</span>
                                                </div>
                                                {channel.items.length === 0 ? (
                                                    <p className="text-[10px] italic text-muted-foreground">No evidence recorded.</p>
                                                ) : (
                                                    <ul className="space-y-2">
                                                        {channel.items.map((item) => (
                                                            <li key={`${item.evidenceId}-${item.fileId}`} className="flex min-w-0 items-center gap-2.5 rounded-md border border-border/70 p-2">
                                                                {isManufacturingEvidenceVideo(item.mimeType, item.fileName) ? (
                                                                    <video src={item.url} controls playsInline preload="metadata" aria-label={`${channel.label} video`} className="max-h-20 w-28 shrink-0 rounded border border-border bg-black" />
                                                                ) : (
                                                                    <button type="button" onClick={() => { setPreviewEvidence(item); setEvidenceExpanded(true); }} aria-label={`Preview ${item.fileName || channel.label}`} className="shrink-0 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                                                        <Image src={item.url} alt={item.fileName || channel.label} width={64} height={64} unoptimized className="h-16 w-16 rounded border border-border object-cover" />
                                                                    </button>
                                                                )}
                                                                <div className="min-w-0 space-y-0.5 text-[10px]">
                                                                    <p className="truncate font-semibold text-foreground" title={item.fileName || undefined}>{item.fileName || "Evidence file"}</p>
                                                                    <p className="truncate text-muted-foreground">Uploaded by {auditActorName(item.uploadedById, "Logged By", controller.inspectorNamesById)}</p>
                                                                    <p className="text-muted-foreground">{formatAuditTimestamp(item.uploadedAt)}{item.fileSize ? ` · ${(item.fileSize / 1024 / 1024).toFixed(2)} MB` : ""}</p>
                                                                    <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex font-semibold text-primary hover:underline">Open file</a>
                                                                </div>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </section>
                                        ))}
                                    </div>
                                </details>
                            )}

                            {/* Audit Trail (Contained, No Overflow) */}
                            <details
                                className="group space-y-2 overflow-hidden rounded-xl border border-border bg-muted/5 p-3"
                                open={auditTrailSectionOpen}
                                onToggle={(event) => setAuditTrailSectionOpen(event.currentTarget.open)}
                            >
                                <summary className="flex cursor-pointer list-none items-center justify-between gap-2 border-b border-border/60 pb-1.5 text-xs font-bold uppercase tracking-wider text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                                    <span className="flex items-center gap-1.5">
                                        <History className="h-3.5 w-3.5 text-primary" /> Audit Trail
                                    </span>
                                    <span className="shrink-0 text-[10px] font-medium normal-case text-muted-foreground">
                                        {auditTrailEntries.length} {auditTrailEntries.length === 1 ? "entry" : "entries"} · {auditTrailSectionOpen ? "Hide" : "Show"}
                                    </span>
                                </summary>
                                <div className="space-y-2 pt-2">
                                {auditTrailEntries.length === 0 ? (
                                    <p className="text-xs text-muted-foreground py-3 text-center">No audit events have been recorded yet.</p>
                                ) : (
                                    <ol className="space-y-2 overflow-hidden">
                                        {auditTrailEntries.slice(0, 2).map((entry) => {
                                            const actorName = auditActorName(entry.actorId, entry.actorLabel, controller.inspectorNamesById);
                                            return (
                                                <li key={entry.key} className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-1 overflow-hidden">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-xs font-bold truncate">
                                                            {entry.label}
                                                            {entry.routeName ? <span className="font-semibold text-muted-foreground"> · {entry.routeName}</span> : null}
                                                        </p>
                                                        <span className="font-mono text-[10px] text-muted-foreground shrink-0">{formatAuditTimestamp(entry.timestamp)}</span>
                                                    </div>
                                                    <p className="text-[10px] text-muted-foreground">{entry.actorLabel}: <span className="font-semibold text-foreground">{actorName}</span></p>
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
                                {auditTrailEntries.length > 2 && (
                                    <div className="text-right">
                                        <button
                                            type="button"
                                            onClick={() => setShowAllAuditTrail(true)}
                                            className="text-[10px] font-semibold text-primary hover:underline"
                                        >
                                            Show all ({auditTrailEntries.length})
                                        </button>
                                    </div>
                                )}
                                </div>
                            </details>
                        </div>

                        {/* RIGHT COLUMN: The Steps, Parameters, WIP Output Traceability, and QA Decisions (7 of 12) */}
                        <div className="flex min-w-0 flex-col space-y-4 lg:col-span-7 lg:pl-1 lg:pr-1">
                            {/* Step QC Sheet Header & Routing Checklist */}
                            <div className="space-y-2 border border-border rounded-xl p-3 bg-muted/10">
                                <Label className="text-foreground font-bold text-xs block border-b pb-1.5 border-border/60">
                                    Daily Quality Control Sheet (All Routing Steps)
                                </Label>
                                <div className="flex flex-wrap items-center gap-1.5 p-2 bg-muted/20 border border-border rounded-xl text-[10px] font-bold [@media(pointer:coarse)]:gap-2.5">
                                    {controller.routes.length > 0 ? controller.routes.map((route, index) => {
                                        const audited = controller.selectedYield?.audits.some((audit) => Number(audit.jo_route_id) === route.id);
                                        return (
                                            <React.Fragment key={route.id}>
                                                <button
                                                    type="button"
                                                    className={`flex items-center gap-1 rounded-md border px-2 py-0.5 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11 [@media(pointer:coarse)]:gap-2 [@media(pointer:coarse)]:px-3 [@media(pointer:coarse)]:py-2 [@media(pointer:coarse)]:text-xs ${audited ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20"}`}
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

                                <div className="grid grid-cols-1 gap-3">
                                    {controller.referenceLoading && controller.routes.length > 0 ? (
                                        <div role="status" aria-label="Loading QA templates" aria-busy="true" className="space-y-2">
                                            <span className="sr-only">Loading QA templates and checklist parameters...</span>
                                            {controller.routes.slice(0, 3).map((route) => (
                                                <div key={`qa-template-skeleton-${route.id}`} aria-hidden="true" className="space-y-2 rounded-xl border border-border bg-background/50 p-2.5">
                                                    <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-1">
                                                        <Skeleton className="h-4 w-40" />
                                                        <Skeleton className="h-5 w-16 rounded-full" />
                                                    </div>
                                                    {Array.from({ length: 2 }).map((_, index) => (
                                                        <div key={`qa-parameter-skeleton-${route.id}-${index}`} className="space-y-1.5 border-b border-border/40 py-1.5 last:border-b-0">
                                                            <Skeleton className="h-3 w-2/3" />
                                                            <Skeleton className="h-7 w-full" />
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    ) : controller.routes.length > 0 ? controller.routes.map((route) => {
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
                                                    const parameterValueKey = dailyQAParameterValueKey(route.id, parameter.parameter_id);
                                                    const value = controller.qaParamValues[parameterValueKey] || "";
                                                    const savedParameter = controller.selectedYield?.audits
                                                        .find((audit) => Number(audit.jo_route_id) === route.id)
                                                        ?.qaParameters?.find((item) => item.parameter_id === parameter.parameter_id);
                                                    const hasSavedPassState = typeof savedParameter?.is_passed === "boolean";
                                                    const failed = isVerified
                                                        ? savedParameter?.is_passed === false
                                                        : isParameterFailed(parameter, value);
                                                    const hasResult = isVerified ? hasSavedPassState : Boolean(value);
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
                                                                {hasResult && <span className={`text-[10px] font-bold px-1 py-0.5 rounded ${failed ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>{failed ? "FAIL" : "PASS"}</span>}
                                                                {["Boolean", "Pass/Fail", "Yes/No"].includes(parameter.test_type || "") ? (
                                                                    <div className="flex gap-2.5 text-[10px]">
                                                                        <label className="flex items-center gap-1 cursor-pointer text-foreground"><input type="radio" name={`daily-yield-param-${route.id}-${parameter.parameter_id}`} checked={value === "Pass"} disabled={isVerified} onChange={() => controller.setQaParamValues({ ...controller.qaParamValues, [parameterValueKey]: "Pass" })} />Pass</label>
                                                                        <label className="flex items-center gap-1 cursor-pointer text-foreground"><input type="radio" name={`daily-yield-param-${route.id}-${parameter.parameter_id}`} checked={value === "Fail"} disabled={isVerified} onChange={() => controller.setQaParamValues({ ...controller.qaParamValues, [parameterValueKey]: "Fail" })} />Fail</label>
                                                                    </div>
                                                                ) : (
                                                                    <Input type={parameter.test_type === "Numeric" ? "number" : "text"} step={parameter.test_type === "Numeric" ? "any" : undefined} required placeholder={parameter.test_type === "Numeric" ? `Target: ${parameter.target_value || "N/A"}` : "Reading..."} className="h-7 text-[11px] font-mono w-full bg-background border-border text-foreground py-0" disabled={isVerified} value={value} onChange={(event) => controller.setQaParamValues({ ...controller.qaParamValues, [parameterValueKey]: event.target.value })} />
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

                                {hasOutput && !hasValidShelfLifeDays && (
                                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-700 dark:text-amber-300 text-xs" role="alert">
                                        Expiry autofill is unavailable because this product has no valid Shelf Life (Days) value in Finished Goods Master. Enter the expiry date manually.
                                    </div>
                                )}

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
                                {controller.referenceLoading && (
                                    <div role="status" aria-label="Loading audit reference data" aria-busy="true" className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
                                        <span className="sr-only">Loading audit templates and operator checklist logs...</span>
                                        <Skeleton aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full" />
                                        <div aria-hidden="true" className="flex-1 space-y-2">
                                            <Skeleton className="h-3 w-2/3" />
                                            <Skeleton className="h-3 w-1/2" />
                                        </div>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1">
                                        <Label htmlFor="daily-yield-accepted-quantity" className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]">
                                            Accepted / Good Quantity <span className="text-destructive">*</span>
                                        </Label>
                                        <Input
                                            id="daily-yield-accepted-quantity"
                                            type="number"
                                            min="0"
                                            step="0.000001"
                                            value={controller.dailyAcceptedOutputQuantity}
                                            onChange={(event) => controller.setDailyAcceptedOutputQuantity(event.target.value)}
                                            className={`h-9 rounded-lg bg-background text-foreground text-xs font-mono ${quantityAllocationError ? "border-destructive focus-visible:ring-destructive" : "border-border/80"}`}
                                            aria-invalid={Boolean(quantityAllocationError)}
                                            aria-describedby={quantityAllocationError ? "daily-yield-output-allocation-error" : undefined}
                                            disabled={controller.actionLoading || isVerified || !hasOutput}
                                            required={hasOutput}
                                        />
                                        <p className="text-[10px] text-muted-foreground">
                                            Job Order production: {numericText(details?.totalProducedQuantity)} {details?.productUom || "units"}. Available for this audit: {numericText(yieldRecord?.qaAllocationLimit)} {details?.productUom || "units"}. Operator logged: {numericText(loggedOutputQuantity)}.
                                        </p>
                                    </div>

                                    {requiresOutputTraceability && (
                                        <div className="sm:col-span-2 space-y-3">
                                            {controller.acceptedOutputAllocations.map((allocation, index) => (
                                                <div key={allocation.allocationKey} className="rounded-lg border border-emerald-500/20 bg-background/70 p-3 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-300">Allocation {index + 1}</p>
                                                        {controller.acceptedOutputAllocations.length > 1 && !isVerified && (
                                                            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-destructive" disabled={controller.actionLoading} onClick={() => controller.removeAcceptedAllocation(allocation.allocationKey)}>
                                                                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                                                            </Button>
                                                        )}
                                                    </div>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                        <div className="space-y-1">
                                                            <Label htmlFor={`accepted-allocation-quantity-${allocation.allocationKey}`} className="text-muted-foreground font-medium text-[11px]">Allocation Quantity <span className="text-destructive">*</span></Label>
                                                            <Input id={`accepted-allocation-quantity-${allocation.allocationKey}`} type="number" min="0" step="0.000001" value={allocation.quantity} onChange={(event) => controller.updateAcceptedAllocation(allocation.allocationKey, "quantity", event.target.value)} className="h-9 rounded-lg bg-background border-border/80 text-foreground text-xs font-mono" disabled={controller.actionLoading || isVerified} required />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label htmlFor={`accepted-allocation-batch-${allocation.allocationKey}`} className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]"><Tag className="h-3.5 w-3.5 text-emerald-500" /> Batch / Lot No <span className="text-destructive">*</span></Label>
                                                            <Input id={`accepted-allocation-batch-${allocation.allocationKey}`} type="text" maxLength={100} value={allocation.batchNo} onChange={(event) => controller.updateAcceptedAllocation(allocation.allocationKey, "batchNo", event.target.value)} className="h-9 rounded-lg bg-background border-border/80 text-foreground text-xs font-bold font-mono" placeholder="e.g. JO-2026-YLD-001" disabled={controller.actionLoading || isVerified} required />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label htmlFor={`accepted-allocation-lot-${allocation.allocationKey}`} className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]"><MapPin className="h-3.5 w-3.5 text-emerald-500" /> Storage Lot <span className="text-destructive">*</span></Label>
                                                            {isVerified ? (
                                                                <Input id={`accepted-allocation-lot-${allocation.allocationKey}`} value={allocation.lotName || (allocation.mmLotId ? `Lot #${allocation.mmLotId}` : "Not recorded")} disabled readOnly className="h-9 rounded-lg bg-background border-border/80 text-foreground text-xs font-semibold" />
                                                            ) : controller.dailyOutputLotsLoading ? (
                                                                <Skeleton className="h-9 w-full rounded-lg" />
                                                            ) : (
                                                                <FinishedGoodsLotSelect lots={controller.dailyOutputEligibleLots} value={allocation.mmLotId} onValueChange={(value) => controller.updateAcceptedAllocation(allocation.allocationKey, "mmLotId", value)} disabled={controller.actionLoading} placeholder="Select storage lot..." className="h-9 w-full justify-between rounded-lg border-border/80 text-xs font-semibold" showBatchSummary />
                                                            )}
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label htmlFor={`accepted-allocation-mfg-${allocation.allocationKey}`} className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]"><Calendar className="h-3.5 w-3.5 text-emerald-500" /> Manufacturing Date <span className="text-destructive">*</span></Label>
                                                            <Input id={`accepted-allocation-mfg-${allocation.allocationKey}`} type="date" value={allocation.manufacturingDate} onChange={(event) => controller.updateAcceptedAllocation(allocation.allocationKey, "manufacturingDate", event.target.value)} className="h-9 rounded-lg bg-background border-border/80 text-foreground text-xs" disabled={controller.actionLoading || isVerified} required />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label htmlFor={`accepted-allocation-expiry-${allocation.allocationKey}`} className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]"><Calendar className="h-3.5 w-3.5 text-emerald-500" /> Expiry Date <span className="text-destructive">*</span></Label>
                                                            <Input id={`accepted-allocation-expiry-${allocation.allocationKey}`} type="date" value={allocation.expiryDate} onChange={(event) => controller.updateAcceptedAllocation(allocation.allocationKey, "expiryDate", event.target.value)} className="h-9 rounded-lg bg-background border-border/80 text-foreground text-xs" disabled={controller.actionLoading || isVerified} required />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                            {!isVerified && (
                                                <Button type="button" variant="outline" className="h-8 text-xs" disabled={controller.actionLoading} onClick={controller.addAcceptedAllocation}>
                                                    <Plus className="mr-1 h-3.5 w-3.5" /> Add Another Lot / Batch Allocation
                                                </Button>
                                            )}
                                            {quantityAllocationError && (
                                                <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">{quantityAllocationError}</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {requiresOutputTraceability && !isVerified && (
                                    <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.03] p-3">
                                        <p className="mb-2 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                                            QA Accepted Stock Evidence {!hasSavedAcceptedEvidence && <span className="text-destructive">*</span>}
                                            <span className="ml-1 font-normal text-muted-foreground">{hasSavedAcceptedEvidence ? "Evidence already recorded." : "Required when accepted quantity is greater than zero."}</span>
                                        </p>
                                        <EvidenceMediaInput
                                            id="daily-yield-accepted-evidence"
                                            label="QA accepted stock evidence"
                                            files={controller.acceptedEvidenceFiles}
                                            multiple
                                            error={controller.acceptedEvidenceError}
                                            required={!hasSavedAcceptedEvidence}
                                            disabled={controller.actionLoading}
                                            active={controller.isOpen}
                                            onFilesChange={controller.setAcceptedEvidence}
                                        />
                                    </div>
                                )}
                            </div>

                            {hasOutput && (
                                <div className="bg-rose-500/[0.025] border border-rose-500/25 rounded-xl p-3.5 space-y-3.5 shadow-sm">
                                    <div className="flex items-center gap-2 pb-2 border-b border-rose-500/15">
                                        <div className="p-1.5 bg-rose-500/10 rounded-lg text-rose-600">
                                            <MapPin className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-rose-800 dark:text-rose-300 uppercase tracking-wider text-[10px]">
                                                Rejected Output Traceability
                                            </h4>
                                            <p className="text-[9px] text-muted-foreground mt-0.5">
                                                {rejectedOutputRegistered
                                                    ? `${numericText(controller.dailyRejectedOutputQuantity)} rejected units are already registered in the configured bad-stock branch.`
                                                    : `${numericText(controller.dailyRejectedOutputQuantity)} rejected units will be registered in the configured bad-stock branch after this audit is complete.`}
                                            </p>
                                        </div>
                                    </div>

                                    {requiresRejectedOutputTraceability && controller.dailyRejectedOutputLotsError && (
                                        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive flex items-start gap-2 text-xs" role="alert">
                                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                            <div className="space-y-2">
                                                <p className="font-semibold">Bad-stock storage lots are unavailable.</p>
                                                <p>{controller.dailyRejectedOutputLotsError}</p>
                                            </div>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="space-y-1">
                                            <Label htmlFor="daily-yield-rejected-output-quantity" className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]">
                                                Rejected / Bad Quantity <span className="text-destructive">*</span>
                                            </Label>
                                            <Input
                                                id="daily-yield-rejected-output-quantity"
                                                type="number"
                                                min="0"
                                                step="0.000001"
                                                value={controller.dailyRejectedOutputQuantity}
                                                onChange={(event) => controller.setDailyRejectedOutputQuantity(event.target.value)}
                                                className={`h-9 rounded-lg bg-background text-foreground text-xs font-mono ${quantityAllocationError ? "border-destructive focus-visible:ring-destructive" : "border-rose-500/30"}`}
                                                aria-invalid={Boolean(quantityAllocationError)}
                                                aria-describedby={quantityAllocationError ? "daily-yield-output-allocation-error" : undefined}
                                                disabled={controller.actionLoading || isVerified || rejectedOutputRegistered || !hasOutput}
                                                required={hasOutput}
                                            />
                                        </div>

                                        {hasAllocationVariance && auditedOutputQuantity !== null && (
                                            <div role="status" className="sm:col-span-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                                                Yield Variance Detected: QA Audited ({numericText(auditedOutputQuantity)} {details?.productUom || "units"}) vs. Supervisor Logged ({numericText(loggedOutputQuantity)} {details?.productUom || "units"}). Add an optional explanation in Inspector remarks / Lab Comments.
                                            </div>
                                        )}

                                        {quantityAllocationError && (
                                            <div id="daily-yield-output-allocation-error" role="alert" className="sm:col-span-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                                {quantityAllocationError}
                                            </div>
                                        )}

                                        {requiresRejectedOutputTraceability && (
                                            <div className="sm:col-span-2 space-y-3">
                                                {controller.rejectedOutputAllocations.map((allocation, index) => (
                                                    <div key={allocation.allocationKey} className="rounded-lg border border-rose-500/20 bg-background/70 p-3 space-y-3">
                                                        <div className="flex items-center justify-between">
                                                            <p className="text-[10px] font-bold uppercase tracking-wide text-rose-800 dark:text-rose-300">Rejected allocation {index + 1}</p>
                                                            {controller.rejectedOutputAllocations.length > 1 && !isVerified && !rejectedOutputRegistered && (
                                                                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-destructive" disabled={controller.actionLoading} onClick={() => controller.removeRejectedAllocation(allocation.allocationKey)}>
                                                                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                                                                </Button>
                                                            )}
                                                        </div>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                            <div className="space-y-1">
                                                                <Label htmlFor={"rejected-allocation-quantity-" + allocation.allocationKey} className="text-muted-foreground font-medium text-[11px]">Allocation Quantity <span className="text-destructive">*</span></Label>
                                                                <Input id={"rejected-allocation-quantity-" + allocation.allocationKey} type="number" min="0" step="0.000001" value={allocation.quantity} onChange={(event) => controller.updateRejectedAllocation(allocation.allocationKey, "quantity", event.target.value)} className="h-9 rounded-lg bg-background border-rose-500/30 text-foreground text-xs font-mono" disabled={rejectedOutputLocked || isVerified} required />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label htmlFor={"rejected-allocation-batch-" + allocation.allocationKey} className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]"><Tag className="h-3.5 w-3.5 text-rose-500" /> Rejected Batch / Lot No <span className="text-destructive">*</span></Label>
                                                                <Input id={"rejected-allocation-batch-" + allocation.allocationKey} type="text" maxLength={100} value={allocation.batchNo} onChange={(event) => controller.updateRejectedAllocation(allocation.allocationKey, "batchNo", event.target.value)} className="h-9 rounded-lg bg-background border-rose-500/30 text-foreground text-xs font-bold font-mono" placeholder="Enter rejected batch or lot number" disabled={rejectedOutputLocked || isVerified} required />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label htmlFor={"rejected-allocation-lot-" + allocation.allocationKey} className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]"><MapPin className="h-3.5 w-3.5 text-rose-500" /> Bad-stock Storage Lot <span className="text-destructive">*</span></Label>
                                                                {isVerified || rejectedOutputRegistered ? (
                                                                    <Input id={"rejected-allocation-lot-" + allocation.allocationKey} value={allocation.lotName || (allocation.mmLotId ? "Lot #" + allocation.mmLotId : "Not recorded")} disabled readOnly className="h-9 rounded-lg bg-background border-rose-500/30 text-foreground text-xs font-semibold" />
                                                                ) : controller.dailyRejectedOutputLotsLoading ? (
                                                                    <Skeleton className="h-9 w-full rounded-lg" />
                                                                ) : (
                                                                    <FinishedGoodsLotSelect lots={controller.dailyRejectedOutputEligibleLots} value={allocation.mmLotId} onValueChange={(value) => controller.updateRejectedAllocation(allocation.allocationKey, "mmLotId", value)} disabled={rejectedOutputLocked} placeholder="Select bad-stock storage lot..." className="h-9 w-full justify-between rounded-lg border-rose-500/30 text-xs font-semibold" showBatchSummary />
                                                                )}
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label htmlFor={"rejected-allocation-reason-" + allocation.allocationKey} className="text-muted-foreground font-medium text-[11px]">Defect / Rejection Reason <span className="text-destructive">*</span></Label>
                                                                {isVerified ? (
                                                                    <Input id={"rejected-allocation-reason-" + allocation.allocationKey} value={allocation.rejectionReasonName || controller.qaRejectionReasons.find((reason) => String(reason.id) === allocation.rejectionReasonId)?.reason_name || allocation.rejectionReasonId || "Not recorded"} disabled readOnly className="h-9 rounded-lg bg-background border-rose-500/30 text-foreground text-xs" />
                                                                ) : (
                                                                    <Select value={allocation.rejectionReasonId || "__unselected__"} onValueChange={(value) => controller.updateRejectedAllocation(allocation.allocationKey, "rejectionReasonId", value === "__unselected__" ? "" : value)} disabled={controller.actionLoading || controller.qaRejectionReasonsLoading}>
                                                                        <SelectTrigger id={"rejected-allocation-reason-" + allocation.allocationKey} className="h-9 text-xs"><SelectValue placeholder="Select a rejection reason..." /></SelectTrigger>
                                                                        <SelectContent position="popper" className="z-[9999]">
                                                                            <SelectItem value="__unselected__" className="text-xs">Select a rejection reason...</SelectItem>
                                                                            {controller.qaRejectionReasons.filter((reason) => reason.is_active).map((reason) => <SelectItem key={reason.id} value={String(reason.id)} className="text-xs">{reason.reason_name}</SelectItem>)}
                                                                        </SelectContent>
                                                                    </Select>
                                                                )}
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label htmlFor={"rejected-allocation-mfg-" + allocation.allocationKey} className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]"><Calendar className="h-3.5 w-3.5 text-rose-500" /> Manufacturing Date <span className="text-destructive">*</span></Label>
                                                                <Input id={"rejected-allocation-mfg-" + allocation.allocationKey} type="date" value={allocation.manufacturingDate} onChange={(event) => controller.updateRejectedAllocation(allocation.allocationKey, "manufacturingDate", event.target.value)} className="h-9 rounded-lg bg-background border-rose-500/30 text-foreground text-xs" disabled={rejectedOutputLocked || isVerified} required />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <Label htmlFor={"rejected-allocation-expiry-" + allocation.allocationKey} className="flex items-center gap-1.5 text-muted-foreground font-medium text-[11px]"><Calendar className="h-3.5 w-3.5 text-rose-500" /> Expiry Date <span className="text-destructive">*</span></Label>
                                                                <Input id={"rejected-allocation-expiry-" + allocation.allocationKey} type="date" value={allocation.expiryDate} onChange={(event) => controller.updateRejectedAllocation(allocation.allocationKey, "expiryDate", event.target.value)} className="h-9 rounded-lg bg-background border-rose-500/30 text-foreground text-xs" disabled={rejectedOutputLocked || isVerified} required />
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                                {!isVerified && !rejectedOutputRegistered && (
                                                    <Button type="button" variant="outline" className="h-8 text-xs" disabled={controller.actionLoading} onClick={controller.addRejectedAllocation}>
                                                        <Plus className="mr-1 h-3.5 w-3.5" /> Add Another Lot / Batch Allocation
                                                    </Button>
                                                )}
                                                {controller.qaRejectionReasonsError && <p role="alert" className="text-xs text-destructive">{controller.qaRejectionReasonsError}</p>}
                                            </div>
                                        )}
                                    </div>

                                    {requiresRejectedOutputTraceability && !isVerified && !rejectedOutputRegistered && (
                                        <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.03] p-3">
                                            <p className="mb-2 text-[10px] font-semibold text-rose-800 dark:text-rose-300">
                                                QA Rejected Stock Evidence {!hasSavedRejectedEvidence && <span className="text-destructive">*</span>}
                                                <span className="ml-1 font-normal text-muted-foreground">{hasSavedRejectedEvidence ? "Evidence already recorded." : "Required when rejected quantity is greater than zero."}</span>
                                            </p>
                                            <EvidenceMediaInput
                                                id="daily-yield-rejected-evidence"
                                                label="QA rejected stock evidence"
                                                files={controller.rejectedEvidenceFiles}
                                                multiple
                                                error={controller.rejectedEvidenceError}
                                                required={!hasSavedRejectedEvidence}
                                                disabled={controller.actionLoading}
                                                active={controller.isOpen}
                                                onFilesChange={controller.setRejectedEvidence}
                                            />
                                        </div>
                                    )}

                                    {canRegisterRejectedOutput && (
                                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-t border-rose-500/15 pt-3">
                                            <p className="text-[10px] text-muted-foreground">
                                                The QA audit is complete. Register this rejected quantity in the configured bad-stock branch.
                                            </p>
                                            <Button
                                                type="button"
                                                variant="destructive"
                                                className="h-9 shrink-0 text-xs font-bold"
                                                disabled={controller.actionLoading}
                                                onClick={() => void controller.registerRejectedOutput()}
                                            >
                                                {controller.actionLoading ? "Registering..." : "Register Rejected Stock"}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Sensory & QA Dispositions */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                <div className="space-y-1">
                                    <Label htmlFor="daily-yield-sensory" className="text-foreground font-bold text-xs">Sensory Status</Label>
                                    <Select
                                        disabled={isVerified}
                                        value={controller.sensoryStatus}
                                        onValueChange={(val) => controller.setSensoryStatus(val as "Passed" | "Failed")}
                                    >
                                        <SelectTrigger id="daily-yield-sensory" className="h-9 w-full text-xs font-medium bg-background border-border">
                                            <SelectValue placeholder="Select sensory status..." />
                                        </SelectTrigger>
                                        <SelectContent position="popper" className="z-[9999]">
                                            <SelectItem value="Passed" className="text-xs">Passed (Color/Texture Pass)</SelectItem>
                                            <SelectItem value="Failed" className="text-xs">Failed (Deviation/Reject)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="daily-yield-action" className="text-foreground font-bold text-xs">QA Disposition Action</Label>
                                    <Select
                                        disabled={isVerified}
                                        value={controller.dailyActionTaken}
                                        onValueChange={(val) => controller.setDailyActionTaken(val as "Released" | "Quarantined" | "Scrapped")}
                                    >
                                        <SelectTrigger id="daily-yield-action" className="h-9 w-full text-xs font-medium bg-background border-border">
                                            <SelectValue placeholder="Select action..." />
                                        </SelectTrigger>
                                        <SelectContent position="popper" className="z-[9999]">
                                            <SelectItem value="Released" disabled={controller.dailyLabStatus === "Pending"} className="text-xs">Release Shift Yield</SelectItem>
                                            <SelectItem value="Quarantined" className="text-xs">Hold / Quarantine Yield</SelectItem>
                                            <SelectItem value="Scrapped" className="text-xs">Scrap Yield Lot</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="daily-yield-lab" className="text-foreground font-bold text-xs">Lab Status</Label>
                                    <Select
                                        disabled={isVerified}
                                        value={controller.dailyLabStatus || ""}
                                        onValueChange={(val) => controller.setDailyLabStatus(val as DailyQALabStatus)}
                                    >
                                        <SelectTrigger id="daily-yield-lab" className="h-9 w-full text-xs font-medium bg-background border-border">
                                            <SelectValue placeholder="Select lab status..." />
                                        </SelectTrigger>
                                        <SelectContent position="popper" className="z-[9999]">
                                            <SelectItem value="Passed" className="text-xs">Passed (Lab Verified)</SelectItem>
                                            <SelectItem value="Pending" className="text-xs">Pending Analysis</SelectItem>
                                            <SelectItem value="Failed" className="text-xs">Failed (Contamination)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {labDispositionError && (
                                <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
                                    {labDispositionError}
                                </div>
                            )}
                            {confirmsLabVerification && (
                                <div role="status" className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-800 dark:text-sky-200">
                                    This changes the saved Lab Status from Pending Analysis to Passed. Saving confirms that the laboratory result has been verified.
                                </div>
                            )}

                            {/* Failed Parameter Warning Alert */}
                            {controller.hasFailedParam && (
                                <div className="p-2.5 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive flex items-center gap-1.5 text-xs font-semibold">
                                    <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                                    Warning: Parameters out of range! Review routing inspection checklist.
                                </div>
                            )}

                            {/* Inspector Remarks / Notes */}
                            <div className="space-y-1">
                                <Label htmlFor="daily-yield-remarks" className="text-foreground font-bold text-xs">Inspector remarks / Lab Comments (Optional)</Label>
                                <textarea id="daily-yield-remarks" disabled={isVerified} value={controller.dailyRemarks} onChange={(event) => controller.setDailyRemarks(event.target.value)} className="flex min-h-[52px] w-full rounded-md border border-border bg-background text-foreground px-3 py-1.5 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary" placeholder="Details about the audit, including an optional yield variance explanation..." />
                            </div>
                        </div>
                    </div>
                    </div>

                    {/* Dialog Footer */}
                    <DialogFooter className="shrink-0 pt-3 mt-1 border-t border-border gap-2 flex items-center justify-end bg-background">
                        <Button type="button" variant="outline" onClick={controller.closeAudit} disabled={controller.actionLoading} title={controller.actionLoading ? "Wait for the save to finish or time out." : undefined} className="border-border hover:bg-muted text-foreground min-h-10 text-xs font-semibold">{isVerified ? "Close" : "Cancel"}</Button>
                        {!isVerified && (
                            <Button type="submit" disabled={controller.actionLoading || controller.referenceLoading || controller.saveOutcomeUnclear || Boolean(labDispositionError)} title={labDispositionError || (controller.referenceLoading ? "Wait for the audit reference data to finish loading." : controller.saveOutcomeUnclear ? "Close and reopen this yield to check its latest saved status before retrying." : undefined)} className="bg-primary hover:bg-primary/95 text-white font-bold min-h-10 text-xs px-4">
                                {controller.actionLoading ? (
                                    <span role="status" className="inline-flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                        Saving audit...
                                    </span>
                                ) : "Save Audit & Authorize"}
                            </Button>
                        )}
                        {isVerified && details?.canRevokeYieldAudit && (
                            <Button
                                type="button"
                                variant="destructive"
                                onClick={() => { setRevokeReason(""); setRevokeDialogOpen(true); }}
                                disabled={controller.actionLoading}
                                className="min-h-10 text-xs font-semibold"
                            >
                                Revoke QA Release
                            </Button>
                        )}
                    </DialogFooter>
                    </fieldset>
                </form>
            </DialogContent>
            <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Revoke this QA release?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The accepted quantity will be removed from released finished goods and the yield will return to the QA queue for re-audit. This action is recorded in the yield ledger.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Label htmlFor="qa-release-revocation-reason">Reason</Label>
                    <textarea
                        id="qa-release-revocation-reason"
                        value={revokeReason}
                        onChange={(event) => setRevokeReason(event.target.value)}
                        maxLength={500}
                        rows={3}
                        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                        placeholder="Explain why this QA release must be revoked..."
                    />
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={controller.actionLoading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={controller.actionLoading || !revokeReason.trim()}
                            onClick={(event) => {
                                event.preventDefault();
                                const reason = revokeReason.trim();
                                setRevokeDialogOpen(false);
                                void controller.revokeAudit(reason);
                            }}
                        >
                            {controller.actionLoading ? "Revoking..." : "Revoke release"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
            {previewEvidence && (
                <Dialog open={evidenceExpanded} onOpenChange={setEvidenceExpanded}>
                    <DialogContent className="flex h-[calc(100dvh-2rem)] max-h-[52rem] w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
                        <DialogHeader className="min-w-0 shrink-0 px-4 pb-3 pr-14 pt-4 text-left">
                            <DialogTitle className="block min-w-0 truncate text-sm font-bold" title={previewEvidence.fileName || undefined}>
                                {previewEvidence.fileName || "Evidence file"}
                            </DialogTitle>
                            <DialogDescription className="min-w-0 break-words text-[11px] leading-5">
                                {previewEvidence.mimeType || "Evidence media"} · Uploaded by {auditActorName(previewEvidence.uploadedById, "Logged By", controller.inspectorNamesById)} · {formatAuditTimestamp(previewEvidence.uploadedAt)}
                                {typeof previewEvidence.fileSize === "number"
                                    ? ` · ${(previewEvidence.fileSize / 1024 / 1024).toFixed(2)} MB`
                                    : ""}
                            </DialogDescription>
                        </DialogHeader>
                        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/20 p-3 sm:p-4">
                            {isManufacturingEvidenceVideo(previewEvidence.mimeType, previewEvidence.fileName) ? (
                                <video
                                    src={previewEvidence.url}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    className="h-full max-h-full w-full max-w-full rounded-lg border border-border bg-black object-contain"
                                />
                            ) : (
                                <Image
                                    src={previewEvidence.url}
                                    alt={previewEvidence.fileName || "Evidence file"}
                                    width={1280}
                                    height={720}
                                    unoptimized
                                    className="h-auto max-h-full w-auto max-w-full rounded-lg border border-border object-contain"
                                />
                            )}
                        </div>
                        <DialogFooter className="w-full shrink-0 flex-row justify-end border-t border-border bg-background px-4 py-3">
                            <Button type="button" variant="outline" onClick={() => setEvidenceExpanded(false)} className="min-h-10 min-w-20">
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
                            const actorName = auditActorName(entry.actorId, entry.actorLabel, controller.inspectorNamesById);
                            return (
                                <div key={`full-${entry.key}-${index}`} className="rounded-xl border border-border bg-muted/20 p-3 space-y-1.5">
                                    <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1">
                                        <p className="text-xs font-bold text-foreground">
                                            {entry.label}
                                            {entry.routeName ? <span className="font-semibold text-muted-foreground"> · {entry.routeName}</span> : null}
                                        </p>
                                        <span className="font-mono text-[11px] text-muted-foreground shrink-0">{formatAuditTimestamp(entry.timestamp)}</span>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">{entry.actorLabel}: <span className="font-semibold text-foreground">{actorName}</span></p>
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
