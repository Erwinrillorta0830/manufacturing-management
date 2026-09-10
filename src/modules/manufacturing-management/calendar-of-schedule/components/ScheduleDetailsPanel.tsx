import React from "react";
import { Cpu, Anchor } from "lucide-react";
import { JobOrder, IncomingShipment, DailyBreakdownItem, RoutingStep } from "../types";
import { displayJobOrderStatus, isJobOrderStatus, JOB_ORDER_STATUS } from "../../job-order-status";

interface ScheduleDetailsPanelProps {
    selectedJO: JobOrder | null;
    setSelectedJO: (jo: JobOrder | null) => void;
    selectedShipment: IncomingShipment | null;
    setSelectedShipment: (ship: IncomingShipment | null) => void;
}

export function ScheduleDetailsPanel({
    selectedJO,
    setSelectedJO,
    selectedShipment,
    setSelectedShipment
}: ScheduleDetailsPanelProps) {
    // Job Order Details
    if (selectedJO) {
        return (
            <div className="border rounded-xl bg-card p-5 shadow-sm space-y-4 animate-in fade-in duration-200">
                <div className="flex justify-between items-center border-b pb-3">
                    <div>
                        <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider flex items-center gap-1">
                            <Cpu className="h-4 w-4 text-primary" />
                            Job Order details
                        </h4>
                        <p className="text-[10px] text-muted-foreground">ID: {selectedJO.jo_id}</p>
                    </div>
                    <button
                        onClick={() => setSelectedJO(null)}
                        className="text-muted-foreground hover:text-foreground text-xs font-semibold"
                    >
                        Close
                    </button>
                </div>

                <div className="space-y-3.5 text-xs">
                    <div className="space-y-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase block">Finished Good SKU</span>
                        <span className="font-bold text-foreground block">{selectedJO.product_name}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 border bg-muted/15 p-3 rounded-lg text-[11px]">
                        <div>
                            <span className="text-muted-foreground font-bold block uppercase text-[9px]">Committed Qty</span>
                            <span className="font-extrabold text-foreground">{selectedJO.quantity} PCS</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground font-bold block uppercase text-[9px]">Due Date</span>
                            <span className="font-bold text-foreground">{selectedJO.due_date}</span>
                        </div>
                        <div className="col-span-2 pt-2 border-t mt-2 flex justify-between items-center">
                            <span className="text-muted-foreground font-bold uppercase text-[9px]">Alloc Status:</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                                isJobOrderStatus(selectedJO.status, JOB_ORDER_STATUS.PROCEED, JOB_ORDER_STATUS.RELEASED)
                                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                    : isJobOrderStatus(selectedJO.status, JOB_ORDER_STATUS.SHORTAGE)
                                    ? "bg-destructive/10 text-destructive border border-destructive/20"
                                    : "bg-muted text-muted-foreground border"
                            }`}>
                                {displayJobOrderStatus(selectedJO.status)}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-1.5 border-t pt-3">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase block">Ref Sales Orders</span>
                        <p className="text-[11px] font-semibold text-foreground italic">
                            &quot;{selectedJO.order_no}&quot;
                        </p>
                    </div>

                    {selectedJO.dailyBreakdown && selectedJO.dailyBreakdown.length > 0 && (
                        <div className="space-y-2 border-t pt-3">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase block">Daily production breakdown</span>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                                {selectedJO.dailyBreakdown.map((run: DailyBreakdownItem) => (
                                    <div key={run.day} className="flex justify-between items-center bg-muted/20 border p-2 rounded-lg text-[10px]">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-foreground">Day {run.day} ({run.date})</span>
                                            <span className="text-[8px] text-muted-foreground uppercase font-bold">{run.status}</span>
                                        </div>
                                        <span className="font-extrabold text-primary">{run.quantity.toLocaleString()} PCS</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {selectedJO.routings && selectedJO.routings.length > 0 && (
                        <div className="space-y-2 border-t pt-3">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase block">Floor routing timeline</span>
                            <div className="relative pl-3 border-l-2 border-emerald-500/30 space-y-2.5">
                                {selectedJO.routings.map((rout: RoutingStep) => (
                                    <div key={rout.routing_id} className="relative text-[10px]">
                                        <div className="absolute -left-[18px] top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 border border-card" />
                                        <div className="flex justify-between font-bold text-foreground">
                                            <span>Step {rout.sequence_order}: {rout.operation_name}</span>
                                            <span className="text-muted-foreground">{rout.duration_hours} Hrs</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Incoming Shipment Details
    if (selectedShipment) {
        return (
            <div className="border rounded-xl bg-card p-5 shadow-sm space-y-4 animate-in fade-in duration-200">
                <div className="flex justify-between items-center border-b pb-3">
                    <div>
                        <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider flex items-center gap-1">
                            <Anchor className="h-4 w-4 text-sky-600" />
                            Incoming Cargo Details
                        </h4>
                        <p className="text-[10px] text-muted-foreground">PO/BL: {selectedShipment.reference_number}</p>
                    </div>
                    <button
                        onClick={() => setSelectedShipment(null)}
                        className="text-muted-foreground hover:text-foreground text-xs font-semibold"
                    >
                        Close
                    </button>
                </div>

                <div className="space-y-3.5 text-xs">
                    <div className="space-y-1">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase block">Supplier / Shipper</span>
                        <span className="font-bold text-foreground block">{selectedShipment.shipper || "N/A"}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 border bg-muted/15 p-3 rounded-lg text-[11px]">
                        <div>
                            <span className="text-muted-foreground block font-bold uppercase text-[9px]">Transit Carrier</span>
                            <span className="font-bold text-foreground">{selectedShipment.carrier || "N/A"}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground block font-bold uppercase text-[9px]">Shipment Status</span>
                            <span className="font-bold text-sky-600 block">{selectedShipment.status}</span>
                        </div>
                        <div className="col-span-2 pt-2 border-t mt-2">
                            <span className="text-muted-foreground block font-bold uppercase text-[9px]">Estimated Time of Arrival (ETA)</span>
                            <span className="font-bold text-foreground block">
                                {selectedShipment.lead_time_receiving?.split("T")[0] || 
                                 selectedShipment.estimated_delivery_date?.split("T")[0] || 
                                 selectedShipment.date_received?.split("T")[0] || 
                                 "No ETA"}
                            </span>
                        </div>
                    </div>

                    {selectedShipment.notes && (
                        <div className="space-y-1 border-t pt-3">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase block">Vessel/Log Notes</span>
                            <p className="text-[11px] text-foreground italic">
                                &quot;{selectedShipment.notes}&quot;
                            </p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="border border-dashed rounded-xl p-8 text-center text-muted-foreground text-xs">
            Select a scheduled Job Order (⚙️) or Incoming Cargo (🚢) pill in the calendar grid to audit scheduling timelines.
        </div>
    );
}
