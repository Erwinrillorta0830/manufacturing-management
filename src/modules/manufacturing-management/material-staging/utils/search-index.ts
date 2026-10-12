import type { StagingJobOrder } from "../types";

export function buildMaterialStagingSearchIndex(jobOrders: readonly StagingJobOrder[]): Map<number, string> {
    return new Map(jobOrders.map(jobOrder => {
        const fields = [
            jobOrder.job_order_no,
            jobOrder.product_name,
            jobOrder.product_code,
            jobOrder.primary_work_center_name
        ];
        for (const material of jobOrder.materials || []) {
            fields.push(material.product_name, material.product_code);
            for (const allocation of material.allocations || []) {
                fields.push(allocation.batch_no);
            }
        }

        const searchableText = fields
            .map(value => String(value ?? "").trim().toLowerCase())
            .filter(Boolean)
            .join("\u0000");
        return [jobOrder.job_order_id, searchableText];
    }));
}
