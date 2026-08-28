import React, { useState } from "react";
import { PendingInvoice, Vehicle, User, Branch } from "../types";
import { X, Truck, ListOrdered, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { CreatableSelect } from "../../finished-goods/components/CreatableSelect";

const cityCoordinates: Record<string, { lat: number; lng: number }> = {
    "urdaneta": { lat: 15.9761, lng: 120.5713 },
    "dagupan": { lat: 16.0433, lng: 120.3333 },
    "lingayen": { lat: 16.0204, lng: 120.2319 },
    "tarlac": { lat: 15.4802, lng: 120.5979 },
    "san carlos": { lat: 15.9272, lng: 120.4289 },
    "alaminos": { lat: 16.1558, lng: 119.9806 },
    "baguio": { lat: 16.4164, lng: 120.5931 },
    "manila": { lat: 14.5995, lng: 120.9842 }
};

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export interface CreateDispatchPayload {
    doc_no: string;
    driver_id: number;
    vehicle_id: number;
    starting_point: number | null;
    total_distance: number;
    amount: number;
    estimated_time_of_dispatch: string | null;
    estimated_time_of_arrival: string | null;
    remarks: string;
    invoices: Array<{
        invoice_id: number;
        distance: number;
        sequence: number;
        remarks: string;
    }>;
    staff: Array<{
        user_id: number;
        role: string;
        is_present: number;
    }>;
}

interface CreateDispatchModalProps {
    isOpen: boolean;
    onClose: () => void;
    vehicles: Vehicle[];
    users: User[];
    branches: Branch[];
    pendingInvoices: PendingInvoice[];
    onSubmit: (payload: CreateDispatchPayload) => Promise<boolean>;
}

export default function CreateDispatchModal({
    isOpen,
    onClose,
    vehicles,
    users,
    branches,
    pendingInvoices,
    onSubmit
}: CreateDispatchModalProps) {
    const [docNo, setDocNo] = useState("");
    const [driverId, setDriverId] = useState("");
    const [vehicleId, setVehicleId] = useState("");
    const [startingPoint, setStartingPoint] = useState("");
    const [totalDistance, setTotalDistance] = useState(0);
    const [amount, setAmount] = useState(0);
    const [estDispatch, setEstDispatch] = useState("");
    const [estArrival, setEstArrival] = useState("");
    const [remarks, setRemarks] = useState("");
    
    // Checked invoice stop details
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<number[]>([]);
    const [stopDetails, setStopDetails] = useState<Record<number, { sequence: number; distance: number; remarks: string }>>({});
    
    // Helpers list
    const [selectedHelperIds, setSelectedHelperIds] = useState<number[]>([]);

    const [submitting, setSubmitting] = useState(false);

    const driverOptions = React.useMemo(() => {
        return users.map(u => ({
            value: String(u.user_id),
            label: `${u.first_name} ${u.last_name} (${u.email})`
        }));
    }, [users]);

    const branchOptions = React.useMemo(() => {
        return branches.map(b => ({
            value: String(b.id),
            label: `${b.branch_name} (${b.branch_code})`
        }));
    }, [branches]);

    if (!isOpen) return null;

    const handleHelperToggle = (id: number) => {
        if (selectedHelperIds.includes(id)) {
            setSelectedHelperIds(prev => prev.filter(item => item !== id));
        } else {
            setSelectedHelperIds(prev => [...prev, id]);
        }
    };

    const resolveCoordinates = (inv?: PendingInvoice) => {
        if (inv && inv.customer_latitude && inv.customer_longitude) {
            return { lat: Number(inv.customer_latitude), lng: Number(inv.customer_longitude) };
        }
        
        const city = (inv?.customer_city || "").toLowerCase().trim();
        for (const key of Object.keys(cityCoordinates)) {
            if (city.includes(key)) {
                return cityCoordinates[key];
            }
        }
        
        // Fallback: Default near Urdaneta with a small random offset
        const offset = (Math.random() - 0.5) * 0.05;
        return { lat: 15.9761 + offset, lng: 120.5713 + offset };
    };

    const handleOptimizeRoute = () => {
        if (selectedInvoiceIds.length === 0) {
            toast.error("Please select at least one invoice stop to optimize.");
            return;
        }

        // 1. Resolve starting depot coordinates
        const selectedBranch = branches.find(b => String(b.id) === String(startingPoint));
        let currentLat = 15.9761;
        let currentLng = 120.5713;
        
        if (selectedBranch) {
            const bName = (selectedBranch.branch_name || "").toLowerCase();
            if (bName.includes("lingayen")) {
                currentLat = 16.0204;
                currentLng = 120.2319;
            } else if (bName.includes("dagupan")) {
                currentLat = 16.0433;
                currentLng = 120.3333;
            } else if (bName.includes("tarlac")) {
                currentLat = 15.4802;
                currentLng = 120.5979;
            }
        }

        // 2. Build list of stops with coordinates
        const unvisited = selectedInvoiceIds.map(id => {
            const inv = pendingInvoices.find(item => item.invoice_id === id);
            const coords = resolveCoordinates(inv);
            return { id, coords };
        });

        const route: { id: number; coords: { lat: number; lng: number }; distance: number }[] = [];
        
        // 3. Nearest neighbor loop
        while (unvisited.length > 0) {
            let closestIndex = 0;
            let minDistance = Infinity;

            for (let i = 0; i < unvisited.length; i++) {
                const dist = haversineDistance(
                    currentLat,
                    currentLng,
                    unvisited[i].coords.lat,
                    unvisited[i].coords.lng
                );
                if (dist < minDistance) {
                    minDistance = dist;
                    closestIndex = i;
                }
            }

            const nextStop = unvisited.splice(closestIndex, 1)[0];
            route.push({
                id: nextStop.id,
                coords: nextStop.coords,
                distance: minDistance
            });

            currentLat = nextStop.coords.lat;
            currentLng = nextStop.coords.lng;
        }

        // 4. Update state stopDetails and totalDistance
        const updatedDetails: Record<number, { sequence: number; distance: number; remarks: string }> = {};
        let totalDistSum = 0;

        route.forEach((item, index) => {
            const roundedDist = Math.round(item.distance * 10) / 10;
            totalDistSum += roundedDist;

            updatedDetails[item.id] = {
                sequence: index + 1,
                distance: roundedDist || 0.1,
                remarks: stopDetails[item.id]?.remarks || ""
            };
        });

        setStopDetails(updatedDetails);
        setSelectedInvoiceIds(route.map(item => item.id));
        setTotalDistance(Math.round(totalDistSum * 10) / 10);
        
        toast.success(`Route optimized! Total distance: ${Math.round(totalDistSum * 10) / 10} km.`);
    };

    const handleCheckboxChange = (id: number) => {
        if (selectedInvoiceIds.includes(id)) {
            setSelectedInvoiceIds(prev => prev.filter(item => item !== id));
            // clean up
            const updated = { ...stopDetails };
            delete updated[id];
            setStopDetails(updated);
        } else {
            setSelectedInvoiceIds(prev => [...prev, id]);
            // prefill
            setStopDetails(prev => ({
                ...prev,
                [id]: {
                    sequence: selectedInvoiceIds.length + 1,
                    distance: 10, // default placeholder distance
                    remarks: ""
                }
            }));
        }
    };

    const handleStopDetailChange = (id: number, field: string, value: string | number) => {
        setStopDetails(prev => ({
            ...prev,
            [id]: {
                ...prev[id],
                [field]: value
            }
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!driverId || !vehicleId || selectedInvoiceIds.length === 0) {
            toast.error("Please fill in driver, vehicle, and select at least one invoice.");
            return;
        }

        setSubmitting(true);
        
        // Sum up total planned distance from individual stops
        const computedDistance = Object.values(stopDetails).reduce((acc, curr) => acc + Number(curr.distance), 0);

        // Assemble staff crew listing
        const staffPayload = [
            { user_id: parseInt(driverId), role: "Driver", is_present: 1 },
            ...selectedHelperIds.map(id => ({ user_id: id, role: "Helper", is_present: 1 }))
        ];

        const payload = {
            doc_no: docNo || `DP-${Math.floor(1000 + Math.random() * 9000)}`,
            driver_id: parseInt(driverId),
            vehicle_id: parseInt(vehicleId),
            starting_point: startingPoint ? parseInt(startingPoint) : null,
            total_distance: totalDistance || computedDistance,
            amount: amount,
            estimated_time_of_dispatch: estDispatch ? new Date(estDispatch).toISOString() : null,
            estimated_time_of_arrival: estArrival ? new Date(estArrival).toISOString() : null,
            remarks: remarks,
            invoices: selectedInvoiceIds.map(id => ({
                invoice_id: id,
                distance: stopDetails[id]?.distance || 0,
                sequence: stopDetails[id]?.sequence || 1,
                remarks: stopDetails[id]?.remarks || ""
            })),
            staff: staffPayload
        };

        const success = await onSubmit(payload);
        setSubmitting(false);
        if (success) {
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <div className="border bg-card rounded-2xl w-full max-w-4xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b">
                    <div>
                        <h3 className="text-sm font-black text-foreground uppercase tracking-wide">Generate New Dispatch Plan</h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Bundle sales invoices into a scheduled delivery route.</p>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground border-none cursor-pointer"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left: Metadata Form inputs */}
                    <div className="lg:col-span-5 space-y-4">
                        {/* Doc Number */}
                        <div className="space-y-1">
                            <label className="text-[9px] font-extrabold uppercase text-muted-foreground">Document Code (Optional)</label>
                            <input
                                type="text"
                                placeholder="Auto-generated if empty"
                                value={docNo}
                                onChange={(e) => setDocNo(e.target.value)}
                                className="w-full bg-muted/40 border border-input rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                            />
                        </div>

                        {/* Driver */}
                        <div className="space-y-1">
                            <label className="text-[9px] font-extrabold uppercase text-muted-foreground">Assigned Driver *</label>
                            <CreatableSelect
                                options={driverOptions}
                                value={driverId}
                                onValueChange={(val) => {
                                    setDriverId(val);
                                    // Filter out driver from helpers if already selected
                                    setSelectedHelperIds(prev => prev.filter(id => String(id) !== val));
                                }}
                                placeholder="Select Crew Driver..."
                            />
                        </div>

                        {/* Crew Helpers */}
                        {driverId && (
                            <div className="space-y-1">
                                <label className="text-[9px] font-extrabold uppercase text-muted-foreground block">Route Helpers / Assistant Crew</label>
                                <div className="border border-input rounded-xl p-3 bg-muted/10 max-h-32 overflow-y-auto space-y-1.5">
                                    {users.filter(u => String(u.user_id) !== String(driverId)).length === 0 ? (
                                        <span className="text-[10px] text-muted-foreground block">No other crew personnel available.</span>
                                    ) : (
                                        users.filter(u => String(u.user_id) !== String(driverId)).map(u => (
                                            <label key={u.user_id} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedHelperIds.includes(u.user_id)}
                                                    onChange={() => handleHelperToggle(u.user_id)}
                                                    className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                                                />
                                                <span className="text-foreground">
                                                    {u.first_name} {u.last_name}
                                                </span>
                                            </label>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Vehicle */}
                        <div className="space-y-1">
                            <label className="text-[9px] font-extrabold uppercase text-muted-foreground">Delivery Truck/Vehicle *</label>
                            <div className="relative">
                                <Truck className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <select
                                    required
                                    value={vehicleId}
                                    onChange={(e) => setVehicleId(e.target.value)}
                                    className="pl-9 w-full bg-muted/40 border border-input rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-primary/20 outline-none h-[35px]"
                                >
                                    <option value="">Select Transport Fleet</option>
                                    {vehicles.map(v => (
                                        <option key={v.id} value={v.id}>
                                            {v.name} - {v.plate} ({v.type})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Origin Branch starting_point */}
                        <div className="space-y-1">
                            <label className="text-[9px] font-extrabold uppercase text-muted-foreground">Starting Point / Origin Branch</label>
                            <CreatableSelect
                                options={branchOptions}
                                value={startingPoint}
                                onValueChange={(val) => setStartingPoint(val)}
                                placeholder="Select origin depot..."
                            />
                        </div>

                        {/* Cost & Travel */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[9px] font-extrabold uppercase text-muted-foreground">Allowance / Fee (₱)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={amount || ""}
                                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                                    className="w-full bg-muted/40 border border-input rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-primary/20 outline-none text-right"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-extrabold uppercase text-muted-foreground">Total Distance (km)</label>
                                <input
                                    type="number"
                                    placeholder="Leave for auto-sum"
                                    value={totalDistance || ""}
                                    onChange={(e) => setTotalDistance(parseFloat(e.target.value) || 0)}
                                    className="w-full bg-muted/40 border border-input rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-primary/20 outline-none text-right"
                                />
                            </div>
                        </div>

                        {/* Dates */}
                        <div className="space-y-1.5 col-span-2">
                            <label className="text-[9px] font-extrabold uppercase text-muted-foreground">Estimated Dispatch Time</label>
                            <input
                                type="datetime-local"
                                value={estDispatch}
                                onChange={(e) => setEstDispatch(e.target.value)}
                                className="w-full bg-muted/40 border border-input rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                        </div>

                        <div className="space-y-1.5 col-span-2">
                            <label className="text-[9px] font-extrabold uppercase text-muted-foreground">Estimated Arrival Time</label>
                            <input
                                type="datetime-local"
                                value={estArrival}
                                onChange={(e) => setEstArrival(e.target.value)}
                                className="w-full bg-muted/40 border border-input rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                        </div>

                        {/* Remarks */}
                        <div className="space-y-1">
                            <label className="text-[9px] font-extrabold uppercase text-muted-foreground">Route Remarks</label>
                            <textarea
                                rows={2}
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                placeholder="Route info or dispatch logistics comments..."
                                className="w-full bg-muted/40 border border-input rounded-xl px-3.5 py-2 text-xs focus:ring-2 focus:ring-primary/20 outline-none resize-none"
                            />
                        </div>
                    </div>

                    {/* Right: Selected Invoices stops grid */}
                    <div className="lg:col-span-7 flex flex-col space-y-4 min-h-0 min-w-0">
                        {/* List of outstanding invoices to check */}
                        <div className="flex-1 border rounded-xl overflow-hidden flex flex-col max-h-[30vh] lg:max-h-none">
                            <div className="bg-muted/30 px-4 py-2 border-b shrink-0">
                                <span className="text-[9px] font-extrabold uppercase text-muted-foreground tracking-wider">Select Invoices Ready for Cargo Dispatch</span>
                            </div>
                            <div className="divide-y overflow-y-auto flex-1 bg-card">
                                {pendingInvoices.length === 0 ? (
                                    <div className="text-center py-8 text-xs text-muted-foreground">
                                        No invoices pending delivery found. Ensure invoices are created.
                                    </div>
                                ) : (
                                    pendingInvoices.map((inv) => (
                                        <div key={inv.invoice_id} className="flex items-start gap-3 p-3 hover:bg-muted/5 transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={selectedInvoiceIds.includes(inv.invoice_id)}
                                                onChange={() => handleCheckboxChange(inv.invoice_id)}
                                                className="mt-1"
                                            />
                                            <div className="flex-1 min-w-0 text-xs">
                                                <div className="flex justify-between items-start">
                                                    <span className="font-bold text-foreground block">{inv.invoice_no}</span>
                                                    <span className="font-black text-primary">₱{inv.net_amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                                                </div>
                                                <p className="text-[9px] text-muted-foreground mt-0.5">
                                                    Customer: {inv.customer_name} ({inv.customer_code}) | Date: {new Date(inv.invoice_date).toLocaleDateString()}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Sequence and distance configurator table */}
                        {selectedInvoiceIds.length > 0 && (
                            <div className="border rounded-xl overflow-hidden shrink-0">
                                <div className="bg-muted/30 px-4 py-1.5 border-b flex justify-between items-center">
                                    <span className="text-[9px] font-extrabold uppercase text-muted-foreground tracking-wider">Route Stops Sequence Calibration</span>
                                    <button
                                        type="button"
                                        onClick={handleOptimizeRoute}
                                        className="bg-primary/20 hover:bg-primary text-primary hover:text-primary-foreground border border-primary/20 px-2.5 py-0.5 rounded-lg text-[9px] font-black cursor-pointer flex items-center gap-1 transition-all"
                                    >
                                        <Sparkles className="h-3 w-3" />
                                        Auto-Optimize Route
                                    </button>
                                </div>
                                <div className="max-h-48 overflow-y-auto bg-card divide-y">
                                    {selectedInvoiceIds.map((id) => {
                                        const matched = pendingInvoices.find(inv => inv.invoice_id === id);
                                        const stop = stopDetails[id];
                                        return (
                                            <div key={id} className="p-3 grid grid-cols-12 gap-3 items-center text-xs">
                                                <div className="col-span-5 truncate">
                                                    <span className="font-bold block text-foreground">{matched?.invoice_no}</span>
                                                    <span className="text-[9px] text-muted-foreground">{matched?.customer_name}</span>
                                                </div>
                                                <div className="col-span-3 flex items-center gap-1.5">
                                                    <ListOrdered className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={stop?.sequence || 1}
                                                        onChange={(e) => handleStopDetailChange(id, "sequence", parseInt(e.target.value) || 1)}
                                                        className="w-full bg-background border border-input rounded-lg px-2 py-1 text-xs text-right outline-none"
                                                    />
                                                </div>
                                                <div className="col-span-4 flex items-center gap-1.5">
                                                    <span className="text-[9px] text-muted-foreground shrink-0">Dist (km):</span>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={stop?.distance || 0}
                                                        onChange={(e) => handleStopDetailChange(id, "distance", parseFloat(e.target.value) || 0)}
                                                        className="w-full bg-background border border-input rounded-lg px-2 py-1 text-xs text-right outline-none"
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </form>

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-muted/20 flex justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="bg-card hover:bg-muted text-muted-foreground border px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        disabled={submitting || selectedInvoiceIds.length === 0}
                        onClick={handleSubmit}
                        className="bg-primary hover:bg-primary/95 text-primary-foreground border-none px-5 py-2 rounded-xl text-xs font-black shadow-md hover:shadow-lg disabled:opacity-50 transition-all cursor-pointer"
                    >
                        {submitting ? "Publishing..." : "Publish Dispatch Plan"}
                    </button>
                </div>
            </div>
        </div>
    );
}
