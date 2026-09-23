import { cookies } from "next/headers";
import { headers as directusHeaders } from "@/app/api/manufacturing/directus-api";

const MODULE_PATH = "/mm/reports/production-output-variance-report";

interface AuthenticatedUser {
    id?: unknown;
    admin?: unknown;
    isAdmin?: unknown;
    role?: unknown;
}

interface UserModuleAccess {
    module_id?: { base_path?: unknown } | number | null;
}

export type ReportAccessResult =
    | { ok: true }
    | { ok: false; status: number; error: string };

function positiveId(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function authorizeProductionOutputVarianceReport(): Promise<ReportAccessResult> {
    const token = (await cookies()).get("vos_access_token")?.value;
    if (!token) return { ok: false, status: 401, error: "Authentication is required." };

    const springBase = process.env.SPRING_API_BASE_URL?.replace(/\/+$/, "");
    if (!springBase) return { ok: false, status: 503, error: "Authentication service is not configured." };

    let authResponse: Response;
    try {
        authResponse = await fetch(`${springBase}/auth/me`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            cache: "no-store"
        });
    } catch {
        return { ok: false, status: 503, error: "Authentication service is unavailable." };
    }
    if (authResponse.status === 401 || authResponse.status === 403) {
        return { ok: false, status: 401, error: "Your session is invalid or has expired." };
    }
    if (!authResponse.ok) return { ok: false, status: 503, error: "Authentication service is unavailable." };

    let user: AuthenticatedUser;
    try {
        user = await authResponse.json() as AuthenticatedUser;
    } catch {
        return { ok: false, status: 503, error: "Authentication service returned an invalid response." };
    }
    const userId = positiveId(user.id);
    if (!userId) return { ok: false, status: 401, error: "Unable to verify the current user." };

    const isAdmin = user.admin === true || user.isAdmin === true || user.role === "ADMIN";
    if (isAdmin) return { ok: true };

    const params = new URLSearchParams({
        "filter[user_id][_eq]": String(userId),
        fields: "module_id.base_path",
        limit: "-1"
    });
    const directusBase = (process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL)?.replace(/\/+$/, "");
    if (!directusBase) return { ok: false, status: 503, error: "Module authorization service is not configured." };

    let accessResponse: Response;
    try {
        accessResponse = await fetch(`${directusBase}/items/user_access_modules?${params.toString()}`, {
            headers: directusHeaders,
            cache: "no-store"
        });
    } catch {
        return { ok: false, status: 503, error: "Module authorization service is unavailable." };
    }
    if (!accessResponse.ok) return { ok: false, status: 503, error: "Unable to verify report access." };

    const payload = await accessResponse.json().catch(() => null);
    const accessRows = Array.isArray(payload?.data) ? payload.data as UserModuleAccess[] : [];
    const hasAccess = accessRows.some((row) =>
        row.module_id && typeof row.module_id === "object" && row.module_id.base_path === MODULE_PATH
    );
    return hasAccess
        ? { ok: true }
        : { ok: false, status: 403, error: "You do not have access to this report." };
}
