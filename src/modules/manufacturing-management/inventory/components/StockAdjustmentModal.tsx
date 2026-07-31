import React from "react";
import { Sliders, X, Plus, Loader2 } from "lucide-react";
import { InventoryData } from "../types/inventory.types";

interface StockAdjustmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: InventoryData | null;
    adjProductId: string;
    setAdjProductId: (v: string) => void;
    adjBranchId: string;
    setAdjBranchId: (v: string) => void;
    adjQty: string;
    setAdjQty: (v: string) => void;
    adjType: string;
    setAdjType: (v: string) => void;
    adjRemarks: string;
    setAdjRemarks: (v: string) => void;
    adjDate: string;
    setAdjDate: (v: string) => void;
    submittingAdj: boolean;
    onSubmit: (e: React.FormEvent) => void;
}

export function StockAdjustmentModal({
    isOpen,
    onClose,
    data,
    adjProductId,
    setAdjProductId,
    adjBranchId,
    setAdjBranchId,
    adjQty,
    setAdjQty,
    adjType,
    setAdjType,
    adjRemarks,
    setAdjRemarks,
    adjDate,
    setAdjDate,
    submittingAdj,
    onSubmit
}: StockAdjustmentModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-300">
            <div className="bg-card border border-border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20">
                    <div>
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                            <Sliders className="h-4.5 w-4.5 text-primary" />
                            Post Stock Adjustment
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Post manual corrections, losses, or reconciliations directly to the ledger.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground border-none bg-transparent cursor-pointer transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <form onSubmit={onSubmit} className="p-5 space-y-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Product SKU</label>
                        <select
                            value={adjProductId}
                            onChange={e => setAdjProductId(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                            required
                        >
                            <option value="">Select product to adjust...</option>
                            {data?.products.map(p => (
                                <option key={p.product_id} value={p.product_id}>
                                    {p.product_name} ({p.product_code})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">Branch ID</label>
                            <select
                                value={adjBranchId}
                                onChange={e => setAdjBranchId(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                            >
                                {data?.branches && data.branches.length > 0 ? (
                                    data.branches.map(br => (
                                        <option key={br.id} value={br.id}>
                                            {br.branch_name}
                                        </option>
                                    ))
                                ) : (
                                    <>
                                        <option value="1">Branch 1 (Main Warehouse)</option>
                                        <option value="2">Branch 2 (Logistics Hub)</option>
                                        <option value="3">Branch 3 (Factory Storage)</option>
                                    </>
                                )}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">Qty Change</label>
                            <input
                                type="number"
                                step="any"
                                placeholder="e.g. -50 or 120"
                                value={adjQty}
                                onChange={e => setAdjQty(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                required
                            />
                            <span className="text-[9px] text-muted-foreground block mt-0.5">Use negative numbers to deduct</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">Adjustment Type</label>
                            <select
                                value={adjType}
                                onChange={e => setAdjType(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                            >
                                <option value="Stock Take Reconciliation">Stock Reconciliation</option>
                                <option value="Loss / Damage Adjustment">Spill/Loss/Damage</option>
                                <option value="Quality Scrap Deduction">Quality Scrap</option>
                                <option value="Reclassification Adjustment">Reclassification</option>
                                <option value="Supplier Inbound Shortage">Supplier Shortage</option>
                            </select>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">Effective Date</label>
                            <input
                                type="date"
                                value={adjDate}
                                onChange={e => setAdjDate(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-[10px] font-bold uppercase text-muted-foreground">Remarks / Description</label>
                        <textarea
                            rows={2}
                            placeholder="Enter reasoning (e.g., Damaged during forklift operation, reconciliation after annual audit)..."
                            value={adjRemarks}
                            onChange={e => setAdjRemarks(e.target.value)}
                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none"
                            required
                        />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submittingAdj}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-all border-none flex items-center gap-1.5 shadow-sm"
                        >
                            {submittingAdj ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Posting...
                                </>
                            ) : (
                                <>
                                    <Plus className="h-3.5 w-3.5" /> Save Adjustment
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
