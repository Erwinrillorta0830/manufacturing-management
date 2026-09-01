import { cookies } from "next/headers";

export const SPRING_API_BASE = process.env.SPRING_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "http://100.95.246.18:8188";

export async function getAuthToken(): Promise<string | null> {
    try {
        const cookieStore = await cookies();
        return (
            cookieStore.get("vos_access_token")?.value ||
            cookieStore.get("access_token")?.value ||
            cookieStore.get("directus_token")?.value ||
            null
        );
    } catch {
        return null;
    }
}

export async function getSpringAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
    };
    const token = await getAuthToken();
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
        headers["Cookie"] = `vos_access_token=${token}`;
    }
    return headers;
}

export async function getUserIdFromToken(): Promise<number | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        if (!token) return null;
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const p = parts[1];
        const b64 = p.replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const json = Buffer.from(padded, "base64").toString("utf8");
        const payload = JSON.parse(json);
        return Number(payload.user_id || payload.userId || payload.sub) || null;
    } catch {
        return null;
    }
}
