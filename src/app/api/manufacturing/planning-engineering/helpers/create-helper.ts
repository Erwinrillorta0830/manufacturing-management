/* eslint-disable */
import { DIRECTUS_URL, headers, DirectusJobOrder, getUomCountForProduct } from "./shared";
import { getBOMDetailsForVersion, getActiveVersionForProduct } from "../../finished-goods/versions/versions-helper";
import { getTodayDateString, formatPhtDateTime } from "@/app/api/manufacturing/directus-api";
import { getAvailableInventoryLots } from "./inventory-helper";
import {
    isCancelledJobOrderStatus,
    isTerminalJobOrderStatus,
    JOB_ORDER_STATUS
} from "@/modules/manufacturing-management/job-order-status";
import { deleteJobOrder } from "./delete-helper";

const QUANTITY_EPSILON = 0.000001;

export class SalesOrderAllocationConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SalesOrderAllocationConflictError";
    }
}

export interface SalesOrderSchedulingPlan {
    branchId: number;
    productId: number;
    bomVersionId: number;
    totalQuantity: number;
    lines: Array<{
        detailId: number;
        parentOrderId: number;
        availableQuantity: number;
        allocationQuantity: number;
    }>;
}

export interface CreateJobOrderOptions {
    deferSalesOrderTransition?: boolean;
    /** Creation is always a Draft; initialization is an explicit next action. */
    initialize?: boolean;
    /** Legacy buffer flag for initialization against physical on-hand stock. */
    physicalOnHandInitialization?: boolean;
    /** Planning may initialize an SO JO from physical on-hand stock without changing its SO linkage. */
    usePhysicalOnHand?: boolean;
}

function relationId(value: unknown): number {
    if (value && typeof value === "object") {
        const relation = value as Record<string, unknown>;
        return Number(relation.job_order_id ?? relation.sales_order_detail_id ?? relation.detail_id ?? relation.id ?? 0);
    }
    return Number(value || 0);
}

async function readActiveAllocationQuantity(detailId: number, excludedJobOrderId?: number): Promise<number> {
    const allocationUrl = `${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[sales_order_detail_id][_eq]=${detailId}&fields=sales_order_detail_id,job_order_id,allocated_quantity,status&limit=-1`;
    let response = await fetch(allocationUrl, { headers, cache: "no-store" });
    let allocations: any[];
    if (response.ok) {
        allocations = (await response.json()).data || [];
    } else {
        const responseBody = await response.text();
        if (!/unknown field|invalid field|does not exist|doesn't exist|field .* not found/i.test(responseBody)) {
            throw new Error(`Failed to refresh Sales Order allocations for detail ${detailId}: ${response.status}`);
        }
        response = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_job_order_allocations?filter[sales_order_detail_id][_eq]=${detailId}&fields=sales_order_detail_id,job_order_id,allocated_quantity&limit=-1`,
            { headers, cache: "no-store" }
        );
        if (!response.ok) throw new Error(`Failed to refresh Sales Order allocations for detail ${detailId}: ${response.status}`);
        allocations = (await response.json()).data || [];
    }

    const activeAllocations = allocations.filter((allocation) => {
        if (isCancelledJobOrderStatus(allocation.status)) return false;
        const jobOrderId = relationId(allocation.job_order_id);
        return !excludedJobOrderId || jobOrderId !== excludedJobOrderId;
    });
    const jobOrderIds = [...new Set(activeAllocations.map((allocation) => relationId(allocation.job_order_id)).filter(Boolean))];
    const terminalJobOrderIds = new Set<number>();
    if (jobOrderIds.length > 0) {
        const jobOrderResponse = await fetch(
            `${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_id][_in]=${jobOrderIds.join(",")}&fields=job_order_id,status&limit=-1`,
            { headers, cache: "no-store" }
        );
        if (!jobOrderResponse.ok) throw new Error(`Failed to refresh linked Job Orders for detail ${detailId}: ${jobOrderResponse.status}`);
        for (const jobOrder of ((await jobOrderResponse.json()).data || []) as any[]) {
            if (isCancelledJobOrderStatus(jobOrder.status) || isTerminalJobOrderStatus(jobOrder.status)) {
                terminalJobOrderIds.add(Number(jobOrder.job_order_id));
            }
        }
    }

    return activeAllocations.reduce((sum, allocation) => {
        if (terminalJobOrderIds.has(relationId(allocation.job_order_id))) return sum;
        const quantity = Number(allocation.allocated_quantity ?? allocation.quantity ?? 0);
        return Number.isFinite(quantity) && quantity > 0 ? sum + quantity : sum;
    }, 0);
}

async function assertFreshAllocationCapacity(
    detailId: number,
    requestedQuantity: number,
    excludedJobOrderId?: number
) {
    const detailResponse = await fetch(
        `${DIRECTUS_URL}/items/sales_order_details/${detailId}?fields=detail_id,ordered_quantity,allocated_quantity,served_quantity`,
        { headers, cache: "no-store" }
    );
    if (!detailResponse.ok) throw new Error(`Failed to refresh Sales Order detail ${detailId}: ${detailResponse.status}`);
    const detail = (await detailResponse.json()).data;
    const ordered = Number(detail?.ordered_quantity || 0);
    const fulfilled = Math.max(Number(detail?.allocated_quantity || 0), Number(detail?.served_quantity || 0));
    const planned = await readActiveAllocationQuantity(detailId, excludedJobOrderId);
    const available = Math.max(0, ordered - fulfilled - planned);
    if (!Number.isFinite(available) || requestedQuantity > available + QUANTITY_EPSILON) {
        throw new SalesOrderAllocationConflictError(`Sales Order detail ${detailId} no longer has enough remaining quantity for this Job Order. Refresh the demand list and try again.`);
    }
}

export async function transitionLinkedSalesOrdersToInProduction(
    parentOrderIds: Set<number>,
    previousParentStatuses: Map<number, string>
) {
    for (const parentOrderId of parentOrderIds) {
        const previousStatus = String(previousParentStatuses.get(parentOrderId) || "").trim();
        if (previousStatus !== "For Production") continue;

        // Re-read the parent before patching so a concurrent downstream
        // transition is not overwritten by this JO-link operation.
        const currentResponse = await fetch(
            `${DIRECTUS_URL}/items/sales_order/${parentOrderId}?fields=order_id,order_status`,
            { headers, cache: "no-store" }
        );
        if (!currentResponse.ok) {
            throw new Error(`Failed to re-read Sales Order ${parentOrderId} before status transition: ${currentResponse.status}`);
        }
        const currentOrder = (await currentResponse.json()).data;
        const currentStatus = String(currentOrder?.order_status || "").trim();
        if (currentStatus !== "For Production") continue;

        const statusResponse = await fetch(`${DIRECTUS_URL}/items/sales_order/${parentOrderId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ order_status: "In Production" })
        });
        if (!statusResponse.ok) {
            throw new Error(`Failed to transition Sales Order ${parentOrderId} to In Production: ${statusResponse.status}`);
        }
    }
}

