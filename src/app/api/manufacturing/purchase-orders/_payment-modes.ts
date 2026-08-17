import { procurementDirectusFetch } from "../procurement/_directus";

export interface PurchaseOrderPaymentMode {
    id: number;
    mode_name: string;
    code: string;
    is_active?: boolean | number | null;
    sort_order?: number | null;
}

export class PurchaseOrderPaymentModeError extends Error {
    constructor(message: string, public readonly status = 400) {
        super(message);
    }
}

function isActive(value: PurchaseOrderPaymentMode["is_active"]): boolean {
    return value === true || Number(value) === 1;
}

export async function fetchPurchaseOrderPaymentModes(): Promise<PurchaseOrderPaymentMode[]> {
    const params = new URLSearchParams({
        "filter[is_active][_eq]": "1",
        fields: "id,mode_name,code,is_active,sort_order",
        sort: "sort_order,mode_name",
        limit: "-1"
    });
    const response = await procurementDirectusFetch(`/items/purchase_order_payment_modes?${params.toString()}`);
    if (!response.ok) {
        throw new PurchaseOrderPaymentModeError("Unable to load configured payment types.", response.status >= 500 ? 503 : response.status);
    }
    return ((await response.json()).data || []) as PurchaseOrderPaymentMode[];
}

export async function validatePurchaseOrderPaymentMode(id: number): Promise<PurchaseOrderPaymentMode> {
    const response = await procurementDirectusFetch(
        `/items/purchase_order_payment_modes/${id}?fields=id,mode_name,code,is_active,sort_order`
    );
    if (!response.ok) {
        throw new PurchaseOrderPaymentModeError("The selected Payment Type was not found.", response.status >= 500 ? 503 : 400);
    }
    const mode = (await response.json()).data as PurchaseOrderPaymentMode | null;
    if (!mode || !isActive(mode.is_active)) {
        throw new PurchaseOrderPaymentModeError("The selected Payment Type is inactive.");
    }
    return mode;
}
