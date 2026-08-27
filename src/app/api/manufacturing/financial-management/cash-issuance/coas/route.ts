import { NextRequest, NextResponse } from "next/server";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const forPayable = searchParams.get("forPayable") === "true";
        
        // Build filter for payable COAs if requested
        let filter = "";
        if (forPayable) {
            filter = "&filter[account_type][_in]=3,4,7,8,9,10";
        }
        
        const url = `${DIRECTUS_URL}/items/chart_of_accounts?limit=-1&sort=gl_code${filter}`;
        const res = await fetch(url, { headers, cache: "no-store" });
        
        if (!res.ok) {
            return NextResponse.json({ error: "Failed to fetch COAs" }, { status: res.status });
        }
        
        const data = (await res.json()).data || [];
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mapped = data.map((item: any) => {
            const isPay = item.isPayment !== undefined ? item.isPayment : item.is_payment;
            let isPaymentBool = false;
            if (isPay === true || isPay === 1 || isPay === "1" || isPay === "true") {
                isPaymentBool = true;
            } else if (isPay && typeof isPay === "object" && Array.isArray(isPay.data)) {
                isPaymentBool = isPay.data[0] === 1;
            }
            
            let accType = item.account_type;
            if (accType && typeof accType === "object" && accType.id !== undefined) {
                accType = accType.id;
            }
            
            return {
                coaId: Number(item.coa_id),
                glCode: item.gl_code || "",
                accountTitle: item.account_title || "",
                accountType: accType ? Number(accType) : null,
                isPayment: isPaymentBool
            };
        });
        
        return NextResponse.json(mapped);
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
