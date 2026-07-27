import { NextResponse } from "next/server";
import { DIRECTUS_TOKEN, DIRECTUS_URL } from "../../directus-api";
import { getUserIdFromToken } from "../../invoice-consolidation/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SIZE = 10 * 1024 * 1024;

export async function GET(request: Request) {
    if (!(await getUserIdFromToken())) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!/^[a-zA-Z0-9-]+$/.test(id)) return NextResponse.json({ error: "Invalid file ID." }, { status: 400 });
    const response = await fetch(`${DIRECTUS_URL}/assets/${id}`, {
        headers: DIRECTUS_TOKEN ? { Authorization: `Bearer ${DIRECTUS_TOKEN}` } : undefined,
        cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: "Unable to load receipt background." }, { status: response.status });
    return new Response(response.body, { headers: { "Content-Type": response.headers.get("Content-Type") || "image/jpeg", "Cache-Control": "private, max-age=300" } });
}

export async function POST(request: Request) {
    if (!(await getUserIdFromToken())) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !IMAGE_TYPES.has(file.type) || file.size < 1 || file.size > MAX_SIZE) {
        return NextResponse.json({ error: "Upload a JPG, PNG, or WebP image up to 10 MB." }, { status: 400 });
    }
    const upload = new FormData();
    upload.set("file", file, file.name);
    const response = await fetch(`${DIRECTUS_URL}/files`, {
        method: "POST",
        headers: DIRECTUS_TOKEN ? { Authorization: `Bearer ${DIRECTUS_TOKEN}` } : undefined,
        body: upload,
    });
    if (!response.ok) return NextResponse.json({ error: "Unable to upload receipt background." }, { status: 503 });
    const id = String((await response.json()).data?.id || "");
    if (!id) return NextResponse.json({ error: "Upload returned no file ID." }, { status: 503 });
    return NextResponse.json({ id });
}
