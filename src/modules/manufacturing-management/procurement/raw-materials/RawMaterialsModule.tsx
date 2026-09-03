"use client";

import React from "react";
import { 
    RawMaterialItem, 
    SupplierItem, 
    RegisterRawMaterialPayload, 
    PackagingVariantPayload 
} from "./types/raw-materials.types";
import { useRawMaterialsData } from "./hooks/useRawMaterialsData";
import { useRawMaterialForm } from "./hooks/useRawMaterialForm";
import { RawMaterialsHeader } from "./components/RawMaterialsHeader";
import { RawMaterialsToolbar } from "./components/RawMaterialsToolbar";
import { RawMaterialsTable } from "./components/RawMaterialsTable";
import { RawMaterialModal } from "./components/RawMaterialModal";

interface RawMaterialsModuleProps {
    rawMaterials: RawMaterialItem[];
    suppliers: SupplierItem[];
    loadingItems: boolean;
    onRegisterRawMaterial: (productDetails: RegisterRawMaterialPayload, supplierIds?: number[], packagingVariants?: PackagingVariantPayload[]) => Promise<boolean>;
    onUpdateRawMaterial: (productId: number, productDetails: RegisterRawMaterialPayload, supplierIds?: number[], packagingVariants?: PackagingVariantPayload[]) => Promise<boolean>;
}

