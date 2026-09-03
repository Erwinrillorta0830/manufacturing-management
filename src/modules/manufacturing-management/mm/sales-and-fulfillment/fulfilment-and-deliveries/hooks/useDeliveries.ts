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
        has_concern: boolean;
        concern_notes?: string;
    }[]
): FulfillmentStatus {
    const totalOrdered = items.reduce((sum, i) => sum + Number(i.ordered_quantity || 0), 0);
    const totalReceived = items.reduce((sum, i) => sum + Number(i.received_quantity || 0), 0);
    const totalReturned = items.reduce((sum, i) => sum + Number(i.returned_quantity || 0), 0);
    const hasAnyConcern = items.some((i) => Boolean(i.has_concern));

    if (totalReceived === 0 && totalReturned === totalOrdered) {
        return "Unfulfilled";
    }
    if (totalReceived > 0 && totalReturned > 0) {
        return "Fulfilled with Returns";
    }
    if (totalReturned === 0 && totalReceived === totalOrdered && hasAnyConcern) {
        return "Fulfilled with Concern";
    }
    if (totalReceived === totalOrdered && totalReturned === 0 && !hasAnyConcern) {
        return "Fulfilled";
    }
    if (totalReceived === 0 && totalReturned === 0) {
        return "Pending";
    }
    if (totalReturned > 0) {
        return "Fulfilled with Returns";
    }
    return "Pending";
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
    const [size] = useState<number>(50);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [totalElements, setTotalElements] = useState<number>(0);
    const [reloadTick, setReloadTick] = useState<number>(0);

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
    }, [page, size, searchQuery, statusFilter, selectedBranchId, reloadTick]);

    const openClearanceModal = (record: DeliveryClearanceRecord) => {
        setSelectedRecordForClearance(record);
        setIsClearanceModalOpen(true);
    };

    const closeClearanceModal = () => {
        setSelectedRecordForClearance(null);
        setIsClearanceModalOpen(false);
    };

    const reload = useCallback(() => {
        setReloadTick((prev) => prev + 1);
    }, []);

    const handleClearanceSubmit = async (payload: ClearanceSubmissionPayload): Promise<boolean> => {
        setSubmitting(true);
        try {
            const result = await submitDeliveryClearance(payload);
            toast.success(result.message || "Clearance posted successfully.");
            closeClearanceModal();
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
        totalPages,
        totalElements,
        selectedRecordForClearance,
        isClearanceModalOpen,
        submitting,
        openClearanceModal,
        closeClearanceModal,
        handleClearanceSubmit,
        reload,
    };
}
