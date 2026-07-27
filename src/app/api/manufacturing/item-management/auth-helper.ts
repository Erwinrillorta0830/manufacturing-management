import { cookies } from "next/headers";
import { getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";

export async function getUserIdFromToken(): Promise<number | null> {
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
                const userId = payload?.id || payload?.user_id || payload?.sub || null;
                return userId ? Number(userId) : null;
            }
        }
    } catch (err) {
        console.error("Error parsing user token in getUserIdFromToken:", err);
    }
    return null;
}

export async function getManilaTimeString(): Promise<string> {
    const isoStr = await getISOStringInConfiguredTimezone();
    return isoStr.slice(0, 23);
}


