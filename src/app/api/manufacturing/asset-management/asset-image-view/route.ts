import { NextResponse } from "next/server";
import { DIRECTUS_URL, DIRECTUS_TOKEN } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractImageUuid(imageVal: string | null | undefined): string | null {
    if (!imageVal || typeof imageVal !== "string") return null;
    const trimmed = imageVal.trim();
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
    const { searchParams } = new URL(request.url);
    const rawId = searchParams.get("id");
    const cleanId = extractImageUuid(rawId);

    if (!cleanId) {
        return NextResponse.json({ error: "Missing or invalid image id" }, { status: 400 });
    }

    try {
        const fetchHeaders: Record<string, string> = {};
        if (DIRECTUS_TOKEN) {
            fetchHeaders["Authorization"] = `Bearer ${DIRECTUS_TOKEN}`;
        }

        const directusRes = await fetch(`${DIRECTUS_URL}/assets/${encodeURIComponent(cleanId)}`, {
            headers: fetchHeaders,
            cache: "no-store"
        });

        if (!directusRes.ok) {
            return NextResponse.json({ error: "Image not found in storage" }, { status: 404 });
        }

        const contentType = directusRes.headers.get("content-type") || "image/jpeg";
        const arrayBuffer = await directusRes.arrayBuffer();

        return new NextResponse(arrayBuffer, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=31536000, immutable"
            }
        });
    } catch (e) {
        console.error("API Error viewing asset image:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to load image" },
            { status: 500 }
        );
    }
}
