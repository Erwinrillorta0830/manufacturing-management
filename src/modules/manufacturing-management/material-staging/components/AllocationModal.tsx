"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Loader2, PackageCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchAllocationPreview } from "../services/staging-api";
import type {
    AllocationLine,
    AllocationMode,
    AllocationPreview,
    AllocationPreviewPayload,
    AllocatedLot,
    MaterialStagingItem,
    StagingCommitPayload,
    StagingJobOrder,
    WorkCenter
} from "../types";

interface AllocationModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeItem: {
        jobOrder: StagingJobOrder;
        material: MaterialStagingItem;
        lot?: AllocatedLot;
    } | null;
    workCenters: WorkCenter[];
    onCommit: (payload: StagingCommitPayload) => Promise<void>;
    isLoading?: boolean;
}

function roundQuantity(value: number): number {
    return Number(Math.max(0, value).toFixed(6));
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
    workCenters,
    onCommit,
    isLoading = false
}: AllocationModalProps) {
    if (!activeItem) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl max-h-[92vh] overflow-y-auto p-0 gap-0">
                <AllocationForm
                    key={`${activeItem.jobOrder.job_order_id}-${activeItem.material.jo_material_id}`}
                    activeItem={activeItem}
                    workCenters={workCenters}
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
    workCenters,
    onCommit,
    onClose,
    isLoading,
    isOpen
}: {
    activeItem: NonNullable<AllocationModalProps["activeItem"]>;
    workCenters: WorkCenter[];
    onCommit: AllocationModalProps["onCommit"];
    onClose: () => void;
    isLoading: boolean;
    isOpen: boolean;
}) {
    const { jobOrder, material } = activeItem;
    const defaultWorkCenter = jobOrder.staging_work_center_id || workCenters.find(center => center.is_active !== false)?.work_center_id || 0;
    const [mode, setMode] = useState<AllocationMode>("auto");
    const [selectedWorkCenterId, setSelectedWorkCenterId] = useState(String(defaultWorkCenter || ""));
    const [preview, setPreview] = useState<AllocationPreview | null>(null);
    const [manualLines, setManualLines] = useState<AllocationLine[]>([]);
    const [remarks, setRemarks] = useState(`Staging materials for JO #${jobOrder.job_order_no}`);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const selectedMaterialPreview = preview?.materials.find(item => item.jo_material_id === material.jo_material_id) || null;
    const selectedLines = mode === "auto"
        ? selectedMaterialPreview?.proposed_allocations || []
        : manualLines.filter(line => line.quantity > 0);
    const selectedQuantity = roundQuantity(selectedLines.reduce((total, line) => total + line.quantity, 0));
    const remainingQuantity = selectedMaterialPreview?.remaining_quantity ?? Math.max(0, material.required_quantity - material.staged_quantity);
    const selectedWorkCenter = workCenters.find(center => String(center.work_center_id) === selectedWorkCenterId);
    const targetBin = selectedWorkCenter ? `FLOOR-STAGING-${selectedWorkCenter.work_center_id}` : "";

    const previewPayload = useMemo<AllocationPreviewPayload>(() => ({
        job_order_id: jobOrder.job_order_id,
        job_order_no: jobOrder.job_order_no,
        work_center_id: Number(selectedWorkCenterId),
        mode,
        material_ids: [material.jo_material_id],
        ...(mode === "manual" && manualLines.length > 0 ? { lines: manualLines } : {})
    }), [jobOrder.job_order_id, jobOrder.job_order_no, material.jo_material_id, mode, selectedWorkCenterId, manualLines]);

    const loadPreview = async (payload: AllocationPreviewPayload) => {
        if (!payload.work_center_id) {
            setFormError("Select an active target work center before loading allocations.");
            return;
        }
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
            work_center_id: Number(selectedWorkCenterId),
            mode: "auto",
            material_ids: [material.jo_material_id]
        });
        // The dialog is keyed by Job Order/material; loading once per opened
        // allocation keeps the first render read-only until the server answers.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, jobOrder.job_order_id, material.jo_material_id]);

    const handleModeChange = (nextMode: AllocationMode) => {
        setMode(nextMode);
        setFormError(null);
        if (nextMode === "manual") setManualLines([]);
        void loadPreview({ ...previewPayload, mode: nextMode, lines: undefined });
    };

    const handleQuantityChange = (candidate: AllocationPreview["materials"][number]["candidates"][number], value: string) => {
        const nextQuantity = roundQuantity(Number(value) || 0);
        setManualLines(previous => {
            const key = lineKey(candidate);
            const next = previous.filter(line => lineKey(line) !== key);
            if (nextQuantity > 0) next.push(candidateLine(candidate, material.jo_material_id, nextQuantity));
            return next;
        });
    };

    const setMax = (candidate: AllocationPreview["materials"][number]["candidates"][number]) => {
        handleQuantityChange(candidate, String(candidate.available_quantity));
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setFormError(null);
        if (!selectedWorkCenter || !targetBin) {
            setFormError("Select an active target work center.");
            return;
        }
        if (remainingQuantity > 0 && selectedQuantity + 0.000001 < remainingQuantity) {
            setFormError(`Allocate the full remaining ${remainingQuantity} ${material.uom} before staging.`);
            return;
        }
        if (selectedLines.length === 0) {
            setFormError("No eligible lot/batch allocation was selected.");
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
                work_center_id: selectedWorkCenter.work_center_id,
                mode,
                material_ids: [material.jo_material_id],
                lines: latestPreview.proposed_allocations,
                source_bin: "MAIN-STORE",
                operation_id: crypto.randomUUID(),
                preview_token: latestPreview.preview_token,
                remarks: remarks.trim()
            });
        } catch (error) {
            setFormError(error instanceof Error ? error.message : "Material staging failed.");
        }
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col">
            <div className="border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
                            <PackageCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold">Allocate Material to Floor Staging</DialogTitle>
                            <DialogDescription className="mt-1 text-xs">
                                Review exact raw-material lots and batches before posting the single staging issue.
                            </DialogDescription>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                                <Badge variant="outline" className="font-mono">JO #{jobOrder.job_order_no}</Badge>
                                <Badge variant="outline">{material.product_name}</Badge>
                                <Badge variant="outline">Remaining: {remainingQuantity.toLocaleString()} {material.uom}</Badge>
                            </div>
                        </div>
                    </div>
                    <div className="min-w-[220px] space-y-1">
                        <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Target work center</Label>
                        <Select value={selectedWorkCenterId} onValueChange={(value) => {
                            setSelectedWorkCenterId(value);
                            setPreview(null);
                            void loadPreview({ ...previewPayload, work_center_id: Number(value), lines: undefined });
                        }}>
                            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select work center" /></SelectTrigger>
                            <SelectContent>
                                {workCenters.filter(center => center.is_active !== false).map(center => (
                                    <SelectItem key={center.work_center_id} value={String(center.work_center_id)} className="text-xs">
                                        {center.work_center_name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="text-[11px] text-muted-foreground">Derived target bin: <span className="font-mono text-foreground">{targetBin || "—"}</span></div>
                    </div>
                </div>
            </div>

            <div className="space-y-5 p-6">
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
                    <div className="overflow-hidden rounded-xl border border-border">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/30 p-3">
                            <div>
                                <div className="text-xs font-semibold uppercase tracking-wider">Eligible lots and batches</div>
                                <div className="text-[11px] text-muted-foreground">Only active, non-expired, QA-valid canonical inventory lots are selectable.</div>
                            </div>
                            <Badge variant={selectedQuantity >= remainingQuantity ? "default" : "secondary"} className="text-[11px]">Selected {selectedQuantity.toLocaleString()} / {remainingQuantity.toLocaleString()} {material.uom}</Badge>
                        </div>
                        {selectedMaterialPreview.candidates.length === 0 ? (
                            <div className="p-8 text-center text-xs text-muted-foreground">No eligible lot/batch inventory is available for this material.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[760px] text-xs">
                                    <thead className="bg-muted/20 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                                        <tr>
                                            <th className="p-3">Lot</th><th className="p-3">Batch</th><th className="p-3">Expiry</th><th className="p-3">QA</th><th className="p-3 text-right">On-hand</th><th className="p-3 text-right">Available</th><th className="p-3 text-right">Allocate</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedMaterialPreview.candidates.map(candidate => {
                                            const selected = selectedLines.find(line => lineKey(line) === lineKey(candidate));
                                            return (
                                                <tr key={candidate.allocation_line_id} className="border-t border-border/70">
                                                    <td className="p-3 font-medium">{candidate.lot_name}<div className="font-mono text-[10px] text-muted-foreground">MM Lot #{candidate.mm_lot_id} · Inv Lot #{candidate.inventory_lot_id}</div></td>
                                                    <td className="p-3 font-mono">{candidate.batch_no}</td>
                                                    <td className="p-3">{formatDate(candidate.expiry_date)}</td>
                                                    <td className="p-3"><Badge variant="outline" className="text-[10px]">{candidate.qa_status}</Badge></td>
                                                    <td className="p-3 text-right font-mono">{candidate.on_hand_quantity.toLocaleString()}</td>
                                                    <td className="p-3 text-right font-mono font-semibold text-emerald-600">{candidate.available_quantity.toLocaleString()}</td>
                                                    <td className="p-3">
                                                        {mode === "auto" ? (
                                                            <div className="text-right font-mono font-semibold">{selected?.quantity?.toLocaleString() || "0"}</div>
                                                        ) : (
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <Input type="number" min="0" step="0.000001" value={selected?.quantity || ""} onChange={event => handleQuantityChange(candidate, event.target.value)} className="h-8 w-28 text-right text-xs" />
                                                                <Button type="button" variant="outline" size="sm" onClick={() => setMax(candidate)} className="h-8 px-2 text-[10px]">Max</Button>
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
                        {selectedMaterialPreview.shortage_quantity > 0 && <div className="flex items-start gap-2 border-t border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{selectedMaterialPreview.message || `Shortage: ${selectedMaterialPreview.shortage_quantity} ${material.uom}`}</div>}
                    </div>
                ) : null}

                <div className="space-y-1.5">
                    <Label htmlFor="staging-remarks" className="text-xs">Remarks <span className="text-muted-foreground">(optional)</span></Label>
                    <Input id="staging-remarks" value={remarks} onChange={event => setRemarks(event.target.value)} className="text-xs" />
                </div>
                {formError && <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{formError}</div>}
            </div>

            <DialogFooter className="border-t border-border bg-muted/10 p-5">
                <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>Cancel</Button>
                <Button type="submit" disabled={isLoading || loadingPreview || !preview || selectedQuantity + 0.000001 < remainingQuantity}>
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Staging…</> : <><CheckCircle2 className="mr-2 h-4 w-4" />Commit Staging Issue</>}
                </Button>
            </DialogFooter>
        </form>
    );
}

export default AllocationModal;
