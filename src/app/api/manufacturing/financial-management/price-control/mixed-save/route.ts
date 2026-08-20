import { NextRequest, NextResponse } from "next/server";

import {
    BatchCreateLineInput,
    cancelPendingBatch,
    createPriceBatchDetails,
    createPriceBatchHeader,
    createPendingPriceBatch,
    decodeUserIdFromJwtCookie,
    directusErrorResponse,
    DETAILS,
    mapBatchHeaderResponse,
    mustBase,
    normalizeBatchCreateLines,
} from "../price-change-batches/_batch";
import {
    CostBulkItemInput,
    createPendingCostRequests,
    planCostBulkCreate,
} from "../cost-change-requests/_bulk";
import {
    assertCostBatchStorageReady,
    createCostBatchDetails,
    COST_DETAILS,
    isCostBatchStorageSetupError,
} from "../cost-change-batches/_batch";
import { isInvalidProposedCostError } from "../cost-change-requests/_costValidation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIXED_SAVE_ROLLBACK_REASON = "Auto-cancelled: mixed save failed";

function costBatchStorageSetupResponse(details: string, rolledBack = false) {
    return NextResponse.json(
        {
            error: "List cost batch storage is not configured.",
            details,
            setup_required: true,
            rolled_back: rolledBack,
        },
        { status: 503 },
    );
}

type MixedSaveBatchInput = {
    supplier_id: number;
    reference_no?: string;
    remarks: string;
};

type MixedSaveBody = {
    batch?: MixedSaveBatchInput;
    price_lines?: BatchCreateLineInput[];
    cost_items?: CostBulkItemInput[];
};

