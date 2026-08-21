import { NextRequest, NextResponse } from "next/server";

import { decodeUserIdFromJwtCookie, directusErrorResponse, mustBase } from "../../price-change-batches/_batch";
import {
    approveOneCostRequest,
    cancelOneCostRequest,
    getCostRequest,
    rejectOneCostRequest,
} from "../_actions";
import { isInvalidProposedCostError } from "../_costValidation";

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

        if (!Number.isFinite(request_id) || request_id <= 0) {
            return NextResponse.json({ error: "request_id is required" }, { status: 400 });
        }

        const ccr = await getCostRequest(request_id);
        if (!ccr) {
            return NextResponse.json({ error: "Request not found" }, { status: 404 });
        }

        const status = String(ccr.status ?? "");
        if (status !== "PENDING") {
            return NextResponse.json({ error: "Only PENDING requests can be actioned." }, { status: 400 });
        }

        if (action === "cancel") {
            try {
                const data = await cancelOneCostRequest(userId, request_id, ccr);
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

            const data = await rejectOneCostRequest(userId, request_id, ccr, reject_reason);
            return NextResponse.json({ data });
        }

        const data = await approveOneCostRequest(userId, request_id, ccr, body.effective_at);
        return NextResponse.json({ data });
    } catch (error: unknown) {
        if (isInvalidProposedCostError(error)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        const message = error instanceof Error ? error.message : String(error);
        if (message === "Invalid product_id on request.") {
            return NextResponse.json({ error: message }, { status: 400 });
        }

        return directusErrorResponse(error);
    }
}
