"use client";

import * as React from "react";
import type { ListQuery, PriceChangeRequestRow, CostChangeRequestRow } from "../types";
import * as api from "../providers/pcrApi";
import { applyLoadError } from "../../shared/loadErrorState";

type UsePCRListOptions = {
    requestType?: "price" | "cost";
    enabled?: boolean;
};

type UsePCRListInitial = Partial<ListQuery> & UsePCRListOptions;

type UsePCRListResult = {
    query: ListQuery;
    setQuery: React.Dispatch<React.SetStateAction<ListQuery>>;
    rows: (PriceChangeRequestRow | CostChangeRequestRow)[];
    total: number;
    loading: boolean;
    error: string | null;
    unauthorized: boolean;
    refresh: () => Promise<void>;
};

function isInitialArg(
    value: ListQuery | UsePCRListInitial,
    setQuery?: React.Dispatch<React.SetStateAction<ListQuery>>,
): value is UsePCRListInitial {
    return setQuery == null;
}

export function usePCRList(
    query: ListQuery,
    setQuery: React.Dispatch<React.SetStateAction<ListQuery>>,
    options?: UsePCRListOptions,
): UsePCRListResult;

export function usePCRList(initial: UsePCRListInitial): UsePCRListResult;

export function usePCRList(
    queryOrInitial: ListQuery | UsePCRListInitial,
    setQuery?: React.Dispatch<React.SetStateAction<ListQuery>>,
    options?: UsePCRListOptions,
): UsePCRListResult {
    const isControlled = setQuery != null;
    const requestType =
        options?.requestType ??
        (isInitialArg(queryOrInitial, setQuery) ? queryOrInitial.requestType : undefined) ??
        "price";
    const enabled = options?.enabled ?? true;

    const [internalQuery, setInternalQuery] = React.useState<ListQuery>(() => {
        if (isControlled) {
            return {
                status: "ALL",
                page: 1,
                page_size: 50,
            };
        }

        const initial = queryOrInitial as UsePCRListInitial;
        return {
            status: "ALL",
            page: 1,
            page_size: 50,
            ...(initial as Partial<ListQuery>),
        };
    });

    const query = isControlled ? (queryOrInitial as ListQuery) : internalQuery;
    const effectiveSetQuery = isControlled ? setQuery : setInternalQuery;

    const [rows, setRows] = React.useState<(PriceChangeRequestRow | CostChangeRequestRow)[]>([]);
    const [total, setTotal] = React.useState<number>(0);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [unauthorized, setUnauthorized] = React.useState(false);
    const requestIdRef = React.useRef(0);
    const lastFetchedQueryKeyRef = React.useRef<string | null>(null);

    const queryKey = React.useMemo(() => JSON.stringify(query), [query]);

    const loadErrorFallback =
        requestType === "cost" ? "Failed to load list cost requests" : "Failed to load price change requests";

    const refresh = React.useCallback(async () => {
        const requestId = ++requestIdRef.current;
        setLoading(true);
        try {
            const res =
                requestType === "cost"
                    ? await api.listCostRequests(query)
                    : await api.listRequests(query);

            if (requestId !== requestIdRef.current) return;

            setRows(res.data ?? []);
            setTotal(Number(res.meta?.total_count ?? (res.data?.length ?? 0)));
            setError(null);
            setUnauthorized(false);
            lastFetchedQueryKeyRef.current = JSON.stringify(query);
        } catch (error: unknown) {
            if (requestId !== requestIdRef.current) return;

            setRows([]);
            setTotal(0);
            applyLoadError(error, loadErrorFallback, setUnauthorized, setError);
        } finally {
            if (requestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, [loadErrorFallback, query, requestType]);

    React.useEffect(() => {
        if (!enabled) return;
        if (lastFetchedQueryKeyRef.current === queryKey) return;
        lastFetchedQueryKeyRef.current = queryKey;
        void refresh();
    }, [enabled, queryKey, refresh]);

    return {
        query,
        setQuery: effectiveSetQuery,
        rows,
        total,
        loading,
        error,
        unauthorized,
        refresh,
    };
}
