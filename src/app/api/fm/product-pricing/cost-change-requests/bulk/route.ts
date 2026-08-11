import { NextRequest, NextResponse } from "next/server";

import { isCostBatchStorageSetupError } from "../../cost-change-batches/_batch";
import { decodeUserIdFromJwtCookie } from "../../price-change-batches/_batch";
import {
    CostBulkItemInput,
    createPendingCostRequests,
    planCostBulkCreate,
} from "../_bulk";
import { isInvalidProposedCostError } from "../_costValidation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function costBatchStorageSetupResponse(details: string) {
    return NextResponse.json(
        {
            error: "List cost batch storage is not configured.",
            details,
            setup_required: true,
        },
        { status: 503 },
    );
}

function parseWrappedError(message: string) {
    try {
        const parsed: unknown = JSON.parse(message);
        if (typeof parsed !== "object" || parsed === null) return null;

        const record = parsed as Record<string, unknown>;
        const status = Number(record.status);
        const url = typeof record.url === "string" ? record.url : "";
        const body = typeof record.body === "string" ? record.body : "";
        const parsedMessage =
            typeof record.message === "string" ? record.message : "Directus request failed";

        if (!Number.isFinite(status) || !url) return null;

        return { message: parsedMessage, status, url, body };
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = (await req.json()) as Partial<{
            items: CostBulkItemInput[];
            supplier_id: number;
            reference_no: string;
            remarks: string;
        }>;

        const supplierId = Number(body.supplier_id);
        if (!Number.isFinite(supplierId) || supplierId <= 0) {
            return NextResponse.json({ error: "supplier_id is required for List Cost requests" }, { status: 400 });
        }

        const rawItems = Array.isArray(body.items) ? body.items : [];

        if (rawItems.length === 0) {
            return NextResponse.json({ error: "items must be a non-empty array" }, { status: 400 });
        }

        const plan = await planCostBulkCreate(rawItems);

        if (plan.itemsToCreate.length === 0) {
            return NextResponse.json(
                {
                    created: 0,
                    skipped_duplicates: plan.skippedDuplicates,
                    skipped_existing_pending: plan.skippedExistingPending,
                },
                { status: 200 },
            );
        }

        const result = await createPendingCostRequests({
            userId,
            itemsToCreate: plan.itemsToCreate,
            supplierId,
            referenceNo: body.reference_no,
            remarks: body.remarks,
        });

        return NextResponse.json(
            {
                created: result.created,
                header_id: result.headerId,
                reference_no: result.headerRow?.reference_no ?? null,
                skipped_duplicates: plan.skippedDuplicates,
                skipped_existing_pending: plan.skippedExistingPending,
            },
            { status: 201 },
        );
    } catch (error: unknown) {
        if (isInvalidProposedCostError(error)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        const message = error instanceof Error ? error.message : String(error);
        if (isCostBatchStorageSetupError(error)) {
            return costBatchStorageSetupResponse(message);
        }

        const wrapped = parseWrappedError(message);

        if (wrapped) {
            return NextResponse.json(
                {
                    error: "Directus request failed",
                    directus_status: wrapped.status,
                    directus_url: wrapped.url,
                    directus_body: wrapped.body,
                },
                { status: 500 },
            );
        }

        return NextResponse.json({ error: "Unexpected error", details: message }, { status: 500 });
    }
}
