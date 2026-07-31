import React from "react";
import { ArrowDownLeft, X, Loader2, CheckCircle } from "lucide-react";
import { ReceivingJO, InventoryData } from "../types/inventory.types";

interface ReceivingModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedReceivingJO: ReceivingJO | null;
    data: InventoryData | null;
    recQtyProduced: string;
    setRecQtyProduced: (v: string) => void;
    recLotNumber: string;
    setRecLotNumber: (v: string) => void;
    recExpirationDate: string;
    setRecExpirationDate: (v: string) => void;
    recUnitCost: string;
    setRecUnitCost: (v: string) => void;
    recSubmitting: boolean;
    onSubmit: (e: React.FormEvent) => void;
}

export function ReceivingModal({
    isOpen,
    onClose,
    selectedReceivingJO,
    data,
    recQtyProduced,
    setRecQtyProduced,
    recLotNumber,
    setRecLotNumber,
    recExpirationDate,
    setRecExpirationDate,
    recUnitCost,
    setRecUnitCost,
    recSubmitting,
    onSubmit
}: ReceivingModalProps) {
    if (!isOpen || !selectedReceivingJO) return null;

    const actualConsumed = selectedReceivingJO.actualConsumed;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-300">
            <div className="bg-card border border-border w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20">
                    <div>
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                            <ArrowDownLeft className="h-4.5 w-4.5 text-primary" />
                            Receive Yield & Close JO: {selectedReceivingJO.jo_id}
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Input the packaging output to release finished stock and close production.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground border-none bg-transparent cursor-pointer transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <form onSubmit={onSubmit} className="p-5 space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">WIP Materials Consumed (Actually Picked)</label>
                        <div className="border border-border bg-muted/10 p-2.5 rounded-lg text-[10px] space-y-1 max-h-[100px] overflow-y-auto font-semibold">
                            {actualConsumed && actualConsumed.length > 0 ? (
                                actualConsumed.map((c, idx: number) => {
                                    const name = data?.products?.find(p => p.product_id === c.productId)?.product_name || `Component #${c.productId}`;
                                    return (
                                        <div key={idx} className="flex justify-between items-center py-0.5 border-b border-border/40 last:border-none">
                                            <span className="text-foreground">{name} (Lot: {c.lotNumber})</span>
                                            <span className="font-extrabold text-muted-foreground">{c.quantity.toLocaleString()} units</span>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-rose-500 py-1">WARNING: No picking record detected. (Did you bypass picking?)</div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">Product SKU (FG)</label>
                            <div className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-xs font-bold text-foreground">
                                {selectedReceivingJO.product_name}
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">Target Production Run</label>
                            <div className="w-full bg-muted/40 border border-border rounded-lg px-3 py-2 text-xs font-bold text-foreground">
                                {(selectedReceivingJO.quantity || selectedReceivingJO.planned_quantity || 0).toLocaleString()} units
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">Actual Packaging Yield</label>
                            <input
                                type="number"
                                step="any"
                                placeholder="e.g. 4980"
                                value={recQtyProduced}
                                onChange={e => setRecQtyProduced(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                required
                            />
                            <span className="text-[9px] text-muted-foreground block mt-0.5">Input the exact final packed yield</span>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">Yield Lot Number</label>
                            <input
                                type="text"
                                placeholder="e.g. MFG-JO-XXXX"
                                value={recLotNumber}
                                onChange={e => setRecLotNumber(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none font-bold"
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">Expiration Date</label>
                            <input
                                type="date"
                                value={recExpirationDate}
                                onChange={e => setRecExpirationDate(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-muted-foreground">Unit Cost (Standard COGS)</label>
                            <input
                                type="number"
                                step="any"
                                value={recUnitCost}
                                onChange={e => setRecUnitCost(e.target.value)}
                                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs text-foreground focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                                required
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={recSubmitting}
                            className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-all border-none flex items-center gap-1.5 shadow-sm"
                        >
                            {recSubmitting ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Closing JO...
                                </>
                            ) : (
                                <>
                                    <CheckCircle className="h-3.5 w-3.5" /> Close Job Order & Post FG Stock
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
