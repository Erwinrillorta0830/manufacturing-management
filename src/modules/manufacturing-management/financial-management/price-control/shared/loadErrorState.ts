import { toast } from "sonner";

import { isAccessDeniedError, isUnauthorizedError } from "./apiHttp";

export type ActionErrorHandlers = {
    onUnauthorized?: () => void;
    setUnauthorized?: (value: boolean) => void;
};

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) return error.message;
    return fallback;
}

function getAccessDeniedMessage(error: unknown): string {
    const message = getErrorMessage(error, "");
    if (message && !/^request failed\s*\(403\)$/i.test(message)) return message;
    return "You do not have permission to access this price-control data. Please ask an administrator to update your Directus role permissions.";
}

export function applyActionError(
    error: unknown,
    fallback: string,
    handlers: ActionErrorHandlers,
): boolean {
    if (isUnauthorizedError(error)) {
        handlers.setUnauthorized?.(true);
        handlers.onUnauthorized?.();
        return true;
    }

    if (isAccessDeniedError(error)) {
        toast.error(getAccessDeniedMessage(error));
        return true;
    }

    toast.error(getErrorMessage(error, fallback));
    return false;
}

export function applyLoadError(
    error: unknown,
    fallback: string,
    setUnauthorized: (value: boolean) => void,
    setError: (value: string | null) => void,
) {
    if (isUnauthorizedError(error)) {
        setUnauthorized(true);
        setError(null);
        return;
    }

    if (isAccessDeniedError(error)) {
        setUnauthorized(false);
        setError(getAccessDeniedMessage(error));
        return;
    }

    setUnauthorized(false);
    setError(error instanceof Error && error.message ? error.message : fallback);
}
