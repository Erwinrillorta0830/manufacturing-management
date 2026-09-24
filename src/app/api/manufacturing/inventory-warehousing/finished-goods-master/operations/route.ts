import { NextResponse } from "next/server";
import { 
    fetchAllOperations,
    createOperation
} from "./operations-helper";

export async function GET() {
    try {
        const ops = await fetchAllOperations();
        return NextResponse.json(ops);
    } catch (e) {
        console.error("API Error fetching manufacturing operations:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch manufacturing operations" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const { name } = await request.json();
        if (!name) {
            return NextResponse.json({ error: "Missing name" }, { status: 400 });
        }
        const newOp = await createOperation(name);
        if (!newOp) throw new Error("Failed to create manufacturing operation in Directus");
        return NextResponse.json({ success: true, operation: newOp });
    } catch (e) {
        console.error("API Error creating manufacturing operation:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to create manufacturing operation" }, { status: 500 });
    }
}
