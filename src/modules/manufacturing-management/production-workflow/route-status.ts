const TERMINAL_ROUTE_STATUSES = new Set(["completed", "done", "closed"]);

export function isTerminalRouteStatus(status: unknown): boolean {
    return TERMINAL_ROUTE_STATUSES.has(String(status ?? "").trim().toLowerCase());
}

export function canMutateOperatorActionOnRoute(status: unknown, action: string): boolean {
    if (!isTerminalRouteStatus(status)) return true;
    return action === "edit-times" || action === "stop-timer";
}
