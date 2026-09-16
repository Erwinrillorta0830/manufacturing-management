"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addReservedMaterial } from "../services/production-api";
import type { MaterialCandidateLot } from "../types";

export interface TopUpTarget {
    jobOrderId: number;
    joMaterialId: number;
    productId: number;
    productName: string;
    unitShortcut: string;
    uomId: number | null;
    remainingWip: number;
    theoretical: number;
    shortfall: number;
    candidateLots: MaterialCandidateLot[];
    isSubAssembly?: boolean;
}

interface AddReservedMaterialDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    target: TopUpTarget | null;
    onAdded: () => Promise<void> | void;
}

function formatQuantity(value: number): string {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function candidateKey(candidate: MaterialCandidateLot): string {
    return [
        candidate.source_type || "UNKNOWN",
        candidate.receipt_id ?? "NO-RECEIPT",
        candidate.mm_lot_id ?? "NO-MM-LOT",
        candidate.inventory_lot_id ?? "NO-INVENTORY-LOT",
        candidate.lot_no,
        candidate.expiry_date || ""
    ].join(":");
}

export function AddReservedMaterialDialog({
    open,
    onOpenChange,
    target,
    onAdded
}: AddReservedMaterialDialogProps) {
    const [selectedKey, setSelectedKey] = useState("");
    const [quantity, setQuantity] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [idempotencyKey, setIdempotencyKey] = useState("");

    const candidates = useMemo(
        () => (target?.candidateLots || []).filter((candidate) => Number(candidate.available || 0) > 0),
        [target]
    );

    useEffect(() => {
        if (!open) return;
        setError(null);
        setSubmitting(false);
        setSelectedKey("");
        setQuantity("");
        setIdempotencyKey(
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `wip-top-up-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
        );
    }, [open, target]);

    const selectedLot = candidates.find((candidate) => candidateKey(candidate) === selectedKey) || null;
    const maxQuantity = selectedLot ? Number(selectedLot.available || 0) : 0;
    const effectiveQuantity = Number(quantity || 0);
    const isSubmitDisabled = submitting
        || !selectedLot
        || !Number.isFinite(effectiveQuantity)
        || effectiveQuantity <= 0
        || effectiveQuantity > maxQuantity + 0.000001;

    const useShortfall = () => {
        if (!target) return;
        setQuantity(String(Math.min(target.shortfall, maxQuantity) || maxQuantity || ""));
    };

    const handleSubmit = async () => {
        if (!target) return;
        if (!selectedLot) {
            setError("Select a lot to add to the WIP reservation.");
            return;
        }
        if (!Number.isFinite(effectiveQuantity) || effectiveQuantity <= 0) {
            setError("Enter a quantity greater than zero.");
            return;
        }
        if (effectiveQuantity > maxQuantity + 0.000001) {
            setError(`Only ${formatQuantity(maxQuantity)} ${target.unitShortcut} are available on this lot.`);
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const sourceType = selectedLot.source_type === "MANUFACTURING" || selectedLot.receipt_no === "MANUFACTURING"
                ? "MANUFACTURING"
                : "RAW_MATERIAL";
            const candidateReceiptId = Number(selectedLot.receipt_id || 0);
            const candidateMmLotId = Number(selectedLot.mm_lot_id || 0);
            const candidateInventoryLotId = Number(selectedLot.inventory_lot_id || 0);
            const response = await addReservedMaterial({
                jobOrderId: target.jobOrderId,
                joMaterialId: target.joMaterialId,
                productId: target.productId,
                sourceType,
                receiptId: sourceType === "RAW_MATERIAL" && candidateReceiptId > 0 ? candidateReceiptId : null,
                mmLotId: candidateMmLotId > 0
                    ? candidateMmLotId
                    : sourceType === "MANUFACTURING" && candidateReceiptId > 0 ? candidateReceiptId : null,
                inventoryLotId: candidateInventoryLotId > 0 ? candidateInventoryLotId : null,
                batchNo: selectedLot.lot_no,
                uomId: target.uomId,
                quantity: effectiveQuantity,
                idempotencyKey,
                remarks: `WIP top-up from End-of-Shift session for ${target.productName}`
            });
            toast.success(response.message || "Reserved materials added to the WIP pool.");
            await onAdded();
            onOpenChange(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to add reserved materials.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[96vw] md:w-full md:max-w-[720px] max-h-[92vh] flex flex-col bg-background border border-border/80 shadow-2xl rounded-2xl p-0 overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-background p-4 sm:p-5 border-b border-border/50 shrink-0">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-emerald-500/10 rounded-2xl text-emerald-600 border border-emerald-500/20 shadow-sm">
                                <PackagePlus className="h-5 w-5" />
                            </div>
                            <div>
                                <DialogTitle className="font-extrabold text-lg tracking-tight text-foreground">
                                    Add Raw Materials
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                    Reserve more of {target?.productName || "this material"} into the Job Order WIP pool, then record the session consumption.
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 min-h-0">
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl border bg-muted/20 p-2.5">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Theoretical</div>
                            <div className="font-mono text-xs font-bold text-foreground">{formatQuantity(target?.theoretical || 0)} {target?.unitShortcut}</div>
                        </div>
                        <div className="rounded-xl border bg-muted/20 p-2.5">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Remaining WIP</div>
                            <div className="font-mono text-xs font-bold text-foreground">{formatQuantity(target?.remainingWip || 0)} {target?.unitShortcut}</div>
                        </div>
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5">
                            <div className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Shortfall</div>
                            <div className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400">{formatQuantity(target?.shortfall || 0)} {target?.unitShortcut}</div>
                        </div>
                    </div>

                    {candidates.length === 0 ? (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center text-xs font-semibold text-amber-700 dark:text-amber-400" role="status">
                            No eligible lots are available for this material on the Job Order branch.
                            Replenish inventory or process the received lots before adding materials.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Eligible lots</span>
                                {target?.shortfall ? (
                                    <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[10px] font-bold" onClick={useShortfall}>
                                        Use shortfall
                                    </Button>
                                ) : null}
                            </div>
                            <div className="overflow-hidden rounded-xl border">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-muted/40 text-[10px] font-bold uppercase text-muted-foreground">
                                        <tr>
                                            <th className="p-2.5">Storage lot</th>
                                            <th className="p-2.5">Batch</th>
                                            <th className="p-2.5">Source</th>
                                            <th className="p-2.5">Expiry</th>
                                            <th className="p-2.5 text-right">Available</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {candidates.map((candidate) => {
                                            const key = candidateKey(candidate);
                                            const isSelected = key === selectedKey;
                                            return (
                                                <tr
                                                    key={key}
                                                    onClick={() => {
                                                        setSelectedKey(key);
                                                        setError(null);
                                                    }}
                                                    className={`cursor-pointer transition-colors ${isSelected ? "bg-emerald-500/10" : "hover:bg-muted/40"}`}
                                                    aria-selected={isSelected}
                                                >
                                                    <td className="p-2.5 font-semibold text-foreground">
                                                        {candidate.storage_lot_name || "Unnamed storage lot"}
                                                    </td>
                                                    <td className="p-2.5 font-mono font-bold text-foreground">{candidate.lot_no}</td>
                                                    <td className="p-2.5 text-[11px] text-muted-foreground">
                                                        {candidate.receipt_no || (candidate.source_type === "INVENTORY" ? "Inventory movement" : "Receiving")}
                                                    </td>
                                                    <td className="p-2.5 text-[11px] text-muted-foreground">{candidate.expiry_date || "N/A"}</td>
                                                    <td className="p-2.5 text-right font-mono font-bold">
                                                        {formatQuantity(Number(candidate.available || 0))}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap items-end gap-3">
                        <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Quantity to add</span>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min="0.000001"
                                    step="0.000001"
                                    max={maxQuantity || undefined}
                                    value={quantity}
                                    onChange={(event) => {
                                        const raw = event.target.value;
                                        if (raw === "") {
                                            setQuantity("");
                                            return;
                                        }
                                        const parsed = Number(raw);
                                        if (!Number.isFinite(parsed)) return;
                                        setQuantity(String(Math.min(Math.max(0, parsed), maxQuantity)));
                                    }}
                                    disabled={!selectedLot || submitting}
                                    className="h-9 w-36 font-mono text-right text-xs font-bold"
                                    aria-label="Quantity to add"
                                />
                                <span className="text-[11px] font-semibold text-muted-foreground">{target?.unitShortcut}</span>
                            </div>
                        </div>
                        {selectedLot && (
                            <Badge variant="outline" className="mb-1 border-emerald-500/30 bg-emerald-500/10 text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                                Max {formatQuantity(maxQuantity)} {target?.unitShortcut} on {selectedLot.lot_no}
                            </Badge>
                        )}
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-[11px] font-semibold text-red-700 dark:text-red-400" role="alert">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t border-border/50 p-4 shrink-0">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} className="h-9 text-xs font-semibold">
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={isSubmitDisabled}
                        className="h-9 bg-emerald-600 text-xs font-bold text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-500"
                    >
                        {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackagePlus className="mr-1.5 h-4 w-4" />}
                        {submitting ? "Adding..." : "Add to WIP Reservation"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
