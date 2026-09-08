import { NextResponse } from "next/server";
import { parseLotTransferInput, previewLotTransferInput } from "../_domain";
import { errorResponse, readJson } from "../_http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const preview = await previewLotTransferInput(parseLotTransferInput(await readJson(request)));
        return NextResponse.json({ success: true, data: preview });
    } catch (error) {
        return errorResponse(error, "draft preview");
    }
}
