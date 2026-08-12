/* eslint-disable */
"use client";

import React from "react";
import { 
    RefreshCw, 
    ArrowRight, 
    BadgeAlert,
    Lock,
    Forklift,
    FileText,
    ClipboardCheck,
    CheckCircle2,
    Printer
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
        qaLogs,
        activeTab,
        setActiveTab,
        loadingLogs,
        loadingDispositions,
        loadingJobOrders,
        actionLoading,
        logSearch,
        setLogSearch,
        logStatusFilter,
        setLogStatusFilter,
        joSearch,
        setJoSearch,
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
        selectedDisp,
        isOverrideDialogOpen,
        setIsOverrideDialogOpen,
        overrideDecision,
        setOverrideDecision,
        overrideComments,
        setOverrideComments,
        refreshAll,
        getBranchName,
        filteredQALogs,
        pendingHolds,
        activeJobOrders,
        closedJobOrders,
        handleOpenYieldDialog,
        handleSubmitYieldClosing,
        handleReprintReceipt,
        handleOpenOverrideDialog,
        handleSubmitOverride,

        // Daily Yield QA states & handlers
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
        jobOrders,
        qaTemplates,
        qaParamValues,
        setQaParamValues,

        // Final QA states & handlers
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
        handleSubmitFinalRelease
    } = useManufacturingQA();

    return (
        <div className="space-y-6">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Quality Assurance Console</h1>
                    <p className="text-muted-foreground mt-1">
                        Audit active checklist parameters, release quarantine hold overrides, and finalize production yield closing log receipts.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={refreshAll} className="gap-1.5">
                        <RefreshCw className="h-4 w-4" />
                        Sync Dashboard
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
                        className="gap-1.5 shrink-0"
                    >
                        Resolve Holds
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                </div>
            )}

            {/* Main Tabs Dashboard */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">


                {/* TAB: Active Holds */}
                <TabsContent value="holds" className="space-y-4 outline-none">
                    <QuarantineHolds
                        loadingDispositions={loadingDispositions}
                        pendingHolds={pendingHolds}
                        handleOpenOverrideDialog={handleOpenOverrideDialog}
                    />
                </TabsContent>

                {/* TAB: Daily Yield QA */}
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

                {/* TAB: Final QA Release */}
                <TabsContent value="final-qa" className="space-y-4 outline-none">
                    <FinalQAReleases
                        lots={lots}
                        lotsProducts={lotsProducts}
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
                    />
                </TabsContent>

                {/* TAB: Yield Closing */}
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

                {/* TAB: Closed QA (Reprintable Completed Runs) */}
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

                {/* TAB: QA Logs */}
                <TabsContent value="logs" className="space-y-4 outline-none">
                    <CheckpointLogsTable
                        loadingLogs={loadingLogs}
                        filteredQALogs={filteredQALogs}
                        logSearch={logSearch}
                        setLogSearch={setLogSearch}
                        logStatusFilter={logStatusFilter}
                        setLogStatusFilter={setLogStatusFilter}
                    />
                </TabsContent>
            </Tabs>

            {/* DIALOG: Yield Closing Form */}
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
                actionLoading={actionLoading}
                handleSubmitYieldClosing={handleSubmitYieldClosing}
            />

            {/* DIALOG: Supervisor Quarantine Override Form */}
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
