// src/app/api/manufacturing/deliveries/route.ts

import { NextResponse } from "next/server";

interface DispatchItemInvoice {
    invoice_id: number;
    invoice_no?: string;
    net_amount?: number;
    customer_name?: string;
    customer_code?: string;
}

interface DispatchInvoiceItem {
    id: number;
    post_dispatch_plan_id: number;
    invoice_id: number;
    sequence?: number;
    distance?: number;
    status?: string;
    remarks?: string;
    invoice?: DispatchItemInvoice;
}

interface Customer {
    id: number;
    customer_name: string;
    customer_code: string;
}

interface SalesInvoice {
    invoice_id: number;
    invoice_no: string;
    net_amount: number;
    customer_id: number;
}

interface DirectusUser {
    user_id: number;
    user_fname?: string;
    user_lname?: string;
    Firstname?: string;
    first_name?: string;
    LastName?: string;
    last_name?: string;
}

interface Vehicle {
    vehicle_id?: number;
    id?: number;
    name?: string;
    plate?: string;
    type?: string;
}

interface Branch {
    id: number;
    branch_name: string;
}

interface PostDispatchPlanStaff {
    id: number;
    post_dispatch_plan_id: number;
    user_id: number;
    role?: string;
    is_present?: number | boolean;
}

interface PostDispatchPlanStaffMapped {
    id: number;
    user_id: number;
    role?: string;
    is_present: boolean;
    user_name: string;
}

interface PostDispatchPlan {
    id: number;
    doc_no?: string;
    driver_id?: number;
    driver_name?: string;
    encoder_id?: number;
    encoder_name?: string;
    vehicle_id?: number;
    vehicle?: Vehicle | null;
    starting_point?: number;
    starting_point_name?: string;
    staff?: PostDispatchPlanStaffMapped[];
}

const DIRECTUS_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";
const DIRECTUS_STATIC_TOKEN = process.env.DIRECTUS_STATIC_TOKEN || "";

