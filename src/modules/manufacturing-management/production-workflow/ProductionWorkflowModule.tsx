/* eslint-disable */
"use client";

import React, { useState } from "react";
import { 
    RefreshCw, 
    ClipboardCheck, 
    Users, 
    CheckCircle2, 
    GitBranch, 
    History, 
    Maximize2, 
    Minimize2,
    Layers,
    Play,
    Building2,
    CheckCircle,
    XCircle,
    Undo2,
    AlertTriangle,
    PauseCircle,
    ImagePlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { useProductionWorkflow } from "./hooks/useProductionWorkflow";
import { ReleasedJobQueue } from "./components/ReleasedJobQueue";
import { RouteExecutionTable } from "./components/RouteExecutionTable";
import { JobOrderProgressSummary } from "./components/JobOrderProgressSummary";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { JobOrderShiftLogModal } from "./components/JobOrderShiftLogModal";
import { DailyYieldAuditDialog } from "../manufacturing-job-order-inspection-qa/components/DailyYieldAuditDialog";
import { useDailyYieldAudit } from "../manufacturing-job-order-inspection-qa/hooks/useDailyYieldAudit";
import { hasCompletedTimer } from "./operator-time";
import { StationStartScanner } from "./components/StationStartScanner";
import { RouteWorkstationAssignmentDialog } from "./components/RouteWorkstationAssignmentDialog";
import { GenealogyAuditModal } from "./components/GenealogyAuditModal";
import { StatusHistoryModal } from "./components/StatusHistoryModal";
import { JobOrderCancellationModal } from "./components/JobOrderCancellationModal";
import { JobOrderWorkflowActionModal, type ProductionWorkflowAction } from "./components/JobOrderWorkflowActionModal";
import { StationScanResponse } from "./types";
import { isCancellableJobOrderStatus, isJobOrderStatus, JOB_ORDER_STATUS } from "../job-order-status";
import { resolveJobOrderJourney } from "../shared/job-order-journey";
import { JobOrderJourneyBar } from "../shared/components/JobOrderJourneyBar";
import { JobOrderStatusBadge } from "../shared/components/JobOrderStatusBadge";
import { NextStepCallout } from "../shared/components/NextStepCallout";
import { StatusLegendPopover } from "../shared/components/StatusLegendPopover";
import { formatProductionQuantity, resolveJobOrderTargetQuantity } from "./utils/production-quantity";

export default function ProductionWorkflowModule() {
    const {
        jobOrders,
        users,
        selectedJobOrderId,
        setSelectedJobOrderId,
        selectedTaskId,
        setSelectedTaskId,
        routeOperators,
        loadingJobs,
        loadingOperators,
        pendingTimerKey,
        searchQuery,
        setSearchQuery,
        inProductionJobOrders,
        selectedAssigneeId,
        setSelectedAssigneeId,
        manualHours,
        setManualHours,
        activeManualUserId,
        setActiveManualUserId,
        selectedJobOrder,
        sortedTasks,
        jobOrderMaterials,
        loadingJobOrderMaterials,
        fetchJobs,
        handleAddOperator,
        handleRemoveOperator,
        handleSwapOperator,
        handleStartTimer,
        handleStopTimer,
        handleSaveOperatorTimes,
        completeRouteStep,
        filteredJobOrders,
        branches,
        selectedBranchFilter,
        setSelectedBranchFilter,
        selectedProductFilter,
        setSelectedProductFilter,
        selectedCustomerFilter,
        setSelectedCustomerFilter,
        selectedStatusFilter,
        setSelectedStatusFilter,
        productFilterOptions,
        customerFilterOptions,
        statusFilterOptions,
        hasActiveFilters,
        clearFilters,
        releasingDraft,
        handleReleaseDraftJO,
        cancellationModalOpen,
        setCancellationModalOpen,
        cancellationMode,
        cancellationPreview,
        loadingCancellation,
        submittingCancellation,
        cancellationError,
        openCancellationModal,
        handleConfirmCancellation,
        workflowSubmitting,
        handleWorkflowAction
    } = useProductionWorkflow();

    const hasCompletedJobOrderTimer = routeOperators.some((operator) =>
        !operator.is_placeholder && hasCompletedTimer(operator.started_at, operator.stopped_at)
    );

    const [progressOutput, setProgressOutput] = useState<{ jobOrderId: number; producedQuantity: number } | null>(null);
    const selectedJobOrderNumericId = Number(selectedJobOrder?.order_id || selectedJobOrder?.job_order_id || 0);
    const selectedProductionOutput = (progressOutput?.jobOrderId === selectedJobOrderNumericId
        ? progressOutput.producedQuantity
        : null)
        ?? selectedJobOrder?.productionOutputQuantity
        ?? selectedJobOrder?.producedQty
        ?? selectedJobOrder?.completed_quantity
        ?? 0;
    const selectedJobOrderTarget = resolveJobOrderTargetQuantity(selectedJobOrder);
    const handleProgressOutputChange = React.useCallback((jobOrderId: number, producedQuantity: number) => {
        setProgressOutput({ jobOrderId, producedQuantity });
    }, []);

    // UI state
    const [clockedInCount, setClockedInCount] = React.useState(0);
    const [isShiftLogOpen, setIsShiftLogOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [scannerJobOrder, setScannerJobOrder] = useState<any | null>(null);
    const [isRouteAssignmentOpen, setIsRouteAssignmentOpen] = useState(false);
    const [isGenealogyOpen, setIsGenealogyOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isKioskMode, setIsKioskMode] = useState(false);
    const [workflowAction, setWorkflowAction] = useState<ProductionWorkflowAction | null>(null);
    const [completionTaskId, setCompletionTaskId] = useState<number | null>(null);
    const [completingStepId, setCompletingStepId] = useState<number | null>(null);

    const completionTask = sortedTasks.find((task) => task.id === completionTaskId) || null;

    const handleRequestCompleteStep = (taskId: number) => {
        if (isProductionReadOnly) return;
        const task = sortedTasks.find((item) => item.id === taskId);
        if (!task || String(task.status || "").trim().toLowerCase() === "completed") return;
        setSelectedTaskId(taskId);
        setCompletionTaskId(taskId);
    };

    const handleConfirmCompleteStep = async () => {
        if (completionTaskId === null) return;
        setCompletingStepId(completionTaskId);
        try {
            const completed = await completeRouteStep(completionTaskId);
            if (completed) setCompletionTaskId(null);
        } finally {
            setCompletingStepId(null);
        }
    };

    const handleAuditSaved = React.useCallback(async () => {
        await fetchJobs(selectedJobOrderId, true);
    }, [fetchJobs, selectedJobOrderId]);

    const dailyYieldAuditState = useDailyYieldAudit({ onSaved: handleAuditSaved });

    const isMountedRef = React.useRef(true);

    const fetchClockedIn = React.useCallback(async () => {
        try {
            const res = await fetch("/api/manufacturing/production/route-operators?activeOnly=true");
            if (res.ok && isMountedRef.current) {
                const json = await res.json();
                const active = (json.data || []).filter((r: any) => r.started_at !== null && r.stopped_at === null);
                const uniqueUsers = new Set(active.map((r: any) => r.user_id));
                setClockedInCount(uniqueUsers.size);
            }
        } catch (err) {
            console.error("Error loading active operators count:", err);
        }
    }, []);

    React.useEffect(() => {
        isMountedRef.current = true;
        fetchClockedIn();
        const interval = setInterval(fetchClockedIn, 10000);
        return () => {
            isMountedRef.current = false;
            clearInterval(interval);
        };
    }, [fetchClockedIn]);

    const activeRuns = React.useMemo(() => {
        return inProductionJobOrders.length;
    }, [inProductionJobOrders]);

    const totalRuns = inProductionJobOrders.length;
    const selectedJobOrderStatus = selectedJobOrder ? selectedJobOrder.status : null;
    const allRoutesCompleted = sortedTasks.length > 0
        && sortedTasks.every((task) => String(task.status || "").trim().toLowerCase() === "completed");
    const isSelectedJobOrderCancelled = isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.CANCELLED);
    const isSelectedJobOrderCancellable = isCancellableJobOrderStatus(selectedJobOrderStatus);
    const isSelectedJobOrderHeld = isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.ON_HOLD, JOB_ORDER_STATUS.QA_HOLD);
    const isSelectedJobOrderProductionCompleted = isJobOrderStatus(
        selectedJobOrderStatus,
        JOB_ORDER_STATUS.PRODUCTION_COMPLETED,
        JOB_ORDER_STATUS.FOR_QA_RECONCILIATION,
        JOB_ORDER_STATUS.CLOSED
    );
    const isProductionReadOnly = isSelectedJobOrderCancelled || isSelectedJobOrderHeld || isSelectedJobOrderProductionCompleted;
    const canReturnProductionMaterials = isProductionReadOnly;
    const selectedJobOrderJourney = selectedJobOrder
        ? resolveJobOrderJourney({
            status: selectedJobOrderStatus,
            allMaterialsStaged: isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.RESERVED),
            jobOrderNo: selectedJobOrder.jo_id
        })
        : null;

    // Production-stage next actions stay in this page instead of deep-linking
    // back to the same route.
    const onBenchNextAction = isJobOrderStatus(
        selectedJobOrderStatus,
        JOB_ORDER_STATUS.IN_PRODUCTION
    )
        ? {
            label: "Log shift run",
            description: "Record this session's output, traceability details, and exact WIP consumption."
        }
        : null;
    const selectedCalloutAction = onBenchNextAction || selectedJobOrderJourney?.nextAction || null;

    const completedWorkstations = React.useMemo(() => {
        let count = 0;
        inProductionJobOrders.forEach((jo) => {
            const tasks = jo.routing_tasks || jo.routingTasks || [];
            tasks.forEach((t) => {
                if (t.status === "Completed") {
                    count++;
                }
            });
        });
        return count;
    }, [inProductionJobOrders]);

    const parentJo = selectedJobOrder?.parentJobOrderId ? jobOrders.find((j) => Number(j.order_id) === Number(selectedJobOrder.parentJobOrderId)) : null;
    const parentJoNo = parentJo?.jo_id || null;

    // Station Scan callback
    const handleStationStarted = (response: StationScanResponse) => {
        if (response.jobOrder) {
            const targetJoId = response.jobOrder.job_order_no || response.jobOrder.jo_id;
            setSelectedJobOrderId(targetJoId);
            if (response.activeOperation) {
                setSelectedTaskId(response.activeOperation.id ?? response.activeOperation.jo_route_id ?? null);
            }
        }
        fetchJobs(response.jobOrder ? (response.jobOrder.job_order_no || response.jobOrder.jo_id) : undefined);
        fetchClockedIn();
    };

    const openStationScanner = (jobOrder?: any | null) => {
        setScannerJobOrder(jobOrder || null);
        setIsScannerOpen(true);
    };

    return (
        <div className={`flex flex-col space-y-6 max-w-7xl mx-auto p-1 sm:p-2 transition-all ${isKioskMode ? "fixed inset-0 z-50 bg-background p-4 overflow-y-auto max-w-none" : ""}`}>
            
            {/* Header Toolbar */}
            <div className="relative overflow-hidden bg-gradient-to-br from-card via-card to-muted/30 p-5 sm:p-6 rounded-2xl border shadow-md transition-all duration-300">
                <div className="absolute -right-16 -top-16 w-36 h-36 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                
                <div className="flex flex-col md:flex-row gap-6 justify-between items-start md:items-center relative z-10">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2.5">
                            <div className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                            </div>
                            <span className="text-xs font-semibold tracking-wider uppercase text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                                Shop Floor Execution Terminal Active
                            </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                            Shop Floor Execution Terminal
                        </h1>
                        <p className="text-xs sm:text-sm text-muted-foreground max-w-xl">
                            Ruggedized touch-friendly interface for station check-in, real-time operation tracking, exact WIP consumption, and QA gates.
                        </p>
                    </div>

                    {/* Quick Touch Action Buttons */}
                    <div className="flex flex-wrap gap-2 w-full md:w-auto shrink-0">
                        <StatusLegendPopover />
                        <Button 
                            variant="outline" 
                            size="default" 
                            onClick={() => {
                                fetchJobs(selectedJobOrderId);
                                fetchClockedIn();
                            }}
                            className="h-10 text-xs font-bold shadow-sm bg-background border-input hover:bg-accent"
                        >
                            <RefreshCw className="mr-2 h-4 w-4" /> Reload Terminal
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setIsKioskMode(!isKioskMode)}
                            title={isKioskMode ? "Exit Kiosk Fullscreen" : "Enter Kiosk Fullscreen"}
                            className="h-10 w-10 text-muted-foreground hover:text-foreground hidden sm:flex"
                        >
                            {isKioskMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Live Metrics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Active Runs Card */}
                <div className="flex items-center justify-between p-5 bg-gradient-to-br from-card to-muted/20 border rounded-2xl shadow-sm hover:shadow-md transition-all duration-200" title="In-Production Job Orders currently loaded in this terminal.">
                    <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active WIP Runs</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold tracking-tight text-foreground">{activeRuns}</span>
                            <span className="text-xs text-muted-foreground">/ {totalRuns} In Production JOs</span>
                        </div>
                    </div>
                    <div className="p-3 bg-primary/10 text-primary rounded-xl">
                        <ClipboardCheck className="h-6 w-6 stroke-1.5" />
                    </div>
                </div>

                {/* Clocked-in Operators Card */}
                <div className="flex items-center justify-between p-5 bg-gradient-to-br from-card to-muted/20 border rounded-2xl shadow-sm hover:shadow-md transition-all duration-200" title="Operators with a running shift timer anywhere on the floor (refreshes every 10 seconds).">
                    <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Clocked-in Operators</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold tracking-tight text-foreground">{clockedInCount}</span>
                            <span className="text-xs text-muted-foreground">active on floor</span>
                        </div>
                    </div>
                    <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-xl">
                        <Users className="h-6 w-6 stroke-1.5" />
                    </div>
                </div>

                {/* Completed Workstations Card */}
                <div className="flex items-center justify-between p-5 bg-gradient-to-br from-card to-muted/20 border rounded-2xl shadow-sm hover:shadow-md transition-all duration-200" title="Routing steps marked Completed across In-Production Job Orders loaded in this terminal.">
                    <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Completed Operations</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold tracking-tight text-foreground">{completedWorkstations}</span>
                            <span className="text-xs text-muted-foreground">steps completed</span>
                        </div>
                    </div>
                    <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl">
                        <CheckCircle2 className="h-6 w-6 stroke-1.5" />
                    </div>
                </div>
            </div>

            {/* Main Terminal Workspace Layout */}
            <div className="w-full">
                <ReleasedJobQueue
                    filteredJobOrders={filteredJobOrders}
                    jobOrders={jobOrders}
                    selectedJobOrderId={selectedJobOrderId}
                    setSelectedJobOrderId={setSelectedJobOrderId}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    loadingJobs={loadingJobs}
                    branches={branches}
                    selectedBranchFilter={selectedBranchFilter}
                    setSelectedBranchFilter={setSelectedBranchFilter}
                    productFilter={selectedProductFilter}
                    setProductFilter={setSelectedProductFilter}
                    productOptions={productFilterOptions}
                    customerFilter={selectedCustomerFilter}
                    setCustomerFilter={setSelectedCustomerFilter}
                    customerOptions={customerFilterOptions}
                    statusFilter={selectedStatusFilter}
                    setStatusFilter={setSelectedStatusFilter}
                    statusOptions={statusFilterOptions}
                    hasActiveFilters={hasActiveFilters}
                    onClearFilters={clearFilters}
                />
            </div>

            {/* Focused Full-Featured Job Order Details Modal */}
            <Dialog 
                open={selectedJobOrderId !== "" && selectedJobOrder !== null} 
                onOpenChange={(open) => {
                    if (!open) {
                        setSelectedJobOrderId("");
                        setSelectedTaskId(null);
                    }
                }}
            >
                <DialogContent className="w-[calc(100vw-1rem)] !max-w-[calc(100vw-1rem)] max-h-[96vh] h-[95vh] flex flex-col bg-background border border-border/80 shadow-2xl rounded-2xl p-0 overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-background p-4 sm:p-5 border-b border-border/50 shrink-0">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                                        Job Order Execution Terminal
                                    </span>
                                    {parentJoNo && (
                                        <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full font-bold border border-amber-500/20 shrink-0">
                                            Sub-assembly (Parent: {parentJoNo})
                                        </span>
                                    )}
                                    <JobOrderStatusBadge
                                        status={selectedJobOrderStatus}
                                        className="text-[10px] font-mono font-bold"
                                    />
                                </div>
                                <DialogTitle className="font-extrabold text-lg sm:text-2xl tracking-tight text-foreground mt-1">
                                    {selectedJobOrder?.order_no || `JO #${selectedJobOrder?.jo_id}`}
                                </DialogTitle>
                                <DialogDescription className="text-muted-foreground text-xs sm:text-sm font-medium truncate sm:whitespace-normal">
                                    Product: <strong className="text-foreground">{selectedJobOrder?.product_name}</strong> • Target: {formatProductionQuantity(selectedJobOrderTarget)} {selectedJobOrder?.uom_shortcut || "pcs"} • Produced: <span className="font-mono font-bold text-emerald-600">{formatProductionQuantity(selectedProductionOutput)} {selectedJobOrder?.uom_shortcut || "pcs"}</span> • Workstation: <strong className={selectedJobOrder?.primary_work_center_id ? "text-foreground" : "text-amber-600 dark:text-amber-400"}>{selectedJobOrder?.primary_work_center_name || (selectedJobOrder?.primary_work_center_id ? `WC #${selectedJobOrder.primary_work_center_id}` : "Unassigned")}</strong>
                                </DialogDescription>
                                {selectedJobOrderJourney && (
                                    <JobOrderJourneyBar journey={selectedJobOrderJourney} compact className="pt-2" />
                                )}
                            </div>
                            
                            {/* Action Buttons strip */}
                            <div className="flex flex-wrap items-center gap-2 shrink-0 sm:pr-10 sm:mr-2 w-full sm:w-auto justify-end sm:justify-start">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsHistoryOpen(true)}
                                    className="h-10 text-xs font-bold border-border shadow-sm"
                                >
                                    <History className="mr-1.5 h-4 w-4 text-primary" /> Status History
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsGenealogyOpen(true)}
                                    className="h-10 text-xs font-bold border-border shadow-sm"
                                >
                                    <GitBranch className="mr-1.5 h-4 w-4 text-primary" /> Genealogy Audit
                                </Button>
                                {isSelectedJobOrderCancellable && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openCancellationModal("cancel")}
                                        className="h-10 text-xs font-bold border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    >
                                        <XCircle className="mr-1.5 h-4 w-4" /> Cancel Job Order
                                    </Button>
                                )}
                                {canReturnProductionMaterials && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openCancellationModal("return")}
                                        className="h-10 text-xs font-bold border-amber-500/40 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600"
                                    >
                                        <Undo2 className="mr-1.5 h-4 w-4" /> Return Raw Materials
                                    </Button>
                                )}
                                {isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.PICKED) && !selectedJobOrder?.primary_work_center_id && (
                                    <Button
                                        onClick={() => openStationScanner(selectedJobOrder)}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-10 text-xs px-5 shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all duration-200 flex items-center"
                                    >
                                        <Building2 className="mr-1.5 h-4 w-4" /> Start Production
                                    </Button>
                                )}
                                {isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.IN_PRODUCTION)
                                    && sortedTasks.length > 1
                                    && sortedTasks.some((task) => !task.status || task.status === "Pending") && (
                                    <Button
                                        variant="outline"
                                        onClick={() => setIsRouteAssignmentOpen(true)}
                                        className="border-primary/40 text-primary hover:bg-primary/10 font-bold h-10 text-xs px-5 shadow-sm transition-all duration-200 flex items-center"
                                    >
                                        <GitBranch className="mr-1.5 h-4 w-4" /> Assign Workstations per Route
                                    </Button>
                                )}
                                {isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.DRAFT) ? (
                                    <Button
                                        onClick={handleReleaseDraftJO}
                                        disabled={releasingDraft}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-10 text-xs px-5 shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all duration-200 flex items-center"
                                    >
                                        <ClipboardCheck className="mr-1.5 h-4.5 w-4.5" /> {releasingDraft ? "Initializing..." : "Initialize Job Order"}
                                    </Button>
                                ) : isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.IN_PRODUCTION) ? (
                                    <>
                                        <Button
                                            onClick={() => setIsShiftLogOpen(true)}
                                            disabled={!hasCompletedJobOrderTimer}
                                            title={!hasCompletedJobOrderTimer ? "Complete at least one operator timer to enable this action." : undefined}
                                            className="bg-primary hover:bg-primary/95 text-white font-bold h-10 text-xs px-5 shadow-md shadow-primary/10 hover:shadow-primary/20 transition-all duration-200 flex items-center"
                                        >
                                            <ClipboardCheck className="mr-1.5 h-4.5 w-4.5" /> End-of-Shift / Step Progress
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setWorkflowAction("place-on-hold")}
                                            className="h-10 text-xs font-bold border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                                        >
                                            <PauseCircle className="mr-1.5 h-4 w-4" /> Place on Hold
                                        </Button>
                                        {allRoutesCompleted && (
                                            <Button
                                                size="sm"
                                                onClick={() => setWorkflowAction("complete-production")}
                                                className="h-10 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                                            >
                                                <CheckCircle className="mr-1.5 h-4 w-4" /> Complete Production
                                            </Button>
                                        )}
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setWorkflowAction("terminate-production")}
                                            className="h-10 text-xs font-bold border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        >
                                            <XCircle className="mr-1.5 h-4 w-4" /> Terminate
                                        </Button>
                                    </>
                                ) : isSelectedJobOrderHeld ? (
                                    <>
                                        <Button
                                            size="sm"
                                            onClick={() => setWorkflowAction("resume-production")}
                                            className="h-10 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white"
                                        >
                                            <CheckCircle className="mr-1.5 h-4 w-4" /> Resume Production
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setWorkflowAction("terminate-production")}
                                            className="h-10 text-xs font-bold border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                        >
                                            <XCircle className="mr-1.5 h-4 w-4" /> Terminate
                                        </Button>
                                    </>
                                ) : null}
                            </div>
                        </div>

                    </div>

                    {/* Scrollable Workspace Body */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6 min-h-0 bg-muted/5">
                        {isSelectedJobOrderCancelled && (
                            <div className="flex items-start gap-2 p-3 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-xs font-semibold">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>This Job Order is cancelled. Station, operator, QA, and shift-run actions are disabled. Use "Return Raw Materials" for any outstanding floor stock.</span>
                            </div>
                        )}
                        {selectedJobOrder?.termination_image_url && (
                            <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs sm:flex-row sm:items-center">
                                <img
                                    src={selectedJobOrder.termination_image_url}
                                    alt="Job Order termination evidence"
                                    className="h-24 w-24 rounded-lg border border-destructive/20 object-cover"
                                />
                                <div className="space-y-1">
                                    <p className="flex items-center gap-1.5 font-bold text-destructive">
                                        <ImagePlus className="h-4 w-4" /> Termination Evidence
                                    </p>
                                    <p className="text-muted-foreground">
                                        This image was attached when production was terminated for this Job Order.
                                    </p>
                                </div>
                            </div>
                        )}
                        {!isSelectedJobOrderCancelled && selectedCalloutAction && (
                            <NextStepCallout
                                action={selectedCalloutAction}
                                blockers={selectedJobOrderJourney?.blockers || []}
                                title="What's next"
                                onAction={onBenchNextAction && hasCompletedJobOrderTimer ? () => setIsShiftLogOpen(true) : undefined}
                            />
                        )}
                        {isSelectedJobOrderHeld && !isSelectedJobOrderCancelled && (
                            <div className="flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400 sm:flex-row sm:items-center sm:justify-between">
                                <span className="flex items-start gap-2">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    This Job Order is on hold. Resolve the issue and record resolution remarks before continuing production.
                                </span>
                                <div className="flex items-center gap-2 shrink-0">
                                    <Button size="sm" variant="outline" onClick={() => setWorkflowAction("resume-production")} className="h-8 border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400">
                                        Resume Production
                                    </Button>
                                    <Button asChild size="sm" variant="outline" className="h-8 border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400">
                                        <Link href={`/mm/manufacturing-qa?jo=${encodeURIComponent(selectedJobOrder?.jo_id || "")}`}>
                                            Open QA Console
                                        </Link>
                                    </Button>
                                </div>
                            </div>
                        )}
                        {/* Job Order progress summary above the operation tracker */}
                        {selectedJobOrder && (
                            <JobOrderProgressSummary
                                jobOrder={selectedJobOrder}
                                onProducedQuantityChange={handleProgressOutputChange}
                            />
                        )}

                        {selectedJobOrder && (
                            <RouteExecutionTable
                                sortedTasks={sortedTasks}
                                selectedTaskId={selectedTaskId}
                                setSelectedTaskId={setSelectedTaskId}
                                selectedJobOrder={selectedJobOrder}
                                jobOrderMaterials={jobOrderMaterials}
                                loadingJobOrderMaterials={loadingJobOrderMaterials}
                                routeOperators={routeOperators}
                                users={users}
                                loadingOperators={loadingOperators}
                                pendingTimerKey={pendingTimerKey}
                                handleAddOperator={handleAddOperator}
                                handleRemoveOperator={handleRemoveOperator}
                                handleSwapOperator={handleSwapOperator}
                                handleStartTimer={handleStartTimer}
                                handleStopTimer={handleStopTimer}
                                handleSaveOperatorTimes={handleSaveOperatorTimes}
                                onBreakdownSaved={() => {
                                    void fetchJobs(selectedJobOrderId, true);
                                }}
                                onRequestCompleteStep={handleRequestCompleteStep}
                                readOnly={isProductionReadOnly}
                            />
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <Dialog
                open={completionTask !== null}
                onOpenChange={(open) => {
                    if (!open && completingStepId === null) setCompletionTaskId(null);
                }}
            >
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <CheckCircle className="h-5 w-5 text-emerald-600" />
                            Complete route step?
                        </DialogTitle>
                        <DialogDescription>
                            Confirm that this route is finished. QA-required routes use the same completion confirmation and do not open a separate QA Gate.
                        </DialogDescription>
                    </DialogHeader>
                    {completionTask && (
                        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                            <p className="font-semibold text-foreground">
                                Route {completionTask.sequence_order}: {completionTask.name}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {completionTask.work_center_name || "Workstation not assigned"}
                            </p>
                        </div>
                    )}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setCompletionTaskId(null)}
                            disabled={completingStepId !== null}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            onClick={() => void handleConfirmCompleteStep()}
                            disabled={completingStepId !== null}
                            className="bg-emerald-600 text-white hover:bg-emerald-500"
                        >
                            {completingStepId !== null ? "Completing..." : "Complete Step"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {selectedJobOrder && (
                <RouteWorkstationAssignmentDialog
                    open={isRouteAssignmentOpen}
                    onOpenChange={setIsRouteAssignmentOpen}
                    jobOrder={selectedJobOrder}
                    onSaved={() => {
                        void fetchJobs(selectedJobOrder.jo_id, true);
                    }}
                />
            )}

            {/* --- STATION START SCANNER MODAL --- */}
            <StationStartScanner
                open={isScannerOpen}
                onOpenChange={(open) => {
                    setIsScannerOpen(open);
                    if (!open) setScannerJobOrder(null);
                }}
                jobOrders={jobOrders}
                initialJobOrder={scannerJobOrder}
                onStationStarted={handleStationStarted}
            />

            {/* --- MATERIAL GENEALOGY & BACKFLUSHING AUDIT MODAL --- */}
            {selectedJobOrder && (
                <GenealogyAuditModal
                    open={isGenealogyOpen}
                    onOpenChange={setIsGenealogyOpen}
                    selectedJobOrder={selectedJobOrder}
                />
            )}

            {/* --- STATUS HISTORY AUDIT TIMELINE MODAL --- */}
            {selectedJobOrder && (
                <StatusHistoryModal
                    open={isHistoryOpen}
                    onOpenChange={setIsHistoryOpen}
                    selectedJobOrder={selectedJobOrder}
                />
            )}

            {/* --- JOB ORDER LEVEL SHIFT RUN & BACKFLUSHING MODAL --- */}
            {selectedJobOrder && (
                <JobOrderShiftLogModal
                    open={isShiftLogOpen}
                    onOpenChange={setIsShiftLogOpen}
                    selectedJobOrder={selectedJobOrder!}
                    sortedTasks={sortedTasks}
                    users={users}
                    allJobOperators={routeOperators.filter((operator) => !operator.is_placeholder)}
                    onSuccess={() => fetchJobs(selectedJobOrderId)}
                />
            )}

            {/* --- IN-PROCESS DAILY YIELD QA AUDIT MODAL --- */}
            <DailyYieldAuditDialog controller={dailyYieldAuditState} />

            {/* --- JOB ORDER CANCELLATION / RAW MATERIAL RETURN MODAL --- */}
            <JobOrderCancellationModal
                open={cancellationModalOpen}
                onOpenChange={setCancellationModalOpen}
                mode={cancellationMode}
                preview={cancellationPreview}
                loading={loadingCancellation}
                submitting={submittingCancellation}
                error={cancellationError}
                onConfirm={handleConfirmCancellation}
            />

            <JobOrderWorkflowActionModal
                key={workflowAction ?? "closed"}
                open={workflowAction !== null}
                onOpenChange={(open) => {
                    if (!open) setWorkflowAction(null);
                }}
                action={workflowAction}
                loading={workflowSubmitting}
                onSubmit={(input) => workflowAction
                    ? handleWorkflowAction(workflowAction, input)
                    : Promise.resolve(false)}
            />

        </div>
    );
}
