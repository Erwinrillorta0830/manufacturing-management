import { NextRequest, NextResponse } from "next/server";

import {
    decodeUserIdFromJwtCookie,
    directusErrorResponse,
    isPriceSnapshotConflictError,
    mustBase,
} from "../../price-change-batches/_batch";
import {
    approveOneOrphanPriceRequest,
    cancelOnePriceRequest,
    getPriceRequest,
    rejectOneOrphanPriceRequest,
} from "../_actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
    try {
        mustBase();

        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await req.json()) as Partial<{
            action: "approve" | "reject" | "cancel";
            request_id: number;
            reject_reason?: string;
            effective_at?: string | null;
        }>;

        const action = body.action;
        const request_id = Number(body.request_id);

        if (!action) {
            return NextResponse.json({ error: "action is required" }, { status: 400 });
        }

        if (action !== "approve" && action !== "reject" && action !== "cancel") {
            return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
        }

        if (!Number.isFinite(request_id) || request_id <= 0) {
            return NextResponse.json({ error: "request_id is required" }, { status: 400 });
        }

        const pcr = await getPriceRequest(request_id);
        if (!pcr) {
            return NextResponse.json({ error: "Request not found" }, { status: 404 });
        }

        const status = String(pcr.status ?? "");
        if (status !== "PENDING") {
            return NextResponse.json({ error: "Only PENDING requests can be actioned." }, { status: 400 });
        }

        if (action === "cancel") {
            try {
                const data = await cancelOnePriceRequest(userId, request_id, pcr);
                return NextResponse.json({ data });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                if (message === "You can only cancel your own request.") {
                    return NextResponse.json({ error: message }, { status: 403 });
                }
                throw error;
            }
        }

        if (action === "reject") {
            const reject_reason = String(body.reject_reason ?? "").trim();
            if (!reject_reason) {
                return NextResponse.json({ error: "reject_reason is required" }, { status: 400 });
            }

            try {
                const data = await rejectOneOrphanPriceRequest(userId, request_id, pcr, reject_reason);
                return NextResponse.json({ data });
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                if (message.includes("linked to a batch")) {
                    return NextResponse.json({ error: message }, { status: 400 });
                }
                throw error;
            }
        }

        try {
            const data = await approveOneOrphanPriceRequest(userId, request_id, pcr, body.effective_at);
            return NextResponse.json({ data });
        } catch (error: unknown) {
            if (isPriceSnapshotConflictError(error)) {
                return NextResponse.json(
                    {
                        error: error.message,
                        code: "price_snapshot_conflict",
                        conflicts: [error.conflict],
                    },
                    { status: 409 },
                );
            }

            const message = error instanceof Error ? error.message : String(error);
            if (
                message.includes("linked to a batch") ||
                message === "Invalid product_id on request." ||
                message === "Invalid price_type_id on request." ||
                message === "Invalid proposed_price on request."
            ) {
                return NextResponse.json({ error: message }, { status: 400 });
            }
            throw error;
        }
    } catch (error: unknown) {
        return directusErrorResponse(error);
    }
}
