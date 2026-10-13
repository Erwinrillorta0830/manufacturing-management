export interface JobOrderYieldSummaryIndexEntry {
    count: number;
    latestYieldAt: string | null;
    latestTimestamp: number;
}

export interface JobOrderYieldQAStatusCountEntry {
    pendingYieldCount: number;
    discrepancyYieldCount: number;
    unresolvedYieldCount: number;
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

export function buildYieldQAStatusCountIndex<T>(
    rows: T[],
    getJobOrderId: (row: T) => number,
    getQAStatus: (row: T) => string
): Map<number, JobOrderYieldQAStatusCountEntry> {
    const counts = new Map<number, JobOrderYieldQAStatusCountEntry>();

    for (const row of rows) {
        const id = getJobOrderId(row);
        if (!id) continue;

        const current = counts.get(id) || {
            pendingYieldCount: 0,
            discrepancyYieldCount: 0,
            unresolvedYieldCount: 0,
        };
        const status = getQAStatus(row);
        if (status === "Pending") current.pendingYieldCount += 1;
        if (status === "QA Hold") current.discrepancyYieldCount += 1;
        if (status !== "Passed") current.unresolvedYieldCount += 1;
        counts.set(id, current);
    }

    return counts;
}
