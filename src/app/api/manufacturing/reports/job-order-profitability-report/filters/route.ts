import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { authorizeJobOrderProfitabilityReport } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DirectusRow = Record<string, unknown>;

async function fetchAll(collection: string, fields: string, signal: AbortSignal): Promise<DirectusRow[]> {
    const rows: DirectusRow[] = [];
    let offset = 0;
    while (true) {
        const params = new URLSearchParams({ fields, limit: "100", offset: String(offset) });
        const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params.toString()}`, {
            headers,
            cache: "no-store",
            signal
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(payload?.data)) {
            throw new Error(`${collection} filter lookup failed with HTTP ${response.status}.`);
        }
        const page = payload.data as DirectusRow[];
        rows.push(...page);
        offset += page.length;
        if (page.length < 100) break;
    }
    return rows;
}

function positiveId(value: unknown): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

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

        const directusStarted = performance.now();
        const [branches, products, jobOrders] = await Promise.all([
            fetchAll("branches", "id,branch_name", request.signal),
            fetchAll("products", "product_id,product_name,product_code", request.signal),
            fetchAll("manufacturing_job_orders", "status", request.signal)
        ]);
        directusMs = performance.now() - directusStarted;
        return timed(NextResponse.json({ data: {
            branches: branches.map((row) => ({
                id: positiveId(row.id),
                label: String(row.branch_name || `Branch #${positiveId(row.id)}`)
            })).filter((row) => row.id > 0).sort((left, right) => left.label.localeCompare(right.label)),
            products: products.map((row) => {
                const id = positiveId(row.product_id);
                const code = String(row.product_code || "").trim();
                return {
                    id,
                    label: `${String(row.product_name || `Product #${id}`)}${code ? ` · ${code}` : ""}`
                };
            }).filter((row) => row.id > 0).sort((left, right) => left.label.localeCompare(right.label)),
            statuses: [...new Set(jobOrders.map((row) => String(row.status || "").trim()).filter(Boolean))]
                .sort((left, right) => left.localeCompare(right))
        } }), started, authMs, directusMs);
    } catch (error) {
        if (request.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
            return timed(new NextResponse(null, { status: 499 }), started, authMs, directusMs);
        }
        console.error("[Job Order Profitability] Failed to load filter options:", error);
        return timed(NextResponse.json({
            error: error instanceof Error ? error.message : "Failed to load report filter options."
        }, { status: 503 }), started, authMs, directusMs);
    }
}
