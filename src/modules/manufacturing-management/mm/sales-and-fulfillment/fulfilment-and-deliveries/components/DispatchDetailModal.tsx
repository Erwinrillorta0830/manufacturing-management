// src/modules/manufacturing-management/deliveries/components/DispatchDetailModal.tsx

import React, { useState, useRef, useEffect } from "react";
import { DispatchPlan, DispatchInvoice, DispatchPlanStaff } from "../types";
import { X, Truck, User as UserIcon, CheckCircle2, ChevronRight, MapPin, Signature, Camera } from "lucide-react";
import { toast } from "sonner";

interface DispatchDetailModalProps {
    plan: DispatchPlan;
    stops: DispatchInvoice[];
    isOpen: boolean;
    onClose: () => void;
    onUpdateStatus: (planId: number, status: string, remarks?: string, dispatchTime?: string, arrivalTime?: string) => Promise<boolean>;
    onUpdateStop: (stopId: number, planId: number, status: string, remarks: string, driverUserId: number) => Promise<boolean>;
}

export default function DispatchDetailModal({
    plan,
    stops,
    isOpen,
    onClose,
    onUpdateStatus,
    onUpdateStop
}: DispatchDetailModalProps) {
    const [driverMode, setDriverMode] = useState(false);
    const [statusRemarks, setStatusRemarks] = useState("");
    
    // Stop verification state
    const [activeStop, setActiveStop] = useState<DispatchInvoice | null>(null);
    const [stopStatus, setStopStatus] = useState("Fulfilled");
    const [stopRemarks, setStopRemarks] = useState("");
    
    // HTML5 Signature Canvas Refs
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [isDrawing, setIsDrawing] = useState(false);

    // Canvas drawing helper function for capture
    const initCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 2.5;
        ctx.lineCap = "round";

        // Reset canvas size matching parent to prevent scaling offsets
        canvas.width = canvas.parentElement?.clientWidth || 320;
        canvas.height = 120;
        
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    };

    useEffect(() => {
        if (activeStop && canvasRef.current) {
            initCanvas();
        }
    }, [activeStop]);

    if (!isOpen || !plan) return null;

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        setIsDrawing(true);
        
        const pos = getPos(e, canvas);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const pos = getPos(e, canvas);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clearCanvas = () => {
        initCanvas();
    };

    const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        let clientX: number;
        let clientY: number;
        if ("touches" in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }
        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const handleStopVerificationSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeStop) return;

        // Save delivery stop
        const driverId = plan.driver_id || 1; // Encoder or Driver ID
        const success = await onUpdateStop(activeStop.id, plan.id, stopStatus, stopRemarks, driverId);
        if (success) {
            setActiveStop(null);
            setStopRemarks("");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <div className="border bg-card rounded-2xl w-full max-w-3xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black text-foreground uppercase tracking-wide">
                                Dispatch Sheet: {plan.doc_no}
                            </h3>
                            <span 
                                className={`text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                                    plan.status === "Posted" 
                                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" 
                                        : plan.status === "For Dispatch"
                                        ? "bg-blue-500/10 border-blue-500/20 text-blue-500"
                                        : plan.status === "For Clearance"
                                        ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
                                        : "bg-slate-500/10 border-slate-500/20 text-muted-foreground"
                                }`}
                            >
                                {plan.status}
                            </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">Origin Depot: {plan.starting_point_name || "Factory Direct"}</p>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {/* Driver Mode Responsive Toggle */}
                        <button
                            onClick={() => setDriverMode(!driverMode)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-black border uppercase cursor-pointer transition-all ${
                                driverMode 
                                    ? "bg-primary text-primary-foreground border-primary" 
                                    : "bg-background hover:bg-muted text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            📱 Driver Mode
                        </button>
                        <button 
                            onClick={onClose}
                            className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground border-none cursor-pointer"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Active Verification Sub-Drawer (POD canvas) */}
                    {activeStop ? (
                        <div className="border border-primary/20 bg-primary/5 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center justify-between border-b border-primary/10 pb-2">
                                <div>
                                    <span className="text-xs font-black uppercase text-primary block">
                                        Proof of Delivery: {activeStop.invoice?.invoice_no}
                                    </span>
                                    <span className="text-[9px] text-muted-foreground mt-0.5">
                                        Deliver to: {activeStop.invoice?.customer_name}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setActiveStop(null)}
                                    className="text-[10px] text-muted-foreground hover:text-foreground font-bold border-none bg-transparent cursor-pointer"
                                >
                                    Go Back
                                </button>
                            </div>

                            <form onSubmit={handleStopVerificationSubmit} className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Status selection */}
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-bold text-muted-foreground uppercase block">Delivery Status</label>
                                        <select
                                            value={stopStatus}
                                            onChange={(e) => setStopStatus(e.target.value)}
                                            className="w-full bg-background border border-input rounded-xl px-2.5 py-1.5 focus:ring-1 focus:ring-primary outline-none"
                                        >
                                            <option value="Fulfilled">Fulfilled (Goods Received OK)</option>
                                            <option value="Fulfilled With Returns">Fulfilled with Returns</option>
                                            <option value="Fulfilled With Concerns">Fulfilled with Concerns</option>
                                            <option value="Not Fulfilled">Not Fulfilled (Rejected/Failed)</option>
                                        </select>
                                    </div>

                                    {/* Notes */}
                                    <div className="space-y-1.5">
                                        <label className="text-[9px] font-bold text-muted-foreground uppercase block">Verification Remarks</label>
                                        <input
                                            type="text"
                                            placeholder="Write remarks or reasons for returns..."
                                            value={stopRemarks}
                                            onChange={(e) => setStopRemarks(e.target.value)}
                                            className="w-full bg-background border border-input rounded-xl px-2.5 py-1.5 focus:ring-1 focus:ring-primary outline-none"
                                        />
                                    </div>
                                </div>

                                {/* Signature Pad HTML5 Canvas */}
                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[9px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                                            <Signature className="h-3.5 w-3.5" />
                                            Customer Digital Signature (Touch / Sign here)
                                        </label>
                                        <button
                                            type="button"
                                            onClick={clearCanvas}
                                            className="text-[9px] text-rose-500 hover:text-rose-600 font-bold border-none bg-transparent cursor-pointer"
                                        >
                                            Clear Pad
                                        </button>
                                    </div>
                                    <div className="border bg-white rounded-xl overflow-hidden shadow-inner h-[120px] relative">
                                        <canvas
                                            ref={canvasRef}
                                            onMouseDown={startDrawing}
                                            onMouseMove={draw}
                                            onMouseUp={stopDrawing}
                                            onMouseLeave={stopDrawing}
                                            onTouchStart={startDrawing}
                                            onTouchMove={draw}
                                            onTouchEnd={stopDrawing}
                                            className="absolute inset-0 cursor-crosshair touch-none"
                                        />
                                    </div>
                                </div>

                                {/* Camera / Photo Attach Simulation */}
                                <div className="p-4 bg-muted/20 border border-dashed rounded-xl flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Camera className="h-4 w-4 text-muted-foreground" />
                                        <div>
                                            <span className="font-bold block text-foreground">Attach Delivery Photo</span>
                                            <span className="text-[9px] text-muted-foreground">Capture cargo load or physical signed DR receipts.</span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => toast.info("Image upload simulated. File attached successfully.")}
                                        className="bg-card border hover:bg-muted text-foreground px-3.5 py-1.5 rounded-lg font-bold cursor-pointer"
                                    >
                                        Select Image
                                    </button>
                                </div>

                                <div className="flex justify-end gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setActiveStop(null)}
                                        className="bg-card hover:bg-muted text-muted-foreground border px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="bg-primary hover:bg-primary/95 text-primary-foreground border-none px-5 py-2 rounded-xl text-xs font-black shadow-md hover:shadow-lg transition-all cursor-pointer"
                                    >
                                        Submit Proof of Delivery
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <>
                            {/* Standard View vs. Mobile Driver Portal */}
                            {!driverMode ? (
                                /* ADMIN METADATA PANEL */
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/20 border rounded-xl p-4 text-xs">
                                        <div>
                                            <span className="text-[9px] font-bold text-muted-foreground uppercase block">Driver</span>
                                            <span className="font-black text-foreground mt-0.5 block flex items-center gap-1">
                                                <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                                {plan.driver_name || `Driver #${plan.driver_id}`}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-bold text-muted-foreground uppercase block">Vehicle</span>
                                            <span className="font-black text-foreground mt-0.5 block flex items-center gap-1">
                                                <Truck className="h-3.5 w-3.5 text-muted-foreground" />
                                                {plan.vehicle?.name || "N/A"} ({plan.vehicle?.plate})
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-bold text-muted-foreground uppercase block">Allowance</span>
                                            <span className="font-bold text-foreground mt-0.5 block">
                                                ₱{Number(plan.amount).toLocaleString(undefined, {minimumFractionDigits: 2})}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="text-[9px] font-bold text-muted-foreground uppercase block">Total Distance</span>
                                            <span className="font-bold text-foreground mt-0.5 block">
                                                {plan.total_distance} km
                                            </span>
                                        </div>
                                    </div>

                                    {/* Helpers list rendering */}
                                    {plan.staff && plan.staff.filter((s: DispatchPlanStaff) => s.role === "Helper").length > 0 && (
                                        <div className="bg-muted/10 border rounded-xl p-4 text-xs space-y-2">
                                            <span className="text-[9px] font-bold text-muted-foreground uppercase block">Route Helper Personnel</span>
                                            <div className="flex flex-wrap gap-2">
                                                {plan.staff.filter((s: DispatchPlanStaff) => s.role === "Helper").map((s: DispatchPlanStaff) => (
                                                    <span 
                                                        key={s.id || s.user_id} 
                                                        className="px-2.5 py-1 bg-background border rounded-lg text-[10px] font-bold text-foreground flex items-center gap-1.5 shadow-sm"
                                                    >
                                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                        {s.user_name}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                /* MOBILE DRIVER PORTAL HEADER CARD */
                                <div className="border bg-slate-950/40 p-4 rounded-2xl flex flex-col gap-3 shadow-inner">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-primary/10 text-primary border border-primary/20 rounded-xl">
                                            <Truck className="h-6 w-6" />
                                        </div>
                                        <div className="text-xs">
                                            <span className="text-[9px] text-primary font-black uppercase tracking-wider block">Assigned Logistics Route</span>
                                            <h4 className="text-sm font-black text-foreground mt-0.5">{plan.vehicle?.name} ({plan.vehicle?.plate})</h4>
                                            <p className="text-[10px] text-muted-foreground mt-1">Driver: {plan.driver_name}</p>
                                        </div>
                                    </div>

                                    {/* Helpers in mobile portal */}
                                    {plan.staff && plan.staff.filter((s: DispatchPlanStaff) => s.role === "Helper").length > 0 && (
                                        <div className="border-t border-slate-800 pt-2.5">
                                            <span className="text-[9px] text-muted-foreground uppercase block font-bold mb-1">Helpers Crew</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {plan.staff.filter((s: DispatchPlanStaff) => s.role === "Helper").map((s: DispatchPlanStaff) => (
                                                    <span 
                                                        key={s.id || s.user_id} 
                                                        className="px-2 py-0.5 bg-slate-900 border border-slate-800 text-foreground text-[9px] font-medium rounded-md"
                                                    >
                                                        {s.user_name}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* STOPS LIST */}
                            <div className="space-y-3">
                                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-wider block">
                                    Delivery Manifest stops ({stops.length})
                                </span>
                                
                                <div className="space-y-3">
                                    {stops.map((stop) => {
                                        const isFulfilled = stop.status !== "Not Fulfilled";
                                        return (
                                            <div 
                                                key={stop.id} 
                                                className={`border rounded-2xl p-4 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                                                    isFulfilled 
                                                        ? "bg-emerald-500/5 border-emerald-500/10 hover:bg-emerald-500/10" 
                                                        : "bg-card hover:bg-muted/10"
                                                }`}
                                            >
                                                {/* Route detail */}
                                                <div className="flex gap-3 text-xs">
                                                    <div className="h-6 w-6 shrink-0 rounded-full bg-muted flex items-center justify-center font-black text-foreground border border-neutral-700 mt-0.5">
                                                        {stop.sequence}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-black text-foreground">{stop.invoice?.invoice_no}</span>
                                                            <span className="text-[9px] text-muted-foreground">({stop.distance} km)</span>
                                                        </div>
                                                        <h5 className="font-bold text-muted-foreground mt-1 truncate max-w-sm">
                                                            {stop.invoice?.customer_name}
                                                        </h5>
                                                        {stop.remarks && (
                                                            <p className="text-[10px] text-amber-500 mt-1.5 italic">Note: {stop.remarks}</p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Action and verification status */}
                                                <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                                                    {/* Navigation link (visible in driver portal) */}
                                                    {driverMode && (
                                                        <a 
                                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(stop.invoice?.customer_name || "")}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1 text-[10px] text-primary font-bold hover:underline"
                                                        >
                                                            <MapPin className="h-3.5 w-3.5" />
                                                            Maps
                                                        </a>
                                                    )}

                                                    {isFulfilled ? (
                                                        <div className="flex items-center gap-1.5 text-emerald-500 font-extrabold text-[10px] uppercase">
                                                            <CheckCircle2 className="h-4 w-4" />
                                                            {stop.status}
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => {
                                                                setActiveStop(stop);
                                                                setStopStatus("Fulfilled");
                                                            }}
                                                            className="bg-primary/10 border border-primary/20 hover:bg-primary text-primary hover:text-primary-foreground px-4 py-1.5 rounded-xl text-[10px] font-black cursor-pointer transition-all flex items-center gap-1"
                                                        >
                                                            Verify Stop Delivery
                                                            <ChevronRight className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Lifecycle Admin Controls (Hidden in driver view) */}
                            {!driverMode && plan.status !== "Posted" && plan.status !== "Reject" && (
                                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                                    <span className="text-xs font-black uppercase text-foreground block">Coordinator Administrative Dispatch Controls</span>
                                    
                                    <div className="flex flex-col gap-2.5">
                                        <textarea
                                            rows={1}
                                            value={statusRemarks}
                                            onChange={(e) => setStatusRemarks(e.target.value)}
                                            placeholder="Write audit log comment or validation notes for status transition..."
                                            className="w-full bg-background border border-input rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-primary outline-none resize-none"
                                        />
                                        
                                        <div className="flex flex-wrap gap-3.5 pt-1.5">
                                            {plan.status === "For Approval" && (
                                                <>
                                                    <button
                                                        onClick={() => onUpdateStatus(plan.id, "For Dispatch", statusRemarks || "Approved for dispatch.")}
                                                        className="bg-blue-600 hover:bg-blue-700 text-white border-none px-4 py-2 rounded-xl text-xs font-black cursor-pointer shadow-md hover:shadow-lg transition-all"
                                                    >
                                                        Approve Dispatch Run
                                                    </button>
                                                    <button
                                                        onClick={() => onUpdateStatus(plan.id, "Reject", statusRemarks || "Rejected.")}
                                                        className="bg-rose-600 hover:bg-rose-700 text-white border-none px-4 py-2 rounded-xl text-xs font-bold cursor-pointer"
                                                    >
                                                        Reject Plan
                                                    </button>
                                                </>
                                            )}

                                            {plan.status === "For Dispatch" && (
                                                <button
                                                    onClick={() => onUpdateStatus(plan.id, "For Inbound", statusRemarks || "Truck departed origin depot.", new Date().toISOString())}
                                                    className="bg-emerald-600 hover:bg-emerald-700 text-white border-none px-4 py-2 rounded-xl text-xs font-black cursor-pointer shadow-md hover:shadow-lg transition-all"
                                                >
                                                    Dispatch Cargo / Truck Departed
                                                </button>
                                            )}

                                            {plan.status === "For Inbound" && (
                                                <button
                                                    onClick={() => onUpdateStatus(plan.id, "For Clearance", statusRemarks || "Truck returned to depot.", undefined, new Date().toISOString())}
                                                    className="bg-amber-600 hover:bg-amber-700 text-white border-none px-4 py-2 rounded-xl text-xs font-black cursor-pointer shadow-md hover:shadow-lg transition-all"
                                                >
                                                    Truck Returned / Inbound Complete
                                                </button>
                                            )}

                                            {plan.status === "For Clearance" && (
                                                <button
                                                    onClick={() => onUpdateStatus(plan.id, "Posted", statusRemarks || "Clearing logged. Posted to ledger.")}
                                                    className="bg-violet-600 hover:bg-violet-700 text-white border-none px-5 py-2 rounded-xl text-xs font-black cursor-pointer shadow-md hover:shadow-lg transition-all"
                                                >
                                                    Clear Driver Manifest & Post Ledger
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t bg-muted/20 flex justify-end shrink-0">
                    <button
                        onClick={onClose}
                        className="bg-card hover:bg-muted text-muted-foreground border px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition-all"
                    >
                        Close Details
                    </button>
                </div>
            </div>
        </div>
    );
}
