import { NextResponse } from "next/server";
import { getUserIdFromToken } from "@/app/api/manufacturing/item-management/auth-helper";
import { 
    fetchQuotations, 
    saveQuotation 
} from "./quotes-helper";

export async function GET() {
    try {
        const quotes = await fetchQuotations();
        return NextResponse.json(quotes);
    } catch (e) {
        console.error("API Error fetching quotations:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch quotations" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { header, snapshots } = body;
        
        if (!header || !header.quote_number || !header.customer_id || !snapshots || snapshots.length === 0) {
            return NextResponse.json({ error: "Missing required quote header or snapshot fields" }, { status: 400 });
        }

        const invalidSnapshot = snapshots.find((snapshot: Record<string, unknown>) => {
            const productId = Number(snapshot.product_id);
            const versionId = Number(snapshot.version_id);
            const quantity = Number(snapshot.quantity);
            const unitCost = Number(snapshot.frozen_unit_cost_php);
            const totalCost = Number(snapshot.frozen_total_cost_php);
            return !Number.isInteger(productId) || productId <= 0
                || !Number.isInteger(versionId) || versionId <= 0
                || !Number.isFinite(quantity) || quantity < 0
                || !Number.isFinite(unitCost) || unitCost < 0
                || !Number.isFinite(totalCost) || totalCost < 0
                || typeof snapshot.node_name !== "string" || !snapshot.node_name.trim()
                || typeof snapshot.node_type !== "string" || !snapshot.node_type.trim()
                || typeof snapshot.uom !== "string" || !snapshot.uom.trim();
        });

        if (invalidSnapshot) {
            return NextResponse.json({ error: "Each quotation snapshot must contain valid product, BOM version, node, quantity, UOM, and cost values" }, { status: 400 });
        }

        const result = await saveQuotation(header, snapshots);
        return NextResponse.json(result);
    } catch (e) {
        console.error("API Error saving quotation snapshot:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to save quotation snapshot" }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const { quoteId, projectId, status } = body;

        if (!quoteId || !status) {
            return NextResponse.json({ error: "Missing quoteId or status" }, { status: 400 });
        }

        const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
        const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";
        const reqHeaders: Record<string, string> = {
            "Content-Type": "application/json"
        };
        if (DIRECTUS_STATIC_TOKEN) {
            reqHeaders["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
        }
        
        const userId = await getUserIdFromToken().catch(() => null);

        // Update the quotation header status
        const res = await fetch(`${DIRECTUS_URL}/items/quotation_header/${quoteId}`, {
            method: "PATCH",
            headers: reqHeaders,
            body: JSON.stringify({ status, modified_by: userId })
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Failed to update quotation status: ${res.status} - ${errText}`);
        }

        // Also update the parent project status if projectId is provided and status is "Rejected"
        if (projectId && status === "Rejected") {
            const projectRes = await fetch(`${DIRECTUS_URL}/items/projects/${projectId}`, {
                method: "PATCH",
                headers: reqHeaders,
                body: JSON.stringify({ status, modified_by: userId })
            });

            if (!projectRes.ok) {
                const errText = await projectRes.text();
                throw new Error(`Failed to update parent project status: ${projectRes.status} - ${errText}`);
            }
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("API Error updating quotation status:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to update quotation status" }, { status: 500 });
    }
}
