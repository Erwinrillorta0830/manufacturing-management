import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getLatestForexConfig } from "@/app/api/manufacturing/forex/forex-helper";

export interface ImportReceivingLineItem {
    id?: number;
    receiving_import_id?: number;
    product_id: number;
    product_name?: string;
    product_code?: string;
    quantity_received: number;
    quantity_accepted: number;
    quantity_rejected: number;
    foreign_unit_price: number; // USD
    calculated_landed_cost_unit_php: number; // Final Landed Unit Cost PHP
}

export interface ImportReceivingRecord {
    receiving_import_id?: number;
    receiving_number: string;
    import_po_id: number;
    bill_of_lading_number?: string | null;
    date_received: string;
    clearing_forex_rate: number;
    freight_charges_php: number;
    customs_duty_php: number;
    brokerage_charges_php: number;
    other_landed_costs_php: number;
    total_landed_cost_php: number;
    status: "Received" | "Passed QA" | "Quarantined" | "Posted";
    created_by?: number | null;
    items?: ImportReceivingLineItem[];
}

/**
 * Fetches import cargo receivings from Directus.
 */
export async function fetchImportReceivings(importPoId?: number): Promise<ImportReceivingRecord[]> {
    try {
        let filter = "";
        if (importPoId) {
            filter = `&filter[import_po_id][_eq]=${importPoId}`;
        }
        const url = `${DIRECTUS_URL}/items/purchase_order_receiving_import?sort=-receiving_import_id${filter}`;
        const res = await fetch(url, { headers, cache: "no-store" });

        if (res.ok) {
            const json = await res.json();
            const rows = json.data || [];
            return rows.map((r: Record<string, unknown>) => ({
                receiving_import_id: Number(r.receiving_import_id || r.id),
                receiving_number: String(r.receiving_number || `REC-IMP-${r.id}`),
                import_po_id: Number(r.import_po_id),
                bill_of_lading_number: (r.bill_of_lading_number as string) || null,
                date_received: (r.date_received as string) || new Date().toISOString(),
                clearing_forex_rate: Number(r.clearing_forex_rate || 58.00),
                freight_charges_php: Number(r.freight_charges_php || 0),
                customs_duty_php: Number(r.customs_duty_php || 0),
                brokerage_charges_php: Number(r.brokerage_charges_php || 0),
                other_landed_costs_php: Number(r.other_landed_costs_php || 0),
                total_landed_cost_php: Number(r.total_landed_cost_php || 0),
                status: (r.status as string) || "Received",
                created_by: r.created_by ? Number(r.created_by) : null
            }));
        }
    } catch (e) {
        console.error("[Import Receiving Helper] Error fetching import receivings:", e);
    }

    return [];
}

/**
 * Creates an import receiving record, calculates dynamic unit landed cost allocations, and updates stock inventory.
 */
export async function createImportReceiving(input: Partial<ImportReceivingRecord>): Promise<ImportReceivingRecord> {
    const activeForex = await getLatestForexConfig();
    const clearingRate = Number(input.clearing_forex_rate) > 0 ? Number(input.clearing_forex_rate) : activeForex.exchange_rate;

    const freight = Number(input.freight_charges_php) || 0;
    const duty = Number(input.customs_duty_php) || 0;
    const brokerage = Number(input.brokerage_charges_php) || 0;
    const other = Number(input.other_landed_costs_php) || 0;
    const totalAdditionalLandedPhp = freight + duty + brokerage + other;

    const items = input.items || [];
    let totalItemsForeignBasePhp = 0;

    items.forEach(item => {
        const qtyAcc = Number(item.quantity_accepted || item.quantity_received) || 0;
        const priceUsd = Number(item.foreign_unit_price) || 0;
        totalItemsForeignBasePhp += (qtyAcc * priceUsd * clearingRate);
    });

    const processedItems = items.map(item => {
        const qtyAcc = Number(item.quantity_accepted || item.quantity_received) || 0;
        const priceUsd = Number(item.foreign_unit_price) || 0;
        const itemBasePhpTotal = qtyAcc * priceUsd * clearingRate;

        // Allocate additional landed cost proportionally by value
        const valueRatio = totalItemsForeignBasePhp > 0 ? (itemBasePhpTotal / totalItemsForeignBasePhp) : (1 / (items.length || 1));
        const itemAllocatedAddonPhp = totalAdditionalLandedPhp * valueRatio;
        const totalItemLandedPhp = itemBasePhpTotal + itemAllocatedAddonPhp;
        const landedCostPerUnit = qtyAcc > 0 ? (totalItemLandedPhp / qtyAcc) : (priceUsd * clearingRate);

        return {
            ...item,
            quantity_received: Number(item.quantity_received) || qtyAcc,
            quantity_accepted: qtyAcc,
            quantity_rejected: Number(item.quantity_rejected) || 0,
            foreign_unit_price: priceUsd,
            calculated_landed_cost_unit_php: Number(landedCostPerUnit.toFixed(2))
        };
    });

    const overallTotalLandedPhp = totalItemsForeignBasePhp + totalAdditionalLandedPhp;
    const recNumber = input.receiving_number || `REC-IMP-${Date.now().toString().slice(-6)}`;

    const payload = {
        receiving_number: recNumber,
        import_po_id: Number(input.import_po_id),
        bill_of_lading_number: input.bill_of_lading_number || null,
        date_received: input.date_received || new Date().toISOString(),
        clearing_forex_rate: clearingRate,
        freight_charges_php: freight,
        customs_duty_php: duty,
        brokerage_charges_php: brokerage,
        other_landed_costs_php: other,
        total_landed_cost_php: Number(overallTotalLandedPhp.toFixed(2)),
        status: input.status || "Received",
        created_by: input.created_by ? Number(input.created_by) : null
    };

    try {
        const res = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving_import`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const json = await res.json();
            const createdRec = json.data;
            const recId = createdRec.receiving_import_id || createdRec.id;

            if (processedItems.length > 0 && recId) {
                await Promise.all(processedItems.map(item => {
                    return fetch(`${DIRECTUS_URL}/items/purchase_order_receiving_import_items`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            ...item,
                            receiving_import_id: recId
                        })
                    }).catch(err => console.error("Error creating receiving line item:", err));
                }));

                // Post positive inventory movements for accepted items with calculated landed cost
                await Promise.all(processedItems.filter(i => i.quantity_accepted > 0).map(item => {
                    return fetch(`${DIRECTUS_URL}/items/inventory_movements`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify({
                            product_id: item.product_id,
                            quantity: item.quantity_accepted,
                            unit_cost: item.calculated_landed_cost_unit_php,
                            cost_per_unit: item.calculated_landed_cost_unit_php,
                            movement_type: "IN",
                            stock_type: "Raw Materials",
                            transaction_type_id: 1, // Purchase / Import Receipt
                            reference_number: recNumber,
                            notes: `Import cargo receipt via BL #${payload.bill_of_lading_number || "N/A"} @ Forex ₱${clearingRate.toFixed(2)}`
                        })
                    }).catch(movErr => console.error("Error posting import inventory movement:", movErr));
                }));
            }

            return {
                ...createdRec,
                items: processedItems
            };
        }

        console.error("Directus error creating import receiving:", await res.text());
    } catch (e) {
        console.error("[Import Receiving Helper] Error creating import receiving:", e);
    }

    return {
        ...payload,
        items: processedItems
    } as ImportReceivingRecord;
}
