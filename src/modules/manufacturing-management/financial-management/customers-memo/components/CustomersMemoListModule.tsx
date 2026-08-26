"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    CreditCard,
    Search,
    RefreshCcw,
    CheckCircle2,
    ArrowUpRight,
    User,
    FilterX,
    Filter,
    Layers,
    Database
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
    fetchMemosByStatus,
    fetchSuppliers,
    fetchCustomers,
    fetchSalesmen,
    fetchCOAs
} from "../service";
import { MemoApprovalRow, Supplier, Customer, Salesman, ChartOfAccount } from "../types";
import { ApprovalDetailModal } from "./ApprovalDetailModal";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { MultiSearchableSelect } from "./MultiSearchableSelect";
import {
    Pagination,
    PaginationContent,
    PaginationEllipsis,
    PaginationItem,
    PaginationLink,
    PaginationNext,
    PaginationPrevious,
} from "@/components/ui/pagination";

export default function CustomersMemoListModule() {
    const [memos, setMemos] = useState<MemoApprovalRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");

    // Lookup Data
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [salesmen, setSalesmen] = useState<Salesman[]>([]);
    const [coas, setCoas] = useState<ChartOfAccount[]>([]);

    // Filter State
    const [filterSupplier, setFilterSupplier] = useState<string[]>([]);
    const [filterCustomer, setFilterCustomer] = useState<string[]>([]);
    const [filterSalesman, setFilterSalesman] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<"all" | "credit" | "debit">("all");
    const [filterStatus, setFilterStatus] = useState<string[]>([]);
    const [filterCOA, setFilterCOA] = useState<string[]>([]);
    const [filterDateFrom, setFilterDateFrom] = useState<string>("");
    const [filterDateTo, setFilterDateTo] = useState<string>("");

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;

    const [selectedMemoId, setSelectedMemoId] = useState<number | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    const loadData = async () => {
        setLoading(true);
        try {
            const [memoData, supplierData, customerData, salesmanData, coaData] = await Promise.all([
                fetchMemosByStatus("ALL"),
                fetchSuppliers(),
                fetchCustomers(),
                fetchSalesmen(),
                fetchCOAs()
            ]);
            setMemos(memoData);
            setSuppliers(supplierData);
            setCustomers(customerData);
            setSalesmen(salesmanData);
            setCoas(coaData);
        } catch {
            toast.error("Failed to synchronize with memo records or master data.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const filteredMemos = memos.filter(m => {
        const matchesSearch =
            m.memo_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.customer_id.customer_name.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesSupplier = filterSupplier.length === 0 || filterSupplier.includes(String(m.supplier_id?.id || ""));
        const matchesCustomer = filterCustomer.length === 0 || filterCustomer.includes(String(m.customer_id?.id || ""));
        const matchesSalesman = filterSalesman.length === 0 || filterSalesman.includes(String(m.salesman_id?.id || ""));
        const matchesTab = activeTab === "all" || (activeTab === "credit" && m.type === 1) || (activeTab === "debit" && m.type === 2);
        const matchesStatus = filterStatus.length === 0 || filterStatus.includes(m.status);
        const matchesCOA = filterCOA.length === 0 || filterCOA.includes(String(m.chart_of_account?.coa_id || ""));

        let matchesDate = true;
        if (filterDateFrom || filterDateTo) {
            const memoDate = new Date(m.created_at);
            // reset time to 00:00:00 for accurate date comparison
            memoDate.setHours(0, 0, 0, 0);

            if (filterDateFrom) {
                const from = new Date(filterDateFrom);
                from.setHours(0, 0, 0, 0);
                if (memoDate < from) matchesDate = false;
            }
            if (filterDateTo) {
                const to = new Date(filterDateTo);
                to.setHours(0, 0, 0, 0);
                if (memoDate > to) matchesDate = false;
            }
        }

        return matchesSearch && matchesSupplier && matchesCustomer && matchesSalesman && matchesTab && matchesStatus && matchesCOA && matchesDate;
    });

    // Reset page to 1 when filters change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, filterSupplier, filterCustomer, filterSalesman, activeTab, filterStatus, filterCOA, filterDateFrom, filterDateTo]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredMemos.length / pageSize);
    const paginatedMemos = filteredMemos.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    const resetFilters = () => {
        setSearchQuery("");
        setFilterSupplier([]);
        setFilterCustomer([]);
        setFilterSalesman([]);
        setFilterStatus([]);
        setFilterCOA([]);
        setFilterDateFrom("");
        setFilterDateTo("");
        setActiveTab("all");
    };

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(val);

    const uniqueStatuses = Array.from(new Set(memos.map(m => m.status)));

    if (loading && memos.length === 0) {
        return (
            <div className="p-8 space-y-6 min-h-screen bg-slate-50">
                <Skeleton className="h-20 w-1/2 rounded-full mb-10" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <Skeleton className="h-32 rounded-3xl" />
                    <Skeleton className="h-32 rounded-3xl" />
                </div>
                <Skeleton className="h-[500px] w-full rounded-[2.5rem]" />
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-6 p-6 lg:p-10 max-w-[1700px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 min-h-screen pb-32">
            {/* Action Header */}
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-4 border-b border-muted/50">
                <div className="space-y-4">
                    <div className="flex items-center gap-5">
                        <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-blue-500/30 ring-4 ring-blue-50/50">
                            <Database className="h-8 w-8" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-4xl lg:text-5xl font-black tracking-tighter text-slate-900">
                                    Customer Memos
                                </h1>
                                <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none px-3 font-black text-[10px] uppercase tracking-widest h-6 rounded-full shadow-sm shadow-blue-500/10">
                                    Master List
                                </Badge>
                            </div>
                            <p className="text-slate-400 font-bold text-xs uppercase tracking-[0.25em] mt-1.5 opacity-80 flex items-center gap-2">
                                <Layers className="h-3 w-3" />
                                Comprehensive Memo Directory
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3 bg-white p-2 rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 ring-4 ring-slate-50">
                    <div className="relative group">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-300 group-focus-within:text-blue-600 transition-colors" />
                        <Input
                            placeholder="Find record..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="pl-12 h-14 w-[350px] rounded-[1.5rem] border-none bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500/20 transition-all font-bold text-sm text-slate-700"
                        />
                    </div>
                    <Button
                        variant="secondary"
                        size="icon"
                        onClick={loadData}
                        disabled={loading}
                        className="h-14 w-14 rounded-[1.5rem] bg-slate-900 hover:bg-slate-800 text-white transition-all active:scale-90 shadow-xl shadow-slate-900/10"
                    >
                        <RefreshCcw className={`h-5 w-5 ${loading ? "animate-spin text-blue-500" : ""}`} />
                    </Button>
                </div>
            </div>

            {/* Type Tabs */}
            <div className="flex bg-slate-200/50 p-1.5 rounded-[1.25rem] w-fit border border-slate-200 shadow-inner">
                <Button
                    variant="ghost"
                    onClick={() => setActiveTab("all")}
                    className={cn("h-10 px-8 rounded-xl font-black text-xs transition-all", activeTab === "all" ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-900 hover:bg-white/50")}
                >
                    All Memos
                </Button>
                <Button
                    variant="ghost"
                    onClick={() => setActiveTab("credit")}
                    className={cn("h-10 px-8 rounded-xl font-black text-xs transition-all", activeTab === "credit" ? "bg-white shadow-sm text-blue-700" : "text-slate-500 hover:text-slate-900 hover:bg-white/50")}
                >
                    Credit Memos
                </Button>
                <Button
                    variant="ghost"
                    onClick={() => setActiveTab("debit")}
                    className={cn("h-10 px-8 rounded-xl font-black text-xs transition-all", activeTab === "debit" ? "bg-white shadow-sm text-red-700" : "text-slate-500 hover:text-slate-900 hover:bg-white/50")}
                >
                    Debit Memos
                </Button>
            </div>

            {/* Filtering Bar */}
            <div className="bg-white p-5 rounded-[2.5rem] shadow-2xl shadow-slate-200/50 border border-slate-100 flex flex-wrap items-center gap-6">
                <div className="flex items-center gap-3 pr-4 border-r border-slate-100">
                    <div className="h-9 w-9 bg-slate-950 rounded-xl flex items-center justify-center text-blue-500 shadow-lg">
                        <Filter className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-black uppercase tracking-widest text-slate-400">Filters</span>
                </div>

                <div className="flex-1 min-w-[180px]">
                    <MultiSearchableSelect
                        placeholder="Filter by Status"
                        options={uniqueStatuses.map(s => ({ value: s, label: s }))}
                        value={filterStatus}
                        onValueChange={setFilterStatus}
                    />
                </div>

                <div className="flex-1 min-w-[200px]">
                    <MultiSearchableSelect
                        placeholder="Filter by Customer"
                        options={customers.map(c => {
                            const address = [c.brgy, c.city].filter(Boolean).join(", ");
                            const storeInfo = c.store_name && c.store_name !== c.customer_name ? c.store_name : "";
                            const subLabel = [storeInfo, address].filter(Boolean).join(" | ");
                            return {
                                value: String(c.id),
                                label: c.customer_name,
                                subLabel: subLabel
                            };
                        })}
                        value={filterCustomer}
                        onValueChange={setFilterCustomer}
                    />
                </div>

                <div className="flex-1 min-w-[200px]">
                    <MultiSearchableSelect
                        placeholder="Filter by Supplier"
                        options={suppliers.map(s => ({ value: String(s.id), label: s.supplier_name }))}
                        value={filterSupplier}
                        onValueChange={setFilterSupplier}
                    />
                </div>

                <div className="flex-1 min-w-[200px]">
                    <MultiSearchableSelect
                        placeholder="Filter by Salesman"
                        options={salesmen.map(s => ({
                            value: String(s.id),
                            label: s.salesman_name,
                            subLabel: s.salesman_code
                        }))}
                        value={filterSalesman}
                        onValueChange={setFilterSalesman}
                    />
                </div>

                <div className="flex-1 min-w-[200px]">
                    <MultiSearchableSelect
                        placeholder="Filter by Chart of Account"
                        options={coas.map(c => ({
                            value: String(c.coa_id),
                            label: c.account_title,
                            subLabel: c.gl_code
                        }))}
                        value={filterCOA}
                        onValueChange={setFilterCOA}
                    />
                </div>

                <div className="flex items-center gap-3 bg-slate-50/50 p-1 rounded-2xl border border-slate-100">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 pl-3">Date Range</span>
                    <div className="flex items-center gap-1">
                        <Input
                            type="date"
                            value={filterDateFrom}
                            onChange={e => setFilterDateFrom(e.target.value)}
                            className="h-10 text-xs text-slate-500 font-bold w-[130px] rounded-xl border-none shadow-none bg-transparent hover:bg-white focus:bg-white transition-all"
                        />
                        <span className="text-slate-300 font-bold">-</span>
                        <Input
                            type="date"
                            value={filterDateTo}
                            onChange={e => setFilterDateTo(e.target.value)}
                            className="h-10 text-xs text-slate-500 font-bold w-[130px] rounded-xl border-none shadow-none bg-transparent hover:bg-white focus:bg-white transition-all"
                        />
                    </div>
                </div>

                <Button
                    variant="ghost"
                    onClick={resetFilters}
                    className="h-12 rounded-xl px-4 flex items-center gap-2 font-black text-[10px] uppercase tracking-widest text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                >
                    <FilterX className="h-4 w-4" />
                    Reset
                </Button>
            </div>

            {/* Stats Summary Area */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatsCard
                    label="Total Memos"
                    value={filteredMemos.length}
                    icon={Database}
                    color="blue"
                    trend={searchQuery || filterCustomer || filterSupplier || filterSalesman || filterStatus ? "Filtered Set" : "All Records"}
                />
                <StatsCard
                    label="Total Value"
                    value={formatCurrency(filteredMemos.reduce((s, m) => s + m.amount, 0))}
                    icon={CreditCard}
                    color="blue"
                    trend="Gross Credits & Debits"
                />
                <StatsCard
                    label="Average Valuation"
                    value={formatCurrency(filteredMemos.length > 0 ? filteredMemos.reduce((s, m) => s + m.amount, 0) / filteredMemos.length : 0)}
                    icon={Layers}
                    color="blue"
                    trend="Per Document"
                />
                <StatsCard
                    label="Peak Valuation"
                    value={formatCurrency(filteredMemos.length > 0 ? Math.max(...filteredMemos.map(m => m.amount)) : 0)}
                    icon={ArrowUpRight}
                    color="amber"
                    trend="Highest Record"
                />
            </div>

            {/* Main Listing Area */}
            <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-300/40 border border-slate-100 overflow-hidden flex flex-col">
                <div className="p-6 px-10 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100 shadow-sm shadow-blue-500/5">
                            <Search className="h-5 w-5 text-blue-600" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-sm font-black uppercase tracking-widest text-slate-800">
                                    Memo Directory
                                </h2>
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5 italic">Real-time Synchronization</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Page {currentPage} of {Math.max(1, totalPages)}
                    </div>
                </div>

                <div className="flex-1 overflow-x-auto overflow-y-visible">
                    {paginatedMemos.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-40 text-center px-10 bg-slate-50/20">
                            <div className="h-32 w-32 bg-white rounded-[2.5rem] flex items-center justify-center mb-10 border shadow-2xl shadow-slate-200 ring-8 ring-slate-50">
                                <CheckCircle2 className="h-14 w-14 text-green-500 animate-bounce" />
                            </div>
                            <h3 className="text-3xl font-black tracking-tighter text-slate-900 mb-2 uppercase italic">
                                No Records Found
                            </h3>
                            <p className="text-slate-400 text-xs font-black max-w-[350px] leading-relaxed uppercase tracking-[0.2em] opacity-60">
                                Adjust your filters or synchronization settings.
                            </p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-slate-50/50">
                                <TableRow className="hover:bg-transparent border-b border-slate-100">
                                    <TableHead className="text-[10px] font-black uppercase tracking-[0.3em] py-8 pl-10 text-slate-400/80 min-w-[150px]">Memo # & Status</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400/80 min-w-[220px]">Customer & Salesman Representative</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400/80 min-w-[200px]">COA & Remarks</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400/80 min-w-[160px]">Memo Amount</TableHead>
                                    <TableHead className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400/80 text-right pr-12 min-w-[160px]">Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedMemos.map(memo => (
                                    <TableRow key={memo.id} className="group hover:bg-blue-50/30 transition-all duration-500 border-b border-slate-50">
                                        <TableCell className="py-7 pl-10">
                                            <div className="flex flex-col gap-2 items-start">
                                                <span className="text-lg font-black text-slate-900 tracking-tighter group-hover:text-blue-600 transition-colors">
                                                    {memo.memo_number}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <Badge className={cn(
                                                        "text-[9px] font-black uppercase tracking-widest border-none px-2 shadow-sm",
                                                        memo.status === "APPROVED" ? "bg-green-100 text-green-700 hover:bg-green-200" :
                                                        memo.status === "FOR APPROVAL" ? "bg-amber-100 text-amber-700 hover:bg-amber-200" :
                                                        memo.status === "APPLIED" ? "bg-blue-100 text-blue-700 hover:bg-blue-200" :
                                                        "bg-slate-100 text-slate-700 hover:bg-slate-200"
                                                    )}>
                                                        {memo.status}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest border-slate-200 text-slate-500 bg-white shadow-sm">
                                                        {new Date(memo.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                                    </Badge>
                                                    <Badge variant="secondary" className={cn(
                                                        "text-[9px] font-black uppercase tracking-widest",
                                                        memo.type === 1 ? "bg-indigo-100 text-indigo-700" : 
                                                        memo.type === 2 ? "bg-rose-100 text-rose-700" :
                                                        "bg-slate-100 text-slate-700"
                                                    )}>
                                                        {memo.type === 1 ? "CREDIT" : memo.type === 2 ? "DEBIT" : "UNKNOWN"}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-6 w-6 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700 shadow-sm border border-indigo-200">
                                                        <User className="h-3 w-3" />
                                                    </div>
                                                    <p className="text-base font-black text-slate-800 break-words tracking-tight">
                                                        {memo.customer_id.customer_name}
                                                    </p>
                                                </div>
                                                {memo.customer_id.store_name && (
                                                    <p className="text-[10px] font-bold text-blue-600 ml-9 uppercase tracking-widest opacity-80 leading-tight">
                                                        {memo.customer_id.store_name}
                                                    </p>
                                                )}
                                                <p className="text-[10px] font-black text-slate-400 ml-9 uppercase tracking-widest opacity-70 italic leading-none">
                                                    Rep: {memo.salesman_id.salesman_code} - {memo.salesman_id.salesman_name}
                                                </p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1.5">
                                                <p className="text-sm font-black text-slate-800 tracking-tight leading-none">
                                                    {memo.chart_of_account.account_title}
                                                </p>
                                                <p className="text-[10px] font-bold text-slate-400 break-words uppercase tracking-widest italic opacity-80">
                                                    {memo.reason || "No reason specified"}
                                                </p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-2xl font-black text-slate-900 tabular-nums tracking-tighter">
                                                    {formatCurrency(memo.amount)}
                                                </span>
                                                <div className="flex items-center gap-1.5">
                                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-100 text-[9px] font-black px-2 py-0.5 rounded-lg border shadow-sm shadow-blue-500/5">
                                                        APPLIED: {formatCurrency(memo.applied_amount || 0)}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right pr-12">
                                            <Button
                                                onClick={() => {
                                                    setSelectedMemoId(memo.id);
                                                    setDetailOpen(true);
                                                }}
                                                className="bg-white border-2 border-slate-100 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 rounded-[1.25rem] h-12 px-6 font-black text-xs uppercase tracking-[0.2em] text-slate-600 shadow-sm transition-all duration-500 active:scale-90 flex items-center gap-2 ml-auto"
                                            >
                                                Details
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </div>

                {/* Pagination Sidebar Footer */}
                {totalPages > 1 && (
                    <div className="py-8 border-t border-slate-100 bg-slate-50/30 flex items-center justify-center">
                        <Pagination>
                            <PaginationContent className="gap-2">
                                <PaginationItem>
                                    <PaginationPrevious
                                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                        className={cn(
                                            "h-12 w-auto px-5 rounded-xl bg-white border shadow-sm transition-all active:scale-90 font-black text-xs uppercase tracking-widest",
                                            currentPage === 1 ? "opacity-30 pointer-events-none" : "hover:bg-slate-50 cursor-pointer"
                                        )}
                                    />
                                </PaginationItem>

                                {[...Array(totalPages)].map((_, i) => {
                                    const page = i + 1;
                                    // Logic to show limited page numbers
                                    if (
                                        page === 1 ||
                                        page === totalPages ||
                                        (page >= currentPage - 1 && page <= currentPage + 1)
                                    ) {
                                        return (
                                            <PaginationItem key={page}>
                                                <PaginationLink
                                                    onClick={() => setCurrentPage(page)}
                                                    isActive={currentPage === page}
                                                    className={cn(
                                                        "h-12 w-12 rounded-xl transition-all font-black text-sm active:scale-90 cursor-pointer",
                                                        currentPage === page
                                                            ? "bg-slate-900 shadow-xl shadow-slate-900/10 text-white hover:bg-slate-900"
                                                            : "bg-white border text-slate-600 hover:bg-slate-50"
                                                    )}
                                                >
                                                    {page}
                                                </PaginationLink>
                                            </PaginationItem>
                                        );
                                    } else if (
                                        page === currentPage - 2 ||
                                        page === currentPage + 2
                                    ) {
                                        return (
                                            <PaginationItem key={page}>
                                                <PaginationEllipsis className="mt-1" />
                                            </PaginationItem>
                                        );
                                    }
                                    return null;
                                })}

                                <PaginationItem>
                                    <PaginationNext
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        className={cn(
                                            "h-12 w-auto px-5 rounded-xl bg-white border shadow-sm transition-all active:scale-90 font-black text-xs uppercase tracking-widest",
                                            currentPage === totalPages ? "opacity-30 pointer-events-none" : "hover:bg-slate-50 cursor-pointer"
                                        )}
                                    />
                                </PaginationItem>
                            </PaginationContent>
                        </Pagination>
                    </div>
                )}
            </div>

            <ApprovalDetailModal
                memoId={selectedMemoId}
                open={detailOpen}
                onOpenChange={setDetailOpen}
                readOnly={true}
            />
        </div>
    );
}

interface StatsCardProps {
    label: string;
    value: string | number;
    icon: React.ElementType;
    color: "amber" | "blue" | "green";
    trend: string;
}

function StatsCard({ label, value, icon: Icon, color, trend }: StatsCardProps) {
    const colorStyles = {
        amber: "from-amber-400 to-orange-500 text-amber-600 bg-amber-50 shadow-amber-500/10 ring-amber-100",
        blue: "from-blue-500 to-indigo-600 text-blue-600 bg-blue-50 shadow-blue-200/50 ring-blue-100",
        green: "from-emerald-400 to-green-500 text-emerald-600 bg-emerald-50 shadow-emerald-500/10 ring-emerald-100"
    };

    return (
        <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl shadow-slate-200/80 border border-slate-100 relative overflow-hidden group hover:scale-[1.02] transition-all duration-700">
            {/* Background Icon Detail */}
            <div className="absolute -top-6 -right-6 opacity-[0.08] group-hover:opacity-[0.15] group-hover:rotate-12 group-hover:scale-125 transition-all duration-700 pointer-events-none">
                <Icon className="h-48 w-48 text-slate-900" />
            </div>

            <div className="relative z-10 space-y-8">
                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center bg-gradient-to-br shadow-2xl ${colorStyles[color].split(' text')[0]} text-white`}>
                    <Icon className="h-7 w-7" />
                </div>

                <div className="space-y-1.5 pt-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 opacity-80">{label}</p>
                    <h2 className="text-2xl lg:text-3xl font-black tracking-tighter text-slate-900 tabular-nums break-all leading-tight">
                        {value}
                    </h2>
                </div>

                <div className="flex items-center gap-3 pt-4 border-t border-slate-50">
                    <div className={`h-2.5 w-2.5 rounded-full animate-pulse shadow-sm transition-colors ${color === 'amber' ? 'bg-amber-500 shadow-amber-200' : color === 'blue' ? 'bg-blue-500 shadow-blue-200' : 'bg-emerald-500 shadow-emerald-200'}`} />
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400 italic">{trend}</span>
                </div>
            </div>
        </div>
    );
}
