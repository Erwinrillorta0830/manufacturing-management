import React from "react";
import { Loader2 } from "lucide-react";
import { PickingJO, InventoryData } from "../types/inventory.types";

interface MaterialPickingTabProps {
    pickingList: PickingJO[];
    pickingLoading: boolean;
    searchQuery: string;
    data: InventoryData | null;
    onSelectPickingJO: (jo: PickingJO) => void;
}

export function MaterialPickingTab({
    pickingList,
    pickingLoading,
    searchQuery,
    data,
    onSelectPickingJO
}: MaterialPickingTabProps) {
    if (pickingLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
                <span className="text-xs font-semibold">Loading picking sheets...</span>
            </div>
        );
    }

    const filtered = pickingList.filter(jo =>
        searchQuery ? jo.jo_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (jo.product_name || "").toLowerCase().includes(searchQuery.toLowerCase()) : true
    );

    return (
        <table className="w-full border-collapse text-left text-xs">
            <thead>
                <tr className="border-b border-input text-muted-foreground">
                    <th className="py-3 px-4 font-bold">Job Order ID</th>
                    <th className="py-3 px-4 font-bold">Target Good</th>
                    <th className="py-3 px-4 font-bold">Target Qty</th>
                    <th className="py-3 px-4 font-bold">Branch Location</th>
                    <th className="py-3 px-4 font-bold">Picking Status</th>
                    <th className="py-3 px-4 font-bold text-right">Actions</th>
                </tr>
            </thead>
            <tbody>
                {filtered.map((jo) => {
                    const isPicked = (jo as any).isPicked;
                    const branchName = data?.branches?.find(b => Number(b.id) === Number(jo.branch_id))?.branch_name ||
                        (Number(jo.branch_id) === 1 || Number(jo.branch_id) === 183 ? "Main Branch" : Number(jo.branch_id) === 163 ? "Urdaneta Branch" : `Branch #${jo.branch_id}`);

                    return (
                        <tr key={jo.jo_id} className="border-b border-input/60 hover:bg-muted/10">
                            <td className="py-3.5 px-4 font-extrabold text-foreground">{jo.jo_id}</td>
                            <td className="py-3.5 px-4 font-bold text-foreground">{jo.product_name || `Product #${(jo as any).product_id}`}</td>
                            <td className="py-3.5 px-4 font-bold text-foreground">{((jo as any).quantity || jo.planned_quantity || 0).toLocaleString()} units</td>
                            <td className="py-3.5 px-4 font-semibold text-muted-foreground">{branchName}</td>
                            <td className="py-3.5 px-4">
                                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${isPicked
                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                    }`}>
                                    {isPicked ? "Picked (In WIP)" : "Pending Pick"}
                                </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                                <button
                                    type="button"
                                    onClick={() => onSelectPickingJO(jo)}
                                    className={`text-xs font-bold px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${isPicked
                                            ? "bg-muted text-foreground border-border hover:bg-muted/20"
                                            : "bg-primary text-primary-foreground border-transparent hover:bg-primary/95 shadow-sm"
                                        }`}
                                >
                                    {isPicked ? "View Pick Sheet" : "Generate Pick Sheet"}
                                </button>
                            </td>
                        </tr>
                    );
                })}
                {filtered.length === 0 && (
                    <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground border border-dashed rounded-xl bg-card">
                            No active released Job Orders found for picking.
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
    );
}
