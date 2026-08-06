import { NextRequest, NextResponse } from "next/server";
import { getLatestForexConfig, fetchForexHistory, createForexConfig } from "./forex-helper";

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const action = searchParams.get("action");

        if (action === "history") {
            const history = await fetchForexHistory(20);
            return NextResponse.json(history);
        }

        const latest = await getLatestForexConfig();
        return NextResponse.json(latest);
    } catch (error) {
        console.error("GET /api/manufacturing/forex Error:", error);
        return NextResponse.json({ error: "Failed to fetch forex rates" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const created = await createForexConfig(body);
        return NextResponse.json(created, { status: 201 });
    } catch (error) {
        console.error("POST /api/manufacturing/forex Error:", error);
        return NextResponse.json({ error: "Failed to create forex configuration" }, { status: 500 });
    }
}
