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
    Minimize2
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { JobOrder, WorkCenter, StationScanResponse } from "../types";
import { scanStationStart, fetchWorkCenters } from "../services/production-api";
import { toast } from "sonner";

interface StationStartScannerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    jobOrders: JobOrder[];
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
    onStationStarted
}: StationStartScannerProps) {
    const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
    const [loadingWc, setLoadingWc] = useState(false);

    // Scanned values
    const [scannedWcBarcode, setScannedWcBarcode] = useState("");
    const [scannedJoBarcode, setScannedJoBarcode] = useState("");
    const [selectedWc, setSelectedWc] = useState<WorkCenter | null>(null);
    const [selectedJo, setSelectedJo] = useState<JobOrder | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [scanResult, setScanResult] = useState<StationScanResponse | null>(null);

    const wcInputRef = useRef<HTMLInputElement>(null);
    const joInputRef = useRef<HTMLInputElement>(null);

    // Load work centers on open
    useEffect(() => {
        if (open) {
            setLoadingWc(true);
            setScanResult(null);
            setScannedWcBarcode("");
            setScannedJoBarcode("");
            setSelectedWc(null);
            setSelectedJo(null);

            fetchWorkCenters()
                .then((data) => setWorkCenters(data))
                .catch((err) => toast.error(err.message || "Failed to load work centers"))
                .finally(() => {
                    setLoadingWc(false);
                    setTimeout(() => wcInputRef.current?.focus(), 150);
                });
        }
    }, [open]);

    // Handle Work Center Barcode Enter
    const handleWcBarcodeSubmit = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const code = scannedWcBarcode.trim();
        if (!code) return;

        const matched = workCenters.find((w) => {
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
            setSelectedWc(matched);
            playSuccessBeep();
            toast.success(`Work Center matched: ${matched.work_center_name}`);
            setTimeout(() => joInputRef.current?.focus(), 100);
        } else {
            toast.error(`Work Center barcode "${code}" not recognized.`);
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
            setSelectedJo(matched);
            playSuccessBeep();
            toast.success(`Job Order matched: ${matched.job_order_no || matched.jo_id}`);
        } else {
            toast.error(`Job Order barcode "${code}" not recognized.`);
        }
    };

    // Trigger Final Station Start Execution
    const handleExecuteStationStart = async () => {
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
                jobOrderId: selectedJo?.order_id || selectedJo?.job_order_id
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
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[96vw] md:w-full md:max-w-[1100px] max-h-[94vh] flex flex-col bg-background border border-border/80 shadow-2xl rounded-2xl p-0 overflow-hidden">
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

                    {/* Dual Scan Inputs Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                    Scan station asset tag, RFID, or tap a station below
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
                                            Quick Touch Station Select:
                                        </span>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                                            {loadingWc ? (
                                                <div className="col-span-3 py-4 text-center text-xs text-muted-foreground">
                                                    <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" /> Loading stations...
                                                </div>
                                            ) : workCenters.map((wc) => (
                                                <button
                                                    key={wc.work_center_id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedWc(wc);
                                                        setScannedWcBarcode(wc.barcode || `WC-${wc.work_center_id}`);
                                                        playSuccessBeep();
                                                        setTimeout(() => joInputRef.current?.focus(), 100);
                                                    }}
                                                    className="p-2 text-left bg-background border border-border/80 hover:border-primary hover:bg-primary/5 rounded-xl transition-all text-xs flex flex-col justify-between"
                                                >
                                                    <span className="font-bold text-[11px] truncate block text-foreground">
                                                        {wc.work_center_name}
                                                    </span>
                                                    <span className="font-mono text-[9px] text-muted-foreground">
                                                        {wc.barcode || `WC-${wc.work_center_id}`}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
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
                                    Scan traveller barcode, batch sheet, or tap a released job below
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
                                                    {selectedJo.status}
                                                </Badge>
                                            </div>
                                            <span className="text-[10px] text-muted-foreground block truncate max-w-[260px]">
                                                {selectedJo.product_name} • Qty: {selectedJo.quantity.toLocaleString()} pcs
                                            </span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="xs"
                                            onClick={() => {
                                                setSelectedJo(null);
                                                setScannedJoBarcode("");
                                            }}
                                            className="h-7 text-xs text-muted-foreground hover:text-red-500"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        <span className="text-[9px] font-bold text-muted-foreground uppercase font-mono block">
                                            Active Queue Fast Select:
                                        </span>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
                                            {jobOrders.slice(0, 8).map((jo) => (
                                                <button
                                                    key={jo.jo_id}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedJo(jo);
                                                        setScannedJoBarcode(jo.job_order_no || jo.jo_id);
                                                        playSuccessBeep();
                                                    }}
                                                    className="p-2 text-left bg-background border border-border/80 hover:border-primary hover:bg-primary/5 rounded-xl transition-all text-xs flex flex-col justify-between"
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-mono font-bold text-[11px] text-foreground">
                                                            {jo.job_order_no || jo.jo_id}
                                                        </span>
                                                        <span className="text-[9px] text-muted-foreground font-semibold">
                                                            {jo.status}
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
                                        ? `Ready to launch ${selectedJo.job_order_no || selectedJo.jo_id} on ${selectedWc.work_center_name}`
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
                                disabled={isSubmitting || (!selectedWc && !scannedWcBarcode) || (!selectedJo && !scannedJoBarcode)}
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
    );
}
