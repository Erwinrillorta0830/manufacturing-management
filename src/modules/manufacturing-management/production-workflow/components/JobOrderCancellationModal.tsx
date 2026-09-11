/* eslint-disable */
"use client";
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Undo2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JobOrderCancellationPreview } from "../types";
import { displayJobOrderStatus } from "../../job-order-status";

interface JobOrderCancellationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: "cancel" | "return";
    preview: JobOrderCancellationPreview | null;
    loading: boolean;
    submitting: boolean;
    error: string | null;
    onConfirm: (reason: string) => void;
}

function formatQuantity(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function JobOrderCancellationModal({
    open,
    onOpenChange,
    mode,
    preview,
    loading,
    submitting,
    error,
    onConfirm
}: JobOrderCancellationModalProps) {
    const [reason, setReason] = useState("");

    useEffect(() => {
        if (open) setReason("");
    }, [open, mode]);

    const returnableLines = useMemo(
        () => (preview?.lines || []).filter((line) => !line.releaseOnly && line.returnableQuantity > 0),
        [preview]
    );
    const releaseOnlyCount = useMemo(
        () => (preview?.lines || []).filter((line) => line.releaseOnly).length,
        [preview]
    );
    const isReturnMode = mode === "return";
    const blocked = Boolean(preview?.blockedReason) && (isReturnMode ? !preview?.canReturnMaterials : !preview?.cancellable);
    const confirmDisabled = loading
        || submitting
        || !preview
        || (isReturnMode ? !preview.canReturnMaterials : !preview.cancellable || !reason.trim());

    const handleConfirm = () => {
        if (confirmDisabled || !preview) return;
        onConfirm(isReturnMode ? (reason.trim() || "Return raw materials from cancelled Job Order") : reason.trim());
    };

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!submitting) onOpenChange(next); }}>
            <DialogContent className="w-[98vw] md:w-full md:max-w-[980px] max-h-[92vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-5 border-b border-border/50 bg-muted/10 shrink-0">
                    <DialogTitle className="flex items-center gap-2 text-lg font-extrabold">
                        {isReturnMode ? <Undo2 className="h-5 w-5 text-amber-500" /> : <XCircle className="h-5 w-5 text-destructive" />}
                        {isReturnMode ? "Return Raw Materials" : "Cancel Job Order"}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        {isReturnMode
                            ? "Return the unconsumed floor material of a cancelled Job Order to its original lot and MAIN-STORE bin."
                            : "Return all unconsumed floor material, release reservations, and mark the Job Order as Cancelled."}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
                    {loading && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6 justify-center">
                            <Loader2 className="h-4 w-4 animate-spin" /> Loading cancellation preview...
                        </div>
                    )}

                    {!loading && preview && (
                        <>
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-3 border rounded-xl bg-card">
                                <div className="space-y-0.5">
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Job Order</span>
                                    <span className="font-mono font-bold text-sm">{preview.jobOrderNo}</span>
                                </div>
                                <div className="space-y-0.5">
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Product</span>
                                    <span className="text-sm font-semibold">{preview.productName}</span>
                                </div>
                                <div className="space-y-0.5">
                                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Status</span>
                                    <Badge variant="outline" className="font-mono text-[10px]">{displayJobOrderStatus(preview.status)}</Badge>
                                </div>
                                <div className="ml-auto flex items-center gap-5 text-right">
                                    <div>
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Staged</span>
                                        <span className="font-mono font-bold text-sm">{formatQuantity(preview.totals.stagedQuantity)}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Consumed</span>
                                        <span className="font-mono font-bold text-sm">{formatQuantity(preview.totals.consumedQuantity)}</span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Returnable</span>
                                        <span className="font-mono font-bold text-sm text-emerald-600">{formatQuantity(preview.totals.returnableQuantity)}</span>
                                    </div>
                                </div>
                            </div>

                            {blocked && (
                                <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <span>{preview.blockedReason}</span>
                                </div>
                            )}

                            {returnableLines.length > 0 ? (
                                <div className="border rounded-xl overflow-hidden">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Product</TableHead>
                                                <TableHead>Lot / Batch</TableHead>
                                                <TableHead className="text-right">Staged</TableHead>
                                                <TableHead className="text-right">Consumed</TableHead>
                                                <TableHead className="text-right">Returnable</TableHead>
                                                <TableHead>Bin Reversal</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {returnableLines.map((line, idx) => (
                                                <TableRow key={`${line.joMaterialId}-${line.mmLotId}-${line.batchNo}-${idx}`}>
                                                    <TableCell className="text-xs font-semibold">{line.productName}</TableCell>
                                                    <TableCell className="font-mono text-xs">{line.batchNo || `Lot #${line.mmLotId}`}</TableCell>
                                                    <TableCell className="text-right font-mono text-xs">{formatQuantity(line.stagedQuantity)}</TableCell>
                                                    <TableCell className="text-right font-mono text-xs">{formatQuantity(line.consumedQuantity)}</TableCell>
                                                    <TableCell className="text-right font-mono text-xs font-bold text-emerald-600">
                                                        {formatQuantity(line.returnableQuantity)} {line.uomShortcut}
                                                    </TableCell>
                                                    <TableCell className="text-[10px] font-mono text-muted-foreground">
                                                        {line.sourceBin} → {line.targetBin}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            ) : (
                                !blocked && (
                                    <div className="p-4 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                                        {isReturnMode
                                            ? "No outstanding returnable material for this Job Order."
                                            : "No floor material is staged for this Job Order; the cancellation will only release reservations."}
                                    </div>
                                )
                            )}

                            {releaseOnlyCount > 0 && (
                                <p className="text-[11px] text-muted-foreground">
                                    {releaseOnlyCount} soft reservation line(s) will be released without creating inventory movements.
                                </p>
                            )}

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-foreground">
                                    {isReturnMode ? "Return Remarks (optional)" : "Cancellation Reason"}
                                </label>
                                <Textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    placeholder={isReturnMode ? "Optional remarks for the return..." : "State why this Job Order is being cancelled..."}
                                    rows={3}
                                    disabled={submitting}
                                />
                            </div>
                        </>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs font-semibold">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                <DialogFooter className="p-4 border-t border-border/50 bg-muted/10 shrink-0">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Close</Button>
                    <Button
                        variant={isReturnMode ? "default" : "destructive"}
                        onClick={handleConfirm}
                        disabled={confirmDisabled}
                    >
                        {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                        {isReturnMode ? "Return Raw Materials" : "Confirm Cancellation"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
