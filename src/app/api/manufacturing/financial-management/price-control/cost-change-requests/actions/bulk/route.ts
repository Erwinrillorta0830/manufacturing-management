import { NextRequest, NextResponse } from "next/server";

import { decodeUserIdFromJwtCookie, mustBase } from "../../../price-change-batches/_batch";
import {
    actionErrorMessage,
    approveOneCostRequest,
    fetchCostRequestsByIds,
    rejectOneCostRequest,
} from "../../_actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BULK_REQUEST_IDS = 500;

type BulkAction = "approve" | "reject";

type BulkFailure = {
    request_id: number;
    message: string;
};

export async function POST(req: NextRequest) {
    try {
        mustBase();

        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await req.json()) as Partial<{
            action: BulkAction;
            request_ids: number[];
            reject_reason?: string;
            effective_at?: string | null;
        }>;

        const action = body.action;
        if (action !== "approve" && action !== "reject") {
            return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 });
        }

        const rawIds = Array.isArray(body.request_ids) ? body.request_ids : [];
        const requestIds = Array.from(
            new Set(rawIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)),
        );

        if (requestIds.length === 0) {
            return NextResponse.json({ error: "request_ids must be a non-empty array" }, { status: 400 });
        }

        if (requestIds.length > MAX_BULK_REQUEST_IDS) {
            return NextResponse.json(
                { error: `request_ids cannot exceed ${MAX_BULK_REQUEST_IDS} items` },
                { status: 400 },
            );
        }

        const reject_reason = String(body.reject_reason ?? "").trim();
        if (action === "reject" && !reject_reason) {
            return NextResponse.json({ error: "reject_reason is required" }, { status: 400 });
        }

        const rowsById = await fetchCostRequestsByIds(requestIds);

        const successIds: number[] = [];
        const failedIds: number[] = [];
        const failures: BulkFailure[] = [];

        type QueuedWork = {
            request_id: number;
            run: () => Promise<unknown>;
        };

        const queued: QueuedWork[] = [];

        for (const request_id of requestIds) {
            const row = rowsById.get(request_id);
            if (!row) {
                failedIds.push(request_id);
                failures.push({ request_id, message: "Request not found" });
                continue;
            }

            const status = String(row.status ?? "");
            if (status !== "PENDING") {
                failedIds.push(request_id);
                failures.push({ request_id, message: "Only PENDING requests can be actioned." });
                continue;
            }

            if (action === "approve") {
                queued.push({
                    request_id,
                    run: () => approveOneCostRequest(userId, request_id, row, body.effective_at),
                });
            } else {
                queued.push({
                    request_id,
                    run: () => rejectOneCostRequest(userId, request_id, row, reject_reason),
                });
            }
        }

        const settled = await Promise.allSettled(queued.map((item) => item.run()));

        for (let i = 0; i < queued.length; i += 1) {
            const { request_id } = queued[i];
            const result = settled[i];

            if (result.status === "fulfilled") {
                successIds.push(request_id);
            } else {
                failedIds.push(request_id);
                failures.push({
                    request_id,
                    message: actionErrorMessage(result.reason, "Request failed"),
                });
            }
        }

        return NextResponse.json({
            action,
            successIds,
            failedIds,
            failures,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return NextResponse.json({ error: "Unexpected error", details: message }, { status: 500 });
    }
}
