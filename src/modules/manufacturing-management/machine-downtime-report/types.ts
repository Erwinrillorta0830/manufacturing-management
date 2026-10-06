export type MachineCondition = "Good" | "Bad" | "Under Maintenance" | "Discontinued" | string;

export type HaltedJobOrderEventType = "Termination" | "Cancellation";

export interface HaltedJobOrderBase {
    jobOrderId: number;
    jobOrderNo: string;
    status: string;
    eventType: HaltedJobOrderEventType;
    eventAt: string | null;
    reason: string | null;
}

export interface RouteStepUsage {
    routeId: number;
    sequenceOrder: number | null;
    status: string;
    workCenterId: number | null;
    workCenterName: string;
    assetName: string | null;
}

export interface AssetHaltedJobOrder extends HaltedJobOrderBase {
    routeSteps: RouteStepUsage[];
}

export interface MaintenanceEpisode {
    id: number;
    assetId: number;
    startedAt: string | null;
    startedBy: number | null;
    sourceType: "job_order" | "baseline";
    sourceJobOrderId: number | null;
    sourceJobOrderNo: string | null;
    sourceRouteId: number | null;
    sourceHistoryId: number | null;
    startReason: string | null;
    endedAt: string | null;
    endedBy: number | null;
    restoredCondition: string | null;
    resolutionNotes: string | null;
    recordedAt: string | null;
    isOpen: boolean;
}

export interface MachineAssetReport {
    assetId: number;
    assetName: string;
    assetType: string;
    classificationName: string;
    assignedToName: string;
    condition: MachineCondition;
    trackedEpisodeCount: number;
    history: MaintenanceEpisode[];
    openEpisode: MaintenanceEpisode | null;
    haltedJobOrders: AssetHaltedJobOrder[];
    historyMismatch: boolean;
}

export interface MachineDowntimeReportPayload {
    assets: MachineAssetReport[];
    preRolloutHistoryAvailable: false;
}

export interface StartMaintenanceInput {
    action: "start";
    assetId: number;
    jobOrderId: number;
    routeId: number;
}

export interface CloseMaintenanceInput {
    action: "close";
    assetId: number;
    restoredCondition: "Good" | "Bad" | "Discontinued";
    resolutionNotes?: string;
}
