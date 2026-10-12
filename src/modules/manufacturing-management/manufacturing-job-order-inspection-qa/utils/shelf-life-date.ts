export function expiryDateFromShelfLife(
    manufacturingDate: string,
    shelfLifeDays: number | null | undefined
): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(manufacturingDate)) return null;
    if (typeof shelfLifeDays !== "number" || !Number.isSafeInteger(shelfLifeDays) || shelfLifeDays <= 0) {
        return null;
    }

    const expiryDate = new Date(`${manufacturingDate}T00:00:00.000Z`);
    if (!Number.isFinite(expiryDate.getTime()) || expiryDate.toISOString().slice(0, 10) !== manufacturingDate) {
        return null;
    }

    expiryDate.setUTCDate(expiryDate.getUTCDate() + shelfLifeDays);
    if (!Number.isFinite(expiryDate.getTime())) return null;

    const result = expiryDate.toISOString().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(result) ? result : null;
}
