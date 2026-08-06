import { DIRECTUS_URL, headers } from "../_directus";
import { 
    DirectusProductPerSupplier 
} from "@/modules/manufacturing-management/procurement/types";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";


interface DirectusRepresentative {
    id: number;
    supplier_id: number;
}
interface DirectusSup {
    id: number;
    isActive?: unknown;
    nonBuy?: unknown;
    [key: string]: unknown;
}
interface InputRepresentative {
    id?: number | string | null;
    first_name?: string;
    last_name?: string;
    middle_name?: string | null;
    suffix?: string | null;
    email?: string | null;
    contact_number?: string | null;
}

export type SupplierStatusFilter = "active" | "inactive" | "all";

function toBoolean(value: unknown): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
        return value === "1" || value.toLowerCase() === "true";
    }

    if (value && typeof value === "object") {
        const bufferValue = value as { data?: unknown };
        if (Array.isArray(bufferValue.data) && bufferValue.data.length > 0) {
            return Number(bufferValue.data[0]) !== 0;
        }
    }

    return false;
}

function cleanNotesText(notes: unknown): string {
    if (typeof notes !== "string") return "";
    return notes
        .replace(/\[Currency:\s*\w+\]/g, "")
        .replace(/\[Foreign:\s*\d+\]/g, "")
        .trim();
}

export function normalizeSupplier(supplier: DirectusSup): Record<string, unknown> {
    const isForeignBool = toBoolean(supplier.is_foreign ?? supplier.isForeign);
    const country = typeof supplier.country === "string" ? supplier.country : "";
    const isNonPH = Boolean(country) && country.toLowerCase() !== "philippines" && country.toLowerCase() !== "ph";
    const isUSD = String(supplier.default_currency || supplier.currency || "").toUpperCase() === "USD";

    const isForeignNum = (isForeignBool || isUSD || isNonPH || Number(supplier.is_foreign) === 1) ? 1 : 0;

    const resolvedCurrency = typeof supplier.currency === "string" && supplier.currency
        ? supplier.currency
        : (typeof supplier.default_currency === "string" && supplier.default_currency
            ? supplier.default_currency
            : (isForeignNum === 1 ? "USD" : "PHP"));

    return {
        ...supplier,
        isActive: toBoolean(supplier.isActive),
        nonBuy: toBoolean(supplier.nonBuy),
        is_foreign: isForeignNum,
        currency: resolvedCurrency,
        default_currency: resolvedCurrency,
        notes_or_comments: cleanNotesText(supplier.notes_or_comments)
    };
}

export async function fetchSuppliers(status: SupplierStatusFilter = "active"): Promise<unknown[]> {
    try {
        const statusFilter = status === "all"
            ? ""
            : `&filter[isActive][_eq]=${status === "active" ? "true" : "false"}`;
        const [supRes, repRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/suppliers?fields=id,supplier_name,supplier_shortcut,contact_person,email_address,phone_number,address,city,brgy,state_province,postal_code,country,supplier_type,tin_number,bank_details,payment_terms,delivery_terms,agreement_or_contract,preferred_communication_method,notes_or_comments,date_added,supplier_image,isActive,nonBuy,user_id,is_foreign,currency&sort=supplier_name&limit=-1${statusFilter}`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/suppliers_representative?limit=-1`, { headers, cache: "no-store" })
        ]);
        if (!supRes.ok) throw new Error("Failed to fetch suppliers");
        
        const supJson = await supRes.json();
        const repJson = repRes.ok ? await repRes.json() : { data: [] };
        
        const suppliers = (supJson.data || []) as DirectusSup[];
        const reps = (repJson.data || []) as DirectusRepresentative[];
        
        return suppliers.map((s) => ({
            ...normalizeSupplier(s),
            representatives: reps.filter((r) => Number(r.supplier_id) === Number(s.id))
        }));
    } catch (e) {
        console.error("[Manufacturing Directus API] Error fetching suppliers:", e);
        return [];
    }
}

