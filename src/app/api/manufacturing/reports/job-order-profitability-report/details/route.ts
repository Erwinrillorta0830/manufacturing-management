import { NextResponse } from "next/server";
import { authorizeJobOrderProfitabilityReport } from "../auth";
import { getProfitabilityBatchDetails } from "../_batch-details";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function timed(response: NextResponse, started: number, authMs: number, directusMs: number): NextResponse {
    const totalMs = performance.now() - started;
    const reportMs = Math.max(0, totalMs - authMs - directusMs);
    response.headers.set("Server-Timing", `auth;dur=${authMs.toFixed(1)}, directus;dur=${directusMs.toFixed(1)}, report;dur=${reportMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`);
    return response;
}

export async function GET(request: Request) {
    const started = performance.now();
    let authMs = 0;
    let directusMs = 0;
    try {
        const authStarted = performance.now();
        const access = await authorizeJobOrderProfitabilityReport(request.signal);
        authMs = performance.now() - authStarted;
        if (!access.ok) return timed(NextResponse.json({ error: access.error }, { status: access.status }), started, authMs, directusMs);

        const ledgerIdParam = new URL(request.url).searchParams.get("ledgerId") || "";
        if (!/^\d+$/.test(ledgerIdParam) || !Number.isSafeInteger(Number(ledgerIdParam)) || Number(ledgerIdParam) < 1) {
            return timed(NextResponse.json({ error: "A valid ledgerId is required." }, { status: 400 }), started, authMs, directusMs);
        }
        const directusStarted = performance.now();
        const detail = await getProfitabilityBatchDetails(Number(ledgerIdParam), request.signal);
        directusMs = performance.now() - directusStarted;
        if (!detail) return timed(NextResponse.json({ error: "Batch details are unavailable for this committed, QA-passed output." }, { status: 404 }), started, authMs, directusMs);
        return timed(NextResponse.json({ data: { ledgerId: Number(ledgerIdParam), detail } }), started, authMs, directusMs);
    } catch (error) {
        if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
            return timed(new NextResponse(null, { status: 499 }), started, authMs, directusMs);
        }
        console.error("[Job Order Profitability] Failed to load batch details:", error);
        return timed(NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load batch cost details." }, { status: 503 }), started, authMs, directusMs);
    }
}
