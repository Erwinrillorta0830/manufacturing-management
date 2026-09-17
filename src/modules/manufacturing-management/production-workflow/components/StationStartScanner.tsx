/* eslint-disable */
import React, { useState, useEffect, useRef } from "react";
import {
    Scan,
    Radio,
    QrCode,
    CheckCircle2,
    AlertTriangle,
    Sparkles,
    Building2,
    FileText,
    ArrowRight,
    Loader2,
    RefreshCw,
    X,
    Maximize2,
    Minimize2,
    GitBranch
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { JobOrder, WorkCenter, StationScanResponse, type StationJobOrderSummary, type WorkCenterJobOrderAvailability } from "../types";
import { scanStationStart, fetchWorkCenters, fetchWorkCenterAvailability, type RouteWorkCenterOption, type WorkCenterApplicabilitySource } from "../services/production-api";
import { toast } from "sonner";
import { displayJobOrderStatus, isJobOrderStatus, JOB_ORDER_STATUS } from "../../job-order-status";

interface StationStartScannerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    jobOrders: JobOrder[];
    initialJobOrder?: JobOrder | null;
    onStationStarted: (response: StationScanResponse) => void;
}

// Audio beep for industrial hardware feedback
function playSuccessBeep() {
    try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
    } catch (e) {
        // Ignore audio errors if blocked by browser policy
    }
}

