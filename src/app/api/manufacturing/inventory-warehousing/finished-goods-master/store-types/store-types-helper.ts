import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export async function fetchStoreTypes(): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/store_type?limit=-1&sort=store_type`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch store types:", e);
        return [];
    }
}

export async function createStoreType(name: string, userId: number): Promise<unknown> {
    try {
        const url = `${DIRECTUS_URL}/items/store_type`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                store_type: name,
                created_by: userId
            })
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            const errMsg = body.errors?.[0]?.message || `Directus failed: ${res.status}`;
            throw new Error(errMsg);
        }
        const json = await res.json();
        return json.data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create store type:", e);
        throw e;
    }
}