export default function RawMaterialsModule({
    rawMaterials,
    suppliers,
    loadingItems,
    onRegisterRawMaterial,
    onUpdateRawMaterial
}: RawMaterialsModuleProps) {
    const dataHook = useRawMaterialsData(rawMaterials);
    const formHook = useRawMaterialForm(rawMaterials, onRegisterRawMaterial, onUpdateRawMaterial);

    return (
        <div className="space-y-4">
            <RawMaterialsHeader count={dataHook.sortedFiltered.length} />

            <RawMaterialsToolbar
                search={dataHook.search}
                setSearch={dataHook.setSearch}
                typeFilter={dataHook.typeFilter}
                setTypeFilter={dataHook.setTypeFilter}
                onOpenModal={formHook.handleOpenModal}
            />

            <RawMaterialsTable
                sortedFiltered={dataHook.sortedFiltered}
                rawMaterials={rawMaterials}
                loadingItems={loadingItems}
                expandedProductId={dataHook.expandedProductId}
                onToggleExpand={dataHook.handleToggleExpand}
                onStartEdit={formHook.handleStartEdit}
                isItemPkg={dataHook.isItemPkg}
                weightUnits={formHook.weightUnits}
                categoriesList={formHook.categoriesList}
                loadingBatches={dataHook.loadingBatches}
                inventoryDetailsError={dataHook.inventoryDetailsError}
                onRetryInventoryDetails={dataHook.retryInventoryDetails}
                groupedByBranch={dataHook.groupedByBranch}
                familyGroups={dataHook.familyGroups}
                page={dataHook.page}
                setPage={dataHook.setPage}
                pageSize={dataHook.pageSize}
                setPageSize={dataHook.setPageSize}
            />

            <RawMaterialModal
                isOpen={formHook.isModalOpen}
                onClose={formHook.handleCloseModal}
                editingItem={formHook.editingItem}
                saving={formHook.saving}
                submitError={formHook.submitError}
                loadingUnits={formHook.loadingUnits}
                units={formHook.units}
                suppliers={suppliers}
                showValidationErrors={formHook.showValidationErrors}
                validationErrors={formHook.validationErrors}
                formName={formHook.formName}
                setFormName={formHook.setFormName}
                formCode={formHook.formCode}
                setFormCode={formHook.setFormCode}
                generatedDescription={formHook.generatedDescription}
                descriptionProductName={formHook.descriptionProductName}
                formUom={formHook.formUom}
                setFormUom={formHook.setFormUom}
                formDensity={formHook.formDensity}
                setFormDensity={formHook.setFormDensity}
                formWeight={formHook.formWeight}
                formNetWeight={formHook.formNetWeight}
                setFormNetWeight={formHook.setFormNetWeight}
                formOuterCartonWeight={formHook.formOuterCartonWeight}
                setFormOuterCartonWeight={formHook.setFormOuterCartonWeight}
                formPalletWeight={formHook.formPalletWeight}
                setFormPalletWeight={formHook.setFormPalletWeight}
                formWeightUnitId={formHook.formWeightUnitId}
                setFormWeightUnitId={formHook.setFormWeightUnitId}
                formBrand={formHook.formBrand}
                setFormBrand={formHook.setFormBrand}
                formCategory={formHook.formCategory}
                setFormCategory={formHook.setFormCategory}
                formItemGroupId={formHook.formItemGroupId}
                setFormItemGroupId={formHook.setFormItemGroupId}
                formTaxRateId={formHook.formTaxRateId}
                setFormTaxRateId={formHook.setFormTaxRateId}
                formRegulatoryCode={formHook.formRegulatoryCode}
                setFormRegulatoryCode={formHook.setFormRegulatoryCode}
                formRegulatoryNotes={formHook.formRegulatoryNotes}
                setFormRegulatoryNotes={formHook.setFormRegulatoryNotes}
                formPriceControl={formHook.formPriceControl}
                formBarcode={formHook.formBarcode}
                setFormBarcode={formHook.setFormBarcode}
                formMaintainingQuantity={formHook.formMaintainingQuantity}
                setFormMaintainingQuantity={formHook.setFormMaintainingQuantity}
                formProductImage={formHook.formProductImage}
                setFormProductImage={formHook.setFormProductImage}
                formPurchaseQa={formHook.formPurchaseQa}
                setFormPurchaseQa={formHook.setFormPurchaseQa}
                purchaseQaParameters={formHook.purchaseQaParameters}
                loadingPurchaseQa={formHook.loadingPurchaseQa}
                purchaseQaError={formHook.purchaseQaError}
                formProductType={formHook.formProductType}
                setFormProductType={formHook.setFormProductType}
                classificationLocked={formHook.classificationLocked}
                inheritedProductType={formHook.inheritedProductType}
                classificationLockMessage={formHook.classificationLockMessage}
                parentSelectionLocked={formHook.parentSelectionLocked}
                parentSelectionLockMessage={formHook.parentSelectionLockMessage}
                parentRelationshipError={formHook.parentRelationshipError}
                formIsActive={formHook.formIsActive}
                setFormIsActive={formHook.setFormIsActive}
                formParentId={formHook.formParentId}
                setFormParentId={formHook.setFormParentId}
                clearParentSelection={formHook.clearParentSelection}
                formUomCount={formHook.formUomCount}
                setFormUomCount={formHook.setFormUomCount}
                selectedSupplierIds={formHook.selectedSupplierIds}
                handleToggleSupplier={formHook.handleToggleSupplier}
                packagingVariants={formHook.packagingVariants}
                handleAddVariant={formHook.handleAddVariant}
                handleAddPresetVariant={formHook.handleAddPresetVariant}
                handleUpdateVariant={formHook.handleUpdateVariant}
                handleRemoveVariant={formHook.handleRemoveVariant}
                cascadeToChildren={formHook.cascadeToChildren}
                setCascadeToChildren={formHook.setCascadeToChildren}
                uomOptions={formHook.uomOptions}
                weightUnitOptions={formHook.weightUnitOptions}
                parentProductOptions={formHook.parentProductOptions}
                brandsList={formHook.brandsList}
                categoriesList={formHook.categoriesList}
                itemGroupsList={formHook.itemGroupsList}
                taxRatesList={formHook.taxRatesList}
                handleCreateBrand={formHook.handleCreateBrand}
                handleCreateCategory={formHook.handleCreateCategory}
                onSubmit={formHook.handleFormSubmit}
                onSaveClick={formHook.handleSaveClick}
            />
        </div>
    );
}
