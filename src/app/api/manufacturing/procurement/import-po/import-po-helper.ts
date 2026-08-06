import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getLatestForexConfig } from "@/app/api/manufacturing/forex/forex-helper";

export interface ImportPOLineItem {
    id?: number;
    import_po_id?: number;
    product_id: number;
    product_name?: string;
    product_code?: string;
    quantity_ordered: number;
    unit_of_measurement?: string;
    foreign_unit_price: number; // USD
    total_foreign_price: number; // USD
    estimated_landed_cost_php?: number; // PHP per unit
}

export interface ImportPurchaseOrderRecord {
    import_po_id?: number;
    import_po_number: string;
    supplier_id: number;
    supplier_name?: string;
    order_date: string;
    expected_arrival_date?: string | null;
    purchase_currency: string;
    forex_rate: number;
    status: "Draft" | "Submitted" | "In Transit" | "Partial Receiving" | "Completed" | "Cancelled";
    total_foreign_amount: number;
    total_local_amount: number;
    remarks?: string | null;
    created_by?: number | null;
    items?: ImportPOLineItem[];
}

/**
 * Fetches all import purchase orders from Directus.
 */
export async function fetchImportPOs(supplierId?: number): Promise<ImportPurchaseOrderRecord[]> {
    try {
        let filter = "";
        if (supplierId) {
            filter = `&filter[supplier_id][_eq]=${supplierId}`;
        }
        const url = `${DIRECTUS_URL}/items/purchase_order_import?fields=*,supplier_id.id,supplier_id.supplier_name&sort=-import_po_id${filter}`;
        const res = await fetch(url, { headers, cache: "no-store" });

        if (res.ok) {
            const json = await res.json();
            const pos = json.data || [];
            return pos.map((po: Record<string, unknown>) => {
                const supplierObj = typeof po.supplier_id === "object" && po.supplier_id !== null ? (po.supplier_id as Record<string, unknown>) : null;
                return {
                    import_po_id: Number(po.import_po_id || po.id),
                    import_po_number: String(po.import_po_number || po.po_number || `PO-IMP-${po.id}`),
                    supplier_id: supplierObj ? Number(supplierObj.id) : (po.supplier_id ? Number(po.supplier_id) : undefined),
                    supplier_name: supplierObj ? String(supplierObj.supplier_name || "") : (po.supplier_name ? String(po.supplier_name) : undefined),
                    order_date: (po.order_date as string) || new Date().toISOString().split("T")[0],
                    expected_arrival_date: (po.expected_arrival_date as string) || null,
                    purchase_currency: (po.purchase_currency as string) || "USD",
                    forex_rate: Number(po.forex_rate || 58.00),
                    status: (po.status as string) || "Draft",
                    total_foreign_amount: Number(po.total_foreign_amount || 0),
                    total_local_amount: Number(po.total_local_amount || 0),
                    remarks: (po.remarks as string) || null,
                    created_by: po.created_by ? Number(po.created_by) : null
                };
            });
        }
    } catch (e) {
        console.error("[Import PO API Helper] Error fetching import POs:", e);
    }

    return [];
}

/**
 * Creates a new import purchase order with line items. Automatically locks latest forex rate if not provided.
 */
export async function createImportPO(input: Partial<ImportPurchaseOrderRecord>): Promise<ImportPurchaseOrderRecord> {
    const activeForex = await getLatestForexConfig();
    const forexRate = Number(input.forex_rate) > 0 ? Number(input.forex_rate) : activeForex.exchange_rate;

    const items = input.items || [];
    let totalForeign = 0;
    const processedItems = items.map((item) => {
        const qty = Number(item.quantity_ordered) || 0;
        const priceUsd = Number(item.foreign_unit_price) || 0;
        const totalUsd = qty * priceUsd;
        totalForeign += totalUsd;
        const estLandedPhp = priceUsd * forexRate * 1.12; // 12% est tariff & freight allowance
        return {
            ...item,
            quantity_ordered: qty,
            foreign_unit_price: priceUsd,
            total_foreign_price: totalUsd,
            estimated_landed_cost_php: Number(estLandedPhp.toFixed(2))
        };
    });

    const totalLocal = totalForeign * forexRate;
    const poNumber = input.import_po_number || `PO-IMP-${Date.now().toString().slice(-6)}`;

    const payload = {
        import_po_number: poNumber,
        supplier_id: Number(input.supplier_id),
        order_date: input.order_date || new Date().toISOString().split("T")[0],
        expected_arrival_date: input.expected_arrival_date || null,
        purchase_currency: input.purchase_currency || "USD",
        forex_rate: forexRate,
        status: input.status || "Draft",
        total_foreign_amount: Number(totalForeign.toFixed(2)),
        total_local_amount: Number(totalLocal.toFixed(2)),
        remarks: input.remarks || null,
        created_by: input.created_by ? Number(input.created_by) : null
    };

    try {
        const res = await fetch(`${DIRECTUS_URL}/items/purchase_order_import`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const json = await res.json();
            const createdPo = json.data;
            const poId = createdPo.import_po_id || createdPo.id;

            // Create line items in purchase_order_import_items
            if (processedItems.length > 0 && poId) {
                await Promise.all(processedItems.map(item => {
                    return fetch(`${DIRECTUS_URL}/items/purchase_order_import_items`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            ...item,
                            import_po_id: poId
                        })
                    }).catch(err => console.error("Error creating PO line item:", err));
                }));
            }

            return {
                ...createdPo,
                items: processedItems
            };
        }

        console.error("Directus error creating import PO:", await res.text());
    } catch (e) {
        console.error("[Import PO API Helper] Error creating import PO:", e);
    }

    return {
        ...payload,
        items: processedItems
    } as ImportPurchaseOrderRecord;
}
