import { cookies } from "next/headers";

export const SPRING_API_BASE = process.env.SPRING_API_BASE_URL || "";

export async function getAuthToken(req?: Request | { headers: Headers; cookies?: { get: (name: string) => { value?: string } | undefined } }): Promise<string | null> {
    try {
        if (req) {
            const authHeader = req.headers.get("authorization");
            if (authHeader && authHeader.startsWith("Bearer ")) {
                return authHeader.substring(7).trim();
            }
            if ("cookies" in req && req.cookies && typeof req.cookies.get === "function") {
                const cVal =
                    req.cookies.get("vos_access_token")?.value ||
                    req.cookies.get("springboot_token")?.value ||
                    req.cookies.get("access_token")?.value ||
                    req.cookies.get("token")?.value;
                if (cVal) return cVal;
            }
        }
        const cookieStore = await cookies();
        return (
            cookieStore.get("vos_access_token")?.value ||
            cookieStore.get("springboot_token")?.value ||
            cookieStore.get("access_token")?.value ||
            cookieStore.get("token")?.value ||
            null
        );
    } catch {
        return null;
    }
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

export interface LiveOnhandResult {
    onhandQuantity: number;
    totalIn: number;
    totalOut: number;
    error?: string | null;
}

/**
 * Queries Spring Boot for live on-hand quantity for a given product at a branch.
 * Strictly adheres to rule: no silent mock fallback.
 */
export async function fetchLiveProductOnhand(
    branchId: number,
    productId: number,
    token?: string | null
): Promise<LiveOnhandResult> {
    if (!SPRING_API_BASE) {
        return {
            onhandQuantity: 0,
            totalIn: 0,
            totalOut: 0,
            error: "SPRING_API_BASE_URL is not configured",
        };
    }

    const bearerToken = token || (await getAuthToken());
    const reqHeaders: Record<string, string> = {
        Accept: "application/json",
    };
    if (bearerToken) {
        reqHeaders["Authorization"] = `Bearer ${bearerToken}`;
        reqHeaders["Cookie"] = `vos_access_token=${bearerToken}`;
    }

    try {
        const springUrl = `${SPRING_API_BASE}/api/mm-product-onhand/filter?branch=${encodeURIComponent(
            String(branchId)
        )}&product=${encodeURIComponent(String(productId))}`;

        const res = await fetch(springUrl, {
            headers: reqHeaders,
            cache: "no-store",
        });

        if (!res.ok) {
            const errTxt = await res.text().catch(() => "");
            return {
                onhandQuantity: 0,
                totalIn: 0,
                totalOut: 0,
                error: `Spring Boot returned HTTP ${res.status}: ${errTxt || res.statusText}`,
            };
        }

        const data = await res.json();
        const list = Array.isArray(data) ? data : data?.data || [];
        if (list.length === 0) {
            return { onhandQuantity: 0, totalIn: 0, totalOut: 0, error: null };
        }

        let onhand = 0;
        let totalIn = 0;
        let totalOut = 0;
        for (const item of list) {
            onhand += Number(item.onhandQuantity ?? item.onhand ?? 0);
            totalIn += Number(item.totalQuantityIn ?? item.totalIn ?? 0);
            totalOut += Number(item.totalQuantityOut ?? item.totalOut ?? 0);
        }

        return {
            onhandQuantity: isNaN(onhand) ? 0 : onhand,
            totalIn: isNaN(totalIn) ? 0 : totalIn,
            totalOut: isNaN(totalOut) ? 0 : totalOut,
            error: null,
        };
    } catch (err) {
        console.error("[Sales Order Fulfillment] Spring Boot on-hand fetch error:", err);
        return {
            onhandQuantity: 0,
            totalIn: 0,
            totalOut: 0,
            error: (err as Error).message || "Connection to Spring Boot failed",
        };
    }
}
