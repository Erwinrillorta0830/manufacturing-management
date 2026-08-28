import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { generateMmPiNo, extractId, parseBooleanFlag } from "./helper";
import { getJwtSubFromReq } from "@/lib/directus";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/manufacturing/physical-inventory-manufacturing
 * List physical inventory headers from mm_physical_inventory
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const piNo = searchParams.get("pi_no") || searchParams.get("search");
        const branchId = searchParams.get("branch_id");
        const stockType = searchParams.get("stock_type");
        const status = searchParams.get("status");
        const limitParam = searchParams.get("limit") || "100";
        const sortParam = searchParams.get("sort") || "-physical_inventory_id";

        const filterParts: string[] = [];

        if (piNo) {
            filterParts.push(`filter[pi_no][_contains]=${encodeURIComponent(piNo.trim())}`);
        }

        if (branchId) {
            filterParts.push(`filter[branch_id][_eq]=${encodeURIComponent(branchId)}`);
        }

        if (stockType) {
            filterParts.push(`filter[stock_type][_eq]=${encodeURIComponent(stockType.trim().toUpperCase())}`);
        }

        if (status) {
            const statusArr = status.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
            if (statusArr.length === 1) {
                filterParts.push(`filter[status][_eq]=${statusArr[0]}`);
            } else if (statusArr.length > 1) {
                filterParts.push(`filter[status][_in]=${statusArr.join(",")}`);
            }
        }

        const limit = Math.min(Math.max(Number(limitParam) || 100, 1), 500);
        const filterQuery = filterParts.length > 0 ? `&${filterParts.join("&")}` : "";
        const url = `${DIRECTUS_URL}/items/mm_physical_inventory?sort=${encodeURIComponent(sortParam)}&limit=${limit}&fields=*,branch_id.*,product_type_id.*,price_type_id.*,encoder_id.*,committed_by.*,cancelled_by.*${filterQuery}`;

        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus returned HTTP ${res.status}: ${errText}`);
        }

        const json = await res.json();
        return NextResponse.json({ success: true, data: json.data || [] });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        console.error("GET /api/manufacturing/physical-inventory-manufacturing error:", error);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}

/**
 * POST /api/manufacturing/physical-inventory-manufacturing
 * Create a new Manufacturing Physical Inventory Header
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { branch_id, stock_type, product_type_id, starting_date, cutoff_date, remarks } = body;

        const branchId = extractId(branch_id);
        if (!branchId || branchId <= 0) {
            return NextResponse.json({ success: false, error: "Active Branch selection is required." }, { status: 400 });
        }

        // Validate branch is active
        const branchCheckUrl = `${DIRECTUS_URL}/items/branches/${branchId}`;
        const branchRes = await fetch(branchCheckUrl, { headers, cache: "no-store" });
        if (!branchRes.ok) {
            return NextResponse.json({ success: false, error: "Selected branch does not exist." }, { status: 404 });
        }
        const branchData = (await branchRes.json()).data;
        if (branchData.isActive === false || branchData.isActive === 0) {
            return NextResponse.json({ success: false, error: "Only active branches can be selected." }, { status: 400 });
        }

        const validStockType = stock_type === "REGULAR" ? "REGULAR" : "OPENING";
        if (validStockType === "OPENING") {
            const checkOpeningUrl = `${DIRECTUS_URL}/items/mm_physical_inventory?filter[branch_id][_eq]=${branchId}&filter[stock_type][_eq]=OPENING&limit=10`;
            const checkOpeningRes = await fetch(checkOpeningUrl, { headers, cache: "no-store" });
            if (checkOpeningRes.ok) {
                const checkJson = await checkOpeningRes.json();
                const existingList: Array<Record<string, unknown>> = checkJson.data || [];
                const committedOpening = existingList.filter((s) => {
                    const isCancelled = parseBooleanFlag(s.isCancelled) || s.status === "CANCELLED";
                    const isCommitted = parseBooleanFlag(s.isCommitted) || s.status === "COMMITTED" || s.status === "POSTED";
                    return !isCancelled && isCommitted;
                });
                if (committedOpening.length > 0) {
                    return NextResponse.json({
                        success: false,
                        error: "A Committed Opening Inventory sheet has already been established for this branch. Subsequent physical counts must be set to Regular Physical Inventory."
                    }, { status: 400 });
                }
            }
        }

        const productTypeId = product_type_id ? extractId(product_type_id) : null;
        const priceTypeId = body.price_type_id ? extractId(body.price_type_id) : null;
        const piNo = await generateMmPiNo();

        // Get encoder ID from auth token or body
        const authUserId = getJwtSubFromReq(request);
        const encoderId = authUserId || extractId(body.encoder_id) || null;

        const payload: Record<string, unknown> = {
            pi_no: piNo,
            starting_date: starting_date || new Date().toISOString().split("T")[0],
            cutoff_date: cutoff_date || new Date().toISOString().split("T")[0],
            stock_type: validStockType,
            branch_id: branchId,
            product_type_id: productTypeId || null,
            price_type_id: priceTypeId || null,
            remarks: remarks ? String(remarks).trim() : null,
            status: "DRAFT",
            encoder_id: encoderId,
            total_system_quantity: 0,
            total_physical_quantity: 0,
            total_variance: 0,
            total_difference_cost: 0,
            isCommitted: 0,
            isCancelled: 0,
        };

        const createUrl = `${DIRECTUS_URL}/items/mm_physical_inventory`;
        const res = await fetch(createUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Directus failed to create PI header: ${errText}`);
        }

        const createdData = (await res.json()).data;
        return NextResponse.json({ success: true, data: createdData }, { status: 201 });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Internal Server Error";
        console.error("POST /api/manufacturing/physical-inventory-manufacturing error:", error);
        return NextResponse.json({ success: false, error: msg }, { status: 500 });
    }
}
