import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function fetchAllOverheadTypes(): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/overhead_types?fields=*,coa_id.*&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed fetching overhead types:", e);
        return [];
    }
}

export async function createOverheadType(data: { name: string; coa_id?: number | null; description?: string; created_by?: number | null }): Promise<unknown> {
    try {
        const url = `${DIRECTUS_URL}/items/overhead_types`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                overhead_name: data.name,
                coa_id: data.coa_id || null,
                description: data.description || null,
                created_by: data.created_by || null,
                created_at: new Date().toISOString()
            })
        });
        if (!res.ok) {
            const errTxt = await res.text();
            console.error("Directus createOverheadType error:", res.status, errTxt);
            return null;
        }
        return (await res.json()).data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create overhead type:", e);
        return null;
    }
}
