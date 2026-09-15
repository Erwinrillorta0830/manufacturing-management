let legacySequence = 0;

function formatUuid(bytes: Uint8Array): string {
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Creates the idempotency key used by material-staging commits.
 * `randomUUID` is unavailable on some unsecured browser origins, while
 * `getRandomValues` remains available in those environments.
 */
export function createMaterialStagingOperationId(): string {
    const cryptoApi = typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

    try {
        if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
            return cryptoApi.randomUUID();
        }
    } catch {
        // Fall through to the broadly supported Web Crypto API.
    }

    try {
        if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
            const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
            bytes[6] = (bytes[6] & 0x0f) | 0x40;
            bytes[8] = (bytes[8] & 0x3f) | 0x80;
            return formatUuid(bytes);
        }
    } catch {
        // Fall through to the legacy browser fallback.
    }

    legacySequence += 1;
    return `material-staging-${Date.now()}-${legacySequence}-${Math.random().toString(36).slice(2)}`;
}
