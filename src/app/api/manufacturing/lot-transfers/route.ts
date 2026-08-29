import { NextResponse } from "next/server";
import {
    createLotTransfer,
    getSessionUserId,
    listLotTransfers,
    parseLotTransferInput
} from "./_domain";
import { errorResponse, readJson } from "./_http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const rawLimit = Number(searchParams.get("limit") || 200);
        const rawOffset = Number(searchParams.get("offset") || 0);
        const rawBranchId = Number(searchParams.get("branchId") || searchParams.get("branch_id") || 0);
        const result = await listLotTransfers({
            status: searchParams.get("status"),
            branchId: rawBranchId > 0 ? rawBranchId : null,
            search: searchParams.get("search"),
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
