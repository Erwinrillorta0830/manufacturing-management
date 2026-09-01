import { NextResponse } from "next/server";
import { DIRECTUS_URL, headers, getISOStringInConfiguredTimezone } from "@/app/api/manufacturing/directus-api";
import { getUserIdFromToken } from "@/app/api/manufacturing/item-management/auth-helper";

type DirectusProject = Record<string, unknown> & {
    id: number | string;
    customer_code?: string | null;
};

type DirectusCustomer = {
    id: number | string;
    customer_code?: string | null;
    customer_name?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function attachCustomerDetails(projects: DirectusProject[]): Promise<DirectusProject[]> {
    const customerCodes = Array.from(new Set(
        projects
            .map(project => typeof project.customer_code === "string" ? project.customer_code.trim() : "")
            .filter(Boolean)
    ));

    if (customerCodes.length === 0) return projects;

    const customerParams = new URLSearchParams({
        "filter[customer_code][_in]": customerCodes.join(","),
        fields: "id,customer_code,customer_name",
        limit: String(customerCodes.length)
    });

    try {
        const customerRes = await fetch(`${DIRECTUS_URL}/items/customer?${customerParams.toString()}`, {
            headers,
            cache: "no-store"
        });
        if (!customerRes.ok) return projects;

        const body: unknown = await customerRes.json().catch(() => ({}));
        const rows = isRecord(body) && Array.isArray(body.data) ? body.data : [];
        const customers = rows.filter(isRecord).filter((customer): customer is DirectusCustomer => (
            (typeof customer.id === "number" || typeof customer.id === "string")
            && (typeof customer.customer_code === "string" || customer.customer_code === null || customer.customer_code === undefined)
        ));
        const customersByCode = new Map(
            customers.map(customer => [String(customer.customer_code || "").trim(), customer])
        );

        return projects.map(project => {
            const customer = customersByCode.get(String(project.customer_code || "").trim());
            return {
                ...project,
                customer_id: customer?.id ?? null,
                customer_name: customer?.customer_name ?? null
            };
        });
    } catch (error) {
        console.error("API Error enriching projects with customers:", error);
        return projects;
    }
}

export async function GET() {
    try {
        const url = `${DIRECTUS_URL}/items/projects?limit=-1&sort=-created_at`;
        const res = await fetch(url, { headers, cache: "no-store" });
        if (!res.ok) return NextResponse.json([]);
        const body: unknown = await res.json();
        const projects = isRecord(body) && Array.isArray(body.data)
            ? body.data.filter(isRecord).filter((project): project is DirectusProject => (
                typeof project.id === "number" || typeof project.id === "string"
            ))
            : [];
        return NextResponse.json(await attachCustomerDetails(projects));
    } catch (e) {
        console.error("API Error fetching projects:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch projects" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { project_name, customer_code } = body;
        
        if (!project_name || !customer_code) {
            return NextResponse.json({ error: "Missing project_name or customer_code" }, { status: 400 });
        }

        const userId = await getUserIdFromToken().catch(() => null);
        const serverTime = await getISOStringInConfiguredTimezone();

        const payload = {
            project_name: project_name.trim().toUpperCase(),
            customer_code: customer_code.trim(),
            created_by: userId,
            created_at: serverTime.substring(0, 19).replace('T', ' ')
        };

        const res = await fetch(`${DIRECTUS_URL}/items/projects`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errText = await res.text();
            throw new Error(`Failed to create project: ${res.status} - ${errText}`);
        }

        const data = await res.json();
        return NextResponse.json(data.data);
    } catch (e) {
        console.error("API Error creating project:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to create project" }, { status: 500 });
    }
}
