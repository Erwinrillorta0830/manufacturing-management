/* eslint-disable */
"use client";

import React, { useState } from "react";
import { 
    RefreshCw, 
    ClipboardCheck, 
    Users, 
    CheckCircle2, 
    Scan, 
    GitBranch, 
    History, 
    Maximize2, 
    Minimize2,
    Layers,
    Play,
    Building2,
    CheckCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProductionWorkflow } from "./hooks/useProductionWorkflow";
import { ReleasedJobQueue } from "./components/ReleasedJobQueue";
import { RoutingSequence } from "./components/RoutingSequence";
import OperatorPanel from "./components/OperatorPanel";
import { OperationStepTracker } from "./components/OperationStepTracker";
import { QAChecklistModal } from "./components/QAChecklistModal";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { JobOrderShiftLogModal } from "./components/JobOrderShiftLogModal";
import { StationStartScanner } from "./components/StationStartScanner";
import { GenealogyAuditModal } from "./components/GenealogyAuditModal";
import { StatusHistoryModal } from "./components/StatusHistoryModal";
import { StationScanResponse } from "./types";
import { toast } from "sonner";

export default function ProductionWorkflowModule() {
    const {
        jobOrders,
        users,
        selectedJobOrderId,
        setSelectedJobOrderId,
        selectedTaskId,
        setSelectedTaskId,
        routeOperators,
        operatorsSummary,
        loadingJobs,
        loadingOperators,
        searchQuery,
        setSearchQuery,
        statusFilter,
        setStatusFilter,
        selectedAssigneeId,
        setSelectedAssigneeId,
        manualHours,
        setManualHours,
        activeManualUserId,
        setActiveManualUserId,
        qaModalOpen,
        setQaModalOpen,
        qaTemplate,
        qaParameters,
        qaValues,
        setQaValues,
        qaInspectorId,
        setQaInspectorId,
        qaYieldQty,
        setQaYieldQty,
        qaComments,
        setQaComments,
        submittingQA,
        selectedJobOrder,
        sortedTasks,
        activeStep,
        selectedTask,
        fetchJobs,
        handleAddOperator,
        handleRemoveOperator,
        handleStartTimer,
        handleStopTimer,
        handleSaveManualHours,
        handleCompleteStepClick,
        handleSubmitQA,
        filteredJobOrders,
        branches,
        selectedBranchFilter,
        setSelectedBranchFilter,
        releasingDraft,
        handleReleaseDraftJO
    } = useProductionWorkflow();

    // UI state
    const [clockedInCount, setClockedInCount] = React.useState(0);
    const [isShiftLogOpen, setIsShiftLogOpen] = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [isGenealogyOpen, setIsGenealogyOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [isKioskMode, setIsKioskMode] = useState(false);
    const [viewMode, setViewMode] = useState<"queue" | "tracker">("queue");

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
        return jobOrders.filter((jo) => jo.status === "Proceed" || jo.status === "Ongoing" || jo.status === "In Progress").length;
    }, [jobOrders]);

    const totalRuns = jobOrders.length;

    const completedWorkstations = React.useMemo(() => {
        let count = 0;
        jobOrders.forEach((jo) => {
            const tasks = jo.routing_tasks || jo.routingTasks || [];
            tasks.forEach((t) => {
                if (t.status === "Completed") {
                    count++;
                }
            });
        });
        return count;
    }, [jobOrders]);

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
                                Shop Floor Terminal Active
                            </span>
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                            Shop Floor Execution Terminal
                        </h1>
                        <p className="text-xs sm:text-sm text-muted-foreground max-w-xl">
                            Ruggedized touch-friendly interface for station check-in, real-time operation tracking, point-of-use backflushing, and QA gates.
                        </p>
                    </div>

                    {/* Quick Touch Action Buttons */}
                    <div className="flex flex-wrap gap-2 w-full md:w-auto shrink-0">
                        <Button 
                            onClick={() => setIsScannerOpen(true)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold shadow-md shadow-emerald-500/20 h-10 text-xs px-4"
                        >
                            <Scan className="mr-2 h-4 w-4" /> Station Start Scanner
                        </Button>
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
                <div className="flex items-center justify-between p-5 bg-gradient-to-br from-card to-muted/20 border rounded-2xl shadow-sm hover:shadow-md transition-all duration-200">
                    <div className="space-y-1">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active WIP Runs</span>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold tracking-tight text-foreground">{activeRuns}</span>
                            <span className="text-xs text-muted-foreground">/ {totalRuns} Job Orders</span>
                        </div>
                    </div>
                    <div className="p-3 bg-primary/10 text-primary rounded-xl">
                        <ClipboardCheck className="h-6 w-6 stroke-1.5" />
                    </div>
                </div>

                {/* Clocked-in Operators Card */}
                <div className="flex items-center justify-between p-5 bg-gradient-to-br from-card to-muted/20 border rounded-2xl shadow-sm hover:shadow-md transition-all duration-200">
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
                <div className="flex items-center justify-between p-5 bg-gradient-to-br from-card to-muted/20 border rounded-2xl shadow-sm hover:shadow-md transition-all duration-200">
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
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    loadingJobs={loadingJobs}
                    branches={branches}
                    selectedBranchFilter={selectedBranchFilter}
                    setSelectedBranchFilter={setSelectedBranchFilter}
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
                <DialogContent className="w-[98vw] md:w-full md:max-w-[1200px] lg:max-w-[1400px] xl:max-w-[1600px] max-h-[96vh] md:max-h-[92vh] h-[95vh] md:h-[92vh] flex flex-col bg-background border border-border/80 shadow-2xl rounded-2xl p-0 overflow-hidden">
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
                                    <Badge variant="outline" className="text-[10px] font-mono font-bold">
                                        Status: {selectedJobOrder?.status}
                                    </Badge>
                                </div>
                                <DialogTitle className="font-extrabold text-lg sm:text-2xl tracking-tight text-foreground mt-1">
                                    {selectedJobOrder?.order_no || `JO #${selectedJobOrder?.jo_id}`}
                                </DialogTitle>
                                <DialogDescription className="text-muted-foreground text-xs sm:text-sm font-medium truncate sm:whitespace-normal">
                                    Product: <strong className="text-foreground">{selectedJobOrder?.product_name}</strong> • Target: {selectedJobOrder?.quantity.toLocaleString()} pcs • Produced: <span className="font-mono font-bold text-emerald-600">{selectedJobOrder?.producedQty || selectedJobOrder?.completed_quantity || 0} pcs</span>
                                </DialogDescription>
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
                                {selectedJobOrder?.status === "Draft" ? (
                                    <Button
                                        onClick={handleReleaseDraftJO}
                                        disabled={releasingDraft}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-10 text-xs px-5 shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all duration-200 flex items-center"
                                    >
                                        <ClipboardCheck className="mr-1.5 h-4.5 w-4.5" /> {releasingDraft ? "Releasing..." : "Release Job Order"}
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={() => setIsShiftLogOpen(true)}
                                        className="bg-primary hover:bg-primary/95 text-white font-bold h-10 text-xs px-5 shadow-md shadow-primary/10 hover:shadow-primary/20 transition-all duration-200 flex items-center"
                                    >
                                        <ClipboardCheck className="mr-1.5 h-4.5 w-4.5" /> End-of-Shift / Step Progress
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Integrated Horizontal Step Navigator */}
                        <div className="border-t border-border/40 pt-3 mt-3">
                            <RoutingSequence
                                sortedTasks={sortedTasks}
                                selectedTaskId={selectedTaskId}
                                setSelectedTaskId={setSelectedTaskId}
                                routeOperators={routeOperators}
                            />
                        </div>
                    </div>

                    {/* Scrollable Workspace Body */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6 min-h-0 bg-muted/5">
                        {/* Operation Step Tracker Section */}
                        {selectedJobOrder && (
                            <OperationStepTracker
                                sortedTasks={sortedTasks}
                                selectedTaskId={selectedTaskId}
                                setSelectedTaskId={setSelectedTaskId}
                                selectedJobOrder={selectedJobOrder}
                                routeOperators={routeOperators}
                                users={users}
                                onOpenShiftLogModal={() => setIsShiftLogOpen(true)}
                                onOpenQAModal={(taskId) => handleCompleteStepClick(taskId)}
                            />
                        )}

                        {/* Selected Workstation Operator Panel */}
                        <div className="space-y-4">
                            {(() => {
                                const activeTask = sortedTasks.find((t) => t.id === selectedTaskId) || sortedTasks[0];
                                if (!activeTask) return null;
                                return (
                                    <OperatorPanel
                                        key={activeTask.id}
                                        selectedTask={activeTask}
                                        activeStep={activeStep}
                                        selectedJobOrder={selectedJobOrder!}
                                        sortedTasks={sortedTasks}
                                        users={users}
                                        routeOperators={routeOperators.filter((op) => op.task_id === activeTask.id)}
                                        loadingOperators={loadingOperators}
                                        handleAddOperator={handleAddOperator}
                                        handleRemoveOperator={handleRemoveOperator}
                                        handleStartTimer={handleStartTimer}
                                        handleStopTimer={handleStopTimer}
                                        handleSaveManualHours={handleSaveManualHours}
                                        handleCompleteStepClick={handleCompleteStepClick}
                                    />
                                );
                            })()}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* --- STATION START SCANNER MODAL --- */}
            <StationStartScanner
                open={isScannerOpen}
                onOpenChange={setIsScannerOpen}
                jobOrders={jobOrders}
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
                    activeStep={activeStep}
                    users={users}
                    allJobOperators={routeOperators}
                    onSuccess={() => fetchJobs(selectedJobOrderId)}
                />
            )}

            {/* --- QA GATE CHECKLIST MODAL DIALOG --- */}
            <QAChecklistModal
                qaModalOpen={qaModalOpen}
                setQaModalOpen={setQaModalOpen}
                selectedTask={selectedTask}
                selectedJobOrder={selectedJobOrder!}
                users={users}
                routeOperators={routeOperators}
                qaTemplate={qaTemplate}
                qaParameters={qaParameters}
                qaValues={qaValues}
                setQaValues={setQaValues}
                qaInspectorId={qaInspectorId}
                setQaInspectorId={setQaInspectorId}
                qaYieldQty={qaYieldQty}
                setQaYieldQty={setQaYieldQty}
                qaComments={qaComments}
                setQaComments={setQaComments}
                submittingQA={submittingQA}
                handleSubmitQA={handleSubmitQA}
            />

        </div>
    );
}
