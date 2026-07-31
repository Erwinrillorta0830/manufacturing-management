import React from "react";
import { X, Plus, Trash2, Loader2, Layers } from "lucide-react";
import { 
    RawMaterialItem, 
    SupplierItem, 
    SelectOption 
} from "../types/raw-materials.types";
import { CreatableSelect } from "../../../finished-goods/components/CreatableSelect";

interface RawMaterialModalProps {
    isOpen: boolean;
    onClose: () => void;
    editingItem: RawMaterialItem | null;
    saving: boolean;
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
    setFormWeight: (v: string) => void;
    formWeightUnitId: number | "";
    setFormWeightUnitId: (v: number | "") => void;
    formBrand: string;
    setFormBrand: (v: string) => void;
    formCategory: string;
    setFormCategory: (v: string) => void;
    formProductType: number;
    setFormProductType: (v: number) => void;
    formParentId: string;
    setFormParentId: (v: string) => void;
    formUomCount: string;
    setFormUomCount: (v: string) => void;
    selectedSupplierIds: number[];
    handleToggleSupplier: (id: number) => void;
    supplierSearch: string;
    setSupplierSearch: (v: string) => void;
    packagingVariants: Array<{ uomId: number | ""; count: string; codeSuffix: string }>;
    handleAddVariant: () => void;
    handleUpdateVariant: (idx: number, field: string, value: string | number) => void;
    handleRemoveVariant: (idx: number) => void;
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
    setFormWeight,
    formWeightUnitId,
    setFormWeightUnitId,
    formBrand,
    setFormBrand,
    formCategory,
    setFormCategory,
    formProductType,
    setFormProductType,
    formParentId,
    setFormParentId,
    formUomCount,
    setFormUomCount,
    selectedSupplierIds,
    handleToggleSupplier,
    supplierSearch,
    setSupplierSearch,
    packagingVariants,
    handleAddVariant,
    handleUpdateVariant,
    handleRemoveVariant,
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
                                {editingItem ? `Edit Material: ${editingItem.product_name}` : "Register Material / Packaging SKU"}
                            </h3>
                            <p className="text-[10px] text-muted-foreground">Manage raw material attributes, density, gross weight, and approved vendors.</p>
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

                {/* Single Page Form Container */}
                <form onSubmit={onSubmit} className="p-4 space-y-3 overflow-y-auto flex-1 text-xs">
                    {/* Item Classification Pill Buttons */}
                    <div className="flex items-center justify-between bg-muted/20 border p-2 rounded-xl">
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider pl-1">Classification:</span>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setFormProductType(389)}
                                className={`px-4 py-1.5 rounded-lg border text-xs font-extrabold transition-all cursor-pointer ${
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
                                className={`px-4 py-1.5 rounded-lg border text-xs font-extrabold transition-all cursor-pointer ${
                                    formProductType === 390 
                                        ? "bg-purple-500/10 border-purple-500 text-purple-600 shadow-xs" 
                                        : "bg-card border-border text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                Packaging Material
                            </button>
                        </div>
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
                                className="h-8 text-xs"
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
                                className="w-full p-1.5 border rounded-lg text-xs font-bold bg-background outline-none focus:ring-1 focus:ring-primary"
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
                                className="w-full p-1.5 border rounded-lg text-xs font-bold bg-background outline-none focus:ring-1 focus:ring-primary"
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                Gross Weight <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="number"
                                step="any"
                                placeholder="25.00"
                                value={formWeight}
                                onChange={e => setFormWeight(e.target.value)}
                                className={`w-full p-1.5 border rounded-lg text-xs font-bold bg-background outline-none focus:ring-1 focus:ring-primary ${showValidationErrors && (!formWeight || parseFloat(formWeight) <= 0) ? "border-red-500" : ""}`}
                                required
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">
                                Weight Unit <span className="text-red-500">*</span>
                            </label>
                            <CreatableSelect
                                options={weightUnitOptions}
                                value={String(formWeightUnitId)}
                                onValueChange={(val: string) => setFormWeightUnitId(Number(val))}
                                placeholder="Unit..."
                                className="h-8 text-xs"
                            />
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
                                <CreatableSelect
                                    options={parentProductOptions}
                                    value={formParentId}
                                    onValueChange={(val: string) => setFormParentId(val)}
                                    placeholder="None (Standalone Parent)"
                                    className="h-8 text-xs"
                                />
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

                    {/* Packaging Variants Inline Row (If Registering & Added) */}
                    {!editingItem && packagingVariants.length > 0 && (
                        <div className="border rounded-xl p-2.5 bg-card space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-wider text-primary">Packaging Variants to Auto-Generate ({packagingVariants.length})</span>
                                <button
                                    type="button"
                                    onClick={handleAddVariant}
                                    className="bg-primary/10 hover:bg-primary/20 text-primary text-[10px] font-bold px-2 py-0.5 rounded border-none cursor-pointer"
                                >
                                    + Add Variant
                                </button>
                            </div>
                            <div className="space-y-1.5 max-h-24 overflow-y-auto">
                                {packagingVariants.map((v, vIdx) => (
                                    <div key={vIdx} className="grid grid-cols-4 gap-2 items-center bg-muted/20 p-1.5 rounded-lg border text-[10px]">
                                        <CreatableSelect
                                            options={uomOptions}
                                            value={String(v.uomId)}
                                            onValueChange={(val: string) => handleUpdateVariant(vIdx, "uomId", Number(val))}
                                            placeholder="UOM..."
                                            className="h-7 text-[10px]"
                                        />
                                        <input
                                            type="number"
                                            step="any"
                                            placeholder="Count ratio"
                                            value={v.count}
                                            onChange={e => handleUpdateVariant(vIdx, "count", e.target.value)}
                                            className="p-1 border rounded text-[10px] bg-background outline-none font-bold"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Suffix"
                                            value={v.codeSuffix}
                                            onChange={e => handleUpdateVariant(vIdx, "codeSuffix", e.target.value)}
                                            className="p-1 border rounded text-[10px] bg-background outline-none font-mono"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveVariant(vIdx)}
                                            className="p-1 text-rose-500 hover:bg-rose-500/10 rounded cursor-pointer border-none bg-transparent justify-self-end"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Footer Action Buttons */}
                    <div className="flex items-center justify-between pt-2 border-t">
                        <div>
                            {!editingItem && packagingVariants.length === 0 && (
                                <button
                                    type="button"
                                    onClick={handleAddVariant}
                                    className="text-[10px] font-bold text-primary hover:underline bg-transparent border-none cursor-pointer flex items-center gap-1"
                                >
                                    <Plus className="h-3 w-3" /> Auto-generate packaging variants (e.g. Sacks, Drums)
                                </button>
                            )}
                        </div>
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
                                disabled={saving}
                                className="px-5 py-1.5 border border-transparent rounded-lg text-xs font-bold bg-primary hover:bg-primary/95 text-primary-foreground shadow-xs cursor-pointer transition-all flex items-center gap-1.5"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                                    </>
                                ) : (
                                    <>
                                        <Plus className="h-3.5 w-3.5" /> Save Material
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