export async function createJobOrder(
    joData: Partial<DirectusJobOrder>,
    salesOrderIds: number[] = [],
    salesOrderDetailIds: number[] = [],
    schedulingPlan?: SalesOrderSchedulingPlan | null,
    options: CreateJobOrderOptions = {}
): Promise<{ job_order_id?: number | null; jo_id?: string | null; status?: string; shortfalls?: Array<{ name: string; required: number; available: number; shortage: number }> }> {
    let createdJobOrderNo: string | null = null;
    const previousParentStatuses = new Map<number, string>();
    try {
        const todayStr = await getTodayDateString();
        let productsList = schedulingPlan
            ? [{
                product_id: schedulingPlan.productId,
                product_name: joData.product_name,
                quantity: schedulingPlan.totalQuantity,
                bom: { version_id: schedulingPlan.bomVersionId }
            }]
            : (joData.products || []);
        if (productsList.length === 0 && joData.product_id) {
            productsList = [{
                product_id: joData.product_id,
                product_name: joData.product_name,
                quantity: joData.quantity,
                bom: joData.bom
            }];
        }

        const mergedProducts: Record<string, any> = {};
        for (const p of productsList) {
            const pId = Number(p.product_id);
            let versionId = (p as any).bom?.version || (p as any).bom?.bom_id || (p as any).bom?.version_id || null;
            if (!versionId && salesOrderIds && salesOrderIds.length > 0) {
                try {
                    const soId = salesOrderIds[0];
                    const soRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${soId}`, { headers });
                    if (soRes.ok) {
                        const so = (await soRes.json()).data;
                        const customerCode = so?.customer_code;
                        if (customerCode) {
                            const custRes = await fetch(`${DIRECTUS_URL}/items/customer?filter[customer_code][_eq]=${encodeURIComponent(customerCode)}&limit=1`, { headers });
                            if (custRes.ok) {
                                const customer = (await custRes.json()).data?.[0];
                                const customerId = customer?.id || customer?.customer_id;
                                if (customerId) {
                                    const activeVer = await getActiveVersionForProduct(pId, Number(customerId));
                                    versionId = activeVer.version?.version_id || null;
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed to resolve customer override during creation:", err);
                }
            }
            if (!versionId) {
                const activeVer = await getActiveVersionForProduct(pId);
                versionId = activeVer.version?.version_id || null;
            }
            const key = `${pId}-${versionId || 'default'}`;
            if (!mergedProducts[key]) {
                mergedProducts[key] = {
                    product_id: pId,
                    product_name: p.product_name || `Product #${pId}`,
                    quantity: 0,
                    bom: versionId ? { version_id: versionId } : null
                };
            }
            mergedProducts[key].quantity += Number(p.quantity || 0);
        }
        const finalProductsList = Object.values(mergedProducts);
        const totalMergedQuantity = finalProductsList.reduce((sum, p) => sum + Number(p.quantity || 0), 0);

        const firstProd = finalProductsList[0];
        if (!firstProd) throw new Error("No products selected for Job Order");

        let versionId = firstProd.bom?.version_id;
        if (!versionId && salesOrderIds && salesOrderIds.length > 0) {
            try {
                const soId = salesOrderIds[0];
                const soRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${soId}`, { headers });
                if (soRes.ok) {
                    const so = (await soRes.json()).data;
                    const customerCode = so?.customer_code;
                    if (customerCode) {
                        const custRes = await fetch(`${DIRECTUS_URL}/items/customer?filter[customer_code][_eq]=${encodeURIComponent(customerCode)}&limit=1`, { headers });
                        if (custRes.ok) {
                            const customer = (await custRes.json()).data?.[0];
                            const customerId = customer?.id || customer?.customer_id;
                            if (customerId) {
                                const activeVer = await getActiveVersionForProduct(firstProd.product_id, Number(customerId));
                                versionId = activeVer.version?.version_id;
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to resolve customer override for first product:", err);
            }
        }
        if (!versionId) {
            const activeVer = await getActiveVersionForProduct(firstProd.product_id);
            versionId = activeVer.version?.version_id;
        }

        let targetUomId = Number((joData as any).uom_id || (joData as any).uomId || firstProd.uom_id || 0);
        if (!targetUomId) {
            const productResponse = await fetch(
                `${DIRECTUS_URL}/items/products/${firstProd.product_id}?fields=unit_of_measurement,unit_of_measurement.unit_id`,
                { headers, cache: "no-store" }
            );
            if (productResponse.ok) {
                const product = (await productResponse.json()).data || {};
                const unit = product.unit_of_measurement;
                targetUomId = Number(
                    typeof unit === "object" ? unit?.unit_id ?? unit?.id : unit
                ) || 0;
            }
        }

        const shouldInitialize = options.initialize === true;

        // Dry-Run BOM Explosion & Raw Material Stock Verification. Draft saves
        // persist the worksheet only; they must not be rejected or annotated
        // from a point-in-time availability check.
        const shortfalls: Array<{ name: string; required: number; available: number; shortage: number }> = [];
        const inventoryAvailabilityOptions = shouldInitialize
            && (options.physicalOnHandInitialization || options.usePhysicalOnHand)
            ? { includeReservations: false }
            : undefined;
        
        for (const p of finalProductsList) {
            const pId = p.product_id;
            let pVersionId = p.bom?.version_id;
            if (!pVersionId) {
                const activeVer = await getActiveVersionForProduct(pId);
                pVersionId = activeVer.version?.version_id || null;
            }

            const { version, routes } = pVersionId 
                ? await getBOMDetailsForVersion(pId, pVersionId)
                : await getActiveVersionForProduct(pId);

            if (version && version.status && (version.status as string) !== "Active" && (version.status as string) !== "Approved") {
                throw new Error(`Cannot create Job Order for Product '${p.product_name}': Version '${version.version_name || pVersionId}' is not yet approved (Status: ${version.status}).`);
            }
            
            const components: any[] = [];
            if (routes && routes.length > 0) {
                for (const r of routes) {
                    if (r.bom_items && r.bom_items.length > 0) {
                        components.push(...r.bom_items);
                    }
                }
            }
            
            let productionQty = Number(p.quantity);
            if (version && version.product_id && Number(version.product_id) !== Number(pId)) {
                const pCount = await getUomCountForProduct(pId);
                if (pCount > 0) {
                    productionQty = Math.ceil(productionQty / pCount);
                }
            }

            if (components.length > 0) {
                for (const bItem of components) {
                    const compProductId = Number(bItem.product_id);
                    const wastage = 1 + (Number(bItem.wastage_factor_percentage || 0) / 100);
                    const baseQuantity = Number(version?.base_quantity || 1);
                    const quantityRequired = (productionQty * Number(bItem.quantity_required || 0) * wastage) / baseQuantity;

                    // Verify if it has an active version (making it a sub-assembly)
                    const compActiveVer = await getActiveVersionForProduct(compProductId);
                    const isSubAssembly = compActiveVer && compActiveVer.version;

                    if (shouldInitialize && !isSubAssembly) {
                        if (!joData.branch_id) {
                            throw new Error("Cannot verify stock: Job Order is missing branch_id");
                        }
                        const branchId = Number(joData.branch_id);
                        const availableLots = await getAvailableInventoryLots(compProductId, branchId, inventoryAvailabilityOptions);
                        const netAvailable = availableLots.reduce((total, lot) => total + lot.available, 0);

                        const shortage = Math.max(0, quantityRequired - netAvailable);
                        if (shortage > 0.000001) {
                            let prodName = `Product #${compProductId}`;
                            try {
                                const prodRes = await fetch(`${DIRECTUS_URL}/items/products/${compProductId}?fields=product_name`, { headers });
                                if (prodRes.ok) {
                                    prodName = (await prodRes.json()).data?.product_name || prodName;
                                }
                            } catch (err) {
                                console.error("Failed to fetch product name for shortfall error:", err);
                            }
                            shortfalls.push({
                                name: prodName,
                                required: quantityRequired,
                                available: netAvailable,
                                shortage
                            });
                        }
                    }
                }
            }
        }

        const numericTargetQuantity = Number(totalMergedQuantity);
        const numericBranchId = Number(joData.branch_id);
        const numericPriority = Number((joData as any).priority ?? 0);
        const numericVersionId = Number(versionId || 0);
        if (!Number.isSafeInteger(numericBranchId) || numericBranchId <= 0) {
            throw new Error("A valid branch is required before creating a Job Order.");
        }
        if (!Number.isSafeInteger(numericVersionId) || numericVersionId <= 0) {
            throw new Error("An approved product version/formula is required before creating a Job Order.");
        }
        if (!Number.isFinite(numericTargetQuantity) || numericTargetQuantity <= 0) {
            throw new Error("A target production quantity greater than zero is required before creating a Job Order.");
        }
        if (!Number.isSafeInteger(targetUomId) || targetUomId <= 0) {
            throw new Error("A target unit of measurement is required before creating a Job Order.");
        }
        if (!Number.isFinite(numericPriority) || numericPriority < 0) {
            throw new Error("A valid non-negative Job Order priority is required before creating a Job Order.");
        }

        // A create request never changes the lifecycle state. The caller must
        // invoke the workflow initialize action after the full BOM, routing,
        // and material worksheet are persisted.
        const initialStatus = JOB_ORDER_STATUS.DRAFT;

        let forcedDraftRemarks = "";
        if (shouldInitialize && shortfalls.length > 0) {
            console.log("[createJobOrder] Shortfall detected. Keeping Job Order in Draft. shortfalls:", shortfalls);
            const shortfallMsg = shortfalls.map(s => 
                `${s.name} (Shortfall: ${s.shortage.toFixed(4)} units)`
            ).join("; ");
            forcedDraftRemarks = ` | Saved as Draft due to raw material shortfalls: ${shortfallMsg}`;
        }

        // 3. Insert header
        const headerPayload = {
            job_order_no: joData.jo_id || `JO-${Math.floor(100000 + Math.random() * 900000)}`,
            parent_job_order_id: joData.parent_job_order_id ? Number(joData.parent_job_order_id) : null,
            product_id: firstProd.product_id,
            version_id: versionId || null,
            target_quantity: numericTargetQuantity,
            completed_quantity: 0,
            rejected_quantity: 0,
            actual_quantity_produced: 0,
            start_date: joData.start_date || (joData as any).planned_date || todayStr,
            end_date: joData.due_date || null,
            status: initialStatus,
            uom_id: targetUomId,
            priority: numericPriority,
            primary_work_center_id: (joData as any).primary_work_center_id ? Number((joData as any).primary_work_center_id) : null,
            shift_option: joData.shift_option || "8",
            sub_assembly_version_map: (joData as any).sub_assembly_version_map 
                ? (typeof (joData as any).sub_assembly_version_map === "object" ? JSON.stringify((joData as any).sub_assembly_version_map) : (joData as any).sub_assembly_version_map) 
                : ((joData as any).subAssemblyVersionMap ? JSON.stringify((joData as any).subAssemblyVersionMap) : null),
            branch_id: numericBranchId,
            created_by: joData.created_by ? Number(joData.created_by) : null,
            created_at: formatPhtDateTime(),
            modified_at: null,
            remarks: (joData.remarks || `Consolidated production run. Shift: ${joData.shift_option || "8"}`) + forcedDraftRemarks
        };

        const headerRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders`, {
            method: "POST",
            headers,
            body: JSON.stringify(headerPayload)
        });
        if (!headerRes.ok) {
            const txt = await headerRes.text();
            throw new Error(`Failed to create job_order header: ${headerRes.status} - ${txt}`);
        }

        const createdJo = (await headerRes.json()).data;
        const joIdInt = createdJo.job_order_id;
        const joNoStr = createdJo.job_order_no;
        createdJobOrderNo = joNoStr;

        // Insert initial status record into manufacturing_job_order_status_history
        const historyRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_status_history`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                job_order_id: joIdInt,
                old_status: JOB_ORDER_STATUS.DRAFT,
                new_status: JOB_ORDER_STATUS.DRAFT,
                workflow_action: "create-draft",
                event_key: `create:${joNoStr}`,
                remarks: "Initial Job Order Creation",
                changed_by: joData.created_by ? Number(joData.created_by) : null,
                changed_at: formatPhtDateTime()
            })
        });
        if (!historyRes.ok) {
            throw new Error(`Failed to create initial Job Order status history: ${historyRes.status} - ${await historyRes.text()}`);
        }

        // 4. Insert merged product(s) and explode BOM/routings
        let totalEstimatedHours = 0;
        for (const p of finalProductsList) {
            const { version, routes } = versionId 
                ? await getBOMDetailsForVersion(p.product_id, versionId)
                : await getActiveVersionForProduct(p.product_id);

            let productionQty = Number(p.quantity);
            if (version && version.product_id && Number(version.product_id) !== Number(p.product_id)) {
                try {
                    const originalUomCount = await getUomCountForProduct(Number(p.product_id));
                    const targetUomCount = await getUomCountForProduct(Number(version.product_id));
                    productionQty = productionQty * (originalUomCount / targetUomCount);
                } catch (e) {
                    console.error("Error scaling quantity for job order product variant:", e);
                }
            }

            const baseQuantity = Number(version?.base_quantity || 1);

            if (routes && routes.length > 0) {
                for (const r of routes) {
                    const plannedSetup = Number(r.setup_time_hours || 0);
                    const plannedRun = (productionQty / Number(r.step_batch_size || 1)) * Number(r.run_time_hours || 0);
                    const plannedLabor = (plannedSetup + plannedRun) * 150;
                    totalEstimatedHours += (plannedSetup + plannedRun);

                    const masterRoutingId = Number((r as any).route_id || (r as any).routing_id || (r as any).id || 0);
                    const rawQaTemplate = (r as any).qa_template_id;
                    const qaTemplateId = rawQaTemplate && typeof rawQaTemplate === "object"
                        ? Number(rawQaTemplate.template_id || rawQaTemplate.id || 0)
                        : Number(rawQaTemplate || 0);
                    const requiresQa = qaTemplateId > 0
                        || (r as any).requires_qa === true
                        || Number((r as any).requires_qa) === 1;

                    // Keep the legacy fields shared by both route collections. The
                    // job-order route receives the master routing/QA metadata when
                    // the Directus schema supports those optional fields.
                    const baseRoutePayload = {
                        job_order_id: joIdInt,
                        sequence_order: Number(r.sequence_order || 0),
                        work_center_id: Number(r.work_center_id || 1),
                        operation_id: Number((r as any).operation_id || (r as any).id || 1),
                        planned_setup_hours: plannedSetup,
                        planned_run_hours: plannedRun,
                        actual_setup_hours: 0,
                        actual_run_hours: 0,
                        step_batch_size: Number(r.step_batch_size || 1),
                        run_time_hours_factor: Number(r.run_time_hours || 0),
                        estimated_labor_cost: plannedLabor,
                        status: "Pending"
                    };

                    const jobOrderRoutePayload = {
                        ...baseRoutePayload,
                        routing_id: masterRoutingId || null,
                        qa_template_id: qaTemplateId || null,
                        requires_qa: requiresQa
                    };

                    await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_operations`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(baseRoutePayload)
                    }).catch(() => {});

                    let routeRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?fields=jo_route_id`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(jobOrderRoutePayload)
                    });
                    let routeResponseText = "";

                    // Older Directus instances may not yet have the optional QA
                    // metadata columns. Retry with the legacy payload only for an
                    // explicit schema/payload-field rejection; other write errors
                    // must remain visible to the caller.
                    if (!routeRes.ok) {
                        routeResponseText = await routeRes.text();
                        const optionalFieldsUnsupported = /unknown field|invalid payload|does not exist|doesn't exist|field .* not found/i.test(routeResponseText);
                        if (optionalFieldsUnsupported) {
                            console.warn("[createJobOrder] JO route QA metadata fields are unavailable; using legacy route payload.", routeResponseText);
                            routeRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?fields=jo_route_id`, {
                                method: "POST",
                                headers,
                                body: JSON.stringify(baseRoutePayload)
                            });
                            routeResponseText = "";
                        }
                    }

                    if (!routeRes.ok) {
                        const errorText = routeResponseText || await routeRes.text();
                        throw new Error(`Failed to create Job Order route: ${routeRes.status} - ${errorText}`);
                    }

                    if (routeRes.ok) {
                        const routeJson = await routeRes.json();
                        const newRouteId = routeJson.data?.jo_route_id;
                        if (newRouteId) {
                            const stepSeq = Number(r.sequence_order || 0);
                            const assignedUserIds = (joData as any).assignments?.[stepSeq] || [];
                            for (const uId of assignedUserIds) {
                                let userRate = 150;
                                try {
                                    const uRes = await fetch(`${DIRECTUS_URL}/items/user/${uId}?fields=hourly_rate`, { headers });
                                    if (uRes.ok) {
                                        const uData = (await uRes.json()).data;
                                        userRate = Number(uData?.hourly_rate || 150);
                                    }
                                } catch (e) {
                                    console.error("Error fetching user rate during creation:", e);
                                }

                                const assPayload = {
                                    jo_route_id: newRouteId,
                                    operator_id: Number(uId),
                                    logged_hours: 0,
                                    hourly_rate: userRate,
                                    logged_at: formatPhtDateTime()
                                };
                                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators`, {
                                    method: "POST",
                                    headers,
                                    body: JSON.stringify(assPayload)
                                }).catch(err => console.error("Error creating route operator assignment:", err));
                            }
                        }
                    } else {
                        console.error("Error creating manufacturing_job_order_routes row:", await routeRes.text());
                    }

                    // Extract BOM items (materials)
                    if (r.bom_items && r.bom_items.length > 0) {
                        for (const bItem of r.bom_items) {
                            const compProductId = Number(bItem.product_id);
                            const wastage = 1 + (Number(bItem.wastage_factor_percentage || 0) / 100);
                            const baseQuantity = Number(version?.base_quantity || 1);
                            const quantityRequired = (productionQty * Number(bItem.quantity_required || 0) * wastage) / baseQuantity;

                             // Check if component is a sub-assembly
                             const activeVer = await getActiveVersionForProduct(compProductId);
                             const isSubAssembly = activeVer && activeVer.version;

                             let allocatedQty = 0;
                             const allocations: {
                                 purchase_order_product_id: number;
                                 mm_lot_id?: number;
                                 inventory_lot_id?: number;
                                 batch_no?: string;
                                 expiry_date?: string | null;
                                 allocated: number;
                             }[] = [];

                            if (shouldInitialize) {
                                 if (!joData.branch_id) {
                                     throw new Error("Cannot allocate raw materials: Job Order is missing branch_id");
                                 }
                                 const branchId = Number(joData.branch_id);
                                 const availableLots = await getAvailableInventoryLots(compProductId, branchId, inventoryAvailabilityOptions);

                                 for (const lot of availableLots) {
                                     if (allocatedQty >= quantityRequired) break;

                                     const needed = quantityRequired - allocatedQty;
                                     const taken = Math.min(lot.available, needed);

                                     if (taken > 0) {
                                         allocatedQty += taken;
                                          allocations.push({
                                              purchase_order_product_id: lot.purchaseOrderReceivingId || 0,
                                              mm_lot_id: lot.mmLotId || undefined,
                                              inventory_lot_id: lot.inventoryLotId || undefined,
                                              batch_no: lot.batchNo,
                                             expiry_date: lot.expiryDate || null,
                                             allocated: taken
                                         });
                                     }
                                 }
                             }

                            let uomId = Number((bItem as any).uom_id || 0);
                            if (!uomId) {
                                try {
                                    const pRes = await fetch(`${DIRECTUS_URL}/items/products/${compProductId}?fields=unit_of_measurement`, { headers });
                                    if (pRes.ok) {
                                        const pData = (await pRes.json()).data;
                                        const uomVal = pData?.unit_of_measurement;
                                        uomId = uomVal ? Number(uomVal.id || uomVal) : 1;
                                    }
                                } catch (e) {
                                    console.error("Error looking up UOM ID for component:", e);
                                    uomId = 1;
                                }
                            }

                            // Log Material Requirement (Single Row)
                            const matPayload = {
                                job_order_id: joIdInt,
                                product_id: compProductId,
                                uom_id: uomId || 1,
                                allocated_quantity: quantityRequired,
                                reserved_quantity: allocatedQty,
                                actual_consumed_quantity: 0,
                                scrap_quantity: 0
                            };
                            
                            const matRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials`, {
                                method: "POST",
                                headers,
                                body: JSON.stringify(matPayload)
                            });
                            
                            if (!matRes.ok) {
                                throw new Error(`Failed to create Job Order material worksheet row: ${matRes.status} - ${await matRes.text()}`);
                            }

                            const createdMat = (await matRes.json()).data;
                            const jomId = Number(createdMat?.jo_material_id || createdMat?.id || 0);
                            if (!jomId) {
                                throw new Error("Job Order material worksheet row was created without an identifier.");
                            }

                            // The reservation record is the authoritative source
                            // for the material's exact lot and batch. The legacy
                            // job-order allocation collection is reserved for
                            // Sales Order linkage and requires sales_order_detail_id;
                            // writing material-lot rows there would either fail
                            // validation or inflate SO fulfillment quantities.
                            for (const alloc of allocations) {
                                const reservationPayload: Record<string, unknown> = {
                                    product_id: compProductId,
                                    branch_id: numericBranchId,
                                    mm_lot_id: alloc.mm_lot_id || null,
                                    inventory_lot_id: alloc.inventory_lot_id || null,
                                    batch_no: alloc.batch_no || null,
                                    expiry_date: alloc.expiry_date || null,
                                    jo_material_id: jomId,
                                    reserved_quantity: alloc.allocated,
                                    actual_used_quantity: 0,
                                    reservation_status: "SOFT",
                                    uom_id: uomId || null,
                                    source_event_key: `jo:${joIdInt}:reserve:${jomId}:${alloc.purchase_order_product_id || 0}:${alloc.mm_lot_id || 0}:${alloc.batch_no || ""}`,
                                    created_by: joData.created_by ? Number(joData.created_by) : null
                                };
                                if (alloc.purchase_order_product_id > 0) {
                                    reservationPayload.purchase_order_receiving_id = alloc.purchase_order_product_id;
                                }
                                const reservationRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations`, {
                                    method: "POST",
                                    headers,
                                    body: JSON.stringify(reservationPayload)
                                });
                                if (!reservationRes.ok) {
                                    throw new Error(`Failed to create Job Order material reservation: ${reservationRes.status} - ${await reservationRes.text()}`);
                                }
                            }

                            const shortfall = quantityRequired - allocatedQty;

                            // Auto-spawn child Job Orders for manufactured sub-assemblies with shortages
                            if (shouldInitialize && shortfall > 0) {
                                try {
                                    const subVerMap = (joData as any).subAssemblyVersionMap || (joData as any).sub_assembly_version_map || {};
                                    const selectedVerId = subVerMap[compProductId] || subVerMap[String(compProductId)];
                                    const activeVer = selectedVerId 
                                        ? await getBOMDetailsForVersion(compProductId, Number(selectedVerId))
                                        : await getActiveVersionForProduct(compProductId);

                                    if (activeVer && activeVer.version) {
                                        const subRoutes = activeVer.routes || [];
                                        const subBaseQty = Number(activeVer.version.base_quantity || 1);
                                        let subSetup = 0;
                                        let subRunPerUnit = 0;
                                        subRoutes.forEach((r: any) => {
                                            const stepBatch = Number(r.step_batch_size || 1);
                                            subSetup += Number(r.setup_time_hours || 0);
                                            subRunPerUnit += (Number(r.run_time_hours || 0) / stepBatch);
                                        });
                                        const subHours = subSetup + ((subRunPerUnit * shortfall) / subBaseQty);
                                        totalEstimatedHours += subHours;

                                        const childJoNo = `${joNoStr}-SUB${compProductId}`;
                                        const checkJoRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${childJoNo}&limit=1`, { headers });
                                        const alreadyExists = checkJoRes.ok ? ((await checkJoRes.json()).data || []).length > 0 : false;

                                        if (!alreadyExists) {
                                            console.log(`[Sub-Assembly Spawner] Auto-spawning child Job Order ${childJoNo} for product ID ${compProductId} (Qty: ${shortfall}, Version ID: ${activeVer.version.version_id}) with estimated hours: ${subHours.toFixed(1)}`);
                                            const childJoPayload = {
                                                jo_id: childJoNo,
                                                product_id: compProductId,
                                                quantity: shortfall,
                                                due_date: joData.due_date || null,
                                                status: JOB_ORDER_STATUS.DRAFT,
                                                branch_id: joData.branch_id,
                                                created_by: joData.created_by,
                                                parent_job_order_id: joIdInt,
                                                shift_option: joData.shift_option || "8",
                                                remarks: `Auto-spawned sub-assembly run for parent Job Order ${joNoStr}`,
                                                bom: {
                                                    version_id: activeVer.version.version_id
                                                },
                                                subAssemblyVersionMap: subVerMap
                                            };
                                            await createJobOrder(childJoPayload, []);
                                        }
                                    }
                                } catch (subErr) {
                                    console.error(`[Sub-Assembly Spawner] Failed to spawn child JO for component ${compProductId}:`, subErr);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Calculate and generate daily breakdown runs based on total planned hours and shift option
        const shiftHours = Number(joData.shift_option || "8") || 8;
        const numDays = Math.ceil(totalEstimatedHours / shiftHours) || 1;
        const baseQtyPerDay = Math.floor(totalMergedQuantity / numDays);
        const remainder = totalMergedQuantity % numDays;

        const startDateStr = headerPayload.start_date || todayStr;
        const startDateParts = startDateStr.split("-");
        const startYear = parseInt(startDateParts[0], 10);
        const startMonth = parseInt(startDateParts[1], 10) - 1;
        const startDay = parseInt(startDateParts[2], 10);

        const dailyBreakdown = [];
        for (let i = 1; i <= numDays; i++) {
            const currentDate = new Date(startYear, startMonth, startDay + (i - 1));
            const yyyy = currentDate.getFullYear();
            const mm = String(currentDate.getMonth() + 1).padStart(2, "0");
            const dd = String(currentDate.getDate()).padStart(2, "0");
            const dateStr = `${yyyy}-${mm}-${dd}`;
            const dayQty = baseQtyPerDay + (i <= remainder ? 1 : 0);
            dailyBreakdown.push({
                day: i,
                date: dateStr,
                status: "Pending",
                quantity: dayQty
            });
        }

        // Patch daily_breakdown to job order
        try {
            await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${joIdInt}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    daily_breakdown: dailyBreakdown
                })
            });
        } catch (dbErr) {
            console.error("Error updating daily breakdown on Job Order:", dbErr);
        }

        // 5. Insert junction entries only for the detail lines explicitly
        // selected by Planning Engineering. Buffer JOs intentionally have no
        // Sales Order links or lifecycle transition.
        if (salesOrderDetailIds.length > 0 && (initialStatus !== JOB_ORDER_STATUS.DRAFT || schedulingPlan)) {
            const detailIds = schedulingPlan
                ? schedulingPlan.lines.map((line) => line.detailId)
                : [...new Set(salesOrderDetailIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
            const plannedLinesById = new Map(
                (schedulingPlan?.lines || []).map((line) => [line.detailId, line])
            );
            const detailRes = await fetch(
                `${DIRECTUS_URL}/items/sales_order_details?filter[detail_id][_in]=${detailIds.join(",")}&fields=detail_id,order_id,ordered_quantity,allocated_quantity,served_quantity&limit=-1`,
                { headers, cache: "no-store" }
            );
            if (!detailRes.ok) {
                throw new Error(`Failed to load selected Sales Order details for allocation: ${detailRes.status}`);
            }
            const details: any[] = (await detailRes.json()).data || [];
            const detailsById = new Map(details.map((detail: any) => [Number(detail.detail_id), detail]));
            const missingDetailIds = detailIds.filter((detailId) => !detailsById.has(detailId));
            if (missingDetailIds.length > 0) {
                throw new Error(`Selected Sales Order details were not found: ${missingDetailIds.join(", ")}`);
            }

            const affectedOrderIds = new Set<number>();
            for (const detailId of detailIds) {
                const detail = detailsById.get(detailId);
                const orderedQuantity = Number(detail.ordered_quantity || 0);
                const allocatedQuantity = Number(detail.allocated_quantity || 0);
                const servedQuantity = Number(detail.served_quantity || 0);
                const currentRemainingQuantity = Math.max(0, orderedQuantity - Math.max(allocatedQuantity, servedQuantity));
                const plannedLine = plannedLinesById.get(detailId);
                const allocationQuantity = plannedLine?.allocationQuantity ?? currentRemainingQuantity;
                if (allocationQuantity <= 0) {
                    throw new SalesOrderAllocationConflictError(`Sales Order detail ${detailId} has no remaining quantity for the Job Order allocation.`);
                }
                if (plannedLine && allocationQuantity > currentRemainingQuantity + 0.000001) {
                    throw new SalesOrderAllocationConflictError(`Sales Order detail ${detailId} no longer has enough remaining quantity for this Job Order. Refresh the demand list and try again.`);
                }

                await assertFreshAllocationCapacity(detailId, allocationQuantity);

                const allocationResponse = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_allocations`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        job_order_id: joIdInt,
                        sales_order_detail_id: detailId,
                        allocated_quantity: allocationQuantity,
                        reservation_type: "SOFT",
                        created_at: formatPhtDateTime(),
                        created_by: joData.created_by ? Number(joData.created_by) : null
                    })
                });
                if (!allocationResponse.ok) {
                    throw new Error(`Failed to create Sales Order allocation for detail ${detailId}: ${allocationResponse.status}`);
                }
                await assertFreshAllocationCapacity(detailId, allocationQuantity, joIdInt);

                const parentOrderId = Number(
                    typeof detail.order_id === "object" ? detail.order_id?.order_id || detail.order_id?.id : detail.order_id
                );
                if (Number.isInteger(parentOrderId) && parentOrderId > 0) {
                    affectedOrderIds.add(parentOrderId);
                    if (!previousParentStatuses.has(parentOrderId)) {
                        const parentResponse = await fetch(
                            `${DIRECTUS_URL}/items/sales_order/${parentOrderId}?fields=order_id,order_status`,
                            { headers, cache: "no-store" }
                        );
                        if (!parentResponse.ok) {
                            throw new Error(`Failed to read Sales Order ${parentOrderId} before status transition: ${parentResponse.status}`);
                        }
                        const parent = (await parentResponse.json()).data;
                        previousParentStatuses.set(parentOrderId, String(parent?.order_status || ""));
                    }
                }
            }

            // A regular JO puts its linked parent orders into production only
            // after every requested allocation has been persisted.
            if (shouldInitialize && !options.deferSalesOrderTransition) {
                await transitionLinkedSalesOrdersToInProduction(affectedOrderIds, previousParentStatuses);
            }
        }

        return { job_order_id: joIdInt, jo_id: joNoStr, status: initialStatus, shortfalls };
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create job order:", e);
        if (createdJobOrderNo) {
            try {
                for (const [parentOrderId, previousStatus] of previousParentStatuses) {
                    if (!previousStatus) continue;
                    await fetch(`${DIRECTUS_URL}/items/sales_order/${parentOrderId}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({ order_status: previousStatus })
                    });
                }
                const rolledBack = await deleteJobOrder(createdJobOrderNo);
                if (!rolledBack) {
                    console.error(`[Manufacturing Directus API] Rollback could not remove Job Order ${createdJobOrderNo}; reconciliation is required.`);
                }
            } catch (rollbackError) {
                console.error(`[Manufacturing Directus API] Job Order ${createdJobOrderNo} rollback failed:`, rollbackError);
            }
        }
        throw e;
    }
}

