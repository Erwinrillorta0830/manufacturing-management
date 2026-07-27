import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import {
    assertUniqueWorkCenterName,
    WorkCenterConflictError,
    WorkCenterDependencyError,
    WorkCenterValidationError,
    validateWorkCenterPayload
} from "./_validation";
import { getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";

interface UserRecord {
    user_id: number;
    user_fname?: string;
    user_lname?: string;
}

interface DirectusWorkCenter {
    work_center_id: number;
    work_center_name: string;
    asset_id?: number | Record<string, unknown> | null;
    department_id?: number | Record<string, unknown> | null;
    is_active?: string | number | boolean | null;
    created_by?: number | null;
    [key: string]: unknown;
}

export async function GET() {
    try {
        const [res, usersRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers?limit=-1&sort=-work_center_id&fields=*,asset_id.id,asset_id.item_image,asset_id.serial,asset_id.rfid_code,asset_id.barcode,asset_id.condition,asset_id.item_id.id,asset_id.item_id.item_name,department_id.department_id,department_id.department_name`, { headers, cache: "no-store" }),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        if (!res.ok) throw new Error(`Directus failed to fetch work stations: ${res.status}`);
        const json = await res.json();
        const workCenters = (json.data || []) as DirectusWorkCenter[];

        let usersList: UserRecord[] = [];
        if (usersRes && usersRes.ok) {
            try {
                const usersJson = await usersRes.json();
                usersList = (usersJson.data || []) as UserRecord[];
            } catch (err) {
                console.error("Error parsing users in GET work stations:", err);
            }
        }

        const mappedWorkCenters = workCenters.map((wc) => {
            const asset = wc.asset_id && typeof wc.asset_id === "object" ? wc.asset_id : null;
            const department = wc.department_id && typeof wc.department_id === "object" ? wc.department_id : null;

            const matchedUser = usersList.find((u) => Number(u.user_id) === Number(wc.created_by));
            const creatorName = matchedUser
                ? [matchedUser.user_fname, matchedUser.user_lname].filter(Boolean).join(" ") || "N/A"
                : "N/A";

            return {
                ...wc,
                asset_id: asset ? Number((asset as Record<string, unknown>).id) : wc.asset_id,
                department_id: department ? Number((department as Record<string, unknown>).department_id) : wc.department_id,
                is_active: wc.is_active === undefined || wc.is_active === null ? true : Boolean(Number(wc.is_active)),
                asset,
                department,
                created_by_name: creatorName
            };
        });

        return NextResponse.json(mappedWorkCenters);
    } catch (e) {
        console.error("API Error fetching work stations:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch work stations" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const payload = validateWorkCenterPayload(body);
        await assertUniqueWorkCenterName(String(payload.work_center_name));

        let userId: number | null = null;
        try {
            const cookieStore = await cookies();
            const token = cookieStore.get("vos_access_token")?.value;
            if (token) {
                const parts = token.split(".");
                if (parts.length >= 2) {
                    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                    while (base64.length % 4) base64 += "=";
                    const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
                    const tokenPayload = JSON.parse(jsonPayload);
                    userId = tokenPayload?.id || tokenPayload?.user_id || tokenPayload?.sub || null;
                }
            }
        } catch (err) {
            console.error("Error parsing user token in POST work station route:", err);
        }

        const manilaIsoString = await getISOStringInConfiguredTimezone();
        const directusPayload = {
            ...payload,
            created_by: userId ? Number(userId) : 24,
            created_at: manilaIsoString,
            updated_at: manilaIsoString
        };

        const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_work_centers`, {
            method: "POST",
            headers,
            body: JSON.stringify(directusPayload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to create work station: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        const newWc = json.data;
        if (newWc && newWc.is_active !== undefined) newWc.is_active = Boolean(Number(newWc.is_active));
        return NextResponse.json({ success: true, workCenter: newWc });
    } catch (e) {
        if (e instanceof WorkCenterValidationError) return NextResponse.json({ error: e.message, field: e.field }, { status: 400 });
        if (e instanceof WorkCenterConflictError) return NextResponse.json({ error: e.message }, { status: 409 });
        if (e instanceof WorkCenterDependencyError) return NextResponse.json({ error: e.message }, { status: 503 });
        console.error("API Error creating work station:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to create work station" }, { status: 500 });
    }
}

