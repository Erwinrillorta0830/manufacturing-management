"use client";

import React, { useState } from "react";
import { DollarSign, Landmark, AlertTriangle, CheckCircle2, Calculator, ShieldCheck, ListFilter } from "lucide-react";
import { usePurchaseAmountPosting } from "../hooks/usePurchaseAmountPosting";
import { PurchaseAmountPostingModuleProps } from "./purchase-amount/types";
import POSelectionCard from "./purchase-amount/POSelectionCard";
import ForexSubPoolHeader from "./purchase-amount/ForexSubPoolHeader";
import LandedExpensesTable from "./purchase-amount/LandedExpensesTable";
import LineItemsPostingTable from "./purchase-amount/LineItemsPostingTable";
import PostedPOLedgerTable from "./purchase-amount/PostedPOLedgerTable";

export default function PurchaseAmountPostingModule({
    shipments,
    selectedShipment: propSelectedShipment,
    setSelectedShipment: propSetSelectedShipment
}: PurchaseAmountPostingModuleProps) {
    const [activeTab, setActiveTab] = useState<"posting" | "ledger">("posting");

    const {
        posting,
        successMessage,
        errorMessage,
        eligibleOrders,
        postedOrders,
        selectedShipment,
        handleSelectPO,
        isForeignPO,
        exchangeRate,
        setExchangeRate,
        setLineItems,
        landedExpenses,
        chartOfAccounts,
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

    return (
        <div className="space-y-6">
            {/* Header Title Bar */}
            <div className="flex items-center justify-between border-b pb-4">
                <div>
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <Calculator className="h-5 w-5 text-primary" />
                        Purchase Amount Posting & Landed Cost Engine
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        Post purchase amounts, exchange rates, and view the historical audit ledger of posted purchase orders.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    {/* View Mode Tabs */}
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
                            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-primary/10 text-primary text-[10px]">
                                {eligibleOrders.length}
                            </span>
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
                            <span className="ml-1 px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px]">
                                {postedOrders.length}
                            </span>
                        </button>
                    </div>

                    {selectedShipment && activeTab === "posting" && (
                        <div className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 ${isForeignPO ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" : "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"}`}>
                            {isForeignPO ? <DollarSign className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />}
                            {isForeignPO ? "FOREIGN IMPORTATION (USD)" : "LOCAL PURCHASE (PHP)"}
                        </div>
                    )}
                </div>
            </div>

            {activeTab === "posting" ? (
                <div className="space-y-6">
                    {/* Purchase Order Selector Card */}
                    <POSelectionCard
                        eligibleOrders={eligibleOrders as unknown as import("./purchase-amount/POSelectionCard").EligibleOrder[]}
                        selectedShipment={selectedShipment as unknown as import("./purchase-amount/POSelectionCard").EligibleOrder | null}
                        onSelectPO={handleSelectPO as unknown as ((po: import("./purchase-amount/POSelectionCard").EligibleOrder) => void)}
                    />

                    {/* Error & Success Messages */}
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

                    {/* Main Active Form */}
                    {selectedShipment ? (
                        <div className="space-y-6">
                            {/* Foreign Import Forex & Sub-pool Overview */}
                            {isForeignPO && (
                                <ForexSubPoolHeader
                                    exchangeRate={exchangeRate}
                                    setExchangeRate={setExchangeRate}
                                    calculationResult={calculationResult}
                                />
                            )}

                            {/* Landed Expenses Entry Table */}
                            {isForeignPO && (
                                <LandedExpensesTable
                                    landedExpenses={landedExpenses}
                                    chartOfAccounts={chartOfAccounts}
                                    onAddExpenseRow={handleAddExpenseRow}
                                    onRemoveExpenseRow={handleRemoveExpenseRow}
                                    onUpdateExpenseRow={handleUpdateExpenseRow}
                                />
                            )}

                            {/* Line Items Calculations & Landed Unit Cost Preview Table */}
                            <LineItemsPostingTable
                                isForeignPO={isForeignPO}
                                exchangeRate={exchangeRate}
                                calculationResult={calculationResult}
                                setLineItems={setLineItems}
                                onExecutePosting={handleExecutePosting}
                                posting={posting}
                            />
                        </div>
                    ) : (
                        <div className="p-12 text-center border border-dashed rounded-xl space-y-3">
                            <Calculator className="h-10 w-10 mx-auto text-muted-foreground/40" />
                            <h3 className="text-sm font-bold">No Eligible Purchase Order Selected</h3>
                            <p className="text-xs text-muted-foreground max-w-md mx-auto">
                                {eligibleOrders.length > 0
                                    ? "Select a purchase order from the dropdown above to manage amount posting and landed costs."
                                    : "There are currently no purchase orders awaiting amount posting."}
                            </p>
                        </div>
                    )}
                </div>
            ) : (
                /* Posted Ledger View Tab */
                <PostedPOLedgerTable postedOrders={postedOrders as unknown as import("./purchase-amount/PostedPOLedgerTable").PostedOrder[]} />
            )}
        </div>
    );
}
