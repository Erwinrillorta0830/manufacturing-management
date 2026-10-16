type DispositionRecord = Record<string, unknown>;

export interface UnresolvedDisposition {
    disposition: DispositionRecord;
    reason: "yield-audits-incomplete" | "route-not-linked" | "status-unrecognized";
}

export async function commitClosureWithDispositionResolution<T>(
    candidates: DispositionRecord[],
    resolve: (rows: DispositionRecord[]) => Promise<DispositionRecord[]>,
    closeJobOrder: () => Promise<T>,
    restore: (rows: DispositionRecord[]) => Promise<string[]>,
    rollbackError: (failedIds: string[]) => Error
): Promise<T> {
    const resolved = await resolve(candidates);
    try {
        return await closeJobOrder();
    } catch (error) {
        const failedIds = await restore(resolved);
        if (failedIds.length > 0) throw rollbackError(failedIds);
        throw error;
    }
}

export function classifyClosureDispositions(
    dispositions: DispositionRecord[],
    routeIds: number[],
    allCommittedYieldAuditsPassed: boolean
): { autoResolvable: DispositionRecord[]; unresolved: UnresolvedDisposition[] } {
    const jobOrderRouteIds = new Set(routeIds.filter((id) => Number.isSafeInteger(id) && id > 0));
    const autoResolvable: DispositionRecord[] = [];
    const unresolved: UnresolvedDisposition[] = [];

    for (const disposition of dispositions) {
        const status = String(disposition.disposition_status ?? "").trim().toLowerCase();
        if (status === "resolved") continue;

        const taskValue = disposition.task_id;
        const taskId = typeof taskValue === "object" && taskValue !== null
            ? Number((taskValue as Record<string, unknown>).jo_route_id
                ?? (taskValue as Record<string, unknown>).id
                ?? taskValue)
            : Number(taskValue);
        const isLinkedToJobOrderRoute = Number.isSafeInteger(taskId) && jobOrderRouteIds.has(taskId);

        if (status === "pending" && isLinkedToJobOrderRoute && allCommittedYieldAuditsPassed) {
            autoResolvable.push(disposition);
            continue;
        }

        unresolved.push({
            disposition,
            reason: !isLinkedToJobOrderRoute
                ? "route-not-linked"
                : status !== "pending"
                    ? "status-unrecognized"
                    : "yield-audits-incomplete"
        });
    }

    return { autoResolvable, unresolved };
}
