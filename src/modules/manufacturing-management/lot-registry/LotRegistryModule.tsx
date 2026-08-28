"use client";

import React from "react";
import { useLotRegistry } from "./hooks/useLotRegistry";
import LotTable from "./components/LotTable";
import LotFormDialog from "./components/LotFormDialog";

export default function LotRegistryModule() {
    const {
        filteredLots,
        loading,
        saving,
        searchQuery,
        setSearchQuery,
        uoms,
        branches,
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
    } = useLotRegistry();

    return (
        <div className="space-y-4">
            {/* Lot Table */}
            <LotTable
                filteredLots={filteredLots}
                loading={loading}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
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
                uoms={uoms}
                branches={branches}
                saving={saving}
            />
        </div>
    );
}
