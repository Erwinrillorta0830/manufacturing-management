import { DIRECTUS_URL, headersNoCache } from "./shared";
import { JOB_ORDER_STATUS, normalizeJobOrderStatus } from "@/modules/manufacturing-management/job-order-status";
import { getDailyQAAuditStatus } from "@/modules/manufacturing-management/manufacturing-qa/daily-qa-outcome";
import { calculatePerUnitMaterialRequirement, resolveProductionShiftHours } from "@/modules/manufacturing-management/planning-engineering/utils/production-timing";
import { manufacturingFileUrl } from "@/modules/manufacturing-management/production-workflow/services/production-yield-image";
import { normalizeOperatorAssignments } from "../../job-orders/_operator-assignment-service";
import { directusFileId, directusFileMetadata, fetchDirectusFileMetadata } from "../../_directus-file-metadata";
import { fetchMmInventoryMovements } from "../../services/mm-inventory-movements.service";

const TERMINAL_QUEUE_STATUSES = [
    JOB_ORDER_STATUS.PICKED,
    JOB_ORDER_STATUS.IN_PRODUCTION,
    JOB_ORDER_STATUS.ON_HOLD,
    JOB_ORDER_STATUS.PRODUCTION_COMPLETED,
    JOB_ORDER_STATUS.FOR_QA_RECONCILIATION,
    JOB_ORDER_STATUS.QA_HOLD,
    JOB_ORDER_STATUS.CLOSED,
    JOB_ORDER_STATUS.CANCELLED
] as const;

const TERMINAL_QUEUE_STATUS_VALUES = [
    ...TERMINAL_QUEUE_STATUSES,
    "Reserved",
    "Ongoing",
    "In Progress",
    "Finished",
    "Completed",
    "Canceled"
];

// Directus collections have mixed relation, scalar, and legacy field shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DirectusRow = Record<string, any>;

function relationId(value: unknown, keys: string[] = []): number {
    if (value === null || value === undefined) return 0;
    if (typeof value !== "object") {
        const numeric = Number(value);
        return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : 0;
    }
    const record = value as Record<string, unknown>;
    for (const key of [...keys, "id"]) {
        const numeric = Number(record[key]);
        if (Number.isSafeInteger(numeric) && numeric > 0) return numeric;
    }
    return 0;
}

function idList(values: unknown[], keys: string[] = []): number[] {
    return [...new Set(values.map((value) => relationId(value, keys)).filter((id) => id > 0))];
}

function isEnabledFlag(value: unknown): boolean {
    if (value === true || value === 1) return true;
    const normalized = String(value ?? "").trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
}

