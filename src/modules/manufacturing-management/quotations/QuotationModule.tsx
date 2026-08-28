"use client";

import React from "react";
import { Save } from "lucide-react";

import { useQuotation } from "./hooks/useQuotation";
import { QuotationList } from "./components/QuotationList";
import { QuotationDetailModal } from "./components/QuotationDetailModal";
import { QuotationHeaderForm } from "./components/QuotationHeaderForm";
import { ProductCatalogTable } from "./components/ProductCatalogTable";
import { SelectedProductsList } from "./components/SelectedProductsList";

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
        setSelectedPriceTypeId,
        loadingProducts,
        selectedProductsList,
        searchQuery,
        setSearchQuery,
        currentPage,
        setCurrentPage,
        savingQuote,
        loadQuotes,
        viewQuoteDetails,
        reviseQuotation,
        addProductToQuote,
        removeProductFromQuote,
        handleAgreedPriceChange,
        handleSearchCustomers,
        selectCustomer,
        submitQuotation,
        filteredCatalog,
        totalPages,
        paginatedCatalog,
        changeProductVersion,
        showValidationErrors,
        registerNewProject,
        allProjects,
        startCreateQuoteForProject,
        selectedProjectId
    } = useQuotation();

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
                        setSelectedPriceTypeId={setSelectedPriceTypeId}
                        remarks={remarks}
                        setRemarks={setRemarks}
                        projectName={projectName}
                        setProjectName={setProjectName}
                        showValidationErrors={showValidationErrors}
                        selectedProjectId={selectedProjectId}
                    />

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
                        {/* Left sidebar: product catalog */}
                        <div className="lg:col-span-1">
                            <ProductCatalogTable
                                loadingProducts={loadingProducts}
                                searchQuery={searchQuery}
                                setSearchQuery={setSearchQuery}
                                paginatedCatalog={paginatedCatalog}
                                filteredCatalog={filteredCatalog}
                                addProductToQuote={addProductToQuote}
                                currentPage={currentPage}
                                setCurrentPage={setCurrentPage}
                                totalPages={totalPages}
                                selectedProductsList={selectedProductsList}
                            />
                        </div>

                        {/* Right main area: selected override prices */}
                        <SelectedProductsList
                            selectedProductsList={selectedProductsList}
                            handleAgreedPriceChange={handleAgreedPriceChange}
                            removeProductFromQuote={removeProductFromQuote}
                            changeProductVersion={changeProductVersion}
                        />
                    </div>
                </div>
            )}

            {/* Modal for quotation details snapshot list */}
            <QuotationDetailModal
                isDetailModalOpen={isDetailModalOpen}
                selectedQuote={selectedQuote}
                snapshots={snapshots}
                loadingSnapshots={loadingSnapshots}
                setIsDetailModalOpen={setIsDetailModalOpen}
                reviseQuotation={reviseQuotation}
                loadQuotes={loadQuotes}
            />
        </div>
    );
}
