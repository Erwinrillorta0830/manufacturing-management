import {
    DIRECTUS_URL,
    headersNoCache,
    type DirectusJobOrder
} from "./shared";
import {
    SHOP_FLOOR_QUEUE_STATUSES,
    SHOP_FLOOR_QUEUE_STATUS_VALUES,
    isJobOrderStatus,
    normalizeJobOrderStatus
} from "@/modules/manufacturing-management/job-order-status";
import { normalizeOperatorAssignments } from "../../job-orders/_operator-assignment-service";
import { fetchMmInventoryMovements } from "../../services/mm-inventory-movements.service";
import { calculatePerUnitMaterialRequirement } from "@/modules/manufacturing-management/planning-engineering/utils/production-timing";
import { getDailyQAAuditStatus, type DailyQAOutcomeStatus } from "@/modules/manufacturing-management/manufacturing-qa/daily-qa-outcome";
import {
    directusFileId,
    directusFileMetadata,
    fetchDirectusFileMetadata
} from "@/app/api/manufacturing/_directus-file-metadata";
import { manufacturingFileUrl } from "@/modules/manufacturing-management/production-workflow/services/production-yield-image";
import type { TerminalQueueJobOrder } from "@/modules/manufacturing-management/production-workflow/types";

// Directus responses have collection-dependent, relation-shaped values.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DirectusRow = Record<string, any>;

const JOB_ORDER_FIELDS = [
    "job_order_id", "job_order_no", "product_id", "version_id", "target_quantity",
    "actual_quantity_produced", "completed_quantity", "rejected_quantity", "status", "branch_id",
    "start_date", "end_date", "primary_work_center_id", "assigned_personnel",
    "parent_job_order_id", "shift_option", "priority", "remarks", "created_by", "created_at",
    "cancellation_image_id", "termination_image_id"
].join(",");

const ROUTE_FIELDS = [
    "jo_route_id", "job_order_id", "routing_id", "sequence_order", "operation_id", "status",
    "planned_setup_hours", "planned_run_hours", "actual_setup_hours", "actual_run_hours",
    "step_batch_size", "work_center_id", "completed_at", "requires_qa",
    "qa_template_id"
].join(",");

function relationId(value: unknown, keys: string[] = []): number {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of [...keys, "id"]) {
            const candidate = Number(record[key]);
            if (Number.isSafeInteger(candidate) && candidate > 0) return candidate;
        }
        return 0;
    }
    const candidate = Number(value);
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 0;
}

function uniqueIds(values: unknown[]): number[] {
    return [...new Set(values.map((value) => relationId(value)).filter((value) => value > 0))];
}

function itemQuery(fields?: string, filters: Record<string, string> = {}, sort?: string): string {
    const params = new URLSearchParams({ limit: "-1" });
    if (fields) params.set("fields", fields);
    Object.entries(filters).forEach(([key, value]) => params.set(key, value));
    if (sort) params.set("sort", sort);
    return params.toString();
}

class DirectusReadError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "DirectusReadError";
        this.status = status;
    }
}

async function readRows(collection: string, query: string): Promise<DirectusRow[]> {
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${query}`, {
        headers: headersNoCache,
        cache: "no-store"
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload?.data)) {
        const directusMessage = Array.isArray(payload?.errors)
            ? payload.errors.map((error: DirectusRow) => String(error?.message || "").trim()).filter(Boolean).join(" ")
            : "";
        throw new DirectusReadError(
            response.status,
            `Failed to read ${collection} for the Shop Floor Execution Terminal (${response.status})${directusMessage ? `: ${directusMessage}` : "."}`
        );
    }
    return payload.data;
}

async function readTerminalQueueJobOrders(): Promise<DirectusRow[]> {
    try {
        return await readRows("manufacturing_job_orders", itemQuery(QUEUE_JOB_ORDER_FIELDS, {
            "filter[status][_in]": SHOP_FLOOR_QUEUE_STATUS_VALUES.join(",")
        }, "-job_order_id"));
    } catch (error) {
        if (!(error instanceof DirectusReadError) || error.status !== 403) throw error;

        console.warn("[Manufacturing] Directus denied the filtered terminal queue read; retrying with the same fields and filtering statuses in the BFF.", error.message);
    }

    try {
        return await readRows("manufacturing_job_orders", itemQuery(QUEUE_JOB_ORDER_FIELDS, {}, "-job_order_id"));
    } catch (error) {
        if (!(error instanceof DirectusReadError) || error.status !== 403) throw error;

        console.warn("[Manufacturing] Directus denied the terminal queue field selection; retrying with its default readable fields.", error.message);
        return readRows("manufacturing_job_orders", itemQuery(undefined, {}, "-job_order_id"));
    }
}

async function readOptionalRows(collection: string, query: string): Promise<DirectusRow[]> {
    try {
        return await readRows(collection, query);
    } catch (error) {
        console.warn(`[Manufacturing] Optional terminal lookup failed for ${collection}:`, error);
        return [];
    }
}

async function readOptionalRowsByIds(collection: string, relationField: string, ids: number[], fields = "*"): Promise<DirectusRow[]> {
    if (ids.length === 0) return [];
    return readOptionalRows(collection, itemQuery(fields, { [`filter[${relationField}][_in]`]: ids.join(",") }));
}

async function readJobOrder(jobOrderId: number): Promise<DirectusRow | null> {
    const params = new URLSearchParams({ fields: JOB_ORDER_FIELDS });
    const response = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}?${params}`, {
        headers: headersNoCache,
        cache: "no-store"
    });
    const payload = await response.json().catch(() => null);
    if (response.status === 404 || !payload?.data) return null;
    if (!response.ok || typeof payload.data !== "object" || Array.isArray(payload.data)) {
        throw new Error(`Failed to read Job Order ${jobOrderId} for the Shop Floor Execution Terminal (${response.status}).`);
    }
    return payload.data;
}

