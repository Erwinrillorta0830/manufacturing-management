import React from "react";
import { X, Plus, Trash2, Loader2, Layers } from "lucide-react";
import { 
    RawMaterialItem, 
    SupplierItem, 
    SelectOption,
    PackagingVariantFormState,
    PurchaseQaConfig,
    PurchaseQaParameter
} from "../types/raw-materials.types";
import { CreatableSelect } from "../../../finished-goods/components/CreatableSelect";
import { ProductImageField } from "./ProductImageField";
import { PurchaseQaEditor } from "./PurchaseQaEditor";

interface RawMaterialModalProps {
    isOpen: boolean;
    onClose: () => void;
    editingItem: RawMaterialItem | null;
    saving: boolean;
    submitError: string | null;
    loadingUnits: boolean;
    suppliers: SupplierItem[];
    showValidationErrors: boolean;
    formName: string;
    setFormName: (v: string) => void;
    formCode: string;
    setFormCode: (v: string) => void;
    formDesc: string;
    setFormDesc: (v: string) => void;
    formUom: number | "";
    setFormUom: (v: number | "") => void;
    formDensity: string;
    setFormDensity: (v: string) => void;
    formWeight: string;
    formNetWeight: string;
    setFormNetWeight: (v: string) => void;
    formOuterCartonWeight: string;
    setFormOuterCartonWeight: (v: string) => void;
    formPalletWeight: string;
    setFormPalletWeight: (v: string) => void;
    formWeightUnitId: number | "";
    setFormWeightUnitId: (v: number | "") => void;
    formBrand: string;
    setFormBrand: (v: string) => void;
    formCategory: string;
    setFormCategory: (v: string) => void;
    formBarcode: string;
    setFormBarcode: (v: string) => void;
    formMaintainingQuantity: string;
    setFormMaintainingQuantity: (v: string) => void;
    formProductImage: string | null;
    setFormProductImage: (v: string | null) => void;
    formPurchaseQa: PurchaseQaConfig;
    setFormPurchaseQa: (v: PurchaseQaConfig) => void;
    purchaseQaParameters: PurchaseQaParameter[];
    loadingPurchaseQa: boolean;
    purchaseQaReady: boolean;
    purchaseQaError: string | null;
    formProductType: number;
    setFormProductType: (v: number) => void;
    classificationLocked: boolean;
    inheritedProductType?: number | null;
    classificationLockMessage: string;
    parentSelectionLocked: boolean;
    parentSelectionLockMessage: string;
    parentRelationshipError: string | null;
    formIsActive: boolean;
    setFormIsActive: (v: boolean) => void;
    formParentId: string;
    setFormParentId: (v: string) => void;
    clearParentSelection: () => void;
    formUomCount: string;
    setFormUomCount: (v: string) => void;
    selectedSupplierIds: number[];
    handleToggleSupplier: (id: number) => void;
    supplierSearch: string;
    setSupplierSearch: (v: string) => void;
    packagingVariants: PackagingVariantFormState[];
    handleAddVariant: () => void;
    handleAddPresetVariant?: (presetType: "bag25" | "sack50" | "drum200" | "ibc1000" | "fibc1000" | "case12") => void;
    handleUpdateVariant: (idx: number, field: string, value: unknown) => void;
    handleRemoveVariant: (idx: number) => void;
    cascadeToChildren?: boolean;
    setCascadeToChildren?: (v: boolean) => void;
    uomOptions: SelectOption[];
    weightUnitOptions: SelectOption[];
    parentProductOptions: SelectOption[];
    brandsList: SelectOption[];
    categoriesList: SelectOption[];
    handleCreateBrand: (name: string) => void;
    handleCreateCategory: (name: string) => void;
    onSubmit: (e: React.FormEvent) => void;
}

