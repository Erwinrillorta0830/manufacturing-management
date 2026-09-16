/* eslint-disable */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { updateJobOrder } from "../planning-helper";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { isCancelledJobOrderStatus, isJobOrderStatus, JOB_ORDER_STATUS, normalizeJobOrderStatus } from "@/modules/manufacturing-management/job-order-status";
import { executeJobOrderWorkflow } from "../../job-orders/_workflow-service";
import { resolveApplicableRouteWorkCenters } from "../../production/station-scan/_applicable-work-centers";

async function patchActorId(): Promise<number> {
    try {
        const token = (await cookies()).get("vos_access_token")?.value;
        const payload = token ? JSON.parse(Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) : {};
        const id = Number(payload?.id || payload?.user_id || payload?.sub);
        return Number.isSafeInteger(id) && id > 0 ? id : 24;
    } catch {
        return 24;
    }
}

async function cancelledJobOrderResponse(jobOrderId: number | string): Promise<NextResponse | null> {
    const numericId = Number(jobOrderId);
    const path = Number.isSafeInteger(numericId) && numericId > 0
        ? `/items/manufacturing_job_orders/${numericId}?fields=job_order_id,job_order_no,status`
        : `/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(String(jobOrderId))}&fields=job_order_id,job_order_no,status&limit=1`;
    const response = await fetch(`${DIRECTUS_URL}${path}`, { headers, cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({}));
    const record = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
    if (!record || !isCancelledJobOrderStatus(record.status)) return null;
    return NextResponse.json({ error: `Job Order ${record.job_order_no || jobOrderId} is cancelled and cannot be updated.` }, { status: 409 });
}

async function productionMutationResponse(jobOrderId: number | string): Promise<NextResponse | null> {
    const numericId = Number(jobOrderId);
    const path = Number.isSafeInteger(numericId) && numericId > 0
        ? `/items/manufacturing_job_orders/${numericId}?fields=job_order_id,job_order_no,status`
        : `/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(String(jobOrderId))}&fields=job_order_id,job_order_no,status&limit=1`;
    const response = await fetch(`${DIRECTUS_URL}${path}`, { headers, cache: "no-store" });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({}));
    const record = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
    if (!record) return null;
    if (isCancelledJobOrderStatus(record.status)) {
        return NextResponse.json({ error: `Job Order ${record.job_order_no || jobOrderId} is cancelled and cannot be updated.`, code: "JOB_ORDER_CANCELLED" }, { status: 409 });
    }
    if (isJobOrderStatus(record.status, JOB_ORDER_STATUS.ON_HOLD, JOB_ORDER_STATUS.QA_HOLD)) {
        return NextResponse.json({ error: `Job Order ${record.job_order_no || jobOrderId} is on hold and cannot accept production changes until the hold is resolved.`, code: "PRODUCTION_ON_HOLD" }, { status: 409 });
    }
    if (isJobOrderStatus(record.status, JOB_ORDER_STATUS.PRODUCTION_COMPLETED, JOB_ORDER_STATUS.FOR_QA_RECONCILIATION, JOB_ORDER_STATUS.CLOSED)) {
        return NextResponse.json({ error: `Job Order ${record.job_order_no || jobOrderId} has completed production and cannot be updated.`, code: "PRODUCTION_COMPLETED" }, { status: 409 });
    }
    return null;
}

