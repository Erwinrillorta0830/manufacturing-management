// src/modules/manufacturing-management/deliveries/hooks/useDeliveries.ts

import { useState, useEffect, useCallback } from "react";
import { DispatchPlan, DispatchInvoice, Vehicle, User, Branch, PendingInvoice } from "../types";
import { 
    fetchDispatchPlans, 
    fetchDispatchPlanStops, 
    createDispatchPlan, 
    updateDispatchPlanHeader, 
    updateStopDeliveryStatus, 
    fetchVehiclesList, 
    fetchUsersList, 
    fetchBranchesList, 
    fetchPendingDeliveryInvoices 
} from "../services/deliveries-api";
import { toast } from "sonner";

export function useDeliveries() {
    const [plans, setPlans] = useState<DispatchPlan[]>([]);
    const [stopsMap, setStopsMap] = useState<Record<number, DispatchInvoice[]>>({});
    
    // Master data lists
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    
    // Pending items
    const [pendingInvoices, setPendingInvoices] = useState<PendingInvoice[]>([]);
    
    const [loading, setLoading] = useState<boolean>(true);
    const [submitting, setSubmitting] = useState<boolean>(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            // Fetch list of dispatch plans
            const activePlans = await fetchDispatchPlans();
            setPlans(activePlans || []);

            // Prefetch master lists
            const vList = await fetchVehiclesList();
            setVehicles(vList || []);

            const uList = await fetchUsersList();
            setUsers(uList || []);

            const bList = await fetchBranchesList();
            setBranches(bList || []);

            // Load invoices ready to be shipped
            const pInvoices = await fetchPendingDeliveryInvoices();
            setPendingInvoices(pInvoices || []);

            // Batch load stops for all active plans
            const activePlansWithStops = activePlans.filter(p => p.status !== "Reject");
            const map: Record<number, DispatchInvoice[]> = {};
            for (const plan of activePlansWithStops) {
                try {
                    const stops = await fetchDispatchPlanStops(plan.id);
                    map[plan.id] = stops || [];
                } catch (e) {
                    console.error(`Error loading stops for plan ${plan.id}:`, e);
                }
            }
            setStopsMap(map);
        } catch (e) {
            const error = e as Error;
            console.error("Error loading deliveries master data:", e);
            toast.error(error.message || "Failed to load logistics & delivery data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleCreateDispatchPlan = async (payload: {
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
    }) => {
        setSubmitting(true);
        try {
            await createDispatchPlan(payload);
            toast.success("Dispatch plan generated successfully!");
            await loadData();
            return true;
        } catch (e) {
            const error = e as Error;
            console.error("Error creating dispatch plan:", e);
            toast.error(error.message || "Failed to create dispatch plan");
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdatePlanStatus = async (planId: number, status: string, remarks?: string, dispatchTime?: string, arrivalTime?: string) => {
        setSubmitting(true);
        try {
            const updatePayload: {
                status: string;
                remarks?: string;
                time_of_dispatch?: string;
                time_of_arrival?: string;
            } = { status };
            if (remarks !== undefined) updatePayload.remarks = remarks;
            if (dispatchTime) updatePayload.time_of_dispatch = dispatchTime;
            if (arrivalTime) updatePayload.time_of_arrival = arrivalTime;

            await updateDispatchPlanHeader(planId, updatePayload);
            toast.success(`Trip status updated to: ${status}`);
            await loadData();
            return true;
        } catch (e) {
            const error = e as Error;
            console.error("Error updating trip status:", e);
            toast.error(error.message || "Failed to update dispatch status");
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdateStopStatus = async (stopId: number, planId: number, status: string, remarks: string, driverUserId: number) => {
        setSubmitting(true);
        try {
            await updateStopDeliveryStatus(stopId, status, remarks, driverUserId);
            toast.success(`Delivery stop status updated to: ${status}`);
            
            // Reload stops specifically for this plan
            const updatedStops = await fetchDispatchPlanStops(planId);
            setStopsMap(prev => ({
                ...prev,
                [planId]: updatedStops
            }));
            
            // Reload pending invoices
            const pInvoices = await fetchPendingDeliveryInvoices();
            setPendingInvoices(pInvoices || []);
            
            return true;
        } catch (e) {
            const error = e as Error;
            console.error("Error updating stop status:", e);
            toast.error(error.message || "Failed to submit delivery verification");
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    return {
        plans,
        stopsMap,
        vehicles,
        users,
        branches,
        pendingInvoices,
        loading,
        submitting,
        handleCreateDispatchPlan,
        handleUpdatePlanStatus,
        handleUpdateStopStatus,
        refresh: loadData
    };
}
