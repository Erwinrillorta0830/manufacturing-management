import { NextResponse } from "next/server";
import { getUserIdFromToken } from "@/app/api/manufacturing/invoice-consolidation/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 10 * 1024 * 1024;

const API_BASE_URLS = Array.from(
    new Set(
        [
            process.env.DIRECTUS_URL,
            process.env.CRM_DIRECTUS_URL,
            process.env.NEXT_PUBLIC_DIRECTUS_URL,
            process.env.NEXT_PUBLIC_API_BASE_URL,
        ]
            .filter((url): url is string => Boolean(url && url.trim()))
            .map((url) => url.trim().replace(/\/+$/, ""))
    )
);

const TOKENS = Array.from(
    new Set(
        [
            process.env.DIRECTUS_STATIC_TOKEN,
            process.env.CRM_DIRECTUS_STATIC_TOKEN,
            process.env.DIRECTUS_ADMIN_TOKEN,
            process.env.DIRECTUS_TOKEN,
        ].filter((t): t is string => Boolean(t && t.trim()))
    )
);

function extractAssetId(rawId: string | null | undefined): string | null {
    if (!rawId || typeof rawId !== "string") return null;
    const trimmed = rawId.trim();
    if (!trimmed) return null;

    const uuidMatch = trimmed.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    if (uuidMatch) return uuidMatch[0];

    if (trimmed.includes("/assets/")) {
        const parts = trimmed.split("/assets/");
        const last = parts[parts.length - 1].split("?")[0].split("/")[0];
        if (last) return last;
    }

    return trimmed;
}

export async function GET(request: Request) {
    if (!(await getUserIdFromToken())) {
        return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const rawId = new URL(request.url).searchParams.get("id");
    const id = extractAssetId(rawId);
    if (!id || !/^[a-zA-Z0-9-]+$/.test(id)) {
        return NextResponse.json({ error: "Invalid file ID." }, { status: 400 });
    }

    // Try fetching the asset across available Directus URLs and Tokens
    for (const baseUrl of API_BASE_URLS) {
        for (const token of [...TOKENS, ""]) {
            try {
                const url = token ? `${baseUrl}/assets/${id}?access_token=${token}` : `${baseUrl}/assets/${id}`;
                const headers: Record<string, string> = {};
                if (token) headers["Authorization"] = `Bearer ${token}`;

                const response = await fetch(url, { headers, cache: "no-store" });
                if (response.ok && response.body) {
                    return new Response(response.body, {
                        headers: {
                            "Content-Type": response.headers.get("Content-Type") || "image/jpeg",
                            "Cache-Control": "private, max-age=300",
                        },
                    });
                }
            } catch {
                // Try next
            }
        }
    }

    return NextResponse.json({ error: "Receipt background not found." }, { status: 404 });
}

export async function POST(request: Request) {
    if (!(await getUserIdFromToken())) {
        return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !IMAGE_TYPES.has(file.type) || file.size < 1 || file.size > MAX_SIZE) {
        return NextResponse.json({ error: "Upload a JPG, PNG, or WebP image up to 10 MB." }, { status: 400 });
    }

    const primaryUrl = API_BASE_URLS[0];
    const primaryToken = TOKENS[0];
    if (!primaryUrl) {
        return NextResponse.json({ error: "Directus storage URL is not configured." }, { status: 500 });
    }

    const upload = new FormData();
    upload.set("file", file, file.name);

    const response = await fetch(`${primaryUrl}/files`, {
        method: "POST",
        headers: primaryToken ? { Authorization: `Bearer ${primaryToken}` } : undefined,
        body: upload,
    });

    if (!response.ok) {
        const detail = await response.text();
        console.error("Receipt background upload failed:", response.status, detail);
        return NextResponse.json({ error: "Unable to upload receipt background." }, { status: 503 });
    }

    const id = String((await response.json()).data?.id || "");
    if (!id) return NextResponse.json({ error: "Upload returned no file ID." }, { status: 503 });
    return NextResponse.json({ id });
}
