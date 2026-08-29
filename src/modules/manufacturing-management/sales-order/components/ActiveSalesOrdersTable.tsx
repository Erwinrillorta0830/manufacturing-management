import React, { useState, useEffect } from "react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DollarSign, Eye, Check, Loader2, Search, SlidersHorizontal, ChevronLeft, ChevronRight } from "lucide-react";
import { SalesOrder } from "../types";
import { formatCurrency } from "@/lib/utils";

interface ActiveSalesOrdersTableProps {
    salesOrders: SalesOrder[];
    loading?: boolean;
    updatingStatusId: number | null;
    viewOrderDetails: (so: SalesOrder) => void;
    handleApproveOrder: (orderId: number) => void;
    
    // Pagination & Filter props
    currentPage: number;
    setCurrentPage: (page: number) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    statusFilter: string;
    setStatusFilter: (status: string) => void;
    totalCount: number;
    totalPages: number;
    limit: number;
    setLimit: (limit: number) => void;
    customerCodeFilter?: string;
    setCustomerCodeFilter?: (code: string) => void;
    dateFromFilter?: string;
    setDateFromFilter?: (date: string) => void;
    dateToFilter?: string;
    setDateToFilter?: (date: string) => void;
}

export function ActiveSalesOrdersTable({
    salesOrders,
    loading,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    updatingStatusId,
    viewOrderDetails,
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    handleApproveOrder,
    currentPage,
    setCurrentPage,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    totalCount,
    totalPages,
    limit,
    setLimit,
    customerCodeFilter,
    setCustomerCodeFilter,
    dateFromFilter,
    setDateFromFilter,
    dateToFilter,
    setDateToFilter
}: ActiveSalesOrdersTableProps) {
    const [localSearch, setLocalSearch] = useState(searchQuery);
    const [localCustomerSearch, setLocalCustomerSearch] = useState(customerCodeFilter || "");
    const [isCustomerFocused, setIsCustomerFocused] = useState(false);
    const [customersList, setCustomersList] = useState<{ id: number; customer_name: string; customer_code: string }[]>([]);

    useEffect(() => {
        fetch("/api/manufacturing/customer?limit=-1&fields=id,customer_name,customer_code")
            .then(res => res.ok ? res.json() : [])
            .then(data => setCustomersList(data.data || data))
            .catch(err => console.error(err));
    }, []);

    const filteredCustomers = customersList.filter(c => 
        c.customer_name.toLowerCase().includes(localCustomerSearch.toLowerCase()) ||
        c.customer_code.toLowerCase().includes(localCustomerSearch.toLowerCase())
    );

    useEffect(() => {
        setLocalSearch(searchQuery);
    }, [searchQuery]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSearchQuery(localSearch);
    };

    // O(1) dynamic page number list generator with ellipsis
    const getPageNumbers = () => {
        const pages: number[] = [];
        const maxVisible = 1; // Pages around the current page
        
        pages.push(1);
        
        const start = Math.max(2, currentPage - maxVisible);
        const end = Math.min(totalPages - 1, currentPage + maxVisible);
        
        if (start > 2) {
            pages.push(-1); // Ellipsis identifier
        }
        
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }
        
        if (end < totalPages - 1) {
            pages.push(-2); // Ellipsis identifier
        }
        
        if (totalPages > 1) {
            pages.push(totalPages);
        }
        
        return pages;
    };

    return (
        <div className="space-y-4">
            {/* Filters Header */}
            <div className="flex flex-col gap-4 bg-card p-5 rounded-2xl border border-border shadow-xs">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 w-full">
                    <form onSubmit={handleSearchSubmit} className="relative w-full xl:max-w-md flex gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search sales orders..."
                                value={localSearch}
                                onChange={(e) => {
                                    setLocalSearch(e.target.value);
                                    if (e.target.value === "") {
                                        setSearchQuery("");
                                    }
                                }}
                                className="w-full bg-background pl-9 pr-3 py-2 text-xs rounded-lg border border-input focus:ring-1 focus:ring-primary focus:border-primary outline-none text-foreground font-semibold transition-all duration-200 shadow-xs"
                            />
                        </div>
                        <button
                            type="submit"
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-4 py-2 rounded-lg text-xs transition-all shadow-xs cursor-pointer border-none"
                        >
                            Search
                        </button>
                    </form>

                    <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto justify-start xl:justify-end">
                        {/* Customer Search Dropdown */}
                        <div className="relative w-full sm:w-48">
                            <input
                                type="text"
                                placeholder="Filter Customer..."
                                value={localCustomerSearch}
                                onFocus={() => setIsCustomerFocused(true)}
                                onBlur={() => setTimeout(() => setIsCustomerFocused(false), 200)}
                                onChange={(e) => {
                                    setLocalCustomerSearch(e.target.value);
                                    if (e.target.value === "" && setCustomerCodeFilter) {
                                        setCustomerCodeFilter("");
                                    }
                                }}
                                className="w-full bg-background px-3 py-2 text-xs rounded-lg border border-input focus:ring-1 focus:ring-primary focus:border-primary outline-none text-foreground font-semibold transition-all duration-200 shadow-xs"
                            />
                            {isCustomerFocused && (
                                <div className="absolute z-50 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border bg-card shadow-2xl divide-y border-border">
                                    {filteredCustomers.length === 0 ? (
                                        <div className="px-3 py-2 text-xs text-muted-foreground italic">No customers found</div>
                                    ) : (
                                        filteredCustomers.map(c => (
                                            <button
                                                type="button"
                                                key={c.id}
                                                onClick={() => {
                                                    setLocalCustomerSearch(c.customer_name);
                                                    setIsCustomerFocused(false);
                                                    if (setCustomerCodeFilter) setCustomerCodeFilter(c.customer_code);
                                                }}
                                                className="w-full text-left px-3 py-2.5 text-xs hover:bg-muted text-foreground transition-colors font-medium"
                                            >
                                                {c.customer_name} <span className="text-[10px] text-muted-foreground font-mono">({c.customer_code})</span>
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Date Range Filters */}
                        <div className="flex items-center gap-2 bg-muted border border-border rounded-lg p-1 shadow-xs">
                            <input
                                type="date"
                                value={dateFromFilter || ""}
                                onChange={(e) => setDateFromFilter && setDateFromFilter(e.target.value)}
                                title="Start Date"
                                className="bg-transparent border-none rounded-md px-1.5 py-1 text-xs font-semibold text-foreground outline-none cursor-pointer focus:bg-background dark:[color-scheme:dark]"
                            />
                            <span className="text-muted-foreground text-xs font-bold">to</span>
                            <input
                                type="date"
                                value={dateToFilter || ""}
                                onChange={(e) => setDateToFilter && setDateToFilter(e.target.value)}
                                title="End Date"
                                className="bg-transparent border-none rounded-md px-1.5 py-1 text-xs font-semibold text-foreground outline-none cursor-pointer focus:bg-background dark:[color-scheme:dark]"
                            />
                        </div>

                        {/* Status Filter */}
                        <div className="flex items-center gap-2">
                            <select
                                value={statusFilter || "All"}
                                onChange={(e) => setStatusFilter(e.target.value)}
                                className="bg-background border border-input rounded-lg px-3 py-2 text-xs font-bold text-foreground focus:ring-1 focus:ring-primary outline-none cursor-pointer transition-all shadow-xs"
                            >
                                <option value="All">All Statuses</option>
                                <option value="Draft">Draft</option>
                                <option value="Pending">Pending</option>
                                <option value="For Approval">For Approval</option>
                                <option value="For Production">For Production</option>
                                <option value="In Production">In Production</option>
                                <option value="For Consolidation">For Consolidation</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {salesOrders.length === 0 && !loading ? (
                <div className="text-center p-16 border rounded-2xl bg-card shadow-xs border-dashed border-border">
                    <DollarSign className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <h4 className="text-sm font-bold text-foreground">No Sales Orders Found</h4>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                        {(searchQuery || statusFilter || customerCodeFilter || dateFromFilter || dateToFilter) 
                            ? "No records matched your search query or status filter." 
                            : "Convert winning quotes from the pipeline to launch Sales Orders."}
                    </p>
                    {(searchQuery || statusFilter || customerCodeFilter || dateFromFilter || dateToFilter) && (
                        <button
                            onClick={() => {
                                setLocalSearch("");
                                  setSearchQuery("");
                                  setStatusFilter("");
                                  setLocalCustomerSearch("");
                                  if (setCustomerCodeFilter) setCustomerCodeFilter("");
                                  if (setDateFromFilter) setDateFromFilter("");
                                  if (setDateToFilter) setDateToFilter("");
                            }}
                            className="mt-4 bg-muted hover:bg-muted border border-border text-foreground font-bold px-4 py-2 rounded-lg text-xs transition-all cursor-pointer"
                        >
                            Clear Filters
                        </button>
                    )}
                </div>
            ) : (
                <div className="overflow-hidden border border-border/80 rounded-2xl bg-card shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-xs">
                            <thead className="bg-muted border-b border-border">
                                <tr>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px]">Order No</th>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px]">Customer</th>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px]">Order Date</th>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px] text-right">Gross Total</th>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px] text-right">Discount</th>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px] text-right">Net Amount</th>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px] text-center">Status</th>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px] text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {loading ? (
                                    Array.from({ length: 5 }).map((_, i) => (
                                        <tr key={`skeleton-${i}`} className="animate-pulse hover:bg-transparent">
                                            <td className="p-4"><div className="h-4 w-24 bg-muted rounded"></div></td>
                                            <td className="p-4">
                                                <div className="flex flex-col gap-1.5">
                                                    <div className="h-4 w-32 bg-muted rounded"></div>
                                                    <div className="h-3 w-20 bg-muted/50 rounded"></div>
                                                </div>
                                            </td>
                                            <td className="p-4"><div className="h-4 w-20 bg-muted rounded"></div></td>
                                            <td className="p-4"><div className="h-4 w-20 bg-muted rounded ml-auto"></div></td>
                                            <td className="p-4"><div className="h-4 w-20 bg-muted rounded ml-auto"></div></td>
                                            <td className="p-4"><div className="h-4 w-20 bg-muted rounded ml-auto"></div></td>
                                            <td className="p-4"><div className="h-5 w-20 bg-muted rounded-full mx-auto"></div></td>
                                            <td className="p-4"><div className="h-7 w-24 bg-muted rounded-lg mx-auto"></div></td>
                                        </tr>
                                    ))
                                ) : salesOrders.map(so => (
                                    <tr key={so.order_id} className="hover:bg-muted/50 transition-colors">
                                        <td className="p-4 font-extrabold text-foreground">{so.order_no}</td>
                                        <td className="p-4 font-semibold text-foreground">
                                            {so.customer_name ? (
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-foreground">{so.customer_name}</span>
                                                    <span className="text-[9px] text-muted-foreground font-mono font-normal">({so.customer_code})</span>
                                                </div>
                                            ) : (
                                                <span className="font-mono">{so.customer_code}</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-muted-foreground font-medium">
                                            {so.order_date ? new Date(so.order_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "N/A"}
                                        </td>
                                        <td className="p-4 text-right font-black text-foreground text-sm font-mono">
                                            {formatCurrency(so.total_amount)}
                                        </td>
                                        <td className="p-4 text-right font-black text-destructive text-sm font-mono">
                                            {so.discount_amount ? `-${formatCurrency(so.discount_amount)}` : "-"}
                                        </td>
                                        <td className="p-4 text-right font-black text-primary text-sm font-mono">
                                            {formatCurrency(so.net_amount)}
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`inline-flex px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                                so.order_status === "Draft"
                                                    ? "bg-muted text-foreground border border-border"
                                                    : so.order_status === "Pending"
                                                    ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20"
                                                    : so.order_status === "For Approval"
                                                    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                                                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                            }`}>
                                                {so.order_status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-center">
                                            <div className="flex items-center justify-center">
                                                <button
                                                    onClick={() => viewOrderDetails(so)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted hover:border-border text-muted-foreground font-bold transition-all text-[11px] shadow-xs cursor-pointer"
                                                    title="View Line Items"
                                                >
                                                    <Eye className="h-3.5 w-3.5" />
                                                    View Details
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Footer */}
                    {totalCount > 0 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between border-t bg-muted/20 px-4 py-3 rounded-b-xl gap-4">
                            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
                                <span className="text-[11px] text-muted-foreground font-medium">
                                    Showing page <span className="font-bold text-foreground">{currentPage}</span> of <span className="font-bold text-foreground">{totalPages || 1}</span> ({totalCount} total results)
                                </span>
                                <div className="flex items-center gap-2">
                                    <label htmlFor="per-page-select" className="text-[11px] text-muted-foreground font-medium">Rows per page:</label>
                                    <select
                                        id="per-page-select"
                                        value={limit}
                                        onChange={(e) => {
                                            setLimit(Number(e.target.value));
                                            setCurrentPage(1);
                                        }}
                                        className="h-7 rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
                                    >
                                        <option value={10}>10</option>
                                        <option value={25}>25</option>
                                        <option value={50}>50</option>
                                        <option value={100}>100</option>
                                    </select>
                                </div>
                            </div>
                            {totalPages > 1 && (
                                <div className="flex items-center gap-1.5">
                                    <button
                                        disabled={currentPage <= 1}
                                        onClick={() => setCurrentPage(currentPage - 1)}
                                        className="inline-flex items-center justify-center p-1.5 rounded-md border bg-background hover:bg-muted text-muted-foreground disabled:opacity-40 disabled:hover:bg-background transition-all"
                                        title="Previous Page"
                                    >
                                        <ChevronLeft className="h-4 w-4" />
                                    </button>
                                    
                                    {getPageNumbers().map((p, idx) => {
                                        if (p < 0) {
                                            return (
                                                <span key={`dots-${idx}`} className="text-muted-foreground px-1 text-xs select-none">
                                                    ...
                                                </span>
                                            );
                                        }
                                        return (
                                            <button
                                                key={p}
                                                onClick={() => setCurrentPage(p)}
                                                className={`h-7 w-7 inline-flex items-center justify-center rounded-md text-xs font-bold transition-all border ${
                                                    currentPage === p
                                                        ? "bg-primary text-primary-foreground border-primary"
                                                        : "bg-background hover:bg-muted text-muted-foreground"
                                                }`}
                                            >
                                                {p}
                                            </button>
                                        );
                                    })}

                                    <button
                                        disabled={currentPage >= totalPages}
                                        onClick={() => setCurrentPage(currentPage + 1)}
                                        className="inline-flex items-center justify-center p-1.5 rounded-md border bg-background hover:bg-muted text-muted-foreground disabled:opacity-40 disabled:hover:bg-background transition-all"
                                        title="Next Page"
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
