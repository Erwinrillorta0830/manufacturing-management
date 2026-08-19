import { NextResponse } from "next/server";
import { DIRECTUS_URL, DIRECTUS_TOKEN } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    try {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file || !(file instanceof Blob)) {
            return NextResponse.json({ error: "No valid file uploaded" }, { status: 400 });
        }

        const uploadHeaders: Record<string, string> = {};
        if (DIRECTUS_TOKEN) {
            uploadHeaders["Authorization"] = `Bearer ${DIRECTUS_TOKEN}`;
        }

        const directusFormData = new FormData();
        directusFormData.append("file", file);

        const res = await fetch(`${DIRECTUS_URL}/files`, {
            method: "POST",
            headers: uploadHeaders,
            body: directusFormData
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus file upload failed: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        return NextResponse.json(json);
    } catch (e) {
        console.error("API Error uploading asset image:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to upload image" },
            { status: 500 }
        );
    }
}
