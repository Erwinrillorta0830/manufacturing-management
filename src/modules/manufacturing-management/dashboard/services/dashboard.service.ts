import { DashboardData } from "../types/dashboard.types";

export async function fetchDashboardData(startDate?: string, endDate?: string): Promise<DashboardData> {
    const queryParams = new URLSearchParams();
    if (startDate) queryParams.append("startDate", startDate);
    if (endDate) queryParams.append("endDate", endDate);

    const res = await fetch(`/api/manufacturing/dashboard?${queryParams.toString()}`);
    if (!res.ok) {
        throw new Error("Failed to load dashboard metrics from backend.");
    }
    return res.json();
}
