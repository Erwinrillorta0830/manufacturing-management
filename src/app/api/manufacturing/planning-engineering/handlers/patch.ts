/* eslint-disable */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { updateJobOrder } from "../planning-helper";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function handlePATCH(request: Request) {
    try {
        const body = await request.json();

        // 0. Workstation breakdown handler
        if (body.action === "breakdown") {
            const { jobOrderId, haltedStepId, yieldQty, haltReason, materials } = body;
            const joPatchRes = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    status: "On Hold",
                    actual_quantity_produced: Number(yieldQty),
                    remarks: `Halted at step ${haltedStepId}. Reason: ${haltReason}`
                })
            });
            if (!joPatchRes.ok) {
                throw new Error(`Failed to update Job Order status to On Hold: ${joPatchRes.status}`);
            }

            if (materials && Array.isArray(materials)) {
                for (const mat of materials) {
                    await fetch(`${DIRECTUS_URL}/items/manufacturing_job_order_materials/${mat.materialId}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify({
                            actual_consumed_quantity: Number(mat.consumedQty)
                        })
                    }).catch(err => console.error(`Failed to patch material ${mat.materialId}:`, err));
                }
            }

            return NextResponse.json({ success: true, message: "Workstation breakdown reported successfully." });
        }

        // 1. Task status/completion update
        if (body.taskId !== undefined && body.taskPatch !== undefined) {
            const { taskId, taskPatch } = body;
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
                                const allDaysCompleted = dailyBreakdown.every((d: DailyBreakdownItem) => d.status === "Completed");
                                const joStatusPatch: Record<string, unknown> = { daily_breakdown: dailyBreakdown };
                                if (allDaysCompleted) {
                                    joStatusPatch.status = "Finished";
                                } else {
                                    const anyDayStarted = dailyBreakdown.some((d: DailyBreakdownItem) => d.status === "Ongoing" || d.status === "Completed");
                                    if (anyDayStarted && jo.status !== "Ongoing" && jo.status !== "Finished" && jo.status !== "Cancelled") {
                                        joStatusPatch.status = "Ongoing";
                                    }
                                }

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

        // Map camelCase patch fields to snake_case fields
        const dbPatch: Record<string, unknown> = {};
        if (patch.status !== undefined) dbPatch.status = patch.status;
        if (patch.bom !== undefined) dbPatch.bom = patch.bom;
        if (patch.components !== undefined) dbPatch.components = patch.components;
        if (patch.routings !== undefined) dbPatch.routings = patch.routings;
        if (patch.allocationResults !== undefined) dbPatch.allocation_results = patch.allocationResults;
        if (patch.procurementStatus !== undefined) dbPatch.procurement_status = patch.procurementStatus;
        if (patch.quantity !== undefined) dbPatch.quantity = patch.quantity;
        if (patch.dueDate !== undefined) dbPatch.due_date = patch.dueDate;
        if (patch.branch_id !== undefined) dbPatch.branch_id = patch.branch_id;
        if (patch.branchId !== undefined) dbPatch.branch_id = patch.branchId;
        if (patch.assignedPersonnel !== undefined) dbPatch.assigned_personnel = patch.assignedPersonnel;
        if (patch.products !== undefined) dbPatch.products = patch.products;
        if (patch.shiftOption !== undefined) dbPatch.shift_option = patch.shiftOption;
        if (patch.dailyBreakdown !== undefined) dbPatch.daily_breakdown = patch.dailyBreakdown;
        if (patch.remarks !== undefined) dbPatch.remarks = patch.remarks;

        const result = await updateJobOrder(joId, dbPatch);
        return NextResponse.json({ success: true, data: result });
    } catch (e) {
        console.error("API Error in planning-engineering PATCH:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to update Job Order" }, { status: 500 });
    }
}
