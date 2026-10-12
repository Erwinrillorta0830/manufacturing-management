export interface JobOrderYieldSummaryIndexEntry {
    count: number;
    latestYieldAt: string | null;
    latestTimestamp: number;
}

export function buildYieldSummaryIndex<T>(
    rows: T[],
    getJobOrderId: (row: T) => number,
    getYieldTimestamp: (row: T) => unknown
): Map<number, JobOrderYieldSummaryIndexEntry> {
    const summaries = new Map<number, JobOrderYieldSummaryIndexEntry>();

    for (const row of rows) {
        const id = getJobOrderId(row);
        if (!id) continue;

        const rawTimestamp = String(getYieldTimestamp(row) ?? "").trim();
        const latestYieldAt = rawTimestamp || null;
        const parsedTimestamp = Date.parse(rawTimestamp);
        const latestTimestamp = Number.isFinite(parsedTimestamp) ? parsedTimestamp : 0;
        const current = summaries.get(id);

        if (!current) {
            summaries.set(id, { count: 1, latestYieldAt, latestTimestamp });
            continue;
        }

        current.count += 1;
        if (latestTimestamp > current.latestTimestamp) {
            current.latestYieldAt = latestYieldAt;
            current.latestTimestamp = latestTimestamp;
        }
    }

    return summaries;
}
