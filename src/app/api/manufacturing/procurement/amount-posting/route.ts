import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "../_directus";
import { processPurchaseAmountPosting } from "./amount-posting-helper";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const poId = searchParams.get("poId");

        // Fetch chart of accounts
        const coaRes = await fetch(`${DIRECTUS_URL}/items/chart_of_accounts?limit=-1&sort=gl_code`, {
            headers,
            cache: "no-store"
        }).catch(() => null);

        let chartOfAccounts = [];
        if (coaRes && coaRes.ok) {
            const coaData = await coaRes.json();
            chartOfAccounts = coaData?.data || [];
        }

        // Fetch forex exchange rate from forex_configurations
        const forexRes = await fetch(`${DIRECTUS_URL}/items/forex_configurations?filter[currency_code][_eq]=USD&limit=1`, {
            headers,
            cache: "no-store"
        }).catch(() => null);

        let activeForexRate = 58.50; // Default fallback exchange rate PHP/USD
        if (forexRes && forexRes.ok) {
            const forexData = await forexRes.json();
            if (forexData?.data?.[0]?.exchange_rate) {
                activeForexRate = Number(forexData.data[0].exchange_rate);
            }
        }

        if (!poId) {
            return NextResponse.json({
                chartOfAccounts,
                activeForexRate
            });
        }

        // Fetch purchase order details
        const poRes = await fetch(`${DIRECTUS_URL}/items/purchase_order/${poId}?fields=*,supplier_name.*`, {
            headers,
            cache: "no-store"
        });

        if (!poRes.ok) {
            return NextResponse.json({ error: "Purchase Order not found" }, { status: 404 });
        }

        const poData = await poRes.json();
        const purchaseOrder = poData?.data;

        // Fetch PO line items from purchase_order_receiving
        const linesRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_receiving?filter[purchase_order_id][_eq]=${poId}&filter[is_reverted][_eq]=0&fields=*,product_id.*&limit=-1`, {
            headers,
            cache: "no-store"
        });

        let lineItems = [];
        if (linesRes.ok) {
            const linesData = await linesRes.json();
            lineItems = linesData?.data || [];
        }

        // Fetch existing import landed cost entries
        const importRes = await fetch(`${DIRECTUS_URL}/items/purchase_order_import?filter[purchase_order_id][_eq]=${poId}&fields=*&limit=-1`, {
            headers,
            cache: "no-store"
        }).catch(() => null);

        let importExpenses = [];
        if (importRes && importRes.ok) {
            const importData = await importRes.json();
            importExpenses = importData?.data || [];
        }

        return NextResponse.json({
            purchaseOrder,
            lineItems,
            importExpenses,
            chartOfAccounts,
            activeForexRate
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Internal Server Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();

        if (!body.purchase_order_id || !Array.isArray(body.line_items)) {
            return NextResponse.json({ error: "Missing required purchase_order_id or line_items" }, { status: 400 });
        }

        // Process posting and hybrid landed cost allocation
        const result = await processPurchaseAmountPosting(body);

        return NextResponse.json(result);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Allocation Error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
