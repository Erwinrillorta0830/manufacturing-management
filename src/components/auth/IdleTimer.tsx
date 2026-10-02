"use client";

import * as React from "react";
import { toast } from "sonner";

const IDLE_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
const WARNING_BEFORE = 15 * 60 * 1000; // 15 minute warning (at 23h 45m)

// ─── Global fetch interceptor state (module-scoped, shared across renders) ────
// Paths that must NEVER be intercepted to avoid redirect/refresh loops
const AUTH_SKIP_PATHS = ["/api/auth/login", "/api/auth/logout", "/api/auth/refresh"];

let globalRefreshPromise: Promise<boolean> | null = null;
let globalRedirecting = false;
let fetchPatched = false;

function clearSessionFlags() {
    try { sessionStorage.removeItem("low_stock_alert_shown"); } catch { /* ignore */ }
}

function doSessionRedirect() {
    if (globalRedirecting || window.location.pathname === "/login") return;
    globalRedirecting = true;
    clearSessionFlags();
    const next = encodeURIComponent(
        window.location.pathname + window.location.search + window.location.hash
    );
    window.location.assign(`/login?next=${next}`);
}

async function tryRefreshToken(): Promise<boolean> {
    if (globalRefreshPromise) return globalRefreshPromise;
    globalRefreshPromise = fetch("/api/auth/refresh", { method: "POST", cache: "no-store" })
        .then(r => r.ok)
        .catch(() => false)
        .finally(() => { globalRefreshPromise = null; });
    return globalRefreshPromise;
}

function patchGlobalFetch() {
    if (fetchPatched || typeof window === "undefined") return;
    fetchPatched = true;

    const originalFetch = globalThis.fetch.bind(globalThis);

    globalThis.fetch = async function interceptedFetch(
        input: RequestInfo | URL,
        init?: RequestInit
    ): Promise<Response> {
        // Resolve the URL string to check against skip paths
        const urlStr = typeof input === "string"
            ? input
            : input instanceof URL
                ? input.href
                : (input as Request).url;

        // Skip auth endpoints — never intercept to avoid infinite loops
        const isAuthCall = AUTH_SKIP_PATHS.some(p => urlStr.includes(p));
        if (isAuthCall) return originalFetch(input, init);

        const response = await originalFetch(input, init);

        // Not a 401 — pass through untouched
        if (response.status !== 401) return response;

        // Already redirecting — throw to stop the caller
        if (globalRedirecting) {
            throw new Error("Session expired");
        }

        // Attempt one silent token refresh
        const refreshed = await tryRefreshToken();
        if (!refreshed) {
            doSessionRedirect();
            throw new Error("Session expired");
        }

        // Retry original request with refreshed token
        const retried = await originalFetch(input, init);
        if (retried.status === 401) {
            doSessionRedirect();
            throw new Error("Session expired");
        }

        return retried;
    };
}

// ─── IdleTimer Component ───────────────────────────────────────────────────────
export function IdleTimer() {
    const [isIdle, setIsIdle] = React.useState(false);
    const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    const warningRef = React.useRef<NodeJS.Timeout | null>(null);

    // Patch global fetch once on first mount
    React.useEffect(() => {
        patchGlobalFetch();
    }, []);

    const logout = React.useCallback(async () => {
        try {
            // Attempt silent logout
            await fetch("/api/auth/logout", { method: "POST" });
        } catch {
            // Ignore error
        }
        clearSessionFlags();
        toast.info("Session Expired", {
            description: "You have been logged out due to inactivity.",
            duration: 10000,
        });
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/login?next=${next}`;
    }, []);

    const resetTimerRef = React.useRef<() => void>(() => { });

    const resetTimer = React.useCallback(() => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (warningRef.current) clearTimeout(warningRef.current);

        // Don't restart if already idle
        if (isIdle) return;

        // Set warning at 23 hours 45 minutes
        warningRef.current = setTimeout(() => {
            toast.warning("Inactivity Warning", {
                description: "Your session will expire in 15 minutes due to inactivity. Move your mouse or type to stay logged in.",
                duration: 15 * 60 * 1000,
                action: {
                    label: "I'm back",
                    onClick: () => resetTimerRef.current(),
                },
            });
        }, IDLE_TIMEOUT - WARNING_BEFORE);

        // Set logout at 24 hours
        timeoutRef.current = setTimeout(() => {
            setIsIdle(true);
            logout();
        }, IDLE_TIMEOUT);
    }, [isIdle, logout]);

    React.useEffect(() => {
        resetTimerRef.current = resetTimer;
    }, [resetTimer]);

    React.useEffect(() => {
        const events = ["mousedown", "mousemove", "keypress", "scroll", "touchstart"];

        const handleActivity = () => {
            if (isIdle) return;
            resetTimer();
        };

        events.forEach((e) => window.addEventListener(e, handleActivity));
        resetTimer(); // Initialize

        return () => {
            events.forEach((e) => window.removeEventListener(e, handleActivity));
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            if (warningRef.current) clearTimeout(warningRef.current);
        };
    }, [isIdle, resetTimer]);

    return null; // Side-effect only component
}
