"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
    AlertTriangle,
    ArrowLeft,
    Calculator,
    Check,
    CheckCircle2,
    DollarSign,
    Landmark
} from "lucide-react";
import { usePurchaseAmountPosting } from "../hooks/usePurchaseAmountPosting";
import type { PurchaseAmountLandingRow, PurchaseAmountPostingModuleProps, PurchaseOrderOption } from "./purchase-amount/types";
import ForexSubPoolHeader from "./purchase-amount/ForexSubPoolHeader";
import LandedExpensesTable from "./purchase-amount/LandedExpensesTable";
import LineItemsPostingTable from "./purchase-amount/LineItemsPostingTable";
import PostedPOLedgerTable, { PurchaseAmountAuditView } from "./purchase-amount/PostedPOLedgerTable";
import LandedCostAttachments from "./LandedCostAttachments";
import { LANDED_COST_METHOD_OPTIONS, landedCostMethodLabel } from "../landed-cost-methods";

type StepState = "Locked" | "Ready" | "Complete";

interface WorkflowStepProps {
    number: number;
    title: string;
    state: StepState;
    children: React.ReactNode;
    lockedMessage?: string;
}

function WorkflowStep({ number, title, state, children, lockedMessage }: WorkflowStepProps) {
    const locked = state === "Locked";
    return (
        <section className="overflow-hidden rounded-xl border bg-card" data-testid={`purchase-amount-step-${number}`}>
            <div className="flex items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">{number}</span>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider">{title}</h3>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${state === "Complete"
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                    : state === "Ready"
                        ? "border-primary/20 bg-primary/5 text-primary"
                        : "border-muted bg-muted text-muted-foreground"
                }`}>{state}</span>
            </div>
            <div className="p-4">
                {locked ? <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-center text-xs text-muted-foreground">{lockedMessage || "Complete the previous step to continue."}</div> : children}
            </div>
        </section>
    );
}

import PurchaseAmountEditModal from "./purchase-amount/PurchaseAmountEditModal";
import PurchaseAmountAuditModal from "./purchase-amount/PurchaseAmountAuditModal";

export default function PurchaseAmountPostingModule({
    shipments,
    selectedShipment: propSelectedShipment,
    setSelectedShipment: propSetSelectedShipment,
    pageMode = "embedded",
    purchaseOrderId: routePurchaseOrderId
}: PurchaseAmountPostingModuleProps) {
    const router = useRouter();
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [auditOrderId, setAuditOrderId] = useState<number | null>(null);

    const {
        loading,
        detailsLoading,
        ordersLoaded,
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
