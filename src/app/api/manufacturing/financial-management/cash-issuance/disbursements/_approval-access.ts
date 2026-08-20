const DIRECTUS_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/+$/, "");
const DIRECTUS_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

type DirectusUser = {
    role?: string | null;
    isAdmin?: boolean | number | null;
};

type ModuleAccessRow = {
    module_id?: {
        slug?: string | null;
    } | null;
};

function isAdmin(user: DirectusUser): boolean {
    return user.role === "ADMIN" || user.isAdmin === true || Number(user.isAdmin) === 1;
}

function isDisbursementApprovalSlug(value: unknown): boolean {
    const slug = String(value || "").toLowerCase().replace(/_/g, "-");
    return slug.includes("approval") && (
        slug.includes("disbursement") ||
        slug.includes("cash-issuance") ||
        slug.includes("treasury")
    );
}

/**
 * Uses the same Directus module access source as the application sidebar.
 * This is intentionally server-side because the status endpoint uses a
 * service token and cannot rely on a client-provided module or route value.
 */
export async function hasDisbursementApprovalAccess(userId: number): Promise<boolean> {
    if (!DIRECTUS_URL || !DIRECTUS_TOKEN || !Number.isFinite(userId)) return false;

    const headers = { Authorization: `Bearer ${DIRECTUS_TOKEN}` };
    try {
        const [userRes, moduleRes] = await Promise.all([
            fetch(`${DIRECTUS_URL}/items/user/${userId}?fields=role,isAdmin`, {
                headers,
                cache: "no-store",
            }),
            fetch(`${DIRECTUS_URL}/items/user_access_modules?filter[user_id][_eq]=${userId}&fields=module_id.slug&limit=-1`, {
                headers,
                cache: "no-store",
            }),
        ]);

        if (!userRes.ok || !moduleRes.ok) return false;

        const userPayload = (await userRes.json()) as { data?: DirectusUser };
        const user = userPayload.data || {};
        if (isAdmin(user)) return true;

        const modulePayload = (await moduleRes.json()) as { data?: ModuleAccessRow[] };
        return (modulePayload.data || []).some((row) => isDisbursementApprovalSlug(row.module_id?.slug));
    } catch {
        return false;
    }
}
