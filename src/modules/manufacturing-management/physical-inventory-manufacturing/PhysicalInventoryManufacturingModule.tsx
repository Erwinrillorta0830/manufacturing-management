"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
    MmPhysicalInventorySheet,
    MmPhysicalInventoryDetail,
    Branch,
    Product,
    ProductType,
    PriceType,
    Unit,
    MmLot,
    MmInventoryLot,
    StockType,
} from "./types";
import {
    fetchPhysicalInventorySheets,
    fetchPhysicalInventorySheet,
    createPhysicalInventoryHeader,
    updatePhysicalInventoryHeader,
    populatePhysicalInventorySheet,
    addPhysicalInventoryDetail,
    updatePhysicalInventoryDetail,
    removePhysicalInventoryDetail,
    submitPhysicalInventorySheet,
    returnToDraftPhysicalInventorySheet,
    commitPhysicalInventorySheet,
    cancelPhysicalInventorySheet,
    fetchMasterBranches,
    fetchMasterProducts,
    fetchMasterProductTypes,
    fetchMasterUnits,
    fetchMasterPriceTypes,
    fetchLotsByBranch,
} from "./services/physical-inventory-manufacturing-api";
import PhysicalInventoryList from "./components/PhysicalInventoryList";
import PhysicalInventoryForm from "./components/PhysicalInventoryForm";
import PhysicalInventoryDetailModal from "./components/PhysicalInventoryDetailModal";
import CreateLotModal from "./components/CreateLotModal";
import CreateBatchModal from "./components/CreateBatchModal";
import CommitConfirmationModal from "./components/CommitConfirmationModal";
import CancelModal from "./components/CancelModal";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

