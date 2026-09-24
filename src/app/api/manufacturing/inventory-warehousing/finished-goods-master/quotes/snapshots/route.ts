import { NextResponse } from "next/server";
import { fetchQuotationSnapshots } from "./snapshots-helper";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const quoteIdStr = searchParams.get("quoteId");
        if (!quoteIdStr) {
            return NextResponse.json({ error: "Missing quoteId" }, { status: 400 });
        }
        const snapshots = await fetchQuotationSnapshots(parseInt(quoteIdStr));
        return NextResponse.json(snapshots);
    } catch (e) {
        console.error("API Error fetching quotation snapshots:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch quotation snapshots" }, { status: 500 });
    }
}
