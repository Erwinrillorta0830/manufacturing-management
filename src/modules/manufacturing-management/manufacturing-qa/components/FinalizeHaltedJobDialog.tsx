/* eslint-disable */
"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, Package, RefreshCw } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FinalizeHaltedJobPayload, HaltFinalizePreview } from "../types";
import { fetchHaltFinalizePreview } from "../services/qa-api";
import { fetchEligibleFinishedGoodsLots, EligibleFinishedGoodsLot } from "../../shared/finished-goods-lots-api";
import { FinishedGoodsLotSelect } from "../../shared/FinishedGoodsLotSelect";

interface FinalizeHaltedJobDialogProps {
    isOpen: boolean;
    onClose: () => void;
    jobOrderId: number | null;
    onSubmit: (payload: FinalizeHaltedJobPayload) => Promise<void>;
    actionLoading: boolean;
}

function roundTo4(value: number): number {
    return Math.round(value * 10000) / 10000;
}

function formatQty(value: number | string): string {
    const numeric = Number(value || 0);
    return numeric.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function FinalizeHaltedJobDialog({
    isOpen,
    onClose,
    jobOrderId,
    onSubmit,
    actionLoading
}: FinalizeHaltedJobDialogProps) {
    const [preview, setPreview] = React.useState<HaltFinalizePreview | null>(null);
    const [loadingPreview, setLoadingPreview] = React.useState(false);
    const [previewError, setPreviewError] = React.useState<string | null>(null);

    const [yieldQty, setYieldQty] = React.useState("");
    const [consumption, setConsumption] = React.useState<Record<number, string>>({});
    const [eligibleLots, setEligibleLots] = React.useState<EligibleFinishedGoodsLot[]>([]);
    const [loadingLots, setLoadingLots] = React.useState(false);
    const [selectedMmLotId, setSelectedMmLotId] = React.useState("");
    const [lotNumber, setLotNumber] = React.useState("");
    const [manufacturingDate, setManufacturingDate] = React.useState("");
    const [expiryDate, setExpiryDate] = React.useState("");
    const [unitCost, setUnitCost] = React.useState("0");
    const [remarks, setRemarks] = React.useState("");

    React.useEffect(() => {
        if (!isOpen || !jobOrderId) {
            setPreview(null);
            setPreviewError(null);
            return;
        }
        let cancelled = false;
        setLoadingPreview(true);
        setPreviewError(null);
        setYieldQty("");
        setConsumption({});
        setSelectedMmLotId("");
        setEligibleLots([]);
        setRemarks("");

        const today = new Date().toISOString().split("T")[0];
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        setManufacturingDate(today);
        setExpiryDate(nextYear.toISOString().split("T")[0]);
        setUnitCost("0");

        fetchHaltFinalizePreview(jobOrderId)
            .then((data) => {
                if (cancelled) return;
                setPreview(data);
                setLotNumber(data.defaultLotNumber);
                const initialConsumption: Record<number, string> = {};
                data.materials.forEach((material) => {
                    initialConsumption[material.joMaterialId] = "0";
                });
                setConsumption(initialConsumption);

                const branchId = Number(data.jobOrder.branchId || 0);
                const productId = Number(data.jobOrder.productId || 0);
                if (branchId > 0 && productId > 0) {
                    setLoadingLots(true);
                    fetchEligibleFinishedGoodsLots(branchId, productId)
                        .then((response) => {
                            if (cancelled) return;
                            setEligibleLots(response.lots);
                            setSelectedMmLotId(response.lots.length === 1 ? String(response.lots[0].lotId) : "");
                        })
                        .catch((error) => console.error("Error loading eligible finished-goods lots:", error))
                        .finally(() => {
                            if (!cancelled) setLoadingLots(false);
                        });
                }
            })
            .catch((error: any) => {
                if (!cancelled) setPreviewError(error?.message || "Failed to load the finalize preview.");
            })
            .finally(() => {
                if (!cancelled) setLoadingPreview(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, jobOrderId]);

    const handleYieldChange = (value: string) => {
        setYieldQty(value);
        if (!preview) return;
        const target = Number(preview.jobOrder.targetQuantity || 0);
        const produced = Number(value || 0);
        const ratio = target > 0 ? produced / target : 0;
        const next: Record<number, string> = {};
        preview.materials.forEach((material) => {
            const incremental = Math.max(0, Number(material.allocatedQuantity || 0) * ratio - Number(material.consumedQuantity || 0));
            const suggested = Math.min(incremental, Number(material.returnableQuantity || 0));
            next[material.joMaterialId] = roundTo4(suggested).toString();
        });
        setConsumption(next);
    };

    const consumedByMaterial = React.useMemo(() => {
        const map = new Map<number, number>();
        (preview?.materials || []).forEach((material) => {
            const value = Number(consumption[material.joMaterialId] ?? 0);
            map.set(material.joMaterialId, Number.isFinite(value) && value > 0 ? roundTo4(value) : 0);
        });
        return map;
    }, [preview, consumption]);

    const validationError = React.useMemo(() => {
        if (!preview) return null;
        const produced = Number(yieldQty);
        if (!Number.isFinite(produced) || produced <= 0) return "Enter the partial finished-goods quantity to receipt.";
        for (const material of preview.materials) {
            const consumed = consumedByMaterial.get(material.joMaterialId) || 0;
            if (consumed > Number(material.returnableQuantity || 0) + 0.000001) {
                return `Consumed quantity for ${material.productName} exceeds its staged remainder (${formatQty(material.returnableQuantity)}).`;
            }
            const returned = Math.max(0, Number(material.returnableQuantity || 0) - consumed);
            if (returned > 0.000001 && material.requiresLotSelection) {
                return `${material.productName} needs an active destination lot before its leftover can be returned. Use the Raw Material Returns panel for that line.`;
            }
        }
        if (!lotNumber.trim()) return "Enter the output batch/lot number.";
        if (!selectedMmLotId) return "Select an existing storage lot for the finished-goods output.";
        if (!manufacturingDate || !expiryDate) return "Manufacturing and expiration dates are required.";
        if (manufacturingDate > expiryDate) return "Expiration date cannot be earlier than the manufacturing date.";
        return null;
    }, [preview, yieldQty, consumedByMaterial, lotNumber, selectedMmLotId, manufacturingDate, expiryDate]);

    const totalConsumed = React.useMemo(
        () => roundTo4([...consumedByMaterial.values()].reduce((sum, value) => sum + value, 0)),
        [consumedByMaterial]
    );
    const totalReturned = React.useMemo(() => {
        if (!preview) return 0;
        const returnable = preview.materials.reduce((sum, material) => sum + Number(material.returnableQuantity || 0), 0);
        return roundTo4(Math.max(0, returnable - totalConsumed));
    }, [preview, totalConsumed]);

    const handleSubmit = async () => {
        if (!preview || validationError) {
            if (validationError) toast.error(validationError);
            return;
        }
        await onSubmit({
            joId: preview.jobOrder.jobOrderId,
            productId: preview.jobOrder.productId,
            productName: preview.jobOrder.productName,
            quantityProduced: Number(yieldQty),
            branchId: preview.jobOrder.branchId,
            lotNumber: lotNumber.trim(),
            mmLotId: Number(selectedMmLotId),
            manufacturingDate,
            expirationDate: expiryDate,
            unitCost: Number(unitCost || 0),
            materials: preview.materials.map((material) => ({
                joMaterialId: material.joMaterialId,
                consumedQty: consumedByMaterial.get(material.joMaterialId) || 0
            })),
            remarks: remarks.trim() || undefined,
            previewToken: preview.previewToken
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="w-[calc(100vw-1rem)] max-w-3xl max-h-[calc(100dvh-1rem)] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg font-bold">
                        <ClipboardCheck className="h-5 w-5 text-primary" />
                        Finalize Halted Job Order
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Receipt the partial finished-goods output and return the unused staged raw materials to their lot/batch. The Job Order will be completed once posted.
                    </DialogDescription>
                </DialogHeader>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-2 pr-1 scrollbar-thin">
                    {loadingPreview ? (
                        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin" /> Loading halted Job Order...
                        </div>
                    ) : previewError ? (
                        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                            <AlertTriangle className="h-4 w-4 shrink-0" /> {previewError}
                        </div>
                    ) : preview ? (
                        <>
                            <div className="rounded-lg border bg-muted/20 p-3 text-xs">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-mono text-sm font-bold">{preview.jobOrder.jobOrderNo}</span>
                                    <Badge variant="destructive" className="text-[10px]">{preview.jobOrder.status}</Badge>
                                    <span className="text-muted-foreground">{preview.jobOrder.productName}</span>
                                </div>
                                <p className="mt-1 text-muted-foreground">
                                    Target: <strong className="text-foreground">{formatQty(preview.jobOrder.targetQuantity)}</strong> ·
                                    Produced so far: <strong className="text-foreground">{formatQty(preview.jobOrder.producedQuantity)}</strong>
                                </p>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <div className="space-y-1">
                                    <Label htmlFor="finalize-yield" className="text-xs font-semibold">
                                        Partial Yield to Receipt <span className="text-destructive">*</span>
                                    </Label>
                                    <Input
                                        id="finalize-yield"
                                        type="number"
                                        value={yieldQty}
                                        onChange={(event) => handleYieldChange(event.target.value)}
                                        placeholder="e.g. 4"
                                        className="h-9 font-mono text-sm"
                                    />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                    <Label className="text-xs font-semibold">
                                        Storage Lot <span className="text-destructive">*</span>
                                    </Label>
                                    <FinishedGoodsLotSelect
                                        lots={eligibleLots}
                                        value={selectedMmLotId}
                                        onValueChange={setSelectedMmLotId}
                                        loading={loadingLots}
                                        disabled={actionLoading}
                                        placeholder="Select storage lot..."
                                        className="h-9 w-full justify-between text-xs"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="finalize-batch" className="text-xs font-semibold">Output Batch / Lot No</Label>
                                    <Input
                                        id="finalize-batch"
                                        value={lotNumber}
                                        onChange={(event) => setLotNumber(event.target.value)}
                                        className="h-9 font-mono text-xs"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="finalize-mfg" className="text-xs font-semibold">Mfg Date</Label>
                                    <Input
                                        id="finalize-mfg"
                                        type="date"
                                        value={manufacturingDate}
                                        onChange={(event) => setManufacturingDate(event.target.value)}
                                        className="h-9 text-xs"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="finalize-exp" className="text-xs font-semibold">Expiry Date</Label>
                                    <Input
                                        id="finalize-exp"
                                        type="date"
                                        value={expiryDate}
                                        onChange={(event) => setExpiryDate(event.target.value)}
                                        className="h-9 text-xs"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Material Split</p>
                                <div className="overflow-x-auto rounded-lg border">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b bg-muted/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                                                <th className="p-2">Material</th>
                                                <th className="p-2 text-right">Staged</th>
                                                <th className="p-2 text-right">Consumed</th>
                                                <th className="p-2 text-right">Consumed into Output</th>
                                                <th className="p-2 text-right">Returned to Store</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {preview.materials.map((material) => {
                                                const consumed = consumedByMaterial.get(material.joMaterialId) || 0;
                                                const returned = Math.max(0, Number(material.returnableQuantity || 0) - consumed);
                                                return (
                                                    <tr key={material.joMaterialId} className="border-b border-border/40 last:border-0">
                                                        <td className="p-2">
                                                            <span className="font-semibold text-foreground">{material.productName}</span>
                                                            <span className="ml-1 text-muted-foreground">({material.unitOfMeasure})</span>
                                                            {material.requiresLotSelection && returned > 0.000001 && (
                                                                <span className="ml-2 text-[10px] font-bold text-amber-600 dark:text-amber-400">needs destination lot</span>
                                                            )}
                                                        </td>
                                                        <td className="p-2 text-right font-mono">{formatQty(material.stagedQuantity)}</td>
                                                        <td className="p-2 text-right font-mono">{formatQty(material.consumedQuantity)}</td>
                                                        <td className="p-2 text-right">
                                                            <Input
                                                                type="number"
                                                                min={0}
                                                                max={Number(material.returnableQuantity || 0)}
                                                                value={consumption[material.joMaterialId] ?? "0"}
                                                                onChange={(event) => {
                                                                    const value = event.target.value;
                                                                    setConsumption((prev) => ({ ...prev, [material.joMaterialId]: value }));
                                                                }}
                                                                className="ml-auto h-8 w-24 text-right font-mono text-xs"
                                                            />
                                                        </td>
                                                        <td className="p-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                                            {formatQty(returned)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Consumed into output: <strong className="text-foreground">{formatQty(totalConsumed)}</strong> ·
                                    Returned to store: <strong className="text-foreground">{formatQty(totalReturned)}</strong>
                                </p>
                            </div>

                            <div className="space-y-1">
                                <Label htmlFor="finalize-remarks" className="text-xs font-semibold">Finalization Remarks</Label>
                                <textarea
                                    id="finalize-remarks"
                                    value={remarks}
                                    onChange={(event) => setRemarks(event.target.value)}
                                    rows={2}
                                    className="w-full rounded-md border bg-background px-3 py-2 text-xs"
                                    placeholder="Optional notes for the audit trail..."
                                />
                            </div>

                            {validationError && Number(yieldQty) > 0 && (
                                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400" role="alert">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {validationError}
                                </div>
                            )}
                        </>
                    ) : null}
                </div>

                <DialogFooter className="gap-2 border-t pt-3">
                    <Button type="button" variant="outline" onClick={onClose} disabled={actionLoading} className="min-h-10 text-sm font-semibold">
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={() => void handleSubmit()}
                        disabled={actionLoading || loadingPreview || Boolean(previewError) || Boolean(validationError) || !preview}
                        className="min-h-10 gap-1.5 text-sm font-bold"
                    >
                        {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
                        {actionLoading ? "Finalizing..." : "Finalize & Receipt Partial Yield"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
