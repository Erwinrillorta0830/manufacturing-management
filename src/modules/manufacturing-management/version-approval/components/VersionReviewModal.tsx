"use client";

import React, { useState, useEffect } from "react";
import {
    VersionApprovalItem,
    VersionComparisonData,
    DecisionPayload
} from "../types";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";

import {
    Table,
    TableHeader,
    TableBody,
    TableHead,
    TableRow,
    TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
    GitCompare,
    Layers,
    Clock,
    CheckCircle2,
    XCircle,
    AlertCircle,
    DollarSign,
    AlertTriangle
} from "lucide-react";

interface VersionReviewModalProps {
    item: VersionApprovalItem | null;
    onClose: () => void;
    onSuccess: (action: "approve" | "reject" | "revision") => void;
}

export const VersionReviewModal: React.FC<VersionReviewModalProps> = ({
    item,
    onClose,
    onSuccess,
}) => {
    const [comparisonData, setComparisonData] = useState<VersionComparisonData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Decision Form State
    const [setActive, setSetActive] = useState<boolean>(true);
    const [remarks, setRemarks] = useState<string>("");

    const isProcessed = item?.status === "Approved" || item?.status === "Active" || item?.status === "Rejected";

    useEffect(() => {
        if (item) {
            setRemarks(item.revision_notes || item.rejection_reason || "");
        }
    }, [item]);

    useEffect(() => {
        if (!item) return;

        let isMounted = true;
        const controller = new AbortController();

        const fetchComparison = async () => {
            setLoading(true);
            setErrorMsg(null);
            try {
                const targetId = item.version_id;
                const baseId = item.base_version_id || "";
                const url = `/api/manufacturing/finished-goods/versions/approvals/compare?targetVersionId=${targetId}${baseId ? `&baseVersionId=${baseId}` : ""}`;

                const res = await fetch(url, { signal: controller.signal });
                const json = await res.json().catch(() => ({}));

                if (!res.ok) {
                    throw new Error(json.error || `Failed to load comparison data (${res.status})`);
                }

                if (isMounted) {
                    setComparisonData(json);
                }
            } catch (err: unknown) {
                if ((err as Error).name === "AbortError") {
                    return;
                }
                const error = err as Error;
                console.error("Comparison fetch error:", err);
                if (isMounted) {
                    setErrorMsg(error.message || "Failed to load version comparison data.");
                }
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        };

        fetchComparison();

        return () => {
            isMounted = false;
            controller.abort();
        };
    }, [item]);

    if (!item) return null;

    const handleAction = async (action: "approve" | "reject" | "revision") => {
        if (action === "reject" && !remarks.trim()) {
            setErrorMsg("Please specify a reason for rejecting this version in the remarks field.");
            return;
        }

        setSubmitting(true);
        setErrorMsg(null);

        const payload: DecisionPayload = {
            versionId: item.version_id,
            action: action,
            setActive: action === "approve" ? setActive : false,
            remarks: action === "approve" ? remarks.trim() : undefined,
            rejectionReason: action === "reject" ? remarks.trim() : undefined,
        };

        try {
            const res = await fetch("/api/manufacturing/finished-goods/versions/approvals", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            const result = await res.json().catch(() => ({}));

            if (!res.ok || result.error) {
                throw new Error(result.error || `Failed to submit decision (${res.status})`);
            }

            onSuccess(action);
            onClose();
        } catch (err: unknown) {
            const error = err as Error;
            console.error("Decision submission error:", err);
            setErrorMsg(error.message || "Failed to process approval decision.");
        } finally {
            setSubmitting(false);
        }
    };

    const getHeaderBadge = () => {
        const st = item.status;
        if (st === "Pending Approval" || st === "For Approval") {
            return <Badge className="ml-3 bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 border-amber-500/30">For Approval</Badge>;
        }
        if (st === "Approved" || st === "Active") {
            return <Badge className="ml-3 bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25 border-emerald-500/30">Approved</Badge>;
        }
        if (st === "Rejected") {
            return <Badge className="ml-3 bg-rose-500/15 text-rose-500 hover:bg-rose-500/25 border-rose-500/30">Rejected</Badge>;
        }
        return null;
    };

    /* Helper functions for version diff rows if needed in comparison tab view */

    return (
        <Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="sm:max-w-6xl w-[95vw] sm:w-[90vw] max-h-[92vh] flex flex-col p-0 gap-0 bg-card border-border text-card-foreground overflow-hidden shadow-2xl rounded-xl">
                {/* Header */}
                <DialogHeader className="p-5 border-b border-border bg-muted/30 flex flex-row items-center justify-between">
                    <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                        <GitCompare className="text-primary" size={20} />
                        <span>Review Product Version: {item.version_name}</span>
                        {getHeaderBadge()}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        Review product version BOM components, routing cycle times, and submit approval decisions.
                    </DialogDescription>
                </DialogHeader>

                {/* Scrollable One-Pager Body */}
                <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                    {/* Top Product & Version Details Header Banner */}
                    <div className="bg-background p-5 rounded-xl border border-border flex flex-wrap justify-between items-center gap-4 shadow-sm">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-xl text-foreground">{item.product_name}</span>
                                <Badge variant="outline" className="bg-secondary text-secondary-foreground border-border text-xs px-2.5 py-0.5">
                                    {item.category}
                                </Badge>
                            </div>
                            <span className="font-mono text-xs text-muted-foreground">Product Code: {item.product_code}</span>
                        </div>

                        <div className="flex items-center gap-6 text-sm bg-muted/40 px-5 py-3 rounded-lg border border-border">
                            <div>
                                <span className="text-xs text-muted-foreground block uppercase font-bold tracking-wider">Version Name</span>
                                <span className="font-semibold text-primary text-base">{item.version_name}</span>
                            </div>
                            <div className="h-8 w-px bg-border"></div>
                            <div>
                                <span className="text-xs text-muted-foreground block uppercase font-bold tracking-wider">Batch Size / Yield</span>
                                <span className="font-semibold text-foreground text-base">
                                    {item.base_quantity} pcs / {item.expected_yield_percentage}%
                                </span>
                            </div>
                            <div className="h-8 w-px bg-border"></div>
                            <div>
                                <span className="text-xs text-muted-foreground block uppercase font-bold tracking-wider">Created By</span>
                                <span className="font-medium text-foreground text-xs">{item.created_by}</span>
                            </div>
                        </div>
                    </div>

                    {errorMsg && (
                        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 p-3 rounded-lg flex items-center gap-2 text-sm">
                            <AlertCircle size={16} />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {loading ? (
                        <div className="va-loading-state py-16">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-3"></div>
                            <p className="text-base font-medium">Loading version details & BOM explosion...</p>
                        </div>
                    ) : (
                        <>
                            {/* Section 1: Bill of Materials (BOM) Components */}
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-2 pb-1 border-b border-border">
                                    <Layers className="text-primary" size={18} />
                                    <h3 className="font-bold text-base text-foreground">1. Bill of Materials (BOM) Components</h3>
                                    <Badge variant="outline" className="ml-auto text-xs">
                                        {(comparisonData?.bomComponents || []).length} Components
                                    </Badge>
                                </div>

                                <div className="va-table-card border border-border rounded-lg overflow-hidden shadow-sm">
                                    <Table className="va-table">
                                        <TableHeader>
                                            <TableRow className="border-b border-border bg-muted/40 hover:bg-transparent">
                                                <TableHead>Component Code & Name</TableHead>
                                                <TableHead className="text-right">Required Qty</TableHead>
                                                <TableHead className="text-right">Wastage %</TableHead>
                                                <TableHead className="text-right">Unit Cost</TableHead>
                                                <TableHead className="text-right pr-4">Total Cost</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(comparisonData?.bomComponents || []).length > 0 ? (
                                                comparisonData!.bomComponents!.map((comp: { component_name?: string; component_code?: string; quantity_required?: number; wastage_factor_percentage?: number; uom?: string; cost_per_unit?: number; extended_cost?: number }, idx: number) => (
                                                    <TableRow key={idx} className="border-b border-border/60 hover:bg-muted/30">
                                                        <TableCell>
                                                            <div className="flex flex-col">
                                                                <span className="font-semibold text-foreground">{comp.component_name}</span>
                                                                <span className="font-mono text-xs text-muted-foreground">{comp.component_code}</span>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-foreground font-medium">
                                                            {comp.quantity_required} {comp.uom}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-muted-foreground">
                                                            {comp.wastage_factor_percentage ? `${comp.wastage_factor_percentage}%` : "0%"}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono text-foreground">
                                                            ₱{Number(comp.cost_per_unit || 0).toFixed(2)}
                                                        </TableCell>
                                                        <TableCell className="text-right font-mono font-semibold text-foreground pr-4">
                                                            ₱{Number(comp.extended_cost || 0).toFixed(2)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">
                                                        No BOM components defined for this version.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>

                            {/* Section 2: Routing Steps & Cycle Times */}
                            <div className="flex flex-col gap-3 mt-2">
                                <div className="flex items-center gap-2 pb-1 border-b border-border">
                                    <Clock className="text-primary" size={18} />
                                    <h3 className="font-bold text-base text-foreground">2. Routing Operations & Work Center Cycle Times</h3>
                                    <Badge variant="outline" className="ml-auto text-xs">
                                        {(comparisonData?.routingSteps || []).length} Steps
                                    </Badge>
                                </div>

                                <div className="va-table-card border border-border rounded-lg overflow-hidden shadow-sm">
                                    <Table className="va-table">
                                        <TableHeader>
                                            <TableRow className="border-b border-border bg-muted/40 hover:bg-transparent">
                                                <TableHead className="w-[60px]">Step</TableHead>
                                                <TableHead>Operation Name</TableHead>
                                                <TableHead>Work Center</TableHead>
                                                <TableHead className="text-right">Setup Time</TableHead>
                                                <TableHead className="text-right">Run Time</TableHead>
                                                <TableHead className="text-right pr-4">Total Cycle Time</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {(comparisonData?.routingSteps || []).length > 0 ? (
                                                comparisonData!.routingSteps!.map((step: { step_number?: number; operation_name?: string; work_center_name?: string; setup_time_minutes?: number; run_time_minutes?: number; total_time_minutes?: number }, idx: number) => (
                                                    <TableRow key={idx} className="border-b border-border/60 hover:bg-muted/30">
                                                        <TableCell className="font-mono text-center font-bold text-foreground">{step.step_number}</TableCell>
                                                        <TableCell className="font-semibold text-foreground">{step.operation_name}</TableCell>
                                                        <TableCell className="text-muted-foreground">{step.work_center_name}</TableCell>
                                                        <TableCell className="text-right font-mono text-foreground">{step.setup_time_minutes} min</TableCell>
                                                        <TableCell className="text-right font-mono text-foreground">{step.run_time_minutes} min</TableCell>
                                                        <TableCell className="text-right font-mono font-semibold text-primary pr-4">{step.total_time_minutes} min</TableCell>
                                                    </TableRow>
                                                ))
                                            ) : (
                                                <TableRow>
                                                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                                                        No routing steps defined for this version.
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>

                            {/* Section 3: Cost & Overhead Summary */}
                            <div className="flex flex-col gap-3 mt-2">
                                <div className="flex items-center gap-2 pb-1 border-b border-border">
                                    <DollarSign className="text-primary" size={18} />
                                    <h3 className="font-bold text-base text-foreground">3. Unit Cost & Overhead Summary</h3>
                                </div>

                                <div className="va-table-card border border-border rounded-lg overflow-hidden shadow-sm">
                                    <Table className="va-table">
                                        <TableHeader>
                                            <TableRow className="border-b border-border bg-muted/40 hover:bg-transparent">
                                                <TableHead>Cost Component</TableHead>
                                                <TableHead>Description</TableHead>
                                                <TableHead className="text-right pr-4">Estimated Amount (₱)</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            <TableRow className="border-b border-border/50">
                                                <TableCell className="font-semibold text-foreground">Material Cost (BOM Explosion)</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">Sum of all required raw materials and sub-assemblies</TableCell>
                                                <TableCell className="text-right font-mono text-foreground font-semibold pr-4">
                                                    ₱{Number(comparisonData?.costSummary?.materialCost || 0).toFixed(2)}
                                                </TableCell>
                                            </TableRow>
                                            <TableRow className="border-b border-border/50">
                                                <TableCell className="font-semibold text-foreground">Labor & Machine Rate (Routing)</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">Sum of work center setup and run cycle time costs</TableCell>
                                                <TableCell className="text-right font-mono text-foreground font-semibold pr-4">
                                                    ₱{Number(comparisonData?.costSummary?.laborCost || 0).toFixed(2)}
                                                </TableCell>
                                            </TableRow>
                                            <TableRow className="border-b border-border/50">
                                                <TableCell className="font-semibold text-foreground">Custom Version Overhead</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">Version specific overhead allocation</TableCell>
                                                <TableCell className="text-right font-mono text-foreground font-semibold pr-4">
                                                    ₱{Number(comparisonData?.costSummary?.customOverhead || 0).toFixed(2)}
                                                </TableCell>
                                            </TableRow>
                                            <TableRow className="bg-muted/40 font-semibold">
                                                <TableCell className="text-foreground font-bold">Total Estimated Unit Net Cost</TableCell>
                                                <TableCell className="text-xs text-muted-foreground">Estimated landed cost to produce 1 base batch quantity</TableCell>
                                                <TableCell className="text-right font-mono text-primary font-bold text-base pr-4">
                                                    ₱{Number(comparisonData?.costSummary?.totalUnitCost || 0).toFixed(2)}
                                                </TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Section 4: Decision & Action Form */}
                    <div className="va-decision-section p-5 bg-background border border-border rounded-xl flex flex-col gap-4 mt-2 shadow-sm">
                        <div className="va-decision-title font-bold text-foreground text-base pb-1 border-b border-border flex items-center justify-between">
                            <span>4. Review Decision & Action</span>
                            <span className="text-xs font-normal text-muted-foreground">{isProcessed ? "Historical Record" : "Provide remarks and submit"}</span>
                        </div>

                        <div className="flex flex-col gap-1.5 mt-1">
                            <label className="text-xs font-medium text-muted-foreground">
                                Review Remarks / Note (Required for Rejection)
                            </label>
                            <Textarea
                                className="bg-background border-input text-foreground placeholder:text-muted-foreground min-h-[80px]"
                                placeholder="e.g. ECN-2026-8809 or specify rejection reason..."
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                disabled={isProcessed}
                            />
                        </div>

                        <div className={`flex flex-col gap-2 mt-1 p-3 bg-muted/30 rounded-lg border border-border/60 ${isProcessed ? 'opacity-70' : ''}`}>
                            <div className="flex items-center space-x-2">
                                <Checkbox
                                    id="setActiveCheckbox"
                                    checked={setActive}
                                    onCheckedChange={(checked) => setSetActive(Boolean(checked))}
                                    disabled={isProcessed}
                                />
                                <label htmlFor="setActiveCheckbox" className={`text-xs text-foreground font-medium ${isProcessed ? 'cursor-default' : 'cursor-pointer'}`}>
                                    Set as Primary immediately upon approval
                                </label>
                            </div>

                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1.5 border-t border-border/40 pl-6">
                                <span>Current Primary Version:</span>
                                {comparisonData?.baseVersion?.version_name ? (
                                    <span className="font-semibold text-foreground bg-background px-2 py-0.5 rounded border border-border text-[11px]">
                                        {comparisonData.baseVersion.version_name}
                                    </span>
                                ) : (
                                    <span className="italic text-muted-foreground/70 text-[11px]">None</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <DialogFooter className="p-4 bg-muted/30 border-t border-border flex flex-row justify-end gap-2">
                    <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
                        {isProcessed ? "Close" : "Cancel"}
                    </Button>
                    {!isProcessed && (
                        <>
                            <Button
                                type="button"
                                variant="destructive"
                                disabled={submitting}
                                onClick={() => handleAction("reject")}
                                className="gap-2 px-5 bg-rose-600 hover:bg-rose-700"
                            >
                                <XCircle size={15} />
                                <span>Reject</span>
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                disabled={submitting}
                                onClick={() => handleAction("revision")}
                                className="gap-2 px-5 text-blue-600 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/20"
                            >
                                <AlertTriangle size={15} />
                                <span>Revise</span>
                            </Button>
                            <Button
                                type="button"
                                variant="default"
                                disabled={submitting}
                                onClick={() => handleAction("approve")}
                                className="gap-2 px-5"
                            >
                                <CheckCircle2 size={15} />
                                <span>Approve</span>
                            </Button>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default VersionReviewModal;

