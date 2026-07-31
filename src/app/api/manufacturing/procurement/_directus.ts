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

export async function procurementDirectusFetch(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(procurementDirectusUrl(path), {
        ...init,
        headers: {
            ...procurementDirectusHeaders(),
            ...(init.headers || {})
        },
        cache: init.cache || "no-store"
    });
}
