import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    WipJobOrder,
    WipRouteStage,
    WipMaterialReservation,
    WipOperatorAssignment,
    WipSummaryMetrics,
    WorkCenterQueueSummary,
    WipMasterData
} from "@/modules/business-intelligence-and-analytics/costing/wip-tracking-report/types";
import { normalizeJobOrderStatus, JOB_ORDER_STATUS } from "@/modules/manufacturing-management/job-order-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DirectusResponse<T> {
    data?: T[];
    errors?: Array<{ message: string }>;
}

function roundHours(val: unknown): number {
    const num = Number(val);
    if (!Number.isFinite(num)) return 0;
    return Math.round(num * 100) / 100;
}

function roundQty(val: unknown): number {
    const num = Number(val);
    if (!Number.isFinite(num)) return 0;
    return Math.round(num * 1000) / 1000;
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const search = (searchParams.get("search") || "").trim().toLowerCase();
        const statusFilter = searchParams.get("status") || "ALL_ACTIVE";
        const branchIdStr = searchParams.get("branchId");
        const branchId = branchIdStr ? Number(branchIdStr) : null;
        const workCenterIdStr = searchParams.get("workCenterId");
        const workCenterId = workCenterIdStr ? Number(workCenterIdStr) : null;
        const productIdStr = searchParams.get("productId");
        const productId = productIdStr ? Number(productIdStr) : null;
        const delayedOnly = searchParams.get("delayedOnly") === "true";

        const headersNoCache = {
            ...headers,
            "Cache-Control": "no-cache",
            Pragma: "no-cache"
        };

        // 1. Fetch core collections in parallel
        const [
            joRes,
            routesRes,
            workCentersRes,
            operationsRes,
            materialsRes,
            reservationsRes,
            operatorsRes,
            productsRes,
            branchesRes,
            unitsRes,
            usersRes
        ] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?limit=-1&sort=-job_order_id`, {
                headers: headersNoCache,
                cache: "no-store"
            }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?limit=-1&fields=*`, {
                headers: headersNoCache,
                cache: "no-store"
            }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&fields=*`, {
                headers: headersNoCache,
                cache: "no-store"
            }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_operations?limit=-1&fields=*`, {
                headers: headersNoCache,
                cache: "no-store"
            }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials?limit=-1&fields=*`, {
                headers: headersNoCache,
                cache: "no-store"
            }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials_reservations?limit=-1&fields=*`, {
                headers: headersNoCache,
                cache: "no-store"
            }),
            fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators?limit=-1&fields=*`, {
                headers: headersNoCache,
                cache: "no-store"
            }),
            fetch(`${DIRECTUS_URL}/items/products?limit=-1&fields=product_id,product_name,product_code,unit_of_measurement`, {
                headers: headersNoCache,
                cache: "no-store"
            }),
            fetch(`${DIRECTUS_URL}/items/branches?limit=-1&fields=id,branch_name,branch_code`, {
                headers: headersNoCache,
                cache: "no-store"
            }),
            fetch(`${DIRECTUS_URL}/items/units?limit=-1&fields=unit_id,unit_name,unit_symbol,name`, {
                headers: headersNoCache,
                cache: "no-store"
            }),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1`, {
                headers: headersNoCache,
                cache: "no-store"
            })
        ]);

        if (!joRes.ok) {
            const errText = await joRes.text().catch(() => "");
            return NextResponse.json(
                { success: false, message: `Failed to fetch Job Orders from Directus (${joRes.status}): ${errText}` },
                { status: joRes.status }
            );
        }

        const joData: DirectusResponse<any> = await joRes.json();
        const routesData: DirectusResponse<any> = routesRes.ok ? await routesRes.json() : { data: [] };
        const workCentersData: DirectusResponse<any> = workCentersRes.ok ? await workCentersRes.json() : { data: [] };
        const operationsData: DirectusResponse<any> = operationsRes.ok ? await operationsRes.json() : { data: [] };
        const materialsData: DirectusResponse<any> = materialsRes.ok ? await materialsRes.json() : { data: [] };
        const reservationsData: DirectusResponse<any> = reservationsRes.ok ? await reservationsRes.json() : { data: [] };
        const operatorsData: DirectusResponse<any> = operatorsRes.ok ? await operatorsRes.json() : { data: [] };
        const productsData: DirectusResponse<any> = productsRes.ok ? await productsRes.json() : { data: [] };
        const branchesData: DirectusResponse<any> = branchesRes.ok ? await branchesRes.json() : { data: [] };
        const unitsData: DirectusResponse<any> = unitsRes.ok ? await unitsRes.json() : { data: [] };
        const usersData: DirectusResponse<any> = usersRes.ok ? await usersRes.json() : { data: [] };

        const allJobOrders = joData.data || [];
        const allRoutes = routesData.data || [];
        const allWorkCenters = workCentersData.data || [];
        const allOperations = operationsData.data || [];
        const allMaterials = materialsData.data || [];
        const allReservations = reservationsData.data || [];
        const allOperators = operatorsData.data || [];
        const allProducts = productsData.data || [];
        const allBranches = branchesData.data || [];
        const allUnits = unitsData.data || [];
        const allUsers = usersData.data || [];

        // Build Master Lookups
        const workCenterMap = new Map<number, any>();
        allWorkCenters.forEach((wc) => workCenterMap.set(Number(wc.work_center_id || wc.id), wc));

        const operationMap = new Map<number, string>();
        allOperations.forEach((op) => operationMap.set(Number(op.id || op.operation_id), op.operation_name || "Unknown Operation"));

        const productMap = new Map<number, any>();
        allProducts.forEach((p) => productMap.set(Number(p.product_id), p));

        const branchMap = new Map<number, any>();
        allBranches.forEach((b) => branchMap.set(Number(b.id), b));

        const unitMap = new Map<number, string>();
        allUnits.forEach((u) => unitMap.set(Number(u.unit_id), u.unit_symbol || u.unit_name || u.name || "units"));

        // User / Operator Map: Map by user_id and id with first and last name
        const userMap = new Map<number, { name: string; position?: string }>();
        allUsers.forEach((u: any) => {
            const uId = Number(u.user_id ?? u.id);
            if (!uId) return;
            const fname = String(u.user_fname ?? u.first_name ?? "").trim();
            const lname = String(u.user_lname ?? u.last_name ?? "").trim();
            const fullName = [fname, lname].filter(Boolean).join(" ").trim() || u.nickname || u.user_email || u.email || `User #${uId}`;
            const position = u.user_position || u.position || undefined;
            userMap.set(uId, { name: fullName, position });
        });

        // Group route operators by jo_route_id / task_id / routing_id
        const operatorsByRouteId = new Map<number, WipOperatorAssignment[]>();
        allOperators.forEach((op: any) => {
            const routeId = Number(op.jo_route_id || op.task_id || op.routing_id);
            if (!routeId) return;
            const rawOpId = op.operator_id?.user_id ?? op.operator_id?.id ?? op.operator_id ?? op.user_id?.user_id ?? op.user_id;
            const opId = Number(rawOpId);
            const userMeta = userMap.get(opId);
            const entry: WipOperatorAssignment = {
                id: Number(op.jo_route_operator_id || op.id),
                operator_id: opId,
                operator_name: userMeta?.name || `Operator #${opId}`,
                operator_position: userMeta?.position || undefined,
                logged_hours: roundHours(op.logged_hours || op.actual_hours || 0),
                hourly_rate: Number(op.hourly_rate || 0),
                started_at: op.started_at || null,
                stopped_at: op.stopped_at || null
            };
            const list = operatorsByRouteId.get(routeId) || [];
            list.push(entry);
            operatorsByRouteId.set(routeId, list);
        });

        // Group routes by job_order_id
        const routesByJobId = new Map<number, WipRouteStage[]>();
        allRoutes.forEach((r: any) => {
            const joId = Number(r.job_order_id);
            if (!joId) return;
            const routeId = Number(r.jo_route_id || r.id);
            const wcId = Number(r.work_center_id);
            const opId = Number(r.operation_id);
            const wc = workCenterMap.get(wcId);
            const opName = operationMap.get(opId) || r.operation_name || "Standard Step";
            const plannedSetup = roundHours(r.planned_setup_hours || 0);
            const plannedRun = roundHours(r.planned_run_hours || 0);
            const actualSetup = roundHours(r.actual_setup_hours || 0);
            const actualRun = roundHours(r.actual_run_hours || 0);

            let stageStatus = String(r.status || "Pending").trim();
            if (stageStatus.toLowerCase() === "ongoing") stageStatus = "In Progress";

            const assignedOps =
                operatorsByRouteId.get(routeId) ||
                (r.routing_id ? operatorsByRouteId.get(Number(r.routing_id)) : []) ||
                (r.task_id ? operatorsByRouteId.get(Number(r.task_id)) : []) ||
                [];

            const stage: WipRouteStage = {
                jo_route_id: routeId,
                job_order_id: joId,
                sequence_order: Number(r.sequence_order || 0),
                operation_id: opId,
                operation_name: opName,
                work_center_id: wcId,
                work_center_name: wc?.work_center_name || `Work Center #${wcId}`,
                planned_setup_hours: plannedSetup,
                planned_run_hours: plannedRun,
                actual_setup_hours: actualSetup,
                actual_run_hours: actualRun,
                total_planned_hours: roundHours(plannedSetup + plannedRun),
                total_actual_hours: roundHours(actualSetup + actualRun),
                status: stageStatus,
                completed_at: r.completed_at || null,
                requires_qa: Boolean(r.requires_qa),
                operators: assignedOps
            };

            const list = routesByJobId.get(joId) || [];
            list.push(stage);
            routesByJobId.set(joId, list);
        });

        // Group materials by job_order_id
        const materialsByJoId = new Map<number, any[]>();
        allMaterials.forEach((m) => {
            const joId = Number(m.job_order_id);
            if (!joId) return;
            const list = materialsByJoId.get(joId) || [];
            list.push(m);
            materialsByJoId.set(joId, list);
        });

        // Group reservations by jo_material_id
        const reservationsByMaterialId = new Map<number, any[]>();
        allReservations.forEach((res) => {
            const matId = Number(res.jo_material_id);
            if (!matId) return;
            const list = reservationsByMaterialId.get(matId) || [];
            list.push(res);
            reservationsByMaterialId.set(matId, list);
        });

        const nowTime = new Date().getTime();

        // Assemble WIP Job Orders
        const processedJobs: WipJobOrder[] = allJobOrders.map((jo: any) => {
            const joId = Number(jo.job_order_id);
            const pId = Number(jo.product_id);
            const bId = Number(jo.branch_id);
            const prod = productMap.get(pId);
            const branch = branchMap.get(bId);
            const uom = unitMap.get(Number(prod?.unit_of_measurement)) || "units";

            const rawStatus = String(jo.status || "").trim();
            const canonicalStatus = normalizeJobOrderStatus(rawStatus) || rawStatus || "Planned";

            // Stages for this JO, sorted by sequence_order
            const stages = (routesByJobId.get(joId) || []).sort(
                (a, b) => a.sequence_order - b.sequence_order
            );

            const totalStages = stages.length;
            const completedStages = stages.filter(
                (s) => s.status === "Completed" || s.status === "Done"
            ).length;
            const inProgressStages = stages.filter(
                (s) => s.status === "In Progress" || s.status === "Ongoing"
            ).length;

            const currentStage =
                stages.find((s) => s.status === "In Progress" || s.status === "Ongoing") ||
                stages.find((s) => s.status === "Pending") ||
                (stages.length > 0 ? stages[stages.length - 1] : null);

            const stageProgressPercent = totalStages > 0
                ? Math.round((completedStages / totalStages) * 100)
                : 0;

            const targetQty = Number(jo.target_quantity || jo.planned_quantity || 0);
            const producedQty = Number(jo.actual_quantity_produced || jo.actual_quantity || 0);
            const completedQty = Number(jo.completed_quantity || 0);
            const rejectedQty = Number(jo.rejected_quantity || 0);

            const qtyProgressPercent = targetQty > 0
                ? Math.min(100, Math.round((producedQty / targetQty) * 100))
                : 0;

            const totalPlannedHours = roundHours(
                stages.reduce((acc, s) => acc + s.total_planned_hours, 0)
            );
            const totalActualHours = roundHours(
                stages.reduce((acc, s) => acc + s.total_actual_hours, 0)
            );

            // Elapsed time calculation
            let elapsedHours = 0;
            if (jo.production_started_at) {
                const startTime = new Date(jo.production_started_at).getTime();
                if (!isNaN(startTime)) {
                    const endTime = jo.production_completed_at
                        ? new Date(jo.production_completed_at).getTime()
                        : nowTime;
                    elapsedHours = roundHours(Math.max(0, (endTime - startTime) / (1000 * 60 * 60)));
                }
            }

            // Delayed Check: Past end_date or actual hours exceeded planned hours significantly
            let isDelayed = false;
            if (jo.end_date) {
                const dueTime = new Date(jo.end_date).getTime();
                if (!isNaN(dueTime) && dueTime < nowTime && canonicalStatus !== JOB_ORDER_STATUS.CLOSED && canonicalStatus !== JOB_ORDER_STATUS.CANCELLED) {
                    isDelayed = true;
                }
            }
            if (!isDelayed && totalPlannedHours > 0 && totalActualHours > totalPlannedHours) {
                isDelayed = true;
            }

            // Materials for this JO
            const joMaterials = materialsByJoId.get(joId) || [];
            const wipMaterials: WipMaterialReservation[] = [];

            joMaterials.forEach((m) => {
                const matId = Number(m.jo_material_id || m.id);
                const matProdId = Number(m.product_id);
                const matProd = productMap.get(matProdId);
                const matUom = unitMap.get(Number(matProd?.unit_of_measurement)) || "units";
                const resList = reservationsByMaterialId.get(matId) || [];

                if (resList.length > 0) {
                    resList.forEach((res) => {
                        const reserved = roundQty(res.reserved_quantity || 0);
                        const staged = roundQty(res.staged_quantity || 0);
                        const issued = roundQty(res.issued_to_wip_quantity || res.issued_quantity || 0);
                        const actualUsed = roundQty(res.actual_used_quantity || res.used_quantity || 0);
                        const returned = roundQty(res.returned_quantity || 0);
                        const remainingWip = roundQty(Math.max(0, (issued || staged) - actualUsed - returned));

                        wipMaterials.push({
                            jo_materials_reservation_id: Number(res.jo_materials_reservation_id || res.id),
                            jo_material_id: matId,
                            product_id: matProdId,
                            product_name: matProd?.product_name || `Item #${matProdId}`,
                            product_code: matProd?.product_code,
                            uom_name: matUom,
                            batch_no: res.batch_no || res.lot_no || null,
                            mm_lot_id: res.mm_lot_id ? Number(res.mm_lot_id) : null,
                            staging_bin: res.staging_bin || res.bin_location || null,
                            reserved_quantity: reserved,
                            staged_quantity: staged,
                            issued_to_wip_quantity: issued,
                            actual_used_quantity: actualUsed,
                            returned_quantity: returned,
                            remaining_wip_quantity: remainingWip,
                            reservation_status: res.status || "Allocated",
                            wip_started_at: res.wip_started_at || null
                        });
                    });
                } else {
                    const plannedQty = roundQty(m.planned_quantity || m.required_quantity || 0);
                    const actualQty = roundQty(m.actual_quantity || 0);
                    wipMaterials.push({
                        jo_materials_reservation_id: 0,
                        jo_material_id: matId,
                        product_id: matProdId,
                        product_name: matProd?.product_name || `Item #${matProdId}`,
                        product_code: matProd?.product_code,
                        uom_name: matUom,
                        batch_no: null,
                        mm_lot_id: null,
                        staging_bin: null,
                        reserved_quantity: plannedQty,
                        staged_quantity: 0,
                        issued_to_wip_quantity: 0,
                        actual_used_quantity: actualQty,
                        returned_quantity: 0,
                        remaining_wip_quantity: 0,
                        reservation_status: "Unreserved",
                        wip_started_at: null
                    });
                }
            });

            const totalWipRemainingQty = roundQty(
                wipMaterials.reduce((sum, m) => sum + m.remaining_wip_quantity, 0)
            );

            // Primary Work Center name
            const primaryWcId = Number(jo.work_center_id || jo.primary_work_center_id);
            const primaryWc = primaryWcId ? workCenterMap.get(primaryWcId) : null;

            return {
                job_order_id: joId,
                job_order_no: jo.job_order_no || `JO-${joId}`,
                product_id: pId,
                product_name: prod?.product_name || `Product #${pId}`,
                product_code: prod?.product_code || "",
                uom_name: uom,
                target_quantity: targetQty,
                actual_quantity_produced: producedQty,
                completed_quantity: completedQty,
                rejected_quantity: rejectedQty,
                status: canonicalStatus,
                priority: Number(jo.priority || 2),
                branch_id: bId,
                branch_name: branch?.branch_name || `Branch #${bId}`,
                primary_work_center_id: primaryWcId || null,
                primary_work_center_name: primaryWc?.work_center_name || currentStage?.work_center_name || null,
                shift_option: jo.shift_option || (jo.planned_hours ? `${jo.planned_hours}h shift` : "Standard"),
                start_date: jo.start_date || null,
                end_date: jo.end_date || null,
                production_started_at: jo.production_started_at || null,
                production_completed_at: jo.production_completed_at || null,
                remarks: jo.remarks || null,
                stages,
                total_stages: totalStages,
                completed_stages_count: completedStages,
                in_progress_stages_count: inProgressStages,
                current_stage: currentStage,
                stage_progress_percent: stageProgressPercent,
                quantity_progress_percent: qtyProgressPercent,
                total_planned_hours: totalPlannedHours,
                total_actual_hours: totalActualHours,
                elapsed_hours: elapsedHours,
                is_delayed: isDelayed,
                materials: wipMaterials,
                total_wip_materials_count: wipMaterials.length,
                total_wip_remaining_quantity: totalWipRemainingQty
            };
        });

        // 3. Filter Application
        const filteredJobs = processedJobs.filter((job) => {
            // Search Query
            if (search) {
                const matchJoNo = job.job_order_no.toLowerCase().includes(search);
                const matchProd = job.product_name.toLowerCase().includes(search);
                const matchCode = (job.product_code || "").toLowerCase().includes(search);
                const matchBranch = job.branch_name.toLowerCase().includes(search);
                const matchStage = job.current_stage?.operation_name.toLowerCase().includes(search);
                const matchWc = (job.primary_work_center_name || "").toLowerCase().includes(search);

                if (!matchJoNo && !matchProd && !matchCode && !matchBranch && !matchStage && !matchWc) {
                    return false;
                }
            }

            // Status Filter
            if (statusFilter === "ALL_ACTIVE") {
                // Exclude closed or cancelled
                if (
                    job.status === JOB_ORDER_STATUS.CANCELLED ||
                    job.status === JOB_ORDER_STATUS.CLOSED
                ) {
                    return false;
                }
            } else if (statusFilter !== "ALL") {
                if (job.status !== statusFilter) return false;
            }

            // Branch Filter
            if (branchId !== null && job.branch_id !== branchId) {
                return false;
            }

            // Work Center Filter
            if (workCenterId !== null) {
                const matchPrimary = job.primary_work_center_id === workCenterId;
                const matchAnyStage = job.stages.some((s) => s.work_center_id === workCenterId);
                if (!matchPrimary && !matchAnyStage) return false;
            }

            // Product Filter
            if (productId !== null && job.product_id !== productId) {
                return false;
            }

            // Delayed Only
            if (delayedOnly && !job.is_delayed) {
                return false;
            }

            return true;
        });

        // 4. Compute High-Level Metrics from ALL active jobs (before table search filters, for persistent KPIs)
        const activeJobsPool = processedJobs.filter(
            (j) =>
                j.status !== JOB_ORDER_STATUS.CANCELLED &&
                j.status !== JOB_ORDER_STATUS.CLOSED
        );

        const totalActive = activeJobsPool.length;
        const inProduction = activeJobsPool.filter((j) => j.status === JOB_ORDER_STATUS.IN_PRODUCTION).length;
        const onHold = activeJobsPool.filter((j) => j.status === JOB_ORDER_STATUS.ON_HOLD).length;
        const pickedReady = activeJobsPool.filter((j) => j.status === JOB_ORDER_STATUS.PICKED).length;
        const inQa = activeJobsPool.filter((j) => j.status === JOB_ORDER_STATUS.FOR_QA_RECONCILIATION).length;
        const delayedCount = activeJobsPool.filter((j) => j.is_delayed).length;

        const avgProgress = totalActive > 0
            ? Math.round(
                  activeJobsPool.reduce((sum, j) => sum + j.stage_progress_percent, 0) / totalActive
              )
            : 0;

        const totalWipVolume = roundQty(
            activeJobsPool.reduce((sum, j) => sum + j.total_wip_remaining_quantity, 0)
        );

        const summary: WipSummaryMetrics = {
            total_active_jobs: totalActive,
            jobs_in_production: inProduction,
            jobs_on_hold: onHold,
            jobs_picked_ready: pickedReady,
            jobs_in_qa: inQa,
            average_stage_progress_percent: avgProgress,
            total_wip_materials_volume: totalWipVolume,
            delayed_jobs_count: delayedCount
        };

        // 5. Work Center Queues (For Kanban / Board View)
        const workCenterQueues: WorkCenterQueueSummary[] = allWorkCenters.map((wc) => {
            const wcId = Number(wc.work_center_id || wc.id);
            const matchingJobs = activeJobsPool.filter((j) =>
                j.stages.some((s) => s.work_center_id === wcId)
            );

            let runningCount = 0;
            let pendingCount = 0;

            matchingJobs.forEach((j) => {
                const wcStages = j.stages.filter((s) => s.work_center_id === wcId);
                wcStages.forEach((s) => {
                    if (s.status === "In Progress" || s.status === "Ongoing") runningCount++;
                    if (s.status === "Pending") pendingCount++;
                });
            });

            return {
                work_center_id: wcId,
                work_center_name: wc.work_center_name || `Line #${wcId}`,
                capacity_per_hour: roundHours(wc.capacity_per_hour || 0),
                active_jobs_count: matchingJobs.length,
                running_stages_count: runningCount,
                pending_stages_count: pendingCount,
                jobs: matchingJobs
            };
        });

        // 6. Master Data for Filter Comboboxes
        const masterData: WipMasterData = {
            workCenters: allWorkCenters.map((wc) => ({
                work_center_id: Number(wc.work_center_id || wc.id),
                work_center_name: wc.work_center_name || `Work Center #${wc.work_center_id || wc.id}`
            })),
            products: allProducts.map((p) => ({
                product_id: Number(p.product_id),
                product_name: p.product_name || `Product #${p.product_id}`,
                product_code: p.product_code || undefined
            })),
            branches: allBranches.map((b) => ({
                id: Number(b.id),
                branch_name: b.branch_name || `Branch #${b.id}`,
                branch_code: b.branch_code || undefined
            }))
        };

        return NextResponse.json({
            success: true,
            data: {
                jobs: filteredJobs,
                summary,
                workCenterQueues,
                masterData,
                serverTimestamp: new Date().toISOString()
            }
        });
    } catch (error: any) {
        console.error("[BIA WIP Tracking Report API Error]:", error);
        return NextResponse.json(
            { success: false, message: error.message || "Failed to load WIP tracking report" },
            { status: 500 }
        );
    }
}
