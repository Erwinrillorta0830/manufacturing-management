/* eslint-disable */
"use client";
import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ImagePlus, Loader2, Trash2, Undo2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { JobOrderCancellationPreview } from "../types";
import { displayJobOrderStatus } from "../../job-order-status";
import { validateManufacturingImage } from "../services/production-yield-image";

interface JobOrderCancellationModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    mode: "cancel" | "return";
    preview: JobOrderCancellationPreview | null;
    loading: boolean;
    submitting: boolean;
    error: string | null;
    onConfirm: (reason: string, cancellationImage?: File | null) => void;
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
    const [cancellationImage, setCancellationImage] = useState<File | null>(null);
    const [cancellationImagePreview, setCancellationImagePreview] = useState<string | null>(null);
    const [cancellationImageError, setCancellationImageError] = useState<string | null>(null);
    const [cancellationImageInputKey, setCancellationImageInputKey] = useState(0);

    useEffect(() => {
        if (!open) return;
        setReason("");
        setCancellationImage(null);
        setCancellationImageError(null);
        setCancellationImagePreview(null);
        setCancellationImageInputKey((current) => current + 1);
    }, [open, mode]);

    useEffect(() => {
        return () => {
            if (cancellationImagePreview) URL.revokeObjectURL(cancellationImagePreview);
        };
    }, [cancellationImagePreview]);

    const returnableLines = useMemo(
        () => (preview?.lines || []).filter((line) => !line.releaseOnly && line.returnableQuantity > 0),
        [preview]
    );
    const releaseOnlyCount = useMemo(
        () => (preview?.lines || []).filter((line) => line.releaseOnly).length,
        [preview]
    );
    const isReturnMode = mode === "return";
    const blocked = Boolean(preview?.blockedReason) && (isReturnMode
        ? Number(preview?.totals.returnableQuantity || 0) > 0 && !preview?.canReturnMaterials
        : !preview?.cancellable);
    const confirmDisabled = loading
        || submitting
        || !preview
        || (isReturnMode
            ? !preview.canReturnMaterials
            : !preview.cancellable || !reason.trim() || !cancellationImage);

    const handleCancellationImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] || null;
        setCancellationImageError(null);
        if (!file) {
            setCancellationImage(null);
            setCancellationImagePreview(null);
            return;
        }

        const validationError = validateManufacturingImage(file, "Cancellation evidence");
        if (validationError) {
            setCancellationImage(null);
            setCancellationImagePreview(null);
            setCancellationImageError(validationError);
            event.target.value = "";
            return;
        }

        setCancellationImage(file);
        setCancellationImagePreview(URL.createObjectURL(file));
    };

    const removeCancellationImage = () => {
        setCancellationImage(null);
        setCancellationImagePreview(null);
        setCancellationImageError(null);
        setCancellationImageInputKey((current) => current + 1);
    };

    const handleConfirm = () => {
        if (confirmDisabled || !preview) return;
        onConfirm(
            isReturnMode ? (reason.trim() || "Return raw materials from Job Order") : reason.trim(),
            isReturnMode ? null : cancellationImage
        );
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
                            ? "Return the unconsumed floor material from this Job Order to its destination lot and MAIN-STORE bin."
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

                            {!isReturnMode && (
                                <div className="space-y-2 rounded-xl border border-dashed border-destructive/40 bg-destructive/5 p-3">
                                    <div className="flex items-center gap-2">
                                        <ImagePlus className="h-4 w-4 text-destructive" />
                                        <label htmlFor="job-order-cancellation-image" className="text-xs font-bold text-foreground">
                                            Cancellation Evidence Image <span className="text-destructive">*</span>
                                        </label>
                                    </div>
                                    <Input
                                        key={cancellationImageInputKey}
                                        id="job-order-cancellation-image"
                                        type="file"
                                        accept="image/jpeg,image/jpg,image/png,image/webp"
                                        required
                                        onChange={handleCancellationImageChange}
                                        disabled={submitting}
                                        aria-describedby="job-order-cancellation-image-help"
                                    />
                                    <p id="job-order-cancellation-image-help" className="text-[11px] text-muted-foreground">
                                        Upload one PNG, JPG, or WEBP image. Maximum size: 5 MB.
                                    </p>
                                    {cancellationImageError && (
                                        <p className="text-[11px] font-semibold text-destructive">{cancellationImageError}</p>
                                    )}
                                    {cancellationImage && cancellationImagePreview && (
                                        <div className="flex items-center gap-3 rounded-lg border bg-background p-2">
                                            <img
                                                src={cancellationImagePreview}
                                                alt="Cancellation evidence preview"
                                                className="h-16 w-16 rounded-md border object-cover"
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs font-semibold">{cancellationImage.name}</p>
                                                <p className="text-[11px] text-muted-foreground">
                                                    {(cancellationImage.size / 1024 / 1024).toFixed(2)} MB
                                                </p>
                                            </div>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon-xs"
                                                onClick={removeCancellationImage}
                                                disabled={submitting}
                                                aria-label="Remove cancellation evidence image"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
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
