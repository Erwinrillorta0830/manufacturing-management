"use client";

import React, { useState, useEffect } from "react";
import {
    MmLot,
    MmInventoryLot,
    Product,
    ProductType,
    MmPhysicalInventoryDetail,
    StockType,
} from "../types";
import {
    fetchLotsByBranch,
    fetchBatchesByLotAndProduct,
    fetchSystemOnhand,
} from "../services/physical-inventory-manufacturing-api";
import SearchableSelect from "./SearchableSelect";
import { X, Plus, AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
    isOpen: boolean;
    branchId: number;
    stockType: StockType;
    selectedProductTypeId?: number | null;
    productTypes?: ProductType[];
    editingDetail?: MmPhysicalInventoryDetail | null;
    products: Product[];
    lastCreatedLot?: MmLot | null;
    lastCreatedBatch?: MmInventoryLot | null;
    preselectedLotId?: number;
    existingDetails?: MmPhysicalInventoryDetail[];
    onClose: () => void;
    onSaveDetail: (payload: {
        inventory_lot_id: number;
        lot_id: number;
        product_id: number;
        physical_count: number;
        inventory_condition: string;
        remarks?: string;
    }) => Promise<void>;
    onOpenCreateLotModal: () => void;
    onOpenCreateBatchModal: (lotId: number, productId: number) => void;
}

