export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
    fetchMmInventoryMovements,
    MmInventoryMovementError,
    movementErrorStatus
} from "@/app/api/manufacturing/services/mm-inventory-movements.service";
import { resolveJobOrderRelationship } from "../../inventory/_job-order-relationships";
import {
    normalizeFinalQARelease,
    resolveCanonicalLotId,
    type FinalQAReleaseRecord
} from "./_domain";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

type FinalQAStatus = "Pending" | "Passed" | "Failed";
type FinalQADisposition = "Approved" | "Quarantined" | "Rejected";

interface DirectusJobOrder {
    job_order_id?: unknown;
    job_order_no?: unknown;
    product_id?: unknown;
    branch_id?: unknown;
}

interface DirectusLot {
    lot_id?: unknown;
    lot_name?: unknown;
}

type DirectusRelease = FinalQAReleaseRecord;

class FinalQAValidationError extends Error {
    constructor(
        message: string,
        public readonly status: 400 | 409 | 422
    ) {
        super(message);
    }
}

function relationId(value: unknown, keys: string[] = ["id"]): number {
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

function positiveSafeInteger(value: unknown, fieldName: string): number {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new FinalQAValidationError(`${fieldName} must be a positive integer.`, 400);
    }
    return parsed;
}

function finiteNumber(value: unknown, fieldName: string, options: { positive?: boolean } = {}): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || (options.positive ? parsed <= 0 : parsed < 0)) {
        throw new FinalQAValidationError(
            `${fieldName} must be ${options.positive ? "a positive" : "a non-negative"} number.`,
            400
        );
    }
    return parsed;
}

async function directusRecord<T>(url: string, description: string): Promise<T | null> {
    const response = await fetch(url, { headers, cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) {
        throw new Error(`${description} failed with HTTP ${response.status}: ${await response.text()}`);
    }
    const json = await response.json();
    return (json.data ?? null) as T | null;
}

async function directusCollection<T>(url: string, description: string): Promise<T[]> {
    const response = await fetch(url, { headers, cache: "no-store" });
    if (!response.ok) {
        throw new Error(`${description} failed with HTTP ${response.status}: ${await response.text()}`);
    }
    const json = await response.json();
    return Array.isArray(json.data) ? json.data as T[] : [];
}

function sameRelation(left: unknown, right: number): boolean {
    return relationId(left, ["lot_id", "id"]) === right;
}

async function verifyFinalQALotRelationship(input: {
    jobOrderId: number;
    lotId: number;
    productId: number;
    branchId: number;
}) {
    const [lot, requestedJobOrder, jobOrders] = await Promise.all([
        directusRecord<DirectusLot>(
            `${DIRECTUS_URL}/items/lots/${input.lotId}?fields=lot_id,lot_name`,
            "Master lot lookup"
        ),
        directusRecord<DirectusJobOrder>(
            `${DIRECTUS_URL}/items/manufacturing_job_orders/${input.jobOrderId}?fields=job_order_id,job_order_no,product_id,branch_id`,
            "Job Order lookup"
        ),
        directusCollection<DirectusJobOrder>(
            `${DIRECTUS_URL}/items/manufacturing_job_orders?fields=job_order_id,job_order_no&limit=-1`,
            "Job Order relationship lookup"
        )
    ]);

    if (!lot || relationId(lot.lot_id, ["lot_id", "id"]) !== input.lotId) {
        throw new FinalQAValidationError(
            "The selected lot is not a valid master inventory lot. Refresh the pending lots and try again.",
            422
        );
    }
    if (!requestedJobOrder) {
        throw new FinalQAValidationError("The selected Job Order could not be found.", 422);
    }

    const jobOrderProductId = relationId(requestedJobOrder.product_id, ["product_id", "id"]);
    const jobOrderBranchId = relationId(requestedJobOrder.branch_id, ["branch_id", "id"]);
    if (jobOrderProductId > 0 && jobOrderProductId !== input.productId) {
        throw new FinalQAValidationError("The selected lot does not belong to the submitted Job Order product.", 409);
    }
    if (jobOrderBranchId > 0 && jobOrderBranchId !== input.branchId) {
        throw new FinalQAValidationError("The selected lot does not belong to the submitted Job Order branch.", 409);
    }

    const movementRows = await fetchMmInventoryMovements({
        lot: input.lotId,
        transactionTypeId: 2,
        movementDirection: "IN"
    });
    const lotMovements = movementRows.filter((movement) => sameRelation(movement.lot_id, input.lotId));
    if (lotMovements.length === 0) {
        throw new FinalQAValidationError(
            "This master lot has no positive finished-goods movement linked to a Job Order.",
            422
        );
    }

    const matchingMovements = lotMovements.filter((movement) =>
        relationId(movement.product_id, ["product_id", "id"]) === input.productId
        && relationId(movement.branch_id, ["branch_id", "id"]) === input.branchId
    );
    if (matchingMovements.length === 0) {
        throw new FinalQAValidationError(
            "The selected master lot is not linked to this product and branch.",
            409
        );
    }

    const relationship = resolveJobOrderRelationship(matchingMovements, jobOrders);
    if (relationship.status === "unlinked") {
        throw new FinalQAValidationError(
            "This lot has no authoritative Job Order relationship. Ask Inventory or Production to repair the lot before releasing it.",
            422
        );
    }
    if (relationship.status === "ambiguous") {
        throw new FinalQAValidationError(
            "This lot is linked to multiple Job Orders and cannot be released until the inventory relationship is resolved.",
            409
        );
    }
    if (relationship.jobOrderId !== input.jobOrderId) {
        throw new FinalQAValidationError(
            "The selected lot is linked to a different Job Order. Refresh the pending lots and try again.",
            409
        );
    }

    return {
        lotId: input.lotId,
        jobOrderId: relationship.jobOrderId,
        jobOrderNo: relationship.jobOrderNo,
        lotName: String(lot.lot_name ?? "")
    };
}

function errorResponse(error: unknown) {
    if (error instanceof FinalQAValidationError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof MmInventoryMovementError) {
        return NextResponse.json({ error: error.message }, { status: movementErrorStatus(error) });
    }
    const message = error instanceof Error ? error.message : "Failed to release lot";
    console.error("Error in final-qa API:", error);
    return NextResponse.json({ error: message }, { status: 500 });
}

async function ensureNoExistingRelease(lotId: number) {
    const releases = await directusCollection<DirectusRelease>(
        `${DIRECTUS_URL}/items/manufacturing_final_qa_releases?fields=final_release_id,lot_id&limit=-1`,
        "Existing final QA release lookup"
    );

    for (const release of releases) {
        const storedLotId = relationId(release.lot_id, ["lot_id", "id"]);
        const canonicalLotId = await resolveCanonicalLotId(storedLotId);
        if (canonicalLotId === lotId) {
            throw new FinalQAValidationError(
                "This master lot already has a final QA release and cannot be released again.",
                409
            );
        }
    }
}

// GET: Retrieves all final batch QA releases
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const joId = searchParams.get("joId");

        let url = `${DIRECTUS_URL}/items/manufacturing_final_qa_releases?limit=-1&sort=-approved_at`;
        if (joId) {
            url += `&filter[job_order_id][_eq]=${encodeURIComponent(joId)}`;
        }

        const releases = await directusCollection<DirectusRelease>(url, "Final QA release lookup");
        const normalizedReleases = await Promise.all(releases.map((release) => normalizeFinalQARelease(release)));
        return NextResponse.json(normalizedReleases);
    } catch (error) {
        return errorResponse(error);
    }
}

