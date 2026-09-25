import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { JobOrderWorkflowAction } from "@/modules/manufacturing-management/job-order-workflow";

export const JOB_ORDER_MODULE_PATHS = {
    planning: "/mm/planning-engineering",
    staging: "/mm/material-staging",
    production: "/mm/shop-floor-execution-terminal",
    qualityAssurance: "/mm/manufacturing-qa",
    inspectionQa: "/mm/manufacturing-job-order-inspection-qa",
    calendarOfSchedule: "/mm/calendar-of-schedule",
    costVariance: "/mm/cost-variance",
    salesOrders: "/mm/sales-and-fulfillment/sales-order"
} as const;

export type JobOrderModulePath = typeof JOB_ORDER_MODULE_PATHS[keyof typeof JOB_ORDER_MODULE_PATHS];

export class JobOrderModuleAccessError extends Error {
    constructor(
        readonly status: 401 | 403 | 503,
        readonly code: "AUTHENTICATION_REQUIRED" | "MODULE_ACCESS_REQUIRED" | "MODULE_ACCESS_SERVICE_UNAVAILABLE",
        message: string
    ) {
        super(message);
        this.name = "JobOrderModuleAccessError";
    }
}

export interface AuthorizedJobOrderUser {
    userId: number;
    admin: boolean;
}

interface ModuleAccessRow {
    module_id?: { base_path?: unknown } | number | null;
}

interface AuthenticatedUser {
    id?: unknown;
    admin?: unknown;
    isAdmin?: unknown;
    role?: unknown;
}

interface DirectusUser {
    role?: unknown;
    isAdmin?: unknown;
}

function positiveId(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function isAdminValue(value: unknown): boolean {
    return value === true || value === 1 || value === "1" || String(value ?? "").trim().toLowerCase() === "true";
}

function hasAdminRole(value: unknown): boolean {
    const role = value && typeof value === "object"
        ? (value as Record<string, unknown>).name ?? (value as Record<string, unknown>).code
        : value;
    return String(role ?? "").trim().toUpperCase() === "ADMIN";
}

function responseData<T>(payload: unknown): T | null {
    if (!payload || typeof payload !== "object") return null;
    const record = payload as { data?: unknown };
    return (record.data ?? payload) as T;
}

async function getJson(response: Response): Promise<unknown> {
    return response.json().catch(() => null);
}

export async function requireJobOrderModuleAccess(
    modulePaths: JobOrderModulePath | readonly JobOrderModulePath[]
): Promise<AuthorizedJobOrderUser> {
    const requestedPaths: readonly JobOrderModulePath[] = typeof modulePaths === "string"
        ? [modulePaths]
        : modulePaths;
    if (requestedPaths.length === 0) {
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Job Order module access is not configured.");
    }

    const token = (await cookies()).get("vos_access_token")?.value;
    if (!token) {
        throw new JobOrderModuleAccessError(401, "AUTHENTICATION_REQUIRED", "Authentication is required.");
    }

    const springBase = process.env.SPRING_API_BASE_URL?.replace(/\/+$/, "");
    if (!springBase) {
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Authentication service is not configured.");
    }

    let authResponse: Response;
    try {
        authResponse = await fetch(`${springBase}/auth/me`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            cache: "no-store"
        });
    } catch {
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Authentication service is unavailable.");
    }
    if (authResponse.status === 401 || authResponse.status === 403) {
        throw new JobOrderModuleAccessError(401, "AUTHENTICATION_REQUIRED", "Your session is invalid or has expired.");
    }
    if (!authResponse.ok) {
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Authentication service is unavailable.");
    }

    const authenticatedPayload = await getJson(authResponse);
    const authenticated = responseData<AuthenticatedUser>(authenticatedPayload);
    const userId = positiveId(authenticated?.id);
    if (!userId) {
        throw new JobOrderModuleAccessError(401, "AUTHENTICATION_REQUIRED", "Unable to verify the current user.");
    }

    const directusBase = (process.env.DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL)?.replace(/\/+$/, "");
    const directusToken = process.env.DIRECTUS_STATIC_TOKEN;
    if (!directusBase || !directusToken) {
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Module authorization service is not configured.");
    }

    const authHeaders = { Authorization: `Bearer ${directusToken}`, Accept: "application/json" };
    const accessParams = new URLSearchParams({
        "filter[user_id][_eq]": String(userId),
        fields: "module_id.base_path",
        limit: "-1"
    });

    let userResponse: Response;
    let accessResponse: Response;
    try {
        [userResponse, accessResponse] = await Promise.all([
            fetch(`${directusBase}/items/user/${userId}?fields=role,isAdmin`, { headers: authHeaders, cache: "no-store" }),
            fetch(`${directusBase}/items/user_access_modules?${accessParams.toString()}`, { headers: authHeaders, cache: "no-store" })
        ]);
    } catch {
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Module authorization service is unavailable.");
    }
    if (!userResponse.ok || !accessResponse.ok) {
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Unable to verify Job Order module access.");
    }

    const directusUser = responseData<DirectusUser>(await getJson(userResponse));
    const accessPayload = await getJson(accessResponse);
    const accessRows = responseData<ModuleAccessRow[]>(accessPayload);
    if (!directusUser || !Array.isArray(accessRows)) {
        throw new JobOrderModuleAccessError(503, "MODULE_ACCESS_SERVICE_UNAVAILABLE", "Module authorization service returned an invalid response.");
    }

    const admin = isAdminValue(authenticated?.admin)
        || isAdminValue(authenticated?.isAdmin)
        || hasAdminRole(authenticated?.role)
        || hasAdminRole(directusUser.role)
        || isAdminValue(directusUser.isAdmin);
    const hasModuleAccess = accessRows.some((row) =>
        row.module_id
        && typeof row.module_id === "object"
        && requestedPaths.includes(row.module_id.base_path as JobOrderModulePath)
    );
    if (!admin && !hasModuleAccess) {
        throw new JobOrderModuleAccessError(403, "MODULE_ACCESS_REQUIRED", "You do not have access to this Job Order module.");
    }

    return { userId, admin };
}

export async function authorizeJobOrderModuleAccess(
    modulePaths: JobOrderModulePath | readonly JobOrderModulePath[]
): Promise<NextResponse | null> {
    try {
        await requireJobOrderModuleAccess(modulePaths);
        return null;
    } catch (error) {
        if (error instanceof JobOrderModuleAccessError) {
            return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status });
        }
        console.error("Job Order module authorization failed:", error);
        return NextResponse.json({
            success: false,
            error: "Unable to verify Job Order module access.",
            code: "MODULE_ACCESS_SERVICE_UNAVAILABLE"
        }, { status: 503 });
    }
}

export function jobOrderWorkflowModulePath(
    action: JobOrderWorkflowAction
): JobOrderModulePath | readonly JobOrderModulePath[] {
    switch (action) {
        case "initialize":
            return JOB_ORDER_MODULE_PATHS.planning;
        case "start-production":
        case "place-on-hold":
        case "resume-production":
        case "complete-production":
        case "terminate-production":
        case "cancel":
            return JOB_ORDER_MODULE_PATHS.production;
        case "begin-qa-reconciliation":
            return JOB_ORDER_MODULE_PATHS.qualityAssurance;
        case "close":
            return [JOB_ORDER_MODULE_PATHS.qualityAssurance, JOB_ORDER_MODULE_PATHS.inspectionQa];
    }
}
