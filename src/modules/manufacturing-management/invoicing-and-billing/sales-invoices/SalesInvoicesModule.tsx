"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Receipt,
    CheckCircle2,
    TrendingUp,
    AlertCircle,
    Search,
    SlidersHorizontal,
    Loader2,
    Check,
    ChevronsUpDown,
    Download,
    FileSpreadsheet,
    User,
    Calendar,
    XCircle,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { useSalesInvoices } from "./hooks/useSalesInvoices";
import SalesInvoiceDetailModal from "./components/SalesInvoiceDetailModal";
import { SalesInvoiceHeader } from "./types";

const STATUS_OPTIONS = [
    { label: "All Statuses", value: "All" },
    { label: "Unpaid Invoices", value: "Unpaid" },
    { label: "Partially Paid", value: "Partially Paid" },
    { label: "Fully Paid", value: "Paid" },
    { label: "Overdue Collections", value: "Overdue" },
    { label: "Cancelled Invoices", value: "Cancelled" },
];

export default function SalesInvoicesModule() {
    const {
        invoices,
        salesmen,
        detailsMap,
        loading,
        loadingDetails,
        metrics,
        page,
        limit,
        setPage,
        setLimit,
        loadInvoiceDetails,
        exportToCSV,
    } = useSalesInvoices();

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");
    const [salesmanFilter, setSalesmanFilter] = useState("All");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    const [statusComboboxOpen, setStatusComboboxOpen] = useState(false);
    const [salesmanComboboxOpen, setSalesmanComboboxOpen] = useState(false);
    const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);

    const filtered = useMemo(() => {
        const query = search.toLowerCase().trim();
        return invoices.filter((inv) => {
            // Status Filter
            const matchesStatus =
                statusFilter === "All" || inv.status === statusFilter;

            // Salesman Filter
            const matchesSalesman =
                salesmanFilter === "All" ||
                String(inv.salesman_id) === salesmanFilter ||
                (inv.salesman_name || "").toLowerCase() === salesmanFilter.toLowerCase();

            // Date Range Filter
            let matchesDate = true;
            if (inv.invoice_date) {
                const invDateStr = inv.invoice_date.slice(0, 10);
                if (startDate && invDateStr < startDate) matchesDate = false;
                if (endDate && invDateStr > endDate) matchesDate = false;
            }

            // Search Query Filter
            const matchesSearch =
                !query ||
                [
                    inv.invoice_no,
                    inv.customer_name,
                    inv.salesman_name,
                    inv.sales_order_no,
                    inv.customer_code,
                ].some((val) => (val || "").toLowerCase().includes(query));

            return matchesStatus && matchesSalesman && matchesDate && matchesSearch;
        });
    }, [invoices, search, statusFilter, salesmanFilter, startDate, endDate]);

    const totalRecords = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / limit));

    useEffect(() => {
        if (page > totalPages) {
            setPage(1);
        }
    }, [page, totalPages, setPage]);

    const paginatedInvoices = useMemo(() => {
        const start = (page - 1) * limit;
        return filtered.slice(start, start + limit);
    }, [filtered, page, limit]);

    const cards = [
        {
            label: "Total Revenue Billed",
            value: metrics.totalBilled,
            icon: Receipt,
            color: "text-primary bg-primary/10",
        },
        {
            label: "Payments Collected",
            value: metrics.totalCollected,
            icon: CheckCircle2,
            color: "text-emerald-600 bg-emerald-500/10",
        },
        {
            label: "Accounts Receivable",
            value: metrics.accountsReceivable,
            icon: TrendingUp,
            color: "text-amber-600 bg-amber-500/10",
        },
        {
            label: "Total VAT Collected",
            value: metrics.totalVat,
            icon: AlertCircle,
            color: "text-blue-600 bg-blue-500/10",
        },
    ];

    const selectedInvoice: SalesInvoiceHeader | null = selectedInvoiceId
        ? invoices.find((i) => i.invoice_id === selectedInvoiceId) ?? null
        : null;

    const clearFilters = () => {
        setSearch("");
        setStatusFilter("All");
        setSalesmanFilter("All");
        setStartDate("");
        setEndDate("");
    };

    const isFiltered =
        !!search ||
        statusFilter !== "All" ||
        salesmanFilter !== "All" ||
        !!startDate ||
        !!endDate;

    const selectedSalesmanLabel = useMemo(() => {
        if (salesmanFilter === "All") return "All Salesmen";
        const found = salesmen.find((sm) => String(sm.id) === salesmanFilter);
        return found ? `${found.salesman_name} (${found.salesman_code})` : "Selected Salesman";
    }, [salesmanFilter, salesmen]);

    return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col space-y-4 no-print p-1 sm:p-2">
            {/* FM Report Header Banner */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border bg-card p-4 shadow-xs">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl p-3 bg-primary/10 text-primary">
                        <FileSpreadsheet className="h-6 w-6" />
                    </div>
                    <div>
                        <h2 className="text-base font-black tracking-tight">
                            Sales Invoice Financial Report
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            Financial Management (FM) Revenue, VAT Selling & Salesman Performance Analysis
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => exportToCSV(filtered)}
                        className="flex items-center gap-1.5 rounded-xl border bg-background px-3.5 py-2 text-xs font-semibold hover:bg-muted transition-colors shadow-2xs"
                    >
                        <Download className="h-4 w-4 text-emerald-600" />
                        Export CSV
                    </button>
                    {/* <button
                        onClick={handlePrintReport}
                        className="flex items-center gap-1.5 rounded-xl border bg-background px-3.5 py-2 text-xs font-semibold hover:bg-muted transition-colors shadow-2xs"
                    >
                        <Printer className="h-4 w-4 text-muted-foreground" />
                        Print Report
                    </button> */}
                </div>
            </div>

            {/* Metric KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((card, idx) => {
                    const Icon = card.icon;
                    return (
                        <motion.div
                            key={card.label}
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, delay: idx * 0.05 }}
                            className="flex items-center gap-3.5 rounded-xl border bg-card p-4 shadow-xs"
                        >
                            <div className={`rounded-xl p-2.5 ${card.color}`}>
                                <Icon className="h-5 w-5" />
                            </div>
                            <div>
                                <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                    {card.label}
                                </span>
                                <h4 className="mt-0.5 text-lg font-black tracking-tight">
                                    ₱
                                    {card.value.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </h4>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Filter & Search Toolbar */}
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-xs">
                <div className="flex flex-col items-center gap-3 lg:flex-row">
                    {/* Search Bar */}
                    <div className="relative w-full flex-1">
                        <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search by Invoice No, Customer, Salesman, SO Ref..."
                            className="w-full rounded-xl border bg-background py-2 pl-10 pr-3.5 text-xs outline-none focus:border-primary transition-all"
                        />
                    </div>

                    {/* Searchable Salesman Combobox Filter */}
                    <div className="w-full sm:w-60">
                        <Popover open={salesmanComboboxOpen} onOpenChange={setSalesmanComboboxOpen}>
                            <PopoverTrigger asChild>
                                <button
                                    role="combobox"
                                    aria-expanded={salesmanComboboxOpen}
                                    aria-controls="salesman-combobox-list"
                                    className="flex w-full items-center justify-between rounded-xl border bg-background px-3 py-2 text-xs font-medium hover:bg-muted/50 focus:outline-none focus:border-primary transition-all"
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <span className="truncate">{selectedSalesmanLabel}</span>
                                    </div>
                                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 p-0 z-50" align="end">
                                <Command>
                                    <CommandInput placeholder="Search salesman..." className="h-8 text-xs" />
                                    <CommandList id="salesman-combobox-list">
                                        <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
                                            No salesman found.
                                        </CommandEmpty>
                                        <CommandGroup>
                                            <CommandItem
                                                value="All Salesmen"
                                                onSelect={() => {
                                                    setSalesmanFilter("All");
                                                    setSalesmanComboboxOpen(false);
                                                }}
                                                className="text-xs cursor-pointer"
                                            >
                                                <Check
                                                    className={`mr-2 h-3.5 w-3.5 ${
                                                        salesmanFilter === "All" ? "opacity-100" : "opacity-0"
                                                    }`}
                                                />
                                                All Salesmen
                                            </CommandItem>
                                            {salesmen.map((sm) => (
                                                <CommandItem
                                                    key={sm.id}
                                                    value={`${sm.salesman_name} ${sm.salesman_code}`}
                                                    onSelect={() => {
                                                        setSalesmanFilter(String(sm.id));
                                                        setSalesmanComboboxOpen(false);
                                                    }}
                                                    className="text-xs cursor-pointer"
                                                >
                                                    <Check
                                                        className={`mr-2 h-3.5 w-3.5 ${
                                                            salesmanFilter === String(sm.id)
                                                                ? "opacity-100"
                                                                : "opacity-0"
                                                        }`}
                                                    />
                                                    {sm.salesman_name} ({sm.salesman_code})
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>

                    {/* Searchable Status Combobox Filter */}
                    <div className="w-full sm:w-48">
                        <Popover open={statusComboboxOpen} onOpenChange={setStatusComboboxOpen}>
                            <PopoverTrigger asChild>
                                <button
                                    role="combobox"
                                    aria-expanded={statusComboboxOpen}
                                    aria-controls="status-combobox-list"
                                    className="flex w-full items-center justify-between rounded-xl border bg-background px-3 py-2 text-xs font-medium hover:bg-muted/50 focus:outline-none focus:border-primary transition-all"
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <span className="truncate">
                                            {STATUS_OPTIONS.find((opt) => opt.value === statusFilter)?.label ||
                                                "Filter Status..."}
                                        </span>
                                    </div>
                                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                                </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-48 p-0 z-50" align="end">
                                <Command>
                                    <CommandInput placeholder="Search status..." className="h-8 text-xs" />
                                    <CommandList id="status-combobox-list">
                                        <CommandEmpty className="py-2 text-center text-xs text-muted-foreground">
                                            No status found.
                                        </CommandEmpty>
                                        <CommandGroup>
                                            {STATUS_OPTIONS.map((option) => (
                                                <CommandItem
                                                    key={option.value}
                                                    value={option.label}
                                                    onSelect={() => {
                                                        setStatusFilter(option.value);
                                                        setStatusComboboxOpen(false);
                                                    }}
                                                    className="text-xs cursor-pointer"
                                                >
                                                    <Check
                                                        className={`mr-2 h-3.5 w-3.5 ${
                                                            statusFilter === option.value
                                                                ? "opacity-100"
                                                                : "opacity-0"
                                                        }`}
                                                    />
                                                    {option.label}
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    </CommandList>
                                </Command>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>

                {/* Date Range Filter Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t">
                    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-bold uppercase mr-1">
                            <Calendar className="h-3.5 w-3.5 text-primary" />
                            Date Range:
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-muted-foreground">From:</span>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="rounded-xl border bg-background px-2.5 py-1 text-xs outline-none focus:border-primary"
                            />
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-muted-foreground">To:</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="rounded-xl border bg-background px-2.5 py-1 text-xs outline-none focus:border-primary"
                            />
                        </div>
                    </div>

                    {isFiltered && (
                        <button
                            onClick={clearFilters}
                            className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700 transition-colors self-end sm:self-auto"
                        >
                            <XCircle className="h-3.5 w-3.5" />
                            Reset Filters
                        </button>
                    )}
                </div>
            </div>

            {/* Invoices Data Table Container */}
            <div className="relative min-h-[420px] flex-1 overflow-auto rounded-xl border bg-card p-4 shadow-xs md:p-6">
                {loading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-xs">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="text-xs font-semibold text-muted-foreground">
                                Loading FM Sales Invoice Report Data...
                            </span>
                        </div>
                    </div>
                )}

                {!loading && filtered.length === 0 ? (
                    <div className="py-16 text-center text-xs text-muted-foreground">
                        No sales invoices found matching the current criteria.
                    </div>
                ) : (
                    <table className="w-full min-w-[1050px] border-collapse text-left text-xs">
                        <thead>
                            <tr className="border-b bg-muted/20 text-[10px] font-bold uppercase text-muted-foreground">
                                <th className="p-3">Invoice No</th>
                                <th className="p-3">Customer</th>
                                <th className="p-3">Salesman</th>
                                <th className="p-3">Branch</th>
                                <th className="p-3">Terms</th>
                                <th className="p-3">Invoice Date</th>
                                <th className="p-3">Due Date</th>
                                <th className="p-3">SO Ref</th>
                                <th className="p-3 text-right">Gross</th>
                                <th className="p-3 text-right">VAT</th>
                                <th className="p-3 text-right">Net Billed</th>
                                <th className="p-3 text-center">Lifecycle</th>
                                <th className="p-3 text-center">Status</th>
                                <th className="p-3">Remarks</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            <AnimatePresence mode="wait">
                                {paginatedInvoices.map((invoice, index) => (
                                    <motion.tr
                                        key={invoice.invoice_id}
                                        initial={{ opacity: 0, y: -8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: 8 }}
                                        transition={{ duration: 0.2, delay: index * 0.02 }}
                                        className="hover:bg-muted/30 cursor-pointer transition-colors"
                                        onClick={() => {
                                            console.log(
                                                `%c[Sales Invoice Row Clicked] Record #${invoice.invoice_id} (${invoice.invoice_no}):`,
                                                "color: #059669; font-weight: bold;",
                                                invoice
                                            );
                                            setSelectedInvoiceId(invoice.invoice_id);
                                            loadInvoiceDetails(invoice.invoice_id);
                                        }}
                                    >
                                        <td className="p-3 font-bold text-foreground">
                                            {invoice.invoice_no}
                                        </td>
                                        <td className="p-3">
                                            <div className="font-semibold text-foreground">{invoice.customer_name}</div>
                                            <span className="inline-block mt-0.5 rounded px-1.5 py-0.5 text-[9px] font-mono font-bold bg-muted text-muted-foreground border">
                                                {invoice.customer_code}
                                            </span>
                                        </td>
                                        <td className="p-3 text-muted-foreground">
                                            {invoice.salesman_name || "Unassigned"}
                                        </td>
                                        <td className="p-3 text-muted-foreground">
                                            {invoice.branch_name || "N/A"}
                                        </td>
                                        <td className="p-3 text-muted-foreground">
                                            {invoice.payment_term_name || "N/A"}
                                        </td>
                                        <td className="p-3 text-muted-foreground">
                                            {new Date(invoice.invoice_date).toLocaleDateString()}
                                        </td>
                                        <td className="p-3 text-muted-foreground">
                                            {invoice.due_date
                                                ? new Date(invoice.due_date).toLocaleDateString()
                                                : "N/A"}
                                        </td>
                                        <td className="p-3 font-semibold text-primary">
                                            {invoice.sales_order_no || "Manual"}
                                        </td>
                                        <td className="p-3 text-right text-muted-foreground">
                                            ₱
                                            {Number(invoice.gross_amount || 0).toLocaleString(
                                                undefined,
                                                { minimumFractionDigits: 2 }
                                            )}
                                        </td>
                                        <td className="p-3 text-right text-muted-foreground">
                                            ₱
                                            {Number(invoice.vat_amount || 0).toLocaleString(
                                                undefined,
                                                { minimumFractionDigits: 2 }
                                            )}
                                        </td>
                                        <td className="p-3 text-right font-black text-foreground">
                                            ₱
                                            {Number(invoice.net_amount || 0).toLocaleString(
                                                undefined,
                                                { minimumFractionDigits: 2 }
                                            )}
                                        </td>
                                        <td className="p-3 text-center">
                                            <span className="rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase border bg-primary/10 text-primary border-primary/20">
                                                {invoice.transaction_status || "Prepared"}
                                            </span>
                                        </td>
                                        <td className="p-3 text-center">
                                            <span
                                                className={`rounded-full px-2.5 py-0.5 text-[9px] font-extrabold uppercase border ${
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
                                        </td>
                                        <td className="p-3 text-muted-foreground max-w-[120px] truncate" title={invoice.remarks?.trim() ? invoice.remarks : "No remarks"}>
                                            {invoice.remarks?.trim() ? invoice.remarks : "No remarks"}
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination Controls Footer */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-2.5 rounded-xl border bg-card text-xs shadow-xs">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-medium">Rows per page:</span>
                        <select
                            value={limit}
                            onChange={(e) => {
                                setLimit(Number(e.target.value));
                                setPage(1);
                            }}
                            className="rounded-lg border bg-background px-2.5 py-1 text-xs font-semibold outline-none focus:border-primary"
                        >
                            {[10, 25, 50, 100].map((size) => (
                                <option key={size} value={size}>
                                    {size}
                                </option>
                            ))}
                        </select>
                    </div>

                    <span className="text-muted-foreground">
                        Showing{" "}
                        <span className="font-bold text-foreground">
                            {totalRecords > 0 ? (page - 1) * limit + 1 : 0}
                        </span>{" "}
                        to{" "}
                        <span className="font-bold text-foreground">
                            {Math.min(page * limit, totalRecords)}
                        </span>{" "}
                        of <span className="font-bold text-foreground">{totalRecords}</span> records
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-muted-foreground font-medium">
                        Page <span className="font-bold text-foreground">{page}</span> of{" "}
                        <span className="font-bold text-foreground">{totalPages}</span>
                    </span>

                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            disabled={page <= 1}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            aria-label="Previous Page"
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                            disabled={page >= totalPages}
                            className="flex h-8 w-8 items-center justify-center rounded-lg border bg-background hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            aria-label="Next Page"
                        >
                            <ChevronRight className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Selected Invoice Read-Only Detail Modal */}
            <SalesInvoiceDetailModal
                invoice={selectedInvoice}
                invoiceDetails={
                    selectedInvoice ? detailsMap[selectedInvoice.invoice_id] || [] : []
                }
                isOpen={!!selectedInvoice}
                onClose={() => setSelectedInvoiceId(null)}
                loadingDetails={
                    selectedInvoice ? !!loadingDetails[selectedInvoice.invoice_id] : false
                }
            />
        </div>
    );
}
