import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import {
    closeJobOrder,
    fetchJobOrderDailyYieldDetails,
    fetchJobOrderDailyYieldSummaries,
} from "../services/job-order-inspection-qa-api";
import type {
    JobOrderDailyYieldDetails,
    JobOrderDailyYieldSummary,
} from "../types";
import { phtDateBoundaryToEpoch, phtTimestampToEpoch } from "../../shared/pht-date";

function phtDateKey(value: Date): string {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(value);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
}

export function useJobOrderInspectionQA() {
    const [jobOrders, setJobOrders] = useState<JobOrderDailyYieldSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedJobOrder, setSelectedJobOrder] = useState<JobOrderDailyYieldSummary | null>(null);
    const [selectedDetails, setSelectedDetails] = useState<JobOrderDailyYieldDetails | null>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsError, setDetailsError] = useState<string | null>(null);
    const [closingJobOrderId, setClosingJobOrderId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilterState] = useState("");
    const [productFilter, setProductFilterState] = useState("");
    const [dateRange, setDateRangeState] = useState<DateRange | undefined>(undefined);
    const [flaggedOnly, setFlaggedOnlyState] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSizeState] = useState(8);
    const closeIdempotencyKeys = useRef(new Map<number, string>());
    const handledDeepLink = useRef<string | null>(null);

    const statusOptions = useMemo(() => (
        [...new Set(jobOrders.map((jobOrder) => jobOrder.status).filter(Boolean))]
            .sort((left, right) => left.localeCompare(right))
    ), [jobOrders]);

    const productOptions = useMemo(() => {
        const options = new Map<string, string>();
        jobOrders.forEach((jobOrder) => {
            const value = jobOrder.productId ? String(jobOrder.productId) : `name:${jobOrder.productName}`;
            options.set(value, jobOrder.productName);
        });
        return [...options.entries()]
            .map(([value, label]) => ({ value, label }))
            .sort((left, right) => left.label.localeCompare(right.label));
    }, [jobOrders]);

    const filteredJobOrders = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        const startEpoch = dateRange?.from
            ? phtDateBoundaryToEpoch(phtDateKey(dateRange.from))
            : null;
        const endEpoch = dateRange?.to
            ? phtDateBoundaryToEpoch(phtDateKey(dateRange.to), true)
            : null;

        return jobOrders.filter((jobOrder) => {
            const matchesSearch = !query
                || jobOrder.jobOrderNo.toLowerCase().includes(query)
                || jobOrder.productName.toLowerCase().includes(query)
                || Boolean(jobOrder.productCode?.toLowerCase().includes(query));
            const matchesStatus = !statusFilter || jobOrder.status === statusFilter;
            const productKey = jobOrder.productId ? String(jobOrder.productId) : `name:${jobOrder.productName}`;
            const matchesProduct = !productFilter || productKey === productFilter;
            const latestYieldEpoch = phtTimestampToEpoch(jobOrder.latestYieldAt);
            const matchesDate = (!startEpoch || latestYieldEpoch >= startEpoch)
                && (!endEpoch || latestYieldEpoch <= endEpoch);
            const matchesFlagged = !flaggedOnly || jobOrder.unresolvedYieldCount > 0;

            return matchesSearch && matchesStatus && matchesProduct && matchesDate && matchesFlagged;
        });
    }, [dateRange, flaggedOnly, jobOrders, productFilter, searchQuery, statusFilter]);

    const totalPages = Math.max(1, Math.ceil(filteredJobOrders.length / pageSize));
    const visibleJobOrders = useMemo(() => {
        const start = (page - 1) * pageSize;
        return filteredJobOrders.slice(start, start + pageSize);
    }, [filteredJobOrders, page, pageSize]);

    useEffect(() => {
        setPage((current) => Math.min(current, totalPages));
    }, [totalPages]);

    const updateSearchQuery = useCallback((value: string) => {
        setSearchQuery(value);
        setPage(1);
    }, []);

    const setStatusFilter = useCallback((value: string) => {
        setStatusFilterState(value);
        setPage(1);
    }, []);

    const setProductFilter = useCallback((value: string) => {
        setProductFilterState(value);
        setPage(1);
    }, []);

    const setDateRange = useCallback((value: DateRange | undefined) => {
        setDateRangeState(value);
        setPage(1);
    }, []);

    const setFlaggedOnly = useCallback((value: boolean) => {
        setFlaggedOnlyState(value);
        setPage(1);
    }, []);

    const setPageSize = useCallback((value: number) => {
        setPageSizeState(value);
        setPage(1);
    }, []);

    const clearFilters = useCallback(() => {
        setSearchQuery("");
        setStatusFilterState("");
        setProductFilterState("");
        setDateRangeState(undefined);
        setFlaggedOnlyState(false);
        setPage(1);
    }, []);

    const hasActiveFilters = Boolean(
        searchQuery.trim()
        || statusFilter
        || productFilter
        || dateRange?.from
        || dateRange?.to
        || flaggedOnly
    );

    const unresolvedJobOrderCount = useMemo(
        () => jobOrders.filter((jobOrder) => jobOrder.unresolvedYieldCount > 0).length,
        [jobOrders]
    );

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
        filteredJobOrders,
        visibleJobOrders,
        statusOptions,
        productOptions,
        statusFilter,
        setStatusFilter,
        productFilter,
        setProductFilter,
        dateRange,
        setDateRange,
        flaggedOnly,
        setFlaggedOnly,
        unresolvedJobOrderCount,
        hasActiveFilters,
        clearFilters,
        page,
        setPage,
        pageSize,
        setPageSize,
        totalPages,
        searchQuery,
        setSearchQuery: updateSearchQuery,
        loading,
        error,
        selectedJobOrder,
        selectedDetails,
        detailsLoading,
        detailsError,
        closingJobOrderId,
        openDetails,
        closeDetails,
        refresh,
        handleCloseJobOrder,
    };
}
