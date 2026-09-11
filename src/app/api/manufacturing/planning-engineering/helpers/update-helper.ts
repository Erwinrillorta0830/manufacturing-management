/* eslint-disable */
import { DIRECTUS_URL, headers, getJobOrderIdByNo } from "./shared";
import { assertJobOrderStatus, JOB_ORDER_STATUS } from "@/modules/manufacturing-management/job-order-status";


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
            if (firstP.quantity !== undefined) headerPatch.target_quantity = Number(firstP.quantity);
            const vId = firstP.bom?.version || firstP.bom?.version_id;
            if (vId !== undefined) headerPatch.version_id = Number(vId);
        }

        // Map incoming fields to new schema fields
        if (patchData.status !== undefined) {
            let mappedStatus = assertJobOrderStatus(patchData.status);
            if (mappedStatus === JOB_ORDER_STATUS.SHORTAGE) mappedStatus = JOB_ORDER_STATUS.DRAFT;
            else if (mappedStatus === JOB_ORDER_STATUS.PROCEED) mappedStatus = JOB_ORDER_STATUS.RELEASED;
            else if (mappedStatus === JOB_ORDER_STATUS.ONGOING) mappedStatus = JOB_ORDER_STATUS.IN_PROGRESS;
            else if (mappedStatus === JOB_ORDER_STATUS.FINISHED) mappedStatus = JOB_ORDER_STATUS.COMPLETED;
            headerPatch.status = mappedStatus;
        }
        if (patchData.due_date !== undefined) headerPatch.end_date = patchData.due_date;
        if (patchData.remarks !== undefined) headerPatch.remarks = patchData.remarks;
        if (patchData.quantity !== undefined) headerPatch.target_quantity = Number(patchData.quantity);
        if (patchData.product_id !== undefined) headerPatch.product_id = Number(patchData.product_id);
        if (patchData.created_by !== undefined) headerPatch.created_by = Number(patchData.created_by);
        
        // Patch header
        if (Object.keys(headerPatch).length > 0) {
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

