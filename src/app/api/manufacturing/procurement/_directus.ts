export const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

function getStaticToken(): string {
    const token = process.env.DIRECTUS_STATIC_TOKEN;
    if (!token) {
        throw new Error("DIRECTUS_STATIC_TOKEN is required for Manufacturing procurement routes.");
    }
    return token;
}

export function procurementDirectusUrl(path: string): string {
    return `${DIRECTUS_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function procurementDirectusHeaders(): Record<string, string> {
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getStaticToken()}`
    };
}

export const headers = procurementDirectusHeaders();

export class ProcurementDirectusError extends Error {
    constructor(
        readonly dependency: string,
        readonly status: number | null,
        readonly method: string,
        readonly notFoundIsExpected = false
    ) {
        super(`Directus dependency "${dependency}" failed${status ? ` with HTTP ${status}` : " before returning a response"}.`);
    }
}

export async function procurementDirectusFetch(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(procurementDirectusUrl(path), {
        ...init,
        headers: {
            ...procurementDirectusHeaders(),
            ...(init.headers || {})
        },
        cache: init.cache || "no-store",
        signal: init.signal || AbortSignal.timeout(10000)
    });
}

export async function procurementDirectusRead(
    path: string,
    dependency: string,
    init: RequestInit = {},
    options: { notFoundIsExpected?: boolean } = {}
): Promise<Response> {
    const method = String(init.method || "GET").toUpperCase();
    let response: Response;
    try {
        response = await procurementDirectusFetch(path, { ...init, method });
    } catch {
        throw new ProcurementDirectusError(dependency, null, method, Boolean(options.notFoundIsExpected));
    }
    if (!response.ok) {
        throw new ProcurementDirectusError(
            dependency,
            response.status,
            method,
            Boolean(options.notFoundIsExpected)
        );
    }
    return response;
}
