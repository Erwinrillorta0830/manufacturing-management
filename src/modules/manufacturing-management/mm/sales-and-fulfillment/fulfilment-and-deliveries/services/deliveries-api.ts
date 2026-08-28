// src/modules/manufacturing-management/deliveries/services/deliveries-api.ts

import { DispatchPlan, DispatchInvoice, Vehicle, User, Branch, PendingInvoice } from "../types";

interface DirectusVehicle {
    vehicle_id?: number;
    id?: number;
    name?: string;
    plate?: string;
    type?: string;
}

interface DirectusUser {
    user_id: number;
    user_fname?: string;
    first_name?: string;
    user_lname?: string;
    last_name?: string;
    user_email?: string;
    email?: string;
    role?: string;
}

interface DirectusInvoiceData {
    order_id: string | number;
    document_no?: string;
    invoice_no?: string;
    date?: string;
    created_date?: string;
    customer_name?: string;
    customer_id?: number;
    customer_code?: string;
    net_amount?: number | string;
    customer_latitude?: string | number;
    customer_longitude?: string | number;
    customer_location?: string;
    customer_city?: string;
}

async function handleResponse(res: Response, fallbackMessage: string) {
    if (!res.ok) {
        let errMsg = fallbackMessage;
        try {
            const data = await res.json();
            if (data && data.error) errMsg = data.error;
        } catch {}
        throw new Error(errMsg);
    }
    return res.json();
}

export async function fetchDispatchPlans(): Promise<DispatchPlan[]> {
    const res = await fetch("/api/manufacturing/deliveries");
    return handleResponse(res, "Failed to load dispatch plans");
}

export async function fetchDispatchPlanStops(planId: number): Promise<DispatchInvoice[]> {
    const res = await fetch(`/api/manufacturing/deliveries?planId=${planId}`);
    return handleResponse(res, "Failed to load dispatch plan details");
}

export async function createDispatchPlan(payload: {
    doc_no?: string;
    driver_id: number;
    vehicle_id: number;
    encoder_id?: number | null;
    starting_point?: number | null;
    total_distance?: number;
    amount?: number;
    estimated_time_of_dispatch?: string | null;
    estimated_time_of_arrival?: string | null;
    remarks?: string;
    invoices: { invoice_id: number; distance: number; sequence: number; remarks?: string }[];
}): Promise<{ success: boolean; plan_id: number; doc_no: string }> {
    const res = await fetch("/api/manufacturing/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    return handleResponse(res, "Failed to create dispatch plan");
}

export async function updateDispatchPlanHeader(planId: number, update: {
    status?: string;
    time_of_dispatch?: string | null;
    time_of_arrival?: string | null;
    remarks?: string;
}): Promise<{ success: boolean }> {
    const res = await fetch("/api/manufacturing/deliveries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId, ...update })
    });
    return handleResponse(res, "Failed to update dispatch plan header");
}

export async function updateStopDeliveryStatus(stopId: number, stopStatus: string, remarks: string, driverUserId: number): Promise<{ success: boolean }> {
    const res = await fetch("/api/manufacturing/deliveries", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stopId, stopStatus, stopRemarks: remarks, driverUserId })
    });
    return handleResponse(res, "Failed to record stop delivery status");
}

export async function fetchVehiclesList(): Promise<Vehicle[]> {
    const res = await fetch("/api/manufacturing/logistics-profiles");
    const json = await handleResponse(res, "Failed to load vehicles");
    // Directus vehicles response maps to vehicles array
    return (json.vehicles || []).map((v: DirectusVehicle) => ({
        id: v.vehicle_id || v.id,
        name: v.name,
        plate: v.plate,
        type: v.type
    }));
}

export async function fetchUsersList(): Promise<User[]> {
    const res = await fetch("/api/manufacturing/planning-engineering?action=users");
    const list = await handleResponse(res, "Failed to load users list");
    return (list || []).map((u: DirectusUser) => ({
        user_id: u.user_id,
        first_name: u.user_fname || u.first_name || "",
        last_name: u.user_lname || u.last_name || "",
        email: u.user_email || u.email || "",
        role: u.role || ""
    }));
}

export async function fetchBranchesList(): Promise<Branch[]> {
    const res = await fetch("/api/manufacturing/procurement/qa-receiving?action=branches");
    return handleResponse(res, "Failed to load branches list");
}

export async function fetchPendingDeliveryInvoices(): Promise<PendingInvoice[]> {
    // Fetch all invoices
    const res = await fetch("/api/manufacturing/sales-invoice?limit=250");
    const json = await handleResponse(res, "Failed to load invoices");
    
    // Invoices are eligible for delivery if their status is Unpaid or Paid 
    // AND they have not been added to any active dispatch plans yet.
    const allInvoices = json.data || [];
    
    // Fetch all dispatch plan items to see which invoices are already in a trip
    const plansRes = await fetch("/api/manufacturing/deliveries");
    const plans: DispatchPlan[] = plansRes.ok ? await plansRes.json() : [];
    
    const dispatchedInvoiceIds = new Set<number>();
    
    // For each plan, fetch its stops (or do it in a lightweight manner)
    // To minimize requests, we can check the status of plans.
    // If we want to check which ones are already dispatched, let's fetch details of active plans
    const activePlans = plans.filter(p => p.status !== "Reject");
    for (const plan of activePlans) {
        try {
            const stopsRes = await fetch(`/api/manufacturing/deliveries?planId=${plan.id}`);
            if (stopsRes.ok) {
                const stops: DispatchInvoice[] = await stopsRes.json();
                stops.forEach(s => {
                    if (s.invoice_id) dispatchedInvoiceIds.add(s.invoice_id);
                });
            }
        } catch (e) {
            console.error(`Error loading stops for plan #${plan.id}:`, e);
        }
    }
    
    // Filter out invoices that have already been assigned to a dispatch plan
    const pendingInvoices = allInvoices.filter((inv: DirectusInvoiceData) => 
        !dispatchedInvoiceIds.has(Number(inv.order_id)) // In sales-invoice endpoint, order_id holds invoice_id
    );

    return pendingInvoices.map((inv: DirectusInvoiceData) => ({
        invoice_id: Number(inv.order_id), // maps invoice_id
        invoice_no: inv.document_no || inv.invoice_no,
        invoice_date: inv.date || inv.created_date,
        customer_name: inv.customer_name || `Customer #${inv.customer_id}`,
        customer_code: inv.customer_code || "GEN",
        net_amount: Number(inv.net_amount || 0),
        customer_latitude: inv.customer_latitude !== undefined ? inv.customer_latitude : null,
        customer_longitude: inv.customer_longitude !== undefined ? inv.customer_longitude : null,
        customer_location: inv.customer_location || null,
        customer_city: inv.customer_city || null
    }));
}
