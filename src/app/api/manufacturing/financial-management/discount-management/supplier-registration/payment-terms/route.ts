import { NextResponse } from "next/server";
import { fetchPaymentTerms } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/services/terms";

export async function GET() {
  try {
    const terms = await fetchPaymentTerms();
    return NextResponse.json({ data: terms });
  } catch (error) {
    console.error("Payment terms error:", error);
    return NextResponse.json(
      { error: "Failed to fetch payment terms" },
      { status: 500 }
    );
  }
}

