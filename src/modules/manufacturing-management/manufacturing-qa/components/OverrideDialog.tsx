/* eslint-disable */
import React from "react";
import { AlertTriangle, CheckCircle2, Loader2, Lock, Unlock, RefreshCw, RotateCcw, XCircle } from "lucide-react";
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
import { toast } from "sonner";
import { DispositionRecord, MaterialReturnPreview } from "../types";
import { confirmMaterialReturn, fetchMaterialReturnPreview } from "../services/qa-api";

interface OverrideDialogProps {
    isOverrideDialogOpen: boolean;
    setIsOverrideDialogOpen: (open: boolean) => void;
    selectedDisp: DispositionRecord | null;
    overrideDecision: "" | "Release with Deviation" | "Rework" | "Scrap";
    setOverrideDecision: (decision: "" | "Release with Deviation" | "Rework" | "Scrap") => void;
    overrideComments: string;
    setOverrideComments: (comments: string) => void;
    actionLoading: boolean;
    handleSubmitOverride: () => void;
}

function formatReturnQty(value: number): string {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
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
    const [returnPreview, setReturnPreview] = React.useState<MaterialReturnPreview | null>(null);
    const [loadingReturn, setLoadingReturn] = React.useState(false);
    const [confirmingReturn, setConfirmingReturn] = React.useState(false);
    const [returnConfirmed, setReturnConfirmed] = React.useState(false);
    const [returnError, setReturnError] = React.useState<string | null>(null);

    const jobReference = selectedDisp?.job_order_id || selectedDisp?.jo_id;

    React.useEffect(() => {
        if (!isOverrideDialogOpen || !jobReference) {
            setReturnPreview(null);
            setReturnConfirmed(false);
            setReturnError(null);
            return;
        }
        let cancelled = false;
        setLoadingReturn(true);
        setReturnError(null);
        setReturnConfirmed(false);
        fetchMaterialReturnPreview(jobReference as string | number)
            .then((preview) => {
                if (!cancelled) setReturnPreview(preview);
            })
            .catch((error: any) => {
                if (!cancelled) setReturnError(error?.message || "Failed to load the pending material return.");
            })
            .finally(() => {
                if (!cancelled) setLoadingReturn(false);
            });
        return () => {
            cancelled = true;
        };
    }, [isOverrideDialogOpen, jobReference]);

    const pendingReturnQuantity = returnPreview?.totals.returnableQuantity || 0;
    const requiresReturnConfirmation = pendingReturnQuantity > 0 && !returnConfirmed;

    const handleConfirmReturn = async () => {
        if (!returnPreview) return;
        setConfirmingReturn(true);
        try {
            const result = await confirmMaterialReturn({
                joId: returnPreview.jobOrderId,
                previewToken: returnPreview.previewToken,
                reason: `QA override confirmation for ${returnPreview.jobOrderNo}`
            });
            setReturnConfirmed(true);
            setReturnPreview({
                ...returnPreview,
                totals: { ...returnPreview.totals, returnableQuantity: 0 },
                canReturn: false
            });
            toast.success(result.noop
                ? `No leftover material remained for ${returnPreview.jobOrderNo}.`
                : `Returned ${formatReturnQty(result.returnedQuantity)} unit(s) from ${returnPreview.jobOrderNo} to the Main Store.`);
        } catch (error: any) {
            toast.error(error?.message || "Failed to confirm the material return.");
        } finally {
            setConfirmingReturn(false);
        }
    };

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

                        {/* Pending raw-material return gate */}
                        {loadingReturn ? (
                            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" /> Checking for floor-staged material...
                            </div>
                        ) : returnError ? (
                            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400" role="alert">
                                <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {returnError}</span>
                            </div>
                        ) : returnConfirmed ? (
                            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="h-4 w-4 shrink-0" /> Leftover raw materials returned; the disposition can be applied.
                            </div>
                        ) : returnPreview && pendingReturnQuantity > 0 ? (
                            <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Raw material return required first</p>
                                        <p className="text-[11px] text-muted-foreground">
                                            {formatReturnQty(pendingReturnQuantity)} unit(s) of staged material are still on the floor for this Job Order. Return them before applying a Rework or Release disposition.
                                        </p>
                                    </div>
                                    <Badge variant="outline" className="shrink-0 border-amber-500/40 font-mono text-[10px] text-amber-700 dark:text-amber-400">
                                        {returnPreview.lines.filter((line) => !line.releaseOnly && line.returnableQuantity > 0).length} line(s)
                                    </Badge>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void handleConfirmReturn()}
                                    disabled={confirmingReturn || !returnPreview.canReturn || Boolean(returnPreview.reconciliationError) || returnPreview.requiresDestination}
                                    className="min-h-9 gap-1.5 border-amber-500/40 text-xs font-bold text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                                >
                                    {confirmingReturn ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                    {confirmingReturn ? "Returning..." : "Confirm Return"}
                                </Button>
                                {returnPreview.reconciliationError && (
                                    <p className="text-[11px] font-semibold text-destructive">{returnPreview.reconciliationError}</p>
                                )}
                                {returnPreview.requiresDestination && !returnPreview.reconciliationError && (
                                    <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                                        The source batch is retired. Return it from the Raw Material Returns panel so a destination lot can be selected.
                                    </p>
                                )}
                            </div>
                        ) : null}

                        {/* Inputs */}
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label className="font-semibold text-xs">Disposition Action Decision</Label>
                                <Select 
                                    value={overrideDecision} 
                                    onValueChange={(val: any) => setOverrideDecision(val)}
                                >
                                    <SelectTrigger className="w-full min-h-11 text-sm font-semibold">
                                        <SelectValue placeholder="Select a supervisor decision..." />
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
                        disabled={actionLoading || !overrideDecision || requiresReturnConfirmation}
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
