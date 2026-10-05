"use client";

import { useCallback, useEffect, useState } from "react";
import {
    closeMaintenanceEpisode,
    fetchMachineDowntimeReport,
    startMaintenanceEpisode
} from "../providers/machineDowntimeReportApi";
import type {
    CloseMaintenanceInput,
    MachineDowntimeReportPayload,
    StartMaintenanceInput
} from "../types";

export function useMachineDowntimeReport() {
    const [report, setReport] = useState<MachineDowntimeReportPayload | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async (signal?: AbortSignal) => {
        const data = await fetchMachineDowntimeReport(signal);
        setReport(data);
        setError(null);
        return data;
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        void reload(controller.signal)
            .catch((cause) => {
                if (!controller.signal.aborted) {
                    setError(cause instanceof Error ? cause.message : "Unable to load the report.");
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [reload]);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        try {
            await reload();
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Unable to refresh the report.");
            throw cause;
        } finally {
            setRefreshing(false);
        }
    }, [reload]);

    const startEpisode = useCallback(async (input: StartMaintenanceInput) => {
        setSaving(true);
        try {
            await startMaintenanceEpisode(input);
            await reload();
        } finally {
            setSaving(false);
        }
    }, [reload]);

    const closeEpisode = useCallback(async (input: CloseMaintenanceInput) => {
        setSaving(true);
        try {
            await closeMaintenanceEpisode(input);
            await reload();
        } finally {
            setSaving(false);
        }
    }, [reload]);

    return { report, loading, refreshing, saving, error, refresh, startEpisode, closeEpisode };
}
