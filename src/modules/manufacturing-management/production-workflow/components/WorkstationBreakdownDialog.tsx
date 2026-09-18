"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { validateManufacturingImage } from "../services/production-yield-image";
import { JobOrder, RoutingTask } from "../types";
import { toast } from "sonner";

interface WorkstationBreakdownDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedJobOrder: JobOrder;
    task: RoutingTask | null;
    onSuccess?: () => void;
}

export function WorkstationBreakdownDialog({
    open,
    onOpenChange,
    selectedJobOrder,
    task,
    onSuccess
}: WorkstationBreakdownDialogProps) {
    const [yieldQty, setYieldQty] = useState("0");
    const [haltReason, setHaltReason] = useState("");
    const [evidenceImage, setEvidenceImage] = useState<File | null>(null);
    const [evidenceImagePreview, setEvidenceImagePreview] = useState<string | null>(null);
    const [evidenceImageError, setEvidenceImageError] = useState<string | null>(null);
    const [evidenceImageInputKey, setEvidenceImageInputKey] = useState(0);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        setYieldQty("0");
        setHaltReason("");
        setEvidenceImage(null);
        setEvidenceImagePreview(null);
        setEvidenceImageError(null);
        setEvidenceImageInputKey((current) => current + 1);
    }, [open, task?.id]);

    useEffect(() => {
        return () => {
            if (evidenceImagePreview) URL.revokeObjectURL(evidenceImagePreview);
        };
    }, [evidenceImagePreview]);

    const handleEvidenceImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] || null;
        setEvidenceImageError(null);
        if (!file) {
            setEvidenceImage(null);
            setEvidenceImagePreview(null);
            return;
        }

        const validationError = validateManufacturingImage(file, "Breakdown evidence");
        if (validationError) {
            setEvidenceImage(null);
            setEvidenceImagePreview(null);
            setEvidenceImageError(validationError);
            event.target.value = "";
            return;
        }

        setEvidenceImage(file);
        setEvidenceImagePreview(URL.createObjectURL(file));
    };

    const removeEvidenceImage = () => {
        setEvidenceImage(null);
        setEvidenceImagePreview(null);
        setEvidenceImageError(null);
        setEvidenceImageInputKey((current) => current + 1);
    };

    const handleSubmit = async () => {
        const jobOrderId = Number(selectedJobOrder.order_id || selectedJobOrder.job_order_id || 0);
        const reason = haltReason.trim();
        if (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0) {
            toast.error("A valid Job Order is required to report a breakdown.");
            return;
        }
        if (!task) {
            toast.error("Select a routing step before reporting a breakdown.");
            return;
        }
        if (!reason) {
            toast.error("A breakdown reason is required.");
            return;
        }
        if (!evidenceImage || evidenceImageError) {
            toast.error("A breakdown evidence image is required.");
            return;
        }

        const parsedYield = Number(yieldQty);
        if (!Number.isFinite(parsedYield) || parsedYield < 0) {
            toast.error("Reported yield must be a non-negative number.");
            return;
        }

        setSubmitting(true);
        try {
            const requestPayload = {
                action: "breakdown",
                jobOrderId,
                joRouteId: task.id,
                haltedStepId: task.name,
                yieldQty: parsedYield,
                reportedYieldQuantity: parsedYield,
                haltReason: reason,
                idempotencyKey: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                    ? crypto.randomUUID()
                    : `breakdown:${jobOrderId}:${task.id}:${Date.now()}`
            };
            const formData = new FormData();
            formData.set("payload", JSON.stringify(requestPayload));
            formData.set("image", evidenceImage, evidenceImage.name);
            const response = await fetch("/api/manufacturing/planning-engineering", {
                method: "PATCH",
                body: formData
            });
            const responsePayload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(responsePayload?.error || "Failed to report the workstation breakdown.");
            }

            toast.success(`Breakdown reported at ${task.name}.`);
            onOpenChange(false);
            onSuccess?.();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Failed to report the workstation breakdown.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-1rem)] sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" /> Report Workstation Breakdown
                    </DialogTitle>
                    <DialogDescription>
                        Record the halt against this Job Order and routing step. The Job Order will be placed on hold for resolution.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                        <div className="font-mono font-bold text-amber-700 dark:text-amber-400">{selectedJobOrder.jo_id}</div>
                        <div className="mt-1 text-muted-foreground">
                            Halted step: <span className="font-semibold text-foreground">{task?.name || "—"}</span>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="breakdown-yield">Reported yield at halt</Label>
                        <Input
                            id="breakdown-yield"
                            type="number"
                            min="0"
                            step="0.000001"
                            value={yieldQty}
                            onChange={(event) => setYieldQty(event.target.value)}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="breakdown-reason">Breakdown reason <span className="text-destructive">*</span></Label>
                        <Textarea
                            id="breakdown-reason"
                            value={haltReason}
                            onChange={(event) => setHaltReason(event.target.value)}
                            placeholder="Describe the equipment issue, material issue, or other production halt..."
                            className="min-h-[110px]"
                        />
                    </div>

                    <div className="space-y-3 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-3">
                        <div className="flex items-center gap-2">
                            <ImagePlus className="h-4 w-4 text-amber-600" />
                            <Label htmlFor="breakdown-evidence-image">
                                Breakdown evidence image <span className="text-destructive">*</span>
                            </Label>
                        </div>
                        <Input
                            key={evidenceImageInputKey}
                            id="breakdown-evidence-image"
                            type="file"
                            accept="image/jpeg,image/jpg,image/png,image/webp"
                            capture="environment"
                            required
                            onChange={handleEvidenceImageChange}
                            disabled={submitting}
                            aria-describedby="breakdown-evidence-image-help"
                        />
                        <p id="breakdown-evidence-image-help" className="text-[11px] text-muted-foreground">
                            Upload one PNG, JPG, or WEBP image. Maximum size: 5 MB.
                        </p>
                        {evidenceImageError && (
                            <p className="text-[11px] font-semibold text-destructive">{evidenceImageError}</p>
                        )}
                        {evidenceImage && evidenceImagePreview && (
                            <div className="flex items-center gap-3 rounded-lg border bg-background p-2">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={evidenceImagePreview} alt="Breakdown evidence preview" className="h-16 w-16 rounded-md border object-cover" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-semibold">{evidenceImage.name}</p>
                                    <p className="text-[11px] text-muted-foreground">{(evidenceImage.size / 1024 / 1024).toFixed(2)} MB</p>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={removeEvidenceImage}
                                    disabled={submitting}
                                    aria-label="Remove breakdown evidence image"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button type="button" variant="destructive" onClick={handleSubmit} disabled={submitting || !task || !haltReason.trim() || !evidenceImage || Boolean(evidenceImageError)}>
                        {submitting ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Reporting...</> : "Report Breakdown"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
