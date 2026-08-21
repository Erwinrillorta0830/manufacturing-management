import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE_URLS = Array.from(
    new Set(
        [
            process.env.DIRECTUS_URL,
            process.env.NEXT_PUBLIC_DIRECTUS_URL,
            process.env.NEXT_PUBLIC_API_BASE_URL,
        ]
            .filter((url): url is string => Boolean(url && url.trim()))
            .map((url) => url.trim().replace(/\/+$/, ""))
    )
);

const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

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

export async function GET(request: NextRequest) {
    const rawId = request.nextUrl.searchParams.get("id");
    const id = extractAssetId(rawId);

    if (!id) {
        return NextResponse.json(
            { error: "Asset ID is required.", code: "ASSET_ID_REQUIRED" },
            { status: 400 }
        );
    }

    if (API_BASE_URLS.length === 0) {
        return NextResponse.json(
            { error: "File storage is not configured.", code: "FILE_STORAGE_NOT_CONFIGURED" },
            { status: 500 }
        );
    }

    const authHeaders: Record<string, string> = {};
    if (DIRECTUS_TOKEN) {
        authHeaders["Authorization"] = `Bearer ${DIRECTUS_TOKEN}`;
    }

    const incomingAuth = request.headers.get("authorization");
    if (incomingAuth) {
        authHeaders["Authorization"] = incomingAuth;
    }

    let lastResponse: Response | null = null;
    let lastError: unknown;

    for (const baseUrl of API_BASE_URLS) {
        try {
            const upstreamUrl = `${baseUrl}/assets/${encodeURIComponent(id)}`;
            const response = await fetch(upstreamUrl, {
                headers: authHeaders,
                cache: "no-store",
            });

            if (response.ok && response.body) {
                const responseHeaders = new Headers();
                const contentType = response.headers.get("content-type");
                if (contentType) responseHeaders.set("Content-Type", contentType);

                responseHeaders.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");

                const contentLength = response.headers.get("content-length");
                if (contentLength) responseHeaders.set("Content-Length", contentLength);

                return new Response(response.body, {
                    status: 200,
                    headers: responseHeaders,
                });
            }

            lastResponse = response;
        } catch (error) {
            lastError = error;
        }
    }

    if (lastResponse) {
        return NextResponse.json(
            { error: "Asset not found or inaccessible.", code: "ASSET_NOT_FOUND" },
            { status: lastResponse.status === 404 ? 404 : 502 }
        );
    }

    return NextResponse.json(
        { error: "Failed to connect to storage server.", detail: String(lastError) },
        { status: 502 }
    );
}
