/**
 * src/modules/manufacturing-management/material-staging/hooks/useMaterialStaging.ts
 * Custom hook for Material Staging & Floor Holds Module
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
    StagingJobOrder,
    MaterialStagingItem,
    AllocatedLot,
    WorkCenter,
    Branch,
    StagingStats,
    BinTransferPayload,
    ShortageWarningInfo
} from "../types";
import { fetchStagingJobOrders, executeBinTransfer } from "../services/staging-api";

export function useMaterialStaging() {
    const [jobOrders, setJobOrders] = useState<StagingJobOrder[]>([]);
    const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [stats, setStats] = useState<StagingStats>({
        totalActiveJobs: 0,
        plannedJobs: 0,
        reservedJobs: 0,
        fullyStagedJobs: 0,
        pendingStagingJobs: 0,
        shortageAlertJobs: 0
    });

    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
    const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>("PLANNED_RESERVED"); // default focus on Planned & Reserved
    const [onlyShortages, setOnlyShortages] = useState(false);

    const [selectedJobOrderId, setSelectedJobOrderId] = useState<number | null>(null);

    // Modal state for Bin Transfer
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [activeTransferItem, setActiveTransferItem] = useState<{
        jobOrder: StagingJobOrder;
        material: MaterialStagingItem;
        lot?: AllocatedLot;
    } | null>(null);
    const [transferring, setTransferring] = useState(false);

    // Modal state for Shortage Warning
    const [isShortageDialogOpen, setIsShortageDialogOpen] = useState(false);
    const [shortageWarningInfo, setShortageWarningInfo] = useState<ShortageWarningInfo | null>(null);

    const loadData = useCallback(async (showToast = false) => {
        try {
            setLoading(true);
            const res = await fetchStagingJobOrders({
                branchId: selectedBranchId,
                search: searchQuery
            });

            if (res.success) {
                setJobOrders(res.data);
                setWorkCenters(res.workCenters || []);
                setBranches(res.branches || []);
                if (res.stats) setStats(res.stats);

                if (showToast) {
                    toast.success("Material staging data refreshed");
                }
            } else {
                throw new Error(res.error || "Failed to load data");
            }
        } catch (err) {
            console.error("Failed to load material staging data:", err);
            toast.error((err as Error).message || "Failed to load material staging data");
        } finally {
            setLoading(false);
        }
    }, [selectedBranchId, searchQuery]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Filtered Job Orders
    const filteredJobOrders = useMemo(() => {
        return jobOrders.filter((jo) => {
            // Status filtering
            if (selectedStatusFilter === "PLANNED_RESERVED") {
                const s = jo.status?.toUpperCase();
                const matches = s === "PLANNED" || s === "RESERVED" || s === "DRAFT";
                if (!matches) return false;
            } else if (selectedStatusFilter === "PLANNED") {
                const s = jo.status?.toUpperCase();
                if (s !== "PLANNED" && s !== "DRAFT") return false;
            } else if (selectedStatusFilter === "RESERVED") {
                if (jo.status?.toUpperCase() !== "RESERVED") return false;
            } else if (selectedStatusFilter === "RELEASED") {
                const s = jo.status?.toUpperCase();
                if (s !== "RELEASED" && s !== "PROCEED") return false;
            }

            // Shortage filter
            if (onlyShortages && !jo.has_shortage) {
                return false;
            }

            // Search query filter
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchesNo = jo.job_order_no?.toLowerCase().includes(q);
                const matchesProd = jo.product_name?.toLowerCase().includes(q) || jo.product_code?.toLowerCase().includes(q);
                const matchesWc = jo.primary_work_center_name?.toLowerCase().includes(q);
                const matchesMat = jo.materials?.some((m) =>
                    m.product_name?.toLowerCase().includes(q) ||
                    m.product_code?.toLowerCase().includes(q) ||
                    m.allocations?.some((a) => a.batch_no?.toLowerCase().includes(q))
                );
                if (!matchesNo && !matchesProd && !matchesWc && !matchesMat) return false;
            }

            return true;
        });
    }, [jobOrders, selectedStatusFilter, onlyShortages, searchQuery]);

    // Keep the detail pane synchronized with the currently visible queue.
    useEffect(() => {
        const selectedIsVisible = selectedJobOrderId !== null &&
            filteredJobOrders.some((jo) => jo.job_order_id === selectedJobOrderId);
        const nextSelectedJobOrderId = selectedIsVisible
            ? selectedJobOrderId
            : filteredJobOrders[0]?.job_order_id ?? null;

        if (nextSelectedJobOrderId !== selectedJobOrderId) {
            setSelectedJobOrderId(nextSelectedJobOrderId);
        }
    }, [filteredJobOrders, selectedJobOrderId]);

    // Active selected Job Order object
    const selectedJobOrder = useMemo(() => {
        return filteredJobOrders.find((j) => j.job_order_id === selectedJobOrderId) || filteredJobOrders[0] || null;
    }, [filteredJobOrders, selectedJobOrderId]);

    // Handler to open transfer modal
    const handleOpenTransferModal = useCallback((
        jobOrder: StagingJobOrder,
        material: MaterialStagingItem,
        lot?: AllocatedLot
    ) => {
        setActiveTransferItem({ jobOrder, material, lot });
        setIsTransferModalOpen(true);
    }, []);

    // Handler to close transfer modal
    const handleCloseTransferModal = useCallback(() => {
        setIsTransferModalOpen(false);
        setActiveTransferItem(null);
    }, []);

    // Main Transfer Execution
    const handlePerformTransfer = useCallback(async (payload: BinTransferPayload) => {
        try {
            setTransferring(true);
            const res = await executeBinTransfer(payload);

            if (res.shortage && !payload.override_negative) {
                // Insufficient stock in MAIN-STORE! Trigger Shortage Warning Dialog
                setIsTransferModalOpen(false);
                setShortageWarningInfo({
                    material_name: payload.product_name || `Component #${payload.product_id}`,
                    product_code: `SKU-${payload.product_id}`,
                    product_id: payload.product_id,
                    batch_no: payload.batch_no,
                    lot_id: payload.lot_id,
                    job_order_id: payload.job_order_id,
                    job_order_no: payload.job_order_no,
                    work_center_id: payload.work_center_id,
                    work_center_name: `Work Center #${payload.work_center_id}`,
                    transfer_quantity: payload.transfer_quantity,
                    available_quantity: res.available_quantity ?? 0,
                    shortage_quantity: res.shortage_quantity ?? (payload.transfer_quantity - (res.available_quantity ?? 0)),
                    source_bin: payload.source_bin,
                    target_bin: payload.target_bin,
                    jo_material_id: payload.jo_material_id
                });
                setIsShortageDialogOpen(true);
                return;
            }

            if (res.success) {
                toast.success(res.message || "Material staged successfully!");
                handleCloseTransferModal();
                setIsShortageDialogOpen(false);
                setShortageWarningInfo(null);
                await loadData();
            } else {
                toast.error(res.error || "Transfer failed");
            }
        } catch (err) {
            console.error("Transfer execution failed:", err);
            toast.error((err as Error).message || "Transfer failed");
        } finally {
            setTransferring(false);
        }
    }, [handleCloseTransferModal, loadData]);

    // Handle Negative Override Proceed from Shortage Dialog (Option B)
    const handleProceedWithNegativeStock = useCallback(async (remarks?: string) => {
        if (!shortageWarningInfo) return;

        const payload: BinTransferPayload = {
            job_order_id: shortageWarningInfo.job_order_id,
            job_order_no: shortageWarningInfo.job_order_no,
            jo_material_id: shortageWarningInfo.jo_material_id,
            product_id: shortageWarningInfo.product_id,
            product_name: shortageWarningInfo.material_name,
            lot_id: shortageWarningInfo.lot_id,
            batch_no: shortageWarningInfo.batch_no,
            transfer_quantity: shortageWarningInfo.transfer_quantity,
            source_bin: shortageWarningInfo.source_bin,
            target_bin: shortageWarningInfo.target_bin,
            work_center_id: shortageWarningInfo.work_center_id,
            override_negative: true,
            remarks: remarks || "Floor hold override authorized by staging operator."
        };

        await handlePerformTransfer(payload);
    }, [shortageWarningInfo, handlePerformTransfer]);

    // Batch Stage All Available for a Job Order
    const handleStageAllAvailable = useCallback(async (jobOrder: StagingJobOrder) => {
        try {
            setTransferring(true);
            let stagedCount = 0;

            for (const mat of jobOrder.materials) {
                if (mat.is_staged) continue;

                // Pick first unstaged lot or default
                const lot = mat.allocations.find((l) => l.reservation_status === "SOFT") || mat.allocations[0];
                const qtyToStage = mat.required_quantity - mat.staged_quantity;

                if (qtyToStage <= 0) continue;

                // Check on hand
                if (mat.on_hand_quantity < qtyToStage) {
                    toast.warning(`Skipping ${mat.product_name}: insufficient on-hand stock (${mat.on_hand_quantity} < ${qtyToStage})`);
                    continue;
                }

                const targetBin = jobOrder.suggested_staging_bin || `FLOOR-STAGING-${jobOrder.primary_work_center_id || 1}`;

                const payload: BinTransferPayload = {
                    job_order_id: jobOrder.job_order_id,
                    job_order_no: jobOrder.job_order_no,
                    jo_material_id: mat.jo_material_id,
                    product_id: mat.product_id,
                    product_name: mat.product_name,
                    lot_id: lot ? lot.lot_id : 1,
                    batch_no: lot ? lot.batch_no : `LOT-${mat.product_id}-MAIN`,
                    transfer_quantity: qtyToStage,
                    source_bin: "MAIN-STORE",
                    target_bin: targetBin,
                    work_center_id: jobOrder.primary_work_center_id || 1,
                    override_negative: false
                };

                const res = await executeBinTransfer(payload);
                if (res.success) {
                    stagedCount++;
                }
            }

            if (stagedCount > 0) {
                toast.success(`Batch staged ${stagedCount} material(s) for JO #${jobOrder.job_order_no}`);
                await loadData();
            } else {
                toast.info("No unstaged materials with sufficient on-hand stock were found.");
            }
        } catch (err) {
            console.error("Batch staging failed:", err);
            toast.error((err as Error).message || "Batch staging failed");
        } finally {
            setTransferring(false);
        }
    }, [loadData]);

    return {
        jobOrders,
        filteredJobOrders,
        selectedJobOrder,
        selectedJobOrderId,
        setSelectedJobOrderId,
        workCenters,
        branches,
        stats,
        loading,
        searchQuery,
        setSearchQuery,
        selectedBranchId,
        setSelectedBranchId,
        selectedStatusFilter,
        setSelectedStatusFilter,
        onlyShortages,
        setOnlyShortages,
        // Transfer Modal
        isTransferModalOpen,
        activeTransferItem,
        transferring,
        handleOpenTransferModal,
        handleCloseTransferModal,
        handlePerformTransfer,
        handleStageAllAvailable,
        // Shortage Dialog
        isShortageDialogOpen,
        setIsShortageDialogOpen,
        shortageWarningInfo,
        handleProceedWithNegativeStock,
        refreshData: loadData
    };
}
