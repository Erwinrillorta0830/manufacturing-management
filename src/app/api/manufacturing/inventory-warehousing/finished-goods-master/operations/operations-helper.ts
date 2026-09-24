import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { DirectusOperation } from "@/modules/manufacturing-management/inventory-warehousing/finished-goods-master/types";


export async function fetchAllOperations(): Promise<DirectusOperation[]> {
    try {
        const url = `${DIRECTUS_URL}/items/manufacturing_operations?limit=-1&sort=operation_name`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed fetching operations:", e);
        return [];
    }
}

export async function createOperation(name: string): Promise<DirectusOperation | null> {
    try {
        const url = `${DIRECTUS_URL}/items/manufacturing_operations`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ operation_name: name })
        });
        if (!res.ok) return null;
        return (await res.json()).data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create manufacturing operation:", e);
        return null;
    }
}


