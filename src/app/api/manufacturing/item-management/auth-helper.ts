import { cookies } from "next/headers";
import { getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/services/core-api.service";
import { COOKIE_NAME } from "@/lib/auth-utils";

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
        const springBase = process.env.SPRING_API_BASE_URL?.replace(/\/$/, "");
        if (!token || !springBase) return null;

        const response = await fetch(`${springBase}/auth/me`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json"
            },
            cache: "no-store",
            signal: AbortSignal.timeout(5000)
        });

        if (!response.ok) return null;

        const body = await response.json().catch(() => null) as unknown;
        const user = body !== null && typeof body === "object"
            ? (body as { data?: unknown }).data ?? body
            : null;
        if (user === null || typeof user !== "object") return null;

        const typedUser = user as { id?: unknown; isDeleted?: unknown; is_deleted?: unknown };
        const userId = asPositiveUserId(typedUser.id);
        const deleted = typedUser.isDeleted ?? typedUser.is_deleted;
        if (!userId || deleted === true || deleted === 1 || deleted === "1" || deleted === "true") {
            return null;
        }

        return userId;
    } catch (err) {
        console.error("Error verifying user token in getUserIdFromToken:", err);
    }
    return null;
}

export async function getManilaTimeString(): Promise<string> {
    const isoStr = await getISOStringInConfiguredTimezone();
    return isoStr.slice(0, 23);
}