const headers: Record<string, string> = {
    "Content-Type": "application/json"
};
if (DIRECTUS_STATIC_TOKEN) {
    headers["Authorization"] = `Bearer ${DIRECTUS_STATIC_TOKEN}`;
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const planId = searchParams.get("planId");

        // Fetch detailed stops for a specific dispatch plan
        if (planId) {
            const res = await fetch(`${DIRECTUS_URL}/items/post_dispatch_invoices?filter[post_dispatch_plan_id][_eq]=${planId}&limit=-1&sort=sequence`, { headers, cache: "no-store" });
            if (!res.ok) throw new Error(`Failed to fetch dispatch invoices: ${res.status}`);
            const json = await res.json();
            const items: DispatchInvoiceItem[] = json.data || [];

            // Resolve invoice details
            const invoiceIds = [...new Set(items.map((i: DispatchInvoiceItem) => Number(i.invoice_id)).filter(Boolean))];
            if (invoiceIds.length > 0) {
                try {
                    const invRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice?filter[invoice_id][_in]=${invoiceIds.join(",")}&limit=-1`, { headers });
                    if (invRes.ok) {
                        const invData: SalesInvoice[] = (await invRes.json()).data || [];
                        const invMap = new Map<number, SalesInvoice>(invData.map((inv: SalesInvoice) => [Number(inv.invoice_id), inv]));
                        
                        // Resolve client details for the invoices
                        const customersRes = await fetch(`${DIRECTUS_URL}/items/customer?limit=-1&fields=id,customer_name,customer_code`, { headers });
                        const customersData: Customer[] = customersRes.ok ? (await customersRes.json()).data || [] : [];
                        const customerMap = new Map<number, Customer>(customersData.map((c: Customer) => [Number(c.id), c]));

                        for (const item of items) {
                            const matchedInvoice = invMap.get(Number(item.invoice_id));
                            if (matchedInvoice) {
                                // Match customer
                                const customer = customerMap.get(Number(matchedInvoice.customer_id));
                                item.invoice = {
                                    invoice_id: matchedInvoice.invoice_id,
                                    invoice_no: matchedInvoice.invoice_no,
                                    net_amount: matchedInvoice.net_amount,
                                    customer_name: customer ? customer.customer_name : `Customer #${matchedInvoice.customer_id}`,
                                    customer_code: customer ? customer.customer_code : "GEN"
                                };
                            }
                        }
                    }
                } catch (err) {
                    console.error("Error expanding invoice metadata in dispatch plan details:", err);
                }
            }

            return NextResponse.json(items);
        }

        // Fetch list of all dispatch plans
        const res = await fetch(`${DIRECTUS_URL}/items/post_dispatch_plan?limit=250&sort=-date_encoded`, { headers, cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to fetch dispatch plans: ${res.status}`);
        const json = await res.json();
        const plans: PostDispatchPlan[] = json.data || [];

        // Join Drivers, Vehicles, origin branches, and staff crew
        try {
            // Fetch drivers & encoders (from user table)
            const usersRes = await fetch(`${DIRECTUS_URL}/items/user?limit=-1`, { headers });
            const users: DirectusUser[] = usersRes.ok ? (await usersRes.json()).data || [] : [];
            const userMap = new Map<number, DirectusUser>(users.map((u: DirectusUser) => [Number(u.user_id), u]));

            // Fetch vehicles
            const vehiclesRes = await fetch(`${DIRECTUS_URL}/items/vehicles?limit=-1`, { headers });
            const vehicles: Vehicle[] = vehiclesRes.ok ? (await vehiclesRes.json()).data || [] : [];
            const vehicleMap = new Map<number, Vehicle>(vehicles.map((v: Vehicle) => [Number(v.vehicle_id || v.id), v]));

            // Fetch origin branches
            const branchesRes = await fetch(`${DIRECTUS_URL}/items/branches?limit=-1`, { headers });
            const branches: Branch[] = branchesRes.ok ? (await branchesRes.json()).data || [] : [];
            const branchMap = new Map<number, Branch>(branches.map((b: Branch) => [Number(b.id), b]));

            // Fetch dispatch plan staff members
            const staffRes = await fetch(`${DIRECTUS_URL}/items/post_dispatch_plan_staff?limit=-1`, { headers });
            const allStaff: PostDispatchPlanStaff[] = staffRes.ok ? (await staffRes.json()).data || [] : [];
            
            const staffMap = new Map<number, PostDispatchPlanStaffMapped[]>();
            for (const st of allStaff) {
                const planId = Number(st.post_dispatch_plan_id);
                const u = userMap.get(Number(st.user_id));
                const uName = u ? `${u.user_fname || u.Firstname || u.first_name || ""} ${u.user_lname || u.LastName || u.last_name || ""}`.trim() : `User #${st.user_id}`;
                
                if (!staffMap.has(planId)) {
                    staffMap.set(planId, []);
                }
                staffMap.get(planId)!.push({
                    id: st.id,
                    user_id: st.user_id,
                    role: st.role,
                    is_present: st.is_present === 1 || st.is_present === true,
                    user_name: uName
                });
            }

            for (const plan of plans) {
                // Map driver
                if (plan.driver_id) {
                    const u = userMap.get(Number(plan.driver_id));
                    plan.driver_name = u ? `${u.user_fname || u.Firstname || u.first_name || ""} ${u.user_lname || u.LastName || u.last_name || ""}`.trim() : `Driver #${plan.driver_id}`;
                }
                
                // Map encoder
                if (plan.encoder_id) {
                    const u = userMap.get(Number(plan.encoder_id));
                    plan.encoder_name = u ? `${u.user_fname || u.Firstname || u.first_name || ""} ${u.user_lname || u.LastName || u.last_name || ""}`.trim() : `Encoder #${plan.encoder_id}`;
                }

                // Map vehicle
                if (plan.vehicle_id) {
                    const v = vehicleMap.get(Number(plan.vehicle_id));
                    plan.vehicle = v ? {
                        id: v.vehicle_id || v.id,
                        name: v.name,
                        plate: v.plate,
                        type: v.type
                    } : null;
                }

                // Map starting point branch
                if (plan.starting_point) {
                    const b = branchMap.get(Number(plan.starting_point));
                    plan.starting_point_name = b ? b.branch_name : `Branch #${plan.starting_point}`;
                }

                // Map crew staff list
                plan.staff = staffMap.get(Number(plan.id)) || [];
            }
        } catch (err) {
            console.error("Error joining metadata in dispatch plans list:", err);
        }

        return NextResponse.json(plans);
    } catch (e) {
        console.error("API Error in deliveries GET:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to fetch dispatch data" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            doc_no,
            driver_id,
            vehicle_id,
            encoder_id,
            starting_point,
            total_distance,
            amount,
            estimated_time_of_dispatch,
            estimated_time_of_arrival,
            remarks,
            invoices, // Array of { invoice_id, distance, sequence }
            staff     // Array of { user_id, role, is_present }
        } = body;

        if (!driver_id || !vehicle_id || !invoices || !Array.isArray(invoices) || invoices.length === 0) {
            return NextResponse.json({ error: "Missing required fields (driver_id, vehicle_id, invoices)" }, { status: 400 });
        }

        // 1. Create Dispatch Plan Header
        const planPayload = {
            doc_no: doc_no || `DP-${Math.floor(1000 + Math.random() * 9000)}`,
            driver_id: Number(driver_id),
            vehicle_id: Number(vehicle_id),
            encoder_id: encoder_id ? Number(encoder_id) : null,
            starting_point: starting_point ? Number(starting_point) : null,
            total_distance: total_distance ? Number(total_distance) : 0,
            status: "For Approval", // starts as For Approval
            amount: amount ? Number(amount) : 0,
            estimated_time_of_dispatch: estimated_time_of_dispatch || null,
            estimated_time_of_arrival: estimated_time_of_arrival || null,
            date_encoded: new Date().toISOString(),
            remarks: remarks || ""
        };

        const createPlanRes = await fetch(`${DIRECTUS_URL}/items/post_dispatch_plan`, {
            method: "POST",
            headers,
            body: JSON.stringify(planPayload)
        });

        if (!createPlanRes.ok) {
            const errText = await createPlanRes.text();
            throw new Error(`Failed to create dispatch plan header: ${createPlanRes.status} - ${errText}`);
        }

        const newPlan = (await createPlanRes.json()).data;
        const newPlanId = newPlan.id;

        // 1.5. Create Dispatch Plan Staff members
        if (staff && Array.isArray(staff) && staff.length > 0) {
            for (const st of staff) {
                const staffPayload = {
                    post_dispatch_plan_id: newPlanId,
                    user_id: Number(st.user_id),
                    role: st.role || "Helper",
                    is_present: st.is_present !== undefined ? (st.is_present ? 1 : 0) : 1
                };

                await fetch(`${DIRECTUS_URL}/items/post_dispatch_plan_staff`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(staffPayload)
                }).catch(err => {
                    console.error("Failed to insert staff member:", err);
                });
            }
        }

        // 2. Create Dispatch Invoices Junction & Auto transition related Sales Orders to "For Shipping"
        for (const inv of invoices) {
            const detailPayload = {
                post_dispatch_plan_id: newPlanId,
                invoice_id: Number(inv.invoice_id),
                distance: inv.distance ? Number(inv.distance) : 0,
                status: "Not Fulfilled",
                sequence: Number(inv.sequence || 1),
                remarks: inv.remarks || ""
            };

            const detailRes = await fetch(`${DIRECTUS_URL}/items/post_dispatch_invoices`, {
                method: "POST",
                headers,
                body: JSON.stringify(detailPayload)
            });

            if (detailRes.ok) {
                try {
                    // Fetch invoice to get its sales_order_id
                    const invRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice/${inv.invoice_id}`, { headers });
                    if (invRes.ok) {
                        const invoiceData = (await invRes.json()).data;
                        const soId = invoiceData.sales_order_id;
                        if (soId) {
                            console.log(`[Deliveries API] Auto-transitioning Sales Order ${soId} to For Shipping`);
                            await fetch(`${DIRECTUS_URL}/items/sales_order/${soId}`, {
                                method: "PATCH",
                                headers,
                                body: JSON.stringify({ order_status: "For Shipping" })
                            });
                        }
                    }
                } catch (err) {
                    console.error("Failed to transition Sales Order status to For Shipping:", err);
                }
            } else {
                console.error(`Failed to insert dispatch invoice stop: ${detailRes.status}`);
            }
        }

        return NextResponse.json({ success: true, plan_id: newPlanId, doc_no: planPayload.doc_no });
    } catch (e) {
        console.error("API Error in deliveries POST:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to create dispatch plan" }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const body = await request.json();
        const {
            planId,
            status,
            time_of_dispatch,
            time_of_arrival,
            remarks,
            stopId,          // To update a specific invoice stop instead of the entire plan
            stopStatus,      // Status for the specific stop
            stopRemarks,     // Remarks for the specific stop
            driverUserId     // Signature recorder ID for the stop (invoiceAt)
        } = body;

        // Route 1: Update a specific invoice stop (Proof of Delivery signature/photo check)
        if (stopId) {
            const stopPayload: Record<string, string | number> = {};
            if (stopStatus) stopPayload.status = stopStatus;
            if (stopRemarks !== undefined) stopPayload.remarks = stopRemarks;
            if (driverUserId) {
                stopPayload.invoiceAt = Number(driverUserId);
                stopPayload.isCleared = 1;
            }

            const res = await fetch(`${DIRECTUS_URL}/items/post_dispatch_invoices/${stopId}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(stopPayload)
            });

            if (!res.ok) throw new Error(`Failed to update dispatch invoice stop: ${res.status}`);

            // Auto transition Sales Order to "Delivered" or "Not Fulfilled"
            if (stopStatus) {
                try {
                    const stopRes = await fetch(`${DIRECTUS_URL}/items/post_dispatch_invoices/${stopId}`, { headers });
                    if (stopRes.ok) {
                        const stopData = (await stopRes.json()).data;
                        const invRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice/${stopData.invoice_id}`, { headers });
                        if (invRes.ok) {
                            const invoiceData = (await invRes.json()).data;
                            const soId = invoiceData.sales_order_id;
                            if (soId) {
                                const targetSoStatus = stopStatus.startsWith("Fulfilled") ? "Delivered" : "Not Fulfilled";
                                console.log(`[Deliveries API] Auto-transitioning Sales Order ${soId} to ${targetSoStatus}`);
                                await fetch(`${DIRECTUS_URL}/items/sales_order/${soId}`, {
                                    method: "PATCH",
                                    headers,
                                    body: JSON.stringify({ order_status: targetSoStatus })
                                });
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed to auto-transition Sales Order status on stop update:", err);
                }
            }

            return NextResponse.json({ success: true });
        }

        // Route 2: Update the Dispatch Plan Header
        if (!planId) {
            return NextResponse.json({ error: "Missing planId or stopId" }, { status: 400 });
        }

        const planPayload: Record<string, string> = {};
        if (status) planPayload.status = status;
        if (time_of_dispatch) planPayload.time_of_dispatch = time_of_dispatch;
        if (time_of_arrival) planPayload.time_of_arrival = time_of_arrival;
        if (remarks !== undefined) planPayload.remarks = remarks;

        const res = await fetch(`${DIRECTUS_URL}/items/post_dispatch_plan/${planId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify(planPayload)
        });

        if (!res.ok) throw new Error(`Failed to update dispatch plan: ${res.status}`);

        // Auto transition all related Sales Orders to "En Route" if trip status is "For Inbound" (truck departed)
        // or back to "For Loading" if trip is rejected
        if (status) {
            try {
                const stopsRes = await fetch(`${DIRECTUS_URL}/items/post_dispatch_invoices?filter[post_dispatch_plan_id][_eq]=${planId}&limit=-1`, { headers });
                if (stopsRes.ok) {
                    const stops = (await stopsRes.json()).data || [];
                    for (const stop of stops) {
                        const invRes = await fetch(`${DIRECTUS_URL}/items/sales_invoice/${stop.invoice_id}`, { headers });
                        if (invRes.ok) {
                            const invoiceData = (await invRes.json()).data;
                            const soId = invoiceData.sales_order_id;
                            if (soId) {
                                let targetSoStatus = "";
                                if (status === "For Inbound") {
                                    targetSoStatus = "En Route";
                                } else if (status === "Reject") {
                                    targetSoStatus = "For Loading";
                                }

                                if (targetSoStatus) {
                                    console.log(`[Deliveries API] Auto-transitioning Sales Order ${soId} to ${targetSoStatus}`);
                                    await fetch(`${DIRECTUS_URL}/items/sales_order/${soId}`, {
                                        method: "PATCH",
                                        headers,
                                        body: JSON.stringify({ order_status: targetSoStatus })
                                    });
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to auto-transition Sales Orders on plan status update:", err);
            }
        }

        return NextResponse.json({ success: true });
    } catch (e) {
        console.error("API Error in deliveries PATCH:", e);
        return NextResponse.json({ error: (e as { message?: string }).message || "Failed to update dispatch/delivery" }, { status: 500 });
    }
}
