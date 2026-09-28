"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { addReservedMaterial } from "../services/production-api";
import { allocateTopUpQuantity, isEligibleRawMaterialTopUpLot, orderTopUpCandidates } from "../utils/wip-top-up-allocation";
import type { MaterialCandidateLot, WipTopUpAllocation } from "../types";

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
    preferredLot: {
        mmLotId: number | null;
        inventoryLotId: number | null;
        batchNo: string | null;
    };
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

function sourceTypeFor(candidate: MaterialCandidateLot): WipTopUpAllocation["sourceType"] {
    return candidate.source_type === "MANUFACTURING" || candidate.receipt_no === "MANUFACTURING"
        ? "MANUFACTURING"
        : "RAW_MATERIAL";
}

export function AddReservedMaterialDialog({
    open,
    onOpenChange,
    target,
    onAdded
}: AddReservedMaterialDialogProps) {
    const [quantities, setQuantities] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [idempotencyKey, setIdempotencyKey] = useState("");

    const candidates = useMemo(() => {
        if (!target) return [];
        const availableLots = (target.candidateLots || []).filter((candidate) => Number(candidate.available || 0) > 0);
        const eligibleLots = target.isSubAssembly
            ? availableLots
            : availableLots.filter((candidate) => isEligibleRawMaterialTopUpLot(candidate));
        return orderTopUpCandidates(eligibleLots, target.preferredLot);
    }, [target]);

    const automaticAllocations = useMemo(
        () => target ? allocateTopUpQuantity(candidates, target.shortfall, target.preferredLot) : [],
        [candidates, target]
    );

    useEffect(() => {
        if (!open) return;
        setError(null);
        setSubmitting(false);
        setQuantities(Object.fromEntries(automaticAllocations.map(({ lot, quantity }) => [
            candidateKey(lot), quantity.toFixed(6)
        ])));
        setIdempotencyKey(
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : `wip-top-up-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
        );
    }, [open, target, automaticAllocations]);

    const allocationTotal = candidates.reduce((total, candidate) =>
        total + Math.max(0, Number(quantities[candidateKey(candidate)] || 0)), 0);
    const outstandingQuantity = Math.max(0, Number(target?.shortfall || 0) - allocationTotal);
    const hasInvalidAllocation = candidates.some((candidate) => {
        const quantity = Number(quantities[candidateKey(candidate)] || 0);
        return !Number.isFinite(quantity) || quantity < 0 || quantity > Number(candidate.available || 0) + 0.000001;
    });
    const isSubmitDisabled = submitting
        || allocationTotal <= 0
        || hasInvalidAllocation
        || allocationTotal > Number(target?.shortfall || 0) + 0.000001;

    const autoAllocate = () => {
        if (!target) return;
        setQuantities(Object.fromEntries(
            allocateTopUpQuantity(candidates, target.shortfall, target.preferredLot)
                .map(({ lot, quantity }) => [candidateKey(lot), quantity.toFixed(6)])
        ));
        setError(null);
    };

    const handleQuantityChange = (candidate: MaterialCandidateLot, raw: string) => {
        const key = candidateKey(candidate);
        if (raw === "") {
            setQuantities((previous) => ({ ...previous, [key]: "" }));
            return;
        }
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return;
        const otherTotal = candidates.reduce((total, row) =>
            total + (candidateKey(row) === key ? 0 : Math.max(0, Number(quantities[candidateKey(row)] || 0))), 0);
        const maxForRow = Math.min(Number(candidate.available || 0), Math.max(0, Number(target?.shortfall || 0) - otherTotal));
        setQuantities((previous) => ({ ...previous, [key]: String(Math.min(Math.max(0, parsed), maxForRow)) }));
        setError(null);
    };

    const handleSubmit = async () => {
        if (!target) return;
        const allocations: WipTopUpAllocation[] = candidates.flatMap((candidate) => {
            const quantity = Math.round(Number(quantities[candidateKey(candidate)] || 0) * 1_000_000) / 1_000_000;
            if (quantity <= 0) return [];
            const sourceType = sourceTypeFor(candidate);
            const receiptId = Number(candidate.receipt_id || 0);
            const mmLotId = Number(candidate.mm_lot_id || 0)
                || (sourceType === "MANUFACTURING" ? receiptId : 0);
            const inventoryLotId = Number(candidate.inventory_lot_id || 0);
            return [{
                sourceType,
                receiptId: sourceType === "RAW_MATERIAL" && receiptId > 0 ? receiptId : null,
                mmLotId: mmLotId > 0 ? mmLotId : null,
                inventoryLotId: inventoryLotId > 0 ? inventoryLotId : null,
                batchNo: candidate.lot_no,
                quantity
            }];
        });

        if (allocations.length === 0) {
            setError("Allocate a positive quantity from at least one eligible lot.");
            return;
        }
        if (allocationTotal > target.shortfall + 0.000001) {
            setError("The total allocation cannot exceed the material shortfall.");
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            const response = await addReservedMaterial({
                jobOrderId: target.jobOrderId,
                joMaterialId: target.joMaterialId,
                productId: target.productId,
                allocations,
                uomId: target.uomId,
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
            <DialogContent className="w-[96vw] md:w-full md:max-w-[900px] max-h-[92vh] flex flex-col bg-background border border-border/80 shadow-2xl rounded-2xl p-0 overflow-hidden">
                <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-background p-4 sm:p-5 border-b border-border/50 shrink-0">
                    <DialogHeader>
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-emerald-500/10 rounded-2xl text-emerald-600 border border-emerald-500/20 shadow-sm">
                                <PackagePlus className="h-5 w-5" />
                            </div>
                            <div>
                                <DialogTitle className="font-extrabold text-lg tracking-tight text-foreground">Add Raw Materials</DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                    Add traceable inventory to {target?.productName || "this material"}’s WIP pool without leaving the shift entry.
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
                            <div className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">Required top-up</div>
                            <div className="font-mono text-xs font-bold text-amber-700 dark:text-amber-400">{formatQuantity(target?.shortfall || 0)} {target?.unitShortcut}</div>
                        </div>
                    </div>

                    {candidates.length === 0 ? (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center text-xs font-semibold text-amber-700 dark:text-amber-400" role="status">
                            No eligible active, unexpired GOOD lots with available stock were found for this raw material.
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Lot and batch allocation</span>
                                    <p className="text-[10px] text-muted-foreground">Reservation lot first, then FEFO. Adjust quantities to override the suggested allocation.</p>
                                </div>
                                <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-[10px] font-bold" onClick={autoAllocate} disabled={submitting}>
                                    Auto-allocate shortfall
                                </Button>
                            </div>
                            <div className="overflow-x-auto rounded-xl border">
                                <table className="w-full min-w-[740px] text-left text-xs">
                                    <thead className="bg-muted/40 text-[10px] font-bold uppercase text-muted-foreground">
                                        <tr>
                                            <th className="p-2.5">Storage lot</th>
                                            <th className="p-2.5">Batch</th>
                                            <th className="p-2.5">Expiry</th>
                                            <th className="p-2.5">QA</th>
                                            <th className="p-2.5 text-right">Available</th>
                                            <th className="p-2.5 text-right">Add to WIP</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {candidates.map((candidate) => {
                                            const key = candidateKey(candidate);
                                            const quantity = quantities[key] || "";
                                            const sourceType = sourceTypeFor(candidate);
                                            return (
                                                <tr key={key} className={quantity ? "bg-emerald-500/5" : "hover:bg-muted/30"}>
                                                    <td className="p-2.5 font-semibold text-foreground">{candidate.storage_lot_name || "Unnamed storage lot"}</td>
                                                    <td className="p-2.5 font-mono font-bold text-foreground">{candidate.lot_no}</td>
                                                    <td className="p-2.5 text-[11px] text-muted-foreground">{candidate.expiry_date || "N/A"}</td>
                                                    <td className="p-2.5">
                                                        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[9px] font-bold text-emerald-700 dark:text-emerald-400">
                                                            {candidate.qa_status || (sourceType === "MANUFACTURING" ? "QA accepted" : "Unknown")}
                                                        </Badge>
                                                    </td>
                                                    <td className="p-2.5 text-right font-mono font-bold">{formatQuantity(Number(candidate.available || 0))}</td>
                                                    <td className="p-2.5 text-right">
                                                        <Input
                                                            type="number"
                                                            min="0"
                                                            step="0.000001"
                                                            max={candidate.available}
                                                            value={quantity}
                                                            onChange={(event) => handleQuantityChange(candidate, event.target.value)}
                                                            disabled={submitting}
                                                            className="ml-auto h-8 w-32 font-mono text-right text-xs font-bold"
                                                            aria-label={`Quantity to add from lot ${candidate.lot_no}`}
                                                        />
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/20 p-3 text-xs">
                        <span className="font-semibold text-foreground">Allocated: {formatQuantity(allocationTotal)} {target?.unitShortcut}</span>
                        {outstandingQuantity > 0 ? (
                            <span className="font-semibold text-amber-700 dark:text-amber-400" role="status">
                                Still short by {formatQuantity(outstandingQuantity)} {target?.unitShortcut}. Available lots will be staged partially; progress remains blocked until covered.
                            </span>
                        ) : (
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">Full theoretical requirement covered.</span>
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
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting} className="h-9 text-xs font-semibold">Cancel</Button>
                    <Button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={isSubmitDisabled}
                        className="h-9 bg-emerald-600 text-xs font-bold text-white shadow-md shadow-emerald-500/20 hover:bg-emerald-500"
                    >
                        {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackagePlus className="mr-1.5 h-4 w-4" />}
                        {submitting ? "Adding..." : `Add ${formatQuantity(allocationTotal)} ${target?.unitShortcut || "units"} to WIP`}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