async function directusRows(collection: string, params: URLSearchParams, label: string): Promise<DirectusRow[]> {
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params.toString()}`, {
        headers: headersNoCache,
        cache: "no-store"
    });
    const payload = await response.json().catch(() => null) as { data?: unknown } | null;
    if (!response.ok || !Array.isArray(payload?.data)) {
        throw new Error(`${label} failed${response.ok ? "" : ` with HTTP ${response.status}`}.`);
    }
    return payload.data as DirectusRow[];
}

async function directusRecord(path: string, label: string): Promise<DirectusRow | null> {
    const response = await fetch(`${DIRECTUS_URL}${path}`, { headers: headersNoCache, cache: "no-store" });
    const payload = await response.json().catch(() => null) as { data?: unknown } | null;
    if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
    return payload?.data && typeof payload.data === "object" ? payload.data as DirectusRow : null;
}

async function optionalRows(collection: string, params: URLSearchParams): Promise<DirectusRow[]> {
    try {
        return await directusRows(collection, params, `Load ${collection}`);
    } catch (error) {
        console.warn(`[Terminal Job Order] Optional ${collection} data could not be loaded:`, error);
        return [];
    }
}

function inFilter(field: string): string {
    return `filter[${field}][_in]`;
}

async function rowsByIds(collection: string, field: string, ids: number[], fields: string, label: string): Promise<DirectusRow[]> {
    if (ids.length === 0) return [];
    const params = new URLSearchParams({
        [inFilter(field)]: ids.join(","),
        fields,
        limit: "-1"
    });
    return directusRows(collection, params, label);
}

export async function fetchTerminalJobOrderQueue(jobOrderId?: number): Promise<DirectusRow[]> {
    const jobOrderParams = new URLSearchParams({
        "filter[status][_in]": TERMINAL_QUEUE_STATUS_VALUES.join(","),
        fields: "job_order_id,job_order_no,status,product_id,branch_id,target_quantity,actual_quantity_produced,end_date,version_id,primary_work_center_id,parent_job_order_id,shift_option",
        sort: "-job_order_id",
        limit: "-1"
    });
    if (jobOrderId) jobOrderParams.set("filter[job_order_id][_eq]", String(jobOrderId));

    const jobOrders = await directusRows("manufacturing_job_orders", jobOrderParams, "Load terminal Job Orders");
    const queueRows = jobOrders.filter((row) => {
        const status = normalizeJobOrderStatus(row.status);
        return status && TERMINAL_QUEUE_STATUSES.includes(status as typeof TERMINAL_QUEUE_STATUSES[number]);
    });
    if (queueRows.length === 0) return [];

    const jobOrderIds = idList(queueRows.map((row) => row.job_order_id || row.id), ["job_order_id"]);
    const productIds = idList(queueRows.map((row) => row.product_id), ["product_id"]);
    const versionIds = idList(queueRows.map((row) => row.version_id), ["version_id"]);

    const routeParams = new URLSearchParams({
        [inFilter("job_order_id")]: jobOrderIds.join(","),
        fields: "jo_route_id,job_order_id,routing_id,sequence_order,status,planned_setup_hours,planned_run_hours,work_center_id",
        limit: "-1"
    });
    const allocationParams = new URLSearchParams({
        [inFilter("job_order_id")]: jobOrderIds.join(","),
        fields: "job_order_id,sales_order_detail_id,allocated_quantity",
        limit: "-1"
    });
    const yieldParams = new URLSearchParams({
        [inFilter("job_order_id")]: jobOrderIds.join(","),
        fields: "job_order_id,yield_quantity,rejected_quantity",
        limit: "-1"
    });

    const [products, routes, allocations, yieldRows, versions] = await Promise.all([
        rowsByIds("products", "product_id", productIds, "product_id,product_name,unit_of_measurement", "Load terminal product labels"),
        directusRows("manufacturing_job_order_routes", routeParams, "Load terminal route summaries"),
        directusRows("manufacturing_job_order_allocations", allocationParams, "Load terminal sales-order links"),
        directusRows("manufacturing_job_order_yield_ledger", yieldParams, "Load terminal produced quantities"),
        versionIds.length > 0
            ? optionalRows("product_manufacturing_version", new URLSearchParams({
                [inFilter("version_id")]: versionIds.join(","),
                fields: "version_id,version_name",
                limit: "-1"
            }))
            : Promise.resolve([] as DirectusRow[])
    ]);

    const unitIds = idList(products.map((product) => product.unit_of_measurement), ["unit_id"]);
    const workCenterIds = idList([
        ...queueRows.map((row) => row.primary_work_center_id),
        ...routes.map((route) => route.work_center_id)
    ], ["work_center_id"]);
    const detailIds = idList(allocations.map((allocation) => allocation.sales_order_detail_id), ["detail_id"]);
    const units = await rowsByIds("units", "unit_id", unitIds, "unit_id,unit_name,unit_shortcut", "Load terminal units");
    const workCenters = await rowsByIds("manufacturing_work_centers", "work_center_id", workCenterIds, "work_center_id,work_center_name", "Load terminal workstations");
    const salesOrderDetails = await rowsByIds("sales_order_details", "detail_id", detailIds, "detail_id,order_id", "Load terminal sales-order details");
    const orderIds = idList(salesOrderDetails.map((detail) => detail.order_id), ["order_id"]);
    const salesOrders = await rowsByIds("sales_order", "order_id", orderIds, "order_id,order_no,customer_code", "Load terminal sales orders");
    const customerCodes = [...new Set(salesOrders.map((order) => String(order.customer_code || "").trim()).filter(Boolean))];
    let customers: DirectusRow[] = [];
    if (customerCodes.length > 0) {
        customers = await directusRows("customer", new URLSearchParams({
            "filter[customer_code][_in]": customerCodes.join(","),
            fields: "customer_code,customer_name",
            limit: "-1"
        }), "Load terminal customer labels");
    }

    const productById = new Map(products.map((row) => [relationId(row.product_id, ["product_id"]), row]));
    const unitById = new Map(units.map((row) => [relationId(row.unit_id, ["unit_id"]), row]));
    const workCenterById = new Map(workCenters.map((row) => [relationId(row.work_center_id, ["work_center_id"]), row]));
    const versionById = new Map(versions.map((row) => [relationId(row.version_id, ["version_id"]), row]));
    const detailById = new Map(salesOrderDetails.map((row) => [relationId(row.detail_id, ["detail_id"]), row]));
    const orderById = new Map(salesOrders.map((row) => [relationId(row.order_id, ["order_id"]), row]));
    const customerNameByCode = new Map(customers.map((row) => [String(row.customer_code || "").trim(), String(row.customer_name || "").trim()]));
    const tasksByJobOrder = new Map<number, DirectusRow[]>();
    const yieldsByJobOrder = new Map<number, DirectusRow[]>();
    const salesOrdersByJobOrder = new Map<number, DirectusRow[]>();

    for (const route of routes) {
        const id = relationId(route.job_order_id, ["job_order_id"]);
        const rows = tasksByJobOrder.get(id) || [];
        rows.push(route);
        tasksByJobOrder.set(id, rows);
    }
    for (const row of yieldRows) {
        const id = relationId(row.job_order_id, ["job_order_id"]);
        const rows = yieldsByJobOrder.get(id) || [];
        rows.push(row);
        yieldsByJobOrder.set(id, rows);
    }
    for (const allocation of allocations) {
        const jobId = relationId(allocation.job_order_id, ["job_order_id"]);
        const detailId = relationId(allocation.sales_order_detail_id, ["detail_id"]);
        const detail = detailById.get(detailId);
        const orderId = relationId(detail?.order_id, ["order_id"]);
        const order = orderById.get(orderId);
        const rows = salesOrdersByJobOrder.get(jobId) || [];
        rows.push({
            order_id: orderId || detailId,
            sales_order_detail_id: detailId || null,
            order_no: order?.order_no || (orderId ? `SO-${orderId}` : `SO-DETAIL-${detailId}`),
            customer_code: String(order?.customer_code || "").trim() || null,
            customer_name: customerNameByCode.get(String(order?.customer_code || "").trim()) || String(order?.customer_code || "").trim() || null,
            quantity: Number(allocation.allocated_quantity || 0)
        });
        salesOrdersByJobOrder.set(jobId, rows);
    }

    return queueRows.map((row) => {
        const id = relationId(row.job_order_id || row.id);
        const productId = relationId(row.product_id, ["product_id"]);
        const product = productById.get(productId);
        const unit = unitById.get(relationId(product?.unit_of_measurement, ["unit_id"]))
            || (product?.unit_of_measurement && typeof product.unit_of_measurement === "object" ? product.unit_of_measurement : null);
        const rows = yieldsByJobOrder.get(id) || [];
        const ledgerProducedQuantity = rows.reduce((total, item) => total + Number(item.yield_quantity || 0), 0);
        const producedQuantity = ledgerProducedQuantity || Number(row.actual_quantity_produced || 0);
        const outputQuantity = rows.reduce((total, item) => total + Math.max(0, Number(item.yield_quantity || 0)) + Math.max(0, Number(item.rejected_quantity || 0)), 0);
        const versionId = relationId(row.version_id, ["version_id"]);
        const recipe = versionById.get(versionId);
        const routeTasks = (tasksByJobOrder.get(id) || []).map((task) => {
            const workCenterId = relationId(task.work_center_id, ["work_center_id"]);
            const workCenter = workCenterById.get(workCenterId);
            return {
                id: relationId(task.jo_route_id || task.id),
                jo_route_id: relationId(task.jo_route_id || task.id),
                jo_id: row.job_order_no,
                routing_id: relationId(task.routing_id, ["routing_id", "route_id"]) || null,
                name: "Production Step",
                sequence_order: Number(task.sequence_order || 0),
                status: task.status || "Pending",
                planned_setup_hours: Number(task.planned_setup_hours || 0),
                planned_run_hours: Number(task.planned_run_hours || 0),
                duration_hours: Number(task.planned_setup_hours || 0) + Number(task.planned_run_hours || 0),
                actual_setup_hours: 0,
                actual_run_hours: 0,
                step_batch_size: 1,
                work_center_id: workCenterId || null,
                work_center_name: workCenter?.work_center_name || null,
                work_center: workCenter ? { work_center_id: workCenterId, work_center_name: workCenter.work_center_name } : null
            };
        }).sort((left, right) => left.sequence_order - right.sequence_order);
        const primaryWorkCenterId = relationId(row.primary_work_center_id, ["work_center_id"]);

        return {
            jo_id: String(row.job_order_no || `JO-${id}`),
            order_id: id,
            job_order_id: id,
            order_no: String(row.job_order_no || `JO-${id}`),
            job_order_no: String(row.job_order_no || `JO-${id}`),
            product_id: productId,
            product_name: product?.product_name || `Product #${productId}`,
            quantity: Number(row.target_quantity || 0),
            target_quantity: Number(row.target_quantity || 0),
            due_date: row.end_date || null,
            status: normalizeJobOrderStatus(row.status) || String(row.status || ""),
            branch_id: relationId(row.branch_id, ["branch_id"]) || null,
            uom_id: relationId(product?.unit_of_measurement, ["unit_id"]) || null,
            uom_name: unit?.unit_name || unit?.unit_shortcut || "Pieces",
            uom_shortcut: unit?.unit_shortcut || unit?.unit_name || "PCS",
            unit_of_measurement: unit?.unit_name || unit?.unit_shortcut || "Pieces",
            version_id: versionId || null,
            version_name: recipe
                ? String(recipe.version_name || (recipe.version_code ? `v${recipe.version_code}` : `Version #${versionId}`))
                : versionId ? `Version #${versionId}` : "",
            recipe_version_name: recipe?.version_name || null,
            shift_option: row.shift_option || "8",
            shiftOption: row.shift_option || "8",
            primary_work_center_id: primaryWorkCenterId || null,
            primary_work_center_name: workCenterById.get(primaryWorkCenterId)?.work_center_name || null,
            parent_job_order_id: relationId(row.parent_job_order_id, ["job_order_id"]) || null,
            parentJobOrderId: relationId(row.parent_job_order_id, ["job_order_id"]) || null,
            completed_quantity: Number(row.actual_quantity_produced || 0) > 0 ? Number(row.actual_quantity_produced) : producedQuantity,
            produced_quantity: producedQuantity,
            producedQty: producedQuantity,
            production_output_quantity: outputQuantity,
            productionOutputQuantity: outputQuantity,
            routing_tasks: routeTasks,
            routingTasks: routeTasks,
            sales_orders: salesOrdersByJobOrder.get(id) || [],
            salesOrders: salesOrdersByJobOrder.get(id) || []
        };
    });
}