function isEnabled(value: unknown): boolean {
    if (value === true || value === 1) return true;
    return ["1", "true", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function normalizedWorkCenter(row: DirectusRow): DirectusRow {
    const workCenterId = relationId(row.work_center_id, ["work_center_id"]);
    const asset = row.asset_id && typeof row.asset_id === "object" ? row.asset_id : null;
    const department = asset?.department && typeof asset.department === "object"
        ? asset.department
        : row.department_id && typeof row.department_id === "object"
            ? row.department_id
            : null;
    return {
        work_center_id: workCenterId,
        work_center_name: String(row.work_center_name || ""),
        asset_id: asset ? Number(asset.id) || null : null,
        department_id: department?.department_id || null,
        is_active: row.is_active === undefined || row.is_active === null ? true : Boolean(Number(row.is_active)),
        barcode: asset?.barcode || asset?.rfid_code || asset?.serial || `WC-${String(workCenterId).padStart(3, "0")}`,
        rfid_code: asset?.rfid_code || null,
        serial: asset?.serial || null,
        asset: asset ? {
            id: Number(asset.id) || undefined,
            item_image: asset.item_image || null,
            barcode: asset.barcode || null,
            rfid_code: asset.rfid_code || null,
            serial: asset.serial || null,
            item_name: asset.item_id?.item_name || null,
            item_id: asset.item_id || null,
            condition: asset.condition || null,
            is_active: asset.is_active === undefined || asset.is_active === null ? true : Boolean(Number(asset.is_active))
        } : null,
        department
    };
}

async function loadTerminalData(jobOrders: DirectusRow[], includeFiles: boolean): Promise<DirectusJobOrder[]> {
    if (jobOrders.length === 0) return [];

    const jobOrderIds = uniqueIds(jobOrders.map((row) => row.job_order_id));
    const versionIds = uniqueIds(jobOrders.map((row) => row.version_id));
    const productIds = uniqueIds(jobOrders.map((row) => row.product_id));
    const parentIds = uniqueIds(jobOrders.map((row) => row.parent_job_order_id));
    const jobOrderNos = jobOrders.map((row) => String(row.job_order_no || "")).filter((value) => value.includes("-SUB"))
        .map((value) => value.split("-SUB")[0]);

    const [routes, allocations, yieldRows, qaRows, dailyQaRows, masterRoutes, versions, products, parentRows] = await Promise.all([
        readOptionalRowsByIds("manufacturing_job_order_routes", "job_order_id", jobOrderIds, ROUTE_FIELDS),
        readOptionalRowsByIds("manufacturing_job_order_allocations", "job_order_id", jobOrderIds, "job_order_id,sales_order_detail_id,allocated_quantity"),
        readOptionalRowsByIds("manufacturing_job_order_yield_ledger", "job_order_id", jobOrderIds,
            "ledger_id,job_order_id,yield_quantity,rejected_quantity,scrap_quantity,commit_status,session_scope,jo_route_id,logged_at,production_date,lot_number,expiry_date,manufacturing_date,qa_status"),
        readOptionalRowsByIds("manufacturing_job_order_qa_records", "job_order_id", jobOrderIds, "*"),
        readOptionalRowsByIds("manufacturing_daily_qa_inspections", "job_order_id", jobOrderIds,
            "job_order_id,ledger_id,jo_route_id,qa_status,status,inspection_status,inspected_at"),
        readOptionalRowsByIds("manufacturing_routes", "version_id", versionIds,
            "route_id,version_id,sequence_order,operation_id,work_center_id,setup_time_hours,run_time_hours,step_batch_size,qa_template_id,requires_qa"),
        readOptionalRowsByIds("product_manufacturing_version", "version_id", versionIds, "version_id,version_name,base_quantity,uom_id"),
        readOptionalRowsByIds("products", "product_id", productIds,
            "product_id,product_code,product_name,product_type,unit_of_measurement,unit_of_measurement.unit_id,unit_of_measurement.unit_name,unit_of_measurement.unit_shortcut"),
        Promise.all([
            readOptionalRowsByIds("manufacturing_job_orders", "job_order_id", parentIds, "job_order_id,job_order_no"),
            jobOrderNos.length > 0
                ? readOptionalRows("manufacturing_job_orders", itemQuery("job_order_id,job_order_no", {
                    "filter[job_order_no][_in]": [...new Set(jobOrderNos)].join(",")
                }))
                : Promise.resolve([] as DirectusRow[])
        ]).then(([byId, byNumber]) => [...byId, ...byNumber])
    ]);

    const allocationDetailIds = uniqueIds(allocations.map((row) => row.sales_order_detail_id));
    const [resolvedSalesDetails, operations, routeBoms] = await Promise.all([
        allocationDetailIds.length > 0
            ? readOptionalRowsByIds("sales_order_details", "detail_id", allocationDetailIds, "detail_id,order_id")
            : Promise.resolve([] as DirectusRow[]),
        readOptionalRowsByIds("manufacturing_operations", "id", uniqueIds(routes.map((row) => row.operation_id)), "id,operation_name"),
        readOptionalRowsByIds("manufacturing_routes_bom", "route_id", uniqueIds(masterRoutes.map((row) => row.route_id)),
            "route_id,product_id,quantity_required,wastage_factor_percentage")
    ]);
    const salesOrderIds = uniqueIds(resolvedSalesDetails.map((row) => row.order_id));
    const componentProductIds = uniqueIds(routeBoms.map((row) => row.product_id));
    const allProductIds = uniqueIds([...productIds, ...componentProductIds]);
    const primaryAndRouteWorkCenterIds = uniqueIds([
        ...jobOrders.map((row) => row.primary_work_center_id),
        ...routes.map((row) => row.work_center_id),
        ...masterRoutes.map((row) => row.work_center_id)
    ]);

    const [salesOrders, customers, componentProducts, workCenterRows] = await Promise.all([
        readOptionalRowsByIds("sales_order", "order_id", salesOrderIds, "order_id,order_no,customer_code"),
        Promise.resolve([] as DirectusRow[]),
        componentProductIds.length > 0
            ? readOptionalRowsByIds("products", "product_id", componentProductIds,
                "product_id,product_name,unit_of_measurement,unit_of_measurement.unit_id,unit_of_measurement.unit_name,unit_of_measurement.unit_shortcut")
            : Promise.resolve([] as DirectusRow[]),
        readOptionalRows("manufacturing_work_centers", itemQuery(
            "work_center_id,work_center_name,is_active,asset_id.id,asset_id.item_image,asset_id.barcode,asset_id.rfid_code,asset_id.serial,asset_id.condition,asset_id.item_id.id,asset_id.item_id.item_name,department_id.department_id,department_id.department_name,asset_id.department.department_id,asset_id.department.department_name",
            { "filter[work_center_id][_in]": primaryAndRouteWorkCenterIds.join(",") }
        ))
    ]);
    const customerCodes = [...new Set(salesOrders.map((row) => String(row.customer_code || "").trim()).filter(Boolean))];
    const customerRows = customerCodes.length > 0
        ? await readOptionalRows("customer", itemQuery("customer_code,customer_name", { "filter[customer_code][_in]": customerCodes.join(",") }))
        : customers;

    const units = uniqueIds([...allProductIds.map((id) => {
        const row = [...products, ...componentProducts].find((product) => relationId(product.product_id) === id);
        return row?.unit_of_measurement;
    }), ...versions.map((version) => version.uom_id)]);
    const unitRows = await readOptionalRowsByIds("units", "unit_id", units, "unit_id,unit_name,unit_shortcut");

    const routesByJobOrder = groupById(routes, "job_order_id");
    const allocationsByJobOrder = groupById(allocations, "job_order_id");
    const yieldsByJobOrder = groupById(yieldRows, "job_order_id");
    const qaByRoute = new Map<number, DirectusRow[]>();
    qaRows.forEach((row) => {
        const routeId = relationId(row.jo_route_id, ["jo_route_id"]);
        if (!routeId) return;
        qaByRoute.set(routeId, [...(qaByRoute.get(routeId) || []), row]);
    });
    const masterRouteById = new Map(masterRoutes.map((row) => [relationId(row.route_id, ["route_id"]), row]));
    const operationNameById = new Map(operations.map((row) => [relationId(row.id), String(row.operation_name || "Production Step")]));
    const productById = new Map([...products, ...componentProducts].map((row) => [relationId(row.product_id), row]));
    const workCenterById = new Map(workCenterRows.map((row) => {
        const mapped = normalizedWorkCenter(row);
        return [relationId(mapped.work_center_id), mapped] as const;
    }));
    const unitById = new Map(unitRows.map((row) => [relationId(row.unit_id), row]));
    const versionById = new Map(versions.map((row) => [relationId(row.version_id), row]));
    const salesDetailById = new Map(resolvedSalesDetails.map((row) => [relationId(row.detail_id), row]));
    const salesOrderById = new Map(salesOrders.map((row) => [relationId(row.order_id), row]));
    const customerNameByCode = new Map(customerRows.map((row) => [String(row.customer_code || "").trim(), String(row.customer_name || "").trim()]));
    const parentById = new Map(parentRows.map((row) => [relationId(row.job_order_id), row]));
    const parentByNumber = new Map(parentRows.map((row) => [String(row.job_order_no || ""), row]));
    const inspectionsByJobOrder = groupById(dailyQaRows, "job_order_id");

    const legacyMovementsByJobOrder = await loadLegacyOutputMovements(jobOrders, yieldsByJobOrder);
    const fileIds = includeFiles ? jobOrders.flatMap((row) => [
        directusFileId(row.cancellation_image_id), directusFileId(row.termination_image_id)
    ]) : [];
    const fileMetadataById = includeFiles ? await fetchDirectusFileMetadata(fileIds) : new Map();

    return jobOrders
        .filter((row) => isJobOrderStatus(row.status, ...SHOP_FLOOR_QUEUE_STATUSES))
        .map((jobOrder) => {
            const jobOrderId = relationId(jobOrder.job_order_id, ["job_order_id"]);
            const jobOrderNo = String(jobOrder.job_order_no || `JO-${jobOrderId}`);
            const targetQuantity = Number(jobOrder.target_quantity ?? 0);
            const product = productById.get(relationId(jobOrder.product_id));
            const productId = relationId(jobOrder.product_id);
            const versionId = relationId(jobOrder.version_id);
            const rawUnit = product?.unit_of_measurement;
            const uomId = relationId(rawUnit, ["unit_id"]);
            const uom = (rawUnit && typeof rawUnit === "object" ? rawUnit : null) || unitById.get(uomId);
            const unitName = String(uom?.unit_name || uom?.unit_shortcut || "Pieces");
            const unitShortcut = String(uom?.unit_shortcut || uom?.unit_name || "PCS");
            const jobOrderRoutes = routesByJobOrder.get(jobOrderId) || [];
            const ledgers = yieldsByJobOrder.get(jobOrderId) || [];
            const movementRows = legacyMovementsByJobOrder.get(jobOrderId) || [];
            const yieldLogs = buildYieldLogs(jobOrderId, jobOrderNo, ledgers, movementRows);
            const totalProduced = yieldLogs.reduce((sum, row) => sum + Number(row.yield_quantity || 0), 0);
            const outputQuantity = yieldLogs.reduce((sum, row) => sum
                + Math.max(0, Number(row.yield_quantity || 0))
                + Math.max(0, Number(row.rejected_quantity || 0)), 0);
            const routeTasks = jobOrderRoutes.map((task) => {
                const taskId = relationId(task.jo_route_id ?? task.id, ["jo_route_id"]);
                const taskRouteId = relationId(task.routing_id, ["routing_id", "route_id"]);
                const matchedMasterRoute = (taskRouteId ? masterRouteById.get(taskRouteId) : null)
                    || masterRoutes.find((route) => relationId(route.version_id) === versionId
                        && Number(route.sequence_order) === Number(task.sequence_order)
                        && relationId(route.operation_id) === relationId(task.operation_id))
                    || null;
                const masterRouteId = relationId(matchedMasterRoute?.route_id, ["route_id"]);
                const workCenterId = relationId(task.work_center_id) || relationId(matchedMasterRoute?.work_center_id);
                const routeBOMItems = routeBoms.filter((item) => relationId(item.route_id) === (masterRouteId || taskRouteId));
                const baseQuantity = Number(versionById.get(versionId)?.base_quantity);
                const bomItems = routeBOMItems.map((item) => {
                    const component = productById.get(relationId(item.product_id));
                    const componentUnit = component?.unit_of_measurement && typeof component.unit_of_measurement === "object"
                        ? component.unit_of_measurement
                        : unitById.get(relationId(component?.unit_of_measurement, ["unit_id"]));
                    const qtyPerUnit = Number(item.quantity_required || 0);
                    const wastage = Number(item.wastage_factor_percentage || 0);
                    return {
                        product_id: relationId(item.product_id),
                        product_name: String(component?.product_name || `Product #${relationId(item.product_id)}`),
                        qty_per_unit: qtyPerUnit,
                        total_needed: Number.isFinite(baseQuantity) && baseQuantity > 0
                            ? calculatePerUnitMaterialRequirement(targetQuantity, qtyPerUnit, wastage)
                            : 0,
                        quantity_basis: "PER_FINISHED_UNIT",
                        demand_required: null,
                        planned_required: Number.isFinite(baseQuantity) && baseQuantity > 0
                            ? calculatePerUnitMaterialRequirement(targetQuantity, qtyPerUnit, wastage)
                            : 0,
                        unit_shortcut: String(componentUnit?.unit_shortcut || "pcs")
                    };
                });
                const requiresQA = isEnabled(task.requires_qa)
                    || isEnabled(matchedMasterRoute?.requires_qa)
                    || relationId(task.qa_template_id) > 0
                    || relationId(matchedMasterRoute?.qa_template_id) > 0;
                const latestLedger = latestLedgerForJobOrder(ledgers);
                const latestLedgerId = relationId(latestLedger?.ledger_id ?? latestLedger?.id, ["ledger_id", "id"]);
                const routeInspections = (inspectionsByJobOrder.get(jobOrderId) || []).filter((inspection) =>
                    relationId(inspection.ledger_id, ["ledger_id"]) === latestLedgerId
                    && relationId(inspection.jo_route_id, ["jo_route_id"]) === taskId
                );
                const qaStatus: DailyQAOutcomeStatus | null = !requiresQA
                    ? null
                    : routeInspections.some((inspection) => getDailyQAAuditStatus(inspection) === "QA Hold")
                        ? "QA Hold"
                        : routeInspections.length > 0 && routeInspections.every((inspection) => getDailyQAAuditStatus(inspection) === "Passed")
                            ? "Passed"
                            : "Pending";
                const routeYieldLogs = ledgers.filter((ledger) => {
                    const scope = String(ledger.session_scope || "").trim().toUpperCase();
                    return scope === "JOB_ORDER" || relationId(ledger.jo_route_id, ["jo_route_id"]) === taskId;
                });
                const hasCommittedProgress = routeYieldLogs.some((ledger) => {
                    const commitStatus = String(ledger.commit_status || "").trim().toUpperCase();
                    const output = Number(ledger.yield_quantity || 0) + Number(ledger.rejected_quantity || 0) + Number(ledger.scrap_quantity || 0);
                    return (!commitStatus || commitStatus === "COMMITTED") && output > 0;
                });
                const routeQARecords = qaByRoute.get(taskId) || [];
                const workCenter = workCenterById.get(workCenterId) || null;
                const sequence = Number(task.sequence_order || 0);
                let assignedPersonnel: Record<string, number[]> = {};
                try {
                    assignedPersonnel = normalizeOperatorAssignments(jobOrder.assigned_personnel);
                } catch {
                    assignedPersonnel = {};
                }
                const routeName = operationNameById.get(relationId(task.operation_id)) || "Production Step";
                const plannedSetup = Number(task.planned_setup_hours || 0);
                const plannedRun = Number(task.planned_run_hours || 0);
                return {
                    id: taskId,
                    jo_route_id: taskId,
                    jo_id: jobOrderNo,
                    routing_id: taskRouteId || masterRouteId || null,
                    qa_template_id: relationId(task.qa_template_id) || relationId(matchedMasterRoute?.qa_template_id) || null,
                    name: routeName,
                    sequence_order: sequence,
                    status: String(task.status || "Pending"),
                    planned_setup_hours: plannedSetup,
                    planned_run_hours: plannedRun,
                    duration_hours: plannedSetup + plannedRun,
                    actual_setup_hours: Number(task.actual_setup_hours || 0),
                    actual_run_hours: Number(task.actual_run_hours || 0),
                    step_batch_size: Number(task.step_batch_size || matchedMasterRoute?.step_batch_size || 1),
                    run_time_hours_factor: Number(task.run_time_hours_factor || 0),
                    work_center_id: workCenterId || null,
                    work_center_name: workCenter?.work_center_name || null,
                    work_center: workCenter,
                    completed_at: task.completed_at || null,
                    requires_qa: requiresQA ? 1 : 0,
                    qa_record_exists: routeQARecords.length > 0,
                    shift_progress_exists: hasCommittedProgress,
                    qa_status: qaStatus,
                    assignments: [],
                    assigned_personnel: assignedPersonnel[String(sequence)] || [],
                    qa_logs: routeQARecords,
                    bom_items: bomItems
                };
            }).sort((left, right) => left.sequence_order - right.sequence_order);
            const salesOrders = (allocationsByJobOrder.get(jobOrderId) || []).map((allocation) => {
                const detailId = relationId(allocation.sales_order_detail_id, ["detail_id"]);
                const detail = salesDetailById.get(detailId);
                const orderId = relationId(detail?.order_id, ["order_id"]);
                const order = salesOrderById.get(orderId);
                const customerCode = String(order?.customer_code || "").trim();
                return {
                    jo_id: jobOrderNo,
                    order_id: orderId || detailId,
                    sales_order_detail_id: detailId || null,
                    order_no: String(order?.order_no || (orderId ? `SO-${orderId}` : `SO-DETAIL-${detailId}`)),
                    customer_code: customerCode || null,
                    customer_name: customerNameByCode.get(customerCode) || customerCode || null,
                    quantity: Number(allocation.allocated_quantity || 0)
                };
            });
            let parentJobOrderId = relationId(jobOrder.parent_job_order_id, ["job_order_id"]);
            const inferredParentNo = !parentJobOrderId && jobOrderNo.includes("-SUB") ? jobOrderNo.split("-SUB")[0] : "";
            const parent = parentJobOrderId
                ? parentById.get(parentJobOrderId)
                : inferredParentNo ? parentByNumber.get(inferredParentNo) : null;
            if (!parentJobOrderId && parent) parentJobOrderId = relationId(parent.job_order_id);
            const primaryWorkCenterId = relationId(jobOrder.primary_work_center_id, ["work_center_id"]);
            const version = versionById.get(versionId);
            const rawStatus = normalizeJobOrderStatus(jobOrder.status) || String(jobOrder.status || "Unknown");
            const completedQuantity = Number(jobOrder.actual_quantity_produced || 0) > 0
                ? Number(jobOrder.actual_quantity_produced)
                : totalProduced;
            const cancellationId = includeFiles ? directusFileId(jobOrder.cancellation_image_id) : null;
            const terminationId = includeFiles ? directusFileId(jobOrder.termination_image_id) : null;
            const cancellationMetadata = includeFiles
                ? directusFileMetadata(jobOrder.cancellation_image_id) || (cancellationId ? fileMetadataById.get(cancellationId) : null)
                : null;
            const terminationMetadata = includeFiles
                ? directusFileMetadata(jobOrder.termination_image_id) || (terminationId ? fileMetadataById.get(terminationId) : null)
                : null;
            const productName = String(product?.product_name || `Product #${productId}`);
            const result = {
                ...jobOrder,
                jo_id: jobOrderNo,
                order_id: jobOrderId,
                job_order_id: jobOrderId,
                order_no: jobOrderNo,
                job_order_no: jobOrderNo,
                product_id: productId,
                product_name: productName,
                product_code: String(product?.product_code || ""),
                quantity: targetQuantity,
                target_quantity: targetQuantity,
                due_date: jobOrder.end_date || null,
                status: rawStatus,
                branch_id: relationId(jobOrder.branch_id) || null,
                uom_id: uomId || null,
                uom_shortcut: unitShortcut,
                uom_name: unitName,
                unit_of_measurement: unitName,
                version_id: versionId || null,
                version_name: String(version?.version_name || (versionId ? `Version #${versionId}` : "")),
                recipe_version_name: String(version?.version_name || ""),
                primary_work_center_id: primaryWorkCenterId || null,
                primary_work_center_name: workCenterById.get(primaryWorkCenterId)?.work_center_name || null,
                parent_job_order_id: parentJobOrderId || null,
                parent_job_order_no: parent?.job_order_no || (inferredParentNo || null),
                parentJobOrderId: parentJobOrderId || null,
                shift_option: String(jobOrder.shift_option || ""),
                shiftOption: String(jobOrder.shift_option || ""),
                assigned_personnel: jobOrder.assigned_personnel || {},
                assignedPersonnel: jobOrder.assigned_personnel || {},
                routing_tasks: routeTasks,
                routingTasks: routeTasks,
                sales_orders: salesOrders,
                salesOrders,
                producedQty: totalProduced,
                completed_quantity: completedQuantity,
                produced_quantity: totalProduced,
                production_output_quantity: outputQuantity,
                yield_logs: yieldLogs,
                cancellation_image_id: cancellationId,
                cancellation_image_url: cancellationId ? manufacturingFileUrl(cancellationId) : null,
                cancellation_image_file_name: cancellationMetadata?.fileName || null,
                cancellation_image_mime_type: cancellationMetadata?.mimeType || null,
                cancellation_image_file_size: cancellationMetadata?.fileSize || null,
                termination_image_id: terminationId,
                termination_image_url: terminationId ? manufacturingFileUrl(terminationId) : null,
                termination_image_file_name: terminationMetadata?.fileName || null,
                termination_image_mime_type: terminationMetadata?.mimeType || null,
                termination_image_file_size: terminationMetadata?.fileSize || null
            };
            return result as unknown as DirectusJobOrder;
        });
}

function groupById(rows: DirectusRow[], relationField: string): Map<number, DirectusRow[]> {
    const result = new Map<number, DirectusRow[]>();
    rows.forEach((row) => {
        const id = relationId(row[relationField], [relationField]);
        if (!id) return;
        result.set(id, [...(result.get(id) || []), row]);
    });
    return result;
}

function latestLedgerForJobOrder(rows: DirectusRow[]): DirectusRow | null {
    return rows.reduce<DirectusRow | null>((latest, row) => {
        if (!latest) return row;
        const latestTime = Date.parse(String(latest.logged_at || latest.production_date || ""));
        const rowTime = Date.parse(String(row.logged_at || row.production_date || ""));
        const latestId = relationId(latest.ledger_id ?? latest.id, ["ledger_id", "id"]);
        const rowId = relationId(row.ledger_id ?? row.id, ["ledger_id", "id"]);
        return rowTime > latestTime || (rowTime === latestTime && rowId > latestId) ? row : latest;
    }, null);
}

export function buildYieldLogs(
    jobOrderId: number,
    jobOrderNo: string,
    ledgerRows: DirectusRow[],
    movementRows: DirectusRow[] = []
): DirectusRow[] {
    const yieldLogs = ledgerRows.map((row) => ({
        ...row,
        ledger_id: row.ledger_id ?? row.id,
        job_order_id: jobOrderId,
        lot_number: String(row.lot_number || "").trim() || `MFG-${jobOrderNo}`
    }));
    if (yieldLogs.length > 0) return yieldLogs;
    return movementRows
        .filter((row) => relationId(row.transaction_type_id) === 2
            && relationId(row.source_document_id) === jobOrderId
            && relationId(row.product_id) > 0)
        .map((row) => ({
            ledger_id: row.movement_id !== null && row.movement_id !== undefined ? `mfg-${row.movement_id}` : undefined,
            job_order_id: jobOrderId,
            shift_name: "Final Close",
            yield_quantity: String(row.quantity || 0),
            qa_status: "Passed",
            logged_at: row.created_at,
            lot_number: row.batch_no || `MFG-${jobOrderNo}`,
            expiry_date: row.expiry_date || null,
            manufacturing_date: row.manufacturing_date || (row.created_at ? String(row.created_at).split("T")[0] : null)
        }));
}

async function loadLegacyOutputMovements(
    jobOrders: DirectusRow[],
    yieldRowsByJobOrder: Map<number, DirectusRow[]>
): Promise<Map<number, DirectusRow[]>> {
    const candidates = jobOrders.filter((jobOrder) => {
        const jobOrderId = relationId(jobOrder.job_order_id);
        return (yieldRowsByJobOrder.get(jobOrderId) || []).length === 0
            && Number(jobOrder.actual_quantity_produced || 0) <= 0;
    });
    const result = new Map<number, DirectusRow[]>();
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(3, candidates.length) }, async () => {
        while (nextIndex < candidates.length) {
            const jobOrder = candidates[nextIndex++];
            const jobOrderId = relationId(jobOrder.job_order_id);
            try {
                const movements = await fetchMmInventoryMovements({
                    transactionTypeId: 2,
                    referenceId: jobOrderId,
                    product: relationId(jobOrder.product_id),
                    branch: relationId(jobOrder.branch_id)
                });
                result.set(jobOrderId, movements as unknown as DirectusRow[]);
            } catch (error) {
                console.warn(`[Manufacturing] Legacy output movement lookup failed for Job Order ${jobOrderId}:`, error);
                result.set(jobOrderId, []);
            }
        }
    });
    await Promise.all(workers);
    return result;
}

