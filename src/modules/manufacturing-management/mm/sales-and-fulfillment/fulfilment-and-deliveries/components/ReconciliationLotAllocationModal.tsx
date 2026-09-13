// src/modules/manufacturing-management/mm/sales-and-fulfillment/fulfilment-and-deliveries/components/ReconciliationLotAllocationModal.tsx
"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { LineItemReservation } from "../types";
import {
    Boxes,
    X,
    Check,
    CheckCircle2,
    AlertTriangle,
    Info,
    RotateCcw,
    Layers,
    ArrowDownToLine,
    ShieldAlert,
} from "lucide-react";

export interface ReconciliationLotAllocationModalProps {
    open: boolean;
    onClose: () => void;
    productId?: number;
    productName?: string;
    productCode?: string;
    uomName?: string;
    requestedQuantity: number;
    reservations: LineItemReservation[];
    onConfirm: (updatedReservations: LineItemReservation[]) => void;
}

export default function ReconciliationLotAllocationModal({
    open,
    onClose,
    productName,
    productCode,
    uomName = "units",
    requestedQuantity,
    reservations,
    onConfirm,
}: ReconciliationLotAllocationModalProps) {
    // Local copy of reservations with per-batch returned_quantity
    const [allocations, setAllocations] = useState<LineItemReservation[]>(() => {
        return (reservations || []).map((r) => ({
            ...r,
            returned_quantity: Number(r.returned_quantity || 0),
        }));
    });

    const [prevOpen, setPrevOpen] = useState(open);
    const [prevReservations, setPrevReservations] = useState(reservations);

    if (open !== prevOpen || reservations !== prevReservations) {
        setPrevOpen(open);
        setPrevReservations(reservations);
        if (open) {
            setAllocations(
                (reservations || []).map((r) => ({
                    ...r,
                    returned_quantity: Number(r.returned_quantity || 0),
                }))
            );
        }
    }

    // Group allocations by Lot
    const lotGroups = useMemo(() => {
        const groups = new Map<
            string,
            {
                lotId: number;
                lotName: string;
                lotNumber: string;
                items: Array<{ reservation: LineItemReservation; originalIndex: number }>;
            }
        >();

        allocations.forEach((resv, idx) => {
            const lotId = Number(resv.lot_id || 0);
            const lotName = resv.lot_name || resv.lot_number || (lotId > 0 ? `Lot #${lotId}` : "Originating Lot");
            const lotNumber = resv.lot_number || (lotId > 0 ? `LOT-${lotId}` : "");
            const groupKey = `${lotId}:${lotName}`;

            if (!groups.has(groupKey)) {
                groups.set(groupKey, {
                    lotId,
                    lotName,
                    lotNumber,
                    items: [],
                });
            }
            groups.get(groupKey)!.items.push({ reservation: resv, originalIndex: idx });
        });

        return Array.from(groups.values());
    }, [allocations]);

    // Mass balance calculations
    const totalAllocated = useMemo(() => {
        return allocations.reduce((sum, r) => sum + (Number(r.returned_quantity) || 0), 0);
    }, [allocations]);

    const remainingQty = requestedQuantity - totalAllocated;
    const isBalanced = totalAllocated === requestedQuantity;
    const isOverAllocated = totalAllocated > requestedQuantity;

    // Auto-allocate action (prioritizes sequential originating batches)
    const handleAutoAllocate = () => {
        let remainingToFill = requestedQuantity;
        const next = allocations.map((resv) => {
            const maxPick = Number(resv.picked_quantity || resv.reserved_quantity || 0);
            const alloc = Math.min(maxPick, remainingToFill);
            remainingToFill = Math.max(0, remainingToFill - alloc);
            return {
                ...resv,
                returned_quantity: alloc,
            };
        });
        setAllocations(next);
        toast.info(`Auto-allocated ${requestedQuantity} ${uomName} across originating batches.`);
    };

    // Reset action
    const handleReset = () => {
        setAllocations(
            allocations.map((r) => ({
                ...r,
                returned_quantity: 0,
            }))
        );
        toast.info("Cleared all batch return allocations.");
    };

    // Quick fill max for a single batch
    const handleFillMax = (targetIndex: number) => {
        const target = allocations[targetIndex];
        const maxPick = Number(target.picked_quantity || target.reserved_quantity || 0);
        const currentOtherAlloc = totalAllocated - (Number(target.returned_quantity) || 0);
        const needed = Math.max(0, requestedQuantity - currentOtherAlloc);
        const alloc = Math.min(maxPick, needed);

        setAllocations((prev) =>
            prev.map((r, idx) => (idx === targetIndex ? { ...r, returned_quantity: alloc } : r))
        );
    };

    // Quantity change handler for a single batch with empty-input grace period
    const handleQtyChange = (targetIndex: number, rawVal: string) => {
        const parsed = rawVal === "" ? 0 : parseInt(rawVal, 10);
        const target = allocations[targetIndex];
        const maxPick = Number(target.picked_quantity || target.reserved_quantity || 0);
        const validVal = isNaN(parsed) ? 0 : Math.max(0, Math.min(maxPick, parsed));

        setAllocations((prev) =>
            prev.map((r, idx) => (idx === targetIndex ? { ...r, returned_quantity: validVal } : r))
        );
    };

    // Confirm & Apply Allocation
    const handleConfirm = () => {
        if (!isBalanced) {
            if (isOverAllocated) {
                toast.error(`Over-allocated: Please reduce ${totalAllocated - requestedQuantity} ${uomName}.`);
            } else {
                toast.error(`Under-allocated: ${remainingQty} ${uomName} remaining to allocate.`);
            }
            return;
        }

        onConfirm(allocations);
        toast.success("Batch and Lot return allocation applied.");
        onClose();
    };

    if (!open) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-70 flex items-center justify-center p-3 sm:p-6 bg-background/80 backdrop-blur-md overflow-y-auto">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -8 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="relative w-full max-w-2xl bg-card border rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b flex items-center justify-between bg-muted/20">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
                                <Boxes className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-black text-foreground">
                                    Multi-Batch & Lot Return Allocation
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    <span className="font-semibold text-foreground">{productName}</span>{" "}
                                    <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded border">
                                        {productCode}
                                    </span>
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Target & Mass Balance Banner */}
                    <div className="p-5 border-b bg-muted/10 flex flex-col gap-3">
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-card border rounded-xl p-3 shadow-xs">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground block" title="Dispatched / Invoiced quantity available for return">
                                    Target Return (Physical Dispatch)
                                </span>
                                <span className="text-lg font-black text-rose-500">
                                    {requestedQuantity}{" "}
                                    <span className="text-xs font-normal text-muted-foreground">{uomName}</span>
                                </span>
                            </div>

                            <div className="bg-card border rounded-xl p-3 shadow-xs">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                                    Total Allocated
                                </span>
                                <span
                                    className={`text-lg font-black ${
                                        isBalanced
                                            ? "text-emerald-600 dark:text-emerald-400"
                                            : isOverAllocated
                                            ? "text-rose-500"
                                            : "text-amber-500"
                                    }`}
                                >
                                    {totalAllocated}{" "}
                                    <span className="text-xs font-normal text-muted-foreground">{uomName}</span>
                                </span>
                            </div>

                            <div className="bg-card border rounded-xl p-3 shadow-xs">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                                    Balance Status
                                </span>
                                {isBalanced ? (
                                    <span className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-600 dark:text-emerald-400 mt-1">
                                        <CheckCircle2 className="h-4 w-4" /> Balanced
                                    </span>
                                ) : isOverAllocated ? (
                                    <span className="inline-flex items-center gap-1 text-xs font-black text-rose-500 mt-1">
                                        <ShieldAlert className="h-4 w-4" /> +{totalAllocated - requestedQuantity} excess
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 text-xs font-black text-amber-500 mt-1">
                                        <AlertTriangle className="h-4 w-4" /> {remainingQty} remaining
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Visual Progress Bar */}
                        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                            <div
                                className={`h-full transition-all duration-300 ${
                                    isBalanced
                                        ? "bg-emerald-500"
                                        : isOverAllocated
                                        ? "bg-rose-500"
                                        : "bg-amber-500"
                                }`}
                                style={{
                                    width: `${requestedQuantity > 0 ? Math.min(100, (totalAllocated / requestedQuantity) * 100) : 0}%`,
                                }}
                            />
                        </div>

                        {/* Quick Strategy Actions */}
                        <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleAutoAllocate}
                                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                >
                                    <Layers className="h-3.5 w-3.5" />
                                    Auto-Allocate ({allocations.length > 1 ? "Originating Batches" : "Batch"})
                                </button>
                                <button
                                    type="button"
                                    onClick={handleReset}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                >
                                    <RotateCcw className="h-3 w-3" />
                                    Clear
                                </button>
                            </div>
                            <span className="text-[11px] text-muted-foreground font-medium">
                                Originating Batches: <strong className="text-foreground">{allocations.length}</strong>
                            </span>
                        </div>
                    </div>

                    {/* Multi-Lot & Batch List */}
                    <div className="p-5 overflow-y-auto max-h-[50vh] space-y-4">
                        {lotGroups.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground text-xs font-medium">
                                No originating reservations found for this product.
                            </div>
                        ) : (
                            lotGroups.map((group) => (
                                <div
                                    key={group.lotId || group.lotName}
                                    className="border rounded-xl overflow-hidden bg-card shadow-xs"
                                >
                                    {/* Lot Header */}
                                    <div className="px-4 py-2.5 bg-muted/40 border-b flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Boxes className="h-4 w-4 text-sky-500" />
                                            <span className="font-bold text-foreground text-xs">
                                                {group.lotName}
                                            </span>
                                            {group.lotNumber && (
                                                <span className="text-[10px] text-muted-foreground font-mono bg-background px-1.5 py-0.5 rounded border">
                                                    {group.lotNumber}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-[10px] text-muted-foreground font-medium">
                                            {group.items.length} {group.items.length === 1 ? "batch" : "batches"}
                                        </span>
                                    </div>

                                    {/* Batches Table under this Lot */}
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="border-b bg-muted/20 text-[10px] uppercase font-bold text-muted-foreground">
                                                <th className="py-2.5 px-4">Batch Number</th>
                                                <th className="py-2.5 px-3 text-center w-24">Picked Qty</th>
                                                <th className="py-2.5 px-4 text-center w-36">Return Qty</th>
                                                <th className="py-2.5 px-3 text-center w-20">Quick Fill</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {group.items.map(({ reservation: resv, originalIndex }) => {
                                                const maxLimit = Number(
                                                    resv.picked_quantity || resv.reserved_quantity || 0
                                                );
                                                const currentAlloc = Number(resv.returned_quantity || 0);

                                                return (
                                                    <tr key={resv.reservation_id || originalIndex} className="hover:bg-muted/10 transition-colors">
                                                        {/* Batch Info */}
                                                        <td className="py-2.5 px-4 align-middle">
                                                            <div className="font-mono font-bold text-foreground text-xs">
                                                                {resv.batch_no || "Standard Batch"}
                                                            </div>
                                                            <div className="text-[10px] text-muted-foreground mt-0.5">
                                                                Status: <span className="font-medium text-foreground">{resv.status}</span>
                                                            </div>
                                                        </td>

                                                        {/* Picked Qty */}
                                                        <td className="py-2.5 px-3 text-center align-middle font-bold text-foreground">
                                                            {maxLimit}
                                                        </td>

                                                        {/* Return Qty Input */}
                                                        <td className="py-2.5 px-4 text-center align-middle">
                                                            <input
                                                                type="number"
                                                                min={0}
                                                                max={maxLimit}
                                                                value={currentAlloc === 0 ? "" : currentAlloc}
                                                                placeholder="0"
                                                                onFocus={(e) => e.target.select()}
                                                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                                                onChange={(e) =>
                                                                    handleQtyChange(originalIndex, e.target.value)
                                                                }
                                                                onBlur={(e) => {
                                                                    if (e.target.value === "" || isNaN(parseInt(e.target.value, 10))) {
                                                                        handleQtyChange(originalIndex, "0");
                                                                    }
                                                                }}
                                                                className="w-24 h-8 text-center bg-background border border-rose-500/40 focus:border-rose-500 rounded-lg px-2 text-xs font-black text-foreground outline-none shadow-xs mx-auto"
                                                            />
                                                        </td>

                                                        {/* Quick Fill Max */}
                                                        <td className="py-2.5 px-3 text-center align-middle">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleFillMax(originalIndex)}
                                                                disabled={currentAlloc === maxLimit}
                                                                className="text-[10px] font-bold text-primary hover:text-primary/80 disabled:opacity-40 disabled:hover:text-primary transition-colors flex items-center justify-center gap-1 mx-auto cursor-pointer"
                                                                title="Fill maximum allowed from this batch"
                                                            >
                                                                <ArrowDownToLine className="h-3 w-3" /> Max
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Footer Actions */}
                    <div className="px-6 py-4 border-t flex items-center justify-between bg-muted/15">
                        <div className="text-xs text-muted-foreground">
                            {isBalanced ? (
                                <span className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> Exactly {requestedQuantity} {uomName} allocated from physical dispatch.
                                </span>
                            ) : (
                                <span className="font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                    <Info className="h-3.5 w-3.5" /> Please balance allocation before confirming.
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 rounded-xl border bg-background hover:bg-muted text-foreground text-xs font-bold transition-all cursor-pointer shadow-xs"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirm}
                                disabled={!isBalanced}
                                className={`px-6 py-2 rounded-xl text-xs font-black shadow-xs transition-all flex items-center gap-2 ${
                                    isBalanced
                                        ? "bg-primary hover:bg-primary/95 text-primary-foreground cursor-pointer shadow-sm hover:shadow-md active:scale-95"
                                        : "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
                                }`}
                            >
                                <Check className="h-4 w-4" />
                                Confirm Batch Allocation
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