export async function fetchTerminalJobOrderDetails(jobOrderId: number): Promise<DirectusRow | null> {
    const [summary] = await fetchTerminalJobOrderQueue(jobOrderId);
    if (!summary) return null;

    const jobOrder = await directusRecord(
        `/items/manufacturing_job_orders/${encodeURIComponent(String(jobOrderId))}?fields=*`,
        "Load selected terminal Job Order"
    );
    if (!jobOrder) return null;

    const routeParams = new URLSearchParams({
        "filter[job_order_id][_eq]": String(jobOrderId),
        fields: "*",
        limit: "-1"
    });
    const qaParams = new URLSearchParams({
        "filter[job_order_id][_eq]": String(jobOrderId),
        fields: "*",
        limit: "-1"
    });
    const yieldParams = new URLSearchParams({
        "filter[job_order_id][_eq]": String(jobOrderId),
        fields: "ledger_id,job_order_id,jo_route_id,shift_name,production_date,yield_quantity,rejected_quantity,scrap_quantity,logged_at,commit_status,lot_number,expiry_date,manufacturing_date,qa_status",
        limit: "-1"
    });
    const [routeRows, qaLogs, yieldRows] = await Promise.all([
        directusRows("manufacturing_job_order_routes", routeParams, "Load selected Job Order routes"),
        optionalRows("manufacturing_job_order_qa_records", qaParams),
        directusRows("manufacturing_job_order_yield_ledger", yieldParams, "Load selected Job Order yield ledger")
    ]);

    const persistedRouteIds = idList(routeRows.map((route) => route.routing_id), ["route_id", "routing_id"]);
    const versionId = relationId(jobOrder.version_id, ["version_id"]);
    const routeMasterParams = persistedRouteIds.length > 0
        ? new URLSearchParams({
            [inFilter("route_id")]: persistedRouteIds.join(","),
            fields: "route_id,version_id,sequence_order,operation_id,work_center_id,qa_template_id,requires_qa",
            limit: "-1"
        })
        : new URLSearchParams({
            "filter[version_id][_eq]": String(versionId),
            fields: "route_id,version_id,sequence_order,operation_id,work_center_id,qa_template_id,requires_qa",
            limit: "-1"
        });
    const routeMastersPromise = versionId > 0 || persistedRouteIds.length > 0
        ? optionalRows("manufacturing_routes", routeMasterParams)
        : Promise.resolve([] as DirectusRow[]);
    const versionParams = new URLSearchParams({
        "filter[version_id][_eq]": String(versionId),
        fields: "version_id,version_name,base_quantity,uom_id",
        limit: "1"
    });
    const [routeMasters, versionRows] = await Promise.all([
        routeMastersPromise,
        versionId > 0 ? directusRows("product_manufacturing_version", versionParams, "Load selected Job Order recipe") : Promise.resolve([] as DirectusRow[])
    ]);

    const routeMasterById = new Map(routeMasters.map((route) => [relationId(route.route_id, ["route_id", "routing_id"]), route]));
    const routeMasterForTask = (task: DirectusRow) => {
        const routeId = relationId(task.routing_id, ["routing_id", "route_id"]);
        return (routeId > 0 ? routeMasterById.get(routeId) : undefined)
            || routeMasters.find((route) => Number(route.version_id) === versionId
                && Number(route.sequence_order) === Number(task.sequence_order)
                && relationId(route.operation_id, ["operation_id"]) === relationId(task.operation_id, ["operation_id"]))
            || null;
    };
    const resolvedRouteIds = idList([
        ...routeRows.map((task) => task.routing_id),
        ...routeMasters.map((route) => route.route_id)
    ], ["route_id", "routing_id"]);
    const routeBomParams = new URLSearchParams({
        [inFilter("route_id")]: resolvedRouteIds.join(","),
        fields: "route_id,product_id,quantity_required,wastage_factor_percentage",
        limit: "-1"
    });
    const operationIds = idList([
        ...routeRows.map((task) => task.operation_id),
        ...routeMasters.map((route) => route.operation_id)
    ], ["operation_id"]);
    const operationParams = new URLSearchParams({
        [inFilter("id")]: operationIds.join(","),
        fields: "id,operation_name",
        limit: "-1"
    });
    const componentProductIds = idList([jobOrder.product_id], ["product_id"]);
    const [routeBomRows, operations, dailyQaRows] = await Promise.all([
        resolvedRouteIds.length > 0 ? directusRows("manufacturing_routes_bom", routeBomParams, "Load selected Job Order route materials") : Promise.resolve([] as DirectusRow[]),
        operationIds.length > 0 ? directusRows("manufacturing_operations", operationParams, "Load selected Job Order operations") : Promise.resolve([] as DirectusRow[]),
        optionalRows("manufacturing_daily_qa_inspections", new URLSearchParams({
            "filter[job_order_id][_eq]": String(jobOrderId),
            fields: "*",
            limit: "-1",
            sort: "-inspected_at"
        }))
    ]);

    const routeWorkCenterIds = idList([
        jobOrder.primary_work_center_id,
        ...routeRows.map((task) => task.work_center_id),
        ...routeMasters.map((route) => route.work_center_id)
    ], ["work_center_id"]);
    const allProductIds = idList([
        ...componentProductIds,
        ...routeBomRows.map((row) => row.product_id)
    ], ["product_id"]);
    const productParams = new URLSearchParams({
        [inFilter("product_id")]: allProductIds.join(","),
        fields: "product_id,product_name,product_code,unit_of_measurement,product_type",
        limit: "-1"
    });
    const workCenterParams = new URLSearchParams({
        [inFilter("work_center_id")]: routeWorkCenterIds.join(","),
        fields: "work_center_id,work_center_name,is_active",
        limit: "-1"
    });
    const routeIds = idList(routeRows.map((route) => route.jo_route_id || route.id), ["jo_route_id"]);
    const assignmentsParams = new URLSearchParams({
        [inFilter("jo_route_id")]: routeIds.join(","),
        fields: "jo_route_operator_id,jo_route_id,operator_id,hourly_rate,logged_hours,started_at,stopped_at,is_active",
        limit: "-1"
    });
    const [products, workCenters, routeAssignments] = await Promise.all([
        allProductIds.length > 0 ? directusRows("products", productParams, "Load selected Job Order product labels") : Promise.resolve([] as DirectusRow[]),
        routeWorkCenterIds.length > 0 ? directusRows("manufacturing_work_centers", workCenterParams, "Load selected Job Order workstations") : Promise.resolve([] as DirectusRow[]),
        routeIds.length > 0 ? directusRows("manufacturing_job_order_route_operators", assignmentsParams, "Load selected Job Order route assignments") : Promise.resolve([] as DirectusRow[])
    ]);

    const unitIds = idList([
        ...products.map((product) => product.unit_of_measurement),
        versionRows[0]?.uom_id
    ], ["unit_id"]);
    const units = await rowsByIds("units", "unit_id", unitIds, "unit_id,unit_name,unit_shortcut", "Load selected Job Order units");
    const productById = new Map(products.map((product) => [relationId(product.product_id, ["product_id"]), product]));
    const unitById = new Map(units.map((unit) => [relationId(unit.unit_id, ["unit_id"]), unit]));
    const workCenterById = new Map(workCenters.map((workCenter) => [relationId(workCenter.work_center_id, ["work_center_id"]), workCenter]));
    const operationNameById = new Map(operations.map((operation) => [relationId(operation.id), String(operation.operation_name || "Production Step")]));
    const qaByRoute = (routeId: number) => qaLogs.filter((qa) =>
        relationId(qa.jo_route_id, ["jo_route_id"]) === routeId
    );
    const latestLedger = [...yieldRows].sort((left, right) => {
        const leftDate = Date.parse(String(left.logged_at || left.production_date || "")) || 0;
        const rightDate = Date.parse(String(right.logged_at || right.production_date || "")) || 0;
        return rightDate - leftDate || relationId(right.ledger_id || right.id) - relationId(left.ledger_id || left.id);
    })[0];
    const latestLedgerId = relationId(latestLedger?.ledger_id || latestLedger?.id);
    const qaStatusForRoute = (routeId: number): "Pending" | "Passed" | "QA Hold" | null => {
        if (!latestLedgerId) return "Pending";
        const audits = dailyQaRows.filter((inspection) =>
            relationId(inspection.ledger_id, ["ledger_id"]) === latestLedgerId
            && relationId(inspection.jo_route_id, ["jo_route_id"]) === routeId
        );
        if (audits.some((audit) => getDailyQAAuditStatus(audit) === "QA Hold")) return "QA Hold";
        if (audits.length > 0 && audits.every((audit) => getDailyQAAuditStatus(audit) === "Passed")) return "Passed";
        return "Pending";
    };
    const hasShiftProgress = (routeId: number) => yieldRows.some((ledger) => {
        const ledgerRouteId = relationId(ledger.jo_route_id, ["jo_route_id"]);
        const appliesToRoute = ledgerRouteId === 0 || ledgerRouteId === routeId;
        const commitStatus = String(ledger.commit_status || "").trim().toUpperCase();
        return appliesToRoute
            && (!commitStatus || commitStatus === "COMMITTED")
            && Number(ledger.yield_quantity || 0) + Number(ledger.rejected_quantity || 0) + Number(ledger.scrap_quantity || 0) > 0;
    });
    const assignedBySequence = (() => {
        try {
            return normalizeOperatorAssignments(jobOrder.assigned_personnel);
        } catch {
            return {};
        }
    })();
    const taskRowsByRoute = new Map<number, DirectusRow[]>();
    for (const assignment of routeAssignments) {
        const id = relationId(assignment.jo_route_id, ["jo_route_id"]);
        const rows = taskRowsByRoute.get(id) || [];
        rows.push(assignment);
        taskRowsByRoute.set(id, rows);
    }
    const recipe = versionRows[0] || null;
    const targetQuantity = Number(jobOrder.target_quantity ?? jobOrder.quantity ?? 0);
    const productId = relationId(jobOrder.product_id, ["product_id"]);
    const finishedProduct = productById.get(productId);
    const finishedUnitId = relationId(finishedProduct?.unit_of_measurement, ["unit_id"]);
    const finishedUnit = unitById.get(finishedUnitId)
        || (finishedProduct?.unit_of_measurement && typeof finishedProduct.unit_of_measurement === "object" ? finishedProduct.unit_of_measurement : null);
    const persistedProductName = summary.product_name || finishedProduct?.product_name || `Product #${productId}`;
    const routingTasks = routeRows.map((task) => {
        const taskId = relationId(task.jo_route_id || task.id);
        const taskRoutingId = relationId(task.routing_id, ["routing_id", "route_id"]);
        const masterRoute = routeMasterForTask(task);
        const masterRouteId = relationId(masterRoute?.route_id, ["route_id", "routing_id"]);
        const workCenterId = relationId(task.work_center_id, ["work_center_id"])
            || relationId(masterRoute?.work_center_id, ["work_center_id"]);
        const workCenter = workCenterById.get(workCenterId);
        const taskAssignments = (taskRowsByRoute.get(taskId) || [])
            .filter((assignment) => assignment.is_active === undefined || assignment.is_active === null || !["0", "false", "no", "inactive"].includes(String(assignment.is_active).trim().toLowerCase()))
            .map((assignment) => ({
                id: relationId(assignment.jo_route_operator_id || assignment.id),
                task_id: taskId,
                user_id: relationId(assignment.operator_id, ["user_id", "operator_id"]),
                hourly_rate: Number(assignment.hourly_rate || 0),
                logged_hours: Number(assignment.logged_hours || 0),
                started_at: assignment.started_at || null,
                stopped_at: assignment.stopped_at || null,
                is_team_lead: false,
                is_active: true
            }));
        const operationId = relationId(task.operation_id, ["operation_id"])
            || relationId(masterRoute?.operation_id, ["operation_id"]);
        const qaTemplateId = relationId(task.qa_template_id, ["qa_template_id", "template_id"])
            || relationId(masterRoute?.qa_template_id, ["qa_template_id", "template_id"])
            || null;
        const requiresQa = isEnabledFlag(task.requires_qa)
            || isEnabledFlag(masterRoute?.requires_qa)
            || qaTemplateId !== null;
        const routeBomItems = routeBomRows.filter((item) => relationId(item.route_id, ["route_id"]) === (masterRouteId || taskRoutingId));
        const bomItems = routeBomItems.map((item) => {
            const componentProductId = relationId(item.product_id, ["product_id"]);
            const component = productById.get(componentProductId);
            const componentUnit = unitById.get(relationId(component?.unit_of_measurement, ["unit_id"]))
                || (component?.unit_of_measurement && typeof component.unit_of_measurement === "object" ? component.unit_of_measurement : null);
            const quantityPerUnit = Number(item.quantity_required || 0);
            const wastage = Number(item.wastage_factor_percentage || 0);
            return {
                product_id: componentProductId,
                product_name: component?.product_name || `Product #${componentProductId}`,
                qty_per_unit: quantityPerUnit,
                total_needed: calculatePerUnitMaterialRequirement(targetQuantity, quantityPerUnit, wastage),
                quantity_basis: "PER_FINISHED_UNIT",
                demand_required: null,
                planned_required: calculatePerUnitMaterialRequirement(targetQuantity, quantityPerUnit, wastage),
                unit_shortcut: componentUnit?.unit_shortcut || componentUnit?.unit_name || "pcs"
            };
        });
        const taskQaLogs = qaByRoute(taskId);
        const actualHours = taskAssignments.reduce((total, assignment) => total + assignment.logged_hours, 0);
        return {
            id: taskId,
            jo_id: String(jobOrder.job_order_no || summary.jo_id),
            routing_id: taskRoutingId || masterRouteId || null,
            qa_template_id: qaTemplateId,
            name: operationNameById.get(operationId) || "Production Step",
            sequence_order: Number(task.sequence_order || 0),
            status: task.status || "Pending",
            planned_setup_hours: Number(task.planned_setup_hours || 0),
            planned_run_hours: Number(task.planned_run_hours || 0),
            duration_hours: Number(task.planned_setup_hours || 0) + Number(task.planned_run_hours || 0),
            actual_setup_hours: Number(task.actual_setup_hours || 0),
            actual_run_hours: actualHours > 0 ? actualHours : Number(task.actual_run_hours || 0),
            step_batch_size: Number(task.step_batch_size || 1),
            run_time_hours_factor: Number(task.run_time_hours_factor || 0),
            work_center_id: workCenterId || null,
            work_center_name: workCenter?.work_center_name || null,
            work_center: workCenter ? { work_center_id: workCenterId, work_center_name: workCenter.work_center_name, is_active: workCenter.is_active } : null,
            completed_at: task.completed_at || null,
            requires_qa: requiresQa ? 1 : 0,
            qa_record_exists: taskQaLogs.length > 0,
            shift_progress_exists: hasShiftProgress(taskId),
            qa_status: requiresQa ? qaStatusForRoute(taskId) : null,
            assignments: taskAssignments,
            assigned_personnel: assignedBySequence[String(task.sequence_order)] || [],
            qa_logs: taskQaLogs,
            bom_items: bomItems
        };
    }).sort((left, right) => left.sequence_order - right.sequence_order);

    const simulatedRoutings = routingTasks.map((task) => ({
        routing_id: task.routing_id,
        id: task.id,
        qa_template_id: task.qa_template_id,
        sequence_order: task.sequence_order,
        operation_name: task.name,
        setup_time_hours: task.planned_setup_hours,
        run_time_hours: task.planned_run_hours,
        duration_hours: task.duration_hours,
        step_batch_size: task.step_batch_size,
        run_time_hours_factor: task.run_time_hours_factor,
        status: task.status
    }));
    const finalMovements = yieldRows.length === 0
        ? await fetchMmInventoryMovements({
            referenceId: jobOrderId,
            branch: relationId(jobOrder.branch_id, ["branch_id"]),
            product: productId
        })
        : [];
    const selectedMovements = finalMovements.filter((movement) =>
        Number(movement.transaction_type_id) === 2
        && Number(movement.source_document_id) === jobOrderId
        && Number(movement.product_id) === productId
        && (!movement.branch_id || Number(movement.branch_id) === relationId(jobOrder.branch_id, ["branch_id"]))
    );
    const yieldLogs: DirectusRow[] = yieldRows.map((ledger) => {
        const lotNumber = String(ledger.lot_number || "").trim();
        const ledgerQuantity = Number(ledger.yield_quantity || 0);
        const exactMovement = selectedMovements.find((movement) => String(movement.batch_no || "").trim() === lotNumber);
        const uniqueQuantityMovement = !exactMovement && selectedMovements.length === 1
            && Number(selectedMovements[0].quantity || 0) === ledgerQuantity
            ? selectedMovements[0]
            : null;
        const movement = exactMovement || uniqueQuantityMovement;
        return {
            ...ledger,
            ledger_id: ledger.ledger_id ?? ledger.id,
            lot_number: lotNumber || String(movement?.batch_no || "").trim() || `MFG-${jobOrder.job_order_no}`,
            expiry_date: ledger.expiry_date || movement?.expiry_date || null,
            manufacturing_date: ledger.manufacturing_date || movement?.manufacturing_date || (movement?.created_at ? movement.created_at.split("T")[0] : null)
        };
    });
    if (yieldLogs.length === 0) {
        selectedMovements.forEach((movement) => yieldLogs.push({
            ledger_id: movement.movement_id ? `mfg-${movement.movement_id}` : undefined,
            job_order_id: jobOrderId,
            shift_name: "Final Close",
            yield_quantity: String(movement.quantity),
            qa_status: "Passed",
            logged_at: movement.created_at,
            lot_number: movement.batch_no || `MFG-${jobOrder.job_order_no}`,
            expiry_date: movement.expiry_date || null,
            manufacturing_date: movement.manufacturing_date || (movement.created_at ? movement.created_at.split("T")[0] : null)
        }));
    }
    const producedQuantity = yieldLogs.reduce((total, log) => total + Number(log.yield_quantity || 0), 0);
    const outputQuantity = yieldLogs.reduce((total, log) => total
        + Math.max(0, Number(log.yield_quantity || 0))
        + Math.max(0, Number(log.rejected_quantity || 0)), 0);

    const cancellationImageId = directusFileId(jobOrder.cancellation_image_id);
    const terminationImageId = directusFileId(jobOrder.termination_image_id);
    const fileMetadataById = await fetchDirectusFileMetadata([cancellationImageId, terminationImageId]);
    const cancellationFile = directusFileMetadata(jobOrder.cancellation_image_id)
        || (cancellationImageId ? fileMetadataById.get(cancellationImageId) : null);
    const terminationFile = directusFileMetadata(jobOrder.termination_image_id)
        || (terminationImageId ? fileMetadataById.get(terminationImageId) : null);
    const primaryWorkCenterId = relationId(jobOrder.primary_work_center_id, ["work_center_id"]);
    const primaryWorkCenter = workCenterById.get(primaryWorkCenterId);
    const versionName = recipe?.version_name
        ? String(recipe.version_name)
        : versionId ? `Version #${versionId}` : "";
    const simulatedProduct = {
        jo_id: summary.jo_id,
        product_id: productId,
        product_name: persistedProductName,
        unit_of_measurement: finishedUnit?.unit_name || finishedUnit?.unit_shortcut || "Pieces",
        uom_name: finishedUnit?.unit_name || finishedUnit?.unit_shortcut || "Pieces",
        uom_shortcut: finishedUnit?.unit_shortcut || finishedUnit?.unit_name || "PCS",
        quantity: targetQuantity,
        bom: versionId ? { version_id: versionId } : null,
        components: [],
        routings: simulatedRoutings,
        allocation_results: null
    };

    return {
        ...jobOrder,
        ...summary,
        jo_id: String(jobOrder.job_order_no || summary.jo_id),
        order_id: jobOrderId,
        job_order_id: jobOrderId,
        order_no: String(jobOrder.job_order_no || summary.order_no),
        job_order_no: String(jobOrder.job_order_no || summary.job_order_no),
        product_id: productId,
        product_name: persistedProductName,
        quantity: targetQuantity,
        target_quantity: targetQuantity,
        due_date: jobOrder.end_date || null,
        status: normalizeJobOrderStatus(jobOrder.status) || jobOrder.status,
        branch_id: relationId(jobOrder.branch_id, ["branch_id"]) || null,
        uom_id: finishedUnitId || relationId(recipe?.uom_id, ["unit_id"]) || null,
        uom_name: finishedUnit?.unit_name || finishedUnit?.unit_shortcut || "Pieces",
        uom_shortcut: finishedUnit?.unit_shortcut || finishedUnit?.unit_name || "PCS",
        unit_of_measurement: finishedUnit?.unit_name || finishedUnit?.unit_shortcut || "Pieces",
        version_id: versionId || null,
        version_name: versionName,
        recipe_version_name: recipe?.version_name || null,
        shift_option: String(resolveProductionShiftHours(jobOrder.shift_option)),
        shiftOption: String(resolveProductionShiftHours(jobOrder.shift_option)),
        primary_work_center_id: primaryWorkCenterId || null,
        primary_work_center_name: primaryWorkCenter?.work_center_name || null,
        parent_job_order_id: relationId(jobOrder.parent_job_order_id, ["job_order_id"]) || null,
        parentJobOrderId: relationId(jobOrder.parent_job_order_id, ["job_order_id"]) || null,
        completed_quantity: Number(jobOrder.actual_quantity_produced || 0) > 0 ? Number(jobOrder.actual_quantity_produced) : producedQuantity,
        produced_quantity: producedQuantity,
        producedQty: producedQuantity,
        production_output_quantity: outputQuantity,
        productionOutputQuantity: outputQuantity,
        bom: versionId ? { version_id: versionId } : null,
        components: [],
        routings: simulatedRoutings,
        allocation_results: null,
        products: [simulatedProduct],
        routing_tasks: routingTasks,
        routingTasks,
        assigned_personnel: assignedBySequence,
        assignedPersonnel: assignedBySequence,
        sales_orders: summary.sales_orders || [],
        salesOrders: summary.salesOrders || [],
        yield_logs: yieldLogs,
        status_history: [],
        cancellation_image_id: cancellationImageId,
        cancellation_image_url: cancellationImageId ? manufacturingFileUrl(cancellationImageId) : null,
        cancellation_image_file_name: cancellationFile?.fileName || null,
        cancellation_image_mime_type: cancellationFile?.mimeType || null,
        cancellation_image_file_size: cancellationFile?.fileSize ?? null,
        termination_image_id: terminationImageId,
        termination_image_url: terminationImageId ? manufacturingFileUrl(terminationImageId) : null,
        termination_image_file_name: terminationFile?.fileName || null,
        termination_image_mime_type: terminationFile?.mimeType || null,
        termination_image_file_size: terminationFile?.fileSize ?? null
    };
}

