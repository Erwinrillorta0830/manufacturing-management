/* eslint-disable */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers, getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";
import { isCancelledJobOrderStatus, isJobOrderStatus, isTerminalJobOrderStatus, JOB_ORDER_STATUS, normalizeJobOrderStatus } from "@/modules/manufacturing-management/job-order-status";
import { executeJobOrderWorkflow } from "../../job-orders/_workflow-service";
import { resolveApplicableRouteWorkCenters, resolveApplicableWorkCenterIds } from "./_applicable-work-centers";
import { fetchWorkCenterJobOrderAvailability } from "./_work-center-availability";

interface UserRecord {
    user_id: number;
    user_fname?: string;
    user_lname?: string;
}

const STATION_WORK_CENTER_FIELDS = [
    "work_center_id",
    "work_center_name",
    "is_active",
    "asset_id.id",
    "asset_id.item_image",
    "asset_id.barcode",
    "asset_id.rfid_code",
    "asset_id.serial",
    "asset_id.condition",
    "asset_id.item_id.id",
    "asset_id.item_id.item_name",
    "department_id.department_id",
    "department_id.department_name",
    "asset_id.department.department_id",
    "asset_id.department.department_name"
].join(",");

const STATUS_HISTORY_FIELDS = [
    "history_id",
    "job_order_id",
    "old_status",
    "new_status",
    "changed_by",
    "changed_at",
    "remarks",
    "workflow_action",
    "work_center_id"
].join(",");

const LEGACY_STATUS_HISTORY_FIELDS = [
    "history_id",
    "job_order_id",
    "old_status",
    "new_status",
    "changed_by",
    "changed_at",
    "remarks"
].join(",");

class DirectusRequestError extends Error {
    constructor(
        public readonly operation: string,
        public readonly upstreamStatus: number | null,
        public readonly responseBody: string
    ) {
        super(`${operation}${upstreamStatus ? ` failed with HTTP ${upstreamStatus}` : " failed"}`);
        this.name = "DirectusRequestError";
    }
}

async function directusData<T>(url: string, operation: string, init: RequestInit = {}): Promise<T> {
    let response: Response;

    try {
        response = await fetch(url, {
            ...init,
            headers,
            cache: "no-store"
        });
    } catch (error) {
        throw new DirectusRequestError(operation, null, error instanceof Error ? error.message : String(error));
    }

    const responseBody = await response.text();
    let payload: any = null;

    try {
        payload = responseBody ? JSON.parse(responseBody) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        throw new DirectusRequestError(operation, response.status, responseBody);
    }

    if (!payload || payload.data === undefined || payload.data === null) {
        throw new DirectusRequestError(operation, response.status, responseBody || "No response data");
    }

    return payload.data as T;
}

function asPositiveInteger(value: unknown): number | null {
    const rawValue = value && typeof value === "object"
        ? (value as any).work_center_id ?? (value as any).id
        : value;
    const numericValue = Number(rawValue);
    return Number.isInteger(numericValue) && numericValue > 0 ? numericValue : null;
}

function parseStationScanRemark(remarks: unknown): { workCenterId: number; workCenterName: string | null } | null {
    if (typeof remarks !== "string") return null;

    const match = remarks.match(/^\s*Station Start Scanner:\s*.*?Work Center\s+"([^"]+)"\s+\(ID:\s*(\d+)\)\s*$/i);
    const workCenterId = asPositiveInteger(match?.[2]);
    if (!match || !workCenterId) return null;

    return {
        workCenterId,
        workCenterName: match[1].trim() || null
    };
}

function resolveHistoryWorkCenter(historyRecord: any, workCenterMap: Map<number, string>) {
    const persistedWorkCenterId = asPositiveInteger(historyRecord?.work_center_id);
    if (persistedWorkCenterId) {
        return {
            workCenterId: persistedWorkCenterId,
            workCenterName: workCenterMap.get(persistedWorkCenterId) || `Station #${persistedWorkCenterId}`
        };
    }

    const legacyStation = parseStationScanRemark(historyRecord?.remarks);
    if (legacyStation) {
        return {
            workCenterId: legacyStation.workCenterId,
            workCenterName: workCenterMap.get(legacyStation.workCenterId)
                || legacyStation.workCenterName
                || `Station #${legacyStation.workCenterId}`
        };
    }

    return { workCenterId: null, workCenterName: "Unassigned" };
}

