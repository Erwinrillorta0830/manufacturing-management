import { getManilaTimeString, getUserIdFromToken } from "@/app/api/manufacturing/item-management/auth-helper";
import {
    positiveInteger,
    trimmedString,
    validateCustomerProfileFields
} from "@/modules/manufacturing-management/clients/customer-profile-validation";
import { DIRECTUS_URL, headers } from "./core-api.service";

const CUSTOMER_COLLECTION = "customer";
const CUSTOMER_READ_FIELDS = [
    "*",
    "store_signage",
    "tel_number",
    "bank_details",
    "price_type_id",
    "price_type_id.price_type_id",
    "price_type_id.price_type_name",
    "price_type_id.is_active",
    "price_type",
    "otherDetails",
    "updated_by",
    "updated_at",
    "updated_by.user_id",
    "updated_by.user_fname",
    "updated_by.user_mname",
    "updated_by.user_lname",
    "updated_by.user_email"
].join(",");

const CUSTOMER_PROFILE_FIELDS = [
    "customer_code",
    "customer_name",
    "customer_tin",
    "customer_email",
    "store_name",
    "store_signage",
    "tel_number",
    "bank_details",
    "price_type_id",
    "otherDetails",
    "store_type",
    "payment_term",
    "brgy",
    "city",
    "province",
    "isActive",
    "latitude",
    "longitude"
] as const;

export interface CustomerAuditContext {
    userId: number;
    updatedAt: string;
}

export interface CustomerProfilePayload {
    customer_code?: string;
    customer_name?: string;
    customer_tin?: string | null;
    customer_email?: string | null;
    store_name?: string | null;
    store_signage?: string | null;
    tel_number?: string | null;
    bank_details?: string | null;
    price_type_id?: number | string | null;
    otherDetails?: string | null;
    store_type?: number | null;
    payment_term?: number | null;
    brgy?: string | null;
    city?: string | null;
    province?: string | null;
    isActive?: number | boolean | null;
    latitude?: number | null;
    longitude?: number | null;
}

export class CustomerUnauthorizedError extends Error {
    constructor() {
        super("Authentication is required.");
        this.name = "CustomerUnauthorizedError";
    }
}

export class CustomerNotFoundError extends Error {
    constructor() {
        super("Customer was not found.");
        this.name = "CustomerNotFoundError";
    }
}

export class CustomerProfileValidationError extends Error {
    readonly fields: Record<string, string>;

    constructor(fields: Record<string, string>) {
        super("Customer profile validation failed.");
        this.name = "CustomerProfileValidationError";
        this.fields = fields;
    }
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as UnknownRecord
        : null;
}

function nonEmptyString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function relationUserId(value: unknown): number | null {
    if (value !== null && typeof value === "object") {
        const relation = value as UnknownRecord;
        return positiveInteger(relation.user_id ?? relation.id);
    }
    return positiveInteger(value);
}

function relationUserName(value: unknown, userId: number | null): string | null {
    if (value !== null && typeof value === "object") {
        const relation = value as UnknownRecord;
        const fullName = [relation.user_fname, relation.user_mname, relation.user_lname]
            .map(nonEmptyString)
            .filter((part): part is string => part !== null)
            .join(" ");
        if (fullName) return fullName;

        const email = nonEmptyString(relation.user_email);
        if (email) return email;
    }

    return userId ? `User #${userId}` : null;
}

export function normalizeCustomer(value: unknown): UnknownRecord {
    const customer = asRecord(value) || {};
    const updatedBy = relationUserId(customer.updated_by);
    const updatedAt = typeof customer.updated_at === "string" ? customer.updated_at : null;
    const priceTypeRelation = asRecord(customer.price_type_id);
    const priceTypeId = relationUserId(priceTypeRelation?.price_type_id ?? customer.price_type_id);
    const priceTypeName = nonEmptyString(priceTypeRelation?.price_type_name)
        || nonEmptyString(customer.price_type)
        || null;

    return {
        ...customer,
        price_type_id: priceTypeId,
        price_type_name: priceTypeName,
        updated_by: updatedBy,
        updated_at: updatedAt,
        updated_by_name: relationUserName(customer.updated_by, updatedBy)
    };
}

function pickProfilePayload(value: CustomerProfilePayload | UnknownRecord): UnknownRecord {
    const input = asRecord(value) || {};
    return Object.fromEntries(
        CUSTOMER_PROFILE_FIELDS
            .filter(field => Object.prototype.hasOwnProperty.call(input, field))
            .map(field => [field, input[field]])
    );
}

