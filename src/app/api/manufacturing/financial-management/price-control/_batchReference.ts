import { randomBytes } from "node:crypto";

function compactManilaTimestamp(timestamp: string): string {
    const [date = "", time = ""] = timestamp.split("T");
    const compactDate = date.replace(/[^0-9]/g, "");
    const compactTime = time.replace(/[^0-9]/g, "").slice(0, 6).padEnd(6, "0");
    return `${compactDate || "00000000"}-${compactTime}`;
}

export function generateServerBatchReferenceNo(requestedAt: string): string {
    const suffix = randomBytes(3).toString("hex").toUpperCase();
    return `BATCH-${compactManilaTimestamp(requestedAt)}-${suffix}`;
}

export function resolveBatchReferenceNo(referenceNo: unknown, requestedAt: string): string {
    const normalized = typeof referenceNo === "string" ? referenceNo.trim() : "";
    return normalized || generateServerBatchReferenceNo(requestedAt);
}
