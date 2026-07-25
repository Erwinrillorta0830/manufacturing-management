import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers as directusHeaders } from "../../directus-api";
import { cookies } from "next/headers";
import { LEGACY_STATUS_MAP } from "../_status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

        const payload = decodeJwtPayload(token);
        const role = payload?.role;
        if (role !== "ADMIN") {
            return NextResponse.json({ message: "Admin access required" }, { status: 403 });
        }

        const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";
        const legacyStatuses = Object.keys(LEGACY_STATUS_MAP);
        const results: Record<string, { found: number; updated: number; errors: string[] }> = {};
        let overallErrors = false;

        for (const legacy of legacyStatuses) {
            const canonical = LEGACY_STATUS_MAP[legacy];
            const searchRes = await fetch(
                `${DIRECTUS_URL}/items/sales_order?filter[order_status][_eq]=${encodeURIComponent(legacy)}&fields=order_id,so_no,order_status&limit=-1`,
                { headers: directusHeaders, cache: "no-store" }
            );

            if (!searchRes.ok) {
                results[legacy] = { found: 0, updated: 0, errors: [`Query failed: HTTP ${searchRes.status}`] };
                overallErrors = true;
                continue;
            }

            const orders: { order_id: number; so_no: string }[] = (await searchRes.json()).data || [];
            if (dryRun) {
                results[legacy] = { found: orders.length, updated: 0, errors: [] };
                continue;
            }

            let updated = 0;
            const errors: string[] = [];

            for (const order of orders) {
                const patchRes = await fetch(`${DIRECTUS_URL}/items/sales_order/${order.order_id}`, {
                    method: "PATCH",
                    headers: directusHeaders,
                    body: JSON.stringify({ order_status: canonical }),
                });
                if (patchRes.ok) {
                    updated++;
                } else {
                    errors.push(`${order.so_no}: HTTP ${patchRes.status}`);
                    overallErrors = true;
                }
            }

            results[legacy] = { found: orders.length, updated, errors };
        }

        const totalFound = Object.values(results).reduce((s, r) => s + r.found, 0);
        const totalUpdated = Object.values(results).reduce((s, r) => s + r.updated, 0);

        return NextResponse.json({
            success: !overallErrors,
            message: dryRun
                ? `Dry-run: ${totalFound} order(s) would be migrated`
                : `Migration complete: ${totalUpdated} of ${totalFound} order(s) updated`,
            dryRun,
            results,
        });
    } catch (e) {
        console.error("[migrate] Error:", e);
        return NextResponse.json({ message: "BFF Network Error" }, { status: 502 });
    }
}
