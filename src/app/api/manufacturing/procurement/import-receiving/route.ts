import { NextRequest, NextResponse } from "next/server";
import { fetchImportReceivings, createImportReceiving } from "./import-receiving-helper";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const importPoIdStr = searchParams.get("importPoId");
        const importPoId = importPoIdStr ? parseInt(importPoIdStr, 10) : undefined;

        const receivings = await fetchImportReceivings(importPoId);
        return NextResponse.json(receivings);
    } catch (error) {
        console.error("GET /api/manufacturing/procurement/import-receiving Error:", error);
        return NextResponse.json({ error: "Failed to fetch import cargo receivings" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const created = await createImportReceiving(body);
        return NextResponse.json(created, { status: 201 });
    } catch (error) {
        console.error("POST /api/manufacturing/procurement/import-receiving Error:", error);
        return NextResponse.json({ error: "Failed to create import cargo receiving" }, { status: 500 });
    }
}
