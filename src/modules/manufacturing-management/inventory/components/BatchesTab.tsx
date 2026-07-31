import React from "react";
import { ChevronRight, Bookmark } from "lucide-react";
import { GroupedBatchProduct } from "../types/inventory.types";

interface BatchesTabProps {
    productBatchesGrouped: GroupedBatchProduct[];
    expandedBatches: Record<number, boolean>;
    toggleBatchExpand: (prodId: number) => void;
}

export function BatchesTab({
    productBatchesGrouped,
    expandedBatches,
    toggleBatchExpand
}: BatchesTabProps) {
    return (
        <table className="w-full border-collapse text-left text-xs">
            <thead>
                <tr className="border-b border-input text-muted-foreground">
                    <th className="py-3 px-4 font-bold">Product Details</th>
                    <th className="py-3 px-4 font-bold text-right">Total Stock</th>
                    <th className="py-3 px-4 font-bold text-right hidden sm:table-cell">Landed Asset Value</th>
                    <th className="py-3 px-4 font-bold text-center">Active Batches</th>
                    <th className="py-3 px-4 font-bold hidden md:table-cell">Oldest Batch Expiry</th>
                </tr>
            </thead>
            <tbody>
                {productBatchesGrouped.map((prod, idx) => {
                    const isExpanded = !!expandedBatches[Number(prod.product_id)];

                    return (
                        <React.Fragment key={prod.product_id || idx}>
                            <tr
                                className="border-b border-input/60 hover:bg-muted/10 cursor-pointer select-none"
                                onClick={() => toggleBatchExpand(Number(prod.product_id))}
                            >
                                <td className="py-3.5 px-4">
                                    <div className="flex items-center gap-2">
                                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-90 text-primary" : ""}`} />
                                        <div>
                                            <span className="font-extrabold text-foreground block text-sm">{prod.product_name}</span>
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase">{prod.product_code} • {prod.product_category?.category_name || "Unassigned"}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3.5 px-4 text-right font-black text-foreground text-sm">
                                    {prod.totalStock.toLocaleString()} {prod.unit_of_measurement?.unit_shortcut || "PCS"}
                                </td>
                                <td className="py-3.5 px-4 text-right font-bold text-foreground hidden sm:table-cell">
                                    ₱{prod.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="py-3.5 px-4 text-center font-bold text-primary">
                                    <span className="bg-primary/10 px-2.5 py-1 rounded-full text-xs">
                                        {prod.batchesCount} Batches
                                    </span>
                                </td>
                                <td className="py-3.5 px-4 font-bold text-muted-foreground hidden md:table-cell">
                                    {prod.oldestExpiry ? (
                                        <span className="font-mono text-foreground">{prod.oldestExpiry}</span>
                                    ) : (
                                        <span className="italic text-muted-foreground/60">No Expirations (Static)</span>
                                    )}
                                </td>
                            </tr>
                            {isExpanded && (
                                <tr className="bg-muted/5">
                                    <td colSpan={5} className="p-4 border-b border-input">
                                        <div className="border-l-4 border-primary pl-4 py-2 space-y-3">
                                            <h5 className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                                                <Bookmark className="h-4 w-4 text-primary" />
                                                FIFO Lot Batch Breakdown
                                            </h5>
                                            <div className="overflow-x-auto border border-input rounded-xl bg-card">
                                                <table className="w-full text-xs text-left">
                                                    <thead>
                                                        <tr className="bg-muted/30 border-b border-input text-[9px] font-black uppercase text-muted-foreground">
                                                            <th className="py-2.5 px-3">Lot Number</th>
                                                            <th className="py-2.5 px-3">Warehouse Branch</th>
                                                            <th className="py-2.5 px-3">Location / Version</th>
                                                            <th className="py-2.5 px-3 text-right">Available Qty</th>
                                                            <th className="py-2.5 px-3 text-right">Reserved</th>
                                                            <th className="py-2.5 px-3 text-right font-black">On Hand</th>
                                                            <th className="py-2.5 px-3 text-right">Landed Unit Cost</th>
                                                            <th className="py-2.5 px-3 text-right">Landed Total Value</th>
                                                            <th className="py-2.5 px-3">Expiry / Reception Date</th>
                                                            <th className="py-2.5 px-3 text-center">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-input/50">
                                                        {prod.batches.length === 0 ? (
                                                            <tr>
                                                                <td colSpan={10} className="py-4 text-center text-muted-foreground italic">
                                                                    No active batches found for this product.
                                                                </td>
                                                            </tr>
                                                        ) : (
                                                            prod.batches.map((batch: any, bIdx: number) => {
                                                                const cost = Number(batch.final_landed_unit_cost || batch.base_unit_cost_php || 0);
                                                                const availQty = Number(batch.available_quantity ?? batch.quantity_received ?? 0);
                                                                const resQty = Number(batch.reserved_quantity ?? 0);
                                                                const onHandQty = Number(batch.on_hand_quantity ?? (availQty + resQty));
                                                                const versionLoc = batch.version_name || batch.lot_name || "Standard Lot";

                                                                return (
                                                                    <tr key={bIdx} className="hover:bg-muted/10 font-medium text-foreground">
                                                                        <td className="py-2 px-3 font-bold font-mono">
                                                                            {batch.lot_number || batch.batch_no}
                                                                        </td>
                                                                        <td className="py-2 px-3 font-semibold text-muted-foreground">
                                                                            {batch.branch_name}
                                                                        </td>
                                                                        <td className="py-2 px-3 font-medium text-muted-foreground text-[10px]">
                                                                            {versionLoc}
                                                                        </td>
                                                                        <td className="py-2 px-3 text-right font-black text-emerald-600 dark:text-emerald-400">
                                                                            {availQty.toLocaleString()}
                                                                        </td>
                                                                        <td className="py-2 px-3 text-right font-bold text-amber-600 dark:text-amber-400">
                                                                            {resQty > 0 ? resQty.toLocaleString() : "-"}
                                                                        </td>
                                                                        <td className="py-2 px-3 text-right font-black text-foreground">
                                                                            {onHandQty.toLocaleString()}
                                                                        </td>
                                                                        <td className="py-2 px-3 text-right font-bold text-muted-foreground">
                                                                            ₱{cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                        </td>
                                                                        <td className="py-2 px-3 text-right font-bold">
                                                                            ₱{(availQty * cost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                        </td>
                                                                        <td className="py-2 px-3 font-semibold text-muted-foreground">
                                                                            {batch.expiration_date || <span className="italic text-[10px]">Static (No Expiration)</span>}
                                                                        </td>
                                                                        <td className="py-2 px-3 text-center">
                                                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold border ${batch.expiryStatus === "expired"
                                                                                    ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                                                                    : batch.expiryStatus === "soon"
                                                                                        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                                                                        : "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                                                                }`}>
                                                                                {batch.expiryStatus === "expired"
                                                                                    ? "EXPIRED"
                                                                                    : batch.expiryStatus === "soon"
                                                                                        ? `Expiring in ${batch.daysToExpiry} days`
                                                                                        : "Active Safe"}
                                                                            </span>
                                                                        </td>
                                                                    </tr>
                                                                );
                                                            })
                                                        )}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    );
                })}

                {productBatchesGrouped.length === 0 && (
                    <tr>
                        <td colSpan={5} className="py-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
                            No active FIFO product batches found matching search filters.
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
    );
}
