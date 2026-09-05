"use client";

import { AlertCircle, ArrowLeft, CheckCircle2, ClipboardCheck, Loader2, PackageCheck, RefreshCw, Search, Warehouse } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useWarehouseReceiving } from "./hooks/useWarehouseReceiving";

function formatAmount(value: number, currency: string) {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
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
        page,
        total,
        totalPages,
        loading,
        detailLoading,
        error,
        detailError,
        submitting,
        setSearch,
        setPage,
        selectOrder,
        updateQuantity,
        setReceiptNumber,
        setReceiptDate,
        setReceiptType,
        start,
        saveDraft,
        submitToQa,
        retryQueue,
        clearSelection
    } = useWarehouseReceiving();

    const isStarted = selectedOrder?.status === "Warehouse Receiving";
    const actionBusy = submitting !== null;
    const totalEntered = selectedLines.reduce((sum, line) => sum + Math.max(0, Number(quantities[line.lineId] || 0)), 0);

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
                    <CardHeader className="gap-4 border-b sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <CardTitle>Approved purchase orders</CardTitle>
                            <p className="mt-1 text-sm text-muted-foreground">Start a warehouse receipt for an approved purchase order.</p>
                        </div>
                        <div className="relative w-full sm:w-80">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search PO or supplier..." className="pl-9" />
                        </div>
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
                            <div className="divide-y">
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
                                            <p className="mt-1 truncate text-sm text-muted-foreground">{order.supplierName} · {order.branch.name} {order.branch.code ? `(${order.branch.code})` : ""}</p>
                                        </div>
                                        <div className="flex shrink-0 items-center gap-6 text-sm">
                                            <div><p className="text-xs text-muted-foreground">Lines</p><p className="font-medium">{order.lines.length}</p></div>
                                            <div className="text-right"><p className="text-xs text-muted-foreground">Total</p><p className="font-medium">{formatAmount(order.totalAmount, order.currencyCode)}</p></div>
                                            <span className="text-sm font-semibold text-primary">Open <span aria-hidden="true">→</span></span>
                                        </div>
                                    </button>
                                ))}
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
                                    <p className="mt-1 text-sm text-muted-foreground">{selectedOrder.supplierName} · Receiving branch: {selectedOrder.branch.name} {selectedOrder.branch.code ? `(${selectedOrder.branch.code})` : ""}</p>
                                </div>
                                <div className="text-left sm:text-right"><p className="text-xs text-muted-foreground">Purchase order total</p><p className="font-semibold">{formatAmount(selectedOrder.totalAmount, selectedOrder.currencyCode)}</p></div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6 p-5">
                            <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-900">
                                <div className="flex items-start gap-3"><ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Warehouse quantity confirmation</p><p className="mt-1">Enter the physical quantities received. Lot, batch, expiration, and QA disposition are completed in the next QA Receiving step.</p></div></div>
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2"><Label htmlFor="receipt-number">Receipt Number</Label><Input id="receipt-number" value={receiptNumber} onChange={event => setReceiptNumber(event.target.value)} disabled={!isStarted || actionBusy} placeholder="Enter receipt number" /></div>
                                <div className="space-y-2"><Label htmlFor="receipt-date">Date of Receipt</Label><Input id="receipt-date" type="date" value={receiptDate} onChange={event => setReceiptDate(event.target.value)} disabled={!isStarted || actionBusy} /></div>
                                <div className="space-y-2"><Label htmlFor="receipt-type">Quantity Status</Label><select id="receipt-type" value={receiptType} onChange={event => setReceiptType(event.target.value as "full" | "partial")} disabled={!isStarted || actionBusy} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="full">Full receipt</option><option value="partial">Partial receipt</option></select></div>
                            </div>

                            <Separator />
                            <div className="flex items-end justify-between gap-3"><div><h2 className="font-semibold">Purchase-order lines</h2><p className="text-sm text-muted-foreground">Quantities are checked against the unreceived balance.</p></div><div className="text-right text-sm"><p className="text-muted-foreground">Entered quantity</p><p className="font-semibold">{totalEntered.toLocaleString()} units</p></div></div>
                            <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3 text-right">Ordered</th><th className="px-4 py-3 text-right">Previously received</th><th className="px-4 py-3 text-right">Remaining</th><th className="w-44 px-4 py-3">Receiving quantity</th></tr></thead><tbody className="divide-y">{selectedLines.map(line => <tr key={line.lineId}><td className="px-4 py-3"><p className="font-medium">{line.productName}</p><p className="text-xs text-muted-foreground">{line.productCode || `Line ${line.lineId}`}</p></td><td className="px-4 py-3 text-right">{line.orderedQuantity.toLocaleString()}</td><td className="px-4 py-3 text-right">{line.previouslyReceivedQuantity.toLocaleString()}</td><td className="px-4 py-3 text-right font-medium">{line.allowableQuantity.toLocaleString()}</td><td className="px-4 py-3"><Input type="number" min="0" step="any" value={quantities[line.lineId] ?? ""} onChange={event => updateQuantity(line.lineId, event.target.value)} disabled={!isStarted || actionBusy} aria-label={`Receiving quantity for ${line.productName}`} /></td></tr>)}</tbody></table></div>
                        </CardContent>
                    </Card>
                    <Card className="h-fit xl:sticky xl:top-4">
                        <CardHeader><CardTitle>Workflow action</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-3 text-sm"><div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-4 w-4" /></span><div><p className="font-medium">Approved</p><p className="text-xs text-muted-foreground">Finance approval complete</p></div></div><div className={`flex items-center gap-3 ${isStarted ? "text-foreground" : "text-muted-foreground"}`}><span className={`flex h-7 w-7 items-center justify-center rounded-full ${isStarted ? "bg-primary text-primary-foreground" : "bg-muted"}`}>2</span><div><p className="font-medium">Warehouse Receiving</p><p className="text-xs text-muted-foreground">Confirm physical quantities</p></div></div><div className="flex items-center gap-3 text-muted-foreground"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted">3</span><div><p className="font-medium">Receiving QA</p><p className="text-xs">Lot and quality inspection</p></div></div></div>
                            <Separator />
                            {!isStarted ? <Button className="w-full" onClick={() => void start()} disabled={actionBusy}>{submitting === "start" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<PackageCheck className="mr-2 h-4 w-4" /> Start Warehouse Receiving</Button> : <><Button variant="outline" className="w-full" onClick={() => void saveDraft()} disabled={actionBusy}>{submitting === "save_draft" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save Draft</Button><Button className="w-full" onClick={() => void submitToQa()} disabled={actionBusy}>{submitting === "submit_to_qa" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<ClipboardCheck className="mr-2 h-4 w-4" /> Complete &amp; Send to QA</Button></>}
                            <p className="text-center text-xs leading-5 text-muted-foreground">Sending to QA locks this warehouse receipt and makes it available in QA Receiving.</p>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
