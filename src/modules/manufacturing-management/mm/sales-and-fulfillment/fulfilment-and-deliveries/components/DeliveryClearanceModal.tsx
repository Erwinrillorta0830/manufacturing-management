// src/modules/manufacturing-management/mm/sales-and-fulfillment/fulfilment-and-deliveries/components/DeliveryClearanceModal.tsx

"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    DeliveryClearanceRecord,
    ClearanceSubmissionPayload,
    FulfillmentStatus,
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
    CheckCircle2,
    RotateCcw,
    AlertTriangle,
    Loader2,
    Building2,
    User,
    Calendar,
    FileText,
    Boxes,
    CircleDollarSign,
} from "lucide-react";

interface DeliveryClearanceModalProps {
    record: DeliveryClearanceRecord;
    isOpen: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: (payload: ClearanceSubmissionPayload) => Promise<boolean>;
}

interface EditableLineItem {
    detail_id: number;
    product_id: number;
    product_code: string;
    product_name: string;
    ordered_quantity: number;
    received_quantity: number;
    returned_quantity: number;
    unit_price: number;
    has_concern: boolean;
    concern_notes: string;
    line_status: "Fulfilled" | "Fulfilled with Returns" | "Fulfilled with Concern" | "Unfulfilled";
}

export default function DeliveryClearanceModal({
    record,
    isOpen,
    isSubmitting,
    onClose,
    onSubmit,
}: DeliveryClearanceModalProps) {
    const [lineItems, setLineItems] = useState<EditableLineItem[]>(() =>
        (record?.items || []).map((item) => {
            let initialStatus: "Fulfilled" | "Fulfilled with Returns" | "Fulfilled with Concern" | "Unfulfilled" = "Fulfilled";
            if (item.received_quantity === 0 && item.returned_quantity === item.ordered_quantity) {
                initialStatus = "Unfulfilled";
            } else if (item.received_quantity > 0 && item.returned_quantity > 0) {
                initialStatus = "Fulfilled with Returns";
            } else if (item.has_concern) {
                initialStatus = "Fulfilled with Concern";
            }
            return {
                detail_id: item.detail_id,
                product_id: item.product_id,
                product_code: item.product_code,
                product_name: item.product_name,
                ordered_quantity: item.ordered_quantity,
                received_quantity: item.received_quantity,
                returned_quantity: item.returned_quantity,
                unit_price: item.unit_price,
                has_concern: item.has_concern,
                concern_notes: item.concern_notes || "",
                line_status: initialStatus,
            };
        })
    );
    const [clearanceRemarks, setClearanceRemarks] = useState<string>(() => record?.remarks || "");
    const [formError, setFormError] = useState<string | null>(null);

    // Live derived clearance status
    const previewStatus: FulfillmentStatus = useMemo(() => {
        return computePreviewStatus(lineItems);
    }, [lineItems]);

    // Total ordered units calculation
    const totalOrderedUnits = useMemo(() => {
        return lineItems.reduce((acc, item) => acc + item.ordered_quantity, 0);
    }, [lineItems]);

    // Validate quantities for all lines: received + returned === ordered
    const validationIssues = useMemo(() => {
        const issues: string[] = [];
        lineItems.forEach((item, idx) => {
            const sum = item.received_quantity + item.returned_quantity;
            if (sum !== item.ordered_quantity) {
                issues.push(
                    `Line ${idx + 1} (${item.product_name}): Received (${item.received_quantity}) + Returned (${item.returned_quantity}) = ${sum}, must equal Ordered (${item.ordered_quantity}).`
                );
            }
            if (item.received_quantity < 0 || item.returned_quantity < 0) {
                issues.push(`Line ${idx + 1} (${item.product_name}): Quantities cannot be negative.`);
            }
        });
        return issues;
    }, [lineItems]);

    const isValid = validationIssues.length === 0 && lineItems.length > 0;

    // Line update handlers
    const updateLine = (index: number, updates: Partial<EditableLineItem>) => {
        setLineItems((prev) => {
            const next = [...prev];
            const updated = { ...next[index], ...updates };

            // If quantities changed, update line_status accordingly
            if (updates.received_quantity !== undefined || updates.returned_quantity !== undefined) {
                const rec = updated.received_quantity;
                const ret = updated.returned_quantity;
                const ord = updated.ordered_quantity;

                if (rec === 0 && ret === ord) {
                    updated.line_status = "Unfulfilled";
                } else if (rec > 0 && ret > 0) {
                    updated.line_status = "Fulfilled with Returns";
                } else if (rec === ord && ret === 0 && updated.has_concern) {
                    updated.line_status = "Fulfilled with Concern";
                } else if (rec === ord && ret === 0 && !updated.has_concern) {
                    updated.line_status = "Fulfilled";
                }
            }

            next[index] = updated;
            return next;
        });
    };

    // Quick Line Status Preset Helper
    const setLineStatusPreset = (index: number, preset: "Fulfilled" | "Fulfilled with Returns" | "Fulfilled with Concern" | "Unfulfilled") => {
        setLineItems((prev) => {
            const next = [...prev];
            const item = next[index];
            if (preset === "Fulfilled") {
                next[index] = {
                    ...item,
                    line_status: "Fulfilled",
                    received_quantity: item.ordered_quantity,
                    returned_quantity: 0,
                    has_concern: false,
                };
            } else if (preset === "Unfulfilled") {
                next[index] = {
                    ...item,
                    line_status: "Unfulfilled",
                    received_quantity: 0,
                    returned_quantity: item.ordered_quantity,
                    has_concern: false,
                };
            } else if (preset === "Fulfilled with Concern") {
                next[index] = {
                    ...item,
                    line_status: "Fulfilled with Concern",
                    has_concern: true,
                };
            } else if (preset === "Fulfilled with Returns") {
                next[index] = {
                    ...item,
                    line_status: "Fulfilled with Returns",
                    received_quantity: Math.max(0, item.ordered_quantity - 1),
                    returned_quantity: item.ordered_quantity > 0 ? 1 : 0,
                    has_concern: false,
                };
            }
            return next;
        });
    };

    // Global Status Preset Helper
    const handleSetAllStatus = (status: FulfillmentStatus) => {
        if (status === "Fulfilled") {
            setLineItems((prev) =>
                prev.map((item) => ({
                    ...item,
                    line_status: "Fulfilled",
                    received_quantity: item.ordered_quantity,
                    returned_quantity: 0,
                    has_concern: false,
                }))
            );
        } else if (status === "Unfulfilled") {
            setLineItems((prev) =>
                prev.map((item) => ({
                    ...item,
                    line_status: "Unfulfilled",
                    received_quantity: 0,
                    returned_quantity: item.ordered_quantity,
                    has_concern: false,
                }))
            );
        } else if (status === "Fulfilled with Concern") {
            setLineItems((prev) =>
                prev.map((item) => ({
                    ...item,
                    line_status: "Fulfilled with Concern",
                    has_concern: true,
                }))
            );
        } else if (status === "Fulfilled with Returns") {
            setLineItems((prev) =>
                prev.map((item) => ({
                    ...item,
                    line_status: "Fulfilled with Returns",
                    received_quantity: Math.max(0, item.ordered_quantity - 1),
                    returned_quantity: item.ordered_quantity > 0 ? 1 : 0,
                    has_concern: false,
                }))
            );
        } else if (status === "Pending") {
            setLineItems((prev) =>
                prev.map((item) => ({
                    ...item,
                    line_status: "Unfulfilled",
                    received_quantity: 0,
                    returned_quantity: 0,
                    has_concern: false,
                }))
            );
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!record) return;

        if (!isValid) {
            setFormError(validationIssues[0] || "Please balance Received + Returned to equal Ordered before submitting.");
            return;
        }

        setFormError(null);

        const payload: ClearanceSubmissionPayload = {
            invoice_id: record.invoice_id,
            order_id: record.order_id,
            clearance_remarks: clearanceRemarks,
            items: lineItems.map((item) => ({
                detail_id: item.detail_id,
                product_id: item.product_id,
                received_quantity: item.received_quantity,
                returned_quantity: item.returned_quantity,
                has_concern: item.has_concern,
                concern_notes: item.concern_notes,
            })),
        };

        await onSubmit(payload);
    };

    if (!isOpen || !record) return null;

    const statusBadgeStyles: Record<FulfillmentStatus, string> = {
        Pending: "bg-zinc-500/10 border-zinc-500/20 text-zinc-600 dark:text-zinc-400",
        Fulfilled: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400",
        "Fulfilled with Returns": "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400",
        "Fulfilled with Concern": "bg-blue-500/10 border-blue-500/20 text-blue-600 dark:text-blue-400",
        Unfulfilled: "bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400",
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 lg:p-8 bg-background/80 backdrop-blur-sm overflow-y-auto">
                <motion.div
                    initial={{ opacity: 0, y: -12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.22, ease: "easeOut" }}
                    className="relative w-full max-w-[94vw] sm:max-w-5xl lg:max-w-6xl bg-card border rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
                >
                    {/* Header Banner */}
                    <div className="px-6 py-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0 bg-muted/10">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-lg sm:text-xl font-black text-foreground tracking-tight">
                                        Delivery Clearance
                                    </h2>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap pt-0.5">
                                    <span>Reconcile items for</span>
                                    <span className="font-bold text-primary">{record.order_no}</span>
                                    <span className="font-medium text-muted-foreground">({record.invoice_no})</span>
                                    <span>•</span>
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary/10 border border-primary/20 text-primary">
                                        {record.branch_name}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Top Action Buttons */}
                        <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-center">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSubmitting}
                                className="px-4 py-2 rounded-xl border border-input bg-background hover:bg-muted text-xs font-bold text-foreground transition-all cursor-pointer shadow-xs"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSubmit}
                                disabled={!isValid || isSubmitting}
                                className={`px-5 py-2 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-2 ${
                                    isValid && !isSubmitting
                                        ? "bg-primary hover:bg-primary/95 text-primary-foreground cursor-pointer shadow-sm hover:shadow-md"
                                        : "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                                }`}
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Posting...
                                    </>
                                ) : (
                                    <>
                                        <ClipboardCheck className="h-4 w-4" />
                                        Confirm Clearance
                                    </>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSubmitting}
                                className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer border-none bg-transparent ml-1"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {/* Main Body */}
                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Direct Summary KPI Cards */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                            {/* 1. Customer */}
                            <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                                    Customer
                                </span>
                                <div className="font-black text-sm text-foreground truncate" title={record.customer_name}>
                                    {record.customer_name}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono truncate">
                                    {record.customer_code}
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
                                    Direct Fulfillment
                                </div>
                            </div>

                            {/* 3. Invoice Date */}
                            <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                    Invoice Date
                                </span>
                                <div className="font-black text-sm text-foreground">
                                    {new Date(record.invoice_date).toLocaleDateString(undefined, {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                    })}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono">
                                    {record.invoice_no}
                                </div>
                            </div>

                            {/* 4. Total Items */}
                            <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
                                    Total Items
                                </span>
                                <div className="font-black text-sm text-foreground">
                                    {lineItems.length} Products
                                </div>
                                <div className="text-[10px] text-muted-foreground font-semibold">
                                    {totalOrderedUnits} Total Units
                                </div>
                            </div>

                            {/* 5. Total Amount */}
                            <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <CircleDollarSign className="h-3.5 w-3.5 text-primary" />
                                    Total Amount
                                </span>
                                <div className="font-black text-base text-primary flex items-center gap-1">
                                    ₱{record.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-medium">
                                    Net Invoice Value
                                </div>
                            </div>
                        </div>

                        {/* Error Alert */}
                        {formError && (
                            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2.5">
                                <AlertCircle className="h-4 w-4 shrink-0" />
                                <span>{formError}</span>
                            </div>
                        )}

                        {/* Reconciliation Table Section */}
                        <div className="space-y-3">
                            {/* Section Header & Global Status Dropdown */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
                                <div>
                                    <h3 className="text-sm font-black text-foreground tracking-tight">
                                        Product Reconciliation Table
                                    </h3>
                                    <p className="text-xs font-semibold text-rose-500 dark:text-rose-400 pt-0.5">
                                        Select status and mark items as cleared. Adjust quantities or notes as needed.
                                    </p>
                                </div>

                                {/* Status Outcome & Global Selector */}
                                <div className="flex items-center gap-2.5 flex-wrap self-start sm:self-auto">
                                    <span className="text-xs font-bold text-muted-foreground">Overall Status:</span>
                                    <Select
                                        value={previewStatus}
                                        onValueChange={(val) => handleSetAllStatus(val as FulfillmentStatus)}
                                    >
                                        <SelectTrigger className="w-[200px] h-8 text-xs font-bold rounded-xl bg-background shadow-xs">
                                            <SelectValue placeholder="Set Status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Pending">Pending</SelectItem>
                                            <SelectItem value="Fulfilled">Fulfilled</SelectItem>
                                            <SelectItem value="Unfulfilled">Unfulfilled</SelectItem>
                                            <SelectItem value="Fulfilled with Returns">Fulfilled with Returns</SelectItem>
                                            <SelectItem value="Fulfilled with Concern">Fulfilled with Concern</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <span
                                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
                                            statusBadgeStyles[previewStatus] || statusBadgeStyles.Pending
                                        }`}
                                    >
                                        {previewStatus === "Fulfilled" && <CheckCircle2 className="h-3.5 w-3.5" />}
                                        {previewStatus === "Fulfilled with Returns" && <RotateCcw className="h-3.5 w-3.5" />}
                                        {previewStatus === "Fulfilled with Concern" && <AlertCircle className="h-3.5 w-3.5" />}
                                        {previewStatus === "Unfulfilled" && <AlertTriangle className="h-3.5 w-3.5" />}
                                        {previewStatus}
                                    </span>
                                </div>
                            </div>

                            {/* Line Items Table */}
                            <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="border-b bg-muted/40 text-[10px] uppercase font-black text-muted-foreground tracking-wider">
                                                <th className="p-3.5 w-44">Status</th>
                                                <th className="p-3.5">Product / Item</th>
                                                <th className="p-3.5 text-center w-20">Ordered</th>
                                                <th className="p-3.5 text-center w-24 text-emerald-600 dark:text-emerald-400">Received</th>
                                                <th className="p-3.5 text-center w-24 text-rose-600 dark:text-rose-400">Returned</th>
                                                <th className="p-3.5 text-center w-20">Variance</th>
                                                <th className="p-3.5 min-w-[200px]">Notes & Concerns</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {lineItems.map((item, idx) => {
                                                const variance = item.ordered_quantity - (item.received_quantity + item.returned_quantity);
                                                const isBalanced = variance === 0;

                                                // Determine current line status selection
                                                const currentLineStatus = (() => {
                                                    if (item.received_quantity === 0 && item.returned_quantity === item.ordered_quantity && !item.has_concern) {
                                                        return "Unfulfilled";
                                                    }
                                                    if (item.received_quantity > 0 && item.returned_quantity > 0) {
                                                        return "Fulfilled with Returns";
                                                    }
                                                    if (item.returned_quantity === 0 && item.received_quantity === item.ordered_quantity && item.has_concern) {
                                                        return "Fulfilled with Concern";
                                                    }
                                                    if (item.returned_quantity > 0) {
                                                        return "Fulfilled with Returns";
                                                    }
                                                    if (item.has_concern) {
                                                        return "Fulfilled with Concern";
                                                    }
                                                    return "Fulfilled";
                                                })();

                                                return (
                                                    <tr key={item.detail_id || idx} className="hover:bg-muted/10 transition-colors">
                                                        {/* Line Status Dropdown */}
                                                        <td className="p-3.5 align-middle">
                                                            <Select
                                                                value={currentLineStatus}
                                                                onValueChange={(val) =>
                                                                    setLineStatusPreset(
                                                                        idx,
                                                                        val as "Fulfilled" | "Fulfilled with Returns" | "Fulfilled with Concern" | "Unfulfilled"
                                                                    )
                                                                }
                                                            >
                                                                <SelectTrigger className="w-full h-8 text-[11px] font-bold rounded-lg bg-background">
                                                                    <SelectValue placeholder="Status" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="Fulfilled">Fulfilled</SelectItem>
                                                                    <SelectItem value="Fulfilled with Returns">Fulfilled with Returns</SelectItem>
                                                                    <SelectItem value="Fulfilled with Concern">Fulfilled with Concern</SelectItem>
                                                                    <SelectItem value="Unfulfilled">Unfulfilled</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </td>

                                                        {/* Product Info */}
                                                        <td className="p-3.5 align-middle">
                                                            <span className="font-bold text-foreground block text-xs">{item.product_name}</span>
                                                            <span className="text-[10px] text-muted-foreground font-mono">{item.product_code}</span>
                                                        </td>

                                                        {/* Ordered */}
                                                        <td className="p-3.5 text-center align-middle font-black text-sm text-foreground">
                                                            {item.ordered_quantity}
                                                        </td>

                                                        {/* Received Input */}
                                                        <td className="p-3.5 text-center align-middle">
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
                                                                className="w-18 h-8 text-center bg-background border border-emerald-500/40 focus:border-emerald-500 rounded-lg px-2 text-xs font-black text-foreground outline-none shadow-xs"
                                                            />
                                                        </td>

                                                        {/* Returned Input */}
                                                        <td className="p-3.5 text-center align-middle">
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
                                                                className="w-18 h-8 text-center bg-background border border-rose-500/40 focus:border-rose-500 rounded-lg px-2 text-xs font-black text-foreground outline-none shadow-xs"
                                                            />
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
                                                            <input
                                                                type="text"
                                                                placeholder="Add concern or return reason (optional)..."
                                                                value={item.concern_notes}
                                                                onChange={(e) => updateLine(idx, { concern_notes: e.target.value })}
                                                                className="w-full h-8 bg-background border border-input rounded-lg px-2.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary shadow-xs"
                                                            />
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
                                Clearance Remarks / Delivery Notes
                            </label>
                            <input
                                type="text"
                                value={clearanceRemarks}
                                onChange={(e) => setClearanceRemarks(e.target.value)}
                                placeholder="Enter delivery remarks or clearance notes..."
                                className="w-full bg-background border border-input rounded-xl px-3.5 py-2.5 text-xs focus:border-primary outline-none text-foreground shadow-xs"
                            />
                        </div>

                        {/* Footer Controls */}
                        <div className="flex items-center justify-end gap-3 pt-3 border-t">
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
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
