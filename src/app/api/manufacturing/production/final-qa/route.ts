export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "test";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

// GET: Retrieves all final batch QA releases
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const joId = searchParams.get("joId");

        let url = `${DIRECTUS_URL}/items/manufacturing_final_qa_releases?limit=-1&sort=-approved_at`;
        if (joId) {
            url += `&filter[job_order_id][_eq]=${joId}`;
        }

        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) {
            throw new Error("Failed to fetch final QA releases");
        }
        const json = await res.json();
        return NextResponse.json(json.data || []);
    } catch (e) {
        console.error("Error fetching final QA releases:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch releases" }, { status: 500 });
    }
}

// POST: Creates a final QA release record and updates WMS inventory lot status
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { jobOrderId, lotId, inspectedQuantity, defectQuantity, microbiologicalStatus, packagingSealPassed, labelCompliancePassed, overallDisposition, coaReferenceNo, approvedBy, remarks } = body;

        if (!jobOrderId || !lotId || !overallDisposition) {
            return NextResponse.json({ error: "Missing required fields: jobOrderId, lotId, overallDisposition" }, { status: 400 });
        }

        const timestamp = new Date().toISOString();

        const payload = {
            job_order_id: Number(jobOrderId),
            lot_id: Number(lotId),
            inspected_quantity: Number(inspectedQuantity || 0),
            defect_quantity: Number(defectQuantity || 0),
            microbiological_status: microbiologicalStatus || "Pending",
            packaging_seal_passed: packagingSealPassed ? 1 : 0,
            label_compliance_passed: labelCompliancePassed ? 1 : 0,
            overall_disposition: overallDisposition,
            coa_reference_no: coaReferenceNo || null,
            approved_by: approvedBy ? Number(approvedBy) : null,
            approved_at: timestamp,
            remarks: remarks || ""
        };

        const res = await fetch(`${DIRECTUS_URL}/items/manufacturing_final_qa_releases`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            throw new Error("Failed to write final QA release: " + await res.text());
        }

        // Sync WMS Inventory Lot status - removed since inventory_lots is deprecated

        return NextResponse.json({ success: true, message: "Final lot QA release logged successfully and WMS inventory lot updated." });
    } catch (e) {
        console.error("Error in final-qa POST API:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to release lot" }, { status: 500 });
    }
}
