/* eslint-disable */
"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, Loader2, RotateCcw, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
    MaterialReturnCandidate,
    MaterialReturnPreview
} from "../types";
import {
    confirmMaterialReturn,
    fetchMaterialReturnCandidates,
    fetchMaterialReturnPreview
} from "../services/qa-api";

type Scope = "pending" | "completed";

function formatQty(value: number): string {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function MaterialReturnsPanel({ onFinalize }: { onFinalize?: (jobOrderId: number) => void }) {
    const [scope, setScope] = React.useState<Scope>("pending");
    const [candidates, setCandidates] = React.useState<MaterialReturnCandidate[]>([]);
    const [loadingCandidates, setLoadingCandidates] = React.useState(true);
    const [candidateError, setCandidateError] = React.useState<string | null>(null);
    const [expandedJoId, setExpandedJoId] = React.useState<number | null>(null);
    const [preview, setPreview] = React.useState<MaterialReturnPreview | null>(null);
    const [loadingPreview, setLoadingPreview] = React.useState(false);
    const [previewError, setPreviewError] = React.useState<string | null>(null);
    const [confirming, setConfirming] = React.useState(false);
    const [destinations, setDestinations] = React.useState<Record<number, string>>({});

    const loadCandidates = React.useCallback(async (targetScope: Scope) => {
        setLoadingCandidates(true);
        setCandidateError(null);
        try {
            const rows = await fetchMaterialReturnCandidates(targetScope);
            setCandidates(rows);
        } catch (error: any) {
            setCandidateError(error?.message || "Failed to load material returns.");
            setCandidates([]);
        } finally {
            setLoadingCandidates(false);
        }
    }, []);

    React.useEffect(() => {
        void loadCandidates(scope);
        setExpandedJoId(null);
        setPreview(null);
        setPreviewError(null);
    }, [scope, loadCandidates]);

    const openPreview = async (jobOrderId: number) => {
        if (expandedJoId === jobOrderId) {
            setExpandedJoId(null);
            setPreview(null);
            setPreviewError(null);
            return;
        }
        setExpandedJoId(jobOrderId);
        setPreview(null);
        setPreviewError(null);
        setDestinations({});
        setLoadingPreview(true);
        try {
            const data = await fetchMaterialReturnPreview(jobOrderId);
            setPreview(data);
        } catch (error: any) {
            setPreviewError(error?.message || "Failed to load the return preview.");
        } finally {
            setLoadingPreview(false);
        }
    };

    const handleConfirm = async () => {
        if (!preview || !expandedJoId) return;
        setConfirming(true);
        try {
            const destinationPayload = preview.lines
                .filter((line) => line.requiresLotSelection)
                .map((line) => ({
                    joMaterialId: line.joMaterialId,
                    mmLotId: Number(destinations[line.joMaterialId] || 0)
                }))
                .filter((entry) => Number.isSafeInteger(entry.mmLotId) && entry.mmLotId > 0);

            const result = await confirmMaterialReturn({
                joId: expandedJoId,
                previewToken: preview.previewToken,
                reason: "QA material return confirmation",
                destinations: destinationPayload.length > 0 ? destinationPayload : undefined
            });

            if (result.noop) {
                toast.info(`No leftover material remained for ${preview.jobOrderNo}.`);
            } else {
                toast.success(`Returned ${formatQty(result.returnedQuantity)} unit(s) from ${preview.jobOrderNo} to the Main Store; released ${result.releasedReservationCount} reservation(s).`);
            }
            setExpandedJoId(null);
            setPreview(null);
            await loadCandidates(scope);
        } catch (error: any) {
            toast.error(error?.message || "Failed to confirm the material return.");
        } finally {
            setConfirming(false);
        }
    };

    const returnableLines = preview?.lines.filter((line) => !line.releaseOnly && line.returnableQuantity > 0) || [];
    const requiresDestination = returnableLines.some((line) => line.requiresLotSelection);
    const missingDestination = returnableLines.some(
        (line) => line.requiresLotSelection && !(Number(destinations[line.joMaterialId] || 0) > 0)
    );

    return (
        <Card>
            <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                    <CardTitle className="text-xl flex items-center gap-2">
                        <RotateCcw className="h-5 w-5 text-primary" />
                        Raw Material Returns
                    </CardTitle>
                    <CardDescription>
                        Return unused floor-staged raw material to its lot/batch before resuming halted Job Orders or closing partially finished runs.
                    </CardDescription>
                </div>
                <div className="flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5" role="group" aria-label="Filter material returns by status">
                    {([
                        { value: "pending", label: "Pending returns (on hold)" },
                        { value: "completed", label: "Completed runs with leftovers" }
                    ] as const).map((option) => (
                        <Button
                            key={option.value}
                            type="button"
                            variant={scope === option.value ? "default" : "ghost"}
                            size="sm"
                            className="min-h-9 rounded-md px-3 text-xs font-bold"
                            onClick={() => setScope(option.value)}
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {loadingCandidates ? (
                    <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" /> Loading material returns...
                    </div>
                ) : candidateError ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                        <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {candidateError}</span>
                        <Button type="button" variant="outline" size="sm" onClick={() => void loadCandidates(scope)}>Retry</Button>
                    </div>
                ) : candidates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center">
                        <CheckCircle2 className="mb-3 h-9 w-9 text-emerald-500" />
                        <h3 className="text-base font-semibold text-foreground">
                            {scope === "pending" ? "No pending material returns" : "No completed runs with leftovers"}
                        </h3>
                        <p className="mt-1 max-w-md text-sm text-muted-foreground">
                            {scope === "pending"
                                ? "Halted Job Orders with unused staged material will appear here for QA confirmation."
                                : "Completed or finished Job Orders that still hold floor-staged material will appear here."}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {candidates.map((candidate) => {
                            const isOpen = expandedJoId === candidate.jobOrderId;
                            return (
                                <div key={candidate.jobOrderId} className="rounded-lg border bg-card shadow-xs">
                                    <button
                                        type="button"
                                        className="flex w-full flex-wrap items-center justify-between gap-3 p-3 text-left"
                                        onClick={() => void openPreview(candidate.jobOrderId)}
                                    >
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                                            <div className="min-w-0">
                                                <p className="font-mono text-sm font-bold text-foreground">{candidate.jobOrderNo}</p>
                                                <p className="truncate text-xs text-muted-foreground">{candidate.productName}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {candidate.returnableQuantity !== null && (
                                                <Badge variant="secondary" className="font-mono text-[11px]">
                                                    {formatQty(candidate.returnableQuantity)} returnable
                                                </Badge>
                                            )}
                                            <Badge variant={candidate.status === "On Hold" || candidate.status === "QA Hold" ? "destructive" : "outline"} className="text-[11px]">
                                                {candidate.status}
                                            </Badge>
                                            {candidate.reconciliationError && <ShieldAlert className="h-4 w-4 text-amber-500" />}
                                        </div>
                                    </button>

                                    {isOpen && (
                                        <div className="space-y-3 border-t p-3">
                                            {loadingPreview ? (
                                                <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                                                    <Loader2 className="h-4 w-4 animate-spin" /> Loading return lines...
                                                </div>
                                            ) : previewError ? (
                                                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                                                    {previewError}
                                                </div>
                                            ) : preview ? (
                                                <>
                                                    {preview.reconciliationError && (
                                                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400" role="alert">
                                                            <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {preview.reconciliationError}</span>
                                                        </div>
                                                    )}
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-xs">
                                                            <thead>
                                                                <tr className="border-b text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                                                                    <th className="py-1.5 pr-3">Material</th>
                                                                    <th className="py-1.5 pr-3">Source lot / batch</th>
                                                                    <th className="py-1.5 pr-3 text-right">Staged</th>
                                                                    <th className="py-1.5 pr-3 text-right">Consumed</th>
                                                                    <th className="py-1.5 pr-3 text-right">Returnable</th>
                                                                    <th className="py-1.5">Destination</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {preview.lines.map((line) => (
                                                                    <tr key={`${line.joMaterialId}-${line.mmLotId}-${line.batchNo}`} className="border-b border-border/40 last:border-0">
                                                                        <td className="py-2 pr-3">
                                                                            <span className="font-semibold text-foreground">{line.productName}</span>
                                                                            {line.releaseOnly && <Badge variant="outline" className="ml-2 text-[9px]">Release only</Badge>}
                                                                        </td>
                                                                        <td className="py-2 pr-3 font-mono text-muted-foreground">{line.batchNo}</td>
                                                                        <td className="py-2 pr-3 text-right font-mono">{formatQty(line.stagedQuantity)}</td>
                                                                        <td className="py-2 pr-3 text-right font-mono">{formatQty(line.consumedQuantity)}</td>
                                                                        <td className="py-2 pr-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{formatQty(line.returnableQuantity)}</td>
                                                                        <td className="py-2">
                                                                            {line.returnableQuantity <= 0 ? (
                                                                                <span className="text-muted-foreground">—</span>
                                                                            ) : line.requiresLotSelection ? (
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <Label htmlFor={`dest-${line.joMaterialId}`} className="text-[10px] text-amber-600 dark:text-amber-400">MM Lot ID</Label>
                                                                                    <Input
                                                                                        id={`dest-${line.joMaterialId}`}
                                                                                        type="number"
                                                                                        min={1}
                                                                                        value={destinations[line.joMaterialId] || ""}
                                                                                        onChange={(event) => setDestinations((prev) => ({ ...prev, [line.joMaterialId]: event.target.value }))}
                                                                                        className="h-7 w-24 text-right font-mono text-xs"
                                                                                    />
                                                                                </div>
                                                                            ) : line.destination?.action === "CREATE" ? (
                                                                                <Badge variant="outline" className="font-mono text-[10px]">New batch {line.destination.batchNo}</Badge>
                                                                            ) : (
                                                                                <Badge variant="secondary" className="font-mono text-[10px]">Same batch</Badge>
                                                                            )}
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                                        <p className="text-xs text-muted-foreground">
                                                            {requiresDestination
                                                                ? "One or more source batches are retired. Enter an active MM Lot ID per line to create the return batch."
                                                                : "Stock returns to the source lot/batch (or a new RTN batch under the same lot)."}
                                                        </p>
                                                        <div className="flex flex-wrap items-center gap-2">
                                                            {onFinalize && (candidate.status === "On Hold" || candidate.status === "QA Hold") && (
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    onClick={() => onFinalize(candidate.jobOrderId)}
                                                                    className="min-h-10 gap-1.5 border-primary/40 text-xs font-bold text-primary hover:bg-primary/10"
                                                                >
                                                                    <ClipboardCheck className="h-3.5 w-3.5" />
                                                                    Finalize / Partial Yield
                                                                </Button>
                                                            )}
                                                            <Button
                                                                type="button"
                                                                onClick={() => void handleConfirm()}
                                                                disabled={confirming || !preview.canReturn || Boolean(preview.reconciliationError) || missingDestination}
                                                                className="min-h-10 gap-2 font-bold"
                                                            >
                                                                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                                                                {confirming ? "Returning..." : `Confirm Return (${formatQty(preview.totals.returnableQuantity)})`}
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
