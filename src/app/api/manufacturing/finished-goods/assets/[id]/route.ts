import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";

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

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const assetId = parseInt(id);
        if (isNaN(assetId)) {
            return NextResponse.json({ error: "Invalid asset ID" }, { status: 400 });
        }

        const payload = await request.json();

        const cleanRfid = payload.rfid_code !== undefined ? (payload.rfid_code?.trim() || null) : undefined;
        const cleanBarcode = payload.barcode !== undefined ? (payload.barcode?.trim() || null) : undefined;

        if (cleanRfid) {
            const checkRfidRes = await fetch(`${DIRECTUS_URL}/items/assets_and_equipment?filter[rfid_code][_eq]=${encodeURIComponent(cleanRfid)}&filter[id][_neq]=${assetId}`, { headers, cache: "no-store" });
            if (checkRfidRes.ok) {
                const checkRfidJson = await checkRfidRes.json();
                if (checkRfidJson.data && checkRfidJson.data.length > 0) {
                    return NextResponse.json({ error: "RFID Code already exists in the database." }, { status: 400 });
                }
            }
        }

        if (cleanBarcode) {
            const checkBarcodeRes = await fetch(`${DIRECTUS_URL}/items/assets_and_equipment?filter[barcode][_eq]=${encodeURIComponent(cleanBarcode)}&filter[id][_neq]=${assetId}`, { headers, cache: "no-store" });
            if (checkBarcodeRes.ok) {
                const checkBarcodeJson = await checkBarcodeRes.json();
                if (checkBarcodeJson.data && checkBarcodeJson.data.length > 0) {
                    return NextResponse.json({ error: "Barcode already exists in the database." }, { status: 400 });
                }
            }
        }

        // Map payload fields cleanly
        const manilaNow = (await getFormattedAssetDate())!;
        const formattedPayload: Record<string, unknown> = { quantity: 1, updated_at: manilaNow };
        if (payload.item_image !== undefined) formattedPayload.item_image = payload.item_image;
        if (payload.item_id !== undefined) formattedPayload.item_id = payload.item_id;
        if (cleanRfid !== undefined) formattedPayload.rfid_code = cleanRfid;
        if (cleanBarcode !== undefined) formattedPayload.barcode = cleanBarcode;
        formattedPayload.serial = null;
        if (payload.department !== undefined) formattedPayload.department = payload.department;
        if (payload.employee !== undefined) formattedPayload.employee = payload.employee;
        if (payload.cost_per_item !== undefined) {
            const cost = Number(payload.cost_per_item);
            formattedPayload.cost_per_item = cost;
            formattedPayload.total = cost;
        }
        if (payload.condition !== undefined) formattedPayload.condition = payload.condition;
        if (payload.life_span !== undefined) formattedPayload.life_span = payload.life_span !== null ? Number(payload.life_span) : null;
        if (payload.is_active_warning !== undefined) formattedPayload.is_active_warning = !!payload.is_active_warning;
        if (payload.is_active !== undefined) formattedPayload.is_active = !!payload.is_active;
        if (payload.date_acquired !== undefined) {
            formattedPayload.date_acquired = payload.date_acquired ? await getFormattedAssetDate(payload.date_acquired) : null;
        }

        const res = await fetch(`${DIRECTUS_URL}/items/assets_and_equipment/${assetId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(formattedPayload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to update asset: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        const updatedAsset = json.data;
        if (updatedAsset) {
            if (updatedAsset.is_active_warning !== undefined) updatedAsset.is_active_warning = Boolean(Number(updatedAsset.is_active_warning));
            if (updatedAsset.is_active !== undefined) updatedAsset.is_active = Boolean(Number(updatedAsset.is_active));
        }
        return NextResponse.json({ success: true, asset: updatedAsset });
    } catch (e) {
        console.error("API Error updating asset:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to update asset" }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const assetId = parseInt(id);
        if (isNaN(assetId)) {
            return NextResponse.json({ error: "Invalid asset ID" }, { status: 400 });
        }

        const res = await fetch(`${DIRECTUS_URL}/items/assets_and_equipment/${assetId}`, {
            method: "DELETE",
            headers
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to delete asset: ${res.status} - ${errText}`);
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("API Error deleting asset:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to delete asset" }, { status: 500 });
    }
}
