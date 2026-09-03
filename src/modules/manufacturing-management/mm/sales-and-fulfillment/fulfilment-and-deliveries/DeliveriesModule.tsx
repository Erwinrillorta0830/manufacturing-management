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
    AlertTriangle,
    Boxes,
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

    // Accordion expanded rows state (keyed by consolidator_id)
    const [expandedRowIds, setExpandedRowIds] = useState<Set<number>>(new Set());

    const toggleRow = (conId: number) => {
        setExpandedRowIds((prev) => {
            const next = new Set(prev);
            if (next.has(conId)) next.delete(conId);
            else next.add(conId);
            return next;
        });
    };

    const statusBadgeStyles: Record<FulfillmentStatus, string> = {
        Pending: "bg-zinc-500/10 border-zinc-500/20 text-zinc-600 dark:text-zinc-400",
        Fulfilled: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
        "Fulfilled with Returns": "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
        "Unfulfilled / Returns": "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400",
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
            {/* Header Title Section */}
            <section className="rounded-xl border bg-card shadow-sm p-5 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3.5">
                        <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 text-primary">
                            <Truck className="h-6 w-6" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                                    Fulfillment & Deliveries
                                </h1>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary/10 border border-primary/20 text-primary">
                                    Consolidated Runs
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Reconcile delivered manifests, verify sales returns, and record receiving clearance.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={reload}
                            disabled={loading}
                            className="px-3.5 py-2 rounded-xl border bg-background hover:bg-muted text-foreground text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-xs"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
                            Refresh
                        </button>
                    </div>
                </div>
            </section>

            {/* Error Banner */}
            {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-3">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="font-semibold">{error}</span>
                </div>
            )}

            {/* 4 Direct Summary KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1. Total Dispatched */}
                <div className="p-4 rounded-xl border bg-card shadow-xs flex items-center justify-between">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                            Total Dispatched Runs
                        </span>
                        <div className="text-2xl font-black text-foreground">
                            {metrics.total_dispatched}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">
                            Consolidated Delivery Batches
                        </span>
                    </div>
                    <div className="p-3 rounded-xl bg-primary/10 text-primary border border-primary/20">
                        <Truck className="h-5 w-5" />
                    </div>
                </div>

                {/* 2. Pending Clearance */}
                <div className="p-4 rounded-xl border bg-card shadow-xs flex items-center justify-between">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 dark:text-amber-400">
                            Pending Clearance
                        </span>
                        <div className="text-2xl font-black text-amber-600 dark:text-amber-400">
                            {metrics.pending_clearance}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">
                            Awaiting Manifest Reconciliation
                        </span>
                    </div>
                    <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
                        <Clock className="h-5 w-5" />
                    </div>
                </div>

                {/* 3. Fully Fulfilled */}
                <div className="p-4 rounded-xl border bg-card shadow-xs flex items-center justify-between">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            Fulfilled Deliveries
                        </span>
                        <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                            {metrics.fulfilled_count}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">
                            Cleared with 100% Receipt
                        </span>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        <CheckCircle2 className="h-5 w-5" />
                    </div>
                </div>

                {/* 4. Returns & Concerns */}
                <div className="p-4 rounded-xl border bg-card shadow-xs flex items-center justify-between">
                    <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                            Returns & Concerns
                        </span>
                        <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
                            {metrics.concerns_and_returns_count}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium">
                            Cleared with Returned Quantities
                        </span>
                    </div>
                    <div className="p-3 rounded-xl bg-rose-500/10 text-rose-600 border border-rose-500/20">
                        <RotateCcw className="h-5 w-5" />
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="p-3 rounded-xl border bg-card shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                {/* Search Bar */}
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search consolidator no., order no., invoice no., customer..."
                        className="w-full pl-9 pr-4 py-2 text-xs bg-background border border-input rounded-xl focus:border-primary outline-none text-foreground placeholder:text-muted-foreground shadow-xs"
                    />
                </div>

                {/* Dropdown Filters */}
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Branch Filter */}
                    <Select
                        value={selectedBranchId}
                        onValueChange={(val) => setSelectedBranchId(val)}
                    >
                        <SelectTrigger className="w-[180px] h-9 text-xs rounded-xl bg-background shadow-xs">
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

                    {/* Status Filter */}
                    <Select
                        value={statusFilter}
                        onValueChange={(val) => setStatusFilter(val)}
                    >
                        <SelectTrigger className="w-[180px] h-9 text-xs rounded-xl bg-background shadow-xs">
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
                            <SelectItem value="Unfulfilled / Returns">Unfulfilled / Returns</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Main Table Area */}
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
                                No Consolidated Delivery Records
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
                                    <th className="p-3 font-bold text-muted-foreground uppercase text-[10px]">Consolidator No</th>
                                    <th className="p-3 font-bold text-muted-foreground uppercase text-[10px]">Origin Branch</th>
                                    <th className="p-3 font-bold text-muted-foreground uppercase text-[10px]">Dispatch Date</th>
                                    <th className="p-3 font-bold text-muted-foreground uppercase text-[10px] text-center">Orders Count</th>
                                    <th className="p-3 font-bold text-muted-foreground uppercase text-[10px] text-right">Manifest Value</th>
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
                                    const isExpanded = expandedRowIds.has(record.consolidator_id);
                                    const isCleared = record.is_cleared;

                                    return (
                                        <React.Fragment key={record.consolidator_id}>
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
                                                        onClick={() => toggleRow(record.consolidator_id)}
                                                        className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border-none bg-transparent cursor-pointer"
                                                        title="Expand Order Breakdown"
                                                    >
                                                        {isExpanded ? (
                                                            <ChevronDown className="h-4 w-4 text-primary" />
                                                        ) : (
                                                            <ChevronRight className="h-4 w-4" />
                                                        )}
                                                    </button>
                                                </td>

                                                {/* Consolidator No */}
                                                <td className="p-3 font-black text-foreground">
                                                    <div className="flex items-center gap-1.5">
                                                        <Truck className="h-3.5 w-3.5 text-primary" />
                                                        {record.consolidator_no}
                                                    </div>
                                                </td>

                                                {/* Origin Branch */}
                                                <td className="p-3 font-bold text-muted-foreground">
                                                    <div className="flex items-center gap-1">
                                                        <Building2 className="h-3 w-3 text-muted-foreground" />
                                                        {record.branch_name}
                                                    </div>
                                                </td>

                                                {/* Dispatch Date */}
                                                <td className="p-3 text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3 w-3" />
                                                        {new Date(record.dispatch_date).toLocaleDateString(undefined, {
                                                            dateStyle: "medium",
                                                        })}
                                                    </span>
                                                </td>

                                                {/* Orders Count */}
                                                <td className="p-3 text-center">
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-xs bg-muted/60 text-foreground">
                                                        <Receipt className="h-3 w-3 text-muted-foreground" />
                                                        {record.total_orders} Orders
                                                    </span>
                                                </td>

                                                {/* Amount */}
                                                <td className="p-3 text-right font-black text-foreground">
                                                    ₱{record.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                                                        {record.fulfillment_status === "Unfulfilled / Returns" && <AlertTriangle className="h-3 w-3" />}
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

                                            {/* Expandable Multi-Row Sales Order Breakdown */}
                                            {isExpanded && (
                                                <tr className="bg-muted/15 border-b">
                                                    <td colSpan={8} className="p-3 sm:p-4">
                                                        <motion.div
                                                            initial={{ opacity: 0, y: -6 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: -6 }}
                                                            className="rounded-xl border bg-card p-3 sm:p-4 space-y-3 shadow-inner"
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <Boxes className="h-4 w-4 text-primary" />
                                                                    <span className="text-[10px] font-black uppercase text-foreground tracking-wider">
                                                                        Consolidated Sales Orders Breakdown ({record.orders.length} Invoices)
                                                                    </span>
                                                                </div>
                                                                <div className="text-[10px] text-muted-foreground">
                                                                    Consolidator No: <b>{record.consolidator_no}</b> | Origin: <b>{record.branch_name}</b>
                                                                </div>
                                                            </div>

                                                            {record.orders.length === 0 ? (
                                                                <p className="text-center text-[10px] text-muted-foreground py-3">
                                                                    No individual sales orders found for this consolidation manifest.
                                                                </p>
                                                            ) : (
                                                                <div className="border rounded-lg overflow-hidden bg-background">
                                                                    <table className="w-full text-left text-xs">
                                                                        <thead>
                                                                            <tr className="border-b bg-muted/30">
                                                                                <th className="p-2.5 font-bold text-muted-foreground uppercase text-[9px]">Status</th>
                                                                                <th className="p-2.5 font-bold text-muted-foreground uppercase text-[9px]">Order No</th>
                                                                                <th className="p-2.5 font-bold text-muted-foreground uppercase text-[9px]">Invoice No</th>
                                                                                <th className="p-2.5 font-bold text-muted-foreground uppercase text-[9px]">Invoice Date</th>
                                                                                <th className="p-2.5 font-bold text-muted-foreground uppercase text-[9px]">Customer</th>
                                                                                <th className="p-2.5 font-bold text-muted-foreground uppercase text-[9px] text-right">Amount</th>
                                                                                <th className="p-2.5 font-bold text-muted-foreground uppercase text-[9px]">Remarks / Linked Return</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y">
                                                                            {record.orders.map((ord, ordIdx) => (
                                                                                <tr key={ord.invoice_id || ordIdx} className="hover:bg-muted/10">
                                                                                    <td className="p-2.5">
                                                                                        <span
                                                                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${
                                                                                                statusBadgeStyles[ord.fulfillment_status] || statusBadgeStyles.Pending
                                                                                            }`}
                                                                                        >
                                                                                            {ord.fulfillment_status}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="p-2.5 font-bold text-foreground">
                                                                                        {ord.order_no}
                                                                                    </td>
                                                                                    <td className="p-2.5 font-mono text-[10px] text-muted-foreground">
                                                                                        {ord.invoice_no}
                                                                                    </td>
                                                                                    <td className="p-2.5 text-muted-foreground text-[10px]">
                                                                                        {new Date(ord.invoice_date).toLocaleDateString(undefined, {
                                                                                            dateStyle: "medium",
                                                                                        })}
                                                                                    </td>
                                                                                    <td className="p-2.5 text-foreground font-semibold">
                                                                                        {ord.customer_name}
                                                                                    </td>
                                                                                    <td className="p-2.5 text-right font-black text-foreground">
                                                                                        ₱{ord.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                                    </td>
                                                                                    <td className="p-2.5 text-muted-foreground text-[10px]">
                                                                                        {ord.linked_sales_return ? (
                                                                                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                                                                                                <CheckCircle2 className="h-3 w-3" />
                                                                                                Linked: {ord.linked_sales_return.return_number} ({ord.linked_sales_return.status})
                                                                                            </span>
                                                                                        ) : (
                                                                                            ord.remarks || "—"
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

            {/* Modal 1: Consolidated Clearance Modal */}
            {selectedRecordForClearance && (
                <DeliveryClearanceModal
                    key={selectedRecordForClearance.consolidator_id}
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
