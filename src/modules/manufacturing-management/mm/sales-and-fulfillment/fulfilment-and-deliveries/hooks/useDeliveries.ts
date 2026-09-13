// src/modules/manufacturing-management/mm/sales-and-fulfillment/fulfilment-and-deliveries/hooks/useDeliveries.ts

"use client";

import { useState, useEffect, useCallback } from "react";
import {
    DeliveryClearanceRecord,
    ClearanceMetrics,
    Branch,
    ClearanceSubmissionPayload,
    FulfillmentStatus,
} from "../types";
import {
    fetchDeliveryClearanceList,
    submitDeliveryClearance,
} from "../services/deliveries-api";
import { toast } from "sonner";

export function computePreviewStatus(
    items: {
        ordered_quantity: number;
        received_quantity: number;
        returned_quantity: number;
        has_concern?: boolean;
        concern_notes?: string;
    }[]
): FulfillmentStatus {
    const totalOrdered = items.reduce((sum, i) => sum + Number(i.ordered_quantity || 0), 0);
    const totalReceived = items.reduce((sum, i) => sum + Number(i.received_quantity || 0), 0);
    const totalReturned = items.reduce((sum, i) => sum + Number(i.returned_quantity || 0), 0);

    const hasConcerns = items.some((i) => i.has_concern || (i.concern_notes && i.concern_notes.trim().length > 0));

    if (totalReceived === 0 && totalReturned === totalOrdered) {
        return "Unfulfilled / Returns";
    }
    if (totalReceived > 0 && totalReturned > 0) {
        return "Fulfilled with Returns";
    }
    if (totalReceived === totalOrdered && totalReturned === 0) {
        return hasConcerns ? "Fulfilled with Concerns" : "Fulfilled";
    }
    if (totalReceived === 0 && totalReturned === 0) {
        return "Pending";
    }
    if (totalReturned > 0) {
        return "Fulfilled with Returns";
    }
    return hasConcerns ? "Fulfilled with Concerns" : "Pending";
}

