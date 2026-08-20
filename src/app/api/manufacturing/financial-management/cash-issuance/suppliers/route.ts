import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

type DirectusSupplier = {
    id?: number;
    supplier_name?: string;
    supplier_shortcut?: string | null;
    isActive?: boolean | number | null;
};

type DirectusList<T> = {
    data?: T[];
};

function supplierTypeFilter(type: string) {
    const normalized = type.replace(/[-_\s]/g, "").toUpperCase();
    return normalized === "NONTRADE" ? "NON-TRADE" : "TRADE";
}

function supplierParams(type: string) {
    const params = new URLSearchParams();
    params.set("limit", "-1");
    params.set("sort", "supplier_name");
    params.set("fields", "id,supplier_name,supplier_shortcut,isActive,supplier_type");
    params.set("filter[_and][0][isActive][_eq]", "1");
    params.set("filter[_and][1][supplier_type][_eq]", supplierTypeFilter(type));
    return params;
}

export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;

    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") || "TRADE";

    try {
        if (!DIRECTUS_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
        if (!DIRECTUS_TOKEN) throw new Error("DIRECTUS_STATIC_TOKEN is not configured");

        const directusRes = await fetch(`${DIRECTUS_URL}/items/suppliers?${supplierParams(type).toString()}`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${DIRECTUS_TOKEN}`,
                "Content-Type": "application/json",
            },
            cache: "no-store",
        });

        if (!directusRes.ok) throw new Error(await directusRes.text());

        const payload = await directusRes.json() as DirectusList<DirectusSupplier & { supplier_type?: string }>;
        return NextResponse.json((payload.data ?? []).map((supplier) => ({
            id: supplier.id,
            supplier_name: supplier.supplier_name ?? "",
            supplier_shortcut: supplier.supplier_shortcut ?? "",
            isActive: supplier.isActive === true || supplier.isActive === 1,
            supplier_type: supplier.supplier_type ?? "",
        })));
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
        return NextResponse.json({ message: "BFF Error", detail: errorMessage }, { status: 502 });
    }
}
