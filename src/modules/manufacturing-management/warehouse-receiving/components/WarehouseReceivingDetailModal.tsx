"use client";

import React from "react";
import {
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    ClipboardCheck,
    Loader2,
    PackageCheck,
    Printer,
    X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import type { WarehouseReceivingLine, WarehouseReceivingOrder } from "../types";
import { isReceiptQuantityOverRemaining } from "../quantity-validation";

function formatAmount(value: number | null, currency: string) {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency,
        minimumFractionDigits: 4,
        maximumFractionDigits: 4
    }).format(Number.isFinite(value || 0) ? value || 0 : 0);
}

function foreignTotal(order: { currencyCode: string; totalForeignAmount: number | null }) {
    const currency = order.currencyCode.trim().toUpperCase();
    return currency !== "PHP" && order.totalForeignAmount !== null
        ? formatAmount(order.totalForeignAmount, currency)
        : null;
}

function formatDate(value: string | null) {
    if (!value) return "—";
    const datePart = value.slice(0, 10);
    const date = new Date(`${datePart}T12:00:00+08:00`);
    return Number.isNaN(date.getTime())
        ? datePart
        : new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila" }).format(date);
}

function formatQuantity(value: number) {
    return new Intl.NumberFormat("en-PH", { maximumFractionDigits: 4 }).format(Number.isFinite(value) ? value : 0);
}

function statusClass(status: string) {
    return status === "Received"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : status === "Approved" || status === "Warehouse Receiving"
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-amber-200 bg-amber-50 text-amber-700";
}

function statusLabel(status: string) {
    return status === "Partially Received" ? "QA Receiving · Partially Received" : status;
}

function receiptHistoryStatusClass(status: string) {
    return status === "Posted" || status === "Legacy"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : status === "Awaiting QA"
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-blue-200 bg-blue-50 text-blue-700";
}

export interface WarehouseReceivingDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedOrder: WarehouseReceivingOrder | null;
    selectedLines: WarehouseReceivingLine[];
    quantities: Record<number, string>;
    receiptNumber: string;
    receiptDate: string;
    receiptType: "full" | "partial";
    loading: boolean;
    error: string | null;
    submitting: string | null;
    printing: boolean;
    updateQuantity: (lineId: number, value: string) => void;
    setReceiptNumber: (value: string) => void;
    setReceiptDate: (value: string) => void;
    setReceiptType: (value: "full" | "partial") => void;
    start: () => Promise<unknown>;
    saveDraft: () => Promise<unknown>;
    submitToQa: () => Promise<unknown>;
    printSummary: () => Promise<unknown>;
}

