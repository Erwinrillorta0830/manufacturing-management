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

interface DirectusItemType {
    id: number;
    type_name: string;
    created_by?: number | null;
    created_at?: string | null;
    updated_by?: number | null;
    updated_at?: string | null;
}

export async function GET() {
    try {
        const [res, usersRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/item_type?limit=-1&fields=id,type_name,created_by,created_at,updated_by,updated_at`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        if (!res.ok) {
            throw new Error(`Directus failed to fetch item types: ${res.status}`);
        }
        const json = await res.json();
        const types = json.data || [];

        let usersList: UserRecord[] = [];
        if (usersRes && usersRes.ok) {
            const usersJson = await usersRes.json();
            usersList = (usersJson.data || []) as UserRecord[];
        }

        const mappedTypes = (types as DirectusItemType[]).map((t) => {
            const createdUser = usersList.find((u) => Number(u.user_id) === Number(t.created_by));
            const updatedUser = usersList.find((u) => Number(u.user_id) === Number(t.updated_by));

            const createdByName = createdUser
                ? [createdUser.user_fname, createdUser.user_lname].filter(Boolean).join(" ") || "N/A"
                : "N/A";
            const updatedByName = updatedUser
                ? [updatedUser.user_fname, updatedUser.user_lname].filter(Boolean).join(" ") || "N/A"
                : "N/A";

            return {
                ...t,
                created_by_name: createdByName,
                updated_by_name: updatedByName
            };
        });

        return NextResponse.json(mappedTypes);
    } catch (e) {
        console.error("API Error fetching item types:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to fetch item types" },
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
            `${DIRECTUS_URL}/items/item_type?limit=-1&fields=type_name`,
            { headers, cache: "no-store" }
        );
        if (checkRes.ok) {
            const checkJson = await checkRes.json();
            const types = checkJson.data || [];
            const isDuplicate = types.some(
                (t: { type_name?: string }) =>
                    t.type_name?.trim().toLowerCase() === trimmedName.toLowerCase()
            );
            if (isDuplicate) {
                return NextResponse.json(
                    { error: "Item type already exists. Please choose a unique name." },
                    { status: 400 }
                );
            }
        }

        const userId = await getUserIdFromToken();
        const manilaTime = await getManilaTimeString();
        const res = await fetch(`${DIRECTUS_URL}/items/item_type`, {
            method: "POST",
            headers,
            body: JSON.stringify({ 
                type_name: trimmedName,
                created_by: userId ? Number(userId) : null,
                created_at: manilaTime,
                updated_at: manilaTime
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to create item type: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        return NextResponse.json({ success: true, type: json.data });
    } catch (e) {
        console.error("API Error creating item type:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to create item type" },
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

        // Case-insensitive duplicate check excluding this type
        const checkRes = await fetch(
            `${DIRECTUS_URL}/items/item_type?limit=-1&fields=id,type_name`,
            { headers, cache: "no-store" }
        );
        if (checkRes.ok) {
            const checkJson = await checkRes.json();
            const types = checkJson.data || [];
            const isDuplicate = types.some(
                (t: { id: number; type_name?: string }) =>
                    t.id !== Number(id) &&
                    t.type_name?.trim().toLowerCase() === trimmedName.toLowerCase()
            );
            if (isDuplicate) {
                return NextResponse.json(
                    { error: "Item type already exists. Please choose a unique name." },
                    { status: 400 }
                );
            }
        }

        const userId = await getUserIdFromToken();
        const manilaTime = await getManilaTimeString();
        const res = await fetch(`${DIRECTUS_URL}/items/item_type/${id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ 
                type_name: trimmedName,
                updated_by: userId ? Number(userId) : null,
                updated_at: manilaTime
            })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to update item type: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        return NextResponse.json({ success: true, type: json.data });
    } catch (e) {
        console.error("API Error updating item type:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to update item type" },
            { status: 500 }
        );
    }
}
