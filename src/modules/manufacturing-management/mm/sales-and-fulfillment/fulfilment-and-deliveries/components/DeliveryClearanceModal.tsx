// src/modules/manufacturing-management/mm/sales-and-fulfillment/fulfilment-and-deliveries/components/DeliveryClearanceModal.tsx

"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ConsolidatedDeliveryRecord,
    ConsolidatedSalesOrderRecord,
    ConsolidatedClearanceSubmissionPayload,
    ClearanceLineItem,
    FulfillmentStatus,
    LineStatus,
} from "../types";
import { computePreviewStatus } from "../hooks/useDeliveries";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    X,
    ClipboardCheck,
    AlertCircle,
    AlertTriangle,
    Loader2,
    Building2,
    Calendar,
    Boxes,
    CircleDollarSign,
    ExternalLink,
    Truck,
    Edit3,
} from "lucide-react";
import ProductReconciliationModal from "./ProductReconciliationModal";

interface DeliveryClearanceModalProps {
    record: ConsolidatedDeliveryRecord;
    isOpen: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: (payload: ConsolidatedClearanceSubmissionPayload) => Promise<boolean>;
}

export default function DeliveryClearanceModal({
    record,
    isOpen,
    isSubmitting,
    onClose,
    onSubmit,
}: DeliveryClearanceModalProps) {
    const isReadOnly = Boolean(record?.is_cleared || record?.status === "Delivered");

    // Editable orders list
    const [orders, setOrders] = useState<ConsolidatedSalesOrderRecord[]>(() =>
        (record?.orders || []).map((ord) => ({
            ...ord,
            items: (ord.items || []).map((item) => ({ ...item })),
        }))
    );

    const [clearanceRemarks, setClearanceRemarks] = useState<string>("");
    const [formError, setFormError] = useState<string | null>(null);

    // Selected order for child Product Reconciliation Modal (Modal 2)
    const [selectedOrderIndex, setSelectedOrderIndex] = useState<number | null>(null);

    // Total units calculation across all orders
    const totalManifestUnits = useMemo(() => {
        return orders.reduce(
            (sum, ord) => sum + ord.items.reduce((acc, i) => acc + i.ordered_quantity, 0),
            0
        );
    }, [orders]);

    // Check if any order has returns / unfulfilled items that lack a linked Sales Return
    const missingReturnOrders = useMemo(() => {
        return orders.filter((ord) => {
            const isReturnStatus =
                ord.fulfillment_status === "Fulfilled with Returns" ||
                ord.fulfillment_status === "Unfulfilled / Returns";
            return isReturnStatus && !ord.linked_sales_return;
        });
    }, [orders]);

    const isMissingRequiredReturn = missingReturnOrders.length > 0;

    // Check quantity invariants across all orders and items
    const validationIssues = useMemo(() => {
        const issues: string[] = [];
        orders.forEach((ord) => {
            ord.items.forEach((item, itemIdx) => {
                const sum = item.received_quantity + item.returned_quantity;
                if (sum !== item.ordered_quantity) {
                    issues.push(
                        `Order ${ord.order_no} Line ${itemIdx + 1} (${item.product_name}): Fulfilled (${item.received_quantity}) + Returned (${item.returned_quantity}) = ${sum}, must equal Ordered (${item.ordered_quantity}).`
                    );
                }
                if (item.received_quantity < 0 || item.returned_quantity < 0) {
                    issues.push(`Order ${ord.order_no} Line ${itemIdx + 1}: Quantities cannot be negative.`);
                }
            });
        });
        return issues;
    }, [orders]);

    const isValid = validationIssues.length === 0 && orders.length > 0 && !isMissingRequiredReturn;

    // Helper to redirect to Sales Return module for an order
    const handleRedirectToSalesReturn = (ord: ConsolidatedSalesOrderRecord) => {
        const params = new URLSearchParams({
            fromClearance: "true",
            invoiceNo: ord.invoice_no || "",
            orderNo: ord.order_no || "",
            customerCode: ord.customer_code || "",
        });
        window.open(
            `/mm/sales-and-fulfillment/sales-return-manual?${params.toString()}`,
            "_blank"
        );
    };

    // Update order status preset at order row level (without auto-overwriting line quantities)
    const setOrderStatusPreset = (orderIndex: number, preset: LineStatus) => {
        setOrders((prev) => {
            const next = [...prev];
            const ord = next[orderIndex];
            next[orderIndex] = {
                ...ord,
                fulfillment_status: preset as FulfillmentStatus,
            };
            return next;
        });
    };

    // Update order remarks
    const updateOrderRemarks = (orderIndex: number, remarks: string) => {
        setOrders((prev) => {
            const next = [...prev];
            next[orderIndex] = {
                ...next[orderIndex],
                remarks,
            };
            return next;
        });
    };

    // Open Modal 2 for specific SO
    const handleOpenReconciliation = (index: number) => {
        const targetOrder = orders[index];
        console.log("[DeliveryClearanceModal] 🔍 Clicked SO row to reconcile:", {
            orderIndex: index,
            order_no: targetOrder?.order_no,
            invoice_no: targetOrder?.invoice_no,
            customer_name: targetOrder?.customer_name,
            items_count: targetOrder?.items?.length,
            items: targetOrder?.items,
        });
        setSelectedOrderIndex(index);
    };

    // Save product line items from Modal 2
    const handleSaveOrderItems = (updatedItems: ClearanceLineItem[]) => {
        if (selectedOrderIndex === null) return;
        console.log("[DeliveryClearanceModal] 💾 Reconciled items received from ProductReconciliationModal:", {
            orderIndex: selectedOrderIndex,
            order_no: orders[selectedOrderIndex]?.order_no,
            updatedItems,
        });
        setOrders((prev) => {
            const next = [...prev];
            const ord = next[selectedOrderIndex];
            const newStatus = computePreviewStatus(updatedItems);
            next[selectedOrderIndex] = {
                ...ord,
                fulfillment_status: newStatus,
                items: updatedItems,
            };
            return next;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!record) return;

        if (isMissingRequiredReturn) {
            setFormError(
                `Orders with returns require a registered Sales Return before clearance can be confirmed.`
            );
            return;
        }

        if (!isValid) {
            setFormError(validationIssues[0] || "Please balance Received + Returned before submitting.");
            return;
        }

        setFormError(null);

        const payload: ConsolidatedClearanceSubmissionPayload = {
            consolidator_id: record.consolidator_id,
            clearance_remarks: clearanceRemarks,
            orders: orders.map((ord) => ({
                order_id: ord.order_id,
                invoice_id: ord.invoice_id,
                clearance_remarks: ord.remarks,
                items: ord.items.map((item) => ({
                    detail_id: item.detail_id,
                    product_id: item.product_id,
                    received_quantity: item.received_quantity,
                    returned_quantity: item.returned_quantity,
                    has_concern: item.has_concern,
                    concern_notes: item.concern_notes,
                })),
            })),
        };

        await onSubmit(payload);
    };

    if (!isOpen || !record) return null;

    const currentOrderForModal2 =
        selectedOrderIndex !== null && orders[selectedOrderIndex] ? orders[selectedOrderIndex] : null;

    return (
        <>
            <AnimatePresence>
                <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 lg:p-8 bg-background/80 backdrop-blur-sm overflow-y-auto">
                    <motion.div
                        initial={{ opacity: 0, y: -12, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -8, scale: 0.98 }}
                        transition={{ duration: 0.22, ease: "easeOut" }}
                        className="relative w-full max-w-[96vw] sm:max-w-6xl lg:max-w-7xl xl:max-w-[1360px] bg-card border rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
                    >
                        {/* Header Banner */}
                        <div className="px-6 py-4.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 bg-muted/10">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                                    <Truck className="h-5 w-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h2 className="text-lg sm:text-xl font-black text-foreground tracking-tight">
                                            Consolidated Delivery Clearance
                                        </h2>
                                        {isReadOnly && (
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                                Cleared & Locked
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap pt-0.5">
                                        <span>Consolidator Manifest:</span>
                                        <span className="font-bold text-primary">{record.consolidator_no}</span>
                                        <span>•</span>
                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary/10 border border-primary/20 text-primary">
                                            {record.branch_name}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Close Button */}
                            <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={isSubmitting}
                                    className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer border-none bg-transparent"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        {/* Main Body */}
                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
                            {/* 5 Direct Summary KPI Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                                {/* 1. Consolidator Run */}
                                <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                                        Consolidator
                                    </span>
                                    <div className="font-black text-sm text-foreground truncate" title={record.consolidator_no}>
                                        {record.consolidator_no}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground font-mono truncate">
                                        {record.status}
                                    </div>
                                </div>

                                {/* 2. Branch */}
                                <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                        Branch
                                    </span>
                                    <div className="font-black text-sm text-foreground truncate" title={record.branch_name}>
                                        {record.branch_name}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                        Consolidated Run
                                    </div>
                                </div>

                                {/* 3. Dispatch Date */}
                                <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                        Dispatch Date
                                    </span>
                                    <div className="font-black text-sm text-foreground">
                                        {new Date(record.dispatch_date).toLocaleDateString(undefined, {
                                            month: "short",
                                            day: "numeric",
                                            year: "numeric",
                                        })}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground font-mono">
                                        {orders.length} Invoices
                                    </div>
                                </div>

                                {/* 4. Total Orders & Units */}
                                <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
                                        Total Orders
                                    </span>
                                    <div className="font-black text-sm text-foreground">
                                        {orders.length} Sales Orders
                                    </div>
                                    <div className="text-[10px] text-muted-foreground font-semibold">
                                        {totalManifestUnits} Total Units
                                    </div>
                                </div>

                                {/* 5. Total Amount */}
                                <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <CircleDollarSign className="h-3.5 w-3.5 text-primary" />
                                        Manifest Value
                                    </span>
                                    <div className="font-black text-base text-primary flex items-center gap-1">
                                        ₱{record.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground font-medium">
                                        Net Manifest Total
                                    </div>
                                </div>
                            </div>

                            {/* Missing Sales Return Warning Banners */}
                            {missingReturnOrders.length > 0 && (
                                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-2.5 shadow-xs">
                                    <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200 font-bold">
                                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                                        <span>Sales Return Required for {missingReturnOrders.length} Order(s) Before Confirming:</span>
                                    </div>
                                    <div className="space-y-1.5 pl-6">
                                        {missingReturnOrders.map((mo) => (
                                            <div
                                                key={mo.invoice_id}
                                                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-lg bg-background/60 border text-foreground"
                                            >
                                                <div>
                                                    <span className="font-bold">{mo.order_no}</span>
                                                    <span className="text-muted-foreground font-mono ml-1.5">({mo.invoice_no})</span>
                                                    <span className="text-muted-foreground ml-2">— {mo.customer_name}</span>
                                                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-500/20 text-amber-700 dark:text-amber-300">
                                                        {mo.fulfillment_status}
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleRedirectToSalesReturn(mo)}
                                                    className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-all flex items-center gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer shadow-xs"
                                                >
                                                    <ExternalLink className="h-3 w-3" />
                                                    Create Sales Return
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Error Alert */}
                            {formError && (
                                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2.5">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    <span>{formError}</span>
                                </div>
                            )}

                            {/* Sales Order Reconciliation Table Section */}
                            <div className="space-y-3">
                                <div className="px-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div>
                                        <h3 className="text-sm font-black text-foreground tracking-tight">
                                            Sales Order Reconciliation Table
                                        </h3>
                                        <p className="text-xs font-semibold text-rose-500 dark:text-rose-400 pt-0.5">
                                            Click any order row to reconcile individual product lines and returned quantities.
                                        </p>
                                    </div>
                                </div>

                                {/* Orders Table */}
                                <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse text-xs">
                                            <thead>
                                                <tr className="border-b bg-muted/40 text-[10px] uppercase font-black text-muted-foreground tracking-wider">
                                                    <th className="p-3.5 w-48">Status</th>
                                                    <th className="p-3.5">Order No.</th>
                                                    <th className="p-3.5">Invoice No.</th>
                                                    <th className="p-3.5">Invoice Date</th>
                                                    <th className="p-3.5">Customer</th>
                                                    <th className="p-3.5 text-right">Amount</th>
                                                    <th className="p-3.5 min-w-[180px]">Remarks</th>
                                                    <th className="p-3.5 text-center w-28">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {orders.map((ord, idx) => {
                                                    const currentStatus =
                                                        ord.fulfillment_status === "Pending"
                                                            ? "Fulfilled"
                                                            : ord.fulfillment_status;

                                                    return (
                                                        <tr
                                                            key={ord.invoice_id || idx}
                                                            onClick={() => handleOpenReconciliation(idx)}
                                                            className="hover:bg-muted/15 cursor-pointer transition-colors group"
                                                        >
                                                            {/* Status Selector */}
                                                            <td className="p-3.5 align-middle" onClick={(e) => e.stopPropagation()}>
                                                                {isReadOnly ? (
                                                                    <span className="inline-flex items-center px-2 py-1 rounded-md text-[10px] font-black bg-muted text-muted-foreground border">
                                                                        {currentStatus}
                                                                    </span>
                                                                ) : (
                                                                    <Select
                                                                        value={currentStatus}
                                                                        onValueChange={(val) =>
                                                                            setOrderStatusPreset(idx, val as LineStatus)
                                                                        }
                                                                    >
                                                                        <SelectTrigger className="w-full h-8 text-[11px] font-bold rounded-lg bg-background">
                                                                            <SelectValue placeholder="Status" />
                                                                        </SelectTrigger>
                                                                        <SelectContent>
                                                                            <SelectItem value="Fulfilled">Fulfilled</SelectItem>
                                                                            <SelectItem value="Fulfilled with Returns">Fulfilled with Returns</SelectItem>
                                                                            <SelectItem value="Unfulfilled / Returns">Unfulfilled / Returns</SelectItem>
                                                                        </SelectContent>
                                                                    </Select>
                                                                )}
                                                            </td>

                                                            {/* Order No */}
                                                            <td className="p-3.5 align-middle font-bold text-foreground">
                                                                <span className="group-hover:text-primary transition-colors">
                                                                    {ord.order_no}
                                                                </span>
                                                            </td>

                                                            {/* Invoice No */}
                                                            <td className="p-3.5 align-middle font-mono text-muted-foreground">
                                                                {ord.invoice_no}
                                                            </td>

                                                            {/* Invoice Date */}
                                                            <td className="p-3.5 align-middle text-muted-foreground">
                                                                {new Date(ord.invoice_date).toLocaleDateString(undefined, {
                                                                    month: "short",
                                                                    day: "numeric",
                                                                    year: "numeric",
                                                                })}
                                                            </td>

                                                            {/* Customer */}
                                                            <td className="p-3.5 align-middle">
                                                                <span className="font-bold text-foreground block truncate max-w-[160px]" title={ord.customer_name}>
                                                                    {ord.customer_name}
                                                                </span>
                                                                <span className="text-[10px] text-muted-foreground font-mono">
                                                                    {ord.customer_code}
                                                                </span>
                                                            </td>

                                                            {/* Amount */}
                                                            <td className="p-3.5 align-middle text-right font-black text-foreground">
                                                                ₱{ord.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </td>

                                                            {/* Remarks */}
                                                            <td className="p-3.5 align-middle" onClick={(e) => e.stopPropagation()}>
                                                                {isReadOnly ? (
                                                                    <span className="text-xs text-muted-foreground block truncate max-w-[180px]" title={ord.remarks}>
                                                                        {ord.remarks || "—"}
                                                                    </span>
                                                                ) : (
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Add order remarks..."
                                                                        value={ord.remarks}
                                                                        onChange={(e) => updateOrderRemarks(idx, e.target.value)}
                                                                        className="w-full h-8 bg-background border border-input rounded-lg px-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary shadow-xs"
                                                                    />
                                                                )}
                                                            </td>

                                                            {/* Action Button */}
                                                            <td className="p-3.5 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenReconciliation(idx)}
                                                                    className="px-2.5 py-1.5 rounded-lg border border-input bg-background hover:bg-primary hover:text-primary-foreground text-foreground text-[11px] font-bold transition-all flex items-center gap-1.5 mx-auto cursor-pointer shadow-xs"
                                                                >
                                                                    <Edit3 className="h-3 w-3" />
                                                                    {isReadOnly ? `View Items (${ord.items.length})` : `Items (${ord.items.length})`}
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            {/* Overall Clearance Remarks */}
                            <div className="space-y-1.5 pt-1">
                                <label className="text-xs font-bold text-muted-foreground">
                                    Consolidation Clearance Remarks / Trip Notes
                                </label>
                                <input
                                    type="text"
                                    value={clearanceRemarks}
                                    onChange={(e) => setClearanceRemarks(e.target.value)}
                                    placeholder={isReadOnly ? "No trip notes recorded." : "Enter trip clearance remarks..."}
                                    disabled={isReadOnly}
                                    className={`w-full bg-background border border-input rounded-xl px-3.5 py-2.5 text-xs focus:border-primary outline-none text-foreground shadow-xs ${
                                        isReadOnly ? "opacity-75 cursor-not-allowed bg-muted/40" : ""
                                    }`}
                                />
                            </div>

                            {/* Footer Controls */}
                            <div className="flex items-center justify-end gap-3 pt-3 border-t">
                                {isReadOnly ? (
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-black shadow-xs transition-all cursor-pointer"
                                    >
                                        Close
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={onClose}
                                            disabled={isSubmitting}
                                            className="px-4 py-2.5 rounded-xl border border-input bg-background hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold transition-all cursor-pointer shadow-xs"
                                        >
                                            Cancel
                                        </button>

                                        <button
                                            type="submit"
                                            disabled={!isValid || isSubmitting}
                                            title={
                                                isMissingRequiredReturn
                                                    ? "Orders with returns require a registered Sales Return before clearance can be confirmed."
                                                    : undefined
                                            }
                                            className={`px-6 py-2.5 rounded-xl text-xs font-black shadow-xs transition-all flex items-center gap-2 ${
                                                isValid && !isSubmitting
                                                    ? "bg-primary hover:bg-primary/95 text-primary-foreground cursor-pointer shadow-sm hover:shadow-md"
                                                    : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                                            }`}
                                        >
                                            {isSubmitting ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    Posting Clearance...
                                                </>
                                            ) : (
                                                <>
                                                    <ClipboardCheck className="h-4 w-4" />
                                                    Confirm Clearance & Post
                                                </>
                                            )}
                                        </button>
                                    </>
                                )}
                            </div>
                        </form>
                    </motion.div>
                </div>
            </AnimatePresence>

            {/* Modal 2: Product Line Reconciliation Modal */}
            {currentOrderForModal2 && (
                <ProductReconciliationModal
                    key={currentOrderForModal2.invoice_id}
                    order={currentOrderForModal2}
                    isOpen={selectedOrderIndex !== null}
                    isReadOnly={isReadOnly}
                    onClose={() => setSelectedOrderIndex(null)}
                    onSave={handleSaveOrderItems}
                />
            )}
        </>
    );
}
