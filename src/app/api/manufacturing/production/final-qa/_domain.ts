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

/**
 * Resolve a release's stored lot reference to the canonical master lot.
 * Older records may contain an inventory movement id in lot_id; that
 * reference is read for display only and is never returned as a write target.
 */
export async function resolveCanonicalLotId(storedLotId: number): Promise<number> {
    if (!Number.isSafeInteger(storedLotId) || storedLotId <= 0) return 0;

    const [masterLots, legacyMovements] = await Promise.all([
        directusCollection<DirectusLot>(
            `${DIRECTUS_URL}/items/lots?filter[lot_id][_eq]=${storedLotId}&fields=lot_id,lot_name&limit=1`,
            "Master lot lookup"
        ),
        directusCollection<DirectusMovement>(
            `${DIRECTUS_URL}/items/inventory_movements?filter[movement_id][_eq]=${storedLotId}&fields=movement_id,lot_id&limit=1`,
            "Legacy lot reference lookup"
        )
    ]);

    const movementLotId = relationId(legacyMovements[0]?.lot_id, ["lot_id", "id"]);
    if (movementLotId > 0 && movementLotId !== storedLotId) return movementLotId;

    const masterLot = masterLots[0] || null;
    if (masterLot && relationId(masterLot.lot_id, ["lot_id", "id"]) === storedLotId) {
        return storedLotId;
    }
    if (movementLotId > 0) return movementLotId;

    return relationId(legacyMovements[0]?.lot_id, ["lot_id", "id"]);
}

export async function normalizeFinalQARelease(release: FinalQAReleaseRecord) {
    const storedLotId = relationId(release.lot_id, ["lot_id", "id"]);
    const canonicalLotId = await resolveCanonicalLotId(storedLotId);
    const finalReleaseId = relationId(release.final_release_id ?? release.id, ["final_release_id", "id"]);

    return {
        ...release,
        final_release_id: finalReleaseId || release.final_release_id || release.id,
        stored_lot_id: storedLotId || null,
        canonical_lot_id: canonicalLotId || null,
        is_legacy_lot_reference: Boolean(storedLotId > 0 && canonicalLotId > 0 && storedLotId !== canonicalLotId)
    };
}
