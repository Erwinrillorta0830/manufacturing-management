export interface FetchOptions {
    signal?: AbortSignal;
    timeoutMs?: number;
}

export class FetchProviderError extends Error {
    constructor(
        message: string,
        public readonly status: number,
        public readonly requestId?: string,
    ) {
        super(message);
        this.name = "FetchProviderError";
    }
}

const DEFAULT_TIMEOUT_MS = 30_000;

const getErrorMessage = (body: string, fallback: string) => {
    if (!body) return fallback;

    try {
        const parsed = JSON.parse(body) as { detail?: string; message?: string; error?: string };
        return parsed.detail || parsed.message || parsed.error || fallback;
    } catch {
        return body;
    }
};

const createFetchProviderError = (response: Response, body: string, fallback: string) =>
    new FetchProviderError(
        getErrorMessage(body, fallback),
        response.status,
        response.headers.get("x-request-id") || undefined,
    );

const createRequestContext = (options?: FetchOptions) => {
    const controller = new AbortController();
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timedOut = false;
    const timeout = window.setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    const abortExternal = () => controller.abort(options?.signal?.reason);

    options?.signal?.addEventListener("abort", abortExternal, {once: true});

    return {
        signal: controller.signal,
        cleanup: () => {
            window.clearTimeout(timeout);
            options?.signal?.removeEventListener("abort", abortExternal);
        },
        timedOut: () => timedOut,
    };
};

const request = async (url: string, init: RequestInit, options?: FetchOptions) => {
    const context = createRequestContext(options);
    try {
        return await fetch(url, {...init, signal: context.signal});
    } catch (error) {
        if (context.timedOut()) {
            const timeoutError = new Error("The request timed out. Please retry.");
            timeoutError.name = "TimeoutError";
            throw timeoutError;
        }
        throw error;
    } finally {
        context.cleanup();
    }
};

const parseJsonResponse = async <T>(response: Response): Promise<T | null> => {
    const body = await response.text();
    return body ? JSON.parse(body) as T : null;
};

export const fetchProvider = {
    async getOrThrow<T>(url: string, options?: FetchOptions): Promise<T | null> {
        const response = await request(url, {
            method: "GET",
            headers: {"Content-Type": "application/json"},
        }, options);

        if (!response.ok) {
            const errorBody = await response.text();
            throw createFetchProviderError(response, errorBody, `GET Error: ${response.status}`);
        }

        return parseJsonResponse<T>(response);
    },

    async get<T>(url: string, options?: FetchOptions): Promise<T | null> {
        try {
            return await fetchProvider.getOrThrow<T>(url, options);
        } catch (error) {
            console.error(`[fetchProvider] GET ${url} failed:`, error);
            return null;
        }
    },

    async post<T>(url: string, body: unknown, options?: FetchOptions): Promise<T | null> {
        try {
            const response = await request(url, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body),
            }, options);

            if (!response.ok) {
                const errorBody = await response.text();
                throw createFetchProviderError(response, errorBody, `POST Error: ${response.status}`);
            }

            const contentType = response.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
                return parseJsonResponse<T>(response);
            }

            const textData = await response.text();
            return textData as unknown as T;
        } catch (error) {
            console.error(`[fetchProvider] POST ${url} failed:`, error);
            throw error;
        }
    },

    async put<T>(url: string, body: unknown, options?: FetchOptions): Promise<T | null> {
        try {
            const response = await request(url, {
                method: "PUT",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify(body),
            }, options);

            if (!response.ok) {
                const errorBody = await response.text();
                throw createFetchProviderError(response, errorBody, `PUT Error: ${response.status}`);
            }

            return parseJsonResponse<T>(response);
        } catch (error) {
            console.error(`[fetchProvider] PUT ${url} failed:`, error);
            throw error;
        }
    },

    async delete<T>(url: string, options?: FetchOptions): Promise<T | null> {
        try {
            const response = await request(url, {
                method: "DELETE",
                headers: {"Content-Type": "application/json"},
            }, options);

            if (!response.ok) {
                const errorBody = await response.text();
                throw createFetchProviderError(response, errorBody, `DELETE Error: ${response.status}`);
            }

            return parseJsonResponse<T>(response);
        } catch (error) {
            console.error(`[fetchProvider] DELETE ${url} failed:`, error);
            return null;
        }
    },
};
