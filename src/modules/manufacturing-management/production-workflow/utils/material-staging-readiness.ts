import type { JobOrderMaterialLine } from "../types";

const STAGING_EPSILON = 0.000001;

/**
 * Fail closed until every required material line has a known requirement and
 * enough staged quantity. The workflow endpoint repeats this check against
 * Directus before it starts production.
 */
export function areJobOrderMaterialsFullyStaged(materials: readonly JobOrderMaterialLine[]): boolean {
    if (materials.length === 0) return false;

    return materials.every((material) => {
        const required = Number(material.required_quantity);
        if (!Number.isFinite(required) || required < 0) return false;

        let staged = 0;
        for (const reservation of material.reservations || []) {
            const quantity = Number(reservation.staged_quantity ?? 0);
            if (!Number.isFinite(quantity) || quantity < 0) return false;
            staged += quantity;
        }

        return Number.isFinite(staged) && staged + STAGING_EPSILON >= required;
    });
}
