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

interface DirectusItem {
    id: number;
    item_name: string;
    item_type?: number | { id: number; type_name: string } | null;
    item_classification?: number | { id: number; classification_name: string } | null;
    created_by?: number | null;
    created_at?: string | null;
    updated_by?: number | null;
    updated_at?: string | null;
}

export async function GET() {
    // Auto-register "Item Management" module in Directus modules list if not exists
    try {
        const checkRes = await fetch(
            `${DIRECTUS_URL}/items/modules?filter[slug][_eq]=item-management`,
            { headers }
        );
        if (checkRes.ok) {
            const checkJson = await checkRes.json();
            if (!checkJson.data || checkJson.data.length === 0) {
                await fetch(`${DIRECTUS_URL}/items/modules`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        title: "Item Management",
                        slug: "item-management",
                        base_path: "/mm/item-management",
                        icon_name: "Boxes",
                        status: "active",
                        sort: 8,
                        subsystem_id: 8 // Manufacturing Management
                    })
                });
                console.log("[Auto-Registration] Registered Item Management module in Directus");
            }
        }
    } catch (err) {
        console.error("[Auto-Registration] Failed to check/register Item Management module:", err);
    }

    try {
        const [res, usersRes] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/items?limit=-1&fields=id,item_name,item_type.id,item_type.type_name,item_classification.id,item_classification.classification_name,created_by,created_at,updated_by,updated_at`,
                { headers, cache: "no-store" }
            ),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        if (!res.ok) {
            throw new Error(`Directus failed to fetch items: ${res.status}`);
        }
        const json = await res.json();
        const items = json.data || [];

        let usersList: UserRecord[] = [];
        if (usersRes && usersRes.ok) {
            const usersJson = await usersRes.json();
            usersList = (usersJson.data || []) as UserRecord[];
        }

        const mappedItems = (items as DirectusItem[]).map((item) => {
            const createdUser = usersList.find((u) => Number(u.user_id) === Number(item.created_by));
            const updatedUser = usersList.find((u) => Number(u.user_id) === Number(item.updated_by));

            const createdByName = createdUser
                ? [createdUser.user_fname, createdUser.user_lname].filter(Boolean).join(" ") || "N/A"
                : "N/A";
            const updatedByName = updatedUser
                ? [updatedUser.user_fname, updatedUser.user_lname].filter(Boolean).join(" ") || "N/A"
                : (createdByName !== "N/A" ? createdByName : "N/A");

            return {
                ...item,
                created_by_name: createdByName,
                updated_by_name: updatedByName
            };
        });

        return NextResponse.json(mappedItems);
    } catch (e) {
        console.error("API Error fetching items:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to fetch items" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { item_name, item_type, item_classification } = body;

        if (!item_name || !item_name.trim()) {
            return NextResponse.json({ error: "Missing required field: item_name" }, { status: 400 });
        }
        if (!item_type) {
            return NextResponse.json({ error: "Missing required field: item_type" }, { status: 400 });
        }
        if (!item_classification) {
            return NextResponse.json({ error: "Missing required field: item_classification" }, { status: 400 });
        }

        const trimmedName = item_name.trim();

        // Case-insensitive duplicate check via Directus fetch
        const checkRes = await fetch(
            `${DIRECTUS_URL}/items/items?limit=-1&fields=item_name`,
            { headers, cache: "no-store" }
        );
        if (checkRes.ok) {
            const checkJson = await checkRes.json();
            const items = checkJson.data || [];
            const isDuplicate = items.some(
                (item: { item_name?: string }) =>
                    item.item_name?.trim().toLowerCase() === trimmedName.toLowerCase()
            );
            if (isDuplicate) {
                return NextResponse.json(
                    { error: "Item name already exists. Please choose a unique name." },
                    { status: 400 }
                );
            }
        }

        const userId = await getUserIdFromToken();
        const manilaTime = await getManilaTimeString();
        const payload = {
            item_name: trimmedName,
            item_type: Number(item_type),
            item_classification: Number(item_classification),
            created_by: userId ? Number(userId) : null,
            created_at: manilaTime,
            updated_by: userId ? Number(userId) : null,
            updated_at: manilaTime
        };

        const res = await fetch(`${DIRECTUS_URL}/items/items`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to create item: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        return NextResponse.json({ success: true, item: json.data });
    } catch (e) {
        console.error("API Error creating item:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to create item" },
            { status: 500 }
        );
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { id, item_name, item_type, item_classification } = body;

        if (!id) {
            return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
        }
        if (!item_name || !item_name.trim()) {
            return NextResponse.json({ error: "Missing required field: item_name" }, { status: 400 });
        }
        if (!item_type) {
            return NextResponse.json({ error: "Missing required field: item_type" }, { status: 400 });
        }
        if (!item_classification) {
            return NextResponse.json({ error: "Missing required field: item_classification" }, { status: 400 });
        }

        const trimmedName = item_name.trim();

        // Case-insensitive duplicate check excluding this item
        const checkRes = await fetch(
            `${DIRECTUS_URL}/items/items?limit=-1&fields=id,item_name`,
            { headers, cache: "no-store" }
        );
        if (checkRes.ok) {
            const checkJson = await checkRes.json();
            const items = checkJson.data || [];
            const isDuplicate = items.some(
                (item: { id: number; item_name?: string }) =>
                    item.id !== Number(id) &&
                    item.item_name?.trim().toLowerCase() === trimmedName.toLowerCase()
            );
            if (isDuplicate) {
                return NextResponse.json(
                    { error: "Item name already exists. Please choose a unique name." },
                    { status: 400 }
                );
            }
        }

        const userId = await getUserIdFromToken();
        const manilaTime = await getManilaTimeString();
        const payload = {
            item_name: trimmedName,
            item_type: Number(item_type),
            item_classification: Number(item_classification),
            updated_by: userId ? Number(userId) : null,
            updated_at: manilaTime
        };

        const res = await fetch(`${DIRECTUS_URL}/items/items/${id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to update item: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        return NextResponse.json({ success: true, item: json.data });
    } catch (e) {
        console.error("API Error updating item:", e);
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to update item" },
            { status: 500 }
        );
    }
}
