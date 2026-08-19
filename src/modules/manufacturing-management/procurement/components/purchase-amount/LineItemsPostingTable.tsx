"use client";

import React from "react";
import { Lock, Calculator } from "lucide-react";
import { HybridCalculationResult, POLineItem } from "./types";

interface LineItemsPostingTableProps {
    isForeignPO: boolean;
    exchangeRate: number;
    calculationResult: HybridCalculationResult;
    setLineItems?: React.Dispatch<React.SetStateAction<POLineItem[]>>;
    onExecutePosting: () => void;
    posting: boolean;
    allocationRuleSelected: boolean;
}

export default function LineItemsPostingTable({
    isForeignPO,
    exchangeRate,
    calculationResult,
    onExecutePosting,
    posting,
    allocationRuleSelected
}: LineItemsPostingTableProps) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Calculator className="h-4 w-4" />
                    {isForeignPO ? "4-Phase Landed Cost Allocation Preview" : "Local Purchase Amounts Recalculation"}
                </h3>
            </div>

            <div className="border rounded-xl overflow-hidden bg-background">
                <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 border-b text-[11px] font-bold text-muted-foreground uppercase">
                        <tr>
                            <th className="p-3">Product Item</th>
                            <th className="p-3">Category</th>
                            <th className="p-3 text-right">Received Qty</th>
                            <th className="p-3 text-right">Line Gross Weight (kg)</th>
                            <th className="p-3 text-right">Unit Price ({isForeignPO ? "USD" : "PHP"})</th>
                            {isForeignPO ? (
                                <>
                                    <th className="p-3 text-right">Base Cost (PHP)</th>
                                    <th className="p-3 text-right">Allocated Expense (PHP)</th>
                                    <th className="p-3 text-right">Final Landed Unit Cost</th>
                                </>
                            ) : (
                                <>
                                    <th className="p-3 text-right">Line Total (PHP)</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {calculationResult.lineCalculations.map((line) => {
                            const name = line.product_name || `Product #${line.product_id}`;
                            const isPkg = line.category_type === "PACKAGING";
                            const price = Number(line.unit_price) || 0;
                            const basePhp = price * (isForeignPO ? exchangeRate : 1.0);
                            const lineTotal = basePhp * (line.received_quantity || 0);

                            return (
                                <tr key={line.purchase_order_product_id} className="hover:bg-muted/30">
                                    <td className="p-3 font-semibold">{name}</td>
                                    <td className="p-3">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                            isPkg 
                                                ? "bg-purple-500/10 text-purple-600 border border-purple-500/20" 
                                                : "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                                        }`}>
                                            {isPkg ? "PACKAGING" : "RAW MATERIAL"}
                                        </span>
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold">{line.received_quantity.toLocaleString()}</td>
                                    <td className="p-3 text-right font-mono text-muted-foreground">
                                        <div>{Number(line.line_gross_weight_kg || 0).toFixed(3)}</div>
                                        {line.category_type === "PACKAGING" && (
                                            <div className="text-[9px] text-muted-foreground/80">
                                                N {Number(line.unit_net_weight_kg || 0).toFixed(3)} + C {Number(line.unit_outer_carton_weight_kg || 0).toFixed(3)} + P {Number(line.unit_pallet_weight_kg || 0).toFixed(3)}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-3 text-right font-mono font-bold">
                                        {isForeignPO ? "$" : "₱"}{price.toFixed(2)}
                                    </td>
                                    {isForeignPO ? (
                                        <>
                                            <td className="p-3 text-right font-mono text-muted-foreground">₱{basePhp.toFixed(2)}</td>
                                            <td className="p-3 text-right font-mono text-emerald-600 font-bold">
                                                +₱{line.allocated_expense_php.toFixed(2)}
                                            </td>
                                            <td className="p-3 text-right font-mono font-bold text-amber-600">
                                                ₱{line.final_landed_unit_cost.toFixed(2)}
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="p-3 text-right font-mono font-bold text-emerald-600">
                                                ₱{lineTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                                            </td>
                                        </>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-end pt-2">
                <button
                    type="button"
                    disabled={posting || !allocationRuleSelected}
                    onClick={onExecutePosting}
                    className="h-10 px-5 rounded-lg bg-primary text-primary-foreground font-bold text-xs flex items-center gap-2 hover:bg-primary/90 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
                >
                    <Lock className="h-4 w-4" />
                    {posting ? "Posting Amounts..." : "Post Purchase Amounts & Lock Costs"}
                </button>
            </div>
            {!allocationRuleSelected && (
                <p className="text-right text-[11px] text-muted-foreground">
                    Select an allocation rule before posting purchase amounts.
                </p>
            )}
        </div>
    );
}
