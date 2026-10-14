import { useCallback, useEffect, useRef, useState } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import {
    closeJobOrder,
    fetchJobOrderDailyYieldDetails,
    fetchJobOrderDailyYieldSummaries,
    fetchJobOrderDailyYieldSummaryByNumber,
} from "../services/job-order-inspection-qa-api";
import type {
    JobOrderDailyYieldDetails,
    JobOrderDailyYieldSummary,
} from "../types";

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
    const [totalAvailable, setTotalAvailable] = useState(0);
    const [filteredTotal, setFilteredTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [statusOptions, setStatusOptions] = useState<string[]>([]);
    const [productOptions, setProductOptions] = useState<Array<{ value: string; label: string }>>([]);
    const [unresolvedJobOrderCount, setUnresolvedJobOrderCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [refreshError, setRefreshError] = useState<string | null>(null);
    const [selectedJobOrder, setSelectedJobOrder] = useState<JobOrderDailyYieldSummary | null>(null);
    const [selectedDetails, setSelectedDetails] = useState<JobOrderDailyYieldDetails | null>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [detailsError, setDetailsError] = useState<string | null>(null);
    const [closingJobOrderId, setClosingJobOrderId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [appliedSearchQuery, setAppliedSearchQuery] = useState("");
    const [statusFilter, setStatusFilterState] = useState("");
    const [productFilter, setProductFilterState] = useState("");
    const [dateRange, setDateRangeState] = useState<DateRange | undefined>(undefined);
    const [flaggedOnly, setFlaggedOnlyState] = useState(false);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSizeState] = useState(8);
    const closeIdempotencyKeys = useRef(new Map<number, string>());
    const summaryRequestId = useRef(0);
    const hasSummarySnapshot = useRef(false);
    const handledDeepLink = useRef<string | null>(null);

    useEffect(() => {
        const timeout = window.setTimeout(() => setAppliedSearchQuery(searchQuery.trim()), 250);
        return () => window.clearTimeout(timeout);
    }, [searchQuery]);

    const dateFrom = dateRange?.from ? phtDateKey(dateRange.from) : "";
    const dateTo = dateRange?.to ? phtDateKey(dateRange.to) : "";
    const loadJobOrders = useCallback(async (signal?: AbortSignal, backgroundRefresh = false) => {
        const requestId = ++summaryRequestId.current;
        const preserveResults = backgroundRefresh && hasSummarySnapshot.current;
        if (preserveResults) {
            setLoading(false);
            setRefreshing(true);
        } else {
            setRefreshing(false);
            setLoading(true);
        }
        setError(null);
        setRefreshError(null);
        try {
            const result = await fetchJobOrderDailyYieldSummaries({
                page,
                pageSize,
                search: appliedSearchQuery,
                status: statusFilter,
                productId: productFilter,
                dateFrom,
                dateTo,
                flaggedOnly,
            }, signal);
            if (signal?.aborted || requestId !== summaryRequestId.current) return;
            hasSummarySnapshot.current = true;
            setJobOrders(result.data);
            setFilteredTotal(result.meta.total);
            setTotalPages(result.meta.totalPages);
            setTotalAvailable(result.facets.totalAvailable);
            setUnresolvedJobOrderCount(result.facets.unresolvedJobOrderCount);
            setStatusOptions(result.facets.statusOptions);
            setProductOptions(result.facets.productOptions);
            if (result.meta.page !== page) setPage(result.meta.page);
        } catch (loadError) {
            if (signal?.aborted || requestId !== summaryRequestId.current) return;
            const message = loadError instanceof Error ? loadError.message : "Failed to load JO Daily Yields.";
            if (preserveResults) setRefreshError(message);
            else setError(message);
        } finally {
            if (!signal?.aborted && requestId === summaryRequestId.current) {
                if (preserveResults) setRefreshing(false);
                else setLoading(false);
            }
        }
    }, [appliedSearchQuery, dateFrom, dateTo, flaggedOnly, page, pageSize, productFilter, statusFilter]);

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
        if (typeof window === "undefined") return;
        const requestedJobOrder = String(new URLSearchParams(window.location.search).get("jo") || "").trim();
        if (!requestedJobOrder || handledDeepLink.current === requestedJobOrder) return;

        const controller = new AbortController();
        void fetchJobOrderDailyYieldSummaryByNumber(requestedJobOrder, controller.signal)
            .then((match) => {
                if (controller.signal.aborted) return;
                handledDeepLink.current = requestedJobOrder;
                if (match) {
                    openDetails(match);
                } else {
                    toast.error(`Job Order ${requestedJobOrder} was not found in JO Daily Yields.`);
                }
            })
            .catch((loadError) => {
                if (controller.signal.aborted) return;
                handledDeepLink.current = requestedJobOrder;
                toast.error(loadError instanceof Error ? loadError.message : "Failed to open the requested Job Order.");
            });
        return () => controller.abort();
    }, [openDetails]);

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

    const closeDetails = useCallback(() => {
        setSelectedJobOrder(null);
        setSelectedDetails(null);
        setDetailsError(null);
    }, []);

    const refresh = useCallback(async () => {
        await loadJobOrders(undefined, true);
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
        totalAvailable,
        filteredTotal,
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
        refreshing,
        error,
        refreshError,
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
