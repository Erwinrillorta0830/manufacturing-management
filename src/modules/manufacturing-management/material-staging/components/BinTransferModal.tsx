"use client";

import React, { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    ArrowRight,
    ArrowLeftRight,
    Boxes,
    Warehouse,
    Sparkles,
    AlertCircle,
    CheckCircle2
} from "lucide-react";
import { StagingJobOrder, MaterialStagingItem, AllocatedLot, WorkCenter, BinTransferPayload } from "../types";

interface BinTransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    activeItem: {
        jobOrder: StagingJobOrder;
        material: MaterialStagingItem;
        lot?: AllocatedLot;
    } | null;
    workCenters: WorkCenter[];
    onConfirmTransfer: (payload: BinTransferPayload) => Promise<void>;
    isLoading?: boolean;
}

export function BinTransferModal({
    isOpen,
    onClose,
    activeItem,
    workCenters,
    onConfirmTransfer,
    isLoading = false
}: BinTransferModalProps) {
    if (!activeItem) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto p-0 gap-0 border-border">
                <BinTransferFormContent
                    key={`${activeItem.jobOrder.job_order_id}-${activeItem.material.jo_material_id || activeItem.material.product_id}`}
                    activeItem={activeItem}
                    workCenters={workCenters}
                    onConfirmTransfer={onConfirmTransfer}
                    isLoading={isLoading}
                    onClose={onClose}
                />
            </DialogContent>
        </Dialog>
    );
}

