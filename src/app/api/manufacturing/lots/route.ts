import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { Lot } from "@/modules/manufacturing-management/lot-management/types";
 

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    // Auto-register "Lot Management" module in Directus sidebar
    try {
        const checkRes = await fetch(
            `${DIRECTUS_URL}/items/modules?filter[slug][_eq]=lot-management`,
            { headers }
        );
        if (checkRes.ok) {
            const checkJson = await checkRes.json();
            if (!checkJson.data || checkJson.data.length === 0) {
                await fetch(`${DIRECTUS_URL}/items/modules`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({
                        title: "Lot Management",
                        slug: "lot-management",
                        base_path: "/mm/lot-management",
                        icon_name: "Warehouse",
                        status: "active",
                        sort: 7,
                        subsystem_id: 8
                    })
                });
                console.log("[Auto-Registration] Registered Lot Management module in Directus modules collection");
            }
        }
    } catch (err) {
        console.error("[Auto-Registration] Failed to check/register Lot Management module:", err);
    }

    // Main fetch
    try {
        const fields = [
            "*",
            "inventory_type_id.id",
            "inventory_type_id.name"
        ].join(",");

        const timestamp = Date.now();
        const [res, usersRes, unitsRes] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/lots?limit=-1&sort=-updated_at,-created_at,-lot_id&fields=${fields}&_t=${timestamp}`,
                { headers, cache: "no-store" }
            ),
            fetch(
                `${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname&_t=${timestamp}`,
                { headers, cache: "no-store" }
            ).catch(() => null),
            fetch(
                `${DIRECTUS_URL}/items/units?limit=-1&fields=unit_id,unit_name,unit_shortcut,sku_code&_t=${timestamp}`,
                { headers, cache: "no-store" }
            ).catch(() => null)
        ]);

        if (!res.ok) {
            throw new Error(`Directus failed to fetch lots: ${res.status}`);
        }

        const json = await res.json();
        const rawLots: Record<string, unknown>[] = json.data || [];

        let usersList: { user_id: number; user_fname?: string; user_lname?: string }[] = [];
        if (usersRes && usersRes.ok) {
            try {
                const usersJson = await usersRes.json();
                usersList = usersJson.data || [];
            } catch (err) {
                console.error("Error parsing users in GET lots:", err);
            }
        }

        let unitsList: { unit_id: number; unit_name?: string; unit_shortcut?: string }[] = [];
        if (unitsRes && unitsRes.ok) {
            try {
                const unitsJson = await unitsRes.json();
                unitsList = unitsJson.data || [];
            } catch (err) {
                console.error("Error parsing units in GET lots:", err);
            }
        }

        const mappedLots: Lot[] = rawLots.map((row) => {
            let inventoryTypeId = 0;
            let inventoryTypeName = "Unknown";

            const invType = row.inventory_type_id as { id?: number; name?: string } | number | null;
            if (invType && typeof invType === "object") {
                inventoryTypeId = Number(invType.id ?? 0);
                inventoryTypeName = invType.name || "Unknown";
            } else if (typeof invType === "number") {
                inventoryTypeId = invType;
            }

            let uomId: number | null = null;
            let uomName = "";
            let uomShortcut = "";

            const rawUnit = row.unit_id !== undefined && row.unit_id !== null ? row.unit_id : row.uom_id;
            if (rawUnit && typeof rawUnit === "object") {
                const obj = rawUnit as { unit_id?: number; id?: number; unit_name?: string; unit_shortcut?: string };
                uomId = obj.unit_id ?? obj.id ?? null;
                uomName = obj.unit_name || "";
                uomShortcut = obj.unit_shortcut || obj.unit_name || "";
            } else if (rawUnit !== null && rawUnit !== undefined && rawUnit !== "") {
                const num = Number(rawUnit);
                if (!isNaN(num)) uomId = num;
            }

            // Always cross-reference with unitsList to guarantee resolved name/shortcut
            if (uomId !== null) {
                const matchedUnit = unitsList.find((u) => Number(u.unit_id) === Number(uomId));
                if (matchedUnit) {
                    uomName = matchedUnit.unit_name || uomName;
                    uomShortcut = matchedUnit.unit_shortcut || matchedUnit.unit_name || uomShortcut;
                }
            }

            let createdBy = "System";
            if (row.created_by) {
                const userObj = row.created_by as { user_id?: number } | number;
                const userIdNum = typeof userObj === "object" && userObj !== null
                    ? userObj.user_id
                    : Number(userObj);
                const matchedUser = usersList.find((u) => Number(u.user_id) === Number(userIdNum));
                if (matchedUser) {
                    createdBy = [matchedUser.user_fname, matchedUser.user_lname].filter(Boolean).join(" ") || `User #${userIdNum}`;
                } else {
                    createdBy = `User #${userIdNum}`;
                }
            }

            let updatedBy = "System";
            if (row.updated_by) {
                const userObj = row.updated_by as { user_id?: number } | number;
                const userIdNum = typeof userObj === "object" && userObj !== null
                    ? userObj.user_id
                    : Number(userObj);
                const matchedUser = usersList.find((u) => Number(u.user_id) === Number(userIdNum));
                if (matchedUser) {
                    updatedBy = [matchedUser.user_fname, matchedUser.user_lname].filter(Boolean).join(" ") || `User #${userIdNum}`;
                } else {
                    updatedBy = `User #${userIdNum}`;
                }
            }

            return {
                lotId: Number(row.lot_id),
                lotName: String(row.lot_name || ""),
                inventoryTypeId,
                inventoryTypeName,
                uomId,
                uomName,
                uomShortcut,
                maxBatchCapacity: Number(row.max_batch_capacity || 0),
                createdAt: String(row.created_at || ""),
                updatedAt: String(row.updated_at || ""),
                createdBy,
                updatedBy
            };
        });

        return NextResponse.json(mappedLots);
    } catch (e) {
        console.error("API Error fetching lots:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to fetch lots" },
            { status: 500 }
        );
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { lot_name, inventory_type_id, max_batch_capacity } = body;
        const rawUnitId = body.unit_id !== undefined ? body.unit_id : body.uom_id;

        if (!lot_name || typeof lot_name !== "string" || !lot_name.trim()) {
            return NextResponse.json(
                { error: "lot_name is required and must be a non-empty string" },
                { status: 400 }
            );
        }

        if (typeof inventory_type_id !== "number") {
            return NextResponse.json(
                { error: "inventory_type_id is required and must be a number" },
                { status: 400 }
            );
        }

        if (typeof max_batch_capacity !== "number" || max_batch_capacity <= 0) {
            return NextResponse.json(
                { error: "max_batch_capacity must be a positive number greater than 0" },
                { status: 400 }
            );
        }

        // Get logged in user ID from secure access token cookie
        let userId: number | null = null;
        try {
            const cookieStore = await cookies();
            const token = cookieStore.get("vos_access_token")?.value;
            if (token) {
                const parts = token.split(".");
                if (parts.length >= 2) {
                    const base64Url = parts[1];
                    let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
                    while (base64.length % 4) base64 += "=";
                    const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
                    const payload = JSON.parse(jsonPayload);
                    userId = payload?.id || payload?.user_id || payload?.sub || null;
                }
            }
        } catch (err) {
            console.error("Error parsing user token in POST lot route:", err);
        }

        // Check for duplicate lot name (case-insensitive)
        const duplicateCheckRes = await fetch(
            `${DIRECTUS_URL}/items/lots?limit=-1&fields=lot_name`,
            { headers, cache: "no-store" }
        );
        if (duplicateCheckRes.ok) {
            const duplicateJson = await duplicateCheckRes.json();
            const existingLots = duplicateJson.data || [];
            const isDuplicate = existingLots.some(
                (l: { lot_name?: string }) =>
                    l.lot_name?.trim().toLowerCase() === lot_name.trim().toLowerCase()
            );
            if (isDuplicate) {
                return NextResponse.json(
                    { error: `A lot with the name "${lot_name.trim()}" already exists` },
                    { status: 409 }
                );
            }
        }

        const utcIsoString = new Date().toISOString();

        const postBody: Record<string, unknown> = {
            lot_name: lot_name.trim(),
            inventory_type_id,
            max_batch_capacity,
            created_by: userId ? Number(userId) : 24, // Fallback to seed user ID 24 if no active token
            created_at: utcIsoString,
            updated_at: utcIsoString
        };

        if (rawUnitId !== undefined && rawUnitId !== null && rawUnitId !== "") {
            postBody.unit_id = Number(rawUnitId);
        }

        let res = await fetch(`${DIRECTUS_URL}/items/lots`, {
            method: "POST",
            headers,
            body: JSON.stringify(postBody)
        });

        // If Directus fails because unit_id is named uom_id in schema, retry with uom_id
        if (!res.ok && postBody.unit_id !== undefined) {
            const errTxt = await res.text();
            if (errTxt.includes("unit_id")) {
                postBody.uom_id = postBody.unit_id;
                delete postBody.unit_id;
                res = await fetch(`${DIRECTUS_URL}/items/lots`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(postBody)
                });
            }
            if (!res.ok) {
                throw new Error(`Directus failed to create lot: ${res.status} - ${errTxt}`);
            }
        } else if (!res.ok) {
            const errTxt = await res.text();
            throw new Error(`Directus failed to create lot: ${res.status} - ${errTxt}`);
        }

        const resJson = await res.json();
        const saved = resJson.data;

        return NextResponse.json({ success: true, data: saved });
    } catch (e) {
        console.error("API Error creating lot:", e);
        return NextResponse.json(
            { error: (e as { message?: string }).message || "Failed to create lot" },
            { status: 500 }
        );
    }
}


