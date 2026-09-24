import { NextResponse } from "next/server";
import { fetchAllUnits } from "./units-helper";

export async function GET() {
    try {
        const units = await fetchAllUnits();
        return NextResponse.json(units);
    } catch (e) {
        console.error("API Error fetching units:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch units" }, { status: 500 });
    }
}
