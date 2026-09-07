// src/modules/manufacturing-management/mm/sales-and-fulfillment/fulfilment-and-deliveries/components/ProductReconciliationModal.tsx

"use client";

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
    ConsolidatedSalesOrderRecord,
    ClearanceLineItem,
    LineStatus,
    FulfillmentStatus,
    LinkedSalesReturn,
} from "../types";
import { computePreviewStatus } from "../hooks/useDeliveries";
import {
    SearchableSelect,
    SearchableSelectOption,
} from "@/modules/manufacturing-management/shared/components/SearchableSelect";
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
    ExternalLink,
    Search,
    RefreshCw,
    UserCheck,
    Link2,
} from "lucide-react";

interface ProductReconciliationModalProps {
    order: ConsolidatedSalesOrderRecord | null;
    isOpen: boolean;
    isReadOnly?: boolean;
    onClose: () => void;
    onSave: (
        updatedItems: ClearanceLineItem[],
        linkedReturn?: LinkedSalesReturn | null,
        orderRemarks?: string
    ) => void;
    onRefresh?: () => Promise<void> | void;
}

export default function ProductReconciliationModal({
    order,
    isOpen,
    isReadOnly = false,
    onClose,
    onSave,
    onRefresh,
}: ProductReconciliationModalProps) {
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [orderRemarks, setOrderRemarks] = useState<string>(() => order?.remarks || "");
    const [prevOrder, setPrevOrder] = useState<typeof order>(order);

    if (order !== prevOrder) {
        setPrevOrder(order);
        setOrderRemarks(order?.remarks || "");
    }

    const [lineItems, setLineItems] = useState<ClearanceLineItem[]>(() => {
        const initial = (order?.items || []).map((item) => ({ ...item }));
        if (order) {
            console.log("[ProductReconciliationModal] 📦 Product Line Reconciliation Loaded for Order:", {
                order_id: order.order_id,
                order_no: order.order_no,
                invoice_id: order.invoice_id,
                invoice_no: order.invoice_no,
                invoice_date: order.invoice_date,
                customer_name: order.customer_name,
                customer_code: order.customer_code,
                salesman_name: order.salesman_name,
                salesman_code: order.salesman_code,
                fulfillment_status: order.fulfillment_status,
                linked_sales_return: order.linked_sales_return,
                remarks: order.remarks,
                items_count: initial.length,
                lineItems: initial,
                raw_order: order,
            });
        }
        return initial;
    });

    const [searchQuery, setSearchQuery] = useState<string>("");

    // Linked Sales Return state (1:1 relationship per Sales Order)
    const [selectedLinkedReturn, setSelectedLinkedReturn] = useState<LinkedSalesReturn | null>(() => {
        return order?.linked_sales_return || null;
    });
    const [availableReturns, setAvailableReturns] = useState<
        Array<
            LinkedSalesReturn & {
                customer_name?: string;
                customer_code?: string;
                order_id?: string | number | null;
                invoice_no?: string | number | null;
            }
        >
    >([]);

    // Fetch candidate sales returns from backend on modal open
    useEffect(() => {
        let isMounted = true;
        if (isOpen) {
            fetch("/api/manufacturing/sales-return", { cache: "no-store" })
                .then((res) => (res.ok ? res.json() : []))
                .then((data: unknown) => {
                    if (!isMounted) return;
                    if (Array.isArray(data)) {
                        const mapped = data.map((r: Record<string, unknown>) => ({
                            return_id: Number(r.return_id || r.id),
                            return_number: (r.return_number as string) || `RET-${r.return_id || r.id}`,
                            status: (r.status as string) || (r.isReceived || r.is_received ? "Received" : "Pending"),
                            is_received: Boolean(
                                r.isReceived || r.is_received || r.status === "Received" || r.status === "Approved"
                            ),
                            return_date: (r.return_date as string) || null,
                            total_amount: typeof r.total_amount === "number" ? r.total_amount : null,
                            customer_name: (r.customer_name as string) || "",
                            customer_code: (r.customer_code as string) || "",
                            order_id: (r.order_id as string | number) || null,
                            invoice_no: (r.invoice_no as string | number) || null,
                        }));
                        setAvailableReturns(mapped);
                    }
                })
                .catch((err: unknown) => console.warn("[ProductReconciliationModal] Error fetching returns:", err));
        }
        return () => {
            isMounted = false;
        };
    }, [isOpen]);

    // Manual refresh handler for sales returns
    const fetchAvailableReturns = useCallback(async () => {
        try {
            const res = await fetch("/api/manufacturing/sales-return", { cache: "no-store" });
            const data = res.ok ? await res.json() : [];
            if (Array.isArray(data)) {
                const mapped = data.map((r: Record<string, unknown>) => ({
                    return_id: Number(r.return_id || r.id),
                    return_number: (r.return_number as string) || `RET-${r.return_id || r.id}`,
                    status: (r.status as string) || (r.isReceived || r.is_received ? "Received" : "Pending"),
                    is_received: Boolean(
                        r.isReceived || r.is_received || r.status === "Received" || r.status === "Approved"
                    ),
                    return_date: (r.return_date as string) || null,
                    total_amount: typeof r.total_amount === "number" ? r.total_amount : null,
                    customer_name: (r.customer_name as string) || "",
                    customer_code: (r.customer_code as string) || "",
                    order_id: (r.order_id as string | number) || null,
                    invoice_no: (r.invoice_no as string | number) || null,
                }));
                setAvailableReturns(mapped);
            }
        } catch (err: unknown) {
            console.warn("[ProductReconciliationModal] Error fetching sales returns:", err);
        }
    }, []);

    // Format options for SearchableSelect combobox with SO & Invoice matching
    const returnOptions: SearchableSelectOption[] = useMemo(() => {
        const opts: SearchableSelectOption[] = [
            {
                value: "none",
                label: "None (No Linked Return)",
                subLabel: "Clear return linkage for this sales order",
            },
        ];

        // Deduplicate returns by return_id
        const returnMap = new Map<number, (typeof availableReturns)[0]>();
        for (const r of availableReturns) {
            if (r.return_id) returnMap.set(r.return_id, r);
        }

        // Ensure currently selected linked return is included if not in returned list
        if (selectedLinkedReturn?.return_id && !returnMap.has(selectedLinkedReturn.return_id)) {
            returnMap.set(selectedLinkedReturn.return_id, {
                return_id: selectedLinkedReturn.return_id,
                return_number: selectedLinkedReturn.return_number,
                status: selectedLinkedReturn.status,
                is_received: selectedLinkedReturn.is_received,
                return_date: selectedLinkedReturn.return_date,
                total_amount: selectedLinkedReturn.total_amount,
                customer_name: order?.customer_name,
                customer_code: order?.customer_code,
                order_id: order?.order_no,
                invoice_no: order?.invoice_no,
            });
        }

        const currentOrderNo = (order?.order_no || "").trim().toLowerCase();
        const currentOrderId = String(order?.order_id || "").trim().toLowerCase();
        const currentInvNo = (order?.invoice_no || "").trim().toLowerCase();
        const currentInvId = String(order?.invoice_id || "").trim().toLowerCase();
        const currentCustCode = (order?.customer_code || "").trim().toLowerCase();

        // Calculate relevance match score for each candidate return
        const getMatchScore = (r: (typeof availableReturns)[0]) => {
            const rOrderId = String(r.order_id || "").trim().toLowerCase();
            const rInvNo = String(r.invoice_no || "").trim().toLowerCase();
            const rCustCode = String(r.customer_code || "").trim().toLowerCase();

            const isOrderMatch = Boolean(
                rOrderId &&
                rOrderId !== "---" &&
                (rOrderId === currentOrderNo ||
                 rOrderId === currentOrderId ||
                 (currentOrderNo && rOrderId.includes(currentOrderNo)) ||
                 (currentOrderNo && currentOrderNo.includes(rOrderId)))
            );

            const isInvoiceMatch = Boolean(
                rInvNo &&
                rInvNo !== "---" &&
                (rInvNo === currentInvNo ||
                 rInvNo === currentInvId ||
                 (currentInvNo && currentInvNo !== "---" && rInvNo.includes(currentInvNo)) ||
                 (currentInvNo && currentInvNo !== "---" && currentInvNo.includes(rInvNo)))
            );

            const isCustMatch = Boolean(rCustCode && currentCustCode && rCustCode === currentCustCode);

            if (isOrderMatch && isInvoiceMatch) return 4000;
            if (isOrderMatch) return 3000;
            if (isInvoiceMatch) return 2000;
            if (isCustMatch) return 1000;
            return 0;
        };

        // Sort candidate returns by match score descending, then by return_id descending
        const sorted = Array.from(returnMap.values()).sort((a, b) => {
            const scoreA = getMatchScore(a);
            const scoreB = getMatchScore(b);
            if (scoreA !== scoreB) return scoreB - scoreA;
            return (b.return_id || 0) - (a.return_id || 0);
        });

        // Strictly filter candidate returns to only those matching SO or Invoice (or the currently selected return)
        const matchingReturns = sorted.filter((r) => {
            if (selectedLinkedReturn?.return_id && r.return_id === selectedLinkedReturn.return_id) {
                return true;
            }
            const rOrderId = String(r.order_id || "").trim().toLowerCase();
            const rInvNo = String(r.invoice_no || "").trim().toLowerCase();

            const isOrderMatch = Boolean(
                rOrderId &&
                rOrderId !== "---" &&
                (rOrderId === currentOrderNo ||
                 rOrderId === currentOrderId ||
                 (currentOrderNo && rOrderId.includes(currentOrderNo)) ||
                 (currentOrderNo && currentOrderNo.includes(rOrderId)))
            );

            const isInvoiceMatch = Boolean(
                rInvNo &&
                rInvNo !== "---" &&
                (rInvNo === currentInvNo ||
                 rInvNo === currentInvId ||
                 (currentInvNo && currentInvNo !== "---" && rInvNo.includes(currentInvNo)) ||
                 (currentInvNo && currentInvNo !== "---" && currentInvNo.includes(rInvNo)))
            );

            return isOrderMatch || isInvoiceMatch;
        });

        for (const r of matchingReturns) {
            const rOrderId = String(r.order_id || "").trim().toLowerCase();
            const rInvNo = String(r.invoice_no || "").trim().toLowerCase();
            const rCustCode = String(r.customer_code || "").trim().toLowerCase();

            const isOrderMatch = Boolean(
                rOrderId &&
                rOrderId !== "---" &&
                (rOrderId === currentOrderNo ||
                 rOrderId === currentOrderId ||
                 (currentOrderNo && rOrderId.includes(currentOrderNo)) ||
                 (currentOrderNo && currentOrderNo.includes(rOrderId)))
            );

            const isInvoiceMatch = Boolean(
                rInvNo &&
                rInvNo !== "---" &&
                (rInvNo === currentInvNo ||
                 rInvNo === currentInvId ||
                 (currentInvNo && currentInvNo !== "---" && rInvNo.includes(currentInvNo)) ||
                 (currentInvNo && currentInvNo !== "---" && currentInvNo.includes(rInvNo)))
            );

            const isCustMatch = Boolean(rCustCode && currentCustCode && rCustCode === currentCustCode);

            const dateStr =
                r.return_date && !isNaN(new Date(r.return_date).getTime())
                    ? new Date(r.return_date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                      })
                    : "";
            const amountStr =
                r.total_amount !== null && r.total_amount !== undefined
                    ? `₱${Number(r.total_amount).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                      })}`
                    : "";

            // Build informative sublabel enabling fast search on SO, Invoice, Customer, Date
            const subParts = [
                r.order_id ? `SO: ${r.order_id}` : (isOrderMatch ? `SO: ${order?.order_no}` : null),
                r.invoice_no && r.invoice_no !== "---" ? `Inv: ${r.invoice_no}` : (isInvoiceMatch && order?.invoice_no !== "---" ? `Inv: ${order?.invoice_no}` : null),
                r.customer_name || r.customer_code || (isCustMatch ? order?.customer_name : null),
                dateStr,
                amountStr,
            ].filter(Boolean);

            let badge = r.status || (r.is_received ? "Received" : "Pending");
            let badgeStyle = "bg-muted text-muted-foreground border-border";

            if (isOrderMatch && isInvoiceMatch) {
                badge = "Matching SO & Inv";
                badgeStyle = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-black";
            } else if (isOrderMatch) {
                badge = "Matching SO";
                badgeStyle = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-black";
            } else if (isInvoiceMatch) {
                badge = "Matching Inv";
                badgeStyle = "bg-primary/15 text-primary border-primary/30 font-black";
            } else if (isCustMatch) {
                badge = "Matching Cust";
                badgeStyle = "bg-primary/10 text-primary border-primary/20";
            } else if (badge === "Received" || badge === "Approved") {
                badgeStyle = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
            } else if (badge === "Pending") {
                badgeStyle = "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
            }

            opts.push({
                value: String(r.return_id),
                label: r.return_number,
                subLabel: subParts.join(" • "),
                badge: badge,
                badgeClassName: badgeStyle,
            });
        }

        return opts;
    }, [availableReturns, selectedLinkedReturn, order]);

    const handleSelectReturn = (val: string) => {
        if (val === "none" || !val) {
            setSelectedLinkedReturn(null);
            toast.info("Sales Return unlinked from this order.");
            return;
        }
        const idNum = Number(val);
        const found =
            availableReturns.find((r) => r.return_id === idNum) ||
            (selectedLinkedReturn?.return_id === idNum ? selectedLinkedReturn : null);
        if (found) {
            setSelectedLinkedReturn({
                return_id: found.return_id,
                return_number: found.return_number,
                status: found.status,
                is_received: found.is_received,
                return_date: found.return_date,
                total_amount: found.total_amount,
            });
            toast.success(`Linked Sales Return ${found.return_number} to this order.`);
        }
    };

    // Dynamic fulfillment status derived live from line items and selected order status
    const dynamicStatus: FulfillmentStatus = useMemo(() => {
        const computed = computePreviewStatus(lineItems);
        // If order was explicitly set as a return status or has linked return, maintain return status unless all items are unfulfilled
        if (order?.fulfillment_status === "Fulfilled with Returns" || selectedLinkedReturn) {
            if (computed === "Unfulfilled / Returns") return "Unfulfilled / Returns";
            return "Fulfilled with Returns";
        }
        if (order?.fulfillment_status === "Unfulfilled / Returns") {
            return "Unfulfilled / Returns";
        }
        if (order?.fulfillment_status === "Fulfilled with Concerns" && computed === "Fulfilled") {
            return "Fulfilled with Concerns";
        }
        return computed;
    }, [lineItems, order, selectedLinkedReturn]);

    // Total ordered units calculation for KPI card
    const totalOrderedUnits = useMemo(() => {
        return lineItems.reduce((acc, item) => acc + item.ordered_quantity, 0);
    }, [lineItems]);

    // Filtered line items with original indices preserved for safe editing
    const filteredLineItemsWithIndex = useMemo(() => {
        return lineItems
            .map((item, originalIndex) => ({ item, originalIndex }))
            .filter(({ item }) => {
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase().trim();
                const name = (item.product_name || "").toLowerCase();
                const code = (item.product_code || "").toLowerCase();
                return name.includes(q) || code.includes(q);
            });
    }, [lineItems, searchQuery]);

    // Sales return status indicators
    const sr = selectedLinkedReturn;
    const isUnfulfilled = dynamicStatus === "Unfulfilled / Returns" || order?.fulfillment_status === "Unfulfilled / Returns";
    const hasReturns =
        !isUnfulfilled &&
        ((lineItems || []).some((i) => i.returned_quantity > 0) ||
            order?.fulfillment_status === "Fulfilled with Returns" ||
            Boolean(sr));

    // Helper to redirect to Sales Return module for this order
    const handleRedirectToSalesReturn = () => {
        if (!order) return;
        const existingReturnNo = selectedLinkedReturn?.return_number || order.linked_sales_return?.return_number;

        const params = new URLSearchParams({
            fromClearance: "true",
            invoiceNo: order.invoice_no || "",
            orderNo: order.order_no || "",
            customerCode: order.customer_code || "",
        });
        if (order.salesman_id) {
            params.set("salesmanId", String(order.salesman_id));
        }

        if (existingReturnNo) {
            // View / Edit existing Sales Return: specify editReturnNo and clear draft storage
            params.set("editReturnNo", existingReturnNo);
            if (typeof window !== "undefined") {
                localStorage.removeItem("scm_dispatch_return_data");
            }
        } else {
            // Create new Sales Return: save prefilled return lines into localStorage
            const payloadData = {
                customerCode: order.customer_code || "",
                customerName: order.customer_name || "",
                invoiceNo: order.invoice_no || "",
                orderNo: order.order_no || "",
                salesmanId: order.salesman_id ? String(order.salesman_id) : "",
                salesmanCode: order.salesman_code || "",
                salesmanName: order.salesman_name || "",
                items: lineItems || [],
            };
            if (typeof window !== "undefined") {
                localStorage.setItem("scm_dispatch_return_data", JSON.stringify(payloadData));
            }
        }

        window.open(
            `/mm/sales-and-fulfillment/sales-return-and-credit-notes?${params.toString()}`,
            "_blank"
        );
    };

    // Refresh handler to reload sales returns from server
    const handleRefresh = async () => {
        setIsRefreshing(true);
        try {
            if (onRefresh) await onRefresh();
            await fetchAvailableReturns();
            toast.success("Sales Return status updated.");
        } catch {
            toast.error("Failed to refresh Sales Return status.");
        } finally {
            setIsRefreshing(false);
        }
    };

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

        // 1. Validate non-negative quantities
        const negativeLine = lineItems.find((item) => item.received_quantity < 0 || item.returned_quantity < 0);
        if (negativeLine) {
            toast.error(`Quantities cannot be negative for "${negativeLine.product_name}".`);
            return;
        }

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
            } else if (rec === ord && ret === 0) {
                status = "Fulfilled";
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
            linked_sales_return: selectedLinkedReturn,
            remarks: orderRemarks,
            items: processedItems,
        });
        onSave(processedItems, selectedLinkedReturn, orderRemarks);
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
                                    <span
                                        className={`font-black text-[10px] uppercase tracking-wider border rounded-md px-2.5 py-0.5 transition-all ${
                                            dynamicStatus === "Fulfilled"
                                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                                : dynamicStatus === "Fulfilled with Concerns"
                                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                                : dynamicStatus === "Fulfilled with Returns"
                                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                                : dynamicStatus === "Unfulfilled / Returns"
                                                ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                                                : "bg-muted text-muted-foreground border-border"
                                        }`}
                                    >
                                        {dynamicStatus}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Header Action Buttons */}
                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
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
                        {/* 6 Direct Summary KPI Cards for this Order */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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

                            {/* 2. Salesman */}
                            <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <UserCheck className="h-3.5 w-3.5 text-muted-foreground" />
                                    Salesman
                                </span>
                                <div className="font-black text-sm text-foreground truncate" title={order.salesman_name || "—"}>
                                    {order.salesman_name || "—"}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-mono truncate">
                                    {order.salesman_code || "—"}
                                </div>
                            </div>

                            {/* 3. Invoice & Order */}
                            <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Receipt className="h-3.5 w-3.5 text-primary" />
                                    Invoice & Order
                                </span>
                                <div
                                    className={`font-black text-sm font-mono truncate ${
                                        order.invoice_no && order.invoice_no !== "---"
                                            ? "text-primary"
                                             : "text-muted-foreground"
                                    }`}
                                    title={order.invoice_no && order.invoice_no !== "---" ? order.invoice_no : "No Sales Invoice"}
                                >
                                    {order.invoice_no && order.invoice_no !== "---" ? order.invoice_no : "---"}
                                </div>
                                <div className="text-[10px] text-muted-foreground font-bold truncate" title={order.order_no}>
                                    {order.order_no}
                                </div>
                            </div>

                            {/* 4. Invoice Date */}
                            <div className="p-4 rounded-xl border bg-card/60 space-y-1 shadow-xs">
                                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                    Invoice Date
                                </span>
                                <div className="font-black text-sm text-foreground">
                                    {order.invoice_date &&
                                    order.invoice_date !== "---" &&
                                    !isNaN(new Date(order.invoice_date).getTime())
                                        ? new Date(order.invoice_date).toLocaleDateString(undefined, {
                                              month: "short",
                                              day: "numeric",
                                              year: "numeric",
                                          })
                                        : "---"}
                                </div>
                                <div className="text-[10px] text-muted-foreground">
                                    {order.invoice_no && order.invoice_no !== "---" ? "Sales Invoice" : "No Sales Invoice"}
                                </div>
                            </div>

                            {/* 5. Total Items & Units */}
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

                            {/* 6. Total Order Amount */}
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

                        {/* Linked Sales Return Section (Only shown when status is Fulfilled with Returns) */}
                        {dynamicStatus === "Fulfilled with Returns" && (
                            <div className="p-4 rounded-xl border bg-card/60 shadow-xs space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                                                <Link2 className="h-3.5 w-3.5 text-primary" />
                                                Linked Sales Return
                                            </span>
                                            <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full border">
                                                1 Sales Order : 1 Sales Return
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground font-medium">
                                            {selectedLinkedReturn
                                                ? "This sales order is linked to the Sales Return below. You can change or unlink it at any time."
                                                : "If this order has returned products, select an existing Sales Return or create a new one to link."}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            type="button"
                                            onClick={handleRefresh}
                                            disabled={isRefreshing}
                                            className="px-3 py-1.5 rounded-lg border bg-background hover:bg-muted text-foreground text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                                            title="Refresh available Sales Returns"
                                        >
                                            <RefreshCw
                                                className={`h-3.5 w-3.5 ${
                                                    isRefreshing ? "animate-spin text-primary" : ""
                                                }`}
                                            />
                                            <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleRedirectToSalesReturn}
                                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                                        >
                                            <ExternalLink className="h-3.5 w-3.5" />
                                            {selectedLinkedReturn ? "View / Edit in Sales Return" : "Create Sales Return"}
                                        </button>
                                    </div>
                                </div>

                                {/* Searchable Select Combobox Row */}
                                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
                                    <div className="sm:col-span-8 lg:col-span-7">
                                        <SearchableSelect
                                            options={returnOptions}
                                            value={selectedLinkedReturn ? String(selectedLinkedReturn.return_id) : "none"}
                                            onValueChange={handleSelectReturn}
                                            disabled={isReadOnly || isRefreshing}
                                            placeholder="Select a matching Sales Return to link..."
                                            searchPlaceholder="Search return number, SO, invoice, or date..."
                                            emptyMessage="No Sales Return matching this SO or Invoice."
                                        />
                                    </div>
                                    <div className="sm:col-span-4 lg:col-span-5 flex items-center gap-2 flex-wrap text-xs">
                                        {selectedLinkedReturn ? (
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span
                                                    className={`font-black text-[10px] uppercase tracking-wider border rounded-md px-2.5 py-1 ${
                                                        selectedLinkedReturn.status === "Received" ||
                                                        selectedLinkedReturn.status === "Approved" ||
                                                        selectedLinkedReturn.is_received
                                                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                                            : "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                                    }`}
                                                >
                                                    {selectedLinkedReturn.status ||
                                                        (selectedLinkedReturn.is_received ? "Received" : "Pending")}
                                                </span>

                                                {!isReadOnly && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSelectReturn("none")}
                                                        className="text-[11px] font-bold text-rose-500 hover:text-rose-600 underline ml-1 cursor-pointer"
                                                    >
                                                        Unlink
                                                    </button>
                                                )}
                                            </div>
                                        ) : hasReturns ? (
                                            <span className="text-[11px] font-bold text-rose-500 flex items-center gap-1">
                                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                                Required: Select or create a Sales Return
                                            </span>
                                        ) : (
                                            <span className="text-[11px] text-muted-foreground font-medium">
                                                No return linked (Fully fulfilled)
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Product Lines Table */}
                        <div className="space-y-3">
                            <div className="px-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-black text-foreground tracking-tight">
                                        Item Line Breakdown & Fulfillment Reconciliation
                                    </h3>
                                    <p className="text-xs font-semibold text-muted-foreground pt-0.5">
                                        {isReadOnly
                                            ? "Viewing finalized item line quantities and variance."
                                            : "Adjust fulfilled and returned quantities for each product item."}
                                    </p>
                                </div>

                                {/* Product Search Bar */}
                                <div className="relative w-full sm:w-72 shrink-0">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                    <input
                                        type="text"
                                        placeholder="Search product name or SKU..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full h-8.5 pl-9 pr-8 text-xs bg-background border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-all shadow-xs"
                                    />
                                    {searchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setSearchQuery("")}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
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
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {filteredLineItemsWithIndex.length === 0 ? (
                                                <tr>
                                                    <td
                                                        colSpan={5}
                                                        className="p-8 text-center text-muted-foreground text-xs font-semibold"
                                                    >
                                                        No products matching &quot;{searchQuery}&quot; found.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredLineItemsWithIndex.map(({ item, originalIndex }) => {
                                                    const variance = item.ordered_quantity - (item.received_quantity + item.returned_quantity);
                                                    const isBalanced = variance === 0;

                                                    return (
                                                        <tr key={item.detail_id || originalIndex} className="hover:bg-muted/10 transition-colors">
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
                                                                            updateLine(originalIndex, { received_quantity: isNaN(parsed) ? 0 : Math.max(0, parsed) });
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
                                                                            updateLine(originalIndex, { returned_quantity: isNaN(parsed) ? 0 : Math.max(0, parsed) });
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
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Sales Order Remarks Card (Dedicated Card below product breakdown) */}
                        <div className="p-4 rounded-xl border bg-card/60 shadow-xs space-y-2">
                            <label className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                                <FileText className="h-3.5 w-3.5 text-primary" />
                               Remarks / Notes
                            </label>
                            <p className="text-[11px] text-muted-foreground font-medium">
                                Enter clearance notes, customer concerns, or return details for this sales order.
                            </p>
                            {isReadOnly ? (
                                <div className="p-3 rounded-lg bg-muted/40 border text-xs text-foreground min-h-[48px]">
                                    {orderRemarks || "No remarks recorded."}
                                </div>
                            ) : (
                                <textarea
                                    rows={2}
                                    value={orderRemarks}
                                    onChange={(e) => setOrderRemarks(e.target.value)}
                                    placeholder="Enter order remarks, notes, or reasons for concern / returns..."
                                    className="w-full bg-background border border-input rounded-xl px-3.5 py-2.5 text-xs focus:border-primary outline-none text-foreground placeholder:text-muted-foreground shadow-xs resize-none"
                                />
                            )}
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
                                        type="submit"
                                        className="px-6 py-2.5 rounded-xl text-xs font-black shadow-xs transition-all flex items-center gap-2 bg-primary hover:bg-primary/95 text-primary-foreground cursor-pointer shadow-sm hover:shadow-md active:scale-95"
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
