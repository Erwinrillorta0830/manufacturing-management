/* eslint-disable */
import React from "react";
import { Lock, Unlock, RefreshCw, XCircle } from "lucide-react";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription, 
    DialogFooter 
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { DispositionRecord } from "../types";

interface OverrideDialogProps {
    isOverrideDialogOpen: boolean;
    setIsOverrideDialogOpen: (open: boolean) => void;
    selectedDisp: DispositionRecord | null;
    overrideDecision: "Release with Deviation" | "Rework" | "Scrap";
    setOverrideDecision: (decision: "Release with Deviation" | "Rework" | "Scrap") => void;
    overrideComments: string;
    setOverrideComments: (comments: string) => void;
    actionLoading: boolean;
    handleSubmitOverride: () => void;
}

export function OverrideDialog({
    isOverrideDialogOpen,
    setIsOverrideDialogOpen,
    selectedDisp,
    overrideDecision,
    setOverrideDecision,
    overrideComments,
    setOverrideComments,
    actionLoading,
    handleSubmitOverride
}: OverrideDialogProps) {
    return (
        <Dialog open={isOverrideDialogOpen} onOpenChange={setIsOverrideDialogOpen}>
            <DialogContent className="w-[calc(100vw-1rem)] max-w-[480px] max-h-[calc(100dvh-1rem)] flex flex-col overflow-hidden">
                <DialogHeader>
                    <DialogTitle className="text-xl text-destructive flex items-center gap-2">
                        <Lock className="h-5 w-5 animate-pulse" />
                        Quarantine Override & Resolution
                    </DialogTitle>
                    <DialogDescription>
                        Resolve active QA holds and override critical blocklocks by choosing supervisor disposition decisions.
                    </DialogDescription>
                </DialogHeader>

                {selectedDisp && (
                    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto py-4 pr-1 scrollbar-thin">
                        {/* Summary Hold Details */}
                        <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 text-xs space-y-2">
                            <div className="grid grid-cols-2 gap-1.5">
                                <div>
                                    <span className="text-muted-foreground block text-[10px] font-bold uppercase tracking-wider">Job Order No</span>
                                    <span className="font-bold text-destructive">{selectedDisp.jo_id}</span>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block text-[10px] font-bold uppercase tracking-wider">Station</span>
                                    <span className="font-bold text-foreground">{selectedDisp.station_name || (selectedDisp.station_id ? `Station #${selectedDisp.station_id}` : "Station unavailable")}</span>
                                </div>
                            </div>
                            <div className="border-t border-destructive/10 pt-1.5">
                                <span className="text-muted-foreground block text-[10px] font-bold uppercase tracking-wider">Routing Task</span>
                                <span className="font-bold text-foreground">{selectedDisp.task_name}</span>
                            </div>
                            <div className="border-t border-destructive/10 pt-1.5">
                                <span className="text-muted-foreground block text-[10px] font-bold uppercase tracking-wider">Product Name</span>
                                <span className="font-medium text-foreground truncate block">{selectedDisp.product_name}</span>
                            </div>
                            <div className="border-t border-destructive/10 pt-1.5">
                                <span className="text-muted-foreground block text-[10px] font-bold uppercase tracking-wider">Inspection Remarks</span>
                                <span className="font-medium text-foreground whitespace-pre-wrap">{selectedDisp.inspection_remarks || "No remarks recorded."}</span>
                            </div>
                            <div className="border-t border-destructive/10 pt-1.5">
                                <span className="text-muted-foreground block text-[10px] font-bold uppercase tracking-wider">Failed Parameter Ranges</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {selectedDisp.failed_parameters.map((p, i) => (
                                        <Badge key={i} variant="destructive" className="text-[10px] py-0 px-1 font-semibold">
                                            {p.test_name}: Recorded {p.value} {p.min_value !== undefined && `(Min: ${p.min_value})`} {p.max_value !== undefined && `(Max: ${p.max_value})`}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Inputs */}
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="font-semibold text-xs">Disposition Action Decision</Label>
                                <Select 
                                    value={overrideDecision} 
                                    onValueChange={(val: any) => setOverrideDecision(val)}
                                >
                                    <SelectTrigger className="w-full min-h-11 text-sm font-semibold">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Release with Deviation">
                                            <div className="flex items-center gap-2">
                                                <Unlock className="h-4 w-4 text-emerald-500 shrink-0" />
                                                <div>
                                                    <span className="block font-semibold">Release with Deviation</span>
                                                    <span className="block text-[10px] text-muted-foreground font-normal">Accept parameter variance and bypass quarantine lock.</span>
                                                </div>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="Rework">
                                            <div className="flex items-center gap-2">
                                                <RefreshCw className="h-4 w-4 text-blue-500 shrink-0" />
                                                <div>
                                                    <span className="block font-semibold">Rework</span>
                                                    <span className="block text-[10px] text-muted-foreground font-normal">Reset station sequence back to Active for operator refactor.</span>
                                                </div>
                                            </div>
                                        </SelectItem>
                                        <SelectItem value="Scrap">
                                            <div className="flex items-center gap-2">
                                                <XCircle className="h-4 w-4 text-destructive shrink-0" />
                                                <div>
                                                    <span className="block font-semibold">Scrap Batch</span>
                                                    <span className="block text-[10px] text-muted-foreground font-normal">Cancel entire Job Order run and mark subsequent steps as skipped.</span>
                                                </div>
                                            </div>
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="overrideComments" className="font-semibold text-xs">
                                    Supervisor Override Audit Comments <span className="text-destructive">*</span>
                                </Label>
                                <textarea
                                    id="overrideComments"
                                    placeholder="Record detailed engineering rationale, lab approvals, or instructions for rework..."
                                    value={overrideComments}
                                    onChange={e => setOverrideComments(e.target.value)}
                                    rows={4}
                                    className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                />
                            </div>
                        </div>
                    </div>
                )}

                <DialogFooter className="sticky bottom-0 z-10 gap-2 border-t bg-background/95 pt-3 sm:gap-0 backdrop-blur">
                    <Button 
                        variant="outline" 
                        onClick={() => setIsOverrideDialogOpen(false)}
                        disabled={actionLoading}
                        className="min-h-11 text-sm font-semibold"
                    >
                        Cancel
                    </Button>
                    <Button 
                        variant="destructive"
                        onClick={handleSubmitOverride}
                        disabled={actionLoading}
                        className="min-h-11 text-sm font-semibold gap-1.5"
                    >
                        {actionLoading ? (
                            <>
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                Applying Override...
                            </>
                        ) : (
                            <>
                                <Unlock className="h-3.5 w-3.5" />
                                Apply Override Lock
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
