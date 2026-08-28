"use client";

import { Calculator, Lock } from "lucide-react";
import { HybridCalculationResult } from "./types";

interface LineItemsPostingTableProps {
    calculationResult: HybridCalculationResult;
    onExecutePosting: () => void;
    posting: boolean;
    canPost: boolean;
    disabledReason?: string;
}

function formatPhp(value: number, fractionDigits = 2): string {
    return `PHP ${Number(value || 0).toLocaleString("en-US", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits
    })}`;
}

export default function LineItemsPostingTable({
    calculationResult,
    onExecutePosting,
    posting,
    canPost,
    disabledReason
}: LineItemsPostingTableProps) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Calculator className="h-4 w-4" />
                    Landed Cost Allocation Preview
                </h3>
            </div>

            <div className="border rounded-xl overflow-x-auto bg-background">
                <table className="w-full min-w-[720px] text-xs text-left">
                    <thead className="bg-muted/50 border-b text-[11px] font-bold text-muted-foreground uppercase">
                        <tr>
                            <th className="p-3">Item</th>
                            <th className="p-3">Category</th>
                            <th className="p-3 text-right">Received Qty</th>
                            <th className="p-3 text-right">Base Cost (PHP)</th>
                            <th className="p-3 text-right">Allocated Adjustment / Unit (PHP)</th>
                            <th className="p-3 text-right">Final Landed Unit Cost (PHP)</th>
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

                            return (
                                <tr key={line.purchase_order_product_id} className="hover:bg-muted/30">
                                    <td className="p-3 font-semibold">{name}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded border text-[10px] font-bold ${categoryClass}`}>
                                            {categoryLabel}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold">
                                        {Number(line.accepted_quantity ?? line.received_quantity ?? 0).toLocaleString()}
                                    </td>
                                    <td className="p-3 text-right font-mono">{formatPhp(line.base_unit_cost_php)}</td>
                                    <td className="p-3 text-right font-mono font-bold text-emerald-600">
                                        +{formatPhp(line.allocated_expense_php)}
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold text-amber-600">
                                        {formatPhp(line.final_landed_unit_cost)}
                                    </td>
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
