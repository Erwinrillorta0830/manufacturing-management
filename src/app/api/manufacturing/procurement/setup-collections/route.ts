import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "../_directus";

const NEW_COLLECTIONS = [
    {
        collection: "purchase_order_import",
        meta: {
            collection: "purchase_order_import",
            icon: "receipt_long",
            note: "Import Purchase Order Landed Expenses linked to Chart of Accounts",
            hidden: false
        },
        schema: { name: "purchase_order_import" }
    },
    {
        collection: "purchase_order_receiving_import_allocation",
        meta: {
            collection: "purchase_order_receiving_import_allocation",
            icon: "calculate",
            note: "Line Item Landed Cost Allocations and Rounding Variance Adjustments",
            hidden: false
        },
        schema: { name: "purchase_order_receiving_import_allocation" }
    },
    {
        collection: "forex_configurations",
        meta: {
            collection: "forex_configurations",
            icon: "currency_exchange",
            note: "Active Foreign Exchange Rates Configurations (USD/PHP, EUR/PHP)",
            hidden: false
        },
        schema: { name: "forex_configurations" }
    },
    {
        collection: "forex_rate_history",
        meta: {
            collection: "forex_rate_history",
            icon: "history",
            note: "Audit Log History for Exchange Rate Changes and Reasons",
            hidden: false
        },
        schema: { name: "forex_rate_history" }
    }
];

const DELIVERY_TERMS_FIELDS = [
    {
        collection: "purchase_order",
        field: "delivery_terms",
        type: "string",
        schema: { is_nullable: true, max_length: 255 }
    },
    {
        collection: "suppliers",
        field: "delivery_terms",
        type: "string",
        schema: { is_nullable: true, max_length: 255 }
    }
];

export async function GET() {
    const results = [];

    for (const col of NEW_COLLECTIONS) {
        try {
            // Check if collection already exists in Directus
            const checkRes = await fetch(`${DIRECTUS_URL}/collections/${col.collection}`, { headers, cache: "no-store" });
            if (checkRes.ok) {
                results.push({ collection: col.collection, status: "Already registered in Directus" });
                continue;
            }

            // Register collection in Directus
            const createRes = await fetch(`${DIRECTUS_URL}/collections`, {
                method: "POST",
                headers,
                body: JSON.stringify(col)
            });

            if (createRes.ok) {
                results.push({ collection: col.collection, status: "Successfully created in Directus" });
            } else {
                const errData = await createRes.json().catch(() => null);
                results.push({ collection: col.collection, status: "Failed", error: errData });
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Unknown error";
            results.push({ collection: col.collection, status: "Error", error: message });
        }
    }

    // Ensure is_foreign and currency fields have metadata in Directus suppliers collection
    const supplierFields = ["is_foreign", "currency"];
    for (const field of supplierFields) {
        try {
            await fetch(`${DIRECTUS_URL}/fields/suppliers/${field}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify({
                    meta: { collection: "suppliers", field, interface: "input", readonly: false, hidden: false }
                })
            });
            results.push({ field: `suppliers.${field}`, status: "Directus metadata synchronized" });
        } catch {
            results.push({ field: `suppliers.${field}`, status: "Failed to sync metadata" });
        }
    }

    for (const definition of DELIVERY_TERMS_FIELDS) {
        try {
            const fieldUrl = `${DIRECTUS_URL}/fields/${definition.collection}/${definition.field}`;
            const existing = await fetch(fieldUrl, { headers, cache: "no-store" });
            if (existing.ok) {
                const patchRes = await fetch(fieldUrl, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify({
                        meta: {
                            collection: definition.collection,
                            field: definition.field,
                            interface: "input",
                            readonly: false,
                            hidden: false
                        }
                    })
                });
                results.push({
                    field: `${definition.collection}.${definition.field}`,
                    status: patchRes.ok ? "Directus metadata synchronized" : "Failed to sync Directus metadata"
                });
                continue;
            }

            if (existing.status !== 404) {
                results.push({
                    field: `${definition.collection}.${definition.field}`,
                    status: `Unable to inspect field (${existing.status})`
                });
                continue;
            }

            const createRes = await fetch(`${DIRECTUS_URL}/fields/${definition.collection}`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    field: definition.field,
                    type: definition.type,
                    schema: definition.schema,
                    meta: {
                        collection: definition.collection,
                        field: definition.field,
                        interface: "input",
                        readonly: false,
                        hidden: false
                    }
                })
            });
            results.push({
                field: `${definition.collection}.${definition.field}`,
                status: createRes.ok ? "Successfully registered in Directus" : "Failed to register in Directus"
            });
        } catch {
            results.push({
                field: `${definition.collection}.${definition.field}`,
                status: "Failed to synchronize Directus field"
            });
        }
    }

    return NextResponse.json({
        message: "Directus Collection Setup Execution Finished",
        results
    });
}
