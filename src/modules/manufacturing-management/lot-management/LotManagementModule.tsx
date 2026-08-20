"use client";

import React from "react";
import { useLotManagement } from "./hooks/useLotManagement";
import LotTable from "./components/LotTable";
import LotFormDialog from "./components/LotFormDialog";

export default function LotManagementModule() {
    const {
        filteredLots,
        loading,
        saving,
        searchQuery,
        setSearchQuery,
        filterType,
        setFilterType,
        inventoryTypes,
        uoms,
        isFormOpen,
        editingLot,
        formData,
        formErrors,
        isDuplicateLotName,
        openCreateDialog,
        openEditDialog,
        closeDialog,
        handleFormChange,
        handleCreate,
        handleUpdate,
        loadLots
    } = useLotManagement();

    return (
        <div className="space-y-4">
            {/* Lot Table */}
            <LotTable
                filteredLots={filteredLots}
                loading={loading}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                filterType={filterType}
                onFilterTypeChange={setFilterType}
                inventoryTypes={inventoryTypes}
                onEdit={openEditDialog}
                onRefresh={loadLots}
                onAddClick={openCreateDialog}
            />

            {/* Lot Form Dialog */}
            <LotFormDialog
                isOpen={isFormOpen}
                onClose={closeDialog}
                onSubmit={editingLot ? handleUpdate : handleCreate}
                editingLot={editingLot}
                formData={formData}
                formErrors={formErrors}
                isDuplicateLotName={isDuplicateLotName}
                onFormChange={handleFormChange}
                inventoryTypes={inventoryTypes}
                uoms={uoms}
                saving={saving}
            />
        </div>
    );
}
