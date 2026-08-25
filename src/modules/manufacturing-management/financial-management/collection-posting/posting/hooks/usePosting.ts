"use client";

import {useState, useEffect, useCallback, useRef} from "react";
import {fetchProvider} from "../../providers/fetchProvider";
import {fetchCompanyProfile} from "../../company-profile";
import type {CompanyProfile, CompanyProfileStatus} from "../../company-profile";

export type {CompanyProfile, CompanyProfileStatus} from "../../company-profile";

export type PostingSortField =
    | "docNo"
    | "salesmanName"
    | "operationName"
    | "encoderName"
    | "collectionDate"
    | "pouchAmount"
    | "totalAppliedAmount"
    | "creditAppliedAmount"
    | "adjustmentDebit"
    | "adjustmentCredit";

export interface PostingQueueQuery {
    search: string;
    operation: string;
    salesman: string;
    cashier: string;
    dateFrom: string;
    dateTo: string;
    page: number;
    size: number;
    sortField: PostingSortField;
    sortDir: "asc" | "desc";
}

export interface PostingQueueItem {
    id: number;
    docNo: string;
    salesmanName: string;
    operationName: string;
    encoderName: string;
    collectionDate: string;
    pouchAmount: number;
    totalAppliedAmount: number;
    creditAppliedAmount: number;
    adjustmentDebit: number;
    adjustmentCredit: number;
}

export interface PostingQueueOptions {
    operations: string[];
    salesmen: string[];
    cashiers: string[];
}

interface RawQueueItem {
    id?: number;
    docNo?: string;
    salesmanName?: string;
    operationName?: string;
    encoderName?: string;
    collectionDate?: string;
    pouchAmount?: number;
    totalAppliedAmount?: number;
    creditAppliedAmount?: number;
    adjustmentDebit?: number;
    adjustmentCredit?: number;
}

interface PostingQueuePageResponse {
    content?: RawQueueItem[];
    totalElements?: number;
    totalPages?: number;
    currentPage?: number;
    size?: number;
}

export interface TreasuryPouchDetail extends PostingQueueItem {
    remarks?: string;
    cashBuckets?: {
        detailId?: number;
        tempId?: string;
        paymentMethodId?: number;
        coaId?: number;
        bankId?: number | null;
        bankName?: string | null;
        customerCode?: string;
        invoiceId?: number;
        referenceNo?: string;
        amount?: number;
        chequeDate?: string | null;
        quantity?: number;
        findingId?: number;
        balanceTypeId?: number;
    }[];
    allocations?: {
        amountApplied?: number;
        allocationType?: string;
        sourceTempId?: string;
        customerName?: string;
        invoiceNo?: string;
        invoiceId?: string | number;
        grossAmount?: number;
        originalAmount?: number;
        remainingBalance?: number;
        referenceNo?: string;
    }[];
}

const DEFAULT_QUERY: PostingQueueQuery = {
    search: "",
    operation: "all",
    salesman: "all",
    cashier: "all",
    dateFrom: "",
    dateTo: "",
    page: 1,
    size: 25,
    sortField: "docNo",
    sortDir: "asc",
};

