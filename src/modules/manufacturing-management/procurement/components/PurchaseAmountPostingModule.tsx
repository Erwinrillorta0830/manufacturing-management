"use client";

import React, { useState } from "react";
import {
    AlertTriangle,
    Calculator,
    Check,
    CheckCircle2,
    DollarSign,
    Landmark,
    ListFilter,
    Loader2,
    Printer,
    ShieldCheck
} from "lucide-react";
import { toast } from "sonner";
import { usePurchaseAmountPosting } from "../hooks/usePurchaseAmountPosting";
import { PurchaseAmountPostingModuleProps } from "./purchase-amount/types";
import POSelectionCard from "./purchase-amount/POSelectionCard";
import ForexSubPoolHeader from "./purchase-amount/ForexSubPoolHeader";
import LandedExpensesTable from "./purchase-amount/LandedExpensesTable";
import LineItemsPostingTable from "./purchase-amount/LineItemsPostingTable";
import PostedPOLedgerTable from "./purchase-amount/PostedPOLedgerTable";
import LandedCostAttachments from "./LandedCostAttachments";
import { LANDED_COST_METHOD_OPTIONS, landedCostMethodLabel } from "../landed-cost-methods";
import { downloadPurchaseOrderPrintable } from "../../purchase-order/services/purchase-order-print-api";

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
        <section className="rounded-xl border bg-card overflow-hidden" data-testid={`purchase-amount-step-${number}`}>
            <div className="flex items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                        {number}
                    </span>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider">{title}</h3>
                </div>
                <span className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                    state === "Complete"
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
                        : state === "Ready"
                            ? "border-primary/20 bg-primary/5 text-primary"
                            : "border-muted bg-muted text-muted-foreground"
                }`}>
                    {state}
                </span>
            </div>
            <div className={locked ? "p-4" : "p-4"}>
                {locked ? (
                    <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-center text-xs text-muted-foreground">
                        {lockedMessage || "Complete the previous step to continue."}
                    </div>
                ) : children}
            </div>
        </section>
    );
}

function LocalExpensesNotice() {
    return (
        <div className="rounded-lg border border-dashed bg-muted/20 p-5 text-center text-xs text-muted-foreground">
            PHP purchase orders do not require import landed expenses. Continue to the supporting documents and allocation preview steps.
        </div>
    );
}

export default function PurchaseAmountPostingModule({
    shipments,
    selectedShipment: propSelectedShipment,
    setSelectedShipment: propSetSelectedShipment
}: PurchaseAmountPostingModuleProps) {
    const [activeTab, setActiveTab] = useState<"posting" | "ledger">("posting");
    const [printLoading, setPrintLoading] = useState(false);

    const {
        posting,
        successMessage,
        errorMessage,
        eligibleOrders,
        postedOrders,
        selectedShipment,
        handleSelectPO,
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
        shipments as unknown as import("../hooks/usePurchaseAmountPosting").PurchaseOrderOption[],
        propSelectedShipment as unknown as import("../hooks/usePurchaseAmountPosting").PurchaseOrderOption | null,
        propSetSelectedShipment as unknown as ((shipment: import("../hooks/usePurchaseAmountPosting").PurchaseOrderOption | null) => void)
    );

    const rateReady = !isForeignPO || (Number.isFinite(exchangeRate) && exchangeRate > 0);
    const orderReady = Boolean(selectedShipment);
    const ruleReady = Boolean(allocationRule);
    const expensesReady = !hasInvalidExpenseRows;
    const stepState = (available: boolean, complete: boolean): StepState => !available ? "Locked" : complete ? "Complete" : "Ready";

    const handlePrintLandedCost = async () => {
        if (!selectedShipment) return;
        const purchaseOrderId = Number(selectedShipment.purchase_order_id || selectedShipment.shipment_id || selectedShipment.id);
        if (!purchaseOrderId) return;
        try {
            setPrintLoading(true);
            await downloadPurchaseOrderPrintable({ purchaseOrderId, documentType: "LANDED_COST" });
            toast.success("Landed-cost printable downloaded.");
        } catch (error) {
            toast.error((error as Error).message || "Unable to generate the landed-cost printable.");
        } finally {
            setPrintLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between border-b pb-4">
                <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <Calculator className="h-5 w-5 text-primary" />
                        Purchase Amount Posting &amp; Landed Cost Engine
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        Follow the sequential purchase-order, currency, allocation, expense, document, and preview controls before locking costs.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex bg-muted p-1 rounded-xl gap-1">
                        <button
                            type="button"
                            onClick={() => setActiveTab("posting")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                activeTab === "posting" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <ListFilter className="h-3.5 w-3.5" />
                            Awaiting Posting
                            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-primary/10 text-primary text-[10px]">{eligibleOrders.length}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab("ledger")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                                activeTab === "ledger" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                            Posted PO Ledger
                            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px]">{postedOrders.length}</span>
                        </button>
                    </div>

                    {selectedShipment && activeTab === "posting" && (
                        <>
                            <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${isForeignPO ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"}`}>
                                {isForeignPO ? <DollarSign className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />}
                                {isForeignPO ? `FOREIGN IMPORTATION (${currencyCode})` : "LOCAL PURCHASE (PHP)"}
                            </div>
                            {(selectedShipment.isForceReceived || selectedShipment.forceReceivedAt) && (
                                <div className="px-3 py-1.5 rounded-full text-xs font-bold bg-violet-500/10 text-violet-700 border border-violet-500/20">
                                    Force Received
                                    {typeof selectedShipment.forceReceivedReason === "string" && selectedShipment.forceReceivedReason ? `: ${selectedShipment.forceReceivedReason}` : ""}
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={() => void handlePrintLandedCost()}
                                disabled={printLoading}
                                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 text-[10px] font-bold text-primary hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {printLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
                                {printLoading ? "Preparing..." : "Print landed cost"}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {activeTab === "posting" ? (
                <div className="space-y-4">
                    {errorMessage && (
                        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 font-semibold flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>{errorMessage}</span>
                        </div>
                    )}
                    {successMessage && (
                        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-600 font-semibold flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    <WorkflowStep
                        number={1}
                        title="Select Purchase Order"
                        state={stepState(true, orderReady)}
                        lockedMessage="Select a received purchase order from the eligible queue to unlock the landed-cost controls."
                    >
                        <POSelectionCard
                            eligibleOrders={eligibleOrders as unknown as import("./purchase-amount/POSelectionCard").EligibleOrder[]}
                            selectedShipment={selectedShipment as unknown as import("./purchase-amount/POSelectionCard").EligibleOrder | null}
                            onSelectPO={handleSelectPO as unknown as ((po: import("./purchase-amount/POSelectionCard").EligibleOrder) => void)}
                        />
                    </WorkflowStep>

                    <WorkflowStep
                        number={2}
                        title="Currency & Sub-Pool Shares"
                        state={stepState(orderReady, rateReady)}
                        lockedMessage="Select a purchase order before configuring its currency and sub-pool values."
                    >
                        <ForexSubPoolHeader
                            currencyCode={currencyCode}
                            exchangeRate={exchangeRate}
                            calculationResult={calculationResult}
                            onExchangeRateChange={setExchangeRate}
                            disabled={posting || !orderReady}
                        />
                    </WorkflowStep>

                    <WorkflowStep
                        number={3}
                        title="Landed-Cost Allocation Rule"
                        state={stepState(orderReady && rateReady, ruleReady)}
                        lockedMessage="Complete the purchase-order and currency steps before selecting an allocation rule."
                    >
                        <div className="space-y-3">
                            <p className="text-[11px] text-muted-foreground">Choose the rule used by the server for every landed-cost allocation.</p>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {LANDED_COST_METHOD_OPTIONS.map(({ value, label, description }) => {
                                    const selected = allocationRule === value;
                                    return (
                                        <button
                                            key={value}
                                            type="button"
                                            aria-pressed={selected}
                                            title={description}
                                            onClick={() => setAllocationRule(value)}
                                            className={`rounded-lg border px-3 py-3 text-xs font-bold transition-all inline-flex items-center justify-center gap-1.5 ${selected
                                                ? "bg-primary text-primary-foreground border-primary ring-2 ring-primary/40 shadow-md"
                                                : "hover:bg-muted"
                                            }`}
                                        >
                                            {label}
                                            {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                                        </button>
                                    );
                                })}
                            </div>
                            {(allocationRule === "Value" || allocationRule === "Volume") && (
                                <p className="text-[11px] text-amber-600">
                                    Existing record uses the compatibility rule “{landedCostMethodLabel(allocationRule)}”. Select a current rule to change it, or continue to preserve the legacy calculation.
                                </p>
                            )}
                        </div>
                    </WorkflowStep>

                    <WorkflowStep
                        number={4}
                        title="Import Landed Expenses"
                        state={stepState(orderReady && rateReady && ruleReady, expensesReady)}
                        lockedMessage="Select an allocation rule before entering landed expenses."
                    >
                        {isForeignPO ? (
                            <LandedExpensesTable
                                landedExpenses={landedExpenses}
                                expenseTypes={expenseTypes}
                                onAddExpenseRow={handleAddExpenseRow}
                                onRemoveExpenseRow={handleRemoveExpenseRow}
                                onUpdateExpenseRow={handleUpdateExpenseRow}
                                disabled={posting || !rateReady || !ruleReady}
                            />
                        ) : <LocalExpensesNotice />}
                    </WorkflowStep>

                    <WorkflowStep
                        number={5}
                        title="Additional Documents"
                        state={stepState(orderReady && rateReady && ruleReady, false)}
                        lockedMessage="Select an allocation rule before uploading supporting documents."
                    >
                        <LandedCostAttachments
                            purchaseOrderId={Number(selectedShipment?.purchase_order_id || selectedShipment?.shipment_id || selectedShipment?.id || 0)}
                            allocationRule={allocationRule}
                            expenses={landedExpenses.map(expense => ({
                                overhead_id: expense.overhead_id,
                                expense_type: expense.expense_type,
                                amount_php: expense.amount
                            }))}
                            expenseTypes={expenseTypes}
                            exchangeRate={exchangeRate}
                            sourceFlow="PURCHASE_AMOUNT_POSTING"
                            disabled={posting || !orderReady || !rateReady || !ruleReady}
                        />
                    </WorkflowStep>

                    <WorkflowStep
                        number={6}
                        title="Landed Cost Allocation Preview"
                        state={stepState(orderReady && rateReady && ruleReady, canPost)}
                        lockedMessage="Complete the purchase order, currency, allocation rule, and expense validation before reviewing the final preview."
                    >
                        <LineItemsPostingTable
                            calculationResult={calculationResult}
                            onExecutePosting={handleExecutePosting}
                            posting={posting}
                            canPost={canPost}
                            disabledReason={postDisabledReason}
                        />
                    </WorkflowStep>
                </div>
            ) : (
                <PostedPOLedgerTable postedOrders={postedOrders as unknown as import("./purchase-amount/PostedPOLedgerTable").PostedOrder[]} />
            )}
        </div>
    );
}
