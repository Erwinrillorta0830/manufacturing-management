import React from "react";
import { Search, MapPin, ChevronDown, ChevronUp, Bookmark } from "lucide-react";
import { Branch, FIFOInventoryItem, FIFOBatch } from "../types";
import { ProcurementStatusBadge } from "../../shared/components/ProcurementStatusBadge";
import { ModuleStatePanel } from "../../shared/components/ModuleStatePanel";
import type { StatusTone } from "@/components/ui/status-badge";

interface FIFOInventoryListProps {
    branches: Branch[];
    fifoBranchId: string;
    loadingFifo: boolean;
    fifoSearch: string;
    setFifoSearch: (val: string) => void;
    filteredFifoList: FIFOInventoryItem[];
    expandedProducts: Record<number, boolean>;
    toggleProductExpand: (prodId: number) => void;
    handleLoadFifoInventory: (branchId: string) => void;
}

export default function FIFOInventoryList({
    branches,
    fifoBranchId,
    loadingFifo,
    fifoSearch,
    setFifoSearch,
    filteredFifoList,
    expandedProducts,
    toggleProductExpand,
    handleLoadFifoInventory
}: FIFOInventoryListProps) {
    
    // Date checker helper for raw material badge status
    const getExpirationStatus = (expDate?: string): { text: string; tone: StatusTone } => {
        if (!expDate) return { text: "No Date", tone: "neutral" };
        const today = new Date();
        const exp = new Date(expDate);
        const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { text: "Expired", tone: "destructive" };
        } else if (diffDays <= 30) {
            return { text: `Expiring: ${diffDays}d`, tone: "warning" };
        } else {
            return { text: "Fresh", tone: "success" };
        }
    };

    return (
        <div className="border rounded-xl bg-card p-5 space-y-5">
            {/* Filters bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5 border-b pb-4">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <MapPin className="h-4 w-4 text-primary shrink-0" />
                    <select
                        value={fifoBranchId}
                        onChange={(e) => handleLoadFifoInventory(e.target.value)}
                        className="w-full sm:w-64 h-9 rounded-lg border bg-background text-foreground text-xs font-bold px-3 py-2 outline-none focus:ring-1 focus:ring-primary cursor-pointer transition-all"
                    >
                        <option value="">Select Branch Location...</option>
                        {branches.map(b => (
                            <option key={b.id} value={b.id.toString()}>{b.branch_name}</option>
                        ))}
                    </select>
                </div>

                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search products..."
                        value={fifoSearch}
                        onChange={e => setFifoSearch(e.target.value)}
                        className="w-full bg-background border text-foreground rounded-lg pl-8 pr-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>
            </div>

            {/* Stock reading area */}
            {loadingFifo ? (
                <ModuleStatePanel state="loading" title="Loading FIFO queues..." className="min-h-40" />
            ) : !fifoBranchId ? (
                <ModuleStatePanel
                    state="empty"
                    icon={MapPin}
                    title="Select a branch location"
                    description="Select a branch location to read current raw materials and packaging ledger."
                    className="min-h-40"
                />
            ) : filteredFifoList.length === 0 ? (
                <ModuleStatePanel
                    state="empty"
                    icon={Search}
                    title="No inventory items found matching filters."
                    className="min-h-40"
                />
            ) : (
                <div className="space-y-3">
                    {filteredFifoList.map(item => {
                        const isExpanded = expandedProducts[item.product.product_id] || false;

                        return (
                            <div key={item.product.product_id} className="border rounded-xl overflow-hidden transition-all bg-muted/5">
                                {/* Product header info */}
                            <button 
                                type="button"
                                onClick={() => toggleProductExpand(item.product.product_id)}
                                className="w-full text-left p-4 bg-card hover:bg-muted/10 transition-all cursor-pointer flex items-center justify-between gap-4"
                            >
                                    <div className="space-y-1 min-w-0">
                                        <span className="font-extrabold text-xs text-foreground block truncate">{item.product.product_name}</span>
                                        <div className="flex gap-2 text-[10px]">
                                            <span className="text-muted-foreground font-mono">Code: {item.product.product_code}</span>
                                            <span className="text-muted-foreground">•</span>
                                            <span className={`font-bold ${item.isPackaging ? "text-info" : "text-warning"}`}>
                                                {item.isPackaging ? "Packaging" : "Raw Material"}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="text-right">
                                            <span className="text-xs font-black text-foreground block">
                                                {item.totalQty.toLocaleString()} Units
                                            </span>
                                            <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-wide block">
                                                Total In Stock
                                            </span>
                                        </div>
                                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                    </div>
                                </button>

                                {/* Expandable FIFO batches table */}
                                {isExpanded && (
                                    <div className="p-4 bg-muted/5 border-t">
                                        {/* Mobile view: Batch Cards */}
                                        <div className="space-y-3 md:hidden">
                                            {item.batches.map((batch: FIFOBatch, index: number) => {
                                                const expStatus = getExpirationStatus(batch.expiration_date);
                                                return (
                                                    <div key={index} className="bg-background border rounded-lg p-3.5 space-y-2.5 text-xs shadow-sm">
                                                        <div className="flex justify-between items-center">
                                                            <div className="flex items-center gap-1.5 font-bold text-foreground min-w-0">
                                                                <Bookmark className="h-3.5 w-3.5 text-primary shrink-0" />
                                                                <span className="truncate">{batch.lot_number}</span>
                                                            </div>
                                                            <div className="shrink-0">
                                                                {item.isPackaging ? (
                                                                    <ProcurementStatusBadge status={index === 0 ? "Next Out" : "Buffered"} tone={index === 0 ? "warning" : "neutral"} className="text-[8px] font-black" />
                                                                ) : (
                                                                    <ProcurementStatusBadge status={expStatus.text} tone={expStatus.tone} className="text-[8px] font-black" />
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground border-t pt-2">
                                                            <div>
                                                                <span className="block font-bold text-[8px] uppercase tracking-wider text-muted-foreground/75">
                                                                    {item.isPackaging ? "Received Date" : "Expiration Date"}
                                                                </span>
                                                                <span className="font-bold text-foreground">
                                                                    {item.isPackaging ? batch.reception_date : (batch.expiration_date || "N/A")}
                                                                </span>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="block font-bold text-[8px] uppercase tracking-wider text-muted-foreground/75">Qty Received</span>
                                                                <span className="font-extrabold text-foreground font-mono text-[11px]">{batch.received_qty.toLocaleString()}</span>
                                                            </div>
                                                            <div className="col-span-2 border-t border-dashed pt-1.5 flex justify-between items-center">
                                                                <span className="text-[8px] uppercase tracking-wider font-bold text-muted-foreground/75">Shipment Ref</span>
                                                                <span className="font-mono text-foreground font-extrabold text-[9px]">{batch.shipment_ref}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Desktop view: Table */}
                                        <div className="hidden md:block overflow-x-auto">
                                            <table className="w-full text-xs text-left">
                                                <thead>
                                                    <tr className="text-[10px] text-muted-foreground uppercase font-black border-b pb-2">
                                                        <th className="pb-2">Batch / Lot Number</th>
                                                        {item.isPackaging ? (
                                                            <th className="pb-2">Received Date</th>
                                                        ) : (
                                                            <th className="pb-2">Expiration Date</th>
                                                        )}
                                                        <th className="pb-2 text-right">Received Qty</th>
                                                        <th className="pb-2">Shipment Ref</th>
                                                        <th className="pb-2 text-right">FIFO Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {item.batches.map((batch: FIFOBatch, index: number) => {
                                                        const expStatus = getExpirationStatus(batch.expiration_date);
                                                        return (
                                                            <tr key={index} className="border-b last:border-0 hover:bg-muted/10">
                                                                <td className="py-2.5 font-bold text-foreground flex items-center gap-1.5">
                                                                    <Bookmark className="h-3.5 w-3.5 text-primary shrink-0" />
                                                                    {batch.lot_number}
                                                                </td>
                                                                <td className="py-2.5 font-semibold text-muted-foreground">
                                                                    {item.isPackaging ? batch.reception_date : (batch.expiration_date || "N/A")}
                                                                </td>
                                                                <td className="py-2.5 text-right font-mono text-foreground font-bold">
                                                                    {batch.received_qty.toLocaleString()}
                                                                </td>
                                                                <td className="py-2.5 text-muted-foreground font-mono">
                                                                    {batch.shipment_ref}
                                                                </td>
                                                                <td className="py-2.5 text-right">
                                                                    {item.isPackaging ? (
                                                                        <ProcurementStatusBadge status={index === 0 ? "Next Out (Oldest)" : "Buffered"} tone={index === 0 ? "warning" : "neutral"} className="text-[9px] font-black" />
                                                                    ) : (
                                                                        <ProcurementStatusBadge status={expStatus.text} tone={expStatus.tone} className="text-[9px] font-black" />
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
