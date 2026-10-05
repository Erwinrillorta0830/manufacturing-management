import type {
    CloseMaintenanceInput,
    MachineDowntimeReportPayload,
    StartMaintenanceInput
} from "../types";

interface ApiPayload<T> {
    success?: boolean;
    data?: T;
    error?: string;
}

async function readPayload<T>(response: Response): Promise<T> {
    const payload = await response.json().catch(() => null) as ApiPayload<T> | null;
    if (!response.ok || !payload?.success || payload.data === undefined) {
        throw new Error(payload?.error || "The Machine Downtime Report request failed.");
    }
    return payload.data;
}

export async function fetchMachineDowntimeReport(signal?: AbortSignal): Promise<MachineDowntimeReportPayload> {
    const response = await fetch("/api/manufacturing/reports/machine-downtime-report", {
        cache: "no-store",
        signal
    });
    return readPayload<MachineDowntimeReportPayload>(response);
}

export async function startMaintenanceEpisode(input: StartMaintenanceInput): Promise<void> {
    const response = await fetch("/api/manufacturing/reports/machine-downtime-report/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
    });
    await readPayload<{ episodeId: number | null }>(response);
}

export async function closeMaintenanceEpisode(input: CloseMaintenanceInput): Promise<void> {
    const response = await fetch("/api/manufacturing/reports/machine-downtime-report/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
    });
    await readPayload<{ episodeId: number }>(response);
}
