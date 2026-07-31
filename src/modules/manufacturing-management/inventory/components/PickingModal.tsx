import React from "react";
import { ArrowUpRight, X, Loader2, CheckCircle } from "lucide-react";
import { PickingJO, InventoryData } from "../types/inventory.types";

interface PickingModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedPickingJO: PickingJO | null;
    data: InventoryData | null;
    pickingSubmitting: boolean;
    onConfirmPick: (jo: PickingJO) => void;
}

export function PickingModal({
    isOpen,
    onClose,
    selectedPickingJO,
    data,
    pickingSubmitting,
    onConfirmPick
}: PickingModalProps) {
    if (!isOpen || !selectedPickingJO) return null;

    const isPicked = (selectedPickingJO as any).isPicked;
    const branchName = data?.branches?.find(b => Number(b.id) === Number(selectedPickingJO.branch_id))?.branch_name ||
        (Number(selectedPickingJO.branch_id) === 1 || Number(selectedPickingJO.branch_id) === 183 ? "Main Branch" : Number(selectedPickingJO.branch_id) === 163 ? "Urdaneta Branch" : `Branch #${selectedPickingJO.branch_id}`);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs animate-in fade-in duration-300">
            <div className="bg-card border border-border w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-5 border-b border-border flex items-center justify-between bg-muted/20">
                    <div>
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                            <ArrowUpRight className="h-4.5 w-4.5 text-primary" />
                            Material Picking Sheet: {selectedPickingJO.jo_id}
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Deduct raw stocks and transfer component lots to WIP storage.</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground border-none bg-transparent cursor-pointer transition-colors"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-muted/10 p-3 rounded-xl border border-border/60">
                        <div>
                            <span className="text-[9px] text-muted-foreground uppercase font-bold">Target Product</span>
                            <div className="text-xs font-bold mt-0.5">{selectedPickingJO.product_name}</div>
                        </div>
                        <div>
                            <span className="text-[9px] text-muted-foreground uppercase font-bold">Target Run Qty</span>
                            <div className="text-xs font-bold mt-0.5">{((selectedPickingJO as any).quantity || selectedPickingJO.planned_quantity || 0).toLocaleString()} units</div>
                        </div>
                        <div>
                            <span className="text-[9px] text-muted-foreground uppercase font-bold">Branch</span>
                            <div className="text-xs font-bold mt-0.5">{branchName}</div>
                        </div>
                        <div>
                            <span className="text-[9px] text-muted-foreground uppercase font-bold">Pick Status</span>
                            <div className="text-xs font-bold mt-0.5">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${isPicked ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                                    }`}>
                                    {isPicked ? "Picked" : "Pending"}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <h4 className="text-[11px] font-extrabold text-muted-foreground uppercase tracking-wider">Required Component Allocations (FIFO Lots)</h4>
                        <div className="border border-border rounded-xl overflow-hidden bg-card">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-muted/30 border-b border-border text-muted-foreground">
                                        <th className="p-2.5 font-bold">Component Name</th>
                                        <th className="p-2.5 font-bold">Required Qty</th>
                                        <th className="p-2.5 font-bold">FIFO Lot Number</th>
                                        <th className="p-2.5 font-bold">Expiry Date</th>
                                        <th className="p-2.5 font-bold text-right">Pick Qty</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {isPicked ? (
                                        (selectedPickingJO as any).pickedItems && (selectedPickingJO as any).pickedItems.map((item: any, idx: number) => {
                                            const name = data?.products?.find(p => p.product_id === item.productId)?.product_name || `Component #${item.productId}`;
                                            return (
                                                <tr key={idx} className="border-b border-border/40 last:border-0">
                                                    <td className="p-2.5 font-semibold text-foreground">{name}</td>
                                                    <td className="p-2.5 text-muted-foreground">-</td>
                                                    <td className="p-2.5 font-extrabold text-foreground">{item.lotNumber}</td>
                                                    <td className="p-2.5 text-muted-foreground">Passed</td>
                                                    <td className="p-2.5 text-right font-bold text-emerald-600">{item.quantity.toLocaleString()} units</td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        selectedPickingJO.allocationResults && selectedPickingJO.allocationResults.map((alloc: any, idx: number) => {
                                            return (
                                                <React.Fragment key={idx}>
                                                    {alloc.batches && alloc.batches.length > 0 ? (
                                                        alloc.batches.map((batch: any, bIdx: number) => (
                                                            <tr key={`${idx}-${bIdx}`} className="border-b border-border/40 last:border-0 hover:bg-muted/5">
                                                                <td className="p-2.5 font-semibold text-foreground">
                                                                    {bIdx === 0 ? alloc.component_name : <span className="text-muted-foreground pl-3">↳ Lot Split</span>}
                                                                </td>
                                                                <td className="p-2.5 text-muted-foreground font-semibold">
                                                                    {bIdx === 0 ? `${alloc.required.toLocaleString(undefined, { maximumFractionDigits: 2 })} units` : ""}
                                                                </td>
                                                                <td className="p-2.5 font-extrabold text-foreground">{batch.lot_number}</td>
                                                                <td className="p-2.5 text-muted-foreground font-bold">{batch.expiration_date}</td>
                                                                <td className="p-2.5 text-right font-bold text-amber-600">{batch.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })} units</td>
                                                            </tr>
                                                        ))
                                                    ) : (
                                                        <tr className="border-b border-border/40 last:border-0 text-rose-500">
                                                            <td className="p-2.5 font-semibold">{alloc.component_name}</td>
                                                            <td className="p-2.5 font-semibold">{alloc.required.toLocaleString()} units</td>
                                                            <td colSpan={3} className="p-2.5 text-right font-bold text-[10px] uppercase">Deficit: {alloc.deficit.toLocaleString()} units (NO STOCK)</td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-muted hover:bg-muted/80 text-foreground border border-border text-xs font-bold px-4 py-2 rounded-lg cursor-pointer transition-all"
                        >
                            Close
                        </button>
                        {!isPicked && (
                            <button
                                type="button"
                                onClick={() => onConfirmPick(selectedPickingJO)}
                                disabled={pickingSubmitting || selectedPickingJO.allocationResults?.some((a: any) => a.deficit > 0)}
                                className="bg-primary hover:bg-primary/95 text-primary-foreground border-transparent text-xs font-bold px-4 py-2 rounded-lg cursor-pointer shadow-sm transition-all flex items-center gap-1.5"
                            >
                                {pickingSubmitting ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Transferring...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="h-3.5 w-3.5" /> Confirm Pick & Issue to WIP
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
