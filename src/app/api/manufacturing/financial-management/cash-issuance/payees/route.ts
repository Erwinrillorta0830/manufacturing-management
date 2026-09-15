import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";

const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

function getPhTimestamp(date?: Date | string | null): string {
    const d = date ? (typeof date === "string" ? new Date(date) : date) : new Date();
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    return validDate.toLocaleString("sv-SE", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    }).replace("T", " ");
}

export async function POST(request: NextRequest) {
    const cookieStore = await cookies();
    const token = cookieStore.get("vos_access_token")?.value;

    if (!token) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    try {
        if (!DIRECTUS_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
        if (!DIRECTUS_TOKEN) throw new Error("DIRECTUS_STATIC_TOKEN is not configured");

        const body = await request.json().catch(() => ({}));
        const supplierName = typeof body.supplier_name === "string" ? body.supplier_name.trim() : "";
        const tinNumber = typeof body.tin_number === "string" ? body.tin_number.trim() : "";
        const supplierType = typeof body.supplier_type === "string" && body.supplier_type.trim().toUpperCase() === "TRADE" 
            ? "TRADE" 
            : "NON-TRADE";

        if (!supplierName) {
            return NextResponse.json({ error: "Payee / Supplier name is required" }, { status: 400 });
        }
        if (!tinNumber) {
            return NextResponse.json({ error: "TIN number is required" }, { status: 400 });
        }

        const directusPayload = {
            supplier_name: supplierName,
            supplier_type: supplierType,
            tin_number: tinNumber,
            email_address: typeof body.email_address === "string" ? body.email_address.trim() || null : null,
            phone_number: typeof body.phone_number === "string" ? body.phone_number.trim() || null : null,
            bank_details: typeof body.bank_details === "string" ? body.bank_details.trim() || null : null,
            isActive: 1,
            is_foreign: 0,
            country: "Philippines",
            currency: "PHP",
            default_currency: "PHP",
            date_added: getPhTimestamp(),
        };

        const directusRes = await fetch(`${DIRECTUS_URL}/items/suppliers`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${DIRECTUS_TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(directusPayload),
        });

        if (!directusRes.ok) {
            const errorText = await directusRes.text();
            let errorMessage = "Failed to create payee in database";
            try {
                const parsed = JSON.parse(errorText);
                if (parsed.errors?.[0]?.message) {
                    errorMessage = parsed.errors[0].message;
                }
            } catch {
                errorMessage = errorText || errorMessage;
            }
            return NextResponse.json({ error: errorMessage }, { status: directusRes.status });
        }

        const responseData = await directusRes.json();
        const createdSupplier = responseData.data;

        return NextResponse.json({
            success: true,
            data: {
                id: createdSupplier.id,
                supplier_name: createdSupplier.supplier_name ?? supplierName,
                supplier_shortcut: createdSupplier.supplier_shortcut ?? "",
                isActive: true,
                supplier_type: createdSupplier.supplier_type ?? supplierType,
                tin_number: createdSupplier.tin_number ?? tinNumber,
                email_address: createdSupplier.email_address ?? "",
                phone_number: createdSupplier.phone_number ?? "",
                bank_details: createdSupplier.bank_details ?? "",
            },
        }, { status: 201 });
    } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : "Internal Server Error";
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