const STRING_PROFILE_FIELDS = [
    "customer_code",
    "customer_name",
    "customer_tin",
    "customer_email",
    "store_name",
    "store_signage",
    "tel_number",
    "bank_details",
    "otherDetails",
    "brgy",
    "city",
    "province"
] as const;

function normalizeProfilePayload(value: CustomerProfilePayload | UnknownRecord): UnknownRecord {
    const profile = pickProfilePayload(value);
    for (const field of STRING_PROFILE_FIELDS) {
        if (typeof profile[field] === "string") profile[field] = profile[field].trim();
    }
    return profile;
}

function customerValidationErrors(profile: UnknownRecord): Record<string, string> {
    const errors = validateCustomerProfileFields(profile);
    if (!trimmedString(profile.customer_code)) errors.customer_code = "Customer Code is required.";
    if (!trimmedString(profile.customer_name)) errors.customer_name = "Customer Name is required.";
    return errors;
}

function throwIfInvalidCustomerProfile(profile: UnknownRecord): void {
    const errors = customerValidationErrors(profile);
    if (Object.keys(errors).length > 0) throw new CustomerProfileValidationError(errors);
}

type ResolvedPriceType = { price_type_id: number; price_type_name: string };

async function resolveActivePriceType(value: unknown): Promise<ResolvedPriceType> {
    const priceTypeId = positiveInteger(value);
    if (!priceTypeId) {
        throw new CustomerProfileValidationError({
            price_type_id: "Price Type must be a valid active price-template ID."
        });
    }

    const params = new URLSearchParams({
        "filter[price_type_id][_eq]": String(priceTypeId),
        "filter[is_active][_eq]": "1",
        fields: "price_type_id,price_type_name,is_active",
        limit: "1"
    });
    const response = await fetch(`${DIRECTUS_URL}/items/price_types?${params.toString()}`, {
        headers,
        cache: "no-store"
    });

    if (!response.ok) {
        throw new Error(`Unable to verify the selected Price Type (${response.status}).`);
    }

    const body = await response.json().catch(() => ({}));
    const row = Array.isArray(body?.data) ? asRecord(body.data[0]) : null;
    const activeValue = row?.is_active;
    const isActive = activeValue === true || activeValue === 1 || activeValue === "1"
        || (typeof activeValue === "string" && activeValue.trim().toLowerCase() === "true");
    const name = nonEmptyString(row?.price_type_name);
    if (!row || !isActive || !name || positiveInteger(row.price_type_id) !== priceTypeId) {
        throw new CustomerProfileValidationError({
            price_type_id: "Select an active Price Type template."
        });
    }

    return { price_type_id: priceTypeId, price_type_name: name };
}

async function fetchCustomerById(id: number | string): Promise<UnknownRecord> {
    const response = await fetch(
        `${DIRECTUS_URL}/items/${CUSTOMER_COLLECTION}/${encodeURIComponent(String(id))}?fields=${encodeURIComponent(CUSTOMER_READ_FIELDS)}`,
        { headers, cache: "no-store" }
    );
    if (response.status === 404) throw new CustomerNotFoundError();
    if (!response.ok) throw new Error(`Unable to load the customer profile (${response.status}).`);

    const body = await response.json().catch(() => ({}));
    const customer = asRecord(body?.data);
    if (!customer) throw new CustomerNotFoundError();
    return normalizeCustomer(customer);
}

function validAuditTimestamp(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/.test(value);
}

async function activeDirectusUser(userId: number): Promise<boolean> {
    const params = new URLSearchParams({ fields: "user_id,is_deleted", limit: "1" });
    const response = await fetch(
        `${DIRECTUS_URL}/items/user/${encodeURIComponent(String(userId))}?${params.toString()}`,
        { headers, cache: "no-store" }
    );

    if (response.status === 404) return false;
    if (!response.ok) {
        throw new Error(`Unable to verify the current user in Directus (${response.status}).`);
    }

    const body = await response.json().catch(() => ({}));
    const user = asRecord(body?.data);
    if (positiveInteger(user?.user_id) !== userId) return false;

    const deleted = user?.is_deleted ?? user?.isDeleted;
    return deleted !== true && deleted !== 1 && deleted !== "1" && deleted !== "true";
}

export async function getCustomerAuditContext(): Promise<CustomerAuditContext | null> {
    const userId = await getUserIdFromToken();
    if (!userId || !(await activeDirectusUser(userId))) return null;

    const updatedAt = await getManilaTimeString();
    if (!validAuditTimestamp(updatedAt)) {
        throw new Error("The server generated an invalid customer audit timestamp.");
    }

    return { userId, updatedAt };
}

