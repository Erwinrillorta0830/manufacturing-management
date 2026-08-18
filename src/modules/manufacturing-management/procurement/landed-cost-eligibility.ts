export const LANDED_COST_INVENTORY_STATUS = 6;
export const LANDED_COST_PAYMENT_STATUS = 2;

export interface LandedCostStatusRecord {
    inventory_status?: number | string | null;
    payment_status?: number | string | null;
    is_posted?: number | boolean | null;
    is_posted_amounts?: number | boolean | null;
}

export function isPurchaseOrderPosted(record: LandedCostStatusRecord): boolean {
    return record.is_posted === true
        || record.is_posted_amounts === true
        || Number(record.is_posted) === 1
        || Number(record.is_posted_amounts) === 1;
}

export function hasLandedCostStatus(record: LandedCostStatusRecord): boolean {
    return Number(record.inventory_status) === LANDED_COST_INVENTORY_STATUS
        && Number(record.payment_status) === LANDED_COST_PAYMENT_STATUS;
}

export function isLandedCostPostingEligible(record: LandedCostStatusRecord): boolean {
    return hasLandedCostStatus(record) && !isPurchaseOrderPosted(record);
}
