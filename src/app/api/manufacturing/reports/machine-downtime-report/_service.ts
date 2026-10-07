import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { JOB_ORDER_STATUS, isCancelledJobOrderStatus } from "@/modules/manufacturing-management/job-order-status";
import type {
    AssetHaltedJobOrder,
    HaltedJobOrderBase,
    MachineAssetReport,
    MachineDowntimeReportPayload,
    MaintenanceEpisode,
    RouteStepUsage
} from "@/modules/manufacturing-management/machine-downtime-report/types";

type DirectusRecord = Record<string, unknown>;

const HISTORY_COLLECTION = "manufacturing_asset_maintenance_history";
const PRODUCTION_ASSET_FIELDS = [
    "id", "asset_type", "condition", "serial", "barcode", "rfid_code", "employee",
    "item_id.id", "item_id.item_name", "item_id.item_classification.classification_name"
].join(",");
const ASSIGNED_PERSONNEL_FIELDS = "user_id,user_fname,user_lname";
const JOB_ORDER_FIELDS = [
    "job_order_id", "job_order_no", "status", "cancelled_at", "cancellation_reason",
    "cancellation_image_id", "termination_image_id"
].join(",");
const ROUTE_FIELDS = [
    "jo_route_id", "job_order_id", "sequence_order", "work_center_id", "status"
].join(",");
const WORK_CENTER_FIELDS = [
    "work_center_id", "work_center_name", "asset_id.id", "asset_id.asset_type",
    "asset_id.item_id.item_name", "asset_id.serial", "asset_id.barcode"
].join(",");
const STATUS_HISTORY_FIELDS = [
    "history_id", "job_order_id", "old_status", "new_status", "changed_at", "workflow_action", "remarks"
].join(",");
const HISTORY_FIELDS = [
    "id", "asset_id", "started_at", "started_by", "source_type", "source_job_order_id",
    "source_route_id", "source_history_id", "start_reason", "ended_at", "ended_by",
    "restored_condition", "resolution_notes", "recorded_at", "open_asset_key"
].join(",");

export class MachineDowntimeReportError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly code: string
    ) {
        super(message);
        this.name = "MachineDowntimeReportError";
    }
}

class DirectusOperationError extends Error {
    constructor(
        message: string,
        readonly status: number | null,
        readonly responseBody: string
    ) {
        super(message);
        this.name = "DirectusOperationError";
    }
}