export default function PhysicalInventoryDetailModal({
    isOpen,
    branchId,
    stockType,
    selectedProductTypeId,
    productTypes = [],
    editingDetail,
    products,
    lastCreatedLot,
    lastCreatedBatch,
    preselectedLotId,
    existingDetails,
    onClose,
    onSaveDetail,
    onOpenCreateLotModal,
    onOpenCreateBatchModal,
}: Props) {
    const isEdit = !!editingDetail;

    const [lots, setLots] = useState<MmLot[]>([]);
    const [selectedLotId, setSelectedLotId] = useState<number>(0);
    const [selectedProductId, setSelectedProductId] = useState<number>(0);
    const [batches, setBatches] = useState<MmInventoryLot[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<number>(0);
    const [condition, setCondition] = useState<string>("GOOD");
    const [physicalCount, setPhysicalCount] = useState<string>("0");
    const [systemCount, setSystemCount] = useState<number>(0);
    const [remarks, setRemarks] = useState<string>("");

    const [loadingLots, setLoadingLots] = useState(false);
    const [loadingBatches, setLoadingBatches] = useState(false);
    const [loadingOnhand, setLoadingOnhand] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 1. Load lots for branch when modal opens
    useEffect(() => {
        if (isOpen && branchId) {
            setLoadingLots(true);
            setError(null);
            fetchLotsByBranch(branchId)
                .then((data) => {
                    let combined = data || [];
                    if (lastCreatedLot) {
                        const exists = combined.some((l) => l.lot_id === lastCreatedLot.lot_id);
                        if (!exists) combined = [lastCreatedLot, ...combined];
                    }
                    setLots(combined);
                    if (editingDetail) {
                        const lId = typeof editingDetail.lot_id === "object" ? editingDetail.lot_id.lot_id : editingDetail.lot_id;
                        setSelectedLotId(lId || 0);
                    } else if (preselectedLotId && preselectedLotId > 0) {
                        setSelectedLotId(preselectedLotId);
                    } else if (lastCreatedLot) {
                        setSelectedLotId(lastCreatedLot.lot_id);
                    }
                })
                .catch((err) => setError(err.message))
                .finally(() => setLoadingLots(false));
        }
    }, [isOpen, branchId, editingDetail, lastCreatedLot, preselectedLotId]);

    // Handle new lot created dynamically
    useEffect(() => {
        if (lastCreatedLot && isOpen) {
            setLots((prev) => {
                const exists = prev.some((l) => l.lot_id === lastCreatedLot.lot_id);
                if (exists) return prev;
                return [lastCreatedLot, ...prev];
            });
            setSelectedLotId(lastCreatedLot.lot_id);
        }
    }, [lastCreatedLot, isOpen]);

    // Handle new batch created dynamically
    useEffect(() => {
        if (lastCreatedBatch && isOpen) {
            setBatches((prev) => {
                const exists = prev.some((b) => b.inventory_lot_id === lastCreatedBatch.inventory_lot_id);
                if (exists) return prev;
                return [lastCreatedBatch, ...prev];
            });
            setSelectedBatchId(lastCreatedBatch.inventory_lot_id);
        }
    }, [lastCreatedBatch, isOpen]);

    // 2. Load detail initial values when editing
    useEffect(() => {
        if (isOpen && editingDetail) {
            const pId = typeof editingDetail.product_id === "object" ? editingDetail.product_id.product_id : editingDetail.product_id;
            const bId = typeof editingDetail.inventory_lot_id === "object" ? editingDetail.inventory_lot_id.inventory_lot_id : editingDetail.inventory_lot_id;
            setSelectedProductId(pId || 0);
            setSelectedBatchId(bId || 0);
            setCondition(editingDetail.inventory_condition || "GOOD");
            setPhysicalCount(String(Math.round(Number(editingDetail.physical_count || 0))));
            setSystemCount(editingDetail.system_count || 0);
            setRemarks(editingDetail.remarks || "");
        } else if (isOpen && !editingDetail) {
            setSelectedProductId(0);
            setSelectedBatchId(0);
            setCondition("GOOD");
            setPhysicalCount("0");
            setSystemCount(0);
            setRemarks("");
        }
    }, [isOpen, editingDetail]);

    // UOM extraction & filtering logic
    const getLotUnitId = (lot?: MmLot | null): number => {
        if (!lot || !lot.unit_id) return 0;
        if (typeof lot.unit_id === "object") return Number(lot.unit_id.unit_id || 0);
        return Number(lot.unit_id || 0);
    };

    const getLotUnitShortcut = (lot?: MmLot | null): string => {
        if (!lot || !lot.unit_id) return "";
        if (typeof lot.unit_id === "object") return String(lot.unit_id.unit_shortcut || lot.unit_id.unit_name || "").toUpperCase();
        return "";
    };

    const getProductUnitId = (prod?: Product | null): number => {
        if (!prod || !prod.unit_of_measurement) return 0;
        if (typeof prod.unit_of_measurement === "object") return Number(prod.unit_of_measurement.unit_id || 0);
        return Number(prod.unit_of_measurement || 0);
    };

    const getProductUnitShortcut = (prod?: Product | null): string => {
        if (!prod || !prod.unit_of_measurement) return "";
        if (typeof prod.unit_of_measurement === "object") return String(prod.unit_of_measurement.unit_shortcut || "").toUpperCase();
        return "";
    };

    const getProductTypeId = (prod?: Product | null): number => {
        if (!prod) return 0;
        if (prod.product_type_id) return Number(prod.product_type_id);
        if (prod.product_type) {
            if (typeof prod.product_type === "object" && prod.product_type !== null) {
                return Number(prod.product_type.id || 0);
            }
            if (typeof prod.product_type === "number") return prod.product_type;
        }
        return 0;
    };

    const getProductTypeName = (prod?: Product | null): string => {
        if (!prod || !prod.product_type) return "";
        if (typeof prod.product_type === "object") {
            const pt = prod.product_type as { name?: string; type_name?: string };
            return (pt.name || pt.type_name || "").toLowerCase();
        }
        return String(prod.product_type).toLowerCase();
    };

    const filteredProducts = React.useMemo(() => {
        let list = products;

        // 1. Filter by Product Type if selected on sheet header
        const targetPtId = Number(selectedProductTypeId || 0);
        if (targetPtId > 0) {
            const selectedPTObj = productTypes.find((pt) => pt.id === targetPtId);
            const targetName = selectedPTObj ? (selectedPTObj.name || selectedPTObj.type_name || "").toLowerCase() : "";

            list = list.filter((p) => {
                const pPtId = getProductTypeId(p);
                if (pPtId > 0) {
                    return pPtId === targetPtId;
                }
                if (targetName) {
                    const pPtName = getProductTypeName(p);
                    if (pPtName && (pPtName.includes(targetName) || targetName.includes(pPtName))) {
                        return true;
                    }
                }
                return false;
            });
        }

        // 2. Filter by Lot UOM compatibility if selectedLotId is set
        if (selectedLotId) {
            const selectedLot = lots.find((l) => l.lot_id === selectedLotId);
            if (selectedLot) {
                const lotUId = getLotUnitId(selectedLot);
                const lotShortcut = getLotUnitShortcut(selectedLot);

                if (lotUId || lotShortcut) {
                    list = list.filter((p) => {
                        const pUId = getProductUnitId(p);
                        const pShortcut = getProductUnitShortcut(p);
                        if (lotUId > 0 && pUId > 0) return lotUId === pUId;
                        if (lotShortcut && pShortcut) return lotShortcut === pShortcut;
                        return true;
                    });
                }
            }
        }

        return list;
    }, [selectedProductTypeId, productTypes, selectedLotId, lots, products]);

    // 3. Load batches when Lot & Product are selected
    useEffect(() => {
        if (selectedLotId && selectedProductId) {
            setLoadingBatches(true);
            setError(null);

            fetchBatchesByLotAndProduct(selectedLotId, selectedProductId)
                .then((data) => setBatches(data))
                .catch((err) => setError(err.message))
                .finally(() => setLoadingBatches(false));
        } else {
            setBatches([]);
        }
    }, [selectedLotId, selectedProductId]);
    // Filter out batches that are ALREADY added to this Physical Inventory sheet
    const availableBatches = React.useMemo(() => {
        if (!existingDetails || existingDetails.length === 0) return batches;
        const addedBatchIds = new Set(
            existingDetails.map((d) => {
                if (typeof d.inventory_lot_id === "object" && d.inventory_lot_id !== null) {
                    return (d.inventory_lot_id as { inventory_lot_id?: number }).inventory_lot_id || 0;
                }
                return Number(d.inventory_lot_id || 0);
            })
        );
        return batches.filter((b) => {
            if (editingDetail) {
                const editBId = typeof editingDetail.inventory_lot_id === "object" ? editingDetail.inventory_lot_id?.inventory_lot_id : editingDetail.inventory_lot_id;
                if (Number(editBId) === Number(b.inventory_lot_id)) return true;
            }
            return !addedBatchIds.has(Number(b.inventory_lot_id));
        });
    }, [batches, existingDetails, editingDetail]);

    // 4. Fetch System On-hand count when Lot, Product, Batch, Condition change
    useEffect(() => {
        if (selectedLotId && selectedProductId && selectedBatchId && stockType === "REGULAR") {
            setLoadingOnhand(true);
            fetchSystemOnhand(branchId, selectedLotId, selectedProductId, condition, selectedBatchId)
                .then((qty) => setSystemCount(qty))
                .catch(() => setSystemCount(0))
                .finally(() => setLoadingOnhand(false));
        } else if (stockType === "OPENING") {
            setSystemCount(0);
        }
    }, [branchId, selectedLotId, selectedProductId, selectedBatchId, condition, stockType]);

    if (!isOpen) return null;

    const physNum = Number(physicalCount || 0);
    const variance = physNum - systemCount;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!selectedLotId) {
            setError("Please select a manufacturing lot.");
            return;
        }
        if (!selectedProductId) {
            setError("Please select a product.");
            return;
        }
        if (!selectedBatchId) {
            setError("Please select or create an inventory batch.");
            return;
        }

        if (selectedBatchId > 0 && existingDetails) {
            const alreadyAdded = existingDetails.some((d) => {
                if (editingDetail) {
                    const eId = editingDetail.physical_inventory_detail_id || editingDetail.id;
                    const dId = d.physical_inventory_detail_id || d.id;
                    if (eId && dId && eId === dId) return false;
                }
                const bId = typeof d.inventory_lot_id === "object" ? d.inventory_lot_id?.inventory_lot_id : d.inventory_lot_id;
                return Number(bId) === Number(selectedBatchId);
            });

            if (alreadyAdded) {
                setError("This inventory batch has already been added to this physical inventory sheet.");
                return;
            }
        }
        if (isNaN(physNum) || physNum < 0) {
            setError("Physical count cannot be negative.");
            return;
        }

        if (stockType === "REGULAR" && variance !== 0 && !remarks.trim()) {
            setError("Variance reason is required when a Regular Physical Inventory has a nonzero variance.");
            return;
        }

        try {
            setSubmitting(true);
            await onSaveDetail({
                inventory_lot_id: selectedBatchId,
                lot_id: selectedLotId,
                product_id: selectedProductId,
                physical_count: physNum,
                inventory_condition: condition,
                remarks: remarks.trim(),
            });
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to save detail";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-card border rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b bg-muted/30">
                    <h3 className="text-base font-bold text-foreground">
                        {isEdit ? "Edit Product Count Detail" : "Add Product Count Detail"}
                    </h3>
                    <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-lg">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {error && (
                        <div className="flex items-center gap-2 p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg dark:bg-rose-950 dark:text-rose-300">
                            <AlertTriangle className="h-4 w-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Lot Selection */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-muted-foreground">Manufacturing Lot *</label>
                            <button
                                type="button"
                                onClick={onOpenCreateLotModal}
                                className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                            >
                                <Plus className="h-3 w-3" />
                                New Lot
                            </button>
                        </div>
                        <SearchableSelect
                            options={lots.map((l) => {
                                const uName = typeof l.unit_id === "object" ? l.unit_id.unit_shortcut || l.unit_id.unit_name : "";
                                return {
                                    value: l.lot_id,
                                    label: l.lot_name,
                                    sublabel: `UOM: ${uName || "N/A"} | Cap: ${l.max_batch_capacity}`,
                                };
                            })}
                            value={selectedLotId}
                            onChange={(val) => {
                                setSelectedLotId(Number(val));
                                setSelectedProductId(0);
                                setSelectedBatchId(0);
                            }}
                            placeholder="Select Lot..."
                            searchPlaceholder="Search lots..."
                            disabled={isEdit || loadingLots}
                            required
                        />
                    </div>

                    {/* Product Selection */}
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <label className="text-xs font-semibold text-muted-foreground">Product *</label>
                            {selectedLotId > 0 && (
                                <span className="text-[11px] font-semibold text-primary">
                                    Filtered by UOM: {getLotUnitShortcut(lots.find((l) => l.lot_id === selectedLotId)) || "Lot UOM"}
                                </span>
                            )}
                        </div>
                        <SearchableSelect
                            options={filteredProducts.map((p) => {
                                const uName = typeof p.unit_of_measurement === "object" ? p.unit_of_measurement?.unit_shortcut : "";
                                return {
                                    value: p.product_id,
                                    label: `[${p.product_code}] ${p.product_name}`,
                                    sublabel: uName ? `UOM: ${uName}` : undefined,
                                };
                            })}
                            value={selectedProductId}
                            onChange={(val) => {
                                setSelectedProductId(Number(val));
                                setSelectedBatchId(0);
                            }}
                            placeholder={
                                !selectedLotId
                                    ? "Select Lot first..."
                                    : filteredProducts.length === 0
                                    ? "No products matching Lot UOM"
                                    : "Select Product..."
                            }
                            searchPlaceholder="Search products by code or name..."
                            disabled={isEdit || !selectedLotId || filteredProducts.length === 0}
                            required
                        />
                    </div>

                    {/* Batch Selection */}
                    {selectedLotId > 0 && selectedProductId > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-semibold text-muted-foreground">Inventory Batch # *</label>
                                <button
                                    type="button"
                                    onClick={() => onOpenCreateBatchModal(selectedLotId, selectedProductId)}
                                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                                >
                                    <Plus className="h-3 w-3" />
                                    Create New Batch
                                </button>
                            </div>
                            <SearchableSelect
                                options={availableBatches.map((b) => ({
                                    value: b.inventory_lot_id,
                                    label: `Batch #${b.batch_no}`,
                                    sublabel: `Cost: ₱${b.unit_cost}${b.expiry_date ? ` | Exp: ${b.expiry_date}` : ""}`,
                                }))}
                                value={selectedBatchId}
                                onChange={(val) => setSelectedBatchId(Number(val))}
                                placeholder="Select Existing Batch..."
                                searchPlaceholder="Search batches..."
                                disabled={isEdit || loadingBatches}
                                required
                            />
                            {batches.length === 0 && !loadingBatches && (
                                <p className="text-[11px] text-amber-600 mt-1">No batches found for this product & lot. Click &quot;Create New Batch&quot;.</p>
                            )}
                        </div>
                    )}

                    {/* Condition */}
                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Inventory Condition *</label>
                        <select
                            value={condition}
                            onChange={(e) => setCondition(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                        >
                            <option value="GOOD">GOOD</option>
                            <option value="DAMAGED">DAMAGED</option>
                            <option value="EXPIRED">EXPIRED</option>
                            <option value="DEFECTIVE">DEFECTIVE</option>
                        </select>
                    </div>

                    {/* Counts & Calculated Variance */}
                    <div className="grid grid-cols-3 gap-3 bg-muted/30 p-3 rounded-lg border">
                        <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground">System Count</label>
                            <div className="text-sm font-mono font-bold text-foreground mt-1 flex items-center gap-1">
                                {loadingOnhand ? <RefreshCw className="h-3 w-3 animate-spin" /> : systemCount}
                            </div>
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground">Physical Count *</label>
                            <input
                                type="number"
                                step="1"
                                min="0"
                                value={physicalCount}
                                onChange={(e) => setPhysicalCount(e.target.value)}
                                className="w-full px-2 py-1 text-sm font-mono bg-background border rounded focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-muted-foreground">Variance</label>
                            <div
                                className={`text-sm font-mono font-bold mt-1 ${
                                    variance > 0 ? "text-emerald-600" : variance < 0 ? "text-rose-600" : "text-muted-foreground"
                                }`}
                            >
                                {variance > 0 ? `+${variance}` : variance}
                            </div>
                        </div>
                    </div>

                    {/* Remarks / Reason */}
                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">
                            Remarks / Variance Reason {stockType === "REGULAR" && variance !== 0 && "*"}
                        </label>
                        <input
                            type="text"
                            placeholder={stockType === "REGULAR" && variance !== 0 ? "Reason for discrepancy is required..." : "Optional remarks..."}
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20"
                        />
                    </div>

                    {/* Modal Footer */}
                    <div className="flex items-center justify-end gap-2 pt-3 border-t">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent border rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-lg transition-colors shadow-xs"
                        >
                            {submitting ? "Saving Detail..." : isEdit ? "Update Detail" : "Add Detail Row"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