export function useDeliveries() {
    const [records, setRecords] = useState<DeliveryClearanceRecord[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const [metrics, setMetrics] = useState<ClearanceMetrics>({
        total_dispatched: 0,
        pending_clearance: 0,
        fulfilled_count: 0,
        concerns_and_returns_count: 0,
    });

    const [branches, setBranches] = useState<Branch[]>([]);
    const [selectedBranchId, setSelectedBranchId] = useState<string>("All");
    const [statusFilter, setStatusFilter] = useState<string>("All");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [page, setPage] = useState<number>(0);
    const [size, setSize] = useState<number>(10);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [totalElements, setTotalElements] = useState<number>(0);

    // Modal state for delivery clearance reconciliation
    const [selectedRecordForClearance, setSelectedRecordForClearance] = useState<DeliveryClearanceRecord | null>(null);
    const [isClearanceModalOpen, setIsClearanceModalOpen] = useState<boolean>(false);
    const [submitting, setSubmitting] = useState<boolean>(false);

    useEffect(() => {
        let ignore = false;

        async function fetchClearance() {
            setLoading(true);
            setError(null);
            try {
                const data = await fetchDeliveryClearanceList({
                    page,
                    size,
                    search: searchQuery,
                    status: statusFilter,
                    branchId: selectedBranchId,
                });

                if (!ignore) {
                    setRecords(data.content || []);
                    setTotalElements(data.totalElements || 0);
                    setTotalPages(data.totalPages || 1);
                    if (data.metrics) {
                        setMetrics(data.metrics);
                    }
                    if (data.branches && data.branches.length > 0) {
                        setBranches(data.branches);
                    }
                }
            } catch (err) {
                if (!ignore) {
                    const msg = err instanceof Error ? err.message : "Failed to load delivery clearance data.";
                    setError(msg);
                    toast.error(msg);
                }
            } finally {
                if (!ignore) {
                    setLoading(false);
                }
            }
        }

        fetchClearance();

        return () => {
            ignore = true;
        };
    }, [page, size, searchQuery, statusFilter, selectedBranchId]);

    const openClearanceModal = (record: DeliveryClearanceRecord) => {
        setSelectedRecordForClearance(record);
        setIsClearanceModalOpen(true);
    };

    const closeClearanceModal = () => {
        setSelectedRecordForClearance(null);
        setIsClearanceModalOpen(false);
    };

    const reload = useCallback(async () => {
        try {
            const data = await fetchDeliveryClearanceList({
                page,
                size,
                search: searchQuery,
                status: statusFilter,
                branchId: selectedBranchId,
            });

            setRecords(data.content || []);
            setTotalElements(data.totalElements || 0);
            setTotalPages(data.totalPages || 1);
            if (data.metrics) setMetrics(data.metrics);
            if (data.branches && data.branches.length > 0) setBranches(data.branches);

            setSelectedRecordForClearance((prev) => {
                if (!prev) return null;
                const fresh = (data.content || []).find((r) => r.consolidator_id === prev.consolidator_id);
                return fresh || prev;
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to load delivery clearance data.";
            setError(msg);
            toast.error(msg);
        }
    }, [page, size, searchQuery, statusFilter, selectedBranchId]);

    const handleClearanceSubmit = async (payload: ClearanceSubmissionPayload): Promise<boolean> => {
        // Client-side validation guard on confirming clearance
        if (!payload.is_draft) {
            for (const ord of payload.orders || []) {
                const status = ord.fulfillment_status || "";
                const hasConcern =
                    status === "Fulfilled with Concerns" ||
                    (ord.items || []).some((i) => i.has_concern || (i.concern_notes && i.concern_notes.trim().length > 0));
                const hasReturn =
                    status === "Fulfilled with Returns" ||
                    (ord.items || []).some((i) => i.returned_quantity > 0);
                const isUnfulfilled = status === "Unfulfilled / Returns";
                const hasVariance = (ord.items || []).some(
                    (i) => i.ordered_quantity !== undefined && Number(i.ordered_quantity) !== Number(i.received_quantity || 0) + Number(i.returned_quantity || 0)
                );

                const remarks = typeof ord.clearance_remarks === "string" ? ord.clearance_remarks.trim() : "";
                const orderRef = ord.order_no || `#${ord.order_id || ord.invoice_id}`;

                if (isUnfulfilled && !remarks) {
                    toast.error(
                        `Remarks are required for order ${orderRef} (Unfulfilled / Returns) before clearance can be confirmed.`
                    );
                    return false;
                }

                if (hasConcern && !remarks) {
                    toast.error(
                        `Remarks are required for order ${orderRef} (Fulfilled with Concerns) before clearance can be confirmed.`
                    );
                    return false;
                }

                if (hasReturn && !remarks) {
                    toast.error(
                        `Remarks are required for order ${orderRef} (Fulfilled with Returns) before clearance can be confirmed.`
                    );
                    return false;
                }

                if (hasVariance && !remarks) {
                    toast.error(
                        `Remarks are required for order ${orderRef} due to quantity variance before clearance can be confirmed.`
                    );
                    return false;
                }
            }
        }

        setSubmitting(true);
        try {
            const result = await submitDeliveryClearance(payload);
            toast.success(result.message || (payload.is_draft ? "Draft progress saved successfully." : "Clearance posted successfully."));
            if (!payload.is_draft) {
                closeClearanceModal();
            }
            reload();
            return true;
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to submit clearance.";
            toast.error(msg);
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const handleConfirmClearance = handleClearanceSubmit;

    return {
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
        page,
        setPage,
        size,
        setSize,
        totalPages,
        totalElements,
        selectedRecordForClearance,
        isClearanceModalOpen,
        submitting,
        openClearanceModal,
        closeClearanceModal,
        handleClearanceSubmit,
        handleConfirmClearance,
        reload,
    };
}
