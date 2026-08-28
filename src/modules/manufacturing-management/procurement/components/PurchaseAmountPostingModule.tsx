"use client";

import React, { useState } from "react";
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
import PostedPOLedgerTable, { PurchaseAmountAuditDrawer } from "./purchase-amount/PostedPOLedgerTable";
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

function LocalExpensesNotice() {
    return <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-center text-xs text-muted-foreground">PHP purchase orders do not require import landed expenses. Continue to the supporting documents and allocation preview steps.</div>;
}

export default function PurchaseAmountPostingModule({
    shipments,
    selectedShipment: propSelectedShipment,
    setSelectedShipment: propSetSelectedShipment
}: PurchaseAmountPostingModuleProps) {
    const [view, setView] = useState<"landing" | "editing" | "audit">("landing");
    const [auditOrder, setAuditOrder] = useState<PurchaseAmountLandingRow | null>(null);

    const {
        loading,
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
        handleAddExpenseRow,
        handleRemoveExpenseRow,
        handleUpdateExpenseRow,
        handleExecutePosting
    } = usePurchaseAmountPosting(
        shipments as unknown as PurchaseOrderOption[],
        propSelectedShipment as unknown as PurchaseOrderOption | null,
        propSetSelectedShipment as unknown as ((shipment: PurchaseOrderOption | null) => void)
    );

    const rateReady = !isForeignPO || (Number.isFinite(exchangeRate) && exchangeRate > 0);
    const ruleReady = Boolean(allocationRule);
    const expensesReady = !hasInvalidExpenseRows;
    const stepState = (available: boolean, complete: boolean): StepState => !available ? "Locked" : complete ? "Complete" : "Ready";
    const activeView = view === "landing" && selectedShipment ? "editing" : view;

    const handleEdit = (order: PurchaseAmountLandingRow) => {
        handleSelectPO(order.sourceOrder);
        setView("editing");
    };

    const handleViewLedger = (order: PurchaseAmountLandingRow) => {
        if (!order.canViewLedger) return;
        setAuditOrder(order);
        setView("audit");
    };

    const handleBackToLanding = () => {
        clearSelectedPO();
        setAuditOrder(null);
        setView("landing");
    };

    const handleCloseAudit = () => {
        setAuditOrder(null);
        setView("landing");
    };

    const handlePost = async () => {
        const posted = await handleExecutePosting();
        if (posted) setView("landing");
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-bold"><Calculator className="h-5 w-5 text-primary" />Purchase Amount Posting &amp; Landed Cost Engine</h2>
                    <p className="text-xs text-muted-foreground">{activeView === "editing" ? "Complete the sequential landed-cost controls before posting and locking costs." : "Review purchase orders in one landing page and open editing or audit details from the status action."}</p>
                </div>
                {activeView === "editing" && selectedShipment && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <button type="button" onClick={handleBackToLanding} aria-label="Back to Purchase Amount landing page" className="inline-flex items-center gap-1.5 rounded-md border border-blue-600 bg-blue-600 px-3 py-2 text-[10px] font-bold text-white shadow-sm transition-colors hover:border-blue-700 hover:bg-blue-700 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"><ArrowLeft className="h-3.5 w-3.5" />Back to Landing Page</button>
                        <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${isForeignPO ? "border-amber-500/20 bg-amber-500/10 text-amber-600" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"}`}>
                            {isForeignPO ? <DollarSign className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />}
                            {isForeignPO ? `FOREIGN IMPORTATION (${currencyCode})` : "LOCAL PURCHASE (PHP)"}
                        </div>
                        <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-blue-700 dark:text-blue-300"><span className="text-[10px] font-bold uppercase tracking-wider">Editing PO</span><span className="text-sm font-black">{String(selectedShipment.purchase_order_no || selectedShipment.reference_number || "Selected PO")}</span></div>
                        {(Boolean(selectedShipment.isForceReceived) || Boolean(selectedShipment.forceReceivedAt)) && <div className="rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1.5 text-xs font-bold text-violet-700">Force Received{typeof selectedShipment.forceReceivedReason === "string" && selectedShipment.forceReceivedReason ? `: ${selectedShipment.forceReceivedReason}` : ""}</div>}
                    </div>
                )}
            </div>

            {activeView === "editing" ? (
                <div className="space-y-4">
                    {errorMessage && <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs font-semibold text-red-600"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{errorMessage}</span></div>}
                    {successMessage && <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4 shrink-0" /><span>{successMessage}</span></div>}

                    <WorkflowStep number={1} title="Currency & Sub-Pool Shares" state={stepState(true, rateReady)} lockedMessage="The purchase order is not ready for editing.">
                        <ForexSubPoolHeader currencyCode={currencyCode} exchangeRate={exchangeRate} calculationResult={calculationResult} onExchangeRateChange={setExchangeRate} disabled={posting || !selectedShipment} />
                    </WorkflowStep>

                    <WorkflowStep number={2} title="Landed-Cost Allocation Rule" state={stepState(rateReady, ruleReady)} lockedMessage="Complete the currency step before selecting an allocation rule.">
                        <div className="space-y-3">
                            <p className="text-[11px] text-muted-foreground">Choose the rule used by the server for every landed-cost allocation.</p>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                {LANDED_COST_METHOD_OPTIONS.map(({ value, label, description }) => {
                                    const selected = allocationRule === value;
                                    return <button key={value} type="button" aria-pressed={selected} title={description} onClick={() => setAllocationRule(value)} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-bold transition-all ${selected ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/40 shadow-md" : "hover:bg-muted"}`}>{label}{selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}</button>;
                                })}
                            </div>
                            {(allocationRule === "Value" || allocationRule === "Volume") && <p className="text-[11px] text-amber-600">Existing record uses the compatibility rule &ldquo;{landedCostMethodLabel(allocationRule)}&rdquo;. Select a current rule to change it, or continue to preserve the legacy calculation.</p>}
                        </div>
                    </WorkflowStep>

                    <WorkflowStep number={3} title="Import Landed Expenses" state={stepState(rateReady && ruleReady, expensesReady)} lockedMessage="Select an allocation rule before entering landed expenses.">
                        {isForeignPO ? <LandedExpensesTable landedExpenses={landedExpenses} expenseTypes={expenseTypes} onAddExpenseRow={handleAddExpenseRow} onRemoveExpenseRow={handleRemoveExpenseRow} onUpdateExpenseRow={handleUpdateExpenseRow} disabled={posting || !rateReady || !ruleReady} /> : <LocalExpensesNotice />}
                    </WorkflowStep>

                    <WorkflowStep number={4} title="Additional Documents" state={stepState(rateReady && ruleReady, false)} lockedMessage="Select an allocation rule before uploading supporting documents.">
                        <LandedCostAttachments purchaseOrderId={Number(selectedShipment?.purchase_order_id || selectedShipment?.shipment_id || selectedShipment?.id || 0)} allocationRule={allocationRule} expenses={landedExpenses.map(expense => ({ overhead_id: expense.overhead_id, expense_type: expense.expense_type, amount_php: expense.amount }))} expenseTypes={expenseTypes} exchangeRate={exchangeRate} sourceFlow="PURCHASE_AMOUNT_POSTING" disabled={posting || !selectedShipment || !rateReady || !ruleReady} />
                    </WorkflowStep>

                    <WorkflowStep number={5} title="Landed Cost Allocation Preview" state={stepState(rateReady && ruleReady, canPost)} lockedMessage="Complete the currency, allocation rule, and expense validation before reviewing the final preview.">
                        <LineItemsPostingTable calculationResult={calculationResult} onExecutePosting={() => void handlePost()} posting={posting} canPost={canPost} disabledReason={postDisabledReason} />
                    </WorkflowStep>
                </div>
            ) : (
                <>
                    {successMessage && <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-600"><CheckCircle2 className="h-4 w-4 shrink-0" /><span>{successMessage}</span></div>}
                    <PostedPOLedgerTable orders={landingRows} loading={loading} errorMessage={errorMessage} onEdit={handleEdit} onViewLedger={handleViewLedger} />
                    {activeView === "audit" && auditOrder && <PurchaseAmountAuditDrawer order={auditOrder} onClose={handleCloseAudit} />}
                </>
            )}
        </div>
    );
}
