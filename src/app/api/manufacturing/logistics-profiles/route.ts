import { NextRequest, NextResponse } from "next/server";

import { Vehicle, Route } from "@/modules/manufacturing-management/logistics-profiles/types";

interface DirectusVehicle {
    vehicle_id: number;
    name?: string;
    vehicle_type: number;
    vehicle_plate?: string;
    maximum_weight?: number;
    capacity_cbm?: number;
    driver_fee?: number;
    helper_fee?: number;
    fuel_consumption_kml?: number;
    status?: string;
    fuel_type?: string;
}

const DEFAULT_VEHICLES = [
    {
        name: "10-Wheeler Wing Van (Fuso)",
        type: "Heavy Duty",
        plate: "NDG-8902",
        capacity_kg: 15000,
        capacity_cbm: 32,
        driver_fee: 2500,
        helper_fee: 1200,
        fuel_consumption_kml: 3
    },
    {
        name: "6-Wheeler Closed Van (Elf)",
        type: "Medium Duty",
        plate: "WQL-1845",
        capacity_kg: 4000,
        capacity_cbm: 14,
        driver_fee: 1500,
        helper_fee: 800,
        fuel_consumption_kml: 5.5
    },
    {
        name: "4-Wheeler Closed Van (L300)",
        type: "Light Duty",
        plate: "CDX-4791",
        capacity_kg: 1500,
        capacity_cbm: 6,
        driver_fee: 1000,
        helper_fee: 600,
        fuel_consumption_kml: 8.5
    },
    {
        name: "WING VAN",
        type: "Heavy Duty",
        plate: "NDG-2134",
        capacity_kg: 4000,
        capacity_cbm: 14,
        driver_fee: 1500,
        helper_fee: 800,
        fuel_consumption_kml: 5.5
    }
];

const DEFAULT_ROUTES = [
    {
        name: "Metro Manila to San Fernando, Pampanga",
        distance_km: 75,
        tolls_php: 350,
        fuel_price_php: 56.5,
        description: "Via NLEX. Standard Northern Luzon distribution run."
    },
    {
        name: "Metro Manila to Lipa City, Batangas",
        distance_km: 85,
        tolls_php: 480,
        fuel_price_php: 58,
        description: "Via SLEX and STAR Tollway. Southern Luzon oil freight."
    },
    {
        name: "Metro Manila to Calamba, Laguna",
        distance_km: 55,
        tolls_php: 290,
        fuel_price_php: 57.2,
        description: "Via SLEX. Short hauling to regional Calabarzon warehouse."
    },
    {
        name: "Metro Manila to Baguio City",
        distance_km: 250,
        tolls_php: 1150,
        fuel_price_php: 61.2,
        description: "Via NLEX, SCTEX, TPLEX, and Kennon Road. Mountain hauling."
    }
];

// Map frontend vehicle type string to existing vehicle_type table IDs
function mapVehicleTypeId(typeStr: string): number {
    const s = (typeStr || "").toLowerCase();
    if (s.includes("10") || s.includes("heavy") || s.includes("fuso")) return 4; // 10 Wheeler Truck
    if (s.includes("6") || s.includes("medium") || s.includes("elf")) return 3;  // 6 Wheeler Truck
    if (s.includes("4") || s.includes("light") || s.includes("l300")) return 2;   // 4 Wheeler Truck
    return 2; // fallback to 4 Wheeler Truck
}

// Map vehicle_type table IDs back to frontend display string
function mapVehicleTypeString(typeId: number): string {
    if (typeId === 4) return "Heavy Duty";
    if (typeId === 3) return "Medium Duty";
    if (typeId === 2) return "Light Duty";
    if (typeId === 1) return "Tractor Head";
    if (typeId === 5) return "Forward";
    if (typeId === 6) return "Utility";
    if (typeId === 7) return "Trailer";
    return "Light Duty";
}