const QUEUE_JOB_ORDER_FIELDS = [
    "job_order_id", "job_order_no", "product_id", "version_id", "target_quantity",
    "actual_quantity_produced", "completed_quantity", "rejected_quantity", "status", "branch_id",
    "end_date", "primary_work_center_id", "parent_job_order_id"
].join(",");

async function fetchTerminalQueueRows(): Promise<TerminalQueueJobOrder[]> {
    const jobOrders = (await readTerminalQueueJobOrders())
        .filter((row) => isJobOrderStatus(row.status, ...SHOP_FLOOR_QUEUE_STATUSES));
    if (jobOrders.length === 0) return [];

    const jobOrderIds = uniqueIds(jobOrders.map((row) => row.job_order_id));
    const versionIds = uniqueIds(jobOrders.map((row) => row.version_id));
    const productIds = uniqueIds(jobOrders.map((row) => row.product_id));
    const parentIds = uniqueIds(jobOrders.map((row) => row.parent_job_order_id));
    const inferredParentNos = [...new Set(jobOrders
        .map((row) => String(row.job_order_no || ""))
        .filter((jobOrderNo) => jobOrderNo.includes("-SUB"))
        .map((jobOrderNo) => jobOrderNo.split("-SUB")[0]))];

    const [routes, allocations, yields, masterRoutes, versions, products, parentRowsById, parentRowsByNumber] = await Promise.all([
        readOptionalRowsByIds("manufacturing_job_order_routes", "job_order_id", jobOrderIds, [
            "jo_route_id", "job_order_id", "routing_id", "sequence_order", "operation_id", "status",
            "planned_setup_hours", "planned_run_hours", "step_batch_size", "work_center_id"
        ].join(",")),
        readOptionalRowsByIds("manufacturing_job_order_allocations", "job_order_id", jobOrderIds,
            "job_order_id,sales_order_detail_id,allocated_quantity"),
        readOptionalRowsByIds("manufacturing_job_order_yield_ledger", "job_order_id", jobOrderIds,
            "job_order_id,yield_quantity,rejected_quantity"),
        readOptionalRowsByIds("manufacturing_routes", "version_id", versionIds,
            "route_id,version_id,sequence_order,operation_id,work_center_id,setup_time_hours,run_time_hours,step_batch_size"),
        readOptionalRowsByIds("product_manufacturing_version", "version_id", versionIds, "version_id,version_name"),
        readOptionalRowsByIds("products", "product_id", productIds, "product_id,product_name,product_code"),
        readOptionalRowsByIds("manufacturing_job_orders", "job_order_id", parentIds, "job_order_id,job_order_no"),
        inferredParentNos.length > 0
            ? readOptionalRows("manufacturing_job_orders", itemQuery("job_order_id,job_order_no", {
                "filter[job_order_no][_in]": inferredParentNos.join(",")
            }))
            : Promise.resolve([] as DirectusRow[])
    ]);

    const salesDetailIds = uniqueIds(allocations.map((row) => row.sales_order_detail_id));
    const [salesDetails, operations] = await Promise.all([
        readOptionalRowsByIds("sales_order_details", "detail_id", salesDetailIds, "detail_id,order_id"),
        readOptionalRowsByIds("manufacturing_operations", "id", uniqueIds([
            ...routes.map((row) => row.operation_id),
            ...masterRoutes.map((row) => row.operation_id)
        ]), "id,operation_name")
    ]);
    const salesOrderIds = uniqueIds(salesDetails.map((row) => row.order_id));
    const routeWorkCenterIds = uniqueIds([
        ...jobOrders.map((row) => row.primary_work_center_id),
        ...routes.map((row) => row.work_center_id),
        ...masterRoutes.map((row) => row.work_center_id)
    ]);
    const [salesOrders, workCenters] = await Promise.all([
        readOptionalRowsByIds("sales_order", "order_id", salesOrderIds, "order_id,order_no,customer_code"),
        routeWorkCenterIds.length > 0
            ? readOptionalRows("manufacturing_work_centers", itemQuery("work_center_id,work_center_name", {
                "filter[work_center_id][_in]": routeWorkCenterIds.join(",")
            }))
            : Promise.resolve([] as DirectusRow[])
    ]);
    const customerCodes = [...new Set(salesOrders.map((row) => String(row.customer_code || "").trim()).filter(Boolean))];
    const customerRows = customerCodes.length > 0
        ? await readOptionalRows("customer", itemQuery("customer_code,customer_name", {
            "filter[customer_code][_in]": customerCodes.join(",")
        }))
        : [];

    const productsById = new Map(products.map((row) => [relationId(row.product_id), row]));
    const yieldsByJobOrder = groupById(yields, "job_order_id");
    const routesByJobOrder = groupById(routes, "job_order_id");
    const allocationByJobOrder = groupById(allocations, "job_order_id");
    const salesDetailById = new Map(salesDetails.map((row) => [relationId(row.detail_id), row]));
    const salesOrderById = new Map(salesOrders.map((row) => [relationId(row.order_id), row]));
    const customerNameByCode = new Map(customerRows.map((row) => [
        String(row.customer_code || "").trim(), String(row.customer_name || "").trim()
    ]));
    const operationNameById = new Map(operations.map((row) => [relationId(row.id), String(row.operation_name || "Production Step")]));
    const masterRouteById = new Map(masterRoutes.map((row) => [relationId(row.route_id), row]));
    const workCenterNameById = new Map(workCenters.map((row) => [relationId(row.work_center_id), String(row.work_center_name || "")]));
    const versionNameById = new Map(versions.map((row) => [
        relationId(row.version_id), String(row.version_name || "")
    ]));
    const parentRows = [...parentRowsById, ...parentRowsByNumber];
    const parentById = new Map(parentRows.map((row) => [relationId(row.job_order_id), row]));
    const parentByNumber = new Map(parentRows.map((row) => [String(row.job_order_no || ""), row]));

    return jobOrders.map((jobOrder) => {
            const jobOrderId = relationId(jobOrder.job_order_id);
            const jobOrderNo = String(jobOrder.job_order_no || `JO-${jobOrderId}`);
            const productId = relationId(jobOrder.product_id);
            const product = productsById.get(productId);
            const ledgerRows = yieldsByJobOrder.get(jobOrderId) || [];
            const ledgerProduced = ledgerRows.reduce((sum, row) => sum + Math.max(0, Number(row.yield_quantity || 0)), 0);
            const actualProduced = Math.max(0, Number(jobOrder.actual_quantity_produced || jobOrder.completed_quantity || 0));
            const produced = ledgerRows.length > 0 ? ledgerProduced : actualProduced;
            const routeTasks = (routesByJobOrder.get(jobOrderId) || []).map((route) => {
                const sequence = Number(route.sequence_order || 0);
                const routingId = relationId(route.routing_id);
                const master = (routingId ? masterRouteById.get(routingId) : null)
                    || masterRoutes.find((item) => relationId(item.version_id) === relationId(jobOrder.version_id)
                        && Number(item.sequence_order) === sequence
                        && relationId(item.operation_id) === relationId(route.operation_id))
                    || null;
                const workCenterId = relationId(route.work_center_id) || relationId(master?.work_center_id);
                const setupHours = Number(route.planned_setup_hours || master?.setup_time_hours || 0);
                const runHours = Number(route.planned_run_hours || master?.run_time_hours || 0);
                const taskId = relationId(route.jo_route_id);
                const workCenterName = workCenterNameById.get(workCenterId) || null;
                return {
                    id: taskId,
                    jo_route_id: taskId,
                    jo_id: jobOrderNo,
                    routing_id: routingId || relationId(master?.route_id) || null,
                    name: operationNameById.get(relationId(route.operation_id)) || "Production Step",
                    sequence_order: sequence,
                    status: String(route.status || "Pending"),
                    planned_setup_hours: setupHours,
                    planned_run_hours: runHours,
                    duration_hours: setupHours + runHours,
                    step_batch_size: Number(route.step_batch_size || master?.step_batch_size || 1),
                    work_center_id: workCenterId || null,
                    work_center_name: workCenterName,
                    work_center: workCenterName ? { work_center_id: workCenterId, work_center_name: workCenterName } : null
                };
            }).sort((left, right) => left.sequence_order - right.sequence_order);
            const salesOrders = (allocationByJobOrder.get(jobOrderId) || []).map((allocation) => {
                const detailId = relationId(allocation.sales_order_detail_id);
                const orderId = relationId(salesDetailById.get(detailId)?.order_id);
                const order = salesOrderById.get(orderId);
                const customerCode = String(order?.customer_code || "").trim();
                return {
                    jo_id: jobOrderNo,
                    order_id: orderId || detailId,
                    sales_order_detail_id: detailId || null,
                    order_no: String(order?.order_no || (orderId ? `SO-${orderId}` : `SO-DETAIL-${detailId}`)),
                    customer_code: customerCode || null,
                    customer_name: customerNameByCode.get(customerCode) || customerCode || null,
                    quantity: Number(allocation.allocated_quantity || 0)
                };
            });
            const parentJobOrderId = relationId(jobOrder.parent_job_order_id)
                || relationId(parentByNumber.get(jobOrderNo.includes("-SUB") ? jobOrderNo.split("-SUB")[0] : "")?.job_order_id);
            const parent = parentJobOrderId
                ? parentById.get(parentJobOrderId)
                : parentByNumber.get(jobOrderNo.includes("-SUB") ? jobOrderNo.split("-SUB")[0] : "");
            const versionId = relationId(jobOrder.version_id);
            return {
                jo_id: jobOrderNo,
                order_id: jobOrderId,
                job_order_id: jobOrderId,
                order_no: jobOrderNo,
                job_order_no: jobOrderNo,
                product_id: productId,
                product_name: String(product?.product_name || `Product #${productId}`),
                quantity: Number(jobOrder.target_quantity ?? 0),
                target_quantity: Number(jobOrder.target_quantity ?? 0),
                completed_quantity: Number(jobOrder.actual_quantity_produced || 0) > 0
                    ? Number(jobOrder.actual_quantity_produced)
                    : produced,
                producedQty: produced,
                production_output_quantity: ledgerRows.reduce((sum, row) => sum
                    + Math.max(0, Number(row.yield_quantity || 0))
                    + Math.max(0, Number(row.rejected_quantity || 0)), 0) || actualProduced,
                due_date: jobOrder.end_date || null,
                status: normalizeJobOrderStatus(jobOrder.status) || String(jobOrder.status || "Unknown"),
                branch_id: relationId(jobOrder.branch_id) || null,
                version_id: versionId || null,
                version_name: versionNameById.get(versionId) || (versionId ? `Version #${versionId}` : ""),
                primary_work_center_id: relationId(jobOrder.primary_work_center_id) || null,
                primary_work_center_name: workCenterNameById.get(relationId(jobOrder.primary_work_center_id)) || null,
                parent_job_order_id: parentJobOrderId || null,
                parent_job_order_no: String(parent?.job_order_no || "") || null,
                routing_tasks: routeTasks,
                routingTasks: routeTasks,
                sales_orders: salesOrders,
                salesOrders
            };
        });
}

export async function fetchTerminalJobOrderQueue(): Promise<TerminalQueueJobOrder[]> {
    return fetchTerminalQueueRows();
}

export async function fetchTerminalJobOrderDetails(jobOrderId: number): Promise<DirectusJobOrder | null> {
    const jobOrder = await readJobOrder(jobOrderId);
    if (!jobOrder || !isJobOrderStatus(jobOrder.status, ...SHOP_FLOOR_QUEUE_STATUSES)) return null;
    const details = await loadTerminalData([jobOrder], true);
    return details[0] || null;
}