export function StationStartScanner({
    open,
    onOpenChange,
    jobOrders,
    initialJobOrder = null,
    onStationStarted
}: StationStartScannerProps) {
    const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
    const [workCenterSource, setWorkCenterSource] = useState<WorkCenterApplicabilitySource | null>(null);
    const [routeOptions, setRouteOptions] = useState<RouteWorkCenterOption[]>([]);
    const [loadingWc, setLoadingWc] = useState(false);
    const [workCenterAvailability, setWorkCenterAvailability] = useState<WorkCenterJobOrderAvailability[]>([]);
    const [loadingAvailability, setLoadingAvailability] = useState(false);
    const [availabilityError, setAvailabilityError] = useState<string | null>(null);

    // Scanned values
    const [scannedWcBarcode, setScannedWcBarcode] = useState("");
    const [scannedJoBarcode, setScannedJoBarcode] = useState("");
    const [selectedWc, setSelectedWc] = useState<WorkCenter | null>(null);
    const [selectedJo, setSelectedJo] = useState<JobOrder | null>(null);
    const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [scanResult, setScanResult] = useState<StationScanResponse | null>(null);

    const wcInputRef = useRef<HTMLInputElement>(null);
    const joInputRef = useRef<HTMLInputElement>(null);

    const loadWorkCentersFor = React.useCallback(async (jobOrder: JobOrder | null) => {
        setLoadingWc(true);
        try {
            const result = await fetchWorkCenters(jobOrder ? (jobOrder.order_id || jobOrder.job_order_id || jobOrder.jo_id) : undefined);
            setWorkCenters(result.data);
            setWorkCenterSource(result.source);
            setRouteOptions(result.routeOptions || []);
            return result;
        } catch (err: any) {
            toast.error(err.message || "Failed to load work centers");
            setWorkCenters([]);
            setWorkCenterSource(jobOrder ? "NONE" : null);
            setRouteOptions([]);
            return {
                data: [] as WorkCenter[],
                applicableWorkCenterIds: [] as number[],
                source: (jobOrder ? "NONE" : "ALL") as WorkCenterApplicabilitySource,
                routeOptions: []
            };
        } finally {
            setLoadingWc(false);
        }
    }, []);

    const loadWorkCenterAvailability = React.useCallback(async () => {
        setLoadingAvailability(true);
        setAvailabilityError(null);
        try {
            const result = await fetchWorkCenterAvailability();
            setWorkCenterAvailability(result);
        } catch (err: any) {
            setWorkCenterAvailability([]);
            setAvailabilityError(err.message || "Failed to load workstation Job Order availability.");
        } finally {
            setLoadingAvailability(false);
        }
    }, []);

    // Load work centers on open, honoring an optional prefilled Job Order.
    useEffect(() => {
        if (!open) return;
        setScanResult(null);
        setScannedWcBarcode("");
        setScannedJoBarcode("");
        setSelectedWc(null);
        setSelectedRouteId(null);
        setWorkCenterAvailability([]);
        setAvailabilityError(null);

        const prefill = initialJobOrder || null;
        setSelectedJo(prefill);
        if (prefill) {
            setScannedJoBarcode(prefill.job_order_no || prefill.jo_id);
            const prefillRoutes = prefill.routing_tasks || prefill.routingTasks || [];
            if (prefillRoutes.length === 1) {
                setSelectedRouteId(Number(prefillRoutes[0].id || prefillRoutes[0].jo_route_id) || null);
            }
        }

        void loadWorkCentersFor(prefill).finally(() => {
            setTimeout(() => wcInputRef.current?.focus(), 150);
        });
        void loadWorkCenterAvailability();
    }, [open, initialJobOrder, loadWorkCentersFor, loadWorkCenterAvailability]);

    const selectJobOrder = async (
        jobOrder: JobOrder | null,
        workCenterToKeep: WorkCenter | null = null,
        routeIdToKeep: number | null = null
    ) => {
        setSelectedJo(jobOrder);
        setScannedJoBarcode(jobOrder ? (jobOrder.job_order_no || jobOrder.jo_id) : "");
        setScanResult(null);
        setSelectedRouteId(null);
        setSelectedWc(null);
        setScannedWcBarcode("");
        const result = await loadWorkCentersFor(jobOrder);
        const jobOrderRoutes = jobOrder?.routing_tasks || jobOrder?.routingTasks || [];
        if (routeIdToKeep) {
            setSelectedRouteId(routeIdToKeep);
        } else if (jobOrderRoutes.length === 1) {
            setSelectedRouteId(Number(jobOrderRoutes[0].id || jobOrderRoutes[0].jo_route_id) || null);
        }
        if (workCenterToKeep) {
            const stillApplicable = result.data.find((center) =>
                Number(center.work_center_id) === Number(workCenterToKeep.work_center_id)
            );
            const nextWorkCenter = stillApplicable || workCenterToKeep;
            setSelectedWc(nextWorkCenter);
            setScannedWcBarcode(nextWorkCenter.barcode || `WC-${nextWorkCenter.work_center_id}`);
        }
    };

    const selectedJoRoutes = React.useMemo(() => {
        const routes = selectedJo?.routing_tasks || selectedJo?.routingTasks || [];
        return [...routes].sort((left, right) => left.sequence_order - right.sequence_order);
    }, [selectedJo]);

    const openJoRoutes = React.useMemo(() => selectedJoRoutes.filter((route) => {
        const status = String(route.status || "").trim().toLowerCase();
        return !status || status === "pending" || status === "ongoing" || status === "in progress";
    }), [selectedJoRoutes]);

    const selectedRoute = selectedJoRoutes.find((route) => Number(route.id || route.jo_route_id) === Number(selectedRouteId)) || null;
    const selectedRouteOption = routeOptions.find((option) => option.joRouteId === Number(selectedRouteId));
    const selectedRouteWorkCenterIds = selectedRouteOption?.workCenterIds?.length
        ? selectedRouteOption.workCenterIds
        : selectedRoute?.work_center_id
            ? [Number(selectedRoute.work_center_id)]
            : [];
    const visibleWorkCenters = selectedRoute
        ? workCenters.filter((workCenter) => selectedRouteWorkCenterIds.includes(Number(workCenter.work_center_id)))
        : selectedJoRoutes.length > 1
            ? []
            : workCenters;

    const availabilityByWorkCenter = React.useMemo(
        () => new Map(workCenterAvailability.map((entry) => [entry.workCenterId, entry])),
        [workCenterAvailability]
    );
    const selectedWorkCenterAvailability = selectedWc
        ? availabilityByWorkCenter.get(Number(selectedWc.work_center_id))
        : null;

    const handleRouteSelection = (value: string) => {
        const nextRouteId = Number(value) || null;
        setSelectedRouteId(nextRouteId);
        const nextOption = routeOptions.find((option) => option.joRouteId === nextRouteId);
        const nextRoute = selectedJoRoutes.find((route) => Number(route.id || route.jo_route_id) === nextRouteId);
        const nextAllowedIds = nextOption?.workCenterIds?.length
            ? nextOption.workCenterIds
            : nextRoute?.work_center_id
                ? [Number(nextRoute.work_center_id)]
                : [];

        if (selectedWc && !nextAllowedIds.includes(Number(selectedWc.work_center_id))) {
            setSelectedWc(null);
            setScannedWcBarcode("");
        }
        if (nextAllowedIds.length === 1) {
            const matchingWorkCenter = workCenters.find((workCenter) => Number(workCenter.work_center_id) === nextAllowedIds[0]);
            if (matchingWorkCenter) {
                setSelectedWc(matchingWorkCenter);
                setScannedWcBarcode(matchingWorkCenter.barcode || `WC-${matchingWorkCenter.work_center_id}`);
            }
        }
    };

    // Handle Work Center Barcode Enter
    const handleWcBarcodeSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const code = scannedWcBarcode.trim();
        if (!code) return;

        if (selectedJoRoutes.length > 1 && !selectedRouteId) {
            toast.error("Select a routing step before verifying its workstation.");
            return;
        }

        const matched = visibleWorkCenters.find((w) => {
            const assetBarcode = w.asset?.barcode || w.barcode || "";
            const wcCode = `WC-${String(w.work_center_id).padStart(3, "0")}`;
            const wcCodeShort = `WC-${w.work_center_id}`;
            return (
                assetBarcode.toLowerCase() === code.toLowerCase() ||
                wcCode.toLowerCase() === code.toLowerCase() ||
                wcCodeShort.toLowerCase() === code.toLowerCase() ||
                String(w.work_center_id) === code ||
                w.work_center_name.toLowerCase().includes(code.toLowerCase())
            );
        });

        if (matched) {
            handleWorkCenterSelect(matched);
            toast.success(`Work Center matched: ${matched.work_center_name}`);
        } else {
            toast.error(selectedJo
                ? `Work Center "${code}" is not part of this Job Order's routing.`
                : `Work Center barcode "${code}" not recognized.`);
        }
    };

    // Handle Job Order Barcode Enter
    const handleJoBarcodeSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const code = scannedJoBarcode.trim();
        if (!code) return;

        const matched = jobOrders.find((j) => {
            const joNo = j.job_order_no || j.jo_id;
            const joIdStr = String(j.order_id || j.job_order_id || "");
            return (
                joNo.toLowerCase() === code.toLowerCase() ||
                joIdStr === code ||
                code.toLowerCase().includes(joNo.toLowerCase()) ||
                joNo.toLowerCase().includes(code.toLowerCase())
            );
        });

        if (matched) {
            playSuccessBeep();
            toast.success(`Job Order matched: ${matched.job_order_no || matched.jo_id}`);
            void selectJobOrder(matched);
        } else {
            toast.error(`Job Order barcode "${code}" not recognized.`);
        }
    };

    const handleAvailabilityJobOrderSelect = async (
        summary: StationJobOrderSummary,
        workCenterToKeep: WorkCenter | null = null
    ) => {
        const matchedJobOrder = jobOrders.find((jobOrder) =>
            Number(jobOrder.order_id || jobOrder.job_order_id || 0) === summary.jobOrderId
            || (jobOrder.job_order_no || jobOrder.jo_id) === summary.jobOrderNo
        );
        const fallbackRoute = summary.routeId > 0
            ? [{
                id: summary.routeId,
                jo_route_id: summary.routeId,
                jo_id: summary.jobOrderNo,
                routing_id: 0,
                name: summary.operationName,
                sequence_order: summary.routeSequence,
                status: summary.routeStatus,
                planned_setup_hours: 0,
                planned_run_hours: 0,
                actual_setup_hours: 0,
                actual_run_hours: 0,
                completed_at: null,
                requires_qa: 0,
                qa_record_exists: false,
                shift_progress_exists: false,
                assignments: [],
                qa_logs: []
            }]
            : [];
        const nextJobOrder = matchedJobOrder || {
            jo_id: summary.jobOrderNo,
            order_id: summary.jobOrderId,
            job_order_id: summary.jobOrderId,
            product_id: summary.productId || 0,
            product_name: summary.productName,
            quantity: summary.quantity,
            due_date: "",
            status: summary.status,
            branch_id: summary.branchId || 0,
            routing_tasks: fallbackRoute
        } as JobOrder;

        playSuccessBeep();
        await selectJobOrder(nextJobOrder, workCenterToKeep, summary.routeId || null);
        toast.success(`Job Order ${summary.jobOrderNo} loaded for ${workCenterToKeep?.work_center_name || "the workstation"}.`);
    };

    const handleWorkCenterSelect = (workCenter: WorkCenter) => {
        setSelectedWc(workCenter);
        setScannedWcBarcode(workCenter.barcode || `WC-${workCenter.work_center_id}`);
        playSuccessBeep();

        setTimeout(() => joInputRef.current?.focus(), 100);
    };

    // Trigger Final Station Start Execution
    const handleExecuteStationStart = async () => {
        if (selectedJoRoutes.length > 1 && !selectedRouteId) {
            toast.error("Select a routing step before starting a multi-route Job Order.");
            return;
        }
        if (!selectedWc && !scannedWcBarcode) {
            toast.error("Please scan or select a Work Center Station.");
            wcInputRef.current?.focus();
            return;
        }
        if (!selectedJo && !scannedJoBarcode) {
            toast.error("Please scan or select a Job Order.");
            joInputRef.current?.focus();
            return;
        }

        setIsSubmitting(true);
        try {
            const payload = {
                workCenterBarcode: selectedWc?.barcode || scannedWcBarcode,
                workCenterId: selectedWc?.work_center_id,
                jobOrderBarcode: selectedJo?.job_order_no || selectedJo?.jo_id || scannedJoBarcode,
                jobOrderId: selectedJo?.order_id || selectedJo?.job_order_id,
                joRouteId: selectedRouteId || undefined
            };

            const response = await scanStationStart(payload);
            if (response.success) {
                playSuccessBeep();
                setScanResult(response);
                toast.success(response.message || "Station started successfully!");
                onStationStarted(response);
            } else {
                toast.error(response.error || "Failed to start station.");
            }
        } catch (err: any) {
            toast.error(err.message || "Error processing station start scan.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-1rem)] !max-w-[calc(100vw-1rem)] max-h-[94vh] flex flex-col bg-background border border-border/80 shadow-2xl rounded-2xl p-0 overflow-hidden">
                {/* Header */}
                <div className="bg-gradient-to-r from-primary/15 via-primary/5 to-background p-4 sm:p-5 border-b border-border/50 shrink-0">
                    <DialogHeader>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-primary/10 rounded-2xl text-primary border border-primary/20 shadow-sm">
                                    <Scan className="h-6 w-6 animate-pulse" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <DialogTitle className="font-extrabold text-lg sm:text-xl tracking-tight text-foreground">
                                            Station Start Scanner
                                        </DialogTitle>
                                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px] uppercase font-bold">
                                            Kiosk Ready
                                        </Badge>
                                    </div>
                                    <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                                        Scan Work Center Barcode + Job Order Batch Barcode to transition status to <strong className="text-foreground">WIP / IN-PROGRESS</strong> and record in <code className="font-mono text-[10px] text-primary">manufacturing_job_order_status_history</code>.
                                    </DialogDescription>
                                </div>
                            </div>
                        </div>
                    </DialogHeader>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 min-h-0">
                    {/* Success Banner if Transition Complete */}
                    {scanResult && (
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl space-y-3 animate-in fade-in zoom-in duration-300">
                            <div className="flex items-start gap-3">
                                <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <h4 className="font-bold text-sm text-emerald-900 dark:text-emerald-300">
                                        Station Start Verified & Recorded!
                                    </h4>
                                    <p className="text-xs text-emerald-700 dark:text-emerald-400">
                                        {scanResult.message}
                                    </p>
                                    {scanResult.statusHistoryRecord && (
                                        <div className="text-[11px] font-mono text-muted-foreground pt-1">
                                            History ID: #{scanResult.statusHistoryRecord.history_id || scanResult.statusHistoryRecord.id || "Logged"} • Station: {scanResult.statusHistoryRecord.work_center_name || scanResult.workCenter?.work_center_name || "Unassigned"} • Changed at: {new Date(scanResult.statusHistoryRecord.changed_at).toLocaleTimeString()}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="flex justify-end gap-2 pt-2">
                                <Button
                                    size="sm"
                                    onClick={() => onOpenChange(false)}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 text-xs px-4"
                                >
                                    Proceed to Terminal Workspace
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Station Start Steps */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Step 1: Work Center Scanner */}
                        <Card className={`border transition-all duration-200 ${selectedWc ? "border-emerald-500/40 bg-emerald-500/[0.02]" : "border-border"}`}>
                            <CardHeader className="p-4 pb-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest font-mono">
                                        Step 1: Station Scan
                                    </span>
                                    {selectedWc && (
                                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-bold">
                                            Station Verified
                                        </Badge>
                                    )}
                                </div>
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <Building2 className="h-4 w-4 text-primary" /> Work Center Barcode
                                </CardTitle>
                                <CardDescription className="text-[11px]">
                                    {selectedJo
                                        ? selectedRoute
                                            ? "Only the workstation configured for the selected route is shown"
                                            : "Select a route to narrow the workstation list"
                                        : "Scan station asset tag, RFID, or tap a station below"}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-4 pt-2 space-y-3">
                                <form onSubmit={handleWcBarcodeSubmit} className="flex gap-2">
                                    <div className="relative flex-1">
                                        <QrCode className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            ref={wcInputRef}
                                            placeholder="Scan WC barcode (e.g. WC-001)..."
                                            value={scannedWcBarcode}
                                            onChange={(e) => setScannedWcBarcode(e.target.value)}
                                            className="pl-9 h-10 text-xs font-mono font-bold bg-background focus-visible:ring-primary"
                                        />
                                    </div>
                                    <Button type="submit" size="sm" className="h-10 text-xs font-bold px-3">
                                        Verify
                                    </Button>
                                </form>

                                {selectedWc ? (
                                    <div className="p-3 bg-muted/30 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                                        <div>
                                            <span className="font-extrabold text-xs text-foreground block">
                                                {selectedWc.work_center_name}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground font-mono">
                                                Code: {selectedWc.barcode || `WC-${selectedWc.work_center_id}`} • Dept: {selectedWc.department?.department_name || "Manufacturing"}
                                            </span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="xs"
                                            onClick={() => {
                                                setSelectedWc(null);
                                                setScannedWcBarcode("");
                                            }}
                                            className="h-7 text-xs text-muted-foreground hover:text-red-500"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase font-mono block">
                                            {selectedJo ? "Applicable Stations for this Job Order:" : "Quick Touch Station Select:"}
                                        </span>
                                        {selectedJo && !loadingWc && (workCenterSource === "NONE" || workCenters.length === 0) ? (
                                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                                                No work stations are configured for this product version&apos;s routing. Update the routing in Finished Goods Master → Version Management before starting production.
                                            </div>
                                        ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                                            {loadingWc ? (
                                                <div className="col-span-3 py-4 text-center text-xs text-muted-foreground">
                                                    <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" /> Loading stations...
                                                </div>
                                            ) : visibleWorkCenters.map((wc) => (
                                                <button
                                                    key={wc.work_center_id}
                                                    type="button"
                                                    onClick={() => handleWorkCenterSelect(wc)}
                                                    className="p-2 text-left bg-background border border-border/80 hover:border-primary hover:bg-primary/5 rounded-xl transition-all text-xs flex flex-col justify-between"
                                                >
                                                    <div className="flex items-start justify-between gap-1.5">
                                                        <span className="font-bold text-[11px] truncate block text-foreground">
                                                            {wc.work_center_name}
                                                        </span>
                                                        <Building2 className="h-3 w-3 shrink-0 text-primary/70" />
                                                    </div>
                                                    <span className="font-mono text-[9px] text-muted-foreground">
                                                        {wc.barcode || `WC-${wc.work_center_id}`}
                                                    </span>
                                                    {(() => {
                                                        const availability = availabilityByWorkCenter.get(Number(wc.work_center_id));
                                                        if (!availability) return null;
                                                        return (
                                                            <div className="mt-1 flex flex-wrap gap-1">
                                                                <Badge variant="outline" className="h-4 border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[8px] font-bold text-emerald-700 dark:text-emerald-300">
                                                                    {availability.availableJobOrders.length} available
                                                                </Badge>
                                                                <Badge variant="outline" className="h-4 border-amber-500/30 bg-amber-500/10 px-1.5 text-[8px] font-bold text-amber-700 dark:text-amber-300">
                                                                    {availability.inProgressJobOrders.length} in progress
                                                                </Badge>
                                                            </div>
                                                        );
                                                    })()}
                                                </button>
                                            ))}
                                            {!loadingWc && selectedJo && selectedJoRoutes.length > 1 && !selectedRouteId && (
                                                <div className="col-span-3 rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 text-[11px] font-semibold text-blue-700 dark:text-blue-400">
                                                    Select a routing step below before choosing its workstation.
                                                </div>
                                            )}
                                        </div>
                                        )}
                                    </div>
                                )}

                            </CardContent>
                        </Card>

                        {/* Step 2: Job Order Batch Scanner */}
                        <Card className={`border transition-all duration-200 ${selectedJo ? "border-emerald-500/40 bg-emerald-500/[0.02]" : "border-border"}`}>
                            <CardHeader className="p-4 pb-2">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold text-primary uppercase tracking-widest font-mono">
                                        Step 2: Job Order Scan
                                    </span>
                                    {selectedJo && (
                                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-bold">
                                            JO Verified
                                        </Badge>
                                    )}
                                </div>
                                <CardTitle className="text-sm font-bold flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-primary" /> Job Order Batch Barcode
                                </CardTitle>
                                <CardDescription className="text-[11px]">
                                    {selectedWc
                                        ? "Choose an available Job Order for this workstation or scan its barcode"
                                        : "Scan traveller barcode, batch sheet, or tap a released job below"}
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-4 pt-2 space-y-3">
                                <form onSubmit={handleJoBarcodeSubmit} className="flex gap-2">
                                    <div className="relative flex-1">
                                        <Scan className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            ref={joInputRef}
                                            placeholder="Scan Job Order barcode (e.g. JO-2026-0001)..."
                                            value={scannedJoBarcode}
                                            onChange={(e) => setScannedJoBarcode(e.target.value)}
                                            className="pl-9 h-10 text-xs font-mono font-bold bg-background focus-visible:ring-primary"
                                        />
                                    </div>
                                    <Button type="submit" size="sm" className="h-10 text-xs font-bold px-3">
                                        Verify
                                    </Button>
                                </form>

                                {selectedJo ? (
                                    <div className="p-3 bg-muted/30 border border-emerald-500/30 rounded-xl flex items-center justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-extrabold text-xs text-foreground font-mono">
                                                    {selectedJo.job_order_no || selectedJo.jo_id}
                                                </span>
                                                <Badge variant="outline" className="text-[9px] font-bold">
                                                    {displayJobOrderStatus(selectedJo.status)}
                                                </Badge>
                                            </div>
                                            <span className="text-[10px] text-muted-foreground block truncate max-w-[260px]">
                                                {selectedJo.product_name} • Qty: {selectedJo.quantity.toLocaleString()} pcs
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="xs"
                                                onClick={() => {
                                                    void selectJobOrder(null);
                                                }}
                                                className="h-7 text-xs text-muted-foreground hover:text-red-500"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                ) : selectedWc ? (
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="text-[9px] font-bold text-muted-foreground uppercase font-mono block">
                                                Available to Start and In Progress Here:
                                            </span>
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="xs"
                                                onClick={() => void loadWorkCenterAvailability()}
                                                disabled={loadingAvailability}
                                                className="h-7 shrink-0 px-2 text-[10px]"
                                            >
                                                <RefreshCw className={`mr-1.5 h-3 w-3 ${loadingAvailability ? "animate-spin" : ""}`} />
                                                Refresh
                                            </Button>
                                        </div>

                                        {availabilityError ? (
                                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                                                {availabilityError}
                                            </div>
                                        ) : loadingAvailability ? (
                                            <div className="flex items-center justify-center rounded-xl border border-dashed p-4 text-[11px] text-muted-foreground">
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading workstation Job Orders...
                                            </div>
                                        ) : (
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                {[
                                                    {
                                                        label: "Available to start",
                                                        entries: selectedWorkCenterAvailability?.availableJobOrders || [],
                                                        interactive: true,
                                                        className: "border-emerald-500/30 bg-emerald-500/5",
                                                        badgeClassName: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                                                    },
                                                    {
                                                        label: "In progress here",
                                                        entries: selectedWorkCenterAvailability?.inProgressJobOrders || [],
                                                        interactive: false,
                                                        className: "border-amber-500/30 bg-amber-500/5",
                                                        badgeClassName: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                                                    }
                                                ].map((group) => (
                                                    <div key={group.label} className={`rounded-xl border p-2.5 ${group.className}`}>
                                                        <div className="mb-1.5 flex items-center justify-between gap-2">
                                                            <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                                                                {group.label}
                                                            </span>
                                                            <Badge variant="outline" className={`h-4 px-1.5 text-[8px] font-bold ${group.badgeClassName}`}>
                                                                {group.entries.length}
                                                            </Badge>
                                                        </div>
                                                        {group.entries.length === 0 ? (
                                                            <span className="text-[10px] text-muted-foreground">No matching Job Orders.</span>
                                                        ) : (
                                                            <div className="space-y-1.5">
                                                                {group.entries.map((entry) => (
                                                                    <button
                                                                        key={`${entry.jobOrderId}-${entry.routeId || "primary"}`}
                                                                        type="button"
                                                                        disabled={!group.interactive}
                                                                        onClick={() => handleAvailabilityJobOrderSelect(entry, selectedWc)}
                                                                        className={`w-full rounded-lg border border-border/70 bg-background/80 p-2 text-left transition-colors ${group.interactive
                                                                            ? "hover:border-primary hover:bg-primary/5"
                                                                            : "cursor-not-allowed opacity-80"
                                                                            }`}
                                                                    >
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <span className="truncate font-mono text-[10px] font-bold text-foreground">
                                                                                {entry.jobOrderNo}
                                                                            </span>
                                                                            <span className="shrink-0 text-[9px] font-semibold text-muted-foreground">
                                                                                {displayJobOrderStatus(entry.status)}
                                                                            </span>
                                                                        </div>
                                                                        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                                                                            {entry.productName} - Qty {entry.quantity.toLocaleString()}
                                                                        </div>
                                                                        <div className="mt-0.5 truncate text-[9px] text-muted-foreground">
                                                                            {entry.routeSequence > 0 ? `Step ${entry.routeSequence} - ` : ""}{entry.operationName} - {entry.routeStatus}
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase font-mono block">
                                            Active Queue Fast Select:
                                        </span>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                                            {jobOrders
                                                .filter((jo) => !isJobOrderStatus(jo.status, JOB_ORDER_STATUS.CANCELLED))
                                                .slice(0, 8)
                                                .map((jo) => (
                                                <button
                                                    key={jo.jo_id}
                                                    type="button"
                                                    onClick={() => {
                                                        playSuccessBeep();
                                                        void selectJobOrder(jo);
                                                    }}
                                                    className="p-2 text-left bg-background border border-border/80 hover:border-primary hover:bg-primary/5 rounded-xl transition-all text-xs flex flex-col justify-between"
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-mono font-bold text-[11px] text-foreground">
                                                            {jo.job_order_no || jo.jo_id}
                                                        </span>
                                                        <span className="text-[9px] text-muted-foreground font-semibold">
                                                            {displayJobOrderStatus(jo.status)}
                                                        </span>
                                                    </div>
                                                    <span className="text-[10px] text-muted-foreground truncate block mt-0.5">
                                                        {jo.product_name}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    {selectedJo && selectedJoRoutes.length > 0 && (
                        <Card className="border-primary/30 bg-primary/[0.02]">
                            <CardHeader className="p-4 pb-2">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <CardTitle className="flex items-center gap-2 text-sm font-bold">
                                            <GitBranch className="h-4 w-4 text-primary" /> Step 3: Select Routing Step
                                        </CardTitle>
                                        <CardDescription className="text-[11px]">
                                            Multi-route Job Orders must identify the route before the station can be started.
                                        </CardDescription>
                                    </div>
                                    {selectedJoRoutes.length > 1 && (
                                        <Badge variant="outline" className="shrink-0 text-[10px] font-bold">
                                            {openJoRoutes.length} open route{openJoRoutes.length === 1 ? "" : "s"}
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 pt-2">
                                <Select
                                    value={selectedRouteId ? String(selectedRouteId) : ""}
                                    onValueChange={handleRouteSelection}
                                >
                                    <SelectTrigger className="h-10 w-full text-xs" data-testid="station-route-select">
                                        <SelectValue placeholder={selectedJoRoutes.length > 1 ? "Select a route step" : "Route step"} />
                                    </SelectTrigger>
                                    <SelectContent position="popper" className="min-w-[360px]">
                                        {openJoRoutes.map((route) => {
                                            const id = Number(route.id || route.jo_route_id);
                                            const option = routeOptions.find((routeOption) => routeOption.joRouteId === id);
                                            const stationId = option?.workCenterIds?.[0] || route.work_center_id;
                                            const station = workCenters.find((workCenter) => Number(workCenter.work_center_id) === Number(stationId));
                                            return (
                                                <SelectItem key={id} value={String(id)}>
                                                    Step {route.sequence_order} · {route.name} · {station?.work_center_name || (stationId ? `Work Center #${stationId}` : "Unassigned")}
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                                {selectedRoute && (
                                    <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                                        <ArrowRight className="h-3.5 w-3.5 text-primary" />
                                        Starting {selectedRoute.name} at {selectedRoute.work_center_name || (selectedRoute.work_center_id ? `Work Center #${selectedRoute.work_center_id}` : "the assigned workstation")}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                    </div>

                    {/* Summary & Start Button Action Strip */}
                    <div className="p-4 bg-gradient-to-r from-card via-card to-muted/20 border border-border/80 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-xl">
                                <Radio className="h-5 w-5 animate-pulse" />
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block font-mono">
                                    Station Start Ready Status
                                </span>
                                <span className="font-extrabold text-sm text-foreground">
                                    {selectedWc && selectedJo 
                                        ? `Ready to launch ${selectedJo.job_order_no || selectedJo.jo_id}${selectedRoute ? ` · Step ${selectedRoute.sequence_order}` : ""} on ${selectedWc.work_center_name}`
                                        : "Scan or select both Work Center Station and Job Order to proceed"}
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Button
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                className="h-11 text-xs font-semibold px-4 w-1/2 sm:w-auto"
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={handleExecuteStationStart}
                                disabled={isSubmitting || (!selectedWc && !scannedWcBarcode) || (!selectedJo && !scannedJoBarcode) || (Boolean(selectedJo) && selectedJoRoutes.length > 1 && !selectedRouteId) || (Boolean(selectedJo) && !loadingWc && workCenters.length === 0)}
                                className="h-11 text-xs font-extrabold px-6 bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-500/20 w-1/2 sm:w-auto"
                            >
                                {isSubmitting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting Station...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="mr-2 h-4 w-4" /> Start Station Run (WIP)
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
        </>
    );
}
