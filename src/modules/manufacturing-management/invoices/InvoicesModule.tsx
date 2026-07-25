"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Receipt, Search, SlidersHorizontal, TrendingUp } from "lucide-react";
import { useInvoices } from "./hooks/useInvoices";
import InvoiceDetailModal from "./components/InvoiceDetailModal";

export default function InvoicesModule() {
    const { invoices, detailsMap, loading, loadingDetails, loadInvoiceDetails, alignment, handleRecordPayment, handleCancelInvoice } = useInvoices();
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("All");
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
    const metrics = useMemo(() => invoices.reduce((sum, invoice) => {
        const net = Number(invoice.net_amount || 0);
        sum.total += net;
        if (invoice.status === "Paid") sum.collected += net;
        else {
            const paid = invoice.status === "Partially Paid" ? net / 2 : 0;
            sum.collected += paid;
            sum.outstanding += net - paid;
            if (invoice.status === "Overdue") sum.overdue += net;
        }
        return sum;
    }, { total: 0, collected: 0, outstanding: 0, overdue: 0 }), [invoices]);
    const filtered = useMemo(() => invoices.filter((invoice) => {
        const query = search.toLowerCase();
        return (status === "All" || invoice.status === status) && [invoice.invoice_no, invoice.customer_name, invoice.sales_order_no].some(value => (value || "").toLowerCase().includes(query));
    }), [invoices, search, status]);
    const cards = [
        ["Total Billing Issued", metrics.total, Receipt, "text-primary bg-primary/10"],
        ["Payments Collected", metrics.collected, CheckCircle2, "text-emerald-600 bg-emerald-500/10"],
        ["Accounts Receivable", metrics.outstanding, TrendingUp, "text-amber-600 bg-amber-500/10"],
        ["Overdue Collections", metrics.overdue, AlertCircle, "text-rose-600 bg-rose-500/10"],
    ] as const;

    const selectedInvoice = selectedInvoiceId ? invoices.find(i => i.invoice_id === selectedInvoiceId) ?? null : null;

    return <div className="flex min-h-0 min-w-0 flex-1 flex-col space-y-4 no-print">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value, Icon, color]) => <div key={label} className="flex items-center gap-3.5 rounded-xl border bg-card p-4 shadow-sm"><div className={`rounded-xl p-2.5 ${color}`}><Icon className="h-5 w-5" /></div><div><span className="block text-[10px] font-bold uppercase text-muted-foreground">{label}</span><h4 className="mt-0.5 text-base font-black">₱{value.toLocaleString(undefined, { maximumFractionDigits: 0 })}</h4></div></div>)}</div>
        <div className="flex flex-col items-center gap-3 sm:flex-row"><div className="relative w-full flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by Invoice No, Customer, or SO..." className="w-full rounded-xl border bg-card py-2 pl-9 pr-3.5 text-xs outline-none focus:border-primary" /></div><div className="flex w-full items-center gap-2 sm:w-auto"><SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" /><select value={status} onChange={event => setStatus(event.target.value)} className="w-full rounded-xl border bg-card px-3 py-2 text-xs sm:w-40"><option value="All">All Invoices</option><option value="Unpaid">Unpaid</option><option value="Paid">Paid</option><option value="Partially Paid">Partially Paid</option><option value="Overdue">Overdue</option><option value="Cancelled">Cancelled</option></select></div></div>
        <div className="relative min-h-0 flex-1 overflow-auto rounded-xl border bg-background p-4 shadow-sm md:p-6">{loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}{!loading && filtered.length === 0 ? <div className="py-12 text-center text-xs text-muted-foreground">No invoices found.</div> : <table className="w-full min-w-[760px] border-collapse text-left text-xs"><thead><tr className="border-b bg-muted/20"><th className="p-3 uppercase text-muted-foreground">Invoice No</th><th className="p-3 uppercase text-muted-foreground">Customer</th><th className="p-3 uppercase text-muted-foreground">Invoice Date</th><th className="p-3 uppercase text-muted-foreground">Due Date</th><th className="p-3 uppercase text-muted-foreground">SO Reference</th><th className="p-3 text-right uppercase text-muted-foreground">Amount</th><th className="p-3 text-center uppercase text-muted-foreground">Status</th></tr></thead><tbody className="divide-y">{filtered.map(invoice => <tr key={invoice.invoice_id} className="hover:bg-muted/10 cursor-pointer" onClick={() => { setSelectedInvoiceId(invoice.invoice_id); loadInvoiceDetails(invoice.invoice_id); }}><td className="p-3 font-bold">{invoice.invoice_no}</td><td className="p-3 text-muted-foreground">{invoice.customer_name || "N/A"}</td><td className="p-3 text-muted-foreground">{new Date(invoice.invoice_date).toLocaleDateString()}</td><td className="p-3 text-muted-foreground">{new Date(invoice.due_date).toLocaleDateString()}</td><td className="p-3 font-medium text-primary">{invoice.sales_order_no || "Manual"}</td><td className="p-3 text-right font-black">₱{Number(invoice.net_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td className="p-3 text-center"><span className="rounded-full border px-2 py-0.5 text-[9px] font-extrabold uppercase">{invoice.status}</span></td></tr>)}</tbody></table>}</div>
        {selectedInvoice && <InvoiceDetailModal
            invoice={selectedInvoice}
            invoiceDetails={detailsMap[selectedInvoice.invoice_id] || []}
            isOpen={true}
            onClose={() => setSelectedInvoiceId(null)}
            onRecordPayment={handleRecordPayment}
            onCancelInvoice={handleCancelInvoice}
            alignment={alignment}
            loadingDetails={!!loadingDetails[selectedInvoice.invoice_id]}
        />}
    </div>;
}
