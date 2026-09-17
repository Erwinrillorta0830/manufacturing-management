"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
    FileText, Calendar, CreditCard, Tag, 
    User, Briefcase, Building2, Layers, Loader2, AlertCircle,
    Receipt, RotateCcw, Sparkles, Copy, Check, Wallet, Truck
} from "lucide-react";
import { formatPeso, formatDate, getInvoiceRiskScore, generateCollectionTemplate } from "../utils";
import type { Invoice } from "../types";

interface InvoiceDetailSheetProps {
    invoice: Invoice | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

interface InvoiceMemo {
    id: number;
    invoice_id: number;
    amount: number;
    date_applied: string;
    memo_id?: {
        memo_number?: string;
        type?: number;
        reason?: string;
        status?: string;
    } | null;
}

interface InvoiceReturn {
    id: number;
    invoice_no: number;
    linked_by?: number;
    amount: number;
    created_at?: string;
    updated_at?: string;
    return_no?: {
        return_number?: string;
        return_date?: string;
        remarks?: string;
        status?: string;
        total_amount?: number | string;
        discount_amount?: number | string;
        gross_amount?: number | string;
    } | null;
}

interface InvoiceDetailsPayload {
    header: {
        invoice_id: number;
        order_id?: string;
        customer_code?: string;
        invoice_no?: string;
        invoice_date?: string;
        dispatch_date?: string;
        due_date?: string;
        payment_terms?: number;
        transaction_status?: string;
        payment_status?: string;
        total_amount?: number;
        gross_amount?: number;
        discount_amount?: number;
        net_amount?: number;
        remarks?: string;
        salesman_id?: {
            salesman_name?: string;
        };
        branch_id?: {
            branch_name?: string;
        };
    };
    items: Array<{
        detail_id: number;
        order_id: string;
        serial_no?: string;
        unit_price: number;
        quantity: number;
        discount_amount?: number;
        gross_amount?: number;
        total_amount: number;
        product_id?: {
            product_id?: number;
            product_name?: string;
            product_brand?: {
                brand_name?: string;
            };
            product_category?: {
                category_name?: string;
            };
        };
        unit_details?: {
            unit_id: number;
            unit_name?: string;
            unit_shortcut?: string;
            order?: number;
            sku_code?: string;
        } | null;
        discount_type_details?: {
            id: number;
            discount_type?: string;
            total_percent?: string | number;
        } | null;
    }>;
    payments: Array<{
        id: number;
        order_id: string;
        reference_no?: string;
        paid_amount: number;
        date_paid: string;
        coa_id?: {
            gl_code?: string;
            account_title?: string;
        } | null;
        bank_id?: {
            bank_name?: string;
        } | null;
    }>;
    memos: InvoiceMemo[];
    returns: InvoiceReturn[];
    unfulfilled?: Array<{
        id: number;
        sales_invoice_id: number;
        unfulfilled_amount?: number;
        amount?: number;
        total_amount?: number;
        created_at?: string;
    }>;
}

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
    'Paid':           { bg: 'rgba(16,185,129,0.1)',  color: '#059669' },
    'Overdue':        { bg: 'rgba(239,68,68,0.1)',   color: '#dc2626' },
    'Partially Paid': { bg: 'rgba(245,158,11,0.1)',  color: '#d97706' },
    'Unpaid':         { bg: 'rgba(100,116,139,0.1)', color: '#64748b' },
    'Due':            { bg: 'rgba(100,116,139,0.1)', color: '#64748b' },
};

