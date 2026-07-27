import { DIRECTUS_URL, headers } from "../directus-api";
import { getTodayDateString } from "@/app/api/manufacturing/directus-api";


const DOCUMENT_TYPE = "Sales Invoice Issue";
const EPSILON = 0.000001;

interface ProductLedgerRow {
    id: number;
    branchId: number;
    productId: number;
    quantity: number;
    documentType: string;
    documentNo: string;
}

async function fetchProductLedgerNet(documentNo: string): Promise<Map<number, number>> {
    const filter = encodeURIComponent(JSON.stringify({
        _and: [
            { documentType: { _eq: DOCUMENT_TYPE } },
            { documentNo: { _eq: documentNo } },
        ],
    }));
    const response = await fetch(
        `${DIRECTUS_URL}/items/product_ledger?filter=${filter}&fields=id,branchId,productId,quantity,documentType,documentNo&limit=-1`,
        { headers, cache: "no-store" }
    );
    if (!response.ok) throw new Error(`Failed to load product ledger (${response.status})`);

    const net = new Map<number, number>();
    const rows: ProductLedgerRow[] = (await response.json()).data || [];
    for (const row of rows) {
        const productId = Number(row.productId);
        net.set(productId, (net.get(productId) || 0) + Number(row.quantity || 0));
    }
    return net;
}

export async function syncProductLedgerToTarget(params: {
    branchId: number;
    documentNo: string;
    targetByProduct: Map<number, number>;
    description: string;
}) {
    const todayStr = await getTodayDateString();
    const current = await fetchProductLedgerNet(params.documentNo);
    const productIds = new Set([...current.keys(), ...params.targetByProduct.keys()]);
    const entries = [...productIds].flatMap((productId) => {
        const delta = (params.targetByProduct.get(productId) || 0) - (current.get(productId) || 0);
        if (Math.abs(delta) < EPSILON) return [];
        return [{
            branchId: params.branchId,
            productId,
            quantity: delta,
            documentType: DOCUMENT_TYPE,
            documentNo: params.documentNo,
            documentDescription: params.description,
            documentDate: todayStr,
        }];
    });
    if (entries.length === 0) return 0;

    const response = await fetch(`${DIRECTUS_URL}/items/product_ledger`, {
        method: "POST",
        headers,
        body: JSON.stringify(entries),
    });
    if (!response.ok) {
        throw new Error(`Failed to post product ledger (${response.status}): ${await response.text()}`);
    }
    const data = (await response.json()).data || [];
    return Array.isArray(data) ? data.length : 1;
}

export async function productLedgerMatchesQuantities(
    documentNo: string,
    expectedByProduct: Map<number, number>
) {
    const current = await fetchProductLedgerNet(documentNo);
    const productIds = new Set([...current.keys(), ...expectedByProduct.keys()]);
    return productIds.size > 0 && [...productIds].every((productId) =>
        Math.abs((current.get(productId) || 0) - (expectedByProduct.get(productId) || 0)) < EPSILON
    );
}

