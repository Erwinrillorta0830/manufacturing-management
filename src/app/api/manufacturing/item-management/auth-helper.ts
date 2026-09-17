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
        const token = cookieStore.get(COOKIE_NAME)?.value || cookieStore.get("vos_access_token")?.value || cookieStore.get("access_token")?.value;
        if (!token) return null;

        let jwtUserId: number | null = null;
        try {
            const parts = token.split(".");
            if (parts.length >= 2) {
                const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
                const json = Buffer.from(padded, "base64").toString("utf8");
                const payload = JSON.parse(json);
                const rawId = payload.user_id || payload.userId || payload.id || payload.sub;
                jwtUserId = asPositiveUserId(rawId);
            }
        } catch {
            // ignore decode error
        }

        const springBase = process.env.SPRING_API_BASE_URL?.replace(/\/$/, "");
        if (!springBase) return jwtUserId;

        const response = await fetch(`${springBase}/auth/me`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json"
            },
            cache: "no-store",
            signal: AbortSignal.timeout(3000)
        });

        if (!response.ok) return jwtUserId;

        const body = await response.json().catch(() => null) as unknown;
        const user = body !== null && typeof body === "object"
            ? (body as { data?: unknown }).data ?? body
            : null;
        if (user === null || typeof user !== "object") return jwtUserId;

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


