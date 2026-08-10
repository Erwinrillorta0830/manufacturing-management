import { Unit } from "../types";

export interface CatalogProductLike {
    product_id?: number | string | null;
    parent_id?: number | string | { product_id?: number | string } | null;
    unit_of_measurement?: number | string | { unit_id?: number | string; unit_shortcut?: string } | null;
    baseUom?: string;
    unit_shortcut?: string;
    uom?: string;
}

/**
 * Helper to resolve the unit_id from a product object across Directus API representations
 */
export function extractProductUnitId(p: unknown): number | null {
    if (!p || typeof p !== "object") return null;
    const item = p as CatalogProductLike;

    // 1. Direct unit_of_measurement object from Directus
    if (item.unit_of_measurement && typeof item.unit_of_measurement === "object") {
        const uom = item.unit_of_measurement as { unit_id?: number | string };
        if (uom.unit_id !== undefined && uom.unit_id !== null) {
            const id = Number(uom.unit_id);
            if (!isNaN(id) && id > 0) return id;
        }
    }

    // 2. Direct unit_of_measurement numeric ID or numeric string
    if (item.unit_of_measurement !== undefined && item.unit_of_measurement !== null) {
        const id = Number(item.unit_of_measurement);
        if (!isNaN(id) && id > 0) return id;
    }

    return null;
}

/**
 * Helper to resolve the UOM shortcut from a product object across Directus API representations
 */
export function extractProductUomShortcut(p: unknown, allUnits: Unit[]): string | null {
    if (!p || typeof p !== "object") return null;
    const item = p as CatalogProductLike;

    if (item.unit_of_measurement && typeof item.unit_of_measurement === "object") {
        const uom = item.unit_of_measurement as { unit_id?: number | string; unit_shortcut?: string };
        if (uom.unit_shortcut && typeof uom.unit_shortcut === "string") {
            return uom.unit_shortcut.trim();
        }
        if (uom.unit_id !== undefined && uom.unit_id !== null) {
            const u = allUnits.find(unit => Number(unit.unit_id) === Number(uom.unit_id));
            if (u?.unit_shortcut) return u.unit_shortcut.trim();
        }
    }

    if (item.unit_of_measurement !== undefined && item.unit_of_measurement !== null) {
        if (typeof item.unit_of_measurement === "number") {
            const u = allUnits.find(unit => Number(unit.unit_id) === item.unit_of_measurement);
            if (u?.unit_shortcut) return u.unit_shortcut.trim();
        } else if (typeof item.unit_of_measurement === "string" && item.unit_of_measurement.trim()) {
            const trimmed = item.unit_of_measurement.trim();
            if (isNaN(Number(trimmed))) {
                return trimmed;
            } else {
                const u = allUnits.find(unit => Number(unit.unit_id) === Number(trimmed));
                if (u?.unit_shortcut) return u.unit_shortcut.trim();
            }
        }
    }

    if (typeof item.baseUom === "string" && item.baseUom.trim()) return item.baseUom.trim();
    if (typeof item.unit_shortcut === "string" && item.unit_shortcut.trim()) return item.unit_shortcut.trim();
    if (typeof item.uom === "string" && item.uom.trim()) return item.uom.trim();

    return null;
}

/**
 * Dynamically restricts UOM dropdown options for a BOM material line to ONLY the units
 * assigned to the specific product and its family variants (parent/children) in the database.
 * If no product is selected yet, returns an empty list so the UOM input is locked until a material is chosen.
 */
