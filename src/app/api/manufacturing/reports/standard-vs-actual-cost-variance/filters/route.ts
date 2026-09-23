import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { authorizeStandardVsActualCostVarianceReport } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DirectusRow = Record<string, unknown>;

async function fetchRows<T extends DirectusRow>(collection: string, fields: string): Promise<T[]> {
    const rows: T[] = [];
    let offset = 0;
    let totalCount: number | null = null;

    do {
        const params = new URLSearchParams({
            fields,
            limit: "100",
            offset: String(offset),
            meta: "filter_count"
        });
        const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params.toString()}`, {
            headers,
            cache: "no-store"
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(payload?.data)) {
            throw new Error(`${collection} filter options lookup failed with HTTP ${response.status}.`);
        }

        rows.push(...payload.data as T[]);
        const count = Number(payload.meta?.filter_count);
        if (Number.isFinite(count)) totalCount = count;
        offset += payload.data.length;
        if (payload.data.length === 0 || (totalCount !== null ? offset >= totalCount : payload.data.length < 100)) break;
    } while (true);

    return rows;
}

function positiveId(value: unknown): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

export async function GET() {
    const access = await authorizeStandardVsActualCostVarianceReport();
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

    try {
        const [branches, products] = await Promise.all([
            fetchRows("branches", "id,branch_name"),
            fetchRows("products", "product_id,product_name,product_code")
        ]);
        return NextResponse.json({
            data: {
                branches: branches.map((branch) => ({
                    id: positiveId(branch.id),
                    label: String(branch.branch_name || `Branch #${positiveId(branch.id)}`)
                })).filter((option) => option.id > 0).sort((left, right) => left.label.localeCompare(right.label)),
                products: products.map((product) => {
                    const id = positiveId(product.product_id);
                    return {
                        id,
                        label: `${String(product.product_name || `Product #${id}`)}${product.product_code ? ` · ${String(product.product_code)}` : ""}`
                    };
                }).filter((option) => option.id > 0).sort((left, right) => left.label.localeCompare(right.label))
            }
        });
    } catch (error) {
        console.error("[Standard vs Actual Cost Variance] Failed to load filter options:", error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : "Failed to load cost report filter options."
        }, { status: 503 });
    }
}