export default function WarehouseReceivingDetailModal({
    isOpen,
    onClose,
    selectedOrder,
    selectedLines,
    quantities,
    receiptNumber,
    receiptDate,
    receiptType,
    loading,
    error,
    submitting,
    printing,
    updateQuantity,
    setReceiptNumber,
    setReceiptDate,
    setReceiptType,
    start,
    saveDraft,
    submitToQa,
    printSummary
}: WarehouseReceivingDetailModalProps) {
    if (!isOpen) return null;

    const isStarted = selectedOrder?.status === "Warehouse Receiving";
    const isContinuation = selectedOrder?.status === "Partially Received";
    const isPendingQa = selectedOrder?.status === "QA Receiving";
    const isReceived = selectedOrder?.status === "Received";
    const hasRemainingQuantity = selectedLines.some(line => line.remainingQuantity > 1e-9);
    const actionBusy = submitting !== null || printing;
    const totalEntered = selectedLines.reduce((sum, line) => sum + Math.max(0, Number(quantities[line.lineId] || 0)), 0);
    const overReceivingLines = selectedLines.filter(line => isReceiptQuantityOverRemaining(Math.max(0, Number(quantities[line.lineId] || 0)), line.allowableQuantity));
    const overReceivingQuantity = overReceivingLines.reduce((sum, line) => sum + Math.max(0, Number(quantities[line.lineId] || 0) - line.allowableQuantity), 0);
    const hasPartialReceiptValidationErrors = isStarted && receiptType === "partial" && overReceivingLines.length > 0;
    const totalOrdered = selectedLines.reduce((sum, line) => sum + Math.max(0, line.orderedQuantity), 0);
    const totalReceivedToDate = selectedLines.reduce((sum, line) => sum + Math.max(0, line.previouslyReceivedQuantity), 0);
    const totalRemaining = selectedLines.reduce((sum, line) => sum + Math.max(0, line.remainingQuantity), 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 sm:p-6 backdrop-blur-xs">
            <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl border bg-background shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-4">
                    <div className="min-w-0">
                        <h2 className="text-base font-black tracking-tight text-foreground">
                            Warehouse Receiving · {selectedOrder ? (selectedOrder.poNumber || `PO #${selectedOrder.id}`) : "Loading..."}
                        </h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Confirm physical receiving quantities, record receipt numbers, and hand off to QA Receiving.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Close warehouse receiving modal"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-16 text-center text-xs text-muted-foreground">
                            <Loader2 className="mb-2 h-6 w-6 animate-spin text-primary" />
                            Loading purchase order details...
                        </div>
                    )}

                    {!loading && error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Unable to open purchase order</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {!loading && !error && !selectedOrder && (
                        <div className="rounded-xl border bg-card p-8 text-center text-xs text-muted-foreground">
                            Purchase order not found.
                        </div>
                    )}

                    {!loading && !error && selectedOrder && (
                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                            <div className="space-y-6">
                                <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-base font-bold">{selectedOrder.poNumber}</h3>
                                            <Badge variant="outline" className={statusClass(selectedOrder.status)}>{statusLabel(selectedOrder.status)}</Badge>
                                        </div>
                                        {selectedOrder.referenceNumber && <p className="mt-1 text-xs text-muted-foreground">Ref: {selectedOrder.referenceNumber}</p>}
                                        <p className="mt-1 text-sm text-muted-foreground">{selectedOrder.supplierName} · Receiving branch: {selectedOrder.branch.name} {selectedOrder.branch.code ? `(${selectedOrder.branch.code})` : ""}</p>
                                    </div>
                                    <div className="text-left sm:text-right">
                                        <p className="text-xs text-muted-foreground">PHP total</p>
                                        <p className="font-semibold">{formatAmount(selectedOrder.totalPhpAmount, "PHP")}</p>
                                        {foreignTotal(selectedOrder) && <p className="text-xs text-muted-foreground">{selectedOrder.currencyCode} {foreignTotal(selectedOrder)}</p>}
                                    </div>
                                </div>

                                {isReceived ? (
                                    <Alert className="border-emerald-300 bg-emerald-50 text-emerald-950">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                                        <AlertTitle>Purchase order fully received</AlertTitle>
                                        <AlertDescription>
                                            This purchase order is complete and is shown for receipt history and reference. No additional warehouse receipt can be started.
                                        </AlertDescription>
                                    </Alert>
                                ) : isPendingQa ? (
                                    <Alert className="border-amber-300 bg-amber-50 text-amber-950">
                                        <ClipboardCheck className="h-4 w-4 text-amber-700" />
                                        <AlertTitle>Partial receipt is awaiting QA</AlertTitle>
                                        <AlertDescription>
                                            This warehouse receipt has been submitted to QA Receiving. It is visible here for tracking but cannot be edited or followed by another warehouse receipt until QA posts it.
                                        </AlertDescription>
                                    </Alert>
                                ) : (
                                    <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-900">
                                        <div className="flex items-start gap-3">
                                            <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0" />
                                            <div>
                                                <p className="font-semibold">Warehouse quantity confirmation</p>
                                                <p className="mt-1">Enter the physical quantities received. Lot, batch, expiration, and QA disposition are completed in the next QA Receiving step.</p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <div data-testid="warehouse-receiving-progress" className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <h4 className="font-semibold text-primary">PO receiving progress</h4>
                                            <p className="text-sm text-muted-foreground">Posted receipts are included in Received to date. The active receipt is shown separately until QA posts it.</p>
                                        </div>
                                        {selectedOrder.receiptHistory.length > 0 && (
                                            <span className="text-xs font-semibold text-muted-foreground">
                                                {selectedOrder.receiptHistory.length} receipt{selectedOrder.receiptHistory.length === 1 ? "" : "s"} recorded
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                        <div className="rounded-md border bg-background/80 px-3 py-2"><p className="text-xs text-muted-foreground">Ordered</p><p className="text-lg font-semibold">{formatQuantity(totalOrdered)}</p></div>
                                        <div className="rounded-md border bg-background/80 px-3 py-2"><p className="text-xs text-muted-foreground">Received to date</p><p className="text-lg font-semibold text-emerald-700">{formatQuantity(totalReceivedToDate)}</p></div>
                                        <div className="rounded-md border bg-background/80 px-3 py-2"><p className="text-xs text-muted-foreground">Remaining</p><p className="text-lg font-semibold text-amber-700">{formatQuantity(totalRemaining)}</p></div>
                                    </div>
                                    {(isStarted || isPendingQa) && (
                                        <p className="mt-3 text-sm font-semibold text-primary">Current receipt quantity: {formatQuantity(totalEntered)}{isPendingQa ? " · Awaiting QA" : " · Draft"}</p>
                                    )}
                                </div>

                                <div className="grid gap-4 md:grid-cols-3">
                                    <div className="space-y-2">
                                        <Label htmlFor="modal-receipt-number">Receipt Number</Label>
                                        <Input id="modal-receipt-number" value={receiptNumber} onChange={event => setReceiptNumber(event.target.value)} disabled={!isStarted || actionBusy} placeholder="Enter receipt number" />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="modal-receipt-date">Date of Receipt</Label>
                                        <Input id="modal-receipt-date" type="date" value={receiptDate} onChange={event => setReceiptDate(event.target.value)} disabled={!isStarted || actionBusy} />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="modal-receipt-type">Quantity Status</Label>
                                        <select id="modal-receipt-type" value={receiptType} onChange={event => setReceiptType(event.target.value as "full" | "partial")} disabled={!isStarted || actionBusy} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                            <option value="full">Full receipt</option>
                                            <option value="partial">Partial receipt</option>
                                        </select>
                                    </div>
                                </div>

                                <Separator />
                                <div className="flex items-end justify-between gap-3">
                                    <div>
                                        <h4 className="font-semibold">Purchase-order lines</h4>
                                        <p className="text-sm text-muted-foreground">{receiptType === "partial" ? "Partial receipt quantities cannot exceed each line’s remaining balance." : "Quantities are compared with the unreceived balance. Full-receipt overages are allowed and flagged for review."}</p>
                                    </div>
                                    <div className="text-right text-sm">
                                        <p className="text-muted-foreground">Entered quantity</p>
                                        <p className="font-semibold">{totalEntered.toLocaleString()} units</p>
                                    </div>
                                </div>

                                {overReceivingLines.length > 0 && (
                                    <Alert className={hasPartialReceiptValidationErrors ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-amber-300 bg-amber-50 text-amber-950"}>
                                        <AlertTriangle className={`h-4 w-4 ${hasPartialReceiptValidationErrors ? "text-destructive" : "text-amber-600"}`} />
                                        <AlertTitle>{hasPartialReceiptValidationErrors ? "Partial receipt quantity exceeds remaining" : "Over-receiving notice"}</AlertTitle>
                                        <AlertDescription>{hasPartialReceiptValidationErrors ? `Reduce quantities by ${formatQuantity(overReceivingQuantity)} units before sending this receipt to QA. You can still save the draft.` : `${formatQuantity(overReceivingQuantity)} units above the unreceived balance will be recorded and flagged for review. You can still submit this receipt.`}</AlertDescription>
                                    </Alert>
                                )}

                                <div className="overflow-x-auto rounded-lg border">
                                    <table className="w-full min-w-[760px] text-sm">
                                        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                            <tr>
                                                <th className="px-4 py-3">Product</th>
                                                <th className="px-4 py-3 text-right">Ordered</th>
                                                <th className="px-4 py-3 text-right">Previously received</th>
                                                <th className="px-4 py-3 text-right">Remaining</th>
                                                <th className="w-44 px-4 py-3">Receiving quantity</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {selectedLines.map(line => {
                                                const entered = Math.max(0, Number(quantities[line.lineId] || 0));
                                                const overage = Math.max(0, entered - line.allowableQuantity);
                                                const partialOverage = isStarted && receiptType === "partial" && isReceiptQuantityOverRemaining(entered, line.allowableQuantity);
                                                return (
                                                    <tr key={line.lineId}>
                                                        <td className="px-4 py-3">
                                                            <p className="font-medium">{line.productName}</p>
                                                            <p className="text-xs text-muted-foreground">{line.productCode || `Line ${line.lineId}`}</p>
                                                        </td>
                                                        <td className="px-4 py-3 text-right">{line.orderedQuantity.toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-right">{line.previouslyReceivedQuantity.toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-right font-medium">{line.allowableQuantity.toLocaleString()}</td>
                                                        <td className="px-4 py-3">
                                                            <div className="space-y-2">
                                                                <Input
                                                                    type="number"
                                                                    min="0"
                                                                    step="any"
                                                                    value={quantities[line.lineId] ?? ""}
                                                                    onChange={event => updateQuantity(line.lineId, event.target.value)}
                                                                    disabled={!isStarted || actionBusy}
                                                                    aria-label={`Receiving quantity for ${line.productName}`}
                                                                    aria-invalid={partialOverage}
                                                                    className={partialOverage ? "border-destructive focus-visible:ring-destructive" : overage > 1e-9 ? "border-amber-400 focus-visible:ring-amber-400" : undefined}
                                                                />
                                                                {partialOverage ? (
                                                                    <p role="alert" className="flex items-start gap-1 text-xs font-medium leading-4 text-destructive">
                                                                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                                        Cannot exceed the remaining quantity of {formatQuantity(line.allowableQuantity)} units.
                                                                    </p>
                                                                ) : overage > 1e-9 && (
                                                                    <p role="status" className="flex items-start gap-1 text-xs font-medium leading-4 text-amber-700">
                                                                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                                                        Exceeds ordered quantity by +{formatQuantity(overage)} units
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {selectedOrder.receiptHistory.length > 0 && (
                                    <div data-testid="warehouse-receipt-history" className="rounded-lg border bg-background">
                                        <div className="flex flex-col gap-1 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <h4 className="font-semibold">Receipt history</h4>
                                                <p className="text-sm text-muted-foreground">Each receipt shows the quantity received for this purchase order and its product lines.</p>
                                            </div>
                                            <span className="text-xs font-semibold text-muted-foreground">Read-only history</span>
                                        </div>
                                        <div className="space-y-3 p-4">
                                            {selectedOrder.receiptHistory.map(receipt => (
                                                <div key={`${receipt.id ?? receipt.receiptNumber}-${receipt.receiptDate ?? "undated"}`} className="rounded-md border bg-muted/10 p-3">
                                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                        <div>
                                                            <p className="font-semibold">Receipt {receipt.receiptNumber}</p>
                                                            <p className="text-xs text-muted-foreground">{formatDate(receipt.receiptDate)}{receipt.receiptType ? ` · ${receipt.receiptType}` : ""}</p>
                                                        </div>
                                                        <div className="flex items-center gap-3 sm:text-right">
                                                            <Badge variant="outline" className={receiptHistoryStatusClass(receipt.status)}>{receipt.status}</Badge>
                                                            <div><p className="text-xs text-muted-foreground">Amount received</p><p className="font-semibold">{formatQuantity(receipt.totalReceivedQuantity)} units</p></div>
                                                        </div>
                                                    </div>
                                                    {receipt.lines.length > 0 && (
                                                        <div className="mt-3 overflow-x-auto rounded-md border bg-background">
                                                            <table className="w-full min-w-[560px] text-sm">
                                                                <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                                                    <tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Code</th><th className="px-3 py-2 text-right">Received</th></tr>
                                                                </thead>
                                                                <tbody className="divide-y">
                                                                    {receipt.lines.map(line => (
                                                                        <tr key={`${receipt.id ?? receipt.receiptNumber}-${line.lineId}`}>
                                                                            <td className="px-3 py-2 font-medium">{line.productName}</td>
                                                                            <td className="px-3 py-2 text-muted-foreground">{line.productCode || `Line ${line.lineId}`}</td>
                                                                            <td className="px-3 py-2 text-right font-semibold">{formatQuantity(line.receivedQuantity)}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Sidebar Action Card */}
                            <Card className="h-fit">
                                <CardHeader><CardTitle>Workflow action</CardTitle></CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="space-y-3 text-sm">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-4 w-4" /></span>
                                            <div><p className="font-medium">Approved</p><p className="text-xs text-muted-foreground">Finance approval complete</p></div>
                                        </div>
                                        <div className={`flex items-center gap-3 ${isStarted || isPendingQa ? "text-foreground" : "text-muted-foreground"}`}>
                                            <span className={`flex h-7 w-7 items-center justify-center rounded-full ${isStarted || isPendingQa ? "bg-primary text-primary-foreground" : "bg-muted"}`}>2</span>
                                            <div><p className="font-medium">Warehouse Receiving</p><p className="text-xs text-muted-foreground">Confirm physical quantities</p></div>
                                        </div>
                                        <div className={`flex items-center gap-3 ${isPendingQa ? "text-foreground" : "text-muted-foreground"}`}>
                                            <span className={`flex h-7 w-7 items-center justify-center rounded-full ${isPendingQa ? "bg-amber-500 text-white" : "bg-muted"}`}>3</span>
                                            <div><p className="font-medium">Receiving QA</p><p className="text-xs">Lot and quality inspection</p></div>
                                        </div>
                                    </div>
                                    <Separator />
                                    {overReceivingLines.length > 0 && (
                                        hasPartialReceiptValidationErrors
                                            ? <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">Correct the partial quantities above the remaining balance before sending to QA. Draft saving remains available.</p>
                                            : <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">This full receipt contains an over-receipt. Submission is allowed, and the excess will be visible for review.</p>
                                    )}
                                    {isContinuation && !hasRemainingQuantity && (
                                        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">This purchase order has no remaining quantity available for another warehouse receipt.</p>
                                    )}
                                    {isReceived ? (
                                        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs leading-5 text-emerald-800">Warehouse receiving is complete for this purchase order.</p>
                                    ) : isPendingQa ? (
                                        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs leading-5 text-amber-800">QA must post this receipt before the next warehouse receipt can be started.</p>
                                    ) : !isStarted ? (
                                        <Button className="w-full" onClick={() => void start()} disabled={actionBusy || (isContinuation && !hasRemainingQuantity)} title={isContinuation && !hasRemainingQuantity ? "No remaining quantity is available for another warehouse receipt." : undefined}>
                                            {submitting === "start" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                            <PackageCheck className="mr-2 h-4 w-4" /> {isContinuation ? "Start Next Warehouse Receipt" : "Start Warehouse Receiving"}
                                        </Button>
                                    ) : (
                                        <>
                                            <Button variant="outline" className="w-full" onClick={() => void saveDraft()} disabled={actionBusy}>
                                                {submitting === "save_draft" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Draft
                                            </Button>
                                            {selectedOrder.draft && (
                                                <Button variant="outline" className="w-full" onClick={() => void printSummary()} disabled={actionBusy}>
                                                    {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />} Print Receiving Summary
                                                </Button>
                                            )}
                                            <Button className="w-full" onClick={() => void submitToQa()} disabled={actionBusy || hasPartialReceiptValidationErrors} title={hasPartialReceiptValidationErrors ? "Correct partial receipt quantities above the remaining balance before submitting." : undefined}>
                                                {submitting === "submit_to_qa" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                <ClipboardCheck className="mr-2 h-4 w-4" /> Complete &amp; Send to QA
                                            </Button>
                                        </>
                                    )}
                                    <p className="text-center text-xs leading-5 text-muted-foreground">{isPendingQa ? "The receipt is locked while QA completes inspection." : "Sending to QA locks this warehouse receipt and makes it available in QA Receiving."}</p>
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
