import { NextResponse } from "next/server";
import {
    getLotTransfer,
    parseLotTransferPatch,
    updateLotTransfer
} from "../_domain";
import { errorResponse, parseTransferId, readJson } from "../_http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
    try {
        const { id: rawId } = await params;
        const record = await getLotTransfer(parseTransferId(rawId));
        return NextResponse.json({ success: true, data: record });
    } catch (error) {
        return errorResponse(error, "get");
    }
}

export async function PATCH(request: Request, { params }: RouteContext) {
    try {
        const { id: rawId } = await params;
        const record = await updateLotTransfer(
            parseTransferId(rawId),
            parseLotTransferPatch(await readJson(request))
        );
        return NextResponse.json({ success: true, data: record });
    } catch (error) {
        return errorResponse(error, "update");
    }
}