export function InvoiceDetailSheet({ invoice, open, onOpenChange }: InvoiceDetailSheetProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [data, setData] = useState<InvoiceDetailsPayload | null>(null);
    const [tone, setTone] = useState<'polite' | 'standard' | 'urgent'>('standard');
    const [channel, setChannel] = useState<'email' | 'sms'>('email');
    const [copied, setCopied] = useState(false);

    const riskInfo = useMemo(() => {
        if (!invoice) return null;
        return getInvoiceRiskScore(invoice);
    }, [invoice]);

    const generatedTemplate = useMemo(() => {
        if (!invoice) return "";
        return generateCollectionTemplate(invoice, tone, channel);
    }, [invoice, tone, channel]);

    const handleCopy = () => {
        navigator.clipboard.writeText(generatedTemplate);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    useEffect(() => {
        if (!open || !invoice?.id) {
            setData(null);
            setError(null);
            return;
        }

        async function fetchDetails() {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/manufacturing/financial-management/accounts-receivable/invoice-details?invoiceId=${invoice!.id}`);
                if (!res.ok) {
                    throw new Error(`Failed to fetch details: ${res.statusText}`);
                }
                const json = await res.json();
                if (!json.ok) {
                    throw new Error(json.message || "Failed to load invoice details");
                }
                setData(json);
            } catch (err) {
                console.error("Error fetching invoice details:", err);
                setError(err instanceof Error ? err.message : "An unexpected error occurred");
            } finally {
                setLoading(false);
            }
        }

        fetchDetails();
    }, [open, invoice]);

    const statusStyle = invoice ? (STATUS_STYLES[invoice.status] ?? { bg: 'rgba(100,116,139,0.1)', color: '#64748b' }) : null;

    const groupedItems = useMemo(() => {
        if (!data?.items) return [];
        const groups: Record<string, typeof data.items> = {};
        data.items.forEach((item) => {
            const brand = item.product_id?.product_brand?.brand_name || "Unknown Brand";
            const category = item.product_id?.product_category?.category_name || "Unknown Category";
            const key = `${category} — ${brand}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });
        return Object.entries(groups).map(([groupKey, items]) => ({
            groupKey,
            items,
        }));
    }, [data]);

    const totals = useMemo(() => {
        if (!data) return { paymentsTotal: 0, creditMemosTotal: 0, debitMemosTotal: 0, returnsTotal: 0, unfulfilledTotal: 0 };

        const paymentsTotal = (data.payments || []).reduce((sum: number, p) => sum + (p.paid_amount || 0), 0);
        
        let creditMemosTotal = 0;
        let debitMemosTotal = 0;
        (data.memos || []).forEach((m: InvoiceMemo) => {
            if (m.memo_id?.type === 1) {
                creditMemosTotal += (m.amount || 0);
            } else if (m.memo_id?.type === 0 || m.memo_id?.type === 2) {
                debitMemosTotal += (m.amount || 0);
            }
        });

        const returnsTotal = (data.returns || []).reduce((sum: number, r: InvoiceReturn) => {
            const amt = r.amount > 0 ? r.amount : (r.return_no?.total_amount || 0);
            return sum + Number(amt || 0);
        }, 0);

        const unfulfilledTotal = (data.unfulfilled || []).reduce((sum: number, u) => {
            const amt = u.unfulfilled_amount ?? u.amount ?? u.total_amount ?? 0;
            return sum + Number(amt || 0);
        }, 0);

        return {
            paymentsTotal,
            creditMemosTotal,
            debitMemosTotal,
            returnsTotal,
            unfulfilledTotal
        };
    }, [data]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-full sm:max-w-[640px] overflow-x-hidden overflow-y-auto border-l border-border bg-card p-6 shadow-2xl flex flex-col h-full">
                <SheetHeader className="pb-4 border-b border-border/50">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <SheetTitle className="flex min-w-0 items-center gap-2 text-lg font-bold tracking-tight">
                            <FileText className="h-5 w-5 text-primary" />
                            Invoice Details
                        </SheetTitle>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                            {invoice && invoice.outstanding > 0 && (
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="h-7 text-[10px] font-bold uppercase tracking-wider border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 gap-1.5"
                                    onClick={() => {
                                        const query = new URLSearchParams();
                                        query.set("invoiceNo", invoice.invoiceNo);
                                        query.set("salesman", invoice.salesman);
                                        query.set("customer", invoice.customer);
                                        window.location.href = `/fm/treasury/collection-posting/settlement?${query.toString()}`;
                                    }}
                                >
                                    <Wallet className="h-3 w-3" />
                                    Proceed to Settle
                                </Button>
                            )}
                            {invoice && statusStyle && (
                                <Badge 
                                    className="px-2.5 py-0.5 text-xs font-semibold"
                                    style={{ backgroundColor: statusStyle.bg, color: statusStyle.color, border: `1px solid ${statusStyle.color}30` }}
                                >
                                    {invoice.status}
                                </Badge>
                            )}
                            {invoice && (
                                <Badge 
                                    className={`px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${
                                        invoice.isPosted 
                                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" 
                                            : "bg-amber-500/10 text-amber-600 dark:text-amber-500 border border-amber-500/20"
                                    }`}
                                >
                                    {invoice.isPosted ? "Posted Ledger" : "Draft (Unposted)"}
                                </Badge>
                            )}
                        </div>
                    </div>
                    <SheetDescription className="text-xs text-muted-foreground">
                        {invoice ? `Detailed review of Invoice #${invoice.invoiceNo} (Order #${invoice.orderId})` : "Details of the selected accounts receivable invoice."}
                    </SheetDescription>
                </SheetHeader>

                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2.5 py-12">
                        <Loader2 className="h-8 w-8 text-primary animate-spin" />
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Loading invoice records...</span>
                    </div>
                ) : error ? (
                    <div className="flex-1 flex flex-col items-center justify-center gap-2.5 py-12 text-destructive">
                        <AlertCircle className="h-8 w-8" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Failed to load: {error}</span>
                    </div>
                ) : !invoice ? (
                    <div className="flex-1 flex items-center justify-center py-12 text-muted-foreground text-xs font-medium uppercase tracking-wider">
                        No invoice selected
                    </div>
                ) : (
                    <div className="flex-1 space-y-6 pt-4 min-h-0">
                        {/* 1. HEADER INFO CARDS */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="rounded-xl border border-border/70 bg-gradient-to-b from-card to-muted/20 p-4 space-y-3.5 shadow-sm">
                                <div className="space-y-1 hover:bg-muted/10 p-1 rounded-md transition-colors">
                                    <span className="text-[9px] font-extrabold uppercase text-muted-foreground/80 tracking-widest flex items-center gap-1.5">
                                        <User className="w-3.5 h-3.5 text-primary/70" /> Customer Name
                                    </span>
                                    <p className="break-words text-xs font-bold text-foreground" title={invoice.customer}>
                                        {invoice.customer}
                                    </p>
                                </div>
                                <div className="space-y-1 hover:bg-muted/10 p-1 rounded-md transition-colors">
                                    <span className="text-[9px] font-extrabold uppercase text-muted-foreground/80 tracking-widest flex items-center gap-1.5">
                                        <Building2 className="w-3.5 h-3.5 text-primary/70" /> Cluster
                                    </span>
                                    <p className="break-words text-xs font-bold text-foreground">
                                        {invoice.cluster || 'Unassigned'}
                                    </p>
                                </div>
                                <div className="space-y-1 hover:bg-muted/10 p-1 rounded-md transition-colors">
                                    <span className="text-[9px] font-extrabold uppercase text-muted-foreground/80 tracking-widest flex items-center gap-1.5">
                                        <Briefcase className="w-3.5 h-3.5 text-primary/70" /> Salesman
                                    </span>
                                    <p className="break-words text-xs font-bold text-foreground">
                                        {data?.header?.salesman_id?.salesman_name || invoice.salesman} {invoice.salesmanCode && invoice.salesmanCode !== '—' ? `(${invoice.salesmanCode})` : ''}
                                    </p>
                                </div>
                            </div>

                            <div className="rounded-xl border border-border/70 bg-gradient-to-b from-card to-muted/20 p-4 space-y-3.5 shadow-sm">
                                <div className="space-y-1 hover:bg-muted/10 p-1 rounded-md transition-colors">
                                    <span className="text-[9px] font-extrabold uppercase text-muted-foreground/80 tracking-widest flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-primary/70" /> Invoice Date
                                    </span>
                                    <p className="text-xs font-bold text-foreground font-mono">
                                        {formatDate(invoice.invoiceDate)}
                                    </p>
                                </div>
                                <div className="space-y-1 hover:bg-muted/10 p-1 rounded-md transition-colors">
                                    <span className="text-[9px] font-extrabold uppercase text-muted-foreground/80 tracking-widest flex items-center gap-1.5">
                                        <Truck className="w-3.5 h-3.5 text-primary/70" /> Delivery Date
                                    </span>
                                    <p className="text-xs font-bold text-foreground font-mono">
                                        {formatDate(invoice.deliveryDate)}
                                    </p>
                                </div>
                                <div className="space-y-1 hover:bg-muted/10 p-1 rounded-md transition-colors">
                                    <span className="text-[9px] font-extrabold uppercase text-muted-foreground/80 tracking-widest flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5 text-primary/70" /> Due Date
                                    </span>
                                    <p className="text-xs font-bold text-foreground font-mono">
                                        {formatDate(invoice.due)}
                                    </p>
                                </div>
                                <div className="space-y-1 hover:bg-muted/10 p-1 rounded-md transition-colors">
                                    <span className="text-[9px] font-extrabold uppercase text-muted-foreground/80 tracking-widest flex items-center gap-1.5">
                                        <Layers className="w-3.5 h-3.5 text-primary/70" /> Division
                                    </span>
                                    <p className="text-xs font-bold text-foreground">
                                        {invoice.division}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* 2. TRANSACTION SUMMARY */}
                        <div className="relative overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-950 dark:bg-black text-white p-4 shadow-md">
                            <div className="absolute top-0 right-0 h-32 w-32 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                            <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2 relative z-10">
                                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Financial Snapshot</span>
                                <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-white font-mono font-bold">
                                    SI: #{invoice.invoiceNo}
                                </span>
                            </div>
                            <div className="grid grid-cols-3 gap-4 relative z-10">
                                <div className="space-y-1">
                                    <span className="text-[9px] font-bold uppercase text-zinc-400 tracking-wider">Net Receivable</span>
                                    <p className="text-sm font-black text-white font-mono leading-none">{formatPeso(invoice.netReceivable)}</p>
                                </div>
                                <div className="space-y-1 border-l border-white/10 pl-4">
                                    <span className="text-[9px] font-bold uppercase text-emerald-400 tracking-wider">Amount Paid</span>
                                    <p className="text-sm font-black text-emerald-400 font-mono leading-none">{formatPeso(invoice.totalPaid)}</p>
                                </div>
                                <div className="space-y-1 border-l border-white/10 pl-4">
                                    <span className="text-[9px] font-bold uppercase text-rose-400 tracking-wider">Outstanding</span>
                                    <p className="text-base font-black text-rose-400 font-mono leading-none">{formatPeso(invoice.outstanding)}</p>
                                </div>
                            </div>
                        </div>

                        {/* 3. TABS FOR ITEMS, PAYMENTS, MEMOS, RETURNS & AI ASSISTANT */}
                        <Tabs defaultValue="items" className="w-full flex-1 flex flex-col min-h-0">
                            <TabsList className="flex h-auto min-h-9 w-full min-w-max shrink-0 gap-1 overflow-x-auto rounded-lg bg-muted p-0.5">
                                <TabsTrigger value="items" className="min-h-9 shrink-0 whitespace-nowrap px-2 py-1 text-[10px] font-bold uppercase transition-all">
                                    <Tag className="w-3 h-3 mr-1 hidden sm:inline-block text-primary" /> Items ({data?.items?.length || 0})
                                </TabsTrigger>
                                <TabsTrigger value="payments" className="min-h-9 shrink-0 whitespace-nowrap px-2 py-1 text-[10px] font-bold uppercase transition-all">
                                    <CreditCard className="w-3 h-3 mr-1 hidden sm:inline-block text-emerald-500" /> Pay ({data?.payments?.length || 0})
                                </TabsTrigger>
                                <TabsTrigger value="memos" className="min-h-9 shrink-0 whitespace-nowrap px-2 py-1 text-[10px] font-bold uppercase transition-all">
                                    <Receipt className="w-3 h-3 mr-1 hidden sm:inline-block text-amber-500" /> Memos ({data?.memos?.length || 0})
                                </TabsTrigger>
                                <TabsTrigger value="returns" className="min-h-9 shrink-0 whitespace-nowrap px-2 py-1 text-[10px] font-bold uppercase transition-all">
                                    <RotateCcw className="w-3 h-3 mr-1 hidden sm:inline-block text-rose-500" /> Returns ({data?.returns?.length || 0})
                                </TabsTrigger>
                                <TabsTrigger value="ai" className="min-h-9 shrink-0 whitespace-nowrap px-2 py-1 text-[10px] font-bold uppercase text-purple-600 transition-all dark:text-purple-400">
                                    <Sparkles className="w-3 h-3 mr-1 text-purple-500 animate-pulse hidden sm:inline-block" /> AI Assist
                                </TabsTrigger>
                            </TabsList>

                            {/* Items tab */}
                            <TabsContent value="items" className="flex-1 min-w-0 overflow-y-auto mt-3 border rounded-xl bg-card">
                                <Table className="w-full min-w-[720px] table-fixed">
                                    <TableHeader className="bg-muted/40 sticky top-0 z-10">
                                        <TableRow className="border-b">
                                            <TableHead className="text-xs font-bold w-[35%] py-2.5 pl-4">Product</TableHead>
                                            <TableHead className="text-xs font-bold text-right w-[13%] py-2.5">Unit Price</TableHead>
                                            <TableHead className="text-xs font-bold text-center w-[10%] py-2.5">Qty</TableHead>
                                            <TableHead className="text-xs font-bold text-center w-[14%] py-2.5">Disc. Type</TableHead>
                                            <TableHead className="text-xs font-bold text-right w-[14%] py-2.5">Disc. Amt</TableHead>
                                            <TableHead className="text-xs font-bold text-right w-[14%] py-2.5 pr-4">Net Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {!groupedItems || groupedItems.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                                                    No item records found
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            groupedItems.map((group) => (
                                                <React.Fragment key={group.groupKey}>
                                                    {/* Group Header Row */}
                                                    <TableRow className="bg-muted/30 hover:bg-muted/30 border-b">
                                                        <TableCell colSpan={6} className="py-2 px-4 font-bold text-xs text-primary bg-muted/10 tracking-wider">
                                                            {group.groupKey}
                                                        </TableCell>
                                                    </TableRow>
                                                    {group.items.map((item) => {
                                                        const unitText = item.unit_details?.unit_shortcut || item.unit_details?.unit_name || "pcs";
                                                        const discountTypeText = item.discount_type_details?.discount_type 
                                                            ? `${item.discount_type_details.discount_type} (${Number(item.discount_type_details.total_percent || 0).toFixed(2)}%)` 
                                                             : "None";
                                                        return (
                                                            <TableRow key={item.detail_id} className="border-b/40 hover:bg-muted/10">
                                                                 <TableCell className="py-2.5 pl-4 font-semibold text-xs truncate" title={`${item.product_id?.product_name || "Unknown"} (${unitText})`}>
                                                                     {item.product_id?.product_name || `Product #${item.product_id?.product_id}`}
                                                                     <span className="text-[10px] text-muted-foreground font-normal ml-1">
                                                                         ({unitText})
                                                                     </span>
                                                                 </TableCell>
                                                                <TableCell className="text-right py-2.5 text-xs font-medium text-muted-foreground">
                                                                    {formatPeso(item.unit_price)}
                                                                </TableCell>
                                                                <TableCell className="text-center py-2.5 text-xs font-semibold">
                                                                    {item.quantity}
                                                                </TableCell>
                                                                <TableCell className="text-center py-2.5 text-[11px] text-muted-foreground font-medium truncate" title={discountTypeText}>
                                                                    {discountTypeText}
                                                                </TableCell>
                                                                <TableCell className="text-right py-2.5 text-xs font-medium text-rose-600 dark:text-rose-400">
                                                                    {item.discount_amount && item.discount_amount > 0 ? `-${formatPeso(item.discount_amount)}` : "—"}
                                                                </TableCell>
                                                                <TableCell className="text-right py-2.5 pr-4 text-xs font-bold text-foreground">
                                                                    {formatPeso(item.total_amount)}
                                                                </TableCell>
                                                            </TableRow>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </TabsContent>

                            {/* Payments tab */}
                            <TabsContent value="payments" className="flex-1 min-w-0 overflow-y-auto mt-3 border rounded-xl bg-card">
                                <Table className="w-full min-w-[520px] table-fixed">
                                    <TableHeader className="bg-muted/40 sticky top-0 z-10">
                                        <TableRow className="border-b">
                                            <TableHead className="text-xs font-bold w-[25%] py-2.5 pl-4">Date Paid</TableHead>
                                            <TableHead className="text-xs font-bold w-[45%] py-2.5">Account / Bank</TableHead>
                                            <TableHead className="text-xs font-bold text-right w-[30%] py-2.5 pr-4">Paid Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {!data?.payments || data.payments.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                                                    No payment history found
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            data.payments.map((p) => (
                                                <TableRow key={p.id} className="border-b/40 hover:bg-muted/10">
                                                    <TableCell className="py-2.5 pl-4 text-xs font-medium text-muted-foreground">
                                                        {formatDate(p.date_paid)}
                                                    </TableCell>
                                                    <TableCell className="py-2.5 text-xs font-medium">
                                                        <span className="block font-semibold truncate" title={p.coa_id?.account_title || "Unknown Account"}>
                                                            {p.coa_id?.account_title || "N/A"}
                                                        </span>
                                                        {(p.bank_id?.bank_name || p.reference_no) && (
                                                            <span className="block text-[10px] text-muted-foreground truncate max-w-[240px]">
                                                                {p.bank_id?.bank_name ? `${p.bank_id.bank_name}` : ""}
                                                                {p.bank_id?.bank_name && p.reference_no ? " | " : ""}
                                                                {p.reference_no ? `Ref: ${p.reference_no}` : ""}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right py-2.5 pr-4 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                                        {formatPeso(p.paid_amount)}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </TabsContent>

                            {/* Memos tab */}
                            <TabsContent value="memos" className="flex-1 min-w-0 overflow-y-auto mt-3 border rounded-xl bg-card">
                                <Table className="w-full min-w-[620px] table-fixed">
                                    <TableHeader className="bg-muted/40 sticky top-0 z-10">
                                        <TableRow className="border-b">
                                            <TableHead className="text-xs font-bold w-[25%] py-2.5 pl-4">Date Applied</TableHead>
                                            <TableHead className="text-xs font-bold w-[25%] py-2.5">Memo No.</TableHead>
                                            <TableHead className="text-xs font-bold w-[20%] py-2.5 text-center">Type</TableHead>
                                            <TableHead className="text-xs font-bold w-[30%] py-2.5 pr-4 text-right">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {!data?.memos || data.memos.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                                                    No memo records found
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            data.memos.map((m: InvoiceMemo) => {
                                                const typeLabel = m.memo_id?.type === 1 ? "CREDIT" : (m.memo_id?.type === 0 || m.memo_id?.type === 2) ? "DEBIT" : "UNKNOWN";
                                                const typeColor = m.memo_id?.type === 1 ? "text-emerald-600 dark:text-emerald-400 font-bold" : "text-rose-600 dark:text-rose-400 font-bold";
                                                return (
                                                    <TableRow key={m.id} className="border-b/40 hover:bg-muted/10">
                                                        <TableCell className="py-2.5 pl-4 text-xs font-medium text-muted-foreground">
                                                            {formatDate(m.date_applied)}
                                                        </TableCell>
                                                        <TableCell className="py-2.5 text-xs font-semibold truncate" title={m.memo_id?.memo_number || "N/A"}>
                                                            {m.memo_id?.memo_number || "N/A"}
                                                            {m.memo_id?.reason && (
                                                                <span className="block text-[10px] text-muted-foreground font-normal truncate max-w-[150px]">
                                                                    {m.memo_id.reason}
                                                                </span>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className={`text-center py-2.5 text-xs ${typeColor}`}>
                                                            {typeLabel}
                                                        </TableCell>
                                                        <TableCell className="text-right py-2.5 pr-4 text-xs font-bold">
                                                            {formatPeso(m.amount)}
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </TabsContent>

                            {/* Returns tab */}
                            <TabsContent value="returns" className="flex-1 min-w-0 overflow-y-auto mt-3 border rounded-xl bg-card">
                                <Table className="w-full min-w-[520px] table-fixed">
                                    <TableHeader className="bg-muted/40 sticky top-0 z-10">
                                        <TableRow className="border-b">
                                            <TableHead className="text-xs font-bold w-[25%] py-2.5 pl-4">Date Linked</TableHead>
                                            <TableHead className="text-xs font-bold w-[45%] py-2.5">Return No. / Remarks</TableHead>
                                            <TableHead className="text-xs font-bold w-[30%] py-2.5 pr-4 text-right">Amount</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {!data?.returns || data.returns.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                                                    No sales return history found
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            data.returns.map((r: InvoiceReturn) => (
                                                <TableRow key={r.id} className="border-b/40 hover:bg-muted/10">
                                                    <TableCell className="py-2.5 pl-4 text-xs font-medium text-muted-foreground">
                                                        {formatDate(r.created_at || r.return_no?.return_date)}
                                                    </TableCell>
                                                    <TableCell className="py-2.5 text-xs font-medium truncate">
                                                        <span className="block font-semibold truncate" title={r.return_no?.return_number || "N/A"}>
                                                            {r.return_no?.return_number || "N/A"}
                                                        </span>
                                                        {r.return_no?.remarks && (
                                                            <span className="block text-[10px] text-muted-foreground truncate max-w-[240px]">
                                                                {r.return_no.remarks}
                                                            </span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right py-2.5 pr-4 text-xs font-bold text-rose-600 dark:text-rose-400">
                                                        {formatPeso(r.amount > 0 ? r.amount : Number(r.return_no?.total_amount || 0))}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </TabsContent>

                            {/* AI Assist tab */}
                            <TabsContent value="ai" className="flex-1 overflow-auto mt-3 border rounded-xl bg-card p-4 space-y-4">
                                {riskInfo && (
                                    <div className="space-y-3">
                                        {/* Risk Assessment Box */}
                                        <div className={`p-3 rounded-lg border ${
                                            riskInfo.level === 'High' 
                                                ? 'bg-rose-500/5 border-rose-500/20 text-rose-800 dark:text-rose-200' 
                                                : riskInfo.level === 'Medium'
                                                    ? 'bg-amber-500/5 border-amber-500/20 text-amber-800 dark:text-amber-200'
                                                    : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-800 dark:text-emerald-200'
                                        }`}>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-[10px] font-black uppercase tracking-wider">AI Risk Assessment</span>
                                                <Badge className={`text-[10px] font-black uppercase ${
                                                    riskInfo.level === 'High' 
                                                        ? 'bg-rose-500 text-white' 
                                                        : riskInfo.level === 'Medium'
                                                            ? 'bg-amber-500 text-black'
                                                            : 'bg-emerald-500 text-white'
                                                }`}>
                                                    {riskInfo.level} Risk ({riskInfo.score}%)
                                                </Badge>
                                            </div>
                                            <p className="text-[11px] leading-relaxed font-medium">
                                                {riskInfo.reason}
                                            </p>
                                        </div>

                                        {/* Action Plan & Reminder Generator */}
                                        <div className="space-y-3">
                                            <div className="border-t border-border/40 pt-3 space-y-2">
                                                <span className="text-[10px] font-black uppercase tracking-wider text-primary">Collection Assistant</span>
                                                <div className="flex items-center gap-2">
                                                    {/* Tone Select */}
                                                    <div className="flex-1 space-y-1">
                                                        <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Tone</span>
                                                        <div className="flex rounded-lg border border-border overflow-hidden h-7 bg-muted/40">
                                                            {(['polite', 'standard', 'urgent'] as const).map((t) => (
                                                                <button
                                                                    key={t}
                                                                    type="button"
                                                                    onClick={() => setTone(t)}
                                                                    className={`flex-1 text-[9px] font-bold uppercase transition-all ${
                                                                        tone === t 
                                                                            ? 'bg-primary text-primary-foreground font-black' 
                                                                            : 'hover:bg-muted text-muted-foreground'
                                                                    }`}
                                                                >
                                                                    {t}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Channel Select */}
                                                    <div className="flex-1 space-y-1">
                                                        <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Channel</span>
                                                        <div className="flex rounded-lg border border-border overflow-hidden h-7 bg-muted/40">
                                                            {(['email', 'sms'] as const).map((c) => (
                                                                <button
                                                                    key={c}
                                                                    type="button"
                                                                    onClick={() => setChannel(c)}
                                                                    className={`flex-1 text-[9px] font-bold uppercase transition-all ${
                                                                        channel === c 
                                                                            ? 'bg-primary text-primary-foreground font-black' 
                                                                            : 'hover:bg-muted text-muted-foreground'
                                                                    }`}
                                                                >
                                                                    {c}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Generated Output */}
                                            <div className="space-y-1.5 relative group">
                                                <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wider">Generated Draft</span>
                                                <div className="rounded-lg border border-purple-500/20 bg-purple-500/[0.02] dark:bg-purple-500/[0.01] p-3 text-[11px] leading-relaxed font-mono whitespace-pre-wrap select-all max-h-[180px] overflow-y-auto">
                                                    {generatedTemplate}
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={handleCopy}
                                                    className="absolute top-7 right-2.5 h-6 px-2 text-[9px] font-bold uppercase bg-background shadow-sm border-purple-500/20 text-purple-600 dark:text-purple-400 hover:bg-purple-500/10"
                                                >
                                                    {copied ? (
                                                        <>
                                                            <Check className="w-3 h-3 mr-1 text-emerald-500" /> Copied
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy className="w-3 h-3 mr-1" /> Copy Draft
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </TabsContent>
                        </Tabs>

                        {/* 4. TOTALS SUMMARY METRICS CARD */}
                        {data?.header && (() => {
                            const grossSubtotal = data.header.gross_amount ?? invoice.grossAmount ?? 0;
                            const discountAmount = data.header.discount_amount ?? invoice.discountAmount ?? 0;
                            const netAmount = grossSubtotal - discountAmount;
                            const calculatedOutstanding = Math.max(
                                0,
                                netAmount 
                                - totals.creditMemosTotal 
                                + totals.debitMemosTotal 
                                - totals.returnsTotal 
                                - totals.paymentsTotal
                                - totals.unfulfilledTotal
                            );

                            const varianceGross = (invoice.grossAmount ?? 0) - grossSubtotal;
                            const varianceDiscount = (invoice.discountAmount ?? 0) - discountAmount;
                            const varianceNet = (invoice.netReceivable ?? 0) - netAmount;
                            const varianceCreditMemos = (invoice.appliedCreditMemos ?? 0) - totals.creditMemosTotal;
                            const varianceDebitMemos = (invoice.appliedDebitMemos ?? 0) - totals.debitMemosTotal;
                            const varianceReturns = (invoice.returnAmount ?? 0) - totals.returnsTotal;
                            const varianceUnfulfilled = (invoice.unfulfilledAmount ?? 0) - totals.unfulfilledTotal;
                            const variancePayments = (invoice.totalPaid ?? 0) - totals.paymentsTotal;
                            const varianceOutstanding = (invoice.outstanding ?? 0) - calculatedOutstanding;

                            return (
                                <div className="rounded-xl border border-border bg-muted/10 p-4 space-y-3.5 text-xs shrink-0">
                                    <div className="flex items-center justify-between pb-1 border-b border-border/50">
                                        <span className="font-bold text-[10px] uppercase tracking-wider text-primary">Accrual Ledger Reconciliation</span>
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${Math.abs(varianceOutstanding) < 0.01 ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                                            {Math.abs(varianceOutstanding) < 0.01 ? 'Balanced (Reconciled)' : 'Variance Detected'}
                                        </span>
                                    </div>
                                    
                                    <div className="grid grid-cols-4 font-semibold text-[10px] uppercase text-muted-foreground tracking-wider border-b border-border/20 pb-1.5">
                                        <span className="col-span-1">Category</span>
                                        <span className="text-right">Ledger (View)</span>
                                        <span className="text-right">Itemized (Live)</span>
                                        <span className="text-right">Variance</span>
                                    </div>

                                    <div className="space-y-1.5">
                                        {/* Gross */}
                                        <div className="grid grid-cols-4 text-muted-foreground">
                                            <span className="col-span-1 font-medium">Gross Sales</span>
                                            <span className="text-right font-mono">{formatPeso(invoice.grossAmount ?? 0)}</span>
                                            <span className="text-right font-mono">{formatPeso(grossSubtotal)}</span>
                                            <span className={`text-right font-mono font-semibold ${Math.abs(varianceGross) > 0.01 ? 'text-rose-500' : ''}`}>
                                                {formatPeso(varianceGross)}
                                            </span>
                                        </div>
                                        {/* Discount */}
                                        <div className="grid grid-cols-4 text-muted-foreground">
                                            <span className="col-span-1 font-medium">Discounts</span>
                                            <span className="text-right font-mono text-rose-600 dark:text-rose-400">-{formatPeso(invoice.discountAmount ?? 0)}</span>
                                            <span className="text-right font-mono text-rose-600 dark:text-rose-400">-{formatPeso(discountAmount)}</span>
                                            <span className={`text-right font-mono font-semibold ${Math.abs(varianceDiscount) > 0.01 ? 'text-rose-500' : ''}`}>
                                                {formatPeso(varianceDiscount)}
                                            </span>
                                        </div>
                                        {/* Net Revenue */}
                                        <div className="grid grid-cols-4 text-foreground font-bold border-t border-border/20 pt-1.5">
                                            <span className="col-span-1">Net Receivable</span>
                                            <span className="text-right font-mono">{formatPeso(invoice.netReceivable ?? 0)}</span>
                                            <span className="text-right font-mono">{formatPeso(netAmount)}</span>
                                            <span className={`text-right font-mono ${Math.abs(varianceNet) > 0.01 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                {formatPeso(varianceNet)}
                                            </span>
                                        </div>
                                        {/* Credit Memos */}
                                        {(invoice.appliedCreditMemos > 0 || totals.creditMemosTotal > 0) && (
                                            <div className="grid grid-cols-4 text-muted-foreground pt-1">
                                                <span className="col-span-1 font-medium">Credit Memos</span>
                                                <span className="text-right font-mono text-rose-600 dark:text-rose-400">-{formatPeso(invoice.appliedCreditMemos)}</span>
                                                <span className="text-right font-mono text-rose-600 dark:text-rose-400">-{formatPeso(totals.creditMemosTotal)}</span>
                                                <span className={`text-right font-mono font-semibold ${Math.abs(varianceCreditMemos) > 0.01 ? 'text-rose-500' : ''}`}>
                                                    {formatPeso(varianceCreditMemos)}
                                                </span>
                                            </div>
                                        )}
                                        {/* Debit Memos */}
                                        {(invoice.appliedDebitMemos > 0 || totals.debitMemosTotal > 0) && (
                                            <div className="grid grid-cols-4 text-muted-foreground">
                                                <span className="col-span-1 font-medium">Debit Memos</span>
                                                <span className="text-right font-mono text-emerald-600 dark:text-emerald-400">+{formatPeso(invoice.appliedDebitMemos)}</span>
                                                <span className="text-right font-mono text-emerald-600 dark:text-emerald-400">+{formatPeso(totals.debitMemosTotal)}</span>
                                                <span className={`text-right font-mono font-semibold ${Math.abs(varianceDebitMemos) > 0.01 ? 'text-rose-500' : ''}`}>
                                                    {formatPeso(varianceDebitMemos)}
                                                </span>
                                            </div>
                                        )}
                                        {/* Returns */}
                                        {(invoice.returnAmount > 0 || totals.returnsTotal > 0) && (
                                            <div className="grid grid-cols-4 text-muted-foreground">
                                                <span className="col-span-1 font-medium">Sales Returns</span>
                                                <span className="text-right font-mono text-rose-600 dark:text-rose-400">-{formatPeso(invoice.returnAmount)}</span>
                                                <span className="text-right font-mono text-rose-600 dark:text-rose-400">-{formatPeso(totals.returnsTotal)}</span>
                                                <span className={`text-right font-mono font-semibold ${Math.abs(varianceReturns) > 0.01 ? 'text-rose-500' : ''}`}>
                                                    {formatPeso(varianceReturns)}
                                                </span>
                                            </div>
                                        )}
                                        {/* Unfulfilled */}
                                        {(invoice.unfulfilledAmount > 0 || totals.unfulfilledTotal > 0) && (
                                            <div className="grid grid-cols-4 text-muted-foreground">
                                                <span className="col-span-1 font-medium">Unfulfilled Adj.</span>
                                                <span className="text-right font-mono text-rose-600 dark:text-rose-400">-{formatPeso(invoice.unfulfilledAmount)}</span>
                                                <span className="text-right font-mono text-rose-600 dark:text-rose-400">-{formatPeso(totals.unfulfilledTotal)}</span>
                                                <span className={`text-right font-mono font-semibold ${Math.abs(varianceUnfulfilled) > 0.01 ? 'text-rose-500' : ''}`}>
                                                    {formatPeso(varianceUnfulfilled)}
                                                </span>
                                            </div>
                                        )}
                                        {/* Payments */}
                                        <div className="grid grid-cols-4 text-muted-foreground">
                                            <span className="col-span-1 font-medium">Payments Paid</span>
                                            <span className="text-right font-mono text-emerald-600 dark:text-emerald-400">-{formatPeso(invoice.totalPaid)}</span>
                                            <span className="text-right font-mono text-emerald-600 dark:text-emerald-400">-{formatPeso(totals.paymentsTotal)}</span>
                                            <span className={`text-right font-mono font-semibold ${Math.abs(variancePayments) > 0.01 ? 'text-rose-500' : ''}`}>
                                                {formatPeso(variancePayments)}
                                            </span>
                                        </div>
                                        {/* Outstanding */}
                                        <div className="grid grid-cols-4 text-foreground font-black text-xs border-t-2 border-border/40 pt-2 mt-1">
                                            <span className="col-span-1">Outstanding Balance</span>
                                            <span className="text-right font-mono text-rose-600 dark:text-rose-400">{formatPeso(invoice.outstanding)}</span>
                                            <span className="text-right font-mono text-rose-600 dark:text-rose-400">{formatPeso(calculatedOutstanding)}</span>
                                            <span className={`text-right font-mono ${Math.abs(varianceOutstanding) > 0.01 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                                {formatPeso(varianceOutstanding)}
                                            </span>
                                        </div>
                                    </div>

                                    {data.header.remarks && (
                                        <div className="pt-2 border-t border-border/40 mt-1 space-y-1">
                                            <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest flex items-center gap-1.5">
                                                Remarks
                                            </span>
                                            <p className="text-[11px] text-muted-foreground italic font-medium">
                                                &ldquo;{data.header.remarks}&rdquo;
                                            </p>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
