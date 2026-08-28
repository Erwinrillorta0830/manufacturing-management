import React from "react";
import { 
    Loader2, ShieldCheck, X, Building2, 
    FileText, CreditCard, Calendar 
} from "lucide-react";
import { SalesOrder, SalesOrderDetail } from "../../sales-order/types";
import { formatCurrency } from "@/lib/utils";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface SalesOrderApprovalDetailPanelProps {
    selectedOrder: SalesOrder | null;
    setSelectedOrder: (order: SalesOrder | null) => void;
    orderDetails: SalesOrderDetail[];
    loadingDetails: boolean;
    updatingStatusId: number | null;
    stockData: Record<number, number>;
    handleApprove: (orderId: number) => void;
    handleSendToJO: (orderId: number) => void;
    handleSendToInvoice: (orderId: number) => void;
    handleHold?: (orderId: number) => void;
    handleReject: (orderId: number) => void;
    handleCancel?: (orderId: number) => void;
}

export function SalesOrderApprovalDetailPanel({
    selectedOrder,
    setSelectedOrder,
    orderDetails,
    loadingDetails,
    updatingStatusId,
    stockData,
    handleApprove,
    handleSendToJO,
    handleSendToInvoice,
    handleHold,
    handleReject,
    handleCancel
}: SalesOrderApprovalDetailPanelProps) {
    if (!selectedOrder) return null;

    // Compute pricing sums
    const grossSum = orderDetails.reduce((acc, item) => acc + (item.unit_price * item.ordered_quantity), 0);
    const discount = Number(selectedOrder.discount_amount || 0);
    const netSum = Math.max(0, grossSum - discount);
    const isZeroNet = netSum <= 0;
    const isOutOfStock = orderDetails.some(item => {
        const pid = typeof item.product_id === 'object' ? item.product_id?.product_id : item.product_id;
        return item.ordered_quantity > (stockData[Number(pid)] || 0);
    });

    return (
        <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
            <DialogContent showCloseButton={false} className="sm:max-w-3xl p-0 gap-0 border-none overflow-hidden bg-transparent shadow-none">
                <DialogTitle className="sr-only">Review Sales Order {selectedOrder.order_no}</DialogTitle>
                <div className="border border-border rounded-2xl bg-card p-6 shadow-xl space-y-6 border-t-2 border-t-amber-500 max-h-[90vh] overflow-y-auto w-full">
            {/* Header info */}
            <div className="flex justify-between items-start border-b border-border pb-4">
                <div>
                    <div className="flex items-center gap-2.5">
                        <h4 className="text-sm font-black text-foreground uppercase tracking-wider">
                            {selectedOrder.order_no}
                        </h4>
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[8.5px] font-black uppercase tracking-wider whitespace-nowrap ${
                            selectedOrder.order_status === "For Invoicing" || selectedOrder.order_status === "For Picking"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                : selectedOrder.order_status === "On Hold"
                                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                : selectedOrder.order_status === "Cancelled"
                                ? "bg-destructive/10 text-destructive border border-destructive/20"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        }`}>
                            {selectedOrder.order_status || "Pending Approval"}
                        </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Review Sales Order Pricing & Scope</p>
                </div>
                <button
                    onClick={() => setSelectedOrder(null)}
                    className="text-muted-foreground hover:text-foreground text-xs font-bold px-2.5 py-1.5 rounded-lg hover:bg-muted transition-all cursor-pointer border-none bg-transparent"
                >
                    Close
                </button>
            </div>

            {/* Metadata Grid */}
            <div className="grid grid-cols-2 gap-3.5 bg-muted/50 p-4.5 rounded-xl border border-border text-xs">
                <div className="space-y-1 col-span-2">
                    <span className="text-muted-foreground block text-[9.5px] font-bold uppercase tracking-wider">Customer</span>
                    <span className="font-extrabold text-foreground flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-amber-500" />
                        {selectedOrder.customer_name ? (
                            <span>
                                {selectedOrder.customer_name}{" "}
                                <span className="text-[9.5px] font-mono text-muted-foreground font-normal">({selectedOrder.customer_code})</span>
                            </span>
                        ) : (
                            selectedOrder.customer_code
                        )}
                    </span>
                </div>
                
                <div className="space-y-1">
                    <span className="text-muted-foreground block text-[9.5px] font-bold uppercase tracking-wider">PO Number</span>
                    <span className="font-bold text-foreground flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        {selectedOrder.po_no || <span className="text-muted-foreground italic font-normal">N/A</span>}
                    </span>
                </div>

                <div className="space-y-1">
                    <span className="text-muted-foreground block text-[9.5px] font-bold uppercase tracking-wider">Payment Terms</span>
                    <span className="font-bold text-foreground flex items-center gap-2">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        {selectedOrder.payment_term_name ? (
                            <span className="truncate">
                                {selectedOrder.payment_term_name}
                                {selectedOrder.payment_term_days !== undefined && selectedOrder.payment_term_days !== null && (
                                    <span className="text-[9.5px] text-muted-foreground font-normal">
                                        {" "}({selectedOrder.payment_term_days}d)
                                    </span>
                                )}
                            </span>
                        ) : (
                            selectedOrder.payment_terms ? `${selectedOrder.payment_terms} Days` : "COD"
                        )}
                    </span>
                </div>

                <div className="space-y-1">
                    <span className="text-muted-foreground block text-[9.5px] font-bold uppercase tracking-wider">Order Date</span>
                    <span className="font-bold text-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {selectedOrder.order_date ? new Date(selectedOrder.order_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "N/A"}
                    </span>
                </div>

                <div className="space-y-1">
                    <span className="text-muted-foreground block text-[9.5px] font-bold uppercase tracking-wider">Delivery Date</span>
                    <span className="font-bold text-foreground flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {selectedOrder.delivery_date ? new Date(selectedOrder.delivery_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : <span className="text-muted-foreground italic font-normal">N/A</span>}
                    </span>
                </div>

                {selectedOrder.remarks && (
                    <div className="space-y-1 col-span-2 pt-3 border-t border-border border-dashed mt-1.5">
                        <span className="text-muted-foreground block text-[9.5px] font-bold uppercase tracking-wider">Remarks / Notes</span>
                        <p className="text-[11px] text-muted-foreground leading-relaxed italic">
                            &ldquo;{selectedOrder.remarks}&rdquo;
                        </p>
                    </div>
                )}
            </div>

            {/* Line items section */}
            <div className="space-y-3.5">
                <h5 className="text-[9.5px] font-extrabold uppercase text-muted-foreground tracking-wider">
                    Agreement Line Items
                </h5>

                {loadingDetails ? (
                    <div className="flex flex-col items-center justify-center p-12 gap-2 border border-dashed rounded-xl bg-muted/50">
                        <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
                        <span className="text-[10px] text-muted-foreground font-semibold">Fetching agreement items...</span>
                    </div>
                ) : orderDetails.length === 0 ? (
                    <div className="text-center p-8 border border-dashed rounded-xl bg-muted/50 text-xs text-muted-foreground italic">
                        No items logged in detail.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {orderDetails.map(item => {
                            const pId = item.product_id;
                            const pidNumber = typeof pId === 'object' ? pId?.product_id : pId;
                            const onHand = stockData[Number(pidNumber)] || 0;
                            const isItemOutOfStock = item.ordered_quantity > onHand;
                            const name = pId?.product_name || `Product #${item.product_id}`;
                            const code = pId?.product_code || `CODE-${item.product_id}`;
                            const brand = pId?.brand || "N/A";
                            const category = pId?.category || "N/A";
                            const uom = pId?.uom || "PCS";
                            const totalCost = item.unit_price * item.ordered_quantity;

                            return (
                                <div 
                                    key={item.detail_id} 
                                    className="border border-border rounded-xl p-4 bg-background flex flex-col justify-between gap-3 hover:border-primary/50 transition-all duration-200"
                                >
                                    <div className="flex items-start justify-between gap-2.5">
                                        <div className="space-y-1.5">
                                            <div className="text-xs font-bold text-foreground leading-snug">{name}</div>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="text-[9px] font-mono bg-muted border border-border px-1.5 py-0.2 rounded text-muted-foreground uppercase font-semibold">
                                                    {code}
                                                </span>
                                                {brand !== "N/A" && (
                                                    <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.2 rounded font-semibold">
                                                        {brand}
                                                    </span>
                                                )}
                                                {category !== "N/A" && (
                                                    <span className="text-[9px] bg-muted px-1.5 py-0.2 rounded text-muted-foreground font-semibold">
                                                        {category}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <div className="text-xs font-black text-foreground font-mono">
                                                {formatCurrency(totalCost)}
                                            </div>
                                            <div className="text-[9px] text-muted-foreground font-semibold mt-0.5">
                                                {formatCurrency(item.unit_price)} / {uom}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between pt-2.5 border-t border-border border-dashed">
                                        <span className="text-[9.5px] text-muted-foreground font-bold uppercase tracking-wider">
                                            Quantity
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isItemOutOfStock ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-600'}`}>
                                                Stock: {onHand}
                                            </span>
                                            <span className="text-xs font-extrabold text-foreground font-mono">
                                                {item.ordered_quantity} <span className="text-[10px] text-muted-foreground font-normal">{uom}</span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Financial Breakdown card */}
            <div className="bg-card text-card-foreground border border-border rounded-xl p-4.5 space-y-3 shadow-xs relative overflow-hidden">
                <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground font-medium">Subtotal Gross</span>
                    <span className="font-bold font-mono">
                        {formatCurrency(grossSum)}
                    </span>
                </div>
                {selectedOrder.discount_amount ? (
                    <div className="flex justify-between items-center text-xs text-destructive">
                        <span className="font-medium">Discount Code</span>
                        <span className="font-bold font-mono">
                            - {formatCurrency(discount)}
                        </span>
                    </div>
                ) : null}
                <div className="border-t border-border my-2 pt-3 flex justify-between items-center">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                        Net Amount Locked
                    </span>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
                        {formatCurrency(netSum)}
                    </span>
                </div>
            </div>

            {/* Zero-Net Balance Warning Banner */}
            {isZeroNet && (
                <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-xl p-3.5 text-xs flex items-start gap-2.5 shadow-xs">
                    <X className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
                    <div className="space-y-0.5">
                        <span className="font-extrabold uppercase tracking-wider block text-[10px]">Approval Blocked</span>
                        <p className="text-[11px] leading-relaxed">
                            Sales Order total net balance is ₱0.00. Valid unit pricing or promo discounts are required before this document can be approved.
                        </p>
                    </div>
                </div>
            )}

            {/* Action buttons */}
            <div className="flex flex-col gap-2.5 pt-1">
                <div className="grid grid-cols-2 gap-2">
                    <button
                        disabled={updatingStatusId === selectedOrder.order_id || isZeroNet}
                        onClick={() => handleSendToJO(selectedOrder.order_id)}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 py-3.5 text-xs font-black text-white shadow-md shadow-amber-500/10 hover:shadow-amber-500/25 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-none"
                        title={isZeroNet ? "Approval blocked due to ₱0.00 net total" : "Send to JO"}
                    >
                        {updatingStatusId === selectedOrder.order_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <ShieldCheck className="h-4 w-4 stroke-[3]" />
                        )}
                        Send to JO
                    </button>

                    <button
                        disabled={updatingStatusId === selectedOrder.order_id || isZeroNet || isOutOfStock}
                        onClick={() => handleSendToInvoice(selectedOrder.order_id)}
                        className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3.5 text-xs font-black text-white shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/25 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed border-none"
                        title={isOutOfStock ? "Cannot send to invoice: Insufficient stock" : (isZeroNet ? "Approval blocked due to ₱0.00 net total" : "Send to Invoice")}
                    >
                        {updatingStatusId === selectedOrder.order_id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <ShieldCheck className="h-4 w-4 stroke-[3]" />
                        )}
                        Send to Invoice
                    </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    {handleHold && (
                        <button
                            disabled={updatingStatusId === selectedOrder.order_id}
                            onClick={() => handleHold(selectedOrder.order_id)}
                            className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50/80 hover:bg-amber-100/80 text-amber-900 py-2.5 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                        >
                            Put On Hold
                        </button>
                    )}
                    <button
                        disabled={updatingStatusId === selectedOrder.order_id}
                        onClick={() => handleReject(selectedOrder.order_id)}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background hover:bg-muted text-foreground py-2.5 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                    >
                        Reject to Draft
                    </button>
                </div>

                {handleCancel && (
                    <button
                        disabled={updatingStatusId === selectedOrder.order_id}
                        onClick={() => {
                            if (window.confirm(`Are you sure you want to permanently cancel Sales Order ${selectedOrder.order_no}? This action is irreversible.`)) {
                                handleCancel(selectedOrder.order_id);
                            }
                        }}
                        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-destructive/20 bg-destructive/10 hover:bg-destructive/20 text-destructive py-2.5 text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                    >
                        Cancel Order
                    </button>
                )}
            </div>
            </div>
        </DialogContent>
      </Dialog>
    );
}
