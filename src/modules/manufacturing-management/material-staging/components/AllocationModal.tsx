"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Info, Loader2, PackageCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchAllocationPreview } from "../services/staging-api";
import { createMaterialStagingOperationId } from "../utils/operation-id";
import { hasStagingDelta } from "../utils/allocation-delta";
import {
    exceedsAvailableQuantity,
    getManualAllocationLimit,
    getOverTargetQuantity,
    roundAllocationQuantity as roundQuantity,
    ALLOCATION_QUANTITY_EPSILON
} from "../utils/allocation-quantity";
import { GENERIC_FLOOR_STAGING_BIN } from "../types";
import type {
    AllocationLine,
    AllocationMode,
    AllocationPreview,
    AllocationPreviewPayload,
    AllocatedLot,
    MaterialAllocationPreview,
    MaterialStagingItem,
    StagingCommitPayload,
    StagingJobOrder
} from "../types";

interface AllocationModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeItem: {
        jobOrder: StagingJobOrder;
        material: MaterialStagingItem;
        lot?: AllocatedLot;
    } | null;
    onCommit: (payload: StagingCommitPayload) => Promise<void>;
    isLoading?: boolean;
}

function lineKey(candidate: { mm_lot_id: number; inventory_lot_id: number; batch_no: string }): string {
    return `${candidate.mm_lot_id}:${candidate.inventory_lot_id}:${candidate.batch_no.trim().toLowerCase()}`;
}

function candidateLine(candidate: AllocationPreview["materials"][number]["candidates"][number], materialId: number, quantity: number): AllocationLine {
    return {
        allocation_line_id: `manual-${materialId}-${candidate.inventory_lot_id}`,
        jo_material_id: materialId,
        product_id: candidate.product_id,
        mm_lot_id: candidate.mm_lot_id,
        inventory_lot_id: candidate.inventory_lot_id,
        lot_name: candidate.lot_name,
        batch_no: candidate.batch_no,
        quantity: roundQuantity(quantity),
        available_quantity: candidate.available_quantity
    };
}

function formatDate(value: string | null): string {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

export function AllocationModal({
    isOpen,
    onClose,
    activeItem,
    onCommit,
    isLoading = false
}: AllocationModalProps) {
    if (!activeItem) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-[calc(100vw-2rem)] sm:max-w-5xl min-w-0 max-h-[92vh] overflow-x-hidden overflow-y-auto p-0 gap-0">
                <AllocationForm
                    key={`${activeItem.jobOrder.job_order_id}-${(activeItem.material.jo_material_ids || [activeItem.material.jo_material_id]).join("-")}`}
                    activeItem={activeItem}
                    onCommit={onCommit}
                    onClose={onClose}
                    isLoading={isLoading}
                    isOpen={isOpen}
                />
            </DialogContent>
        </Dialog>
    );
}

