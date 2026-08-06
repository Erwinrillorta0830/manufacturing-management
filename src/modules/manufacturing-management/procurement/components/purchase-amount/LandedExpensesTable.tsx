"use client";

import React from "react";
import { Layers, Plus, Trash2, Cpu, CheckCircle2 } from "lucide-react";
import { CreatableSelect } from "@/modules/manufacturing-management/finished-goods/components/CreatableSelect";
import { ChartOfAccount, LandedExpenseRow } from "./types";

interface LandedExpensesTableProps {
    landedExpenses: LandedExpenseRow[];
    chartOfAccounts: ChartOfAccount[];
    onAddExpenseRow: () => void;
    onRemoveExpenseRow: (id: string) => void;
    onUpdateExpenseRow: (id: string, field: keyof LandedExpenseRow, value: LandedExpenseRow[keyof LandedExpenseRow]) => void;
}

export default function LandedExpensesTable({
    landedExpenses,
    chartOfAccounts,
    onAddExpenseRow,
    onRemoveExpenseRow,
    onUpdateExpenseRow
}: LandedExpensesTableProps) {
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-primary" />
                    Import Landed Expenses & Chart of Accounts Entry
                </h3>
                <button
                    type="button"
                    onClick={onAddExpenseRow}
                    className="h-8 px-3 rounded-md bg-primary/10 text-primary hover:bg-primary/20 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                    <Plus className="h-3.5 w-3.5" />
                    Add Landed Fee
                </button>
            </div>

            {/* Automated Engine Info Banner */}
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl text-xs flex items-start gap-2.5">
                <Cpu className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="space-y-1">
                    <div className="font-extrabold text-foreground flex items-center gap-1.5">
                        Automated Product-Type Allocation Engine Active
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Automated Rules
                        </span>
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                        Landed fees are automatically distributed strictly according to product category rules:
                        <span className="font-semibold text-blue-600 dark:text-blue-400"> Raw Materials</span> by <strong>Unit Quantity</strong>, 
                        <span className="font-semibold text-purple-600 dark:text-purple-400"> Packaging Items</span> by <strong>Gross Weight</strong>, and 
                        <span className="font-semibold text-amber-600 dark:text-amber-400"> Finished Goods</span> by <strong>Commercial Value</strong>.
                    </p>
                </div>
            </div>

            <div className="border rounded-xl overflow-hidden bg-background">
                <table className="w-full text-xs text-left">
                    <thead className="bg-muted/50 border-b text-[11px] font-bold text-muted-foreground uppercase">
                        <tr>
                            <th className="p-3">Financial Chart of Account</th>
                            <th className="p-3">Fee Amount (PHP)</th>
                            <th className="p-3 text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {landedExpenses.map((exp) => (
                            <tr key={exp.id} className="hover:bg-muted/30">
                                <td className="p-3 min-w-[320px]">
                                    <CreatableSelect
                                        options={chartOfAccounts.map((coa, idx) => {
                                            const idNum = coa?.coa_id ?? coa?.id;
                                            const val = idNum != null ? String(idNum) : (coa?.gl_code ? String(coa.gl_code) : `coa-${idx}`);
                                            const title = coa?.account_title || coa?.account_name || `Account #${val}`;
                                            const label = coa?.gl_code ? `[${coa.gl_code}] ${title}` : title;
                                            return { value: val, label };
                                        })}
                                        value={exp.chart_of_account_id ? String(exp.chart_of_account_id) : ""}
                                        onValueChange={(val) => onUpdateExpenseRow(exp.id, "chart_of_account_id", Number(val))}
                                        placeholder="Search Chart of Account..."
                                        className="h-8 text-xs font-medium w-full"
                                    />
                                </td>
                                <td className="p-3">
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={exp.amount || ""}
                                        onChange={(e) => onUpdateExpenseRow(exp.id, "amount", Number(e.target.value))}
                                        placeholder="0.00"
                                        className="h-8 w-44 px-2 rounded border bg-background text-xs font-bold"
                                    />
                                </td>
                                <td className="p-3 text-right">
                                    {landedExpenses.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => onRemoveExpenseRow(exp.id)}
                                            className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-md transition-colors cursor-pointer"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
