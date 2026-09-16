import React from "react";
import { Settings, AlertTriangle, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SalesOrderDetail, SalesOrderReleaseGroup } from "../types";

interface ConsolidationPanelProps {
    selectedLines: SalesOrderDetail[];
    releaseGroups: SalesOrderReleaseGroup[];
    mergeValidation: { isValid: boolean; reason: string };
    hasValidTargetBranch: boolean;
    handleInitiateRelease: () => void;
    versionStock: number | null;
    loadingVersionStock: boolean;
    canDirectAllocate: boolean;
    handleInitiateDirectAllocate: () => void;
}

export function ConsolidationPanel({
    selectedLines,
    releaseGroups,
    mergeValidation,
    hasValidTargetBranch,
    handleInitiateRelease,
    versionStock,
    loadingVersionStock,
    canDirectAllocate,
    handleInitiateDirectAllocate
}: ConsolidationPanelProps) {
    return (
        <Card className="shadow-sm border-primary/20 bg-primary/[0.01]">
            <CardHeader className="pb-3 border-b bg-primary/[0.02]">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Settings className="h-5 w-5 text-primary" />
                    Job Order Release Groups
                </CardTitle>
                <CardDescription className="text-xs">
                    Selected lines are grouped by product and effective recipe version. Each group creates a separate Job Order.
                </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
                {selectedLines.length === 0 ? (
                    <div className="text-center py-6 text-xs text-muted-foreground font-medium">
                        No lines selected. Use the Sales Order row checkboxes to select eligible demand.
                    </div>
                ) : (
                    <div className="space-y-4">
                        {!mergeValidation.isValid ? (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle className="text-xs font-bold uppercase">Release Blocked</AlertTitle>
                                <AlertDescription className="text-xs font-medium mt-1">{mergeValidation.reason}</AlertDescription>
                            </Alert>
                        ) : (
                            <Alert className="border-green-200 bg-green-50/10">
                                <Check className="h-4 w-4 text-green-600" />
                                <AlertTitle className="text-xs font-bold text-green-700 uppercase">Valid Multi-JO Release</AlertTitle>
                                <AlertDescription className="text-xs font-medium text-green-600 mt-1">
                                    Ready to create {releaseGroups.length} product-specific Job Order{releaseGroups.length === 1 ? "" : "s"} from {selectedLines.length} Sales Order detail line{selectedLines.length === 1 ? "" : "s"}.
                                </AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-2">
                            {releaseGroups.map((group, index) => (
                                <div key={group.key} className="bg-card border rounded-lg p-3 space-y-2">
                                    <div className="flex items-start justify-between gap-3 text-xs">
                                        <div className="min-w-0">
                                            <div className="font-bold text-foreground truncate">{group.productName}</div>
                                            <div className="text-[10px] text-muted-foreground">{group.bomVersionName} · {group.lines.length} detail line{group.lines.length === 1 ? "" : "s"}</div>
                                        </div>
                                        <Badge variant="outline" className="shrink-0 font-bold text-primary border-primary/20 bg-primary/5">JO {index + 1}</Badge>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-muted-foreground">Sales Orders:</span>
                                        <span className="font-bold text-foreground text-right">{group.lines.map((line) => line.order_no).filter(Boolean).filter((value, lineIndex, values) => values.indexOf(value) === lineIndex).join(", ")}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="font-semibold text-muted-foreground">Full remaining quantity:</span>
                                        <span className="font-bold text-emerald-700">{group.totalRemainingQuantity.toLocaleString()} {group.lines[0]?.product_id?.uom || "units"}</span>
                                    </div>
                                    {releaseGroups.length === 1 && (
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="font-semibold text-muted-foreground">Available version stock:</span>
                                            {loadingVersionStock ? <span className="text-muted-foreground animate-pulse text-[10px] font-bold uppercase">Checking...</span> : <span className="font-bold text-foreground">{versionStock !== null ? versionStock.toLocaleString() : "N/A"}</span>}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="space-y-2">
                            <Button className="w-full font-bold text-xs uppercase" disabled={!hasValidTargetBranch || !mergeValidation.isValid} onClick={handleInitiateRelease}>
                                {releaseGroups.length > 1 ? `Release ${releaseGroups.length} Job Orders` : "Release Job Order"}
                            </Button>

                            {canDirectAllocate && hasValidTargetBranch && mergeValidation.isValid && versionStock !== null && versionStock >= (releaseGroups[0]?.totalRemainingQuantity || 0) && (
                                <Button type="button" variant="outline" className="w-full font-bold text-xs uppercase border-emerald-600/50 text-emerald-600 dark:text-emerald-400 bg-emerald-50/20 dark:bg-emerald-950/20 hover:bg-emerald-600 hover:text-white transition-all duration-200" onClick={handleInitiateDirectAllocate}>
                                    Direct Allocate &amp; Invoice
                                </Button>
                            )}

                            {canDirectAllocate && hasValidTargetBranch && mergeValidation.isValid && versionStock !== null && versionStock < (releaseGroups[0]?.totalRemainingQuantity || 0) && (
                                <p className="text-[10px] text-muted-foreground leading-snug">Direct Allocate &amp; Invoice becomes available when version stock ({versionStock.toLocaleString()}) covers the remaining quantity ({(releaseGroups[0]?.totalRemainingQuantity || 0).toLocaleString()}).</p>
                            )}
                            {!canDirectAllocate && releaseGroups.length > 1 && (
                                <p className="text-[10px] text-muted-foreground leading-snug">Direct allocation is limited to one product/BOM group because it posts one inventory allocation at a time.</p>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
