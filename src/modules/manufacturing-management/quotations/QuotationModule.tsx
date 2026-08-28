"use client";

import React from "react";
import { Save } from "lucide-react";

import { useQuotation } from "./hooks/useQuotation";
import { QuotationList } from "./components/QuotationList";
import { QuotationDetailModal } from "./components/QuotationDetailModal";
import { QuotationHeaderForm } from "./components/QuotationHeaderForm";
import { SelectedProductsList } from "./components/SelectedProductsList";
import { SaveConfirmationModal } from "./components/SaveConfirmationModal";
import { PriceTypeWarningModal } from "./components/PriceTypeWarningModal";

export default function QuotationModule() {
    const {
        view,
        setView,
        quotes,
        loadingQuotes,
        selectedQuote,
        snapshots,
        loadingSnapshots,
        isDetailModalOpen,
        setIsDetailModalOpen,
        customers,
        setCustomers,
        selectedCustomerId,
        customerSearchText,
        quoteNumber,
        setQuoteNumber,
        remarks,
        setRemarks,
        projectName,
        setProjectName,
        priceTypes,
        selectedPriceTypeId,
        isPriceTypeWarningOpen,
        handlePriceTypeChange,
        confirmPriceTypeChange,
        cancelPriceTypeChange,
        selectedProductsList,
        savingQuote,
        loadQuotes,
        viewQuoteDetails,
        reviseQuotation,
        handlePrintQuotation,
        removeProductFromQuote,
        handleAgreedPriceChange,
        handleSearchCustomers,
        selectCustomer,
        submitQuotation,
        changeProductVersion,
        showValidationErrors,
        isConfirmModalOpen,
        setIsConfirmModalOpen,
        confirmSubmitQuotation,
        productTypes,
        allProducts,
        addEmptyRow,
        updateRow,
        handleRowProductSelect,
        registerNewProject,
        allProjects,
        startCreateQuoteForProject,
        selectedProjectId
    } = useQuotation();

    const projectQuoteHistory = React.useMemo(() => {
        if (!selectedQuote) return [];
        const projectId = typeof selectedQuote.project_id === 'object' && selectedQuote.project_id !== null
            ? (selectedQuote.project_id as { id: number }).id
            : selectedQuote.project_id;
        
        if (!projectId) return [selectedQuote];
        
        return quotes.filter(q => {
            const pId = typeof q.project_id === 'object' && q.project_id !== null
                ? (q.project_id as { id: number }).id
                : q.project_id;
            return pId === projectId;
        }).sort((a, b) => {
            const tA = a.quote_date ? new Date(a.quote_date).getTime() : 0;
            const tB = b.quote_date ? new Date(b.quote_date).getTime() : 0;
            return tB - tA;
        });
    }, [quotes, selectedQuote]);

    return (
        <div className="space-y-6">
            {view === "list" ? (
                <QuotationList
                     quotes={quotes}
                     loadingQuotes={loadingQuotes}
                     loadQuotes={loadQuotes}
                     viewQuoteDetails={viewQuoteDetails}
                     allProjects={allProjects}
                     customers={customers}
                     handleSearchCustomers={handleSearchCustomers}
                     registerNewProject={registerNewProject}
                     startCreateQuoteForProject={startCreateQuoteForProject}
                />
            ) : (
                <div className="space-y-6">
                    <div className="flex items-center justify-between border-b pb-4">
                        <div>
                            <h3 className="text-base font-bold text-foreground">Create Customer Quotation</h3>
                            <p className="text-xs text-muted-foreground">Select customer accounts, preset standard price types, and customize client price overrides.</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                disabled={savingQuote}
                                onClick={submitQuotation}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all shadow-md disabled:opacity-50"
                            >
                                <Save className="h-4 w-4" /> {savingQuote ? "Saving Quote..." : "Save Pricing Snapshot"}
                            </button>
                            <button
                                onClick={() => setView("list")}
                                className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted text-muted-foreground transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>

                    <QuotationHeaderForm
                        quoteNumber={quoteNumber}
                        setQuoteNumber={setQuoteNumber}
                        customerSearchText={customerSearchText}
                        selectedCustomerId={selectedCustomerId}
                        customers={customers}
                        setCustomers={setCustomers}
                        handleSearchCustomers={handleSearchCustomers}
                        selectCustomer={selectCustomer}
                        priceTypes={priceTypes}
                        selectedPriceTypeId={selectedPriceTypeId}
                        setSelectedPriceTypeId={handlePriceTypeChange}
                        remarks={remarks}
                        setRemarks={setRemarks}
                        projectName={projectName}
                        setProjectName={setProjectName}
                        showValidationErrors={showValidationErrors}
                        selectedProjectId={selectedProjectId}
                    />

                    <div className="w-full">
                        <SelectedProductsList
                            selectedProductsList={selectedProductsList}
                            handleAgreedPriceChange={handleAgreedPriceChange}
                            removeProductFromQuote={removeProductFromQuote}
                            changeProductVersion={changeProductVersion}
                            productTypes={productTypes}
                            allProducts={allProducts}
                            addEmptyRow={addEmptyRow}
                            updateRow={updateRow}
                            handleRowProductSelect={handleRowProductSelect}
                        />
                    </div>
                </div>
            )}

            {/* Modal for quotation details snapshot list */}
            <QuotationDetailModal
                isDetailModalOpen={isDetailModalOpen}
                selectedQuote={selectedQuote}
                projectQuoteHistory={projectQuoteHistory}
                snapshots={snapshots}
                loadingSnapshots={loadingSnapshots}
                setIsDetailModalOpen={setIsDetailModalOpen}
                reviseQuotation={reviseQuotation}
                handlePrintQuotation={handlePrintQuotation}
                loadQuotes={loadQuotes}
            />

            {/* Custom save confirmation modal */}
            <SaveConfirmationModal
                isOpen={isConfirmModalOpen}
                onClose={() => setIsConfirmModalOpen(false)}
                onConfirm={confirmSubmitQuotation}
                isSaving={savingQuote}
            />

            {/* Price Type Change Warning Modal */}
            <PriceTypeWarningModal
                isOpen={isPriceTypeWarningOpen}
                onClose={cancelPriceTypeChange}
                onConfirm={confirmPriceTypeChange}
            />
        </div>
    );
}
