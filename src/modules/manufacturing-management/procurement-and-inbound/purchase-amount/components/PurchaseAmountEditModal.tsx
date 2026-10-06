"use client";

import React from "react";
import {
    AlertTriangle,
    Check,
    CheckCircle2,
    DollarSign,
    Landmark,
    Loader2,
    X
} from "lucide-react";
import ForexSubPoolHeader from "./ForexSubPoolHeader";
import LandedExpensesTable from "./LandedExpensesTable";
import LineItemsPostingTable from "./LineItemsPostingTable";
import LandedCostAttachments from "@/modules/manufacturing-management/procurement/components/LandedCostAttachments";
import { LANDED_COST_METHOD_OPTIONS, landedCostMethodLabel } from "@/modules/manufacturing-management/procurement/landed-cost-methods";
import type { LandedCostAllocationRule } from "@/modules/manufacturing-management/procurement/types";
import type { ExpenseTypeOption, LandedExpenseRow, HybridCalculationResult, PurchaseOrderOption } from "./types";

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

interface PurchaseAmountEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedShipment: PurchaseOrderOption | null;
    detailsLoading: boolean;
    errorMessage: string | null;
    successMessage: string | null;
    isForeignPO: boolean;
    currencyCode: string;
    exchangeRate: number;
    setExchangeRate: (rate: number) => void;
    allocationRule: LandedCostAllocationRule | "";
    setAllocationRule: (rule: LandedCostAllocationRule) => void;
    landedExpenses: LandedExpenseRow[];
    expenseTypes: ExpenseTypeOption[];
    hasInvalidExpenseRows: boolean;
    onAddExpenseRow: () => void;
    onRemoveExpenseRow: (id: string) => void;
    onUpdateExpenseRow: (id: string, field: keyof LandedExpenseRow, value: LandedExpenseRow[keyof LandedExpenseRow]) => void;
    calculationResult: HybridCalculationResult;
    canPost: boolean;
    postDisabledReason?: string;
    posting: boolean;
    onExecutePosting: () => Promise<void>;
    refreshLineItems: () => Promise<{ changed: boolean }>;
    syncing: boolean;
    lastSyncedAt: string | null;
    changedLineIds: number[];
}

