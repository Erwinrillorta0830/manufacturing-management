// src/modules/manufacturing-management/mm/sales-and-fulfillment/fulfilment-and-deliveries/DeliveriesModule.tsx

"use client";

import React, { useState } from "react";
import { motion, Variants } from "framer-motion";
import { useDeliveries } from "./hooks/useDeliveries";
import DeliveryClearanceModal from "./components/DeliveryClearanceModal";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Truck,
    Clock,
    CheckCircle2,
    RotateCcw,
    AlertCircle,
    Search,
    SlidersHorizontal,
    Building2,
    ChevronDown,
    ChevronRight,
    Loader2,
    RefreshCw,
    ClipboardCheck,
    Calendar,
    Receipt,
    User,
    Package,
    AlertTriangle,
} from "lucide-react";
import { FulfillmentStatus } from "./types";

export default function DeliveriesModule() {
    const {
        records,
        loading,
        error,
        metrics,
        branches,
        selectedBranchId,
        setSelectedBranchId,
        statusFilter,
        setStatusFilter,
        searchQuery,
        setSearchQuery,
        selectedRecordForClearance,
        isClearanceModalOpen,
        submitting,
        openClearanceModal,
        closeClearanceModal,
        handleClearanceSubmit,
        reload,
    } = useDeliveries();

    // Accordion expanded rows state
    const [expandedRowIds, setExpandedRowIds] = useState<Set<number>>(new Set());

    const toggleRow = (invoiceId: number) => {
        setExpandedRowIds((prev) => {
            const next = new Set(prev);
            if (next.has(invoiceId)) next.delete(invoiceId);
            else next.add(invoiceId);
            return next;
        });
    };

    const statusBadgeStyles: Record<FulfillmentStatus, string> = {
        Pending: "bg-zinc-500/10 border-zinc-500/20 text-zinc-600 dark:text-zinc-400",
        Fulfilled: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
        "Fulfilled with Returns": "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
        "Fulfilled with Concern": "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
        Unfulfilled: "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400",
    };

    // Staggered top-to-bottom animation variants
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.04,
            },
        },
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: -10 },
        show: { opacity: 1, y: 0, transition: { duration: 0.2 } },
    };

    return (
        <div className="flex flex-col min-h-0 min-w-0 flex-1 p-3 sm:p-5 space-y-4 text-foreground">
            {/* Header Title Section (Enhanced Size & Width) */}
            <section className="rounded-xl border bg-card shadow-sm p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 text-primary shrink-0">
                            <Truck className="h-6 w-6" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-wider text-primary">
                                Sales & Fulfillment
                            </p>
                            <h1 className="text-base sm:text-lg font-black uppercase tracking-wide text-foreground mt-0.5">
                                Fulfillment & Deliveries — <span className="text-primary">Delivery Clearance & Receiving</span>
                            </h1>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Post-dispatch reconciliation of returned delivery manifests, quantities received, and return stock.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => reload()}
                            disabled={loading}
                            className="px-3.5 py-2 rounded-xl border hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer bg-card flex items-center gap-2 text-xs font-bold shadow-xs"
                            title="Refresh Delivery Clearance List"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin text-primary" : ""}`} />
                            <span>Refresh Data</span>
                        </button>
                    </div>
                </div>
            </section>

            {/* Metric KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 shrink-0">
                {/* 1. Total Dispatched */}
                <div className="border bg-card rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
                    <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                        <Truck className="h-5 w-5" />
                    </div>
                    <div>
                        <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">
                            Dispatched Runs
                        </span>
                        <h4 className="text-base font-black text-foreground mt-0.5">{metrics.total_dispatched} Manifests</h4>
                    </div>
                </div>

                {/* 2. Pending Clearance */}
                <div className="border bg-card rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
                        <Clock className="h-5 w-5" />
                    </div>
                    <div>
                        <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">
                            Pending Clearance
                        </span>
                        <h4 className="text-base font-black text-amber-600 dark:text-amber-400 mt-0.5">
                            {metrics.pending_clearance} Deliveries
                        </h4>
                    </div>
                </div>

                {/* 3. Fulfilled */}
                <div className="border bg-card rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                        <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                        <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">
                            Fulfilled Complete
                        </span>
                        <h4 className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                            {metrics.fulfilled_count} Orders
                        </h4>
                    </div>
                </div>

                {/* 4. Concerns & Returns */}
                <div className="border bg-card rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
                    <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500">
                        <RotateCcw className="h-5 w-5" />
                    </div>
                    <div>
                        <span className="text-[10px] text-muted-foreground font-black uppercase tracking-wider block">
                            Concerns / Returns
                        </span>
                        <h4 className="text-base font-black text-rose-600 dark:text-rose-400 mt-0.5">
                            {metrics.concerns_and_returns_count} Discrepancies
                        </h4>
                    </div>
                </div>
            </div>

            {/* Error Message Display (Strictly No Fallback) */}
            {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2.5 shadow-sm">
                    <AlertCircle className="h-5 w-5 shrink-0" />
                    <div>
                        <p className="font-bold">Error loading delivery clearance:</p>
                        <p className="text-[11px] mt-0.5">{error}</p>
                    </div>
                </div>
            )}

            {/* Filter Bar with Shadcn Select */}
            <div className="flex flex-col sm:flex-row gap-3 items-center shrink-0">
                {/* Search Bar */}
                <div className="relative w-full sm:flex-1">
                    <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search by Order No (SO), Invoice No, or Customer Name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9.5 w-full bg-card border border-input rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-foreground shadow-xs"
                    />
                </div>

                {/* Branch Selector (Shadcn UI) */}
                <div className="w-full sm:w-auto">
                    <Select
                        value={selectedBranchId}
                        onValueChange={(val) => setSelectedBranchId(val)}
                    >
                        <SelectTrigger className="w-full sm:w-[200px] h-9 text-xs rounded-xl bg-card shadow-xs">
                            <div className="flex items-center gap-2 truncate">
                                <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <SelectValue placeholder="All Branches" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Branches</SelectItem>
                            {branches.map((b) => (
                                <SelectItem key={b.id} value={String(b.id)}>
                                    {b.branch_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {/* Clearance Status Filter Selector (Shadcn UI) */}
                <div className="w-full sm:w-auto">
                    <Select
                        value={statusFilter}
                        onValueChange={(val) => setStatusFilter(val)}
                    >
                        <SelectTrigger className="w-full sm:w-[210px] h-9 text-xs rounded-xl bg-card shadow-xs">
                            <div className="flex items-center gap-2 truncate">
                                <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <SelectValue placeholder="All Statuses" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="All">All Statuses</SelectItem>
                            <SelectItem value="Pending">Pending Clearance</SelectItem>
                            <SelectItem value="Fulfilled">Fulfilled</SelectItem>
                            <SelectItem value="Fulfilled with Returns">Fulfilled with Returns</SelectItem>
                            <SelectItem value="Fulfilled with Concern">Fulfilled with Concern</SelectItem>
                            <SelectItem value="Unfulfilled">Unfulfilled</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Table Area (Top-to-Down Motion Stagger) */}
            <div className="flex-1 min-h-0 relative bg-card border rounded-xl shadow-sm flex flex-col overflow-hidden">
                {loading && (
                    <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-30 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}

                <div className="flex-1 overflow-auto min-h-0">
                    {records.length === 0 && !loading ? (
                        <div className="text-center py-16 px-4">
                            <ClipboardCheck className="h-12 w-12 text-muted-foreground/30 mx-auto" />
                            <h5 className="font-bold text-foreground text-xs uppercase tracking-wide mt-3">
                                No Delivery Clearance Records
                            </h5>
                            <p className="text-[11px] text-muted-foreground mt-1 max-w-sm mx-auto">
                                {searchQuery || statusFilter !== "All"
                                    ? "No delivery manifests matched your selected search filters."
                                    : "All dispatched deliveries have been cleared and reconciled."}
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b bg-muted/30 sticky top-0 z-10 backdrop-blur-sm">
                                    <th className="p-3 w-10 text-center"></th>
                                    <th className="p-3 font-bold text-muted-foreground uppercase text-[10px]">Order No</th>
                                    <th className="p-3 font-bold text-muted-foreground uppercase text-[10px]">Invoice No</th>
                                    <th className="p-3 font-bold text-muted-foreground uppercase text-[10px]">Invoice Date</th>
                                    <th className="p-3 font-bold text-muted-foreground uppercase text-[10px]">Customer</th>
                                    <th className="p-3 font-bold text-muted-foreground uppercase text-[10px] text-right">Amount</th>
                                    <th className="p-3 font-bold text-muted-foreground uppercase text-[10px]">Remarks</th>
                                    <th className="p-3 font-bold text-muted-foreground uppercase text-[10px] text-center">Clearance Status</th>
                                    <th className="p-3 font-bold text-muted-foreground uppercase text-[10px] text-center">Action</th>
                                </tr>
                            </thead>
                            <motion.tbody
                                variants={containerVariants}
                                initial="hidden"
                                animate="show"
                                className="divide-y bg-card"
                            >
                                {records.map((record) => {
                                    const isExpanded = expandedRowIds.has(record.invoice_id);
                                    const isCleared = record.is_cleared;

                                    return (
                                        <React.Fragment key={record.invoice_id}>
                                            {/* Header Row */}
                                            <motion.tr
                                                variants={itemVariants}
                                                className={`hover:bg-muted/10 transition-colors ${
                                                    isExpanded ? "bg-muted/10" : ""
                                                }`}
                                            >
                                                <td className="p-3 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleRow(record.invoice_id)}
                                                        className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border-none bg-transparent cursor-pointer"
                                                        title="Expand Product Line Breakdown"
                                                    >
                                                        {isExpanded ? (
                                                            <ChevronDown className="h-4 w-4 text-primary" />
                                                        ) : (
                                                            <ChevronRight className="h-4 w-4" />
                                                        )}
                                                    </button>
                                                </td>

                                                {/* Order No */}
                                                <td className="p-3 font-black text-foreground">
                                                    <div className="flex items-center gap-1.5">
                                                        <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                                                        {record.order_no}
                                                    </div>
                                                </td>

                                                {/* Invoice No */}
                                                <td className="p-3 font-bold text-muted-foreground">
                                                    {record.invoice_no}
                                                </td>

                                                {/* Invoice Date */}
                                                <td className="p-3 text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {new Date(record.invoice_date).toLocaleDateString(undefined, {
                                                            dateStyle: "medium",
                                                        })}
                                                    </span>
                                                </td>

                                                {/* Customer */}
                                                <td className="p-3">
                                                    <div className="flex items-center gap-1.5">
                                                        <User className="h-3.5 w-3.5 text-muted-foreground" />
                                                        <span className="font-bold text-foreground truncate max-w-[180px]">
                                                            {record.customer_name}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Amount */}
                                                <td className="p-3 text-right font-black text-foreground">
                                                    ₱{record.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>

                                                {/* Remarks */}
                                                <td className="p-3 text-muted-foreground max-w-[180px] truncate" title={record.remarks}>
                                                    {record.remarks || "—"}
                                                </td>

                                                {/* Clearance Status Badge */}
                                                <td className="p-3 text-center">
                                                    <span
                                                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${
                                                            statusBadgeStyles[record.fulfillment_status] || statusBadgeStyles.Pending
                                                        }`}
                                                    >
                                                        {record.fulfillment_status === "Fulfilled" && <CheckCircle2 className="h-3 w-3" />}
                                                        {record.fulfillment_status === "Fulfilled with Returns" && <RotateCcw className="h-3 w-3" />}
                                                        {record.fulfillment_status === "Fulfilled with Concern" && <AlertCircle className="h-3 w-3" />}
                                                        {record.fulfillment_status === "Unfulfilled" && <AlertTriangle className="h-3 w-3" />}
                                                        {record.fulfillment_status}
                                                    </span>
                                                </td>

                                                {/* Action Button */}
                                                <td className="p-3 text-center">
                                                    <button
                                                        type="button"
                                                        onClick={() => openClearanceModal(record)}
                                                        className={`px-3.5 py-1.5 rounded-xl text-[11px] font-black transition-all cursor-pointer flex items-center gap-1.5 mx-auto ${
                                                            !isCleared
                                                                ? "bg-primary hover:bg-primary/95 text-primary-foreground shadow-sm hover:shadow-md"
                                                                : "bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground border"
                                                        }`}
                                                    >
                                                        <ClipboardCheck className="h-3.5 w-3.5" />
                                                        {!isCleared ? "Clear / Reconcile" : "View Clearance"}
                                                    </button>
                                                </td>
                                            </motion.tr>

                                            {/* Expandable Multi-Row Product Breakdown (Strictly No CSV) */}
                                            {isExpanded && (
                                                <tr className="bg-muted/15 border-b">
                                                    <td colSpan={9} className="p-3 sm:p-4">
                                                        <motion.div
                                                            initial={{ opacity: 0, y: -6 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -6 }}
                                                            className="rounded-xl border bg-card p-3 sm:p-4 space-y-3 shadow-inner"
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <Package className="h-4 w-4 text-primary" />
                                                                    <span className="text-[10px] font-black uppercase text-foreground tracking-wider">
                                                                        Delivered Product Lines Breakdown ({record.items.length} Items)
                                                                    </span>
                                                                </div>
                                                                <span className="text-[10px] text-muted-foreground">
                                                                    Origin: <b>{record.branch_name}</b> | SO Status: <b>{record.order_status}</b>
                                                                </span>
                                                            </div>

                                                            {record.items.length === 0 ? (
                                                                <p className="text-center text-[10px] text-muted-foreground py-3">
                                                                    No individual product details found for this manifest.
                                                                </p>
                                                            ) : (
                                                                <div className="border rounded-lg overflow-hidden bg-background">
                                                                    <table className="w-full text-left text-xs">
                                                                        <thead>
                                                                            <tr className="border-b bg-muted/30">
                                                                                <th className="p-2.5 font-bold text-muted-foreground uppercase text-[9px]">SKU / Code</th>
                                                                                <th className="p-2.5 font-bold text-muted-foreground uppercase text-[9px]">Product Name</th>
                                                                                <th className="p-2.5 font-bold text-muted-foreground uppercase text-[9px] text-center w-20">Ordered</th>
                                                                                <th className="p-2.5 font-bold text-emerald-600 dark:text-emerald-400 uppercase text-[9px] text-center w-20">Received</th>
                                                                                <th className="p-2.5 font-bold text-rose-600 dark:text-rose-400 uppercase text-[9px] text-center w-20">Returned</th>
                                                                                <th className="p-2.5 font-bold text-muted-foreground uppercase text-[9px] text-right w-24">Unit Price</th>
                                                                                <th className="p-2.5 font-bold text-muted-foreground uppercase text-[9px]">Status / Concern Notes</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y">
                                                                            {record.items.map((item, itemIdx) => (
                                                                                <tr key={item.detail_id || itemIdx} className="hover:bg-muted/10">
                                                                                    <td className="p-2.5 font-mono text-[10px] text-muted-foreground">
                                                                                        {item.product_code}
                                                                                    </td>
                                                                                    <td className="p-2.5 font-bold text-foreground">
                                                                                        {item.product_name}
                                                                                    </td>
                                                                                    <td className="p-2.5 text-center font-black text-foreground">
                                                                                        {item.ordered_quantity}
                                                                                    </td>
                                                                                    <td className="p-2.5 text-center font-black text-emerald-600 dark:text-emerald-400">
                                                                                        {record.is_cleared ? (
                                                                                            item.received_quantity
                                                                                        ) : (
                                                                                            <span className="text-muted-foreground font-mono">—</span>
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="p-2.5 text-center font-black text-rose-600 dark:text-rose-400">
                                                                                        {record.is_cleared ? (
                                                                                            item.returned_quantity
                                                                                        ) : (
                                                                                            <span className="text-muted-foreground font-mono">—</span>
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="p-2.5 text-right font-medium text-foreground">
                                                                                        ₱{item.unit_price.toFixed(2)}
                                                                                    </td>
                                                                                    <td className="p-2.5 text-muted-foreground text-[10px]">
                                                                                        {!record.is_cleared ? (
                                                                                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold">
                                                                                                <Clock className="h-3 w-3" />
                                                                                                Awaiting Clearance
                                                                                            </span>
                                                                                        ) : item.returned_quantity > 0 ? (
                                                                                            <span className="inline-flex items-center gap-1 text-rose-500 font-bold mr-2">
                                                                                                <RotateCcw className="h-3 w-3" />
                                                                                                {item.returned_quantity} Returned
                                                                                            </span>
                                                                                        ) : item.has_concern ? (
                                                                                            <span className="inline-flex items-center gap-1 text-amber-500 font-bold mr-2">
                                                                                                <AlertCircle className="h-3 w-3" />
                                                                                                Concern: {item.concern_notes || "Discrepancy flagged"}
                                                                                            </span>
                                                                                        ) : item.received_quantity === item.ordered_quantity ? (
                                                                                            <span className="text-emerald-500 font-bold">
                                                                                                Received OK
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className="text-muted-foreground">—</span>
                                                                                        )}
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </motion.div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </motion.tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Reconciliation Modal */}
            {isClearanceModalOpen && selectedRecordForClearance && (
                <DeliveryClearanceModal
                    key={selectedRecordForClearance.invoice_id}
                    record={selectedRecordForClearance}
                    isOpen={isClearanceModalOpen}
                    isSubmitting={submitting}
                    onClose={closeClearanceModal}
                    onSubmit={handleClearanceSubmit}
                />
            )}
        </div>
    );
}
