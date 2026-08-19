import { NextRequest, NextResponse } from "next/server";

import { fetchMatrixPage } from "../../_matrixPage";
import { parseProductCatalogQuery } from "../../_productCatalogQuery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

type JwtPayload = {
    sub?: string | number | null;
};

type DirectusErrorShape = {
    message?: string;
    status?: number;
    url?: string;
    body?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
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

function parseErrorMessage(message: string): DirectusErrorShape | null {
    try {
        const parsed: unknown = JSON.parse(message);
        return isRecord(parsed) ? (parsed as DirectusErrorShape) : null;
    } catch {
        return null;
    }
}

export async function GET(req: NextRequest) {
    try {
        if (!DIRECTUS_URL) {
            return NextResponse.json({ error: "NEXT_PUBLIC_API_BASE_URL is not set" }, { status: 500 });
        }

        const userId = decodeUserIdFromJwtCookie(req);
        if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { searchParams } = new URL(req.url);
        const query = parseProductCatalogQuery(searchParams);
        const payload = await fetchMatrixPage(query);

        return NextResponse.json(payload);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const parsed = parseErrorMessage(message);

        if (parsed) {
            return NextResponse.json(
                {
                    error: parsed.message ?? "Directus request failed",
                    directus_status: parsed.status,
                    directus_url: parsed.url,
                    directus_body: parsed.body,
                },
                { status: 500 },
            );
        }

        return NextResponse.json({ error: "Unexpected error", details: message }, { status: 500 });
    }
}
