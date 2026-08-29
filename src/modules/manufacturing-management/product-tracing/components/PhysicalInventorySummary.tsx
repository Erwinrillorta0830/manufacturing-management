"use client";

import * as React from "react";
import { format } from "date-fns";
import { MMInventoryMovement } from "../types";
import { Card, CardContent } from "@/components/ui/card";
import { PackageSearch as PHIcon } from "lucide-react";

interface Props {
    movements: MMInventoryMovement[];
    baseUnitName?: string;
    costPerUnit?: number | null;
    beginningBaseBalance?: number;
}

export const PhysicalInventorySummary: React.FC<Props> = ({
    movements,
    costPerUnit = null,
}) => {
    const phMovements = movements.filter(m =>
        m.transactionType === "PHYSICAL_INVENTORY" ||
        m.referenceNo?.toUpperCase().startsWith("PH")
    );

    if (phMovements.length === 0) return null;

    return (
        <Card className="rounded-2xl border shadow-sm bg-card overflow-hidden">
            <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-primary/10 rounded-lg text-primary">
                        <PHIcon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                        Physical Inventory Count Adjustments ({phMovements.length})
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="border-b text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                                <th className="pb-2">Reference No</th>
                                <th className="pb-2">Date</th>
                                <th className="pb-2">Product</th>
                                <th className="pb-2">Batch</th>
                                <th className="pb-2 text-right">Adjustment Qty</th>
                                <th className="pb-2 text-right">Running Bal</th>
                                <th className="pb-2 text-right">Valuation</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-muted/40 font-medium">
                            {phMovements.map((row, idx) => {
                                const isOut = row.movementDirection === "OUT" || Number(row.quantityOut) > 0;
                                const qty = isOut ? Number(row.quantityOut || 0) : Number(row.quantityIn || 0);

                                return (
                                    <tr key={idx} className="hover:bg-muted/20">
                                        <td className="py-2.5 font-mono font-bold">{row.referenceNo}</td>
                                        <td className="py-2.5 text-muted-foreground">
                                            {row.transactionDate ? format(new Date(row.transactionDate), "MMM dd, yyyy") : "N/A"}
                                        </td>
                                        <td className="py-2.5">{row.productName || "Product"}</td>
                                        <td className="py-2.5 font-mono">{row.batchNo || "—"}</td>
                                        <td className="py-2.5 text-right font-bold tabular-nums">
                                            <span className={isOut ? "text-rose-600" : "text-emerald-600"}>
                                                {isOut ? `-${qty.toLocaleString()}` : `+${qty.toLocaleString()}`}
                                            </span>
                                        </td>
                                        <td className="py-2.5 text-right font-black tabular-nums">
                                            {Number(row.runningBalance || 0).toLocaleString()}
                                        </td>
                                        <td className="py-2.5 text-right font-bold text-emerald-600 tabular-nums">
                                            ₱{(qty * Number(row.unitCost || costPerUnit || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
};
