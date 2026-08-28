/* eslint-disable */
"use client";

import React from "react";
import { 
    RefreshCw, 
    ArrowRight, 
    BadgeAlert,
    Forklift, 
    FileText, 
    ClipboardCheck, 
    CheckCircle2, 
    RotateCcw,
    Printer,
    Sparkles,
    ShieldCheck,
    History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
    Tabs, 
    TabsContent, 
    TabsList, 
    TabsTrigger 
} from "@/components/ui/tabs";
import { useManufacturingQA } from "./hooks/useManufacturingQA";
import { JobOrderQAInspectionQueue } from "./components/JobOrderQAInspectionQueue";
import { QAInspectionLogsTable } from "./components/QAInspectionLogsTable";
import { TwoPointQAInspectionModal } from "./components/TwoPointQAInspectionModal";
import { JobOrderStatusHistoryModal } from "./components/JobOrderStatusHistoryModal";
import { QuarantineHolds } from "./components/QuarantineHolds";
import { YieldClosingQueue } from "./components/YieldClosingQueue";
import { CheckpointLogsTable } from "./components/CheckpointLogsTable";
import { YieldClosingDialog } from "./components/YieldClosingDialog";
import { OverrideDialog } from "./components/OverrideDialog";
import { DailyQAQueue } from "./components/DailyQAQueue";
import { FinalQAReleases } from "./components/FinalQAReleases";
import { ClosedQAQueue } from "./components/ClosedQAQueue";

