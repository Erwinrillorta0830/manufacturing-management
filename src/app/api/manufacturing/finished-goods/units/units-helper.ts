import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { DirectusUnit } from "@/modules/manufacturing-management/finished-goods/types";
import { getDensityRequirement } from "@/modules/manufacturing-management/procurement/raw-materials/density-policy";

export async function fetchAllUnits(): Promise<DirectusUnit[]> {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/units?limit=-1`, { headers, next: { revalidate: 60 } });
        if (!res.ok) throw new Error(`Directus failed to fetch units: ${res.status}`);
        const json = await res.json();
        return (json.data || []).map((unit: DirectusUnit) => ({
            ...unit,
            density_required: getDensityRequirement(unit)
        }));
    } catch (error) {
        console.error("[Manufacturing Directus API] Error fetching units:", error);
        return [];
    }
}


