/* eslint-disable */
import { DIRECTUS_URL, headers, getJobOrderIdByNo, getUomCountForProduct } from "./shared";
import { formatPhtDateTime } from "@/app/api/manufacturing/directus-api";
import { normalizeOperatorAssignments, synchronizeJobOrderOperatorAssignments } from "../../job-orders/_operator-assignment-service";
import { getBOMDetailsForVersion } from "../../finished-goods/versions/versions-helper";
import { calculateProductionMetrics } from "@/modules/manufacturing-management/planning-engineering/utils/production-metrics";
import { calculateRecipeMaterialCostPerUnit, roundManufacturingUnitCost } from "@/modules/manufacturing-management/planning-engineering/utils/cogs-helper";
import { calculateFullBatchTarget, calculateReleaseMaterialRequirementPlan, readUomId, resolveProductionShiftHours, roundProductionValue } from "@/modules/manufacturing-management/planning-engineering/utils/production-timing";
import { groupMaterialRequirements } from "@/modules/manufacturing-management/planning-engineering/utils/material-requirement-groups";

async function readDirectusRows(collection: string, filter: string): Promise<Record<string, any>[]> {
    const limit = /(?:^|&)limit=/.test(filter) ? "" : "&limit=-1";
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${filter}${limit}`, { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to read ${collection} while editing this Draft (${response.status}).`);
    const rows = (await response.json().catch(() => ({}))).data;
    if (!Array.isArray(rows)) throw new Error(`The ${collection} response is invalid.`);
    return rows;
}

function directusRowId(row: Record<string, any>, preferredFields: string[]): number {
    for (const field of [...preferredFields, "id"]) {
        const id = Number(row[field] || 0);
        if (Number.isSafeInteger(id) && id > 0) return id;
    }
    return 0;
}

