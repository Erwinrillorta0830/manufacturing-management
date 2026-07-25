"use client";

import React from "react";
import { ShieldAlert, Boxes, History } from "lucide-react";

import { useQAReceiving } from "./hooks/useQAReceiving";
import InboundShipmentsList from "./components/InboundShipmentsList";
import ShipmentInspectionForm from "./components/ShipmentInspectionForm";
import FIFOInventoryList from "./components/FIFOInventoryList";
import MovementPayloadModal from "./components/MovementPayloadModal";

export default function QAReceivingModule() {
    const {
        activeTab,
        setActiveTab,
        branches,
        storageLots,
        loadingShipments,
        selectedShipment,
        lineItems,
        loadingLines,
        readOnly,
        receiptNumber,
        setReceiptNumber,
        receiptMode,
        setReceiptMode,
        selectedBranchId,
        setSelectedBranchId,
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
        handleFinishCommitted,
        validatingInspection,
        previewError,
        qaSubmissionBlockReason,
        receivingValidationIssues,
        handleSelectShipment,
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
        setEndDate
    } = useQAReceiving();

    return (
        <div className="space-y-6">
            {/* Header and Tabs */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/10 p-5 border rounded-xl">
                <div className="space-y-1">
                    <h2 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
                        <ShieldAlert className="h-4.5 w-4.5 text-primary animate-pulse" />
                        Quality Assurance & Receiving Command Center
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                        Inspect incoming cargo, record batches, verify raw material expiration lists, and enforce FIFO tracking per branch.
                    </p>
                </div>

                <div className="flex gap-2 bg-background border p-1 rounded-lg">
                    <button
                        onClick={() => {
                            setActiveTab("inbound");
                            clearInspection();
                        }}
                        className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                            activeTab === "inbound"
                                ? "bg-primary text-primary-foreground shadow"
                                : "text-muted-foreground hover:bg-muted"
                        }`}
                    >
                        <Boxes className="h-3.5 w-3.5" />
                        Inbound QA Queue
                        <span className="text-[9px] bg-background/80 text-foreground px-1.5 py-0.5 rounded-full font-extrabold">
                            {filteredShipments.length}
                        </span>
                    </button>
                    <button
                        onClick={() => {
                            setActiveTab("fifo");
                            if (fifoBranchId) handleLoadFifoInventory(fifoBranchId);
                        }}
                        className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                            activeTab === "fifo"
                                ? "bg-primary text-primary-foreground shadow"
                                : "text-muted-foreground hover:bg-muted"
                        }`}
                    >
                        <History className="h-3.5 w-3.5" />
                        FIFO Inventory Reading
                    </button>
                </div>
            </div>

            {/* TAB 1: Inbound QA Queue */}
            {activeTab === "inbound" && (
                <div className="grid gap-6 md:grid-cols-3">
                    {/* Left 1/3: Active Shipments waiting for inspection */}
                    <div className={selectedShipment ? "hidden md:block" : "block col-span-1"}>
                        <InboundShipmentsList
                            loadingShipments={loadingShipments}
                            filteredShipments={filteredShipments}
                            selectedShipment={selectedShipment}
                            showReceived={showReceived}
                            setShowReceived={setShowReceived}
                            onSelectShipment={handleSelectShipment}
                            searchPO={searchPO}
                            setSearchPO={setSearchPO}
                            searchStatus={searchStatus}
                            setSearchStatus={setSearchStatus}
                            startDate={startDate}
                            setStartDate={setStartDate}
                            endDate={endDate}
                            setEndDate={setEndDate}
                        />
                    </div>

                    {/* Right 2/3: Cargo Inspect details form */}
                    <div className={`md:col-span-2 border rounded-xl bg-card overflow-hidden max-h-[85dvh] md:max-h-[75dvh] flex flex-col ${
                        selectedShipment ? "block" : "hidden md:flex"
                    }`}>
                        {selectedShipment ? (
                            <ShipmentInspectionForm
                                selectedShipment={selectedShipment}
                                readOnly={readOnly}
                                lineItems={lineItems}
                                branches={branches}
                                storageLots={storageLots}
                                receiptNumber={receiptNumber}
                                setReceiptNumber={setReceiptNumber}
                                receiptMode={receiptMode}
                                setReceiptMode={setReceiptMode}
                                selectedBranchId={selectedBranchId}
                                setSelectedBranchId={setSelectedBranchId}
                                inspectionRows={inspectionRows}
                                qaSpecificationStates={qaSpecificationStates}
                                qaReadings={qaReadings}
                                qaEvaluationResults={qaEvaluationResults}
                                hasPreview={Boolean(receivingPreview)}
                                previewAcknowledged={previewAcknowledged}
                                validatingInspection={validatingInspection}
                                previewError={previewError}
                                qaSubmissionBlockReason={qaSubmissionBlockReason}
                                receivingValidationIssues={receivingValidationIssues}
                                loadingLines={loadingLines}
                                handleUpdateRow={handleUpdateRow}
                                handleUpdateAllocations={handleUpdateAllocations}
                                handleUpdateRejectedAllocations={handleUpdateRejectedAllocations}
                                handleUpdateQaReading={handleUpdateQaReading}
                                handleSubmitInspection={handleSubmitInspection}
                                onReviewPreview={() => setPreviewOpen(true)}
                                onCancel={clearInspection}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center flex-1 p-8 text-center space-y-3">
                                <Boxes className="h-12 w-12 text-muted-foreground/45" />
                                <div>
                                    <h4 className="text-xs font-bold text-foreground">No Shipment Cargo Selected</h4>
                                    <p className="text-[11px] text-muted-foreground">Select an active inbound shipment from the queue to run inspection workflows.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: FIFO Inventory Reading */}
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
                onFinish={handleFinishCommitted}
            />
        </div>
    );
}
