"use client";

import React, { useState } from "react";
import { User, Plus, Search } from "lucide-react";
import { useClients } from "./hooks/useClients";
import ClientsTable from "./components/ClientsTable";
import ClientFormModal from "./components/ClientFormModal";

type ClientModalMode = "create" | "view" | "edit";

export default function ClientsModule() {
    const [modalMode, setModalMode] = useState<ClientModalMode>("create");
    const {
        customers,
        storeTypes,
        setStoreTypes,
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
        openCreateModal,
        openEditModal,
        handleCustomerNameChange,
        handleSaveCustomer,
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
            <ClientsTable
                customers={customers}
                loading={loading}
                onView={handleView}
            />

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
                provinces={provinces}
                cities={cities}
                barangays={barangays}
                paymentTerms={paymentTerms}
                selectedProvinceCode={selectedProvinceCode}
                setSelectedProvinceCode={setSelectedProvinceCode}
                selectedCityCode={selectedCityCode}
                setSelectedCityCode={setSelectedCityCode}
                onSave={handleSaveCustomer}
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
