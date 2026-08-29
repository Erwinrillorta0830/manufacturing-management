// src/modules/manufacturing-management/deliveries/DeliveriesModule.tsx

"use client";

import React, { useState, useMemo } from "react";
import { useDeliveries } from "./hooks/useDeliveries";
import CreateDispatchModal from "./components/CreateDispatchModal";
import DispatchDetailModal from "./components/DispatchDetailModal";
import { 
    Truck, 
    Navigation, 
    Search, 
    SlidersHorizontal, 
    Plus, 
    Loader2, 
    CheckCircle2, 
    Clock 
} from "lucide-react";
import { DispatchPlan } from "./types";

export default function DeliveriesModule() {
    const {
        plans,
        stopsMap,
        vehicles,
        users,
        branches,
        pendingInvoices,
        loading,
        handleCreateDispatchPlan,
        handleUpdatePlanStatus,
        handleUpdateStopStatus
    } = useDeliveries();

    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");

    // Modal triggers
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [selectedPlan, setSelectedPlan] = useState<DispatchPlan | null>(null);

    // Compute metric aggregates
    const metrics = useMemo(() => {
        const totalTrips = plans.length;
        const activeRuns = plans.filter(p => p.status === "For Inbound" || p.status === "For Dispatch").length;
        const clearances = plans.filter(p => p.status === "For Clearance").length;
        const closed = plans.filter(p => p.status === "Posted").length;
        const expenses = plans.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

        return { totalTrips, activeRuns, clearances, closed, expenses };
    }, [plans]);

    // Filter plans table
    const filteredPlans = useMemo(() => {
        return plans.filter(p => {
            const matchesSearch = 
                p.doc_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (p.driver_name && p.driver_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
                (p.starting_point_name && p.starting_point_name.toLowerCase().includes(searchQuery.toLowerCase()));
            
            const matchesStatus = statusFilter === "All" || p.status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [plans, searchQuery, statusFilter]);

    return (
        <div className="flex flex-col min-h-0 min-w-0 flex-1 space-y-4">
            
            {/* Header Cards Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
                <div className="border bg-card rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
                    <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                        <Navigation className="h-5 w-5" />
                    </div>
                    <div>
                        <span className="text-[10px] text-muted-foreground font-bold uppercase block">Total Schedules</span>
                        <h4 className="text-base font-black text-foreground mt-0.5">{metrics.totalTrips} Trips</h4>
                    </div>
                </div>

                <div className="border bg-card rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500">
                        <Truck className="h-5 w-5" />
                    </div>
                    <div>
                        <span className="text-[10px] text-muted-foreground font-bold uppercase block">Active En Route</span>
                        <h4 className="text-base font-black text-foreground mt-0.5">{metrics.activeRuns} Trucks</h4>
                    </div>
                </div>

                <div className="border bg-card rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500">
                        <Clock className="h-5 w-5" />
                    </div>
                    <div>
                        <span className="text-[10px] text-muted-foreground font-bold uppercase block">Pending Clearance</span>
                        <h4 className="text-base font-black text-foreground mt-0.5">{metrics.clearances} Manifests</h4>
                    </div>
                </div>

                <div className="border bg-card rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500">
                        <CheckCircle2 className="h-5 w-5" />
                    </div>
                    <div>
                        <span className="text-[10px] text-muted-foreground font-bold uppercase block">Total Settle Cost</span>
                        <h4 className="text-base font-black text-foreground mt-0.5">
                            ₱{metrics.expenses.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </h4>
                    </div>
                </div>
            </div>

            {/* Actions Filters row */}
            <div className="flex flex-col sm:flex-row gap-3 items-center shrink-0">
                {/* Search */}
                <div className="relative w-full sm:flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search by Dispatch No, Driver, Origin Branch..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 w-full bg-card border border-input rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    />
                </div>

                {/* Status selector */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-card border border-input rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-primary/20 outline-none w-full sm:w-40"
                    >
                        <option value="All">All Schedules</option>
                        <option value="For Approval">For Approval</option>
                        <option value="For Dispatch">For Dispatch</option>
                        <option value="For Inbound">For Inbound</option>
                        <option value="For Clearance">For Clearance</option>
                        <option value="Posted">Posted (Closed)</option>
                        <option value="Reject">Rejected</option>
                    </select>

                    <button
                        onClick={() => setIsCreateOpen(true)}
                        className="bg-primary hover:bg-primary/95 text-primary-foreground border-none px-4 py-2 rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                        <Plus className="h-4 w-4" />
                        Plan Trip
                    </button>
                </div>
            </div>

            {/* Table Area */}
            <div className="flex-1 min-h-0 relative bg-background border rounded-xl p-4 md:p-6 shadow-sm flex flex-col">
                {loading && (
                    <div className="absolute inset-0 bg-background/50 backdrop-blur-sm z-50 flex items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                )}

                <div className="flex-1 overflow-auto min-h-0">
                    {filteredPlans.length === 0 ? (
                        <div className="text-center py-12">
                            <Navigation className="h-10 w-10 text-muted-foreground/30 mx-auto" />
                            <h5 className="font-bold text-foreground text-xs uppercase tracking-wide mt-2">No Dispatch Plans</h5>
                            <p className="text-[10px] text-muted-foreground mt-1">
                                {searchQuery ? "No records matched your search filters." : "Click 'Plan Trip' to create a new delivery schedule."}
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b bg-muted/20">
                                    <th className="p-3 font-semibold text-muted-foreground uppercase">Dispatch Code</th>
                                    <th className="p-3 font-semibold text-muted-foreground uppercase">Origin depot</th>
                                    <th className="p-3 font-semibold text-muted-foreground uppercase">Driver Crew</th>
                                    <th className="p-3 font-semibold text-muted-foreground uppercase">Vehicle Profile</th>
                                    <th className="p-3 font-semibold text-muted-foreground uppercase text-right">Distance</th>
                                    <th className="p-3 font-semibold text-muted-foreground uppercase text-right">Allowance</th>
                                    <th className="p-3 font-semibold text-muted-foreground uppercase text-center">Stops</th>
                                    <th className="p-3 font-semibold text-muted-foreground uppercase text-center">Status</th>
                                    <th className="p-3 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y bg-card">
                                {filteredPlans.map((plan) => {
                                    const stops = stopsMap[plan.id] || [];
                                    const completedStops = stops.filter(s => s.status !== "Not Fulfilled").length;
                                    return (
                                        <tr key={plan.id} className="hover:bg-muted/10 transition-colors">
                                            <td className="p-3 font-bold text-foreground">{plan.doc_no}</td>
                                            <td className="p-3 text-muted-foreground">{plan.starting_point_name || "Factory Direct"}</td>
                                            <td className="p-3 text-foreground font-medium">{plan.driver_name || `Driver #${plan.driver_id}`}</td>
                                            <td className="p-3 text-muted-foreground">
                                                {plan.vehicle?.name} ({plan.vehicle?.plate})
                                            </td>
                                            <td className="p-3 text-right font-semibold text-foreground">{plan.total_distance} km</td>
                                            <td className="p-3 text-right font-black text-foreground">
                                                ₱{plan.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-3 text-center font-bold text-foreground">
                                                {completedStops} / {stops.length}
                                            </td>
                                            <td className="p-3 text-center">
                                                <span 
                                                    className={`text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                                                        plan.status === "Posted" 
                                                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" 
                                                            : plan.status === "For Dispatch"
                                                            ? "bg-blue-500/10 border-blue-500/20 text-blue-500"
                                                            : plan.status === "For Inbound"
                                                            ? "bg-indigo-500/10 border-indigo-500/20 text-indigo-500"
                                                            : plan.status === "For Clearance"
                                                            ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                                                            : "bg-slate-500/10 border-slate-500/20 text-muted-foreground"
                                                    }`}
                                                >
                                                    {plan.status}
                                                </span>
                                            </td>
                                            <td className="p-3 text-center">
                                                <button
                                                    onClick={() => setSelectedPlan(plan)}
                                                    className="bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground px-3 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-all"
                                                >
                                                    View / Settle
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Create Dispatch Modal */}
            {isCreateOpen && (
                <CreateDispatchModal
                    isOpen={isCreateOpen}
                    onClose={() => setIsCreateOpen(false)}
                    vehicles={vehicles}
                    users={users}
                    branches={branches}
                    pendingInvoices={pendingInvoices}
                    onSubmit={handleCreateDispatchPlan}
                />
            )}

            {/* Dispatch Detail Modal */}
            {selectedPlan && (
                <DispatchDetailModal
                    isOpen={!!selectedPlan}
                    onClose={() => setSelectedPlan(null)}
                    plan={selectedPlan}
                    stops={stopsMap[selectedPlan.id] || []}
                    onUpdateStatus={handleUpdatePlanStatus}
                    onUpdateStop={handleUpdateStopStatus}
                />
            )}
        </div>
    );
}
