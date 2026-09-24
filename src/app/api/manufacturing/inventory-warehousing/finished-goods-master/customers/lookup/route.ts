import { NextResponse } from "next/server";
import {
    CUSTOMER_LOOKUP_LIMIT_DEFAULT,
    CUSTOMER_LOOKUP_LIMIT_MAX,
    CustomerPaginationValidationError,
    fetchCustomerLookup
} from "@/app/api/manufacturing/services/customer-api.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseLookupLimit(value: string | null): number {
    if (value === null || value.trim() === "") return CUSTOMER_LOOKUP_LIMIT_DEFAULT;
    const limit = Number(value);
    if (!Number.isSafeInteger(limit) || limit <= 0 || limit > CUSTOMER_LOOKUP_LIMIT_MAX) {
        throw new CustomerPaginationValidationError(
            `limit must be a positive integer no greater than ${CUSTOMER_LOOKUP_LIMIT_MAX}.`
        );
    }
    return limit;
}

function errorMessage(error: unknown, fallback: string): string {
    return error instanceof Error && error.message ? error.message : fallback;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const data = await fetchCustomerLookup({
            search: searchParams.get("search") || "",
            customerId: searchParams.get("customerId") || undefined,
            customerCode: searchParams.get("customerCode") || undefined,
            limit: parseLookupLimit(searchParams.get("limit"))
        });

        return NextResponse.json({ data });
    } catch (error) {
        if (error instanceof CustomerPaginationValidationError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        console.error("API Error fetching customer lookup:", error);
        return NextResponse.json(
            { error: errorMessage(error, "Failed to fetch customer lookup") },
            { status: 500 }
        );
    }
}
