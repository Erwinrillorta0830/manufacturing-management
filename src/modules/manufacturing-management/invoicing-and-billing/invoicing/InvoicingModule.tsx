"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
    card: "rounded-xl border bg-card p-3.5 shadow-sm transition-all hover:shadow-md",
    input: "w-full rounded-xl border bg-background py-2 pl-9 pr-3.5 text-xs outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/20",
    label: "text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground/70 flex items-center gap-1.5",
    badge: "rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-extrabold uppercase text-emerald-600 dark:text-emerald-400",
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

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col space-y-3.5 no-print">
            {/* Header */}
            <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="flex flex-col justify-between gap-3 rounded-xl border bg-card p-3.5 shadow-sm sm:flex-row sm:items-center"
            >
                <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-primary/20 bg-primary/10 p-2.5 text-primary shadow-inner">
                        <FileCheck2 className="h-5 w-5" />
                    </div>
                    <div>
                        <h2 className="text-sm font-black uppercase tracking-wide">Invoicing</h2>
                        <p className="text-[10px] text-muted-foreground">Convert picked sales orders to invoices and prepare for dispatch</p>
                    </div>
                </div>
                <button 
                    onClick={() => { void refresh(); }} 
                    disabled={loading} 
                    className="flex items-center justify-center gap-2 rounded-xl border bg-background px-4 py-2 text-xs font-bold shadow-sm transition-colors hover:bg-muted disabled:opacity-50"
                >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
                    Refresh
                </button>
            </motion.div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                    { icon: Users, label: "Customers", value: customerCount, color: "text-blue-600 bg-blue-500/10 border-blue-500/20" },
                    { icon: FileCheck2, label: "Orders To Invoice", value: orderCount, color: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20" },
                    { icon: Building2, label: "Total Invoice Value", value: formatCurrency(totalInvoiceValue), color: "text-violet-600 bg-violet-500/10 border-violet-500/20", large: true },
                ].map(({ icon: Icon, label, value, color, large }, index) => (
                    <motion.div 
                        key={label}
                        initial={{ opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.05 }}
                        className={`${FM.card} flex items-center gap-3.5`}
                    >
                        <div className={`rounded-xl border p-2.5 ${color}`}><Icon className="h-5 w-5" /></div>
                        <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground">{label}</p>
                            <p className={`font-black ${large ? "text-sm text-primary" : "text-lg"}`}>{value}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Search & Filters */}
            <motion.div 
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.1 }}
                className="rounded-xl border bg-card p-3.5 shadow-sm"
            >
                <div className="flex flex-wrap items-end gap-3">
                    <div className="flex-[2] min-w-[240px]">
                        <span className={FM.label}><Search size={12} />Search</span>
                        <div className="relative mt-1">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input value={searchInput} onChange={e => handleSearch(e.target.value)} placeholder="SO, PO, customer..." className={FM.input} />
                        </div>
                    </div>
                    <div className="flex-1 min-w-[180px]">
                        <span className={FM.label}><Building2 size={12} />Branch</span>
                        <SearchableSelect
                            value={filters.branchId}
                            onValueChange={(value) => applyFilters({ branchId: value })}
                            options={branches.map((b) => ({
                                value: String(b.id),
                                label: b.branchCode ? `${b.branchName} (${b.branchCode})` : (b.branchName || `Branch #${b.id}`),
                            }))}
                            placeholder="All branches"
                            className="mt-1 h-9 rounded-xl bg-background text-xs font-bold normal-case tracking-normal"
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
                    <button onClick={resetFilters} className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/5 px-3.5 text-[10px] font-extrabold uppercase text-red-600 transition-colors hover:bg-red-500/10">
                        <RotateCcw className="h-3.5 w-3.5" />Reset
                    </button>
                </div>
            </motion.div>

            {/* Main Orders Table (Full Width) */}
            <motion.div 
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.15 }}
                className="relative min-h-64 flex-1 overflow-auto rounded-xl border bg-card p-3.5 shadow-sm md:p-4"
            >
                {loading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/60 backdrop-blur-xs">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Loading orders...</p>
                        </div>
                    </div>
                )}
                {!loading && groups.length === 0 ? (
                    <div className="py-20 text-center">
                        <FileCheck2 className="mx-auto h-12 w-12 text-muted-foreground/30" />
                        <h3 className="mt-3 text-xs font-bold uppercase">No Orders Found</h3>
                        <p className="mt-1 text-[10px] text-muted-foreground">No picked sales orders match the current filters.</p>
                    </div>
                ) : (
                    <>
                        <div className="mb-3 flex items-center justify-between">
                            <p className="text-[11px] font-medium text-muted-foreground">
                                <span className="font-bold text-foreground">{orderCount}</span> order{orderCount === 1 ? "" : "s"} across <span className="font-bold text-foreground">{customerCount}</span> customer{customerCount === 1 ? "" : "s"}
                            </p>
                            <button 
                                onClick={toggleAll} 
                                disabled={groups.length === 0} 
                                className="flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-wider shadow-xs hover:bg-muted disabled:opacity-30 transition-colors"
                            >
                                {allExpanded ? "Close All" : "Open All"}
                                <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${allExpanded ? "" : "-rotate-90"}`} />
                            </button>
                        </div>
                        <div className="overflow-x-auto rounded-xl border shadow-xs">
                            <table className="w-full min-w-[800px] border-collapse text-left text-xs">
                                <thead>
                                    <tr className="border-b bg-muted/40 font-extrabold uppercase text-muted-foreground text-[10px]">
                                        <th className="w-12 p-3 text-center"></th>
                                        <th className="p-3">Customer</th>
                                        <th className="p-3">Code</th>
                                        <th className="p-3 text-center">Orders</th>
                                        <th className="p-3 text-right">Total Amount</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {groups.map((group, groupIdx) => {
                                        const isExpanded = expanded.has(group.customer_code);
                                        return (
                                            <React.Fragment key={group.customer_code}>
                                                <motion.tr 
                                                    initial={{ opacity: 0, y: -6 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{ duration: 0.15, delay: groupIdx * 0.02 }}
                                                    className={`cursor-pointer transition-colors hover:bg-muted/30 ${isExpanded ? "bg-primary/5 font-semibold" : ""}`} 
                                                    onClick={() => toggleGroup(group.customer_code)}
                                                >
                                                    <td className="p-3 text-center">
                                                        <div className="flex items-center justify-center">
                                                            {isExpanded ? (
                                                                <ChevronDown className="h-4 w-4 text-primary transition-transform" />
                                                            ) : (
                                                                <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform" />
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="p-3 font-bold text-foreground">{group.customer_name}</td>
                                                    <td className="p-3">
                                                        <span className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-[10px] font-bold text-primary">
                                                            {group.customer_code}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-center">
                                                        <span className="rounded-full border bg-muted/50 px-2.5 py-0.5 text-[10px] font-bold">
                                                            {group.order_count}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-right font-black text-primary">
                                                        {formatCurrency(group.total_amount)}
                                                    </td>
                                                </motion.tr>
                                                {isExpanded && (
                                                    <tr className="bg-muted/10">
                                                        <td colSpan={5} className="p-0">
                                                            <motion.div 
                                                                initial={{ opacity: 0, height: 0 }}
                                                                animate={{ opacity: 1, height: "auto" }}
                                                                exit={{ opacity: 0, height: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="p-3 sm:p-4"
                                                            >
                                                                <div className="hidden sm:block overflow-hidden rounded-lg border bg-background shadow-xs">
                                                                    <table className="w-full table-fixed border-collapse text-left text-xs">
                                                                        <thead>
                                                                            <tr className="border-b border-muted bg-muted/30 text-[9px] font-extrabold uppercase text-muted-foreground/70">
                                                                                <th className="w-[12%] p-2.5"><Calendar size={11} className="mr-1 inline text-primary/70" />Date</th>
                                                                                <th className="w-[20%] p-2.5"><Hash size={11} className="mr-1 inline text-primary/70" />SO No.</th>
                                                                                <th className="w-[18%] p-2.5">PO No.</th>
                                                                                <th className="w-[18%] p-2.5"><Building2 size={11} className="mr-1 inline text-primary/70" />Branch</th>
                                                                                <th className="w-[8%] p-2.5 text-center">Items</th>
                                                                                <th className="w-[12%] p-2.5 text-right">Amount</th>
                                                                                <th className="w-[12%] p-2.5 text-center">Action</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-border/40">
                                                                            {group.orders.map((order, orderIdx) => (
                                                                                <motion.tr 
                                                                                    key={order.order_id}
                                                                                    initial={{ opacity: 0, y: -4 }}
                                                                                    animate={{ opacity: 1, y: 0 }}
                                                                                    transition={{ duration: 0.15, delay: orderIdx * 0.03 }}
                                                                                    className="hover:bg-muted/20 transition-colors"
                                                                                >
                                                                                    <td className="truncate p-2.5 text-muted-foreground">
                                                                                        {new Date(order.order_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "2-digit" })}
                                                                                    </td>
                                                                                    <td className="truncate p-2.5 font-bold text-foreground">
                                                                                        {order.order_no}
                                                                                    </td>
                                                                                    <td className="truncate p-2.5 text-muted-foreground">
                                                                                        {order.po_no || "—"}
                                                                                    </td>
                                                                                    <td className="truncate p-2.5 text-muted-foreground">
                                                                                        {order.branch_name || `Branch #${order.branch_id}`}
                                                                                    </td>
                                                                                    <td className="p-2.5 text-center font-semibold">
                                                                                        {order.details.length}
                                                                                    </td>
                                                                                    <td className="whitespace-nowrap p-2.5 text-right font-black text-foreground">
                                                                                        {formatCurrency(Number(order.net_amount || order.total_amount || 0))}
                                                                                    </td>
                                                                                    <td className="p-2.5 text-center">
                                                                                        <button 
                                                                                            onClick={(e) => { 
                                                                                                e.stopPropagation(); 
                                                                                                setSelected(order); 
                                                                                            }} 
                                                                                            className="mx-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 py-1.5 text-[10px] font-bold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98]"
                                                                                        >
                                                                                            <span>Create</span>
                                                                                            <ArrowRight className="h-3 w-3" />
                                                                                        </button>
                                                                                    </td>
                                                                                </motion.tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                                {/* Mobile View */}
                                                                <div className="grid grid-cols-1 gap-2 sm:hidden">
                                                                    {group.orders.map(order => (
                                                                        <div key={order.order_id} className="rounded-lg border bg-background p-3 text-xs shadow-xs space-y-2">
                                                                            <div className="flex items-center justify-between">
                                                                                <span className="font-bold text-foreground">{order.order_no}</span>
                                                                                <button 
                                                                                    onClick={() => setSelected(order)} 
                                                                                    className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[9px] font-bold text-primary-foreground"
                                                                                >
                                                                                    <span>Create</span>
                                                                                    <ArrowRight className="h-3 w-3" />
                                                                                </button>
                                                                            </div>
                                                                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                                                                                <span>PO: {order.po_no || "—"}</span>
                                                                                <span className="text-right">{new Date(order.order_date).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</span>
                                                                                <span>{order.branch_name || `Branch #${order.branch_id}`}</span>
                                                                                <span className="text-right font-black text-foreground">{formatCurrency(Number(order.net_amount || order.total_amount || 0))}</span>
                                                                            </div>
                                                                            <div className="flex items-center justify-between pt-1 border-t text-[10px]">
                                                                                <span className="text-muted-foreground">{order.details.length} item{order.details.length === 1 ? "" : "s"}</span>
                                                                                <span className={FM.badge}>For Invoicing</span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </motion.div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </motion.div>

            {/* Modal Dialog */}
            <AnimatePresence>
                {selected && (
                    <CreateInvoiceModal 
                        candidate={selected} 
                        submitting={submitting} 
                        onClose={() => setSelected(null)} 
                        onSubmit={submit} 
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
