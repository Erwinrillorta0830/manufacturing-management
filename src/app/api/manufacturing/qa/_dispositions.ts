import fs from "fs";
import path from "path";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const DISPOSITIONS_FILE = path.join(process.cwd(), "src/app/api/manufacturing/qa/dispositions.json");

function positiveId(value: unknown): number | null {
    const id = typeof value === "object" && value !== null
        ? Number((value as Record<string, unknown>).id || (value as Record<string, unknown>).value || 0)
        : Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizedText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function sameText(left: string, right: string): boolean {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
}

async function fetchCollection<T>(pathname: string): Promise<T[]> {
    try {
        const response = await fetch(`${DIRECTUS_URL}${pathname}`, { headers, cache: "no-store" });
        if (!response.ok) return [];
        const payload = await response.json();
        return Array.isArray(payload?.data) ? payload.data as T[] : [];
    } catch (error) {
        console.error(`Failed to load QA disposition reference data from ${pathname}:`, error);
        return [];
    }
}

export interface DispositionMetadata {
    job_order_id: number | null;
    jo_id: string;
    expected_quantity: number;
    product_id: number | null;
    product_name: string;
    task_id: number | null;
    task_name: string;
    station_id: number | null;
    station_name: string;
}

type StoredDisposition = Record<string, unknown>;

interface JobOrderReference {
    job_order_id?: unknown;
    job_order_no?: unknown;
    product_id?: unknown;
    target_quantity?: unknown;
}

interface ProductReference {
    product_id?: unknown;
    product_name?: unknown;
}

interface RouteReference {
    jo_route_id?: unknown;
    job_order_id?: unknown;
    operation_id?: unknown;
    work_center_id?: unknown;
}

interface OperationReference {
    id?: unknown;
    operation_name?: unknown;
}

interface WorkCenterReference {
    work_center_id?: unknown;
    work_center_name?: unknown;
}

export async function resolveDispositionMetadata(
    jobOrderId: number,
    joRouteId: number | null
): Promise<DispositionMetadata> {
    const [jobOrders, routes] = await Promise.all([
        fetchCollection<JobOrderReference>(
            `/items/manufacturing_job_orders?filter[job_order_id][_eq]=${jobOrderId}&fields=job_order_id,job_order_no,product_id,target_quantity&limit=1`
        ),
        joRouteId
            ? fetchCollection<RouteReference>(
                `/items/manufacturing_job_order_routes?filter[jo_route_id][_eq]=${joRouteId}&fields=jo_route_id,job_order_id,operation_id,work_center_id&limit=1`
            )
            : Promise.resolve([])
    ]);

    const jobOrder = jobOrders[0];
    const route = routes[0];
    const resolvedJobOrderId = positiveId(jobOrder?.job_order_id) || positiveId(jobOrderId);
    const productId = positiveId(jobOrder?.product_id);
    const operationId = positiveId(route?.operation_id);
    const stationId = positiveId(route?.work_center_id);

    const [products, operations, workCenters] = await Promise.all([
        productId
            ? fetchCollection<ProductReference>(
                `/items/products?filter[product_id][_eq]=${productId}&fields=product_id,product_name&limit=1`
            )
            : Promise.resolve([]),
        operationId
            ? fetchCollection<OperationReference>(
                `/items/manufacturing_operations?filter[id][_eq]=${operationId}&fields=id,operation_name&limit=1`
            )
            : Promise.resolve([]),
        stationId
            ? fetchCollection<WorkCenterReference>(
                `/items/manufacturing_work_centers?filter[work_center_id][_eq]=${stationId}&fields=work_center_id,work_center_name&limit=1`
            )
            : Promise.resolve([])
    ]);

    const productName = normalizedText(products[0]?.product_name);
    const operationName = normalizedText(operations[0]?.operation_name);
    const stationName = normalizedText(workCenters[0]?.work_center_name);

    return {
        job_order_id: resolvedJobOrderId,
        jo_id: normalizedText(jobOrder?.job_order_no) || `JO-${jobOrderId}`,
        expected_quantity: Number(jobOrder?.target_quantity || 0),
        product_id: productId,
        product_name: productName || (productId ? `Product #${productId}` : "Product unavailable"),
        task_id: positiveId(route?.jo_route_id) || positiveId(joRouteId),
        task_name: operationName || (joRouteId ? `Routing Task #${joRouteId}` : "Routing Task"),
        station_id: stationId,
        station_name: stationName || (stationId ? `Station #${stationId}` : "Station unavailable")
    };
}

function isStoredDisposition(value: unknown): value is StoredDisposition {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readDispositions(): StoredDisposition[] {
    try {
        const directory = path.dirname(DISPOSITIONS_FILE);
        if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
        if (!fs.existsSync(DISPOSITIONS_FILE)) {
            fs.writeFileSync(DISPOSITIONS_FILE, JSON.stringify([]));
            return [];
        }
        const fileContent = fs.readFileSync(DISPOSITIONS_FILE, "utf-8");
        const parsed = JSON.parse(fileContent || "[]");
        return Array.isArray(parsed) ? parsed.filter(isStoredDisposition) : [];
    } catch (error) {
        console.error("Error reading QA dispositions JSON:", error);
        return [];
    }
}

export function writeDispositions(data: StoredDisposition[]): void {
    const directory = path.dirname(DISPOSITIONS_FILE);
    if (!fs.existsSync(directory)) fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(DISPOSITIONS_FILE, JSON.stringify(data, null, 2));
}

export async function enrichDispositions(records: StoredDisposition[]): Promise<StoredDisposition[]> {
    const [jobOrders, routes, products, operations, workCenters] = await Promise.all([
        fetchCollection<JobOrderReference>(
            "/items/manufacturing_job_orders?limit=-1&fields=job_order_id,job_order_no,product_id"
        ),
        fetchCollection<RouteReference>(
            "/items/manufacturing_job_order_routes?limit=-1&fields=jo_route_id,job_order_id,operation_id,work_center_id"
        ),
        fetchCollection<ProductReference>(
            "/items/products?limit=-1&fields=product_id,product_name"
        ),
        fetchCollection<OperationReference>(
            "/items/manufacturing_operations?limit=-1&fields=id,operation_name"
        ),
        fetchCollection<WorkCenterReference>(
            "/items/manufacturing_work_centers?limit=-1&fields=work_center_id,work_center_name"
        )
    ]);

    return records.map((record) => {
        const recordJobOrderId = positiveId(record.job_order_id);
        const storedJobOrderNo = normalizedText(record.jo_id);
        const jobOrder = jobOrders.find((candidate) => {
            const candidateId = positiveId(candidate.job_order_id);
            const candidateNo = normalizedText(candidate.job_order_no);
            return (recordJobOrderId !== null && candidateId === recordJobOrderId)
                || (storedJobOrderNo !== "" && sameText(candidateNo, storedJobOrderNo));
        });

        const jobOrderId = positiveId(jobOrder?.job_order_id) || recordJobOrderId;
        const joRouteId = positiveId(record.task_id);
        const route = routes.find((candidate) => {
            const candidateRouteId = positiveId(candidate.jo_route_id);
            const candidateJobOrderId = positiveId(candidate.job_order_id);
            return candidateRouteId === joRouteId
                && (jobOrderId === null || candidateJobOrderId === null || candidateJobOrderId === jobOrderId);
        });

        const productId = positiveId(jobOrder?.product_id) || positiveId(record.product_id);
        const operationId = positiveId(route?.operation_id);
        const stationId = positiveId(route?.work_center_id);
        const product = products.find((candidate) => positiveId(candidate.product_id) === productId);
        const operation = operations.find((candidate) => positiveId(candidate.id) === operationId);
        const workCenter = workCenters.find((candidate) => positiveId(candidate.work_center_id) === stationId);

        const storedRemarks = normalizedText(record.inspection_remarks) || normalizedText(record.remarks);
        const storedTaskName = normalizedText(record.task_name);
        const resolvedTaskName = normalizedText(operation?.operation_name);
        const legacyRemarks = !storedRemarks && resolvedTaskName && storedTaskName && !sameText(storedTaskName, resolvedTaskName)
            ? storedTaskName
            : "";

        return {
            ...record,
            job_order_id: jobOrderId,
            jo_id: normalizedText(jobOrder?.job_order_no) || storedJobOrderNo || (jobOrderId ? `JO-${jobOrderId}` : "Unknown Job Order"),
            product_id: productId,
            product_name: normalizedText(product?.product_name)
                || (productId ? `Product #${productId}` : (normalizedText(record.product_name) && normalizedText(record.product_name) !== "Unknown Product" ? normalizedText(record.product_name) : "Product unavailable")),
            task_id: joRouteId,
            task_name: resolvedTaskName || (joRouteId ? `Routing Task #${joRouteId}` : "Routing Task"),
            station_id: stationId,
            station_name: normalizedText(workCenter?.work_center_name)
                || (stationId ? `Station #${stationId}` : "Station unavailable"),
            inspection_remarks: storedRemarks || legacyRemarks
        };
    });
}