// POST: Creates a final QA release record after validating the authoritative lot relationship.
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const jobOrderId = positiveSafeInteger(body.jobOrderId, "jobOrderId");
        const lotId = positiveSafeInteger(body.lotId, "lotId");
        const productId = positiveSafeInteger(body.productId, "productId");
        const branchId = positiveSafeInteger(body.branchId, "branchId");
        const inspectedQuantity = finiteNumber(body.inspectedQuantity, "inspectedQuantity", { positive: true });
        const defectQuantity = finiteNumber(body.defectQuantity ?? 0, "defectQuantity");
        if (defectQuantity > inspectedQuantity) {
            throw new FinalQAValidationError("defectQuantity cannot exceed inspectedQuantity.", 400);
        }

        const overallDisposition = body.overallDisposition as FinalQADisposition;
        if (!["Approved", "Quarantined", "Rejected"].includes(overallDisposition)) {
            throw new FinalQAValidationError("overallDisposition must be Approved, Quarantined, or Rejected.", 400);
        }

        const microbiologicalStatus = (body.microbiologicalStatus || "Pending") as FinalQAStatus;
        if (!["Pending", "Passed", "Failed"].includes(microbiologicalStatus)) {
            throw new FinalQAValidationError("microbiologicalStatus must be Pending, Passed, or Failed.", 400);
        }

        const approvedBy = body.approvedBy == null || body.approvedBy === ""
            ? null
            : positiveSafeInteger(body.approvedBy, "approvedBy");
        const relationship = await verifyFinalQALotRelationship({ jobOrderId, lotId, productId, branchId });
        await ensureNoExistingRelease(relationship.lotId);
        const timestamp = new Date().toISOString();
        const payload = {
            job_order_id: relationship.jobOrderId,
            lot_id: relationship.lotId,
            inspected_quantity: inspectedQuantity,
            defect_quantity: defectQuantity,
            microbiological_status: microbiologicalStatus,
            packaging_seal_passed: body.packagingSealPassed ? 1 : 0,
            label_compliance_passed: body.labelCompliancePassed ? 1 : 0,
            overall_disposition: overallDisposition,
            coa_reference_no: body.coaReferenceNo || null,
            approved_by: approvedBy,
            approved_at: timestamp,
            remarks: body.remarks || ""
        };

        const response = await fetch(`${DIRECTUS_URL}/items/manufacturing_final_qa_releases`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`Failed to write final QA release: ${await response.text()}`);
        }

        const json = await response.json();
        const saved = json.data as DirectusRelease | undefined;
        const savedId = relationId(saved?.final_release_id ?? saved?.id, ["final_release_id", "id"]);
        if (!saved || savedId <= 0) {
            throw new Error("Final QA release insert returned no release identifier.");
        }
        if (relationId(saved.job_order_id, ["job_order_id", "id"]) !== relationship.jobOrderId
            || relationId(saved.lot_id, ["lot_id", "id"]) !== relationship.lotId) {
            throw new Error("Final QA release insert returned a mismatched Job Order or master lot.");
        }

        return NextResponse.json({
            success: true,
            data: saved,
            jobOrderId: relationship.jobOrderId,
            lotId: relationship.lotId,
            message: "Final lot QA release logged successfully."
        });
    } catch (error) {
        return errorResponse(error);
    }
}
