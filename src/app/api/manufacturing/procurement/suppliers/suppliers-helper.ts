import { DIRECTUS_URL, headers } from "../_directus";
import { 
    DirectusProductPerSupplier 
} from "@/modules/manufacturing-management/procurement/types";
import {
    PHILIPPINES_COUNTRY,
    canonicalizeSupplierCountry,
    isForeignCountry,
    normalizeSupplierCountry
} from "@/modules/manufacturing-management/procurement/supplier-country";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";
import { getConfiguredActiveForexRates } from "../forex/_rates";


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

export class SupplierCurrencyValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "SupplierCurrencyValidationError";
    }
}

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

interface ResolvedSupplierCurrency {
    currency: string;
    isForeign: 0 | 1;
}

async function resolveSupplierCurrency(
    details: Record<string, unknown>,
    country: string
): Promise<ResolvedSupplierCurrency> {
    const rawCurrency = String(details.currency || details.default_currency || "").trim().toUpperCase();
    const isForeignRequested = toBoolean(details.is_foreign) || isForeignCountry(country) || (rawCurrency !== "" && rawCurrency !== "PHP");
    const currency = rawCurrency || (isForeignRequested ? "" : "PHP");

    if (isForeignRequested && (!currency || currency === "PHP")) {
        throw new SupplierCurrencyValidationError("A foreign supplier requires an active non-PHP currency.");
    }

    if (currency !== "PHP") {
        const activeRates = await getConfiguredActiveForexRates();
        const activeCurrencyCodes = new Set(
            activeRates.map(rate => rate.currency_code.trim().toUpperCase())
        );

        if (!activeCurrencyCodes.has(currency)) {
            throw new SupplierCurrencyValidationError(`${currency} is not an active currency in forex_configurations.`);
        }
    }

    return {
        currency,
        isForeign: currency === "PHP" ? 0 : 1
    };
}

export function normalizeSupplier(supplier: DirectusSup): Record<string, unknown> {
    const isForeignBool = toBoolean(supplier.is_foreign ?? supplier.isForeign);
    const rawCountry = typeof supplier.country === "string" ? supplier.country : "";
    const country = normalizeSupplierCountry(rawCountry) || (rawCountry.trim() ? rawCountry : PHILIPPINES_COUNTRY);
    const isNonPH = isForeignCountry(country);
    const rawCurrency = String(supplier.currency || supplier.default_currency || "").trim().toUpperCase();
    const isForeignNum = (isForeignBool || isNonPH || rawCurrency !== "" && rawCurrency !== "PHP" || Number(supplier.is_foreign) === 1) ? 1 : 0;
    const resolvedCurrency = rawCurrency || (isForeignNum === 1 ? "" : "PHP");

    return {
        ...supplier,
        isActive: toBoolean(supplier.isActive),
        nonBuy: toBoolean(supplier.nonBuy),
        country,
        is_foreign: isForeignNum,
        currency: resolvedCurrency || undefined,
        default_currency: resolvedCurrency || undefined,
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
        const hasIsActive = Object.prototype.hasOwnProperty.call(details, "isActive");
        const country = canonicalizeSupplierCountry(details.country);
        details.country = country;
        const resolved = await resolveSupplierCurrency(details, country);

        details.is_foreign = resolved.isForeign;
        details.currency = resolved.currency;
        delete details.default_currency;
        details.nonBuy = toBoolean(details.nonBuy) ? 1 : 0;
        details.notes_or_comments = cleanNotesText(details.notes_or_comments);

        // Populate database-required fields that aren't exposed in the UI form
        const payload = {
            ...details,
            supplier_type: "TRADE",
            date_added: await getTodayDateString(),
            isActive: hasIsActive && !toBoolean(details.isActive) ? 0 : 1
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
        const hasCountry = Object.prototype.hasOwnProperty.call(details, "country");
        const hasForeign = Object.prototype.hasOwnProperty.call(details, "is_foreign");
        const hasCurrency = Object.prototype.hasOwnProperty.call(details, "currency");
        const hasDefaultCurrency = Object.prototype.hasOwnProperty.call(details, "default_currency");
        const country = hasCountry ? canonicalizeSupplierCountry(details.country) : undefined;
        if (hasCountry) details.country = country;

        if (hasCountry || hasForeign || hasCurrency || hasDefaultCurrency) {
            if (!hasCurrency && !hasDefaultCurrency) {
                const existingRes = await fetch(`${url}?fields=country,is_foreign,currency`, { headers, cache: "no-store" });
                if (existingRes.ok) {
                    const existing = (await existingRes.json()).data as Record<string, unknown> | undefined;
                    if (existing) {
                        if (!hasCountry && existing.country !== undefined) details.country = existing.country;
                        if (!hasForeign && existing.is_foreign !== undefined) details.is_foreign = existing.is_foreign;
                        if (existing.currency !== undefined) details.currency = existing.currency;
                    }
                }
            }

            const resolved = await resolveSupplierCurrency(details, String(details.country || PHILIPPINES_COUNTRY));
            details.is_foreign = resolved.isForeign;
            details.currency = resolved.currency;
            delete details.default_currency;
        }

        if (Object.prototype.hasOwnProperty.call(details, "isActive")) {
            details.isActive = toBoolean(details.isActive) ? 1 : 0;
        }
        if (Object.prototype.hasOwnProperty.call(details, "nonBuy")) {
            details.nonBuy = toBoolean(details.nonBuy) ? 1 : 0;
        }
        if (Object.prototype.hasOwnProperty.call(details, "notes_or_comments")) {
            details.notes_or_comments = cleanNotesText(details.notes_or_comments);
        }

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



