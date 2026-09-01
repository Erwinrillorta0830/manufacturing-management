import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromToken } from "@/app/api/manufacturing/item-management/auth-helper";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/services/core-api.service";

const COLLECTION = "price_types";

type PriceTypeRow = {
    price_type_id?: number | string | null;
    price_type_name?: string | null;
    sort?: number | string | null;
    is_active?: boolean | number | string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unauthorizedResponse() {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function parseActive(value: unknown): boolean {
    if (value === true || value === 1 || value === "1" || (typeof value === "string" && value.trim().toLowerCase() === "true")) return true;
    if (value === false || value === 0 || value === "0" || (typeof value === "string" && value.trim().toLowerCase() === "false")) return false;
    throw new Error("is_active must be a boolean value.");
}

function priceTypePayload(value: unknown): Record<string, unknown> {
    if (!isRecord(value)) throw new Error("A price-type payload is required.");

    const name = typeof value.price_type_name === "string" ? value.price_type_name.trim() : "";
    if (!name) throw new Error("Price Type Name is required.");

    const payload: Record<string, unknown> = {
        price_type_name: name,
        sort: value.sort === undefined || value.sort === "" ? null : value.sort
    };
    if (Object.prototype.hasOwnProperty.call(value, "is_active")) payload.is_active = parseActive(value.is_active);
    return payload;
}

async function fetchDirectus<T>(url: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(url, {
        cache: "no-store",
        ...init,
        headers: { ...directusHeaders, ...(init.headers || {}) }
    });
    if (!res.ok) throw new Error(await res.text());
    return (await res.json()) as T;
}

async function requireAuthenticatedUser(): Promise<boolean> {
    return Boolean(await getUserIdFromToken());
}

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!DIRECTUS_URL) {
            return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE_URL is not set" }, { status: 500 });
        }
        if (!(await requireAuthenticatedUser())) return unauthorizedResponse();

        const { id } = await params;
        const payload = priceTypePayload(await req.json());
        const json = await fetchDirectus<{ data: PriceTypeRow }>(`${DIRECTUS_URL}/items/${COLLECTION}/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        });

        return NextResponse.json({ data: json.data });
    } catch (error: unknown) {
        return NextResponse.json(
            {
                error: "Unexpected error",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}

export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        if (!DIRECTUS_URL) {
            return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE_URL is not set" }, { status: 500 });
        }
        if (!(await requireAuthenticatedUser())) return unauthorizedResponse();

        const { id } = await params;
        await fetchDirectus<unknown>(`${DIRECTUS_URL}/items/${COLLECTION}/${encodeURIComponent(id)}`, {
            method: "DELETE"
        });

        return NextResponse.json({ ok: true });
    } catch (error: unknown) {
        return NextResponse.json(
            {
                error: "Unexpected error",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 },
        );
    }
}
