/* eslint-disable */
"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useProductionWorkflow } from "./hooks/useProductionWorkflow";
import { ReleasedJobQueue } from "./components/ReleasedJobQueue";
import { RouteExecutionTable } from "./components/RouteExecutionTable";
import { JobOrderProgressSummary } from "./components/JobOrderProgressSummary";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { JobOrderShiftLogModal } from "./components/JobOrderShiftLogModal";
import { DailyYieldAuditDialog } from "../manufacturing-job-order-inspection-qa/components/DailyYieldAuditDialog";
import { useDailyYieldAudit } from "../manufacturing-job-order-inspection-qa/hooks/useDailyYieldAudit";
import { hasCompletedTimer } from "./operator-time";
import { RouteWorkstationAssignmentDialog } from "./components/RouteWorkstationAssignmentDialog";
import { GenealogyAuditModal } from "./components/GenealogyAuditModal";
import { StatusHistoryModal } from "./components/StatusHistoryModal";
import { JobOrderCancellationModal } from "./components/JobOrderCancellationModal";
import { JobOrderWorkflowActionModal, type ProductionWorkflowAction } from "./components/JobOrderWorkflowActionModal";
import { isCancellableJobOrderStatus, isJobOrderStatus, JOB_ORDER_STATUS } from "../job-order-status";
import { resolveJobOrderJourney } from "../shared/job-order-journey";
import { hasReachedProductionTarget } from "./utils/production-output";
import { JobOrderJourneyBar } from "../shared/components/JobOrderJourneyBar";
import { JobOrderStatusBadge } from "../shared/components/JobOrderStatusBadge";
import { NextStepCallout } from "../shared/components/NextStepCallout";
import { StatusLegendPopover } from "../shared/components/StatusLegendPopover";
import { formatProductionQuantity, resolveJobOrderTargetQuantity } from "./utils/production-quantity";
import { areJobOrderMaterialsFullyStaged } from "./utils/material-staging-readiness";
import { isManufacturingEvidenceVideo } from "./services/production-yield-image";

