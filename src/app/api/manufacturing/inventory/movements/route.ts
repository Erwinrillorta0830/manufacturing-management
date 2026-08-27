import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { z } from "zod";

// Zod schema for individual movement line validation
const movementItemSchema = z.object({
    product_id: z.number().int().positive("product_id must be a positive integer"),
    version_id: z.number().int().positive("version_id must be a positive integer").nullable().optional(),
    lot_id: z.number().int().positive("lot_id must be a positive integer"),
    branch_id: z.number().int().positive("branch_id must be a positive integer"),
    transaction_type_id: z.number().int().positive("transaction_type_id must be a positive integer"),
    source_document_id: z.number().int().positive("source_document_id must be a positive integer"),
    source_document_no: z.string().nullable().optional(),
    batch_no: z.string().min(1, "batch_no cannot be empty"),
    expiry_date: z.string().nullable().optional(),
    manufacturing_date: z.string().nullable().optional(),
    quantity: z.number(),
    remarks: z.string().nullable().optional(),
});

const postPayloadSchema = z.object({
    movements: z.array(movementItemSchema).min(1, "At least one inventory movement is required"),
});

// Secure helper to extract logged-in user_id from session token
async function getUserIdFromSession(): Promise<number | null> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("vos_access_token")?.value;
        if (token) {
            const parts = token.split(".");
            if (parts.length >= 2) {
                const base64Url = parts[1];
                let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
                while (base64.length % 4) base64 += "=";
                const jsonPayload = Buffer.from(base64, "base64").toString("utf8");
                const payload = JSON.parse(jsonPayload);
                const rawId = payload?.id || payload?.user_id || payload?.sub;
                if (rawId) {
                    const parsed = Number(rawId);
                    if (!isNaN(parsed)) return parsed;
                }
            }
        }
    } catch (e) {
        console.error("[Inventory movements BFF] Error resolving user session:", e);
    }
    return null;
}

/**
 * GET /api/manufacturing/inventory/movements
 * Retrieves a filtered and cursor-paginated list of movements from Directus
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const productId = searchParams.get("productId");
        const branchId = searchParams.get("branchId");
        const lotId = searchParams.get("lotId");
        const batchNo = searchParams.get("batchNo");
        const sinceId = searchParams.get("sinceId");
        const capacityOverride = searchParams.get("capacityOverride");
        const limitVal = searchParams.get("limit") || "100";

        const filterParts: string[] = [];
        
        if (productId) {
            filterParts.push(`filter[product_id][_eq]=${productId}`);
        }
        if (branchId) {
            filterParts.push(`filter[branch_id][_eq]=${branchId}`);
        }
        if (lotId) {
            filterParts.push(`filter[lot_id][_eq]=${lotId}`);
        }
        if (batchNo) {
            filterParts.push(`filter[batch_no][_contains]=${encodeURIComponent(batchNo)}`);
        }
        if (sinceId) {
            filterParts.push(`filter[movement_id][_gt]=${sinceId}`);
        }
        if (capacityOverride === "true" || capacityOverride === "1") {
            filterParts.push("filter[is_capacity_override][_eq]=1");
        } else if (capacityOverride === "false" || capacityOverride === "0") {
            filterParts.push("filter[is_capacity_override][_eq]=0");
        }

        const limit = Math.min(Number(limitVal) || 100, 500);
        const filterQuery = filterParts.length > 0 ? `&${filterParts.join("&")}` : "";
        const url = `${DIRECTUS_URL}/items/inventory_movements?limit=${limit}&sort=movement_id${filterQuery}`;

        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) {
            throw new Error(`Directus returned status ${res.status}: ${res.statusText}`);
        }

        const json = await res.json();
        const movements = json.data || [];

        // Resolve cursor details for real-time polling
        const lastId = movements.length > 0 ? movements[movements.length - 1].movement_id : (sinceId ? Number(sinceId) : 0);

        return NextResponse.json({
            success: true,
            cursor: {
                lastId,
                count: movements.length
            },
            data: movements
        }, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate"
            }
        });
    } catch (e) {
        console.error("[Inventory Movements BFF GET] Error:", e);
        return NextResponse.json(
            { success: false, error: (e as Error).message || "Failed to retrieve inventory movements" },
            { status: 500 }
        );
    }
}

/**
 * POST /api/manufacturing/inventory/movements
 * Inserts list of inventory movements into Directus. Enforces schema validations.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        
        // Validate request schema
        const parseResult = postPayloadSchema.safeParse(body);
        if (!parseResult.success) {
            return NextResponse.json(
                { success: false, error: "Validation failed", details: parseResult.error.flatten().fieldErrors },
                { status: 400 }
            );
        }

        const { movements } = parseResult.data;
        const userId = await getUserIdFromSession();

        // Standardize parameters and inject auditor logs
        const payload = movements.map((m) => ({
            product_id: m.product_id,
            version_id: m.version_id !== undefined ? m.version_id : null,
            lot_id: m.lot_id,
            branch_id: m.branch_id,
            transaction_type_id: m.transaction_type_id,
            source_document_id: m.source_document_id,
            source_document_no: m.source_document_no || null,
            batch_no: m.batch_no,
            expiry_date: m.expiry_date || null,
            manufacturing_date: m.manufacturing_date || null,
            quantity: m.quantity,
            created_by: userId || 1, // Default fallback to Admin (1) if no active user session
            remarks: m.remarks || null
        }));

        // Post bulk/individual array to Directus collection
        const res = await fetch(`${DIRECTUS_URL}/items/inventory_movements`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to save ledger movements: ${res.status} - ${errText}`);
        }

        const json = await res.json();
        const savedData = json.data;

        return NextResponse.json({
            success: true,
            message: `Successfully posted ${Array.isArray(savedData) ? savedData.length : 1} inventory movement(s)`,
            data: savedData
        }, { status: 201 });

    } catch (e) {
        console.error("[Inventory Movements BFF POST] Error:", e);
        return NextResponse.json(
            { success: false, error: (e as Error).message || "Failed to post inventory movements" },
            { status: 500 }
        );
    }
}