const getErrorMessage = (error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback;

const mapQueueItem = (item: RawQueueItem): PostingQueueItem => ({
    id: item.id ?? 0,
    docNo: item.docNo || "UNKNOWN",
    salesmanName: item.salesmanName || "Unknown Route",
    operationName: item.operationName || "Unassigned Operation",
    encoderName: item.encoderName || "Cashier",
    collectionDate: item.collectionDate?.split("T")[0] || "N/A",
    pouchAmount: item.pouchAmount || 0,
    totalAppliedAmount: item.totalAppliedAmount || 0,
    creditAppliedAmount: item.creditAppliedAmount || 0,
    adjustmentDebit: item.adjustmentDebit || 0,
    adjustmentCredit: item.adjustmentCredit || 0,
});

export function usePosting() {
    const [query, setQuery] = useState<PostingQueueQuery>(DEFAULT_QUERY);
    const queryRef = useRef(query);
    const queueRef = useRef<PostingQueueItem[]>([]);
    const queueRequestController = useRef<AbortController | null>(null);
    const detailRequestController = useRef<AbortController | null>(null);
    const queueRequestVersion = useRef(0);
    const companyProfileCache = useRef<{ profile: CompanyProfile | null; status: CompanyProfileStatus } | null>(null);

    const [queue, setQueue] = useState<PostingQueueItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFetching, setIsFetching] = useState(false);
    const [queueError, setQueueError] = useState<string | null>(null);
    const [totalElements, setTotalElements] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(DEFAULT_QUERY.page);
    const [pageSize, setPageSize] = useState(DEFAULT_QUERY.size);

    const [options, setOptions] = useState<PostingQueueOptions>({operations: [], salesmen: [], cashiers: []});
    const [optionsError, setOptionsError] = useState<string | null>(null);
    const [isOptionsLoading, setIsOptionsLoading] = useState(true);

    const [selectedPouch, setSelectedPouch] = useState<TreasuryPouchDetail | null>(null);
    const [detailError, setDetailError] = useState<string | null>(null);
    const [isLoadingDetails, setIsLoadingDetails] = useState(false);
    const [isReviewSheetOpen, setIsReviewSheetOpen] = useState(false);
    const [isPosting, setIsPosting] = useState(false);
    const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
    const [companyProfileStatus, setCompanyProfileStatus] = useState<CompanyProfileStatus>("unavailable");

    useEffect(() => {
        queryRef.current = query;
    }, [query]);

    useEffect(() => {
        queueRef.current = queue;
    }, [queue]);

    const updateQuery = useCallback((patch: Partial<PostingQueueQuery>) => {
        setQuery(current => ({...current, ...patch}));
    }, []);

    const fetchQueue = useCallback(async () => {
        queueRequestController.current?.abort();
        const controller = new AbortController();
        queueRequestController.current = controller;
        const requestVersion = ++queueRequestVersion.current;
        const currentQuery = queryRef.current;

        setIsFetching(true);
        setQueueError(null);

        const params = new URLSearchParams({
            page: String(currentQuery.page),
            size: String(currentQuery.size),
            sortField: currentQuery.sortField,
            sortDir: currentQuery.sortDir,
        });
        if (currentQuery.search) params.set("search", currentQuery.search);
        if (currentQuery.operation !== "all") params.set("operation", currentQuery.operation);
        if (currentQuery.salesman !== "all") params.set("salesman", currentQuery.salesman);
        if (currentQuery.cashier !== "all") params.set("cashier", currentQuery.cashier);
        if (currentQuery.dateFrom) params.set("dateFrom", currentQuery.dateFrom);
        if (currentQuery.dateTo) params.set("dateTo", currentQuery.dateTo);

        try {
            const data = await fetchProvider.getOrThrow<PostingQueuePageResponse>(
                `/api/manufacturing/financial-management/collection-posting/collections/posting-queue?${params.toString()}`,
                {signal: controller.signal},
            );

            if (controller.signal.aborted || queueRequestVersion.current !== requestVersion) return;

            const nextQueue = (data?.content || []).map(mapQueueItem);
            setQueue(nextQueue);
            setTotalElements(data?.totalElements || 0);
            setTotalPages(data?.totalPages || 0);
            setCurrentPage(data?.currentPage || currentQuery.page);
            setPageSize(data?.size || currentQuery.size);
        } catch (error) {
            if (controller.signal.aborted || queueRequestVersion.current !== requestVersion) return;
            setQueueError(getErrorMessage(error, "The posting queue could not be loaded. Please retry."));
        } finally {
            if (queueRequestVersion.current === requestVersion) {
                setIsLoading(false);
                setIsFetching(false);
            }
        }
    }, []);

    useEffect(() => {
        void fetchQueue();

        return () => {
            queueRequestController.current?.abort();
        };
    }, [fetchQueue, query]);

    useEffect(() => {
        const controller = new AbortController();

        const fetchOptions = async () => {
            setIsOptionsLoading(true);
            try {
                const data = await fetchProvider.getOrThrow<PostingQueueOptions>(
                    "/api/manufacturing/financial-management/collection-posting/collections/posting-queue/options",
                    {signal: controller.signal},
                );
                if (!controller.signal.aborted && data) {
                    setOptions({
                        operations: data.operations || [],
                        salesmen: data.salesmen || [],
                        cashiers: data.cashiers || [],
                    });
                }
            } catch (error) {
                if (!controller.signal.aborted) {
                    setOptionsError(getErrorMessage(error, "Posting queue filters could not be loaded."));
                }
            } finally {
                if (!controller.signal.aborted) setIsOptionsLoading(false);
            }
        };

        void fetchOptions();
        return () => controller.abort();
    }, []);

    const loadCompanyProfile = useCallback(async () => {
        if (companyProfileCache.current) {
            setCompanyProfile(companyProfileCache.current.profile);
            setCompanyProfileStatus(companyProfileCache.current.status);
            return;
        }

        setCompanyProfile(null);
        setCompanyProfileStatus("loading");

        try {
            const result = await fetchCompanyProfile();
            companyProfileCache.current = {profile: result.profile, status: result.status};
            setCompanyProfile(result.profile);
            setCompanyProfileStatus(result.status);
        } catch (error) {
            console.warn("Company profile is unavailable for Posting review", error);
            companyProfileCache.current = {profile: null, status: "error"};
            setCompanyProfile(null);
            setCompanyProfileStatus("error");
        }
    }, []);

    const openReviewSheet = useCallback(async (id: number) => {
        detailRequestController.current?.abort();
        const controller = new AbortController();
        detailRequestController.current = controller;

        setIsReviewSheetOpen(true);
        setIsLoadingDetails(true);
        setDetailError(null);
        setSelectedPouch(null);
        void loadCompanyProfile();

        try {
            const details = await fetchProvider.getOrThrow<Partial<TreasuryPouchDetail>>(
                `/api/manufacturing/financial-management/collection-posting/collections/${id}`,
                {signal: controller.signal},
            );
            if (controller.signal.aborted) return;

            const queueSummaryData = queueRef.current.find(item => item.id === id);
            setSelectedPouch({
                ...details,
                ...(queueSummaryData || {}),
            } as TreasuryPouchDetail);
        } catch (error) {
            if (controller.signal.aborted) return;
            setDetailError(getErrorMessage(error, "Could not load pouch details. Please retry."));
        } finally {
            if (!controller.signal.aborted) setIsLoadingDetails(false);
        }
    }, [loadCompanyProfile]);

    const handlePostPouch = async (id: number, docNo: string, shortageAmount: number) => {
        const warningMsg = shortageAmount > 0
            ? `WARNING: This pouch has a SHORTAGE of â‚±${shortageAmount.toLocaleString()}.\n\nPosting this will permanently lock the pouch AND automatically generate a Payroll Audit Finding for the Route Manager.\n\nAre you sure you want to POST?`
            : `Are you sure you want to permanently POST and lock pouch ${docNo}?`;

        if (!confirm(warningMsg)) return;

        setIsPosting(true);
        try {
            await fetchProvider.post(`/api/manufacturing/financial-management/collection-posting/collections/${id}/post`, {});
            alert(`Pouch ${docNo} has been successfully posted to the General Ledger!`);
            setIsReviewSheetOpen(false);
            await fetchQueue();
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
            alert(`Failed to post pouch: ${errorMessage}`);
        } finally {
            setIsPosting(false);
        }
    };

    return {
        queue,
        isLoading,
        isFetching,
        queueError,
        options,
        optionsError,
        isOptionsLoading,
        query,
        updateQuery,
        totalElements,
        totalPages,
        currentPage,
        pageSize,
        refreshQueue: fetchQueue,
        isPosting,
        selectedPouch,
        detailError,
        isLoadingDetails,
        isReviewSheetOpen,
        setIsReviewSheetOpen,
        openReviewSheet,
        handlePostPouch,
        companyProfile,
        companyProfileStatus,
    };
}