export default function ProductionWorkflowModule() {
    const router = useRouter();
    const {
        users,
        selectedJobOrderId,
        setSelectedJobOrderId,
        selectedTaskId,
        setSelectedTaskId,
        routeOperators,
        clockedInCount,
        refreshOperators,
        loadingJobs,
        refreshingJobs,
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
        selectedJobOrderError,
        retrySelectedJobOrderDetails,
        sortedTasks,
        jobOrderMaterials,
        jobOrderMaterialsJobOrderId,
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
        handleCancellationModalOpenChange,
        jobOrderActionLocked,
        cancellationMode,
        cancellationPreview,
        loadingCancellation,
        submittingCancellation,
        refreshingCancellation,
        cancellationMutationSucceeded,
        cancellationError,
        openCancellationModal,
        retryCancellationPreview,
        retryCancellationRefresh,
        handleConfirmCancellation,
        workflowSubmitting,
        handleStartProduction,
        handleWorkflowAction
    } = useProductionWorkflow();

    const hasCompletedJobOrderTimer = routeOperators.some((operator) =>
        !operator.is_placeholder && hasCompletedTimer(operator.started_at, operator.stopped_at)
    );
    const hasActiveJobOrderTimer = routeOperators.some((operator) =>
        !operator.is_placeholder && Boolean(operator.started_at) && !operator.stopped_at
    );

    const [progressOutput, setProgressOutput] = useState<{ jobOrderId: number; producedQuantity: number } | null>(null);
    const selectedJobOrderNumericId = Number(selectedJobOrder?.order_id || selectedJobOrder?.job_order_id || 0);
    const selectedJobOrderHasFullStaging = Boolean(selectedJobOrderNumericId)
        && !loadingJobOrderMaterials
        && jobOrderMaterialsJobOrderId === selectedJobOrderNumericId
        && areJobOrderMaterialsFullyStaged(jobOrderMaterials);
    const selectedProductionOutput = (progressOutput?.jobOrderId === selectedJobOrderNumericId
        ? progressOutput.producedQuantity
        : null)
        ?? selectedJobOrder?.producedQty
        ?? selectedJobOrder?.completed_quantity
        ?? selectedJobOrder?.productionOutputQuantity
        ?? 0;
    const selectedJobOrderTarget = resolveJobOrderTargetQuantity(selectedJobOrder);
    const handleProgressOutputChange = React.useCallback((jobOrderId: number, producedQuantity: number) => {
        setProgressOutput({ jobOrderId, producedQuantity });
    }, []);

    // UI state
    const [isShiftLogOpen, setIsShiftLogOpen] = useState(false);
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

    const selectedJobOrderStatus = selectedJobOrder ? selectedJobOrder.status : null;
    const allRoutesCompleted = sortedTasks.length > 0
        && sortedTasks.every((task) => ["completed", "done", "closed"].includes(String(task.status || "").trim().toLowerCase()));
    const selectedJobOrderOutputTargetReached = hasReachedProductionTarget(selectedJobOrderTarget, selectedProductionOutput);
    const isSelectedJobOrderCancelled = isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.CANCELLED);
    const isSelectedJobOrderCancellable = isCancellableJobOrderStatus(selectedJobOrderStatus);
    const isSelectedJobOrderHeld = isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.ON_HOLD, JOB_ORDER_STATUS.QA_HOLD);
    const resumeUnavailableMachineTask = sortedTasks.find((task) =>
        ["under maintenance", "bad", "discontinued"].includes(
            String(task.work_center?.asset?.condition || "").trim().toLowerCase()
        )
    );
    const isSelectedJobOrderProductionCompleted = isJobOrderStatus(
        selectedJobOrderStatus,
        JOB_ORDER_STATUS.PRODUCTION_COMPLETED,
        JOB_ORDER_STATUS.FOR_QA_RECONCILIATION,
        JOB_ORDER_STATUS.CLOSED
    );
    const isProductionReadOnly = isSelectedJobOrderCancelled || isSelectedJobOrderHeld || isSelectedJobOrderProductionCompleted;
    const canReturnProductionMaterials = isProductionReadOnly;
    const canStartSelectedJobOrder = isJobOrderStatus(
        selectedJobOrderStatus,
        JOB_ORDER_STATUS.PICKED
    ) && selectedJobOrderHasFullStaging;
    const selectedJobOrderJourney = selectedJobOrder
        ? resolveJobOrderJourney({
            status: selectedJobOrderStatus,
            allMaterialsStaged: selectedJobOrderHasFullStaging
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

    const handleJourneyAction = () => {
        if (onBenchNextAction) {
            if (hasCompletedJobOrderTimer) setIsShiftLogOpen(true);
            return;
        }
        if (!selectedJobOrder) return;
        if (selectedJobOrderJourney?.stage === "materials") {
            const jobOrderNo = selectedJobOrder.job_order_no || selectedJobOrder.jo_id;
            router.push(`/mm/material-staging?jo=${encodeURIComponent(jobOrderNo)}`);
            return;
        }
        if (selectedJobOrderJourney?.stage === "ready") {
            void handleStartProduction();
        }
    };

    const operationProgress = React.useMemo(() => {
        let completed = 0;
        let total = 0;
        inProductionJobOrders.forEach((jo) => {
            const tasks = jo.routing_tasks || jo.routingTasks || [];
            tasks.forEach((t) => {
                total++;
                if (["completed", "done", "closed"].includes(String(t.status || "").trim().toLowerCase())) completed++;
            });
        });
        return { completed, total };
    }, [inProductionJobOrders]);

    const parentJoNo = selectedJobOrder?.parent_job_order_no || null;

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
                            disabled={loadingJobs || refreshingJobs}
                            onClick={() => {
                                fetchJobs(selectedJobOrderId);
                                refreshOperators();
                            }}
                            className="h-10 text-xs font-bold shadow-sm bg-background border-input hover:bg-accent"
                        >
                            <RefreshCw className={`mr-2 h-4 w-4 ${refreshingJobs ? "animate-spin" : ""}`} aria-hidden="true" />
                            {refreshingJobs ? "Updating Terminal…" : "Reload Terminal"}
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
                {/* In-Production Job Orders Card */}
                <div className="flex items-center justify-between p-5 bg-gradient-to-br from-card to-muted/20 border rounded-2xl shadow-sm hover:shadow-md transition-all duration-200" title="Job Orders currently in production on this terminal.">
                    <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">In-Production Job Orders</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold tracking-tight text-foreground">{inProductionJobOrders.length}</span>
                        </div>
                    </div>
                    <div className="p-3 bg-primary/10 text-primary rounded-xl">
                        <ClipboardCheck className="h-6 w-6 stroke-1.5" />
                    </div>
                </div>

                {/* Clocked-in Operators Card */}
                <div className="flex items-center justify-between p-5 bg-gradient-to-br from-card to-muted/20 border rounded-2xl shadow-sm hover:shadow-md transition-all duration-200" title="Operators with a running shift timer anywhere on the floor (refreshes every 10 seconds while this page is visible).">
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
                            <span className="text-2xl font-bold tracking-tight text-foreground">{operationProgress.completed}</span>
                            <span className="text-xs text-muted-foreground">of {operationProgress.total} steps</span>
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
                    selectedJobOrderId={selectedJobOrderId}
                    setSelectedJobOrderId={setSelectedJobOrderId}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    loadingJobs={loadingJobs}
                    refreshingJobs={refreshingJobs}
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
                open={selectedJobOrderId !== ""}
                onOpenChange={(open) => {
                    if (!open && !jobOrderActionLocked) {
                        setSelectedJobOrderId("");
                        setSelectedTaskId(null);
                    }
                }}
            >
                <DialogContent className="w-[calc(100vw-1rem)] !max-w-[calc(100vw-1rem)] max-h-[96vh] h-[95vh] flex flex-col bg-background border border-border/80 shadow-2xl rounded-2xl p-0 overflow-hidden">
                    {!selectedJobOrder ? (
                        selectedJobOrderError ? (
                            <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center" role="alert" aria-live="polite">
                                <DialogHeader className="items-center">
                                    <DialogTitle>Job Order unavailable</DialogTitle>
                                    <DialogDescription>{selectedJobOrderError}</DialogDescription>
                                </DialogHeader>
                                <Button type="button" onClick={retrySelectedJobOrderDetails}>
                                    Retry
                                </Button>
                            </div>
                        ) : (
                            <div className="flex h-full min-h-0 flex-col" role="status" aria-label="Loading selected Job Order details" aria-busy="true">
                                <DialogHeader className="sr-only">
                                    <DialogTitle>Loading Job Order</DialogTitle>
                                    <DialogDescription>Loading the selected Job Order details...</DialogDescription>
                                </DialogHeader>
                                <div aria-hidden="true" className="shrink-0 border-b border-border/50 bg-gradient-to-r from-primary/10 via-primary/5 to-background p-4 sm:p-5">
                                    <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                                        <div className="min-w-0 flex-1 space-y-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Skeleton className="h-5 w-48 rounded-full" />
                                                <Skeleton className="h-5 w-20 rounded-full" />
                                            </div>
                                            <Skeleton className="h-8 w-56 max-w-full" />
                                            <Skeleton className="h-4 w-3/4 max-w-full" />
                                            <div className="flex items-center gap-2 pt-1">
                                                {Array.from({ length: 7 }).map((_, index) => (
                                                    <Skeleton key={`journey-${index}`} className="h-2.5 w-2.5 shrink-0 rounded-full" />
                                                ))}
                                                <Skeleton className="ml-2 h-3 w-28" />
                                            </div>
                                        </div>
                                        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                                            {Array.from({ length: 3 }).map((_, index) => (
                                                <Skeleton key={`action-${index}`} className="h-10 w-32 max-w-full" />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div aria-hidden="true" className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-muted/5 p-4 sm:p-5">
                                    <Skeleton className="h-20 w-full rounded-xl" />
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {Array.from({ length: 3 }).map((_, index) => (
                                            <div key={`summary-${index}`} className="space-y-3 rounded-xl border border-border bg-card p-4">
                                                <Skeleton className="h-3 w-2/3" />
                                                <Skeleton className="h-7 w-1/3" />
                                                <Skeleton className="h-3 w-1/2" />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                                        <div className="flex items-center justify-between gap-3">
                                            <Skeleton className="h-5 w-48 max-w-full" />
                                            <Skeleton className="h-5 w-24 rounded-full" />
                                        </div>
                                        {Array.from({ length: 3 }).map((_, index) => (
                                            <div key={`progress-${index}`} className="grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-4">
                                                {Array.from({ length: 4 }).map((__, cellIndex) => (
                                                    <Skeleton key={`progress-${index}-${cellIndex}`} className="h-5 w-full" />
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="space-y-3">
                                        <Skeleton className="h-5 w-56 max-w-full" />
                                        {Array.from({ length: 3 }).map((_, index) => (
                                            <div key={`route-${index}`} className="space-y-4 rounded-xl border border-border bg-card p-4">
                                                <div className="flex items-center justify-between gap-3">
                                                    <Skeleton className="h-5 w-40 max-w-full" />
                                                    <Skeleton className="h-5 w-28 rounded-full" />
                                                </div>
                                                <Skeleton className="h-4 w-2/3 max-w-full" />
                                                <div className="grid gap-3 sm:grid-cols-2">
                                                    <Skeleton className="h-16 w-full" />
                                                    <Skeleton className="h-16 w-full" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )
                    ) : (
                    <>
                    {/* Header */}
                    <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-background p-4 sm:p-5 border-b border-border/50 shrink-0">
                        <div className="flex flex-col items-start justify-between gap-4 xl:flex-row xl:items-center">
                            <div className="min-w-0 space-y-1 xl:max-w-[38%]">
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
                                    Product: <strong className="text-foreground">{selectedJobOrder?.product_name}</strong> • Target: {formatProductionQuantity(selectedJobOrderTarget)} {selectedJobOrder?.uom_shortcut || "pcs"} • Produced: <span className="font-mono font-bold text-emerald-600">{formatProductionQuantity(selectedProductionOutput)} {selectedJobOrder?.uom_shortcut || "pcs"}</span>
                                </DialogDescription>
                                {selectedJobOrderJourney && (
                                    <JobOrderJourneyBar journey={selectedJobOrderJourney} compact className="pt-2" />
                                )}
                            </div>
                            
                            {/* Status-driven primary action, followed by grouped supporting actions. */}
                            <fieldset
                                disabled={jobOrderActionLocked}
                                aria-busy={jobOrderActionLocked}
                                aria-label="Job Order actions"
                                className="m-0 grid w-full min-w-0 grid-cols-1 gap-3 border-0 p-0 sm:grid-cols-2 xl:flex xl:flex-1 xl:flex-wrap xl:items-start xl:justify-start xl:gap-x-3 xl:gap-y-2"
                            >
                                {(isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.DRAFT)
                                    || isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.FOR_PICKING)
                                    || isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.PICKED)
                                    || isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.IN_PRODUCTION)
                                    || isSelectedJobOrderHeld) && (
                                    <div role="group" aria-label="Next action" className="flex min-w-0 flex-col gap-1.5">
                                        <span className="px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Next action</span>
                                        {isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.DRAFT) ? (
                                            <Button
                                                onClick={handleReleaseDraftJO}
                                                disabled={releasingDraft}
                                                className="h-10 bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-500"
                                            >
                                                <ClipboardCheck className="mr-1.5 h-4 w-4" /> {releasingDraft ? "Initializing..." : "Initialize Job Order"}
                                            </Button>
                                        ) : isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.FOR_PICKING) ? (
                                            <Button
                                                onClick={handleJourneyAction}
                                                disabled={Boolean(selectedJobOrderJourney?.blockers.length || selectedJobOrderJourney?.nextAction?.blockedReason)}
                                                title={selectedJobOrderJourney?.nextAction?.blockedReason || selectedJobOrderJourney?.blockers[0]}
                                                className="h-10 bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
                                            >
                                                <ClipboardCheck className="mr-1.5 h-4 w-4" /> {selectedJobOrderJourney?.nextAction?.label || "Stage Materials"}
                                            </Button>
                                        ) : isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.PICKED) ? (
                                            <Button
                                                onClick={() => void handleStartProduction()}
                                                disabled={workflowSubmitting || !canStartSelectedJobOrder || jobOrderActionLocked}
                                                title={canStartSelectedJobOrder ? undefined : loadingJobOrderMaterials
                                                    ? "Checking material staging status."
                                                    : "Stage all required materials before starting production."}
                                                className="h-10 bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
                                            >
                                                <Play className="mr-1.5 h-4 w-4" /> {workflowSubmitting ? "Starting Production..." : "Start Production"}
                                            </Button>
                                        ) : isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.IN_PRODUCTION) ? (
                                            <div className="flex flex-wrap items-center gap-2">
                                                <Button
                                                    onClick={() => setIsShiftLogOpen(true)}
                                                    disabled={!hasCompletedJobOrderTimer}
                                                    title={!hasCompletedJobOrderTimer ? "Complete at least one operator timer to enable this action." : undefined}
                                                    className="h-10 bg-primary px-4 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
                                                >
                                                    <ClipboardCheck className="mr-1.5 h-4 w-4" /> Log Shift Run
                                                </Button>
                                                {selectedJobOrderOutputTargetReached && (
                                                    <Button
                                                        disabled={!allRoutesCompleted || hasActiveJobOrderTimer || workflowSubmitting}
                                                        onClick={() => setWorkflowAction("complete-production")}
                                                        title={!allRoutesCompleted
                                                            ? "Stop active timers and complete every open route step before finalizing."
                                                            : hasActiveJobOrderTimer
                                                                ? "Stop all active operator timers before finalizing."
                                                                : "Send the completed production run to QA and reconciliation."}
                                                        className="h-10 bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-500"
                                                    >
                                                        <CheckCircle className="mr-1.5 h-4 w-4" /> Complete &amp; Close JO
                                                    </Button>
                                                )}
                                            </div>
                                        ) : isSelectedJobOrderHeld ? (
                                            <div className="flex flex-col items-start gap-1">
                                                <Button
                                                    size="sm"
                                                    onClick={() => setWorkflowAction("resume-production")}
                                                    disabled={Boolean(resumeUnavailableMachineTask) || workflowSubmitting}
                                                    title={resumeUnavailableMachineTask
                                                        ? `${resumeUnavailableMachineTask.work_center_name || "The assigned machine"} must be cleared and restored to Good before resuming.`
                                                        : undefined}
                                                    className="h-10 bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-emerald-500"
                                                >
                                                    <CheckCircle className="mr-1.5 h-4 w-4" /> Resume Production
                                                </Button>
                                                {resumeUnavailableMachineTask && (
                                                    <span className="max-w-xs px-1 text-[11px] text-amber-700 dark:text-amber-300">
                                                        Maintenance clearance and Good machine condition are required before resuming.
                                                    </span>
                                                )}
                                            </div>
                                        ) : null}
                                    </div>
                                )}

                                <div role="group" aria-label="Review" className="flex min-w-0 flex-col gap-1.5">
                                    <span className="px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Review</span>
                                    <div className="flex flex-wrap items-center gap-2">
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
                                    </div>
                                </div>

                                {(isJobOrderStatus(
                                    selectedJobOrderStatus,
                                    JOB_ORDER_STATUS.FOR_PICKING,
                                    JOB_ORDER_STATUS.PICKED,
                                    JOB_ORDER_STATUS.IN_PRODUCTION
                                ) && sortedTasks.length > 1 && sortedTasks.some((task) => !task.status || task.status === "Pending"))
                                    || isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.IN_PRODUCTION) ? (
                                    <div role="group" aria-label="Workflow tools" className="flex min-w-0 flex-col gap-1.5">
                                        <span className="px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Workflow tools</span>
                                        <div className="flex flex-wrap items-center gap-2">
                                            {isJobOrderStatus(
                                                selectedJobOrderStatus,
                                                JOB_ORDER_STATUS.FOR_PICKING,
                                                JOB_ORDER_STATUS.PICKED,
                                                JOB_ORDER_STATUS.IN_PRODUCTION
                                            ) && sortedTasks.length > 1 && sortedTasks.some((task) => !task.status || task.status === "Pending") && (
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setIsRouteAssignmentOpen(true)}
                                                    className="h-10 border-primary/40 px-3 text-xs font-bold text-primary shadow-sm hover:bg-primary/10"
                                                >
                                                    <GitBranch className="mr-1.5 h-4 w-4" /> Assign Workstations per Route
                                                </Button>
                                            )}
                                            {isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.IN_PRODUCTION) && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setWorkflowAction("place-on-hold")}
                                                    className="h-10 text-xs font-bold border-amber-500/40 text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                                                >
                                                    <PauseCircle className="mr-1.5 h-4 w-4" /> Place on Hold
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ) : null}

                                {(isSelectedJobOrderCancellable || canReturnProductionMaterials
                                    || isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.IN_PRODUCTION)
                                    || isSelectedJobOrderHeld) && (
                                    <div role="group" aria-label="Exception actions" className="flex min-w-0 flex-col gap-1.5">
                                        <span className="px-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Exception actions</span>
                                        <div className="flex flex-wrap items-center gap-2">
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
                                            {isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.IN_PRODUCTION, JOB_ORDER_STATUS.ON_HOLD, JOB_ORDER_STATUS.QA_HOLD) && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setWorkflowAction("terminate-production")}
                                                    className="h-10 text-xs font-bold border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                                >
                                                    <XCircle className="mr-1.5 h-4 w-4" /> Terminate
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </fieldset>
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
                        {selectedJobOrderOutputTargetReached && isJobOrderStatus(selectedJobOrderStatus, JOB_ORDER_STATUS.IN_PRODUCTION) && (
                            <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>
                                    Good-output target reached. Production can continue while this Job Order remains In Production. Log actual output, including any over-production; excess good output is shown as a QA variance and remaining quantity stays at zero.
                                </span>
                            </div>
                        )}
                        {selectedJobOrder?.termination_image_url && (
                            <div className="flex flex-col gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs sm:flex-row sm:items-center">
                                {isManufacturingEvidenceVideo(selectedJobOrder.termination_image_mime_type, selectedJobOrder.termination_image_file_name) ? (
                                    <video
                                        src={selectedJobOrder.termination_image_url}
                                        controls
                                        playsInline
                                        preload="metadata"
                                        aria-label={selectedJobOrder.termination_image_file_name || "Job Order termination evidence video"}
                                        className="max-h-48 w-full max-w-sm rounded-lg border border-destructive/20 bg-black"
                                    />
                                ) : (
                                    <img
                                        src={selectedJobOrder.termination_image_url}
                                        alt="Job Order termination evidence"
                                        className="h-24 w-24 rounded-lg border border-destructive/20 object-cover"
                                    />
                                )}
                                <div className="space-y-1">
                                    <p className="flex items-center gap-1.5 font-bold text-destructive">
                                        <ImagePlus className="h-4 w-4" /> Termination Evidence
                                    </p>
                                    <p className="text-muted-foreground">
                                        This evidence was attached when production was terminated for this Job Order.
                                    </p>
                                </div>
                            </div>
                        )}
                        {!isSelectedJobOrderCancelled && selectedCalloutAction && (
                            <NextStepCallout
                                action={selectedCalloutAction}
                                blockers={selectedJobOrderJourney?.blockers || []}
                                title="What's next"
                            />
                        )}
                        {isSelectedJobOrderHeld && !isSelectedJobOrderCancelled && (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400">
                                <span className="flex items-start gap-2">
                                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                    This Job Order is on hold. Resolve the issue and record resolution remarks before continuing production.
                                </span>
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
                                readOnly={isProductionReadOnly || jobOrderActionLocked}
                            />
                        )}
                    </div>
                    </>
                    )}
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
                            Confirm that this route is finished. Active operator timers on this step will be stopped automatically. QA-required routes use the same completion confirmation and do not open a separate QA Gate.
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
                onOpenChange={handleCancellationModalOpenChange}
                mode={cancellationMode}
                preview={cancellationPreview}
                loading={loadingCancellation}
                submitting={submittingCancellation}
                refreshing={refreshingCancellation}
                mutationSucceeded={cancellationMutationSucceeded}
                error={cancellationError}
                onRetryPreview={retryCancellationPreview}
                onRetryRefresh={() => void retryCancellationRefresh()}
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