function BinTransferFormContent({
    activeItem,
    workCenters,
    onConfirmTransfer,
    isLoading,
    onClose
}: {
    activeItem: {
        jobOrder: StagingJobOrder;
        material: MaterialStagingItem;
        lot?: AllocatedLot;
    };
    workCenters: WorkCenter[];
    onConfirmTransfer: (payload: BinTransferPayload) => Promise<void>;
    isLoading: boolean;
    onClose: () => void;
}) {
    const { jobOrder, material, lot } = activeItem;

    const activeWorkCenters = workCenters.filter((wc) => wc.is_active !== false);
    const defaultWcId = jobOrder.staging_work_center_id
        ? String(jobOrder.staging_work_center_id)
        : "";

    const defaultLot = lot || material.allocations[0];
    const defaultBatch = defaultLot ? defaultLot.batch_no : `LOT-${material.product_id}-MAIN`;
    const remainingNeeded = Math.max(0, material.required_quantity - material.staged_quantity);
    const defaultLotAlloc = defaultLot ? (defaultLot.allocated_quantity - defaultLot.staged_quantity) : remainingNeeded;
    const initQty = defaultLotAlloc > 0 ? defaultLotAlloc : (remainingNeeded > 0 ? remainingNeeded : material.required_quantity);

    const [sourceBin, setSourceBin] = useState("MAIN-STORE");
    const [selectedWorkCenterId, setSelectedWorkCenterId] = useState<string>(defaultWcId);
    const [selectedBatchNo, setSelectedBatchNo] = useState(defaultBatch);
    const [transferQty, setTransferQty] = useState<number>(initQty > 0 ? initQty : 1);
    const [remarks, setRemarks] = useState(`Staging materials for JO #${jobOrder.job_order_no}`);
    const [formError, setFormError] = useState<string | null>(null);

    const targetBin = selectedWorkCenterId ? `FLOOR-STAGING-${selectedWorkCenterId}` : "";

    // The target bin is derived from the selected work center so the two values cannot diverge.
    const handleWorkCenterChange = (wcId: string) => {
        setSelectedWorkCenterId(wcId);
    };

    // Calculate active lot details
    const currentLot = material.allocations.find((l) => l.batch_no === selectedBatchNo) || lot || material.allocations[0];
    const availableOnHand = currentLot?.on_hand_lot_quantity ?? material.on_hand_quantity;
    const remainingToStage = Math.max(0, material.required_quantity - material.staged_quantity);
    const isPartiallyStaged = material.reservation_status === "PARTIAL";
    const currentReservationStatus = lot?.reservation_status || material.reservation_status;

    const handleSetMaxQuantity = () => {
        if (remainingToStage > 0) {
            setTransferQty(remainingToStage);
        } else {
            setTransferQty(material.required_quantity);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        if (!transferQty || transferQty <= 0) {
            setFormError("Please enter a valid transfer quantity greater than 0");
            return;
        }

        if (!targetBin.trim()) {
            setFormError("No active work center is configured for this Job Order");
            return;
        }

        const selectedWorkCenter = activeWorkCenters.find((wc) => String(wc.work_center_id) === selectedWorkCenterId);
        if (!selectedWorkCenter) {
            setFormError("Please select an active target work center");
            return;
        }

        if (targetBin !== `FLOOR-STAGING-${selectedWorkCenter.work_center_id}`) {
            setFormError("The target staging bin must match the selected work center");
            return;
        }

        const payload: BinTransferPayload = {
            job_order_id: jobOrder.job_order_id,
            job_order_no: jobOrder.job_order_no,
            jo_material_id: material.jo_material_id,
            product_id: material.product_id,
            product_name: material.product_name,
            lot_id: currentLot?.lot_id || 1,
            batch_no: selectedBatchNo || `LOT-${material.product_id}-MAIN`,
            transfer_quantity: Number(transferQty),
            source_bin: sourceBin.trim() || "MAIN-STORE",
            target_bin: targetBin.trim(),
            work_center_id: selectedWorkCenter.work_center_id,
            override_negative: false,
            remarks: remarks.trim()
        };

        await onConfirmTransfer(payload);
    };

    return (
        <form onSubmit={handleSubmit} className="flex flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 border-b border-border">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
                            <ArrowLeftRight className="h-5 w-5" />
                        </div>
                        <div>
                            <DialogTitle className="text-lg font-bold text-foreground">
                                Stage Material to Floor Bin
                            </DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                Transfer stock from Main Store to Work Center Staging Bin and lock Hard Reservation.
                            </DialogDescription>
                        </div>
                    </div>
                    <Badge variant="outline" className="bg-background text-primary border-primary/30 font-mono text-xs px-2.5 py-1">
                        JO #{jobOrder.job_order_no}
                    </Badge>
                </div>
            </div>

            <div className="p-6 space-y-5">
                {/* Target Component Card */}
                        <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                        Material Component
                                    </span>
                                    <span className="text-base font-bold text-foreground">
                                        {material.product_name}
                                    </span>
                                    <div className="text-xs text-muted-foreground font-mono">
                                        SKU: {material.product_code} &bull; UOM: {material.uom}
                                    </div>
                                </div>
                                <Badge variant={material.is_staged ? "default" : "secondary"} className={material.is_staged ? "bg-emerald-500 text-white" : "bg-amber-500/10 text-amber-500 border-amber-500/20"}>
                                    {material.is_staged ? "STAGED (HARD)" : isPartiallyStaged ? "PARTIALLY STAGED" : "PENDING (SOFT)"}
                                </Badge>
                            </div>

                            <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1 border-t border-border/50">
                                <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase">Required</span>
                                    <span className="font-semibold font-mono text-foreground">{material.required_quantity} {material.uom}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase">Already Staged</span>
                                    <span className="font-semibold font-mono text-emerald-500">{material.staged_quantity} {material.uom}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px] uppercase">Main Store Stock</span>
                                    <span className={`font-semibold font-mono ${availableOnHand < transferQty ? "text-red-500" : "text-foreground"}`}>
                                        {availableOnHand.toLocaleString()} {material.uom}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Visual Transfer Route Diagram */}
                        <div className="rounded-xl bg-card border border-border/70 p-4 shadow-sm space-y-3">
                            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                                Bin Transfer Route & Staging Destination
                            </Label>
                            
                            <div className="flex items-center justify-between gap-3 bg-muted/40 p-3 rounded-lg border border-border/60">
                                <div className="flex items-center gap-2.5">
                                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                        <Warehouse className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-muted-foreground uppercase block">Source Bin</span>
                                        <span className="font-mono font-bold text-xs text-foreground">{sourceBin}</span>
                                    </div>
                                </div>

                                <div className="flex flex-col items-center justify-center px-2">
                                    <ArrowRight className="h-4 w-4 text-primary animate-pulse" />
                                    <span className="text-[9px] text-primary font-medium tracking-tight">Transfer</span>
                                </div>

                                <div className="flex items-center gap-2.5 text-right">
                                    <div>
                                        <span className="text-[10px] text-muted-foreground uppercase block">Floor Staging Bin</span>
                                        <span className="font-mono font-bold text-xs text-emerald-500">{targetBin || "No active destination"}</span>
                                    </div>
                                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                        <Boxes className="h-4 w-4" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                <div className="space-y-1.5">
                                    <Label htmlFor="source-bin" className="text-xs font-medium">
                                        Source Warehouse Bin
                                    </Label>
                                    <Input
                                        id="source-bin"
                                        value={sourceBin}
                                        onChange={(e) => setSourceBin(e.target.value)}
                                        className="h-9 font-mono text-xs bg-background"
                                        placeholder="MAIN-STORE"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="target-work-center" className="text-xs font-medium">
                                        Target Work Center
                                    </Label>
                                    <Select
                                        value={selectedWorkCenterId}
                                        onValueChange={handleWorkCenterChange}
                                    >
                                        <SelectTrigger id="target-work-center" className="h-9 text-xs bg-background">
                                            <SelectValue placeholder="Select Work Center" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {activeWorkCenters.map((wc) => (
                                                <SelectItem key={wc.work_center_id} value={String(wc.work_center_id)} className="text-xs">
                                                    {wc.work_center_name} (WC #{wc.work_center_id})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>

                        {/* Lot Selection & Transfer Quantity */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="lot-batch" className="text-xs font-medium">
                                    Allocated Lot / Batch No
                                </Label>
                                <Select
                                    value={selectedBatchNo}
                                    onValueChange={setSelectedBatchNo}
                                >
                                    <SelectTrigger id="lot-batch" className="h-9 font-mono text-xs bg-background">
                                        <SelectValue placeholder="Select Lot / Batch" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {material.allocations.map((al, idx) => (
                                            <SelectItem key={idx} value={al.batch_no} className="text-xs font-mono">
                                                {al.batch_no} ({al.allocated_quantity} {material.uom})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {currentLot?.expiry_date && (
                                    <span className="text-[11px] text-muted-foreground block">
                                        Expiry: {currentLot.expiry_date} &bull; QA: {currentLot.qa_status || "Passed"}
                                    </span>
                                )}
                            </div>

                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="transfer-qty" className="text-xs font-medium">
                                        Transfer Quantity ({material.uom})
                                    </Label>
                                    <button
                                        type="button"
                                        onClick={handleSetMaxQuantity}
                                        className="text-[11px] text-primary hover:underline font-semibold"
                                    >
                                        Fill Required
                                    </button>
                                </div>
                                <Input
                                    id="transfer-qty"
                                    type="number"
                                    step="any"
                                    min="0.001"
                                    value={transferQty || ""}
                                    onChange={(e) => setTransferQty(parseFloat(e.target.value) || 0)}
                                    className="h-9 font-mono font-bold text-xs bg-background"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>

                        {/* Staging Remarks */}
                        <div className="space-y-1.5">
                            <Label htmlFor="staging-remarks" className="text-xs font-medium text-muted-foreground">
                                Staging Notes / Transfer Audit Trail (Optional)
                            </Label>
                            <Input
                                id="staging-remarks"
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                placeholder="e.g. Staged onto pallet #4 near Work Station 1"
                                className="h-9 text-xs bg-background"
                            />
                        </div>

                        {/* Status Change Notice Banner */}
                        <div className="flex items-start gap-2.5 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs">
                            <Sparkles className="h-4 w-4 shrink-0 mt-0.5" />
                            <div className="space-y-0.5">
                                <span className="font-semibold block">Automatic Status Conversion</span>
                                <p className="text-[11px] text-muted-foreground">
                                    {targetBin
                                        ? <>Confirming transfer will move stock to <code className="font-mono text-foreground font-semibold">{targetBin}</code> and convert the staging reservation from <strong className="text-amber-500">{currentReservationStatus}</strong> to <strong className="text-emerald-500">HARD (RESERVED / READY FOR FLOOR)</strong>.</>
                                        : "No active work center is configured, so staging is unavailable for this Job Order."}
                                </p>
                            </div>
                        </div>

                        {formError && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-medium">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                {formError}
                            </div>
                        )}
                    </div>

                    <DialogFooter className="bg-muted/40 px-6 py-3 border-t border-border flex items-center justify-between">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={onClose}
                            disabled={isLoading}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            size="sm"
                            disabled={isLoading || transferQty <= 0 || !selectedWorkCenterId}
                            className="font-semibold shadow-md"
                        >
                            {isLoading ? (
                                "Staging Stock..."
                            ) : (
                                <>
                                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                                    Confirm Staging & Lock HARD Hold
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
    );
}

export default BinTransferModal;
