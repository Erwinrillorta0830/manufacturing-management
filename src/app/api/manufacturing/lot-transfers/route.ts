import { NextResponse } from "next/server";
import {
    createLotTransfer,
    getSessionUserId,
    getSessionUserBranchId,
    listLotTransfers,
    LotTransferError,
    LOT_TRANSFER_STATUSES,
    parseLotTransferInput
} from "./_domain";
import { errorResponse, readJson } from "./_http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function optionalPositiveInteger(value: string | null, label: string): number | null {
    if (!value || !value.trim()) return null;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new LotTransferError(400, `${label} must be a positive integer.`);
    }
    return parsed;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const rawLimit = Number(searchParams.get("limit") || 200);
        const rawOffset = Number(searchParams.get("offset") || 0);
        const rawStatuses = searchParams.get("status")?.split(",").map((status) => status.trim()).filter(Boolean) || [];
        const invalidStatuses = rawStatuses.filter((status) => !(LOT_TRANSFER_STATUSES as readonly string[]).includes(status));
        if (invalidStatuses.length > 0) {
            throw new LotTransferError(400, `Unsupported lot-transfer status filter: ${invalidStatuses.join(", ")}.`);
        }
        const requestedBranchId = optionalPositiveInteger(searchParams.get("branchId") || searchParams.get("branch_id"), "Branch filter");
        const sessionBranchId = await getSessionUserBranchId();
        const result = await listLotTransfers({
            status: rawStatuses,
            branchId: sessionBranchId || requestedBranchId,
            search: searchParams.get("search"),
            requestedFrom: searchParams.get("requestedFrom"),
            requestedTo: searchParams.get("requestedTo"),
            productId: optionalPositiveInteger(searchParams.get("productId"), "Product filter"),
            sourceLotId: optionalPositiveInteger(searchParams.get("sourceLotId"), "Source-lot filter"),
            targetLotId: optionalPositiveInteger(searchParams.get("targetLotId"), "Destination-lot filter"),
            sourceBatchNo: searchParams.get("sourceBatchNo"),
            targetBatchNo: searchParams.get("targetBatchNo"),
            requestedBy: optionalPositiveInteger(searchParams.get("requestedBy"), "Creator filter"),
            approvedBy: optionalPositiveInteger(searchParams.get("approvedBy"), "Approver filter"),
            postedBy: optionalPositiveInteger(searchParams.get("postedBy"), "Poster filter"),
            limit: Number.isFinite(rawLimit) ? rawLimit : 200,
            offset: Number.isFinite(rawOffset) ? rawOffset : 0
        });

        return NextResponse.json({
            success: true,
            data: result.data,
            totalCount: result.totalCount
        });
    } catch (error) {
        return errorResponse(error, "list/create");
    }
}

export async function POST(request: Request) {
    try {
        const input = parseLotTransferInput(await readJson(request));
        const record = await createLotTransfer(input, await getSessionUserId());
        return NextResponse.json({ success: true, data: record }, { status: 201 });
    } catch (error) {
        return errorResponse(error, "create");
    }
}
