import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE_NAME, decodeJwtPayload } from "@/lib/auth-utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

type DirectusFileMetadata = {
    data?: {
        type?: string | null;
        filename_download?: string | null;
    } | null;
};

function assetHeaders(response: Response, metadata?: DirectusFileMetadata["data"] | null): Headers {
    const headers = new Headers();
    const contentType = response.headers.get("content-type") || metadata?.type;
    const contentLength = response.headers.get("content-length");
    const contentDisposition = response.headers.get("content-disposition");
    const cacheControl = response.headers.get("cache-control");
    const etag = response.headers.get("etag");
    const lastModified = response.headers.get("last-modified");

    if (contentType) headers.set("content-type", contentType);
    if (contentLength) headers.set("content-length", contentLength);
    if (contentDisposition) headers.set("content-disposition", contentDisposition);
    else if (metadata?.filename_download) headers.set("content-disposition", `inline; filename="${metadata.filename_download}"`);
    if (cacheControl) headers.set("cache-control", cacheControl);
    if (etag) headers.set("etag", etag);
    if (lastModified) headers.set("last-modified", lastModified);

    return headers;
}

async function isAuthenticated(): Promise<boolean> {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    return Boolean(token && decodeJwtPayload(token));
}

async function getParams(context: { params: Promise<{ fileId: string }> }) {
    const { fileId } = await context.params;
    const decodedFileId = decodeURIComponent(fileId || "");
    if (!decodedFileId || decodedFileId.includes("/") || decodedFileId.includes("\\") || decodedFileId.includes("..")) {
        return null;
    }
    return decodedFileId;
}

async function fetchDirectusMetadata(fileId: string) {
    const response = await fetch(
        `${DIRECTUS_URL}/files/${encodeURIComponent(fileId)}?fields=type,filename_download`,
        {
            headers: { Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}` },
            cache: "no-store",
        },
    );

    if (!response.ok) return null;
    const payload = (await response.json()) as DirectusFileMetadata;
    return payload.data || null;
}

async function proxyAttachment(
    request: NextRequest,
    context: { params: Promise<{ fileId: string }> },
) {
    if (!(await isAuthenticated())) {
        return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    if (!DIRECTUS_URL || !DIRECTUS_STATIC_TOKEN) {
        return NextResponse.json({ message: "Directus is not configured" }, { status: 500 });
    }

    const fileId = await getParams(context);
    if (!fileId) {
        return NextResponse.json({ message: "File ID is required" }, { status: 400 });
    }

    const method = request.method === "HEAD" ? "HEAD" : "GET";
    const assetUrl = `${DIRECTUS_URL}/assets/${encodeURIComponent(fileId)}`;

    try {
        const directusResponse = await fetch(assetUrl, {
            method,
            headers: { Authorization: `Bearer ${DIRECTUS_STATIC_TOKEN}` },
            cache: "no-store",
        });

        if (method === "HEAD" && (directusResponse.status === 405 || directusResponse.status === 501)) {
            const metadata = await fetchDirectusMetadata(fileId);
            if (!metadata) return NextResponse.json({ message: "Attachment file unavailable" }, { status: 404 });
            return new NextResponse(null, { status: 200, headers: assetHeaders(directusResponse, metadata) });
        }

        if (!directusResponse.ok) {
            return NextResponse.json({ message: "Attachment file unavailable" }, { status: directusResponse.status });
        }

        return new NextResponse(method === "HEAD" ? null : directusResponse.body, {
            status: directusResponse.status,
            headers: assetHeaders(directusResponse),
        });
    } catch (error: unknown) {
        console.error("[GET Disbursement Attachment Error]:", error);
        return NextResponse.json(
            { message: "Failed to load attachment" },
            { status: 502 },
        );
    }
}

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ fileId: string }> },
) {
    return proxyAttachment(request, context);
}

export async function HEAD(
    request: NextRequest,
    context: { params: Promise<{ fileId: string }> },
) {
    return proxyAttachment(request, context);
}
