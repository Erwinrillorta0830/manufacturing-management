import { ProductVersion } from "../types";

/**
 * Intelligent version name parser and next iteration suggester.
 * Detects existing version numbering patterns (e.g. "SHA 01 - v7.0" -> "SHA 01 - v8.0")
 * and guarantees that the suggested name is unique among existing versions for the product.
 */
export function getSuggestedNextVersionName(
    currentName?: string,
    existingVersions: ProductVersion[] = [],
    productSku?: string
): string {
    const existingNames = new Set(
        existingVersions
            .map(v => v.version_name?.trim().toLowerCase())
            .filter(Boolean)
    );

    const baseName = (currentName || "").trim();

    // 1. Try matching standard version patterns like "... v7.0", "... v7", "... V1.5", etc.
    const vMatch = baseName.match(/^(.*?)(\bv|\bV)(\d+)(?:\.(\d+))?(.*?)$/);
    if (vMatch) {
        const prefix = vMatch[1];
        const vPrefix = vMatch[2];
        const majorNum = parseInt(vMatch[3], 10) || 1;
        const hasDecimal = vMatch[4] !== undefined;
        const minorNum = hasDecimal ? parseInt(vMatch[4], 10) : 0;
        const suffix = vMatch[5] || "";

        // Increment minor version iteration (e.g. v4.0 -> v4.1, v4.1 -> v4.2)
        let candidateMinor = minorNum + 1;
        let candidate = `${prefix}${vPrefix}${majorNum}.${candidateMinor}${suffix}`.trim();

        while (existingNames.has(candidate.toLowerCase())) {
            candidateMinor++;
            candidate = `${prefix}${vPrefix}${majorNum}.${candidateMinor}${suffix}`.trim();
        }
        return candidate;
    }

    // 2. Try matching plain numbers at the end, e.g. "Formula 1" -> "Formula 2"
    const numEndMatch = baseName.match(/^(.*?)(\d+)(\s*)$/);
    if (numEndMatch && !baseName.toLowerCase().includes("sku")) {
        const prefix = numEndMatch[1];
        const num = parseInt(numEndMatch[2], 10) || 1;
        const endSpaces = numEndMatch[3] || "";

        let candidateNum = num + 1;
        let candidate = `${prefix}${candidateNum}${endSpaces}`.trim();
        while (existingNames.has(candidate.toLowerCase())) {
            candidateNum++;
            candidate = `${prefix}${candidateNum}${endSpaces}`.trim();
        }
        return candidate;
    }

    // 3. Fallback: Append next version suffix to SKU or base name
    const prefix = (productSku?.trim() || baseName || "Version").trim();
    let nextNum = Math.max(2, existingVersions.length + 1);
    let candidate = `${prefix} - v${nextNum}.0`;

    while (existingNames.has(candidate.toLowerCase())) {
        nextNum++;
        candidate = `${prefix} - v${nextNum}.0`;
    }

    return candidate;
}

/**
 * Determines whether a version specification is locked against direct operational edits.
 * Approved/Active, Pending Approval, and Rejected versions are locked to preserve data integrity.
 */
export function isVersionLockedForEditing(status?: string | null): boolean {
    if (!status) return false;
    const normalized = status.trim().toLowerCase();
    return (
        normalized === "active" ||
        normalized === "pending approval" ||
        normalized === "for approval" ||
        normalized === "rejected"
    );
}

/**
 * Determines whether a version can be used as the base to create a new iterative revision.
 */
export function canCreateRevisionFromVersion(status?: string | null): boolean {
    if (!status) return true;
    const normalized = status.trim().toLowerCase();
    return (
        normalized === "active" ||
        normalized === "rejected" ||
        normalized === "inactive"
    );
}
