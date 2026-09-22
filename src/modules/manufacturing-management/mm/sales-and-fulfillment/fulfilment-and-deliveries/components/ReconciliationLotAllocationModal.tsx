// src/modules/manufacturing-management/mm/sales-and-fulfillment/fulfilment-and-deliveries/components/ReconciliationLotAllocationModal.tsx
"use client";

import React, { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { LineItemReservation } from "../types";
import {
    Boxes,
    X,
    Check,
    CheckCircle2,
    AlertTriangle,
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

interface AllocationBatchRowProps {
    resv: LineItemReservation;
    originalIndex: number;
    maxLimit: number;
    onQtyChange: (originalIndex: number, rawVal: string) => void;
    onFillMax: (originalIndex: number) => void;
}

const AllocationBatchRow = React.memo(function AllocationBatchRow({
    resv,
    originalIndex,
    maxLimit,
    onQtyChange,
    onFillMax,
}: AllocationBatchRowProps) {
    const currentAlloc = Number(resv.returned_quantity || 0);
    const [rawVal, setRawVal] = useState<string>("");
    const [isFocused, setIsFocused] = useState<boolean>(false);

    const displayVal = isFocused
        ? rawVal
        : currentAlloc === 0
            ? ""
            : String(currentAlloc);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        setRawVal(currentAlloc === 0 ? "" : String(currentAlloc));
        e.target.select();
    };

    const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
        if (!isFocused) {
            setIsFocused(true);
            setRawVal(currentAlloc === 0 ? "" : String(currentAlloc));
            (e.target as HTMLInputElement).select();
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (val === "" || /^\d+$/.test(val)) {
            setRawVal(val);
            if (val !== "") {
                onQtyChange(originalIndex, val);
            }
        }
    };

    const handleBlur = () => {
        setIsFocused(false);
        if (rawVal === "" || isNaN(parseInt(rawVal, 10))) {
            setRawVal("");
            onQtyChange(originalIndex, "0");
        } else {
            const parsed = parseInt(rawVal, 10);
            const clamped = Math.max(0, Math.min(maxLimit, parsed));
            setRawVal(clamped === 0 ? "" : String(clamped));
            onQtyChange(originalIndex, String(clamped));
        }
    };

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
                    value={displayVal}
                    placeholder="0"
                    onFocus={handleFocus}
                    onClick={handleClick}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    className="w-24 h-8 text-center bg-background border border-rose-500/40 focus:border-rose-500 rounded-lg px-2 text-xs font-black text-foreground outline-none shadow-xs mx-auto"
                />
            </td>

            {/* Quick Fill Max */}
            <td className="py-2.5 px-3 text-center align-middle">
                <button
                    type="button"
                    onClick={() => onFillMax(originalIndex)}
                    disabled={currentAlloc === maxLimit}
                    className="text-[10px] font-bold text-primary hover:text-primary/80 disabled:opacity-40 disabled:hover:text-primary transition-colors flex items-center justify-center gap-1 mx-auto cursor-pointer"
                    title="Fill maximum allowed from this batch"
                >
                    <ArrowDownToLine className="h-3 w-3" /> Max
                </button>
            </td>
        </tr>
    );
});