export async function createSupplier(supplierData: Record<string, unknown>): Promise<unknown> {
    try {
        const url = `${DIRECTUS_URL}/items/suppliers`;
        const { representatives, ...details } = supplierData;
        
        const isForeignBool = toBoolean(details.is_foreign);
        const isUSD = String(details.default_currency || details.currency || "").toUpperCase() === "USD";
        const isNonPH = details.country && String(details.country).toLowerCase() !== "philippines" && String(details.country).toLowerCase() !== "ph";
        const finalIsForeign = (isForeignBool || isUSD || isNonPH) ? 1 : 0;
        const finalCurrency = String(details.currency || details.default_currency || (finalIsForeign === 1 ? "USD" : "PHP"));

        details.is_foreign = finalIsForeign;
        details.currency = finalCurrency;
        delete details.default_currency;
        details.nonBuy = toBoolean(details.nonBuy) ? 1 : 0;
        details.notes_or_comments = cleanNotesText(details.notes_or_comments);

        // Populate database-required fields that aren't exposed in the UI form
        const payload = {
            ...details,
            supplier_type: "TRADE",
            date_added: await getTodayDateString(),
            isActive: 1
        };

        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            let errorMsg = `Failed to create supplier: ${res.status}`;
            try {
                const errorJson = await res.json();
                if (errorJson.errors && errorJson.errors[0]?.message) {
                    errorMsg = errorJson.errors[0].message;
                }
            } catch {}
            throw new Error(errorMsg);
        }
        const createdSupplier = (await res.json()).data as { id: number };
        const supplierId = createdSupplier.id;

        // Create representatives
        if (representatives && Array.isArray(representatives)) {
            const repsList = representatives as InputRepresentative[];
            for (const rep of repsList) {
                await fetch(`${DIRECTUS_URL}/items/suppliers_representative`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        supplier_id: supplierId,
                        first_name: rep.first_name || "",
                        last_name: rep.last_name || "",
                        middle_name: rep.middle_name || null,
                        suffix: rep.suffix || null,
                        email: rep.email || null,
                        contact_number: rep.contact_number || null
                    })
                });
            }
        }

        return createdSupplier;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create supplier:", e);
        throw e;
    }
}
export async function updateSupplier(supplierId: number, supplierData: Record<string, unknown>): Promise<unknown> {
    try {
        const url = `${DIRECTUS_URL}/items/suppliers/${supplierId}`;
        const { representatives, ...details } = supplierData;

        const isForeignBool = toBoolean(details.is_foreign);
        const isUSD = String(details.default_currency || details.currency || "").toUpperCase() === "USD";
        const isNonPH = details.country && String(details.country).toLowerCase() !== "philippines" && String(details.country).toLowerCase() !== "ph";
        const finalIsForeign = (isForeignBool || isUSD || isNonPH) ? 1 : 0;
        const finalCurrency = String(details.currency || details.default_currency || (finalIsForeign === 1 ? "USD" : "PHP"));

        details.is_foreign = finalIsForeign;
        details.currency = finalCurrency;
        delete details.default_currency;
        details.nonBuy = toBoolean(details.nonBuy) ? 1 : 0;
        details.notes_or_comments = cleanNotesText(details.notes_or_comments);

        const res = await fetch(url, {
            method: "PATCH",
            headers,
            body: JSON.stringify(details)
        });
        if (!res.ok) {
            let errorMsg = `Failed to update supplier: ${res.status}`;
            try {
                const errorJson = await res.json();
                if (errorJson.errors && errorJson.errors[0]?.message) {
                    errorMsg = errorJson.errors[0].message;
                }
            } catch {}
            throw new Error(errorMsg);
        }
        const updatedSupplier = normalizeSupplier((await res.json()).data as DirectusSup);

        // Sync representatives
        if (representatives && Array.isArray(representatives)) {
            const repsList = representatives as InputRepresentative[];
            // Fetch existing representatives
            const getRes = await fetch(`${DIRECTUS_URL}/items/suppliers_representative?filter[supplier_id][_eq]=${supplierId}&limit=-1`, { headers });
            const existingReps = getRes.ok ? ((await getRes.json()).data || []) as { id: number }[] : [];
            const existingIds = existingReps.map((r) => Number(r.id));
            
            const incomingIds = repsList.filter((r) => r.id).map((r) => Number(r.id));
            
            // Delete removed ones
            const toDelete = existingIds.filter((id: number) => !incomingIds.includes(id));
            for (const id of toDelete) {
                await fetch(`${DIRECTUS_URL}/items/suppliers_representative/${id}`, {
                    method: "DELETE",
                    headers
                });
            }
            
            // Create or update incoming ones
            for (const rep of repsList) {
                const repPayload = {
                    supplier_id: supplierId,
                    first_name: rep.first_name || "",
                    last_name: rep.last_name || "",
                    middle_name: rep.middle_name || null,
                    suffix: rep.suffix || null,
                    email: rep.email || null,
                    contact_number: rep.contact_number || null
                };
                
                if (rep.id) {
                    // Update
                    await fetch(`${DIRECTUS_URL}/items/suppliers_representative/${rep.id}`, {
                        method: "PATCH",
                        headers,
                        body: JSON.stringify(repPayload)
                    });
                } else {
                    // Create
                    await fetch(`${DIRECTUS_URL}/items/suppliers_representative`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(repPayload)
                    });
                }
            }
        }

        return updatedSupplier;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to update supplier:", e);
        throw e;
    }
}


export async function fetchProductsBySupplier(supplierId: number): Promise<DirectusProductPerSupplier[]> {
    try {
        const url = `${DIRECTUS_URL}/items/product_per_supplier?filter[supplier_id][_eq]=${supplierId}&fields=id,supplier_id,discount_type.*,product_id.*,product_id.unit_of_measurement.*&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch products for supplier");
        const json = await res.json();
        return json.data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Error fetching products for supplier:", e);
        return [];
    }
}



