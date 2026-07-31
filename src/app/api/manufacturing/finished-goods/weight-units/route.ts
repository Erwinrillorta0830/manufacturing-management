import { NextResponse } from "next/server";
import { fetchAllWeightUnits } from "./weight-units-helper";

export async function GET() {
    try {
        const units = await fetchAllWeightUnits();
        return NextResponse.json(units);
    } catch (e) {
        console.error("API Error fetching weight units:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch weight units" }, { status: 500 });
    }
}
