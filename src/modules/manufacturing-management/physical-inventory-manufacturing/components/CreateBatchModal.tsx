"use client";

import React, { useState } from "react";
import { Product, MmLot, MmInventoryLot } from "../types";
import { createMmDraftBatch } from "../services/physical-inventory-manufacturing-api";
import { X, AlertTriangle } from "lucide-react";

interface Props {
    isOpen: boolean;
    branchId: number;
    lotId: number;
    productId: number;
    lots: MmLot[];
    products: Product[];
    piNo?: string;
    onClose: () => void;
    onBatchCreated: (batch: MmInventoryLot) => void;
}

export default function CreateBatchModal({
    isOpen,
    branchId,
    lotId,
    productId,
    lots,
    products,
    piNo,
    onClose,
    onBatchCreated,
}: Props) {
    const targetLot = lots.find((l) => l.lot_id === lotId);
    const targetProduct = products.find((p) => p.product_id === productId);

    const [batchNo, setBatchNo] = useState("");
    const [mfgDate, setMfgDate] = useState("");
    const [expDate, setExpDate] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    React.useEffect(() => {
        if (isOpen) {
            setBatchNo("");
            setMfgDate("");
            setExpDate("");
            setError(null);
            setSubmitting(false);
        }
    }, [isOpen, lotId, productId]);

    if (!isOpen) return null;

    if (!targetLot || !targetProduct) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                <div className="bg-card border rounded-xl shadow-xl w-full max-w-md p-6 text-center space-y-4">
                    <div className="flex justify-center text-amber-500">
                        <AlertTriangle className="h-10 w-10" />
                    </div>
                    <h3 className="text-base font-bold text-foreground">Lot & Product Required</h3>
                    <p className="text-xs text-muted-foreground">
                        Please select both a valid Manufacturing Lot and a Product in the parent form before creating a new inventory batch.
                    </p>
                    <div className="pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors"
                        >
                            Got it
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const shelfLife = Number(targetProduct.product_shelf_life || 0);

    const getValidUnitCost = (val: unknown): number => {
        if (val === null || val === undefined || val === "") return 0;
        const num = Number(val);
        return isNaN(num) || num < 0 ? 0 : num;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const cleanBatchNo = batchNo.trim();
        if (!cleanBatchNo) {
            setError("Batch number is required.");
            return;
        }

        if (shelfLife > 0 && !expDate) {
            setError(`Expiration date is required because product '${targetProduct.product_name}' has a shelf life of ${shelfLife} days.`);
            return;
        }

        if (mfgDate && expDate && new Date(mfgDate) > new Date(expDate)) {
            setError("Manufacturing date cannot be after expiration date.");
            return;
        }

        const costNum = getValidUnitCost(targetProduct.cost_per_unit);

        try {
            setSubmitting(true);
            const createdDraft = await createMmDraftBatch({
                lot_id: lotId,
                branch_id: branchId,
                product_id: productId,
                batch_no: cleanBatchNo,
                manufacturing_date: mfgDate || undefined,
                expiry_date: expDate || undefined,
                unit_cost: costNum,
                source_reference: piNo || undefined,
            });
            onBatchCreated(createdDraft);
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to create draft batch";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-card border rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b bg-muted/30">
                    <h3 className="text-base font-bold text-foreground">Create Product Batch</h3>
                    <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-lg">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {error && (
                        <div className="flex items-center gap-2 p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg dark:bg-rose-950 dark:text-rose-300">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="bg-muted/30 p-3 rounded-lg border text-xs space-y-1">
                        <div><span className="font-semibold text-muted-foreground">Target Lot:</span> {targetLot.lot_name}</div>
                        <div><span className="font-semibold text-muted-foreground">Product:</span> [{targetProduct.product_code}] {targetProduct.product_name}</div>
                        <div><span className="font-semibold text-muted-foreground">Shelf Life:</span> {shelfLife > 0 ? `${shelfLife} Days (Expiration Required)` : "Non-expiring item"}</div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Batch Number *</label>
                        <input
                            type="text"
                            placeholder="e.g. BATCH-2026-001"
                            value={batchNo}
                            onChange={(e) => setBatchNo(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Manufacturing Date</label>
                            <input
                                type="date"
                                value={mfgDate}
                                onChange={(e) => setMfgDate(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">
                                Expiration Date {shelfLife > 0 && "*"}
                            </label>
                            <input
                                type="date"
                                value={expDate}
                                onChange={(e) => setExpDate(e.target.value)}
                                className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                                required={shelfLife > 0}
                            />
                        </div>
                    </div>



                    <div className="flex items-center justify-end gap-2 pt-3 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent border rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors shadow-xs"
                        >
                            {submitting ? "Creating Batch..." : "Create Batch"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
