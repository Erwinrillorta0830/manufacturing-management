// src/modules/manufacturing-management/mm/sales-and-fulfillment/fulfilment-and-deliveries/components/DeliveryClearanceModal.tsx

"use client";

import React, { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
    ConsolidatedDeliveryRecord,
    ConsolidatedSalesOrderRecord,
    ConsolidatedClearanceSubmissionPayload,
    ClearanceLineItem,
    FulfillmentStatus,
    LineStatus,
    LinkedSalesReturn,
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
    CheckCircle2,
    Loader2,
    Building2,
    Calendar,
    Boxes,
    CircleDollarSign,
    ExternalLink,
    Truck,
    Edit3,
    Search,
    RefreshCw,
    Save,
} from "lucide-react";
import ProductReconciliationModal from "./ProductReconciliationModal";

interface DeliveryClearanceModalProps {
    record: ConsolidatedDeliveryRecord;
    isOpen: boolean;
    isSubmitting: boolean;
    onClose: () => void;
    onSubmit: (payload: ConsolidatedClearanceSubmissionPayload) => Promise<boolean>;
    onRefresh?: () => Promise<void> | void;
}

interface SavedDeliveryDraft {
    consolidator_id: number;
    clearanceRemarks: string;
    timestamp: string;
    orders: Array<{
        order_id: number;
        invoice_id: number;
        remarks: string;
        fulfillment_status: FulfillmentStatus;
        linked_sales_return?: LinkedSalesReturn | null;
        items: Array<{
            detail_id: number;
            product_id: number;
            received_quantity: number;
            returned_quantity: number;
            has_concern: boolean;
            concern_notes: string;
            line_status: LineStatus;
        }>;
    }>;
}