function historyUrl(fields: string, jobOrderId?: string | number) {
    const params = new URLSearchParams({
        limit: jobOrderId === undefined ? "100" : "-1",
        sort: "-changed_at",
        fields
    });
    if (jobOrderId !== undefined && jobOrderId !== null && String(jobOrderId).trim() !== "") {
        params.set("filter[job_order_id][_eq]", String(jobOrderId));
    }
    return `${DIRECTUS_URL}/items/manufacturing_job_order_status_history?${params.toString()}`;
}

async function fetchStatusHistoryRows(jobOrderId?: string | number, allowLegacyProjection = false): Promise<any[]> {
    try {
        const rows = await directusData<any[]>(
            historyUrl(STATUS_HISTORY_FIELDS, jobOrderId),
            "Station status-history lookup"
        );
        return Array.isArray(rows) ? rows : [];
    } catch (error) {
        const canUseLegacyProjection = allowLegacyProjection
            && error instanceof DirectusRequestError
            && [400, 403].includes(error.upstreamStatus || 0)
            && /work_center_id|field|permission|does not exist/i.test(error.responseBody);

        if (!canUseLegacyProjection) throw error;

        const rows = await directusData<any[]>(
            historyUrl(LEGACY_STATUS_HISTORY_FIELDS, jobOrderId),
            "Legacy station status-history lookup"
        );
        return Array.isArray(rows) ? rows : [];
    }
}

function enrichHistoryRecord(historyRecord: any, userMap: Map<number, string>, workCenterMap: Map<number, string>) {
    const station = resolveHistoryWorkCenter(historyRecord, workCenterMap);
    return {
        ...historyRecord,
        work_center_id: station.workCenterId,
        previous_status: historyRecord.previous_status ?? historyRecord.old_status ?? null,
        status: historyRecord.status ?? historyRecord.new_status ?? "",
        changed_by_name: userMap.get(Number(historyRecord.changed_by))
            || (historyRecord.changed_by ? `User #${historyRecord.changed_by}` : "System"),
        work_center_name: station.workCenterName
    };
}

function validateStationHistoryRecord(record: any, expected: {
    jobOrderId: number;
    workCenterId: number;
    oldStatus: string;
    newStatus: string;
    changedBy: number;
    changedAt: string;
    remarks: string;
}) {
    const persistedWorkCenterId = asPositiveInteger(record?.work_center_id);
    const persistedJobOrderId = asPositiveInteger(record?.job_order_id);
    const changedAt = typeof record?.changed_at === "string" ? record.changed_at.trim() : "";

    if (persistedJobOrderId !== expected.jobOrderId
        || persistedWorkCenterId !== expected.workCenterId
        || String(record?.old_status ?? "") !== expected.oldStatus
        || String(record?.new_status ?? "") !== expected.newStatus
        || Number(record?.changed_by) !== expected.changedBy
        || !changedAt
        || Number.isNaN(Date.parse(changedAt))
        || String(record?.remarks ?? "") !== expected.remarks) {
        throw new Error("Station status-history insert did not persist the complete station audit record.");
    }
}

function directusErrorResponse(error: unknown, fallbackMessage: string) {
    if (error instanceof DirectusRequestError) {
        console.error(`${error.message}:`, error.responseBody.slice(0, 2000));
        return NextResponse.json({ success: false, error: fallbackMessage }, { status: 502 });
    }

    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return NextResponse.json({ success: false, error: message || fallbackMessage }, { status: 500 });
}

