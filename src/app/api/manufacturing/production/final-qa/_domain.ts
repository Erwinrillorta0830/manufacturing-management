import { loadMmLots } from "@/app/api/manufacturing/services/mm-lots.service";

export const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
export const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";

export const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

export interface FinalQAReleaseRecord extends Record<string, unknown> {
    final_release_id?: unknown;
    id?: unknown;
    job_order_id?: unknown;
    mm_lot_id?: unknown;
    lot_id?: unknown;
}

export interface DirectusJobOrder {
    job_order_id?: unknown;
    job_order_no?: unknown;
    product_id?: unknown;
    branch_id?: unknown;
}

export interface DirectusMovement {
    movement_id?: unknown;
    lot_id?: unknown;
    product_id?: unknown;
    branch_id?: unknown;
    transaction_type_id?: unknown;
    quantity?: unknown;
    source_document_id?: unknown;
    source_document_no?: unknown;
    batch_no?: unknown;
    expiry_date?: unknown;
    manufacturing_date?: unknown;
    created_at?: unknown;
    remarks?: unknown;
    version_id?: unknown;
}

export interface DirectusLot {
    lot_id?: unknown;
    lot_name?: unknown;
    branch_id?: unknown;
}

export function relationId(value: unknown, keys: string[] = ["id"]): number {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        for (const key of keys) {
            const candidate = Number(record[key]);
            if (Number.isSafeInteger(candidate) && candidate > 0) return candidate;
        }
        return 0;
    }

    const candidate = Number(value ?? 0);
    return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : 0;
}

export async function directusRecord<T>(url: string, description: string): Promise<T | null> {
    const response = await fetch(url, { headers, cache: "no-store" });
    if (response.status === 404) return null;
    if (!response.ok) {
        throw new Error(`${description} failed with HTTP ${response.status}: ${await response.text()}`);
    }
    const json = await response.json();
    return (json.data ?? null) as T | null;
}

export async function directusCollection<T>(url: string, description: string): Promise<T[]> {
    const response = await fetch(url, { headers, cache: "no-store" });
    if (!response.ok) {
        throw new Error(`${description} failed with HTTP ${response.status}: ${await response.text()}`);
    }
    const json = await response.json();
    return Array.isArray(json.data) ? json.data as T[] : [];
}

export async function resolveCanonicalLotId(storedLotId: number): Promise<number> {
    if (!Number.isSafeInteger(storedLotId) || storedLotId <= 0) return 0;
    const masterLots = await loadMmLots({ onlyActive: false });
    return masterLots.some((lot) => relationId(lot.lot_id, ["lot_id", "id"]) === storedLotId)
        ? storedLotId
        : 0;
}

export async function normalizeFinalQARelease(release: FinalQAReleaseRecord) {
    const storedLotId = relationId(release.mm_lot_id, ["lot_id", "id"]);
    const historicalLotId = relationId(release.lot_id, ["lot_id", "id"]);
    const canonicalLotId = await resolveCanonicalLotId(storedLotId);
    const finalReleaseId = relationId(release.final_release_id ?? release.id, ["final_release_id", "id"]);

    return {
        ...release,
        final_release_id: finalReleaseId || release.final_release_id || release.id,
        stored_lot_id: storedLotId || historicalLotId || null,
        mm_lot_id: storedLotId || null,
        lot_id: null,
        canonical_lot_id: canonicalLotId || null,
        is_legacy_lot_reference: Boolean(!storedLotId && historicalLotId > 0)
    };
}
