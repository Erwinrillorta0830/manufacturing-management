"use client";

import { useRouter } from "next/navigation";
import { Boxes, History, RotateCcw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useQAReceiving } from "./hooks/useQAReceiving";
import InboundShipmentsList from "./components/InboundShipmentsList";
import ShipmentInspectionForm from "./components/ShipmentInspectionForm";
import FIFOInventoryList from "./components/FIFOInventoryList";
import MovementPayloadModal from "./components/MovementPayloadModal";
import QuarantineDispositions from "./components/QuarantineDispositions";
import { ModulePageHeader } from "../shared/components/ModulePageHeader";
import { ModuleStatePanel } from "../shared/components/ModuleStatePanel";
import type { QuarantineDisposition, Shipment } from "./types";

type QAReceivingModuleProps = {
    mode?: "queue" | "detail";
    shipmentId?: number;
    replacementDispositionId?: number;
};

export default function QAReceivingModule({
    mode = "queue",
    shipmentId,
    replacementDispositionId
}: QAReceivingModuleProps) {
    const router = useRouter();
    const isDetailMode = mode === "detail";
    const {
        activeTab,
        setActiveTab,
        branches,
        storageLotsByProductId,
        rejectedStorageLotsByProductId,
        storageLotLookupStateByProductId,
        rejectedStorageLotLookupStateByProductId,
        retryStorageLots,
        loadStorageLotBatches,
        loadingShipments,
        selectedShipment,
        detailLoading,
        detailError,
        retryDetail,
        lineItems,
        loadingLines,
        readOnly,
        replacementDisposition,
        receivingTicketNumber,
        handleReceiptNumberChange,
        receiptDate,
        handleReceiptDateChange,
        supplierDocumentTypes,
        loadingSupplierDocumentTypes,
        supplierDocumentTypeError,
        supplierDocumentTypeId,
        handleSupplierDocumentTypeChange,
        quantityStatus,
        processOverDelivery,
        setProcessOverDelivery,
        overDeliveryLines,
        selectedBranchId,
        inspectionRows,
        qaSpecificationStates,
        qaReadings,
        qaEvaluationResults,
        receivingPreview,
        receivingCommitReady,
        committedResult,
        previewOpen,
        setPreviewOpen,
        previewAcknowledged,
        postingInspection,
        handleCommitReceiving,
        handleForceReceived,
        forceReceivedSubmitting,
        handleFinishCommitted: finishCommittedInspection,
        validatingInspection,
        previewError,
        retryPreview,
        qaSubmissionBlockReason,
        receivingValidationIssues,
        handleUpdateRow,
        handleUpdateAllocations,
        handleUpdateRejectedAllocations,
        handleUpdateQaReading,
        handleSubmitInspection,
        clearInspection,
        fifoBranchId,
        loadingFifo,
        expandedProducts,
        fifoSearch,
        setFifoSearch,
        showReceived,
        setShowReceived,
        filteredShipments,
        filteredFifoList,
        handleLoadFifoInventory,
        toggleProductExpand,
        searchPO,
        setSearchPO,
        searchStatus,
        setSearchStatus,
        startDate,
        setStartDate,
        endDate,
        setEndDate,
        quarantineStock,
        quarantineDispositions,
        loadingQuarantine,
        quarantineError,
        loadQuarantine,
        handleCreateQuarantineDisposition,
        handleProcessQuarantineReturn,
        handleCancelQuarantineDisposition
    } = useQAReceiving({ mode, shipmentId, replacementDispositionId });

    const openShipment = (shipment: Shipment) => {
        router.push(`/mm/qa-receiving/${encodeURIComponent(String(shipment.shipment_id))}`);
    };

    const startReplacement = async (disposition: QuarantineDisposition) => {
        router.push(
            `/mm/qa-receiving/${encodeURIComponent(String(disposition.purchaseOrderId))}?replacementDispositionId=${encodeURIComponent(String(disposition.id))}`
        );
    };

    const backToQueue = () => {
        clearInspection();
        router.push("/mm/qa-receiving");
    };

    const renderInspectionForm = () => selectedShipment ? (
        <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
            {replacementDisposition && (
                <div className="border-b bg-primary/5 px-4 py-3 text-[11px] text-primary">
                    <div className="font-extrabold">Replacement receiving context</div>
                    <div>
                        Disposition #{replacementDisposition.id} · {replacementDisposition.remainingQuantity.toLocaleString()} unit(s) remain. The replacement receipt will not increase the original PO fulfillment totals.
                    </div>
                </div>
            )}
            <ShipmentInspectionForm
                selectedShipment={selectedShipment}
                readOnly={readOnly}
                isReplacement={Boolean(replacementDisposition)}
                lineItems={lineItems}
                branches={branches}
                storageLotsByProductId={storageLotsByProductId}
                rejectedStorageLotsByProductId={rejectedStorageLotsByProductId}
                storageLotLookupStateByProductId={storageLotLookupStateByProductId}
                rejectedStorageLotLookupStateByProductId={rejectedStorageLotLookupStateByProductId}
                onRetryStorageLots={retryStorageLots}
                loadStorageLotBatches={loadStorageLotBatches}
                receivingTicketNumber={receivingTicketNumber}
                onReceiptNumberChange={handleReceiptNumberChange}
                receiptDate={receiptDate}
                onReceiptDateChange={handleReceiptDateChange}
                supplierDocumentTypes={supplierDocumentTypes}
                loadingSupplierDocumentTypes={loadingSupplierDocumentTypes}
                supplierDocumentTypeError={supplierDocumentTypeError}
                supplierDocumentTypeId={supplierDocumentTypeId}
                onSupplierDocumentTypeChange={handleSupplierDocumentTypeChange}
                quantityStatus={quantityStatus}
                processOverDelivery={processOverDelivery}
                setProcessOverDelivery={setProcessOverDelivery}
                overDeliveryLines={overDeliveryLines}
                selectedBranchId={selectedBranchId}
                inspectionRows={inspectionRows}
                qaSpecificationStates={qaSpecificationStates}
                qaReadings={qaReadings}
                qaEvaluationResults={qaEvaluationResults}
                hasPreview={Boolean(receivingPreview)}
                previewAcknowledged={previewAcknowledged}
                validatingInspection={validatingInspection}
                previewError={previewError}
                onRetryPreview={retryPreview}
                qaSubmissionBlockReason={qaSubmissionBlockReason}
                receivingValidationIssues={receivingValidationIssues}
                loadingLines={loadingLines}
                handleUpdateRow={handleUpdateRow}
                handleUpdateAllocations={handleUpdateAllocations}
                handleUpdateRejectedAllocations={handleUpdateRejectedAllocations}
                handleUpdateQaReading={handleUpdateQaReading}
                handleSubmitInspection={handleSubmitInspection}
                onReviewPreview={() => setPreviewOpen(true)}
                onCancel={backToQueue}
                onForceReceived={handleForceReceived}
                forceReceivedSubmitting={forceReceivedSubmitting}
            />
        </div>
    ) : null;

    if (isDetailMode) {
        return (
            <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
                <ModulePageHeader
                    icon={ShieldAlert}
                    eyebrow="Quality Assurance"
                    title={selectedShipment ? `Cargo Manifest Inspection: ${selectedShipment.reference_number}` : `Purchase Order ${shipmentId ?? ""}`}
                    description="Review one purchase order at a time without keeping the inspection queue open beside the worksheet."
                    onBack={backToQueue}
                    backLabel="Back to Inbound QA Queue"
                    titleClassName="truncate text-xl"
                />

                {detailLoading && (
                    <ModuleStatePanel state="loading" title="Loading purchase order details..." skeletonRows={3} className="rounded-xl border bg-card" />
                )}

                {!detailLoading && detailError && (
                    <ModuleStatePanel
                        state="error"
                        title="Unable to open this QA receiving record"
                        description={detailError}
                        onRetry={() => void retryDetail()}
                        action={<Button variant="outline" onClick={backToQueue}>Return to Queue</Button>}
                        className="rounded-xl border border-destructive/20 bg-destructive/5"
                    />
                )}

                {!detailLoading && !detailError && renderInspectionForm()}

                <MovementPayloadModal
                    open={previewOpen}
                    onOpenChange={setPreviewOpen}
                    preview={receivingPreview}
                    lineItems={lineItems}
                    purchaseOrderReference={selectedShipment?.reference_number}
                    commitReady={receivingCommitReady}
                    posting={postingInspection}
                    onCommit={handleCommitReceiving}
                    committedResult={committedResult}
                    onFinish={finishCommittedInspection}
                />
            </div>
        );
    }

    return (
        <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-5">
            <ModulePageHeader
                icon={ShieldAlert}
                eyebrow="Quality Assurance"
                title="Quality Assurance (QA) Receiving"
                description="Inspect incoming cargo, record batches, verify raw material expiration lists, and enforce FIFO tracking per branch."
            />

            <div className="flex max-w-full flex-wrap gap-1 rounded-xl border bg-muted/60 p-1" role="tablist" aria-label="QA receiving views">
                <Button
                    type="button"
                    size="sm"
                    variant={activeTab === "inbound" ? "default" : "ghost"}
                    onClick={() => setActiveTab("inbound")}
                    aria-pressed={activeTab === "inbound"}
                    className={activeTab === "inbound" ? "" : "text-muted-foreground"}
                >
                    <Boxes className="h-3.5 w-3.5" />
                    Inbound QA Queue
                    <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-extrabold text-foreground">{filteredShipments.length}</span>
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant={activeTab === "fifo" ? "default" : "ghost"}
                    onClick={() => {
                        setActiveTab("fifo");
                        if (fifoBranchId) handleLoadFifoInventory(fifoBranchId);
                    }}
                    aria-pressed={activeTab === "fifo"}
                    className={activeTab === "fifo" ? "" : "text-muted-foreground"}
                >
                    <History className="h-3.5 w-3.5" />
                    FIFO Inventory Reading
                </Button>
                <Button
                    type="button"
                    size="sm"
                    variant={activeTab === "quarantine" ? "default" : "ghost"}
                    onClick={() => {
                        setActiveTab("quarantine");
                        void loadQuarantine();
                    }}
                    aria-pressed={activeTab === "quarantine"}
                    className={activeTab === "quarantine" ? "" : "text-muted-foreground"}
                >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Quarantine
                    <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-extrabold text-foreground">{quarantineStock.length}</span>
                </Button>
            </div>

            {activeTab === "inbound" && (
                <InboundShipmentsList
                    loadingShipments={loadingShipments}
                    filteredShipments={filteredShipments}
                    showReceived={showReceived}
                    setShowReceived={setShowReceived}
                    onSelectShipment={openShipment}
                    searchPO={searchPO}
                    setSearchPO={setSearchPO}
                    searchStatus={searchStatus}
                    setSearchStatus={setSearchStatus}
                    startDate={startDate}
                    setStartDate={setStartDate}
                    endDate={endDate}
                    setEndDate={setEndDate}
                />
            )}

            {activeTab === "fifo" && (
                <FIFOInventoryList
                    branches={branches}
                    fifoBranchId={fifoBranchId}
                    loadingFifo={loadingFifo}
                    fifoSearch={fifoSearch}
                    setFifoSearch={setFifoSearch}
                    filteredFifoList={filteredFifoList}
                    expandedProducts={expandedProducts}
                    toggleProductExpand={toggleProductExpand}
                    handleLoadFifoInventory={handleLoadFifoInventory}
                />
            )}

            {activeTab === "quarantine" && (
                <QuarantineDispositions
                    stock={quarantineStock}
                    dispositions={quarantineDispositions}
                    loading={loadingQuarantine}
                    error={quarantineError}
                    onRefresh={loadQuarantine}
                    onCreate={handleCreateQuarantineDisposition}
                    onProcessReturn={handleProcessQuarantineReturn}
                    onCancel={handleCancelQuarantineDisposition}
                    onStartReplacement={startReplacement}
                />
            )}
        </div>
    );
}
