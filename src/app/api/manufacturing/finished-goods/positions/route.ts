import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";

// Production Department Hardcoded ID (department_id = 4 in database)
export const PRODUCTION_DEPARTMENT_ID = 4;

export interface PositionRecord {
    id?: number;
    department: number;
    position_name: string;
    daily_rate: number;
    hourly_rate: number;
    is_active?: boolean;
    created_by?: number | null;
    created_at?: string;
    activated_at?: string | null;
}

const DEFAULT_PRODUCTION_POSITIONS: PositionRecord[] = [
    { id: 1, department: PRODUCTION_DEPARTMENT_ID, position_name: "SUPERVISOR", daily_rate: 539.29, hourly_rate: 67.41, is_active: true },
    { id: 2, department: PRODUCTION_DEPARTMENT_ID, position_name: "TEAM LEADERS", daily_rate: 518.85, hourly_rate: 64.86, is_active: true },
    { id: 3, department: PRODUCTION_DEPARTMENT_ID, position_name: "BAKER", daily_rate: 505.00, hourly_rate: 63.13, is_active: true },
    { id: 4, department: PRODUCTION_DEPARTMENT_ID, position_name: "BLANCHER", daily_rate: 505.00, hourly_rate: 63.13, is_active: true },
    { id: 5, department: PRODUCTION_DEPARTMENT_ID, position_name: "FIXER", daily_rate: 505.00, hourly_rate: 63.13, is_active: true },
    { id: 6, department: PRODUCTION_DEPARTMENT_ID, position_name: "WEIGHER", daily_rate: 505.00, hourly_rate: 63.13, is_active: true },
    { id: 7, department: PRODUCTION_DEPARTMENT_ID, position_name: "FRYER", daily_rate: 505.00, hourly_rate: 63.13, is_active: true },
    { id: 8, department: PRODUCTION_DEPARTMENT_ID, position_name: "PACKAGER", daily_rate: 505.00, hourly_rate: 63.13, is_active: true },
    { id: 9, department: PRODUCTION_DEPARTMENT_ID, position_name: "ENGINEERING", daily_rate: 505.00, hourly_rate: 63.13, is_active: true }
];

export async function GET() {
    try {
        const filter = encodeURIComponent(JSON.stringify({
            _or: [
                { department: { _eq: PRODUCTION_DEPARTMENT_ID } },
                { department: { _eq: String(PRODUCTION_DEPARTMENT_ID) } }
            ]
        }));
        const url = `${DIRECTUS_URL}/items/positions?filter=${filter}&limit=-1`;
        const res = await fetch(url, { headers, cache: "no-store" }).catch(() => null);

        let positions: PositionRecord[] = [];

        if (res && res.ok) {
            const data = await res.json();
            const items = data.data || [];
            positions = items.map((item: Record<string, unknown>) => {
                const daily = Number(item.daily_rate || 1200);
                return {
                    id: Number(item.id),
                    department: Number(item.department || PRODUCTION_DEPARTMENT_ID),
                    position_name: String(item.position_name || "Operator"),
                    daily_rate: daily,
                    hourly_rate: Math.round((daily / 8) * 100) / 100,
                    is_active: item.is_active !== false,
                    created_by: item.created_by ? Number(item.created_by) : null,
                    created_at: item.created_at,
                    activated_at: item.activated_at
                };
            });
        }

        // Fallback or merge defaults if catalog is empty
        if (positions.length === 0) {
            positions = DEFAULT_PRODUCTION_POSITIONS;
        } else {
            // Guarantee unique positions
            const nameMap = new Map<string, PositionRecord>();
            positions.forEach(p => nameMap.set(p.position_name.toLowerCase(), p));
            DEFAULT_PRODUCTION_POSITIONS.forEach(defP => {
                if (!nameMap.has(defP.position_name.toLowerCase())) {
                    nameMap.set(defP.position_name.toLowerCase(), defP);
                }
            });
            positions = Array.from(nameMap.values());
        }

        return NextResponse.json(positions);
    } catch (e) {
        console.error("API Error fetching department positions:", e);
        return NextResponse.json(DEFAULT_PRODUCTION_POSITIONS);
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { position_name, department, daily_rate } = body;

        if (!position_name || !position_name.trim()) {
            return NextResponse.json({ error: "Position name is required." }, { status: 400 });
        }

        let userId: number | null = null;
        try {
            const cookieStore = await cookies();
            const token = cookieStore.get("vos_access_token")?.value;
            if (token) {
                const parts = token.split(".");
                if (parts.length >= 2) {
                    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
                    while (base64.length % 4) base64 += "=";
                    const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
                    userId = payload?.id || payload?.user_id || payload?.sub || null;
                }
            }
        } catch {}

        const dailyRateVal = Number(daily_rate || 1200);
        const now = new Date().toISOString();

        const payload = {
            department: department ? Number(department) : PRODUCTION_DEPARTMENT_ID,
            position_name: position_name.trim(),
            daily_rate: dailyRateVal,
            created_by: userId ? Number(userId) : null,
            created_at: now,
            is_active: true,
            activated_at: now
        };

        const res = await fetch(`${DIRECTUS_URL}/items/positions`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errTxt = await res.text();
            throw new Error(`Directus error: ${res.status} - ${errTxt}`);
        }

        const data = await res.json();
        const created = data.data;

        return NextResponse.json({
            success: true,
            position: {
                id: Number(created.id),
                department: Number(created.department),
                position_name: created.position_name,
                daily_rate: Number(created.daily_rate),
                hourly_rate: Math.round((Number(created.daily_rate) / 8) * 100) / 100,
                is_active: true,
                created_at: created.created_at,
                activated_at: created.activated_at
            }
        });
    } catch (e) {
        console.error("API Error creating department position:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to create position" }, { status: 500 });
    }
}
