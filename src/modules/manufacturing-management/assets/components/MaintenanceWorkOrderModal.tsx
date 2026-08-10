"use client";

import React from "react";
import { Settings, Check, Upload, Loader2, Info, Calendar, User, Edit } from "lucide-react";
import { AssetRecord, DepartmentRecord } from "@/modules/manufacturing-management/finished-goods/types";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { formatCurrency, formatDateLong } from "@/lib/utils";
import { CatalogItem } from "../AssetsModule";

interface MaintenanceWorkOrderModalProps {
    isModalOpen: boolean;
    setIsModalOpen: (open: boolean) => void;
    editingAsset: AssetRecord | null;
    isViewModalOpen: boolean;
    setIsViewModalOpen: (open: boolean) => void;
    viewingAsset: AssetRecord | null;
    items: CatalogItem[];
    departments: DepartmentRecord[];
    itemSearch: string;
    setItemSearch: (search: string) => void;
    isItemDropdownOpen: boolean;
    setIsItemDropdownOpen: (open: boolean) => void;
    filteredItems: CatalogItem[];
    selectedItemId: number | null;
    setSelectedItemId: (id: number | null) => void;
    selectedDeptId: number | null;
    setSelectedDeptId: (id: number | null) => void;
    costPerItem: string;
    setCostPerItem: (cost: string) => void;
    lifeSpan: string;
    setLifeSpan: (span: string) => void;
    condition: AssetRecord["condition"];
    setCondition: (condition: AssetRecord["condition"]) => void;
    dateAcquired: string;
    setDateAcquired: (date: string) => void;
    itemImage: string;
    imageFilename: string;
    uploadingImage: boolean;
    handleImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    barcode: string;
    setBarcode: (barcode: string) => void;
    isDuplicateBarcode: boolean;
    rfidCode: string;
    setRfidCode: (code: string) => void;
    isDuplicateRfid: boolean;
    isActiveWarning: boolean;
    setIsActiveWarning: (warn: boolean) => void;
    isActive: boolean;
    setIsActive: (active: boolean) => void;
    validationAttempted: boolean;
    setValidationAttempted: (val: boolean) => void;
    saving: boolean;
    handleSave: (e: React.FormEvent) => void;
    handleOpenNewItemSubModal: () => void;
    handleOpenEditModal: (asset: AssetRecord, isFromView?: boolean) => void;
    setPreviewImage: (url: string | null) => void;
    handleCloseItemDropdown: () => void;
    isTransitioning: boolean;
}

