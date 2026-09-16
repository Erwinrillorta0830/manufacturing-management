"use client";

import React from "react";
import {
    AlertCircle,
    CheckCircle2,
    ClipboardCheck,
    Eye,
    Loader2,
    PackageCheck,
    RefreshCw,
} from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatPhtDate, formatPhtTimestamp } from "../shared/pht-date";
import { useDailyYieldAudit } from "./hooks/useDailyYieldAudit";
import { useJobOrderInspectionQA } from "./hooks/useJobOrderInspectionQA";
import { DailyYieldAuditDialog } from "./components/DailyYieldAuditDialog";
import type { JobOrderDailyYieldRecord } from "./types";

function quantity(value: number): string {
    return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function statusClass(status: string): string {
    const normalized = status.toLowerCase();
    if (["passed", "production completed", "for qa and reconciliation", "closed"].includes(normalized)) {
        return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    }
    if (["on hold", "qa hold", "cancelled", "canceled"].includes(normalized)) {
        return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
    }
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function qaStatusClass(status: string): string {
    if (status === "Passed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    if (status === "QA Hold") return "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300";
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

function DailyYieldRow({
    record,
    onAudit,
    auditDisabled,
}: {
    record: JobOrderDailyYieldRecord;
    onAudit: (record: JobOrderDailyYieldRecord) => void;
    auditDisabled: boolean;
}) {
    return (
        <TableRow>
            <TableCell className="min-w-[180px] align-top">
                <div className="font-semibold text-foreground">{record.shiftName}</div>
                <div className="mt-1 text-[11px] text-muted-foreground font-mono">Ledger #{record.ledgerId}</div>
                {record.sessionKey && <div className="text-[10px] text-muted-foreground truncate max-w-[180px]" title={record.sessionKey}>{record.sessionKey}</div>}
            </TableCell>
            <TableCell className="min-w-[150px] align-top">
                <div className="font-medium">{formatPhtDate(record.productionDate)}</div>
                {record.loggedAt && <div className="mt-1 text-[11px] text-muted-foreground">Logged {formatPhtTimestamp(record.loggedAt)}</div>}
            </TableCell>
            <TableCell className="font-mono text-right align-top">{quantity(record.rejectedQuantity)}</TableCell>
            <TableCell className="min-w-[130px] align-top">
                <div className="font-semibold">{record.lotName || "—"}</div>
                {record.mmLotId && <div className="text-[10px] text-muted-foreground font-mono">#{record.mmLotId}</div>}
            </TableCell>
            <TableCell className="min-w-[130px] align-top font-mono">{record.batchNo || "—"}</TableCell>
            <TableCell className="min-w-[130px] align-top text-right">
                <div className="font-mono font-semibold">{quantity(record.totalQuantity)}</div>
                <div className="mt-1 text-[10px] text-muted-foreground">Good {quantity(record.goodQuantity)} · Scrap {quantity(record.scrapQuantity)}</div>
            </TableCell>
            <TableCell className="sticky right-0 z-10 min-w-[170px] align-top bg-card text-right shadow-[-8px_0_12px_-12px_hsl(var(--foreground)/0.45)]">
                <div className="flex flex-col items-end gap-2">
                    <Badge variant="outline" className={qaStatusClass(record.qaStatus)}>{record.qaStatus}</Badge>
                    <Button
                        type="button"
                        size="sm"
                        variant={auditDisabled ? "outline" : "default"}
                        disabled={auditDisabled}
                        onClick={() => onAudit(record)}
                        title={auditDisabled ? `This yield is already ${record.qaStatus}.` : "Record the daily yield QA audit."}
                        className="min-h-9"
                    >
                        <ClipboardCheck className="h-4 w-4" />
                        {auditDisabled ? "Audit Complete" : "Perform Audit"}
                    </Button>
                </div>
            </TableCell>
        </TableRow>
    );
}

export default function ManufacturingJobOrderInspectionQAModule() {
    const jobOrderState = useJobOrderInspectionQA();
    const auditState = useDailyYieldAudit({ onSaved: jobOrderState.refresh });
    const [closeConfirmOpen, setCloseConfirmOpen] = React.useState(false);
    const details = jobOrderState.selectedDetails;
    const canClose = details?.status === "For QA and Reconciliation";
    const isClosed = details?.status === "Closed";
    const closeSubmitting = details
        ? jobOrderState.closingJobOrderId === details.jobOrderId
        : false;
    const closeReady = details?.closeReadiness.ready === true;

    return (
        <div className="space-y-5">
            <section className="rounded-2xl border bg-card shadow-sm">
                <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><PackageCheck className="h-5 w-5" /></div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight">JO Daily Yields</h1>
                            <p className="text-xs text-muted-foreground">Review daily production yields, complete in-process QA, and move Sales Orders with enough QA-passed output to consolidation.</p>
                        </div>
                    </div>
                    <Button type="button" variant="outline" onClick={() => void jobOrderState.refresh()} disabled={jobOrderState.loading} className="min-h-10 gap-2 self-start sm:self-auto">
                        <RefreshCw className={`h-4 w-4 ${jobOrderState.loading ? "animate-spin" : ""}`} /> Refresh
                    </Button>
                </div>

                {jobOrderState.loading ? (
                    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading Job Orders...</div>
                ) : jobOrderState.error ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center" role="alert">
                        <AlertCircle className="h-7 w-7 text-destructive" />
                        <p className="max-w-lg text-sm text-destructive">{jobOrderState.error}</p>
                        <Button type="button" variant="outline" onClick={() => void jobOrderState.refresh()}>Retry</Button>
                    </div>
                ) : jobOrderState.jobOrders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                        <PackageCheck className="h-8 w-8 opacity-50" />
                        <p className="text-sm font-medium">No daily yields are available.</p>
                        <p className="text-xs">Yield-bearing Job Orders will appear here after a production session is recorded.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Job Order</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Target Qty</TableHead>
                                    <TableHead className="text-right">Produced Qty</TableHead>
                                    <TableHead>Latest Yield</TableHead>
                                    <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {jobOrderState.jobOrders.map((jobOrder) => (
                                    <TableRow key={jobOrder.jobOrderId}>
                                        <TableCell>
                                            <div className="font-mono font-bold text-primary">{jobOrder.jobOrderNo}</div>
                                            <div className="mt-1 text-[11px] text-muted-foreground">{jobOrder.yieldCount} daily yield{jobOrder.yieldCount === 1 ? "" : "s"}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium">{jobOrder.productName}</div>
                                            {jobOrder.productCode && <div className="text-[11px] text-muted-foreground font-mono">{jobOrder.productCode}</div>}
                                        </TableCell>
                                        <TableCell><Badge variant="outline" className={statusClass(jobOrder.status)}>{jobOrder.status}</Badge></TableCell>
                                        <TableCell className="text-right font-mono">{quantity(jobOrder.targetQuantity)}</TableCell>
                                        <TableCell className="text-right font-mono font-semibold">{quantity(jobOrder.producedQuantity)}</TableCell>
                                        <TableCell className="min-w-[160px] text-sm">{jobOrder.latestYieldAt ? formatPhtTimestamp(jobOrder.latestYieldAt) : "—"}</TableCell>
                                        <TableCell className="text-right">
                                            <Button type="button" size="sm" variant="outline" onClick={() => jobOrderState.openDetails(jobOrder)} className="min-h-9 gap-2">
                                                <Eye className="h-4 w-4" /> View Details
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </section>

            <Dialog open={Boolean(jobOrderState.selectedJobOrder)} onOpenChange={(open) => { if (!open) jobOrderState.closeDetails(); }}>
                <DialogContent className="w-[calc(100vw-2rem)] max-w-[1400px] sm:max-w-[1400px] max-h-[calc(100dvh-1rem)] overflow-hidden flex flex-col bg-background text-foreground">
                    <DialogHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-1">
                            <DialogTitle className="flex items-center gap-2 text-primary"><PackageCheck className="h-5 w-5 shrink-0" /> {details?.jobOrderNo || jobOrderState.selectedJobOrder?.jobOrderNo || "Job Order Details"}</DialogTitle>
                            <DialogDescription className="text-xs">Daily yield QA and linked Sales Order fulfillment details.</DialogDescription>
                        </div>
                        {details && canClose ? (
                            <Button
                                type="button"
                                size="sm"
                                variant={closeReady ? "default" : "outline"}
                                disabled={!closeReady || closeSubmitting || jobOrderState.detailsLoading}
                                onClick={() => setCloseConfirmOpen(true)}
                                title={closeReady ? "Close this Job Order after confirming the completed QA and reconciliation checks." : "Resolve the listed QA and reconciliation blockers before closing this Job Order."}
                                className="min-h-9 shrink-0 gap-2 self-start"
                            >
                                {closeSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                {closeSubmitting ? "Marking as Closed..." : "Mark as Closed"}
                            </Button>
                        ) : details && isClosed ? (
                            <Button type="button" size="sm" variant="outline" disabled className="min-h-9 shrink-0 gap-2 self-start">
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> JO Closed
                            </Button>
                        ) : null}
                    </DialogHeader>

                    {jobOrderState.detailsLoading ? (
                        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading JO details...</div>
                    ) : jobOrderState.detailsError ? (
                        <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-center" role="alert">
                            <AlertCircle className="h-7 w-7 text-destructive" />
                            <p className="max-w-lg text-sm text-destructive">{jobOrderState.detailsError}</p>
                            <Button type="button" variant="outline" onClick={() => jobOrderState.selectedJobOrder && jobOrderState.openDetails(jobOrderState.selectedJobOrder)}>Retry</Button>
                        </div>
                    ) : details ? (
                        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
                            <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-3 text-sm md:grid-cols-5">
                                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Product</div><div className="mt-1 font-semibold">{details.productName}</div></div>
                                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">JO Status</div><Badge variant="outline" className={`mt-1 ${statusClass(details.status)}`}>{details.status}</Badge></div>
                                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Target Qty</div><div className="mt-1 font-mono font-semibold">{quantity(details.targetQuantity)}</div></div>
                                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Produced Qty</div><div className="mt-1 font-mono font-semibold">{quantity(details.producedQuantity)}</div></div>
                                <div><div className="text-[10px] uppercase tracking-wide text-muted-foreground">Yield Records</div><div className="mt-1 font-semibold">{details.dailyYields.length}</div></div>
                            </div>

                            {canClose && (
                                <div className={`rounded-xl border p-3 text-sm ${closeReady ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`} role="status">
                                    <div className="flex items-start gap-2">
                                        {closeReady ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                                        <div className="min-w-0">
                                            <p className="font-semibold">{closeReady ? "Ready to mark as closed" : "Mark as Closed is blocked"}</p>
                                            {closeReady ? (
                                                <p className="mt-1 text-xs text-muted-foreground">All daily yields have completed Passed QA outcomes, QA dispositions are resolved, and raw-material WIP is balanced.</p>
                                            ) : (
                                                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                                                    {details.closeReadiness.blockers.map((blocker, index) => <li key={`${blocker.code}-${index}`}>{blocker.message}</li>)}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <section className="rounded-xl border">
                                <div className="border-b p-4">
                                    <h3 className="font-bold">JO Daily Yield Table</h3>
                                    <p className="mt-1 text-xs text-muted-foreground">Each production session is listed once with its QA state and output traceability. A passed yield contributes its Good Qty and Rejected Qty to Produced Qty; Scrap Qty is excluded.</p>
                                </div>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Daily Yield Details</TableHead>
                                                <TableHead>Created for that day</TableHead>
                                                <TableHead className="text-right">Rejected Qty</TableHead>
                                                <TableHead>Lot</TableHead>
                                                <TableHead>Batch</TableHead>
                                                <TableHead className="text-right">Total Qty</TableHead>
                                                <TableHead className="sticky right-0 z-20 min-w-[170px] bg-card text-right shadow-[-8px_0_12px_-12px_hsl(var(--foreground)/0.45)]">Action for Daily Yield</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {details.dailyYields.length === 0 ? (
                                                <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">No daily yields recorded for this Job Order.</TableCell></TableRow>
                                            ) : details.dailyYields.map((record) => (
                                                <DailyYieldRow key={record.ledgerId} record={record} onAudit={(yieldRecord) => auditState.openAudit(yieldRecord, details)} auditDisabled={record.qaStatus !== "Pending"} />
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            </section>

                            <section className="rounded-xl border">
                                <div className="border-b p-4">
                                    <h3 className="font-bold">Sales Order Fulfillment</h3>
                                    <p className="mt-1 text-xs text-muted-foreground">A Sales Order can move to consolidation only after every detail line has enough QA-passed output.</p>
                                </div>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Sales Order Number</TableHead>
                                                <TableHead className="text-right">Ordered Qty</TableHead>
                                                <TableHead className="text-right">Produced Quantity</TableHead>
                                                <TableHead className="sticky right-0 z-20 min-w-[190px] bg-card text-right shadow-[-8px_0_12px_-12px_hsl(var(--foreground)/0.45)]">For Consolidation</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {details.salesOrders.length === 0 ? (
                                                <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">No linked Sales Orders were found.</TableCell></TableRow>
                                            ) : details.salesOrders.map((salesOrder) => {
                                                const actionLoading = jobOrderState.consolidatingOrderId === salesOrder.orderId;
                                                return (
                                                    <TableRow key={salesOrder.orderId}>
                                                        <TableCell><div className="font-mono font-semibold text-primary">{salesOrder.orderNo}</div><div className="mt-1 text-[11px] text-muted-foreground">{salesOrder.status}</div></TableCell>
                                                        <TableCell className="text-right font-mono">{quantity(salesOrder.orderedQuantity)}</TableCell>
                                                        <TableCell className="text-right font-mono font-semibold">{quantity(salesOrder.producedQuantity)}</TableCell>
                                                        <TableCell className="sticky right-0 z-10 min-w-[190px] bg-card text-right shadow-[-8px_0_12px_-12px_hsl(var(--foreground)/0.45)]">
                                                            <div className="flex flex-col items-end gap-1.5">
                                                                <Button type="button" size="sm" variant={salesOrder.canMoveToConsolidation ? "default" : "outline"} disabled={!salesOrder.canMoveToConsolidation || actionLoading} onClick={() => void jobOrderState.handleMoveToConsolidation(salesOrder.orderId)} title={salesOrder.blockedReason || "Move Sales Order to For Consolidation."} className="min-h-9 gap-2">
                                                                    {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                                                                    <PackageCheck className="h-4 w-4" />
                                                                    {actionLoading ? "Updating..." : salesOrder.status === "For Consolidation" ? "Already Consolidated" : "For Consolidation"}
                                                                </Button>
                                                                {!salesOrder.canMoveToConsolidation && salesOrder.blockedReason && <span className="max-w-[260px] text-[10px] text-muted-foreground">{salesOrder.blockedReason}</span>}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </section>
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>

            <AlertDialog open={closeConfirmOpen} onOpenChange={(open) => { if (!closeSubmitting) setCloseConfirmOpen(open); }}>
                <AlertDialogContent size="sm">
                    <AlertDialogHeader>
                        <AlertDialogTitle>Mark Job Order as Closed?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will mark {details?.jobOrderNo || "this Job Order"} as Closed after the completed QA and raw-material reconciliation checks. This status change does not create inventory movements or repost finished goods.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={closeSubmitting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={!details || !closeReady || closeSubmitting}
                            onClick={(event) => {
                                event.preventDefault();
                                if (!details) return;
                                setCloseConfirmOpen(false);
                                void jobOrderState.handleCloseJobOrder(details.jobOrderId);
                            }}
                        >
                            {closeSubmitting ? "Marking as Closed..." : "Mark as Closed"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <DailyYieldAuditDialog controller={auditState} />
        </div>
    );
}
