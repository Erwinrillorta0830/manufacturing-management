import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

// Utility for fetching from Directus backend
async function directusFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (!DIRECTUS_URL) throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
    if (!DIRECTUS_TOKEN) throw new Error("DIRECTUS_STATIC_TOKEN is not configured");

    const res = await fetch(`${DIRECTUS_URL}${path.startsWith("/") ? "" : "/"}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${DIRECTUS_TOKEN}`,
            "Content-Type": "application/json",
            ...(options.headers || {}),
        },
        cache: "no-store",
    });

    const responseText = await res.text();
    if (!res.ok) throw new Error(responseText);
    if (!responseText.trim()) return undefined as T;

    try {
        return JSON.parse(responseText) as T;
    } catch {
        throw new Error("Directus returned an invalid JSON response.");
    }
}

// GET: Fetch Cash Issuances
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const page = parseInt(searchParams.get("page") || "0", 10);
        const size = parseInt(searchParams.get("size") || "20", 10);
        const status = searchParams.get("status") || "All";
        
        // TODO: Replace "fm_cash_issuances" with your actual Directus collection name
        const params = new URLSearchParams();
        params.set("limit", size.toString());
        params.set("offset", (page * size).toString());
        params.set("sort", "-date_created");
        params.set("meta", "filter_count");

        let filterIndex = 0;
        if (status && status !== "All") {
            params.set(`filter[_and][${filterIndex}][status][_eq]`, status);
            filterIndex++;
        }

        // Example: Add fields you want to fetch
        params.set("fields", "id,doc_no,total_amount,status,remarks,date_created,payee.*,encoder_id.*");

        const response = await directusFetch<any>(`/items/fm_cash_issuances?${params.toString()}`);

        return NextResponse.json({
            data: response.data || [],
            totalElements: response.meta?.filter_count || 0,
            totalPages: Math.ceil((response.meta?.filter_count || 0) / size),
            page,
            size,
        });
    } catch (error: any) {
        return NextResponse.json(
            { message: "Failed to fetch cash issuances", detail: error.message },
            { status: 500 }
        );
    }
}

// POST: Create a new Cash Issuance
export async function POST(req: NextRequest) {
    try {
        const payload = await req.json();

        // 1. Basic Validations
        if (!payload.totalAmount || payload.totalAmount <= 0) {
            return NextResponse.json({ message: "Total amount must be greater than zero." }, { status: 400 });
        }
        if (!payload.payeeId) {
            return NextResponse.json({ message: "Payee is required." }, { status: 400 });
        }

        // 2. Prepare payload for Directus
        // TODO: Map frontend payload structure to Directus collection fields
        const directusPayload = {
            total_amount: payload.totalAmount,
            payee: payload.payeeId,
            remarks: payload.remarks || "",
            status: "Draft",
            transaction_date: payload.transactionDate || new Date().toISOString().split("T")[0],
            // Map your specific Cash Issuance lines/payables here
        };

        // 3. Save to Directus
        // TODO: Replace "fm_cash_issuances" with your actual Directus collection name
        const response = await directusFetch<any>("/items/fm_cash_issuances", {
            method: "POST",
            body: JSON.stringify(directusPayload),
        });

        return NextResponse.json(response.data);
    } catch (error: any) {
        return NextResponse.json(
            { message: "Failed to create cash issuance", detail: error.message },
            { status: 500 }
        );
    }
}
