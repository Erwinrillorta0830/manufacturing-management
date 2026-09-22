"use client";

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
    return status === "Approved"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-amber-200 bg-amber-50 text-amber-700";
}

export default function WarehouseReceivingModule() {
    const {
        orders,
        selectedOrder,
        selectedLines,
        quantities,
        receiptNumber,
        receiptDate,
        receiptType,
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
        selectOrder,
        updateQuantity,
        setReceiptNumber,
        setReceiptDate,
        setReceiptType,
        start,
        saveDraft,
        submitToQa,
        printSummary,
        retryQueue,
        clearSelection
    } = useWarehouseReceiving();

    const isStarted = selectedOrder?.status === "Warehouse Receiving";
    const isContinuation = selectedOrder?.status === "Partially Received";
    const isPendingQa = selectedOrder?.status === "Receiving (QA)";
    const hasRemainingQuantity = selectedLines.some(line => line.remainingQuantity > 1e-9);
    const actionBusy = submitting !== null || printing;
    const totalEntered = selectedLines.reduce((sum, line) => sum + Math.max(0, Number(quantities[line.lineId] || 0)), 0);
    const overReceivingLines = selectedLines.filter(line => Math.max(0, Number(quantities[line.lineId] || 0)) > line.allowableQuantity + 1e-9);
    const overReceivingQuantity = overReceivingLines.reduce((sum, line) => sum + Math.max(0, Number(quantities[line.lineId] || 0) - line.allowableQuantity), 0);
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
                {selectedOrder && (
                    <Button variant="outline" onClick={clearSelection} disabled={actionBusy}>
                        <ArrowLeft className="mr-2 h-4 w-4" /> Back to queue
                    </Button>
                )}
            </div>

            {!selectedOrder ? (
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
                                    <option value="Receiving (QA)">Receiving (QA)</option>
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
                                                <td className="px-4 py-4"><Badge variant="outline" className={statusClass(order.status)}>{order.status}</Badge></td>
                                                <td className="px-4 py-4 text-right"><Button size="sm" onClick={() => void selectOrder(order)}>Open</Button></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="hidden">
                                {orders.map(order => (
                                    <button
                                        key={order.id}
                                        type="button"
                                        onClick={() => void selectOrder(order)}
                                        className="flex w-full flex-col gap-3 p-5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:flex-row sm:items-center sm:justify-between"
                                    >
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-semibold">{order.poNumber}</span>
                                                <Badge variant="outline" className={statusClass(order.status)}>{order.status}</Badge>
                                            </div>
                                            {order.referenceNumber && <p className="mt-0.5 text-xs text-muted-foreground">Ref: {order.referenceNumber}</p>}
                                            <p className="mt-1 truncate text-sm text-muted-foreground">{order.supplierName} · {order.branch.name} {order.branch.code ? `(${order.branch.code})` : ""}</p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-6 text-sm">
                                            <div><p className="text-xs text-muted-foreground">Lines</p><p className="font-medium">{order.lines.length}</p></div>
                                            <div className="text-right"><p className="text-xs text-muted-foreground">PHP total</p><p className="font-medium">{formatAmount(order.totalPhpAmount, "PHP")}</p>{foreignTotal(order) && <p className="text-xs text-muted-foreground">{order.currencyCode} {foreignTotal(order)}</p>}</div>
                                            <span className="text-sm font-semibold text-primary">Open <span aria-hidden="true">→</span></span>
                                        </div>
                                    </button>
                                ))}
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
            ) : detailLoading ? (
                <Card><CardContent className="flex min-h-72 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading purchase order...</CardContent></Card>
            ) : detailError ? (
                <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Unable to open purchase order</AlertTitle><AlertDescription>{detailError}</AlertDescription></Alert>
            ) : (
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <Card className="min-w-0">
                        <CardHeader className="border-b">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2"><CardTitle>{selectedOrder.poNumber}</CardTitle><Badge variant="outline" className={statusClass(selectedOrder.status)}>{selectedOrder.status}</Badge></div>
                                    {selectedOrder.referenceNumber && <p className="mt-1 text-xs text-muted-foreground">Ref: {selectedOrder.referenceNumber}</p>}
                                    <p className="mt-1 text-sm text-muted-foreground">{selectedOrder.supplierName} · Receiving branch: {selectedOrder.branch.name} {selectedOrder.branch.code ? `(${selectedOrder.branch.code})` : ""}</p>
                                </div>
                                <div className="text-left sm:text-right"><p className="text-xs text-muted-foreground">PHP total</p><p className="font-semibold">{formatAmount(selectedOrder.totalPhpAmount, "PHP")}</p>{foreignTotal(selectedOrder) && <p className="text-xs text-muted-foreground">{selectedOrder.currencyCode} {foreignTotal(selectedOrder)}</p>}</div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6 p-5">
                            {isPendingQa ? (
                                <Alert className="border-amber-300 bg-amber-50 text-amber-950">
                                    <ClipboardCheck className="h-4 w-4 text-amber-700" />
                                    <AlertTitle>Partial receipt is awaiting QA</AlertTitle>
                                    <AlertDescription>
                                        This warehouse receipt has been submitted to QA Receiving. It is visible here for tracking but cannot be edited or followed by another warehouse receipt until QA posts it.
                                    </AlertDescription>
                                </Alert>
                            ) : (
                                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-900">
                                    <div className="flex items-start gap-3"><ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Warehouse quantity confirmation</p><p className="mt-1">Enter the physical quantities received. Lot, batch, expiration, and QA disposition are completed in the next QA Receiving step.</p></div></div>
                                </div>
                            )}

                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2"><Label htmlFor="receipt-number">Receipt Number</Label><Input id="receipt-number" value={receiptNumber} onChange={event => setReceiptNumber(event.target.value)} disabled={!isStarted || actionBusy} placeholder="Enter receipt number" /></div>
                                <div className="space-y-2"><Label htmlFor="receipt-date">Date of Receipt</Label><Input id="receipt-date" type="date" value={receiptDate} onChange={event => setReceiptDate(event.target.value)} disabled={!isStarted || actionBusy} /></div>
                                <div className="space-y-2"><Label htmlFor="receipt-type">Quantity Status</Label><select id="receipt-type" value={receiptType} onChange={event => setReceiptType(event.target.value as "full" | "partial")} disabled={!isStarted || actionBusy} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="full">Full receipt</option><option value="partial">Partial receipt</option></select></div>
                            </div>

                            <Separator />
                            <div className="flex items-end justify-between gap-3"><div><h2 className="font-semibold">Purchase-order lines</h2><p className="text-sm text-muted-foreground">Quantities are compared with the unreceived balance. Over-receipts are allowed and flagged for review.</p></div><div className="text-right text-sm"><p className="text-muted-foreground">Entered quantity</p><p className="font-semibold">{totalEntered.toLocaleString()} units</p></div></div>
                            {overReceivingLines.length > 0 && (
                                <Alert className="border-amber-300 bg-amber-50 text-amber-950">
                                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                                    <AlertTitle>Over-receiving notice</AlertTitle>
                                    <AlertDescription>{formatQuantity(overReceivingQuantity)} units above the unreceived balance will be recorded and flagged for review. You can still submit this receipt.</AlertDescription>
                                </Alert>
                            )}
                            <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Ordered</th><th className="px-4 py-3 text-right">Previously received</th><th className="px-4 py-3 text-right">Remaining</th><th className="w-44 px-4 py-3">Receiving quantity</th></tr></thead><tbody className="divide-y">{selectedLines.map(line => { const entered = Math.max(0, Number(quantities[line.lineId] || 0)); const overage = Math.max(0, entered - line.allowableQuantity); return <tr key={line.lineId}><td className="px-4 py-3"><p className="font-medium">{line.productName}</p><p className="text-xs text-muted-foreground">{line.productCode || `Line ${line.lineId}`}</p></td><td className="px-4 py-3 text-right">{line.orderedQuantity.toLocaleString()}</td><td className="px-4 py-3 text-right">{line.previouslyReceivedQuantity.toLocaleString()}</td><td className="px-4 py-3 text-right font-medium">{line.allowableQuantity.toLocaleString()}</td><td className="px-4 py-3"><div className="space-y-2"><Input type="number" min="0" step="any" value={quantities[line.lineId] ?? ""} onChange={event => updateQuantity(line.lineId, event.target.value)} disabled={!isStarted || actionBusy} aria-label={`Receiving quantity for ${line.productName}`} className={overage > 1e-9 ? "border-amber-400 focus-visible:ring-amber-400" : undefined} />{overage > 1e-9 && <p role="status" className="flex items-start gap-1 text-xs font-medium leading-4 text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Exceeds ordered quantity by +{formatQuantity(overage)} units</p>}</div></td></tr>; })}</tbody></table></div>
                        </CardContent>
                    </Card>
                    <Card className="h-fit xl:sticky xl:top-4">
                        <CardHeader><CardTitle>Workflow action</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-3 text-sm"><div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-4 w-4" /></span><div><p className="font-medium">Approved</p><p className="text-xs text-muted-foreground">Finance approval complete</p></div></div><div className={`flex items-center gap-3 ${isStarted || isPendingQa ? "text-foreground" : "text-muted-foreground"}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full ${isStarted || isPendingQa ? "bg-primary text-primary-foreground" : "bg-muted"}`}>2</span><div><p className="font-medium">Warehouse Receiving</p><p className="text-xs text-muted-foreground">Confirm physical quantities</p></div></div><div className={`flex items-center gap-3 ${isPendingQa ? "text-foreground" : "text-muted-foreground"}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full ${isPendingQa ? "bg-amber-500 text-white" : "bg-muted"}`}>3</span><div><p className="font-medium">Receiving QA</p><p className="text-xs">Lot and quality inspection</p></div></div></div>
                            <Separator />
                            {overReceivingLines.length > 0 && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">This receipt contains an over-receipt. Submission is allowed, and the excess will be visible for review.</p>}
                            {isContinuation && !hasRemainingQuantity && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">This purchase order has no remaining quantity available for another warehouse receipt.</p>}
                            {isPendingQa ? (
                                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs leading-5 text-amber-800">QA must post this receipt before the next warehouse receipt can be started.</p>
                            ) : !isStarted ? <Button className="w-full" onClick={() => void start()} disabled={actionBusy || (isContinuation && !hasRemainingQuantity)} title={isContinuation && !hasRemainingQuantity ? "No remaining quantity is available for another warehouse receipt." : undefined}>{submitting === "start" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<PackageCheck className="mr-2 h-4 w-4" /> {isContinuation ? "Start Next Warehouse Receipt" : "Start Warehouse Receiving"}</Button> : <><Button variant="outline" className="w-full" onClick={() => void saveDraft()} disabled={actionBusy}>{submitting === "save_draft" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Draft</Button>{selectedOrder.draft && <Button variant="outline" className="w-full" onClick={() => void printSummary()} disabled={actionBusy}>{printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />} Print Receiving Summary</Button>}<Button className="w-full" onClick={() => void submitToQa()} disabled={actionBusy}>{submitting === "submit_to_qa" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<ClipboardCheck className="mr-2 h-4 w-4" /> Complete &amp; Send to QA</Button></>}
                            <p className="text-center text-xs leading-5 text-muted-foreground">{isPendingQa ? "The receipt is locked while QA completes inspection." : "Sending to QA locks this warehouse receipt and makes it available in QA Receiving."}</p>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
