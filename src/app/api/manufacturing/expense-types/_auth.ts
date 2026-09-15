import { getUserIdFromToken } from "@/app/api/manufacturing/item-management/auth-helper";
import { DIRECTUS_URL, headers as directusHeaders } from "@/app/api/manufacturing/services/core-api.service";

type DirectusUser = {
    role?: unknown;
    isAdmin?: unknown;
    is_admin?: unknown;
};

export class ExpenseTypeAuthError extends Error {
    constructor(readonly status: 401 | 403, message: string) {
        super(message);
        this.name = "ExpenseTypeAuthError";
    }
}

function isTruthyFlag(value: unknown): boolean {
    return value === true || value === 1 || value === "1" || (typeof value === "string" && value.trim().toLowerCase() === "true");
}

function roleName(value: unknown): string {
    if (typeof value === "string") return value.trim().toLowerCase();
    if (value && typeof value === "object") {
        const role = value as { name?: unknown; code?: unknown; title?: unknown };
        return String(role.name ?? role.code ?? role.title ?? "").trim().toLowerCase();
    }
    return "";
}

function isAdministrator(user: DirectusUser): boolean {
    return roleName(user.role) === "admin" || roleName(user.role) === "administrator" || isTruthyFlag(user.isAdmin) || isTruthyFlag(user.is_admin);
}

async function loadDirectusUser(userId: number): Promise<DirectusUser | null> {
    if (!DIRECTUS_URL) return null;
    const response = await fetch(`${DIRECTUS_URL}/items/user/${encodeURIComponent(String(userId))}?fields=role,isAdmin`, {
        headers: directusHeaders,
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null) as { data?: DirectusUser } | null;
    return payload?.data || null;
}

export async function requireExpenseTypeUser(): Promise<number> {
    const userId = await getUserIdFromToken();
    if (!userId) throw new ExpenseTypeAuthError(401, "A valid session is required.");
    return userId;
}

export async function requireExpenseTypeAdmin(): Promise<number> {
    const userId = await requireExpenseTypeUser();
    let user: DirectusUser | null = null;
    try {
        user = await loadDirectusUser(userId);
    } catch {
        user = null;
    }
    if (!user || !isAdministrator(user)) {
        throw new ExpenseTypeAuthError(403, "Only manufacturing administrators can manage Expense Types.");
    }
    return userId;
}
