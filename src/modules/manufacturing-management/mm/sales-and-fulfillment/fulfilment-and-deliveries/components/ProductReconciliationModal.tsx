// src/modules/manufacturing-management/mm/sales-and-fulfillment/fulfilment-and-deliveries/components/ProductReconciliationModal.tsx

"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ConsolidatedSalesOrderRecord,
    ClearanceLineItem,
    LineStatus,
} from "../types";
import {
    X,
    CheckCircle2,
    AlertTriangle,
    FileText,
    ArrowLeft,
    Check,
    User,
    Calendar,
    Receipt,
    Boxes,
    CircleDollarSign,
} from "lucide-react";

interface ProductReconciliationModalProps {
    order: ConsolidatedSalesOrderRecord | null;
    isOpen: boolean;
    isReadOnly?: boolean;
    onClose: () => void;
    onSave: (updatedItems: ClearanceLineItem[]) => void;
}

export default function ProductReconciliationModal({
    order,
    isOpen,
    isReadOnly = false,
    onClose,
    onSave,
}: ProductReconciliationModalProps) {
    const [lineItems, setLineItems] = useState<ClearanceLineItem[]>(() => {
        const initial = (order?.items || []).map((item) => ({ ...item }));
        if (order) {
            console.log("[ProductReconciliationModal] 📦 Product Line Reconciliation Loaded for Order:", {
                order_no: order.order_no,
                invoice_no: order.invoice_no,
                customer_name: order.customer_name,
                items_count: initial.length,
                lineItems: initial,
            });
        }
        return initial;
    });

    // Total ordered units calculation for KPI card
    const totalOrderedUnits = useMemo(() => {
        return lineItems.reduce((acc, item) => acc + item.ordered_quantity, 0);
    }, [lineItems]);

    // Validation issues
    const validationIssues = useMemo(() => {
        const issues: string[] = [];
        lineItems.forEach((item, idx) => {
            const sum = item.received_quantity + item.returned_quantity;
            if (sum !== item.ordered_quantity) {
                issues.push(
                    `Line ${idx + 1} (${item.product_name}): Fulfilled (${item.received_quantity}) + Returned (${item.returned_quantity}) = ${sum}, must equal Ordered (${item.ordered_quantity}).`
                );
            }
            if (item.received_quantity < 0 || item.returned_quantity < 0) {
                issues.push(`Line ${idx + 1} (${item.product_name}): Quantities cannot be negative.`);
            }
        });
        return issues;
    }, [lineItems]);

    const isValid = validationIssues.length === 0 && lineItems.length > 0;

    // Line update handler - strictly update input value
    const updateLine = (index: number, updates: Partial<ClearanceLineItem>) => {
        setLineItems((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], ...updates };
            console.log("[ProductReconciliationModal] ✏️ Line updated at index:", index, "Updates:", updates, "New line:", next[index]);
            return next;
        });
    };

    const handleSave = (e: React.FormEvent) => {
        e.preventDefault();
        if (!isValid) return;

        // Derive line status cleanly based on quantities
        const processedItems: ClearanceLineItem[] = lineItems.map((item) => {
            const rec = item.received_quantity;
            const ret = item.returned_quantity;
            const ord = item.ordered_quantity;
            let status: LineStatus = "Fulfilled";

            if (rec === 0 && ret === ord) {
                status = "Unfulfilled / Returns";
            } else if (ret > 0) {
                status = "Fulfilled with Returns";
            } else {
                status = "Fulfilled";
            }

            return {
                ...item,
                line_status: status,
            };
        });

        console.log("[ProductReconciliationModal] ✅ Saving reconciled items:", {
            order_no: order?.order_no,
            items: processedItems,
        });
        onSave(processedItems);
        onClose();
    };

    if (!isOpen || !order) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-6 lg:p-8 bg-background/80 backdrop-blur-md overflow-y-auto">
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: -8 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                    className="relative w-full max-w-[96vw] sm:max-w-6xl lg:max-w-7xl xl:max-w-[1360px] bg-card border rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
                >
                    {/* Header Banner */}
                    <div className="px-6 py-4.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 bg-muted/15">
                        <div className="flex items-center gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-2 rounded-xl border border-input bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-xs"
                                title="Back to Orders"
                            >
                                <ArrowLeft className="h-4 w-4" />
                            </button>

                            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                                <FileText className="h-5 w-5" />
                            </div>

                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-base sm:text-lg font-black text-foreground tracking-tight">
                                        Product Line Reconciliation
                                    </h2>
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary/10 border border-primary/20 text-primary">
                                        {order.order_no}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap pt-0.5">
                                    <span>Reconciling delivery lines for Invoice:</span>
                                    <span className="font-mono font-bold text-foreground">{order.invoice_no}</span>
                                    <span>•</span>
                                    <span>Customer:</span>
                                    <span className="font-bold text-foreground">{order.customer_name}</span>
                                </div>
                            </div>
                        </div>

                        {/* Close Button */}
                        <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                            <button
                                type="button"
                                onClick={onClose}
                                className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer border-none bg-transparent"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {/* Modal Body */}
                    <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
                        {/* 5 Direct Summary KPI Cards for this Order */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                            {/* 1. Customer */}
                            <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                                    Customer
                                </span>
                                <div className="font-black text-sm text-foreground truncate" title={order.customer_name}>
                                    {order.customer_name}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono truncate">
                                    {order.customer_code}
                                </div>
                            </div>

                            {/* 2. Order & Invoice */}
                            <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Receipt className="h-3.5 w-3.5 text-muted-foreground" />
                                    Order & Invoice
                                </span>
                                <div className="font-black text-sm text-foreground truncate" title={order.order_no}>
                                    {order.order_no}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono">
                                    {order.invoice_no}
                                </div>
                            </div>

                            {/* 3. Invoice Date */}
                            <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                    Invoice Date
                                </span>
                                <div className="font-black text-sm text-foreground">
                                    {new Date(order.invoice_date).toLocaleDateString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                    })}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                    Sales Invoice
                                </div>
                            </div>

                            {/* 4. Total Items & Units */}
                            <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
                                    Product Lines
                                </span>
                                <div className="font-black text-sm text-foreground">
                                    {lineItems.length} Products
                                </div>
                                <div className="text-[10px] text-muted-foreground font-semibold">
                                    {totalOrderedUnits} Total Units
                                </div>
                            </div>

                            {/* 5. Total Order Amount */}
                            <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <CircleDollarSign className="h-3.5 w-3.5 text-primary" />
                                    Order Amount
                                </span>
                                <div className="font-black text-base text-primary flex items-center gap-1">
                                    ₱{order.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-medium">
                                    Net Invoice Value
                                </div>
                            </div>
                        </div>

                        {/* Validation Error Alert */}
                        {validationIssues.length > 0 && (
                            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2.5">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                <span>{validationIssues[0]}</span>
                            </div>
                        )}

                        {/* Product Lines Table */}
                        <div className="space-y-3">
                            <div className="px-1">
                                <h3 className="text-sm font-black text-foreground tracking-tight">
                                    Item Line Breakdown & Fulfillment Reconciliation
                                </h3>
                                <p className="text-xs font-semibold text-muted-foreground pt-0.5">
                                    {isReadOnly
                                        ? "Viewing finalized item line quantities and variance."
                                        : "Adjust fulfilled and returned quantities for each product item."}
                                </p>
                            </div>

                            <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="border-b bg-muted/40 text-[10px] uppercase font-black text-muted-foreground tracking-wider">
                                                <th className="p-3.5">Product / Item</th>
                                                <th className="p-3.5 text-center w-20">Ordered</th>
                                                <th className="p-3.5 text-center w-28 text-emerald-600 dark:text-emerald-400">Fulfilled</th>
                                                <th className="p-3.5 text-center w-28 text-rose-600 dark:text-rose-400">Returned</th>
                                                <th className="p-3.5 text-center w-24">Variance</th>
                                                <th className="p-3.5 min-w-[220px]">Notes & Concerns</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {lineItems.map((item, idx) => {
                                                const variance = item.ordered_quantity - (item.received_quantity + item.returned_quantity);
                                                const isBalanced = variance === 0;

                                                return (
                                                    <tr key={item.detail_id || idx} className="hover:bg-muted/10 transition-colors">
                                                        {/* Product Info */}
                                                        <td className="p-3.5 align-middle">
                                                            <span className="font-bold text-foreground block text-xs">{item.product_name}</span>
                                                            <span className="text-[10px] text-muted-foreground font-mono bg-muted/60 px-1.5 py-0.5 rounded border border-border/50 inline-block mt-0.5">
                                                                {item.product_code}
                                                            </span>
                                                        </td>

                                                        {/* Ordered */}
                                                        <td className="p-3.5 text-center align-middle font-black text-sm text-foreground">
                                                            {item.ordered_quantity}
                                                        </td>

                                                        {/* Fulfilled Input */}
                                                        <td className="p-3.5 text-center align-middle">
                                                            {isReadOnly ? (
                                                                <span className="font-black text-sm text-emerald-600 dark:text-emerald-400">
                                                                    {item.received_quantity}
                                                                </span>
                                                            ) : (
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max={item.ordered_quantity}
                                                                    value={item.received_quantity === 0 ? "" : item.received_quantity}
                                                                    placeholder="0"
                                                                    onFocus={(e) => e.target.select()}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        const parsed = val === "" ? 0 : parseInt(val, 10);
                                                                        updateLine(idx, { received_quantity: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                                                                    }}
                                                                    className="w-20 h-8 text-center bg-background border border-emerald-500/40 focus:border-emerald-500 rounded-lg px-2 text-xs font-black text-foreground outline-none shadow-xs"
                                                                />
                                                            )}
                                                        </td>

                                                        {/* Returned Input */}
                                                        <td className="p-3.5 text-center align-middle">
                                                            {isReadOnly ? (
                                                                <span className="font-black text-sm text-rose-500">
                                                                    {item.returned_quantity}
                                                                </span>
                                                            ) : (
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max={item.ordered_quantity}
                                                                    value={item.returned_quantity === 0 ? "" : item.returned_quantity}
                                                                    placeholder="0"
                                                                    onFocus={(e) => e.target.select()}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value;
                                                                        const parsed = val === "" ? 0 : parseInt(val, 10);
                                                                        updateLine(idx, { returned_quantity: isNaN(parsed) ? 0 : Math.max(0, parsed) });
                                                                    }}
                                                                    className="w-20 h-8 text-center bg-background border border-rose-500/40 focus:border-rose-500 rounded-lg px-2 text-xs font-black text-foreground outline-none shadow-xs"
                                                                />
                                                            )}
                                                        </td>

                                                        {/* Variance */}
                                                        <td className="p-3.5 text-center align-middle">
                                                            {isBalanced ? (
                                                                <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                                                                    <CheckCircle2 className="h-4 w-4" />
                                                                    0 OK
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 text-rose-500 font-bold text-xs px-2 py-0.5 rounded-md bg-rose-500/10">
                                                                    <AlertTriangle className="h-3.5 w-3.5" />
                                                                    {variance > 0 ? `-${variance}` : `+${Math.abs(variance)}`}
                                                                </span>
                                                            )}
                                                        </td>

                                                        {/* Note Input */}
                                                        <td className="p-3.5 align-middle">
                                                            {isReadOnly ? (
                                                                <span className="text-xs text-muted-foreground">
                                                                    {item.concern_notes || "—"}
                                                                </span>
                                                            ) : (
                                                                <input
                                                                    type="text"
                                                                    placeholder="Add notes or return reason (optional)..."
                                                                    value={item.concern_notes}
                                                                    onChange={(e) => updateLine(idx, { concern_notes: e.target.value })}
                                                                    className="w-full h-8 bg-background border border-input rounded-lg px-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary shadow-xs"
                                                                />
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
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
                                        className="px-4 py-2.5 rounded-xl border border-input bg-background hover:bg-muted text-muted-foreground hover:text-foreground text-xs font-bold transition-all cursor-pointer shadow-xs"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!isValid}
                                        className={`px-6 py-2.5 rounded-xl text-xs font-black shadow-xs transition-all flex items-center gap-2 ${
                                            isValid
                                                ? "bg-primary hover:bg-primary/95 text-primary-foreground cursor-pointer shadow-sm hover:shadow-md"
                                                : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                                        }`}
                                    >
                                        <Check className="h-4 w-4" />
                                        Save Product Reconciliation
                                    </button>
                                </>
                            )}
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