async function cancelledJobOrderResponseForTask(taskId: number): Promise<NextResponse | null> {
    const routeRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes/${taskId}?fields=jo_route_id,job_order_id`, { headers, cache: "no-store" });
    if (!routeRes.ok) return null;
    const route = (await routeRes.json()).data;
    const jobOrderId = Number(route?.job_order_id);
    if (!Number.isSafeInteger(jobOrderId) || jobOrderId <= 0) return null;
    return productionMutationResponse(jobOrderId);
}

function positiveInteger(value: unknown): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

async function handleRouteWorkCenterAssignment(body: any): Promise<NextResponse> {
    const jobOrderId = positiveInteger(body.jobOrderId ?? body.joId);
    if (!jobOrderId) {
        return NextResponse.json({ error: "A valid jobOrderId is required." }, { status: 400 });
    }

    if (!Array.isArray(body.assignments) || body.assignments.length === 0) {
        return NextResponse.json({ error: "At least one route workstation assignment is required." }, { status: 400 });
    }

    const jobOrderResponse = await fetch(
        `${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}?fields=job_order_id,job_order_no,status,version_id`,
        { headers, cache: "no-store" }
    );
    if (!jobOrderResponse.ok) {
        return NextResponse.json({ error: `Job Order ${jobOrderId} was not found.` }, { status: 404 });
    }

    const jobOrder = (await jobOrderResponse.json().catch(() => ({}))).data;
    const normalizedStatus = normalizeJobOrderStatus(jobOrder?.status);
    if (!normalizedStatus) {
        return NextResponse.json({ error: "The Job Order has an unknown status and cannot receive route workstation assignments." }, { status: 409 });
    }
    if (!isJobOrderStatus(normalizedStatus, JOB_ORDER_STATUS.PICKED, JOB_ORDER_STATUS.IN_PRODUCTION)) {
        return NextResponse.json({
            error: `Job Order ${jobOrder?.job_order_no || jobOrderId} must be Picked or In Production before route workstations can be assigned.`,
            code: "ROUTE_WORKCENTER_ASSIGNMENT_STATUS_NOT_ALLOWED"
        }, { status: 409 });
    }

    const routesResponse = await fetch(
        `${DIRECTUS_URL}/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${jobOrderId}&fields=jo_route_id,job_order_id,sequence_order,operation_id,routing_id,work_center_id,status&sort=sequence_order&limit=-1`,
        { headers, cache: "no-store" }
    );
    if (!routesResponse.ok) {
        return NextResponse.json({ error: "Job Order route data is temporarily unavailable." }, { status: 502 });
    }

    const routes = (await routesResponse.json().catch(() => ({}))).data;
    if (!Array.isArray(routes) || routes.length === 0) {
        return NextResponse.json({ error: `Job Order ${jobOrder?.job_order_no || jobOrderId} has no routing steps to assign.` }, { status: 409 });
    }

    const routeById = new Map<number, any>();
    routes.forEach((route: any) => {
        const routeId = positiveInteger(route.jo_route_id || route.id);
        if (routeId > 0) routeById.set(routeId, route);
    });

    const parsedAssignments: Array<{ joRouteId: number; workCenterId: number }> = [];
    const seenRouteIds = new Set<number>();
    for (const assignment of body.assignments) {
        const joRouteId = positiveInteger(assignment?.joRouteId ?? assignment?.taskId ?? assignment?.id);
        const workCenterId = positiveInteger(assignment?.workCenterId);
        if (!joRouteId || !workCenterId) {
            return NextResponse.json({ error: "Each assignment requires a valid joRouteId and workCenterId." }, { status: 400 });
        }
        if (seenRouteIds.has(joRouteId)) {
            return NextResponse.json({ error: `Route ${joRouteId} was included more than once.` }, { status: 400 });
        }
        seenRouteIds.add(joRouteId);
        parsedAssignments.push({ joRouteId, workCenterId });
    }

    const routeOptions = await resolveApplicableRouteWorkCenters(jobOrder);
    const routeOptionById = new Map(routeOptions.map((option) => [option.joRouteId, option]));
    const requestedWorkCenterIds = [...new Set(parsedAssignments.map((assignment) => assignment.workCenterId))];
    const workCentersResponse = await fetch(
        `${DIRECTUS_URL}/items/manufacturing_work_centers?filter[work_center_id][_in]=${requestedWorkCenterIds.join(",")}&fields=work_center_id,work_center_name,is_active&limit=-1`,
        { headers, cache: "no-store" }
    );
    if (!workCentersResponse.ok) {
        return NextResponse.json({ error: "Workstation data is temporarily unavailable." }, { status: 502 });
    }

    const workCenters = (await workCentersResponse.json().catch(() => ({}))).data;
    const workCenterById = new Map<number, any>();
    if (Array.isArray(workCenters)) {
        workCenters.forEach((workCenter: any) => {
            const workCenterId = positiveInteger(workCenter.work_center_id || workCenter.id);
            if (workCenterId > 0) workCenterById.set(workCenterId, workCenter);
        });
    }

    // Validate every row before writing any assignment so an invalid route or
    // workstation cannot partially update the Job Order's routing plan.
    for (const assignment of parsedAssignments) {
        const route = routeById.get(assignment.joRouteId);
        if (!route) {
            return NextResponse.json({
                error: `Route ${assignment.joRouteId} does not belong to Job Order ${jobOrder?.job_order_no || jobOrderId}.`,
                code: "ROUTE_NOT_IN_JOB_ORDER"
            }, { status: 422 });
        }

        const routeStatus = String(route.status || "Pending").trim().toLowerCase();
        if (routeStatus !== "pending") {
            return NextResponse.json({
                error: `Route ${route.sequence_order || assignment.joRouteId} is ${route.status || "not pending"} and cannot be reassigned.`,
                code: "ROUTE_WORKCENTER_ASSIGNMENT_STATUS_NOT_ALLOWED"
            }, { status: 409 });
        }

        const workCenter = workCenterById.get(assignment.workCenterId);
        const isInactive = workCenter && (workCenter.is_active === false || Number(workCenter.is_active) === 0);
        if (!workCenter || isInactive) {
            return NextResponse.json({
                error: `Work Center #${assignment.workCenterId} is not an active workstation.`,
                code: "WORK_CENTER_NOT_ACTIVE"
            }, { status: 422 });
        }

        const routeOption = routeOptionById.get(assignment.joRouteId);
        if (!routeOption || routeOption.workCenterIds.length === 0) {
            return NextResponse.json({
                error: `Route ${route.sequence_order || assignment.joRouteId} has no configured workstation in the product version routing.`,
                code: "ROUTE_WORKCENTER_NOT_CONFIGURED"
            }, { status: 409 });
        }
        if (!routeOption.workCenterIds.includes(assignment.workCenterId)) {
            return NextResponse.json({
                error: `Work Center "${workCenter.work_center_name || `#${assignment.workCenterId}`}" is not configured for route ${route.sequence_order || assignment.joRouteId}.`,
                code: "ROUTE_WORKCENTER_NOT_APPLICABLE",
                applicableWorkCenterIds: routeOption.workCenterIds
            }, { status: 422 });
        }
    }

    const updatedRoutes: Array<Record<string, unknown>> = [];
    for (const assignment of parsedAssignments) {
        const route = routeById.get(assignment.joRouteId);
        if (positiveInteger(route.work_center_id) !== assignment.workCenterId) {
            const response = await fetch(
                `${DIRECTUS_URL}/items/manufacturing_job_order_routes/${assignment.joRouteId}`,
                {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ work_center_id: assignment.workCenterId })
                }
            );
            if (!response.ok) {
                return NextResponse.json({ error: `Failed to save workstation assignment for route ${route.sequence_order || assignment.joRouteId}.` }, { status: 502 });
            }
            const payload = await response.json().catch(() => ({}));
            Object.assign(route, payload.data || {}, { work_center_id: assignment.workCenterId });
        }

        updatedRoutes.push({
            joRouteId: assignment.joRouteId,
            sequenceOrder: Number(route.sequence_order || 0),
            operationId: positiveInteger(route.operation_id) || null,
            status: route.status || "Pending",
            workCenterId: assignment.workCenterId,
            workCenterName: workCenterById.get(assignment.workCenterId)?.work_center_name || null
        });
    }

    return NextResponse.json({
        success: true,
        data: {
            jobOrderId,
            routes: updatedRoutes
        }
    });
}

