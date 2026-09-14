"use client";

import { Calculator, Lock } from "lucide-react";
import { HybridCalculationResult } from "./types";
import { PROCUREMENT_MONEY_DECIMAL_SCALE } from "@/modules/manufacturing-management/decimal";
import { cn } from "@/lib/utils";

interface LineItemsPostingTableProps {
    calculationResult: HybridCalculationResult;
    onExecutePosting: () => void;
    posting: boolean;
    canPost: boolean;
    disabledReason?: string;
    currencyCode?: string;
}

function formatAmount(value: number, fractionDigits = PROCUREMENT_MONEY_DECIMAL_SCALE): string {
    return Number(value || 0).toLocaleString("en-US", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
    });
}

function formatQuantity(value: number): string {
    return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export default function LineItemsPostingTable({
    calculationResult,
    onExecutePosting,
    posting,
    canPost,
    disabledReason,
    currencyCode
}: LineItemsPostingTableProps) {
    const priceCurrency = (currencyCode || calculationResult.lineCalculations[0]?.currency_code || "PHP").toUpperCase();

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Calculator className="h-4 w-4" />
                    Landed Cost Allocation Preview
                </h3>
            </div>

            <div className="border rounded-xl overflow-x-auto bg-background">
                <table className="w-full min-w-[1160px] text-xs text-left">
                    <thead className="bg-muted/50 border-b text-[11px] font-bold text-muted-foreground uppercase">
                        <tr>
                            <th className="p-3">Material</th>
                            <th className="p-3">Category</th>
                            <th className="p-3 text-center">UOM</th>
                            <th className="p-3 text-right">Received Qty</th>
                            <th className="p-3 text-right">List Price ({priceCurrency})</th>
                            <th className="p-3 text-right">Discount</th>
                            <th className="p-3 text-right">Net Amount ({priceCurrency})</th>
                            <th className="p-3 text-right">Allocated Adjustment / Unit (PHP)</th>
                            <th className="p-3 text-right">Final Landed Cost / Unit (PHP)</th>
                            <th className="p-3 text-right">Total Landed Cost (PHP)</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {calculationResult.lineCalculations.map(line => {
                            const name = line.product_name || `Product #${line.product_id}`;
                            const categoryLabel = line.category_type === "PACKAGING"
                                ? "PACKAGING"
                                : line.category_type === "FINISHED_GOODS"
                                    ? "FINISHED GOODS"
                                    : "RAW MATERIAL";
                            const categoryClass = line.category_type === "PACKAGING"
                                ? "bg-purple-500/10 text-purple-600 border-purple-500/20"
                                : line.category_type === "FINISHED_GOODS"
                                    ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                                    : "bg-blue-500/10 text-blue-600 border-blue-500/20";
                            const receivedQuantity = Number(line.accepted_quantity ?? line.received_quantity ?? 0);
                            const listPrice = Number(line.list_price ?? line.unit_price_foreign ?? line.base_unit_cost_php ?? 0);
                            const discountPercent = Number(line.discount_percent || 0);
                            const discountAmount = Number(line.discount_amount || 0);
                            const hasDiscount = discountPercent > 0 || discountAmount > 0;
                            const netAmount = Number(line.net_amount ?? Math.max(0, receivedQuantity * listPrice - discountAmount));
                            const allocatedAdjustment = Number(line.allocated_expense_php || 0);
                            const finalLandedUnitCost = Number(line.final_landed_unit_cost || 0);
                            const totalLandedCost = Number(line.total_landed_cost ?? finalLandedUnitCost * receivedQuantity);

                            return (
                                <tr key={line.purchase_order_product_id} className="hover:bg-muted/30">
                                    <td className="p-3 font-semibold">{name}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${categoryClass}`}>
                                            {categoryLabel}
                                        </span>
                                    </td>
                                    <td className="p-3 text-center font-mono text-muted-foreground">{line.uom || "—"}</td>
                                    <td className="p-3 text-right font-mono font-bold tabular-nums">{formatQuantity(receivedQuantity)}</td>
                                    <td className="p-3 text-right font-mono tabular-nums">{formatAmount(listPrice)}</td>
                                    <td className="p-3 text-right font-mono tabular-nums">
                                        {hasDiscount ? `${discountPercent.toFixed(2)}% (${formatAmount(discountAmount)})` : "—"}
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold tabular-nums">{formatAmount(netAmount)}</td>
                                    <td className={cn("p-3 text-right font-mono font-bold tabular-nums", allocatedAdjustment > 0 ? "text-emerald-600" : "text-muted-foreground")}>
                                        {allocatedAdjustment > 0 ? `+${formatAmount(allocatedAdjustment)}` : formatAmount(allocatedAdjustment)}
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold text-amber-600 tabular-nums">{formatAmount(finalLandedUnitCost)}</td>
                                    <td className="p-3 text-right font-mono font-black tabular-nums">{formatAmount(totalLandedCost)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex flex-col items-end gap-1 pt-2">
                <button
                    type="button"
                    disabled={posting || !canPost}
                    onClick={onExecutePosting}
                    className="h-10 px-5 rounded-lg bg-primary text-primary-foreground font-bold text-xs flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-xs disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                    <Lock className="h-4 w-4" />
                    {posting ? "Posting Amounts..." : "Post Purchase Amounts & Lock Costs"}
                </button>
                {!canPost && disabledReason && (
                    <p className="text-right text-[11px] text-muted-foreground">{disabledReason}</p>
                )}
            </div>
        </div>
    );
}