export function RawMaterialModal({
    isOpen,
    onClose,
    editingItem,
    saving,
    submitError,
    suppliers,
    showValidationErrors,
    formName,
    setFormName,
    formCode,
    setFormCode,
    formDesc,
    setFormDesc,
    formUom,
    setFormUom,
    formDensity,
    setFormDensity,
    formWeight,
    formNetWeight,
    setFormNetWeight,
    formOuterCartonWeight,
    setFormOuterCartonWeight,
    formPalletWeight,
    setFormPalletWeight,
    formWeightUnitId,
    setFormWeightUnitId,
    formBrand,
    setFormBrand,
    formCategory,
    setFormCategory,
    formBarcode,
    setFormBarcode,
    formMaintainingQuantity,
    setFormMaintainingQuantity,
    formProductImage,
    setFormProductImage,
    formPurchaseQa,
    setFormPurchaseQa,
    purchaseQaParameters,
    loadingPurchaseQa,
    purchaseQaReady,
    purchaseQaError,
    formProductType,
    setFormProductType,
    classificationLocked,
    inheritedProductType,
    classificationLockMessage,
    parentSelectionLocked,
    parentSelectionLockMessage,
    parentRelationshipError,
    formIsActive,
    setFormIsActive,
    formParentId,
    setFormParentId,
    clearParentSelection,
    formUomCount,
    setFormUomCount,
    selectedSupplierIds,
    handleToggleSupplier,
    supplierSearch,
    setSupplierSearch,
    packagingVariants,
    handleAddVariant,
    handleAddPresetVariant,
    handleUpdateVariant,
    handleRemoveVariant,
    cascadeToChildren = true,
    setCascadeToChildren,
    uomOptions,
    weightUnitOptions,
    parentProductOptions,
    brandsList,
    categoriesList,
    handleCreateBrand,
    handleCreateCategory,
    onSubmit
}: RawMaterialModalProps) {
    if (!isOpen) return null;

    const filteredSuppliers = suppliers.filter(s =>
        s.supplier_name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
        s.supplier_shortcut?.toLowerCase().includes(supplierSearch.toLowerCase())
    );
    const isPackagingMaterial = Number(formProductType) === 390;
    const classificationLabel = isPackagingMaterial ? "Packaging Material" : "Raw Material / Ingredient";
    const hasNetWeightValue = formNetWeight.trim() !== "";
    const hasOuterCartonWeightValue = formOuterCartonWeight.trim() !== "";
    const hasPalletWeightValue = formPalletWeight.trim() !== "";
    const hasWeightComponents = hasNetWeightValue || hasOuterCartonWeightValue || hasPalletWeightValue;
    const hasWeightUnitValue = formWeightUnitId !== "";
    const isNetWeightInvalid = hasNetWeightValue && (!Number.isFinite(Number(formNetWeight)) || Number(formNetWeight) < 0);
    const isOuterCartonWeightInvalid = hasOuterCartonWeightValue && (!Number.isFinite(Number(formOuterCartonWeight)) || Number(formOuterCartonWeight) < 0);
    const isPalletWeightInvalid = hasPalletWeightValue && (!Number.isFinite(Number(formPalletWeight)) || Number(formPalletWeight) < 0);
    const isWeightUnitInvalid = hasWeightUnitValue && (!Number.isFinite(Number(formWeightUnitId)) || Number(formWeightUnitId) <= 0);
    const componentValuesComplete = hasNetWeightValue && hasOuterCartonWeightValue && hasPalletWeightValue;
    const calculatedGrossWeight = componentValuesComplete && !isNetWeightInvalid && !isOuterCartonWeightInvalid && !isPalletWeightInvalid
        ? Number(formNetWeight) + Number(formOuterCartonWeight) + Number(formPalletWeight)
        : Number(formWeight) || 0;
    const weightComponentsHaveError = showValidationErrors && (
        isPackagingMaterial
            ? !componentValuesComplete || !hasWeightUnitValue || isNetWeightInvalid || isOuterCartonWeightInvalid || isPalletWeightInvalid || calculatedGrossWeight <= 0
            : hasWeightComponents && (!componentValuesComplete || !hasWeightUnitValue || isNetWeightInvalid || isOuterCartonWeightInvalid || isPalletWeightInvalid)
    );
    const weightUnitHasError = showValidationErrors && (
        isPackagingMaterial
            ? !hasWeightUnitValue || isWeightUnitInvalid
            : (hasWeightComponents && !hasWeightUnitValue) || isWeightUnitInvalid
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-background/80 backdrop-blur-xs animate-in fade-in duration-200">
            <div className="bg-card border w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[95vh]">
                {/* Modal Header */}
                <div className="px-5 py-3 border-b flex items-center justify-between bg-muted/20">
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                            <Layers className="h-4 w-4" />
                        </div>
                        <div>
                            <h3 className="font-extrabold text-sm text-foreground">
                                {editingItem ? `Edit Family Product: ${editingItem.product_name}` : "Register Material / Packaging Family"}
                            </h3>
                            <p className="text-[10px] text-muted-foreground">Manage base raw material specifications, packaging variants, density, and approved suppliers.</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors cursor-pointer border-none bg-transparent"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {submitError && (
                    <div role="alert" className="mx-4 mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700">
                        <p className="font-bold">Unable to save material</p>
                        <p>{submitError}</p>
                    </div>
                )}

                {/* Single Page Form Container */}
                <form onSubmit={onSubmit} className="p-4 space-y-3 overflow-y-auto flex-1 text-xs">
                    {/* Item Classification Pill Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-muted/20 border p-2 rounded-xl">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider pl-1">Classification:</span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setFormProductType(389)}
                                disabled={classificationLocked}
                                aria-disabled={classificationLocked}
                                className={`px-4 py-1.5 rounded-lg border text-xs font-extrabold transition-all ${classificationLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${
                                    formProductType === 389 
                                        ? "bg-amber-500/10 border-amber-500 text-amber-600 shadow-xs" 
                                        : "bg-card border-border text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                Raw Material / Ingredient
                            </button>
                            <button
                                type="button"
                                onClick={() => setFormProductType(390)}
                                disabled={classificationLocked}
                                aria-disabled={classificationLocked}
                                className={`px-4 py-1.5 rounded-lg border text-xs font-extrabold transition-all ${classificationLocked ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${
                                    formProductType === 390 
                                        ? "bg-purple-500/10 border-purple-500 text-purple-600 shadow-xs" 
                                        : "bg-card border-border text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                Packaging Material
                            </button>
                        </div>
                        {classificationLocked && (
                            <span className="basis-full text-[10px] font-semibold text-muted-foreground">
                                {classificationLockMessage} {inheritedProductType ? `Current value: ${classificationLabel}.` : ""}
                            </span>
                        )}
                        <label className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-extrabold cursor-pointer ${formIsActive ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-700" : "bg-rose-500/10 border-rose-500/25 text-rose-700"}`}>
                            <input
                                type="checkbox"
                                checked={formIsActive}
                                onChange={e => setFormIsActive(e.target.checked)}
                                className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                            />
                            {formIsActive ? "Active SKU" : "Inactive SKU"}
                        </label>
                    </div>

                    {/* Core Identifiers Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <div className="sm:col-span-2 space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                                Material Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Sodium Chloride Powder"
                                value={formName}
                                onChange={e => setFormName(e.target.value)}
                                className={`w-full p-2 border rounded-lg text-xs bg-background outline-none focus:ring-1 focus:ring-primary ${showValidationErrors && !formName.trim() ? "border-red-500" : ""}`}
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                                SKU Code <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. RM-SOD-001"
                                value={formCode}
                                onChange={e => setFormCode(e.target.value)}
                                className={`w-full p-2 border rounded-lg text-xs font-mono font-bold bg-background outline-none focus:ring-1 focus:ring-primary ${showValidationErrors && !formCode.trim() ? "border-red-500" : ""}`}
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                                Category <span className="text-red-500">*</span>
                            </label>
                            <CreatableSelect
                                options={categoriesList}
                                value={formCategory}
                                onValueChange={(val: string) => setFormCategory(val)}
                                onCreateOption={handleCreateCategory}
                                placeholder="Category..."
                                className="h-8.5 text-xs"
                            />
                        </div>
                    </div>

                    {/* Operational Controls */}
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 bg-muted/10 p-3 rounded-xl border">
                        <div className="space-y-1 sm:col-span-2">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                Barcode <span className="text-muted-foreground normal-case font-medium">(Optional)</span>
                            </label>
                            <input
                                type="text"
                                value={formBarcode}
                                onChange={event => setFormBarcode(event.target.value)}
                                placeholder="Scan or enter barcode"
                                className="w-full p-1.5 border rounded-lg text-xs font-mono bg-background outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                Safety Stock
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={formMaintainingQuantity}
                                onChange={event => setFormMaintainingQuantity(event.target.value)}
                                className="w-full p-1.5 border rounded-lg text-xs font-bold bg-background outline-none focus:ring-1 focus:ring-primary"
                            />
                        </div>

                        <ProductImageField value={formProductImage} onChange={setFormProductImage} />
                    </div>

                    <PurchaseQaEditor
                        config={formPurchaseQa}
                        parameters={purchaseQaParameters}
                        loading={loadingPurchaseQa}
                        error={purchaseQaError}
                        onChange={setFormPurchaseQa}
                    />

                    {/* Measurements & Properties 6-Column Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 bg-muted/10 p-3 rounded-xl border">
                        <div className="space-y-1">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                Primary UOM <span className="text-red-500">*</span>
                            </label>
                            <CreatableSelect
                                options={uomOptions}
                                value={String(formUom)}
                                onValueChange={(val: string) => setFormUom(Number(val))}
                                placeholder="UOM..."
                                className={`h-8 text-xs ${showValidationErrors && !formUom ? "border-red-500" : ""}`}
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                UOM Ratio <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="number"
                                step="any"
                                value={formUomCount}
                                onChange={e => setFormUomCount(e.target.value)}
                                className={`w-full p-1.5 border rounded-lg text-xs font-bold bg-background outline-none focus:ring-1 focus:ring-primary ${showValidationErrors && (!formUomCount || !Number.isFinite(Number(formUomCount)) || Number(formUomCount) <= 0) ? "border-red-500" : ""}`}
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                Density (g/mL) <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="number"
                                step="any"
                                value={formDensity}
                                onChange={e => setFormDensity(e.target.value)}
                                className={`w-full p-1.5 border rounded-lg text-xs font-bold bg-background outline-none focus:ring-1 focus:ring-primary ${showValidationErrors && (!formDensity || !Number.isFinite(Number(formDensity)) || Number(formDensity) <= 0) ? "border-red-500" : ""}`}
                                required
                            />
                        </div>

                        <div className="col-span-2 sm:col-span-6 grid grid-cols-2 sm:grid-cols-5 gap-2.5 border-t pt-2">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                    Net Weight {isPackagingMaterial ? <span className="text-red-500">*</span> : <span className="text-muted-foreground normal-case font-medium">(Optional)</span>}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="25.00"
                                    value={formNetWeight}
                                    onChange={e => setFormNetWeight(e.target.value)}
                                    className={`w-full p-1.5 border rounded-lg text-xs font-bold bg-background outline-none focus:ring-1 focus:ring-primary ${weightComponentsHaveError && (!componentValuesComplete || isNetWeightInvalid) ? "border-red-500" : ""}`}
                                    required={isPackagingMaterial}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                    Outer Carton Weight {isPackagingMaterial ? <span className="text-red-500">*</span> : <span className="text-muted-foreground normal-case font-medium">(Optional)</span>}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="0.00"
                                    value={formOuterCartonWeight}
                                    onChange={e => setFormOuterCartonWeight(e.target.value)}
                                    className={`w-full p-1.5 border rounded-lg text-xs font-bold bg-background outline-none focus:ring-1 focus:ring-primary ${weightComponentsHaveError && (!componentValuesComplete || isOuterCartonWeightInvalid) ? "border-red-500" : ""}`}
                                    required={isPackagingMaterial}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                    Pallet Weight {isPackagingMaterial ? <span className="text-red-500">*</span> : <span className="text-muted-foreground normal-case font-medium">(Optional)</span>}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="0.00"
                                    value={formPalletWeight}
                                    onChange={e => setFormPalletWeight(e.target.value)}
                                    className={`w-full p-1.5 border rounded-lg text-xs font-bold bg-background outline-none focus:ring-1 focus:ring-primary ${weightComponentsHaveError && (!componentValuesComplete || isPalletWeightInvalid) ? "border-red-500" : ""}`}
                                    required={isPackagingMaterial}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                    Gross Weight <span className="text-muted-foreground normal-case font-medium">(Calculated)</span>
                                </label>
                                <input
                                    type="text"
                                    readOnly
                                    value={calculatedGrossWeight > 0 ? calculatedGrossWeight.toFixed(3) : ""}
                                    className={`w-full p-1.5 border rounded-lg text-xs font-bold bg-muted/50 outline-none ${weightComponentsHaveError && calculatedGrossWeight <= 0 ? "border-red-500" : ""}`}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                    Weight Unit {isPackagingMaterial ? <span className="text-red-500">*</span> : <span className="text-muted-foreground normal-case font-medium">(Optional)</span>}
                                </label>
                                <CreatableSelect
                                    options={weightUnitOptions}
                                    value={String(formWeightUnitId)}
                                    onValueChange={(val: string) => setFormWeightUnitId(Number(val))}
                                    placeholder="Unit..."
                                    className={`h-8 text-xs ${weightUnitHasError ? "border-red-500" : ""}`}
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                Brand
                            </label>
                            <CreatableSelect
                                options={brandsList}
                                value={formBrand}
                                onValueChange={(val: string) => setFormBrand(val)}
                                onCreateOption={handleCreateBrand}
                                placeholder="Brand..."
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>

                    {/* Relationships & Suppliers Split Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Left Column: Parent & Description */}
                        <div className="space-y-2">
                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                    Parent Material (For Multi-UOM Pack Variants)
                                </label>
                                <div className="flex items-center gap-1">
                                    <div className="min-w-0 flex-1">
                                        <CreatableSelect
                                            options={parentProductOptions}
                                            value={formParentId}
                                            onValueChange={(val: string) => setFormParentId(val)}
                                            placeholder="None (Standalone Base Parent)"
                                            className="h-8 text-xs"
                                            disabled={parentSelectionLocked}
                                            aria-describedby={parentSelectionLocked ? "raw-material-parent-lock-message" : undefined}
                                        />
                                    </div>
                                    {formParentId && !parentSelectionLocked && (
                                        <button
                                            type="button"
                                            onClick={clearParentSelection}
                                            aria-label="Clear parent material"
                                            title="Clear parent material"
                                            className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                                {parentSelectionLocked && (
                                    <p id="raw-material-parent-lock-message" className="text-[10px] font-semibold text-muted-foreground">
                                        {parentSelectionLockMessage}
                                    </p>
                                )}
                                {parentRelationshipError && (
                                    <p role="alert" className="text-[10px] font-semibold text-rose-700">
                                        {parentRelationshipError} Clear the parent selection before saving.
                                    </p>
                                )}
                            </div>

                            <div className="space-y-1">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Notes & Description</label>
                                <input
                                    type="text"
                                    placeholder="Add safety notes, storage instructions, or chemical details..."
                                    value={formDesc}
                                    onChange={e => setFormDesc(e.target.value)}
                                    className="w-full p-1.5 border rounded-lg text-xs bg-background outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>
                        </div>

                        {/* Right Column: Approved Suppliers Picker */}
                        <div className="space-y-1 bg-muted/10 p-2.5 rounded-xl border flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Linked Approved Suppliers ({selectedSupplierIds.length})</label>
                                <input
                                    type="text"
                                    placeholder="Filter suppliers..."
                                    value={supplierSearch}
                                    onChange={e => setSupplierSearch(e.target.value)}
                                    className="p-1 px-2 border rounded-md text-[10px] bg-background outline-none w-36"
                                />
                            </div>
                            <div className="max-h-24 overflow-y-auto border rounded-lg p-1.5 bg-card space-y-0.5 mt-1">
                                {filteredSuppliers.map(s => {
                                    const isChecked = selectedSupplierIds.includes(s.id);
                                    return (
                                        <label key={s.id} className="flex items-center gap-2 p-1 hover:bg-muted/40 rounded cursor-pointer text-[10px]">
                                            <input
                                                type="checkbox"
                                                checked={isChecked}
                                                onChange={() => handleToggleSupplier(s.id)}
                                                className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                                            />
                                            <span className="font-bold text-foreground truncate">{s.supplier_name}</span>
                                            {s.supplier_shortcut && <span className="text-muted-foreground font-mono">({s.supplier_shortcut})</span>}
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Section: Child Packaging & Material Family Variants */}
                    {!formParentId && (
                        <div className="bg-muted/10 border border-border/40 rounded-xl p-3.5 space-y-3">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b pb-2">
                                <div className="space-y-0.5">
                                    <h4 className="text-xs font-extrabold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
                                        <Layers className="h-3.5 w-3.5 text-primary" /> Family Packaging Variants Matrix
                                    </h4>
                                    <p className="text-[10px] text-muted-foreground">
                                        Define packaged outer variants (e.g. Sacks of 25kg, Drums of 200L, Totes of 1000L) linked directly to this base parent material.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                    {editingItem && setCascadeToChildren && (
                                        <label className="flex items-center gap-1.5 bg-primary/5 px-2.5 py-1 rounded-lg border border-primary/20 text-[10px] font-bold text-primary cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={cascadeToChildren}
                                                onChange={e => setCascadeToChildren(e.target.checked)}
                                                className="rounded border-border text-primary focus:ring-primary h-3 w-3"
                                            />
                                            Sync Base Category/Brand to Family SKUs
                                        </label>
                                    )}

                                    <button
                                        type="button"
                                        onClick={handleAddVariant}
                                        className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1 cursor-pointer"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Add Custom Variant
                                    </button>
                                </div>
                            </div>

                            {/* Quick Industrial Presets Toolbar */}
                            {handleAddPresetVariant && (
                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider shrink-0 mr-1">Quick Presets:</span>
                                    <button
                                        type="button"
                                        onClick={() => handleAddPresetVariant("bag25")}
                                        className="px-2 py-1 bg-card hover:bg-muted border rounded-md text-[10px] font-bold text-foreground transition-all cursor-pointer shrink-0"
                                    >
                                        + 25kg Bag
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAddPresetVariant("sack50")}
                                        className="px-2 py-1 bg-card hover:bg-muted border rounded-md text-[10px] font-bold text-foreground transition-all cursor-pointer shrink-0"
                                    >
                                        + 50kg Sack
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAddPresetVariant("drum200")}
                                        className="px-2 py-1 bg-card hover:bg-muted border rounded-md text-[10px] font-bold text-foreground transition-all cursor-pointer shrink-0"
                                    >
                                        + 200L Drum
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAddPresetVariant("ibc1000")}
                                        className="px-2 py-1 bg-card hover:bg-muted border rounded-md text-[10px] font-bold text-foreground transition-all cursor-pointer shrink-0"
                                    >
                                        + 1000L IBC
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAddPresetVariant("fibc1000")}
                                        className="px-2 py-1 bg-card hover:bg-muted border rounded-md text-[10px] font-bold text-foreground transition-all cursor-pointer shrink-0"
                                    >
                                        + 1MT FIBC
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleAddPresetVariant("case12")}
                                        className="px-2 py-1 bg-card hover:bg-muted border rounded-md text-[10px] font-bold text-foreground transition-all cursor-pointer shrink-0"
                                    >
                                        + Case of 12
                                    </button>
                                </div>
                            )}

                            {packagingVariants.length === 0 ? (
                                <div className="p-3 border border-dashed rounded-xl bg-background/50 text-center space-y-1">
                                    <p className="text-xs text-muted-foreground italic font-medium">No child variants added yet.</p>
                                    <p className="text-[10px] text-muted-foreground/80">
                                        If this material is supplied or stocked in outer containers (e.g. Sacks, Drums, Totes), select a preset above or click <strong>&quot;+ Add Custom Variant&quot;</strong> to generate family child SKUs.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                                    {packagingVariants.map((v, vIdx) => {
                                        const matchedUom = uomOptions.find(u => u.value === String(v.uomId));
                                        const uomShortcut = matchedUom ? matchedUom.label.split("(")[1]?.replace(")", "") || matchedUom.label : "Unit";
                                        const baseUomShortcut = uomOptions.find(u => u.value === String(formUom))?.label.split("(")[1]?.replace(")", "") || "base unit";
                                        const cleanSuffix = v.codeSuffix.trim() || `${uomShortcut.toUpperCase()}${v.count}`;
                                        const variantNamePreview = formName.trim() || "Material";
                                        const variantIdentityPreview = `${variantNamePreview} - ${uomShortcut.toUpperCase()}`;
                                        const variantCodePreview = `${formCode.trim() || "SKU"}-${cleanSuffix}`;
                                        const variantComponentsComplete = v.netWeight.trim() !== "" && v.outerCartonWeight.trim() !== "" && v.palletWeight.trim() !== "";
                                        const calculatedWeight = variantComponentsComplete
                                            ? (Number(v.netWeight) + Number(v.outerCartonWeight) + Number(v.palletWeight)).toFixed(3)
                                            : null;
                                        const weightUnitName = weightUnitOptions.find(w => w.value === String(formWeightUnitId))?.label.split("(")[0]?.trim() || "";

                                        return (
                                            <div key={vIdx} className="p-3 rounded-xl border border-border bg-background space-y-2 shadow-2xs">
                                                <div className="flex items-center justify-between border-b pb-1.5">
                                                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-extrabold ${v.isExisting ? "bg-emerald-500/10 text-emerald-600" : "bg-primary/10 text-primary"}`}>
                                                            {v.isExisting ? `Existing Family SKU #${v.productId}` : `New Variant #${vIdx + 1}`}
                                                        </span>
                                                        {variantNamePreview}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveVariant(vIdx)}
                                                        className="text-red-500 hover:text-red-600 text-xs font-semibold px-2 py-0.5 hover:bg-red-500/10 rounded transition-colors flex items-center gap-1 cursor-pointer border-none bg-transparent"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" /> Remove
                                                    </button>
                                                </div>

                                                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
                                                    <span>Generated identity: <span className="font-semibold text-foreground">{variantIdentityPreview}</span></span>
                                                    <span className="font-semibold text-foreground">Classification: {classificationLabel} <span className="font-normal text-muted-foreground">(inherited)</span></span>
                                                    <label className={`flex items-center gap-1.5 px-2 py-1 rounded-md border font-bold cursor-pointer ${v.isActive ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-700" : "bg-rose-500/10 border-rose-500/25 text-rose-700"}`}>
                                                        <input
                                                            type="checkbox"
                                                            checked={v.isActive}
                                                            onChange={e => handleUpdateVariant(vIdx, "isActive", e.target.checked)}
                                                            className="rounded border-border text-primary focus:ring-primary h-3 w-3"
                                                        />
                                                        {v.isActive ? "Active SKU" : "Inactive SKU"}
                                                    </label>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                                                    <div>
                                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Outer Package UOM *</label>
                                                        <CreatableSelect
                                                            options={uomOptions}
                                                            value={String(v.uomId)}
                                                            onValueChange={(val: string) => handleUpdateVariant(vIdx, "uomId", Number(val))}
                                                            placeholder="Select Outer UOM..."
                                                            className="h-8 text-xs"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">Conversion Ratio ({baseUomShortcut}/Outer) *</label>
                                                        <input
                                                            type="number"
                                                            step="any"
                                                            placeholder="e.g. 25"
                                                            value={v.count}
                                                            onChange={e => handleUpdateVariant(vIdx, "count", e.target.value)}
                                                            className="w-full p-1.5 border rounded-lg text-xs font-bold bg-background outline-none focus:ring-1 focus:ring-primary"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">SKU Suffix *</label>
                                                        <input
                                                            type="text"
                                                            placeholder={`e.g. ${cleanSuffix}`}
                                                            value={v.codeSuffix}
                                                            onChange={e => handleUpdateVariant(vIdx, "codeSuffix", e.target.value)}
                                                            className="w-full p-1.5 border rounded-lg text-xs font-mono font-bold bg-background outline-none focus:ring-1 focus:ring-primary"
                                                        />
                                                    </div>

                                                    <div className="bg-muted/30 p-1.5 rounded-lg border text-[10px] flex flex-col justify-center">
                                                        <span className="text-muted-foreground font-bold uppercase block text-[9px]">Generated Family SKU:</span>
                                                        <span className="font-mono font-extrabold text-foreground truncate">{variantCodePreview}</span>
                                                        {calculatedWeight && (
                                                            <span className="text-muted-foreground text-[9px] mt-0.5">Est. Weight: {calculatedWeight} {weightUnitName}</span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 border-t pt-2">
                                                    <div>
                                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                                                            Net Weight {isPackagingMaterial ? <span className="text-red-500">*</span> : ""}
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="any"
                                                            placeholder="0.00"
                                                            value={v.netWeight}
                                                            onChange={e => handleUpdateVariant(vIdx, "netWeight", e.target.value)}
                                                            className="w-full p-1.5 border rounded-lg text-xs font-bold bg-background outline-none focus:ring-1 focus:ring-primary"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                                                            Outer Carton Weight {isPackagingMaterial ? <span className="text-red-500">*</span> : ""}
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="any"
                                                            placeholder="0.00"
                                                            value={v.outerCartonWeight}
                                                            onChange={e => handleUpdateVariant(vIdx, "outerCartonWeight", e.target.value)}
                                                            className="w-full p-1.5 border rounded-lg text-xs font-bold bg-background outline-none focus:ring-1 focus:ring-primary"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                                                            Pallet Weight {isPackagingMaterial ? <span className="text-red-500">*</span> : ""}
                                                        </label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="any"
                                                            placeholder="0.00"
                                                            value={v.palletWeight}
                                                            onChange={e => handleUpdateVariant(vIdx, "palletWeight", e.target.value)}
                                                            className="w-full p-1.5 border rounded-lg text-xs font-bold bg-background outline-none focus:ring-1 focus:ring-primary"
                                                        />
                                                    </div>
                                                    <div className="bg-muted/30 p-1.5 rounded-lg border text-[10px] flex flex-col justify-center">
                                                        <span className="text-muted-foreground font-bold uppercase block text-[9px]">Calculated Gross Weight:</span>
                                                        <span className="font-mono font-extrabold text-foreground">
                                                            {calculatedWeight ? `${calculatedWeight} ${weightUnitName}` : "Complete components"}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 border-t pt-2">
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                                            Barcode <span className="text-muted-foreground normal-case font-medium">(Optional)</span>
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={v.barcode}
                                                            onChange={event => handleUpdateVariant(vIdx, "barcode", event.target.value)}
                                                            placeholder="Scan or enter barcode"
                                                            className="w-full p-1.5 border rounded-lg text-xs font-mono bg-background outline-none focus:ring-1 focus:ring-primary"
                                                        />
                                                    </div>

                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Safety Stock</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="1"
                                                            value={v.maintainingQuantity}
                                                            onChange={event => handleUpdateVariant(vIdx, "maintainingQuantity", event.target.value)}
                                                            className="w-full p-1.5 border rounded-lg text-xs font-bold bg-background outline-none focus:ring-1 focus:ring-primary"
                                                        />
                                                    </div>

                                                    <ProductImageField
                                                        value={v.productImage}
                                                        onChange={value => handleUpdateVariant(vIdx, "productImage", value)}
                                                        label="Variant Image (Optional)"
                                                    />
                                                </div>

                                                <PurchaseQaEditor
                                                    config={v.purchaseQa}
                                                    parameters={purchaseQaParameters}
                                                    loading={loadingPurchaseQa}
                                                    error={purchaseQaError}
                                                    onChange={config => handleUpdateVariant(vIdx, "purchaseQa", config)}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Footer Action Buttons */}
                    <div className="flex items-center justify-between pt-2 border-t">
                        <div></div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-1.5 border rounded-lg text-xs font-bold bg-muted hover:bg-muted/80 text-foreground cursor-pointer transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={saving || loadingPurchaseQa || !purchaseQaReady || Boolean(parentRelationshipError)}
                                className="px-5 py-1.5 border border-transparent rounded-lg text-xs font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-xs cursor-pointer transition-all flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="h-3.5 w-3.5" /> Save Family Material
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