export default function PhysicalInventoryManufacturingModule() {
    const [view, setView] = useState<"LIST" | "FORM">("LIST");
    const [sheets, setSheets] = useState<MmPhysicalInventorySheet[]>([]);
    const [activeSheet, setActiveSheet] = useState<MmPhysicalInventorySheet | null>(null);

    // Master data
    const [branches, setBranches] = useState<Branch[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [productTypes, setProductTypes] = useState<ProductType[]>([]);
    const [priceTypes, setPriceTypes] = useState<PriceType[]>([]);
    const [lots, setLots] = useState<MmLot[]>([]);

    // Modals state
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [editingDetail, setEditingDetail] = useState<MmPhysicalInventoryDetail | null>(null);
    const [preselectedLotId, setPreselectedLotId] = useState<number | undefined>(undefined);

    const [isLotModalOpen, setIsLotModalOpen] = useState(false);
    const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
    const [batchTargetLotId, setBatchTargetLotId] = useState(0);
    const [batchTargetProductId, setBatchTargetProductId] = useState(0);

    const [lastCreatedLot, setLastCreatedLot] = useState<MmLot | null>(null);
    const [lastCreatedBatch, setLastCreatedBatch] = useState<MmInventoryLot | null>(null);

    const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

    // Loading & Toast notification states
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

    const showToast = (message: string, type: "success" | "error" = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 5000);
    };

    // Load master data on mount
    useEffect(() => {
        Promise.all([fetchMasterBranches(), fetchMasterProducts(), fetchMasterUnits(), fetchMasterProductTypes(), fetchMasterPriceTypes()])
            .then(([bList, pList, uList, ptList, prList]) => {
                setBranches(bList);
                setProducts(pList);
                setUnits(uList);
                setProductTypes(ptList);
                setPriceTypes(prList);
            })
            .catch((err) => console.error("Error loading master data:", err));
    }, []);

    // Load sheets list
    const loadSheets = useCallback(async () => {
        try {
            setLoading(true);
            const data = await fetchPhysicalInventorySheets();
            setSheets(data);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to load sheets";
            showToast(msg, "error");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSheets();
    }, [loadSheets]);

    // Handle view / edit sheet
    const handleViewSheet = async (sheet: MmPhysicalInventorySheet) => {
        try {
            setLoading(true);
            const fullSheet = await fetchPhysicalInventorySheet(sheet.physical_inventory_id);
            setActiveSheet(fullSheet);
            setView("FORM");

            const bId = typeof fullSheet.branch_id === "object" ? fullSheet.branch_id?.id : fullSheet.branch_id;
            if (bId) {
                const lList = await fetchLotsByBranch(bId);
                setLots(lList);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to load sheet details";
            showToast(msg, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleCreateNew = () => {
        setActiveSheet(null);
        setView("FORM");
    };

    const handleSaveHeader = async (payload: {
        branch_id: number;
        stock_type: StockType;
        product_type_id?: number | null;
        price_type_id?: number | null;
        starting_date: string;
        cutoff_date: string;
        remarks: string;
    }) => {
        try {
            setLoading(true);
            if (!activeSheet || !activeSheet.physical_inventory_id) {
                // Create Header
                const created = await createPhysicalInventoryHeader(payload);
                setActiveSheet(created);
                showToast(`Physical Inventory sheet ${created.pi_no} created.`);
                const lList = await fetchLotsByBranch(payload.branch_id);
                setLots(lList);
                // Auto-populate system stock items from movements API upon header creation
                try {
                    const ptId = payload.product_type_id || null;
                    const popRes = await populatePhysicalInventorySheet(created.physical_inventory_id, ptId);
                    if (popRes.count && popRes.count > 0) {
                        showToast(popRes.message || `Auto-populated ${popRes.count} stock items from movements.`);
                        const refreshed = await fetchPhysicalInventorySheet(created.physical_inventory_id);
                        setActiveSheet(refreshed);
                    }
                } catch (popErr) {
                    console.warn("Auto-populate on create header notice:", popErr);
                }
            } else {
                // Update Header
                const updated = await updatePhysicalInventoryHeader(activeSheet.physical_inventory_id, payload);
                setActiveSheet(updated);
                showToast(`Physical Inventory sheet ${updated.pi_no} updated.`);
            }
            await loadSheets();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to save header";
            showToast(msg, "error");
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const handlePopulateSheet = async (overridePtId?: number | null) => {
        if (!activeSheet || !activeSheet.physical_inventory_id) return;
        try {
            setLoading(true);
            const headerPtId = typeof activeSheet.product_type_id === "object" ? activeSheet.product_type_id?.id : activeSheet.product_type_id;
            const ptId = overridePtId && overridePtId > 0 ? overridePtId : headerPtId || null;
            const res = await populatePhysicalInventorySheet(activeSheet.physical_inventory_id, ptId);
            showToast(res.message || "System stock items populated from movements log.");
            const refreshed = await fetchPhysicalInventorySheet(activeSheet.physical_inventory_id);
            setActiveSheet(refreshed);
            await loadSheets();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to populate system stock";
            showToast(msg, "error");
        } finally {
            setLoading(false);
        }
    };

    // Detail handlers
    const handleSaveDetail = async (payload: {
        inventory_lot_id: number;
        lot_id: number;
        product_id: number;
        physical_count: number;
        inventory_condition: string;
        remarks?: string;
    }) => {
        if (!activeSheet) return;
        try {
            setLoading(true);
            if (editingDetail) {
                const dId = editingDetail.physical_inventory_detail_id || editingDetail.id;
                if (!dId) return;
                await updatePhysicalInventoryDetail(activeSheet.physical_inventory_id, dId, {
                    physical_count: payload.physical_count,
                    inventory_condition: payload.inventory_condition,
                    remarks: payload.remarks,
                });
                showToast("Line item detail updated.");
            } else {
                await addPhysicalInventoryDetail(activeSheet.physical_inventory_id, payload);
                showToast("Line item detail added.");
            }
            // Refresh active sheet
            const refreshed = await fetchPhysicalInventorySheet(activeSheet.physical_inventory_id);
            setActiveSheet(refreshed);
            await loadSheets();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to save detail";
            showToast(msg, "error");
            throw err;
        } finally {
            setLoading(false);
        }
    };

    const handleSaveInlineCount = async (detail: MmPhysicalInventoryDetail, newPhysCount: number) => {
        if (!activeSheet) return;
        const dId = detail.physical_inventory_detail_id || detail.id;
        if (!dId) return;

        try {
            setLoading(true);
            await updatePhysicalInventoryDetail(activeSheet.physical_inventory_id, dId, {
                physical_count: newPhysCount,
            });
            showToast("Physical count updated.");
            const refreshed = await fetchPhysicalInventorySheet(activeSheet.physical_inventory_id);
            setActiveSheet(refreshed);
            await loadSheets();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to update physical count";
            showToast(msg, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveDetail = async (detail: MmPhysicalInventoryDetail) => {
        if (!activeSheet) return;
        const dId = detail.physical_inventory_detail_id || detail.id;
        if (!dId) return;
        if (!window.confirm("Are you sure you want to remove this detail row?")) return;

        try {
            setLoading(true);
            await removePhysicalInventoryDetail(activeSheet.physical_inventory_id, dId);
            showToast("Line item detail removed.");
            const refreshed = await fetchPhysicalInventorySheet(activeSheet.physical_inventory_id);
            setActiveSheet(refreshed);
            await loadSheets();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to remove detail";
            showToast(msg, "error");
        } finally {
            setLoading(false);
        }
    };

    // Submit handler
    const handleSubmitSheet = async (targetSheet?: MmPhysicalInventorySheet) => {
        const sheetToSubmit = targetSheet || activeSheet;
        if (!sheetToSubmit) return;
        if (!window.confirm(`Submit Physical Inventory sheet ${sheetToSubmit.pi_no} for review?`)) return;

        try {
            setLoading(true);
            const updated = await submitPhysicalInventorySheet(sheetToSubmit.physical_inventory_id);
            showToast(`Physical Inventory ${updated.pi_no} submitted for review.`);
            if (activeSheet?.physical_inventory_id === updated.physical_inventory_id) {
                setActiveSheet(updated);
            }
            await loadSheets();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to submit sheet";
            showToast(msg, "error");
        } finally {
            setLoading(false);
        }
    };

    // Return to draft handler
    const handleReturnToDraft = async (targetSheet?: MmPhysicalInventorySheet) => {
        const sheetToReturn = targetSheet || activeSheet;
        if (!sheetToReturn) return;

        try {
            setLoading(true);
            const updated = await returnToDraftPhysicalInventorySheet(sheetToReturn.physical_inventory_id);
            showToast(`Physical Inventory ${updated.pi_no} returned to DRAFT status.`);
            if (activeSheet?.physical_inventory_id === updated.physical_inventory_id) {
                setActiveSheet(updated);
            }
            await loadSheets();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to return sheet to draft";
            showToast(msg, "error");
        } finally {
            setLoading(false);
        }
    };

    // Commit handler
    const handleConfirmCommit = async () => {
        if (!activeSheet) return;
        try {
            setLoading(true);
            const committed = await commitPhysicalInventorySheet(activeSheet.physical_inventory_id);
            showToast(`Physical Inventory ${committed.pi_no} committed successfully!`);
            setActiveSheet(committed);
            await loadSheets();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to commit physical inventory";
            showToast(msg, "error");
            throw err;
        } finally {
            setLoading(false);
        }
    };

    // Cancel handler
    const handleConfirmCancel = async (reason: string) => {
        if (!activeSheet) return;
        try {
            setLoading(true);
            const cancelled = await cancelPhysicalInventorySheet(activeSheet.physical_inventory_id, reason);
            showToast(`Physical Inventory ${cancelled.pi_no} cancelled.`);
            setActiveSheet(cancelled);
            await loadSheets();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to cancel sheet";
            showToast(msg, "error");
            throw err;
        } finally {
            setLoading(false);
        }
    };

    // Lot & Batch creation callbacks
    const handleLotCreated = (newLot: MmLot) => {
        setLots((prev) => [...prev, newLot]);
        setLastCreatedLot(newLot);
        showToast(`Lot '${newLot.lot_name}' created successfully.`);
    };

    const handleBatchCreated = (newBatch: MmInventoryLot) => {
        setLastCreatedBatch(newBatch);
        showToast(`Batch #${newBatch.batch_no} created successfully.`);
    };

    const getBranchIdNum = () => {
        if (!activeSheet?.branch_id) return branches[0]?.id || 0;
        return typeof activeSheet.branch_id === "object" ? activeSheet.branch_id.id || 0 : activeSheet.branch_id;
    };

    const getSelectedProductTypeId = (): number | null => {
        if (!activeSheet?.product_type_id) return null;
        if (typeof activeSheet.product_type_id === "object" && activeSheet.product_type_id !== null) {
            return Number(activeSheet.product_type_id.id || 0) || null;
        }
        const num = Number(activeSheet.product_type_id);
        return !isNaN(num) && num > 0 ? num : null;
    };

    return (
        <div className="relative min-h-[500px]">
            {/* Toast feedback */}
            {toast && (
                <div
                    className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all ${
                        toast.type === "success"
                            ? "bg-emerald-900 text-emerald-100 border-emerald-700"
                            : "bg-rose-900 text-rose-100 border-rose-700"
                    }`}
                >
                    {toast.type === "success" ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertTriangle className="h-5 w-5 shrink-0" />}
                    <span>{toast.message}</span>
                    <button onClick={() => setToast(null)} className="ml-2 hover:opacity-80">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}

            {/* View Switcher */}
            {view === "LIST" ? (
                <PhysicalInventoryList
                    sheets={sheets}
                    branches={branches}
                    productTypes={productTypes}
                    loading={loading}
                    onRefresh={loadSheets}
                    onCreateNew={handleCreateNew}
                    onView={handleViewSheet}
                    onEdit={handleViewSheet}
                    onSubmit={handleSubmitSheet}
                    onReturnToDraft={handleReturnToDraft}
                    onCommit={(s) => {
                        setActiveSheet(s);
                        setIsCommitModalOpen(true);
                    }}
                    onCancel={(s) => {
                        setActiveSheet(s);
                        setIsCancelModalOpen(true);
                    }}
                />
            ) : (
                <PhysicalInventoryForm
                    sheet={activeSheet}
                    branches={branches}
                    productTypes={productTypes}
                    priceTypes={priceTypes}
                    existingSheets={sheets}
                    loading={loading}
                    onBack={() => {
                        setView("LIST");
                        loadSheets();
                    }}
                    onSaveHeader={handleSaveHeader}
                    onPopulateSheet={handlePopulateSheet}
                    onOpenAddDetailModal={(lotId) => {
                        setEditingDetail(null);
                        setPreselectedLotId(lotId);
                        setIsDetailModalOpen(true);
                    }}
                    onRemoveDetail={handleRemoveDetail}
                    onSaveInlineCount={handleSaveInlineCount}
                    onSubmit={() => handleSubmitSheet()}
                    onReturnToDraft={() => handleReturnToDraft()}
                    onCommit={() => setIsCommitModalOpen(true)}
                />
            )}

            {/* Detail Modal */}
            <PhysicalInventoryDetailModal
                isOpen={isDetailModalOpen}
                branchId={getBranchIdNum()}
                stockType={activeSheet?.stock_type || "OPENING"}
                selectedProductTypeId={getSelectedProductTypeId()}
                productTypes={productTypes}
                editingDetail={editingDetail}
                products={products}
                lastCreatedLot={lastCreatedLot}
                lastCreatedBatch={lastCreatedBatch}
                preselectedLotId={preselectedLotId}
                existingDetails={activeSheet?.details || []}
                onClose={() => setIsDetailModalOpen(false)}
                onSaveDetail={handleSaveDetail}
                onOpenCreateLotModal={() => setIsLotModalOpen(true)}
                onOpenCreateBatchModal={(lId, pId) => {
                    setBatchTargetLotId(lId);
                    setBatchTargetProductId(pId);
                    setIsBatchModalOpen(true);
                }}
            />

            {/* Create Lot Modal */}
            <CreateLotModal
                isOpen={isLotModalOpen}
                branchId={getBranchIdNum()}
                branches={branches}
                units={units}
                onClose={() => setIsLotModalOpen(false)}
                onLotCreated={handleLotCreated}
            />

            {/* Create Batch Modal */}
            <CreateBatchModal
                isOpen={isBatchModalOpen}
                branchId={getBranchIdNum()}
                lotId={batchTargetLotId}
                productId={batchTargetProductId}
                lots={lots}
                products={products}
                piNo={activeSheet?.pi_no}
                onClose={() => setIsBatchModalOpen(false)}
                onBatchCreated={handleBatchCreated}
            />

            {/* Commit Confirmation Modal */}
            <CommitConfirmationModal
                isOpen={isCommitModalOpen}
                sheet={activeSheet}
                onClose={() => setIsCommitModalOpen(false)}
                onConfirmCommit={handleConfirmCommit}
            />

            {/* Cancel Modal */}
            <CancelModal
                isOpen={isCancelModalOpen}
                sheet={activeSheet}
                onClose={() => setIsCancelModalOpen(false)}
                onConfirmCancel={handleConfirmCancel}
            />
        </div>
    );
}
