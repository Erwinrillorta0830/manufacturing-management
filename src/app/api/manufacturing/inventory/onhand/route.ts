import { NextResponse } from "next/server";
import { cookies } from "next/headers";

const SPRING_API_BASE_URL = process.env.SPRING_API_BASE_URL;

export async function GET(request: Request) {
    try {
        if (!SPRING_API_BASE_URL) {
            throw new Error("SPRING_API_BASE_URL is not configured.");
        }

        const { searchParams } = new URL(request.url);
        const productIdsParam = searchParams.get("productIds");
        const branchId = searchParams.get("branchId");

        const cookieStore = await cookies();
        const token = cookieStore.get("springboot_token")?.value || cookieStore.get("vos_access_token")?.value;
        const requestHeaders: Record<string, string> = {
            "Accept": "application/json"
        };
        
        if (token) {
            requestHeaders["Authorization"] = `Bearer ${token}`;
            requestHeaders["Cookie"] = `vos_access_token=${token}`;
        }
        
        const params = new URLSearchParams();

        if (productIdsParam) {
            // Depending on Spring Boot controller implementation, it might expect a comma separated list
            // or multiple instances of the parameter. We will pass a comma separated list.
            params.set("productId", productIdsParam);
        }
        
        if (branchId) {
            params.set("branchId", branchId);
        }

        const url = `${SPRING_API_BASE_URL.replace(/\/$/, "")}/view-mm-product-onhand/all${params.toString() ? '?' + params.toString() : ''}`;

        const response = await fetch(url, {
            headers: requestHeaders,
            cache: "no-store"
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch onhand inventory from Spring Boot: ${response.status}`);
        }

        const data = await response.json();
        const items = Array.isArray(data) ? data : (data.data || data.content || []);

        // Aggregate onhand_quantity by product_id in case there are multiple rows (e.g. different branches if branchId is not specified)
        const stockData: Record<number, number> = {};
        for (const row of items) {
            // Support both camelCase (typical for Spring Boot) and snake_case in case the DDL maps directly
            const pid = Number(row.productId || row.product_id);
            const qty = Number(row.onhandQuantity || row.onhand_quantity) || 0;
            if (!isNaN(pid)) {
                stockData[pid] = (stockData[pid] || 0) + qty;
            }
        }

        return NextResponse.json({ success: true, data: stockData });

    } catch (e) {
        console.error("API Error in onhand inventory GET:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch onhand inventory" }, { status: 500 });
    }
}
