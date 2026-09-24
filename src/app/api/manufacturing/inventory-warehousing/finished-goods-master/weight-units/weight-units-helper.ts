import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export interface DirectusWeightUnit {
    id: number;
    code: string;
    name: string;
    is_active?: boolean | number;
}

const SEED_WEIGHT_UNITS: Array<Omit<DirectusWeightUnit, "id">> = [
    { code: "kg", name: "Kilogram", is_active: 1 },
    { code: "g", name: "Gram", is_active: 1 },
    { code: "mg", name: "Milligram", is_active: 1 },
    { code: "mcg", name: "Microgram", is_active: 1 },
    { code: "lb", name: "Pound", is_active: 1 },
    { code: "oz", name: "Ounce", is_active: 1 },
    { code: "t", name: "Metric Ton (Tonne)", is_active: 1 },
    { code: "st_ton", name: "Short Ton (US)", is_active: 1 },
    { code: "lt_ton", name: "Long Ton (UK)", is_active: 1 },
    { code: "st", name: "Stone", is_active: 1 },
    { code: "ct", name: "Carat", is_active: 1 },
    { code: "gr", name: "Grain", is_active: 1 },
    { code: "dr", name: "Dram", is_active: 1 },
    { code: "dwt", name: "Pennyweight", is_active: 1 },
    { code: "oz_t", name: "Troy Ounce", is_active: 1 },
    { code: "lb_t", name: "Troy Pound", is_active: 1 },
    { code: "cwt", name: "Hundredweight", is_active: 1 }
];

export async function ensureWeightUnitCollectionExists(): Promise<void> {
    try {
        const checkRes = await fetch(`${DIRECTUS_URL}/collections/weight_unit`, { headers, cache: "no-store" });
        if (!checkRes.ok) {
            console.log("[weight_unit] Creating weight_unit collection in Directus...");
            await fetch(`${DIRECTUS_URL}/collections`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    collection: "weight_unit",
                    schema: { name: "weight_unit" },
                    meta: { icon: "scale", display_template: "{{code}} - {{name}}" },
                    fields: [
                        {
                            field: "id",
                            type: "integer",
                            meta: { hidden: false, interface: "input" },
                            schema: { is_primary_key: true, has_auto_increment: true }
                        },
                        {
                            field: "code",
                            type: "string",
                            meta: { interface: "input" },
                            schema: { is_nullable: false, max_length: 20 }
                        },
                        {
                            field: "name",
                            type: "string",
                            meta: { interface: "input" },
                            schema: { is_nullable: false, max_length: 60 }
                        },
                        {
                            field: "is_active",
                            type: "boolean",
                            meta: { interface: "boolean" },
                            schema: { default_value: true }
                        }
                    ]
                })
            }).catch(e => console.error("[weight_unit] Collection create call error:", e));
        }
    } catch (e) {
        console.error("[weight_unit] Error checking/creating collection:", e);
    }
}

export async function fetchAllWeightUnits(): Promise<DirectusWeightUnit[]> {
    try {
        await ensureWeightUnitCollectionExists();

        const res = await fetch(`${DIRECTUS_URL}/items/weight_unit?limit=-1&sort=code`, { headers, cache: "no-store" });
        if (res.ok) {
            const json = await res.json();
            const data = (json.data || []) as DirectusWeightUnit[];
            if (data.length > 0) {
                return data;
            }
        }

        // If collection exists but is empty, seed initial units
        console.log("[weight_unit] Seeding initial weight units into Directus...");
        const seeded: DirectusWeightUnit[] = [];
        for (const unit of SEED_WEIGHT_UNITS) {
            try {
                const seedRes = await fetch(`${DIRECTUS_URL}/items/weight_unit`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(unit)
                });
                if (seedRes.ok) {
                    const seedJson = await seedRes.json();
                    if (seedJson.data) seeded.push(seedJson.data);
                }
            } catch (e) {
                console.error(`[weight_unit] Failed to seed unit ${unit.code}:`, e);
            }
        }

        if (seeded.length > 0) {
            return seeded;
        }

        // Final re-fetch attempt
        const refetchRes = await fetch(`${DIRECTUS_URL}/items/weight_unit?limit=-1&sort=code`, { headers, cache: "no-store" });
        if (refetchRes.ok) {
            const json = await refetchRes.json();
            if (json.data && json.data.length > 0) return json.data;
        }

        return SEED_WEIGHT_UNITS.map((u, idx) => ({ id: idx + 1, ...u }));
    } catch (error) {
        console.error("[Manufacturing Directus API] Error fetching weight units:", error);
        return SEED_WEIGHT_UNITS.map((u, idx) => ({ id: idx + 1, ...u }));
    }
}

export async function verifyOrGetValidWeightUnitId(proposedId: number | null | undefined): Promise<number | null> {
    if (!proposedId) return null;
    const units = await fetchAllWeightUnits();
    const existing = units.find(u => Number(u.id) === Number(proposedId));
    if (existing) {
        return Number(existing.id);
    }
    if (units.length > 0) {
        console.warn(`[weight_unit] proposedId ${proposedId} not found in Directus weight_unit collection. Using fallback ${units[0].id} (${units[0].code})`);
        return Number(units[0].id);
    }
    return null;
}
