import crypto from "node:crypto";
import type { JobOrderMaterialReturnLine } from "@/app/api/manufacturing/production/_material-return";

const TOKEN_TTL_MS = 15 * 60 * 1000;

function tokenSecret(): string {
    return process.env.MATERIAL_STAGING_PREVIEW_SECRET || process.env.JWT_SECRET || "material-staging-preview-secret";
}

export function materialReturnFingerprint(joId: number, lines: JobOrderMaterialReturnLine[]): string {
    return lines
        .filter((line) => !line.releaseOnly && line.returnableQuantity > 0)
        .map((line) => [
            line.joMaterialId,
            line.mmLotId,
            line.inventoryLotId,
            line.batchNo.trim(),
            line.returnableQuantity.toFixed(4)
        ].join(":"))
        .sort()
        .join("|");
}

export function signMaterialReturnToken(joId: number, fingerprint: string): string {
    const payload = Buffer
        .from(JSON.stringify({ joId, fp: fingerprint, exp: Date.now() + TOKEN_TTL_MS }))
        .toString("base64url");
    const signature = crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
    return `${payload}.${signature}`;
}

/** Returns an error message, or null when the token matches the current state. */
export function verifyMaterialReturnToken(token: unknown, joId: number, fingerprint: string): string | null {
    const raw = String(token ?? "");
    const [payload, signature] = raw.split(".");
    if (!payload || !signature) return "Missing or malformed return preview token.";

    const expected = crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        return "The return preview token is invalid. Refresh the return preview and try again.";
    }

    let parsed: Record<string, unknown> | null = null;
    try {
        parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    } catch {
        return "The return preview token could not be read.";
    }
    if (!parsed || Number(parsed.joId) !== joId) return "The return preview token belongs to a different Job Order.";
    if (Number(parsed.exp) < Date.now()) return "The return preview token expired. Refresh the return preview and try again.";
    if (String(parsed.fp) !== fingerprint) {
        return "The staged quantities changed since the preview. Refresh the return preview and try again.";
    }
    return null;
}