function canonicalVersionMap(value: unknown): string {
    let parsed = value;
    if (typeof parsed === "string") {
        try { parsed = JSON.parse(parsed); } catch { parsed = {}; }
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "{}";
    const entries = Object.entries(parsed as Record<string, unknown>)
        .map(([key, version]): [string, number] => [String(key), Number(version)])
        .filter(([key, version]) => Number.isSafeInteger(Number(key)) && Number(key) > 0 && Number.isSafeInteger(version) && version > 0)
        .sort(([left], [right]) => Number(left) - Number(right));
    return JSON.stringify(Object.fromEntries(entries));
}

async function deleteDirectusRow(collection: string, row: Record<string, any>, idFields: string[]): Promise<void> {
    const id = directusRowId(row, idFields);
    if (!id) throw new Error(`A ${collection} row is missing its Directus identifier.`);
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}/${id}`, { method: "DELETE", headers, cache: "no-store" });
    if (!response.ok) throw new Error(`Failed to replace the Draft ${collection} row (${response.status}).`);
}

async function createDirectusRow(collection: string, payload: Record<string, unknown>): Promise<Record<string, any>> {
    const response = await fetch(`${DIRECTUS_URL}/items/${collection}?fields=*`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        cache: "no-store"
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.data) {
        const detail = body?.errors?.[0]?.message || body?.error || `HTTP ${response.status}`;
        throw new Error(`Failed to rebuild the Draft ${collection} row: ${detail}`);
    }
    return body.data;
}

async function rebuildDraftWorkplan(
    jobOrderId: number,
    patchData: Record<string, any>,
    current: Record<string, any>
): Promise<void> {
    const nextProductId = Number(patchData.product_id ?? current.product_id);
    const nextVersionId = Number(patchData.version_id ?? current.version_id);
    const nextTarget = Number(patchData.quantity ?? current.target_quantity);
    const nextBranchId = Number(patchData.branch_id ?? current.branch_id);
    if (!Number.isSafeInteger(nextProductId) || nextProductId <= 0 || !Number.isSafeInteger(nextVersionId) || nextVersionId <= 0) {
        throw new Error("A valid product and approved recipe version are required to rebuild this Draft.");
    }
    if (!Number.isFinite(nextTarget) || nextTarget <= 0 || !Number.isSafeInteger(nextBranchId) || nextBranchId <= 0) {
        throw new Error("A valid target quantity and branch are required to rebuild this Draft.");
    }

    const { version, routes } = await getBOMDetailsForVersion(nextProductId, nextVersionId);
    if (!version || !["active", "approved"].includes(String(version.status || "").toLowerCase())) {
        throw new Error("The selected recipe version is no longer active or approved.");
    }
    const baseQuantity = Number(version.base_quantity);
    if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) throw new Error("The selected recipe is missing its base quantity.");
    if (!Array.isArray(routes) || routes.length === 0) throw new Error("The selected recipe has no routing steps.");

    const normalizedTargetUomId = readUomId(patchData.uom_id ?? current.uom_id);
    let productionTarget = nextTarget;
    let metricsTargetUomId = normalizedTargetUomId;
    if (Number(version.product_id) > 0 && Number(version.product_id) !== nextProductId) {
        const sourceCount = await getUomCountForProduct(nextProductId);
        const recipeCount = await getUomCountForProduct(Number(version.product_id));
        if (sourceCount > 0 && recipeCount > 0) productionTarget *= sourceCount / recipeCount;
        metricsTargetUomId = readUomId(version.uom_id) || normalizedTargetUomId;
    }
    productionTarget = calculateFullBatchTarget(productionTarget, baseQuantity);

    const bomItems = routes.flatMap((route: any) => Array.isArray(route.bom_items) ? route.bom_items : []);
    const materialCostPerUnit = roundManufacturingUnitCost(calculateRecipeMaterialCostPerUnit(
        bomItems.map((item: any) => ({
            quantity_required: Number(item.quantity_required || 0),
            wastage_factor_percentage: Number(item.wastage_factor_percentage || 0),
            cost_per_unit: Number(item.cost_per_unit || 0)
        }))
    ));
    const metrics = calculateProductionMetrics({
        targetQuantity: productionTarget,
        timingTargetQuantity: productionTarget,
        baseQuantity,
        targetUomId: metricsTargetUomId,
        baseUomId: readUomId(version.uom_id),
        routes: routes.map((route: any) => ({
            sequence_order: Number(route.sequence_order || 0),
            operation_name: "",
            qaTemplateId: (() => {
                const value = route.qa_template_id;
                const id = value && typeof value === "object" ? Number(value.template_id ?? value.id) : Number(value);
                return Number.isSafeInteger(id) && id > 0 ? id : null;
            })(),
            setup_time_hours: Number(route.setup_time_hours || 0),
            run_time_hours: Number(route.run_time_hours || 0),
            step_batch_size: route.step_batch_size == null ? undefined : Number(route.step_batch_size),
            work_center_overhead_cost_per_hour: Number(route.work_center?.overhead_cost_per_hour || 0),
            work_center_capacity_per_hour: Number(route.work_center?.capacity_per_hour || 0)
        })),
        bomItems: bomItems.map((item: any) => ({
            quantity_required: Number(item.quantity_required || 0),
            wastage_factor_percentage: Number(item.wastage_factor_percentage || 0),
            cost_per_unit: Number(item.cost_per_unit || 0)
        })),
        laborPositions: version.labor_positions || [],
        overheadItems: version.overhead_items || [],
        customOverhead: version.custom_overhead,
        expectedYieldPercentage: version.expected_yield_percentage,
        materialCostPerUnit
    });

    const requirements = bomItems.map((item: any) => ({
        product_id: Number(item.product_id?.product_id || item.product_id?.id || item.product_id),
        uom_id: item.uom_id ?? item.unit_of_measurement,
        required_quantity: calculateReleaseMaterialRequirementPlan(
            productionTarget,
            productionTarget,
            Number(item.quantity_required || 0),
            Number(item.wastage_factor_percentage || 0)
        ).plannedRequired
    }));
    const groupedRequirements = groupMaterialRequirements(requirements, {
        productId: (item) => item.product_id,
        uomId: (item) => item.uom_id,
        quantity: (item) => item.required_quantity
    });
    const materialPayloads: Record<string, unknown>[] = [];
    for (const requirement of groupedRequirements) {
        if (!Number.isSafeInteger(requirement.productId) || requirement.productId <= 0) {
            throw new Error("The selected recipe contains a material without a valid product.");
        }
        let uomId = readUomId(requirement.uomId);
        if (!uomId) {
            const productResponse = await fetch(`${DIRECTUS_URL}/items/products/${requirement.productId}?fields=unit_of_measurement`, { headers, cache: "no-store" });
            if (!productResponse.ok) throw new Error(`The material UOM for Product #${requirement.productId} could not be loaded.`);
            const product = (await productResponse.json().catch(() => ({}))).data;
            uomId = readUomId(product?.unit_of_measurement);
        }
        materialPayloads.push({
            job_order_id: jobOrderId,
            product_id: requirement.productId,
            uom_id: uomId || 1,
            allocated_quantity: roundProductionValue(requirement.requiredQuantity),
            reserved_quantity: 0,
            actual_consumed_quantity: 0,
            scrap_quantity: 0
        });
    }

    const shiftHours = resolveProductionShiftHours(patchData.shift_option ?? current.shift_option);
    const totalHours = Number(metrics.lineLeadTimeHours || 0);
    const numDays = Math.ceil(totalHours / shiftHours) || 1;
    const quantityScale = 10 ** 4;
    const scaledTarget = Math.round(roundProductionValue(productionTarget) * quantityScale);
    const dailyBaseQuantity = Math.floor(scaledTarget / numDays);
    const dailyRemainder = scaledTarget % numDays;
    const dailyBreakdown = Array.from({ length: numDays }, (_, index) => {
        const date = new Date(`${String(patchData.start_date ?? current.start_date ?? formatPhtDateTime().slice(0, 10)).slice(0, 10)}T00:00:00`);
        date.setDate(date.getDate() + index);
        return {
            day: index + 1,
            date: Number.isNaN(date.getTime()) ? null : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
            status: "Pending",
            quantity: roundProductionValue((dailyBaseQuantity + (index < dailyRemainder ? 1 : 0)) / quantityScale)
        };
    });

    const routePayloads = routes.map((route: any) => {
        const sequenceOrder = Number(route.sequence_order || 0);
        const routeMetric = metrics.routeMetrics.find((metric) => metric.sequenceOrder === sequenceOrder);
        if (!routeMetric) throw new Error(`The selected recipe has invalid routing sequence ${sequenceOrder}.`);
        const workCenter = route.work_center_id && typeof route.work_center_id === "object"
            ? route.work_center_id.work_center_id ?? route.work_center_id.id
            : route.work_center_id;
        const operation = route.operation_id && typeof route.operation_id === "object"
            ? route.operation_id.operation_id ?? route.operation_id.id
            : route.operation_id;
        const routeId = route.route_id && typeof route.route_id === "object"
            ? route.route_id.route_id ?? route.route_id.id
            : route.route_id;
        const qaTemplate = route.qa_template_id && typeof route.qa_template_id === "object"
            ? route.qa_template_id.template_id ?? route.qa_template_id.id
            : route.qa_template_id;
        const plannedSetup = roundProductionValue(routeMetric.plannedSetupHours);
        const plannedRun = roundProductionValue(routeMetric.plannedRunHours);
        const laborShare = metrics.cumulativeWorkloadHours > 0 ? routeMetric.elapsedHours / metrics.cumulativeWorkloadHours : 0;
        const base = {
            job_order_id: jobOrderId,
            sequence_order: sequenceOrder,
            work_center_id: Number(workCenter || 1),
            operation_id: Number(operation || 1),
            planned_setup_hours: plannedSetup,
            planned_run_hours: plannedRun,
            actual_setup_hours: 0,
            actual_run_hours: 0,
            step_batch_size: roundProductionValue(routeMetric.stepBatchSize),
            run_time_hours_factor: Number(route.run_time_hours || 0),
            estimated_labor_cost: roundProductionValue(metrics.cogsBreakdown.directLaborCostPerUnit * productionTarget * laborShare),
            status: "Pending"
        };
        return {
            operation: base,
            route: {
                ...base,
                routing_id: Number(routeId || 0) || null,
                qa_template_id: Number(qaTemplate || 0) || null,
                requires_qa: Boolean(qaTemplate) || route.requires_qa === true || Number(route.requires_qa) === 1
            }
        };
    });

    const [existingMaterials, existingRoutes, existingOperations, children, allocations] = await Promise.all([
        readDirectusRows("manufacturing_job_order_materials", `filter[job_order_id][_eq]=${jobOrderId}&fields=*`),
        readDirectusRows("manufacturing_job_order_routes", `filter[job_order_id][_eq]=${jobOrderId}&fields=*`),
        readDirectusRows("manufacturing_job_order_operations", `filter[job_order_id][_eq]=${jobOrderId}&fields=*`),
        readDirectusRows("manufacturing_job_orders", `filter[parent_job_order_id][_eq]=${jobOrderId}&fields=job_order_id&limit=1`),
        readDirectusRows("manufacturing_job_order_allocations", `filter[job_order_id][_eq]=${jobOrderId}&fields=id,allocated_quantity&limit=1`)
    ]);
    if (children.length > 0) throw new Error("This Draft already has dependent sub-assembly Job Orders and cannot change its product or recipe.");
    if (allocations.length > 0) throw new Error("Sales Order-linked Drafts must keep their product, branch, and recipe unchanged.");

    const materialIds = existingMaterials.map((row) => directusRowId(row, ["jo_material_id"])).filter((id) => id > 0);
    const reservations = materialIds.length > 0
        ? await readDirectusRows("manufacturing_job_order_materials_reservations", `filter[jo_material_id][_in]=${materialIds.join(",")}&fields=jo_materials_reservation_id,jo_material_id,reserved_quantity,staged_quantity,issued_to_wip_quantity,actual_used_quantity,returned_quantity,remaining_wip_quantity`)
        : [];
    const hasMaterialProgress = existingMaterials.some((row) =>
        Number(row.reserved_quantity || 0) > 0 || Number(row.actual_consumed_quantity || 0) > 0 || Number(row.scrap_quantity || 0) > 0
    );
    if (reservations.length > 0 || hasMaterialProgress) {
        throw new Error("Product and recipe can only change before materials are reserved, staged, issued, or consumed.");
    }

    const routeIds = existingRoutes.map((row) => directusRowId(row, ["jo_route_id"])).filter((id) => id > 0);
    const routeOperators = routeIds.length > 0
        ? await readDirectusRows("manufacturing_job_order_route_operators", `filter[jo_route_id][_in]=${routeIds.join(",")}&fields=jo_route_operator_id,jo_route_id,started_at,stopped_at,logged_hours`)
        : [];
    if (routeOperators.some((row) => row.started_at && !row.stopped_at || Number(row.logged_hours || 0) > 0)) {
        throw new Error("Product and recipe cannot change after route work has started or operator time has been logged.");
    }
    const qaRows = routeIds.length > 0
        ? await readDirectusRows("manufacturing_job_order_qa_records", `filter[jo_route_id][_in]=${routeIds.join(",")}&fields=qa_record_id&limit=1`)
        : [];
    if (qaRows.length > 0) throw new Error("Product and recipe cannot change after QA records have been created for this Draft.");

    const removed: Array<{ collection: string; row: Record<string, any>; idFields: string[] }> = [];
    const created: Array<{ collection: string; row: Record<string, any>; idFields: string[] }> = [];
    let headerUpdated = false;
    const remove = async (collection: string, rows: Record<string, any>[], idFields: string[]) => {
        for (const row of rows) {
            await deleteDirectusRow(collection, row, idFields);
            removed.push({ collection, row, idFields });
        }
    };
    const restoreOld = async () => {
        for (const item of [...created].reverse()) await deleteDirectusRow(item.collection, item.row, item.idFields).catch(() => undefined);
        const restoreOrder = ["manufacturing_job_order_materials", "manufacturing_job_order_routes", "manufacturing_job_order_operations"];
        for (const item of [...removed].filter((entry) => entry.collection !== "manufacturing_job_order_route_operators")
            .sort((left, right) => restoreOrder.indexOf(left.collection) - restoreOrder.indexOf(right.collection))) {
            const snapshot = { ...item.row };
            delete snapshot.id;
            delete snapshot.jo_material_id;
            delete snapshot.jo_route_id;
            delete snapshot.jo_operation_id;
            await fetch(`${DIRECTUS_URL}/items/${item.collection}`, {
                method: "POST", headers, body: JSON.stringify(snapshot), cache: "no-store"
            }).catch(() => undefined);
        }
        if (headerUpdated) {
            const oldHeader: Record<string, unknown> = {};
            for (const field of ["product_id", "version_id", "branch_id", "target_quantity", "uom_id", "start_date", "end_date", "priority", "shift_option", "remarks", "daily_breakdown", "assigned_personnel", "sub_assembly_version_map"]) {
                if (current[field] !== undefined) oldHeader[field] = current[field];
            }
            await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}`, {
                method: "PATCH", headers, body: JSON.stringify(oldHeader), cache: "no-store"
            }).catch(() => undefined);
            await synchronizeJobOrderOperatorAssignments(jobOrderId, current.assigned_personnel ?? {}, { persistMaster: false }).catch(() => undefined);
        }
    };

    try {
        for (const row of routeOperators) {
            await deleteDirectusRow("manufacturing_job_order_route_operators", row, ["jo_route_operator_id"]);
            removed.push({ collection: "manufacturing_job_order_route_operators", row, idFields: ["jo_route_operator_id"] });
        }
        await remove("manufacturing_job_order_operations", existingOperations, ["jo_operation_id"]);
        await remove("manufacturing_job_order_routes", existingRoutes, ["jo_route_id"]);
        await remove("manufacturing_job_order_materials", existingMaterials, ["jo_material_id"]);

        for (const route of routePayloads) {
            const operation = await createDirectusRow("manufacturing_job_order_operations", route.operation);
            created.push({ collection: "manufacturing_job_order_operations", row: operation, idFields: ["jo_operation_id"] });
            let createdRoute: Record<string, any>;
            try {
                createdRoute = await createDirectusRow("manufacturing_job_order_routes", route.route);
            } catch (error) {
                if (!/unknown field|invalid payload|does not exist|doesn't exist|field .* not found/i.test(error instanceof Error ? error.message : "")) throw error;
                const legacyRoute: Record<string, unknown> = { ...route.route };
                delete legacyRoute.routing_id;
                delete legacyRoute.qa_template_id;
                delete legacyRoute.requires_qa;
                createdRoute = await createDirectusRow("manufacturing_job_order_routes", legacyRoute);
            }
            created.push({ collection: "manufacturing_job_order_routes", row: createdRoute, idFields: ["jo_route_id"] });
        }
        for (const material of materialPayloads) {
            const row = await createDirectusRow("manufacturing_job_order_materials", material);
            created.push({ collection: "manufacturing_job_order_materials", row, idFields: ["jo_material_id"] });
        }

        const headerPatch: Record<string, unknown> = {
            product_id: nextProductId,
            version_id: nextVersionId,
            branch_id: nextBranchId,
            target_quantity: productionTarget,
            uom_id: normalizedTargetUomId || null,
            daily_breakdown: dailyBreakdown,
            start_date: patchData.start_date ?? current.start_date ?? null,
            end_date: patchData.due_date ?? patchData.end_date ?? current.end_date ?? null,
            modified_at: formatPhtDateTime()
        };
        for (const field of ["start_date", "end_date", "priority", "shift_option", "remarks", "sub_assembly_version_map"]) {
            if (patchData[field] !== undefined) headerPatch[field] = patchData[field];
        }
        const headerResponse = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}`, {
            method: "PATCH", headers, body: JSON.stringify(headerPatch), cache: "no-store"
        });
        if (!headerResponse.ok) throw new Error(`Failed to update the Draft Job Order header (${headerResponse.status}).`);
        headerUpdated = true;
        const assignments = patchData.assigned_personnel ?? current.assigned_personnel ?? {};
        const validSequences = new Set(routePayloads.map((route) => Number(route.route.sequence_order)));
        const normalizedAssignments = normalizeOperatorAssignments(assignments);
        const assignmentsForNewRoutes = Object.fromEntries(Object.entries(normalizedAssignments)
            .filter(([sequence]) => validSequences.has(Number(sequence))));
        await synchronizeJobOrderOperatorAssignments(jobOrderId, assignmentsForNewRoutes, { persistMaster: false });

    } catch (error) {
        await restoreOld();
        throw error;
    }
}