export function MaintenanceWorkOrderModal({
    isModalOpen,
    setIsModalOpen,
    editingAsset,
    isViewModalOpen,
    setIsViewModalOpen,
    viewingAsset,
    items,
    departments,
    itemSearch,
    setItemSearch,
    isItemDropdownOpen,
    setIsItemDropdownOpen,
    filteredItems,
    selectedItemId,
    setSelectedItemId,
    selectedDeptId,
    setSelectedDeptId,
    costPerItem,
    setCostPerItem,
    lifeSpan,
    setLifeSpan,
    condition,
    setCondition,
    dateAcquired,
    setDateAcquired,
    itemImage,
    imageFilename,
    uploadingImage,
    handleImageUpload,
    barcode,
    setBarcode,
    isDuplicateBarcode,
    rfidCode,
    setRfidCode,
    isDuplicateRfid,
    isActiveWarning,
    setIsActiveWarning,
    isActive,
    setIsActive,
    validationAttempted,
    setValidationAttempted,
    saving,
    handleSave,
    handleOpenNewItemSubModal,
    handleOpenEditModal,
    setPreviewImage,
    handleCloseItemDropdown,
    isTransitioning
}: MaintenanceWorkOrderModalProps) {
    return (
        <>
            {/* Create / Edit Modal popup */}
            {isModalOpen && (
                <div className={`fixed inset-0 flex items-center justify-center ${isViewModalOpen ? "z-[52]" : "z-50"} bg-black/80 backdrop-blur-md ${isTransitioning ? "" : "animate-in fade-in duration-100"}`}>
                    <div className="bg-card border border-border/85 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-muted/20">
                            <div className="flex items-center gap-2">
                                <Settings className="h-5 w-5 text-primary" />
                                <div>
                                    <h3 className="text-base font-bold text-foreground">
                                        {editingAsset ? "Edit Asset / Equipment" : "Register Asset / Equipment"}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">Log machinery specs, costs, location department, and condition.</p>
                                </div>
                            </div>
                        </div>

                        {/* Modal Form Body */}
                        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
                            {/* Searchable dropdown: Item Select */}
                            <div className="space-y-1 relative">
                                <div className="flex justify-between items-center mb-1">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase block">Catalog Item <span className="text-destructive">*</span></label>
                                    <button
                                        type="button"
                                        onClick={handleOpenNewItemSubModal}
                                        className="text-[10px] text-primary hover:underline font-bold"
                                    >
                                        + New Item
                                    </button>
                                </div>
                                <div className="relative">
                                    <input
                                        type="text"
                                        required
                                        placeholder="Search item name or code..."
                                        value={itemSearch}
                                        onChange={e => {
                                            setItemSearch(e.target.value);
                                            setIsItemDropdownOpen(true);
                                        }}
                                        onFocus={() => setIsItemDropdownOpen(true)}
                                        onKeyDown={e => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                if (filteredItems.length > 0) {
                                                    const firstItem = filteredItems[0];
                                                    setSelectedItemId(firstItem.id);
                                                    setItemSearch(firstItem.item_name);
                                                    setIsItemDropdownOpen(false);
                                                }
                                            } else if (e.key === "Tab" || e.key === "Escape") {
                                                const matchedItem = items.find(i => i.id === selectedItemId);
                                                setItemSearch(matchedItem ? matchedItem.item_name : "");
                                                setIsItemDropdownOpen(false);
                                            }
                                        }}
                                        className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 transition-all ${validationAttempted && !selectedItemId ? "border-destructive focus:ring-destructive focus:ring-1" : "border-border focus:ring-primary"}`}
                                    />
                                    {selectedItemId && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedItemId(null);
                                                setItemSearch("");
                                            }}
                                            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground font-bold text-lg leading-none"
                                        >
                                            &times;
                                        </button>
                                    )}
                                </div>

                                {isItemDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={handleCloseItemDropdown} />
                                        <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg bg-card border border-border shadow-lg py-1 z-20 text-xs">
                                            {filteredItems.length === 0 ? (
                                                <div className="px-3 py-2 text-muted-foreground italic">No matching catalog items found.</div>
                                            ) : (
                                                filteredItems.map(item => {
                                                    const label = item.item_name;
                                                    return (
                                                        <button
                                                            key={item.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedItemId(item.id);
                                                                setItemSearch(label);
                                                                setIsItemDropdownOpen(false);
                                                            }}
                                                            className="w-full text-left px-3 py-2 hover:bg-muted text-foreground flex items-center justify-between"
                                                        >
                                                            <span>{label}</span>
                                                            {selectedItemId === item.id && <Check className="h-3.5 w-3.5 text-primary" />}
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Owner Department */}
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Owner Department</label>
                                <Select
                                    value={selectedDeptId ? String(selectedDeptId) : "none"}
                                    onValueChange={(val) => {
                                        if (val === "none") {
                                            setSelectedDeptId(null);
                                        } else {
                                            setSelectedDeptId(Number(val));
                                        }
                                    }}
                                >
                                    <SelectTrigger className="w-full h-[38px] rounded-lg bg-background border border-border text-foreground text-sm">
                                        <SelectValue placeholder="Select department..." />
                                    </SelectTrigger>
                                    <SelectContent position="popper" sideOffset={4} className="bg-popover border border-border text-foreground">
                                        <SelectItem value="none">None</SelectItem>
                                        {departments.map((dept) => (
                                            <SelectItem key={dept.department_id} value={String(dept.department_id)}>
                                                {dept.department_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Total Cost and Useful Lifespan */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Total Cost (₱) <span className="text-destructive">*</span></label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        required
                                        value={costPerItem}
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (val === "" || Number(val) >= 0) {
                                                setCostPerItem(val);
                                            }
                                        }}
                                        onKeyDown={e => {
                                            if (e.key === "-" || e.key === "+") {
                                                e.preventDefault();
                                            }
                                        }}
                                        className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 transition-all ${validationAttempted && (!costPerItem || Number(costPerItem) < 0) ? "border-destructive focus:ring-destructive focus:ring-1" : "border-border focus:ring-primary"}`}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Useful Lifespan (Months)</label>
                                    <input
                                        type="number"
                                        placeholder="e.g. 60"
                                        min="0"
                                        value={lifeSpan}
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (val === "" || Number(val) >= 0) {
                                                setLifeSpan(val);
                                            }
                                        }}
                                        onKeyDown={e => {
                                            if (e.key === "-" || e.key === "+") {
                                                e.preventDefault();
                                            }
                                        }}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                    />
                                </div>
                            </div>

                            {/* Condition */}
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Physical Condition</label>
                                <select
                                    value={condition || "Good"}
                                    onChange={e => setCondition(e.target.value as AssetRecord["condition"])}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                >
                                    <option value="Good">Good</option>
                                    <option value="Bad">Bad</option>
                                    <option value="Under Maintenance">Under Maintenance</option>
                                    <option value="Discontinued">Discontinued</option>
                                </select>
                            </div>

                            {/* Date Acquired & Image URL */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Date Acquired</label>
                                    <input
                                        type="date"
                                        value={dateAcquired}
                                        onChange={e => setDateAcquired(e.target.value)}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Image Upload</label>
                                    <label className={`w-full flex items-center h-[38px] rounded-lg border border-border bg-background overflow-hidden cursor-pointer focus-within:ring-1 focus-within:ring-primary transition-all ${uploadingImage ? "opacity-50 cursor-not-allowed" : ""}`}>
                                        <div className="flex items-center justify-center gap-2 h-full px-3 bg-muted border-r border-border hover:bg-muted/80 transition-colors shrink-0">
                                            {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                            <span className="text-xs font-semibold">{uploadingImage ? "Uploading..." : ""}</span>
                                        </div>
                                        <span className="text-sm text-muted-foreground truncate px-3 flex-1">
                                            {imageFilename ? imageFilename : (itemImage ? "Image attached" : "No file chosen")}
                                        </span>
                                        <input type="file" accept="image/*" className="hidden" disabled={uploadingImage} onChange={handleImageUpload} />
                                    </label>
                                </div>
                            </div>

                            {/* Codes: Barcode, RFID Code */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Barcode</label>
                                    <input
                                        type="text"
                                        placeholder="Barcode"
                                        value={barcode}
                                        onChange={e => setBarcode(e.target.value)}
                                        className={`w-full rounded-lg border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-1 transition-all ${
                                            isDuplicateBarcode ? "border-destructive focus:ring-destructive focus:ring-1" : "border-border focus:ring-primary"
                                        }`}
                                    />
                                    {isDuplicateBarcode && (
                                        <span className="text-[10px] text-destructive font-medium block mt-0.5">Barcode already exists in database</span>
                                    )}
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">RFID Code</label>
                                    <input
                                        type="text"
                                        placeholder="RFID Code"
                                        value={rfidCode}
                                        onChange={e => setRfidCode(e.target.value)}
                                        className={`w-full rounded-lg border bg-background px-3 py-2 text-xs text-foreground outline-none focus:ring-1 transition-all ${
                                            isDuplicateRfid ? "border-destructive focus:ring-destructive focus:ring-1" : "border-border focus:ring-primary"
                                        }`}
                                    />
                                    {isDuplicateRfid && (
                                        <span className="text-[10px] text-destructive font-medium block mt-0.5">RFID Code already exists in database</span>
                                    )}
                                </div>
                            </div>

                            {/* Warnings and Status Toggles */}
                            <div className="grid grid-cols-2 gap-4 pt-2">
                                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={isActiveWarning}
                                        onChange={(e) => setIsActiveWarning(e.target.checked)}
                                        className="h-4.5 w-4.5 rounded border-muted bg-background text-primary focus:ring-0"
                                    />
                                    Active Warning Flag
                                </label>
                                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={isActive}
                                        onChange={(e) => setIsActive(e.target.checked)}
                                        className="h-4.5 w-4.5 rounded border-muted bg-background text-primary focus:ring-0"
                                    />
                                    Is Active &amp; operational
                                </label>
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="flex justify-end gap-3 pt-3 border-t shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors text-muted-foreground"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    onClick={() => setValidationAttempted(true)}
                                    disabled={saving}
                                    className="px-4 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-lg text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/20 flex items-center gap-1.5"
                                >
                                    {saving && (
                                        <div className="h-3 w-3 animate-spin border border-current border-t-transparent rounded-full" />
                                    )}
                                    {saving ? "Saving..." : "Save Equipment"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Details View Modal */}
            {isViewModalOpen && viewingAsset && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-100">
                    <div className="bg-card border border-border/85 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-muted/20">
                            <div className="flex items-center gap-2">
                                <Info className="h-5 w-5 text-primary" />
                                <div>
                                    <h3 className="text-base font-bold text-foreground">Asset &amp; Equipment Details</h3>
                                    <p className="text-xs text-muted-foreground">Detailed parameters, condition, specs, and tracking data.</p>
                                </div>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-foreground">
                            {/* Asset Name & Status */}
                            <div className="flex justify-between items-start gap-4">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Asset/Item Name</span>
                                    <h4 className="text-lg font-bold text-foreground">
                                        {(() => {
                                            if (viewingAsset.item_id && typeof viewingAsset.item_id === "object") {
                                                return (viewingAsset.item_id as unknown as CatalogItem).item_name || "Unknown Item";
                                            }
                                            const found = items.find(i => i.id === viewingAsset.item_id);
                                            return found ? found.item_name : "Unknown Item";
                                        })()}
                                    </h4>
                                </div>
                                <div className="text-right space-y-1">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Status</span>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${Boolean(viewingAsset.is_active)
                                        ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                        : "bg-destructive/10 text-destructive border border-destructive/20"
                                        }`}>
                                        {Boolean(viewingAsset.is_active) ? "Active" : "Inactive"}
                                    </span>
                                </div>
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-4 bg-muted/10 p-4 rounded-xl border border-border/50">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Total Cost</span>
                                    <span className="text-sm font-semibold text-foreground">
                                        {formatCurrency(viewingAsset.total || viewingAsset.cost_per_item || 0)}
                                    </span>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Useful Lifespan</span>
                                    <span className="text-sm font-semibold text-foreground">
                                        {viewingAsset.life_span ? `${viewingAsset.life_span} Months` : "N/A"}
                                    </span>
                                </div>
                                <div className="space-y-1 pt-2 border-t border-border/30">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Physical Condition</span>
                                    <div>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${viewingAsset.condition === "Good" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                                            viewingAsset.condition === "Bad" ? "bg-destructive/10 text-destructive border border-destructive/20" :
                                                viewingAsset.condition === "Under Maintenance" ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
                                                    "bg-muted text-muted-foreground border"
                                            }`}>
                                            {viewingAsset.condition || "Good"}
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-1 pt-2 border-t border-border/30">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Active Warning</span>
                                    <div>
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${viewingAsset.is_active_warning
                                            ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                                            : "bg-muted text-muted-foreground border"
                                            }`}>
                                            {viewingAsset.is_active_warning ? "Warning Enabled" : "No Warning"}
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-1 col-span-2 pt-2 border-t border-border/30">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Mapped Department</span>
                                    <span className="text-xs font-semibold text-foreground">
                                        {(() => {
                                            const deptId = viewingAsset.department && typeof viewingAsset.department === "object" ? viewingAsset.department.department_id : viewingAsset.department;
                                            const dept = departments.find(d => d.department_id === deptId) || (typeof viewingAsset.department === "object" ? viewingAsset.department : null);
                                            return dept ? (
                                                <span className="bg-primary/5 text-primary border border-primary/10 px-2 py-0.5 rounded font-medium inline-block mt-0.5">
                                                    {dept.department_name}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground/50 italic">None mapped</span>
                                            );
                                        })()}
                                    </span>
                                </div>
                            </div>

                            {/* Image & Identifiers */}
                            <div className="space-y-2">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Image &amp; Identifiers</span>
                                <div className="border border-border/60 rounded-xl p-4 flex flex-col md:flex-row gap-4 bg-background">
                                    {/* Left: Image Container */}
                                    <div className="w-full md:w-1/3 shrink-0">
                                        {viewingAsset.item_image ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={viewingAsset.item_image}
                                                alt="Asset preview"
                                                onClick={() => setPreviewImage(viewingAsset.item_image || null)}
                                                className="w-full h-24 object-cover rounded-lg border border-border bg-muted/5 shrink-0 cursor-zoom-in hover:scale-102 transition-transform"
                                            />
                                        ) : (
                                            <div className="w-full h-24 bg-muted/20 border border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground/30 gap-1 shrink-0">
                                                <span className="text-[9px] font-semibold uppercase tracking-wider">No Image</span>
                                            </div>
                                        )}
                                    </div>
                                    {/* Right: Info details */}
                                    <div className="flex-1 space-y-2 min-w-0">
                                        <div className="grid grid-cols-1 gap-2 text-[11px]">
                                            <div>
                                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Barcode</span>
                                                <span className="font-semibold text-foreground truncate block">{viewingAsset.barcode || "N/A"}</span>
                                            </div>
                                            <div>
                                                <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">RFID Code</span>
                                                <span className="font-semibold text-foreground truncate block">{viewingAsset.rfid_code || "N/A"}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Metadata */}
                            <div className="pt-4 border-t border-border/30 grid grid-cols-2 gap-4 text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                                    <div className="min-w-0">
                                        <span className="text-[9px] font-bold uppercase tracking-wider block text-muted-foreground/50">Date Acquired</span>
                                        <span className="font-medium text-foreground/80 truncate block">
                                            {(() => {
                                                if (!viewingAsset.date_acquired) return "N/A";
                                                const d = new Date(viewingAsset.date_acquired);
                                                return isNaN(d.getTime()) ? viewingAsset.date_acquired : formatDateLong(d);
                                            })()}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                                    <div className="min-w-0">
                                        <span className="text-[9px] font-bold uppercase tracking-wider block text-muted-foreground/50">Created By</span>
                                        <span className="font-medium text-foreground/80 truncate block">{viewingAsset.created_by_name || "System"}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="flex justify-end gap-3 p-4 border-t shrink-0 bg-muted/10">
                            <button
                                type="button"
                                onClick={() => {
                                    handleOpenEditModal(viewingAsset, true);
                                    setTimeout(() => {
                                        setIsViewModalOpen(false);
                                    }, 200);
                                }}
                                className="px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted hover:text-foreground transition-colors text-muted-foreground flex items-center gap-1.5"
                            >
                                <Edit className="h-3.5 w-3.5" /> Edit Details
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsViewModalOpen(false)}
                                className="px-5 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-lg text-xs transition-colors shadow-md shadow-primary/20"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
