// VOS ERP - Procurement Directus API Service

import { DIRECTUS_URL, headers } from "./core-api.service";
import type { DirectusProduct } from "./finished-goods-api.service";

export interface DirectusProductPerSupplier {
    id: number;
    supplier_id: number;
    product_id: DirectusProduct & {
        unit_of_measurement?: {
            unit_id: number;
            unit_name: string;
            unit_shortcut: string;
            sku_code?: string | null;
        } | null;
    };
}

export interface DirectusSupplier {
    id: number;
    supplier_name: string;
    supplier_shortcut?: string | null;
    isActive?: boolean;
    is_foreign?: number | boolean;
    currency?: string;
    country?: string;
}

export interface DirectusShipment {
    shipment_id?: number;
    reference_number: string;
    supplier_id: number | Record<string, unknown>;
    date_received: string | null;
    total_foreign_currency: number;
    exchange_rate: number;
    total_php_value: number;
    status: "Ordered" | "Approved" | "Receiving (QA)" | "Received";
    created_at?: string;
}

export interface DirectusShipmentLineItem {
    line_id?: number;
    shipment_id: number;
    product_id: number | Record<string, unknown>;
    quantity_received: number;
    base_unit_cost_php: number;
    allocated_expense_php: number;
    final_landed_unit_cost: number;
}

export interface DirectusShipmentExpense {
    expense_id?: number;
    shipment_id: number;
    expense_type: string;
    amount_php: number;
    allocation_method: "Value" | "Weight" | "Volume";
}

/**
 * Fetches all active suppliers from Directus.
 */
export async function fetchSuppliers(): Promise<DirectusSupplier[]> {
    try {
        const res = await fetch(`${DIRECTUS_URL}/items/suppliers?fields=id,supplier_name,supplier_shortcut,contact_person,email_address,phone_number,address,city,brgy,state_province,postal_code,country,supplier_type,tin_number,bank_details,payment_terms,delivery_terms,agreement_or_contract,preferred_communication_method,notes_or_comments,date_added,supplier_image,isActive,nonBuy,user_id,is_foreign,currency&filter[isActive][_eq]=true&sort=supplier_name&limit=-1`, { headers, cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch suppliers");
        const json = await res.json();
        return json.data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Error fetching suppliers:", e);
        return [];
    }
}

/**
 * Create a new supplier
 */
export async function createSupplier(supplierData: Record<string, unknown>): Promise<unknown> {
    try {
        const url = `${DIRECTUS_URL}/items/suppliers`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({ ...supplierData, isActive: 1 })
        });
        if (!res.ok) throw new Error(`Failed to create supplier: ${res.status}`);
        return (await res.json()).data;
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to create supplier:", e);
        throw e;
    }
}

/**
 * Fetches products linked to a supplier.
 */
