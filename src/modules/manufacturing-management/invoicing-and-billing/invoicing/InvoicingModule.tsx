"use client";

import React, { useEffect, useState } from "react";
import { ArrowRight, Building2, Calendar, ChevronDown, ChevronRight, FileCheck2, Hash, Loader2, RefreshCw, RotateCcw, Search, Users } from "lucide-react";
import CreateInvoiceModal from "./components/CreateInvoiceModal";
import { useInvoicing } from "./hooks/useInvoicing";
import { InvoicingCandidate } from "./types";
import { fetchBranches } from "./services/invoicing-api";
import type { Branch } from "./types";
import { SearchableSelect } from "@/components/ui/searchable-select";

function formatCurrency(amount: number) {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(amount);
}

const FM = {
    card: "rounded-xl border bg-card p-3 shadow-sm",
    input: "w-full rounded-xl border bg-background py-2 pl-9 pr-3.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
    label: "text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5",
    badge: "rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-extrabold uppercase text-emerald-600",
};

export default function InvoicingModule() {
    const { groups, filters, loading, submitting, customerCount, orderCount, totalInvoiceValue, refresh, applyFilters, resetFilters, submit } = useInvoicing();
    const [selected, setSelected] = useState<InvoicingCandidate | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [searchInput, setSearchInput] = useState("");
    const [branches, setBranches] = useState<Branch[]>([]);

    useEffect(() => {
        fetchBranches().then((data: Branch[]) => setBranches(data || [])).catch(() => {});
    }, []);

    const toggleGroup = (code: string) => {
        const next = new Set(expanded);
        if (next.has(code)) next.delete(code); else next.add(code);
        setExpanded(next);
    };

    const toggleAll = () => {
        if (expanded.size === groups.length && groups.length > 0) return setExpanded(new Set());
        setExpanded(new Set(groups.map(g => g.customer_code)));
    };

    const allExpanded = groups.length > 0 && expanded.size === groups.length;

    const handleSearch = (value: string) => {
        setSearchInput(value);
        applyFilters({ search: value });
    };

    return <div className="flex min-h-0 min-w-0 flex-1 flex-col space-y-3 no-print">
        <div className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
                <div className="rounded-xl border border-primary/20 bg-primary/10 p-2.5 text-primary"><FileCheck2 className="h-5 w-5" /></div>
                <div><h2 className="text-sm font-black uppercase tracking-wide">Invoicing</h2><p className="text-[10px] text-muted-foreground">Convert approved sales orders to invoices</p></div>
            </div>
            <button onClick={() => { void refresh(); }} disabled={loading} className="flex items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold hover:bg-muted disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
                { icon: Users, label: "Customers", value: customerCount, color: "text-blue-600 bg-blue-500/10 border-blue-500/20" },
                { icon: FileCheck2, label: "Approved Orders", value: orderCount, color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
                { icon: Building2, label: "Total Invoice Value", value: formatCurrency(totalInvoiceValue), color: "text-violet-600 bg-violet-500/10 border-violet-500/20", large: true },
            ].map(({ icon: Icon, label, value, color, large }) => <div key={label} className={`${FM.card} flex items-center gap-3`}>
                <div className={`rounded-xl border p-2.5 ${color}`}><Icon className="h-5 w-5" /></div>
                <div><p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{label}</p><p className={`font-black ${large ? "text-sm" : "text-lg"}`}>{value}</p></div>
            </div>)}
        </div>

        <div className="rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1 min-w-[180px]">
                    <span className={FM.label}><Search size={12} />Search</span>
                    <div className="relative mt-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><input value={searchInput} onChange={e => handleSearch(e.target.value)} placeholder="SO, PO, customer..." className={FM.input} /></div>
                </div>
                <div className="flex-1 min-w-[150px]">
                    <span className={FM.label}><Hash size={12} />Customer Code</span>
                    <input value={filters.customerCode} onChange={e => applyFilters({ customerCode: e.target.value })} placeholder="Filter by code" className={`${FM.input} mt-1`} />
                </div>
                <div className="flex-1 min-w-[180px]">
                    <span className={FM.label}><Building2 size={12} />Branch</span>
                    <SearchableSelect
                        value={filters.branchId}
                        onValueChange={(value) => applyFilters({ branchId: value })}
                        options={branches.map((b) => ({ value: String(b.id), label: `${b.branchName} (${b.branchCode})` }))}
                        placeholder="All branches"
                        className="mt-1 h-10 rounded-xl bg-background text-sm font-bold normal-case tracking-normal"
                    />
                </div>
                <div className="min-w-[130px]">
                    <span className={FM.label}><Calendar size={12} />From</span>
                    <input value={filters.dateFrom} onChange={e => applyFilters({ dateFrom: e.target.value })} type="date" className={`${FM.input} mt-1`} />
                </div>
                <div className="min-w-[130px]">
                    <span className={FM.label}><Calendar size={12} />To</span>
                    <input value={filters.dateTo} onChange={e => applyFilters({ dateTo: e.target.value })} type="date" className={`${FM.input} mt-1`} />
                </div>
                <button onClick={resetFilters} className="flex items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/5 px-3.5 py-2 text-[10px] font-extrabold uppercase text-red-600 hover:bg-red-500/10"><RotateCcw className="h-3.5 w-3.5" />Reset</button>
            </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="relative min-h-48 overflow-auto rounded-xl border bg-background p-3 shadow-sm md:p-4 lg:col-span-2">
            {loading && <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}
            {!loading && groups.length === 0 ? <div className="py-16 text-center"><FileCheck2 className="mx-auto h-12 w-12 text-muted-foreground/20" /><h3 className="mt-3 text-xs font-bold uppercase">No Orders Found</h3><p className="mt-1 text-[10px] text-muted-foreground">No approved sales orders match the current filters.</p></div> : <>
                <div className="mb-3 flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground">{orderCount} order{orderCount === 1 ? "" : "s"} across {customerCount} customer{customerCount === 1 ? "" : "s"}</p>
                    <button onClick={toggleAll} disabled={groups.length === 0} className="flex items-center gap-1 rounded-lg border px-3 py-1 text-[9px] font-extrabold uppercase tracking-wider hover:bg-muted disabled:opacity-30">{allExpanded ? "Close All" : "Open All"}<ChevronDown className={`h-3 w-3 transition-transform ${allExpanded ? "" : "-rotate-90"}`} /></button>
                </div>
                <div className="overflow-x-auto rounded-xl border">
                    <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                        <thead><tr className="border-b bg-muted/30"><th className="w-10 p-3"></th><th className="p-3 font-extrabold uppercase text-muted-foreground">Customer</th><th className="p-3 font-extrabold uppercase text-muted-foreground">Code</th><th className="p-3 text-center font-extrabold uppercase text-muted-foreground">Orders</th><th className="p-3 text-right font-extrabold uppercase text-muted-foreground">Total Amount</th></tr></thead>
                        <tbody className="divide-y">{groups.map(group => <React.Fragment key={group.customer_code}>
                            <tr className={`cursor-pointer transition-colors hover:bg-muted/20 ${expanded.has(group.customer_code) ? "bg-primary/5" : ""}`} onClick={() => toggleGroup(group.customer_code)}>
                                <td className="p-3 text-center">{expanded.has(group.customer_code) ? <ChevronDown className="inline h-4 w-4 text-primary" /> : <ChevronRight className="inline h-4 w-4 text-muted-foreground/50" />}</td>
                                <td className="p-3 font-bold">{group.customer_name}</td>
                                <td className="p-3"><span className="rounded-md border bg-muted/20 px-2 py-0.5 font-mono text-[10px] text-primary">{group.customer_code}</span></td>
                                <td className="p-3 text-center"><span className="rounded-full border bg-muted/30 px-2.5 py-0.5 text-[10px] font-bold">{group.order_count}</span></td>
                                <td className="p-3 text-right font-black text-primary">{formatCurrency(group.total_amount)}</td>
                            </tr>
                            {expanded.has(group.customer_code) && <tr className="bg-muted/5"><td colSpan={5} className="p-0"><div className="p-2 sm:p-3">
                                <div className="hidden sm:block">
                                    <table className="w-full table-fixed border-collapse text-left text-xs">
                                        <thead><tr className="border-b border-dashed"><th className="w-[12%] p-2 text-[9px] font-extrabold uppercase text-muted-foreground/60"><Calendar size={10} className="mr-1 inline" />Date</th><th className="w-[20%] p-2 text-[9px] font-extrabold uppercase text-muted-foreground/60"><Hash size={10} className="mr-1 inline" />SO No.</th><th className="w-[18%] p-2 text-[9px] font-extrabold uppercase text-muted-foreground/60">PO No.</th><th className="w-[18%] p-2 text-[9px] font-extrabold uppercase text-muted-foreground/60"><Building2 size={10} className="mr-1 inline" />Branch</th><th className="w-[8%] p-2 text-center text-[9px] font-extrabold uppercase text-muted-foreground/60">Items</th><th className="w-[12%] p-2 text-right text-[9px] font-extrabold uppercase text-muted-foreground/60">Amount</th><th className="w-[12%] p-2 text-center text-[9px] font-extrabold uppercase text-muted-foreground/60">Action</th></tr></thead>
                                        <tbody>{group.orders.map(order => <tr key={order.order_id} className="border-b border-dashed last:border-0 hover:bg-muted/10">
                                            <td className="truncate p-2 text-muted-foreground">{new Date(order.order_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "2-digit" })}</td>
                                            <td className="truncate p-2 font-bold">{order.order_no}</td>
                                            <td className="truncate p-2 text-muted-foreground">{order.po_no || "—"}</td>
                                            <td className="truncate p-2 text-muted-foreground">{order.branch_name || `Branch #${order.branch_id}`}</td>
                                            <td className="p-2 text-center">{order.details.length}</td>
                                            <td className="whitespace-nowrap p-2 text-right font-bold">{formatCurrency(Number(order.net_amount || order.total_amount || 0))}</td>
                                            <td className="p-2 text-center"><button onClick={e => { e.stopPropagation(); setSelected(order); }} className="mx-auto inline-flex items-center gap-1 whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-[9px] font-bold text-primary-foreground">Create<ArrowRight className="h-3 w-3" /></button></td>
                                        </tr>)}</tbody>
                                    </table>
                                </div>
                                <div className="grid grid-cols-1 gap-2 sm:hidden">
                                    {group.orders.map(order => <div key={order.order_id} className="rounded-lg border bg-background p-3 text-xs">
                                        <div className="flex items-center justify-between"><span className="font-bold">{order.order_no}</span><button onClick={() => setSelected(order)} className="flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[9px] font-bold text-primary-foreground">Create<ArrowRight className="h-3 w-3" /></button></div>
                                        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                                            <span>PO: {order.po_no || "—"}</span>
                                            <span className="text-right">{new Date(order.order_date).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</span>
                                            <span>{order.branch_name || `Branch #${order.branch_id}`}</span>
                                            <span className="text-right font-bold text-foreground">{formatCurrency(Number(order.net_amount || order.total_amount || 0))}</span>
                                        </div>
                                        <div className="mt-1.5 text-muted-foreground">{order.details.length} item{order.details.length === 1 ? "" : "s"} · <span className={FM.badge}>Approved</span></div>
                                    </div>)}
                                </div>
                            </div></td></tr>}
                        </React.Fragment>)}</tbody>
                    </table>
                </div>
            </>}
        </div>
        <div className="min-w-0 lg:sticky lg:top-4">
            {selected
                ? <CreateInvoiceModal candidate={selected} submitting={submitting} onClose={() => setSelected(null)} onSubmit={submit} />
                : <div className="rounded-2xl border border-dashed bg-card/50 p-8 text-center text-xs text-muted-foreground shadow-sm">
                    <FileCheck2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
                    <p className="font-bold text-foreground">No sales order selected</p>
                    <p className="mt-1 text-[10px]">Expand a customer and select Create to prepare an invoice.</p>
                </div>}
        </div>
        </div>
    </div>;
}