async function requireAuditContext(context?: CustomerAuditContext): Promise<CustomerAuditContext> {
    const resolved = context || await getCustomerAuditContext();
    if (!resolved) throw new CustomerUnauthorizedError();
    if (!Number.isSafeInteger(resolved.userId) || resolved.userId <= 0 || !validAuditTimestamp(resolved.updatedAt)) {
        throw new Error("The customer audit context is invalid.");
    }
    return resolved;
}

async function directusMutation(pathname: string, method: "POST" | "PATCH", body: UnknownRecord): Promise<unknown> {
    const response = await fetch(`${DIRECTUS_URL}${pathname}`, {
        method,
        headers,
        body: JSON.stringify(body),
        cache: "no-store"
    });
    const responseText = await response.text();
    let responseBody: UnknownRecord = {};
    if (responseText) {
        try {
            responseBody = JSON.parse(responseText) as UnknownRecord;
        } catch {
            responseBody = {};
        }
    }

    if (!response.ok) {
        const errors = responseBody.errors;
        const firstError = Array.isArray(errors) ? asRecord(errors[0]) : null;
        const message = nonEmptyString(firstError?.message) || `Directus failed: ${response.status}`;
        throw new Error(message);
    }

    return responseBody.data;
}

export async function fetchCustomers(search?: string, includeInactive = false): Promise<UnknownRecord[]> {
    try {
        const params = new URLSearchParams({
            limit: "250",
            sort: "customer_name",
            fields: CUSTOMER_READ_FIELDS
        });
        if (!includeInactive) params.set("filter[isActive][_eq]", "true");
        if (search && search.trim()) params.set("search", search.trim());

        const response = await fetch(`${DIRECTUS_URL}/items/${CUSTOMER_COLLECTION}?${params.toString()}`, {
            headers,
            cache: "no-store"
        });
        if (!response.ok) return [];

        const body = await response.json().catch(() => ({}));
        return Array.isArray(body?.data) ? body.data.map(normalizeCustomer) : [];
    } catch (error) {
        console.error("[Manufacturing Directus API] Failed to fetch customers:", error);
        return [];
    }
}

export async function createCustomer(
    payload: CustomerProfilePayload | UnknownRecord,
    context?: CustomerAuditContext
): Promise<UnknownRecord> {
    const audit = await requireAuditContext(context);
    const profile = normalizeProfilePayload(payload);
    if (profile.isActive === undefined) profile.isActive = 1;
    throwIfInvalidCustomerProfile(profile);
    const priceType = await resolveActivePriceType(profile.price_type_id);

    const created = await directusMutation(
        `/items/${CUSTOMER_COLLECTION}?fields=${encodeURIComponent(CUSTOMER_READ_FIELDS)}`,
        "POST",
        {
            ...profile,
            price_type_id: priceType.price_type_id,
            price_type: priceType.price_type_name,
            encoder_id: audit.userId,
            updated_by: audit.userId,
            updated_at: audit.updatedAt
        }
    );
    return normalizeCustomer(created);
}

export async function updateCustomer(
    id: number | string,
    payload: CustomerProfilePayload | UnknownRecord,
    context?: CustomerAuditContext
): Promise<UnknownRecord> {
    const audit = await requireAuditContext(context);
    const profile = normalizeProfilePayload(payload);
    const current = await fetchCustomerById(id);
    const mergedProfile = {
        ...pickProfilePayload(current),
        ...profile
    };
    throwIfInvalidCustomerProfile(mergedProfile);
    const priceType = await resolveActivePriceType(mergedProfile.price_type_id);
    const updated = await directusMutation(
        `/items/${CUSTOMER_COLLECTION}/${encodeURIComponent(String(id))}?fields=${encodeURIComponent(CUSTOMER_READ_FIELDS)}`,
        "PATCH",
        {
            ...mergedProfile,
            price_type_id: priceType.price_type_id,
            price_type: priceType.price_type_name,
            updated_by: audit.userId,
            updated_at: audit.updatedAt
        }
    );
    return normalizeCustomer(updated);
}

export async function deleteCustomer(id: number | string, context?: CustomerAuditContext): Promise<boolean> {
    const audit = await requireAuditContext(context);
    await directusMutation(
        `/items/${CUSTOMER_COLLECTION}/${encodeURIComponent(String(id))}`,
        "PATCH",
        { isActive: 0, updated_by: audit.userId, updated_at: audit.updatedAt }
    );
    return true;
}
