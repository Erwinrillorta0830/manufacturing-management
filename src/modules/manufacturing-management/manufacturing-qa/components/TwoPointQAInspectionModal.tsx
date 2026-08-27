"use client";

import React, { useState, useMemo } from "react";
import { 
    CheckCircle2, 
    AlertTriangle, 
    RotateCcw, 
    Package, 
    Calendar, 
    Tag, 
    FileText, 
    Loader2, 
    Sparkles,
    Scale,
    ShieldAlert
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import { JobOrder, QARejectionReason, TwoPointQAInspectionPayload } from "../types";

interface TwoPointQAInspectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    jobOrder: JobOrder | null;
    rejectionReasons: QARejectionReason[];
    getBranchName: (branchId?: number | null) => string;
    onSubmitInspection: (payload: TwoPointQAInspectionPayload) => Promise<void>;
    actionLoading: boolean;
}

export function TwoPointQAInspectionModal({
    isOpen,
    onClose,
    jobOrder,
    rejectionReasons,
    getBranchName,
    onSubmitInspection,
    actionLoading
}: TwoPointQAInspectionModalProps) {
    if (!jobOrder) return null;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto p-0 gap-0">
                <TwoPointQAFormContent
                    key={jobOrder.job_order_id || jobOrder.id}
                    jobOrder={jobOrder}
                    rejectionReasons={rejectionReasons}
                    getBranchName={getBranchName}
                    onSubmitInspection={onSubmitInspection}
                    actionLoading={actionLoading}
                    onClose={onClose}
                />
            </DialogContent>
        </Dialog>
    );
}

