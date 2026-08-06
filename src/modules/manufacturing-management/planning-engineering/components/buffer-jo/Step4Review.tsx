/* eslint-disable */
import React from "react";
import { CheckCircle2, ShieldAlert, Clock, Users, Package, MapPin, Calendar, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Branch } from "../../types";

export interface Step4ReviewProps {
    selectedBranch?: Branch;
    joNumber: string;
    selectedProduct?: any;
    selectedVersion?: any;
    targetQuantity: number;
    dueDate: string;
    shiftOption: string;
    totalEstimatedHours: number;
    components: any[];
    bomBaseQty: number;
    inventories: Record<number, any>;
    routings: any[];
    assignments: Record<number, number[]>;
    operators: any[];
    remarks: string;
}

export function Step4Review({
    selectedBranch,
    joNumber,
    selectedProduct,
    selectedVersion,
    targetQuantity,
    dueDate,
    shiftOption,
    totalEstimatedHours,
    components,
    bomBaseQty,
    inventories,
    routings,
    assignments,
    remarks
}: Step4ReviewProps) {
    const totalAssignedOperators = Object.values(assignments).flat().length;

    // Check material shortfalls
    let shortfallCount = 0;
    components.forEach((comp) => {
        const compProductId = comp.component_product_id?.product_id;
        const needed = (Number(comp.quantity_required) * (1 + (Number(comp.wastage_factor_percentage || 0) / 100))) * (targetQuantity / (bomBaseQty || 1));
        const available = compProductId ? (inventories[Number(compProductId)]?.on_hand || 0) : 0;
        if (needed > available) shortfallCount++;
    });

    const estimatedDays = Number(shiftOption) > 0 ? (totalEstimatedHours / Number(shiftOption)).toFixed(1) : "0";

    return (
        <div className="space-y-4 text-xs">
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                        <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
                            <span>📋 Final Job Order Review</span>
                        </h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            Verify all configuration details before confirming and releasing this Buffer Job Order.
                        </p>
                    </div>
                    <Badge variant="outline" className="font-mono text-xs bg-primary/10 text-primary border-primary/20 font-bold px-2.5 py-1">
                        {joNumber}
                    </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* General Details */}
                    <div className="space-y-2 bg-muted/30 p-3 rounded-lg border border-border/60">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block">
                            Job Order Metadata
                        </span>
                        <div className="space-y-1.5 font-medium">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                    <MapPin className="h-3.5 w-3.5 text-primary" /> Target Branch:
                                </span>
                                <span className="font-bold text-foreground">{selectedBranch?.branch_name || "N/A"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Package className="h-3.5 w-3.5 text-primary" /> Target Product:
                                </span>
                                <span className="font-bold text-foreground truncate max-w-[180px]">{selectedProduct?.product_name || "N/A"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                    <FileText className="h-3.5 w-3.5 text-primary" /> Recipe Version:
                                </span>
                                <span className="font-bold text-foreground">{selectedVersion?.version_name || "Default"}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5 text-primary" /> Target Quantity:
                                </span>
                                <span className="font-extrabold text-foreground">{targetQuantity.toLocaleString()} units</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5 text-primary" /> Due Date:
                                </span>
                                <span className="font-bold text-foreground">{dueDate || "Not set"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Operational & Sufficiency Summary */}
                    <div className="space-y-2 bg-muted/30 p-3 rounded-lg border border-border/60">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block">
                            Execution & Resource Summary
                        </span>
                        <div className="space-y-1.5 font-medium">
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Clock className="h-3.5 w-3.5 text-primary" /> Est. Lead Time:
                                </span>
                                <span className="font-bold text-foreground">{totalEstimatedHours.toFixed(1)} hrs (~{estimatedDays} Days)</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5 text-primary" /> Workstation Steps:
                                </span>
                                <span className="font-bold text-foreground">{routings.length} Routing Step{routings.length !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                    <Users className="h-3.5 w-3.5 text-primary" /> Assigned Operators:
                                </span>
                                <span className="font-bold text-foreground">{totalAssignedOperators} Operator{totalAssignedOperators !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-muted-foreground flex items-center gap-1.5">
                                    {shortfallCount === 0 ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />} BOM Stock Status:
                                </span>
                                {shortfallCount === 0 ? (
                                    <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">Fully Available</Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]">
                                        {shortfallCount} Shortfall{shortfallCount !== 1 ? "s" : ""} (Spawns Child JOs / PR)
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {remarks && (
                    <div className="pt-2 border-t border-border">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide block mb-0.5">
                            Planning Remarks:
                        </span>
                        <p className="text-xs text-foreground italic bg-muted/20 p-2 rounded border border-border/40">
                            &quot;{remarks}&quot;
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
