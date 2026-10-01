"use client";

import React from "react";
import { X } from "lucide-react";
import ShipmentInspectionForm from "./ShipmentInspectionForm";
import MovementPayloadModal from "./MovementPayloadModal";
import type {
    Branch,
    InspectionRow,
    OverDeliveryLine,
    QaReceiptOption,
    QaSpecificationLoadState,
    QaSpecificationReadings,
    QuarantineDisposition,
    ReceivingCommitResult,
    ReceivingLotAllocationInput,
    ReceivingPreview,
    ReceivingQaEvaluation,
    Shipment,
    ShipmentLineItem,
    StorageLot,
    StorageLotBatch,
    StorageLotLookupState,
    SupplierDocumentType
} from "../types";
import type { ReceivingValidationIssue } from "../receiving-metadata";

export interface QaReceivingInspectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedShipment: Shipment | null;
    readOnly: boolean;
    replacementDisposition: QuarantineDisposition | null;
    lineItems: ShipmentLineItem[];
    branches: Branch[];
    storageLotsByProductId: Record<number, StorageLot[]>;
    rejectedStorageLotsByProductId: Record<number, StorageLot[]>;
    storageLotLookupStateByProductId: Record<number, StorageLotLookupState>;
    rejectedStorageLotLookupStateByProductId: Record<number, StorageLotLookupState>;
    onRetryStorageLots: (productId: number, disposition: "accepted" | "rejected") => void | Promise<void>;
    loadStorageLotBatches: (productId: number, lotId: number, lotBranchId?: number, disposition?: "accepted" | "rejected") => Promise<StorageLotBatch[]>;
    receivingTicketNumber: string;
    onReceiptNumberChange: (value: string) => void;
    receiptOptions: QaReceiptOption[];
    selectedReceipt: QaReceiptOption | null;
    onReceiptSelection: (receiptKey: string) => void;
    receiptDate: string;
    onReceiptDateChange: (value: string) => void;
    supplierDocumentTypes: SupplierDocumentType[];
    loadingSupplierDocumentTypes: boolean;
    supplierDocumentTypeError: string | null;
    supplierDocumentTypeId: number | null;
    onSupplierDocumentTypeChange: (value: string) => void;
    processOverDelivery: boolean;
    setProcessOverDelivery: (value: boolean) => void;
    overDeliveryLines: OverDeliveryLine[];
    selectedBranchId: string;
    inspectionRows: Record<number, InspectionRow>;
    qaSpecificationStates: Record<number, QaSpecificationLoadState>;
    qaReadings: QaSpecificationReadings;
    qaEvaluationResults: Record<number, ReceivingQaEvaluation>;
    receivingPreview: ReceivingPreview | null;
    receivingCommitReady: boolean;
    committedResult: ReceivingCommitResult | null;
    previewOpen: boolean;
    setPreviewOpen: (open: boolean) => void;
    previewAcknowledged: boolean;
    postingInspection: boolean;
    handleCommitReceiving: () => Promise<void>;
    handleForceReceived: (reason: string) => Promise<void>;
    forceReceivedSubmitting: boolean;
    finishCommittedInspection: () => void;
    validatingInspection: boolean;
    previewError: string | null;
    retryPreview: () => void;
    qaSubmissionBlockReason: string | null;
    receivingValidationIssues: ReceivingValidationIssue[];
    loadingLines: boolean;
    handleUpdateRow: (lineId: number, field: string, value: string | number | boolean) => void;
    handleUpdateAllocations: (lineId: number, allocations: ReceivingLotAllocationInput[]) => void;
    handleUpdateRejectedAllocations: (lineId: number, allocations: ReceivingLotAllocationInput[]) => void;
    handleUpdateQaReading: (lineId: number, specId: number, value: string) => void;
    handleSubmitInspection: (e?: React.FormEvent) => void | Promise<void>;
}

export default function QaReceivingInspectionModal({
    isOpen,
    onClose,
    selectedShipment,
    readOnly,
    replacementDisposition,
    lineItems,
    branches,
    storageLotsByProductId,
    rejectedStorageLotsByProductId,
    storageLotLookupStateByProductId,
    rejectedStorageLotLookupStateByProductId,
    onRetryStorageLots,
    loadStorageLotBatches,
    receivingTicketNumber,
    onReceiptNumberChange,
    receiptOptions,
    selectedReceipt,
    onReceiptSelection,
    receiptDate,
    onReceiptDateChange,
    supplierDocumentTypes,
    loadingSupplierDocumentTypes,
    supplierDocumentTypeError,
    supplierDocumentTypeId,
    onSupplierDocumentTypeChange,
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
    finishCommittedInspection,
    validatingInspection,
    previewError,
    retryPreview,
    qaSubmissionBlockReason,
    receivingValidationIssues,
    loadingLines,
    handleUpdateRow,
    handleUpdateAllocations,
    handleUpdateRejectedAllocations,
    handleUpdateQaReading,
    handleSubmitInspection
}: QaReceivingInspectionModalProps) {
    if (!isOpen || !selectedShipment) return null;

    const poNumber = selectedShipment.purchase_order_no?.trim() || `PO #${selectedShipment.shipment_id}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 sm:p-6 backdrop-blur-xs">
            <div className="relative flex max-h-[92vh] w-full max-w-7xl flex-col rounded-2xl border bg-background shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="flex items-center justify-between border-b bg-muted/30 px-5 py-4">
                    <div className="min-w-0">
                        <h2 className="text-base font-black tracking-tight text-foreground">
                            Cargo Manifest QA Inspection · {poNumber}
                        </h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Record batch allocations, perform quality reading tests, and post inventory to warehouse lots.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Close QA inspection modal"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                    {replacementDisposition && (
                        <div className="mb-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-[11px] text-primary">
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
                        onRetryStorageLots={onRetryStorageLots}
                        loadStorageLotBatches={loadStorageLotBatches}
                        receivingTicketNumber={receivingTicketNumber}
                        onReceiptNumberChange={onReceiptNumberChange}
                        receiptOptions={receiptOptions}
                        selectedReceipt={selectedReceipt}
                        onReceiptSelection={onReceiptSelection}
                        receiptDate={receiptDate}
                        onReceiptDateChange={onReceiptDateChange}
                        supplierDocumentTypes={supplierDocumentTypes}
                        loadingSupplierDocumentTypes={loadingSupplierDocumentTypes}
                        supplierDocumentTypeError={supplierDocumentTypeError}
                        supplierDocumentTypeId={supplierDocumentTypeId}
                        onSupplierDocumentTypeChange={onSupplierDocumentTypeChange}
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
                        onCancel={onClose}
                        onForceReceived={handleForceReceived}
                        forceReceivedSubmitting={forceReceivedSubmitting}
                    />

                    <MovementPayloadModal
                        open={previewOpen}
                        onOpenChange={setPreviewOpen}
                        preview={receivingPreview}
                        lineItems={lineItems}
                        purchaseOrderNumber={poNumber}
                        commitReady={receivingCommitReady}
                        posting={postingInspection}
                        onCommit={handleCommitReceiving}
                        committedResult={committedResult}
                        onFinish={finishCommittedInspection}
                    />
                </div>
            </div>
        </div>
    );
}