export async function handlePATCH(request: Request) {
    try {
        const body = await request.json();

        if (body.action === "assign-route-workcenters") {
            return handleRouteWorkCenterAssignment(body);
        }

        // 0. Workstation breakdown handler
        if (body.action === "breakdown") {
            const { jobOrderId, haltedStepId, yieldQty, haltReason } = body;
            const parsedJobOrderId = Number(jobOrderId);
            const trimmedHaltReason = typeof haltReason === "string" ? haltReason.trim() : "";

            if (!Number.isInteger(parsedJobOrderId) || parsedJobOrderId <= 0) {
                return NextResponse.json({ error: "A valid jobOrderId is required." }, { status: 400 });
            }

            if (!trimmedHaltReason) {
                return NextResponse.json({ error: "A meaningful halt reason is required." }, { status: 400 });
            }

            const productionResponse = await productionMutationResponse(parsedJobOrderId);
            if (productionResponse) return productionResponse;

            await executeJobOrderWorkflow(parsedJobOrderId, {
                action: "place-on-hold",
                actorUserId: await patchActorId(),
                idempotencyKey: String(body.idempotencyKey || `breakdown:${parsedJobOrderId}:${haltedStepId}:${Number(yieldQty || 0)}`).trim(),
                remarks: `Halted at step ${haltedStepId}. Reported yield: ${Number(yieldQty || 0)}. Reason: ${trimmedHaltReason}`
            });

            return NextResponse.json({ success: true, message: "Workstation breakdown reported successfully." });
        }

        // 1. Task status/completion update
        if (body.taskId !== undefined && body.taskPatch !== undefined) {
            const { taskId, taskPatch } = body;
            const cancelledResponse = await cancelledJobOrderResponseForTask(Number(taskId));
            if (cancelledResponse) return cancelledResponse;
            const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes/${taskId}?fields=jo_route_id,job_order_id,sequence_order,work_center_id,operation_id,planned_setup_hours,planned_run_hours,actual_setup_hours,actual_run_hours,step_batch_size,run_time_hours_factor`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(taskPatch)
            });
            if (!res.ok) throw new Error(`Failed to patch routing task: ${res.status}`);
            const result = await res.json();
            
            // Sync with parent Job Order's daily breakdown
            try {
                const rTask = result.data;
                const joId = rTask?.jo_id;
                const routingId = rTask ? Number(rTask.routing_id) : null;
                const taskStatus = taskPatch.status;
 
                if (joId && routingId && (taskStatus === "Completed" || taskStatus === "Pending")) {
                    const joRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?filter[job_order_no][_eq]=${encodeURIComponent(joId)}&limit=1`, { headers });
                    if (joRes.ok) {
                        const jo = (await joRes.json()).data?.[0];
                        if (jo && jo.daily_breakdown && Array.isArray(jo.daily_breakdown) && jo.daily_breakdown.length > 0) {
                            interface DailyBreakdownItem {
                                day?: number;
                                date?: string;
                                quantity?: number;
                                completed_steps?: number[];
                                status?: string;
                                actual_yield?: number;
                            }
                            let dailyBreakdown = [...jo.daily_breakdown] as DailyBreakdownItem[];
                            let modified = false;
 
                            const tasksRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes?filter[job_order_id][_eq]=${jo.job_order_id}&limit=-1&fields=jo_route_id,job_order_id,sequence_order,work_center_id,operation_id,planned_setup_hours,planned_run_hours,actual_setup_hours,actual_run_hours,step_batch_size,run_time_hours_factor`, { headers });
                            const totalSteps = tasksRes.ok ? ((await tasksRes.json()).data || []).length : 1;

                            if (taskStatus === "Completed") {
                                let targetDay = dailyBreakdown.find((d: DailyBreakdownItem) => d.status === "Ongoing");
                                if (!targetDay) {
                                    targetDay = dailyBreakdown.find((d: DailyBreakdownItem) => d.status === "Pending" || !d.status);
                                }
                                if (!targetDay && dailyBreakdown.length > 0) {
                                    targetDay = dailyBreakdown[0];
                                }

                                if (targetDay) {
                                    const completedSteps = targetDay.completed_steps ? [...targetDay.completed_steps] : [];
                                    if (!completedSteps.includes(routingId)) {
                                        completedSteps.push(routingId);
                                        targetDay.completed_steps = completedSteps;
                                        if (completedSteps.length >= totalSteps) {
                                            targetDay.status = "Completed";
                                        } else {
                                            targetDay.status = "Ongoing";
                                        }
                                        modified = true;
                                    }
                                }
                            } else if (taskStatus === "Pending") {
                                dailyBreakdown = dailyBreakdown.map((day: DailyBreakdownItem) => {
                                    const completedSteps = day.completed_steps ? [...day.completed_steps] : [];
                                    const index = completedSteps.indexOf(routingId);
                                    if (index > -1) {
                                        completedSteps.splice(index, 1);
                                        modified = true;
                                        let newStatus = "Pending";
                                        if (completedSteps.length >= totalSteps) {
                                            newStatus = "Completed";
                                        } else if (completedSteps.length > 0) {
                                            newStatus = "Ongoing";
                                        }
                                        return {
                                            ...day,
                                            completed_steps: completedSteps,
                                            status: newStatus
                                        };
                                    }
                                    return day;
                                });
                            }

                            if (modified) {
                                const joStatusPatch: Record<string, unknown> = { daily_breakdown: dailyBreakdown };
                                // Completing a routing step updates the daily
                                // breakdown only. Lifecycle transitions are
                                // explicit workflow actions, so a shift/task
                                // update cannot silently complete a JO.

                                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${jo.job_order_id}`, {
                                    method: "PATCH",
                                    headers,
                                    body: JSON.stringify(joStatusPatch)
                                });
                            }
                        }
                    }
                }
            } catch (syncErr) {
                console.error("Error synchronizing QA status to parent JO daily breakdown:", syncErr);
            }

            return NextResponse.json({ success: true, data: result.data });
        }

        // 2. Task personnel assignment update
        if (body.taskId !== undefined && body.assignments !== undefined) {
            const { taskId, assignments } = body as { taskId: number; assignments: { user_id: number; is_team_lead: boolean }[] };
            const cancelledResponse = await cancelledJobOrderResponseForTask(Number(taskId));
            if (cancelledResponse) return cancelledResponse;
            
            // Delete existing assignments for this task in both old and new tables
            const existingRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators?filter[jo_route_id][_eq]=${taskId}&limit=-1`, { headers });
            if (existingRes.ok) {
                const existingData = (await existingRes.json()).data || [];
                for (const item of existingData) {
                    await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators/${item.jo_route_operator_id}`, { method: "DELETE", headers }).catch(() => {});
                }
            }
            try {
                const oldExistingRes = await fetch(`${DIRECTUS_URL}/items/job_order_task_assignments?filter[task_id][_eq]=${taskId}&limit=-1`, { headers });
                if (oldExistingRes.ok) {
                    const oldExistingData = (await oldExistingRes.json()).data || [];
                    for (const item of oldExistingData) {
                        await fetch(`${DIRECTUS_URL}/items/job_order_task_assignments/${item.id}`, { method: "DELETE", headers }).catch(() => {});
                    }
                }
            } catch (err) {
                console.warn("Failed to delete from legacy job_order_task_assignments (ignoring):", err);
            }

            // Create new assignments in both old and new tables for compatibility
            const results = [];
            for (const ass of assignments) {
                // Fetch the operator's hourly rate if needed
                let hourlyRate = 0;
                try {
                    const userRes = await fetch(`${DIRECTUS_URL}/items/user/${ass.user_id}`, { headers });
                    if (userRes.ok) {
                        const userData = (await userRes.json()).data;
                        hourlyRate = Number(userData?.hourly_rate || 0);
                    }
                } catch (e) {
                    console.error("Error fetching operator hourly rate:", e);
                }

                const newPayload = {
                    jo_route_id: taskId,
                    operator_id: ass.user_id,
                    logged_hours: 0,
                    hourly_rate: hourlyRate,
                    logged_at: new Date().toISOString()
                };

                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_route_operators`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(newPayload)
                });

                // Keep old compatibility
                try {
                    const addRes = await fetch(`${DIRECTUS_URL}/items/job_order_task_assignments`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            task_id: taskId,
                            user_id: ass.user_id,
                            is_team_lead: !!ass.is_team_lead
                        })
                    });
                    if (addRes.ok) {
                        results.push((await addRes.json()).data);
                    }
                } catch (err) {
                    console.warn("Failed to write to legacy job_order_task_assignments (ignoring):", err);
                }
            }
            return NextResponse.json({ success: true, data: results });
        }

        // 3. QA Log logging
        if (body.taskId !== undefined && body.qaLog !== undefined) {
            const { taskId, qaLog } = body;
            const expected = Number(qaLog.expected_quantity || 0);
            const actual = Number(qaLog.actual_quantity || 0);
            const deviation = expected - actual;

            // Get logged in user ID from secure access token cookie
            let encoderId: number | null = null;
            try {
                const cookieStore = await cookies();
                const token = cookieStore.get("vos_access_token")?.value;
                if (token) {
                    const parts = token.split(".");
                    if (parts.length >= 2) {
                        const base64Url = parts[1];
                        let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
                        while (base64.length % 4) base64 += "=";
                        const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
                        const payload = JSON.parse(jsonPayload);
                        const rawId = payload?.id || payload?.user_id || payload?.sub;
                        if (rawId) {
                            const parsed = Number(rawId);
                            if (!isNaN(parsed)) {
                                encoderId = parsed;
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Error decoding user token in PATCH:", err);
            }

            // 1. Fetch route step details
            const routeStepRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_routes/${taskId}?fields=jo_route_id,job_order_id,sequence_order,work_center_id,operation_id,planned_setup_hours,planned_run_hours,actual_setup_hours,actual_run_hours,step_batch_size,run_time_hours_factor`, { headers });
            if (!routeStepRes.ok) throw new Error("Route step not found");
            const routeStep = (await routeStepRes.json()).data;
            const jobOrderId = routeStep.job_order_id;
            const cancelledResponse = await cancelledJobOrderResponse(jobOrderId);
            if (cancelledResponse) return cancelledResponse;
            
            // 2. Fetch the corresponding manufacturing routing to get the qa_template_id
            let qaTemplateId: number | null = null;
            if (routeStep.routing_id) {
                const mfgRouteRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_routes/${routeStep.routing_id}`, { headers });
                if (mfgRouteRes.ok) {
                    const mfgRoute = (await mfgRouteRes.json()).data;
                    qaTemplateId = mfgRoute?.qa_template_id || null;
                }
            }

            // 3. Fetch parameters for that template
            let parameters: any[] = [];
            if (qaTemplateId) {
                const paramsRes = await fetch(`${DIRECTUS_URL}/items/quality_inspection_parameters?filter[template_id][_eq]=${qaTemplateId}&limit=-1`, { headers });
                if (paramsRes.ok) {
                    parameters = (await paramsRes.json()).data || [];
                }
            }

            if (parameters.length === 0) {
                // Find or create a default "Yield Verification" parameter
                const checkParamRes = await fetch(`${DIRECTUS_URL}/items/quality_inspection_parameters?filter[parameter_name][_eq]=Yield Verification&limit=1`, { headers });
                let defaultParam = checkParamRes.ok ? (await checkParamRes.json()).data?.[0] : null;
                if (!defaultParam) {
                    const createParamRes = await fetch(`${DIRECTUS_URL}/items/quality_inspection_parameters`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            parameter_name: "Yield Verification",
                            test_type: "Numeric",
                            expected_value: String(expected),
                            is_critical: false
                        })
                    });
                    if (createParamRes.ok) {
                        defaultParam = (await createParamRes.json()).data;
                    }
                }
                if (defaultParam) {
                    parameters.push(defaultParam);
                }
            }

            // 4. Save QA Records and process critical failed validations
            let overallPassed = true;
            let criticalFailed = false;

            for (const param of parameters) {
                let isPassed = true;
                const minVal = param.min_value !== null && param.min_value !== undefined ? Number(param.min_value) : null;
                const maxVal = param.max_value !== null && param.max_value !== undefined ? Number(param.max_value) : null;
                
                if (minVal !== null && actual < minVal) isPassed = false;
                if (maxVal !== null && actual > maxVal) isPassed = false;
                
                if (qaLog.qa_status === "Failed") isPassed = false;

                if (!isPassed) {
                    overallPassed = false;
                    if (param.is_critical || param.is_critical === 1 || param.is_critical === true) {
                        criticalFailed = true;
                    }
                }

                const qaPayload = {
                    job_order_id: jobOrderId,
                    jo_route_id: Number(taskId),
                    parameter_id: param.parameter_id,
                    value_text: qaLog.comments || "",
                    value_numeric: actual,
                    value_boolean: isPassed,
                    is_passed: isPassed,
                    inspected_by: encoderId || 1,
                    inspected_at: new Date().toISOString(),
                    remarks: qaLog.comments || ""
                };
                
                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_qa_records`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(qaPayload)
                });
            }

            if (criticalFailed) {
                // Set parent Job Order status to 'On Hold'
                await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({ status: "On Hold" })
                });
            }

            // Also keep old compatibility by inserting into job_order_qa_logs if permitted
            try {
                const legacyPayload = {
                    task_id: taskId,
                    expected_quantity: expected,
                    actual_quantity: actual,
                    deviation_quantity: deviation,
                    qa_status: overallPassed && !criticalFailed ? "Passed" : "Failed",
                    recorded_at: new Date().toISOString(),
                    comments: qaLog.comments || "",
                    photos: qaLog.photos || null
                };

                await fetch(`${DIRECTUS_URL}/items/job_order_qa_logs`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(legacyPayload)
                });
            } catch (err) {
                console.warn("Failed to write to legacy job_order_qa_logs (ignoring):", err);
            }

            return NextResponse.json({ success: true, data: { task_id: taskId } });
        }

        // 4. Default: Standard Job Order patch
        const { joId, patch } = body;

        if (!joId || !patch) {
            return NextResponse.json({ error: "Missing joId or patch data" }, { status: 400 });
        }

        const productionResponse = await productionMutationResponse(joId);
        if (productionResponse) return productionResponse;

        if (patch.branch_id !== undefined || patch.branchId !== undefined) {
            return NextResponse.json({
                error: "Job Order branch changes must use the guarded job-order-branch workflow.",
                code: "JOB_ORDER_BRANCH_ASSIGNMENT_REQUIRED"
            }, { status: 409 });
        }

        if (patch.status !== undefined) {
            return NextResponse.json({
                error: "Job Order lifecycle status must be changed through the workflow action endpoint.",
                code: "WORKFLOW_ACTION_REQUIRED"
            }, { status: 409 });
        }

        // Map camelCase patch fields to snake_case fields
        const dbPatch: Record<string, unknown> = {};
        if (patch.bom !== undefined) dbPatch.bom = patch.bom;
        if (patch.components !== undefined) dbPatch.components = patch.components;
        if (patch.routings !== undefined) dbPatch.routings = patch.routings;
        if (patch.allocationResults !== undefined) dbPatch.allocation_results = patch.allocationResults;
        if (patch.procurementStatus !== undefined) dbPatch.procurement_status = patch.procurementStatus;
        if (patch.quantity !== undefined) dbPatch.quantity = patch.quantity;
        if (patch.dueDate !== undefined) dbPatch.due_date = patch.dueDate;
        if (patch.assignedPersonnel !== undefined) dbPatch.assigned_personnel = patch.assignedPersonnel;
        if (patch.products !== undefined) dbPatch.products = patch.products;
        if (patch.shiftOption !== undefined) dbPatch.shift_option = patch.shiftOption;
        if (patch.dailyBreakdown !== undefined) dbPatch.daily_breakdown = patch.dailyBreakdown;
        if (patch.remarks !== undefined) dbPatch.remarks = patch.remarks;

        const result = await updateJobOrder(joId, dbPatch);
        return NextResponse.json({ success: true, data: result });
    } catch (e) {
        console.error("API Error in planning-engineering PATCH:", e);
        const message = (e as { message?: string }).message || "Failed to update Job Order";
        return NextResponse.json({ error: message }, { status: message.startsWith("Unknown Job Order status:") ? 400 : 500 });
    }
}