export function getProductFamilyUOMOptions(
    productId: number | undefined | null,
    currentUom: string | undefined | null,
    allCatalogProducts: CatalogProductLike[],
    allUnits: Unit[]
): { value: string; label: string }[] {
    // If no product is selected yet, do NOT show all UOMs; lock to empty/current
    if (!productId || Number(productId) <= 0) {
        if (currentUom && currentUom.trim()) {
            const matched = allUnits.find(u =>
                (u.unit_shortcut || "").trim().toUpperCase() === currentUom.trim().toUpperCase() ||
                Number(u.unit_id) === Number(currentUom)
            );
            if (matched) {
                return [{ value: matched.unit_shortcut, label: `${matched.unit_name} (${matched.unit_shortcut})` }];
            }
        }
        return [];
    }

    if (!allCatalogProducts || allCatalogProducts.length === 0) {
        if (currentUom && currentUom.trim()) {
            return [{ value: currentUom, label: currentUom }];
        }
        return [];
    }

    const targetProduct = allCatalogProducts.find(p => Number(p.product_id) === Number(productId));
    if (!targetProduct) {
        if (currentUom && currentUom.trim()) {
            const matched = allUnits.find(u =>
                (u.unit_shortcut || "").trim().toUpperCase() === currentUom.trim().toUpperCase() ||
                Number(u.unit_id) === Number(currentUom)
            );
            if (matched) {
                return [{ value: matched.unit_shortcut, label: `${matched.unit_name} (${matched.unit_shortcut})` }];
            }
            return [{ value: currentUom, label: currentUom }];
        }
        return [];
    }

    const rawTargetParent = targetProduct.parent_id;
    const targetParentId = rawTargetParent
        ? (typeof rawTargetParent === "object" ? Number((rawTargetParent as { product_id?: number | string }).product_id) : Number(rawTargetParent))
        : null;

    const rootParentId = targetParentId && targetParentId > 0 ? targetParentId : Number(targetProduct.product_id);

    // Find all products in the exact product family tree in Directus
    const familyProducts = allCatalogProducts.filter(p => {
        const pId = Number(p.product_id);
        const rawParent = p.parent_id;
        const pParentId = rawParent
            ? (typeof rawParent === "object" ? Number((rawParent as { product_id?: number | string }).product_id) : Number(rawParent))
            : null;

        return pId === rootParentId || pParentId === rootParentId || pId === Number(targetProduct.product_id);
    });

    // Collect all unit IDs and unit shortcuts associated with this product family
    const familyUnitIds = new Set<number>();
    const familyShortcuts = new Set<string>();

    familyProducts.forEach(p => {
        const uId = extractProductUnitId(p);
        if (uId) {
            familyUnitIds.add(uId);
        }

        const sc = extractProductUomShortcut(p, allUnits);
        if (sc) {
            familyShortcuts.add(sc.toUpperCase());
        }
    });

    if (familyUnitIds.size > 0 || familyShortcuts.size > 0) {
        const options: { value: string; label: string }[] = [];
        const addedShortcuts = new Set<string>();

        // Dynamically match against allUnits fetched from /items/units API
        allUnits.forEach(u => {
            const matchesId = familyUnitIds.has(Number(u.unit_id));
            const matchesShortcut = familyShortcuts.has((u.unit_shortcut || "").trim().toUpperCase());

            if (matchesId || matchesShortcut) {
                options.push({
                    value: u.unit_shortcut,
                    label: `${u.unit_name} (${u.unit_shortcut})`
                });
                addedShortcuts.add((u.unit_shortcut || "").trim().toUpperCase());
            }
        });

        // Add any shortcuts defined on products that aren't in system units table
        familyShortcuts.forEach(sc => {
            if (!addedShortcuts.has(sc)) {
                options.push({
                    value: sc,
                    label: sc
                });
            }
        });

        if (options.length > 0) {
            return options;
        }
    }

    // Fallback for target product if no unit IDs resolved
    const targetUom = extractProductUomShortcut(targetProduct, allUnits) || currentUom;
    if (targetUom && targetUom.trim()) {
        const matched = allUnits.find(u =>
            (u.unit_shortcut || "").trim().toUpperCase() === targetUom.trim().toUpperCase() ||
            Number(u.unit_id) === Number(targetUom)
        );
        if (matched) {
            return [{ value: matched.unit_shortcut, label: `${matched.unit_name} (${matched.unit_shortcut})` }];
        }
        return [{ value: targetUom, label: targetUom }];
    }

    return [];
}
