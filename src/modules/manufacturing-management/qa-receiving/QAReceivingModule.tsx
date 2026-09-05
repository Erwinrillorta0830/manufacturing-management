"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, Boxes, History, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";

import { useQAReceiving } from "./hooks/useQAReceiving";
import InboundShipmentsList from "./components/InboundShipmentsList";
import ShipmentInspectionForm from "./components/ShipmentInspectionForm";
import FIFOInventoryList from "./components/FIFOInventoryList";
import MovementPayloadModal from "./components/MovementPayloadModal";
import QuarantineDispositions from "./components/QuarantineDispositions";
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
            <div className="space-y-4">
                <div className="flex flex-col gap-3 rounded-xl border bg-muted/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <button
                            type="button"
                            onClick={backToQueue}
                            className="mb-2 inline-flex min-h-10 items-center gap-2 rounded-lg border border-blue-600 bg-blue-600 px-3 text-xs font-bold text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                        >
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Back to Inbound QA Queue
                        </button>
                        <h2 className="truncate text-sm font-extrabold text-foreground">
                            {selectedShipment ? `Cargo Manifest Inspection: ${selectedShipment.reference_number}` : `Purchase Order ${shipmentId ?? ""}`}
                        </h2>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                            Review one purchase order at a time without keeping the inspection queue open beside the worksheet.
                        </p>
                    </div>
                </div>

                {detailLoading && (
                    <div className="rounded-xl border bg-card p-10 text-center text-xs text-muted-foreground">
                        Loading purchase order details...
                    </div>
                )}

                {!detailLoading && detailError && (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6 text-center">
                        <p className="text-sm font-bold text-red-700">Unable to open this QA receiving record</p>
                        <p className="mt-1 text-xs text-muted-foreground">{detailError}</p>
                        <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={retryDetail}
                                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-primary bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90"
                            >
                                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                                Retry
                            </button>
                            <button
                                type="button"
                                onClick={backToQueue}
                                className="inline-flex min-h-10 items-center justify-center rounded-lg border px-4 text-xs font-bold text-foreground hover:bg-muted"
                            >
                                Return to Queue
                            </button>
                        </div>
                    </div>
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
        <div className="space-y-6">
            <div className="flex flex-col items-start justify-between gap-4 rounded-xl border bg-muted/10 p-5 sm:flex-row sm:items-center">
                <div className="space-y-1">
                    <h2 className="flex items-center gap-1.5 text-sm font-extrabold text-foreground">
                        <ShieldAlert className="h-4.5 w-4.5 animate-pulse text-primary" />
                        Quality Assurance & Receiving Command Center
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                        Inspect incoming cargo, record batches, verify raw material expiration lists, and enforce FIFO tracking per branch.
                    </p>
                </div>

                <div className="flex max-w-full flex-wrap gap-2 rounded-lg border bg-background p-1">
                    <button
                        onClick={() => setActiveTab("inbound")}
                        className={`min-h-10 rounded-md px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === "inbound" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted"}`}
                    >
                        <Boxes className="h-3.5 w-3.5" />
                        Inbound QA Queue
                        <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-extrabold text-foreground">{filteredShipments.length}</span>
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("fifo");
                            if (fifoBranchId) handleLoadFifoInventory(fifoBranchId);
                        }}
                        className={`min-h-10 rounded-md px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === "fifo" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted"}`}
                    >
                        <History className="h-3.5 w-3.5" />
                        FIFO Inventory Reading
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("quarantine");
                            void loadQuarantine();
                        }}
                        className={`min-h-10 rounded-md px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === "quarantine" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-muted"}`}
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Quarantine
                        <span className="rounded-full bg-background/80 px-1.5 py-0.5 text-[9px] font-extrabold text-foreground">{quarantineStock.length}</span>
                    </button>
                </div>
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
