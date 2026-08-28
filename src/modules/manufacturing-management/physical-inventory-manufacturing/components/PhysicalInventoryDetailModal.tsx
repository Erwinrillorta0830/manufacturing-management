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
} from "../services/physical-inventory-manufacturing-api";
import SearchableSelect from "./SearchableSelect";
import { X, Plus, AlertTriangle, Layers } from "lucide-react";

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

    const [loadingLots, setLoadingLots] = useState(false);
    const [loadingBatches, setLoadingBatches] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const extractLotBranchId = (lot?: MmLot | null): number => {
        if (!lot || !lot.branch_id) return 0;
        if (typeof lot.branch_id === "object" && lot.branch_id !== null) {
            return Number((lot.branch_id as { id?: number; branch_id?: number }).id || (lot.branch_id as { id?: number; branch_id?: number }).branch_id || 0);
        }
        return Number(lot.branch_id || 0);
    };

    // 1. Load lots for branch when modal opens
    useEffect(() => {
        if (isOpen && branchId) {
            setLoadingLots(true);
            setError(null);
            fetchLotsByBranch(branchId)
                .then((data) => {
                    let combined = data || [];
                    if (lastCreatedLot) {
                        const lBranchId = extractLotBranchId(lastCreatedLot);
                        if (lBranchId === Number(branchId)) {
                            const exists = combined.some((l) => l.lot_id === lastCreatedLot.lot_id);
                            if (!exists) combined = [lastCreatedLot, ...combined];
                        }
                    }
                    setLots(combined);
                    if (editingDetail) {
                        const lId = typeof editingDetail.lot_id === "object" ? editingDetail.lot_id.lot_id : editingDetail.lot_id;
                        setSelectedLotId(lId || 0);
                    } else if (preselectedLotId && preselectedLotId > 0) {
                        setSelectedLotId(preselectedLotId);
                    } else if (lastCreatedLot && extractLotBranchId(lastCreatedLot) === Number(branchId)) {
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
            const lBranchId = extractLotBranchId(lastCreatedLot);
            if (lBranchId === Number(branchId)) {
                setLots((prev) => {
                    const exists = prev.some((l) => l.lot_id === lastCreatedLot.lot_id);
                    if (exists) return prev;
                    return [lastCreatedLot, ...prev];
                });
                setSelectedLotId(lastCreatedLot.lot_id);
            }
        }
    }, [lastCreatedLot, isOpen, branchId]);

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

    // 2. Load detail initial values when editing or reset state when opening
    useEffect(() => {
        if (isOpen) {
            setError(null);
            if (editingDetail) {
                const lId = typeof editingDetail.lot_id === "object" ? editingDetail.lot_id.lot_id : editingDetail.lot_id;
                const pId = typeof editingDetail.product_id === "object" ? editingDetail.product_id.product_id : editingDetail.product_id;
                const bId = typeof editingDetail.inventory_lot_id === "object" ? editingDetail.inventory_lot_id.inventory_lot_id : editingDetail.inventory_lot_id;
                if (lId) setSelectedLotId(lId);
                setSelectedProductId(pId || 0);
                setSelectedBatchId(bId || 0);
            } else if (!editingDetail) {
                if (preselectedLotId && preselectedLotId > 0) {
                    setSelectedLotId(preselectedLotId);
                } else {
                    setSelectedLotId(0);
                }
                setSelectedProductId(0);
                setSelectedBatchId(0);
            }
        }
    }, [isOpen, editingDetail, preselectedLotId]);

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

    const filteredLots = React.useMemo(() => {
        // 1. Strict filter by Branch ID
        let list = lots.filter((l) => {
            const lBranchId = extractLotBranchId(l);
            return lBranchId === Number(branchId);
        });

        // 2. Filter by Product Scope (selectedProductTypeId) if specified
        const targetPtId = Number(selectedProductTypeId || 0);
        if (targetPtId > 0 && products && products.length > 0) {
            const scopeProducts = products.filter((p) => {
                const pPtId = getProductTypeId(p);
                if (pPtId > 0) return pPtId === targetPtId;
                const selectedPTObj = productTypes.find((pt) => pt.id === targetPtId);
                const targetName = selectedPTObj ? (selectedPTObj.name || selectedPTObj.type_name || "").toLowerCase() : "";
                if (targetName) {
                    const pPtName = getProductTypeName(p);
                    if (pPtName && (pPtName.includes(targetName) || targetName.includes(pPtName))) return true;
                }
                return false;
            });

            if (scopeProducts.length > 0) {
                const validUnitIds = new Set(scopeProducts.map((p) => getProductUnitId(p)).filter((id) => id > 0));
                const validShortcuts = new Set(scopeProducts.map((p) => getProductUnitShortcut(p)).filter(Boolean));

                list = list.filter((l) => {
                    const lotUId = getLotUnitId(l);
                    const lotShortcut = getLotUnitShortcut(l);
                    if (lotUId > 0 && validUnitIds.has(lotUId)) return true;
                    if (lotShortcut && validShortcuts.has(lotShortcut)) return true;
                    if (!lotUId && !lotShortcut) return true;
                    return false;
                });
            }
        }

        return list;
    }, [lots, branchId, selectedProductTypeId, products, productTypes]);

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

    if (!isOpen) return null;

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
        try {
            setSubmitting(true);
            await onSaveDetail({
                inventory_lot_id: selectedBatchId,
                lot_id: selectedLotId,
                product_id: selectedProductId,
                physical_count: editingDetail ? Number(editingDetail.physical_count || 0) : 0,
                inventory_condition: editingDetail?.inventory_condition || "GOOD",
                remarks: editingDetail?.remarks || "",
            });
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to save detail";
            setError(msg);
        } finally {
            setSubmitting(false);
        }
    };

    const boundLot = lots.find((l) => l.lot_id === (selectedLotId || preselectedLotId));

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-2xl min-h-[520px] max-h-[90vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/30 shrink-0">
                    <h3 className="text-lg font-bold text-foreground">
                        {isEdit
                            ? "Edit Product Count Detail"
                            : preselectedLotId && preselectedLotId > 0
                            ? `Add Batch Row (${boundLot?.lot_name || `Lot #${preselectedLotId}`})`
                            : "Add Product Count Detail"}
                    </h3>
                    <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                    <div className="p-6 space-y-5 overflow-y-auto flex-1">
                        {error && (
                            <div className="flex items-center gap-2 p-3 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-lg dark:bg-rose-950 dark:text-rose-300">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        {preselectedLotId && preselectedLotId > 0 && boundLot && (
                            <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 rounded-lg text-xs font-medium">
                                <Layers className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                                <span>Adding new batch row pre-bound to Storage Lot: <strong className="font-semibold">{boundLot.lot_name}</strong></span>
                            </div>
                        )}

                        {/* Lot Selection */}
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs font-semibold text-muted-foreground">
                                    Manufacturing Lot {preselectedLotId && preselectedLotId > 0 ? "(Locked to Target Lot)" : "*"}
                                </label>
                                {(!preselectedLotId || preselectedLotId <= 0) && (
                                    <button
                                        type="button"
                                        onClick={onOpenCreateLotModal}
                                        className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                                    >
                                        <Plus className="h-3 w-3" />
                                        New Lot
                                    </button>
                                )}
                            </div>
                            <SearchableSelect
                                options={filteredLots.map((l) => {
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
                                placeholder={
                                    loadingLots
                                        ? "Loading lots..."
                                        : filteredLots.length === 0
                                        ? "No lots registered for this branch & scope"
                                        : "Select Lot..."
                                }
                                searchPlaceholder="Search lots..."
                                disabled={isEdit || (!!preselectedLotId && preselectedLotId > 0) || loadingLots || filteredLots.length === 0}
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
                                    const uName = typeof p.unit_of_measurement === "object" ? (p.unit_of_measurement?.unit_shortcut || p.unit_of_measurement?.unit_name) : "";
                                    const uCount = Number(p.unit_of_measurement_count || 0);
                                    const countText = uCount > 1 && uName ? ` (${uCount} pcs/${uName.toLowerCase()})` : uCount > 1 ? ` (${uCount} pcs)` : "";
                                    return {
                                        value: p.product_id,
                                        label: `[${p.product_code}] ${p.product_name}`,
                                        sublabel: uName ? `UOM: ${uName}${countText}` : countText ? `UOM: ${countText.trim()}` : undefined,
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
                    </div>

                    {/* Modal Footer */}
                    <div className="flex items-center justify-end gap-2 p-4 border-t bg-muted/20 shrink-0">
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