// Helper to decode user ID from session cookie
async function getUserIdFromSession(): Promise<number> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        if (token) {
            const parts = token.split(".");
            if (parts.length >= 2) {
                let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                while (base64.length % 4) base64 += "=";
                const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
                const tokenPayload = JSON.parse(jsonPayload);
                const id = tokenPayload?.id || tokenPayload?.user_id || tokenPayload?.sub;
                if (id && !isNaN(Number(id))) return Number(id);
            }
        }
    } catch (err) {
        console.error("Error decoding session in station scan:", err);
    }
    return 24;
}

// GET: Fetch work centers, status history, and active stations
function normalizeWorkCenterRecord(wc: any) {
    const asset = wc.asset_id && typeof wc.asset_id === "object" ? wc.asset_id : null;
    const barcode = asset?.barcode || asset?.rfid_code || asset?.serial || `WC-${String(wc.work_center_id).padStart(3, "0")}`;
    const department = asset?.department && typeof asset.department === "object"
        ? asset.department
        : wc.department_id && typeof wc.department_id === "object"
            ? wc.department_id
            : null;

    return {
        ...wc,
        barcode,
        rfid_code: asset?.rfid_code || null,
        serial: asset?.serial || null,
        is_active: wc.is_active === undefined || wc.is_active === null ? true : Boolean(Number(wc.is_active)),
        asset: asset
            ? {
                id: Number(asset.id) || undefined,
                item_image: asset.item_image || null,
                barcode: asset.barcode || null,
                rfid_code: asset.rfid_code || null,
                serial: asset.serial || null,
                item_name: asset.item_id?.item_name || null,
                item_id: asset.item_id || null,
                condition: asset.condition || null,
                is_active: asset.is_active === undefined || asset.is_active === null
                    ? true
                    : Boolean(Number(asset.is_active))
            }
            : null,
        department
    };
}

async function fetchMappedWorkCenters(extraFilter = ""): Promise<any[]> {
    const wcData = await directusData<any[]>(
        `${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&sort=work_center_name&fields=${STATION_WORK_CENTER_FIELDS}${extraFilter}`,
        "Station work-center lookup"
    );

    if (!Array.isArray(wcData)) {
        throw new Error("Station work-center lookup returned an invalid data set.");
    }

    return wcData.map(normalizeWorkCenterRecord);
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const joId = searchParams.get("joId");
        const action = searchParams.get("action");

        // Fetch the active Job Orders assigned to each workstation. This is a
        // read-only view for the station selector; it does not claim or start
        // any Job Order.
        if (action === "work-center-availability") {
            const workCenterId = asPositiveInteger(searchParams.get("workCenterId"));
            const branchId = asPositiveInteger(searchParams.get("branchId"));
            const data = await fetchWorkCenterJobOrderAvailability({ workCenterId, branchId });
            return NextResponse.json({ success: true, data });
        }

        // 0. Fetch the work centers applicable to a Job Order's product version
        // routing so the scanner can only offer valid stations.
        if (action === "applicable-work-centers" && joId) {
            const joRows = await directusData<any[]>(
                `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_id][_eq]=${encodeURIComponent(joId)}&fields=job_order_id,version_id&limit=1`,
                "Station job-order version lookup"
            );
            const jobOrder = Array.isArray(joRows) ? joRows[0] : null;
            if (!jobOrder) {
                return NextResponse.json({
                    success: false,
                    error: `Job Order ${joId} was not found.`
                }, { status: 404 });
            }

            const [applicable, routeOptions] = await Promise.all([
                resolveApplicableWorkCenterIds(jobOrder),
                resolveApplicableRouteWorkCenters(jobOrder)
            ]);
            if (applicable.source === "NONE" || applicable.workCenterIds.length === 0) {
                return NextResponse.json({
                    success: true,
                    data: [],
                    applicableWorkCenterIds: [],
                    source: "NONE",
                    routeOptions
                });
            }

            const data = await fetchMappedWorkCenters(
                `&filter[work_center_id][_in]=${applicable.workCenterIds.join(",")}&filter[is_active][_eq]=1`
            );

            return NextResponse.json({
                success: true,
                data,
                applicableWorkCenterIds: applicable.workCenterIds,
                source: applicable.source,
                routeOptions
            });
        }

        // 1. Fetch status history for a specific Job Order
        if (action === "history" || joId) {
            const [historyList, usersRes, wcRes] = await Promise.all([
                fetchStatusHistoryRows(joId || undefined, true).catch((error) => {
                    console.error("Error fetching station status history:", error);
                    return [];
                }),
                fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&fields=work_center_id,work_center_name`, { headers, cache: "no-store" }).catch(() => null)
            ]);

            const users = usersRes && usersRes.ok ? (await usersRes.json()).data || [] : [];
            const workCenters = wcRes && wcRes.ok ? (await wcRes.json()).data || [] : [];

            const userMap = new Map<number, string>();
            users.forEach((u: any) => {
                const name = [u.user_fname, u.user_lname].filter(Boolean).join(" ") || `User #${u.user_id}`;
                userMap.set(Number(u.user_id), name);
            });

            const wcMap = new Map<number, string>();
            workCenters.forEach((wc: any) => {
                wcMap.set(Number(wc.work_center_id), wc.work_center_name);
            });

            const enrichedHistory = historyList.map((h: any) => enrichHistoryRecord(h, userMap, wcMap));

            return NextResponse.json({ success: true, data: enrichedHistory });
        }

        // 2. Fetch all active work centers with barcodes. Keep this projection
        // aligned with the POST resolver and avoid unsupported relation paths.
        const mappedWorkCenters = await fetchMappedWorkCenters();

        return NextResponse.json({ success: true, data: mappedWorkCenters });
    } catch (e: any) {
        console.error("Error in station-scan GET API:", e);
        return directusErrorResponse(e, "Work-center lookup is temporarily unavailable. Please try again.");
    }
}