export async function fetchProductsBySupplier(supplierId: number): Promise<DirectusProductPerSupplier[]> {
    try {
        const url = `${DIRECTUS_URL}/items/product_per_supplier?filter[supplier_id][_eq]=${supplierId}&fields=id,supplier_id,product_id.*,product_id.unit_of_measurement.*&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) throw new Error("Failed to fetch products for supplier");
        const json = await res.json();
        return json.data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Error fetching products for supplier:", e);
        return [];
    }
}

/**
 * Fetch expenses for a shipment
 */
export async function fetchShipmentExpenses(shipmentId: number): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/purchase_order_expenses?filter[purchase_order_id][_eq]=${shipmentId}&fields=*,overhead_id.*&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch shipment expenses:", e);
        return [];
    }
}

/**
 * Allocate shipment expenses and calculate final landed unit costs
 */
export async function processShipmentLandedCosts(
    shipmentId: number,
    status: "Ordered" | "Approved" | "Receiving (QA)" | "Received",
    expenses: Array<Partial<DirectusShipmentExpense>>,
    allocationMethod: "Value" | "Weight" | "Volume",
    _lineItemUpdates?: Array<{ line_id: number; quantity_received: number }>
): Promise<unknown> {
    try {
        void _lineItemUpdates;
        // 1. Delete existing expenses for this shipment
        const oldExpensesRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_expenses?filter[purchase_order_id][_eq]=${shipmentId}&limit=-1`, { headers });
        if (oldExpensesRes.ok) {
            const oldExpenses = (await oldExpensesRes.json()).data || [];
            for (const exp of oldExpenses) {
                await fetch(`${DIRECTUS_URL}/items/purchase_order_expenses/${exp.expense_id}`, { method: "DELETE", headers }).catch(() => {});
            }
        }

        // 2. Save new expenses and sum up PHP total
        let totalExpensesPhp = 0;
        for (const exp of expenses) {
            const resExp = await fetch(`${DIRECTUS_URL}/items/purchase_order_expenses`, {
                method: "POST",
                headers,
                body: JSON.stringify({ ...exp, purchase_order_id: shipmentId, allocation_method: allocationMethod })
            });
            if (resExp.ok) {
                const data = (await resExp.json()).data;
                totalExpensesPhp += Number(data.amount_php || 0);
            }
        }

        // 3. Fetch shipment line items with product fields for allocation weight/volume ratios
        const linesRes = await fetch(`${DIRECTUS_URL}/items/shipment_line_items?filter[shipment_id][_eq]=${shipmentId}&fields=*,product_id.*&limit=-1`, { headers });
        if (!linesRes.ok) throw new Error("Failed to load shipment line items");
        const lines = (await linesRes.json()).data || [];

        if (lines.length === 0) {
            // No lines, just update status
            await fetch(`${DIRECTUS_URL}/items/incoming_shipments/${shipmentId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({ status })
            });
            return { success: true };
        }

        // 4. Calculate total base values for allocation
        let totalWeight = 0;
        let totalVolume = 0;
        let totalCommercialValuePhp = 0;

        lines.forEach((l: { quantity_received?: unknown; base_unit_cost_php?: unknown; product_id?: { weight?: unknown; product_weight?: unknown; cbm_height?: unknown; cbm_width?: unknown; cbm_length?: unknown; product_id: string | number }; line_id?: unknown }) => {
            const qty = Number(l.quantity_received) || 0;
            const price = Number(l.base_unit_cost_php) || 0;
            totalCommercialValuePhp += qty * price;

            const prod = l.product_id;
            const weight = Number(prod?.weight || prod?.product_weight || 0);
            totalWeight += qty * weight;

            const height = Number(prod?.cbm_height || 0);
            const width = Number(prod?.cbm_width || 0);
            const length = Number(prod?.cbm_length || 0);
            totalVolume += qty * (height * width * length);
        });

        // 5. Allocate expenses and update shipment_line_items
        for (const l of lines) {
            const qty = Number(l.quantity_received) || 1;
            const price = Number(l.base_unit_cost_php) || 0;
            const lineValuePhp = qty * price;

            let ratio = 0;
            if (allocationMethod === "Weight" && totalWeight > 0) {
                const prod = l.product_id;
                const weight = Number(prod?.weight || prod?.product_weight || 0);
                ratio = (qty * weight) / totalWeight;
            } else if (allocationMethod === "Volume" && totalVolume > 0) {
                const prod = l.product_id;
                const height = Number(prod?.cbm_height || 0);
                const width = Number(prod?.cbm_width || 0);
                const length = Number(prod?.cbm_length || 0);
                ratio = (qty * (height * width * length)) / totalVolume;
            } else {
                // Default: Commercial Value
                if (totalCommercialValuePhp > 0) {
                    ratio = lineValuePhp / totalCommercialValuePhp;
                } else {
                    ratio = 1 / lines.length;
                }
            }

            const allocatedExpense = ratio * totalExpensesPhp;
            const finalLandedUnitCost = price + (qty > 0 ? (allocatedExpense / qty) : 0);

            // Update shipment line item
            await fetch(`${DIRECTUS_URL}/items/shipment_line_items/${l.line_id}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    allocated_expense_php: allocatedExpense,
                    final_landed_unit_cost: finalLandedUnitCost
                })
            });

            // If shipment is received, update product table cost_per_unit & estimated_unit_cost
            if (status === "Received" || status === "Receiving (QA)") {
                await fetch(`${DIRECTUS_URL}/items/products/${l.product_id.product_id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        cost_per_unit: finalLandedUnitCost,
                        estimated_unit_cost: finalLandedUnitCost
                    })
                });
            }
        }

        // 6. Update Shipment Header Status
        const updatePayload: Record<string, unknown> = { status };
        if (status === "Received" || status === "Receiving (QA)") {
            updatePayload.date_received = new Date().toISOString().split('T')[0];
        }
        await fetch(`${DIRECTUS_URL}/items/incoming_shipments/${shipmentId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updatePayload)
        });

        return { success: true };
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed in processShipmentLandedCosts:", e);
        throw e;
    }
}

