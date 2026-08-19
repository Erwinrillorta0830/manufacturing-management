"use client";

import React from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, PackageCheck, Printer, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ReceivingCommitResult, ReceivingMovementRoute, ReceivingPreview, ShipmentLineItem } from "../types";
import { downloadPurchaseOrderPrintable } from "../../purchase-order/services/purchase-order-print-api";

interface MovementPayloadModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    preview: ReceivingPreview | null;
    lineItems: ShipmentLineItem[];
    purchaseOrderReference?: string | null;
    commitReady: boolean;
    posting: boolean;
    onCommit: () => void;
    committedResult: ReceivingCommitResult | null;
    onFinish: () => void;
}

interface RouteRow {
    lineId: number;
    productName: string;
    productCode: string;
    route: ReceivingMovementRoute;
}

export default function MovementPayloadModal({
    open,
    onOpenChange,
    preview,
    lineItems,
    purchaseOrderReference,
    commitReady,
    posting,
    onCommit,
    committedResult,
    onFinish
}: MovementPayloadModalProps) {
    const [verified, setVerified] = React.useState(false);
    const [printLoading, setPrintLoading] = React.useState<"qa" | "storage" | null>(null);

    React.useEffect(() => {
        if (open) {
            setVerified(false);
            setPrintLoading(null);
        }
    }, [open, preview]);

    const printCommittedDocument = async (documentType: "QA_GOODS_RECEIPT" | "STORAGE_LOT_ALLOCATION", key: "qa" | "storage") => {
        if (!committedResult) return;
        try {
            setPrintLoading(key);
            await downloadPurchaseOrderPrintable({
                purchaseOrderId: committedResult.shipmentId,
                documentType
            });
            toast.success(`${key === "qa" ? "QA goods receipt" : "Storage-lot allocation"} printable downloaded.`);
        } catch (error) {
            toast.error((error as Error).message || "Unable to generate the receiving printable.");
        } finally {
            setPrintLoading(null);
        }
    };

    const routeRows = React.useMemo<RouteRow[]>(() => {
        if (!preview) return [];
        return preview.lines.flatMap(line => {
            const poLine = lineItems.find(item => item.line_id === line.lineId);
            return line.routes.map(route => ({
                lineId: line.lineId,
                productName: poLine?.product_id?.product_name || "Unknown product",
                productCode: poLine?.product_id?.product_code || "N/A",
                route
            }));
        });
    }, [lineItems, preview]);

    const passedRows = routeRows.filter(row => row.route.kind === "Passed");
    const rejectedRows = routeRows.filter(row => row.route.kind === "Rejected");
    const allocations = passedRows.flatMap(row => row.route.allocationDrafts.map(allocation => ({ ...row, allocation })));

    const getProduct = (lineId: number) => lineItems.find(item => item.line_id === lineId)?.product_id;
    const getPreviewRoute = (lineId: number, storageLotId: number, branchId?: number) => {
        const routes = preview?.lines.find(line => line.lineId === lineId)?.routes || [];
        return routes.find(route =>
            route.storageLotId === storageLotId
            && (branchId === undefined || route.branch.id === branchId)
        ) || routes.find(route => route.storageLotId === storageLotId) || null;
    };

    if (!preview && !committedResult) return null;

    const movementTable = (rows: RouteRow[], kind: "Passed" | "Rejected") => (
        <section className="space-y-2.5" aria-label={`${kind} inventory movement drafts`}>
            <div className="flex items-center gap-2">
                {kind === "Passed" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-red-600" />}
                <h3 className="text-xs font-extrabold uppercase tracking-wider">{kind === "Passed" ? "Good-Stock Movements" : "Bad-Order Movements"}</h3>
                <span className="text-[11px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded">{rows.length} draft{rows.length === 1 ? "" : "s"}</span>
            </div>
            {rows.length === 0 ? (
                <p className="text-xs text-muted-foreground border rounded-lg p-3 bg-muted/20">No {kind.toLowerCase()} movement is required.</p>
            ) : (
                <div className="overflow-x-auto border rounded-xl shadow-sm">
                    <table className="w-full min-w-[950px] text-xs">
                        <thead className="bg-muted/60 text-muted-foreground uppercase text-[10px] font-extrabold tracking-wider border-b">
                            <tr>
                                <th className="px-3 py-2.5 text-left">Product</th>
                                <th className="px-3 py-2.5 text-left">Branch</th>
                                <th className="px-3 py-2.5 text-left">Storage Lot / Batch</th>
                                <th className="px-3 py-2.5 text-right">Quantity</th>
                                <th className="px-3 py-2.5 text-left">Dates</th>
                                <th className="px-3 py-2.5 text-left">Transaction</th>
                                <th className="px-3 py-2.5 text-left">Remarks</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {rows.map(({ lineId, productName, productCode, route }) => (
                                <tr key={`${lineId}-${route.kind}`} className="hover:bg-muted/20">
                                    <td className="px-3 py-2.5 align-top font-semibold text-foreground"><strong>{productName}</strong><br /><span className="text-muted-foreground text-[11px] font-mono">{productCode}</span></td>
                                    <td className="px-3 py-2.5 align-top font-medium"><strong>{route.branch.name}</strong><br /><span className="text-muted-foreground text-[11px]">{route.branch.code}</span></td>
                                    <td className="px-3 py-2.5 align-top font-medium"><strong>{route.storageLotName}</strong><br /><span className="text-muted-foreground text-[11px]">Batch: {route.supplierBatchNumber}</span></td>
                                    <td className="px-3 py-2.5 align-top text-right font-mono font-bold text-foreground text-sm">{route.quantity.toLocaleString()}</td>
                                    <td className="px-3 py-2.5 align-top font-mono text-[11px]">MFG: {route.manufacturingDate || "N/A"}<br />EXP: {route.expiryDate || "N/A"}</td>
                                    <td className="px-3 py-2.5 align-top font-semibold"><strong>{route.transactionType.name}</strong></td>
                                    <td className="px-3 py-2.5 align-top max-w-[260px] whitespace-normal text-muted-foreground">{route.remarks || "None"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[95vw] w-[95vw] max-w-[1550px] max-h-[94vh] h-[90vh] p-0 overflow-hidden flex flex-col rounded-xl">
                <DialogHeader className="px-6 pt-5 pb-3 border-b bg-muted/10">
                    <DialogTitle className="flex items-center gap-2 text-base font-bold">
                        <ClipboardCheck className="h-5 w-5 text-primary" />
                        {committedResult ? "Receiving Posted" : "Ledger Movement Verification"}
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        {committedResult
                            ? `Receipt ${committedResult.commitReference} was posted successfully. Confirm the persisted records below.`
                            : `Receipt Number will be generated on commit for PO ${purchaseOrderReference || "the selected purchase order"}. Review the movement and allocation records before posting.`}
                    </DialogDescription>
                </DialogHeader>

                <div className="overflow-y-auto px-5 py-4 space-y-6">
                    {committedResult ? (
                        <>
                            {(() => {
                                const displayReceipt = committedResult.receivingTicketNumber || committedResult.commitReference || "N/A";
                                return (
                                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs border-y py-2.5 bg-muted/20 font-medium">
                                        <span><strong>PO Number:</strong> {purchaseOrderReference || "Current purchase order"}</span>
                                        <span><strong>Receipt Number:</strong> <span className="font-mono font-bold text-primary">{displayReceipt}</span></span>
                                        <span><strong>Status:</strong> <span className="font-bold text-emerald-700">{committedResult.status}</span></span>
                                        {committedResult.status === "Received" && (
                                            <>
                                                <span><strong>Payment Status:</strong> <span className="font-bold text-blue-700">{Number(committedResult.paymentStatus) === 2 ? "Awaiting Payment" : "Pending"}</span></span>
                                                {Number(committedResult.paymentStatus) === 2 && (
                                                    <span className="text-blue-700"><strong>Finance Queue:</strong> <span className="font-bold">Purchase Amount Posting</span></span>
                                                )}
                                            </>
                                        )}
                                        <span><strong>Submission:</strong> {committedResult.idempotentReplay ? "Idempotent Replay" : "Fresh Posting"}</span>
                                    </div>
                                );
                            })()}

                            <section className="space-y-2" aria-label="Committed receiving records">
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    <h3 className="text-xs font-bold">Committed receiving records</h3>
                                    <span className="text-[10px] text-muted-foreground">{committedResult.receivingRecords.length}</span>
                                </div>
                                <div className="overflow-x-auto border-y">
                                    <table className="w-full min-w-[850px] text-[10px]">
                                        <thead className="bg-muted/40 text-muted-foreground uppercase">
                                            <tr>
                                                <th className="px-2 py-2 text-left">Product</th>
                                                <th className="px-2 py-2 text-left">Receipt / batch</th>
                                                <th className="px-2 py-2 text-left">Storage lot</th>
                                                <th className="px-2 py-2 text-right">Received</th>
                                                <th className="px-2 py-2 text-right">Rejected</th>
                                                <th className="px-2 py-2 text-right">Over-delivery</th>
                                                <th className="px-2 py-2 text-left">QA status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {committedResult.receivingRecords.map(record => (
                                                <tr key={record.receivingRecordId}>
                                                    {(() => {
                                                        const product = getProduct(record.lineId);
                                                        const route = getPreviewRoute(record.lineId, record.storageLotId);
                                                        return (
                                                            <>
                                                                <td className="px-2 py-2 align-top"><strong>{product?.product_name || "Unknown product"}</strong><br /><span className="text-muted-foreground">{product?.product_code || "N/A"}</span></td>
                                                                <td className="px-2 py-2 align-top font-mono"><strong>{record.receiptNumber}</strong><br /><span className="text-muted-foreground">Batch: {record.batchNumber}</span></td>
                                                                <td className="px-2 py-2 align-top">{route?.storageLotName || "N/A"}</td>
                                                                <td className="px-2 py-2 align-top text-right font-bold tabular-nums">{record.receivedQuantity.toLocaleString()}</td>
                                                                <td className="px-2 py-2 align-top text-right font-bold tabular-nums">{record.rejectedQuantity.toLocaleString()}</td>
                                                                <td className="px-2 py-2 align-top text-right font-bold tabular-nums">{record.isOverReceived ? record.overDeliveryQuantity.toLocaleString() : "—"}</td>
                                                                <td className="px-2 py-2 align-top">{record.qaStatus || "N/A"}</td>
                                                            </>
                                                        );
                                                    })()}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className="space-y-2" aria-label="Committed MRP allocations">
                                <div className="flex items-center gap-2">
                                    <PackageCheck className="h-4 w-4 text-violet-600" />
                                    <h3 className="text-xs font-bold">Committed MRP allocations</h3>
                                    <span className="text-[10px] text-muted-foreground">{committedResult.allocations.length}</span>
                                </div>
                                <div className="overflow-x-auto border-y">
                                    <table className="w-full min-w-[850px] text-[10px]">
                                        <thead className="bg-muted/40 text-muted-foreground uppercase">
                                            <tr>
                                                <th className="px-2 py-2 text-left">Allocation ID</th>
                                                <th className="px-2 py-2 text-left">Product</th>
                                                <th className="px-2 py-2 text-left">Job order / material</th>
                                                <th className="px-2 py-2 text-right">Quantity</th>
                                                <th className="px-2 py-2 text-left">Inventory lots</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {committedResult.allocations.map(allocation => {
                                                const product = getProduct(allocation.lineId);
                                                return (
                                                    <tr key={allocation.allocationId}>
                                                        <td className="px-2 py-2 font-bold tabular-nums">{allocation.allocationId}</td>
                                                        <td className="px-2 py-2"><strong>{product?.product_name || `Product #${allocation.productId}`}</strong><br /><span className="text-muted-foreground">{product?.product_code || "N/A"}</span></td>
                                                        <td className="px-2 py-2">JO #{allocation.jobOrderId}<br /><span className="text-muted-foreground">Material #{allocation.jobOrderMaterialId}</span></td>
                                                        <td className="px-2 py-2 text-right font-bold tabular-nums">{allocation.quantity.toLocaleString()}</td>
                                                        <td className="px-2 py-2">{allocation.inventoryLotIds.join(", ") || "N/A"}</td>
                                                    </tr>
                                                );
                                            })}
                                            {committedResult.allocations.length === 0 && (
                                                <tr><td colSpan={5} className="px-2 py-3 text-muted-foreground">No MRP allocation was created for this receipt.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            <section className="space-y-2" aria-label="Committed inventory movements">
                                <div className="flex items-center gap-2">
                                    <PackageCheck className="h-4 w-4 text-blue-600" />
                                    <h3 className="text-xs font-bold">Committed inventory movements</h3>
                                    <span className="text-[10px] text-muted-foreground">{committedResult.movements.length}</span>
                                </div>
                                <div className="overflow-x-auto border-y">
                                    <table className="w-full min-w-[850px] text-[10px]">
                                        <thead className="bg-muted/40 text-muted-foreground uppercase">
                                            <tr>
                                                <th className="px-2 py-2 text-left">Kind</th>
                                                <th className="px-2 py-2 text-left">Product</th>
                                                <th className="px-2 py-2 text-left">Storage lot</th>
                                                <th className="px-2 py-2 text-left">Branch</th>
                                                <th className="px-2 py-2 text-right">Quantity</th>
                                                <th className="px-2 py-2 text-left">Source / transaction</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {committedResult.movements.map(movement => (
                                                <tr key={movement.movementId}>
                                                    {(() => {
                                                        const product = getProduct(movement.lineId);
                                                        const route = getPreviewRoute(movement.lineId, movement.storageLotId, movement.branchId);
                                                        return (
                                                            <>
                                                    <td className="px-2 py-2">{movement.kind}</td>
                                                    <td className="px-2 py-2"><strong>{product?.product_name || "Unknown product"}</strong><br /><span className="text-muted-foreground">{product?.product_code || "N/A"}</span></td>
                                                    <td className="px-2 py-2">{route?.storageLotName || "N/A"}</td>
                                                    <td className="px-2 py-2">{route?.branch.name || "N/A"}<br /><span className="text-muted-foreground">{route?.branch.code || ""}</span></td>
                                                    <td className="px-2 py-2 text-right font-bold tabular-nums">{movement.quantity.toLocaleString()}</td>
                                                    <td className="px-2 py-2">{movement.sourceDocumentNo}<br /><span className="text-muted-foreground">{route?.transactionType.name || "N/A"}</span></td>
                                                            </>
                                                        );
                                                    })()}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        </>
                    ) : (
                    <>
                    <div className="flex flex-wrap gap-x-6 gap-y-1 text-[11px] border-y py-2">
                        <span><strong>Destination:</strong> {preview!.destinationBranch.name} ({preview!.destinationBranch.code})</span>
                        <span><strong>Inspector:</strong> {preview!.inspectorName}</span>
                        <span><strong>Status:</strong> Ready to post</span>
                    </div>

                    {preview!.lines.some(line => line.isOverReceived) && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[11px] text-amber-800" role="alert">
                            <p className="font-extrabold">Process Over-Delivery confirmed</p>
                            {preview!.lines.filter(line => line.isOverReceived).map(line => {
                                const product = getProduct(line.lineId);
                                return (
                                    <p key={line.lineId}>
                                        {product?.product_name || `Line ${line.lineId}`}: received {line.receivedQuantity.toLocaleString()}, expected {line.remainingQuantity.toLocaleString()}, excess {line.overDeliveryQuantity.toLocaleString()}
                                    </p>
                                );
                            })}
                        </div>
                    )}

                    {movementTable(passedRows, "Passed")}
                    {movementTable(rejectedRows, "Rejected")}

                    <section className="space-y-2" aria-label="MRP allocation drafts">
                        <div className="flex items-center gap-2">
                            <PackageCheck className="h-4 w-4 text-blue-600" />
                            <h3 className="text-xs font-bold">MRP pre-allocation</h3>
                            <span className="text-[10px] text-muted-foreground">{allocations.length} draft{allocations.length === 1 ? "" : "s"}</span>
                        </div>
                        <div className="overflow-x-auto border-y">
                            <table className="w-full min-w-[620px] text-[10px]">
                                <thead className="bg-muted/40 text-muted-foreground uppercase">
                                    <tr>
                                        <th className="px-2 py-2 text-left">Product</th>
                                        <th className="px-2 py-2 text-left">Job order</th>
                                        <th className="px-2 py-2 text-right">Allocated</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {allocations.map(({ lineId, productName, allocation }) => (
                                        <tr key={`${lineId}-${allocation.jobOrderMaterialId}`}>
                                            <td className="px-2 py-2 font-bold">{productName}</td>
                                            <td className="px-2 py-2"><strong>{allocation.jobOrder.number}</strong></td>
                                            <td className="px-2 py-2 text-right font-bold tabular-nums">{allocation.quantity.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                    {allocations.length === 0 && (
                                        <tr><td colSpan={3} className="px-2 py-3 text-muted-foreground">No MRP allocation is required for this receipt.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {passedRows.some(row => row.route.unallocatedQuantity > 0) && (
                            <div className="text-[11px] text-amber-700 border-l-2 border-amber-500 pl-3 space-y-1">
                                {passedRows.filter(row => row.route.unallocatedQuantity > 0).map(row => (
                                    <p key={row.lineId}><strong>{row.productName}:</strong> {row.route.unallocatedQuantity.toLocaleString()} Passed unit(s) remain unallocated.</p>
                                ))}
                            </div>
                        )}
                    </section>
                    </>
                    )}
                </div>

                <DialogFooter className="px-5 py-4 border-t gap-3 sm:items-center sm:justify-between">
                    {committedResult ? (
                        <div className="flex w-full flex-wrap justify-end gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                disabled={printLoading !== null}
                                onClick={() => void printCommittedDocument("QA_GOODS_RECEIPT", "qa")}
                            >
                                {printLoading === "qa" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                                Print QA receipt
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={printLoading !== null}
                                onClick={() => void printCommittedDocument("STORAGE_LOT_ALLOCATION", "storage")}
                            >
                                {printLoading === "storage" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                                Print storage lots
                            </Button>
                            <Button type="button" onClick={onFinish}>Finish</Button>
                        </div>
                    ) : (
                        <>
                            <label className="flex items-start gap-2 text-[11px] font-semibold cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={verified}
                                    onChange={event => setVerified(event.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                                />
                                I verified these movement and allocation records.
                            </label>
                            <div className="flex justify-end gap-2">
                                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close Preview</Button>
                                <Button type="button" disabled={!verified || posting || !commitReady} onClick={onCommit}>
                                    {posting ? "Receiving..." : "Confirm & Receive"}
                                </Button>
                            </div>
                        </>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
