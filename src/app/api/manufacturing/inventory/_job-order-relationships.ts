export type JobOrderRelationshipStatus = "linked" | "unlinked" | "ambiguous";

export interface JobOrderRelationshipReference {
    jobOrderId: number;
    jobOrderNo: string;
}

export interface JobOrderRelationship {
    status: JobOrderRelationshipStatus;
    jobOrderId: number | null;
    jobOrderNo: string | null;
    candidates: JobOrderRelationshipReference[];
}

interface JobOrderRow {
    job_order_id?: unknown;
    job_order_no?: unknown;
}

interface FinishedGoodsMovementRow {
    transaction_type_id?: unknown;
    quantity?: unknown;
    source_document_id?: unknown;
    source_document_no?: unknown;
}

function relationId(value: unknown, keys: string[]): number {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const candidate = Number(record[key]);
            if (Number.isSafeInteger(candidate) && candidate > 0) return candidate;
        }
        return 0;
    }

    const candidate = Number(value ?? 0);
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 0;
}

function jobOrderReference(row: JobOrderRow): JobOrderRelationshipReference | null {
    const jobOrderId = relationId(row.job_order_id, ["job_order_id", "id"]);
    const jobOrderNo = String(row.job_order_no ?? "").trim();
    return jobOrderId > 0 && jobOrderNo ? { jobOrderId, jobOrderNo } : null;
}

export function isPositiveFinishedGoodsMovement(row: FinishedGoodsMovementRow): boolean {
    return relationId(row.transaction_type_id, ["transaction_type_id", "id"]) === 2
        && Number.isFinite(Number(row.quantity))
        && Number(row.quantity) > 0;
}

export function resolveJobOrderRelationship(
    movements: FinishedGoodsMovementRow[],
    jobOrders: JobOrderRow[]
): JobOrderRelationship {
    const jobsById = new Map<number, JobOrderRelationshipReference>();
    const jobsByNo = new Map<string, JobOrderRelationshipReference>();

    for (const jobOrder of jobOrders) {
        const reference = jobOrderReference(jobOrder);
        if (!reference) continue;
        jobsById.set(reference.jobOrderId, reference);
        jobsByNo.set(reference.jobOrderNo, reference);
    }

    const references = new Map<number, JobOrderRelationshipReference>();
    for (const movement of movements) {
        if (!isPositiveFinishedGoodsMovement(movement)) continue;

        const sourceDocumentId = relationId(movement.source_document_id, ["job_order_id", "id"]);
        const sourceDocumentNo = String(movement.source_document_no ?? "").trim();
        const reference = sourceDocumentId > 0
            ? jobsById.get(sourceDocumentId)
            : jobsByNo.get(sourceDocumentNo);

        if (reference) references.set(reference.jobOrderId, reference);
    }

    const candidates = [...references.values()].sort((left, right) => left.jobOrderId - right.jobOrderId);
    if (candidates.length === 1) {
        return {
            status: "linked",
            jobOrderId: candidates[0].jobOrderId,
            jobOrderNo: candidates[0].jobOrderNo,
            candidates
        };
    }

    return {
        status: candidates.length > 1 ? "ambiguous" : "unlinked",
        jobOrderId: null,
        jobOrderNo: null,
        candidates
    };
}
