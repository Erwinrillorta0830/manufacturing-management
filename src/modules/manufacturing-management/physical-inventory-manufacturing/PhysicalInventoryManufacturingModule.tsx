"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
    MmPhysicalInventorySheet,
    MmPhysicalInventoryDetail,
    MmOffsetPairing,
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
    savePhysicalInventoryOffsetPairings,
} from "./services/physical-inventory-manufacturing-api";
import PhysicalInventoryList from "./components/PhysicalInventoryList";
import PhysicalInventoryForm from "./components/PhysicalInventoryForm";
import PhysicalInventoryDetailModal from "./components/PhysicalInventoryDetailModal";
import ManufacturingOffsettingModal from "./components/ManufacturingOffsettingModal";
import CreateLotModal from "./components/CreateLotModal";
import CreateBatchModal from "./components/CreateBatchModal";
import CommitConfirmationModal from "./components/CommitConfirmationModal";
import CancelModal from "./components/CancelModal";
import { CheckCircle2, AlertTriangle, X } from "lucide-react";

export default function PhysicalInventoryManufacturingModule() {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);
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
    const [isOffsettingModalOpen, setIsOffsettingModalOpen] = useState(false);
    const [offsetPairings, setOffsetPairings] = useState<MmOffsetPairing[]>([]);

    useEffect(() => {
        if (activeSheet && activeSheet.offset_pairings) {
            setOffsetPairings(activeSheet.offset_pairings);
        } else {
            setOffsetPairings([]);
        }
    }, [activeSheet]);

    const handleApplyOffsetting = async (newPairings: MmOffsetPairing[]) => {
        setOffsetPairings(newPairings);
        if (activeSheet && activeSheet.physical_inventory_id) {
            try {
                await savePhysicalInventoryOffsetPairings(activeSheet.physical_inventory_id, newPairings);
                showToast(`Applied ${newPairings.length} offset pairing(s) to physical inventory count sheet.`);
            } catch (err) {
                console.warn("Failed to persist offset pairings to server:", err);
            }
        }
    };

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
            setLastCreatedLot(null);
            setLastCreatedBatch(null);
            const fullSheet = await fetchPhysicalInventorySheet(sheet.physical_inventory_id);
            setActiveSheet(fullSheet);
            setView("FORM");

            const bId = typeof fullSheet.branch_id === "object" ? fullSheet.branch_id?.id : fullSheet.branch_id;
            if (bId) {
                const lList = await fetchLotsByBranch(bId);
                setLots(lList);
            } else {
                setLots([]);
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
        setLots([]);
        setLastCreatedLot(null);
        setLastCreatedBatch(null);
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
            await submitPhysicalInventorySheet(sheetToSubmit.physical_inventory_id);
            const fullSheet = await fetchPhysicalInventorySheet(sheetToSubmit.physical_inventory_id);
            showToast(`Physical Inventory ${fullSheet.pi_no} submitted for review.`);
            if (activeSheet?.physical_inventory_id === fullSheet.physical_inventory_id) {
                setActiveSheet(fullSheet);
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
            await returnToDraftPhysicalInventorySheet(sheetToReturn.physical_inventory_id);
            const fullSheet = await fetchPhysicalInventorySheet(sheetToReturn.physical_inventory_id);
            showToast(`Physical Inventory ${fullSheet.pi_no} returned to DRAFT status.`);
            if (activeSheet?.physical_inventory_id === fullSheet.physical_inventory_id) {
                setActiveSheet(fullSheet);
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
            await commitPhysicalInventorySheet(activeSheet.physical_inventory_id);
            const fullSheet = await fetchPhysicalInventorySheet(activeSheet.physical_inventory_id);
            showToast(`Physical Inventory ${fullSheet.pi_no} committed successfully!`);
            setActiveSheet(fullSheet);
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
            await cancelPhysicalInventorySheet(activeSheet.physical_inventory_id, reason);
            const fullSheet = await fetchPhysicalInventorySheet(activeSheet.physical_inventory_id);
            showToast(`Physical Inventory ${fullSheet.pi_no} cancelled.`);
            setActiveSheet(fullSheet);
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
        const activeBranchId = getBranchIdNum();
        const lotBranchId = typeof newLot.branch_id === "object" && newLot.branch_id !== null
            ? Number((newLot.branch_id as { id?: number; branch_id?: number }).id || (newLot.branch_id as { id?: number; branch_id?: number }).branch_id || 0)
            : Number(newLot.branch_id || 0);

        if (lotBranchId === activeBranchId) {
            setLots((prev) => [...prev, newLot]);
            setLastCreatedLot(newLot);
        }
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

    const renderToast = () => {
        if (!toast || !mounted) return null;

        const toastContent = (
            <div
                className={`fixed bottom-6 right-6 z-[99999] flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border text-sm font-medium transition-all max-w-md animate-in fade-in slide-in-from-bottom-4 ${
                    toast.type === "success"
                        ? "bg-slate-900 text-emerald-300 border-emerald-500/40 shadow-emerald-950/40"
                        : "bg-slate-900 text-rose-300 border-rose-500/40 shadow-rose-950/40"
                }`}
            >
                {toast.type === "success" ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                ) : (
                    <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" />
                )}
                <span className="leading-snug">{toast.message}</span>
                <button
                    onClick={() => setToast(null)}
                    className="ml-auto shrink-0 p-1 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                    aria-label="Close toast"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        );

        return createPortal(toastContent, document.body);
    };

    return (
        <div className="relative min-h-[500px]">
            {/* Toast feedback via Portal */}
            {renderToast()}

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
                    offsetPairings={offsetPairings}
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
                    onOpenOffsettingModal={() => setIsOffsettingModalOpen(true)}
                    onSubmit={() => handleSubmitSheet()}
                    onReturnToDraft={() => handleReturnToDraft()}
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

            {/* Manufacturing Offsetting Modal */}
            <ManufacturingOffsettingModal
                isOpen={isOffsettingModalOpen}
                onClose={() => setIsOffsettingModalOpen(false)}
                lineItems={activeSheet?.details || []}
                initialPairings={offsetPairings}
                onApplyOffsetting={handleApplyOffsetting}
                isReadOnly={activeSheet?.status === "COMMITTED" || activeSheet?.status === "CANCELLED"}
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
