export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { authorizeJobOrderModuleAccess, JOB_ORDER_MODULE_PATHS } from "@/app/api/manufacturing/job-orders/_module-access";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { resolveApplicableRouteWorkCenters, resolveApplicableWorkCenterIds } from "../_applicable-work-centers";

type DirectusRecord = Record<string, unknown>;

const WORK_CENTER_FIELDS = [
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

class DirectusRequestError extends Error {
    constructor(operation: string, public readonly status: number | null, public readonly responseBody: string) {
        super(`${operation}${status ? ` failed with HTTP ${status}` : " failed"}`);
        this.name = "DirectusRequestError";
    }
}

function isRecord(value: unknown): value is DirectusRecord {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function directusRows<T extends DirectusRecord>(url: string, operation: string): Promise<T[]> {
    let response: Response;
    try {
        response = await fetch(url, { headers, cache: "no-store" });
    } catch (error) {
        throw new DirectusRequestError(operation, null, error instanceof Error ? error.message : String(error));
    }

    const responseBody = await response.text();
    let payload: unknown = null;
    try {
        payload = responseBody ? JSON.parse(responseBody) : null;
    } catch {
        payload = null;
    }
    const rows = isRecord(payload) ? payload.data : null;
    if (!response.ok || !Array.isArray(rows)) {
        throw new DirectusRequestError(operation, response.status, responseBody);
    }
    return rows as T[];
}

function positiveInteger(value: unknown): number | null {
    const rawValue = isRecord(value)
        ? value.work_center_id ?? value.id
        : value;
    const id = Number(rawValue);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizeWorkCenterRecord(workCenter: DirectusRecord) {
    const asset = isRecord(workCenter.asset_id) ? workCenter.asset_id : null;
    const assetItem = isRecord(asset?.item_id) ? asset.item_id : null;
    const assetDepartment = isRecord(asset?.department) ? asset.department : null;
    const workCenterDepartment = isRecord(workCenter.department_id) ? workCenter.department_id : null;
    const barcode = asset?.barcode || asset?.rfid_code || asset?.serial
        || `WC-${String(workCenter.work_center_id ?? "").padStart(3, "0")}`;
    const department = assetDepartment || workCenterDepartment;

    return {
        ...workCenter,
        barcode,
        rfid_code: asset?.rfid_code || null,
        serial: asset?.serial || null,
        is_active: workCenter.is_active === undefined || workCenter.is_active === null
            ? true
            : Boolean(Number(workCenter.is_active)),
        asset: asset
            ? {
                id: Number(asset.id) || undefined,
                item_image: asset.item_image || null,
                barcode: asset.barcode || null,
                rfid_code: asset.rfid_code || null,
                serial: asset.serial || null,
                item_name: assetItem?.item_name || null,
                item_id: assetItem || null,
                condition: asset.condition || null,
                is_active: asset.is_active === undefined || asset.is_active === null
                    ? true
                    : Boolean(Number(asset.is_active))
            }
            : null,
        department
    };
}

async function fetchMappedWorkCenters(extraFilter = "") {
    const rows = await directusRows<DirectusRecord>(
        `${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&sort=work_center_name&fields=${WORK_CENTER_FIELDS}${extraFilter}`,
        "Work-center lookup"
    );
    return rows.map(normalizeWorkCenterRecord);
}

export async function GET(request: Request) {
    const accessDenied = await authorizeJobOrderModuleAccess(JOB_ORDER_MODULE_PATHS.production);
    if (accessDenied) return accessDenied;

    try {
        const joIdValue = new URL(request.url).searchParams.get("joId");
        if (!joIdValue) {
            return NextResponse.json({ success: true, data: await fetchMappedWorkCenters() });
        }

        const joId = positiveInteger(joIdValue);
        if (!joId) {
            return NextResponse.json({ success: false, error: "A valid Job Order ID is required." }, { status: 400 });
        }

        const jobOrders = await directusRows<DirectusRecord>(
            `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_id][_eq]=${joId}&fields=job_order_id,version_id&limit=1`,
            "Job Order version lookup"
        );
        const jobOrder = jobOrders[0];
        if (!jobOrder) {
            return NextResponse.json({ success: false, error: `Job Order ${joId} was not found.` }, { status: 404 });
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
    } catch (error) {
        console.error("Error loading production work centers:", error);
        return NextResponse.json({
            success: false,
            error: error instanceof DirectusRequestError
                ? "Work-center lookup is temporarily unavailable. Please try again."
                : error instanceof Error ? error.message : "Work-center lookup failed."
        }, { status: error instanceof DirectusRequestError ? 502 : 500 });
    }
}
