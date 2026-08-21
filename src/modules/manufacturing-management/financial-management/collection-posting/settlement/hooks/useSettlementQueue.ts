"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { fetchProvider } from "../../providers/fetchProvider";
import { UserDto } from "../../types";

export interface SettlementQueueItem {
    id: number; docNo?: string; salesmanName?: string; operationName?: string;
    collectionDate?: string | number[]; encodedDate?: string | number[];
    pouchAmount?: number; discrepancy?: number; receivableAmount?: number;
    adjustments?: number; collectedByName?: string; crNo?: string; status?: string;
}

export interface PaginatedQueueResponse {
    content: SettlementQueueItem[];
    totalElements: number;
    totalPages: number;
    currentPage: number;
}

const QUEUE_ERROR_MESSAGE = "The settlement queue could not be loaded. Please retry.";

export function useSettlementQueue(
    search: string, status: string, collector: string,
    page: number, size: number, sortField: string, sortDir: string
) {
    const [data, setData] = useState<PaginatedQueueResponse>({ content: [], totalElements: 0, totalPages: 0, currentPage: 1 });
    const [isLoading, setIsLoading] = useState(true);
    const [queueError, setQueueError] = useState<string | null>(null);
    const [users, setUsers] = useState<UserDto[]>([]); // To populate the Combobox
    const requestController = useRef<AbortController | null>(null);
    const requestVersion = useRef(0);

    const fetchQueue = useCallback(async () => {
        requestController.current?.abort();
        const controller = new AbortController();
        requestController.current = controller;
        const version = ++requestVersion.current;
        setIsLoading(true);
        try {
            const qs = new URLSearchParams({
                search, status, collector,
                page: page.toString(), size: size.toString(), sortField, sortDir
            }).toString();

            const result = await fetchProvider.getOrThrow<PaginatedQueueResponse>(
                `/api/fm/treasury/collections/settlement-queue?${qs}`,
                {signal: controller.signal},
            );
            if (controller.signal.aborted || requestVersion.current !== version) return;
            if (!result) throw new Error("The settlement queue returned no data.");

            setData(result);
            setQueueError(null);
        } catch (error) {
            if (controller.signal.aborted || requestVersion.current !== version) return;
            console.error("Failed to fetch paginated queue:", error);
            setQueueError(QUEUE_ERROR_MESSAGE);
        } finally {
            if (requestVersion.current === version) setIsLoading(false);
        }
    }, [search, status, collector, page, size, sortField, sortDir]);

    useEffect(() => {
        void fetchQueue();
        return () => requestController.current?.abort();
    }, [fetchQueue]);

    useEffect(() => {
        fetchProvider.get<UserDto[]>("/api/fm/treasury/users")
            .then(res => setUsers(res || []))
            .catch(console.error);
    }, []);

    return { data, isLoading, queueError, users, fetchQueue };
}
