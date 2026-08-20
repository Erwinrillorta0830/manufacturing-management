"use client";

import * as React from "react";
import { toast } from "sonner";
import type { BulkActionResult } from "../types";
import * as api from "../providers/pcrApi";
import { applyActionError } from "../../shared/loadErrorState";
import { isUnauthorizedError } from "../../shared/apiHttp";

function emptyBulkResult(action: BulkActionResult["action"]): BulkActionResult {
    return { action, successIds: [], failedIds: [], failures: [] };
}

function showBulkToast(action: BulkActionResult["action"], successIds: number[], failedIds: number[]) {
    if (successIds.length > 0 && failedIds.length === 0) {
        const verb = action === "approve" ? "approved and applied" : "rejected";
        toast.success(`${successIds.length} request(s) ${verb}.`);
        return;
    }

    if (failedIds.length > 0) {
        const verb = action === "approve" ? "approved" : "rejected";
        const successPart = successIds.length > 0 ? `${successIds.length} ${verb}, ` : "";
        toast.warning(`${successPart}${failedIds.length} failed — see details`);
    }
}

export function usePCRActions(onDone?: () => void, onUnauthorized?: () => void) {
    const [acting, setActing] = React.useState(false);

    const approve = React.useCallback(
        async (request_id: number, effective_at?: string | null) => {
            setActing(true);
            try {
                const result = await api.actionCostRequest({ action: "approve", request_id, effective_at });
                const verb = result.data?.application_status === "SCHEDULED" ? "Approved and scheduled." : "Approved and applied.";
                toast.success(verb);
                onDone?.();
            } catch (error: unknown) {
                applyActionError(error, "Failed to approve", { onUnauthorized });
            } finally {
                setActing(false);
            }
        },
        [onDone, onUnauthorized],
    );

    const approveMany = React.useCallback(
        async (requestIds: number[], effective_at?: string | null): Promise<BulkActionResult> => {
            const uniqueIds = Array.from(new Set(requestIds)).filter((id) => Number.isFinite(id));

            if (uniqueIds.length === 0) {
                return emptyBulkResult("approve");
            }

            setActing(true);

            try {
                const response = await api.actionCostRequestsBulk({
                    action: "approve",
                    request_ids: uniqueIds,
                    effective_at,
                });

                const result: BulkActionResult = {
                    action: "approve",
                    successIds: response.successIds,
                    failedIds: response.failedIds,
                    failures: response.failures,
                };

                showBulkToast("approve", result.successIds, result.failedIds);

                if (result.successIds.length > 0) {
                    onDone?.();
                }

                return result;
            } catch (error: unknown) {
                if (applyActionError(error, "Request failed", { onUnauthorized })) {
                    return {
                        action: "approve",
                        successIds: [],
                        failedIds: uniqueIds,
                        failures: uniqueIds.map((request_id) => ({
                            request_id,
                            message: error instanceof Error ? error.message : "Request failed",
                        })),
                        unauthorized: isUnauthorizedError(error),
                    };
                }

                return {
                    action: "approve",
                    successIds: [],
                    failedIds: uniqueIds,
                    failures: uniqueIds.map((request_id) => ({
                        request_id,
                        message: error instanceof Error ? error.message : "Request failed",
                    })),
                };
            } finally {
                setActing(false);
            }
        },
        [onDone, onUnauthorized],
    );

    const cancel = React.useCallback(
        async (request_id: number) => {
            setActing(true);
            try {
                await api.actionCostRequest({ action: "cancel", request_id });
                toast.success("Cancelled.");
                onDone?.();
            } catch (error: unknown) {
                applyActionError(error, "Failed to cancel", { onUnauthorized });
            } finally {
                setActing(false);
            }
        },
        [onDone, onUnauthorized],
    );

    const reject = React.useCallback(
        async (request_id: number, reject_reason: string) => {
            setActing(true);
            try {
                await api.actionCostRequest({ action: "reject", request_id, reject_reason });
                toast.success("Rejected.");
                onDone?.();
            } catch (error: unknown) {
                applyActionError(error, "Failed to reject", { onUnauthorized });
            } finally {
                setActing(false);
            }
        },
        [onDone, onUnauthorized],
    );

    const applyScheduledNow = React.useCallback(
        async (request_id: number) => {
            setActing(true);
            try {
                await api.overrideScheduledPriceChange({
                    kind: "cost_request",
                    id: request_id,
                    action: "apply_now",
                });
                toast.success("Scheduled list cost change applied.");
                onDone?.();
            } catch (error: unknown) {
                applyActionError(error, "Failed to apply scheduled change", { onUnauthorized });
                throw error;
            } finally {
                setActing(false);
            }
        },
        [onDone, onUnauthorized],
    );

    const rejectScheduled = React.useCallback(
        async (request_id: number, reject_reason: string) => {
            setActing(true);
            try {
                await api.overrideScheduledPriceChange({
                    kind: "cost_request",
                    id: request_id,
                    action: "reject_schedule",
                    reject_reason,
                });
                toast.success("Scheduled list cost change rejected.");
                onDone?.();
            } catch (error: unknown) {
                applyActionError(error, "Failed to reject scheduled change", { onUnauthorized });
                throw error;
            } finally {
                setActing(false);
            }
        },
        [onDone, onUnauthorized],
    );

    const retryApplication = React.useCallback(
        async (request_id: number) => {
            setActing(true);
            try {
                const result = await api.overrideScheduledPriceChange({
                    kind: "cost_request",
                    id: request_id,
                    action: "retry_application",
                });
                const count = result.affected ?? 1;
                toast.success(`${count} failed change(s) retried.`);
                onDone?.();
            } catch (error: unknown) {
                applyActionError(error, "Failed to retry application", { onUnauthorized });
                throw error;
            } finally {
                setActing(false);
            }
        },
        [onDone, onUnauthorized],
    );

    const rejectMany = React.useCallback(
        async (requestIds: number[], reject_reason: string): Promise<BulkActionResult> => {
            const uniqueIds = Array.from(new Set(requestIds)).filter((id) => Number.isFinite(id));

            if (uniqueIds.length === 0) {
                return emptyBulkResult("reject");
            }

            setActing(true);

            try {
                const response = await api.actionCostRequestsBulk({
                    action: "reject",
                    request_ids: uniqueIds,
                    reject_reason,
                });

                const result: BulkActionResult = {
                    action: "reject",
                    successIds: response.successIds,
                    failedIds: response.failedIds,
                    failures: response.failures,
                };

                showBulkToast("reject", result.successIds, result.failedIds);

                if (result.successIds.length > 0) {
                    onDone?.();
                }

                return result;
            } catch (error: unknown) {
                if (applyActionError(error, "Request failed", { onUnauthorized })) {
                    return {
                        action: "reject",
                        successIds: [],
                        failedIds: uniqueIds,
                        failures: uniqueIds.map((request_id) => ({
                            request_id,
                            message: error instanceof Error ? error.message : "Request failed",
                        })),
                        unauthorized: isUnauthorizedError(error),
                    };
                }

                return {
                    action: "reject",
                    successIds: [],
                    failedIds: uniqueIds,
                    failures: uniqueIds.map((request_id) => ({
                        request_id,
                        message: error instanceof Error ? error.message : "Request failed",
                    })),
                };
            } finally {
                setActing(false);
            }
        },
        [onDone, onUnauthorized],
    );

    return { acting, approve, approveMany, cancel, reject, applyScheduledNow, rejectScheduled, retryApplication, rejectMany };
}
