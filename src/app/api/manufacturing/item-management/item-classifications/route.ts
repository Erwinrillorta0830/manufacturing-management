import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getUserIdFromToken, getManilaTimeString } from "../auth-helper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UserRecord {
    user_id: number;
    user_fname?: string | null;
    user_lname?: string | null;
}

interface DirectusItemClassification {
    id: number;
    classification_name: string;
    created_by?: number | null;
    created_at?: string | null;
    updated_by?: number | null;
    updated_at?: string | null;
}

export async function GET() {
    try {
        const [res, usersRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/item_classification?limit=-1&fields=id,classification_name,created_by,created_at,updated_by,updated_at`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        if (!res.ok) {
            throw new Error(`Directus failed to fetch item classifications: ${res.status}`);
        }
        const json = await res.json();
        const classifications = json.data || [];

        let usersList: UserRecord[] = [];
        if (usersRes && usersRes.ok) {
            const usersJson = await usersRes.json();
            usersList = (usersJson.data || []) as UserRecord[];
        }

        const mappedClassifications = (classifications as DirectusItemClassification[]).map((c) => {
            const createdUser = usersList.find((u) => Number(u.user_id) === Number(c.created_by));
            const updatedUser = usersList.find((u) => Number(u.user_id) === Number(c.updated_by));

            const createdByName = createdUser
                ? [createdUser.user_fname, createdUser.user_lname].filter(Boolean).join(" ") || "N/A"
                : "N/A";
            const updatedByName = updatedUser
                ? [updatedUser.user_fname, updatedUser.user_lname].filter(Boolean).join(" ") || "N/A"
                : "N/A";

            return {
                ...c,
                created_by_name: createdByName,
                updated_by_name: updatedByName
            };
        });

        return NextResponse.json(mappedClassifications);
    } catch (e) {
        console.error("API Error fetching item classifications:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to fetch item classifications" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name } = body;

        if (!name || !name.trim()) {
            return NextResponse.json({ error: "Missing required field: name" }, { status: 400 });
        }

        const trimmedName = name.trim();

        // Case-insensitive duplicate check
        const checkRes = await fetch(
            `${DIRECTUS_URL}/items/item_classification?limit=-1&fields=classification_name`,
            { headers, cache: "no-store" }
        );
        if (checkRes.ok) {
            const checkJson = await checkRes.json();
            const classifications = checkJson.data || [];
            const isDuplicate = classifications.some(
                (c: { classification_name?: string }) =>
                    c.classification_name?.trim().toLowerCase() === trimmedName.toLowerCase()
            );
            if (isDuplicate) {
                return NextResponse.json(
                    { error: "Item classification already exists. Please choose a unique name." },
                    { status: 400 }
                );
            }
        }

        const userId = await getUserIdFromToken();
        const manilaTime = await getManilaTimeString();
        const res = await fetch(`${DIRECTUS_URL}/items/item_classification`, {
            method: "POST",
            headers,
            body: JSON.stringify({ 
                classification_name: trimmedName,
                created_by: userId ? Number(userId) : null,
                created_at: manilaTime,
                updated_at: manilaTime
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to create item classification: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        return NextResponse.json({ success: true, classification: json.data });
    } catch (e) {
        console.error("API Error creating item classification:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to create item classification" },
            { status: 500 }
        );
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { id, name } = body;

        if (!id) {
            return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
        }
        if (!name || !name.trim()) {
            return NextResponse.json({ error: "Missing required field: name" }, { status: 400 });
        }

        const trimmedName = name.trim();

        // Case-insensitive duplicate check excluding this classification
        const checkRes = await fetch(
            `${DIRECTUS_URL}/items/item_classification?limit=-1&fields=id,classification_name`,
            { headers, cache: "no-store" }
        );
        if (checkRes.ok) {
            const checkJson = await checkRes.json();
            const classifications = checkJson.data || [];
            const isDuplicate = classifications.some(
                (c: { id: number; classification_name?: string }) =>
                    c.id !== Number(id) &&
                    c.classification_name?.trim().toLowerCase() === trimmedName.toLowerCase()
            );
            if (isDuplicate) {
                return NextResponse.json(
                    { error: "Item classification already exists. Please choose a unique name." },
                    { status: 400 }
                );
            }
        }

        const userId = await getUserIdFromToken();
        const manilaTime = await getManilaTimeString();
        const res = await fetch(`${DIRECTUS_URL}/items/item_classification/${id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ 
                classification_name: trimmedName,
                updated_by: userId ? Number(userId) : null,
                updated_at: manilaTime
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to update item classification: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        return NextResponse.json({ success: true, classification: json.data });
    } catch (e) {
        console.error("API Error updating item classification:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to update item classification" },
            { status: 500 }
        );
    }
}
