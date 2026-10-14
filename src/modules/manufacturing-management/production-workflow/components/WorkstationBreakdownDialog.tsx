"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EvidenceMediaInput } from "./EvidenceMediaInput";
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
    const [breakdownCategory, setBreakdownCategory] = useState("");
    const [haltReason, setHaltReason] = useState("");
    const [evidenceImages, setEvidenceImages] = useState<File[]>([]);
    const [evidenceImageError, setEvidenceImageError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        setYieldQty("0");
        setBreakdownCategory("");
        setHaltReason("");
        setEvidenceImages([]);
        setEvidenceImageError(null);
    }, [open, task?.id]);

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
        if (!breakdownCategory.trim()) {
            toast.error("A breakdown category is required.");
            return;
        }
        if (!reason) {
            toast.error("A root cause is required.");
            return;
        }
        if (evidenceImages.length === 0 || evidenceImageError) {
            toast.error(evidenceImageError || "At least one breakdown evidence image or video is required.");
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
                breakdownCategory: breakdownCategory.trim(),
                rootCause: reason,
                haltReason: reason,
                idempotencyKey: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                    ? crypto.randomUUID()
                    : `breakdown:${jobOrderId}:${task.id}:${Date.now()}`
            };
            const formData = new FormData();
            formData.set("payload", JSON.stringify(requestPayload));
            evidenceImages.forEach((evidenceImage) => {
                formData.append("image", evidenceImage, evidenceImage.name);
            });
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
            <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] min-w-0 max-w-[520px] flex-col overflow-hidden">
                <DialogHeader className="shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" /> Report Workstation Breakdown
                    </DialogTitle>
                    <DialogDescription>
                        Record the halt against this Job Order and routing step. The Job Order will be placed on hold for resolution.
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden py-2">
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
                        <Label htmlFor="breakdown-category">Breakdown category <span className="text-destructive">*</span></Label>
                        <Input
                            id="breakdown-category"
                            value={breakdownCategory}
                            onChange={(event) => setBreakdownCategory(event.target.value)}
                            maxLength={120}
                            placeholder="e.g. Mechanical, electrical, controls"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="breakdown-reason">Root cause <span className="text-destructive">*</span></Label>
                        <Textarea
                            id="breakdown-reason"
                            value={haltReason}
                            onChange={(event) => setHaltReason(event.target.value)}
                            placeholder="Describe the equipment failure or other technical cause..."
                            className="min-h-[110px]"
                        />
                    </div>

                    <div className="min-w-0 space-y-3 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-3">
                        <EvidenceMediaInput
                            id="breakdown-evidence"
                            label="Breakdown evidence"
                            multiple
                            files={evidenceImages}
                            error={evidenceImageError}
                            required
                            disabled={submitting}
                            active={open}
                            onFilesChange={(files, validationError) => {
                                setEvidenceImages(files);
                                setEvidenceImageError(validationError);
                            }}
                        />
                    </div>
                </div>

                <DialogFooter className="shrink-0">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button type="button" variant="destructive" onClick={handleSubmit} disabled={submitting || !task || !breakdownCategory.trim() || !haltReason.trim() || evidenceImages.length === 0 || Boolean(evidenceImageError)}>
                        {submitting ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Reporting...</> : "Report Breakdown"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
