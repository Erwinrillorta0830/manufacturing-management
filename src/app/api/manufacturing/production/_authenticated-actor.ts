import { cookies } from "next/headers";

export class AuthenticatedActorError extends Error {
    constructor(
        message: string,
        readonly status: 401 | 503,
        readonly code: "AUTHENTICATION_REQUIRED" | "AUTHENTICATION_SERVICE_UNAVAILABLE"
    ) {
        super(message);
        this.name = "AuthenticatedActorError";
    }
}

export async function requireManufacturingActorId(): Promise<number> {
    const token = (await cookies()).get("vos_access_token")?.value;
    if (!token) {
        throw new AuthenticatedActorError("Authentication is required for this operation.", 401, "AUTHENTICATION_REQUIRED");
    }

    const springBase = process.env.SPRING_API_BASE_URL?.replace(/\/$/, "");
    if (!springBase) {
        throw new AuthenticatedActorError("Authentication service is not configured.", 503, "AUTHENTICATION_SERVICE_UNAVAILABLE");
    }

    let response: Response;
    try {
        response = await fetch(`${springBase}/auth/me`, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json"
            },
            cache: "no-store"
        });
    } catch {
        throw new AuthenticatedActorError("Authentication service is unavailable.", 503, "AUTHENTICATION_SERVICE_UNAVAILABLE");
    }

    if (response.status === 401 || response.status === 403) {
        throw new AuthenticatedActorError("Your session is invalid or has expired.", 401, "AUTHENTICATION_REQUIRED");
    }
    if (!response.ok) {
        throw new AuthenticatedActorError("Authentication service is unavailable.", 503, "AUTHENTICATION_SERVICE_UNAVAILABLE");
    }

    const body = await response.json().catch(() => null) as unknown;
    const user = body && typeof body === "object"
        ? (body as { data?: unknown }).data ?? body
        : null;
    const userId = user && typeof user === "object"
        ? Number((user as { id?: unknown }).id)
        : NaN;
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new AuthenticatedActorError("Unable to verify the current user.", 401, "AUTHENTICATION_REQUIRED");
    }

    return userId;
}
