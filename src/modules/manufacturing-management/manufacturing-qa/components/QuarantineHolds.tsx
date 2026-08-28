import React from "react";
import { Lock, RefreshCw, CheckCircle2, XCircle, Unlock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DispositionRecord } from "../types";

interface QuarantineHoldsProps {
    loadingDispositions: boolean;
    pendingHolds: DispositionRecord[];
    handleOpenOverrideDialog: (disp: DispositionRecord) => void;
}

export function QuarantineHolds({
    loadingDispositions,
    pendingHolds,
    handleOpenOverrideDialog
}: QuarantineHoldsProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-xl flex items-center gap-2">
                    <Lock className="h-5 w-5 text-destructive" />
                    Quarantined Batches & Override Locks
                </CardTitle>
                <CardDescription>
                    Highlighted list of critical checklist parameter failures that blocked step completion and locked Job Orders.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {loadingDispositions ? (
                    <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
                        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground/60" />
                        <span className="text-sm mt-3">Loading active hold list...</span>
                    </div>
                ) : pendingHolds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-16 border rounded-lg border-dashed text-center">
                        <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-3" />
                        <h3 className="font-semibold text-lg text-foreground">Zero Active Holds</h3>
                        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                            All production lines are currently passing critical parameter ranges. No quarantined batches require overrides.
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto border rounded-lg">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Job Order No</TableHead>
                                    <TableHead>Station</TableHead>
                                    <TableHead>Routing Task</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Inspection Remarks</TableHead>
                                    <TableHead className="text-right">Expected Qty</TableHead>
                                    <TableHead className="text-right">Actual Qty</TableHead>
                                    <TableHead>Failed Parameter Check</TableHead>
                                    <TableHead>Recorded At</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pendingHolds.map((hold) => (
                                    <TableRow key={hold.id} className="hover:bg-muted/40 transition-colors">
                                        <TableCell className="font-bold text-destructive">
                                            {hold.jo_id}
                                        </TableCell>
                                        <TableCell className="font-medium">{hold.station_name || (hold.station_id ? `Station #${hold.station_id}` : "Station unavailable")}</TableCell>
                                        <TableCell className="font-medium">{hold.task_name}</TableCell>
                                        <TableCell className="max-w-[200px] truncate">{hold.product_name}</TableCell>
                                        <TableCell className="max-w-[240px] truncate text-muted-foreground" title={hold.inspection_remarks || ""}>
                                            {hold.inspection_remarks || "No remarks recorded."}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">{hold.expected_quantity.toLocaleString()}</TableCell>
                                        <TableCell className="text-right font-mono font-bold text-destructive">{hold.actual_quantity.toLocaleString()}</TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1.5">
                                                {hold.failed_parameters.map((p, idx) => (
                                                    <Badge key={idx} variant="destructive" className="gap-1 text-[11px]">
                                                        <XCircle className="h-3 w-3 shrink-0" />
                                                        {p.test_name}: {p.value} {p.is_critical && "(Critical)"}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs font-mono">
                                            {new Date(hold.recorded_at).toLocaleString()}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <Button 
                                                variant="outline" 
                                                size="sm" 
                                                className="h-8 font-semibold text-xs border-destructive/30 hover:bg-destructive hover:text-destructive-foreground transition-all"
                                                onClick={() => handleOpenOverrideDialog(hold)}
                                            >
                                                <Unlock className="h-3 w-3 mr-1.5" />
                                                Override Hold
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