const getReservationPickedQty = (r: LineItemReservation): number => {
    if (r.picked_quantity !== undefined && r.picked_quantity !== null && !isNaN(Number(r.picked_quantity))) {
        return Number(r.picked_quantity);
    }
    return Number(r.reserved_quantity || 0);
};

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

    const [showUnbalancedConfirm, setShowUnbalancedConfirm] = useState(false);

    const [prevOpen, setPrevOpen] = useState(open);
    const [prevReservations, setPrevReservations] = useState(reservations);

    if (open !== prevOpen || reservations !== prevReservations) {
        setPrevOpen(open);
        setPrevReservations(reservations);
        setAllocations(
            (reservations || []).map((r) => ({
                ...r,
                returned_quantity: Number(r.returned_quantity || 0),
            }))
        );
        setShowUnbalancedConfirm(false);
    }

    // Group allocations by Lot
    const lotGroups = useMemo(() => {
        const groups = new Map<
            string,
            {
                lotId?: number;
                lotName: string;
                lotNumber: string;
                items: Array<{ reservation: LineItemReservation; originalIndex: number }>;
            }
        >();

        allocations.forEach((resv, idx) => {
            const lotId = resv.lot_id ? Number(resv.lot_id) : undefined;
            const lotName = resv.lot_name || resv.lot_number || (lotId ? `Lot #${lotId}` : "Standard Lot");
            const lotNumber = resv.lot_number || (lotId ? `LOT-${lotId}` : "");
            const groupKey = `${lotId || 0}:${lotName}`;

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

    // Derived summary calculations
    const totalAllocated = useMemo(() => {
        return allocations.reduce((sum, r) => sum + (Number(r.returned_quantity) || 0), 0);
    }, [allocations]);

    const remainingQty = Math.max(0, requestedQuantity - totalAllocated);
    const isBalanced = totalAllocated === requestedQuantity;
    const isOverAllocated = totalAllocated > requestedQuantity;



    // Quick fill max for a single batch
    const handleFillMax = useCallback((targetIndex: number) => {
        setAllocations((prev) => {
            const target = prev[targetIndex];
            if (!target) return prev;
            const maxPick = getReservationPickedQty(target);
            const currentTotal = prev.reduce((sum, r) => sum + (Number(r.returned_quantity) || 0), 0);
            const currentOtherAlloc = currentTotal - (Number(target.returned_quantity) || 0);
            const needed = Math.max(0, requestedQuantity - currentOtherAlloc);
            const alloc = Math.min(maxPick, needed);
            return prev.map((r, idx) => (idx === targetIndex ? { ...r, returned_quantity: alloc } : r));
        });
    }, [requestedQuantity]);

    // Quantity change handler for a single batch with empty-input grace period
    const handleQtyChange = useCallback((targetIndex: number, rawVal: string) => {
        const parsed = rawVal === "" ? 0 : parseInt(rawVal, 10);
        setAllocations((prev) => {
            const target = prev[targetIndex];
            if (!target) return prev;
            const maxPick = getReservationPickedQty(target);
            const validVal = isNaN(parsed) ? 0 : Math.max(0, Math.min(maxPick, parsed));
            return prev.map((r, idx) => (idx === targetIndex ? { ...r, returned_quantity: validVal } : r));
        });
    }, []);

    // Confirm & Apply Allocation
    const handleConfirm = () => {
        if (!isBalanced) {
            setShowUnbalancedConfirm(true);
            return;
        }

        onConfirm(allocations);
        toast.success("Batch and Lot return allocation applied.");
        onClose();
    };

    const handleConfirmUnbalanced = () => {
        onConfirm(allocations);
        toast.warning(
            `Batch return allocation confirmed with discrepancy (${
                isOverAllocated
                    ? `+${totalAllocated - requestedQuantity} excess`
                    : `${remainingQty} unallocated`
            } ${uomName}).`
        );
        setShowUnbalancedConfirm(false);
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
                                                const maxLimit = getReservationPickedQty(resv);

                                                return (
                                                    <AllocationBatchRow
                                                        key={resv.reservation_id || originalIndex}
                                                        resv={resv}
                                                        originalIndex={originalIndex}
                                                        maxLimit={maxLimit}
                                                        onQtyChange={handleQtyChange}
                                                        onFillMax={handleFillMax}
                                                    />
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
                                    <AlertTriangle className="h-3.5 w-3.5" /> Unbalanced: {isOverAllocated ? `+${totalAllocated - requestedQuantity} ${uomName} excess` : `${remainingQty} ${uomName} remaining unallocated`}. Click confirm to proceed.
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
                                className={`px-6 py-2 rounded-xl text-xs font-black shadow-xs transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:shadow-md active:scale-95 ${
                                    isBalanced
                                        ? "bg-primary hover:bg-primary/95 text-primary-foreground"
                                        : "bg-amber-600 hover:bg-amber-700 text-white"
                                }`}
                            >
                                <Check className="h-4 w-4" />
                                Confirm Batch Allocation
                            </button>
                        </div>
                    </div>

                    {/* Unbalanced Allocation Confirmation Modal */}
                    <AnimatePresence>
                        {showUnbalancedConfirm && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
                                <motion.div
                                    initial={{ scale: 0.95, opacity: 0, y: 6 }}
                                    animate={{ scale: 1, opacity: 1, y: 0 }}
                                    exit={{ scale: 0.95, opacity: 0, y: 6 }}
                                    transition={{ duration: 0.18, ease: "easeOut" }}
                                    className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl flex flex-col gap-4"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 shrink-0">
                                            <AlertTriangle className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h4 className="text-base font-black text-foreground">
                                                Confirm Unbalanced Allocation?
                                            </h4>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                Batch allocations do not match the target physical return quantity.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Breakdown Card */}
                                    <div className="rounded-xl border bg-muted/20 p-3.5 space-y-2 text-xs">
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground font-medium">Target Return (Dispatch):</span>
                                            <span className="font-bold text-foreground font-mono">
                                                {requestedQuantity} {uomName}
                                            </span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-muted-foreground font-medium">Total Allocated across Batches:</span>
                                            <span className="font-bold text-foreground font-mono">
                                                {totalAllocated} {uomName}
                                            </span>
                                        </div>
                                        <div className="pt-2 border-t flex justify-between items-center">
                                            <span className="font-semibold text-foreground">Discrepancy:</span>
                                            {isOverAllocated ? (
                                                <span className="font-black text-rose-500 font-mono">
                                                    +{totalAllocated - requestedQuantity} {uomName} excess
                                                </span>
                                            ) : (
                                                <span className="font-black text-amber-600 dark:text-amber-400 font-mono">
                                                    {remainingQty} {uomName} unallocated
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        {isOverAllocated
                                            ? "More units are allocated than physically dispatched. This will return extra inventory units back to storage."
                                            : "Proceeding with an under-allocated return means the remaining unallocated units will not be traced to a specific batch or lot."}
                                    </p>

                                    {/* Modal Actions */}
                                    <div className="flex items-center justify-end gap-2.5 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setShowUnbalancedConfirm(false)}
                                            className="px-4 py-2 rounded-xl border bg-background hover:bg-muted text-foreground text-xs font-bold transition-all cursor-pointer shadow-xs"
                                        >
                                            Back to Adjust
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleConfirmUnbalanced}
                                            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-black transition-all cursor-pointer shadow-sm hover:shadow-md active:scale-95 flex items-center gap-1.5"
                                        >
                                            <Check className="h-3.5 w-3.5" />
                                            Confirm Anyway
                                        </button>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
