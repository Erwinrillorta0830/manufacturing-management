"use client";

import React, { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    AlertTriangle,
    ShieldAlert,
    ArrowRight,
    PackageX,
    CheckCircle2,
    Lock,
    XCircle,
    Info
} from "lucide-react";
import { ShortageWarningInfo } from "../types";

interface ShortageWarningDialogProps {
    isOpen: boolean;
    onClose: () => void;
    warningInfo: ShortageWarningInfo | null;
    onProceedWithNegative: (remarks?: string) => Promise<void>;
    isLoading?: boolean;
}

export function ShortageWarningDialog({
    isOpen,
    onClose,
    warningInfo,
    onProceedWithNegative,
    isLoading = false
}: ShortageWarningDialogProps) {
    const [overrideRemarks, setOverrideRemarks] = useState("");
    const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);

    if (!warningInfo) return null;

    const handleConfirmNegativeOverride = async () => {
        await onProceedWithNegative(overrideRemarks || "Floor hold override authorized by staging supervisor.");
        setShowOverrideConfirm(false);
        setOverrideRemarks("");
    };

    const handleCancel = () => {
        setShowOverrideConfirm(false);
        setOverrideRemarks("");
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleCancel(); }}>
            <DialogContent className="max-w-2xl bg-card border-border shadow-2xl overflow-hidden p-0">
                {/* Warning Header with pulsing beacon */}
                <div className="relative bg-gradient-to-r from-amber-500/15 via-red-500/10 to-transparent p-6 border-b border-amber-500/20">
                    <div className="flex items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-500 ring-4 ring-amber-500/10">
                            <AlertTriangle className="h-6 w-6" />
                        </div>
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-xs font-semibold px-2 py-0.5">
                                    FLOOR HOLD ALERT
                                </Badge>
                                <span className="text-xs text-muted-foreground">Shortage Gate Active</span>
                            </div>
                            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                                Insufficient Stock in Main Store
                            </DialogTitle>
                            <DialogDescription className="text-sm text-muted-foreground">
                                The requested staging quantity exceeds physical on-hand stock. Staging cannot proceed without resolution.
                            </DialogDescription>
                        </div>
                    </div>
                </div>

                {/* Shortage Breakdown Card */}
                <div className="p-6 space-y-6">
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border/60">
                            <div>
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Material Component</div>
                                <div className="font-semibold text-base text-foreground flex items-center gap-2">
                                    {warningInfo.material_name}
                                    <span className="text-xs text-muted-foreground font-mono font-normal">({warningInfo.product_code})</span>
                                </div>
                            </div>
                            <div className="text-left sm:text-right">
                                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Target Job Order</div>
                                <div className="font-semibold text-sm text-primary font-mono">{warningInfo.job_order_no}</div>
                            </div>
                        </div>

                        {/* Lot & Bin Transfer Route */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                            <div className="bg-card/70 p-3 rounded-lg border border-border/50">
                                <span className="text-xs text-muted-foreground block mb-1">Target Lot / Batch:</span>
                                <span className="font-mono font-medium text-foreground">{warningInfo.batch_no}</span>
                            </div>
                            <div className="bg-card/70 p-3 rounded-lg border border-border/50">
                                <span className="text-xs text-muted-foreground block mb-1">Bin Transfer Path:</span>
                                <div className="flex items-center gap-1.5 font-mono text-xs text-foreground font-medium">
                                    <span className="text-amber-500">{warningInfo.source_bin}</span>
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                                    <span className="text-emerald-500">{warningInfo.target_bin}</span>
                                </div>
                            </div>
                        </div>

                        {/* Quantitative Comparison Matrix */}
                        <div className="grid grid-cols-3 gap-2 text-center pt-2">
                            <div className="bg-card p-3 rounded-lg border border-border/60">
                                <div className="text-[11px] font-medium text-muted-foreground uppercase">Required Staging</div>
                                <div className="text-lg font-bold text-foreground font-mono">
                                    {warningInfo.transfer_quantity.toLocaleString()}
                                </div>
                            </div>
                            <div className="bg-card p-3 rounded-lg border border-border/60">
                                <div className="text-[11px] font-medium text-muted-foreground uppercase">Physical On-Hand</div>
                                <div className="text-lg font-bold text-amber-500 font-mono">
                                    {warningInfo.available_quantity.toLocaleString()}
                                </div>
                            </div>
                            <div className="bg-red-500/10 p-3 rounded-lg border border-red-500/30">
                                <div className="text-[11px] font-semibold text-red-500 uppercase">Shortage Deficit</div>
                                <div className="text-lg font-extrabold text-red-500 font-mono">
                                    -{warningInfo.shortage_quantity.toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Interactive Choices Header */}
                    <div className="space-y-3">
                        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                            <ShieldAlert className="h-4 w-4 text-primary" />
                            Select Action Protocol
                        </div>

                        {/* Option A: Fix Stock First */}
                        <div className="rounded-xl border border-border p-4 bg-card hover:bg-muted/20 transition-colors">
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 font-semibold text-sm text-foreground">
                                        <PackageX className="h-4 w-4 text-amber-500" />
                                        Option A: Fix Stock First (Recommended)
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        Abort staging transfer. Material stays in <strong className="text-amber-500">SOFT reservation hold</strong>. Wait for PO delivery receipt, QA inspection release, or adjust inventory balances.
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleCancel}
                                    disabled={isLoading}
                                    className="shrink-0 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                                >
                                    <XCircle className="h-4 w-4 mr-1.5" />
                                    Abort Transfer
                                </Button>
                            </div>
                        </div>

                        {/* Option B: Proceed with Negative Stock */}
                        <div className="rounded-xl border border-destructive/40 p-4 bg-destructive/5 space-y-3">
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 font-semibold text-sm text-destructive">
                                        <Lock className="h-4 w-4" />
                                        Option B: Proceed with Negative Stock Override
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        Force transfer into <code className="text-primary font-mono text-[11px]">{warningInfo.target_bin}</code>, immediately converting reservation status to <strong className="text-emerald-500">HARD (READY)</strong>. Inventory balance will go negative with <code className="font-mono text-destructive">override_negative = true</code>.
                                    </p>
                                </div>
                                {!showOverrideConfirm && (
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => setShowOverrideConfirm(true)}
                                        disabled={isLoading}
                                        className="shrink-0 shadow-sm"
                                    >
                                        Authorize Override
                                    </Button>
                                )}
                            </div>

                            {/* Negative Override Authorization Form */}
                            {showOverrideConfirm && (
                                <div className="pt-3 border-t border-destructive/20 space-y-3 animate-in fade-in-50 duration-200">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="override-notes" className="text-xs font-medium text-foreground">
                                            Authorization Justification / Supervisor Remarks <span className="text-destructive">*</span>
                                        </Label>
                                        <Input
                                            id="override-notes"
                                            value={overrideRemarks}
                                            onChange={(e) => setOverrideRemarks(e.target.value)}
                                            placeholder="e.g. Physical stock verified on shelf; PO receiving paperwork pending."
                                            className="text-xs h-9 bg-background"
                                        />
                                    </div>

                                    <div className="flex items-center justify-between gap-2 pt-1">
                                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                                            <Info className="h-3.5 w-3.5 text-destructive" />
                                            Audit entry will record your user session
                                        </span>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setShowOverrideConfirm(false)}
                                                disabled={isLoading}
                                                className="text-xs h-8"
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                variant="destructive"
                                                size="sm"
                                                onClick={handleConfirmNegativeOverride}
                                                disabled={isLoading}
                                                className="text-xs h-8 font-semibold shadow-md"
                                            >
                                                {isLoading ? (
                                                    "Overriding..."
                                                ) : (
                                                    <>
                                                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                                        Confirm Negative Staging
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <DialogFooter className="bg-muted/40 px-6 py-3 border-t border-border flex justify-end">
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleCancel}
                        disabled={isLoading}
                    >
                        Close Window
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default ShortageWarningDialog;
