import { NextResponse } from "next/server";
import { fetchDeliveryTerms } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/services/terms";

export async function GET() {
  try {
    const terms = await fetchDeliveryTerms();
    return NextResponse.json({ data: terms });
  } catch (error) {
    console.error("Delivery terms error:", error);
    return NextResponse.json(
      { error: "Failed to fetch delivery terms" },
      { status: 500 }
    );
  }
}

