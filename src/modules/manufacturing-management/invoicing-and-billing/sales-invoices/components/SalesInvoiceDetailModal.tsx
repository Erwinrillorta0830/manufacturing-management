"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    Building2,
    Calendar,
    Receipt,
    Loader2,
} from "lucide-react";
import { SalesInvoiceHeader, SalesInvoiceDetail } from "../types";

interface SalesInvoiceDetailModalProps {
    invoice: SalesInvoiceHeader | null;
    invoiceDetails: SalesInvoiceDetail[];
    isOpen: boolean;
    onClose: () => void;
    loadingDetails: boolean;
}

export default function SalesInvoiceDetailModal({
    invoice,
    invoiceDetails,
    isOpen,
    onClose,
    loadingDetails,
}: SalesInvoiceDetailModalProps) {
    const [now] = useState(() => Date.now());

    if (!isOpen || !invoice) return null;

    const netAmount = Number(invoice.net_amount);
    const grossAmount = Number(invoice.gross_amount);
    const vatAmount = Number(invoice.vat_amount);
    const paidAmount = Number(invoice.paid_amount);
    const remainingBalance = Math.max(0, netAmount - paidAmount);

    const daysElapsed = (() => {
        if (!invoice.invoice_date) return "N/A";
        const invDate = new Date(invoice.invoice_date).getTime();
        if (isNaN(invDate)) return "N/A";
        const diffDays = Math.floor((now - invDate) / (1000 * 60 * 60 * 24));
        return diffDays < 0 ? "0 Days" : `${diffDays} Day${diffDays === 1 ? "" : "s"}`;
    })();

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Print CSS Rules to isolate printable A4 document */}
                    <style jsx global>{`
                        @media print {
                            body {
                                background: #ffffff !important;
                                color: #000000 !important;
                            }
                            /* Hide all screen UI elements including modals, backdrops, topbars */
                            body > *:not(#printable-sales-invoice-root),
                            .no-print,
                            header,
                            main,
                            nav,
                            aside {
                                display: none !important;
                                visibility: hidden !important;
                            }
                            #printable-sales-invoice-root {
                                display: block !important;
                                visibility: visible !important;
                                position: absolute !important;
                                left: 0 !important;
                                top: 0 !important;
                                width: 100% !important;
                                margin: 0 !important;
                                padding: 0 !important;
                                background: #ffffff !important;
                            }
                            #printable-sales-invoice-root * {
                                visibility: visible !important;
                            }
                            @page {
                                size: A4 portrait;
                                margin: 12mm 15mm 15mm 15mm;
                            }
                        }
                    `}</style>

                    {/* SCREEN MODAL DIALOG */}
                    <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 15 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 15 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            className="relative w-full max-w-6xl h-[95vh] max-h-[96vh] flex flex-col rounded-2xl border bg-card shadow-2xl overflow-hidden"
                        >
                            {/* Modal Header Bar */}
                            <div className="flex items-center justify-between border-b px-6 py-4 bg-muted/30">
                                <div className="flex items-center gap-3">
                                    <div className="rounded-xl p-2.5 bg-primary/10 text-primary">
                                        <Receipt className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2.5">
                                            <h3 className="text-xl font-black tracking-tight">
                                                {invoice.invoice_no}
                                            </h3>
                                            <span
                                                className={`rounded-full px-3 py-0.5 text-xs font-black uppercase border ${
                                                    invoice.status === "Paid"
                                                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                                        : invoice.status === "Partially Paid"
                                                        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                                        : invoice.status === "Cancelled"
                                                        ? "bg-muted text-muted-foreground border-muted-foreground/30"
                                                        : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                                                }`}
                                            >
                                                {invoice.status}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground font-medium">
                                            Financial Management Sales Invoice Report View
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    
                                    <button
                                        onClick={onClose}
                                        className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Modal Body with Spacious Layout */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                {/* PROMINENT FINANCIAL KPI SUMMARY CARDS (Un-squeezed) */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="rounded-2xl border bg-background p-4 shadow-2xs space-y-1">
                                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                                            Gross Billed
                                        </span>
                                        <h4 className="text-xl font-black text-foreground">
                                            ₱{grossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </h4>
                                        <span className="text-[10px] text-muted-foreground">Before Tax / Deductions</span>
                                    </div>

                                    <div className="rounded-2xl border bg-background p-4 shadow-2xs space-y-1">
                                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                                            VAT Amount (12%)
                                        </span>
                                        <h4 className="text-xl font-black text-blue-600">
                                            ₱{vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </h4>
                                        <span className="text-[10px] text-muted-foreground">Value Added Tax</span>
                                    </div>

                                    <div className="rounded-2xl border bg-primary/5 border-primary/20 p-4 shadow-2xs space-y-1">
                                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-primary">
                                            Net Invoice Total
                                        </span>
                                        <h4 className="text-2xl font-black text-primary">
                                            ₱{netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </h4>
                                        <span className="text-[10px] font-medium text-muted-foreground">Total Revenue Amount</span>
                                    </div>

                                    <div className="rounded-2xl border bg-background p-4 shadow-2xs space-y-1">
                                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                                            Remaining Balance
                                        </span>
                                        <h4 className={`text-2xl font-black ${remainingBalance > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                                            ₱{remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </h4>
                                        <span className="text-[10px] text-muted-foreground">
                                            {remainingBalance > 0 ? "Pending Collection" : "Fully Settled"}
                                        </span>
                                    </div>
                                </div>

                                {/* 2-COLUMN SPACIOUS METADATA SECTION */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Left: Customer Account Details */}
                                    <div className="rounded-2xl border bg-background p-5 space-y-3 shadow-2xs">
                                        <div className="flex items-center gap-2 border-b pb-2 text-xs font-bold text-muted-foreground uppercase">
                                            <Building2 className="h-4 w-4 text-primary" />
                                            Customer Account Information
                                        </div>
                                        <div className="space-y-2">
                                            <div>
                                                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Customer Name</span>
                                                <h4 className="text-base font-black text-foreground">{invoice.customer_name}</h4>
                                            </div>
                                            <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                                                <div>
                                                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Customer Code</span>
                                                    <span className="font-bold text-foreground">{invoice.customer_code}</span>
                                                </div>
                                                <div>
                                                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Tax Identification No (TIN)</span>
                                                    <span className="font-bold text-foreground">{invoice.customer_tin}</span>
                                                </div>
                                            </div>
                                            <div className="pt-1">
                                                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Billing Address</span>
                                                <span className="text-xs font-medium text-foreground">{invoice.customer_address}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Document & Salesman References */}
                                    <div className="rounded-2xl border bg-background p-5 space-y-3 shadow-2xs">
                                        <div className="flex items-center gap-2 border-b pb-2 text-xs font-bold text-muted-foreground uppercase">
                                            <Calendar className="h-4 w-4 text-primary" />
                                            Document & Sales Audit References
                                        </div>
                                        <div className="space-y-2.5 text-xs">
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground font-semibold">Sales Order Reference:</span>
                                                <span className="font-extrabold text-primary">{invoice.sales_order_no || "-"}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground font-semibold">Assigned Salesman:</span>
                                                <span className="font-bold text-foreground">
                                                    {invoice.salesman_name || "Unassigned"}
                                                    {invoice.salesman_code && invoice.salesman_code !== "N/A" ? ` (${invoice.salesman_code})` : ""}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground font-semibold">Invoice Date:</span>
                                                <span className="font-medium text-foreground">{new Date(invoice.invoice_date).toLocaleDateString()}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-muted-foreground font-semibold">Due Date:</span>
                                                <span className="font-medium text-foreground">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "N/A"}</span>
                                            </div>
                                            <div className="flex items-center justify-between pt-1 border-t">
                                                <span className="text-muted-foreground font-bold">Days Elapsed:</span>
                                                <span className="font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full text-xs">
                                                    {daysElapsed}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ITEMIZED LINE ITEMS TABLE */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                                        Itemized Products & Line Details
                                    </h4>

                                    <div className="rounded-2xl border bg-background overflow-hidden shadow-2xs">
                                        {loadingDetails ? (
                                            <div className="flex items-center justify-center py-12 space-x-2 text-muted-foreground">
                                                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                                <span className="text-xs font-medium">Loading line items...</span>
                                            </div>
                                        ) : invoiceDetails.length === 0 ? (
                                            <div className="py-10 text-center text-xs text-muted-foreground">
                                                No line items found for this invoice.
                                            </div>
                                        ) : (
                                            <table className="w-full border-collapse text-left text-xs">
                                                <thead>
                                                    <tr className="border-b bg-muted/30 text-muted-foreground uppercase text-[10px] font-extrabold">
                                                        <th className="p-3.5">Product Name</th>
                                                        <th className="p-3.5">Item Code</th>
                                                        <th className="p-3.5 text-center">UOM</th>
                                                        <th className="p-3.5 text-right">Qty</th>
                                                        <th className="p-3.5 text-right">Unit Price</th>
                                                        <th className="p-3.5 text-right">Gross Total</th>
                                                        <th className="p-3.5 text-right">Net Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {invoiceDetails.map((detail, idx) => (
                                                        <tr key={detail.id || idx} className="hover:bg-muted/10 transition-colors">
                                                            <td className="p-3.5 font-bold text-foreground">
                                                                {detail.product?.description || "N/A"}
                                                            </td>
                                                            <td className="p-3.5 text-muted-foreground font-mono">
                                                                {detail.product?.product_code || "N/A"}
                                                            </td>
                                                            <td className="p-3.5 text-center font-medium">
                                                                {detail.product?.uom }
                                                            </td>
                                                            <td className="p-3.5 text-right font-black">
                                                                {detail.quantity}
                                                            </td>
                                                            <td className="p-3.5 text-right">
                                                                ₱{Number(detail.unit_price  ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="p-3.5 text-right">
                                                                ₱{Number(detail.gross_amount  ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="p-3.5 text-right font-black text-foreground">
                                                                ₱{Number(detail.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>

                                {/* PAYMENT HISTORY LOGS */}
                                <div className="space-y-3">
                                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                                        Payment History & Collection Logs
                                    </h4>

                                    {invoice.payment_history && invoice.payment_history.length > 0 ? (
                                        <div className="rounded-2xl border bg-background overflow-hidden shadow-2xs">
                                            <table className="w-full border-collapse text-left text-xs">
                                                <thead>
                                                    <tr className="border-b bg-muted/30 text-muted-foreground uppercase text-[10px] font-extrabold">
                                                        <th className="p-3.5">Payment Date</th>
                                                        <th className="p-3.5">Method</th>
                                                        <th className="p-3.5">Reference / OR</th>
                                                        <th className="p-3.5 text-right">Amount Paid</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y">
                                                    {invoice.payment_history.map((pay, i) => (
                                                        <tr key={i} className="hover:bg-muted/10">
                                                            <td className="p-3.5 text-muted-foreground">
                                                                {new Date(pay.date).toLocaleString()}
                                                            </td>
                                                            <td className="p-3.5 font-semibold">{pay.method}</td>
                                                            <td className="p-3.5 font-mono text-muted-foreground">
                                                                {pay.reference || "N/A"}
                                                            </td>
                                                            <td className="p-3.5 text-right font-black text-emerald-600">
                                                                ₱{Number(pay.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="rounded-2xl border bg-background p-4 text-center text-xs text-muted-foreground">
                                            No collection payments recorded for this invoice.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="flex items-center justify-end border-t px-6 py-4 bg-muted/30">
 

                                <button
                                    onClick={onClose}
                                    className="rounded-xl bg-primary px-6 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors shadow-2xs"
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </div>

                    {/* DEDICATED FORMAL A4 PRINTABLE DOCUMENT TEMPLATE */}
                    <div id="printable-sales-invoice-root" className="hidden">
                        <div className="w-full max-w-[210mm] mx-auto p-4 font-sans text-black bg-white leading-tight">
                            {/* Formal Company Header */}
                            <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-4">
                                <div>
                                    <h1 className="text-xl font-black tracking-wider uppercase">
                                        VOS ERP MANUFACTURING
                                    </h1>
                                    <p className="text-xs font-bold text-gray-700">
                                        FINANCIAL MANAGEMENT & ACCOUNTING DIVISION
                                    </p>
                                    <p className="text-[10px] text-gray-600 mt-1">
                                        Official Sales Invoice Financial Statement
                                    </p>
                                </div>
                                <div className="text-right">
                                    <h2 className="text-2xl font-black tracking-tight uppercase text-black">
                                        SALES INVOICE
                                    </h2>
                                    <div className="text-sm font-bold text-gray-900 mt-0.5">
                                        NO: {invoice.invoice_no}
                                    </div>
                                    <div className="text-xs font-bold mt-1 uppercase">
                                        STATUS: <span className="border border-black px-2 py-0.5">{invoice.status}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Two-Column Billed To & Reference Box */}
                            <div className="grid grid-cols-2 gap-4 border border-gray-400 p-3 mb-4 text-xs">
                                <div>
                                    <h3 className="font-extrabold uppercase border-b border-gray-300 pb-1 mb-1.5 text-[11px]">
                                        BILLED TO (CUSTOMER ACCOUNT)
                                    </h3>
                                    <div className="font-black text-sm">{invoice.customer_name}</div>
                                    <div><span className="font-bold">Customer Code:</span> {invoice.customer_code}</div>
                                    <div><span className="font-bold">TIN:</span> {invoice.customer_tin || "N/A"}</div>
                                    <div className="mt-1"><span className="font-bold">Address:</span> {invoice.customer_address}</div>
                                </div>

                                <div className="border-l border-gray-300 pl-4">
                                    <h3 className="font-extrabold uppercase border-b border-gray-300 pb-1 mb-1.5 text-[11px]">
                                        INVOICE AUDIT & REFERENCES
                                    </h3>
                                    <div><span className="font-bold">Sales Order No:</span> {invoice.sales_order_no || "-"}</div>
                                    <div><span className="font-bold">Salesman:</span> {invoice.salesman_name || "Unassigned"} ({invoice.salesman_code || "N/A"})</div>
                                    <div><span className="font-bold">Invoice Date:</span> {new Date(invoice.invoice_date).toLocaleDateString()}</div>
                                    <div><span className="font-bold">Due Date:</span> {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : "N/A"}</div>
                                    <div><span className="font-bold">Days Elapsed:</span> {daysElapsed}</div>
                                </div>
                            </div>

                            {/* Itemized Line Items Table for A4 Print */}
                            <div className="mb-4">
                                <h3 className="font-extrabold uppercase text-[11px] mb-1">
                                    ITEMIZED LINE DETAILS
                                </h3>
                                <table className="w-full border-collapse text-xs border border-gray-400">
                                    <thead>
                                        <tr className="bg-gray-200 border-b border-gray-400 font-extrabold text-[10px] uppercase">
                                            <th className="p-2 border-r border-gray-400 text-left">#</th>
                                            <th className="p-2 border-r border-gray-400 text-left">Item Description</th>
                                            <th className="p-2 border-r border-gray-400 text-left">Code</th>
                                            <th className="p-2 border-r border-gray-400 text-center">UOM</th>
                                            <th className="p-2 border-r border-gray-400 text-right">Qty</th>
                                            <th className="p-2 border-r border-gray-400 text-right">Unit Price</th>
                                            <th className="p-2 text-right">Net Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invoiceDetails.map((detail, idx) => (
                                            <tr key={idx} className="border-b border-gray-300">
                                                <td className="p-2 border-r border-gray-300 font-mono text-[10px]">{idx + 1}</td>
                                                <td className="p-2 border-r border-gray-300 font-bold">{detail.product?.description || `Product #${detail.id}`}</td>
                                                <td className="p-2 border-r border-gray-300 font-mono">{detail.product?.product_code || "N/A"}</td>
                                                <td className="p-2 border-r border-gray-300 text-center">{detail.product?.uom }</td>
                                                <td className="p-2 border-r border-gray-300 text-right font-bold">{detail.quantity}</td>
                                                <td className="p-2 border-r border-gray-300 text-right">₱{Number(detail.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                                <td className="p-2 text-right font-black">₱{Number(detail.net_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Financial Summary & Subtotal Table */}
                            <div className="flex justify-end mb-6">
                                <div className="w-72 border border-gray-400 text-xs p-3 space-y-1 bg-gray-50">
                                    <div className="flex justify-between">
                                        <span className="font-semibold">Gross Subtotal:</span>
                                        <span>₱{grossAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="font-semibold">VAT Amount (12%):</span>
                                        <span>₱{vatAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between border-t border-gray-400 pt-1 font-black text-sm">
                                        <span>Net Billed Total:</span>
                                        <span>₱{netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="font-semibold">Payments Received:</span>
                                        <span>₱{paidAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between border-t border-gray-400 pt-1 font-black text-sm">
                                        <span>Balance Due:</span>
                                        <span>₱{remainingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Formal Signatures & Footer */}
                            <div className="grid grid-cols-2 gap-8 pt-8 mt-4 border-t border-gray-400 text-xs">
                                <div>
                                    <div className="border-b border-black w-48 mb-1"></div>
                                    <p className="font-bold uppercase text-[10px]">Prepared By / Accountant</p>
                                    <p className="text-[9px] text-gray-500">Financial Management System</p>
                                </div>
                                <div className="text-right">
                                    <div className="border-b border-black w-48 ml-auto mb-1"></div>
                                    <p className="font-bold uppercase text-[10px]">Approved By / Authorizing Officer</p>
                                    <p className="text-[9px] text-gray-500">VOS ERP Administration</p>
                                </div>
                            </div>

                            <div className="text-center text-[9px] text-gray-500 mt-6 pt-2 border-t border-gray-200">
                                Official Computer Generated Document • Generated on {new Date().toLocaleString()}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
