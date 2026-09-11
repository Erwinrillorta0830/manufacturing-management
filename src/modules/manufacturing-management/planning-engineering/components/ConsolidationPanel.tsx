import React from "react";
import { Settings, AlertTriangle, Check } from "lucide-react";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SalesOrderDetail } from "../types";

interface ConsolidationPanelProps {
    selectedLines: SalesOrderDetail[];
    mergeValidation: { isValid: boolean; reason: string };
    handleInitiateRelease: () => void;
    versionStock: number | null;
    loadingVersionStock: boolean;
    handleInitiateDirectAllocate: () => void;
}

export function ConsolidationPanel({
    selectedLines,
    mergeValidation,
    handleInitiateRelease,
    versionStock,
    loadingVersionStock,
    handleInitiateDirectAllocate
}: ConsolidationPanelProps) {
    const totalOrdered = selectedLines.reduce((sum, line) => sum + Number(line.ordered_quantity || 0), 0);
    const totalPlanned = selectedLines.reduce((sum, line) => sum + Number(line.planned_quantity || 0), 0);
    const totalRemaining = selectedLines.reduce((sum, line) => {
        const ordered = Number(line.ordered_quantity || 0);
        const allocated = Number(line.allocated_quantity || 0);
        const served = Number(line.served_quantity || 0);
        const planned = Number(line.planned_quantity || 0);
        const remaining = Number(line.remaining_quantity);
        return sum + (Number.isFinite(remaining)
            ? Math.max(0, remaining)
            : Math.max(0, ordered - Math.max(allocated, served) - planned));
    }, 0);
    const selectedOrderReferences = Array.from(new Map(
        selectedLines.map((line) => [line.order_id, line.order_no || `SO #${line.order_id}`])
    ).entries());

    return (
        <Card className="shadow-sm border-primary/20 bg-primary/[0.01]">
            <CardHeader className="pb-3 border-b bg-primary/[0.02]">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    Batch Consolidation Panel
                </CardTitle>
                <CardDescription className="text-xs">
                    Select and merge multiple lines of the same recipe version.
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
                {selectedLines.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground font-medium">
                        No lines selected. Use checkboxes in the demand table on the left to group orders.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Alert / Warning messages */}
                        {!mergeValidation.isValid ? (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle className="text-xs font-bold uppercase">Merge Blocked</AlertTitle>
                                <AlertDescription className="text-xs font-medium mt-1">
                                    {mergeValidation.reason}
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <div className="space-y-3">
                                <Alert className="border-green-200 bg-green-50/10">
                                    <Check className="h-4 w-4 text-green-600" />
                                    <AlertTitle className="text-xs font-bold text-green-700 uppercase">Valid Consolidation</AlertTitle>
                                    <AlertDescription className="text-xs font-medium text-green-600 mt-1">
                                        Ready to consolidate {selectedLines.length} lines from {selectedOrderReferences.length} Sales Orders for {selectedLines[0].product_id.product_name}.
                                    </AlertDescription>
                                </Alert>
 
                                <div className="bg-card border rounded-lg p-3 space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-muted-foreground">Product:</span>
                                        <span className="font-bold text-foreground truncate max-w-[200px]">
                                            {selectedLines[0].product_id.product_name}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-muted-foreground">Recipe Version:</span>
                                        <Badge variant="outline" className="font-bold text-primary border-primary/20 bg-primary/5">
                                            {selectedLines[0].bom_version_name || "Default"}
                                        </Badge>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-muted-foreground">Selected Sales Orders:</span>
                                        <span className="font-bold text-foreground text-right">
                                            {selectedOrderReferences.map(([orderId, orderNo], index) => (
                                                <React.Fragment key={orderId}>
                                                    {index > 0 ? ", " : ""}{orderNo}
                                                </React.Fragment>
                                            ))}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-muted-foreground">Ordered Quantity:</span>
                                        <span className="font-bold text-foreground">{totalOrdered.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-muted-foreground">Planned Quantity:</span>
                                        <span className="font-bold text-amber-700">{totalPlanned.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-muted-foreground">Remaining JO Quantity:</span>
                                        <span className="font-bold text-emerald-700">{totalRemaining.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-muted-foreground">Available Version Stock:</span>
                                        {loadingVersionStock ? (
                                            <span className="text-muted-foreground animate-pulse text-[10px] font-bold uppercase tracking-wider">Checking...</span>
                                        ) : (
                                            <span className="font-bold text-foreground">
                                                {versionStock !== null ? versionStock.toLocaleString() : "N/A"}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
 
                        {/* Action buttons */}
                        <div className="space-y-2">
                            <Button
                                className="w-full font-bold text-xs uppercase"
                                disabled={!mergeValidation.isValid}
                                onClick={handleInitiateRelease}
                            >
                                Consolidate & Release Job Order
                            </Button>

                            {mergeValidation.isValid && versionStock !== null && versionStock >= totalRemaining && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full font-bold text-xs uppercase border-emerald-600/50 text-emerald-600 dark:text-emerald-400 bg-emerald-50/20 dark:bg-emerald-950/20 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 dark:hover:text-white transition-all duration-200"
                                    onClick={handleInitiateDirectAllocate}
                                >
                                    Direct Allocate & Invoice
                                </Button>
                            )}

                            {mergeValidation.isValid && versionStock !== null && versionStock < totalRemaining && (
                                <p className="text-[10px] text-muted-foreground leading-snug">
                                    Direct Allocate &amp; Invoice becomes available when available version stock
                                    ({(versionStock ?? 0).toLocaleString()}) covers the remaining quantity
                                    ({totalRemaining.toLocaleString()}). Release a Job Order to reserve stock instead.
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
