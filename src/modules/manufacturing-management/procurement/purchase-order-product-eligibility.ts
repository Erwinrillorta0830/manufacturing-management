export function hasBomDisabled(product: { has_bom?: unknown } | null | undefined): boolean {
    const hasBom = product?.has_bom;
    return hasBom === 0 || hasBom === false || (typeof hasBom === "string" && hasBom.trim() === "0");
}
