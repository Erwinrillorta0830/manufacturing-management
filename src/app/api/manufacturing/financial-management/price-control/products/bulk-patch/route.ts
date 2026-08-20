import { NextRequest, NextResponse } from "next/server";
import { invalidateGroupIndexCacheOnCatalogChange } from "../../_productGroupIndexCache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const PRODUCTS_COLLECTION = "products";

type BulkPatchItem = {
    product_id: number;
    cost_per_unit: number | null;
};

type JwtPayload = {
    sub?: string | number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function directusToken() {
    return process.env.DIRECTUS_STATIC_TOKEN || process.env.DIRECTUS_SERVICE_TOKEN || "";
}

function directusHeaders(): Record<string, string> {
    const token = directusToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
}

async function fetchDirectusRaw(url: string, init?: RequestInit) {
    const res = await fetch(url, {
        cache: "no-store",
        ...init,
        headers: {
            ...directusHeaders(),
            ...(init?.headers instanceof Headers ? Object.fromEntries(init.headers.entries()) : init?.headers ?? {}),
        },
    });

    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text };
}

function decodeUserIdFromJwtCookie(req: NextRequest, cookieName = "vos_access_token") {
    const token = req.cookies.get(cookieName)?.value;
    if (!token) return null;

    const parts = token.split(".");
    if (parts.length < 2) return null;

    try {
        const payloadPart = parts[1];
        const pad = "=".repeat((4 - (payloadPart.length % 4)) % 4);
        const b64 = (payloadPart + pad).replace(/-/g, "+").replace(/_/g, "/");
        const jsonStr = Buffer.from(b64, "base64").toString("utf8");
        const payloadUnknown: unknown = JSON.parse(jsonStr);

        if (!isRecord(payloadUnknown)) return null;

        const payload = payloadUnknown as JwtPayload;
        const userId = Number(payload.sub);
        return Number.isFinite(userId) ? userId : null;
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        if (!DIRECTUS_URL) {
            return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE_URL is not set" }, { status: 500 });
        }

        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await req.json()) as Partial<{ items: BulkPatchItem[] }>;
        const items = Array.isArray(body.items) ? body.items : [];

        if (items.length === 0) {
            return NextResponse.json({ ok: true, affected: 0 });
        }

        // Validate items
        for (const item of items) {
            if (!item.product_id || !Number.isFinite(item.product_id)) {
                return NextResponse.json({ error: "Invalid product_id in items" }, { status: 400 });
            }
        }

        /**
         * Directus sequential patch
         * (Ideally Directus supports bulk patch via /items/collection PATCH with an array, 
         * but sequential is safer for existing patterns)
         */
        const results = await Promise.all(
            items.map(async (item) => {
                const url = `${DIRECTUS_URL}/items/${PRODUCTS_COLLECTION}/${item.product_id}`;
                const payload = {
                    cost_per_unit: item.cost_per_unit,
                    updated_by: userId,
                };

                const { ok, status, text } = await fetchDirectusRaw(url, {
                    method: "PATCH",
                    body: JSON.stringify(payload),
                });

                return { product_id: item.product_id, ok, status, text };
            }),
        );

        const failed = results.filter((r) => !r.ok);
        if (failed.length > 0) {
            return NextResponse.json(
                {
                    error: "Some updates failed",
                    failed_count: failed.length,
                    details: failed.map((f) => ({ product_id: f.product_id, status: f.status, error: f.text })),
                },
                { status: 500 },
            );
        }

        invalidateGroupIndexCacheOnCatalogChange();

        return NextResponse.json({ ok: true, affected: results.length });
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
