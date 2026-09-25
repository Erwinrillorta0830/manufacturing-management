import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { JOB_ORDER_STATUS, isJobOrderStatus, normalizeJobOrderStatus } from "@/modules/manufacturing-management/job-order-status";
import type {
    WorkCenterJobOrderSummary,
    WorkCenterJobOrderAssignmentSource,
    WorkCenterJobOrderAvailability
} from "@/modules/manufacturing-management/production-workflow/types";

type DirectusRecord = Record<string, unknown>;

async function fetchRows(path: string, label: string): Promise<DirectusRecord[]> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, {
        headers,
        cache: "no-store"
    });
    if (!response.ok) {
        throw new Error(`${label} failed (${response.status}).`);
    }

    const body = await response.json().catch(() => null);
    return Array.isArray(body?.data) ? body.data : [];
}

function relationId(value: unknown, keys: string[] = []): number {
    if (value === null || value === undefined) return 0;
    if (typeof value !== "object") {
        const id = Number(value);
        return Number.isSafeInteger(id) && id > 0 ? id : 0;
    }

    const record = value as Record<string, unknown>;
    for (const key of [...keys, "id"]) {
        const id = Number(record[key]);
        if (Number.isSafeInteger(id) && id > 0) return id;
    }
    return 0;
}

function asText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

function routeState(value: unknown, fallback: string): string {
    const raw = asText(value);
    if (!raw) return fallback;

    const key = raw.replace(/[\_-]+/g, " ").replace(/\s+/g, " ").toLowerCase();
    if (key === "pending") return "Pending";
    if (key === "ongoing" || key === "in progress") return "In Progress";
    if (key === "completed") return "Completed";
    if (key === "skipped") return "Skipped";
    if (key === "qa hold") return "QA Hold";
    return raw;
}

function isOpenRoute(value: unknown): boolean {
    const key = asText(value).replace(/[\_-]+/g, " ").replace(/\s+/g, " ").toLowerCase();
    return !key || key === "pending" || key === "ongoing" || key === "in progress";
}

function buildSummary(
    jobOrder: DirectusRecord,
    route: DirectusRecord | null,
    productNameById: Map<number, string>,
    operationNameById: Map<number, string>,
    assignmentSource: WorkCenterJobOrderAssignmentSource,
    fallbackRouteStatus: string
): WorkCenterJobOrderSummary {
    const jobOrderId = relationId(jobOrder.job_order_id, ["job_order_id"]) || relationId(jobOrder.id);
    const productId = relationId(jobOrder.product_id, ["product_id"]) || null;
    const routeId = relationId(route?.jo_route_id, ["jo_route_id"]) || relationId(route?.id);
    const operationId = relationId(route?.operation_id, ["operation_id"]);
    const status = normalizeJobOrderStatus(jobOrder.status) || asText(jobOrder.status) || "Unknown";
    const routeStatus = routeState(route?.status, fallbackRouteStatus);

    return {
        jobOrderId,
        jobOrderNo: asText(jobOrder.job_order_no) || `JO #${jobOrderId}`,
        productId,
        productName: asText(jobOrder.product_name)
            || productNameById.get(productId || 0)
            || (productId ? `Product #${productId}` : "Unknown product"),
        status,
        branchId: relationId(jobOrder.branch_id, ["branch_id"]) || null,
        quantity: Number(jobOrder.target_quantity ?? jobOrder.quantity ?? 0) || 0,
        routeId,
        routeSequence: Number(route?.sequence_order || 0) || 0,
        operationName: asText(route?.operation_name)
            || operationNameById.get(operationId)
            || (operationId ? `Operation #${operationId}` : "Production route"),
        routeStatus,
        assignmentSource
    };
}

