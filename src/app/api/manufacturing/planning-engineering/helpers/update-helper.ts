/* eslint-disable */
import { DIRECTUS_URL, headers, getJobOrderIdByNo } from "./shared";
import { formatPhtDateTime } from "@/app/api/manufacturing/directus-api";
import { synchronizeJobOrderOperatorAssignments } from "../../job-orders/_operator-assignment-service";


export async function updateJobOrder(joId: string, patchData: Record<string, any>): Promise<{ success: boolean }> {
    return modifyJobOrder(joId, patchData);
}

export async function modifyJobOrder(joId: string, patchData: Record<string, any>): Promise<{ success: boolean }> {
    try {
        const joInfo = await getJobOrderIdByNo(joId);
        if (!joInfo) throw new Error(`Job Order not found: ${joId}`);
        const joIdInt = joInfo.id;

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
        if (patchData.remarks !== undefined) headerPatch.remarks = patchData.remarks;
        if (patchData.product_id !== undefined) headerPatch.product_id = Number(patchData.product_id);
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

