import { cookies } from "next/headers";
import { getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";
import { COOKIE_NAME, decodeJwtPayload } from "@/lib/auth-utils";

function asPositiveUserId(value: unknown): number | null {
    if (typeof value === "number") {
        return Number.isSafeInteger(value) && value > 0 ? value : null;
    }

    if (typeof value === "string" && /^\d+$/.test(value.trim())) {
        const parsed = Number(value.trim());
        return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
    }

    return null;
}

export async function getUserIdFromToken(): Promise<number | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get(COOKIE_NAME)?.value;
        if (!token) return null;

        const payload = decodeJwtPayload(token);
        if (!payload) return null;

        for (const candidate of [payload.id, payload.user_id, payload.userId, payload.sub]) {
            const userId = asPositiveUserId(candidate);
            if (userId) return userId;
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


