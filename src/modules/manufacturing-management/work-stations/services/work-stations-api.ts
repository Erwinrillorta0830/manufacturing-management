import type { WorkCenter } from "../../finished-goods/types";

export async function fetchWorkCenters(): Promise<WorkCenter[]> {
    const res = await fetch("/api/manufacturing/work-stations", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch work stations from BFF");
    return res.json();
}

export async function createWorkCenter(workCenter: Omit<WorkCenter, "work_center_id">): Promise<{ success: boolean; workCenter: WorkCenter }> {
    const res = await fetch("/api/manufacturing/work-stations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workCenter)
    });
    if (!res.ok) throw new Error("Failed to create work station via BFF");
    return res.json();
}

export async function saveWorkCenter(workCenterId: number, workCenter: Partial<WorkCenter>): Promise<{ success: boolean; workCenter: WorkCenter }> {
    const res = await fetch(`/api/manufacturing/work-stations/${workCenterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workCenter)
    });
    if (!res.ok) throw new Error("Failed to update work station via BFF");
    return res.json();
}