export default function ManufacturingQAModule() {
    const {
        // Tab State
        activeTab,
        setActiveTab,

        // Core Data
        jobOrders,
        rejectionReasons,
        inspectionLogs,
        qaLogs,
        dispositions,
        loadingJobOrders,
        loadingInspectionLogs,
        loadingDispositions,
        loadingLogs,
        actionLoading,

        // Search & Filtered Views
        logSearch,
        setLogSearch,
        logStatusFilter,
        setLogStatusFilter,
        joSearch,
        setJoSearch,
        filteredQALogs,
        pendingHolds,
        activeJobOrders,
        closedJobOrders,

        // 2-Point QA Inspection Modal
        selectedQAJobOrder,
        isQAInspectionModalOpen,
        handleOpenQAInspectionModal,
        handleCloseQAInspectionModal,
        handleSubmitTwoPointInspection,

        // Status History Modal
        selectedStatusHistoryJO,
        isStatusHistoryModalOpen,
        handleOpenStatusHistoryModal,
        handleCloseStatusHistoryModal,

        // Yield Closing Dialog
        selectedJO,
        isYieldDialogOpen,
        setIsYieldDialogOpen,
        yieldQty,
        setYieldQty,
        lotNumber,
        setLotNumber,
        manufacturingDate,
        setManufacturingDate,
        expiryDate,
        setExpiryDate,
        unitCost,
        setUnitCost,
        yieldMaterialsLoading,
        yieldMaterialsError,
        handleRetryYieldMaterials,
        handleOpenYieldDialog,
        handleSubmitYieldClosing,
        handleReprintReceipt,

        // Supervisor Override Dialog
        selectedDisp,
        isOverrideDialogOpen,
        setIsOverrideDialogOpen,
        overrideDecision,
        setOverrideDecision,
        overrideComments,
        setOverrideComments,
        handleOpenOverrideDialog,
        handleSubmitOverride,

        // Daily Yield QA
        yieldLedger,
        dailyInspections,
        loadingDailyQA,
        isDailyAuditOpen,
        setIsDailyAuditOpen,
        selectedLedgerEntry,
        moisturePct,
        setMoisturePct,
        acidityPh,
        setAcidityPh,
        sensoryStatus,
        setSensoryStatus,
        weightCheckPassed,
        setWeightCheckPassed,
        dailyLabStatus,
        setDailyLabStatus,
        dailyActionTaken,
        setDailyActionTaken,
        dailyRemarks,
        setDailyRemarks,
        handleOpenDailyAuditDialog,
        handleSubmitDailyAudit,
        selectedRouteId,
        setSelectedRouteId,
        routes,
        qaTemplates,
        qaParamValues,
        setQaParamValues,

        // Final QA
        finalReleases,
        lots,
        lotsProducts,
        loadingFinalQA,
        isFinalReleaseOpen,
        setIsFinalReleaseOpen,
        selectedLot,
        inspectedQty,
        setInspectedQty,
        defectQty,
        setDefectQty,
        microbiologicalStatus,
        setMicrobiologicalStatus,
        packagingSealPassed,
        setPackagingSealPassed,
        labelCompliancePassed,
        setLabelCompliancePassed,
        overallDisposition,
        setOverallDisposition,
        coaRefNo,
        setCoaRefNo,
        finalRemarks,
        setFinalRemarks,
        handleOpenFinalReleaseDialog,
        handleSubmitFinalRelease,
        isFinalQAAuditOpen,
        setIsFinalQAAuditOpen,
        selectedFinalQAAudit,
        loadingFinalQAAudit,
        finalQAAuditError,
        handleOpenFinalQAAudit,
        handlePrintFinalQACoa,
        coaPrintLoading,

        // General
        refreshAll,
        isRefreshing,
        getBranchName
    } = useManufacturingQA();

    return (
        <div className="space-y-6">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
                        <ShieldCheck className="h-8 w-8 text-primary" />
                        Quality Assurance & Rework Console
                    </h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Execute 2-point QA inspections, trigger automated standalone rework orders, record permanent inspection audit logs, and release finished goods into inventory.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => { await refreshAll(false); }}
                        disabled={isRefreshing}
                        className="gap-1.5 text-xs font-semibold"
                    >
                        <RefreshCw className={isRefreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
                        {isRefreshing ? "Syncing..." : "Sync Console"}
                    </Button>
                </div>
            </div>

            {/* Quarantine/Active Holds Banner if any holds exist */}
            {pendingHolds.length > 0 && (
                <div className="relative overflow-hidden rounded-xl border border-destructive/30 bg-destructive/5 p-4 md:p-6 text-destructive-foreground flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm animate-in fade-in duration-300">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-destructive/15 rounded-lg text-destructive shrink-0 mt-0.5 md:mt-0">
                            <BadgeAlert className="h-6 w-6 animate-pulse" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-destructive flex items-center gap-2">
                                Active Quarantine Hold Detected
                                <Badge variant="destructive" className="animate-pulse">{pendingHolds.length} Pending</Badge>
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
                                Job Order routing steps have recorded critical limits failures. All subsequent execution holds are locked pending Supervisor overrides.
                            </p>
                        </div>
                    </div>
                    <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => setActiveTab("holds")}
                        className="gap-1.5 shrink-0 text-xs font-bold"
                    >
                        Resolve Holds
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {/* Main Tabs Dashboard */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1 h-auto p-1.5 bg-muted/60 rounded-xl border">
                    <TabsTrigger value="jo-inspection" className="text-xs font-bold gap-1.5 py-2">
                        <ClipboardCheck className="h-3.5 w-3.5" />
                        QA & Rework Entry
                    </TabsTrigger>

                    <TabsTrigger value="qa-inspection-logs" className="text-xs font-bold gap-1.5 py-2">
                        <FileText className="h-3.5 w-3.5" />
                        Inspection Logs
                        {inspectionLogs.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-1">
                                {inspectionLogs.length}
                            </Badge>
                        )}
                    </TabsTrigger>

                    <TabsTrigger value="closing" className="text-xs font-bold gap-1.5 py-2">
                        <Forklift className="h-3.5 w-3.5" />
                        Yield Closing
                    </TabsTrigger>

                    <TabsTrigger value="holds" className="text-xs font-bold gap-1.5 py-2">
                        <BadgeAlert className="h-3.5 w-3.5" />
                        Quarantine Holds
                        {pendingHolds.length > 0 && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0 ml-1">
                                {pendingHolds.length}
                            </Badge>
                        )}
                    </TabsTrigger>

                    <TabsTrigger value="daily-qa" className="text-xs font-bold gap-1.5 py-2">
                        <Sparkles className="h-3.5 w-3.5" />
                        Daily Yield QA
                    </TabsTrigger>

                    <TabsTrigger value="final-qa" className="text-xs font-bold gap-1.5 py-2">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Final QA Release
                    </TabsTrigger>

                    <TabsTrigger value="closed-qa" className="text-xs font-bold gap-1.5 py-2">
                        <Printer className="h-3.5 w-3.5" />
                        Closed Runs
                    </TabsTrigger>
                </TabsList>

                {/* TAB 1: Primary Module 4 Job Order QA & Rework Inspection Workcenter */}
                <TabsContent value="jo-inspection" className="space-y-4 outline-none">
                    <JobOrderQAInspectionQueue
                        jobOrders={jobOrders}
                        loadingJobOrders={loadingJobOrders}
                        getBranchName={getBranchName}
                        onOpenQAInspectionModal={handleOpenQAInspectionModal}
                        onOpenStatusHistoryModal={handleOpenStatusHistoryModal}
                        onRefresh={() => refreshAll(false)}
                    />
                </TabsContent>

                {/* TAB 2: Immutable QA Inspection Logs (qa_jo_inspection_logs) */}
                <TabsContent value="qa-inspection-logs" className="space-y-4 outline-none">
                    <QAInspectionLogsTable
                        logs={inspectionLogs}
                        rejectionReasons={rejectionReasons}
                        loadingLogs={loadingInspectionLogs}
                        onRefresh={() => refreshAll(false)}
                    />
                </TabsContent>

                {/* TAB 3: Yield Closing (Packaging & Ledger Receipting) */}
                <TabsContent value="closing" className="space-y-4 outline-none">
                    <YieldClosingQueue
                        loadingJobOrders={loadingJobOrders}
                        activeJobOrders={activeJobOrders}
                        joSearch={joSearch}
                        setJoSearch={setJoSearch}
                        getBranchName={getBranchName}
                        handleOpenYieldDialog={handleOpenYieldDialog}
                        pendingHolds={pendingHolds}
                    />
                </TabsContent>

                {/* TAB 4: Active Quarantine Holds */}
                <TabsContent value="holds" className="space-y-4 outline-none">
                    <QuarantineHolds
                        loadingDispositions={loadingDispositions}
                        pendingHolds={pendingHolds}
                        handleOpenOverrideDialog={handleOpenOverrideDialog}
                    />
                </TabsContent>

                {/* TAB 5: Daily Yield QA */}
                <TabsContent value="daily-qa" className="space-y-4 outline-none">
                    <DailyQAQueue
                        yieldLedger={yieldLedger}
                        dailyInspections={dailyInspections}
                        loadingDailyQA={loadingDailyQA}
                        isDailyAuditOpen={isDailyAuditOpen}
                        setIsDailyAuditOpen={setIsDailyAuditOpen}
                        selectedLedgerEntry={selectedLedgerEntry}
                        moisturePct={moisturePct}
                        setMoisturePct={setMoisturePct}
                        acidityPh={acidityPh}
                        setAcidityPh={setAcidityPh}
                        sensoryStatus={sensoryStatus}
                        setSensoryStatus={setSensoryStatus}
                        weightCheckPassed={weightCheckPassed}
                        setWeightCheckPassed={setWeightCheckPassed}
                        dailyLabStatus={dailyLabStatus}
                        setDailyLabStatus={setDailyLabStatus}
                        dailyActionTaken={dailyActionTaken}
                        setDailyActionTaken={setDailyActionTaken}
                        dailyRemarks={dailyRemarks}
                        setDailyRemarks={setDailyRemarks}
                        handleOpenDailyAuditDialog={handleOpenDailyAuditDialog}
                        handleSubmitDailyAudit={handleSubmitDailyAudit}
                        actionLoading={actionLoading}
                        qaLogs={qaLogs}
                        selectedRouteId={selectedRouteId}
                        setSelectedRouteId={setSelectedRouteId}
                        routes={routes}
                        jobOrders={jobOrders}
                        qaTemplates={qaTemplates}
                        qaParamValues={qaParamValues}
                        setQaParamValues={setQaParamValues}
                    />
                </TabsContent>

                {/* TAB 6: Final QA Release */}
                <TabsContent value="final-qa" className="space-y-4 outline-none">
                    <FinalQAReleases
                        lots={lots}
                        lotsProducts={lotsProducts}
                        finalReleases={finalReleases}
                        loadingFinalQA={loadingFinalQA}
                        isFinalReleaseOpen={isFinalReleaseOpen}
                        setIsFinalReleaseOpen={setIsFinalReleaseOpen}
                        selectedLot={selectedLot}
                        inspectedQty={inspectedQty}
                        setInspectedQty={setInspectedQty}
                        defectQty={defectQty}
                        setDefectQty={setDefectQty}
                        microbiologicalStatus={microbiologicalStatus}
                        setMicrobiologicalStatus={setMicrobiologicalStatus}
                        packagingSealPassed={packagingSealPassed}
                        setPackagingSealPassed={setPackagingSealPassed}
                        labelCompliancePassed={labelCompliancePassed}
                        setLabelCompliancePassed={setLabelCompliancePassed}
                        overallDisposition={overallDisposition}
                        setOverallDisposition={setOverallDisposition}
                        coaRefNo={coaRefNo}
                        setCoaRefNo={setCoaRefNo}
                        finalRemarks={finalRemarks}
                        setFinalRemarks={setFinalRemarks}
                        handleOpenFinalReleaseDialog={handleOpenFinalReleaseDialog}
                        handleSubmitFinalRelease={handleSubmitFinalRelease}
                        actionLoading={actionLoading}
                        isFinalQAAuditOpen={isFinalQAAuditOpen}
                        setIsFinalQAAuditOpen={setIsFinalQAAuditOpen}
                        selectedFinalQAAudit={selectedFinalQAAudit}
                        loadingFinalQAAudit={loadingFinalQAAudit}
                        finalQAAuditError={finalQAAuditError}
                        handleOpenFinalQAAudit={handleOpenFinalQAAudit}
                        handlePrintFinalQACoa={handlePrintFinalQACoa}
                        coaPrintLoading={coaPrintLoading}
                    />
                </TabsContent>

                {/* TAB 7: Closed QA (Reprintable Completed Runs) */}
                <TabsContent value="closed-qa" className="space-y-4 outline-none">
                    <ClosedQAQueue
                        loadingJobOrders={loadingJobOrders}
                        closedJobOrders={closedJobOrders}
                        joSearch={joSearch}
                        setJoSearch={setJoSearch}
                        getBranchName={getBranchName}
                        handleReprintReceipt={handleReprintReceipt}
                    />
                </TabsContent>
            </Tabs>

            {/* MODAL 1: Simplified 2-Point QA Inspection & Rework Trigger */}
            <TwoPointQAInspectionModal
                isOpen={isQAInspectionModalOpen}
                onClose={handleCloseQAInspectionModal}
                jobOrder={selectedQAJobOrder}
                rejectionReasons={rejectionReasons}
                getBranchName={getBranchName}
                onSubmitInspection={handleSubmitTwoPointInspection}
                actionLoading={actionLoading}
            />

            {/* MODAL 2: Job Order Status Transition History Audit Trail */}
            <JobOrderStatusHistoryModal
                isOpen={isStatusHistoryModalOpen}
                onClose={handleCloseStatusHistoryModal}
                jobOrder={selectedStatusHistoryJO}
            />

            {/* MODAL 3: Yield Closing Form Dialog */}
            <YieldClosingDialog
                isYieldDialogOpen={isYieldDialogOpen}
                setIsYieldDialogOpen={setIsYieldDialogOpen}
                selectedJO={selectedJO}
                getBranchName={getBranchName}
                yieldQty={yieldQty}
                setYieldQty={setYieldQty}
                lotNumber={lotNumber}
                setLotNumber={setLotNumber}
                manufacturingDate={manufacturingDate}
                setManufacturingDate={setManufacturingDate}
                expiryDate={expiryDate}
                setExpiryDate={setExpiryDate}
                unitCost={unitCost}
                setUnitCost={setUnitCost}
                yieldMaterialsLoading={yieldMaterialsLoading}
                yieldMaterialsError={yieldMaterialsError}
                handleRetryYieldMaterials={handleRetryYieldMaterials}
                actionLoading={actionLoading}
                handleSubmitYieldClosing={handleSubmitYieldClosing}
            />

            {/* MODAL 4: Supervisor Quarantine Override Form Dialog */}
            <OverrideDialog
                isOverrideDialogOpen={isOverrideDialogOpen}
                setIsOverrideDialogOpen={setIsOverrideDialogOpen}
                selectedDisp={selectedDisp}
                overrideDecision={overrideDecision}
                setOverrideDecision={setOverrideDecision}
                overrideComments={overrideComments}
                setOverrideComments={setOverrideComments}
                actionLoading={actionLoading}
                handleSubmitOverride={handleSubmitOverride}
            />
        </div>
    );
}