export async function fetchWorkCenterJobOrderAvailability(options: {
    workCenterId?: number | null;
    branchId?: number | null;
} = {}): Promise<WorkCenterJobOrderAvailability[]> {
    const [workCenters, jobOrders, routes, products, operations, versionRoutes] = await Promise.all([
        fetchRows(
            "/items/manufacturing_work_centers?limit=-1&fields=work_center_id,work_center_name,is_active",
            "Work-center availability lookup"
        ),
        fetchRows(
            "/items/manufacturing_job_orders?limit=-1&fields=job_order_id,job_order_no,product_id,branch_id,status,target_quantity,primary_work_center_id,version_id",
            "Job-order availability lookup"
        ),
        fetchRows(
            "/items/manufacturing_job_order_routes?limit=-1&fields=jo_route_id,job_order_id,sequence_order,operation_id,routing_id,work_center_id,status&sort=sequence_order",
            "Job-order route availability lookup"
        ),
        fetchRows(
            "/items/products?limit=-1&fields=product_id,product_name",
            "Product availability lookup"
        ),
        fetchRows(
            "/items/manufacturing_operations?limit=-1&fields=id,operation_name",
            "Operation availability lookup"
        ),
        fetchRows(
            "/items/manufacturing_routes?limit=-1&fields=route_id,version_id,sequence_order,operation_id,work_center_id",
            "Version-routing availability lookup"
        )
    ]);

    const activeWorkCenters = workCenters.filter((workCenter) =>
        workCenter.is_active === undefined
        || workCenter.is_active === null
        || Boolean(Number(workCenter.is_active))
    );
    const allowedWorkCenterId = relationId(options.workCenterId);
    const allowedBranchId = relationId(options.branchId);
    const availabilityByWorkCenter = new Map<number, WorkCenterJobOrderAvailability>();

    activeWorkCenters.forEach((workCenter) => {
        const workCenterId = relationId(workCenter.work_center_id, ["work_center_id"]);
        if (!workCenterId || (allowedWorkCenterId > 0 && workCenterId !== allowedWorkCenterId)) return;

        availabilityByWorkCenter.set(workCenterId, {
            workCenterId,
            workCenterName: asText(workCenter.work_center_name) || `Work Center #${workCenterId}`,
            availableJobOrders: [],
            inProgressJobOrders: []
        });
    });

    const productNameById = new Map<number, string>();
    products.forEach((product) => {
        const productId = relationId(product.product_id, ["product_id"]) || relationId(product.id);
        const productName = asText(product.product_name);
        if (productId && productName) productNameById.set(productId, productName);
    });

    const operationNameById = new Map<number, string>();
    operations.forEach((operation) => {
        const operationId = relationId(operation.id) || relationId(operation.operation_id, ["operation_id"]);
        const operationName = asText(operation.operation_name) || asText(operation.name);
        if (operationId && operationName) operationNameById.set(operationId, operationName);
    });

    const routesByJobOrder = new Map<number, DirectusRecord[]>();
    routes.forEach((route) => {
        const jobOrderId = relationId(route.job_order_id, ["job_order_id"]);
        if (!jobOrderId) return;
        const jobRoutes = routesByJobOrder.get(jobOrderId) || [];
        jobRoutes.push(route);
        routesByJobOrder.set(jobOrderId, jobRoutes);
    });

    jobOrders.forEach((jobOrder) => {
        const normalizedStatus = normalizeJobOrderStatus(jobOrder.status);
        if (!normalizedStatus || !isJobOrderStatus(
            normalizedStatus,
            JOB_ORDER_STATUS.FOR_PICKING,
            JOB_ORDER_STATUS.PICKED,
            JOB_ORDER_STATUS.IN_PRODUCTION
        )) return;

        const branchId = relationId(jobOrder.branch_id, ["branch_id"]);
        if (allowedBranchId > 0 && branchId !== allowedBranchId) return;

        const jobOrderId = relationId(jobOrder.job_order_id, ["job_order_id"]) || relationId(jobOrder.id);
        if (!jobOrderId) return;

        const jobRoutes = routesByJobOrder.get(jobOrderId) || [];
        const versionId = relationId(jobOrder.version_id, ["version_id"]);
        const primaryWorkCenterId = relationId(jobOrder.primary_work_center_id, ["primary_work_center_id"]);
        const routeAssignments = jobRoutes
            .map((route) => {
                const persistedWorkCenterId = relationId(route.work_center_id, ["work_center_id"]);
                if (persistedWorkCenterId > 0) {
                    return {
                        route,
                        workCenterId: persistedWorkCenterId,
                        assignmentSource: "JO_ROUTE" as const
                    };
                }

                const routingId = relationId(route.routing_id, ["routing_id", "route_id"]);
                const operationId = relationId(route.operation_id, ["operation_id"]);
                const masterRoute = versionRoutes.find((candidate) =>
                    relationId(candidate.version_id, ["version_id"]) === versionId
                    && (
                        (routingId > 0 && relationId(candidate.route_id, ["route_id", "routing_id"]) === routingId)
                        || (
                            Number(candidate.sequence_order || 0) === Number(route.sequence_order || 0)
                            && relationId(candidate.operation_id, ["operation_id"]) === operationId
                        )
                    )
                );
                const masterWorkCenterId = relationId(masterRoute?.work_center_id, ["work_center_id"]);
                if (masterWorkCenterId > 0) {
                    return {
                        route,
                        workCenterId: masterWorkCenterId,
                        assignmentSource: "VERSION_ROUTING" as const
                    };
                }

                if (primaryWorkCenterId > 0) {
                    return {
                        route,
                        workCenterId: primaryWorkCenterId,
                        assignmentSource: "PRIMARY_WORK_CENTER" as const
                    };
                }

                return null;
            })
            .filter((entry): entry is NonNullable<typeof entry> =>
                entry !== null && entry.workCenterId > 0 && isOpenRoute(entry.route.status)
            );
        const assignedRoutes = routeAssignments.length > 0
            ? routeAssignments
            : primaryWorkCenterId > 0
                ? [{
                    route: null,
                    workCenterId: primaryWorkCenterId,
                    assignmentSource: "PRIMARY_WORK_CENTER" as const
                }]
                : [];

        assignedRoutes.forEach(({ route, workCenterId, assignmentSource }) => {
            const availability = availabilityByWorkCenter.get(workCenterId);
            if (!availability) return;

            const fallbackRouteStatus = normalizedStatus === JOB_ORDER_STATUS.IN_PRODUCTION ? "In Progress" : "Pending";
            const summary = buildSummary(
                jobOrder,
                route,
                productNameById,
                operationNameById,
                assignmentSource,
                fallbackRouteStatus
            );

            if (isJobOrderStatus(normalizedStatus, JOB_ORDER_STATUS.FOR_PICKING, JOB_ORDER_STATUS.PICKED)) {
                availability.availableJobOrders.push(summary);
            } else {
                availability.inProgressJobOrders.push(summary);
            }
        });
    });

    availabilityByWorkCenter.forEach((availability) => {
        const sortSummaries = (left: WorkCenterJobOrderSummary, right: WorkCenterJobOrderSummary) =>
            left.routeSequence - right.routeSequence
            || left.jobOrderNo.localeCompare(right.jobOrderNo);
        availability.availableJobOrders.sort(sortSummaries);
        availability.inProgressJobOrders.sort(sortSummaries);
    });

    return [...availabilityByWorkCenter.values()];
}
