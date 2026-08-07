import { NextResponse } from "next/server";

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
            .map(url => url.trim().replace(/\/+$/, ""))
    )
);

const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

function configurationError() {
    return NextResponse.json(
        { error: "File storage is not configured.", code: "FILE_STORAGE_NOT_CONFIGURED" },
        { status: 500 }
    );
}

function getUpstreamMessage(payload: unknown, fallback: string): string {
    if (!payload || typeof payload !== "object") return fallback;

    const record = payload as {
        error?: unknown;
        message?: unknown;
        detail?: unknown;
        errors?: Array<{ message?: unknown }>;
    };
    const messages = [record.error, record.message, record.detail];
    if (Array.isArray(record.errors)) {
        messages.push(...record.errors.map(error => error?.message));
    }

    const message = messages.find(value => typeof value === "string" && value.trim());
    return typeof message === "string" ? message.trim() : fallback;
}

async function readResponseBody(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch {
        return { message: text };
    }
}

function upstreamStatus(status: number): number {
    return status >= 500 ? 502 : status;
}

async function requestDirectusFile(
    method: "POST" | "DELETE",
    path: string,
    file?: File
): Promise<{ response: Response; body: unknown }> {
    let lastError: unknown;

    for (const [index, baseUrl] of API_BASE_URLS.entries()) {
        try {
            const requestBody = file
                ? (() => {
                    const formData = new FormData();
                    formData.set("file", file, file.name);
                    formData.set("title", file.name);
                    return formData;
                })()
                : undefined;
            const response = await fetch(`${baseUrl}/${path}`, {
                method,
                headers: {
                    Authorization: `Bearer ${DIRECTUS_TOKEN}`,
                },
                body: requestBody,
            });
            const body = await readResponseBody(response);

            if (response.ok || response.status < 500 || index === API_BASE_URLS.length - 1) {
                return { response, body };
            }

            console.warn("Directus file request failed; trying fallback.", {
                baseUrl,
                status: response.status,
            });
        } catch (error) {
            lastError = error;
            if (index === API_BASE_URLS.length - 1) throw error;
            console.warn("Directus file request was unreachable; trying fallback.", { baseUrl });
        }
    }

    throw lastError instanceof Error ? lastError : new Error("No file storage endpoint is configured.");
}

export async function GET(req: Request) {
    try {
        if (!API_BASE_URLS.length || !DIRECTUS_TOKEN) return configurationError();

        const id = new URL(req.url).searchParams.get("id");
        if (!id) {
            return NextResponse.json(
                { error: "File ID is required.", code: "FILE_ID_REQUIRED" },
                { status: 400 }
            );
        }

        let lastResponse: Response | null = null;
        let lastError: unknown;

        for (const baseUrl of API_BASE_URLS) {
            try {
                const response = await fetch(`${baseUrl}/assets/${encodeURIComponent(id)}`, {
                    headers: { Authorization: `Bearer ${DIRECTUS_TOKEN}` },
                    cache: "no-store"
                });
                if (response.ok) {
                    const responseHeaders = new Headers();
                    const contentType = response.headers.get("content-type");
                    if (contentType) responseHeaders.set("content-type", contentType);
                    const cacheControl = response.headers.get("cache-control");
                    if (cacheControl) responseHeaders.set("cache-control", cacheControl);
                    return new Response(response.body, {
                        status: response.status,
                        headers: responseHeaders
                    });
                }
                lastResponse = response;
            } catch (error) {
                lastError = error;
            }
        }

        if (lastResponse) {
            const body = await readResponseBody(lastResponse);
            return NextResponse.json(
                { error: getUpstreamMessage(body, "Directus rejected the image request."), code: "FILE_READ_FAILED" },
                { status: upstreamStatus(lastResponse.status) }
            );
        }

        throw lastError instanceof Error ? lastError : new Error("No file storage endpoint is configured.");
    } catch (err: unknown) {
        console.error("BFF file read error:", err);
        return NextResponse.json({
            error: "Unable to reach the file storage service.",
            code: "FILE_STORAGE_UNAVAILABLE",
            detail: err instanceof Error ? err.message : String(err)
        }, { status: 502 });
    }
}

export async function POST(req: Request) {
    try {
        if (!API_BASE_URLS.length || !DIRECTUS_TOKEN) return configurationError();

        const formData = await req.formData();
        const fileValue = formData.get("file");

        if (!fileValue || typeof fileValue === "string") {
            return NextResponse.json(
                { error: "No file uploaded.", code: "FILE_REQUIRED" },
                { status: 400 }
            );
        }

        const file = fileValue as File;
        if (!file.type || !ALLOWED_IMAGE_TYPES.has(file.type.toLowerCase())) {
            return NextResponse.json(
                { error: "Product images must be PNG, JPG, or WEBP files.", code: "IMAGE_TYPE_INVALID" },
                { status: 400 }
            );
        }

        if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: "Product images must be greater than 0 bytes and no larger than 5 MB.", code: "IMAGE_SIZE_INVALID" },
                { status: 413 }
            );
        }

        const { response, body: responseBody } = await requestDirectusFile("POST", "files", file);
        if (!response.ok) {
            const message = getUpstreamMessage(responseBody, "Directus rejected the image upload.");
            console.error("Directus upload error:", { status: response.status, message });
            return NextResponse.json(
                {
                    error: message,
                    code: response.status === 401 || response.status === 403
                        ? "FILE_UPLOAD_FORBIDDEN"
                        : "FILE_UPLOAD_FAILED"
                },
                { status: upstreamStatus(response.status) }
            );
        }

        const fileId = responseBody && typeof responseBody === "object"
            ? (responseBody as { data?: { id?: unknown } }).data?.id
            : undefined;
        if ((typeof fileId !== "string" && typeof fileId !== "number") || !String(fileId).trim()) {
            console.error("Directus upload returned no file ID:", responseBody);
            return NextResponse.json(
                { error: "Directus returned an invalid file response.", code: "FILE_UPLOAD_INVALID_RESPONSE" },
                { status: 502 }
            );
        }

        return NextResponse.json(responseBody);
    } catch (err: unknown) {
        console.error("BFF upload error:", err);
        return NextResponse.json({
            error: "Unable to reach the file storage service.",
            code: "FILE_STORAGE_UNAVAILABLE",
            detail: err instanceof Error ? err.message : String(err)
        }, { status: 502 });
    }
}

export async function DELETE(req: Request) {
    try {
        if (!API_BASE_URLS.length || !DIRECTUS_TOKEN) return configurationError();

        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");

        if (!id) {
            return NextResponse.json(
                { error: "File ID is required.", code: "FILE_ID_REQUIRED" },
                { status: 400 }
            );
        }

        const { response, body: responseBody } = await requestDirectusFile(
            "DELETE",
            `files/${encodeURIComponent(id)}`
        );
        if (!response.ok) {
            const message = getUpstreamMessage(responseBody, "Directus rejected the file deletion.");
            console.error("Directus delete error:", { status: response.status, message });
            return NextResponse.json(
                { error: message, code: "FILE_DELETE_FAILED" },
                { status: upstreamStatus(response.status) }
            );
        }

        return new Response(null, { status: 204 });
    } catch (err: unknown) {
        console.error("BFF delete error:", err);
        return NextResponse.json({
            error: "Unable to reach the file storage service.",
            code: "FILE_STORAGE_UNAVAILABLE",
            detail: err instanceof Error ? err.message : String(err)
        }, { status: 502 });
    }
}
