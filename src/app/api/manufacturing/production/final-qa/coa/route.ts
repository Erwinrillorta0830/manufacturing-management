export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
    fetchMmInventoryMovements,
    MmInventoryMovementError,
    movementErrorStatus
} from "@/app/api/manufacturing/services/mm-inventory-movements.service";
import {
    DIRECTUS_URL,
    directusCollection,
    directusRecord,
    relationId,
    resolveCanonicalLotId,
    type DirectusJobOrder,
    type DirectusLot,
    type FinalQAReleaseRecord
} from "../_domain";

interface DirectusProduct {
    product_id?: unknown;
    product_name?: unknown;
    product_code?: unknown;
}

interface DirectusBranch {
    id?: unknown;
    branch_id?: unknown;
    branch_name?: unknown;
    branch_code?: unknown;
}

function text(value: unknown, fallback = ""): string {
    const resolved = String(value ?? "").trim();
    return resolved || fallback;
}

function booleanValue(value: unknown): boolean {
    return value === true || value === 1 || value === "1" || String(value).toLowerCase() === "true";
}

function releaseId(release: FinalQAReleaseRecord): number {
    return relationId(release.final_release_id ?? release.id, ["final_release_id", "id"]);
}

function errorResponse(error: unknown, status = 500) {
    const message = error instanceof Error
        ? error.message
        : typeof error === "string"
            ? error
            : "Failed to load final QA COA data";
    console.error("Error in final-qa COA API:", error);
    return NextResponse.json(
        { error: message },
        { status: error instanceof MmInventoryMovementError ? movementErrorStatus(error) : status }
    );
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const finalReleaseId = Number(searchParams.get("finalReleaseId") || 0);
        if (!Number.isSafeInteger(finalReleaseId) || finalReleaseId <= 0) {
            return errorResponse("finalReleaseId must be a positive integer.", 400);
        }

        const releaseRows = await directusCollection<FinalQAReleaseRecord>(
            `${DIRECTUS_URL}/items/manufacturing_final_qa_releases?filter[final_release_id][_eq]=${finalReleaseId}&limit=1&fields=*`,
            "Final QA release lookup"
        );
        const release = releaseRows[0] || null;
        if (!release) {
            return errorResponse("Final QA release was not found.", 404);
        }

        const storedLotId = relationId(release.lot_id, ["lot_id", "id"]);
        const canonicalLotId = await resolveCanonicalLotId(storedLotId);
        if (canonicalLotId <= 0) {
            return errorResponse("The final QA release is not linked to a canonical master lot.", 422);
        }

        const jobOrderId = relationId(release.job_order_id, ["job_order_id", "id"]);
        const [lotRows, jobOrder, movementRows] = await Promise.all([
            directusCollection<DirectusLot>(
                `${DIRECTUS_URL}/items/lots?filter[lot_id][_eq]=${canonicalLotId}&fields=lot_id,lot_name&limit=1`,
                "Canonical master lot lookup"
            ),
            jobOrderId > 0
                ? directusRecord<DirectusJobOrder>(
                    `${DIRECTUS_URL}/items/manufacturing_job_orders/${jobOrderId}?fields=job_order_id,job_order_no,product_id,branch_id`,
                    "Final QA Job Order lookup"
                )
                : Promise.resolve(null),
            fetchMmInventoryMovements({
                lot: canonicalLotId,
                transactionTypeId: 2,
                movementDirection: "IN"
            })
        ]);
        const lot = lotRows[0] || null;

        const matchingMovement = movementRows.find((movement) =>
            jobOrderId > 0 && (
                relationId(movement.source_document_id, ["job_order_id", "id"]) === jobOrderId
                || text(movement.source_document_no) === text(jobOrder?.job_order_no)
            )
        ) || movementRows[0] || null;

        const productId = relationId(jobOrder?.product_id, ["product_id", "id"])
            || relationId(matchingMovement?.product_id, ["product_id", "id"]);
        const branchId = relationId(jobOrder?.branch_id, ["branch_id", "id"])
            || relationId(matchingMovement?.branch_id, ["branch_id", "id"]);
        const [product, branch] = await Promise.all([
            productId > 0
                ? directusRecord<DirectusProduct>(
                    `${DIRECTUS_URL}/items/products/${productId}?fields=product_id,product_name,product_code`,
                    "Final QA product lookup"
                )
                : Promise.resolve(null),
            branchId > 0
                ? directusRecord<DirectusBranch>(
                    `${DIRECTUS_URL}/items/branches/${branchId}?fields=id,branch_name,branch_code`,
                    "Final QA branch lookup"
                )
                : Promise.resolve(null)
        ]);

        const persistedInspectedQuantity = Number(release.inspected_quantity || 0);
        const movementQuantity = Number(matchingMovement?.quantity || 0);
        const resolvedLotNumber = text(matchingMovement?.batch_no, text(lot?.lot_name, `Lot ${canonicalLotId}`));

        return NextResponse.json({
            final_release_id: releaseId(release),
            stored_lot_id: storedLotId || null,
            canonical_lot_id: canonicalLotId,
            is_legacy_lot_reference: Boolean(storedLotId > 0 && storedLotId !== canonicalLotId),
            job_order_id: jobOrderId || null,
            job_order_no: text(jobOrder?.job_order_no),
            product_id: productId || null,
            product_name: text(product?.product_name, productId > 0 ? `Product #${productId}` : "Unknown product"),
            product_code: text(product?.product_code),
            branch_id: branchId || null,
            branch_name: text(branch?.branch_name, branchId > 0 ? `Branch #${branchId}` : "Unknown branch"),
            branch_code: text(branch?.branch_code),
            lot_id: canonicalLotId,
            lot_number: resolvedLotNumber,
            lot_name: text(lot?.lot_name, resolvedLotNumber),
            quantity: persistedInspectedQuantity || movementQuantity,
            inspected_quantity: persistedInspectedQuantity,
            defect_quantity: Number(release.defect_quantity || 0),
            microbiological_status: text(release.microbiological_status, "Pending"),
            packaging_seal_passed: booleanValue(release.packaging_seal_passed),
            label_compliance_passed: booleanValue(release.label_compliance_passed),
            overall_disposition: text(release.overall_disposition, "Pending"),
            coa_reference_no: text(release.coa_reference_no),
            approved_by: relationId(release.approved_by, ["user_id", "id"]) || null,
            approved_at: release.approved_at ?? null,
            remarks: text(release.remarks),
            manufacturing_date: matchingMovement?.manufacturing_date ?? null,
            expiration_date: matchingMovement?.expiry_date ?? null,
            source_movement_id: relationId(matchingMovement?.movement_id, ["movement_id", "id"]) || null
        });
    } catch (error) {
        return errorResponse(error);
    }
}
