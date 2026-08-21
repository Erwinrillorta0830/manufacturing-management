import type { ProductSearchRow } from "../providers/pcrApi";

export function groupIdFor(product: ProductSearchRow): number {
    return product.__group_id ?? product.parent_id ?? product.product_id;
}

export function isChildVariant(product: ProductSearchRow): boolean {
    return Boolean(product.parent_id && Number(product.parent_id) !== Number(product.product_id));
}