function isRecord(value: unknown): value is DirectusRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function relationId(value: unknown, keys: string[]): number | null {
    const raw = isRecord(value)
        ? keys.map((key) => value[key]).find((candidate) => candidate !== undefined && candidate !== null)
        : value;
    const id = Number(raw);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function text(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function dateValue(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value : null;
}

function assetLabel(asset: DirectusRecord): string {
    const item = isRecord(asset.item_id) ? asset.item_id : null;
    return text(item?.item_name)
        || text(asset.serial)
        || text(asset.barcode)
        || text(asset.rfid_code)
        || "Production asset";
}

function urlForItems(collection: string, params: URLSearchParams): string {
    const base = DIRECTUS_URL.replace(/\/+$/, "");
    if (!base) {
        throw new MachineDowntimeReportError("Directus is not configured.", 503, "DIRECTUS_NOT_CONFIGURED");
    }
    return base + "/items/" + collection + "?" + params.toString();
}

async function readRows(
    collection: string,
    fields: string,
    operation: string,
    filters: Record<string, string> = {},
    limit = "-1"
): Promise<DirectusRecord[]> {
    const params = new URLSearchParams({ fields, limit });
    for (const [key, value] of Object.entries(filters)) params.set(key, value);

    let response: Response;
    try {
        response = await fetch(urlForItems(collection, params), { headers, cache: "no-store" });
    } catch (error) {
        throw new DirectusOperationError(operation, null, error instanceof Error ? error.message : String(error));
    }
    const responseBody = await response.text();
    let payload: unknown = null;
    try {
        payload = responseBody ? JSON.parse(responseBody) : null;
    } catch {
        payload = null;
    }
    const data = isRecord(payload) ? payload.data : null;
    if (!response.ok || !Array.isArray(data)) {
        throw new DirectusOperationError(operation, response.status, responseBody);
    }
    return data.filter(isRecord);
}

async function writeItem(
    collection: string,
    id: number | null,
    method: "POST" | "PATCH" | "DELETE",
    body: DirectusRecord | null,
    operation: string
): Promise<DirectusRecord | null> {
    const base = DIRECTUS_URL.replace(/\/+$/, "");
    if (!base) {
        throw new MachineDowntimeReportError("Directus is not configured.", 503, "DIRECTUS_NOT_CONFIGURED");
    }
    const path = "/items/" + collection + (id === null ? "" : "/" + encodeURIComponent(String(id)));
    let response: Response;
    try {
        response = await fetch(base + path, {
            method,
            headers,
            ...(body ? { body: JSON.stringify(body) } : {}),
            cache: "no-store"
        });
    } catch (error) {
        throw new DirectusOperationError(operation, null, error instanceof Error ? error.message : String(error));
    }
    const responseBody = await response.text();
    let payload: unknown = null;
    try {
        payload = responseBody ? JSON.parse(responseBody) : null;
    } catch {
        payload = null;
    }
    if (!response.ok) throw new DirectusOperationError(operation, response.status, responseBody);
    const data = isRecord(payload) && isRecord(payload.data) ? payload.data : null;
    return data;
}

function apiError(error: unknown): MachineDowntimeReportError {
    if (error instanceof MachineDowntimeReportError) return error;
    if (error instanceof DirectusOperationError) {
        console.error(error.message, error.status, error.responseBody);
        if (error.status === 404) {
            return new MachineDowntimeReportError(
                "The maintenance history collection or a required Directus field is not configured.",
                503,
                "MAINTENANCE_HISTORY_SCHEMA_REQUIRED"
            );
        }
        return new MachineDowntimeReportError(
            "Directus could not complete the Machine Downtime Report request.",
            502,
            "DIRECTUS_REQUEST_FAILED"
        );
    }
    console.error("Machine Downtime Report request failed:", error);
    return new MachineDowntimeReportError("The Machine Downtime Report request failed.", 500, "REPORT_REQUEST_FAILED");
}

function routeIsUsed(status: unknown): boolean {
    const normalized = text(status).toLowerCase();
    return normalized === "ongoing" || normalized === "completed";
}

function sortedNewestFirst<T extends DirectusRecord>(rows: T[], field: string): T[] {
    return [...rows].sort((left, right) => {
        const leftTime = Date.parse(text(left[field]) || "") || 0;
        const rightTime = Date.parse(text(right[field]) || "") || 0;
        return rightTime - leftTime;
    });
}

function mapHistory(
    row: DirectusRecord,
    jobOrderNos: Map<number, string>
): MaintenanceEpisode | null {
    const id = relationId(row.id, ["id"]);
    const assetId = relationId(row.asset_id, ["id"]);
    if (!id || !assetId) return null;
    const sourceJobOrderId = relationId(row.source_job_order_id, ["job_order_id", "id"]);
    const sourceType = text(row.source_type).toLowerCase() === "baseline" ? "baseline" : "job_order";
    const endedAt = dateValue(row.ended_at);
    return {
        id,
        assetId,
        startedAt: dateValue(row.started_at),
        startedBy: relationId(row.started_by, ["user_id", "id"]),
        sourceType,
        sourceJobOrderId,
        sourceJobOrderNo: sourceJobOrderId ? jobOrderNos.get(sourceJobOrderId) ?? null : null,
        sourceRouteId: relationId(row.source_route_id, ["jo_route_id", "id"]),
        sourceHistoryId: relationId(row.source_history_id, ["history_id", "id"]),
        startReason: text(row.start_reason) || null,
        endedAt,
        endedBy: relationId(row.ended_by, ["user_id", "id"]),
        restoredCondition: text(row.restored_condition) || null,
        resolutionNotes: text(row.resolution_notes) || null,
        recordedAt: dateValue(row.recorded_at),
        isOpen: endedAt === null
    };
}

function mapTerminalJobOrder(
    row: DirectusRecord,
    historyRows: DirectusRecord[]
): HaltedJobOrderBase {
    const jobOrderId = relationId(row.job_order_id, ["job_order_id", "id"]) ?? 0;
    const history = sortedNewestFirst(
        historyRows.filter((candidate) => {
            if (relationId(candidate.job_order_id, ["job_order_id", "id"]) !== jobOrderId) return false;
            const action = text(candidate.workflow_action).toLowerCase();
            return isCancelledJobOrderStatus(candidate.new_status)
                || action === "cancel"
                || action === "terminate-production";
        }),
        "changed_at"
    );
    const action = text(history[0]?.workflow_action).toLowerCase();
    const isTermination = action.includes("terminat")
        || (!action && row.termination_image_id !== null && row.termination_image_id !== undefined);
    const reason = text(row.cancellation_reason)
        || text(history[0]?.remarks)
        || text(row.remarks)
        || null;
    return {
        jobOrderId,
        jobOrderNo: text(row.job_order_no) || "JO #" + jobOrderId,
        status: text(row.status) || JOB_ORDER_STATUS.CANCELLED,
        eventType: isTermination ? "Termination" : "Cancellation",
        eventAt: dateValue(row.cancelled_at) || dateValue(history[0]?.changed_at),
        reason
    };
}

function mapRouteStep(
    row: DirectusRecord,
    workCenters: Map<number, DirectusRecord>
): RouteStepUsage & { assetId: number | null; assetType: string | null } {
    const routeId = relationId(row.jo_route_id, ["jo_route_id", "id"]) ?? 0;
    const workCenterId = relationId(row.work_center_id, ["work_center_id", "id"]);
    const workCenter = workCenterId ? workCenters.get(workCenterId) : undefined;
    const asset = isRecord(workCenter?.asset_id) ? workCenter.asset_id : null;
    const assetId = relationId(workCenter?.asset_id, ["id"]);
    const assetItem = isRecord(asset?.item_id) ? asset.item_id : null;
    const rawSequence = Number(row.sequence_order);
    return {
        routeId,
        sequenceOrder: Number.isSafeInteger(rawSequence) && rawSequence > 0 ? rawSequence : null,
        status: text(row.status) || "Unspecified",
        workCenterId,
        workCenterName: text(workCenter?.work_center_name)
            || (workCenterId ? "Work center #" + workCenterId : "Work center not recorded"),
        assetName: asset && assetId
            ? text(assetItem?.item_name) || text(asset.serial) || text(asset.barcode) || "Asset #" + assetId
            : null,
        assetId,
        assetType: text(asset?.asset_type) || null
    };
}

export async function loadMachineDowntimeReport(): Promise<MachineDowntimeReportPayload> {
    try {
        const [assetRows, workCenterRows, jobOrderRows, historyRows] = await Promise.all([
            readRows(
                "assets_and_equipment",
                PRODUCTION_ASSET_FIELDS,
                "Load Production assets",
                { "filter[asset_type][_eq]": "Production" }
            ),
            readRows("manufacturing_work_centers", WORK_CENTER_FIELDS, "Load work centers"),
            readRows(
                "manufacturing_job_orders",
                JOB_ORDER_FIELDS,
                "Load halted Job Orders",
                { "filter[status][_in]": "Cancelled,cancelled,Canceled,canceled" }
            ),
            readRows(HISTORY_COLLECTION, HISTORY_FIELDS, "Load maintenance history")
        ]);

        const assignedEmployeeIds = [...new Set(assetRows
            .map((asset) => relationId(asset.employee, ["user_id", "id"]))
            .filter((id): id is number => id !== null))];
        const assignedPersonnelRows = assignedEmployeeIds.length > 0
            ? await readRows(
                "user",
                ASSIGNED_PERSONNEL_FIELDS,
                "Load assigned Production asset personnel",
                { "filter[user_id][_in]": assignedEmployeeIds.join(",") }
            )
            : [];
        const assignedPersonnelById = new Map<number, string>();
        assignedPersonnelRows.forEach((person) => {
            const userId = relationId(person.user_id, ["user_id", "id"]);
            const name = [text(person.user_fname), text(person.user_lname)].filter(Boolean).join(" ");
            if (userId && name) assignedPersonnelById.set(userId, name);
        });

        const jobOrders = jobOrderRows.filter((row) => isCancelledJobOrderStatus(row.status));
        const jobOrderIds = jobOrders
            .map((row) => relationId(row.job_order_id, ["job_order_id", "id"]))
            .filter((id): id is number => id !== null);
        const jobOrderIdFilter = jobOrderIds.join(",");
        const [routeRows, statusHistoryRows] = jobOrderIds.length > 0
            ? await Promise.all([
                readRows(
                    "manufacturing_job_order_routes",
                    ROUTE_FIELDS,
                    "Load Job Order route steps",
                    { "filter[job_order_id][_in]": jobOrderIdFilter }
                ),
                readRows(
                    "manufacturing_job_order_status_history",
                    STATUS_HISTORY_FIELDS,
                    "Load termination and cancellation events",
                    { "filter[job_order_id][_in]": jobOrderIdFilter }
                )
            ])
            : [[], []];

        const assetsById = new Map<number, DirectusRecord>();
        assetRows.forEach((asset) => {
            const id = relationId(asset.id, ["id"]);
            if (id) assetsById.set(id, asset);
        });
        const workCentersById = new Map<number, DirectusRecord>();
        workCenterRows.forEach((workCenter) => {
            const id = relationId(workCenter.work_center_id, ["work_center_id", "id"]);
            if (id) workCentersById.set(id, workCenter);
        });
        const jobOrderNos = new Map<number, string>();
        jobOrders.forEach((jobOrder) => {
            const id = relationId(jobOrder.job_order_id, ["job_order_id", "id"]);
            if (id) jobOrderNos.set(id, text(jobOrder.job_order_no) || "JO #" + id);
        });

        const routesByJobOrder = new Map<number, Array<RouteStepUsage & { assetId: number | null; assetType: string | null }>>();
        routeRows.forEach((route) => {
            const jobOrderId = relationId(route.job_order_id, ["job_order_id", "id"]);
            if (!jobOrderId) return;
            const rows = routesByJobOrder.get(jobOrderId) ?? [];
            rows.push(mapRouteStep(route, workCentersById));
            routesByJobOrder.set(jobOrderId, rows);
        });

        const relatedJobsByAsset = new Map<number, Map<number, AssetHaltedJobOrder>>();
        for (const jobOrder of jobOrders) {
            const jobOrderId = relationId(jobOrder.job_order_id, ["job_order_id", "id"]);
            if (!jobOrderId) continue;
            const base = mapTerminalJobOrder(jobOrder, statusHistoryRows);
            const routeSteps = routesByJobOrder.get(jobOrderId) ?? [];
            const linkedProductionSteps = routeSteps.filter((step) =>
                routeIsUsed(step.status) && step.assetId !== null && assetsById.has(step.assetId)
            );
            if (linkedProductionSteps.length === 0) continue;
            for (const step of linkedProductionSteps) {
                const assetId = step.assetId;
                if (assetId === null) continue;
                const assetJobs = relatedJobsByAsset.get(assetId) ?? new Map<number, AssetHaltedJobOrder>();
                const existing = assetJobs.get(jobOrderId);
                const visibleStep: RouteStepUsage = {
                    routeId: step.routeId,
                    sequenceOrder: step.sequenceOrder,
                    status: step.status,
                    workCenterId: step.workCenterId,
                    workCenterName: step.workCenterName,
                    assetName: step.assetName
                };
                if (existing) existing.routeSteps.push(visibleStep);
                else assetJobs.set(jobOrderId, { ...base, routeSteps: [visibleStep] });
                relatedJobsByAsset.set(assetId, assetJobs);
            }
        }

        const episodes = historyRows
            .map((row) => mapHistory(row, jobOrderNos))
            .filter((episode): episode is MaintenanceEpisode => episode !== null);
        const episodesByAsset = new Map<number, MaintenanceEpisode[]>();
        episodes.forEach((episode) => {
            const rows = episodesByAsset.get(episode.assetId) ?? [];
            rows.push(episode);
            episodesByAsset.set(episode.assetId, rows);
        });

        const assets: MachineAssetReport[] = [...assetsById.entries()]
            .map(([assetId, asset]) => {
                const item = isRecord(asset.item_id) ? asset.item_id : null;
                const classification = isRecord(item?.item_classification) ? item.item_classification : null;
                const classificationName = text(classification?.classification_name) || "N/A";
                const assignedEmployeeId = relationId(asset.employee, ["user_id", "id"]);
                const assignedToName = assignedEmployeeId
                    ? assignedPersonnelById.get(assignedEmployeeId) || "Personnel unavailable"
                    : "Unassigned";
                const assetEpisodes = (episodesByAsset.get(assetId) ?? [])
                    .sort((left, right) => Date.parse(right.recordedAt || right.startedAt || "") - Date.parse(left.recordedAt || left.startedAt || ""));
                const openEpisode = assetEpisodes.find((episode) => episode.isOpen) ?? null;
                const condition = text(asset.condition) || "Unknown";
                return {
                    assetId,
                    assetName: assetLabel(asset),
                    assetType: text(asset.asset_type) || "Production",
                    classificationName,
                    assignedToName,
                    condition,
                    trackedEpisodeCount: assetEpisodes.length,
                    history: assetEpisodes,
                    openEpisode,
                    haltedJobOrders: [...(relatedJobsByAsset.get(assetId)?.values() ?? [])]
                        .sort((left, right) => (Date.parse(right.eventAt || "") || 0) - (Date.parse(left.eventAt || "") || 0)),
                    historyMismatch: (condition === "Under Maintenance") !== Boolean(openEpisode)
                };
            })
            .sort((left, right) => left.assetName.localeCompare(right.assetName));

        return { assets, preRolloutHistoryAvailable: false };
    } catch (error) {
        throw apiError(error);
    }
}

async function getOne(
    collection: string,
    fields: string,
    filters: Record<string, string>,
    operation: string
): Promise<DirectusRecord | null> {
    const rows = await readRows(collection, fields, operation, filters, "1");
    return rows[0] ?? null;
}

async function getTerminalHistory(jobOrderId: number): Promise<DirectusRecord | null> {
    const rows = await readRows(
        "manufacturing_job_order_status_history",
        STATUS_HISTORY_FIELDS,
        "Verify the Job Order termination or cancellation",
        { "filter[job_order_id][_eq]": String(jobOrderId) }
    );
    return sortedNewestFirst(rows.filter((row) =>
        isCancelledJobOrderStatus(row.new_status)
        || ["cancel", "terminate-production"].includes(text(row.workflow_action).toLowerCase())
    ), "changed_at")[0] ?? null;
}

export async function startMachineMaintenance(
    input: { assetId: number; jobOrderId: number; routeId: number },
    actorUserId: number
): Promise<{ episodeId: number | null }> {
    try {
        const [asset, jobOrder, route] = await Promise.all([
            getOne(
                "assets_and_equipment",
                PRODUCTION_ASSET_FIELDS,
                { "filter[id][_eq]": String(input.assetId) },
                "Load selected Production asset"
            ),
            getOne(
                "manufacturing_job_orders",
                JOB_ORDER_FIELDS,
                { "filter[job_order_id][_eq]": String(input.jobOrderId) },
                "Load selected halted Job Order"
            ),
            getOne(
                "manufacturing_job_order_routes",
                ROUTE_FIELDS,
                { "filter[jo_route_id][_eq]": String(input.routeId) },
                "Load selected Job Order route"
            )
        ]);
        if (!asset || text(asset.asset_type) !== "Production") {
            throw new MachineDowntimeReportError("The selected asset is not a Production asset.", 422, "PRODUCTION_ASSET_REQUIRED");
        }
        if (!jobOrder || !isCancelledJobOrderStatus(jobOrder.status)) {
            throw new MachineDowntimeReportError("Select a Job Order with a recorded termination or cancellation.", 422, "HALTED_JOB_ORDER_REQUIRED");
        }
        if (!route || relationId(route.job_order_id, ["job_order_id", "id"]) !== input.jobOrderId) {
            throw new MachineDowntimeReportError("The selected route does not belong to this Job Order.", 422, "JOB_ORDER_ROUTE_MISMATCH");
        }
        if (!routeIsUsed(route.status)) {
            throw new MachineDowntimeReportError("Only Ongoing or Completed route steps can be linked to a machine.", 422, "ROUTE_STEP_NOT_USED");
        }
        const workCenterId = relationId(route.work_center_id, ["work_center_id", "id"]);
        if (!workCenterId) {
            throw new MachineDowntimeReportError("The selected route has no work center.", 422, "ROUTE_WORK_CENTER_REQUIRED");
        }
        const workCenter = await getOne(
            "manufacturing_work_centers",
            WORK_CENTER_FIELDS,
            { "filter[work_center_id][_eq]": String(workCenterId) },
            "Verify route work center"
        );
        if (relationId(workCenter?.asset_id, ["id"]) !== input.assetId) {
            throw new MachineDowntimeReportError("The selected route work center is not linked to this asset.", 422, "ROUTE_ASSET_MISMATCH");
        }

        const existingEpisode = await getOne(
            HISTORY_COLLECTION,
            HISTORY_FIELDS,
            { "filter[open_asset_key][_eq]": String(input.assetId) },
            "Check for an open maintenance episode"
        );
        if (existingEpisode) {
            throw new MachineDowntimeReportError("This asset already has an open maintenance episode.", 409, "MAINTENANCE_EPISODE_ALREADY_OPEN");
        }

        const sourceHistory = await getTerminalHistory(input.jobOrderId);
        if (!sourceHistory && !dateValue(jobOrder.cancelled_at)) {
            throw new MachineDowntimeReportError(
                "The selected Job Order has no recorded termination or cancellation event.",
                422,
                "TERMINAL_EVENT_REQUIRED"
            );
        }
        const now = new Date().toISOString();
        const reason = text(jobOrder.cancellation_reason)
            || text(sourceHistory?.remarks)
            || "Maintenance reported from a terminated or cancelled Job Order.";
        const created = await writeItem(HISTORY_COLLECTION, null, "POST", {
            asset_id: input.assetId,
            started_at: now,
            started_by: actorUserId,
            source_type: "job_order",
            source_job_order_id: input.jobOrderId,
            source_route_id: input.routeId,
            source_history_id: relationId(sourceHistory?.history_id, ["history_id", "id"]),
            start_reason: reason,
            ended_at: null,
            ended_by: null,
            restored_condition: null,
            resolution_notes: null,
            recorded_at: now,
            open_asset_key: String(input.assetId)
        }, "Create maintenance history");
        let episodeId = relationId(created?.id, ["id"]);
        if (!episodeId) {
            try {
                const inserted = await getOne(
                    HISTORY_COLLECTION,
                    HISTORY_FIELDS,
                    { "filter[open_asset_key][_eq]": String(input.assetId) },
                    "Find created maintenance history"
                );
                episodeId = relationId(inserted?.id, ["id"]);
            } catch {
                throw new MachineDowntimeReportError(
                    "The maintenance history may have been created, but its record could not be confirmed. Reconcile this asset before retrying.",
                    502,
                    "MAINTENANCE_START_PARTIAL_WRITE"
                );
            }
        }
        if (!episodeId) {
            throw new MachineDowntimeReportError(
                "The maintenance history was created, but its record could not be confirmed. Reconcile this asset before retrying.",
                502,
                "MAINTENANCE_START_PARTIAL_WRITE"
            );
        }
        try {
            await writeItem("assets_and_equipment", input.assetId, "PATCH", { condition: "Under Maintenance" }, "Mark asset Under Maintenance");
        } catch (error) {
            let rolledBack = false;
            if (episodeId) {
                try {
                    await writeItem(HISTORY_COLLECTION, episodeId, "DELETE", null, "Roll back maintenance history");
                    rolledBack = true;
                } catch {
                    rolledBack = false;
                }
            }
            if (!rolledBack) {
                throw new MachineDowntimeReportError(
                    "The history record was created but the asset condition could not be updated. Reconcile this asset's history.",
                    502,
                    "MAINTENANCE_START_PARTIAL_WRITE"
                );
            }
            throw error;
        }
        return { episodeId };
    } catch (error) {
        if (error instanceof DirectusOperationError && error.status === 400 && /unique|duplicate/i.test(error.responseBody)) {
            throw new MachineDowntimeReportError("This asset already has an open maintenance episode.", 409, "MAINTENANCE_EPISODE_ALREADY_OPEN");
        }
        throw apiError(error);
    }
}

export async function closeMachineMaintenance(
    input: { assetId: number; restoredCondition: "Good" | "Bad" | "Discontinued"; resolutionNotes?: string },
    actorUserId: number
): Promise<{ episodeId: number }> {
    try {
        const openEpisode = await getOne(
            HISTORY_COLLECTION,
            HISTORY_FIELDS,
            { "filter[open_asset_key][_eq]": String(input.assetId) },
            "Load open maintenance episode"
        );
        const episodeId = relationId(openEpisode?.id, ["id"]);
        if (!openEpisode || !episodeId || dateValue(openEpisode.ended_at)) {
            throw new MachineDowntimeReportError("This asset has no open maintenance episode to close.", 409, "OPEN_MAINTENANCE_EPISODE_REQUIRED");
        }

        const now = new Date().toISOString();
        await writeItem(HISTORY_COLLECTION, episodeId, "PATCH", {
            ended_at: now,
            ended_by: actorUserId,
            restored_condition: input.restoredCondition,
            resolution_notes: input.resolutionNotes?.trim() || null,
            open_asset_key: null
        }, "Close maintenance history");
        try {
            await writeItem("assets_and_equipment", input.assetId, "PATCH", { condition: input.restoredCondition }, "Update restored asset condition");
        } catch {
            try {
                await writeItem(HISTORY_COLLECTION, episodeId, "PATCH", {
                    ended_at: null,
                    ended_by: null,
                    restored_condition: null,
                    resolution_notes: null,
                    open_asset_key: String(input.assetId)
                }, "Roll back maintenance history close");
            } catch {
                throw new MachineDowntimeReportError(
                    "The maintenance history was closed but the asset condition could not be updated. Reconcile this asset's history.",
                    502,
                    "MAINTENANCE_CLOSE_PARTIAL_WRITE"
                );
            }
            throw new MachineDowntimeReportError(
                "The asset condition could not be updated; the maintenance episode remains open.",
                502,
                "ASSET_CONDITION_UPDATE_FAILED"
            );
        }
        return { episodeId };
    } catch (error) {
        throw apiError(error);
    }
}
