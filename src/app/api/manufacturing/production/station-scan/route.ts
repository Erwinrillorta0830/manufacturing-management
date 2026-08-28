/* eslint-disable */
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers, getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";

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
    "asset_id.barcode",
    "asset_id.rfid_code",
    "asset_id.serial",
    "department_id.department_id",
    "department_id.department_name"
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
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const joId = searchParams.get("joId");
        const action = searchParams.get("action");

        // 1. Fetch status history for a specific Job Order
        if (action === "history" || joId) {
            let historyUrl = `${DIRECTUS_URL}/items/manufacturing_job_order_status_history?limit=100&sort=-changed_at`;
            if (joId) {
                historyUrl += `&filter[job_order_id][_eq]=${joId}`;
            }

            const [historyRes, usersRes, wcRes] = await Promise.all([
                fetch(historyUrl, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" }).catch(() => null),
                fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&fields=work_center_id,work_center_name`, { headers, cache: "no-store" }).catch(() => null)
            ]);

            const historyList = historyRes && historyRes.ok ? (await historyRes.json()).data || [] : [];
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

            const enrichedHistory = historyList.map((h: any) => ({
                ...h,
                previous_status: h.previous_status ?? h.old_status ?? null,
                status: h.status ?? h.new_status ?? "",
                changed_by_name: userMap.get(Number(h.changed_by)) || (h.changed_by ? `User #${h.changed_by}` : "System"),
                work_center_name: wcMap.get(Number(h.work_center_id)) || (h.work_center_id ? `Station #${h.work_center_id}` : "Unassigned")
            }));

            return NextResponse.json({ success: true, data: enrichedHistory });
        }

        // 2. Fetch all active work centers with barcodes. Keep this projection
        // aligned with the POST resolver and avoid unsupported relation paths.
        const wcData = await directusData<any[]>(
            `${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&sort=work_center_name&fields=${STATION_WORK_CENTER_FIELDS}`,
            "Station work-center lookup"
        );

        if (!Array.isArray(wcData)) {
            throw new Error("Station work-center lookup returned an invalid data set.");
        }

        const mappedWorkCenters = wcData.map((wc: any) => {
            const asset = wc.asset_id && typeof wc.asset_id === "object" ? wc.asset_id : null;
            const barcode = asset?.barcode || asset?.rfid_code || asset?.serial || `WC-${String(wc.work_center_id).padStart(3, "0")}`;

            return {
                ...wc,
                barcode,
                rfid_code: asset?.rfid_code || null,
                serial: asset?.serial || null,
                is_active: wc.is_active === undefined || wc.is_active === null ? true : Boolean(Number(wc.is_active))
            };
        });

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
        const { workCenterBarcode, jobOrderBarcode, workCenterId, jobOrderId } = body;
        const hasWorkCenterId = workCenterId !== undefined && workCenterId !== null && String(workCenterId).trim() !== "";
        const hasJobOrderId = jobOrderId !== undefined && jobOrderId !== null && String(jobOrderId).trim() !== "";

        const currentUserId = await getUserIdFromSession();
        const manilaTimestamp = await getISOStringInConfiguredTimezone();

        // 1. Fetch work centers using only fields supported by the Directus schema.
        const allWorkCenters = await directusData<any[]>(
            `${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&sort=work_center_name&fields=${STATION_WORK_CENTER_FIELDS}`,
            "Station work-center lookup"
        );

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
        if (!Number.isInteger(jobOrderIdNumber) || jobOrderIdNumber <= 0 || !Number.isInteger(workCenterIdNumber) || workCenterIdNumber <= 0) {
            return NextResponse.json({
                success: false,
                error: "The scanned job order or work center has an invalid identifier."
            }, { status: 422 });
        }

        // 3. Resolve the active routing step before changing any records.
        const routes = await directusData<any[]>(
            `${DIRECTUS_URL}/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${jobOrderIdNumber}&sort=sequence_order&limit=-1`,
            "Station routing lookup"
        );

        if (!Array.isArray(routes)) {
            throw new Error("Station routing lookup returned an invalid data set.");
        }

        const isOpenRoute = (route: any) => !route.status || route.status === "Pending" || route.status === "Ongoing";
        let activeOperation = routes.find((route: any) => Number(route.work_center_id) === workCenterIdNumber && isOpenRoute(route));
        if (!activeOperation) {
            activeOperation = routes.find((route: any) => isOpenRoute(route));
        }

        if (!activeOperation) {
            return NextResponse.json({
                success: false,
                error: `No pending or ongoing routing operation is available for Job Order ${matchedJobOrder.job_order_no || jobOrderIdNumber}.`
            }, { status: 409 });
        }

        const routeId = activeOperation.jo_route_id || activeOperation.id;
        if (!routeId) {
            throw new Error("The active routing operation has no valid identifier.");
        }

        // 4. BOTH WORK CENTER & JOB ORDER MATCHED -> PROCESS STATION START TRANSITION.
        const oldStatus = String(matchedJobOrder.status || "Draft");
        if (oldStatus === "Completed" || oldStatus === "Finished") {
            return NextResponse.json({
                success: false,
                error: `Job Order ${matchedJobOrder.job_order_no || jobOrderIdNumber} is already finished and cannot be restarted.`
            }, { status: 409 });
        }

        const isAlreadyActive = oldStatus === "In Progress" || oldStatus === "Ongoing";
        const targetStatus = isAlreadyActive ? oldStatus : "In Progress";
        const statusTransitioned = !isAlreadyActive;
        const primaryWorkCenterChanged = Number(matchedJobOrder.primary_work_center_id) !== workCenterIdNumber;
        let updatedJobOrder = matchedJobOrder;

        if (statusTransitioned || primaryWorkCenterChanged) {
            updatedJobOrder = await directusData<any>(
                `${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderIdNumber}`,
                "Station job-order transition",
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        status: targetStatus,
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

        // 5. Record only a real status transition; repeated scans remain idempotent.
        let statusHistoryRecord: any = null;
        if (statusTransitioned) {
            statusHistoryRecord = await directusData<any>(
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
                        remarks: `Station Start Scanner: Checked in at Work Center "${matchedWorkCenter.work_center_name}" (ID: ${workCenterIdNumber})`
                    })
                }
            );
        }

        const returnedJobOrder = {
            ...matchedJobOrder,
            ...(updatedJobOrder || {}),
            status: targetStatus,
            primary_work_center_id: workCenterIdNumber
        };

        return NextResponse.json({
            success: true,
            message: `Station Start Verified! Job Order ${returnedJobOrder.job_order_no} is now IN PROGRESS at workstation "${matchedWorkCenter.work_center_name}".`,
            workCenter: matchedWorkCenter,
            jobOrder: returnedJobOrder,
            activeOperation,
            statusTransitioned,
            statusHistoryRecord
        });
    } catch (e: any) {
        return directusErrorResponse(e, "Station start is temporarily unavailable. Please try again.");
    }
}
