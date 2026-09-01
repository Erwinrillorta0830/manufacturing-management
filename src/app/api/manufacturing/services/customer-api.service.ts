import { getManilaTimeString, getUserIdFromToken } from "@/app/api/manufacturing/item-management/auth-helper";
import { DIRECTUS_URL, headers } from "./core-api.service";

const CUSTOMER_COLLECTION = "customer";
const CUSTOMER_READ_FIELDS = [
    "*",
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
    "contact_number",
    "customer_email",
    "store_name",
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
    contact_number?: string | null;
    customer_email?: string | null;
    store_name?: string | null;
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

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? value as UnknownRecord
        : null;
}

function positiveInteger(value: unknown): number | null {
    const parsed = typeof value === "string" && value.trim() !== ""
        ? Number(value.trim())
        : value;
    return typeof parsed === "number" && Number.isSafeInteger(parsed) && parsed > 0
        ? parsed
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

    return {
        ...customer,
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
    const profile = pickProfilePayload(payload);
    if (profile.isActive === undefined) profile.isActive = 1;

    const created = await directusMutation(
        `/items/${CUSTOMER_COLLECTION}?fields=${encodeURIComponent(CUSTOMER_READ_FIELDS)}`,
        "POST",
        {
            ...profile,
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
    const profile = pickProfilePayload(payload);
    const updated = await directusMutation(
        `/items/${CUSTOMER_COLLECTION}/${encodeURIComponent(String(id))}?fields=${encodeURIComponent(CUSTOMER_READ_FIELDS)}`,
        "PATCH",
        { ...profile, updated_by: audit.userId, updated_at: audit.updatedAt }
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
