import React, { useState, useEffect } from "react";
import { DollarSign, Eye, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { SalesOrder } from "../../sales-order/types";
import { formatCurrency } from "@/lib/utils";

interface SalesOrderApprovalTableProps {
    salesOrders: SalesOrder[];
    updatingStatusId?: number | null;
    viewOrderDetails: (so: SalesOrder) => void;
    handleApprove?: (orderId: number) => void;
    handleReject?: (orderId: number) => void;

    // Pagination & Filter props
    currentPage: number;
    setCurrentPage: (page: number) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    totalCount: number;
    totalPages: number;
    limit: number;

    // New Filter props

    customerCodeFilter?: string;
    setCustomerCodeFilter?: (code: string) => void;
    dateFromFilter?: string;
    setDateFromFilter?: (date: string) => void;
    dateToFilter?: string;
    setDateToFilter?: (date: string) => void;
    statusFilter?: string;
    setStatusFilter?: (status: string) => void;
}

export function SalesOrderApprovalTable({
    salesOrders,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    updatingStatusId,
    viewOrderDetails,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    handleApprove,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    handleReject,
    currentPage,
    setCurrentPage,
    searchQuery,
    setSearchQuery,

    customerCodeFilter,
    setCustomerCodeFilter,
    dateFromFilter,
    setDateFromFilter,
    dateToFilter,
    setDateToFilter,
    statusFilter,
    setStatusFilter,
    totalCount,
    totalPages,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    limit
}: SalesOrderApprovalTableProps) {
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
        const maxVisible = 1;

        pages.push(1);

        const start = Math.max(2, currentPage - maxVisible);
        const end = Math.min(totalPages - 1, currentPage + maxVisible);

        if (start > 2) {
            pages.push(-1);
        }

        for (let i = start; i <= end; i++) {
            pages.push(i);
        }

        if (end < totalPages - 1) {
            pages.push(-2);
        }

        if (totalPages > 1) {
            pages.push(totalPages);
        }

        return pages;
    };

    return (
        <div className="space-y-4">
            {/* Top Toolbar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-border shadow-xs">
                <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full md:w-auto">
                    <form onSubmit={handleSearchSubmit} className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search SO #, PO #, code..."
                            value={localSearch}
                            onChange={(e) => setLocalSearch(e.target.value)}
                            className="w-full bg-background pl-9 pr-3 py-2 text-xs rounded-lg border border-input focus:ring-1 focus:ring-primary focus:border-primary outline-none text-foreground font-semibold transition-all duration-200 shadow-xs"
                        />
                    </form>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Customer Search Autocomplete Dropdown */}
                        <div className="relative w-full sm:w-48">
                            <input
                                type="text"
                                placeholder="Filter Customer..."
                                value={localCustomerSearch}
                                onFocus={() => setIsCustomerFocused(true)}
                                onBlur={() => setTimeout(() => setIsCustomerFocused(false), 200)}
                                onChange={(e) => {
                                    setLocalCustomerSearch(e.target.value);
                                    setIsCustomerFocused(true);
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
                        <div className="relative w-full sm:w-auto">
                            <select
                                value={statusFilter || "For Approval,On Hold"}
                                onChange={(e) => setStatusFilter && setStatusFilter(e.target.value)}
                                className="bg-muted px-3 py-2 text-xs rounded-lg border border-border outline-none text-foreground font-semibold shadow-xs transition-all duration-200 cursor-pointer appearance-none pr-8"
                            >
                                <option value="For Approval,On Hold">All Status</option>
                                <option value="For Approval">For Approval</option>
                                <option value="On Hold">On Hold</option>
                            </select>
                            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-muted-foreground">
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                                </svg>
                            </div>
                        </div>

                    </div>
                </div>

                <div className="text-[13px] text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/20 self-start shadow-xs tracking-tight whitespace-nowrap">
                    Queue: <span className="font-mono font-black text-sm">{totalCount}</span>
                </div>
            </div>

            {salesOrders.length === 0 ? (
                <div className="text-center p-16 border rounded-2xl bg-card shadow-xs border-dashed border-border">
                    <DollarSign className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                    <h4 className="text-sm font-bold text-foreground">No Sales Orders Found</h4>
                    <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                        {searchQuery
                            ? "No sales order matches your search query."
                            : "There are no sales orders currently matching the selected status filter."}
                    </p>
                    {searchQuery && (
                        <button
                            onClick={() => {
                                setLocalSearch("");
                                setSearchQuery("");
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
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px]">Order No.</th>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px]">Status</th>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px]">Customer</th>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px]">PO Number</th>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px]">Order Date</th>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px]">Delivery Date</th>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px] text-right">Selling Total</th>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px] text-right">Gross Total</th>
                                    <th className="p-4.5 font-extrabold text-muted-foreground uppercase tracking-wider text-[10px] text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {salesOrders.map(so => (
                                    <tr key={so.order_id} className="hover:bg-muted/50 transition-colors">
                                        <td className="p-4 font-extrabold text-foreground">{so.order_no}</td>
                                        <td className="p-4">
                                            {so.order_status === "On Hold" ? (
                                                <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                                    On Hold
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                                    {so.order_status || "For Approval"}
                                                </span>
                                            )}
                                        </td>
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
                                        <td className="p-4 font-semibold text-foreground">
                                            {so.po_no ? <span className="font-mono text-xs">{so.po_no}</span> : <span className="text-muted-foreground italic font-normal">N/A</span>}
                                        </td>
                                        <td className="p-4 text-muted-foreground font-medium">
                                            {so.order_date ? new Date(so.order_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "N/A"}
                                        </td>
                                        <td className="p-4 text-muted-foreground font-medium">
                                            {so.delivery_date ? new Date(so.delivery_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "N/A"}
                                        </td>
                                        <td className="p-4 text-right font-black text-foreground text-sm font-mono">
                                            {formatCurrency(so.net_amount)}
                                        </td>
                                        <td className="p-4 text-right font-bold text-muted-foreground font-mono">
                                            {formatCurrency(so.total_amount)}
                                        </td>

                                        <td className="p-4 text-center">
                                            <button
                                                onClick={() => viewOrderDetails(so)}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-foreground font-bold transition-all text-xs shadow-xs cursor-pointer"
                                                title="Review order pricing and details"
                                            >
                                                <Eye className="h-3.5 w-3.5 text-amber-500" />
                                                Review
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Footer */}
                    {totalCount > 0 && (
                        <div className="flex flex-col sm:flex-row items-center justify-between border-t bg-muted/20 px-4 py-3 rounded-b-xl gap-2.5">
                            <span className="text-[11px] text-muted-foreground font-medium text-center sm:text-left">
                                Showing page <span className="font-bold text-foreground">{currentPage}</span> of <span className="font-bold text-foreground">{totalPages || 1}</span> ({totalCount} total results)
                            </span>
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
                                                className={`h-7 w-7 inline-flex items-center justify-center rounded-md text-xs font-bold transition-all border ${currentPage === p
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
