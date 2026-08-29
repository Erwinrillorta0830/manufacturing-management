import { NextResponse } from "next/server";
import { LotTransferError } from "./_domain";

export async function readJson(request: Request): Promise<unknown> {
    try {
        return await request.json();
    } catch {
        throw new LotTransferError(400, "The request body must contain valid JSON.");
    }
}

export function parseTransferId(value: string): number {
    const id = Number(value);
    if (!Number.isInteger(id) || id <= 0) {
        throw new LotTransferError(400, "A valid lot-transfer ID is required.");
    }
    return id;
}

export function errorResponse(error: unknown, context: string): NextResponse {
    if (error instanceof LotTransferError) {
        return NextResponse.json(
            { success: false, error: error.message, details: error.details },
            { status: error.statusCode }
        );
    }

    console.error(`[Lot transfer] ${context}:`, error);
    return NextResponse.json(
        { success: false, error: "The lot-transfer operation could not be completed." },
        { status: 500 }
    );
}
