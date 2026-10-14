type DirectusRecord = Record<string, unknown>;

export interface WorkflowStationContext {
    joRouteId: number | null;
    workCenterId: number | null;
    invalidRouteSelection: boolean;
}

function positiveId(value: unknown, relationKeys: string[] = []): number | null {
    let rawValue = value;
    if (value && typeof value === "object") {
        const record = value as DirectusRecord;
        rawValue = [...relationKeys, "id"].map((key) => record[key]).find((candidate) => candidate !== undefined && candidate !== null);
    }
    const id = Number(rawValue);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function routeId(route: DirectusRecord): number | null {
    return positiveId(route.jo_route_id ?? route.id, ["jo_route_id"]);
}

function workCenterId(route: DirectusRecord): number | null {
    return positiveId(route.work_center_id, ["work_center_id"]);
}

function isIncompleteRoute(route: DirectusRecord): boolean {
    return !["completed", "done", "closed"].includes(String(route.status ?? "").trim().toLowerCase());
}

export function resolveWorkflowStationContext(
    routes: readonly DirectusRecord[],
    selectedRouteId?: unknown
): WorkflowStationContext {
    const selectedId = positiveId(selectedRouteId);
    if (selectedId) {
        const selectedRoute = routes.find((route) => routeId(route) === selectedId);
        return selectedRoute
            ? { joRouteId: selectedId, workCenterId: workCenterId(selectedRoute), invalidRouteSelection: false }
            : { joRouteId: null, workCenterId: null, invalidRouteSelection: true };
    }

    const selectedRoute = routes
        .map((route, index) => ({ route, index }))
        .filter(({ route }) => isIncompleteRoute(route))
        .sort((left, right) => Number(left.route.sequence_order || 0) - Number(right.route.sequence_order || 0) || left.index - right.index)[0]?.route;
    return {
        joRouteId: selectedRoute ? routeId(selectedRoute) : null,
        workCenterId: selectedRoute ? workCenterId(selectedRoute) : null,
        invalidRouteSelection: false
    };
}

function parseLegacyWorkCenterRemark(remarks: unknown): { workCenterId: number; workCenterName: string | null } | null {
    if (typeof remarks !== "string") return null;
    const match = remarks.match(/^\s*Station Start Scanner:\s*.*?Work Center\s+"([^"]+)"\s+\(ID:\s*(\d+)\)\s*$/i);
    const id = positiveId(match?.[2]);
    if (!match || !id) return null;
    return { workCenterId: id, workCenterName: match[1].trim() || null };
}

export function resolveHistoryWorkCenter(
    record: DirectusRecord,
    routeWorkCenters: ReadonlyMap<number, number>
): { workCenterId: number | null; workCenterIds: number[]; workCenterName: string | null } {
    const persistedId = positiveId(record.work_center_id, ["work_center_id"]);
    if (persistedId) return { workCenterId: persistedId, workCenterIds: [persistedId], workCenterName: null };

    const legacyStation = parseLegacyWorkCenterRemark(record.remarks);
    if (legacyStation) return { ...legacyStation, workCenterIds: [legacyStation.workCenterId] };

    const joRouteId = positiveId(record.jo_route_id, ["jo_route_id"]);
    if (joRouteId) {
        const routeWorkCenterId = routeWorkCenters.get(joRouteId) ?? null;
        return {
            workCenterId: routeWorkCenterId,
            workCenterIds: routeWorkCenterId ? [routeWorkCenterId] : [],
            workCenterName: null
        };
    }

    const assignedWorkCenterIds = [...new Set(routeWorkCenters.values())];
    return {
        workCenterId: assignedWorkCenterIds.length === 1 ? assignedWorkCenterIds[0] : null,
        workCenterIds: assignedWorkCenterIds,
        workCenterName: null
    };
}
