import { NextResponse } from "next/server";
import { fetchCustomers, createCustomer, updateCustomer, deleteCustomer } from "./customers-helper";
import {
    CustomerNotFoundError,
    CustomerProfileValidationError,
    CustomerUnauthorizedError,
    getCustomerAuditContext
} from "@/app/api/manufacturing/services/customer-api.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

type CustomerRequestBody = Record<string, unknown>;

function isRecord(value: unknown): value is CustomerRequestBody {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pickCustomerProfile(body: CustomerRequestBody): CustomerRequestBody {
    return Object.fromEntries(
        CUSTOMER_PROFILE_FIELDS
            .filter(field => Object.prototype.hasOwnProperty.call(body, field))
            .map(field => [field, body[field]])
    );
}

function parsePaymentTerm(value: unknown): number | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;

    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error("Payment Term must be a valid payment-term ID.");
    }

    return parsed;
}

function unauthorizedResponse() {
    return NextResponse.json(
        { error: "Unauthorized: A valid user session is required." },
        { status: 401 }
    );
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const search = searchParams.get("search") || "";
        const all = searchParams.get("all") === "true";
        const customers = await fetchCustomers(search, all);
        return NextResponse.json(customers);
    } catch (error) {
        console.error("API Error fetching customers:", error);
        return NextResponse.json({ error: errorMessage(error, "Failed to fetch customers") }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body: unknown = await request.json();
        if (!isRecord(body)) {
            return NextResponse.json({ error: "A customer registration payload is required." }, { status: 400 });
        }

        let paymentTerm: number | null | undefined;
        try {
            paymentTerm = parsePaymentTerm(body.payment_term);
        } catch (error) {
            return NextResponse.json({ error: errorMessage(error, "Invalid payment term") }, { status: 400 });
        }

        const audit = await getCustomerAuditContext();
        if (!audit) return unauthorizedResponse();

        const profile = pickCustomerProfile(body);
        if (paymentTerm !== undefined) profile.payment_term = paymentTerm;

        const newCustomer = await createCustomer(profile, audit);
        return NextResponse.json(newCustomer);
    } catch (error) {
        if (error instanceof CustomerUnauthorizedError) return unauthorizedResponse();
        if (error instanceof CustomerProfileValidationError) {
            return NextResponse.json({ error: error.message, fields: error.fields }, { status: 400 });
        }
        console.error("API Error creating customer:", error);
        return NextResponse.json({ error: errorMessage(error, "Failed to create customer") }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        if (!id) {
            return NextResponse.json({ error: "Missing required 'id' parameter" }, { status: 400 });
        }

        const body: unknown = await request.json();
        if (!isRecord(body)) {
            return NextResponse.json({ error: "A customer update payload is required." }, { status: 400 });
        }

        let paymentTerm: number | null | undefined;
        try {
            paymentTerm = parsePaymentTerm(body.payment_term);
        } catch (error) {
            return NextResponse.json({ error: errorMessage(error, "Invalid payment term") }, { status: 400 });
        }

        const profile = pickCustomerProfile(body);
        if (paymentTerm !== undefined) profile.payment_term = paymentTerm;
        if (Object.keys(profile).length === 0) {
            return NextResponse.json({ error: "At least one customer profile field is required." }, { status: 400 });
        }

        const audit = await getCustomerAuditContext();
        if (!audit) return unauthorizedResponse();

        const updated = await updateCustomer(id, profile, audit);
        return NextResponse.json(updated);
    } catch (error) {
        if (error instanceof CustomerUnauthorizedError) return unauthorizedResponse();
        if (error instanceof CustomerProfileValidationError) {
            return NextResponse.json({ error: error.message, fields: error.fields }, { status: 400 });
        }
        if (error instanceof CustomerNotFoundError) {
            return NextResponse.json({ error: error.message }, { status: 404 });
        }
        console.error("API Error updating customer:", error);
        return NextResponse.json({ error: errorMessage(error, "Failed to update customer") }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get("id");
        if (!id) {
            return NextResponse.json({ error: "Missing required 'id' parameter" }, { status: 400 });
        }

        const audit = await getCustomerAuditContext();
        if (!audit) return unauthorizedResponse();

        const success = await deleteCustomer(id, audit);
        return NextResponse.json({ success });
    } catch (error) {
        if (error instanceof CustomerUnauthorizedError) return unauthorizedResponse();
        console.error("API Error deleting customer:", error);
        return NextResponse.json({ error: errorMessage(error, "Failed to delete customer") }, { status: 500 });
    }
}
