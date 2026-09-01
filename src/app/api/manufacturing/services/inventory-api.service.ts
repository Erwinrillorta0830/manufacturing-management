// VOS ERP - Inventory & Customer Master Directus API Service

import { DIRECTUS_URL, headers } from "./core-api.service";

export {
    createCustomer,
    deleteCustomer,
    fetchCustomers,
    updateCustomer,
    type CustomerAuditContext,
    type CustomerProfilePayload,
    CustomerUnauthorizedError
} from "./customer-api.service";

/**
 * Fetch all registered store types.
 */
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

/**
 * Create a new store type record.
 */
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

/**
 * Fetch all registered payment terms.
 */
export async function fetchPaymentTerms(): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/payment_terms?limit=-1&sort=payment_name`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch payment terms:", e);
        return [];
    }
}

/**
 * Fetch all registered density factors.
 */
export async function fetchDensityFactors(): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/density_factors?limit=-1&sort=name&filter[isActive][_neq]=false`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch density factors:", e);
        return [];
    }
}

/**
 * Create a new density factor.
 */
export async function createDensityFactor(payload: {
    name: string;
    density: number;
    description?: string;
    is_system?: boolean;
}): Promise<unknown> {
    try {
        const url = `${DIRECTUS_URL}/items/density_factors`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                ...payload,
                is_system: !!payload.is_system,
                isActive: true
            })
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            const errMsg = body.errors?.[0]?.message || `Directus failed: ${res.status}`;
            throw new Error(errMsg);
        }
        return (await res.json()).data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create density factor:", e);
        throw e;
    }
}

/**
 * Delete a density factor by ID.
 */
export async function deleteDensityFactor(id: number | string): Promise<boolean> {
    try {
        const url = `${DIRECTUS_URL}/items/density_factors/${id}`;
        const res = await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ isActive: false })
        });
        return res.ok;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to delete density factor:", e);
        return false;
    }
}
