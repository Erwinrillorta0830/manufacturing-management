"use client";

import React, { useState } from "react";
import {
    User,
    Plus,
    Search,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight
} from "lucide-react";
import { CUSTOMER_PAGE_SIZE_OPTIONS } from "./types";
import { useClients } from "./hooks/useClients";
import ClientsTable from "./components/ClientsTable";
import ClientFormModal from "./components/ClientFormModal";

type ClientModalMode = "create" | "view" | "edit";

export default function ClientsModule() {
    const [modalMode, setModalMode] = useState<ClientModalMode>("create");
    const {
        customers,
        customerPage,
        customerPageSize,
        customerPagination,
        customerPageError,
        storeTypes,
        setStoreTypes,
        priceTypes,
        loading,
        searchText,
        setSearchText,
        statusFilter,
        setStatusFilter,
        isModalOpen,
        setIsModalOpen,
        editingCustomer,
        formData,
        setFormData,
        provinces,
        cities,
        barangays,
        paymentTerms,
        selectedProvinceCode,
        setSelectedProvinceCode,
        selectedCityCode,
        setSelectedCityCode,
        setCustomerPage,
        setCustomerPageSize,
        refresh,
        openCreateModal,
        openEditModal,
        handleCustomerNameChange,
        handleSaveCustomer,
        savingCustomer,
        formErrors,
        products,
        versionsMap,
        overrides,
        loadingBomSettings,
        bomSettingsError,
        updateProductVersionOverride
    } = useClients();

    const handleCreate = () => {
        setModalMode("create");
        openCreateModal();
    };

    const handleView = (customer: Parameters<typeof openEditModal>[0]) => {
        setModalMode("view");
        void openEditModal(customer);
    };

    return (
        <div className="space-y-6 max-w-6xl mx-auto p-1 sm:p-2 relative">
            {/* Header section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-muted/10 p-5 border rounded-xl">
                <div className="space-y-1">
                    <h2 className="text-sm font-extrabold text-foreground flex items-center gap-1.5">
                        <User className="h-4.5 w-4.5 text-primary" />
                        Client Directory & TIN Registry
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                        Manage corporate customer billing profiles, tax registers (TIN), credit limits, and region classifications.
                    </p>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 bg-card border p-4 rounded-xl shadow-sm">
                {/* Search */}
                <div className="relative flex-1 group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground/50 group-focus-within:text-primary transition-colors" />
                    <input
                        placeholder="Search by client name, code, TIN, email..."
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                        className="w-full bg-background border rounded-lg pl-10 pr-4 py-2 text-xs outline-none focus:ring-1 focus:ring-primary font-semibold"
                    />
                </div>

                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3">
                    {/* Status filter pills */}
                    <div className="flex items-center gap-1 bg-muted p-1 rounded-lg border">
                        <button
                            onClick={() => setStatusFilter("all")}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                                statusFilter === "all"
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            All Clients
                        </button>
                        <button
                            onClick={() => setStatusFilter("active")}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                                statusFilter === "active"
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            Active
                        </button>
                        <button
                            onClick={() => setStatusFilter("inactive")}
                            className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${
                                statusFilter === "inactive"
                                    ? "bg-background text-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            Inactive
                        </button>
                    </div>

                    {/* Add Client Trigger */}
                    <button
                        onClick={handleCreate}
                        className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-bold hover:bg-primary/95 transition-all shadow-md cursor-pointer"
                    >
                        <Plus className="h-4 w-4" />
                        Register Customer
                    </button>
                </div>
            </div>

            {/* Customers List / Table */}
            {customerPageError && !loading && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-xs text-destructive">
                    <span>{customerPageError}</span>
                    <button
                        type="button"
                        onClick={refresh}
                        className="shrink-0 rounded-md border border-destructive/30 px-2.5 py-1 font-semibold hover:bg-destructive/10"
                    >
                        Retry
                    </button>
                </div>
            )}

            {(!customerPageError || loading) && (
                <ClientsTable
                    customers={customers}
                    loading={loading}
                    onView={handleView}
                />
            )}

            {!loading && customerPagination.total > 0 && (
                <div className="flex flex-col gap-3 rounded-xl border bg-card px-4 py-3 text-xs shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-muted-foreground">
                        Showing <span className="font-bold text-foreground">{((customerPage - 1) * customerPageSize) + 1}</span>
                        –<span className="font-bold text-foreground">{Math.min(customerPage * customerPageSize, customerPagination.total)}</span>
                        {" "}of <span className="font-bold text-foreground">{customerPagination.total}</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                        <label className="flex items-center gap-2 text-muted-foreground">
                            <span>Rows per page</span>
                            <select
                                value={customerPageSize}
                                onChange={(event) => setCustomerPageSize(Number(event.target.value))}
                                className="h-8 rounded-md border bg-background px-2 font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
                            >
                                {CUSTOMER_PAGE_SIZE_OPTIONS.map((option) => (
                                    <option key={option} value={option}>{option}</option>
                                ))}
                            </select>
                        </label>

                        <span className="font-semibold text-muted-foreground">
                            Page <span className="text-foreground">{customerPage}</span> of <span className="text-foreground">{customerPagination.totalPages}</span>
                        </span>

                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                aria-label="Go to first page"
                                title="First page"
                                disabled={!customerPagination.hasPreviousPage}
                                onClick={() => setCustomerPage(1)}
                                className="rounded-md border bg-background p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                            >
                                <ChevronsLeft className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                aria-label="Go to previous page"
                                title="Previous page"
                                disabled={!customerPagination.hasPreviousPage}
                                onClick={() => setCustomerPage(customerPage - 1)}
                                className="rounded-md border bg-background p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                aria-label="Go to next page"
                                title="Next page"
                                disabled={!customerPagination.hasNextPage}
                                onClick={() => setCustomerPage(customerPage + 1)}
                                className="rounded-md border bg-background p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                aria-label="Go to last page"
                                title="Last page"
                                disabled={!customerPagination.hasNextPage}
                                onClick={() => setCustomerPage(customerPagination.totalPages)}
                                className="rounded-md border bg-background p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
                            >
                                <ChevronsRight className="h-4 w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Dialog Form Overlay */}
            <ClientFormModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                mode={modalMode}
                onEdit={() => setModalMode("edit")}
                editingCustomer={editingCustomer}
                formData={formData}
                setFormData={setFormData}
                storeTypes={storeTypes}
                setStoreTypes={setStoreTypes}
                priceTypes={priceTypes}
                provinces={provinces}
                cities={cities}
                barangays={barangays}
                paymentTerms={paymentTerms}
                selectedProvinceCode={selectedProvinceCode}
                setSelectedProvinceCode={setSelectedProvinceCode}
                selectedCityCode={selectedCityCode}
                setSelectedCityCode={setSelectedCityCode}
                onSave={handleSaveCustomer}
                formErrors={formErrors}
                saving={savingCustomer}
                onNameChange={handleCustomerNameChange}
                products={products}
                versionsMap={versionsMap}
                overrides={overrides}
                loadingBomSettings={loadingBomSettings}
                bomSettingsError={bomSettingsError}
                updateProductVersionOverride={updateProductVersionOverride}
            />
        </div>
    );
}
