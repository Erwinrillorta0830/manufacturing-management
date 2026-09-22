export interface HistoricalYieldData {
    averageActualYield: number;
    totalJobsAnalyzed: number;
}

export async function fetchHistoricalYield(productId: string | number): Promise<HistoricalYieldData> {
    const res = await fetch(`/api/manufacturing/finished-goods/versions/historical-yield?productId=${productId}`);
    if (!res.ok) {
        throw new Error("Failed to fetch historical yield data");
    }
    return res.json();
}

export async function applyHistoricalYield(versionId: number, expectedYieldPercentage: number): Promise<void> {
    const applyRes = await fetch(`/api/manufacturing/finished-goods/versions/historical-yield`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            versionId,
            expectedYieldPercentage
        })
    });

    if (!applyRes.ok) {
        throw new Error("Failed to apply historical yield to version");
    }
}