function loadLocalDraft(consolidatorId: number): SavedDeliveryDraft | null {
    if (typeof window === "undefined" || !consolidatorId) return null;
    try {
        const raw = localStorage.getItem(`scm_delivery_clearance_draft_${consolidatorId}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SavedDeliveryDraft;
        if (parsed && Number(parsed.consolidator_id) === Number(consolidatorId) && Array.isArray(parsed.orders)) {
            return parsed;
        }
    } catch {
        // ignore parse error
    }
    return null;
}

export default function DeliveryClearanceModal({
    record,
    isOpen,
    isSubmitting,
    onClose,
    onSubmit,
    onRefresh,
}: DeliveryClearanceModalProps) {
    const isReadOnly = Boolean(record?.is_cleared || record?.status === "Delivered");

    const [hasActiveDraft, setHasActiveDraft] = useState<boolean>(() => {
        if (isReadOnly || !record?.consolidator_id) return false;
        return Boolean(loadLocalDraft(record.consolidator_id));
    });

    // Editable orders list with draft hydration
    const [orders, setOrders] = useState<ConsolidatedSalesOrderRecord[]>(() => {
        const localDraft = !isReadOnly && record?.consolidator_id ? loadLocalDraft(record.consolidator_id) : null;

        return (record?.orders || []).map((ord) => {
            const savedOrder = localDraft?.orders?.find(
                (so) => so.order_id === ord.order_id || (ord.invoice_id && so.invoice_id === ord.invoice_id)
            );

            const hasReturnItems = (ord.items || []).some((i) => i.returned_quantity > 0);
            const isAllUnfulfilled =
                (ord.items || []).length > 0 &&
                (ord.items || []).every((i) => i.received_quantity === 0 && i.returned_quantity === i.ordered_quantity);

            let derivedStatus = ord.fulfillment_status;
            if (savedOrder?.fulfillment_status) {
                derivedStatus = savedOrder.fulfillment_status;
            } else if (ord.fulfillment_status && ord.fulfillment_status !== "Pending") {
                derivedStatus = ord.fulfillment_status;
            } else if (isAllUnfulfilled) {
                derivedStatus = "Unfulfilled / Returns";
            } else if (ord.linked_sales_return || hasReturnItems) {
                derivedStatus = "Fulfilled with Returns";
            } else {
                derivedStatus = computePreviewStatus(ord.items || []);
            }

            const savedLinkedReturn =
                savedOrder?.linked_sales_return !== undefined
                    ? savedOrder.linked_sales_return
                    : ord.linked_sales_return;

            const items = (ord.items || []).map((item) => {
                const savedItem = savedOrder?.items?.find(
                    (si) => si.detail_id === item.detail_id || (si.product_id === item.product_id && !si.detail_id)
                );
                if (savedItem) {
                    return {
                        ...item,
                        received_quantity:
                            typeof savedItem.received_quantity === "number"
                                ? savedItem.received_quantity
                                : item.received_quantity,
                        returned_quantity:
                            typeof savedItem.returned_quantity === "number"
                                ? savedItem.returned_quantity
                                : item.returned_quantity,
                        has_concern: Boolean(savedItem.has_concern),
                        concern_notes: savedItem.concern_notes || "",
                        line_status: savedItem.line_status || item.line_status,
                    };
                }
                return { ...item };
            });

            return {
                ...ord,
                remarks: savedOrder?.remarks !== undefined ? savedOrder.remarks : ord.remarks,
                fulfillment_status: savedOrder?.fulfillment_status || derivedStatus,
                linked_sales_return: savedLinkedReturn,
                items,
            };
        });
    });

    const [clearanceRemarks, setClearanceRemarks] = useState<string>(() => {
        if (!isReadOnly && record?.consolidator_id) {
            const localDraft = loadLocalDraft(record.consolidator_id);
            if (localDraft?.clearanceRemarks !== undefined) {
                return localDraft.clearanceRemarks;
            }
        }
        return "";
    });
    const [formError, setFormError] = useState<string | null>(null);
    const [orderSearch, setOrderSearch] = useState<string>("");
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);

    // Sync orders / linked_sales_return when record prop updates (e.g. after background or manual refresh)
    useEffect(() => {
        if (!record?.orders) return;
        const localDraft = !isReadOnly && record?.consolidator_id ? loadLocalDraft(record.consolidator_id) : null;
        if (localDraft) {
            setHasActiveDraft(true);
        }

        setOrders((prevOrders) => {
            return (record.orders || []).map((freshOrd) => {
                const existing = prevOrders.find((o) => o.invoice_id === freshOrd.invoice_id);
                const savedOrder = localDraft?.orders?.find(
                    (so) => so.order_id === freshOrd.order_id || (freshOrd.invoice_id && so.invoice_id === freshOrd.invoice_id)
                );

                const hasReturnItems = (freshOrd.items || []).some((i) => i.returned_quantity > 0);
                const isAllUnfulfilled =
                    (freshOrd.items || []).length > 0 &&
                    (freshOrd.items || []).every((i) => i.received_quantity === 0 && i.returned_quantity === i.ordered_quantity);

                let derivedStatus = freshOrd.fulfillment_status;
                if (savedOrder?.fulfillment_status) {
                    derivedStatus = savedOrder.fulfillment_status;
                } else if (freshOrd.fulfillment_status && freshOrd.fulfillment_status !== "Pending") {
                    derivedStatus = freshOrd.fulfillment_status;
                } else if (isAllUnfulfilled) {
                    derivedStatus = "Unfulfilled / Returns";
                } else if (freshOrd.linked_sales_return || hasReturnItems) {
                    derivedStatus = "Fulfilled with Returns";
                } else {
                    derivedStatus = computePreviewStatus(freshOrd.items || []);
                }

                const savedLinkedReturn =
                    savedOrder?.linked_sales_return !== undefined
                        ? savedOrder.linked_sales_return
                        : freshOrd.linked_sales_return;

                if (!existing) {
                    const items = (freshOrd.items || []).map((item) => {
                        const savedItem = savedOrder?.items?.find(
                            (si) => si.detail_id === item.detail_id || (si.product_id === item.product_id && !si.detail_id)
                        );
                        if (savedItem) {
                            return {
                                ...item,
                                received_quantity:
                                    typeof savedItem.received_quantity === "number"
                                        ? savedItem.received_quantity
                                        : item.received_quantity,
                                returned_quantity:
                                    typeof savedItem.returned_quantity === "number"
                                        ? savedItem.returned_quantity
                                        : item.returned_quantity,
                                has_concern: Boolean(savedItem.has_concern),
                                concern_notes: savedItem.concern_notes || "",
                                line_status: savedItem.line_status || item.line_status,
                            };
                        }
                        return { ...item };
                    });

                    return {
                        ...freshOrd,
                        remarks: savedOrder?.remarks !== undefined ? savedOrder.remarks : freshOrd.remarks,
                        fulfillment_status: savedOrder?.fulfillment_status || derivedStatus,
                        linked_sales_return: savedLinkedReturn,
                        items,
                    };
                }
                return {
                    ...existing,
                    linked_sales_return: existing.fulfillment_status === "Fulfilled with Returns" ? (existing.linked_sales_return || savedLinkedReturn || freshOrd.linked_sales_return) : null,
                    fulfillment_status: existing.fulfillment_status || derivedStatus,
                };
            });
        });
    }, [record, isReadOnly]);

    const handleRefresh = async () => {
        if (!onRefresh) return;
        setIsRefreshing(true);
        try {
            await onRefresh();
            toast.success("Sales Return status updated.");
        } catch {
            toast.error("Failed to refresh Sales Return status.");
        } finally {
            setIsRefreshing(false);
        }
    };

    // Selected order for child Product Reconciliation Modal (Modal 2)
    const [selectedOrderIndex, setSelectedOrderIndex] = useState<number | null>(null);

    // Filtered orders with original index tracking for searchbar
    const filteredOrdersWithIndex = useMemo(() => {
        return orders
            .map((ord, originalIndex) => ({ ord, originalIndex }))
            .filter(({ ord }) => {
                if (!orderSearch.trim()) return true;
                const query = orderSearch.toLowerCase().trim();
                const orderNo = (ord.order_no || "").toLowerCase();
                const invoiceNo = (ord.invoice_no || "").toLowerCase();
                const custName = (ord.customer_name || "").toLowerCase();
                const custCode = (ord.customer_code || "").toLowerCase();
                return (
                    orderNo.includes(query) ||
                    invoiceNo.includes(query) ||
                    custName.includes(query) ||
                    custCode.includes(query)
                );
            });
    }, [orders, orderSearch]);

    // Total units calculation across all orders
    const totalManifestUnits = useMemo(() => {
        return orders.reduce(
            (sum, ord) => sum + ord.items.reduce((acc, i) => acc + i.ordered_quantity, 0),
            0
        );
    }, [orders]);

    // Strictly only "Fulfilled with Returns" requires a Sales Return.
    // "Fulfilled", "Fulfilled with Concerns", and "Unfulfilled / Returns" do NOT require a Sales Return.
    const missingReturnOrders = useMemo(() => {
        return orders.filter((ord) => {
            if (ord.fulfillment_status !== "Fulfilled with Returns") return false;

            const sr = ord.linked_sales_return;

            // If no sales return is linked
            if (!sr) return true;

            // If a sales return is linked but still pending receiving / approved
            const isReceived = Boolean(
                sr.is_received || sr.status === "Received" || sr.status === "Approved"
            );
            if (!isReceived) return true;

            return false;
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
                        `Order ${ord.order_no} Line ${itemIdx + 1} (${item.product_name}): Fulfilled (${item.received_quantity}) + Returned (${item.returned_quantity}) must equal Ordered (${item.ordered_quantity}).`
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

    // Helper to redirect to Sales Return module for an order (edit existing or create new)
    const handleRedirectToSalesReturn = (ord: ConsolidatedSalesOrderRecord) => {
        const existingReturnNo = ord.linked_sales_return?.return_number;

        const params = new URLSearchParams({
            fromClearance: "true",
            invoiceNo: ord.invoice_no || "",
            orderNo: ord.order_no || "",
            customerCode: ord.customer_code || "",
        });
        if (ord.salesman_id) {
            params.set("salesmanId", String(ord.salesman_id));
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
                customerCode: ord.customer_code || "",
                customerName: ord.customer_name || "",
                invoiceNo: ord.invoice_no || "",
                orderNo: ord.order_no || "",
                salesmanId: ord.salesman_id ? String(ord.salesman_id) : "",
                salesmanCode: ord.salesman_code || "",
                salesmanName: ord.salesman_name || "",
                items: ord.items || [],
            };
            if (typeof window !== "undefined") {
                localStorage.setItem("scm_dispatch_return_data", JSON.stringify(payloadData));
            }
        }

        window.open(
            `/mm/sales-and-fulfillment/sales-return-manual?${params.toString()}`,
            "_blank"
        );
    };

    // Update order status preset at order row level
    const setOrderStatusPreset = (orderIndex: number, preset: LineStatus) => {
        setOrders((prev) => {
            const next = [...prev];
            const ord = next[orderIndex];

            let updatedItems = ord.items;
            if (preset === "Unfulfilled / Returns") {
                // All items returned to hub: received is 0, returned equals ordered quantity
                updatedItems = (ord.items || []).map((item) => ({
                    ...item,
                    received_quantity: 0,
                    returned_quantity: item.ordered_quantity,
                    has_concern: false,
                    line_status: "Unfulfilled / Returns" as LineStatus,
                }));
            } else if (preset === "Fulfilled") {
                updatedItems = (ord.items || []).map((item) => ({
                    ...item,
                    received_quantity: item.ordered_quantity,
                    returned_quantity: 0,
                    has_concern: false,
                    line_status: "Fulfilled" as LineStatus,
                }));
            } else if (preset === "Fulfilled with Concerns") {
                updatedItems = (ord.items || []).map((item) => ({
                    ...item,
                    received_quantity: item.ordered_quantity,
                    returned_quantity: 0,
                    has_concern: true,
                    line_status: "Fulfilled with Concerns" as LineStatus,
                }));
            } else if (preset === "Fulfilled with Returns") {
                updatedItems = (ord.items || []).map((item) => ({
                    ...item,
                    line_status: "Fulfilled with Returns" as LineStatus,
                }));
            }

            next[orderIndex] = {
                ...ord,
                fulfillment_status: preset as FulfillmentStatus,
                linked_sales_return: preset === "Fulfilled with Returns" ? ord.linked_sales_return : null,
                items: updatedItems,
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
            order_id: targetOrder?.order_id,
            order_no: targetOrder?.order_no,
            invoice_id: targetOrder?.invoice_id,
            invoice_no: targetOrder?.invoice_no,
            invoice_date: targetOrder?.invoice_date,
            customer_name: targetOrder?.customer_name,
            customer_code: targetOrder?.customer_code,
            salesman_name: targetOrder?.salesman_name,
            salesman_code: targetOrder?.salesman_code,
            fulfillment_status: targetOrder?.fulfillment_status,
            linked_sales_return: targetOrder?.linked_sales_return,
            items_count: targetOrder?.items?.length,
            raw_order_object: targetOrder,
        });
        setSelectedOrderIndex(index);
    };

    // Save product line items & linked return from Modal 2
    const handleSaveOrderItems = (
        updatedItems: ClearanceLineItem[],
        updatedLinkedReturn?: LinkedSalesReturn | null,
        updatedRemarks?: string
    ) => {
        if (selectedOrderIndex === null) return;
        console.log("[DeliveryClearanceModal] 💾 Reconciled items received from ProductReconciliationModal:", {
            orderIndex: selectedOrderIndex,
            order_no: orders[selectedOrderIndex]?.order_no,
            updatedItems,
            updatedLinkedReturn,
            updatedRemarks,
        });
        setOrders((prev) => {
            const next = [...prev];
            const ord = next[selectedOrderIndex];
            const linkedReturn = updatedLinkedReturn !== undefined ? updatedLinkedReturn : ord.linked_sales_return;
            const computed = computePreviewStatus(updatedItems);
            let newStatus = computed;
            if (linkedReturn || ord.fulfillment_status === "Fulfilled with Returns") {
                newStatus = computed === "Unfulfilled / Returns" ? "Unfulfilled / Returns" : "Fulfilled with Returns";
            }
            next[selectedOrderIndex] = {
                ...ord,
                remarks: updatedRemarks !== undefined ? updatedRemarks : ord.remarks,
                linked_sales_return: linkedReturn,
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
                `Orders with returns require a registered and received Sales Return before clearance can be confirmed.`
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
            is_draft: false,
            clearance_remarks: clearanceRemarks,
            orders: orders.map((ord) => ({
                order_id: ord.order_id,
                invoice_id: ord.invoice_id,
                clearance_remarks: ord.remarks,
                linked_return_id: ord.linked_sales_return?.return_id || null,
                linked_return_number: ord.linked_sales_return?.return_number || null,
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

        const success = await onSubmit(payload);
        if (success) {
            if (typeof window !== "undefined") {
                localStorage.removeItem(`scm_delivery_clearance_draft_${record.consolidator_id}`);
            }
            setHasActiveDraft(false);
        }
    };

    const handleSaveProgress = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!record) return;

        setIsSavingDraft(true);
        setFormError(null);

        try {
            // 1. Save to local storage for guaranteed persistence across browser refresh
            const draftPayload: SavedDeliveryDraft = {
                consolidator_id: record.consolidator_id,
                clearanceRemarks,
                timestamp: new Date().toISOString(),
                orders: orders.map((ord) => ({
                    order_id: ord.order_id,
                    invoice_id: ord.invoice_id,
                    remarks: ord.remarks,
                    fulfillment_status: ord.fulfillment_status,
                    linked_sales_return: ord.linked_sales_return || null,
                    items: ord.items.map((item) => ({
                        detail_id: item.detail_id,
                        product_id: item.product_id,
                        received_quantity: item.received_quantity,
                        returned_quantity: item.returned_quantity,
                        has_concern: item.has_concern,
                        concern_notes: item.concern_notes,
                        line_status: item.line_status,
                    })),
                })),
            };

            if (typeof window !== "undefined") {
                localStorage.setItem(
                    `scm_delivery_clearance_draft_${record.consolidator_id}`,
                    JSON.stringify(draftPayload)
                );
            }
            setHasActiveDraft(true);

            // 2. Dispatch to server
            const payload: ConsolidatedClearanceSubmissionPayload = {
                consolidator_id: record.consolidator_id,
                is_draft: true,
                clearance_remarks: clearanceRemarks,
                orders: orders.map((ord) => ({
                    order_id: ord.order_id,
                    invoice_id: ord.invoice_id,
                    clearance_remarks: ord.remarks,
                    linked_return_id: ord.linked_sales_return?.return_id || null,
                    linked_return_number: ord.linked_sales_return?.return_number || null,
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
        } catch (err) {
            console.error("[DeliveryClearanceModal] Error saving draft progress:", err);
        } finally {
            setIsSavingDraft(false);
        }
    };

    const handleResetDraft = () => {
        if (typeof window !== "undefined" && record?.consolidator_id) {
            localStorage.removeItem(`scm_delivery_clearance_draft_${record.consolidator_id}`);
        }
        setHasActiveDraft(false);
        setClearanceRemarks("");
        setOrders(
            (record?.orders || []).map((ord) => {
                const hasReturnItems = (ord.items || []).some((i) => i.returned_quantity > 0);
                const isAllUnfulfilled =
                    (ord.items || []).length > 0 &&
                    (ord.items || []).every(
                        (i) => i.received_quantity === 0 && i.returned_quantity === i.ordered_quantity
                    );

                let derivedStatus = ord.fulfillment_status;
                if (ord.fulfillment_status && ord.fulfillment_status !== "Pending") {
                    derivedStatus = ord.fulfillment_status;
                } else if (isAllUnfulfilled) {
                    derivedStatus = "Unfulfilled / Returns";
                } else if (ord.linked_sales_return || hasReturnItems) {
                    derivedStatus = "Fulfilled with Returns";
                } else {
                    derivedStatus = computePreviewStatus(ord.items || []);
                }

                return {
                    ...ord,
                    fulfillment_status: derivedStatus,
                    linked_sales_return: derivedStatus === "Fulfilled with Returns" ? ord.linked_sales_return : null,
                    items: (ord.items || []).map((item) => ({ ...item })),
                };
            })
        );
        toast.info("Draft reset to original manifest values.");
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
                                        {isReadOnly ? (
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
                                                Cleared & Locked
                                            </span>
                                        ) : hasActiveDraft ? (
                                            <div className="flex items-center gap-2">
                                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center gap-1">
                                                    <Save className="h-3 w-3" />
                                                    Draft In Progress
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={handleResetDraft}
                                                    className="text-[10px] font-bold text-muted-foreground hover:text-rose-600 underline cursor-pointer"
                                                >
                                                    Reset Draft
                                                </button>
                                            </div>
                                        ) : null}
                                    </div>
                                   
                                </div>
                            </div>

                            {/* Close & Action Buttons */}
                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                               
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
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-amber-800 dark:text-amber-200 font-bold">
                                        <div className="flex items-center gap-2">
                                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                                            <span>Sales Return Required / Pending Receiving for {missingReturnOrders.length} Order(s) Before Confirming:</span>
                                        </div>
                                        {onRefresh && (
                                            <button
                                                type="button"
                                                onClick={handleRefresh}
                                                disabled={isRefreshing}
                                                className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-900 dark:text-amber-100 font-bold text-xs transition-all flex items-center gap-1.5 shrink-0 cursor-pointer self-start sm:self-auto disabled:opacity-50"
                                            >
                                                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin text-amber-600 dark:text-amber-400" : ""}`} />
                                                <span>{isRefreshing ? "Checking..." : "Refresh Sales Return Status"}</span>
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-1.5 pl-6">
                                        {missingReturnOrders.map((mo) => {
                                            const sr = mo.linked_sales_return;
                                            const isPendingSr = Boolean(sr && !sr.is_received && sr.status !== "Received" && sr.status !== "Approved");

                                            return (
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
                                                        {isPendingSr ? (
                                                            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500/20 text-rose-700 dark:text-rose-300">
                                                                SR: {sr?.return_number} (Pending Receiving)
                                                            </span>
                                                        ) : (
                                                            <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-500/20 text-rose-700 dark:text-rose-300">
                                                                No Sales Return
                                                            </span>
                                                        )}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRedirectToSalesReturn(mo)}
                                                        className="px-3 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition-all flex items-center gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer shadow-xs"
                                                    >
                                                        <ExternalLink className="h-3 w-3" />
                                                        {isPendingSr ? "View Sales Return" : "Create Sales Return"}
                                                    </button>
                                                </div>
                                            );
                                        })}
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
                                <div className="px-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-black text-foreground tracking-tight">
                                            Sales Order Reconciliation Table
                                        </h3>
                                        <p className="text-xs font-semibold text-rose-500 dark:text-rose-400 pt-0.5">
                                            Click any order row to reconcile individual product lines and returned quantities.
                                        </p>
                                    </div>

                                    {/* Searchbar for order no, invoice no, or customer */}
                                    <div className="relative w-full sm:w-72 shrink-0">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                        <input
                                            type="text"
                                            placeholder="Search order no, invoice no, customer..."
                                            value={orderSearch}
                                            onChange={(e) => setOrderSearch(e.target.value)}
                                            className="w-full h-8.5 pl-9 pr-8 text-xs bg-background border border-input rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-all shadow-xs"
                                        />
                                        {orderSearch && (
                                            <button
                                                type="button"
                                                onClick={() => setOrderSearch("")}
                                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        )}
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
                                                    <th className="p-3.5 min-w-[140px]">Linked Return</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y">
                                                {filteredOrdersWithIndex.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={7} className="p-8 text-center text-muted-foreground text-xs font-semibold">
                                                            No sales orders matching "{orderSearch}" found.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredOrdersWithIndex.map(({ ord, originalIndex }) => {
                                                        const currentStatus = ord.fulfillment_status || "Fulfilled";

                                                        return (
                                                            <tr
                                                                key={ord.invoice_id || originalIndex}
                                                                onClick={() => handleOpenReconciliation(originalIndex)}
                                                                className="hover:bg-muted/15 cursor-pointer transition-colors group"
                                                            >
                                                                {/* Status Selector */}
                                                                <td className="p-3.5 align-middle" onClick={(e) => e.stopPropagation()}>
                                                                    {isReadOnly ? (
                                                                        <span
                                                                            className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                                                                                currentStatus === "Fulfilled"
                                                                                    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                                                                    : currentStatus === "Fulfilled with Concerns" || currentStatus === "Fulfilled with Returns"
                                                                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                                                                    : currentStatus === "Unfulfilled / Returns"
                                                                                    ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
                                                                                    : "bg-muted text-muted-foreground border-border"
                                                                            }`}
                                                                        >
                                                                            {currentStatus}
                                                                        </span>
                                                                    ) : (
                                                                        <Select
                                                                            value={currentStatus}
                                                                            onValueChange={(val) =>
                                                                                setOrderStatusPreset(originalIndex, val as LineStatus)
                                                                            }
                                                                        >
                                                                            <SelectTrigger
                                                                                className={`w-full h-8 text-[11px] font-bold rounded-lg transition-all ${
                                                                                    currentStatus === "Fulfilled"
                                                                                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                                                                        : currentStatus === "Fulfilled with Concerns"
                                                                                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                                                                        : currentStatus === "Fulfilled with Returns"
                                                                                        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                                                                        : currentStatus === "Unfulfilled / Returns"
                                                                                        ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
                                                                                        : "bg-background text-foreground border-input"
                                                                                }`}
                                                                            >
                                                                                <SelectValue placeholder="Status" />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                {ord.linked_sales_return ? (
                                                                                    <>
                                                                                        <SelectItem value="Fulfilled with Returns" className="text-amber-700 dark:text-amber-300 font-bold text-xs">Fulfilled with Returns</SelectItem>
                                                                                        <SelectItem value="Unfulfilled / Returns" className="text-rose-700 dark:text-rose-300 font-bold text-xs">Unfulfilled / Returns</SelectItem>
                                                                                    </>
                                                                                ) : (
                                                                                    <>
                                                                                        <SelectItem value="Fulfilled" className="text-emerald-700 dark:text-emerald-300 font-bold text-xs">Fulfilled</SelectItem>
                                                                                        <SelectItem value="Fulfilled with Concerns" className="text-amber-700 dark:text-amber-300 font-bold text-xs">Fulfilled with Concerns</SelectItem>
                                                                                        <SelectItem value="Fulfilled with Returns" className="text-amber-700 dark:text-amber-300 font-bold text-xs">Fulfilled with Returns</SelectItem>
                                                                                        <SelectItem value="Unfulfilled / Returns" className="text-rose-700 dark:text-rose-300 font-bold text-xs">Unfulfilled / Returns</SelectItem>
                                                                                    </>
                                                                                )}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    )}
                                                                </td>

                                                                {/* Order No */}
                                                                <td className="p-3.5 align-middle font-bold text-foreground">
                                                                    <span className="group-hover:text-primary transition-colors block">
                                                                        {ord.order_no}
                                                                    </span>
                                                                </td>

                                                                {/* Invoice No */}
                                                                <td className="p-3.5 align-middle">
                                                                    {ord.invoice_no && ord.invoice_no !== "---" ? (
                                                                        <span className="font-mono text-xs font-black text-primary block truncate max-w-[130px]" title={ord.invoice_no}>
                                                                            {ord.invoice_no}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-muted-foreground font-mono text-xs font-bold">---</span>
                                                                    )}
                                                                </td>

                                                                {/* Invoice Date */}
                                                                <td className="p-3.5 align-middle text-muted-foreground">
                                                                    {ord.invoice_date && ord.invoice_date !== "---" && !isNaN(new Date(ord.invoice_date).getTime()) ? (
                                                                        new Date(ord.invoice_date).toLocaleDateString(undefined, {
                                                                            month: "short",
                                                                            day: "numeric",
                                                                            year: "numeric",
                                                                        })
                                                                    ) : (
                                                                        <span className="text-muted-foreground font-mono text-xs">---</span>
                                                                    )}
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

                                                                {/* Linked Return */}
                                                                <td className="p-3.5 align-middle" onClick={(e) => e.stopPropagation()}>
                                                                    {ord.linked_sales_return ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleRedirectToSalesReturn(ord);
                                                                            }}
                                                                            title="Click to view/edit Sales Return"
                                                                            className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-md border cursor-pointer hover:opacity-80 transition-opacity ${
                                                                                ord.linked_sales_return.status === "Received" ||
                                                                                ord.linked_sales_return.status === "Approved" ||
                                                                                ord.linked_sales_return.is_received
                                                                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                                                                    : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                                                                            }`}
                                                                        >
                                                                            {ord.linked_sales_return.status === "Received" ||
                                                                            ord.linked_sales_return.status === "Approved" ||
                                                                            ord.linked_sales_return.is_received ? (
                                                                                <CheckCircle2 className="h-3 w-3" />
                                                                            ) : (
                                                                                <AlertCircle className="h-3 w-3" />
                                                                            )}
                                                                            SR: {ord.linked_sales_return.return_number} ({ord.linked_sales_return.status || "Pending"})
                                                                            <ExternalLink className="h-2.5 w-2.5 ml-0.5 opacity-70" />
                                                                        </button>
                                                                    ) : (
                                                                        <span className="text-muted-foreground font-mono text-xs">---</span>
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
                                            onClick={handleSaveProgress}
                                            disabled={isSubmitting || isSavingDraft}
                                            className="px-5 py-2.5 rounded-xl border border-input bg-background hover:bg-muted text-foreground text-xs font-bold shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Save current inputs as draft without finalizing ledger clearance"
                                        >
                                            {isSavingDraft ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                    Saving Draft...
                                                </>
                                            ) : (
                                                <>
                                                    <Save className="h-4 w-4 text-muted-foreground" />
                                                    Save Progress
                                                </>
                                            )}
                                        </button>

                                        <button
                                            type="submit"
                                            disabled={!isValid || isSubmitting || isSavingDraft}
                                            title={
                                                isMissingRequiredReturn
                                                    ? "Orders with returns require a registered Sales Return before clearance can be confirmed."
                                                    : undefined
                                            }
                                            className={`px-6 py-2.5 rounded-xl text-xs font-black shadow-xs transition-all flex items-center gap-2 ${
                                                isValid && !isSubmitting && !isSavingDraft
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
                    key={`${currentOrderForModal2.order_id}-${currentOrderForModal2.invoice_id}-${selectedOrderIndex}`}
                    order={currentOrderForModal2}
                    isOpen={selectedOrderIndex !== null}
                    isReadOnly={isReadOnly}
                    onClose={() => setSelectedOrderIndex(null)}
                    onSave={handleSaveOrderItems}
                    onRefresh={onRefresh}
                />
            )}
        </>
    );
}
