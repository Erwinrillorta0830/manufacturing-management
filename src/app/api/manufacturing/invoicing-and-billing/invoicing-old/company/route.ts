import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getUserIdFromToken } from "@/app/api/manufacturing/invoice-consolidation/_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    try {
        if (!(await getUserIdFromToken())) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
        const { searchParams } = new URL(request.url);
        const companyId = Number(searchParams.get("companyId") || 2);

        const response = await fetch(`${DIRECTUS_URL}/items/company?filter[company_id][_eq]=${companyId}&fields=company_id,company_name,company_tin,company_address,company_brgy,company_city,company_province,company_zipCode&limit=1`, {
            headers,
            cache: "no-store",
        });

        if (!response.ok) {
            return NextResponse.json({ error: "Failed to fetch company info." }, { status: response.status });
        }

        const data = await response.json();
        const company = data?.data?.[0];

        const companyAddress = [
            company?.company_address,
            company?.company_brgy,
            company?.company_city,
            company?.company_province,
            company?.company_zipCode
        ].filter(Boolean).join(", ");

        return NextResponse.json({
            companyInfo: {
                companyId: Number(company?.company_id || companyId),
                companyName: String(company?.company_name || ""),
                companyTin: String(company?.company_tin || ""),
                companyAddress: companyAddress || "",
            }
        });
    } catch (error) {
        console.error("Fetch company info error:", error);
        return NextResponse.json({ error: "Failed to fetch company info." }, { status: 500 });
    }
}
