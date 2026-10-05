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
    loading: boolean;
    error: string | null;
    submitting: string | null;
    printing: boolean;
    updateQuantity: (lineId: number, value: string) => void;
    setReceiptNumber: (value: string) => void;
    setReceiptDate: (value: string) => void;
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
    loading,
    error,
    submitting,
    printing,
    updateQuantity,
    setReceiptNumber,
    setReceiptDate,
    start,
    saveDraft,
    submitToQa,
    printSummary
}: WarehouseReceivingDetailModalProps) {
    if (!isOpen) return null;

    const isStarted = selectedOrder?.status === "Warehouse Receiving";
    const isPendingQa = selectedOrder?.status === "QA Receiving";
    const isReceived = selectedOrder?.status === "Received";
    const hasRemainingQuantity = selectedLines.some(line => line.remainingQuantity > 1e-9);
    const actionBusy = submitting !== null || printing;
    const totalEntered = selectedLines.reduce((sum, line) => sum + Math.max(0, Number(quantities[line.lineId] || 0)), 0);
    const overReceivingLines = selectedLines.filter(line => isReceiptQuantityOverRemaining(Math.max(0, Number(quantities[line.lineId] || 0)), line.allowableQuantity));
    const overReceivingQuantity = overReceivingLines.reduce((sum, line) => sum + Math.max(0, Number(quantities[line.lineId] || 0) - line.allowableQuantity), 0);
    const totalOrdered = selectedLines.reduce((sum, line) => sum + Math.max(0, line.orderedQuantity), 0);
    const totalReceivedToDate = selectedLines.reduce((sum, line) => sum + Math.max(0, line.previouslyReceivedQuantity), 0);
    const totalRemaining = selectedLines.reduce((sum, line) => sum + Math.max(0, line.remainingQuantity), 0);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 sm:p-6 backdrop-blur-xs">
            <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl border bg-background shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="flex items-center justify-between border-b bg-muted/30 px-6 py-4">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h2 className="text-base font-black tracking-tight text-foreground">
                                Warehouse Receiving · {selectedOrder ? (selectedOrder.poNumber || `PO #${selectedOrder.id}`) : "Loading..."}
                            </h2>
                            {selectedOrder && (
                                <Badge variant="outline" className={statusClass(selectedOrder.status)}>
                                    {statusLabel(selectedOrder.status)}
                                </Badge>
                            )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Confirm physical receiving quantities, record receipt details, and submit to QA Receiving.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        aria-label="Close warehouse receiving modal"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-6">
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
                        <div className="space-y-6">
                            {/* Order & Workflow Status Summary */}
                            <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-start sm:justify-between">
                                <div className="space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-base font-bold text-foreground">{selectedOrder.poNumber}</h3>
                                        <Badge variant="outline" className={statusClass(selectedOrder.status)}>
                                            {statusLabel(selectedOrder.status)}
                                        </Badge>
                                    </div>
                                    {selectedOrder.referenceNumber && (
                                        <p className="text-xs text-muted-foreground">Ref: {selectedOrder.referenceNumber}</p>
                                    )}
                                    <p className="text-sm text-muted-foreground">
                                        {selectedOrder.supplierName} · Receiving branch: {selectedOrder.branch.name} {selectedOrder.branch.code ? `(${selectedOrder.branch.code})` : ""}
                                    </p>
                                    {/* Workflow Stage Tracker */}
                                    <div className="pt-2 flex flex-wrap items-center gap-2 text-xs">
                                        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50/80 px-2.5 py-1 text-emerald-800 font-medium">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> 1. Approved
                                        </span>
                                        <span className="text-muted-foreground">→</span>
                                        <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium ${isStarted ? "border border-primary/30 bg-primary/10 text-primary font-semibold" : "border bg-muted/40 text-muted-foreground"}`}>
                                            2. Warehouse Receiving
                                        </span>
                                        <span className="text-muted-foreground">→</span>
                                        <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium ${isPendingQa ? "border border-amber-300 bg-amber-50 text-amber-800 font-semibold" : "border bg-muted/40 text-muted-foreground"}`}>
                                            3. QA Receiving
                                        </span>
                                    </div>
                                </div>
                                <div className="text-left sm:text-right shrink-0">
                                    <p className="text-xs text-muted-foreground">PHP total</p>
                                    <p className="text-lg font-bold text-foreground">{formatAmount(selectedOrder.totalPhpAmount, "PHP")}</p>
                                    {foreignTotal(selectedOrder) && (
                                        <p className="text-xs text-muted-foreground">{selectedOrder.currencyCode} {foreignTotal(selectedOrder)}</p>
                                    )}
                                </div>
                            </div>

                            {/* Status Context Banner */}
                            {isReceived ? (
                                <Alert className="border-emerald-300 bg-emerald-50 text-emerald-950">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                                    <AlertTitle>Purchase order fully received</AlertTitle>
                                    <AlertDescription>
                                        This purchase order is complete and is shown for receipt history and reference. No additional warehouse receipt can be started.
                                    </AlertDescription>
                                </Alert>
                            ) : (
                                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-900">
                                    <div className="flex items-start gap-3">
                                        <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" />
                                        <div>
                                            <p className="font-semibold text-blue-950">Physical quantity confirmation</p>
                                            <p className="mt-0.5 text-xs text-blue-800">
                                                Enter the physical quantities received at the warehouse. Lot allocation, expiration dates, and QA disposition are completed in QA Receiving.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* PO Receiving Progress Summary */}
                            <div data-testid="warehouse-receiving-progress" className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <h4 className="font-semibold text-primary">PO receiving progress</h4>
                                        <p className="text-xs text-muted-foreground">Tracks all physical receipts recorded at the warehouse towards the PO ordered total.</p>
                                    </div>
                                    {selectedOrder.receiptHistory.length > 0 && (
                                        <span className="text-xs font-semibold text-muted-foreground">
                                            {selectedOrder.receiptHistory.length} receipt{selectedOrder.receiptHistory.length === 1 ? "" : "s"} recorded
                                        </span>
                                    )}
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    <div className="rounded-md border bg-background/90 px-3 py-2">
                                        <p className="text-xs text-muted-foreground">Ordered</p>
                                        <p className="text-base font-semibold">{formatQuantity(totalOrdered)}</p>
                                    </div>
                                    <div className="rounded-md border bg-background/90 px-3 py-2">
                                        <p className="text-xs text-muted-foreground">Received to date</p>
                                        <p className="text-base font-semibold text-emerald-700">{formatQuantity(totalReceivedToDate)}</p>
                                    </div>
                                    <div className="rounded-md border bg-background/90 px-3 py-2">
                                        <p className="text-xs text-muted-foreground">Remaining</p>
                                        <p className="text-base font-semibold text-amber-700">{formatQuantity(totalRemaining)}</p>
                                    </div>
                                </div>
                                {isStarted && (
                                    <p className="mt-3 text-xs font-semibold text-primary">
                                        Current receipt quantity: {formatQuantity(totalEntered)} · Draft
                                    </p>
                                )}
                            </div>

                            {/* Receipt Details Form */}
                            <div className="grid gap-4 sm:grid-cols-2">
                                <div className="space-y-1.5">
                                    <Label htmlFor="modal-receipt-number" className="text-xs font-medium">Receipt Number</Label>
                                    <Input
                                        id="modal-receipt-number"
                                        value={receiptNumber}
                                        onChange={event => setReceiptNumber(event.target.value)}
                                        disabled={!isStarted || actionBusy}
                                        placeholder="Enter receipt number"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="modal-receipt-date" className="text-xs font-medium">Date of Receipt</Label>
                                    <Input
                                        id="modal-receipt-date"
                                        type="date"
                                        value={receiptDate}
                                        onChange={event => setReceiptDate(event.target.value)}
                                        disabled={!isStarted || actionBusy}
                                    />
                                </div>
                            </div>

                            <Separator />

                            {/* Purchase Order Lines Table Section */}
                            <div className="space-y-3">
                                <div className="flex items-end justify-between gap-3">
                                    <div>
                                        <h4 className="font-semibold text-sm">Purchase-order lines</h4>
                                        <p className="text-xs text-muted-foreground">
                                            Confirm received quantities per item. Overages are flagged for review.
                                        </p>
                                    </div>
                                    <div className="text-right text-xs">
                                        <p className="text-muted-foreground">Entered quantity</p>
                                        <p className="font-semibold text-foreground">{totalEntered.toLocaleString()} units</p>
                                    </div>
                                </div>

                                {overReceivingLines.length > 0 && (
                                    <Alert className="border-amber-300 bg-amber-50 text-amber-950">
                                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                                        <AlertTitle>Over-receiving notice</AlertTitle>
                                        <AlertDescription>
                                            {formatQuantity(overReceivingQuantity)} units above the unreceived balance will be recorded and flagged for QA review.
                                        </AlertDescription>
                                    </Alert>
                                )}

                                <div className="overflow-x-auto rounded-lg border">
                                    <table className="w-full min-w-[720px] text-sm">
                                        <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                            <tr>
                                                <th className="px-4 py-3">Product</th>
                                                <th className="px-4 py-3 text-right">Ordered</th>
                                                <th className="px-4 py-3 text-right">Previously received</th>
                                                <th className="px-4 py-3 text-right">Remaining</th>
                                                <th className="w-48 px-4 py-3">Receiving quantity</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {selectedLines.map(line => {
                                                const entered = Math.max(0, Number(quantities[line.lineId] || 0));
                                                const overage = Math.max(0, entered - line.allowableQuantity);
                                                return (
                                                    <tr key={line.lineId}>
                                                        <td className="px-4 py-3">
                                                            <p className="font-medium text-foreground">{line.productName}</p>
                                                            <p className="text-xs text-muted-foreground">{line.productCode || `Line ${line.lineId}`}</p>
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-muted-foreground">{line.orderedQuantity.toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-right text-muted-foreground">{line.previouslyReceivedQuantity.toLocaleString()}</td>
                                                        <td className="px-4 py-3 text-right font-medium text-foreground">{line.allowableQuantity.toLocaleString()}</td>
                                                        <td className="px-4 py-3">
                                                            <div className="space-y-1.5">
                                                                <Input
                                                                    type="number"
                                                                    min="0"
                                                                    step="any"
                                                                    value={quantities[line.lineId] ?? ""}
                                                                    onChange={event => updateQuantity(line.lineId, event.target.value)}
                                                                    disabled={!isStarted || actionBusy}
                                                                    aria-label={`Receiving quantity for ${line.productName}`}
                                                                    className={overage > 1e-9 ? "border-amber-400 focus-visible:ring-amber-400" : undefined}
                                                                />
                                                                {overage > 1e-9 && (
                                                                    <p role="status" className="flex items-start gap-1 text-[11px] font-medium leading-4 text-amber-700">
                                                                        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                                                        +{formatQuantity(overage)} units over remaining
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
                            </div>

                            {/* Receipt History Section */}
                            {selectedOrder.receiptHistory.length > 0 && (
                                <div data-testid="warehouse-receipt-history" className="rounded-lg border bg-background">
                                    <div className="flex flex-col gap-1 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div>
                                            <h4 className="font-semibold text-sm">Receipt history</h4>
                                            <p className="text-xs text-muted-foreground">Historical records of recorded warehouse receipts for this purchase order.</p>
                                        </div>
                                        <span className="text-xs font-semibold text-muted-foreground">Read-only history</span>
                                    </div>
                                    <div className="space-y-3 p-4">
                                        {selectedOrder.receiptHistory.map(receipt => (
                                            <div key={`${receipt.id ?? receipt.receiptNumber}-${receipt.receiptDate ?? "undated"}`} className="rounded-md border bg-muted/10 p-3">
                                                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                                    <div>
                                                        <p className="font-semibold text-sm">Receipt {receipt.receiptNumber}</p>
                                                        <p className="text-xs text-muted-foreground">{formatDate(receipt.receiptDate)}</p>
                                                    </div>
                                                    <div className="flex items-center gap-3 sm:text-right">
                                                        <Badge variant="outline" className={receiptHistoryStatusClass(receipt.status)}>{receipt.status}</Badge>
                                                        <div>
                                                            <p className="text-xs text-muted-foreground">Amount received</p>
                                                            <p className="font-semibold text-sm">{formatQuantity(receipt.totalReceivedQuantity)} units</p>
                                                        </div>
                                                    </div>
                                                </div>
                                                {receipt.lines.length > 0 && (
                                                    <div className="mt-3 overflow-x-auto rounded-md border bg-background">
                                                        <table className="w-full min-w-[500px] text-xs">
                                                            <thead className="bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
                                                                <tr>
                                                                    <th className="px-3 py-2">Product</th>
                                                                    <th className="px-3 py-2">Code</th>
                                                                    <th className="px-3 py-2 text-right">Received</th>
                                                                </tr>
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
                    )}
                </div>

                {/* Modal Footer Actions */}
                {!loading && !error && selectedOrder && (
                    <div className="border-t bg-muted/20 px-6 py-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <Button variant="outline" onClick={onClose} disabled={actionBusy}>
                            Close
                        </Button>
                        <div className="flex flex-wrap items-center gap-2">
                            {isReceived || !hasRemainingQuantity ? (
                                <span className="text-xs font-medium text-emerald-700">
                                    Warehouse receiving is complete for this PO.
                                </span>
                            ) : !isStarted ? (
                                <Button
                                    onClick={() => void start()}
                                    disabled={actionBusy || !hasRemainingQuantity}
                                    title={!hasRemainingQuantity ? "No remaining quantity is available for another warehouse receipt." : undefined}
                                >
                                    {submitting === "start" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <PackageCheck className="mr-2 h-4 w-4" /> {selectedOrder.receiptHistory.length > 0 ? "Start Next Warehouse Receipt" : "Start Warehouse Receiving"}
                                </Button>
                            ) : (
                                <>
                                    {selectedOrder.draft && (
                                        <Button variant="outline" onClick={() => void printSummary()} disabled={actionBusy}>
                                            {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />} Print Summary
                                        </Button>
                                    )}
                                    <Button variant="outline" onClick={() => void saveDraft()} disabled={actionBusy}>
                                        {submitting === "save_draft" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Draft
                                    </Button>
                                    <Button onClick={() => void submitToQa()} disabled={actionBusy}>
                                        {submitting === "submit_to_qa" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        <ClipboardCheck className="mr-2 h-4 w-4" /> Complete &amp; Send to QA
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
