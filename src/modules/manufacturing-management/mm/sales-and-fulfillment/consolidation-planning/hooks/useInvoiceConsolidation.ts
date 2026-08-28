"use client";

import { useState, useEffect, useCallback } from "react";
import { InvoiceConsolidation, CandidateInvoice, StatusSummary, Branch } from "../types";
import {
    fetchConsolidations,
    fetchSummary,
    fetchCandidates,
    fetchBranches,
    fetchConsolidationByNo,
    createConsolidation,
    auditBatch,
    revertBatch,
    repickBatch,
    startPicking,
    completePicking,
    savePickedQuantities,
} from "../services/invoice-consolidation-api";
import { toast } from "sonner";

export function useInvoiceConsolidation() {
    const [consolidations, setConsolidations] = useState<InvoiceConsolidation[]>([]);
    const [summary, setSummary] = useState<StatusSummary>({ Pending: 0, Picking: 0, Picked: 0, Audited: 0, All: 0 });
    const [candidates, setCandidates] = useState<CandidateInvoice[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [page, setPage] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [statusFilter, setStatusFilter] = useState("All");
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearch(searchQuery), 400);
        return () => clearTimeout(handler);
    }, [searchQuery]);
    const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
    const [selectedConsolidation, setSelectedConsolidation] = useState<InvoiceConsolidation | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);

    const branchId = selectedBranch?.id;

    const loadBranches = useCallback(async () => {
        try {
            const data = await fetchBranches();
            setBranches(data || []);
        } catch {
            // non-critical
        }
    }, []);

    const loadData = useCallback(async () => {
        if (!branchId) return;
        setLoading(true);
        try {
            const [consRes, sumRes] = await Promise.all([
                fetchConsolidations({ branchId, page, size: 50, status: statusFilter, search: debouncedSearch }),
                fetchSummary(branchId),
            ]);
            setConsolidations(consRes.content || []);
            setTotalPages(consRes.totalPages || 0);
            setSummary(sumRes);
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to load consolidations");
        } finally {
            setLoading(false);
        }
    }, [branchId, page, statusFilter, debouncedSearch]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        loadBranches();
    }, [loadBranches]);

    const handleBranchChange = useCallback((branch: Branch | null) => {
        setSelectedBranch(branch);
        setPage(0);
        setStatusFilter("All");
        setSearchQuery("");
        setSelectedConsolidation(null);
        setShowCreateModal(false);
        setCandidates([]);
    }, []);

    const loadCandidates = useCallback(async (bId: number) => {
        try {
            const data = await fetchCandidates(bId);
            setCandidates(data);
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to load candidate invoices");
        }
    }, []);

    const openDetail = useCallback(async (c: InvoiceConsolidation) => {
        try {
            const fresh = await fetchConsolidationByNo(c.consolidatorNo);
            setSelectedConsolidation(fresh);
        } catch {
            setSelectedConsolidation(c);
        }
    }, []);

    const handleCreate = async (payload: { branchId: number; invoiceIds: number[] }) => {
        setSubmitting(true);
        try {
            await createConsolidation(payload);
            toast.success("Invoice consolidation batch created successfully");
            setShowCreateModal(false);
            await loadData();
            return true;
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to create consolidation");
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const handleAudit = async (batchId: number) => {
        setSubmitting(true);
        try {
            const result = await auditBatch({ batchId });
            toast.success(result.message || "Batch audited successfully");
            await loadData();
            setSelectedConsolidation(null);
            return true;
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to audit batch");
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const handleRevert = async (batchId: number) => {
        setSubmitting(true);
        try {
            const result = await revertBatch(batchId);
            toast.success(result.message || "Batch reverted to Pending");
            await loadData();
            setSelectedConsolidation(null);
            return true;
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to revert batch");
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const handleRepick = async (batchId: number) => {
        setSubmitting(true);
        try {
            const result = await repickBatch(batchId);
            toast.success(result.message || "Batch returned to picking floor");
            await loadData();
            return true;
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to re-pick batch");
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const handleStartPicking = async (batchId: number) => {
        setSubmitting(true);
        try {
            const result = await startPicking(batchId);
            toast.success(result.message || "Picking started");
            await loadData();
            setSelectedConsolidation(null);
            return true;
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to start picking");
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const handleCompletePicking = async (batchId: number) => {
        setSubmitting(true);
        try {
            const result = await completePicking(batchId);
            toast.success(result.message || "Picking completed");
            await loadData();
            setSelectedConsolidation(null);
            return true;
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to complete picking");
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    const handleSaveQuantities = async (payload: { batchId: number; quantities: { detailId: number; pickedQuantity: number }[] }) => {
        setSubmitting(true);
        try {
            const result = await savePickedQuantities(payload);
            toast.success(result.message || "Quantities saved");
            await loadData();
            return true;
        } catch (e) {
            const err = e as Error;
            toast.error(err.message || "Failed to save quantities");
            return false;
        } finally {
            setSubmitting(false);
        }
    };

    return {
        consolidations,
        summary,
        candidates,
        branches,
        selectedBranch,
        loading,
        submitting,
        page,
        totalPages,
        statusFilter,
        searchQuery,
        branchId,
        selectedConsolidation,
        showCreateModal,
        setPage,
        setStatusFilter,
        setSearchQuery,
        handleBranchChange,
        setSelectedConsolidation,
        setShowCreateModal,
        loadCandidates,
        handleCreate,
        handleAudit,
        handleRevert,
        handleRepick,
        handleStartPicking,
        handleCompletePicking,
        handleSaveQuantities,
        openDetail,
        refresh: loadData,
    };
}
