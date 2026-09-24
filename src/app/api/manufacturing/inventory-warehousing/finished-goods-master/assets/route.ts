import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";

export async function GET() {

    try {
        const [res, usersRes] = await Promise.all([
            fetch(
                `${DIRECTUS_URL}/items/assets_and_equipment?limit=-1&sort=-id&fields=*,item_id.id,item_id.item_name,department.department_id,department.department_name`,
                { headers, cache: "no-store" }
            ),
            fetch(`${DIRECTUS_URL}/items/user?limit=-1&fields=user_id,user_fname,user_lname`, { headers, cache: "no-store" }).catch(() => null)
        ]);

        if (!res.ok) throw new Error(`Directus failed to fetch assets: ${res.status}`);
        const json = await res.json();
        const assets = json.data || [];

        interface UserRecord {
            user_id: number | string;
            user_fname?: string;
            user_lname?: string;
        }

        let usersList: UserRecord[] = [];
        if (usersRes && usersRes.ok) {
            try {
                const usersJson = await usersRes.json();
                usersList = usersJson.data || [];
            } catch (err) {
                console.error("Error parsing users in GET assets:", err);
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mappedAssets = assets.map((a: any) => {
            const matchedUser = usersList.find((u) => Number(u.user_id) === Number(a.created_by));
            let creatorName = "N/A";
            if (matchedUser) {
                creatorName = [matchedUser.user_fname, matchedUser.user_lname].filter(Boolean).join(" ") || "N/A";
            }
            return {
                ...a,
                is_active_warning: a.is_active_warning === undefined || a.is_active_warning === null ? false : Boolean(Number(a.is_active_warning)),
                is_active: a.is_active === undefined || a.is_active === null ? true : Boolean(Number(a.is_active)),
                created_by_name: creatorName
            };
        });
        return NextResponse.json(mappedAssets);
    } catch (e) {
        console.error("API Error fetching assets:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch assets" }, { status: 500 });
    }
}

async function getFormattedAssetDate(dateString?: string | null): Promise<string | null> {
    if (dateString === null) return null;
    if (!dateString) {
        return await getISOStringInConfiguredTimezone();
    }
    const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) {
        return await getISOStringInConfiguredTimezone();
    }
    const [, year, month, day] = match;
    const now = new Date();
    const d = new Date(now);
    d.setFullYear(parseInt(year), parseInt(month) - 1, parseInt(day));
    return await getISOStringInConfiguredTimezone(d);
}

export async function POST(request: Request) {
    try {
        const payload = await request.json();
        
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
                    const userPayload = JSON.parse(jsonPayload);
                    userId = userPayload?.id || userPayload?.user_id || userPayload?.sub || null;
                }
            }
        } catch (err) {
            console.error("Error parsing user token in POST assets route:", err);
        }

        const cleanRfid = payload.rfid_code?.trim() || null;
        const cleanBarcode = payload.barcode?.trim() || null;

        if (cleanRfid) {
            const checkRfidRes = await fetch(`${DIRECTUS_URL}/items/assets_and_equipment?filter[rfid_code][_eq]=${encodeURIComponent(cleanRfid)}`, { headers, cache: "no-store" });
            if (checkRfidRes.ok) {
                const checkRfidJson = await checkRfidRes.json();
                if (checkRfidJson.data && checkRfidJson.data.length > 0) {
                    return NextResponse.json({ error: "RFID Code already exists in the database." }, { status: 400 });
                }
            }
        }

        if (cleanBarcode) {
            const checkBarcodeRes = await fetch(`${DIRECTUS_URL}/items/assets_and_equipment?filter[barcode][_eq]=${encodeURIComponent(cleanBarcode)}`, { headers, cache: "no-store" });
            if (checkBarcodeRes.ok) {
                const checkBarcodeJson = await checkBarcodeRes.json();
                if (checkBarcodeJson.data && checkBarcodeJson.data.length > 0) {
                    return NextResponse.json({ error: "Barcode already exists in the database." }, { status: 400 });
                }
            }
        }

        // Clean payload fields (registration of one asset at a time)
        const costVal = payload.cost_per_item !== undefined ? Number(payload.cost_per_item) : 0;
        const manilaNow = (await getFormattedAssetDate())!;

        const formattedPayload = {
            item_image: payload.item_image || null,
            item_id: payload.item_id || null,
            quantity: 1,
            rfid_code: cleanRfid,
            barcode: cleanBarcode,
            serial: null,
            department: payload.department || null,
            employee: payload.employee || null,
            cost_per_item: costVal,
            total: costVal,
            condition: payload.condition || "Good",
            life_span: payload.life_span !== undefined ? Number(payload.life_span) : null,
            is_active_warning: payload.is_active_warning !== undefined ? !!payload.is_active_warning : false,
            is_active: payload.is_active !== undefined ? !!payload.is_active : true,
            date_acquired: payload.date_acquired ? await getFormattedAssetDate(payload.date_acquired) : manilaNow,
            date_created: manilaNow,
            created_at: manilaNow,
            updated_at: manilaNow,
            created_by: userId ? Number(userId) : 24
        };

        const res = await fetch(`${DIRECTUS_URL}/items/assets_and_equipment`, {
            method: "POST",
            headers,
            body: JSON.stringify(formattedPayload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to create asset: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        const newAsset = json.data;
        if (newAsset) {
            if (newAsset.is_active_warning !== undefined) newAsset.is_active_warning = Boolean(Number(newAsset.is_active_warning));
            if (newAsset.is_active !== undefined) newAsset.is_active = Boolean(Number(newAsset.is_active));
        }
        return NextResponse.json({ success: true, asset: newAsset });
    } catch (e) {
        console.error("API Error creating asset:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to create asset" }, { status: 500 });
    }
}

