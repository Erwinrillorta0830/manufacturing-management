"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Loader2, PackageCheck, Printer, RefreshCw, Search, Warehouse } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useWarehouseReceiving } from "./hooks/useWarehouseReceiving";
import { isReceiptQuantityOverRemaining } from "./quantity-validation";
import WarehouseReceivingDetailModal from "./components/WarehouseReceivingDetailModal";

function formatAmount(value: number | null, currency: string) {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(Number.isFinite(value || 0) ? value || 0 : 0);
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

function primaryTotal(order: { currencyCode: string; totalPhpAmount: number; totalForeignAmount: number | null }) {
    return order.currencyCode !== "PHP" && order.totalForeignAmount !== null
        ? formatAmount(order.totalForeignAmount, order.currencyCode)
        : formatAmount(order.totalPhpAmount, "PHP");
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

interface WarehouseReceivingModuleProps {
    mode?: "queue" | "detail";
    purchaseOrderId?: number;
}

export default function WarehouseReceivingModule({ mode = "queue", purchaseOrderId }: WarehouseReceivingModuleProps) {
    const router = useRouter();
    const isDetailMode = mode === "detail";
    const {
        orders,
        selectedOrder,
        selectedLines,
        quantities,
        receiptNumber,
        receiptDate,
        search,
        supplierId,
        dateFrom,
        dateTo,
        status,
        supplierOptions,
        page,
        total,
        totalPages,
        loading,
        detailLoading,
        error,
        detailError,
        submitting,
        printing,
        setSearch,
        setSupplierId,
        setDateFrom,
        setDateTo,
        setStatus,
        setPage,
        updateQuantity,
        setReceiptNumber,
        setReceiptDate,
        start,
        saveDraft,
        submitToQa,
        printSummary,
        retryQueue,
        clearSelection,
        selectOrder
    } = useWarehouseReceiving({ mode, purchaseOrderId });

    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

    const handleOpenOrder = async (order: (typeof orders)[number]) => {
        setIsDetailModalOpen(true);
        await selectOrder(order);
    };

    const handleCloseModal = () => {
        setIsDetailModalOpen(false);
        clearSelection();
    };

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
    const supplierFilterOptions = [{ value: "", label: "All suppliers" }, ...supplierOptions.map(option => ({ value: String(option.id), label: option.name }))];

    return (
        <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-5">
            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Warehouse className="h-6 w-6" /></div>
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Procurement &amp; Inbound</p>
                        <h1 className="text-2xl font-bold tracking-tight">Warehouse Receiving</h1>
                        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                            Confirm physical quantities before the receipt is handed to QA Receiving for lot, batch, and quality inspection.
                        </p>
                    </div>
                </div>
                {(selectedOrder || isDetailMode) && (
                    <Button variant="outline" onClick={() => isDetailMode ? router.push("/mm/warehouse-receiving") : clearSelection()} disabled={actionBusy}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to queue
                    </Button>
                )}
            </div>

            {!isDetailMode && !selectedOrder ? (
                <Card>
                    <CardHeader className="gap-5 border-b">
                        <div>
                            <CardTitle>Orders ready for warehouse receiving</CardTitle>
                            <p className="mt-1 text-sm text-muted-foreground">Start a warehouse receipt for an approved purchase order, continue a partially received order, or inspect a receipt awaiting QA.</p>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                            <div className="space-y-1.5 xl:col-span-2">
                                <Label htmlFor="warehouse-search">Search</Label>
                                <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input id="warehouse-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search PO, supplier, or remarks..." className="pl-9" aria-label="Search purchase orders" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Supplier</Label>
                                <SearchableSelect options={supplierFilterOptions} value={supplierId} onValueChange={setSupplierId} placeholder="All suppliers" />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="approved-date-from">Date approved from</Label>
                                <Input id="approved-date-from" type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="approved-date-to">Date approved to</Label>
                                <Input id="approved-date-to" type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="warehouse-status">Status</Label>
                                <select id="warehouse-status" value={status} onChange={event => setStatus(event.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                                    <option value="ALL">All statuses</option>
                                    <option value="Approved">Approved</option>
                                    <option value="Partially Received">Partially Received</option>
                                    <option value="Warehouse Receiving">Warehouse Receiving</option>
                                    <option value="QA Receiving">QA Receiving</option>
                                    <option value="Received">Received</option>
                                </select>
                            </div>
                        </div>
                        {(search || supplierId || dateFrom || dateTo || status !== "ALL") && (
                            <div className="flex justify-end">
                                <Button type="button" variant="ghost" size="sm" onClick={() => { setSearch(""); setSupplierId(""); setDateFrom(""); setDateTo(""); setStatus("ALL"); }}>
                                    Clear filters
                                </Button>
                            </div>
                        )}
                    </CardHeader>
                    <CardContent className="p-0">
                        {error && (
                            <Alert variant="destructive" className="m-5">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Unable to load Warehouse Receiving</AlertTitle>
                                <AlertDescription className="flex flex-wrap items-center gap-3">
                                    {error}
                                    <Button size="sm" variant="outline" onClick={retryQueue}><RefreshCw className="mr-2 h-4 w-4" /> Retry</Button>
                                </AlertDescription>
                            </Alert>
                        )}
                        {loading ? (
                            <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading purchase orders...</div>
                        ) : orders.length === 0 ? (
                            <div className="flex min-h-56 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
                                <PackageCheck className="h-8 w-8" />
                                <p className="font-medium">No purchase orders are ready for warehouse receiving.</p>
                                <p className="text-sm">Finance-approved purchase orders will appear here.</p>
                            </div>
                        ) : (
                            <div className="contents">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[1180px] text-sm">
                                    <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                                        <tr>
                                            <th className="px-4 py-3">PO Number</th>
                                            <th className="px-4 py-3">Supplier</th>
                                            <th className="px-4 py-3">Date Approved</th>
                                            <th className="px-4 py-3">Currency</th>
                                            <th className="px-4 py-3 text-right">Total Amount</th>
                                            <th className="max-w-64 px-4 py-3">Remarks</th>
                                            <th className="px-4 py-3">Inventory Status</th>
                                            <th className="px-4 py-3 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {orders.map(order => (
                                            <tr key={order.id} className="transition-colors hover:bg-muted/30">
                                                <td className="whitespace-nowrap px-4 py-4 font-semibold">
                                                    {order.poNumber}
                                                    {order.referenceNumber && <span className="block text-xs font-normal text-muted-foreground">Ref: {order.referenceNumber}</span>}
                                                </td>
                                                <td className="max-w-56 px-4 py-4"><span className="block truncate" title={order.supplierName}>{order.supplierName}</span></td>
                                                <td className="whitespace-nowrap px-4 py-4">{formatDate(order.dateApproved)}</td>
                                                <td className="whitespace-nowrap px-4 py-4"><span className="font-medium">{order.currencyCode}</span>{order.currencyCode !== "PHP" && <span className="block text-xs text-muted-foreground">Base PHP</span>}</td>
                                                <td className="whitespace-nowrap px-4 py-4 text-right"><span className="font-medium">{primaryTotal(order)}</span>{order.currencyCode !== "PHP" && <span className="block text-xs text-muted-foreground">{formatAmount(order.totalPhpAmount, "PHP")} base</span>}</td>
                                                <td className="max-w-64 px-4 py-4"><span className="block truncate text-muted-foreground" title={order.remarks || undefined}>{order.remarks || "-"}</span></td>
                                                <td className="px-4 py-4"><Badge variant="outline" className={statusClass(order.status)}>{statusLabel(order.status)}</Badge></td>
                                                <td className="px-4 py-4 text-right"><Button size="sm" variant={order.status === "Received" ? "outline" : "default"} onClick={() => void handleOpenOrder(order)}>{order.status === "Received" ? "View" : "Open"}</Button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            </div>
                        )}
                        <div className="flex flex-col gap-3 border-t p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                            <span>{total === 0 ? "No records" : `Showing ${(page - 1) * 25 + 1}–${Math.min(page * 25, total)} of ${total}`}</span>
                            <div className="flex items-center gap-2">
                                <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Previous</Button>
                                <span className="min-w-20 text-center">Page {page} of {totalPages}</span>
                                <Button size="sm" variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage(page + 1)}>Next</Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ) : detailLoading || (isDetailMode && !selectedOrder && !detailError) ? (
                <Card><CardContent className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading purchase order...</CardContent></Card>
            ) : detailError ? (
                <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Unable to open purchase order</AlertTitle><AlertDescription>{detailError}</AlertDescription></Alert>
            ) : !selectedOrder ? (
                <Card><CardContent className="flex min-h-72 items-center justify-center text-sm text-muted-foreground">Purchase order not found.</CardContent></Card>
            ) : (
                <Card className="min-w-0">
                    <CardHeader className="border-b">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <CardTitle>{selectedOrder.poNumber}</CardTitle>
                                    <Badge variant="outline" className={statusClass(selectedOrder.status)}>{statusLabel(selectedOrder.status)}</Badge>
                                </div>
                                {selectedOrder.referenceNumber && <p className="text-xs text-muted-foreground">Ref: {selectedOrder.referenceNumber}</p>}
                                <p className="text-sm text-muted-foreground">{selectedOrder.supplierName} · Receiving branch: {selectedOrder.branch.name} {selectedOrder.branch.code ? `(${selectedOrder.branch.code})` : ""}</p>
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
                            <div className="text-left sm:text-right"><p className="text-xs text-muted-foreground">PHP total</p><p className="text-lg font-bold">{formatAmount(selectedOrder.totalPhpAmount, "PHP")}</p>{foreignTotal(selectedOrder) && <p className="text-xs text-muted-foreground">{selectedOrder.currencyCode} {foreignTotal(selectedOrder)}</p>}</div>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-6 p-6">
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
                                <div className="flex items-start gap-3"><ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" /><div><p className="font-semibold text-blue-950">Physical quantity confirmation</p><p className="mt-0.5 text-xs text-blue-800">Enter the physical quantities received at the warehouse. Lot allocation, expiration dates, and QA disposition are completed in QA Receiving.</p></div></div>
                            </div>
                        )}

                        <div data-testid="warehouse-receiving-progress" className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <h2 className="font-semibold text-primary">PO receiving progress</h2>
                                    <p className="text-xs text-muted-foreground">Tracks all physical receipts recorded at the warehouse towards the PO ordered total.</p>
                                </div>
                                {selectedOrder.receiptHistory.length > 0 && (
                                    <span className="text-xs font-semibold text-muted-foreground">
                                        {selectedOrder.receiptHistory.length} receipt{selectedOrder.receiptHistory.length === 1 ? "" : "s"} recorded
                                    </span>
                                )}
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                                <div className="rounded-md border bg-background/90 px-3 py-2"><p className="text-xs text-muted-foreground">Ordered</p><p className="text-base font-semibold">{formatQuantity(totalOrdered)}</p></div>
                                <div className="rounded-md border bg-background/90 px-3 py-2"><p className="text-xs text-muted-foreground">Received to date</p><p className="text-base font-semibold text-emerald-700">{formatQuantity(totalReceivedToDate)}</p></div>
                                <div className="rounded-md border bg-background/90 px-3 py-2"><p className="text-xs text-muted-foreground">Remaining</p><p className="text-base font-semibold text-amber-700">{formatQuantity(totalRemaining)}</p></div>
                            </div>
                            {isStarted && (
                                <p className="mt-3 text-xs font-semibold text-primary">Current receipt quantity: {formatQuantity(totalEntered)} · Draft</p>
                            )}
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-1.5"><Label htmlFor="receipt-number" className="text-xs font-medium">Receipt Number</Label><Input id="receipt-number" value={receiptNumber} onChange={event => setReceiptNumber(event.target.value)} disabled={!isStarted || actionBusy} placeholder="Enter receipt number" /></div>
                            <div className="space-y-1.5"><Label htmlFor="receipt-date" className="text-xs font-medium">Date of Receipt</Label><Input id="receipt-date" type="date" value={receiptDate} onChange={event => setReceiptDate(event.target.value)} disabled={!isStarted || actionBusy} /></div>
                        </div>

                        <Separator />
                        <div className="space-y-3">
                            <div className="flex items-end justify-between gap-3">
                                <div>
                                    <h2 className="font-semibold text-sm">Purchase-order lines</h2>
                                    <p className="text-xs text-muted-foreground">Confirm received quantities per item. Overages are flagged for review.</p>
                                </div>
                                <div className="text-right text-xs"><p className="text-muted-foreground">Entered quantity</p><p className="font-semibold">{totalEntered.toLocaleString()} units</p></div>
                            </div>
                            {overReceivingLines.length > 0 && (
                                <Alert className="border-amber-300 bg-amber-50 text-amber-950">
                                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                                    <AlertTitle>Over-receiving notice</AlertTitle>
                                    <AlertDescription>{formatQuantity(overReceivingQuantity)} units above the unreceived balance will be recorded and flagged for QA review.</AlertDescription>
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
                                                        <p className="font-medium">{line.productName}</p>
                                                        <p className="text-xs text-muted-foreground">{line.productCode || `Line ${line.lineId}`}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-muted-foreground">{line.orderedQuantity.toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-right text-muted-foreground">{line.previouslyReceivedQuantity.toLocaleString()}</td>
                                                    <td className="px-4 py-3 text-right font-medium">{line.allowableQuantity.toLocaleString()}</td>
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

                        {selectedOrder.receiptHistory.length > 0 && (
                            <div data-testid="warehouse-receipt-history" className="rounded-lg border bg-background">
                                <div className="flex flex-col gap-1 border-b bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <h2 className="font-semibold text-sm">Receipt history</h2>
                                        <p className="text-xs text-muted-foreground">Historical records of previously posted warehouse receipts for this purchase order.</p>
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
                                                    <div><p className="text-xs text-muted-foreground">Amount received</p><p className="font-semibold text-sm">{formatQuantity(receipt.totalReceivedQuantity)} units</p></div>
                                                </div>
                                            </div>
                                            {receipt.lines.length > 0 && (
                                                <div className="mt-3 overflow-x-auto rounded-md border bg-background">
                                                    <table className="w-full min-w-[500px] text-xs">
                                                        <thead className="bg-muted/40 text-left uppercase tracking-wide text-muted-foreground">
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

                        <div className="border-t pt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
                            {isReceived || !hasRemainingQuantity ? (
                                <span className="text-xs font-medium text-emerald-700">Warehouse receiving is complete for this PO.</span>
                            ) : !isStarted ? (
                                <Button onClick={() => void start()} disabled={actionBusy || !hasRemainingQuantity} title={!hasRemainingQuantity ? "No remaining quantity is available for another warehouse receipt." : undefined}>
                                    {submitting === "start" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <PackageCheck className="mr-2 h-4 w-4" /> {selectedOrder.receiptHistory.length > 0 ? "Start Next Warehouse Receipt" : "Start Warehouse Receiving"}
                                </Button>
                            ) : (
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button variant="outline" onClick={() => void saveDraft()} disabled={actionBusy}>
                                        {submitting === "save_draft" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Draft
                                    </Button>
                                    {selectedOrder.draft && (
                                        <Button variant="outline" onClick={() => void printSummary()} disabled={actionBusy}>
                                            {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />} Print Summary
                                        </Button>
                                    )}
                                    <Button onClick={() => void submitToQa()} disabled={actionBusy}>
                                        {submitting === "submit_to_qa" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        <ClipboardCheck className="mr-2 h-4 w-4" /> Complete &amp; Send to QA
                                    </Button>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {!isDetailMode && (
                <WarehouseReceivingDetailModal
                    isOpen={isDetailModalOpen}
                    onClose={handleCloseModal}
                    selectedOrder={selectedOrder}
                    selectedLines={selectedLines}
                    quantities={quantities}
                    receiptNumber={receiptNumber}
                    receiptDate={receiptDate}
                    loading={detailLoading}
                    error={detailError}
                    submitting={submitting}
                    printing={printing}
                    updateQuantity={updateQuantity}
                    setReceiptNumber={setReceiptNumber}
                    setReceiptDate={setReceiptDate}
                    start={start}
                    saveDraft={saveDraft}
                    submitToQa={submitToQa}
                    printSummary={printSummary}
                />
            )}
        </div>
    );
}
