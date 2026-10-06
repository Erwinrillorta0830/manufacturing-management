import { procurementDirectusFetch } from "@/app/api/manufacturing/procurement/_directus";

interface MrpPairInput {
    productId?: number | string | null;
    product_id?: number | string | { product_id?: number | string } | null;
    purchaseIntent?: string | null;
    purchase_intent?: string | null;
    jobOrderId?: number | string | null;
    job_order_id?: number | string | null;
}

interface MaterialRow {
    job_order_id?: number | string | null;
    product_id?: number | string | null;
}

export class MrpPairValidationError extends Error {
    constructor(message: string, public readonly status = 400, public readonly details?: unknown) {
        super(message);
    }
}

function productIdOf(line: MrpPairInput): number {
    const value = line.productId ?? line.product_id;
    if (value && typeof value === "object") return Number(value.product_id || 0);
    return Number(value || 0);
}

function jobOrderIdOf(line: MrpPairInput): number {
    return Number(line.jobOrderId ?? line.job_order_id ?? 0);
}

function intentOf(line: MrpPairInput): string {
    return line.purchaseIntent ?? line.purchase_intent ?? "Buffer_Stock";
}

/**
 * Validates the product/job-order relationship before a purchase-order write.
 * The exact pair must exist in manufacturing_job_order_materials; matching a
 * product or job order independently is insufficient.
 */
export async function assertMrpProductJobOrderPairs(lines: readonly MrpPairInput[]) {
    const candidates = lines.flatMap((line, index) => {
        if (intentOf(line) !== "MRP_Demand") return [];
        return [{
            lineNumber: index + 1,
            productId: productIdOf(line),
            jobOrderId: jobOrderIdOf(line)
        }];
    });
    if (!candidates.length) return;

    const malformed = candidates.filter(candidate =>
        !Number.isSafeInteger(candidate.productId)
        || candidate.productId <= 0
        || !Number.isSafeInteger(candidate.jobOrderId)
        || candidate.jobOrderId <= 0
    );
    if (malformed.length) {
        throw new MrpPairValidationError(
            `MRP demand line ${malformed[0].lineNumber} requires a valid product and job order.`,
            400,
            { invalidPairs: malformed }
        );
    }

    const jobOrderIds = [...new Set(candidates.map(candidate => candidate.jobOrderId))];
    const productIds = [...new Set(candidates.map(candidate => candidate.productId))];
    const params = new URLSearchParams({
        "filter[job_order_id][_in]": jobOrderIds.join(","),
        "filter[product_id][_in]": productIds.join(","),
        fields: "job_order_id,product_id",
        limit: "-1"
    });
    const response = await procurementDirectusFetch(`/items/manufacturing_job_order_materials?${params.toString()}`);
    if (!response.ok) {
        throw new MrpPairValidationError("Unable to validate MRP product and job-order selections.", 503);
    }

    const rows = (await response.json()).data as MaterialRow[];
    const validPairs = new Set(rows.map(row => `${Number(row.job_order_id)}:${Number(row.product_id)}`));
    const invalidPairs = candidates.filter(candidate => !validPairs.has(`${candidate.jobOrderId}:${candidate.productId}`));
    if (!invalidPairs.length) return;

    const first = invalidPairs[0];
    const message = invalidPairs.length === 1
        ? `MRP-demand product ${first.productId} is not a material requirement of job order ${first.jobOrderId}.`
        : "One or more MRP-demand products are not material requirements of their selected job orders.";
    throw new MrpPairValidationError(message, 400, { invalidPairs });
}
