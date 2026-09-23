import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

type DirectusRow = Record<string, unknown>;
export interface LaborEfficiencyFilterOptions {
    branches: Array<{ id: number; label: string }>;
    products: Array<{ id: number; label: string }>;
}

const FILTER_OPTIONS_TTL_MS = 5 * 60 * 1000;
let cachedOptions: { expiresAt: number; data: LaborEfficiencyFilterOptions } | null = null;
let pendingOptions: Promise<LaborEfficiencyFilterOptions> | null = null;

async function fetchRows(collection: string, fields: string): Promise<DirectusRow[]> {
    const rows: DirectusRow[] = [];
    let offset = 0;
    while (true) {
        const params = new URLSearchParams({ fields, limit: "100", offset: String(offset) });
        const response = await fetch(`${DIRECTUS_URL}/items/${collection}?${params.toString()}`, { headers, cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(payload?.data)) throw new Error(`${collection} filter lookup failed with HTTP ${response.status}.`);
        rows.push(...payload.data as DirectusRow[]);
        offset += payload.data.length;
        if (payload.data.length < 100) break;
    }
    return rows;
}

function positiveId(value: unknown): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

export async function getLaborEfficiencyFilterOptions(): Promise<LaborEfficiencyFilterOptions> {
    if (cachedOptions && cachedOptions.expiresAt > Date.now()) return cachedOptions.data;
    try {
        pendingOptions ??= Promise.all([
            fetchRows("branches", "id,branch_name"),
            fetchRows("products", "product_id,product_name,product_code")
        ]).then(([branches, products]) => ({
            branches: branches.map((row) => ({ id: positiveId(row.id), label: String(row.branch_name || `Branch #${positiveId(row.id)}`) }))
                .filter((row) => row.id > 0).sort((left, right) => left.label.localeCompare(right.label)),
            products: products.map((row) => {
                const id = positiveId(row.product_id);
                const code = String(row.product_code || "").trim();
                return { id, label: `${String(row.product_name || `Product #${id}`)}${code ? ` · ${code}` : ""}` };
            }).filter((row) => row.id > 0).sort((left, right) => left.label.localeCompare(right.label))
        }));
        const data = await pendingOptions;
        cachedOptions = { data, expiresAt: Date.now() + FILTER_OPTIONS_TTL_MS };
        return data;
    } finally {
        pendingOptions = null;
    }
}
