import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { authorizeProductionOutputVarianceReport } from "../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DirectusRow = Record<string, unknown>;

function asRecord(value: unknown): DirectusRow | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as DirectusRow
        : null;
}

function relationId(value: unknown, keys: string[]): number {
    const record = asRecord(value);
    const raw = record
        ? keys.map((key) => record[key]).find((candidate) => candidate !== undefined && candidate !== null)
        : value;
    const parsed = Number(raw || 0);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

export async function GET() {
    const access = await authorizeProductionOutputVarianceReport();
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    try {
        const params = new URLSearchParams({
            fields: "status,product_id.product_id,product_id.product_name,product_id.product_code,branch_id.id,branch_id.branch_name",
            limit: "-1"
        });
        const response = await fetch(`${DIRECTUS_URL}/items/manufacturing_job_orders?${params.toString()}`, {
            headers,
            next: { revalidate: 60 }
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(payload?.data)) {
            throw new Error(`Job Order filter options lookup failed with HTTP ${response.status}.`);
        }

        const products = new Map<number, string>();
        const branches = new Map<number, string>();
        const statuses = new Set<string>();
        for (const rawJobOrder of payload.data as DirectusRow[]) {
            const jobOrder = asRecord(rawJobOrder) || {};
            const product = asRecord(jobOrder.product_id);
            const productId = relationId(jobOrder.product_id, ["product_id", "id"]);
            const productName = String(product?.product_name || `Product #${productId}`);
            const productCode = String(product?.product_code || "");
            products.set(productId, `${productName}${productCode ? ` (${productCode})` : ""}`);

            const branch = asRecord(jobOrder.branch_id);
            const branchId = relationId(jobOrder.branch_id, ["id", "branch_id"]);
            if (branchId) branches.set(branchId, String(branch?.branch_name || `Branch #${branchId}`));
            statuses.add(String(jobOrder.status || "Unknown"));
        }

        return NextResponse.json({
            data: {
                branches: [...branches].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)),
                products: [...products].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label)),
                statuses: [...statuses].sort()
            }
        });
    } catch (error) {
        console.error("[Production Output & Variance Report] Failed to load filter options:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load report filter options." }, { status: 503 });
    }
}
