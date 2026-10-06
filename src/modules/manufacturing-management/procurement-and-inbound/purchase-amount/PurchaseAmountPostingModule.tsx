"use client";

import React, { useState } from "react";
import {
    Calculator,
    CheckCircle2
} from "lucide-react";
import { usePurchaseAmountPosting } from "./hooks/usePurchaseAmountPosting";
import type { PurchaseAmountLandingRow, PurchaseAmountPostingModuleProps, PurchaseOrderOption } from "./components/types";
import PostedPOLedgerTable from "./components/PostedPOLedgerTable";
import PurchaseAmountEditModal from "./components/PurchaseAmountEditModal";
import PurchaseAmountAuditModal from "./components/PurchaseAmountAuditModal";

export default function PurchaseAmountPostingModule({
    shipments,
    selectedShipment: propSelectedShipment,
    setSelectedShipment: propSetSelectedShipment,
    purchaseOrderId: routePurchaseOrderId
}: PurchaseAmountPostingModuleProps) {
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [auditOrderId, setAuditOrderId] = useState<number | null>(null);

    const {
        loading,
        detailsLoading,
        posting,
        successMessage,
        errorMessage,
        landingRows,
        selectedShipment,
        handleSelectPO,
        clearSelectedPO,
        isForeignPO,
        currencyCode,
        exchangeRate,
        setExchangeRate,
        landedExpenses,
        allocationRule,
        setAllocationRule,
        expenseTypes,
        hasInvalidExpenseRows,
        canPost,
        postDisabledReason,
        calculationResult,
        syncing,
        lastSyncedAt,
        changedLineIds,
        refreshLineItems,
        handleAddExpenseRow,
        handleRemoveExpenseRow,
        handleUpdateExpenseRow,
        handleExecutePosting
    } = usePurchaseAmountPosting(
        shipments as unknown as PurchaseOrderOption[],
        propSelectedShipment as unknown as PurchaseOrderOption | null,
        propSetSelectedShipment as unknown as ((shipment: PurchaseOrderOption | null) => void),
        routePurchaseOrderId
    );

    const handleEdit = (order: PurchaseAmountLandingRow) => {
        handleSelectPO(order.sourceOrder);
        setIsEditModalOpen(true);
    };

    const handleCloseEditModal = () => {
        setIsEditModalOpen(false);
        clearSelectedPO();
    };

    const handleViewLedger = (order: PurchaseAmountLandingRow) => {
        if (!order.canViewLedger) return;
        setAuditOrderId(order.purchaseOrderId);
    };

    const handleCloseAuditModal = () => {
        setAuditOrderId(null);
    };

    const handlePost = async () => {
        const postedPurchaseOrderId = routePurchaseOrderId || Number(selectedShipment?.purchase_order_id || selectedShipment?.shipment_id || selectedShipment?.id);
        const posted = await handleExecutePosting();
        if (!posted) return;
        handleCloseEditModal();
        if (Number.isSafeInteger(postedPurchaseOrderId) && postedPurchaseOrderId > 0) {
            setAuditOrderId(postedPurchaseOrderId);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold"><Calculator className="h-5 w-5 text-primary" />Purchase Amount Posting &amp; Landed Cost Engine</h2>
                    <p className="text-xs text-muted-foreground">Review purchase orders in one landing page and open editing or audit details from the status action.</p>
                </div>
            </div>

            {successMessage && <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-600" role="status" data-testid="purchase-amount-post-success"><CheckCircle2 className="h-4 w-4 shrink-0" /><span>{successMessage}</span></div>}

            <PostedPOLedgerTable orders={landingRows} loading={loading} errorMessage={errorMessage} onEdit={handleEdit} onViewLedger={handleViewLedger} />

            <PurchaseAmountEditModal
                isOpen={isEditModalOpen}
                onClose={handleCloseEditModal}
                selectedShipment={selectedShipment}
                detailsLoading={detailsLoading}
                errorMessage={errorMessage}
                successMessage={successMessage}
                isForeignPO={isForeignPO}
                currencyCode={currencyCode}
                exchangeRate={exchangeRate}
                setExchangeRate={setExchangeRate}
                allocationRule={allocationRule}
                setAllocationRule={setAllocationRule}
                landedExpenses={landedExpenses}
                expenseTypes={expenseTypes}
                hasInvalidExpenseRows={hasInvalidExpenseRows}
                onAddExpenseRow={handleAddExpenseRow}
                onRemoveExpenseRow={handleRemoveExpenseRow}
                onUpdateExpenseRow={handleUpdateExpenseRow}
                calculationResult={calculationResult}
                canPost={canPost}
                postDisabledReason={postDisabledReason}
                posting={posting}
                onExecutePosting={handlePost}
                refreshLineItems={refreshLineItems}
                syncing={syncing}
                lastSyncedAt={lastSyncedAt}
                changedLineIds={changedLineIds}
            />

            <PurchaseAmountAuditModal
                isOpen={auditOrderId !== null}
                purchaseOrderId={auditOrderId}
                onClose={handleCloseAuditModal}
            />
        </div>
    );
}
