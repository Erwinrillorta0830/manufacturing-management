"use client";

import React, { useState, useMemo } from "react";
import {
    X,
    PackagePlus,
    Building2,
    Layers,
    DollarSign,
    FileText,
    Sparkles,
    Barcode
} from "lucide-react";
import SearchableSelect, { SelectOption } from "./SearchableSelect";
import { ProductDetails, RecipeVersionDetails, StorageLotDetails, PhysicalInventoryLineItem } from "../types";

interface AddNoCountProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddProduct: (newItem: PhysicalInventoryLineItem) => void;
    availableProducts?: ProductDetails[];
    availableLots?: StorageLotDetails[];
    availableVersions?: RecipeVersionDetails[];
    isFinishedGoods?: boolean;
}

export default function AddNoCountProductModal({
    isOpen,
    onClose,
    onAddProduct,
    availableProducts = [],
    availableLots = [],
    availableVersions = [],
    isFinishedGoods = false
}: AddNoCountProductModalProps) {
    const [selectedProductId, setSelectedProductId] = useState<string | number>("");
    const [selectedLotId, setSelectedLotId] = useState<string | number>("0");
    const [selectedVersionId, setSelectedVersionId] = useState<string | number>("0");
    const [physicalCount, setPhysicalCount] = useState<string>("");
    const [unitPrice, setUnitPrice] = useState<string>("0");
    const [remarks, setRemarks] = useState<string>("");

    // Product options for select
    const productOptions: SelectOption[] = useMemo(() => {
        return availableProducts.map(p => {
            const pId = p.product_id || p.id || 0;
            const pName = p.product_name || p.name || `Product #${pId}`;
            const pCode = p.product_code || p.code || "";
            return {
                value: pId,
                label: pCode ? `[${pCode}] ${pName}` : pName,
                sublabel: p.barcode ? `Barcode: ${p.barcode}` : undefined
            };
        });
    }, [availableProducts]);

    // Lot options
    const lotOptions: SelectOption[] = useMemo(() => {
        const list: SelectOption[] = [{ value: "0", label: "Main Warehouse Storage" }];
        availableLots.forEach(l => {
            const lId = l.lot_id || l.id;
            const lName = l.lot_name || l.name || `Location Bin #${lId}`;
            if (lId) {
                list.push({ value: String(lId), label: lName });
            }
        });
        return list;
    }, [availableLots]);

    // Version options for selected product
    const versionOptions: SelectOption[] = useMemo(() => {
        const list: SelectOption[] = [{ value: "0", label: "Standard Production BOM" }];
        const pIdNum = Number(selectedProductId);

        availableVersions.forEach(v => {
            const vPid = typeof v.product_id === "object"
                ? Number(v.product_id?.product_id || v.product_id?.id || 0)
                : Number(v.product_id || 0);

            if (!pIdNum || vPid === pIdNum || vPid === 0) {
                const vId = v.version_id || v.id;
                const vName = v.version_name || v.version_code || `Recipe Version v${vId}`;
                if (vId) {
                    list.push({ value: String(vId), label: vName });
                }
            }
        });
        return list;
    }, [availableVersions, selectedProductId]);

    // When product selection changes, auto-populate unit price
    const handleProductChange = (val: string | number) => {
        setSelectedProductId(val);
        const pIdNum = Number(val);
        const found = availableProducts.find(p => Number(p.product_id || p.id) === pIdNum);
        if (found) {
            // @ts-expect-error price_per_unit / cost_per_unit in API response
            const cost = found.cost_per_unit || found.price_per_unit || 0;
            setUnitPrice(String(cost));
        }
    };

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const pIdNum = Number(selectedProductId);
        if (!pIdNum) return;

        const foundProd = availableProducts.find(p => Number(p.product_id || p.id) === pIdNum);
        const foundLot = availableLots.find(l => Number(l.lot_id || l.id) === Number(selectedLotId));
        const foundVer = availableVersions.find(v => Number(v.version_id || v.id) === Number(selectedVersionId));

        const countNum = parseFloat(physicalCount) || 0;
        const priceNum = parseFloat(unitPrice) || 0;
        const uomShortcut = foundProd?.unit_of_measurement?.unit_shortcut || "PCS";

        const newLineItem: PhysicalInventoryLineItem = {
            id: `new_nocount_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            product_id: foundProd || { product_id: pIdNum },
            product_code: foundProd?.product_code || foundProd?.code || "",
            product_name: foundProd?.product_name || foundProd?.name || `Product #${pIdNum}`,
            barcode: foundProd?.barcode || "",
            version_id: isFinishedGoods ? (foundVer || { version_id: Number(selectedVersionId) || 0 }) : undefined,
            lot_id: foundLot || { lot_id: Number(selectedLotId) || 0 },
            uom: uomShortcut,
            uom_factor: 1,
            unit_price: priceNum,
            system_count: 0,
            physical_count: countNum,
            variance: countNum,
            variance_base: countNum,
            difference_cost: countNum * priceNum,
            amount: countNum * priceNum,
            offset_qty: 0,
            remarks: remarks || "Discovered on warehouse floor during audit (No-Count Product)",
            is_no_count_product: true
        };

        onAddProduct(newLineItem);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-border w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-primary/5">
                    <div className="flex items-center gap-3">
                        <div className="bg-primary/10 p-2.5 rounded-xl text-primary border border-primary/20">
                            <PackagePlus className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-foreground">Add No-Count Product</h3>
                            <p className="text-xs text-muted-foreground">Add an unlisted SKU physically discovered in storage bins during audit</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Form Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto text-xs">
                    {/* SKU Selection */}
                    <div className="space-y-1.5">
                        <label className="font-bold text-foreground flex items-center gap-1.5">
                            <Barcode className="h-3.5 w-3.5 text-primary" />
                            Select Product / SKU <span className="text-rose-500">*</span>
                        </label>
                        <SearchableSelect
                            options={productOptions}
                            value={selectedProductId}
                            onChange={handleProductChange}
                            placeholder="Search product name or code..."
                            searchPlaceholder="Type code or name..."
                            required
                        />
                    </div>

                    {/* Storage Location */}
                    <div className="space-y-1.5">
                        <label className="font-bold text-foreground flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5 text-primary" />
                            Storage Location / Rack Bin <span className="text-rose-500">*</span>
                        </label>
                        <SearchableSelect
                            options={lotOptions}
                            value={selectedLotId}
                            onChange={(val) => setSelectedLotId(val)}
                            placeholder="Select location bin..."
                            searchPlaceholder="Search location..."
                            required
                        />
                    </div>

                    {/* Recipe Version (Finished Goods only) */}
                    {isFinishedGoods && (
                        <div className="space-y-1.5">
                            <label className="font-bold text-foreground flex items-center gap-1.5">
                                <Layers className="h-3.5 w-3.5 text-primary" />
                                Recipe Version
                            </label>
                            <SearchableSelect
                                options={versionOptions}
                                value={selectedVersionId}
                                onChange={(val) => setSelectedVersionId(val)}
                                placeholder="Select recipe version..."
                                searchPlaceholder="Search version..."
                            />
                        </div>
                    )}

                    {/* Physical Count & Unit Price */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="font-bold text-foreground flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-primary" />
                                Physical Count Found <span className="text-rose-500">*</span>
                            </label>
                            <input
                                type="number"
                                step="0.0001"
                                value={physicalCount}
                                onChange={(e) => setPhysicalCount(e.target.value)}
                                placeholder="e.g. 50"
                                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl font-mono font-bold focus:ring-2 focus:ring-primary outline-hidden"
                                required
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="font-bold text-foreground flex items-center gap-1.5">
                                <DollarSign className="h-3.5 w-3.5 text-primary" />
                                Unit Valuation Price (₱)
                            </label>
                            <input
                                type="number"
                                step="0.01"
                                value={unitPrice}
                                onChange={(e) => setUnitPrice(e.target.value)}
                                placeholder="0.00"
                                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl font-mono focus:ring-2 focus:ring-primary outline-hidden"
                            />
                        </div>
                    </div>

                    {/* Remarks */}
                    <div className="space-y-1.5">
                        <label className="font-bold text-foreground flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5 text-primary" />
                            Discovered Condition / Remarks
                        </label>
                        <input
                            type="text"
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="e.g. Found unrecorded stock in Bay C-4"
                            className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary outline-hidden"
                        />
                    </div>

                    {/* Footer Buttons */}
                    <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 bg-muted hover:bg-muted/80 text-muted-foreground font-semibold text-xs rounded-xl transition-all"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!selectedProductId || !physicalCount}
                            className="flex items-center gap-2 px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs rounded-xl shadow-sm transition-all hover:scale-[1.01] disabled:opacity-50"
                        >
                            <PackagePlus className="h-4 w-4" />
                            Add SKU to Sheet
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
