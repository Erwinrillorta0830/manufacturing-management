"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open) return;
        setYieldQty("0");
        setHaltReason("");
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
        if (!reason) {
            toast.error("A breakdown reason is required.");
            return;
        }

        const parsedYield = Number(yieldQty);
        if (!Number.isFinite(parsedYield) || parsedYield < 0) {
            toast.error("Reported yield must be a non-negative number.");
            return;
        }

        setSubmitting(true);
        try {
            const response = await fetch("/api/manufacturing/planning-engineering", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "breakdown",
                    jobOrderId,
                    haltedStepId: task.name,
                    yieldQty: parsedYield,
                    haltReason: reason
                })
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) {
                throw new Error(payload?.error || "Failed to report the workstation breakdown.");
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
                </div>

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button type="button" variant="destructive" onClick={handleSubmit} disabled={submitting || !task || !haltReason.trim()}>
                        {submitting ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Reporting...</> : "Report Breakdown"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
