import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
    fetchJobOrderDailyYieldDetails,
    fetchJobOrderDailyYieldSummaries,
    moveSalesOrderToConsolidation,
} from "../services/job-order-inspection-qa-api";
import type {
    JobOrderDailyYieldDetails,
    JobOrderDailyYieldSummary,
} from "../types";

export function useJobOrderInspectionQA() {
    const [jobOrders, setJobOrders] = useState<JobOrderDailyYieldSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedJobOrder, setSelectedJobOrder] = useState<JobOrderDailyYieldSummary | null>(null);
    const [selectedDetails, setSelectedDetails] = useState<JobOrderDailyYieldDetails | null>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsError, setDetailsError] = useState<string | null>(null);
    const [consolidatingOrderId, setConsolidatingOrderId] = useState<number | null>(null);

    const loadJobOrders = useCallback(async (signal?: AbortSignal) => {
        setLoading(true);
        setError(null);
        try {
            setJobOrders(await fetchJobOrderDailyYieldSummaries(signal));
        } catch (loadError) {
            if (signal?.aborted) return;
            const message = loadError instanceof Error ? loadError.message : "Failed to load JO Daily Yields.";
            setError(message);
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, []);

    const loadDetails = useCallback(async (jobOrderId: number, signal?: AbortSignal) => {
        setDetailsLoading(true);
        setDetailsError(null);
        try {
            setSelectedDetails(await fetchJobOrderDailyYieldDetails(jobOrderId, signal));
        } catch (loadError) {
            if (signal?.aborted) return;
            const message = loadError instanceof Error ? loadError.message : "Failed to load Job Order details.";
            setSelectedDetails(null);
            setDetailsError(message);
        } finally {
            if (!signal?.aborted) setDetailsLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void loadJobOrders(controller.signal);
        return () => controller.abort();
    }, [loadJobOrders]);

    useEffect(() => {
        if (!selectedJobOrder) {
            setSelectedDetails(null);
            setDetailsError(null);
            return;
        }

        const controller = new AbortController();
        void loadDetails(selectedJobOrder.jobOrderId, controller.signal);
        return () => controller.abort();
    }, [loadDetails, selectedJobOrder]);

    const openDetails = useCallback((jobOrder: JobOrderDailyYieldSummary) => {
        setSelectedDetails(null);
        setDetailsError(null);
        setSelectedJobOrder(jobOrder);
    }, []);

    const closeDetails = useCallback(() => {
        setSelectedJobOrder(null);
        setSelectedDetails(null);
        setDetailsError(null);
    }, []);

    const refresh = useCallback(async () => {
        await loadJobOrders();
        if (selectedJobOrder) {
            await loadDetails(selectedJobOrder.jobOrderId);
        }
    }, [loadDetails, loadJobOrders, selectedJobOrder]);

    const handleMoveToConsolidation = useCallback(async (orderId: number) => {
        setConsolidatingOrderId(orderId);
        try {
            await moveSalesOrderToConsolidation(orderId);
            toast.success("Sales Order moved to For Consolidation.");
            await refresh();
        } catch (actionError) {
            const message = actionError instanceof Error
                ? actionError.message
                : "Failed to move the Sales Order to For Consolidation.";
            toast.error(message);
        } finally {
            setConsolidatingOrderId(null);
        }
    }, [refresh]);

    return {
        jobOrders,
        loading,
        error,
        selectedJobOrder,
        selectedDetails,
        detailsLoading,
        detailsError,
        consolidatingOrderId,
        openDetails,
        closeDetails,
        refresh,
        handleMoveToConsolidation,
    };
}
