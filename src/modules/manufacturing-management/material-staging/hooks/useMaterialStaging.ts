"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
    AllocatedLot,
    BatchStageMaterialResult,
    BatchStageResult,
    MaterialStagingItem,
    StagingCommitPayload,
    StagingJobOrder,
    StagingStats,
    WorkCenter,
    Branch
} from "../types";
import { commitMaterialStaging, fetchAllocationPreview, fetchStagingJobOrders } from "../services/staging-api";
import { isJobOrderStatus, JOB_ORDER_STATUS } from "../../job-order-status";

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
    const [selectedBranchId, setSelectedBranchId] = useState("all");
    const [selectedStatusFilter, setSelectedStatusFilter] = useState("PLANNED_RESERVED");
    const [onlyShortages, setOnlyShortages] = useState(false);
    const [selectedJobOrderId, setSelectedJobOrderId] = useState<number | null>(null);
    const [isAllocationModalOpen, setIsAllocationModalOpen] = useState(false);
    const [activeAllocationItem, setActiveAllocationItem] = useState<{
        jobOrder: StagingJobOrder;
        material: MaterialStagingItem;
        lot?: AllocatedLot;
    } | null>(null);
    const [transferring, setTransferring] = useState(false);
    const [batchStageResult, setBatchStageResult] = useState<BatchStageResult | null>(null);
    const [stageProgressLabel, setStageProgressLabel] = useState<string | null>(null);
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [pendingDeepLinkJo, setPendingDeepLinkJo] = useState<string | null>(null);

    // Debounce the server search so typing does not refetch on every keystroke.
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Deep link support: /mm/material-staging?jo=JO-XXXX
    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        setPendingDeepLinkJo(params.get("jo"));
    }, []);

    useEffect(() => {
        if (!pendingDeepLinkJo || jobOrders.length === 0) return;
        const match = jobOrders.find(jobOrder => jobOrder.job_order_no === pendingDeepLinkJo);
        if (match) {
            setSelectedStatusFilter("all");
            setSelectedJobOrderId(match.job_order_id);
        }
        setPendingDeepLinkJo(null);
    }, [pendingDeepLinkJo, jobOrders]);

    const loadData = useCallback(async (showToast = false) => {
        try {
            setLoading(true);
            const response = await fetchStagingJobOrders({ branchId: selectedBranchId, search: debouncedSearch });
            if (!response.success) throw new Error(response.error || "Failed to load data");
            setLoadError(null);
            setJobOrders(response.data);
            setWorkCenters(response.workCenters || []);
            setBranches(response.branches || []);
            if (response.stats) setStats(response.stats);
            setHasSuccessfulLoad(true);
            if (showToast) toast.success("Material staging data refreshed");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to load material staging data";
            console.error("Failed to load material staging data:", error);
            setLoadError(message);
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }, [selectedBranchId, debouncedSearch]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const filteredJobOrders = useMemo(() => jobOrders.filter(jobOrder => {
        if (selectedStatusFilter === "PLANNED_RESERVED" && !isJobOrderStatus(jobOrder.status, JOB_ORDER_STATUS.PLANNED, JOB_ORDER_STATUS.RESERVED, JOB_ORDER_STATUS.DRAFT)) return false;
        if (selectedStatusFilter === "PLANNED" && !isJobOrderStatus(jobOrder.status, JOB_ORDER_STATUS.PLANNED, JOB_ORDER_STATUS.DRAFT)) return false;
        if (selectedStatusFilter === "RESERVED" && !isJobOrderStatus(jobOrder.status, JOB_ORDER_STATUS.RESERVED)) return false;
        if (selectedStatusFilter === "RELEASED" && !isJobOrderStatus(jobOrder.status, JOB_ORDER_STATUS.RELEASED, JOB_ORDER_STATUS.PROCEED)) return false;
        if (onlyShortages && !jobOrder.has_shortage) return false;
        const query = searchQuery.trim().toLowerCase();
        if (!query) return true;
        return Boolean(
            jobOrder.job_order_no?.toLowerCase().includes(query)
            || jobOrder.product_name?.toLowerCase().includes(query)
            || jobOrder.product_code?.toLowerCase().includes(query)
            || jobOrder.primary_work_center_name?.toLowerCase().includes(query)
            || jobOrder.materials?.some(material => material.product_name?.toLowerCase().includes(query)
                || material.product_code?.toLowerCase().includes(query)
                || material.allocations?.some(allocation => allocation.batch_no?.toLowerCase().includes(query)))
        );
    }), [jobOrders, selectedStatusFilter, onlyShortages, searchQuery]);

    useEffect(() => {
        // A pending deep link owns the initial selection.
        if (pendingDeepLinkJo) return;
        const visible = selectedJobOrderId !== null && filteredJobOrders.some(jobOrder => jobOrder.job_order_id === selectedJobOrderId);
        const nextId = visible ? selectedJobOrderId : filteredJobOrders[0]?.job_order_id ?? null;
        if (nextId !== selectedJobOrderId) setSelectedJobOrderId(nextId);
    }, [filteredJobOrders, selectedJobOrderId, pendingDeepLinkJo]);

    const selectedJobOrder = useMemo(
        () => filteredJobOrders.find(jobOrder => jobOrder.job_order_id === selectedJobOrderId) || filteredJobOrders[0] || null,
        [filteredJobOrders, selectedJobOrderId]
    );

    const handleDismissBatchStageResult = useCallback(() => {
        setBatchStageResult(null);
    }, []);

    const handleOpenAllocationModal = useCallback((jobOrder: StagingJobOrder, material: MaterialStagingItem, lot?: AllocatedLot) => {
        setActiveAllocationItem({ jobOrder, material, lot });
        setIsAllocationModalOpen(true);
    }, []);

    const handleCloseAllocationModal = useCallback(() => {
        setIsAllocationModalOpen(false);
        setActiveAllocationItem(null);
    }, []);

    const handleCommitAllocation = useCallback(async (payload: StagingCommitPayload) => {
        try {
            setTransferring(true);
            setStageProgressLabel("Moving materials to the floor bin...");
            const result = await commitMaterialStaging(payload);
            setBatchStageResult({
                job_order_id: result.data.job_order_id,
                job_order_no: result.data.job_order_no,
                attempted_material_count: result.data.material_results.length,
                fully_staged_material_count: result.data.material_results.filter(material => material.status === "STAGED").length,
                exception_material_count: result.data.material_results.filter(material => material.status !== "STAGED").length,
                full_success: result.data.material_results.every(material => material.status === "STAGED"),
                material_results: result.data.material_results
            });
            toast.success(result.message || "Material staged successfully.");
            handleCloseAllocationModal();
            await loadData();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Material staging failed.");
            throw error;
        } finally {
            setTransferring(false);
            setStageProgressLabel(null);
        }
    }, [handleCloseAllocationModal, loadData]);

    const handleStageAllAvailable = useCallback(async (jobOrder: StagingJobOrder) => {
        if (isJobOrderStatus(jobOrder.status, JOB_ORDER_STATUS.CANCELLED)) {
            toast.error(`Cannot stage JO #${jobOrder.job_order_no}: it is cancelled.`);
            return;
        }
        const workCenterId = jobOrder.staging_work_center_id;
        if (!workCenterId) {
            toast.error(`Cannot stage JO #${jobOrder.job_order_no}: no active work-center destination is configured.`);
            return;
        }
        const materialIds = jobOrder.materials.filter(material => material.required_quantity > material.staged_quantity + 0.000001).map(material => material.jo_material_id);
        if (materialIds.length === 0) {
            toast.info("All material requirements are already staged.");
            return;
        }

        try {
            setTransferring(true);
            setStageProgressLabel("Matching available stock (Auto FEFO)...");
            const preview = await fetchAllocationPreview({
                job_order_id: jobOrder.job_order_id,
                job_order_no: jobOrder.job_order_no,
                work_center_id: workCenterId,
                mode: "auto",
                material_ids: materialIds
            });
            if (!preview.success || preview.shortages.length > 0) {
                const materialResults = preview.materials.map(material => toBatchStageMaterialResult(material));
                setBatchStageResult({
                    job_order_id: jobOrder.job_order_id,
                    job_order_no: jobOrder.job_order_no,
                    attempted_material_count: materialResults.length,
                    fully_staged_material_count: materialResults.filter(material => material.status === "STAGED").length,
                    exception_material_count: materialResults.filter(material => material.status !== "STAGED").length,
                    full_success: false,
                    material_results: materialResults
                });
                toast.warning("Auto FEFO could not fully allocate every material. Review the lot-level shortages.");
                return;
            }
            setStageProgressLabel("Moving materials to the floor bin...");
            const result = await commitMaterialStaging({
                job_order_id: jobOrder.job_order_id,
                job_order_no: jobOrder.job_order_no,
                work_center_id: workCenterId,
                mode: "auto",
                material_ids: materialIds,
                lines: preview.proposed_allocations,
                source_bin: "MAIN-STORE",
                operation_id: crypto.randomUUID(),
                preview_token: preview.preview_token,
                remarks: `Auto FEFO staging for JO #${jobOrder.job_order_no}`
            });
            setBatchStageResult({
                job_order_id: result.data.job_order_id,
                job_order_no: result.data.job_order_no,
                attempted_material_count: result.data.material_results.length,
                fully_staged_material_count: result.data.material_results.filter(material => material.status === "STAGED").length,
                exception_material_count: result.data.material_results.filter(material => material.status !== "STAGED").length,
                full_success: result.data.material_results.every(material => material.status === "STAGED"),
                material_results: result.data.material_results
            });
            toast.success(`Auto FEFO staged all available material for JO #${jobOrder.job_order_no}.`);
            await loadData();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Batch staging failed.");
        } finally {
            setTransferring(false);
            setStageProgressLabel(null);
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
        isAllocationModalOpen,
        activeAllocationItem,
        transferring,
        batchStageResult,
        stageProgressLabel,
        handleDismissBatchStageResult,
        handleOpenAllocationModal,
        handleCloseAllocationModal,
        handleCommitAllocation,
        handleStageAllAvailable,
        refreshData: loadData
    };
}

function toBatchStageMaterialResult(material: {
    jo_material_id: number;
    product_id: number;
    product_name: string;
    uom: string;
    remaining_quantity: number;
    proposed_allocations: Array<{ mm_lot_id: number; batch_no: string; quantity: number; available_quantity?: number }>;
}): BatchStageMaterialResult {
    const stagedQuantity = material.proposed_allocations.reduce((total, line) => total + line.quantity, 0);
    return {
        jo_material_id: material.jo_material_id,
        product_id: material.product_id,
        product_name: material.product_name,
        uom: material.uom,
        requested_quantity: material.remaining_quantity,
        staged_quantity: stagedQuantity,
        remaining_quantity: Math.max(0, material.remaining_quantity - stagedQuantity),
        status: stagedQuantity >= material.remaining_quantity - 0.000001 ? "STAGED" : stagedQuantity > 0 ? "PARTIAL" : "FAILED",
        message: "Auto FEFO preview completed with exceptions.",
        lot_results: material.proposed_allocations.map(line => ({
            lot_id: line.mm_lot_id,
            batch_no: line.batch_no,
            requested_quantity: line.quantity,
            staged_quantity: line.quantity,
            available_quantity: line.available_quantity,
            status: "STAGED",
            message: "Proposed by Auto FEFO."
        }))
    };
}