export async function POST(req: NextRequest) {
    try {
        mustBase();
        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await req.json()) as MixedSaveBody;
        const priceLines = Array.isArray(body.price_lines) ? body.price_lines : [];
        const costItems = Array.isArray(body.cost_items) ? body.cost_items : [];
        const batch = body.batch;
        const supplierId = Number(batch?.supplier_id);
        const remarks = String(batch?.remarks ?? "").trim();
        const referenceNo = String(batch?.reference_no ?? "").trim();

        if (priceLines.length === 0 && costItems.length === 0) {
            return NextResponse.json(
                { error: "At least one of price_lines or cost_items is required" },
                { status: 400 },
            );
        }

        const isMixed = priceLines.length > 0 && costItems.length > 0;

        if (priceLines.length > 0 || costItems.length > 0) {
            if (!Number.isFinite(supplierId) || supplierId <= 0) {
                return NextResponse.json({ error: "supplier_id is required" }, { status: 400 });
            }
            if (!remarks) {
                return NextResponse.json({ error: "remarks is required" }, { status: 400 });
            }
        }

        const [pricePlan, costPlan] = await Promise.all([
            priceLines.length > 0 ? normalizeBatchCreateLines(priceLines) : null,
            costItems.length > 0 ? planCostBulkCreate(costItems) : null,
        ]);

        if (isMixed) {
            const priceWouldCreate = pricePlan?.linesToCreate.length ?? 0;
            const costWouldCreate = costPlan?.itemsToCreate.length ?? 0;

            if (priceWouldCreate === 0 || costWouldCreate === 0) {
                return NextResponse.json(
                    {
                        error: "Mixed save blocked",
                        code: "mixed_save_preflight_failed",
                        price: {
                            would_create: priceWouldCreate,
                            skipped_duplicates: pricePlan?.skippedDuplicates ?? 0,
                            skipped_existing_pending: pricePlan?.skippedExistingPending ?? 0,
                        },
                        cost: {
                            would_create: costWouldCreate,
                            skipped_duplicates: costPlan?.skippedDuplicates ?? 0,
                            skipped_existing_pending: costPlan?.skippedExistingPending ?? 0,
                        },
                    },
                    { status: 400 },
                );
            }
        }

        if (isMixed) {
            let sharedHeaderId = 0;
            try {
                await assertCostBatchStorageReady();
                const sharedHeader = await createPriceBatchHeader({
                    userId,
                    supplierId,
                    referenceNo,
                    remarks,
                });
                sharedHeaderId = sharedHeader.headerId;

                const priceCreated = await createPriceBatchDetails({
                    userId,
                    headerId: sharedHeaderId,
                    linesToCreate: pricePlan!.linesToCreate,
                    requestedAt: sharedHeader.requestedAt,
                });
                const costCreated = await createCostBatchDetails({
                    userId,
                    headerId: sharedHeaderId,
                    itemsToCreate: costPlan!.itemsToCreate,
                    requestedAt: sharedHeader.requestedAt,
                });

                if (priceCreated.created === 0 || costCreated.created === 0) {
                    throw new Error("Mixed save did not create both price and list cost detail lines.");
                }

                return NextResponse.json(
                    {
                        created: priceCreated.created + costCreated.created,
                        header_id: sharedHeaderId,
                        batch_types: ["PRICE_TYPE", "LIST_COST"],
                        price: {
                            created: priceCreated.created,
                            skipped_duplicates: pricePlan!.skippedDuplicates,
                            skipped_existing_pending: pricePlan!.skippedExistingPending,
                            header_id: sharedHeaderId,
                            data: mapBatchHeaderResponse(sharedHeader.headerRow, priceCreated.created),
                        },
                        cost: {
                            created: costCreated.created,
                            skipped_duplicates: costPlan!.skippedDuplicates,
                            skipped_existing_pending: costPlan!.skippedExistingPending,
                            header_id: sharedHeaderId,
                        },
                    },
                    { status: 201 },
                );
            } catch (error: unknown) {
                if (sharedHeaderId > 0) {
                    await cancelPendingBatch(
                        sharedHeaderId,
                        userId,
                        MIXED_SAVE_ROLLBACK_REASON,
                        [DETAILS, COST_DETAILS],
                    ).catch(() => undefined);
                }

                if (isCostBatchStorageSetupError(error)) {
                    return costBatchStorageSetupResponse(
                        error instanceof Error ? error.message : String(error),
                        sharedHeaderId > 0,
                    );
                }

                return NextResponse.json(
                    {
                        error: "Mixed save failed; shared batch was rolled back",
                        code: "mixed_save_rolled_back",
                        rolled_back: sharedHeaderId > 0,
                        details: error instanceof Error ? error.message : String(error),
                    },
                    { status: 500 },
                );
            }
        }

        let priceResult: {
            created: number;
            skipped_duplicates: number;
            skipped_existing_pending: number;
            header_id?: number;
            data?: ReturnType<typeof mapBatchHeaderResponse>;
        } = {
            created: 0,
            skipped_duplicates: 0,
            skipped_existing_pending: 0,
        };

        let costResult: {
            created: number;
            skipped_duplicates: number;
            skipped_existing_pending: number;
            header_id?: number;
            reference_no?: string | null;
        } = {
            created: 0,
            skipped_duplicates: 0,
            skipped_existing_pending: 0,
        };

        if (pricePlan && priceLines.length > 0) {
            if (pricePlan.linesToCreate.length === 0) {
                priceResult = {
                    created: 0,
                    skipped_duplicates: pricePlan.skippedDuplicates,
                    skipped_existing_pending: pricePlan.skippedExistingPending,
                };
            } else {
                const created = await createPendingPriceBatch({
                    userId,
                    supplierId,
                    referenceNo,
                    remarks,
                    linesToCreate: pricePlan.linesToCreate,
                });

                priceResult = {
                    created: created.created,
                    skipped_duplicates: pricePlan.skippedDuplicates,
                    skipped_existing_pending: pricePlan.skippedExistingPending,
                    header_id: created.headerId,
                    data: mapBatchHeaderResponse(created.headerRow, created.created),
                };
            }
        }

        if (costPlan && costItems.length > 0) {
            if (isMixed && priceResult.created === 0) {
                return NextResponse.json(
                    {
                        error: "Mixed save blocked",
                        code: "mixed_save_preflight_failed",
                        price: {
                            would_create: 0,
                            skipped_duplicates: pricePlan?.skippedDuplicates ?? 0,
                            skipped_existing_pending: pricePlan?.skippedExistingPending ?? 0,
                        },
                        cost: {
                            would_create: costPlan.itemsToCreate.length,
                            skipped_duplicates: costPlan.skippedDuplicates,
                            skipped_existing_pending: costPlan.skippedExistingPending,
                        },
                    },
                    { status: 400 },
                );
            }

            if (costPlan.itemsToCreate.length === 0) {
                costResult = {
                    created: 0,
                    skipped_duplicates: costPlan.skippedDuplicates,
                    skipped_existing_pending: costPlan.skippedExistingPending,
                };
            } else {
                try {
                    const created = await createPendingCostRequests({
                        userId,
                        itemsToCreate: costPlan.itemsToCreate,
                        supplierId,
                        referenceNo,
                        remarks: remarks || "List cost change request",
                    });

                    costResult = {
                        created: created.created,
                    skipped_duplicates: costPlan.skippedDuplicates,
                    skipped_existing_pending: costPlan.skippedExistingPending,
                    header_id: created.headerId,
                    reference_no: created.headerRow?.reference_no ?? null,
                };
                } catch (costError: unknown) {
                    if (isMixed && priceResult.header_id) {
                        await cancelPendingBatch(
                            priceResult.header_id,
                            userId,
                            MIXED_SAVE_ROLLBACK_REASON,
                        ).catch(() => undefined);

                        const message =
                            costError instanceof Error ? costError.message : String(costError);
                        if (isCostBatchStorageSetupError(costError)) {
                            return costBatchStorageSetupResponse(message, true);
                        }

                        return NextResponse.json(
                            {
                                error: "Mixed save failed; price batch was rolled back",
                                code: "mixed_save_rolled_back",
                                rolled_back: true,
                                details: message,
                            },
                            { status: 500 },
                        );
                    }

                    if (isCostBatchStorageSetupError(costError)) {
                        return costBatchStorageSetupResponse(
                            costError instanceof Error ? costError.message : String(costError),
                        );
                    }

                    throw costError;
                }
            }
        }

        const totalCreated = priceResult.created + costResult.created;

        if (totalCreated === 0) {
            return NextResponse.json(
                {
                    created: 0,
                    price: priceResult,
                    cost: costResult,
                },
                { status: 200 },
            );
        }

        return NextResponse.json(
            {
                created: totalCreated,
                price: priceResult,
                cost: costResult,
            },
            { status: 201 },
        );
    } catch (error: unknown) {
        if (isInvalidProposedCostError(error)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        if (isCostBatchStorageSetupError(error)) {
            return costBatchStorageSetupResponse(error.message);
        }

        return directusErrorResponse(error);
    }
}