export default function PurchaseAmountEditModal({
    isOpen,
    onClose,
    selectedShipment,
    detailsLoading,
    errorMessage,
    successMessage,
    isForeignPO,
    currencyCode,
    exchangeRate,
    setExchangeRate,
    allocationRule,
    setAllocationRule,
    landedExpenses,
    expenseTypes,
    hasInvalidExpenseRows,
    onAddExpenseRow,
    onRemoveExpenseRow,
    onUpdateExpenseRow,
    calculationResult,
    canPost,
    postDisabledReason,
    posting,
    onExecutePosting,
    refreshLineItems,
    syncing,
    lastSyncedAt,
    changedLineIds
}: PurchaseAmountEditModalProps) {
    if (!isOpen) return null;

    const rateReady = !isForeignPO || (Number.isFinite(exchangeRate) && exchangeRate > 0);
    const ruleReady = Boolean(allocationRule);
    const expensesReady = !hasInvalidExpenseRows;
    const stepState = (available: boolean, complete: boolean): StepState => !available ? "Locked" : complete ? "Complete" : "Ready";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 sm:p-6 backdrop-blur-xs">
            <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl border bg-background shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/30 px-5 py-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-black tracking-tight text-foreground">
                                Edit Landed Cost &amp; Valuation
                            </h2>
                            {selectedShipment && (
                                <span className="rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-black text-primary">
                                    {String(selectedShipment.purchase_order_no || selectedShipment.reference_number || "Selected PO")}
                                </span>
                            )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                            Configure sequential landed cost rules, exchange rates, and expense allocations.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${isForeignPO ? "border-amber-500/20 bg-amber-500/10 text-amber-600" : "border-emerald-500/20 bg-emerald-500/10 text-emerald-600"}`}>
                            {isForeignPO ? <DollarSign className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />}
                            {isForeignPO ? `FOREIGN IMPORT (${currencyCode})` : "LOCAL PURCHASE (PHP)"}
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            aria-label="Close edit modal"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Modal Body */}
                <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-4">
                    {detailsLoading ? (
                        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center" role="status">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <p className="text-xs font-medium text-muted-foreground">Loading purchase order allocations...</p>
                        </div>
                    ) : (
                        <>
                            {errorMessage && (
                                <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs font-semibold text-red-600">
                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                    <span>{errorMessage}</span>
                                </div>
                            )}
                            {successMessage && (
                                <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-xs font-semibold text-emerald-600">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>{successMessage}</span>
                                </div>
                            )}

                            <WorkflowStep number={1} title="Currency & Sub-Pool Shares" state={stepState(true, rateReady)} lockedMessage="The purchase order is not ready for editing.">
                                <ForexSubPoolHeader currencyCode={currencyCode} exchangeRate={exchangeRate} calculationResult={calculationResult} onExchangeRateChange={setExchangeRate} disabled={posting || !selectedShipment} />
                            </WorkflowStep>

                            <WorkflowStep number={2} title="Landed-Cost Allocation Rule" state={stepState(rateReady, ruleReady)} lockedMessage="Complete the currency step before selecting an allocation rule.">
                                <div className="space-y-3">
                                    <p className="text-[11px] text-muted-foreground">Choose the rule used by the server for every landed-cost allocation.</p>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                                        {LANDED_COST_METHOD_OPTIONS.map(({ value, label, description }: any) => {
                                            const selected = allocationRule === value;
                                            return (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    aria-pressed={selected}
                                                    title={description}
                                                    onClick={() => setAllocationRule(value)}
                                                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-3 text-xs font-bold transition-all ${selected ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/40 shadow-md" : "hover:bg-muted"}`}
                                                >
                                                    {label}
                                                    {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {(allocationRule === "Value" || allocationRule === "Volume") && (
                                        <p className="text-[11px] text-amber-600">
                                            Existing record uses the compatibility rule &ldquo;{landedCostMethodLabel(allocationRule)}&rdquo;. Select a current rule to change it, or continue to preserve the legacy calculation.
                                        </p>
                                    )}
                                </div>
                            </WorkflowStep>

                            <WorkflowStep number={3} title="Landed Expenses" state={stepState(rateReady && ruleReady, expensesReady)} lockedMessage="Select an allocation rule before entering landed expenses.">
                                <LandedExpensesTable landedExpenses={landedExpenses} expenseTypes={expenseTypes} onAddExpenseRow={onAddExpenseRow} onRemoveExpenseRow={onRemoveExpenseRow} onUpdateExpenseRow={onUpdateExpenseRow} disabled={posting || !rateReady || !ruleReady} />
                            </WorkflowStep>

                            <WorkflowStep number={4} title="Additional Documents" state={stepState(rateReady && ruleReady, false)} lockedMessage="Select an allocation rule before uploading supporting documents.">
                                <LandedCostAttachments purchaseOrderId={Number(selectedShipment?.purchase_order_id || selectedShipment?.shipment_id || selectedShipment?.id || 0)} allocationRule={allocationRule} expenses={landedExpenses.map(expense => ({ overhead_id: expense.overhead_id, expense_type: expense.expense_type, amount_php: expense.amount }))} expenseTypes={expenseTypes} exchangeRate={exchangeRate} sourceFlow="PURCHASE_AMOUNT_POSTING" disabled={posting || !selectedShipment || !rateReady || !ruleReady} />
                            </WorkflowStep>

                            <WorkflowStep number={5} title="Landed Cost Allocation Preview" state={stepState(rateReady && ruleReady, canPost)} lockedMessage="Complete the currency, allocation rule, and expense validation before reviewing the final preview.">
                                <LineItemsPostingTable
                                    calculationResult={calculationResult}
                                    currencyCode={currencyCode}
                                    onExecutePosting={() => void onExecutePosting()}
                                    posting={posting}
                                    canPost={canPost}
                                    disabledReason={postDisabledReason}
                                    onRefreshPrices={() => void refreshLineItems()}
                                    syncing={syncing}
                                    lastSyncedAt={lastSyncedAt}
                                    changedLineIds={changedLineIds}
                                />
                            </WorkflowStep>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
