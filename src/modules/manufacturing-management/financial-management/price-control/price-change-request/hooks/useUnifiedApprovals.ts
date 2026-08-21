"use client";

import * as React from "react";
import { toast } from "sonner";

import type { ListQuery, UnifiedApprovalRow } from "../types";
import * as api from "../providers/pcrApi";
import { applyActionError, applyLoadError } from "../../shared/loadErrorState";

export function useUnifiedApprovals(
    query: ListQuery,
    setQuery: React.Dispatch<React.SetStateAction<ListQuery>>,
    options?: { enabled?: boolean; scope?: "all" | "price" | "cost" },
) {
    const enabled = options?.enabled ?? true;
    const scope = options?.scope ?? "all";
    const [rows, setRows] = React.useState<UnifiedApprovalRow[]>([]);
    const [total, setTotal] = React.useState(0);
    const [loading, setLoading] = React.useState(true);
    const [acting, setActing] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [unauthorized, setUnauthorized] = React.useState(false);
    const requestIdRef = React.useRef(0);
    const lastFetchedQueryKeyRef = React.useRef<string | null>(null);

    const queryKey = React.useMemo(() => JSON.stringify(query), [query]);

    const refresh = React.useCallback(async () => {
        const requestId = ++requestIdRef.current;
        setLoading(true);
        try {
            const res = await api.listUnifiedApprovals(query, scope);

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
            applyLoadError(error, "Failed to load approvals", setUnauthorized, setError);
        } finally {
            if (requestId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, [query, scope]);

    React.useEffect(() => {
        if (!enabled) return;
        if (lastFetchedQueryKeyRef.current === queryKey) return;
        lastFetchedQueryKeyRef.current = queryKey;
        void refresh();
    }, [enabled, queryKey, refresh]);

    const approveBatch = React.useCallback(async (headerId: number, effectiveAt?: string | null) => {
        setActing(true);
        try {
            const result = await api.approvePriceChangeBatch(headerId, effectiveAt);
            await api.waitForBatchDecision({
                kind: "price_batch",
                headerId,
                expectedStatus: "APPROVED",
                expectedApplicationStatus: result.scheduled ? "SCHEDULED" : "APPLIED",
            });
            const verb = result.scheduled ? "approved and scheduled" : "approved";
            toast.success(`${result.affected} price change line(s) ${verb}.`);
            await refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to approve batch", { setUnauthorized })) {
                throw error;
            }
            throw error;
        } finally {
            setActing(false);
        }
    }, [refresh]);

    const rejectBatch = React.useCallback(async (headerId: number, reason: string) => {
        setActing(true);
        try {
            await api.rejectPriceChangeBatch(headerId, reason);
            await api.waitForBatchDecision({ kind: "price_batch", headerId, expectedStatus: "REJECTED" });
            toast.success("Batch rejected.");
            await refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to reject batch", { setUnauthorized })) {
                throw error;
            }
            throw error;
        } finally {
            setActing(false);
        }
    }, [refresh]);

    const approveCostBatch = React.useCallback(async (headerId: number, effectiveAt?: string | null) => {
        setActing(true);
        try {
            const result = await api.approveListCostBatch(headerId, effectiveAt);
            await api.waitForBatchDecision({
                kind: "cost_batch",
                headerId,
                expectedStatus: "APPROVED",
                expectedApplicationStatus: result.scheduled ? "SCHEDULED" : "APPLIED",
            });
            const verb = result.scheduled ? "approved and scheduled" : "approved";
            toast.success(`${result.affected} list cost line(s) ${verb}.`);
            await refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to approve list cost batch", { setUnauthorized })) {
                throw error;
            }
            throw error;
        } finally {
            setActing(false);
        }
    }, [refresh]);

    const rejectCostBatch = React.useCallback(async (headerId: number, reason: string) => {
        setActing(true);
        try {
            await api.rejectListCostBatch(headerId, reason);
            await api.waitForBatchDecision({ kind: "cost_batch", headerId, expectedStatus: "REJECTED" });
            toast.success("List cost batch rejected.");
            await refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to reject list cost batch", { setUnauthorized })) {
                throw error;
            }
            throw error;
        } finally {
            setActing(false);
        }
    }, [refresh]);

    const approveMixedBatch = React.useCallback(async (headerId: number, effectiveAt?: string | null) => {
        setActing(true);
        try {
            const result = await api.approveUnifiedBatch(headerId, effectiveAt);
            await api.waitForBatchDecision({
                kind: "mixed_batch",
                headerId,
                expectedStatus: "APPROVED",
                expectedApplicationStatus: result.scheduled ? "SCHEDULED" : "APPLIED",
            });
            const verb = result.scheduled ? "approved and scheduled" : "approved";
            toast.success(`${result.affected} mixed batch line(s) ${verb}.`);
            await refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to approve mixed batch", { setUnauthorized })) throw error;
            throw error;
        } finally {
            setActing(false);
        }
    }, [refresh]);

    const rejectMixedBatch = React.useCallback(async (headerId: number, reason: string) => {
        setActing(true);
        try {
            await api.rejectUnifiedBatch(headerId, reason);
            await api.waitForBatchDecision({ kind: "mixed_batch", headerId, expectedStatus: "REJECTED" });
            toast.success("Mixed batch rejected.");
            await refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to reject mixed batch", { setUnauthorized })) throw error;
            throw error;
        } finally {
            setActing(false);
        }
    }, [refresh]);

    const approvePriceRequest = React.useCallback(async (requestId: number, effectiveAt?: string | null) => {
        setActing(true);
        try {
            const result = await api.actionPriceRequest({ action: "approve", request_id: requestId, effective_at: effectiveAt });
            const verb = result.data?.application_status === "SCHEDULED" ? "Approved and scheduled." : "Approved and applied.";
            toast.success(verb);
            await refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to approve request", { setUnauthorized })) {
                throw error;
            }
            throw error;
        } finally {
            setActing(false);
        }
    }, [refresh]);

    const rejectPriceRequest = React.useCallback(async (requestId: number, reason: string) => {
        setActing(true);
        try {
            await api.actionPriceRequest({ action: "reject", request_id: requestId, reject_reason: reason });
            toast.success("Rejected.");
            await refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to reject request", { setUnauthorized })) {
                throw error;
            }
            throw error;
        } finally {
            setActing(false);
        }
    }, [refresh]);

    const applyScheduledNow = React.useCallback(async (kind: api.ScheduledOverrideKind, id: number) => {
        setActing(true);
        try {
            const result = await api.overrideScheduledPriceChange({ kind, id, action: "apply_now" });
            const count = result.affected ?? 1;
            toast.success(`${count} scheduled change(s) applied.`);
            await refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to apply scheduled change", { setUnauthorized })) {
                throw error;
            }
            throw error;
        } finally {
            setActing(false);
        }
    }, [refresh]);

    const rejectScheduled = React.useCallback(async (kind: api.ScheduledOverrideKind, id: number, reason: string) => {
        setActing(true);
        try {
            const result = await api.overrideScheduledPriceChange({
                kind,
                id,
                action: "reject_schedule",
                reject_reason: reason,
            });
            const count = result.affected ?? 1;
            toast.success(`${count} scheduled change(s) rejected.`);
            await refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to reject scheduled change", { setUnauthorized })) {
                throw error;
            }
            throw error;
        } finally {
            setActing(false);
        }
    }, [refresh]);

    const retryApplication = React.useCallback(async (kind: api.ScheduledOverrideKind, id: number) => {
        setActing(true);
        try {
            const result = await api.overrideScheduledPriceChange({ kind, id, action: "retry_application" });
            const count = result.affected ?? 1;
            toast.success(`${count} failed change(s) retried.`);
            await refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to retry application", { setUnauthorized })) throw error;
            throw error;
        } finally {
            setActing(false);
        }
    }, [refresh]);

    const retryMixedBatch = React.useCallback(async (headerId: number) => {
        setActing(true);
        try {
            const result = await api.retryUnifiedBatch(headerId);
            if (result.warning) toast.warning(result.warning);
            else toast.success(`${result.applied ?? 0} mixed batch line(s) applied.`);
            await refresh();
        } catch (error: unknown) {
            if (applyActionError(error, "Failed to retry mixed batch application", { setUnauthorized })) throw error;
            throw error;
        } finally {
            setActing(false);
        }
    }, [refresh]);

    return {
        query,
        setQuery,
        rows,
        total,
        loading,
        acting,
        error,
        unauthorized,
        refresh,
        approveBatch,
        rejectBatch,
        approveCostBatch,
        rejectCostBatch,
        approveMixedBatch,
        rejectMixedBatch,
        approvePriceRequest,
        rejectPriceRequest,
        applyScheduledNow,
        rejectScheduled,
        retryApplication,
        retryMixedBatch,
    };
}
