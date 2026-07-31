import React from "react";
import { MapPin, AlertTriangle, Bookmark } from "lucide-react";
import { BranchGroupedBatches, RawMaterialItem } from "../types/raw-materials.types";

interface BatchLocationsTreeProps {
    material: RawMaterialItem;
    loadingBatches: boolean;
    groupedByBranch: BranchGroupedBatches[];
}

export function BatchLocationsTree({
    material,
    loadingBatches,
    groupedByBranch
}: BatchLocationsTreeProps) {
    const getExpirationStatus = (expDate?: string | null) => {
        if (!expDate) return { text: "No Date", color: "text-muted-foreground bg-muted" };
        const today = new Date();
        const exp = new Date(expDate);
        const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { text: "Expired", color: "text-red-500 bg-red-500/10 border border-red-500/20" };
        } else if (diffDays <= 30) {
            return { text: `Expiring: ${diffDays}d`, color: "text-amber-500 bg-amber-500/10 border border-amber-500/20" };
        } else {
            return { text: "Fresh", color: "text-emerald-500 bg-emerald-500/10 border border-emerald-500/20" };
        }
    };

    return (
        <div className="space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b pb-1.5">
                <MapPin className="h-3.5 w-3.5 text-primary" />
                Active Stock Locations & Batch Logs
            </h4>

            {loadingBatches ? (
                <div className="text-center py-4 text-xs text-muted-foreground">Loading stock logs...</div>
            ) : groupedByBranch.length === 0 ? (
                <div className="text-center py-4 text-xs text-muted-foreground italic flex items-center justify-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                    No physical stock batches currently recorded at any warehouse location.
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {groupedByBranch.map((branchGroup, bIdx) => (
                        <div key={bIdx} className="bg-card border rounded-lg p-3 space-y-2.5">
                            <div className="flex justify-between items-center border-b pb-1">
                                <span className="font-extrabold text-xs text-foreground block">{branchGroup.branchName}</span>
                                <span className="text-[10px] font-black text-primary bg-primary/5 px-2 py-0.5 rounded">
                                    {branchGroup.totalQty.toLocaleString()} {material.unit_of_measurement?.unit_shortcut || "PCS"}
                                </span>
                            </div>

                            <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                                {branchGroup.batches.map((batch, btIdx) => {
                                    const expStatus = getExpirationStatus(batch.expiration_date);
                                    return (
                                        <div key={btIdx} className="flex justify-between items-center text-[10px] py-1 border-b last:border-0 border-muted/30">
                                            <span className="font-bold text-foreground flex items-center gap-1">
                                                <Bookmark className="h-3 w-3 text-muted-foreground" />
                                                {batch.lot_number}
                                            </span>
                                            <div className="flex items-center gap-3">
                                                <span className={`px-1.5 py-0.5 rounded font-extrabold text-[9px] ${expStatus.color}`}>
                                                    {expStatus.text}
                                                </span>
                                                <span className="font-mono font-bold text-foreground">
                                                    {batch.qty.toLocaleString()}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
