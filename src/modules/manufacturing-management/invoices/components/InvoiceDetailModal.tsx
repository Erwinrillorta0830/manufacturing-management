// src/modules/manufacturing-management/invoices/components/InvoiceDetailModal.tsx

import React, { useState, useMemo } from "react";
import { Invoice, InvoiceLineItem, PrinterAlignmentSettings } from "../types";
import { X, Printer, Loader2 } from "lucide-react";
import { fetchPrintableInvoice } from "../../invoicing-and-billing/invoicing/services/invoicing-api";
import { generateInvoiceReceiptPdf } from "../../invoicing-and-billing/invoicing/utils/generateInvoiceReceiptPdf";

interface PaymentHistoryItem {
    amount: number;
    method: string;
    reference: string;
    date: string;
}

interface InvoiceDetailModalProps {
    invoice: Invoice;
    invoiceDetails: InvoiceLineItem[];
    isOpen: boolean;
    onClose: () => void;
    onCancelInvoice: (invoiceId: number) => Promise<boolean>;
    alignment: PrinterAlignmentSettings;
    loadingDetails?: boolean;
}

export default function InvoiceDetailModal({
    invoice,
    invoiceDetails,
    isOpen,
    onClose,
    onCancelInvoice,
    alignment,
    loadingDetails = false
}: InvoiceDetailModalProps) {
    const [printingReceipt, setPrintingReceipt] = useState(false);
    const [receiptError, setReceiptError] = useState("");
    const [cancelling, setCancelling] = useState(false);

    const handlePrintReceipt = async () => {
        setPrintingReceipt(true);
        setReceiptError("");
        try {
            const printable = await fetchPrintableInvoice(invoice.invoice_id);
            const doc = await generateInvoiceReceiptPdf(printable, { includeBackground: false });
            const blob = doc.output("blob");
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${printable.invoiceNo || invoice.invoice_no}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            setReceiptError(err instanceof Error ? err.message : "Failed to generate receipt PDF");
        } finally {
            setPrintingReceipt(false);
        }
    };

    // Parse collection payments history
    const payments = useMemo<PaymentHistoryItem[]>(() => {
        if (!invoice.payment_status) return [];
        try {
            const parsed = JSON.parse(invoice.payment_status);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }, [invoice.payment_status]);

    const totalPaid = useMemo(() => {
        return payments.reduce((sum: number, p: PaymentHistoryItem) => sum + Number(p.amount || 0), 0);
    }, [payments]);

    const remainingBalance = invoice.net_amount - totalPaid;

    if (!isOpen || !invoice) return null;



    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            {/* Elegant self-contained media print styling */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    /* Ensure a pure white layout on print with zero browser padding/margins */
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: visible !important;
                        background: #ffffff !important;
                        background-color: #ffffff !important;
                        color: #000000 !important;
                        height: 100% !important;
                        width: 100% !important;
                    }
                    
                    /* Suppress browser scrollbars */
                    ::-webkit-scrollbar {
                        display: none !important;
                    }
                    
                    /* Hide absolute parent visual trees */
                    body * {
                        visibility: hidden !important;
                    }
                    
                    /* Force display only the monospace blueprint form */
                    #invoice-print-blueprint, #invoice-print-blueprint * {
                        visibility: visible !important;
                    }
                    
                    #invoice-print-blueprint {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 215mm !important;
                        height: 279mm !important;
                        display: block !important;
                        background: transparent !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }
                    
                    /* Disable modal panel and portal frames */
                    .no-print {
                        display: none !important;
                        visibility: hidden !important;
                    }
                }
                
                @page {
                    size: letter !important;
                    margin: 0 !important;
                }
            `}} />

            {/* Main Modal Panel */}
            <div className="border bg-card rounded-2xl w-full max-w-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden no-print">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-foreground uppercase tracking-wide">
                                Invoice Details
                            </h3>
                            <span 
                                className={`text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                                    invoice.status === "Paid" 
                                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" 
                                        : invoice.status === "Partially Paid"
                                        ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                                        : invoice.status === "Cancelled"
                                        ? "bg-slate-500/10 border-slate-500/20 text-slate-500"
                                        : "bg-rose-500/10 border-rose-500/20 text-rose-500"
                                }`}
                            >
                                {invoice.status}
                            </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Ref: {invoice.invoice_no}</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground border-none cursor-pointer"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {loadingDetails ? (
                        <div className="flex flex-col items-center justify-center py-20 space-y-3">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Syncing Ledger Line Items...</span>
                        </div>
                    ) : (
                        <>
                            {/* Upper Metadata Block */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/20 border rounded-xl p-4">
                        <div>
                            <span className="text-[9px] font-bold text-muted-foreground uppercase block">Customer</span>
                            <span className="text-xs font-black text-foreground mt-0.5 block truncate">
                                {invoice.customer_name || "N/A"}
                            </span>
                        </div>
                        <div>
                            <span className="text-[9px] font-bold text-muted-foreground uppercase block">Invoice Date</span>
                            <span className="text-xs font-bold text-foreground mt-0.5 block">
                                {new Date(invoice.invoice_date).toLocaleDateString()}
                            </span>
                        </div>
                        <div>
                            <span className="text-[9px] font-bold text-muted-foreground uppercase block">Due Date</span>
                            <span className="text-xs font-bold text-foreground mt-0.5 block">
                                {new Date(invoice.due_date).toLocaleDateString()}
                            </span>
                        </div>
                        <div>
                            <span className="text-[9px] font-bold text-muted-foreground uppercase block">Sales Order Ref</span>
                            <span className="text-xs font-bold text-primary mt-0.5 block">
                                {invoice.sales_order_no || "Manual"}
                            </span>
                        </div>
                    </div>

                    {/* Table items */}
                    <div className="border rounded-xl overflow-hidden">
                        <div className="bg-muted/30 px-4 py-2 border-b">
                            <span className="text-[9px] font-extrabold uppercase text-muted-foreground tracking-wider">Invoiced Items</span>
                        </div>
                        <div className="divide-y max-h-40 overflow-y-auto">
                            {invoiceDetails.map((item, index) => (
                                <div key={index} className="px-4 py-2.5 flex items-center justify-between text-xs hover:bg-muted/10">
                                    <div className="min-w-0">
                                        <p className="font-bold text-foreground truncate">{item.product_id?.product_name || `Product #${item.product_id}`}</p>
                                        <p className="text-[9px] text-muted-foreground mt-0.5">
                                            Code: {item.product_id?.product_code || "N/A"} | UOM: {item.product_id?.uom || "PCS"}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-black text-foreground">{item.quantity} × ₱{Number(item.unit_price || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                                        <p className="text-[9px] text-emerald-600 font-bold mt-0.5">₱{Number(item.net_amount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Cost Ledger breakdown */}
                    <div className="flex flex-col sm:flex-row gap-4 justify-between items-start">
                        {/* Remaining balance highlights */}
                        <div className="w-full sm:flex-1 bg-muted/5 border rounded-xl p-4 space-y-2 text-xs">
                            <div className="flex justify-between font-bold text-foreground">
                                <span>Net Invoiced Balance:</span>
                                <span>₱{invoice.net_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>
                            <div className="flex justify-between text-emerald-600 font-bold">
                                <span>Total Collected Amount:</span>
                                <span>₱{totalPaid.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>
                            <div className="border-t pt-2 flex justify-between font-black text-xs text-primary">
                                <span>Outstanding Due:</span>
                                <span>₱{remainingBalance.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>
                        </div>

                        <div className="w-full sm:max-w-xs bg-muted/10 border rounded-xl p-4 space-y-2 text-xs">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Subtotal Gross:</span>
                                <span className="font-bold">₱{invoice.total_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">VAT (12%):</span>
                                <span className="font-bold">₱{invoice.vat_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>
                            {invoice.discount_amount > 0 && (
                                <div className="flex justify-between text-rose-600 font-medium">
                                    <span>Discount:</span>
                                    <span>-₱{invoice.discount_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                </div>
                            )}
                            <div className="border-t pt-2 flex justify-between font-black text-sm text-foreground">
                                <span>Total Invoiced:</span>
                                <span>₱{invoice.net_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                            </div>
                        </div>
                    </div>

                    {/* Payment History Log */}
                    {payments.length > 0 && (
                        <div className="border rounded-xl overflow-hidden">
                            <div className="bg-muted/30 px-4 py-2 border-b">
                                <span className="text-[9px] font-extrabold uppercase text-muted-foreground tracking-wider">Payment Collection History</span>
                            </div>
                            <div className="divide-y max-h-32 overflow-y-auto">
                                {payments.map((p: PaymentHistoryItem, idx: number) => (
                                    <div key={idx} className="px-4 py-2 flex justify-between items-center text-xs hover:bg-muted/5">
                                        <div>
                                            <p className="font-bold text-foreground">{p.method} (Ref: {p.reference || "N/A"})</p>
                                            <p className="text-[9px] text-muted-foreground mt-0.5">{new Date(p.date).toLocaleString()}</p>
                                        </div>
                                        <div className="text-right font-black text-emerald-600">
                                            ₱{Number(p.amount).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Remarks Log */}
                    {invoice.remarks && (
                        <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl p-4">
                            <span className="text-[9px] font-bold text-amber-500 uppercase block mb-1">Audit Ledger Remarks</span>
                            <p className="text-xs text-muted-foreground whitespace-pre-line leading-relaxed">{invoice.remarks}</p>
                        </div>
                    )}


                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-muted/20 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        {invoice.status !== "Cancelled" && invoice.status !== "Paid" && (
                            <button
                                type="button"
                                disabled={cancelling || loadingDetails}
                                onClick={async () => {
                                    if (confirm("Are you sure you want to cancel this invoice? This will revert the Sales Order status to allow billing again.")) {
                                        setCancelling(true);
                                        try {
                                            const success = await onCancelInvoice(invoice.invoice_id);
                                            if (success) {
                                                onClose();
                                            }
                                        } finally {
                                            setCancelling(false);
                                        }
                                    }
                                }}
                                className="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-600 hover:text-rose-700 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {cancelling ? "Cancelling..." : "Cancel Invoice"}
                            </button>
                        )}
                    </div>

                    {receiptError && (
                        <span className="text-xs font-bold text-rose-600 truncate max-w-xs">{receiptError}</span>
                    )}

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handlePrintReceipt}
                            disabled={loadingDetails || printingReceipt}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground border-none px-4 py-2 rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {printingReceipt ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                            {printingReceipt ? "Generating Receipt..." : "Print Receipt"}
                        </button>
                    </div>
                </div>
            </div>

            {/* ========================================================================= */}
            {/* 🖨️ DETAILED PRINT BLUEPRINT (Visible only during window.print())          */}
            {/* ========================================================================= */}
            <div 
                id="invoice-print-blueprint"
                className="hidden print:block absolute left-0 top-0 font-mono text-black select-none pointer-events-none"
                style={{
                    width: "215mm",
                    height: "279mm",
                    fontSize: `${alignment.fontSize}pt`,
                    lineHeight: "1.2"
                }}
            >
                {/* 1. Invoice Date */}
                <div 
                    className="absolute font-bold"
                    style={{
                        left: `${alignment.leftMargin + alignment.offsets.invoiceDate.x}mm`,
                        top: `${alignment.topMargin + alignment.offsets.invoiceDate.y}mm`,
                    }}
                >
                    {new Date(invoice.invoice_date).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' })}
                </div>

                {/* 2. Invoice Number */}
                <div 
                    className="absolute font-bold"
                    style={{
                        left: `${alignment.leftMargin + alignment.offsets.invoiceNo.x}mm`,
                        top: `${alignment.topMargin + alignment.offsets.invoiceNo.y}mm`,
                    }}
                >
                    {invoice.invoice_no}
                </div>

                {/* 3. Customer Name */}
                <div 
                    className="absolute font-bold"
                    style={{
                        left: `${alignment.leftMargin + alignment.offsets.customerName.x}mm`,
                        top: `${alignment.topMargin + alignment.offsets.customerName.y}mm`,
                    }}
                >
                    {invoice.customer_name || "N/A"}
                </div>

                {/* 3b. Customer Address */}
                <div 
                    className="absolute"
                    style={{
                        left: `${alignment.leftMargin + alignment.offsets.customerAddress.x}mm`,
                        top: `${alignment.topMargin + alignment.offsets.customerAddress.y}mm`,
                    }}
                >
                    {invoice.customer_address || ""}
                </div>

                {/* 3c. Customer TIN */}
                <div 
                    className="absolute"
                    style={{
                        left: `${alignment.leftMargin + alignment.offsets.customerTin.x}mm`,
                        top: `${alignment.topMargin + alignment.offsets.customerTin.y}mm`,
                    }}
                >
                    {invoice.customer_tin || ""}
                </div>

                {/* 4. Terms */}
                <div 
                    className="absolute"
                    style={{
                        left: `${alignment.leftMargin + alignment.offsets.terms.x}mm`,
                        top: `${alignment.topMargin + alignment.offsets.terms.y}mm`,
                    }}
                >
                    {invoice.sales_order_no ? `SO: ${invoice.sales_order_no}` : "Cash on Delivery"}
                </div>

                {/* 5. Invoiced Items Loop */}
                {invoiceDetails.map((item, idx) => {
                    const rowY = alignment.topMargin + alignment.offsets.tableStart.y + (idx * alignment.lineHeight);
                    return (
                        <React.Fragment key={idx}>
                            {/* Quantity */}
                            <div 
                                className="absolute text-right"
                                style={{
                                    left: `${alignment.leftMargin + alignment.offsets.colQty.x}mm`,
                                    top: `${rowY}mm`,
                                    width: "12mm"
                                }}
                            >
                                {item.quantity}
                            </div>
                            
                            {/* UOM */}
                            <div 
                                className="absolute"
                                style={{
                                    left: `${alignment.leftMargin + alignment.offsets.colUnit.x}mm`,
                                    top: `${rowY}mm`,
                                }}
                            >
                                {item.product_id?.uom || "PCS"}
                            </div>

                            {/* Description */}
                            <div 
                                className="absolute truncate"
                                style={{
                                    left: `${alignment.leftMargin + alignment.offsets.colDescription.x}mm`,
                                    top: `${rowY}mm`,
                                    width: "75mm"
                                }}
                            >
                                {item.product_id?.product_name || `Product #${item.product_id}`}
                            </div>

                            {/* Unit Price */}
                            <div 
                                className="absolute text-right"
                                style={{
                                    left: `${alignment.leftMargin + alignment.offsets.colUnitPrice.x}mm`,
                                    top: `${rowY}mm`,
                                    width: "22mm"
                                }}
                            >
                                {Number(item.unit_price).toFixed(2)}
                            </div>

                            {/* Net Amount */}
                            <div 
                                className="absolute text-right"
                                style={{
                                    left: `${alignment.leftMargin + alignment.offsets.colAmount.x}mm`,
                                    top: `${rowY}mm`,
                                    width: "25mm"
                                }}
                            >
                                {Number(item.net_amount).toFixed(2)}
                            </div>
                        </React.Fragment>
                    );
                })}

                {/* 6. Total Amount */}
                <div 
                    className="absolute font-extrabold text-right"
                    style={{
                        left: `${alignment.leftMargin + alignment.offsets.totalAmount.x}mm`,
                        top: `${alignment.topMargin + alignment.offsets.totalAmount.y}mm`,
                        width: "30mm"
                    }}
                >
                    ₱{invoice.net_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
            </div>
        </div>
    );
}
