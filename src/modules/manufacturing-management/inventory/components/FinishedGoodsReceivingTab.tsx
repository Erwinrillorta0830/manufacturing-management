import React from "react";
import { Loader2 } from "lucide-react";
import { ReceivingJO, InventoryData } from "../types/inventory.types";

interface FinishedGoodsReceivingTabProps {
    receivingJOs: ReceivingJO[];
    receivingLoading: boolean;
    searchQuery: string;
    data: InventoryData | null;
    onSelectReceivingJO: (jo: ReceivingJO) => void;
    onViewYieldReport: (jo: ReceivingJO) => void;
}

export function FinishedGoodsReceivingTab({
    receivingJOs,
    receivingLoading,
    searchQuery,
    data,
    onSelectReceivingJO,
    onViewYieldReport
}: FinishedGoodsReceivingTabProps) {
    if (receivingLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                <span className="text-xs font-semibold">Loading job orders...</span>
            </div>
        );
    }

    const filtered = receivingJOs.filter(jo =>
        searchQuery ? jo.jo_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (jo.product_name || "").toLowerCase().includes(searchQuery.toLowerCase()) : true
    );

    return (
        <table className="w-full border-collapse text-left text-xs">
            <thead>
                <tr className="border-b border-input text-muted-foreground">
                    <th className="py-3 px-4 font-bold">Job Order ID</th>
                    <th className="py-3 px-4 font-bold">Finished Good</th>
                    <th className="py-3 px-4 font-bold">Target Qty</th>
                    <th className="py-3 px-4 font-bold">Branch Location</th>
                    <th className="py-3 px-4 font-bold">Status</th>
                    <th className="py-3 px-4 font-bold text-right">Actions</th>
                </tr>
            </thead>
            <tbody>
                {filtered.map((jo) => {
                    const branchName = data?.branches?.find(b => Number(b.id) === Number(jo.branch_id))?.branch_name ||
                        (Number(jo.branch_id) === 1 || Number(jo.branch_id) === 183 ? "Main Branch" : Number(jo.branch_id) === 163 ? "Urdaneta Branch" : `Branch #${jo.branch_id}`);
                    const isFinished = jo.status === "Finished";

                    return (
                        <tr key={jo.jo_id} className="border-b border-input/60 hover:bg-muted/10">
                            <td className="py-3.5 px-4 font-extrabold text-foreground">{jo.jo_id}</td>
                            <td className="py-3.5 px-4 font-bold text-foreground">{jo.product_name || `Product #${jo.product_id}`}</td>
                            <td className="py-3.5 px-4 font-bold text-foreground">{((jo as any).quantity || jo.planned_quantity || 0).toLocaleString()} units</td>
                            <td className="py-3.5 px-4 font-semibold text-muted-foreground">{branchName}</td>
                            <td className="py-3.5 px-4">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${isFinished
                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                        : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                    }`}>
                                    {isFinished ? "Closed (Finished)" : "In Production"}
                                </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                                {isFinished ? (
                                    <button
                                        type="button"
                                        onClick={() => onViewYieldReport(jo)}
                                        className="text-xs font-bold px-3 py-1.5 rounded-lg border border-border bg-card text-foreground hover:bg-muted/20 cursor-pointer transition-all"
                                    >
                                        View Yield Report
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => onSelectReceivingJO(jo)}
                                        className="text-xs font-bold px-3 py-1.5 rounded-lg border border-transparent bg-primary text-primary-foreground hover:bg-primary/95 cursor-pointer shadow-sm transition-all"
                                    >
                                        Receive Yield & Close JO
                                    </button>
                                )}
                            </td>
                        </tr>
                    );
                })}
                {filtered.length === 0 && (
                    <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
                            No ongoing/released Job Orders found for yield receiving.
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
    );
}
