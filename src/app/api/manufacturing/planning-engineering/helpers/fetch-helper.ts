/* eslint-disable */
import { DIRECTUS_URL, headersNoCache, DirectusJobOrder } from "./shared";

interface DirectusMfgBom {
    product_id: string | number;
    bom_id: string | number;
}

interface DirectusMfgRouting {
    routing_id?: string | number;
    id?: string | number;
    requires_qa?: number | boolean;
    requiresQA?: number | boolean;
    bom_id?: string | number;
    operation_name?: string;
    name?: string;
}

// Global in-memory cache for static master data
let masterDataCache: {
    mfgRoutings: any[];
    mfgBoms: any[];
    productsList: any[];
    operations: any[];
    mfgRoutesBom: any[];
    unitsList: any[];
    timestamp: number;
} | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

export async function fetchJobOrders(): Promise<DirectusJobOrder[]> {
    try {
        const now = Date.now();
        const useCache = masterDataCache && masterDataCache.unitsList && (now - masterDataCache.timestamp < CACHE_TTL_MS);

        const fetchList = [
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1&sort=-job_order_id`, { headers: headersNoCache }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_allocations?limit=-1`, { headers: headersNoCache }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?limit=-1&fields=jo_route_id,job_order_id,sequence_order,work_center_id,operation_id,planned_setup_hours,planned_run_hours,actual_setup_hours,actual_run_hours,step_batch_size,run_time_hours_factor`, { headers: headersNoCache }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators?limit=-1`, { headers: headersNoCache }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_qa_records?limit=-1`, { headers: headersNoCache }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?limit=-1`, { headers: headersNoCache }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_yield_ledger?limit=-1`, { headers: headersNoCache }),
            fetch(`${DIRECTUS_URL}/items/product_manufacturing_version?limit=-1&fields=version_id,version_name`, { headers: headersNoCache }),
            fetch(`${DIRECTUS_URL}/items/inventory_movements?limit=-1&fields=movement_id,transaction_type_id,source_document_id,source_document_no,batch_no,quantity,expiry_date,manufacturing_date,created_on`, { headers: headersNoCache })
        ];

        if (!useCache) {
            fetchList.push(
                fetch(`${DIRECTUS_URL}/items/manufacturing_routes?limit=-1`, { headers: headersNoCache }),
                fetch(`${DIRECTUS_URL}/items/manufacturing_boms?limit=-1`, { headers: headersNoCache }),
                fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,unit_of_measurement`, { headers: headersNoCache }),
                fetch(`${DIRECTUS_URL}/items/manufacturing_operations?limit=-1`, { headers: headersNoCache }),
                fetch(`${DIRECTUS_URL}/items/manufacturing_routes_bom?limit=-1`, { headers: headersNoCache }),
                fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers: headersNoCache })
            );
        }

        const responses = await Promise.all(fetchList);

        const jos = responses[0].ok ? (await responses[0].json()).data || [] : [];
        const josos = responses[1].ok ? (await responses[1].json()).data || [] : [];
        const tasks = responses[2].ok ? (await responses[2].json()).data || [] : [];
        const assigns = responses[3].ok ? (await responses[3].json()).data || [] : [];
        const qaLogs = responses[4].ok ? (await responses[4].json()).data || [] : [];
        const materialsList = responses[5].ok ? (await responses[5].json()).data || [] : [];
        const mfgYieldLedger = responses[6].ok ? (await responses[6].json()).data || [] : [];
        const mfgVersions = responses[7].ok ? (await responses[7].json()).data || [] : [];
        const invMovements = responses[8].ok ? (await responses[8].json()).data || [] : [];

        let mfgRoutings = [];
        let mfgBoms = [];
        let productsList = [];
        let operations = [];
        let mfgRoutesBom = [];
        let unitsList: any[] = [];

        if (useCache && masterDataCache) {
            mfgRoutings = masterDataCache.mfgRoutings;
            mfgBoms = masterDataCache.mfgBoms;
            productsList = masterDataCache.productsList;
            operations = masterDataCache.operations;
            mfgRoutesBom = masterDataCache.mfgRoutesBom;
            unitsList = (masterDataCache as any).unitsList || [];
        } else {
            const mfgRoutingsRes = responses[9];
            const mfgBomsRes = responses[10];
            const prodRes = responses[11];
            const operationsRes = responses[12];
            const mfgRoutesBomRes = responses[13];
            const unitsRes = responses[14];

            mfgRoutings = mfgRoutingsRes && mfgRoutingsRes.ok ? (await mfgRoutingsRes.json()).data || [] : [];
            mfgBoms = mfgBomsRes && mfgBomsRes.ok ? (await mfgBomsRes.json()).data || [] : [];
            productsList = prodRes && prodRes.ok ? (await prodRes.json()).data || [] : [];
            operations = operationsRes && operationsRes.ok ? (await operationsRes.json()).data || [] : [];
            mfgRoutesBom = mfgRoutesBomRes && mfgRoutesBomRes.ok ? (await mfgRoutesBomRes.json()).data || [] : [];
            unitsList = unitsRes && unitsRes.ok ? (await unitsRes.json()).data || [] : [];

            masterDataCache = {
                mfgRoutings,
                mfgBoms,
                productsList,
                operations,
                mfgRoutesBom,
                unitsList,
                timestamp: now
            } as any;
        }

        const getObjId = (obj: any): number => {
            if (!obj) return 0;
            if (typeof obj === "object") {
                return Number(obj.job_order_id || obj.transaction_type_id || obj.source_document_id || obj.id || 0);
            }
            return Number(obj);
        };

        const versionMap = new Map<number, string>();
        mfgVersions.forEach((v: any) => {
            versionMap.set(Number(v.version_id || v.id), v.version_name);
        });

        const unitsMap = new Map<number, any>();
        unitsList.forEach((u: any) => {
            unitsMap.set(Number(u.unit_id), u);
        });

        // Map them together
        return jos.map((jo: any) => {
            const joNo = jo.job_order_no;
            jo.jo_id = joNo;
            const targetQuantity = Number(jo.target_quantity ?? jo.quantity ?? 0);
            jo.quantity = targetQuantity;
            jo.due_date = jo.end_date || null;
            jo.recipe_version_name = versionMap.get(Number(jo.version_id)) || (jo.version_id ? `Version #${jo.version_id}` : null);

            const joIdInt = Number(jo.job_order_id || jo.id || 0);

            let mappedStatus = jo.status;
            if (jo.status === "Draft") {
                mappedStatus = "Draft";
            } else if (jo.status === "Planned") {
                mappedStatus = "Planned";
            } else if (jo.status === "Planning") {
                mappedStatus = "Planning";
            } else if (jo.status === "Released") {
                mappedStatus = "Proceed";
            } else if (jo.status === "In Progress") {
                mappedStatus = "Ongoing";
            } else if (jo.status === "Completed") {
                mappedStatus = "Finished";
            }

            const matchedProduct = productsList.find((p: any) => Number(p.product_id) === Number(jo.product_id));
            const productName = matchedProduct?.product_name || `Product #${jo.product_id}`;
            const uomId = Number(matchedProduct?.unit_of_measurement?.unit_id || matchedProduct?.unit_of_measurement || 0);
            const unitObj = unitsMap.get(uomId) || (typeof matchedProduct?.unit_of_measurement === "object" ? matchedProduct.unit_of_measurement : null);
            const uomName = unitObj?.unit_name || unitObj?.unit_shortcut || "Pieces";
            const uomShortcut = unitObj?.unit_shortcut || unitObj?.unit_name || "PCS";

            const salesOrders = josos
                .filter((s: any) => s.job_order_id ? getObjId(s.job_order_id) === joIdInt : s.jo_id === joNo)
                .map((s: any) => ({
                    jo_id: joNo,
                    order_id: s.sales_order_detail_id,
                    order_no: `SO-DETAIL-${s.sales_order_detail_id}`,
                    quantity: Number(s.allocated_quantity || 0)
                }));

            const productBomIds = mfgBoms
                .filter((b: DirectusMfgBom) => Number(b.product_id) === Number(jo.product_id))
                .map((b: DirectusMfgBom) => Number(b.bom_id));

            // Map routing tasks relationally and update requires_qa dynamically
            const routingTasks = tasks
                .filter((t: any) => getObjId(t.job_order_id) === joIdInt)
                .map((task: any) => {
                    const taskAssigns = assigns
                        .filter((a: any) => Number(a.jo_route_id) === Number(task.jo_route_id))
                        .map((a: any) => ({
                            id: a.jo_route_operator_id || a.id,
                            task_id: a.jo_route_id,
                            user_id: a.operator_id,
                            hourly_rate: Number(a.hourly_rate || 0),
                            logged_hours: Number(a.logged_hours || 0),
                            started_at: a.started_at || null,
                            stopped_at: a.stopped_at || null,
                            is_team_lead: false
                        }));
                    
                    const taskQAs = qaLogs.filter((q: any) => Number(q.jo_route_id) === Number(task.jo_route_id));
                    const op = operations.find((o: any) => Number(o.id) === Number(task.operation_id));
                    const taskName = op?.operation_name || "Production Step";

                    const liveRout = mfgRoutings.find((mr: any) => Number(mr.route_id || mr.id) === Number(task.routing_id));
                    let reqQA = liveRout 
                        ? (liveRout.qa_template_id !== null && liveRout.qa_template_id !== undefined && liveRout.qa_template_id !== 0)
                        : false;

                    if (!reqQA && taskName) {
                        reqQA = mfgRoutings.some((mr: any) => 
                            productBomIds.includes(Number(mr.version_id)) && 
                            Number(mr.operation_id) === Number(task.operation_id) &&
                            (mr.qa_template_id !== null && mr.qa_template_id !== undefined && mr.qa_template_id !== 0)
                        );
                    }

                    const totalHours = taskAssigns.reduce((sum: number, a: any) => sum + Number(a.logged_hours || 0), 0);
                    const totalCost = taskAssigns.reduce((sum: number, a: any) => sum + (Number(a.logged_hours || 0) * Number(a.hourly_rate || 0)), 0);

                    const masterRoute = mfgRoutings.find((mr: any) => 
                        Number(mr.version_id) === Number(jo.version_id) && 
                        Number(mr.sequence_order) === Number(task.sequence_order) && 
                        Number(mr.operation_id) === Number(task.operation_id)
                    );
                    const routeId = masterRoute?.route_id || masterRoute?.id;
                    const stepBoms = routeId ? mfgRoutesBom.filter((b: any) => Number(b.route_id) === Number(routeId)) : [];
                    
                    const stepBomItems = stepBoms.map((b: any) => {
                        const prod = productsList.find((p: any) => Number(p.product_id) === Number(b.product_id));
                        const qtyPerUnit = Number(b.quantity_required || 0);
                        const wastage = 1 + (Number(b.wastage_factor_percentage || 0) / 100);
                        const totalNeeded = qtyPerUnit * targetQuantity * wastage;
                        return {
                            product_id: b.product_id,
                            product_name: prod?.product_name || `Product #${b.product_id}`,
                            qty_per_unit: qtyPerUnit,
                            total_needed: totalNeeded,
                            unit_shortcut: prod?.unit_of_measurement?.unit_shortcut || "pcs"
                        };
                    });

                    return {
                        id: task.jo_route_id, // Map primary key jo_route_id to legacy 'id'
                        jo_id: joNo,
                        routing_id: task.routing_id,
                        qa_template_id: liveRout ? liveRout.qa_template_id : null,
                        name: taskName,
                        sequence_order: task.sequence_order,
                        status: task.status,
                        planned_setup_hours: Number(task.planned_setup_hours || 0),
                        planned_run_hours: Number(task.planned_run_hours || 0),
                        duration_hours: Number(task.planned_setup_hours || 0) + Number(task.planned_run_hours || 0),
                        actual_setup_hours: Number(task.actual_setup_hours || 0),
                        actual_run_hours: totalHours > 0 ? totalHours : Number(task.actual_run_hours || 0),
                        step_batch_size: Number(task.step_batch_size || 1),
                        run_time_hours_factor: Number(task.run_time_hours_factor || 0),
                        completed_at: task.completed_at,
                        requires_qa: reqQA ? 1 : 0,
                        assignments: taskAssigns,
                        qa_logs: taskQAs,
                        bom_items: stepBomItems
                    };
                });

            const simulatedRoutings = routingTasks.map((t: any) => ({
                routing_id: t.routing_id,
                id: t.id,
                qa_template_id: t.qa_template_id,
                sequence_order: t.sequence_order,
                operation_name: t.name,
                setup_time_hours: t.planned_setup_hours,
                run_time_hours: t.planned_run_hours,
                duration_hours: t.duration_hours,
                step_batch_size: t.step_batch_size,
                run_time_hours_factor: t.run_time_hours_factor,
                status: t.status
            }));

            const matchingBom = mfgBoms.find((b: any) => Number(b.version_id) === Number(jo.version_id));
            const versionStr = matchingBom ? `${matchingBom.version_name || "v" + matchingBom.version_code}` : jo.version_id ? `Version #${jo.version_id}` : "";

            const finalMovements = invMovements.filter((mov: any) => {
                const movementSourceId = getObjId(mov.source_document_id);
                const movementSourceNo = String(mov.source_document_no ?? "").trim();
                const sameJobOrder = movementSourceId === joIdInt
                    || (movementSourceId === 0 && movementSourceNo === String(jo.job_order_no ?? "").trim());
                return getObjId(mov.transaction_type_id) === 2 && sameJobOrder;
            });

            // The yield ledger is the authoritative production-output source. An inventory
            // movement records the same output in the stock ledger and must not be counted
            // as another yield event.
            const ledgerRows = mfgYieldLedger.filter((l: any) => getObjId(l.job_order_id) === joIdInt);
            const joYieldLogs = ledgerRows.map((l: any) => {
                const ledgerLot = String(l.lot_number ?? "").trim();
                const ledgerQuantity = Number(l.yield_quantity || 0);
                const exactMovement = finalMovements.find((mov: any) =>
                    String(mov.batch_no ?? "").trim() === ledgerLot
                );
                const uniqueQuantityMovement = !exactMovement && finalMovements.length === 1
                    && Number(finalMovements[0].quantity || 0) === ledgerQuantity
                    ? finalMovements[0]
                    : null;
                const matchedMov = exactMovement || uniqueQuantityMovement;

                return {
                    ...l,
                    ledger_id: l.ledger_id ?? l.id,
                    lot_number: ledgerLot || String(matchedMov?.batch_no ?? "").trim() || `MFG-${jo.job_order_no}`,
                    expiry_date: l.expiry_date || matchedMov?.expiry_date || null,
                    manufacturing_date: l.manufacturing_date || matchedMov?.manufacturing_date || (matchedMov?.created_on ? matchedMov.created_on.split("T")[0] : null)
                };
            });

            // Preserve compatibility for legacy output movements that have no yield-ledger
            // row. Once a ledger row exists, unmatched movements are intentionally ignored.
            if (joYieldLogs.length === 0) {
                finalMovements.forEach((mov: any) => {
                    const movementId = mov.movement_id ?? mov.id;
                    joYieldLogs.push({
                        ledger_id: movementId !== undefined && movementId !== null ? `mfg-${movementId}` : undefined,
                        job_order_id: joIdInt,
                        shift_name: "Final Close",
                        yield_quantity: String(mov.quantity),
                        qa_status: "Passed",
                        logged_at: mov.created_on,
                        lot_number: mov.batch_no || `MFG-${jo.job_order_no}`,
                        expiry_date: mov.expiry_date || null,
                        manufacturing_date: mov.manufacturing_date || (mov.created_on ? mov.created_on.split("T")[0] : null)
                    });
                });
            }

            const totalProduced = joYieldLogs.reduce((sum: number, l: any) => sum + Number(l.yield_quantity || 0), 0);

            let resolvedParentId = jo.parent_job_order_id ? Number(jo.parent_job_order_id) : null;
            if (!resolvedParentId && jo.job_order_no && jo.job_order_no.includes("-SUB")) {
                const parentNo = jo.job_order_no.split("-SUB")[0];
                const parentJo = jos.find((j: any) => j.job_order_no === parentNo);
                if (parentJo) {
                    resolvedParentId = Number(parentJo.job_order_id || parentJo.id || 0);
                }
            }

            const simulatedProducts = [{
                jo_id: joNo,
                product_id: jo.product_id,
                product_name: productName,
                unit_of_measurement: uomName,
                uom_name: uomName,
                uom_shortcut: uomShortcut,
                quantity: targetQuantity,
                bom: jo.version_id ? { version_id: jo.version_id } : null,
                components: [],
                routings: simulatedRoutings,
                allocation_results: null
            }];

            return {
                ...jo,
                product_id: jo.product_id,
                product_name: productName,
                unit_of_measurement: uomName,
                uom_name: uomName,
                uom_shortcut: uomShortcut,
                quantity: targetQuantity,
                status: mappedStatus,
                bom: jo.version_id ? { version_id: jo.version_id } : null,
                version_name: versionStr,
                components: [],
                routings: simulatedRoutings,
                allocation_results: null,
                products: simulatedProducts,
                sales_orders: salesOrders,
                routing_tasks: routingTasks,
                parent_job_order_id: resolvedParentId,
                produced_quantity: totalProduced,
                yield_logs: joYieldLogs
            };
        });
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch job orders:", e);
        return [];
    }
}
