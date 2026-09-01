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
    ShortageWarningInfo,
    BatchStageResult,
    BatchStageMaterialResult,
    BatchStageLotResult
} from "../types";
import { fetchStagingJobOrders, executeBinTransfer } from "../services/staging-api";
import { buildBatchStagePlan } from "../batch-staging";

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
    const [loadError, setLoadError] = useState<string | null>(null);
    const [hasSuccessfulLoad, setHasSuccessfulLoad] = useState(false);
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
    const [batchStageResult, setBatchStageResult] = useState<BatchStageResult | null>(null);

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
                setLoadError(null);
                setJobOrders(res.data);
                setWorkCenters(res.workCenters || []);
                setBranches(res.branches || []);
                if (res.stats) setStats(res.stats);
                setHasSuccessfulLoad(true);

                if (showToast) {
                    toast.success("Material staging data refreshed");
                }
            } else {
                throw new Error(res.error || "Failed to load data");
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Failed to load material staging data";
            console.error("Failed to load material staging data:", err);
            setLoadError(message);
            toast.error(message);
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

    useEffect(() => {
        setBatchStageResult(null);
    }, [selectedJobOrderId]);

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
                    jo_material_id: payload.jo_material_id,
                    allocation_id: payload.allocation_id
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

        const authorizationRemarks = remarks?.trim();
        if (!authorizationRemarks) {
            toast.error("Authorization justification is required for a negative stock override.");
            return;
        }

        const payload: BinTransferPayload = {
            job_order_id: shortageWarningInfo.job_order_id,
            job_order_no: shortageWarningInfo.job_order_no,
            jo_material_id: shortageWarningInfo.jo_material_id,
            product_id: shortageWarningInfo.product_id,
            product_name: shortageWarningInfo.material_name,
            lot_id: shortageWarningInfo.lot_id,
            allocation_id: shortageWarningInfo.allocation_id,
            batch_no: shortageWarningInfo.batch_no,
            transfer_quantity: shortageWarningInfo.transfer_quantity,
            source_bin: shortageWarningInfo.source_bin,
            target_bin: shortageWarningInfo.target_bin,
            work_center_id: shortageWarningInfo.work_center_id,
            override_negative: true,
            remarks: authorizationRemarks
        };

        await handlePerformTransfer(payload);
    }, [shortageWarningInfo, handlePerformTransfer]);

    // Batch Stage All Available for a Job Order
    const handleStageAllAvailable = useCallback(async (jobOrder: StagingJobOrder) => {
        setBatchStageResult(null);
        const stagingWorkCenterId = jobOrder.staging_work_center_id;
        const targetBin = jobOrder.suggested_staging_bin;
        if (!stagingWorkCenterId || !targetBin) {
            toast.error(`Cannot stage JO #${jobOrder.job_order_no}: no active work-center destination is configured.`);
            return;
        }

        try {
            setTransferring(true);
            const materialResults: BatchStageMaterialResult[] = [];

            for (const mat of jobOrder.materials) {
                const plan = buildBatchStagePlan(mat);
                if (plan.requested_quantity <= 0) continue;

                const lotResults: BatchStageLotResult[] = plan.skipped_lots.map((lot) => ({
                    allocation_id: lot.allocation_id,
                    lot_id: lot.lot_id,
                    batch_no: lot.batch_no,
                    requested_quantity: 0,
                    staged_quantity: 0,
                    available_quantity: lot.available_lot_quantity,
                    status: "SKIPPED",
                    message: lot.reason
                }));
                let materialStagedQuantity = 0;

                for (const segment of plan.segments) {
                    const payload: BinTransferPayload = {
                        job_order_id: jobOrder.job_order_id,
                        job_order_no: jobOrder.job_order_no,
                        jo_material_id: mat.jo_material_id,
                        product_id: mat.product_id,
                        product_name: mat.product_name,
                        lot_id: segment.lot_id,
                        allocation_id: segment.allocation_id,
                        batch_no: segment.batch_no,
                        transfer_quantity: segment.quantity,
                        source_bin: "MAIN-STORE",
                        target_bin: targetBin,
                        work_center_id: stagingWorkCenterId,
                        override_negative: false
                    };

                    const lotResult: BatchStageLotResult = {
                        allocation_id: segment.allocation_id,
                        lot_id: segment.lot_id,
                        batch_no: segment.batch_no,
                        requested_quantity: segment.quantity,
                        staged_quantity: 0,
                        available_quantity: segment.available_lot_quantity,
                        status: "FAILED",
                        message: "Transfer was not completed."
                    };

                    try {
                        const res = await executeBinTransfer(payload);
                        if (res.success) {
                            lotResult.status = "STAGED";
                            lotResult.staged_quantity = segment.quantity;
                            lotResult.message = res.message || "Material staged successfully.";
                            materialStagedQuantity += segment.quantity;
                        } else {
                            lotResult.available_quantity = res.available_quantity ?? lotResult.available_quantity;
                            lotResult.shortage_quantity = res.shortage_quantity;
                            lotResult.message = res.message || res.error || "Transfer failed.";
                        }
                    } catch (err) {
                        lotResult.message = err instanceof Error ? err.message : "Transfer failed.";
                    }

                    lotResults.push(lotResult);
                }

                const materialRemainingQuantity = Math.max(0, Number((plan.requested_quantity - materialStagedQuantity).toFixed(6)));
                const materialStatus = materialRemainingQuantity <= 0.000001
                    ? "STAGED"
                    : materialStagedQuantity > 0
                        ? "PARTIAL"
                        : plan.segments.length > 0
                            ? "FAILED"
                            : "SKIPPED";
                const materialMessage = materialStatus === "STAGED"
                    ? `Staged ${materialStagedQuantity} ${mat.uom}.`
                    : materialStatus === "PARTIAL"
                        ? `Staged ${materialStagedQuantity} ${mat.uom}; ${materialRemainingQuantity} ${mat.uom} remains.`
                        : materialStatus === "SKIPPED"
                            ? "No eligible allocated lot has remaining exact stock and allocation capacity."
                            : "No planned lot transfer succeeded; review the lot-level errors.";

                materialResults.push({
                    jo_material_id: mat.jo_material_id,
                    product_id: mat.product_id,
                    product_name: mat.product_name,
                    uom: mat.uom,
                    requested_quantity: plan.requested_quantity,
                    staged_quantity: materialStagedQuantity,
                    remaining_quantity: materialRemainingQuantity,
                    status: materialStatus,
                    message: materialMessage,
                    lot_results: lotResults
                });
            }

            const result: BatchStageResult = {
                job_order_id: jobOrder.job_order_id,
                job_order_no: jobOrder.job_order_no,
                attempted_material_count: materialResults.length,
                fully_staged_material_count: materialResults.filter((material) => material.status === "STAGED").length,
                exception_material_count: materialResults.filter((material) => material.status !== "STAGED").length,
                full_success: materialResults.length > 0 && materialResults.every((material) => material.status === "STAGED"),
                material_results: materialResults
            };
            setBatchStageResult(result);
            await loadData();

            if (result.full_success) {
                toast.success(`Batch staged all available material for JO #${jobOrder.job_order_no}`);
            } else if (result.material_results.length > 0) {
                toast.warning(`Batch staging completed with exceptions for JO #${jobOrder.job_order_no}. Review the lot results.`);
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
        loadError,
        hasSuccessfulLoad,
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
        batchStageResult,
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