function AllocationForm({
    activeItem,
    onCommit,
    onClose,
    isLoading,
    isOpen
}: {
    activeItem: NonNullable<AllocationModalProps["activeItem"]>;
    onCommit: AllocationModalProps["onCommit"];
    onClose: () => void;
    isLoading: boolean;
    isOpen: boolean;
}) {
    const { jobOrder, material } = activeItem;
    const sourceMaterialIds = useMemo(
        () => [...new Set(material.jo_material_ids?.length ? material.jo_material_ids : [material.jo_material_id])],
        [material.jo_material_ids, material.jo_material_id]
    );
    const [mode, setMode] = useState<AllocationMode>("auto");
    const [preview, setPreview] = useState<AllocationPreview | null>(null);
    const [manualLines, setManualLines] = useState<AllocationLine[]>([]);
    const [manualInputValues, setManualInputValues] = useState<Record<string, string>>({});
    const [manualInputErrors, setManualInputErrors] = useState<Record<string, string>>({});
    const [remarks, setRemarks] = useState(`Staging materials for JO #${jobOrder.job_order_no}`);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const selectedMaterialPreviews = useMemo(
        () => preview?.materials.filter(item => sourceMaterialIds.includes(item.jo_material_id)) || [],
        [preview, sourceMaterialIds]
    );
    const selectedMaterialPreview: MaterialAllocationPreview | null = useMemo(() => selectedMaterialPreviews.length > 0
        ? {
            ...selectedMaterialPreviews[0],
            required_quantity: selectedMaterialPreviews.reduce((total, item) => total + item.required_quantity, 0),
            staged_quantity: selectedMaterialPreviews.reduce((total, item) => total + item.staged_quantity, 0),
            remaining_quantity: selectedMaterialPreviews.reduce((total, item) => total + item.remaining_quantity, 0),
            shortage_quantity: selectedMaterialPreviews.reduce((total, item) => total + item.shortage_quantity, 0),
            candidates: [...selectedMaterialPreviews.reduce((candidates, item) => {
                for (const candidate of item.candidates) {
                    const key = `${candidate.mm_lot_id}:${candidate.inventory_lot_id}:${candidate.batch_no.trim().toLowerCase()}`;
                    const current = candidates.get(key);
                    if (!current || candidate.available_quantity > current.available_quantity) candidates.set(key, candidate);
                }
                return candidates;
            }, new Map<string, AllocationPreview["materials"][number]["candidates"][number]>()).values()],
            proposed_allocations: selectedMaterialPreviews.flatMap(item => item.proposed_allocations),
            message: selectedMaterialPreviews.find(item => item.message)?.message
        }
        : null,
    [selectedMaterialPreviews]);
    const selectedLines = useMemo(() => mode === "auto"
        ? selectedMaterialPreview?.proposed_allocations || []
        : manualLines.filter(line => line.quantity > 0),
    [mode, selectedMaterialPreview, manualLines]);
    const selectedQuantity = roundQuantity(selectedLines.reduce((total, line) => total + line.quantity, 0));
    const remainingQuantity = selectedMaterialPreview?.remaining_quantity ?? Math.max(0, material.required_quantity - material.staged_quantity);
    const overTargetQuantity = getOverTargetQuantity(selectedQuantity, remainingQuantity);
    const hasManualInputErrors = mode === "manual" && Object.keys(manualInputErrors).length > 0;
    // Staging is raw-material level: everything stages to the generic floor bin.
    const targetBin = GENERIC_FLOOR_STAGING_BIN;
    // Inventory delta vs the staged baseline: quantity adjustment, lot
    // reassignment, or destination-bin change. Re-entering the identical
    // staged allocation (e.g. Re-stage on a Floor Ready material) is not
    // committable.
    const hasDelta = useMemo(() => hasStagingDelta(
        (material.allocations || []).map((lot) => ({
            mm_lot_id: Number(lot.mm_lot_id || 0),
            inventory_lot_id: Number(lot.inventory_lot_id || 0),
            batch_no: lot.batch_no,
            staged_quantity: Number(lot.staged_quantity || 0),
            staging_bin: lot.staging_bin ?? null
        })),
        selectedLines.map((line) => ({
            mm_lot_id: Number(line.mm_lot_id || 0),
            inventory_lot_id: Number(line.inventory_lot_id || 0),
            batch_no: line.batch_no,
            quantity: Number(line.quantity || 0)
        })),
        targetBin || null,
        remainingQuantity
    ), [material.allocations, selectedLines, targetBin, remainingQuantity]);

    const previewPayload = useMemo<AllocationPreviewPayload>(() => ({
        job_order_id: jobOrder.job_order_id,
        job_order_no: jobOrder.job_order_no,
        work_center_id: null,
        mode,
        material_ids: sourceMaterialIds,
        ...(mode === "manual" && manualLines.length > 0 ? { lines: manualLines } : {})
    }), [jobOrder.job_order_id, jobOrder.job_order_no, sourceMaterialIds, mode, manualLines]);

    const loadPreview = async (payload: AllocationPreviewPayload) => {
        setLoadingPreview(true);
        setFormError(null);
        try {
            const nextPreview = await fetchAllocationPreview(payload);
            setPreview(nextPreview);
            if (payload.mode === "auto") {
                setManualLines(nextPreview.proposed_allocations);
            }
        } catch (error) {
            setPreview(null);
            setFormError(error instanceof Error ? error.message : "Unable to load eligible lot and batch options.");
        } finally {
            setLoadingPreview(false);
        }
    };

    useEffect(() => {
        if (!isOpen) return;
        void loadPreview({
            job_order_id: jobOrder.job_order_id,
            job_order_no: jobOrder.job_order_no,
            work_center_id: null,
            mode: "auto",
            material_ids: sourceMaterialIds
        });
        // The dialog is keyed by Job Order/material; loading once per opened
        // allocation keeps the first render read-only until the server answers.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, jobOrder.job_order_id, sourceMaterialIds]);

    const handleModeChange = (nextMode: AllocationMode) => {
        setMode(nextMode);
        setFormError(null);
        if (nextMode === "manual") {
            setManualLines([]);
            setManualInputValues({});
            setManualInputErrors({});
        }
        void loadPreview({ ...previewPayload, mode: nextMode, lines: undefined });
    };

    const getCandidateMaxAllowed = (
        candidate: AllocationPreview["materials"][number]["candidates"][number],
        lines: AllocationLine[] = manualLines
    ) => {
        const key = lineKey(candidate);
        const alreadyAllocatedElsewhere = lines
            .filter(line => lineKey(line) === key && !sourceMaterialIds.includes(line.jo_material_id))
            .reduce((total, line) => total + line.quantity, 0);
        return getManualAllocationLimit(candidate.available_quantity, alreadyAllocatedElsewhere);
    };

    const handleQuantityChange = (candidate: AllocationPreview["materials"][number]["candidates"][number], value: string) => {
        const key = lineKey(candidate);
        setFormError(null);
        setManualInputValues(previous => ({ ...previous, [key]: value }));

        const requestedQuantity = value.trim() === "" ? 0 : Number(value);
        const maxAllowed = getCandidateMaxAllowed(candidate);
        if (!Number.isFinite(requestedQuantity) || requestedQuantity < 0) {
            setManualInputErrors(previous => ({ ...previous, [key]: "Enter a quantity of zero or greater." }));
            return;
        }
        if (exceedsAvailableQuantity(requestedQuantity, maxAllowed)) {
            setManualInputErrors(previous => ({
                ...previous,
                [key]: `Exceeds available stock: only ${maxAllowed.toLocaleString()} ${material.uom} is available from this lot.`
            }));
            return;
        }

        setManualInputErrors(previous => {
            const next = { ...previous };
            delete next[key];
            return next;
        });
        setFormError(null);
        setManualLines(previous => {
            const next = previous.filter(line =>
                !sourceMaterialIds.includes(line.jo_material_id)
                || lineKey({ mm_lot_id: line.mm_lot_id, inventory_lot_id: line.inventory_lot_id, batch_no: line.batch_no }) !== key
            );
            const alreadyAllocatedToCandidate = next
                .filter(line => lineKey({ mm_lot_id: line.mm_lot_id, inventory_lot_id: line.inventory_lot_id, batch_no: line.batch_no }) === key)
                .reduce((total, line) => total + line.quantity, 0);
            let remaining = Math.min(roundQuantity(requestedQuantity), getManualAllocationLimit(candidate.available_quantity, alreadyAllocatedToCandidate));
            const addAllocation = (materialId: number, quantity: number) => {
                if (quantity <= ALLOCATION_QUANTITY_EPSILON) return;
                const existingIndex = next.findIndex(line => line.jo_material_id === materialId && lineKey(line) === key);
                if (existingIndex >= 0) {
                    next[existingIndex] = { ...next[existingIndex], quantity: roundQuantity(next[existingIndex].quantity + quantity) };
                } else {
                    next.push(candidateLine(candidate, materialId, quantity));
                }
            };
            for (const sourcePreview of selectedMaterialPreviews) {
                if (remaining <= 0) break;
                const alreadyAllocatedToMaterial = next
                    .filter(line => line.jo_material_id === sourcePreview.jo_material_id)
                    .reduce((total, line) => total + line.quantity, 0);
                const sourceRemaining = Math.max(0, sourcePreview.remaining_quantity - alreadyAllocatedToMaterial);
                const allocated = Math.min(remaining, sourceRemaining);
                addAllocation(sourcePreview.jo_material_id, allocated);
                remaining = roundQuantity(remaining - allocated);
            }
            if (remaining > ALLOCATION_QUANTITY_EPSILON && selectedMaterialPreviews[0]) {
                addAllocation(selectedMaterialPreviews[0].jo_material_id, remaining);
            }
            return next;
        });
    };

    const setMax = (candidate: AllocationPreview["materials"][number]["candidates"][number]) => {
        handleQuantityChange(candidate, String(getCandidateMaxAllowed(candidate)));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setFormError(null);
        if (hasManualInputErrors) {
            setFormError("Correct the lot quantity errors before staging.");
            return;
        }
        if (remainingQuantity > 0 && selectedQuantity + 0.000001 < remainingQuantity) {
            setFormError(`Allocate at least the expected ${remainingQuantity} ${material.uom} before staging.`);
            return;
        }
        if (selectedLines.length === 0) {
            setFormError("No eligible lot/batch allocation was selected.");
            return;
        }
        if (!hasDelta) {
            setFormError("No quantity, lot, or destination changes vs the staged baseline — nothing to commit.");
            return;
        }

        try {
            const latestPreview = await fetchAllocationPreview({
                ...previewPayload,
                mode,
                lines: mode === "manual" ? selectedLines : undefined
            });
            if (!latestPreview.success || latestPreview.shortages.length > 0) {
                setPreview(latestPreview);
                setFormError("The latest stock check could not fully satisfy this material. Review the allocation rows and try again.");
                return;
            }
            await onCommit({
                job_order_id: jobOrder.job_order_id,
                job_order_no: jobOrder.job_order_no,
                work_center_id: null,
                mode,
                material_ids: sourceMaterialIds,
                lines: latestPreview.proposed_allocations,
                source_bin: "MAIN-STORE",
                operation_id: createMaterialStagingOperationId(),
                preview_token: latestPreview.preview_token,
                remarks: remarks.trim()
            });
        } catch (error) {
            setFormError(error instanceof Error ? error.message : "Material staging failed.");
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex min-w-0 w-full flex-col">
            <div className="min-w-0 border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
                            <PackageCheck className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-lg font-bold">Allocate Material to Floor Staging</DialogTitle>
                            <DialogDescription className="mt-1 text-xs">
                                Review exact raw-material lots and batches before posting the single staging issue.
                            </DialogDescription>
                            <div className="mt-2 flex min-w-0 flex-wrap gap-2 text-xs">
                                <Badge variant="outline" className="font-mono">JO #{jobOrder.job_order_no}</Badge>
                                <Badge variant="outline" className="max-w-full truncate">{material.product_name}</Badge>
                                <Badge variant="outline">Expected Quantity: {remainingQuantity.toLocaleString()} {material.uom}</Badge>
                            </div>
                        </div>
                    </div>
                    <div className="w-full min-w-0 space-y-1 sm:w-[220px]">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Target bin</Label>
                        <div className="font-mono text-xs text-foreground">{targetBin}</div>
                        <div className="text-[11px] text-muted-foreground">Generic floor bin (raw-material level staging)</div>
                    </div>
                </div>
            </div>

            <div className="min-w-0 space-y-5 p-6">
                <div className="grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => handleModeChange("auto")} className={`rounded-xl border p-4 text-left transition ${mode === "auto" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:bg-muted/40"}`}>
                        <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> Auto FEFO</div>
                        <p className="mt-1 text-xs text-muted-foreground">Use earliest valid expiry, then manufacturing date and inventory-lot ID.</p>
                    </button>
                    <button type="button" onClick={() => handleModeChange("manual")} className={`rounded-xl border p-4 text-left transition ${mode === "manual" ? "border-primary bg-primary/5 ring-1 ring-primary/20" : "border-border hover:bg-muted/40"}`}>
                        <div className="flex items-center gap-2 text-sm font-semibold"><ChevronDown className="h-4 w-4 text-primary" /> Manual Allocation</div>
                        <p className="mt-1 text-xs text-muted-foreground">Choose one or more exact lot/batch rows and enter the quantity for each.</p>
                    </button>
                </div>

                {loadingPreview ? (
                    <div className="flex items-center justify-center rounded-xl border border-dashed border-border p-10 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking eligible inventory lots and batches…</div>
                ) : selectedMaterialPreview ? (
                    <div className="min-w-0 max-w-full overflow-hidden rounded-xl border border-border">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 p-3">
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-wider">Eligible lots and batches</div>
                                <div className="text-[11px] text-muted-foreground">Only active, non-expired, QA-valid canonical inventory lots are selectable.</div>
                            </div>
                            <Badge variant={selectedQuantity >= remainingQuantity ? "default" : "secondary"} className="text-[11px]">Selected {selectedQuantity.toLocaleString()} / Expected {remainingQuantity.toLocaleString()} {material.uom}</Badge>
                        </div>
                        {selectedMaterialPreview.candidates.length === 0 ? (
                            <div className="p-8 text-center text-xs text-muted-foreground">No eligible lot/batch inventory is available for this material.</div>
                        ) : (
                            <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain">
                                <table className="w-full min-w-[680px] text-xs">
                                    <thead className="bg-muted/20 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                                        <tr>
                                            <th className="p-3">Lot</th><th className="p-3">Batch</th><th className="p-3">Expiry</th><th className="p-3">QA</th><th className="p-3 text-right">Available</th><th className="p-3 text-right">Allocate</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedMaterialPreview.candidates.map(candidate => {
                                            const candidateKey = lineKey(candidate);
                                            const selectedQuantityForCandidate = selectedLines
                                                .filter(line => lineKey(line) === candidateKey)
                                                .reduce((total, line) => total + line.quantity, 0);
                                            const maxAllowed = getCandidateMaxAllowed(candidate);
                                            const inputError = manualInputErrors[candidateKey];
                                            return (
                                                <tr key={candidate.allocation_line_id} className="border-t border-border/70">
                                                    <td className="p-3 font-medium">{candidate.lot_name}<div className="font-mono text-[10px] text-muted-foreground">MM Lot #{candidate.mm_lot_id} · Inv Lot #{candidate.inventory_lot_id}</div></td>
                                                    <td className="p-3 font-mono">{candidate.batch_no}</td>
                                                    <td className="p-3">{formatDate(candidate.expiry_date)}</td>
                                                    <td className="p-3"><Badge variant="outline" className="text-[10px]">{candidate.qa_status}</Badge></td>
                                                    <td className="p-3 text-right font-mono font-semibold text-emerald-600">{candidate.available_quantity.toLocaleString()}</td>
                                                    <td className="p-3">
                                                        {mode === "auto" ? (
                                                            <div className="text-right font-mono font-semibold">{selectedQuantityForCandidate.toLocaleString()}</div>
                                                        ) : (
                                                            <div className="space-y-1.5">
                                                                <div className="flex items-center justify-end gap-1.5">
                                                                    <Input
                                                                        type="number"
                                                                        min="0"
                                                                        max={maxAllowed}
                                                                        step="0.000001"
                                                                        value={manualInputValues[candidateKey] ?? (selectedQuantityForCandidate || "")}
                                                                        onChange={event => handleQuantityChange(candidate, event.target.value)}
                                                                        aria-invalid={Boolean(inputError)}
                                                                        aria-describedby={inputError ? `${candidate.allocation_line_id}-availability-error` : undefined}
                                                                        className="h-8 w-28 text-right text-xs"
                                                                    />
                                                                    <Button type="button" variant="outline" size="sm" onClick={() => setMax(candidate)} className="h-8 px-2 text-[10px]">Max</Button>
                                                                </div>
                                                                {inputError && (
                                                                    <div id={`${candidate.allocation_line_id}-availability-error`} role="alert" className="max-w-48 text-right text-[10px] text-destructive">
                                                                        {inputError}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {mode === "manual" && overTargetQuantity > ALLOCATION_QUANTITY_EPSILON && (
                            <div className="flex items-start gap-2 border-t border-primary/20 bg-primary/5 p-3 text-xs text-primary">
                                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>Exceeds Target: +{overTargetQuantity.toLocaleString(undefined, { maximumFractionDigits: 6 })} {material.uom}. The extra quantity will remain staged as a floor buffer.</span>
                            </div>
                        )}
                        {selectedMaterialPreview.shortage_quantity > 0 && <div className="flex items-start gap-2 border-t border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{selectedMaterialPreview.message || `Shortage: ${selectedMaterialPreview.shortage_quantity} ${material.uom}`}</div>}
                    </div>
                ) : null}

                <div className="space-y-1.5">
                    <Label htmlFor="staging-remarks" className="text-xs">Remarks <span className="text-muted-foreground">(optional)</span></Label>
                    <Input id="staging-remarks" value={remarks} onChange={event => setRemarks(event.target.value)} className="text-xs" />
                </div>
                {formError && <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{formError}</div>}
                {!formError && preview && !hasDelta && (
                    <div className="text-xs text-muted-foreground">No quantity, lot, or destination changes vs the staged baseline — Commit is disabled.</div>
                )}
            </div>

            <DialogFooter className="w-full min-w-0 border-t border-border bg-muted/10 p-5">
                <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
                <Button type="submit" disabled={isLoading || loadingPreview || !preview || hasManualInputErrors || selectedQuantity + 0.000001 < remainingQuantity || !hasDelta} title={hasManualInputErrors ? "Correct lot quantity errors before staging" : !hasDelta ? "No changes vs the staged baseline" : undefined}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Staging…</> : <><CheckCircle2 className="mr-2 h-4 w-4" />Commit Staging Issue</>}
                </Button>
            </DialogFooter>
        </form>
    );
}

export default AllocationModal;