export async function GET() {
    try {
        const directusUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
        const staticToken = process.env.DIRECTUS_STATIC_TOKEN || "test";
        const headers = {
            "Authorization": `Bearer ${staticToken}`,
            "Content-Type": "application/json"
        };

        const [vehiclesRes, routesRes] = await Promise.all([
            fetch(`${directusUrl}/items/vehicles?limit=-1`, { headers, cache: "no-store" }),
            fetch(`${directusUrl}/items/logistics_routes?limit=-1`, { headers, cache: "no-store" })
        ]);

        if (!vehiclesRes.ok || !routesRes.ok) {
            throw new Error(`Directus failed: vehicles status ${vehiclesRes.status}, routes status ${routesRes.status}`);
        }

        const vehiclesData = await vehiclesRes.json();
        const routesData = await routesRes.json();

        let vehiclesList = (vehiclesData.data || []).map((v: DirectusVehicle) => ({
            id: v.vehicle_id,
            name: v.name || "Unnamed Vehicle",
            type: mapVehicleTypeString(v.vehicle_type),
            plate: v.vehicle_plate || "",
            capacity_kg: Number(v.maximum_weight) || 0,
            capacity_cbm: Number(v.capacity_cbm) || 0,
            driver_fee: Number(v.driver_fee) || 0,
            helper_fee: Number(v.helper_fee) || 0,
            fuel_consumption_kml: Number(v.fuel_consumption_kml) || 0,
            status: v.status || "active",
            fuel_type: v.fuel_type || "Diesel"
        }));

        let routesList = routesData.data || [];

        // Auto-seed if both are empty in Directus
        if (vehiclesList.length === 0 && routesList.length === 0) {
            try {
                console.log("[Logistics API Seeder] Directus tables are empty. Seeding defaults...");
                // Seed vehicles
                for (const v of DEFAULT_VEHICLES) {
                    const payload = {
                        name: v.name,
                        vehicle_type: mapVehicleTypeId(v.type),
                        vehicle_plate: v.plate,
                        maximum_weight: v.capacity_kg,
                        capacity_cbm: v.capacity_cbm,
                        driver_fee: v.driver_fee,
                        helper_fee: v.helper_fee,
                        fuel_consumption_kml: v.fuel_consumption_kml,
                        status: "active",
                        fuel_type: "Diesel"
                    };
                    await fetch(`${directusUrl}/items/vehicles`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(payload)
                    });
                }
                // Seed routes
                for (const r of DEFAULT_ROUTES) {
                    const rPayload = {
                        name: r.name,
                        distance_km: r.distance_km,
                        tolls_php: r.tolls_php,
                        fuel_price_php: r.fuel_price_php,
                        description: r.description
                    };
                    await fetch(`${directusUrl}/items/logistics_routes`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(rPayload)
                    });
                }
                // Re-fetch
                const [vRes, rRes] = await Promise.all([
                    fetch(`${directusUrl}/items/vehicles?limit=-1`, { headers, cache: "no-store" }),
                    fetch(`${directusUrl}/items/logistics_routes?limit=-1`, { headers, cache: "no-store" })
                ]);
                const vD = await vRes.json();
                const rD = await rRes.json();
                vehiclesList = (vD.data || []).map((v: DirectusVehicle) => ({
                    id: v.vehicle_id,
                    name: v.name || "Unnamed Vehicle",
                    type: mapVehicleTypeString(v.vehicle_type),
                    plate: v.vehicle_plate || "",
                    capacity_kg: Number(v.maximum_weight) || 0,
                    capacity_cbm: Number(v.capacity_cbm) || 0,
                    driver_fee: Number(v.driver_fee) || 0,
                    helper_fee: Number(v.helper_fee) || 0,
                    fuel_consumption_kml: Number(v.fuel_consumption_kml) || 0,
                    status: v.status || "active",
                    fuel_type: v.fuel_type || "Diesel"
                }));
                routesList = rD.data || [];
            } catch (seedErr) {
                console.error("[Logistics API Seeder] Seeding failed:", seedErr);
            }
        }

        return NextResponse.json({
            vehicles: vehiclesList,
            routes: routesList
        });
    } catch (e) {
        console.error("Directus error in logistics profiles GET:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to fetch logistics profiles" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { type, data } = body as { type: "vehicle" | "route"; data: Partial<Vehicle> & Partial<Route> };

        if (!type || !data) {
            return NextResponse.json({ error: "Missing type or data parameters" }, { status: 400 });
        }

        const directusUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
        const staticToken = process.env.DIRECTUS_STATIC_TOKEN || "test";
        const headers = {
            "Authorization": `Bearer ${staticToken}`,
            "Content-Type": "application/json"
        };

        let res;

        if (type === "vehicle") {
            const payload = {
                name: data.name,
                vehicle_type: mapVehicleTypeId(data.type || ""),
                vehicle_plate: data.plate,
                maximum_weight: data.capacity_kg,
                capacity_cbm: data.capacity_cbm,
                driver_fee: data.driver_fee,
                helper_fee: data.helper_fee,
                fuel_consumption_kml: data.fuel_consumption_kml,
                status: data.status || "active",
                fuel_type: data.fuel_type || "Diesel"
            };

            if (data.id) {
                // Update (PATCH)
                res = await fetch(`${directusUrl}/items/vehicles/${data.id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify(payload)
                });
            } else {
                // Create (POST)
                res = await fetch(`${directusUrl}/items/vehicles`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payload)
                });
            }
        } else if (type === "route") {
            if (data.id) {
                // Update (PATCH)
                res = await fetch(`${directusUrl}/items/logistics_routes/${data.id}`, {
                    method: "PATCH",
                    headers,
                    body: JSON.stringify(data)
                });
            } else {
                // Create (POST)
                res = await fetch(`${directusUrl}/items/logistics_routes`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(data)
                });
            }
        } else {
            return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 });
        }

        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            return NextResponse.json({ error: errBody.error?.message || `Directus returned ${res.status}` }, { status: res.status });
        }

        // Fetch fresh db state
        const [vehiclesRes, routesRes] = await Promise.all([
            fetch(`${directusUrl}/items/vehicles?limit=-1`, { headers, cache: "no-store" }),
            fetch(`${directusUrl}/items/logistics_routes?limit=-1`, { headers, cache: "no-store" })
        ]);

        const vehiclesData = await vehiclesRes.json();
        const routesData = await routesRes.json();

        const db = {
            vehicles: (vehiclesData.data || []).map((v: DirectusVehicle) => ({
                id: v.vehicle_id,
                name: v.name || "Unnamed Vehicle",
                type: mapVehicleTypeString(v.vehicle_type),
                plate: v.vehicle_plate || "",
                capacity_kg: Number(v.maximum_weight) || 0,
                capacity_cbm: Number(v.capacity_cbm) || 0,
                driver_fee: Number(v.driver_fee) || 0,
                helper_fee: Number(v.helper_fee) || 0,
                fuel_consumption_kml: Number(v.fuel_consumption_kml) || 0,
                status: v.status || "active",
                fuel_type: v.fuel_type || "Diesel"
            })),
            routes: routesData.data || []
        };

        return NextResponse.json({ success: true, db });
    } catch (e) {
        console.error("API error in logistics POST:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to save logistics profile" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const type = searchParams.get("type"); // 'vehicle' or 'route'
        const idStr = searchParams.get("id");

        if (!type || !idStr) {
            return NextResponse.json({ error: "Missing required 'type' or 'id' parameters" }, { status: 400 });
        }

        const id = parseInt(idStr);
        const directusUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";
        const staticToken = process.env.DIRECTUS_STATIC_TOKEN || "test";
        const headers = {
            "Authorization": `Bearer ${staticToken}`
        };

        const collection = type === "vehicle" ? "vehicles" : "logistics_routes";
        const res = await fetch(`${directusUrl}/items/${collection}/${id}`, {
            method: "DELETE",
            headers
        });

        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            return NextResponse.json({ error: errBody.error?.message || `Directus returned ${res.status}` }, { status: res.status });
        }

        // Fetch fresh db state
        const [vehiclesRes, routesRes] = await Promise.all([
            fetch(`${directusUrl}/items/vehicles?limit=-1`, { headers, cache: "no-store" }),
            fetch(`${directusUrl}/items/logistics_routes?limit=-1`, { headers, cache: "no-store" })
        ]);

        const vehiclesData = await vehiclesRes.json();
        const routesData = await routesRes.json();

        const db = {
            vehicles: (vehiclesData.data || []).map((v: DirectusVehicle) => ({
                id: v.vehicle_id,
                name: v.name || "Unnamed Vehicle",
                type: mapVehicleTypeString(v.vehicle_type),
                plate: v.vehicle_plate || "",
                capacity_kg: Number(v.maximum_weight) || 0,
                capacity_cbm: Number(v.capacity_cbm) || 0,
                driver_fee: Number(v.driver_fee) || 0,
                helper_fee: Number(v.helper_fee) || 0,
                fuel_consumption_kml: Number(v.fuel_consumption_kml) || 0,
                status: v.status || "active",
                fuel_type: v.fuel_type || "Diesel"
            })),
            routes: routesData.data || []
        };

        return NextResponse.json({ success: true, db });
    } catch (e) {
        console.error("API error in logistics DELETE:", e);
        return NextResponse.json({ error: (e as Error).message || "Failed to delete logistics profile" }, { status: 500 });
    }
}