/**
 * Fetch all incoming shipments
 */
export async function fetchIncomingShipments(): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/incoming_shipments?fields=*,supplier_id.*&sort=-created_at&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch incoming shipments:", e);
        return [];
    }
}

/**
 * Fetch line items for a shipment
 */
export async function fetchShipmentLineItems(shipmentId: number): Promise<unknown[]> {
    try {
        const url = `${DIRECTUS_URL}/items/shipment_line_items?filter[shipment_id][_eq]=${shipmentId}&fields=*,product_id.*,product_id.unit_of_measurement.*&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return [];
        return (await res.json()).data || [];
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to fetch shipment line items:", e);
        return [];
    }
}

/**
 * Create an incoming shipment along with line items
 */
export async function createIncomingShipment(
    shipmentData: Partial<DirectusShipment>,
    lineItems: Array<Partial<DirectusShipmentLineItem>>
): Promise<unknown> {
    let shipmentId: number | null = null;
    const createdLineIds: number[] = [];
    try {
        const url = `${DIRECTUS_URL}/items/incoming_shipments`;
        const res = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify({
                ...shipmentData,
                status: shipmentData.status || "Shipped",
                date_received: shipmentData.date_received || new Date().toISOString().split('T')[0]
            })
        });
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`Failed to create shipment header: ${res.status} - ${txt}`);
        }
        const shipmentJson = await res.json();
        shipmentId = shipmentJson.data.shipment_id;

        for (const item of lineItems) {
            const payload = {
                ...item,
                shipment_id: shipmentId,
                allocated_expense_php: 0,
                final_landed_unit_cost: item.base_unit_cost_php || 0,
                quantity_received: 0
            };
            const itemRes = await fetch(`${DIRECTUS_URL}/items/shipment_line_items`, {
                method: "POST",
                headers,
                body: JSON.stringify(payload)
            });
            if (!itemRes.ok) throw new Error(`Failed to create line item: ${itemRes.status}`);
            const itemJson = await itemRes.json();
            createdLineIds.push(itemJson.data.line_id);
        }

        return { success: true, shipment_id: shipmentId };
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to save incoming shipment. Rolling back...", e);
        for (const lid of createdLineIds) {
            await fetch(`${DIRECTUS_URL}/items/shipment_line_items/${lid}`, { method: "DELETE", headers }).catch(() => {});
        }
        if (shipmentId) {
            await fetch(`${DIRECTUS_URL}/items/incoming_shipments/${shipmentId}`, { method: "DELETE", headers }).catch(() => {});
        }
        throw e;
    }
}

/**
 * Updates status of an incoming shipment, and commits product costs if status is Receiving (QA).
 */
export async function updateIncomingShipmentStatus(
    shipmentId: number, 
    status: "Ordered" | "Approved" | "Receiving (QA)" | "Received"
) {
    try {
        if (status === "Receiving (QA)" || status === "Received") {
            const linesRes = await fetch(`${DIRECTUS_URL}/items/shipment_line_items?filter[shipment_id][_eq]=${shipmentId}&fields=*,product_id.*&limit=-1`, { headers });
            if (linesRes.ok) {
                const lines = (await linesRes.json()).data || [];
                for (const l of lines) {
                    const finalLandedUnitCost = Number(l.final_landed_unit_cost || l.base_unit_cost_php || 0);
                    if (finalLandedUnitCost > 0 && l.product_id?.product_id) {
                        await fetch(`${DIRECTUS_URL}/items/products/${l.product_id.product_id}`, {
                            method: "PATCH",
                            headers,
                            body: JSON.stringify({
                                cost_per_unit: finalLandedUnitCost,
                                estimated_unit_cost: finalLandedUnitCost
                            })
                        }).catch(err => console.error("Error updating product cost on status change:", err));
                    }
                }
            }
        }

        const updatePayload: Record<string, unknown> = { status };
        if (status === "Received" || status === "Receiving (QA)") {
            updatePayload.date_received = new Date().toISOString().split('T')[0];
        }
        const res = await fetch(`${DIRECTUS_URL}/items/incoming_shipments/${shipmentId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updatePayload)
        });

        if (!res.ok) throw new Error(`Failed to update shipment status: ${res.status}`);
        return { success: true };
    } catch (e) {
        console.error("[Manufacturing Directus API] Failed to update incoming shipment status:", e);
        throw e;
    }
}
