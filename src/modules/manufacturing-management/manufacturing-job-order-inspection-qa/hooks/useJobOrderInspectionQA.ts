import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
    closeJobOrder,
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
    const [closingJobOrderId, setClosingJobOrderId] = useState<number | null>(null);
    const closeIdempotencyKeys = useRef(new Map<number, string>());
    const handledDeepLink = useRef<string | null>(null);

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

    useEffect(() => {
        if (loading || typeof window === "undefined") return;

        const requestedJobOrder = String(new URLSearchParams(window.location.search).get("jo") || "").trim();
        if (!requestedJobOrder || handledDeepLink.current === requestedJobOrder) return;

        handledDeepLink.current = requestedJobOrder;
        const match = jobOrders.find((jobOrder) =>
            jobOrder.jobOrderNo.trim().toLowerCase() === requestedJobOrder.toLowerCase()
        );

        if (match) {
            openDetails(match);
        } else {
            toast.error(`Job Order ${requestedJobOrder} was not found in JO Daily Yields.`);
        }
    }, [jobOrders, loading, openDetails]);

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

    const handleCloseJobOrder = useCallback(async (jobOrderId: number) => {
        setClosingJobOrderId(jobOrderId);
        const idempotencyKey = closeIdempotencyKeys.current.get(jobOrderId)
            || `jo-close:${jobOrderId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
        closeIdempotencyKeys.current.set(jobOrderId, idempotencyKey);

        try {
            const result = await closeJobOrder(jobOrderId, idempotencyKey);
            setJobOrders((current) => current.map((jobOrder) => jobOrder.jobOrderId === jobOrderId
                ? { ...jobOrder, status: result.status }
                : jobOrder));
            setSelectedJobOrder((current) => current?.jobOrderId === jobOrderId
                ? { ...current, status: result.status }
                : current);
            setSelectedDetails((current) => current?.jobOrderId === jobOrderId
                ? { ...current, status: result.status }
                : current);
            toast.success(`Job Order ${jobOrderId} is now Closed.`);
            await refresh();
        } catch (actionError) {
            const message = actionError instanceof Error
                ? actionError.message
                : "Failed to close the Job Order.";
            toast.error(message);
        } finally {
            setClosingJobOrderId(null);
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
        closingJobOrderId,
        openDetails,
        closeDetails,
        refresh,
        handleMoveToConsolidation,
        handleCloseJobOrder,
    };
}