// POST: Process Station Start Scan (Work Center Barcode + Job Order Batch Barcode)
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { workCenterBarcode, jobOrderBarcode, workCenterId, jobOrderId, joRouteId } = body;
        const hasWorkCenterId = workCenterId !== undefined && workCenterId !== null && String(workCenterId).trim() !== "";
        const hasJobOrderId = jobOrderId !== undefined && jobOrderId !== null && String(jobOrderId).trim() !== "";
        const hasJoRouteId = joRouteId !== undefined && joRouteId !== null && String(joRouteId).trim() !== "";

        const currentUserId = await getUserIdFromSession();
        const manilaTimestamp = await getISOStringInConfiguredTimezone();

        // 1. Fetch work centers using only fields supported by the Directus schema.
        const allWorkCenters = (await directusData<any[]>(
            `${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&sort=work_center_name&fields=${STATION_WORK_CENTER_FIELDS}`,
            "Station work-center lookup"
        )).map(normalizeWorkCenterRecord);

        if (!Array.isArray(allWorkCenters)) {
            throw new Error("Station work-center lookup returned an invalid data set.");
        }

        let matchedWorkCenter: any = null;

        if (hasWorkCenterId) {
            matchedWorkCenter = allWorkCenters.find((w: any) => Number(w.work_center_id) === Number(workCenterId));
        }

        if (!matchedWorkCenter && workCenterBarcode) {
            const rawCode = String(workCenterBarcode).trim().toUpperCase();
            matchedWorkCenter = allWorkCenters.find((w: any) => {
                const asset = w.asset_id && typeof w.asset_id === "object" ? w.asset_id : null;
                const assetBarcode = asset?.barcode ? String(asset.barcode).trim().toUpperCase() : "";
                const assetRfid = asset?.rfid_code ? String(asset.rfid_code).trim().toUpperCase() : "";
                const assetSerial = asset?.serial ? String(asset.serial).trim().toUpperCase() : "";
                const wcCode = `WC-${String(w.work_center_id).padStart(3, "0")}`.toUpperCase();
                const wcCodeShort = `WC-${w.work_center_id}`.toUpperCase();
                const wcName = String(w.work_center_name || "").trim().toUpperCase();
                const wcIdStr = String(w.work_center_id);

                return (
                    assetBarcode === rawCode ||
                    assetRfid === rawCode ||
                    assetSerial === rawCode ||
                    wcCode === rawCode ||
                    wcCodeShort === rawCode ||
                    wcName === rawCode ||
                    wcIdStr === rawCode
                );
            });
        }

        // 2. Fetch Job Orders to resolve the Job Order.
        const joFilterQuery = hasJobOrderId
            ? `filter[job_order_id][_eq]=${encodeURIComponent(String(jobOrderId))}`
            : "";
        const joUrl = `${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1&sort=-job_order_id${joFilterQuery ? "&" + joFilterQuery : ""}`;
        const allJos = await directusData<any[]>(joUrl, "Station job-order lookup");

        if (!Array.isArray(allJos)) {
            throw new Error("Station job-order lookup returned an invalid data set.");
        }

        let matchedJobOrder: any = null;

        if (hasJobOrderId) {
            matchedJobOrder = allJos.find((j: any) => Number(j.job_order_id) === Number(jobOrderId));
        }

        if (!matchedJobOrder && jobOrderBarcode) {
            const rawJoCode = String(jobOrderBarcode).trim().toUpperCase();
            matchedJobOrder = allJos.find((j: any) => {
                const joNo = String(j.job_order_no || "").trim().toUpperCase();
                const joIdStr = String(j.job_order_id || "");
                const joBatchPattern = `JO-${joNo}`.toUpperCase();
                return joNo === rawJoCode || joIdStr === rawJoCode || joBatchPattern === rawJoCode || rawJoCode.includes(joNo);
            });
        }

        // If neither was matched, return a specific error.
        if (!matchedWorkCenter && workCenterBarcode) {
            return NextResponse.json({
                success: false,
                error: `Work Center not found for scanned barcode "${workCenterBarcode}". Please verify work center station code.`
            }, { status: 404 });
        }

        if (!matchedJobOrder && jobOrderBarcode) {
            return NextResponse.json({
                success: false,
                error: `Job Order not found for scanned barcode "${jobOrderBarcode}". Please verify batch code.`
            }, { status: 404 });
        }

        // Preserve the two-step scan behavior when only one side is identified.
        if (!matchedJobOrder) {
            return NextResponse.json({
                success: true,
                message: "Work Center station identified. Please scan Job Order Batch Barcode to start station.",
                workCenter: matchedWorkCenter
            });
        }

        if (!matchedWorkCenter) {
            return NextResponse.json({
                success: true,
                message: `Job Order ${matchedJobOrder.job_order_no} identified. Please scan Work Center station barcode.`,
                jobOrder: matchedJobOrder
            });
        }

        const jobOrderIdNumber = Number(matchedJobOrder.job_order_id);
        const workCenterIdNumber = Number(matchedWorkCenter.work_center_id);
        const requestedJoRouteId = hasJoRouteId ? Number(joRouteId) : null;
        if (!Number.isInteger(jobOrderIdNumber) || jobOrderIdNumber <= 0 || !Number.isInteger(workCenterIdNumber) || workCenterIdNumber <= 0) {
            return NextResponse.json({
                success: false,
                error: "The scanned job order or work center has an invalid identifier."
            }, { status: 422 });
        }
        if (hasJoRouteId && (!Number.isInteger(requestedJoRouteId) || Number(requestedJoRouteId) <= 0)) {
            return NextResponse.json({
                success: false,
                error: "The selected routing step has an invalid identifier."
            }, { status: 422 });
        }

        // Enforce the production gate before loading routing or changing any
        // station records. Only fully staged Picked JOs may start production;
        // an already active JO may check into another station.
        const oldStatus = normalizeJobOrderStatus(matchedJobOrder.status || JOB_ORDER_STATUS.DRAFT);
        if (!oldStatus) {
            return NextResponse.json({
                success: false,
                error: `Job Order ${matchedJobOrder.job_order_no || jobOrderIdNumber} has an unknown status and cannot be transitioned.`
            }, { status: 409 });
        }
        if (isTerminalJobOrderStatus(oldStatus) || isCancelledJobOrderStatus(oldStatus)) {
            return NextResponse.json({
                success: false,
                error: `Job Order ${matchedJobOrder.job_order_no || jobOrderIdNumber} is ${oldStatus.toLowerCase()} and cannot be restarted.`
            }, { status: 409 });
        }
        if (isJobOrderStatus(oldStatus, JOB_ORDER_STATUS.ON_HOLD, JOB_ORDER_STATUS.QA_HOLD)) {
            return NextResponse.json({
                success: false,
                error: `Job Order ${matchedJobOrder.job_order_no || jobOrderIdNumber} is on hold and cannot be started until the hold is resolved.`,
                code: "PRODUCTION_ON_HOLD"
            }, { status: 409 });
        }
        if (isJobOrderStatus(oldStatus, JOB_ORDER_STATUS.PRODUCTION_COMPLETED, JOB_ORDER_STATUS.FOR_QA_RECONCILIATION)) {
            return NextResponse.json({
                success: false,
                error: `Job Order ${matchedJobOrder.job_order_no || jobOrderIdNumber} has completed production and cannot be restarted.`,
                code: "PRODUCTION_COMPLETED"
            }, { status: 409 });
        }

        const isAlreadyActive = isJobOrderStatus(oldStatus, JOB_ORDER_STATUS.IN_PRODUCTION);
        if (!isAlreadyActive && !isJobOrderStatus(oldStatus, JOB_ORDER_STATUS.PICKED)) {
            return NextResponse.json({
                success: false,
                error: `Job Order ${matchedJobOrder.job_order_no || jobOrderIdNumber} must be Picked before production can start. Complete material staging first.`,
                code: "JOB_ORDER_NOT_PICKED"
            }, { status: 409 });
        }

        // Enforce the product-version routing: a Job Order may only start (or
        // check in) at a work station that is part of its applicable routing.
        const applicableStations = await resolveApplicableWorkCenterIds(matchedJobOrder);
        if (applicableStations.workCenterIds.length === 0) {
            return NextResponse.json({
                success: false,
                error: `No work stations are configured for Job Order ${matchedJobOrder.job_order_no || jobOrderIdNumber}'s product version routing. Configure the routing in Finished Goods Master → Version Management before starting production.`,
                code: "WORK_CENTER_ROUTING_NOT_CONFIGURED"
            }, { status: 409 });
        }
        if (!applicableStations.workCenterIds.includes(workCenterIdNumber)) {
            const applicableLabels = applicableStations.workCenterIds
                .map((id) => {
                    const center = allWorkCenters.find((w: any) => Number(w.work_center_id) === id);
                    return center ? `${center.work_center_name} (ID: ${id})` : `Work Center #${id}`;
                })
                .join(", ");
            return NextResponse.json({
                success: false,
                error: `Work Center "${matchedWorkCenter.work_center_name}" is not part of Job Order ${matchedJobOrder.job_order_no || jobOrderIdNumber}'s routing. Applicable stations: ${applicableLabels}.`,
                code: "WORK_CENTER_NOT_APPLICABLE",
                applicableWorkCenterIds: applicableStations.workCenterIds
            }, { status: 409 });
        }

        // 3. Resolve the active routing step before changing any records.
        const routes = await directusData<any[]>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${jobOrderIdNumber}&sort=sequence_order&limit=-1`,
            "Station routing lookup"
        );

        if (!Array.isArray(routes)) {
            throw new Error("Station routing lookup returned an invalid data set.");
        }

        const isOpenRoute = (route: any) => {
            const status = String(route.status || "").trim().toLowerCase();
            return !status || status === "pending" || status === "ongoing" || status === "in progress";
        };
        const openRoutes = routes.filter((route: any) => isOpenRoute(route));
        const routeOptions = await resolveApplicableRouteWorkCenters(matchedJobOrder);
        let activeOperation = requestedJoRouteId
            ? routes.find((route: any) => Number(route.jo_route_id || route.id) === requestedJoRouteId && isOpenRoute(route))
            : routes.find((route: any) => Number(route.work_center_id) === workCenterIdNumber && isOpenRoute(route));

        if (!requestedJoRouteId && openRoutes.length > 1) {
            return NextResponse.json({
                success: false,
                error: "Select a routing step before starting a Job Order with multiple open routes.",
                code: "ROUTE_SELECTION_REQUIRED",
                routes: openRoutes.map((route: any) => ({
                    joRouteId: Number(route.jo_route_id || route.id),
                    sequenceOrder: Number(route.sequence_order || 0),
                    status: route.status || "Pending"
                }))
            }, { status: 422 });
        }

        if (!activeOperation) {
            return NextResponse.json({
                success: false,
                error: `No pending or ongoing routing operation is available for Job Order ${matchedJobOrder.job_order_no || jobOrderIdNumber}.`
            }, { status: 409 });
        }

        const activeOperationRouteId = Number(activeOperation.jo_route_id || activeOperation.id);
        const routeOption = routeOptions.find((option) => option.joRouteId === activeOperationRouteId);
        if (!routeOption || routeOption.workCenterIds.length === 0) {
            return NextResponse.json({
                success: false,
                error: `Routing step ${activeOperation.sequence_order || activeOperationRouteId} has no configured workstation in the product version routing.`,
                code: "ROUTE_WORKCENTER_NOT_CONFIGURED"
            }, { status: 409 });
        }
        if (!routeOption.workCenterIds.includes(workCenterIdNumber)) {
            const applicableLabels = routeOption.workCenterIds
                .map((id) => {
                    const center = allWorkCenters.find((w: any) => Number(w.work_center_id) === id);
                    return center ? `${center.work_center_name} (ID: ${id})` : `Work Center #${id}`;
                })
                .join(", ");
            return NextResponse.json({
                success: false,
                error: `Work Center "${matchedWorkCenter.work_center_name}" is not assigned to routing step ${activeOperation.sequence_order || activeOperationRouteId}. Applicable station: ${applicableLabels}.`,
                code: "ROUTE_WORKCENTER_NOT_APPLICABLE",
                joRouteId: activeOperationRouteId,
                applicableWorkCenterIds: routeOption.workCenterIds
            }, { status: 409 });
        }

        const routeId = activeOperation.jo_route_id || activeOperation.id;
        if (!routeId) {
            throw new Error("The active routing operation has no valid identifier.");
        }

        // Resolve an existing station event before changing the Job Order or route.
        // Legacy rows are matched from their scanner remark so a schema rollout does
        // not create a duplicate for a scan that was already recorded.
        const statusHistoryRows = await fetchStatusHistoryRows(jobOrderIdNumber, true);
        const existingStationHistory = statusHistoryRows.find((historyRecord: any) => {
            const station = resolveHistoryWorkCenter(historyRecord, new Map<number, string>());
            return Boolean(parseStationScanRemark(historyRecord?.remarks))
                && station.workCenterId === workCenterIdNumber;
        }) || null;

        // 4. BOTH WORK CENTER & JOB ORDER MATCHED -> PROCESS STATION START TRANSITION.
        const targetStatus = JOB_ORDER_STATUS.IN_PRODUCTION;
        const statusTransitioned = !isAlreadyActive;
        const primaryWorkCenterChanged = Number(matchedJobOrder.primary_work_center_id) !== workCenterIdNumber;
        let updatedJobOrder = matchedJobOrder;

        if (statusTransitioned) {
            await executeJobOrderWorkflow(jobOrderIdNumber, {
                action: "start-production",
                actorUserId: currentUserId,
                idempotencyKey: `station-start:${jobOrderIdNumber}:${workCenterIdNumber}`,
                remarks: `Station Start Scanner: Checked in at Work Center "${matchedWorkCenter.work_center_name}" (ID: ${workCenterIdNumber})`,
                workCenterId: workCenterIdNumber
            });
            updatedJobOrder = {
                ...matchedJobOrder,
                status: targetStatus,
                primary_work_center_id: workCenterIdNumber
            };
        } else if (primaryWorkCenterChanged) {
            updatedJobOrder = await directusData<any>(
                `${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderIdNumber}`,
                "Update active station work center",
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        primary_work_center_id: workCenterIdNumber,
                        modified_by: currentUserId,
                        modified_at: manilaTimestamp
                    })
                }
            );
        }

        const routeNeedsUpdate = activeOperation.status !== "Ongoing"
            || Number(activeOperation.work_center_id) !== workCenterIdNumber;
        if (routeNeedsUpdate) {
            const updatedOperation = await directusData<any>(
                `${DIRECTUS_URL}/items/manufacturing_job_order_routes/${routeId}`,
                "Station routing transition",
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        status: "Ongoing",
                        work_center_id: workCenterIdNumber
                    })
                }
            );
            activeOperation = { ...activeOperation, ...updatedOperation, status: "Ongoing", work_center_id: workCenterIdNumber };
        }

        // 5. Record the station audit for a transition or a first check-in at an
        // already-active station. Repeated scans reuse the matching event.
        const stationRemark = `Station Start Scanner: Checked in at Work Center "${matchedWorkCenter.work_center_name}" (ID: ${workCenterIdNumber})`;
        let statusHistoryRecord: any = existingStationHistory
            ? {
                ...existingStationHistory,
                work_center_id: workCenterIdNumber,
                work_center_name: matchedWorkCenter.work_center_name,
                previous_status: existingStationHistory.previous_status ?? existingStationHistory.old_status ?? null,
                status: existingStationHistory.status ?? existingStationHistory.new_status ?? ""
            }
            : null;

        if (!existingStationHistory && isAlreadyActive) {
            const createdStationHistory = await directusData<any>(
                `${DIRECTUS_URL}/items/manufacturing_job_order_status_history`,
                "Station status-history insert",
                {
                    method: "POST",
                    body: JSON.stringify({
                        job_order_id: jobOrderIdNumber,
                        work_center_id: workCenterIdNumber,
                        old_status: oldStatus,
                        new_status: targetStatus,
                        changed_by: currentUserId,
                        changed_at: manilaTimestamp,
                        event_key: `station-start:${jobOrderIdNumber}:${workCenterIdNumber}`,
                        workflow_action: "station-start-check-in",
                        remarks: stationRemark
                    })
                }
            );

            validateStationHistoryRecord(createdStationHistory, {
                jobOrderId: jobOrderIdNumber,
                workCenterId: workCenterIdNumber,
                oldStatus,
                newStatus: targetStatus,
                changedBy: currentUserId,
                changedAt: manilaTimestamp,
                remarks: stationRemark
            });

            statusHistoryRecord = {
                ...createdStationHistory,
                work_center_id: workCenterIdNumber,
                work_center_name: matchedWorkCenter.work_center_name,
                previous_status: createdStationHistory.previous_status ?? createdStationHistory.old_status ?? oldStatus,
                status: createdStationHistory.status ?? createdStationHistory.new_status ?? targetStatus
            };
        }

        const returnedJobOrder = {
            ...matchedJobOrder,
            ...(updatedJobOrder || {}),
            status: targetStatus,
            primary_work_center_id: workCenterIdNumber
        };

        return NextResponse.json({
            success: true,
            message: `Station Start Verified! Job Order ${returnedJobOrder.job_order_no} is now IN PRODUCTION at workstation "${matchedWorkCenter.work_center_name}".`,
            workCenter: matchedWorkCenter,
            jobOrder: returnedJobOrder,
            activeOperation,
            statusTransitioned,
            stationHistoryRecorded: Boolean(statusHistoryRecord),
            statusHistoryRecord
        });
    } catch (e: any) {
        return directusErrorResponse(e, "Station start is temporarily unavailable. Please try again.");
    }
}