export async function updateJobOrder(joId: string, patchData: Record<string, any>): Promise<{ success: boolean }> {
    return modifyJobOrder(joId, patchData);
}

export async function modifyJobOrder(joId: string, patchData: Record<string, any>): Promise<{ success: boolean }> {
    try {
        const suppliedId = Number(joId);
        const joInfo = Number.isSafeInteger(suppliedId) && suppliedId > 0
            ? null
            : await getJobOrderIdByNo(joId);
        const joIdInt = Number.isSafeInteger(suppliedId) && suppliedId > 0 ? suppliedId : Number(joInfo?.id || 0);
        if (!joIdInt) throw new Error(`Job Order not found: ${joId}`);

        const currentResponse = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_job_orders/${joIdInt}`,
            { headers, cache: "no-store" }
        );
        if (!currentResponse.ok) {
            throw new Error(`Failed to verify Job Order ${joId} before updating it (Directus HTTP ${currentResponse.status}).`);
        }
        const current = (await currentResponse.json().catch(() => ({}))).data || {};

        const identityChanged = ["product_id", "version_id", "branch_id"].some((field) =>
            patchData[field] !== undefined && Number(patchData[field]) !== Number(current[field])
        ) || (patchData.sub_assembly_version_map !== undefined
            && canonicalVersionMap(patchData.sub_assembly_version_map) !== canonicalVersionMap(current.sub_assembly_version_map));
        if (identityChanged) {
            if (String(current.status || "").trim().toLowerCase() !== "draft") {
                throw new Error("Product, branch, and recipe can only be changed while the Job Order is in Draft status.");
            }
            await rebuildDraftWorkplan(joIdInt, patchData, current);
            return { success: true };
        }

        const headerPatch: Record<string, any> = {};

        // Extract products updates if any
        let productsPatchList = patchData.products;
        if (productsPatchList && Array.isArray(productsPatchList) && productsPatchList.length > 0) {
            const firstP = productsPatchList[0];
            if (firstP.product_id !== undefined) headerPatch.product_id = Number(firstP.product_id);
            if (firstP.quantity !== undefined) patchData.quantity = Number(firstP.quantity);
            const vId = firstP.bom?.version || firstP.bom?.version_id;
            if (vId !== undefined) headerPatch.version_id = Number(vId);
        }

        // Map incoming fields to new schema fields
        if (patchData.status !== undefined) {
            throw new Error("Job Order lifecycle status must be changed through the workflow action endpoint.");
        }
        if (patchData.due_date !== undefined) headerPatch.end_date = patchData.due_date;
        if (patchData.start_date !== undefined) headerPatch.start_date = patchData.start_date;
        if (patchData.remarks !== undefined) headerPatch.remarks = patchData.remarks;
        if (patchData.priority !== undefined) headerPatch.priority = Number(patchData.priority);
        if (patchData.shift_option !== undefined) headerPatch.shift_option = patchData.shift_option;
        if (patchData.product_id !== undefined) headerPatch.product_id = Number(patchData.product_id);
        if (patchData.version_id !== undefined) headerPatch.version_id = Number(patchData.version_id);
        if (patchData.branch_id !== undefined) headerPatch.branch_id = Number(patchData.branch_id);
        if (patchData.uom_id !== undefined) headerPatch.uom_id = patchData.uom_id ? Number(patchData.uom_id) : null;
        if (patchData.sub_assembly_version_map !== undefined) headerPatch.sub_assembly_version_map = patchData.sub_assembly_version_map;
        if (patchData.created_by !== undefined) headerPatch.created_by = Number(patchData.created_by);

        if (patchData.assigned_personnel !== undefined) {
            const assignmentState = await synchronizeJobOrderOperatorAssignments(
                joIdInt,
                patchData.assigned_personnel,
                { persistMaster: false }
            );
            headerPatch.assigned_personnel = assignmentState.assignments;
        }

        if (patchData.quantity !== undefined && Number(patchData.quantity) > 0) {
            const newQty = Number(patchData.quantity);
            const joRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joIdInt}?fields=job_order_id,target_quantity,status`, { headers });
            if (joRes.ok) {
                const joData = (await joRes.json()).data;
                const status = String(joData?.status || "").trim();
                if (status.toLowerCase() !== "draft") {
                    throw new Error("Target quantity can only be modified while the Job Order is in Draft status.");
                }
                const oldQty = Number(joData?.target_quantity || 0);
                headerPatch.target_quantity = newQty;

                if (oldQty > 0 && oldQty !== newQty) {
                    const ratio = newQty / oldQty;
                    // Update parent materials allocated_quantity
                    const matRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${joIdInt}`, { headers });
                    if (matRes.ok) {
                        const mats = (await matRes.json()).data || [];
                        for (const mat of mats) {
                            const oldAlloc = Number(mat.allocated_quantity || 0);
                            const newAlloc = Math.round((oldAlloc * ratio) * 10000) / 10000;
                            await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${mat.jo_material_id || mat.id}`, {
                                method: "PATCH",
                                headers,
                                body: JSON.stringify({ allocated_quantity: newAlloc })
                            });
                        }
                    }

                    // Also scale child sub-assembly JOs if any
                    const childJoRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter[parent_job_order_id][_eq]=${joIdInt}&fields=job_order_id,target_quantity,status`, { headers });
                    if (childJoRes.ok) {
                        const childJos = (await childJoRes.json()).data || [];
                        for (const cJo of childJos) {
                            const cOldQty = Number(cJo.target_quantity || 0);
                            const cNewQty = Math.round(cOldQty * ratio);
                            await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${cJo.job_order_id}`, {
                                method: "PATCH",
                                headers,
                                body: JSON.stringify({ target_quantity: cNewQty, modified_at: formatPhtDateTime() })
                            });
                            const cMatRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${cJo.job_order_id}`, { headers });
                            if (cMatRes.ok) {
                                const cMats = (await cMatRes.json()).data || [];
                                for (const cMat of cMats) {
                                    const cOldAlloc = Number(cMat.allocated_quantity || 0);
                                    const cNewAlloc = Math.round((cOldAlloc * ratio) * 10000) / 10000;
                                    await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${cMat.jo_material_id || cMat.id}`, {
                                        method: "PATCH",
                                        headers,
                                        body: JSON.stringify({ allocated_quantity: cNewAlloc })
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Patch header
        if (Object.keys(headerPatch).length > 0) {
            headerPatch.modified_at = formatPhtDateTime();
            const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joIdInt}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(headerPatch)
            });
            if (!res.ok) throw new Error(`Failed to patch job_order header: ${res.status}`);
        }

        return { success: true };
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to update job order:", e);
        throw e;
    }
}