function TwoPointQAFormContent({
    jobOrder,
    rejectionReasons,
    getBranchName,
    onSubmitInspection,
    actionLoading,
    onClose
}: {
    jobOrder: JobOrder;
    rejectionReasons: QARejectionReason[];
    getBranchName: (branchId?: number | null) => string;
    onSubmitInspection: (payload: TwoPointQAInspectionPayload) => Promise<void>;
    actionLoading: boolean;
    onClose: () => void;
}) {
    const targetQty = Number(jobOrder.target_quantity || jobOrder.quantity || 0);
    const completed = Number(jobOrder.completed_quantity || jobOrder.actual_quantity_produced || 0);
    const rejected = Number(jobOrder.rejected_quantity || 0);
    const remainingToInspect = Math.max(0, targetQty - (completed + rejected)) || targetQty;

    const joNo = jobOrder.job_order_no || jobOrder.jo_id || "";

    const [inspectedQty, setInspectedQty] = useState<string>(String(remainingToInspect));
    const [passedQty, setPassedQty] = useState<string>(String(remainingToInspect));
    const [rejectedQty, setRejectedQty] = useState<string>("0");
    const [rejectionReasonId, setRejectionReasonId] = useState<string>("");
    const [lotNumber, setLotNumber] = useState<string>(`MFG-${joNo}`);
    const [manufacturingDate, setManufacturingDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
    const [expiryDate, setExpiryDate] = useState<string>(() => {
        const nextYear = new Date();
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        return nextYear.toISOString().split("T")[0];
    });
    const [unitCost] = useState<string>(String(jobOrder.unit_cost || 0));
    const [remarks, setRemarks] = useState<string>("");

    // Handle Inspected Quantity change
    const handleInspectedQtyChange = (val: string) => {
        setInspectedQty(val);
        const numInsp = parseFloat(val) || 0;
        const numRej = parseFloat(rejectedQty) || 0;
        if (numInsp >= numRej) {
            setPassedQty(String(Math.max(0, numInsp - numRej)));
        } else {
            setPassedQty(String(numInsp));
            setRejectedQty("0");
        }
    };

    // Handle Passed Quantity change
    const handlePassedQtyChange = (val: string) => {
        setPassedQty(val);
        const numPass = parseFloat(val) || 0;
        const numInsp = parseFloat(inspectedQty) || 0;
        const calculatedRej = Math.max(0, numInsp - numPass);
        setRejectedQty(String(calculatedRej));
        if (calculatedRej === 0) {
            setRejectionReasonId("");
        }
    };

    // Handle Rejected Quantity change
    const handleRejectedQtyChange = (val: string) => {
        setRejectedQty(val);
        const numRej = parseFloat(val) || 0;
        const numInsp = parseFloat(inspectedQty) || 0;
        const calculatedPass = Math.max(0, numInsp - numRej);
        setPassedQty(String(calculatedPass));
        if (numRej === 0) {
            setRejectionReasonId("");
        }
    };

    const numInsp = parseFloat(inspectedQty) || 0;
    const numPass = parseFloat(passedQty) || 0;
    const numRej = parseFloat(rejectedQty) || 0;

    const passRate = numInsp > 0 ? (numPass / numInsp) * 100 : 0;
    const rejRate = numInsp > 0 ? (numRej / numInsp) * 100 : 0;

    const is100PercentPass = numInsp > 0 && numRej === 0 && numPass === numInsp;
    const hasRejections = numRej > 0;

    const selectedReason = useMemo(() => {
        if (!rejectionReasonId) return null;
        return rejectionReasons.find(r => String(r.id) === String(rejectionReasonId));
    }, [rejectionReasonId, rejectionReasons]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!jobOrder) return;

        if (numInsp <= 0) {
            toast.error("Please enter a valid inspected quantity (> 0).");
            return;
        }

        if (numPass < 0 || numRej < 0) {
            toast.error("Passed and rejected quantities cannot be negative.");
            return;
        }

        if (Math.abs((numPass + numRej) - numInsp) > 0.001) {
            toast.error(`Passed (${numPass}) + Rejected (${numRej}) must equal Inspected (${numInsp}).`);
            return;
        }

        if (hasRejections && !rejectionReasonId) {
            toast.error("Rejection reason is mandatory when rejected quantity is greater than 0.");
            return;
        }

        const payload: TwoPointQAInspectionPayload = {
            job_order_id: Number(jobOrder.job_order_id || jobOrder.id || jobOrder.order_id),
            job_order_no: joNo,
            product_id: Number(jobOrder.product_id),
            branch_id: Number(jobOrder.branch_id || 1),
            inspected_quantity: numInsp,
            passed_quantity: numPass,
            rejected_quantity: numRej,
            rejection_reason_id: hasRejections ? Number(rejectionReasonId) : null,
            lot_number: lotNumber.trim() || `MFG-${joNo}`,
            manufacturing_date: manufacturingDate || undefined,
            expiry_date: expiryDate || undefined,
            unit_cost: parseFloat(unitCost) || 0,
            remarks: remarks.trim()
        };

        await onSubmitInspection(payload);
    };

    if (!jobOrder) return null;

    return (
        <>
            {/* Header */}
            <DialogHeader className="p-5 border-b bg-muted/20 sticky top-0 z-10 backdrop-blur-md">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                <Sparkles className="h-5 w-5" />
                            </div>
                            <div>
                                <DialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
                                    Simplified 2-Point QA Inspection
                                    <Badge variant="outline" className="font-mono text-xs">
                                        {joNo}
                                    </Badge>
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                    Enter inspected, passed, and rejected yield. 100% pass completes the JO & receipts finished goods, while rejections auto-spawn rework JOs.
                                </DialogDescription>
                            </div>
                        </div>
                    </div>

                    {/* Job Order Meta Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-xs">
                        <div className="bg-background/80 border rounded-lg p-2.5">
                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block">Product</span>
                            <span className="font-semibold text-foreground truncate block mt-0.5" title={jobOrder.product_name}>
                                {jobOrder.product_name}
                            </span>
                        </div>
                        <div className="bg-background/80 border rounded-lg p-2.5">
                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block">Target Quantity</span>
                            <span className="font-mono font-bold text-foreground block mt-0.5">
                                {Number(jobOrder.target_quantity || jobOrder.quantity || 0).toLocaleString()} units
                            </span>
                        </div>
                        <div className="bg-background/80 border rounded-lg p-2.5">
                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block">Branch</span>
                            <span className="font-semibold text-foreground truncate block mt-0.5">
                                {getBranchName(jobOrder.branch_id)}
                            </span>
                        </div>
                        <div className="bg-background/80 border rounded-lg p-2.5">
                            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider block">Current Status</span>
                            <Badge variant={jobOrder.status === "COMPLETED" ? "default" : "secondary"} className="mt-0.5 text-[10px]">
                                {jobOrder.status}
                            </Badge>
                        </div>
                    </div>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="p-5 space-y-5">
                    {/* SECTION 1: 2-Point Yield Entry Form */}
                    <div className="rounded-xl border bg-card p-4 space-y-4 shadow-xs">
                        <div className="flex items-center justify-between border-b pb-2">
                            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                                <Scale className="h-3.5 w-3.5 text-primary" />
                                2-Point Yield Accounting
                            </h4>
                            <span className="text-[11px] text-muted-foreground font-medium">
                                Inspected = Passed + Rejected
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                            {/* Inspected Quantity */}
                            <div className="space-y-1.5">
                                <Label htmlFor="inspected-qty" className="text-xs font-semibold text-foreground flex items-center gap-1">
                                    Inspected Qty <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="inspected-qty"
                                    type="number"
                                    step="any"
                                    min="0.01"
                                    value={inspectedQty}
                                    onChange={e => handleInspectedQtyChange(e.target.value)}
                                    placeholder="0"
                                    className="font-mono text-sm font-bold bg-muted/10 focus-visible:ring-primary"
                                    required
                                />
                                <span className="text-[10px] text-muted-foreground">Total batch units inspected</span>
                            </div>

                            {/* Passed Quantity (Green highlight) */}
                            <div className="space-y-1.5">
                                <Label htmlFor="passed-qty" className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    Passed Qty <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="passed-qty"
                                    type="number"
                                    step="any"
                                    min="0"
                                    value={passedQty}
                                    onChange={e => handlePassedQtyChange(e.target.value)}
                                    placeholder="0"
                                    className="font-mono text-sm font-bold border-emerald-500/30 focus-visible:ring-emerald-500 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                                    required
                                />
                                <span className="text-[10px] text-muted-foreground">Acceptable finished goods</span>
                            </div>

                            {/* Rejected Quantity (Amber/Red highlight) */}
                            <div className="space-y-1.5">
                                <Label htmlFor="rejected-qty" className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                    Rejected / Defect Qty <span className="text-destructive">*</span>
                                </Label>
                                <Input
                                    id="rejected-qty"
                                    type="number"
                                    step="any"
                                    min="0"
                                    value={rejectedQty}
                                    onChange={e => handleRejectedQtyChange(e.target.value)}
                                    placeholder="0"
                                    className={`font-mono text-sm font-bold ${
                                        hasRejections
                                            ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 focus-visible:ring-amber-500"
                                            : "bg-muted/10"
                                    }`}
                                    required
                                />
                                <span className="text-[10px] text-muted-foreground">Requires standalone rework</span>
                            </div>
                        </div>

                        {/* Visual Yield Percentage Progress Bar */}
                        {numInsp > 0 && (
                            <div className="space-y-1.5 pt-2">
                                <div className="flex justify-between items-center text-[11px] font-semibold">
                                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                        Passed: {passRate.toFixed(1)}% ({numPass} units)
                                    </span>
                                    <span className={hasRejections ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
                                        Rejected: {rejRate.toFixed(1)}% ({numRej} units)
                                    </span>
                                </div>
                                <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex shadow-inner">
                                    <div 
                                        className="h-full bg-emerald-500 transition-all duration-300"
                                        style={{ width: `${Math.min(100, passRate)}%` }}
                                        title={`Passed: ${passRate.toFixed(1)}%`}
                                    />
                                    <div 
                                        className="h-full bg-amber-500 transition-all duration-300"
                                        style={{ width: `${Math.min(100, rejRate)}%` }}
                                        title={`Rejected: ${rejRate.toFixed(1)}%`}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* SECTION 2: Mandatory Rejection Reason (Enabled when rejected_quantity > 0) */}
                    {hasRejections && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3 animate-in fade-in duration-200">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="rejection-reason" className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                                    <ShieldAlert className="h-4 w-4 text-amber-500" />
                                    Mandatory Defect / Rejection Reason <span className="text-destructive">*</span>
                                </Label>
                                <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-300">
                                    Required for Rework Spawning
                                </Badge>
                            </div>

                            <Select
                                value={rejectionReasonId}
                                onValueChange={setRejectionReasonId}
                                required={hasRejections}
                            >
                                <SelectTrigger id="rejection-reason" className="bg-background text-xs font-medium h-10 border-amber-500/30 focus:ring-amber-500">
                                    <SelectValue placeholder="-- Select Primary Defect / Non-Conformance Reason --" />
                                </SelectTrigger>
                                <SelectContent className="max-h-56">
                                    {rejectionReasons.map(r => (
                                        <SelectItem key={r.id} value={String(r.id)} className="text-xs py-2">
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="font-mono text-[9px] px-1 py-0 uppercase">
                                                    {r.reason_code}
                                                </Badge>
                                                <span className="font-semibold">{r.reason_name}</span>
                                                {r.category && (
                                                    <span className="text-[10px] text-muted-foreground ml-auto">
                                                        ({r.category})
                                                    </span>
                                                )}
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {selectedReason?.description && (
                                <p className="text-[11px] text-muted-foreground italic bg-background/60 p-2 rounded-md border border-amber-500/20">
                                    &quot;{selectedReason.description}&quot;
                                </p>
                            )}

                            {/* Standalone Rework Job Order Spawner Preview */}
                            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-100 font-medium">
                                <RotateCcw className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold">Standalone Rework Job Order Auto-Spawn Triggered</p>
                                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                        On submission, a standalone rework order <code className="font-mono font-bold text-foreground">JO-RWK-{joNo}-01</code> will be automatically created with target quantity = <strong>{numRej} units</strong>, <code className="text-foreground">parent_job_order_id = {jobOrder.job_order_id || jobOrder.id}</code>, and linked to this inspection record.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SECTION 3: 100% Pass FG Inventory Movement Preview */}
                    {is100PercentPass && (
                        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-900 dark:text-emerald-100 font-medium animate-in fade-in duration-200">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-bold text-emerald-800 dark:text-emerald-200">100% Quality Clearance Verification</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                                    Zero rejections detected. Job Order <code className="font-mono font-bold text-foreground">{joNo}</code> will transition status to <Badge variant="default" className="text-[9px] px-1 py-0 bg-emerald-600">COMPLETED</Badge> in the database and audit trail, and <strong>{numPass} units</strong> will be received into the <code className="text-foreground">inventory_movements</code> ledger.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* SECTION 4: Traceability & Lot Metadata */}
                    {numPass > 0 && (
                        <div className="rounded-xl border bg-card p-4 space-y-3 shadow-xs">
                            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wider border-b pb-2">
                                <Package className="h-3.5 w-3.5 text-primary" />
                                Finished Goods Lot & Ledger Tracking
                            </h4>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="space-y-1">
                                    <Label htmlFor="lot-number" className="text-xs font-semibold flex items-center gap-1">
                                        <Tag className="h-3 w-3 text-muted-foreground" />
                                        Batch / Lot No
                                    </Label>
                                    <Input
                                        id="lot-number"
                                        value={lotNumber}
                                        onChange={e => setLotNumber(e.target.value)}
                                        placeholder={`MFG-${joNo}`}
                                        className="font-mono text-xs h-9"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="mfg-date" className="text-xs font-semibold flex items-center gap-1">
                                        <Calendar className="h-3 w-3 text-muted-foreground" />
                                        Mfg Date
                                    </Label>
                                    <Input
                                        id="mfg-date"
                                        type="date"
                                        value={manufacturingDate}
                                        onChange={e => setManufacturingDate(e.target.value)}
                                        className="text-xs h-9"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label htmlFor="exp-date" className="text-xs font-semibold flex items-center gap-1">
                                        <Calendar className="h-3 w-3 text-muted-foreground" />
                                        Expiry Date
                                    </Label>
                                    <Input
                                        id="exp-date"
                                        type="date"
                                        value={expiryDate}
                                        onChange={e => setExpiryDate(e.target.value)}
                                        className="text-xs h-9"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SECTION 5: Inspector Comments */}
                    <div className="space-y-1.5">
                        <Label htmlFor="qa-remarks" className="text-xs font-semibold flex items-center gap-1">
                            <FileText className="h-3 w-3 text-muted-foreground" />
                            QA Inspector Remarks / Observations
                        </Label>
                        <textarea
                            id="qa-remarks"
                            rows={2}
                            value={remarks}
                            onChange={e => setRemarks(e.target.value)}
                            placeholder="Enter specific audit notes, laboratory inspection values, or rework instructions..."
                            className="w-full bg-background border rounded-lg p-2.5 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-1 focus:ring-primary resize-none"
                        />
                    </div>

                    <DialogFooter className="p-0 pt-2 border-t flex flex-col sm:flex-row gap-2 sm:justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={actionLoading}
                            className="text-xs"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={actionLoading || numInsp <= 0 || (hasRejections && !rejectionReasonId)}
                            className="text-xs font-bold gap-1.5 shadow-sm"
                        >
                            {actionLoading ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Recording Inspection...
                                </>
                            ) : hasRejections ? (
                                <>
                                    <RotateCcw className="h-3.5 w-3.5" />
                                    Signoff QA & Spawn Rework Order
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Complete JO & Release Finished Goods
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </form>
            </>
        );
    }
