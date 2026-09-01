"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
    X,
    Search,
    Loader2,
    CheckSquare,
    Square,
    FileText,
    Building2,
    Package,
    ChevronRight,
    ChevronDown,
    AlertTriangle,
    AlertCircle,
    Sliders,
    Sparkles,
    CheckCircle2,
    RotateCcw,
    ArrowRight,
    ArrowLeft,
    Filter,
    Layers,
    Maximize2,
    Minimize2,
} from "lucide-react";
import {
    CandidateInvoice,
    Branch,
    AllocationPreview,
    CreateConsolidationPayload,
    CustomAllocationItem,
    AvailableLotBatch,
} from "../types";
import { fetchAllocationPreview } from "../services/invoice-consolidation-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/modules/manufacturing-management/shared/components/SearchableSelect";
import { toast } from "sonner";

interface Props {
    isOpen: boolean;
    onClose: () => void;
    branch: Branch;
    candidates: CandidateInvoice[];
    loading: boolean;
    onSubmit: (payload: CreateConsolidationPayload) => Promise<boolean>;
}

type AllocationMode = "auto" | "manual";
type ModalStep = 1 | 2 | 3;

export default function CreateConsolidationModal({
    isOpen,
    onClose,
    branch,
    candidates,
    loading,
    onSubmit,
}: Props) {
    const [step, setStep] = useState<ModalStep>(1);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [expandedInvoiceIds, setExpandedInvoiceIds] = useState<Set<number>>(new Set());
    const [collapsedStep2InvoiceIds, setCollapsedStep2InvoiceIds] = useState<Set<number>>(new Set());
    const [step2Search, setStep2Search] = useState<string>("");
    const [step2CustomerFilter, setStep2CustomerFilter] = useState<string>("ALL");
    const [step2ProductFilter, setStep2ProductFilter] = useState<string>("ALL");
    const [step2StatusFilter, setStep2StatusFilter] = useState<string>("ALL");
    const [submitting, setSubmitting] = useState(false);
    const [allocationMode, setAllocationMode] = useState<AllocationMode>("auto");

    // Filters for Step 1
    const [search, setSearch] = useState("");
    const [selectedCustomer, setSelectedCustomer] = useState<string>("ALL");
    const [selectedDocType, setSelectedDocType] = useState<string>("ALL");
    const [dateFrom, setDateFrom] = useState<string>("");
    const [dateTo, setDateTo] = useState<string>("");

    const [allocationPreview, setAllocationPreview] = useState<AllocationPreview | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    // Manual allocation state: key = `${invoiceId}:${productId}:${inventoryLotId}:${batchNo}:${lotId}` -> allocated quantity
    const [manualAllocations, setManualAllocations] = useState<Record<string, number>>({});

    const getManualKey = useCallback(
        (invoiceId: number, productId: number, inventoryLotId?: number, lotId?: number, batchNo?: string) =>
            `${invoiceId}:${productId}:${inventoryLotId || 0}:${batchNo || "LOT-N/A"}:${lotId || 0}`,
        []
    );

    // Fetch allocation preview when entering step 2 or step 3
    useEffect(() => {
        if (!isOpen || selectedIds.size === 0 || step === 1) return;
        if (allocationPreview) return; // already loaded

        const controller = new AbortController();
        const invoiceIds = [...selectedIds].sort((a, b) => a - b);
        const timer = window.setTimeout(() => {
            setPreviewLoading(true);
            setPreviewError(null);
            fetchAllocationPreview({ branchId: branch.id, invoiceIds }, controller.signal)
                .then((preview) => {
                    setAllocationPreview(preview);
                    // Pre-fill manual allocations with default FEFO allocations per invoice
                    const initialManual: Record<string, number> = {};
                    if (preview.invoiceBreakdown && preview.invoiceBreakdown.length > 0) {
                        for (const inv of preview.invoiceBreakdown) {
                            for (const line of inv.lines || []) {
                                for (const a of line.allocations || []) {
                                    const key = getManualKey(inv.invoiceId, line.productId, a.inventoryLotId, a.lotId, a.batchNo);
                                    initialManual[key] = (initialManual[key] || 0) + a.quantity;
                                }
                            }
                        }
                    }
                    setManualAllocations(initialManual);
                })
                .catch((error: Error) => {
                    if (error.name !== "AbortError") {
                        setAllocationPreview(null);
                        setPreviewError(error.message);
                        toast.error(error.message || "Failed to load live stock from Spring Boot service", {
                            duration: 6000,
                            id: "consolidation-preview-error",
                        });
                    }
                })
                .finally(() => {
                    if (!controller.signal.aborted) setPreviewLoading(false);
                });
        }, 150);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [branch.id, isOpen, selectedIds, step, allocationPreview, getManualKey]);

    const setSelection = (next: Set<number>) => {
        setSelectedIds(next);
        setAllocationPreview(null);
        setPreviewLoading(false);
        setPreviewError(null);
        setManualAllocations({});
    };

    const resetStep2Filters = () => {
        setStep2Search("");
        setStep2CustomerFilter("ALL");
        setStep2ProductFilter("ALL");
        setStep2StatusFilter("ALL");
    };

    const handleClose = () => {
        setStep(1);
        setSelectedIds(new Set());
        setAllocationPreview(null);
        setManualAllocations({});
        setCollapsedStep2InvoiceIds(new Set());
        setExpandedInvoiceIds(new Set());
        setSearch("");
        setSelectedCustomer("ALL");
        setSelectedDocType("ALL");
        setDateFrom("");
        setDateTo("");
        resetStep2Filters();
        onClose();
    };

    const step1DocTypeSelectOptions = [
        { value: "ALL", label: "All Orders (SO & JO)" },
        { value: "SALES_ORDER", label: "Sales Orders (SO)" },
        { value: "JOB_ORDER", label: "Job Orders (JO)" },
    ];

    const customerOptions = useMemo(() => {
        const map = new Map<string, string>();
        for (const c of candidates) {
            if (c.customerCode) {
                map.set(c.customerCode, c.customerName || c.customerCode);
            }
        }
        return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
    }, [candidates]);

    const step1CustomerSelectOptions = useMemo(() => {
        return [
            { value: "ALL", label: `All Customers (${customerOptions.length})` },
            ...customerOptions.map((c) => ({
                value: c.code,
                label: c.name,
                subLabel: c.code,
            })),
        ];
    }, [customerOptions]);

    const filtered = useMemo(() => {
        return candidates.filter((c) => {
            if (selectedDocType === "SALES_ORDER" && c.documentType !== "SALES_ORDER") return false;
            if (selectedDocType === "JOB_ORDER" && c.documentType !== "JOB_ORDER") return false;
            if (selectedCustomer !== "ALL" && c.customerCode !== selectedCustomer) return false;
            if (dateFrom && c.invoiceDate && c.invoiceDate < dateFrom) return false;
            if (dateTo && c.invoiceDate && c.invoiceDate > dateTo) return false;

            if (search.trim()) {
                const q = search.toLowerCase();
                const matchInvoice = c.invoiceNo.toLowerCase().includes(q);
                const matchCustName = (c.customerName || "").toLowerCase().includes(q);
                const matchCustCode = (c.customerCode || "").toLowerCase().includes(q);
                const matchSo = (c.orderNo || "").toLowerCase().includes(q);
                const matchPo = (c.poNo || "").toLowerCase().includes(q);
                const matchProduct = c.products.some(
                    (p) => p.productName.toLowerCase().includes(q) || p.productCode.toLowerCase().includes(q)
                );
                if (!matchInvoice && !matchCustName && !matchCustCode && !matchSo && !matchPo && !matchProduct) {
                    return false;
                }
            }

            return true;
        });
    }, [candidates, search, selectedCustomer, selectedDocType, dateFrom, dateTo]);

    const toggleAll = () => {
        if (selectedIds.size === filtered.length) {
            setSelection(new Set());
        } else {
            setSelection(new Set(filtered.map((c) => c.invoiceId)));
        }
    };

    const toggle = (id: number) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelection(next);
    };

    const toggleExpand = (id: number) => {
        const next = new Set(expandedInvoiceIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setExpandedInvoiceIds(next);
    };

    const resetFilters = () => {
        setSearch("");
        setSelectedCustomer("ALL");
        setSelectedDocType("ALL");
        setDateFrom("");
        setDateTo("");
    };

    const totalSelectedAmount = useMemo(() => {
        return candidates
            .filter((c) => selectedIds.has(c.invoiceId))
            .reduce((sum, c) => sum + (c.netAmount || 0), 0);
    }, [candidates, selectedIds]);

    const selectedInvoices = useMemo(() => {
        return candidates.filter((c) => selectedIds.has(c.invoiceId));
    }, [candidates, selectedIds]);

    const step2CustomerOptions = useMemo(() => {
        const map = new Map<string, string>();
        for (const inv of selectedInvoices) {
            if (inv.customerCode) {
                map.set(inv.customerCode, inv.customerName || inv.customerCode);
            }
        }
        return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
    }, [selectedInvoices]);

    const step2CustomerSelectOptions = useMemo(() => {
        return [
            { value: "ALL", label: `All Customers (${step2CustomerOptions.length})` },
            ...step2CustomerOptions.map((c) => ({
                value: c.code,
                label: c.name,
                subLabel: c.code,
            })),
        ];
    }, [step2CustomerOptions]);

    const step2ProductOptions = useMemo(() => {
        const map = new Map<number, { name: string; code: string }>();
        for (const inv of selectedInvoices) {
            for (const p of inv.products) {
                if (!map.has(p.productId)) {
                    map.set(p.productId, { name: p.productName, code: p.productCode });
                }
            }
        }
        return Array.from(map.entries()).map(([id, info]) => ({ id, name: info.name, code: info.code }));
    }, [selectedInvoices]);

    const step2ProductSelectOptions = useMemo(() => {
        return [
            { value: "ALL", label: `All Products (${step2ProductOptions.length})` },
            ...step2ProductOptions.map((p) => ({
                value: String(p.id),
                label: p.name,
                subLabel: p.code,
            })),
        ];
    }, [step2ProductOptions]);

    const step2StatusSelectOptions = useMemo(() => {
        return [
            { value: "ALL", label: "All Statuses" },
            {
                value: "ALLOCATED",
                label: "Fully Allocated Only",
                badge: "Allocated",
                badgeClassName: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-bold",
            },
            {
                value: "SHORTAGE",
                label: "Has Shortages Only",
                badge: "Shortage",
                badgeClassName: "bg-amber-500/10 text-amber-600 border-amber-500/20 font-bold",
            },
        ];
    }, []);

    const hasActiveStep2Filters =
        step2Search.trim() !== "" ||
        step2CustomerFilter !== "ALL" ||
        step2ProductFilter !== "ALL" ||
        step2StatusFilter !== "ALL";

    const toggleStep2Invoice = (id: number) => {
        setCollapsedStep2InvoiceIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const expandAllStep2Invoices = () => {
        setCollapsedStep2InvoiceIds(new Set());
    };

    const collapseAllStep2Invoices = () => {
        setCollapsedStep2InvoiceIds(new Set(selectedIds));
    };

    const aggregatedProducts = useMemo(() => {
        const selected = candidates.filter((c) => selectedIds.has(c.invoiceId));
        const versionSets = new Map<number, Set<string>>();
        const agg = new Map<
            number,
            { quantity: number; invoiceCount: Set<number>; productName: string; productCode: string }
        >();
        for (const inv of selected) {
            for (const p of inv.products) {
                if (!agg.has(p.productId)) {
                    agg.set(p.productId, {
                        quantity: 0,
                        invoiceCount: new Set(),
                        productName: p.productName,
                        productCode: p.productCode,
                    });
                }
                if (!versionSets.has(p.productId)) versionSets.set(p.productId, new Set());
                const entry = agg.get(p.productId)!;
                entry.quantity += p.quantity;
                entry.invoiceCount.add(inv.invoiceId);
                versionSets.get(p.productId)!.add(p.versionName || "Unversioned");
            }
        }
        return Array.from(agg.entries())
            .map(([productId, e]) => ({
                productId,
                productName: e.productName,
                productCode: e.productCode,
                totalQuantity: e.quantity,
                invoiceCount: e.invoiceCount.size,
                versionLabel:
                    versionSets.get(productId)!.size > 1
                        ? "Multiple versions"
                        : versionSets.get(productId)!.values().next().value || "Not assigned",
            }))
            .sort((a, b) => a.productName.localeCompare(b.productName));
    }, [candidates, selectedIds]);

    // Lookup map for invoice allocation breakdown
    const invoiceBreakdownMap = useMemo(() => {
        const map = new Map<
            number,
            Map<
                number,
                Array<{
                    inventoryLotId: number;
                    lotId: number;
                    lotName: string;
                    batchNo: string;
                    expiryDate: string | null;
                    quantity: number;
                }>
            >
        >();
        if (!allocationPreview?.invoiceBreakdown) return map;

        for (const inv of allocationPreview.invoiceBreakdown) {
            const lineMap = new Map<
                number,
                Array<{
                    inventoryLotId: number;
                    lotId: number;
                    lotName: string;
                    batchNo: string;
                    expiryDate: string | null;
                    quantity: number;
                }>
            >();
            for (const line of inv.lines) {
                lineMap.set(line.productId, line.allocations || []);
            }
            map.set(inv.invoiceId, lineMap);
        }
        return map;
    }, [allocationPreview]);

    // Available batches grouped by productId
    const batchesByProduct = useMemo(() => {
        const map = new Map<number, AvailableLotBatch[]>();
        if (!allocationPreview?.availableBatches) return map;
        for (const batch of allocationPreview.availableBatches) {
            const list = map.get(batch.productId) || [];
            list.push(batch);
            map.set(batch.productId, list);
        }
        return map;
    }, [allocationPreview]);

    // Manual allocation summary per invoice line (invoiceId, productId)
    const getManualLineSummary = useCallback(
        (invoiceId: number, productId: number, requiredQty: number) => {
            const batches = batchesByProduct.get(productId) || [];
            let allocated = 0;
            for (const b of batches) {
                const key = getManualKey(invoiceId, productId, b.inventoryLotId, b.lotId, b.batchNo);
                allocated += Number(manualAllocations[key] || 0);
            }
            const difference = allocated - requiredQty;
            return {
                required: requiredQty,
                allocated,
                isValid: difference === 0,
                difference,
            };
        },
        [batchesByProduct, getManualKey, manualAllocations]
    );

    // Validation: all selected invoice lines must be balanced AND total allocations per batch must not exceed available quantity
    const isManualValid = useMemo(() => {
        if (selectedInvoices.length === 0) return false;

        // 1. Every invoice line must have exactly its required quantity allocated
        for (const inv of selectedInvoices) {
            for (const p of inv.products) {
                const summary = getManualLineSummary(inv.invoiceId, p.productId, p.quantity);
                if (!summary.isValid) return false;
            }
        }

        // 2. Total allocated per batch across ALL invoices must not exceed available quantity
        const totalAllocatedPerBatch = new Map<string, number>();
        for (const [key, qty] of Object.entries(manualAllocations)) {
            if (qty > 0) {
                const [, productIdStr, invLotIdStr, batchNo, lotIdStr] = key.split(":");
                const batchKey = `${productIdStr}:${invLotIdStr}:${batchNo}:${lotIdStr}`;
                totalAllocatedPerBatch.set(batchKey, (totalAllocatedPerBatch.get(batchKey) || 0) + qty);
            }
        }

        for (const [batchKey, totalQty] of totalAllocatedPerBatch.entries()) {
            const [productIdStr, invLotIdStr, batchNo, lotIdStr] = batchKey.split(":");
            const productId = Number(productIdStr);
            const invLotId = Number(invLotIdStr);
            const lotId = Number(lotIdStr);
            const batch = (allocationPreview?.availableBatches || []).find(
                (b) =>
                    b.productId === productId &&
                    ((invLotId > 0 && b.inventoryLotId === invLotId) || (b.batchNo === batchNo && b.lotId === lotId))
            );
            if (batch && totalQty > batch.availableQuantity) {
                return false;
            }
        }

        return true;
    }, [selectedInvoices, getManualLineSummary, manualAllocations, allocationPreview]);

    const handleManualQtyChange = (
        invoiceId: number,
        productId: number,
        inventoryLotId: number | undefined,
        lotId: number | undefined,
        batchNo: string | undefined,
        maxAvail: number,
        val: string
    ) => {
        const parsed = Math.max(0, Math.min(maxAvail, Number(val) || 0));
        const key = getManualKey(invoiceId, productId, inventoryLotId, lotId, batchNo);
        setManualAllocations((prev) => ({
            ...prev,
            [key]: parsed,
        }));
    };

    const handleResetToAutoFEFO = useCallback(() => {
        if (!allocationPreview) return;
        const initialManual: Record<string, number> = {};
        if (allocationPreview.invoiceBreakdown && allocationPreview.invoiceBreakdown.length > 0) {
            for (const inv of allocationPreview.invoiceBreakdown) {
                for (const line of inv.lines || []) {
                    for (const a of line.allocations || []) {
                        const key = getManualKey(inv.invoiceId, line.productId, a.inventoryLotId, a.lotId, a.batchNo);
                        initialManual[key] = (initialManual[key] || 0) + a.quantity;
                    }
                }
            }
        }
        setManualAllocations(initialManual);
    }, [allocationPreview, getManualKey]);

    const getInvoiceLineAllocations = useCallback(
        (invoiceId: number, productId: number, requiredQty: number) => {
            const fromMap = invoiceBreakdownMap.get(invoiceId)?.get(productId);
            if (fromMap && fromMap.length > 0) {
                const total = fromMap.reduce((s, a) => s + a.quantity, 0);
                return {
                    allocations: fromMap,
                    allocatedQty: total,
                    shortageQty: Math.max(0, requiredQty - total),
                };
            }

            if (allocationPreview?.allocations) {
                const matchingAllocs = allocationPreview.allocations.filter((a) => a.productId === productId);
                if (matchingAllocs.length > 0) {
                    const total = matchingAllocs.reduce((s, a) => s + a.quantity, 0);
                    return {
                        allocations: matchingAllocs,
                        allocatedQty: Math.min(requiredQty, total),
                        shortageQty: Math.max(0, requiredQty - total),
                    };
                }
            }

            return {
                allocations: [],
                allocatedQty: 0,
                shortageQty: requiredQty,
            };
        },
        [invoiceBreakdownMap, allocationPreview]
    );

    const getInvoiceAllocationStatus = useCallback(
        (inv: CandidateInvoice) => {
            let totalReq = 0;
            let totalAlloc = 0;
            let hasShortage = false;

            for (const p of inv.products) {
                totalReq += p.quantity;
                const lineInfo = getInvoiceLineAllocations(inv.invoiceId, p.productId, p.quantity);
                totalAlloc += lineInfo.allocatedQty;
                if (lineInfo.shortageQty > 0) {
                    hasShortage = true;
                }
            }

            return {
                totalRequired: totalReq,
                totalAllocated: totalAlloc,
                hasShortage,
                isFullyAllocated: totalAlloc >= totalReq && totalReq > 0,
            };
        },
        [getInvoiceLineAllocations]
    );

    const filteredStep2Invoices = useMemo(() => {
        return selectedInvoices.filter((inv) => {
            // Customer filter
            if (step2CustomerFilter !== "ALL" && inv.customerCode !== step2CustomerFilter) {
                return false;
            }

            // Product filter
            if (step2ProductFilter !== "ALL") {
                const pId = Number(step2ProductFilter);
                if (!inv.products.some((p) => p.productId === pId)) {
                    return false;
                }
            }

            // Allocation status filter (in Auto mode)
            if (step2StatusFilter !== "ALL") {
                const status = getInvoiceAllocationStatus(inv);
                if (step2StatusFilter === "ALLOCATED" && !status.isFullyAllocated) return false;
                if (step2StatusFilter === "SHORTAGE" && !status.hasShortage) return false;
            }

            // Search query filter (matches Invoice #, Customer, SO #, PO #, Product Name/Code, or Lot/Batch)
            if (step2Search.trim()) {
                const q = step2Search.toLowerCase();
                const matchInvoice = inv.invoiceNo.toLowerCase().includes(q);
                const matchCustomer =
                    inv.customerName.toLowerCase().includes(q) || (inv.customerCode || "").toLowerCase().includes(q);
                const matchSo = (inv.orderNo || "").toLowerCase().includes(q);
                const matchPo = (inv.poNo || "").toLowerCase().includes(q);
                const matchProd = inv.products.some(
                    (p) => p.productName.toLowerCase().includes(q) || p.productCode.toLowerCase().includes(q)
                );
                const matchBatch = inv.products.some((p) => {
                    const lineInfo = getInvoiceLineAllocations(inv.invoiceId, p.productId, p.quantity);
                    return lineInfo.allocations.some(
                        (a) => (a.batchNo || "").toLowerCase().includes(q) || (a.lotName || "").toLowerCase().includes(q)
                    );
                });

                if (!matchInvoice && !matchCustomer && !matchSo && !matchPo && !matchProd && !matchBatch) {
                    return false;
                }
            }

            return true;
        });
    }, [
        selectedInvoices,
        step2CustomerFilter,
        step2ProductFilter,
        step2StatusFilter,
        step2Search,
        getInvoiceAllocationStatus,
        getInvoiceLineAllocations,
    ]);

    const handleSubmit = async () => {
        if (selectedIds.size === 0 || submitting) return;

        let customAllocations: CustomAllocationItem[] | undefined = undefined;

        if (allocationMode === "manual") {
            if (!isManualValid) return;
            const aggMap = new Map<string, CustomAllocationItem>();
            for (const [key, qty] of Object.entries(manualAllocations)) {
                if (qty > 0) {
                    const [, pIdStr, invLotIdStr, batchNo, lotIdStr] = key.split(":");
                    const productId = Number(pIdStr);
                    const inventoryLotId = Number(invLotIdStr || 0);
                    const lotId = Number(lotIdStr || 0);
                    const batchKey = `${productId}:${inventoryLotId}:${batchNo}:${lotId}`;
                    const existing = aggMap.get(batchKey);
                    if (existing) {
                        existing.quantity += qty;
                    } else {
                        const batch = (allocationPreview?.availableBatches || []).find(
                            (b) =>
                                b.productId === productId &&
                                ((inventoryLotId > 0 && b.inventoryLotId === inventoryLotId) ||
                                    (b.batchNo === batchNo && b.lotId === lotId))
                        );
                        aggMap.set(batchKey, {
                            productId,
                            inventoryLotId: batch?.inventoryLotId || inventoryLotId,
                            lotId: batch?.lotId || lotId,
                            batchNo: batch?.batchNo || batchNo,
                            quantity: qty,
                        });
                    }
                }
            }
            customAllocations = Array.from(aggMap.values());
        }

        setSubmitting(true);
        await onSubmit({
            branchId: branch.id,
            invoiceIds: Array.from(selectedIds),
            customAllocations,
        });
        setSubmitting(false);
    };

    const canProceedToStep2 = selectedIds.size > 0;

    const canProceedToStep3 = useMemo(() => {
        if (selectedIds.size === 0 || previewLoading || !allocationPreview) {
            return false;
        }
        if (allocationMode === "auto") {
            return true;
        }
        return isManualValid;
    }, [selectedIds, previewLoading, allocationPreview, allocationMode, isManualValid]);

    const canSubmit = useMemo(() => {
        if (selectedIds.size === 0 || submitting || previewLoading || !allocationPreview) {
            return false;
        }
        if (allocationMode === "auto") {
            return allocationPreview.shortages.length === 0;
        }
        return isManualValid;
    }, [selectedIds, submitting, previewLoading, allocationPreview, allocationMode, isManualValid]);

    const totalOrderedUnits = useMemo(() => {
        return aggregatedProducts.reduce((sum, p) => sum + p.totalQuantity, 0);
    }, [aggregatedProducts]);

    const totalAllocatedUnits = useMemo(() => {
        if (allocationMode === "manual") {
            return Object.values(manualAllocations).reduce((sum, q) => sum + (Number(q) || 0), 0);
        }
        return (allocationPreview?.allocations || []).reduce((sum, a) => sum + a.quantity, 0);
    }, [allocationMode, manualAllocations, allocationPreview]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
            <div className="flex h-[100dvh] w-screen flex-col overflow-hidden bg-background shadow-2xl sm:h-[95vh] sm:max-w-[95vw] sm:rounded-3xl sm:border sm:border-border/60 lg:max-w-[1440px]">
                {/* Modal Header */}
                <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border/60 bg-card px-4 py-5 sm:px-7">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="rounded-2xl bg-primary p-3 shadow-lg shadow-primary/20">
                            <FileText className="h-6 w-6 text-primary-foreground" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-primary">New Batch</p>
                                <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[9px] font-extrabold uppercase text-primary">
                                    Step {step} of 3
                                </span>
                            </div>
                            <h2 className="text-xl font-black uppercase italic tracking-tighter text-foreground sm:text-2xl">
                                Consolidation <span className="text-primary">Creation</span>
                            </h2>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {step === 1
                                    ? "Step 1: Select one or multiple candidate sales orders and job orders for consolidation."
                                    : step === 2
                                    ? "Step 2: Allocate stock and lot batches grouped by order, product, and rack locations."
                                    : "Step 3: Review consolidated product demand summary and finalize batch creation."}
                            </p>
                        </div>
                        <span className="hidden items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[10px] font-bold text-muted-foreground lg:flex">
                            <Building2 className="h-3 w-3" />
                            {branch.branchName}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Step Navigation Pills */}
                        <div className="hidden sm:flex items-center gap-1 bg-muted/50 p-1 rounded-2xl border border-border/60">
                            <button
                                onClick={() => setStep(1)}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                                    step === 1
                                        ? "bg-card text-foreground shadow-sm border border-border/60"
                                        : "text-muted-foreground hover:text-foreground"
                                }`}
                            >
                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-black">
                                    1
                                </span>
                                Select Orders
                            </button>
                            <button
                                onClick={() => canProceedToStep2 && setStep(2)}
                                disabled={!canProceedToStep2}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                                    step === 2
                                        ? "bg-card text-foreground shadow-sm border border-border/60"
                                        : canProceedToStep2
                                        ? "text-muted-foreground hover:text-foreground"
                                        : "opacity-40 cursor-not-allowed text-muted-foreground"
                                }`}
                            >
                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-black">
                                    2
                                </span>
                                Stock Allocation
                            </button>
                            <button
                                onClick={() => canProceedToStep3 && setStep(3)}
                                disabled={!canProceedToStep3}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                                    step === 3
                                        ? "bg-card text-foreground shadow-sm border border-border/60"
                                        : canProceedToStep3
                                        ? "text-muted-foreground hover:text-foreground"
                                        : "opacity-40 cursor-not-allowed text-muted-foreground"
                                }`}
                            >
                                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-black">
                                    3
                                </span>
                                Demand Summary
                            </button>
                        </div>

                        <Button variant="ghost" size="icon" onClick={handleClose} className="shrink-0 rounded-xl">
                            <X className="h-4 w-4 text-muted-foreground" />
                        </Button>
                    </div>
                </div>

                {/* STEP 1: SELECT INVOICES */}
                {step === 1 && (
                    <div className="flex-1 flex flex-col min-h-0">
                        {/* Filters Toolbar */}
                        <div className="shrink-0 border-b bg-muted/20 px-4 py-3 sm:px-7 space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2.5">
                                <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                                    {/* Search Input */}
                                    <div className="relative flex-1 min-w-[200px] max-w-sm">
                                        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            placeholder="Search order no, SO, PO, customer, product..."
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            className="h-8.5 pl-8 text-xs bg-card rounded-xl border-border/60"
                                        />
                                    </div>

                                    {/* Doc Type Filter */}
                                    <div className="w-[180px]">
                                        <SearchableSelect
                                            options={step1DocTypeSelectOptions}
                                            value={selectedDocType}
                                            onValueChange={setSelectedDocType}
                                            placeholder="Filter Order Type..."
                                            searchPlaceholder="Search type..."
                                            triggerClassName="h-8.5 rounded-xl border border-border/60 bg-card px-2.5 text-xs font-semibold text-foreground"
                                        />
                                    </div>

                                    {/* Customer Filter */}
                                    <div className="w-[200px]">
                                        <SearchableSelect
                                            options={step1CustomerSelectOptions}
                                            value={selectedCustomer}
                                            onValueChange={setSelectedCustomer}
                                            placeholder="Filter Customer..."
                                            searchPlaceholder="Search customer..."
                                            triggerClassName="h-8.5 rounded-xl border border-border/60 bg-card px-2.5 text-xs font-semibold text-foreground"
                                        />
                                    </div>

                                    {/* Date Range Filters */}
                                    <div className="flex items-center gap-1 text-xs">
                                        <Input
                                            type="date"
                                            value={dateFrom}
                                            onChange={(e) => setDateFrom(e.target.value)}
                                            className="h-8.5 text-xs bg-card rounded-xl border-border/60 w-32"
                                            title="Filter From Date"
                                        />
                                        <span className="text-muted-foreground text-xs font-bold">-</span>
                                        <Input
                                            type="date"
                                            value={dateTo}
                                            onChange={(e) => setDateTo(e.target.value)}
                                            className="h-8.5 text-xs bg-card rounded-xl border-border/60 w-32"
                                            title="Filter To Date"
                                        />
                                    </div>

                                    {(search || selectedCustomer !== "ALL" || selectedDocType !== "ALL" || dateFrom || dateTo) && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={resetFilters}
                                            className="h-8.5 text-xs text-muted-foreground hover:text-foreground font-bold px-2 rounded-xl"
                                        >
                                            <RotateCcw className="h-3 w-3 mr-1" />
                                            Reset
                                        </Button>
                                    )}
                                </div>

                                {/* Select All Actions */}
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={toggleAll}
                                        className="h-8.5 text-xs font-bold rounded-xl bg-card border-border/60"
                                        disabled={filtered.length === 0}
                                    >
                                        {selectedIds.size === filtered.length && filtered.length > 0 ? (
                                            <>
                                                <CheckSquare className="mr-1.5 h-3.5 w-3.5 text-primary" />
                                                Deselect All
                                            </>
                                        ) : (
                                            <>
                                                <Square className="mr-1.5 h-3.5 w-3.5" />
                                                Select All ({filtered.length})
                                            </>
                                        )}
                                    </Button>
                                    <span className="text-xs text-muted-foreground font-bold bg-muted/40 px-2.5 py-1.5 rounded-xl border border-border/40">
                                        <strong className="text-foreground">{selectedIds.size}</strong> of {filtered.length} selected
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Candidates Table */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 space-y-4">
                            {loading ? (
                                <div className="flex h-48 items-center justify-center">
                                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="py-16 text-center text-xs text-muted-foreground space-y-2">
                                    <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                                    <p className="font-bold">No eligible sales orders or job orders found</p>
                                    <p className="text-[11px]">Try adjusting your search query, order type, customer, or date filters.</p>
                                </div>
                            ) : (
                                <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="border-b bg-muted/20">
                                                <th className="p-3 w-10"></th>
                                                <th className="p-3 font-bold text-muted-foreground uppercase text-[10px] tracking-wider w-16">Type</th>
                                                <th className="p-3 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">Order No</th>
                                                <th className="p-3 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">PO No</th>
                                                <th className="p-3 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">Customer</th>
                                                <th className="p-3 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">Order Status</th>
                                                <th className="p-3 font-bold text-muted-foreground uppercase text-[10px] tracking-wider">Order Date</th>
                                                <th className="p-3 font-bold text-muted-foreground uppercase text-[10px] tracking-wider text-right">Net Amount</th>
                                                <th className="p-3 font-bold text-muted-foreground uppercase text-[10px] tracking-wider text-right">Items</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/40">
                                            {filtered.map((inv) => {
                                                const isSelected = selectedIds.has(inv.invoiceId);
                                                const isExpanded = expandedInvoiceIds.has(inv.invoiceId);

                                                return (
                                                    <React.Fragment key={inv.invoiceId}>
                                                        <tr
                                                            onClick={() => toggle(inv.invoiceId)}
                                                            className={`cursor-pointer transition-colors ${
                                                                isSelected ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/10"
                                                            }`}
                                                        >
                                                            <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                                                <div className="flex items-center gap-1">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleExpand(inv.invoiceId)}
                                                                        className="p-0.5 text-muted-foreground hover:text-foreground rounded"
                                                                    >
                                                                        {isExpanded ? (
                                                                            <ChevronDown className="h-3.5 w-3.5" />
                                                                        ) : (
                                                                            <ChevronRight className="h-3.5 w-3.5" />
                                                                        )}
                                                                    </button>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={() => toggle(inv.invoiceId)}
                                                                        className="h-4 w-4 rounded border-border/80 text-primary accent-primary"
                                                                    />
                                                                </div>
                                                            </td>
                                                            <td className="p-3">
                                                                {inv.documentType === "JOB_ORDER" ? (
                                                                    <span className="inline-flex items-center rounded-md border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-black text-purple-600">
                                                                        JO
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-black text-blue-600">
                                                                        SO
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="p-3 font-mono font-bold text-foreground">
                                                                {inv.invoiceNo}
                                                            </td>
                                                            <td className="p-3">
                                                                {inv.poNo ? (
                                                                    <span className="font-mono text-xs text-foreground font-semibold">
                                                                        {inv.poNo}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-muted-foreground">-</span>
                                                                )}
                                                            </td>
                                                            <td className="p-3">
                                                                <div className="font-bold text-foreground">{inv.customerName}</div>
                                                                <div className="font-mono text-[10px] text-muted-foreground">{inv.customerCode}</div>
                                                            </td>
                                                            <td className="p-3">
                                                                <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[9px] font-extrabold uppercase text-primary">
                                                                    {inv.orderStatus || "For Consolidation"}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 text-muted-foreground font-medium">
                                                                {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : "-"}
                                                            </td>
                                                            <td className="p-3 text-right font-black text-foreground">
                                                                ₱{(inv.netAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="p-3 text-right text-muted-foreground font-semibold">
                                                                {inv.products.length} product(s)
                                                            </td>
                                                        </tr>

                                                        {/* Expanded Invoice Line Details */}
                                                        {isExpanded && (
                                                            <tr className="bg-muted/5">
                                                                <td colSpan={9} className="p-0">
                                                                    <div className="p-3.5 bg-muted/10 border-t border-b border-border/40 space-y-2.5">
                                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                                            <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                                                <Package className="h-3.5 w-3.5 text-primary" />
                                                                                Invoice: <span className="font-mono text-foreground font-bold">{inv.invoiceNo}</span>
                                                                                {inv.orderNo && (
                                                                                    <span className="text-muted-foreground"> · SO: <strong className="font-mono text-foreground">{inv.orderNo}</strong></span>
                                                                                )}
                                                                                {inv.poNo && (
                                                                                    <span className="text-muted-foreground"> · PO: <strong className="text-foreground">{inv.poNo}</strong></span>
                                                                                )}
                                                                            </p>
                                                                        </div>

                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                                            {inv.products.map((p) => (
                                                                                <div
                                                                                    key={`${inv.invoiceId}-${p.productId}`}
                                                                                    className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm flex items-center justify-between gap-2"
                                                                                >
                                                                                    <div>
                                                                                        <p className="text-xs font-bold text-foreground">{p.productName}</p>
                                                                                        <p className="font-mono text-[10px] text-muted-foreground">{p.productCode}</p>
                                                                                    </div>
                                                                                    <div className="text-right">
                                                                                        <span className="text-xs font-black text-foreground">
                                                                                            Qty: {p.quantity}
                                                                                        </span>
                                                                                        {p.versionName && (
                                                                                            <p className="text-[9px] text-primary font-bold">{p.versionName}</p>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Step 1 Footer */}
                        <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/60 bg-card px-4 py-4 sm:px-7">
                            <div className="text-xs text-muted-foreground">
                                {selectedIds.size > 0 ? (
                                    <>
                                        <span className="font-bold text-foreground">{selectedIds.size}</span> invoice(s) selected
                                        {" — "}Total:{" "}
                                        <span className="font-black text-foreground text-sm">
                                            ₱{totalSelectedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </span>
                                    </>
                                ) : (
                                    <span>Select at least 1 invoice to proceed.</span>
                                )}
                            </div>

                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                                <Button variant="ghost" onClick={handleClose} className="rounded-xl">
                                    Cancel
                                </Button>
                                <Button
                                    onClick={() => setStep(2)}
                                    disabled={!canProceedToStep2}
                                    className="rounded-xl px-5 font-black uppercase tracking-wider gap-1.5"
                                >
                                    Proceed to Stock Allocation ({selectedIds.size})
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 2: STOCK ALLOCATION & FEFO (GROUPED BY INVOICE -> PRODUCT -> LOT/RACK/BATCHES MAX 5 SCROLLABLE) */}
                {step === 2 && (
                    <div className="flex-1 flex flex-col min-h-0">
                        {/* Step 2 Toolbar & Allocation Mode Switcher */}
                        <div className="shrink-0 border-b bg-muted/20 px-4 py-3 sm:px-7 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-3">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setStep(1)}
                                    className="rounded-xl text-xs font-bold gap-1 bg-card border-border/60"
                                >
                                    <ArrowLeft className="h-3.5 w-3.5" />
                                    Back to Invoices
                                </Button>

                                <div className="text-xs font-bold text-muted-foreground flex items-center gap-2">
                                    <span>
                                        Allocating for <strong className="text-foreground">{selectedIds.size}</strong> invoice(s)
                                    </span>
                                    <span>·</span>
                                    <span className="text-foreground font-black">
                                        ₱{totalSelectedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                </div>
                            </div>

                            {/* Actions & Mode Switcher */}
                            <div className="flex flex-wrap items-center gap-2">
                                {/* Expand / Collapse All Invoices */}
                                <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-xl border border-border/60">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={expandAllStep2Invoices}
                                        className="h-7 px-2 text-[10px] font-bold rounded-lg text-muted-foreground hover:text-foreground"
                                        title="Expand all invoice cards"
                                    >
                                        <Maximize2 className="h-3 w-3 mr-1" />
                                        Expand All
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={collapseAllStep2Invoices}
                                        className="h-7 px-2 text-[10px] font-bold rounded-lg text-muted-foreground hover:text-foreground"
                                        title="Collapse all invoice cards"
                                    >
                                        <Minimize2 className="h-3 w-3 mr-1" />
                                        Collapse All
                                    </Button>
                                </div>

                                {/* Mode Switcher */}
                                <div className="flex rounded-2xl bg-muted/50 p-1 border border-border/60 shadow-inner">
                                    <button
                                        type="button"
                                        onClick={() => setAllocationMode("auto")}
                                        className={`flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-bold transition-all ${
                                            allocationMode === "auto"
                                                ? "bg-card text-foreground shadow-sm border border-border/60"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                                        Auto FEFO
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAllocationMode("manual")}
                                        className={`flex items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-bold transition-all ${
                                            allocationMode === "manual"
                                                ? "bg-card text-foreground shadow-sm border border-border/60"
                                                : "text-muted-foreground hover:text-foreground"
                                        }`}
                                    >
                                        <Sliders className="h-3.5 w-3.5 text-primary" />
                                        Manual Allocation
                                    </button>
                                </div>

                                {allocationMode === "manual" && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleResetToAutoFEFO}
                                        className="rounded-xl text-xs font-bold h-8 bg-card border-border/60 gap-1"
                                        title="Reset manual inputs to match default FEFO allocations"
                                    >
                                        <RotateCcw className="h-3 w-3" />
                                        Reset to FEFO
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Step 2 Filter Bar - Shows explicitly what can be filtered */}
                        <div className="shrink-0 border-b bg-card px-4 py-2.5 sm:px-7 flex flex-wrap items-center justify-between gap-2.5">
                            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
                                <div className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground mr-1">
                                    <Filter className="h-3.5 w-3.5 text-primary" />
                                    <span>Filter Invoices:</span>
                                </div>

                                {/* Search by text (Invoice #, Customer, SO, PO, Product, Batch) */}
                                <div className="relative min-w-[220px] max-w-sm flex-1">
                                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                    <Input
                                        placeholder="Search Invoice #, Customer, SO, PO, Product, Batch #..."
                                        value={step2Search}
                                        onChange={(e) => setStep2Search(e.target.value)}
                                        className="h-8 pl-7 pr-7 text-xs bg-muted/20 rounded-xl border-border/60"
                                    />
                                    {step2Search && (
                                        <button
                                            type="button"
                                            onClick={() => setStep2Search("")}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                        >
                                            <X className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>

                                {/* Filter by Customer */}
                                <div className="w-[180px] sm:w-[210px]">
                                    <SearchableSelect
                                        options={step2CustomerSelectOptions}
                                        value={step2CustomerFilter}
                                        onValueChange={setStep2CustomerFilter}
                                        placeholder="All Customers"
                                        searchPlaceholder="Search customer..."
                                        triggerClassName="h-8 rounded-xl border border-border/60 bg-muted/20 px-2.5 text-xs font-semibold text-foreground"
                                    />
                                </div>

                                {/* Filter by Product */}
                                <div className="w-[180px] sm:w-[210px]">
                                    <SearchableSelect
                                        options={step2ProductSelectOptions}
                                        value={step2ProductFilter}
                                        onValueChange={setStep2ProductFilter}
                                        placeholder="All Products"
                                        searchPlaceholder="Search product..."
                                        triggerClassName="h-8 rounded-xl border border-border/60 bg-muted/20 px-2.5 text-xs font-semibold text-foreground"
                                    />
                                </div>

                                {/* Filter by Allocation Status (in Auto mode) */}
                                {allocationMode === "auto" && (
                                    <div className="w-[160px] sm:w-[190px]">
                                        <SearchableSelect
                                            options={step2StatusSelectOptions}
                                            value={step2StatusFilter}
                                            onValueChange={setStep2StatusFilter}
                                            placeholder="All Statuses"
                                            searchPlaceholder="Search status..."
                                            triggerClassName="h-8 rounded-xl border border-border/60 bg-muted/20 px-2.5 text-xs font-semibold text-foreground"
                                        />
                                    </div>
                                )}

                                {/* Reset button */}
                                {hasActiveStep2Filters && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={resetStep2Filters}
                                        className="h-8 text-xs text-muted-foreground hover:text-foreground font-bold px-2 rounded-xl"
                                    >
                                        <RotateCcw className="h-3 w-3 mr-1" />
                                        Reset Filters
                                    </Button>
                                )}
                            </div>

                            <span className="text-[11px] text-muted-foreground font-bold bg-muted/30 px-2.5 py-1 rounded-xl border border-border/40 shrink-0">
                                Showing <strong className="text-foreground">{filteredStep2Invoices.length}</strong> of {selectedInvoices.length} invoices
                            </span>
                        </div>

                        {/* Step 2 Main Content */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 space-y-4">
                            {previewLoading ? (
                                <div className="flex h-48 flex-col items-center justify-center gap-2">
                                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                                    <p className="text-xs text-muted-foreground font-semibold">
                                        Querying live stock from Spring Boot service...
                                    </p>
                                </div>
                            ) : previewError ? (
                                <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
                                    <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
                                    <h4 className="font-bold text-destructive text-sm">Spring Boot Stock Error</h4>
                                    <p className="text-xs text-muted-foreground max-w-md mx-auto">{previewError}</p>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                            const next = new Set(selectedIds);
                                            setSelectedIds(new Set());
                                            setTimeout(() => setSelectedIds(next), 50);
                                        }}
                                        className="rounded-xl text-xs font-bold"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                        Retry Stock Query
                                    </Button>
                                </div>
                            ) : (
                                <>
                                    {/* Overall Shortages Alert in Auto Mode if any */}
                                    {allocationMode === "auto" && allocationPreview?.shortages && allocationPreview.shortages.length > 0 && (
                                        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                                            <div className="flex items-center gap-1.5 font-black uppercase text-[11px]">
                                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                                                Stock Shortages Detected Across Selected Invoices
                                            </div>
                                            <div className="space-y-0.5 pl-5">
                                                {allocationPreview.shortages.map((s) => (
                                                    <p key={s.productId}>
                                                        <strong>{s.productName}</strong>: {s.quantity} units unallocated in available warehouse stock.
                                                    </p>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* GROUPED BY INVOICE -> PRODUCT -> LOT/RACK/BATCHES (MAX 5 SCROLLABLE) */}
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Package className="h-4 w-4 text-primary" />
                                                <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                                                    Allocations by Invoice & Product ({filteredStep2Invoices.length})
                                                </h3>
                                            </div>
                                            <span className="text-[11px] text-muted-foreground font-semibold">
                                                {allocationMode === "auto" ? "Batches allocated via Auto FEFO" : "Manual lot batch distribution"}
                                            </span>
                                        </div>

                                        {filteredStep2Invoices.length === 0 ? (
                                            <div className="rounded-3xl border border-dashed border-border/70 p-8 text-center bg-card/50 space-y-3">
                                                <Filter className="h-8 w-8 text-muted-foreground mx-auto" />
                                                <h4 className="font-bold text-foreground text-sm">No Invoices Match Your Filters</h4>
                                                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                                                    Try adjusting your search query, customer, product, or allocation status filters.
                                                </p>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={resetStep2Filters}
                                                    className="rounded-xl text-xs font-bold"
                                                >
                                                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                                    Reset All Filters
                                                </Button>
                                            </div>
                                        ) : (
                                            filteredStep2Invoices.map((inv) => {
                                                const isExpanded = !collapsedStep2InvoiceIds.has(inv.invoiceId);
                                                const status = getInvoiceAllocationStatus(inv);

                                                return (
                                                    <div
                                                        key={inv.invoiceId}
                                                        className="rounded-3xl border border-border/70 bg-card shadow-sm overflow-hidden transition-all"
                                                    >
                                                        {/* LEVEL 1: INVOICE HEADER */}
                                                        <div
                                                            onClick={() => toggleStep2Invoice(inv.invoiceId)}
                                                            className="flex flex-wrap items-center justify-between gap-3 border-b border-border/50 bg-muted/20 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors"
                                                        >
                                                            <div className="flex flex-wrap items-center gap-3">
                                                                <button
                                                                    type="button"
                                                                    className="flex h-6 w-6 items-center justify-center rounded-lg bg-card border border-border/60 text-muted-foreground hover:text-foreground"
                                                                >
                                                                    {isExpanded ? (
                                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                                    ) : (
                                                                        <ChevronRight className="h-3.5 w-3.5" />
                                                                    )}
                                                                </button>

                                                                <div className="flex items-center gap-2">
                                                                    <div className="rounded-lg bg-primary/10 p-1.5">
                                                                        <FileText className="h-4 w-4 text-primary" />
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            {inv.documentType === "JOB_ORDER" ? (
                                                                                <span className="inline-flex items-center rounded-md border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-black text-purple-600">
                                                                                    JO
                                                                                </span>
                                                                            ) : (
                                                                                <span className="inline-flex items-center rounded-md border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-black text-blue-600">
                                                                                    SO
                                                                                </span>
                                                                            )}
                                                                            <span className="font-mono font-black text-sm text-foreground">
                                                                                {inv.orderNo || inv.invoiceNo}
                                                                            </span>
                                                                            {inv.poNo && (
                                                                                <span className="text-[10px] text-muted-foreground bg-card border border-border/50 px-1.5 py-0.5 rounded-md">
                                                                                    PO: <strong className="text-foreground">{inv.poNo}</strong>
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <p className="text-[11px] text-muted-foreground">
                                                                            <strong className="text-foreground">{inv.customerName}</strong>{" "}
                                                                            <span className="font-mono">({inv.customerCode})</span>
                                                                            {inv.invoiceDate && (
                                                                                <> · {new Date(inv.invoiceDate).toLocaleDateString()}</>
                                                                            )}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="flex items-center gap-3">
                                                                                                                                {/* Invoice allocation status pill */}
                                                                {allocationMode === "auto" ? (
                                                                    status.hasShortage ? (
                                                                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-[10px] font-bold text-amber-600">
                                                                            <AlertTriangle className="h-3 w-3" />
                                                                            Shortage
                                                                        </span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-[10px] font-bold text-emerald-600">
                                                                            <CheckCircle2 className="h-3 w-3" />
                                                                            Fully Allocated
                                                                        </span>
                                                                    )
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1  px-2.5 py-1 text-[10px] font-bold text-primary">
                                                                        Manual Allocation
                                                                    </span>
                                                                )}

                                                                <div className="text-right">
                                                                    <p className="text-xs font-black text-foreground">
                                                                        ₱{(inv.netAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                    </p>
                                                                    <p className="text-[10px] text-muted-foreground font-semibold">
                                                                        {inv.products.length} product(s)
                                                                    </p>
                                                                </div>


                                                            </div>
                                                        </div>

                                                        {/* LEVEL 2: PRODUCTS UNDER INVOICE */}
                                                        {isExpanded && (
                                                            <div className="p-4 space-y-4 bg-card">
                                                                {inv.products.map((prod) => {
                                                                    const lineInfo = getInvoiceLineAllocations(
                                                                        inv.invoiceId,
                                                                        prod.productId,
                                                                        prod.quantity
                                                                    );
                                                                    const availableBatches = batchesByProduct.get(prod.productId) || [];

                                                                    return (
                                                                        <div
                                                                            key={`${inv.invoiceId}-${prod.productId}`}
                                                                            className="rounded-2xl border border-border/60 bg-muted/10 p-3.5 space-y-3"
                                                                        >
                                                                            {/* Product Header */}
                                                                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-2.5">
                                                                                <div className="flex items-center gap-2">
                                                                                    <div className="rounded-lg bg-card p-1.5 border border-border/50 shadow-sm">
                                                                                        <Package className="h-4 w-4 text-primary" />
                                                                                    </div>
                                                                                    <div>
                                                                                        <div className="flex items-center gap-2">
                                                                                            <h4 className="text-xs font-black text-foreground">
                                                                                                {prod.productName}
                                                                                            </h4>
                                                                                            <span className="font-mono text-[10px] text-muted-foreground">
                                                                                                {prod.productCode}
                                                                                            </span>
                                                                                        </div>
                                                                                        {prod.versionName && (
                                                                                            <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[9px] font-bold text-primary">
                                                                                                {prod.versionName}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                </div>

                                                                                <div className="flex items-center gap-2 text-xs">
                                                                                    {/* <span className="font-semibold text-muted-foreground bg-card px-2 py-1 rounded-lg border border-border/40">
                                                                                        Quantity Demand: <strong className="text-foreground">{prod.quantity}</strong>
                                                                                    </span> */}

                                                                                    {allocationMode === "auto" ? (
                                                                                        <span
                                                                                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                                                                                lineInfo.shortageQty === 0
                                                                                                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                                                                                    : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                                                                            }`}
                                                                                        >
                                                                                            {lineInfo.shortageQty === 0 ? (
                                                                                                <>
                                                                                                    <CheckCircle2 className="h-3 w-3" />
                                                                                                    Allocated: {lineInfo.allocatedQty} / {prod.quantity}
                                                                                                </>
                                                                                            ) : (
                                                                                                <>
                                                                                                    <AlertTriangle className="h-3 w-3" />
                                                                                                    Allocated: {lineInfo.allocatedQty} / {prod.quantity} (Short: {lineInfo.shortageQty})
                                                                                                </>
                                                                                            )}
                                                                                        </span>
                                                                                    ) : (
                                                                                        (() => {
                                                                                            const lineSummary = getManualLineSummary(
                                                                                                inv.invoiceId,
                                                                                                prod.productId,
                                                                                                prod.quantity
                                                                                            );
                                                                                            return (
                                                                                                <span
                                                                                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                                                                                        lineSummary.isValid
                                                                                                            ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                                                                                            : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                                                                                    }`}
                                                                                                >
                                                                                                    {lineSummary.isValid ? (
                                                                                                        <>
                                                                                                            <CheckCircle2 className="h-3 w-3" />
                                                                                                            Allocated: {lineSummary.allocated} / {prod.quantity}
                                                                                                        </>
                                                                                                    ) : (
                                                                                                        <>
                                                                                                            <AlertTriangle className="h-3 w-3" />
                                                                                                            Allocated: {lineSummary.allocated} / {prod.quantity}{" "}
                                                                                                            {lineSummary.difference < 0
                                                                                                                ? `(Short: ${Math.abs(lineSummary.difference)})`
                                                                                                                : `(Over: ${lineSummary.difference})`}
                                                                                                        </>
                                                                                                    )}
                                                                                                </span>
                                                                                            );
                                                                                        })()
                                                                                    )}
                                                                                </div>
                                                                            </div>

                                                                            {/* LEVEL 3: LOT / RACK / BATCHES (MAX 5 ITEMS, SCROLLABLE) */}
                                                                            {allocationMode === "auto" ? (
                                                                                <div>
                                                                                    {lineInfo.allocations.length > 0 ? (
                                                                                        <div className="max-h-[195px] overflow-y-auto rounded-2xl border border-border/50 bg-card shadow-sm">
                                                                                            <table className="w-full text-left text-xs border-collapse">
                                                                                                <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm border-b border-border/60">
                                                                                                    <tr className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                                                                                                        <th className="p-2.5">Lot / Rack</th>
                                                                                                        <th className="p-2.5">Batch No</th>
                                                                                                        <th className="p-2.5">Expiry Date</th>
                                                                                                        <th className="p-2.5 text-right">Allocated Quantity</th>
                                                                                                    </tr>
                                                                                                </thead>
                                                                                                <tbody className="divide-y divide-border/40">
                                                                                                    {lineInfo.allocations.map((a, idx) => {
                                                                                                        const isAllocated = a.quantity > 0;
                                                                                                        return (
                                                                                                            <tr
                                                                                                                key={`${a.inventoryLotId}-${idx}`}
                                                                                                                className={`transition-colors ${
                                                                                                                    isAllocated
                                                                                                                        ? "bg-emerald-500/[0.07] hover:bg-emerald-500/15 border-l-4 border-l-emerald-500"
                                                                                                                        : "hover:bg-muted/10"
                                                                                                                }`}
                                                                                                            >
                                                                                                                <td className="p-2.5 font-bold text-foreground">
                                                                                                                    {isAllocated ? (
                                                                                                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-black">
                                                                                                                            {a.lotName}
                                                                                                                        </span>
                                                                                                                    ) : (
                                                                                                                        a.lotName
                                                                                                                    )}
                                                                                                                </td>
                                                                                                                <td className="p-2.5 font-mono">
                                                                                                                    {isAllocated ? (
                                                                                                                        <span className="font-bold text-foreground bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                                                                                                                            {a.batchNo}
                                                                                                                        </span>
                                                                                                                    ) : (
                                                                                                                        <span className="text-muted-foreground">{a.batchNo}</span>
                                                                                                                    )}
                                                                                                                </td>
                                                                                                                <td className="p-2.5 text-muted-foreground font-medium">
                                                                                                                    {a.expiryDate || "-"}
                                                                                                                </td>
                                                                                                                <td className="p-2.5 text-right">
                                                                                                                    <span className="inline-flex items-center rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-black text-emerald-600">
                                                                                                                        {a.quantity}
                                                                                                                    </span>
                                                                                                                </td>
                                                                                                            </tr>
                                                                                                        );
                                                                                                    })}
                                                                                                </tbody>
                                                                                            </table>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="rounded-xl border border-dashed border-border/70 p-3 text-center text-xs text-muted-foreground">
                                                                                            No lot allocations available for this product line.
                                                                                        </div>
                                                                                    )}

                                                                                    {lineInfo.shortageQty > 0 && (
                                                                                        <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-700 dark:text-amber-300">
                                                                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                                                                                            <span>
                                                                                                Shortage of <strong>{lineInfo.shortageQty}</strong> unit(s) cannot be fulfilled by current FEFO inventory.
                                                                                            </span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                /* MANUAL ALLOCATION MODE TABLE */
                                                                                <div>
                                                                                    {availableBatches.length > 0 ? (
                                                                                        <div className="max-h-[220px] overflow-y-auto rounded-2xl border border-border/50 bg-card shadow-sm">
                                                                                            <table className="w-full text-left text-xs border-collapse">
                                                                                                <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm border-b border-border/60">
                                                                                                    <tr className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                                                                                                        <th className="p-2.5">Lot / Rack</th>
                                                                                                        <th className="p-2.5">Batch No</th>
                                                                                                        <th className="p-2.5">Expiry Date</th>
                                                                                                        <th className="p-2.5">Condition</th>
                                                                                                        <th className="p-2.5 text-right">Available</th>
                                                                                                        <th className="p-2.5 text-right w-44">Allocate Quantity</th>
                                                                                                    </tr>
                                                                                                </thead>
                                                                                                <tbody className="divide-y divide-border/40">
                                                                                                    {availableBatches.map((b, bIdx) => {
                                                                                                        const key = getManualKey(
                                                                                                            inv.invoiceId,
                                                                                                            prod.productId,
                                                                                                            b.inventoryLotId,
                                                                                                            b.lotId,
                                                                                                            b.batchNo
                                                                                                        );
                                                                                                        const currentQty = Number(manualAllocations[key] || 0);
                                                                                                        const isAllocated = currentQty > 0;

                                                                                                        return (
                                                                                                            <tr
                                                                                                                key={`batch-row-${inv.invoiceId}-${prod.productId}-${b.lotId}-${b.batchNo}-${b.inventoryLotId || bIdx}`}
                                                                                                                className={`transition-colors ${
                                                                                                                    isAllocated
                                                                                                                        ? "bg-primary/10 hover:bg-primary/15 border-l-4 border-l-primary"
                                                                                                                        : "hover:bg-muted/10"
                                                                                                                }`}
                                                                                                            >
                                                                                                                <td className="p-2.5 font-bold text-foreground">
                                                                                                                    {isAllocated ? (
                                                                                                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/20 text-primary font-black">
                                                                                                                            {b.lotName}
                                                                                                                        </span>
                                                                                                                    ) : (
                                                                                                                        b.lotName
                                                                                                                    )}
                                                                                                                </td>
                                                                                                                <td className="p-2.5 font-mono">
                                                                                                                    {isAllocated ? (
                                                                                                                        <span className="font-bold text-foreground bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                                                                                                                            {b.batchNo}
                                                                                                                        </span>
                                                                                                                    ) : (
                                                                                                                        <span className="text-muted-foreground">{b.batchNo}</span>
                                                                                                                    )}
                                                                                                                </td>
                                                                                                                <td className="p-2.5 text-muted-foreground font-medium">{b.expiryDate || "-"}</td>
                                                                                                                <td className="p-2.5">
                                                                                                                    <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-bold uppercase">
                                                                                                                        {b.inventoryCondition}
                                                                                                                    </span>
                                                                                                                </td>
                                                                                                                <td className="p-2.5 text-right font-black text-foreground">
                                                                                                                    {b.availableQuantity}
                                                                                                                </td>
                                                                                                                <td className="p-2.5 text-right">
                                                                                                                    <div className="flex items-center justify-end gap-1.5">
                                                                                                                        <Input
                                                                                                                            type="number"
                                                                                                                            min={0}
                                                                                                                            max={b.availableQuantity}
                                                                                                                            value={currentQty || ""}
                                                                                                                            placeholder="0"
                                                                                                                            onChange={(e) =>
                                                                                                                                handleManualQtyChange(
                                                                                                                                    inv.invoiceId,
                                                                                                                                    prod.productId,
                                                                                                                                    b.inventoryLotId,
                                                                                                                                    b.lotId,
                                                                                                                                    b.batchNo,
                                                                                                                                    b.availableQuantity,
                                                                                                                                    e.target.value
                                                                                                                                )
                                                                                                                            }
                                                                                                                            className={`h-8 w-24 text-right text-xs font-mono font-bold ${
                                                                                                                                isAllocated ? "border-primary bg-primary/5 font-black text-primary ring-1 ring-primary/30" : "bg-card"
                                                                                                                            }`}
                                                                                                                        />
                                                                                                                        <Button
                                                                                                                            type="button"
                                                                                                                            variant={isAllocated ? "default" : "outline"}
                                                                                                                            size="sm"
                                                                                                                            onClick={() => {
                                                                                                                                const lineSummary = getManualLineSummary(
                                                                                                                                    inv.invoiceId,
                                                                                                                                    prod.productId,
                                                                                                                                    prod.quantity
                                                                                                                                );
                                                                                                                                const totalAlloc = lineSummary.allocated;
                                                                                                                                const totalReq = prod.quantity;
                                                                                                                                const diff = totalReq - (totalAlloc - currentQty);
                                                                                                                                const fillAmount = Math.min(b.availableQuantity, Math.max(0, diff));
                                                                                                                                handleManualQtyChange(
                                                                                                                                    inv.invoiceId,
                                                                                                                                    prod.productId,
                                                                                                                                    b.inventoryLotId,
                                                                                                                                    b.lotId,
                                                                                                                                    b.batchNo,
                                                                                                                                    b.availableQuantity,
                                                                                                                                    String(fillAmount)
                                                                                                                                );
                                                                                                                            }}
                                                                                                                            className="h-8 px-2 text-[10px] font-bold rounded-lg"
                                                                                                                        >
                                                                                                                            Fill
                                                                                                                        </Button>
                                                                                                                    </div>
                                                                                                                </td>
                                                                                                            </tr>
                                                                                                        );
                                                                                                    })}
                                                                                                </tbody>
                                                                                            </table>
                                                                                        </div>
                                                                                    ) : (
                                                                                        <div className="rounded-xl border border-dashed border-border/70 p-3 text-center text-xs text-muted-foreground italic">
                                                                                            No available stock batches found for this product in warehouse.
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Step 2 Footer */}
                        <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/60 bg-card px-4 py-4 sm:px-7">
                            <div className="text-xs text-muted-foreground">
                                <span className="font-bold text-foreground">{selectedIds.size}</span> order(s) selected
                                {" — "}Total Value:{" "}
                                <span className="font-black text-foreground">
                                    ₱{totalSelectedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                                {allocationMode === "manual" && (
                                    <span
                                        className={`ml-2 font-bold ${
                                            isManualValid ? "text-emerald-600" : "text-amber-600"
                                        }`}
                                    >
                                        ({isManualValid ? "All products balanced" : "Adjustment needed"})
                                    </span>
                                )}
                            </div>

                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                                <Button
                                    variant="outline"
                                    onClick={() => setStep(1)}
                                    disabled={submitting}
                                    className="rounded-xl font-bold"
                                >
                                    <ArrowLeft className="h-4 w-4 mr-1" />
                                    Back to Orders
                                </Button>
                                <Button
                                    onClick={() => setStep(3)}
                                    disabled={!canProceedToStep3}
                                    className="rounded-xl px-5 font-black uppercase tracking-wider gap-1.5"
                                >
                                    Review Demand Summary (Step 3)
                                    <ArrowRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 3: CONSOLIDATED DEMAND SUMMARY */}
                {step === 3 && (
                    <div className="flex-1 flex flex-col min-h-0">
                        {/* Step 3 Metrics Header Bar */}
                        <div className="shrink-0 border-b bg-muted/20 px-4 py-3.5 sm:px-7">
                            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                                <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Selected Orders</p>
                                    <p className="mt-1 text-lg font-black text-foreground">{selectedIds.size}</p>
                                    <p className="text-[10px] text-muted-foreground">SO & JO Documents</p>
                                </div>
                                <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Unique Products</p>
                                    <p className="mt-1 text-lg font-black text-primary">{aggregatedProducts.length}</p>
                                    <p className="text-[10px] text-muted-foreground">Consolidated SKUs</p>
                                </div>
                                <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Demand</p>
                                    <p className="mt-1 text-lg font-black text-foreground">
                                        {totalOrderedUnits} <span className="text-xs font-semibold text-muted-foreground">units</span>
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">{totalAllocatedUnits} units allocated</p>
                                </div>
                                <div className="rounded-2xl border border-border/60 bg-card p-3 shadow-sm">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Gross Value</p>
                                    <p className="mt-1 text-lg font-black text-foreground">
                                        ₱{totalSelectedAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">Branch: {branch.branchName}</p>
                                </div>
                                <div className="col-span-2 sm:col-span-4 lg:col-span-1 rounded-2xl border border-border/60 bg-card p-3 shadow-sm flex flex-col justify-between">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Allocation Strategy</p>
                                    <div className="mt-1">
                                        <span
                                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                                                allocationMode === "auto"
                                                    ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                                    : isManualValid
                                                    ? "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                                                    : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                            }`}
                                        >
                                            {allocationMode === "auto" ? "⚡ Live FEFO (Auto)" : isManualValid ? "✓ Custom (Balanced)" : "⚠ Custom (Unbalanced)"}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Step 3 Table Container */}
                        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-7 space-y-4">
                            {/* Shortage warning if any */}
                            {allocationPreview && allocationPreview.shortages.length > 0 && allocationMode === "auto" && (
                                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-3 shadow-sm">
                                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                                    <div className="space-y-1">
                                        <p className="font-black uppercase tracking-wider text-[11px]">Consolidation Stock Notice</p>
                                        <p className="text-xs">
                                            Some products have insufficient available stock in this warehouse. A total of{" "}
                                            <strong>{allocationPreview.shortages.reduce((s, sh) => s + sh.quantity, 0)} unit(s)</strong> are currently short across {allocationPreview.shortages.length} product(s).
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Consolidated Demand Summary Table */}
                            <div className="overflow-hidden rounded-3xl border border-border/60 bg-card shadow-sm">
                                <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-3.5 sm:px-5">
                                    <div className="flex items-center gap-2">
                                        <Layers className="h-4.5 w-4.5 text-primary" />
                                        <h3 className="text-sm font-black uppercase tracking-wider text-foreground">
                                            Consolidated Demand Summary — {aggregatedProducts.length} Unique Product(s)
                                        </h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-xl border border-border/40">
                                            Total Demand: <strong className="text-foreground">{totalOrderedUnits}</strong> units across <strong className="text-foreground">{selectedIds.size}</strong> order(s)
                                        </span>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                            <tr className="border-b bg-muted/10 text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                                                <th className="p-3.5">Product</th>
                                                <th className="p-3.5">Code</th>
                                                <th className="p-3.5">BOM Version</th>
                                                <th className="p-3.5 text-right">Orders Requesting</th>
                                                <th className="p-3.5 text-right">Total Demand</th>
                                                <th className="p-3.5 text-right">Allocated Qty</th>
                                                <th className="p-3.5">Allocated Batches & Lots</th>
                                                <th className="p-3.5 text-right">Fulfillment Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/40">
                                            {aggregatedProducts.map((p) => {
                                                let productAllocatedQty = 0;
                                                const assignedBatches: Array<{ batchNo: string; lotName: string; quantity: number }> = [];

                                                if (allocationMode === "manual") {
                                                    for (const [key, qty] of Object.entries(manualAllocations)) {
                                                        if (Number(qty) > 0) {
                                                            const [, prodIdStr, invLotIdStr, batchNo, lotIdStr] = key.split(":");
                                                            if (Number(prodIdStr) === p.productId) {
                                                                productAllocatedQty += Number(qty);
                                                                const invLotId = Number(invLotIdStr || 0);
                                                                const lotId = Number(lotIdStr || 0);
                                                                const b = (allocationPreview?.availableBatches || []).find(
                                                                    (batch) =>
                                                                        batch.productId === p.productId &&
                                                                        ((invLotId > 0 && batch.inventoryLotId === invLotId) ||
                                                                            (batch.batchNo === batchNo && batch.lotId === lotId))
                                                                );
                                                                if (b) {
                                                                    const existingAssigned = assignedBatches.find(
                                                                        (ab) => ab.batchNo === b.batchNo && ab.lotName === b.lotName
                                                                    );
                                                                    if (existingAssigned) {
                                                                        existingAssigned.quantity += Number(qty);
                                                                    } else {
                                                                        assignedBatches.push({
                                                                            batchNo: b.batchNo,
                                                                            lotName: b.lotName,
                                                                            quantity: Number(qty),
                                                                        });
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                } else {
                                                    const allocs = (allocationPreview?.allocations || []).filter((a) => a.productId === p.productId);
                                                    productAllocatedQty = allocs.reduce((sum, a) => sum + a.quantity, 0);
                                                    for (const a of allocs) {
                                                        assignedBatches.push({
                                                            batchNo: a.batchNo,
                                                            lotName: a.lotName,
                                                            quantity: a.quantity,
                                                        });
                                                    }
                                                }

                                                const isFullyCovered = productAllocatedQty >= p.totalQuantity;
                                                const diff = p.totalQuantity - productAllocatedQty;

                                                return (
                                                    <tr key={`demand-prod-${p.productId}`} className="hover:bg-muted/5 transition-colors">
                                                        <td className="p-3.5 font-bold text-foreground">
                                                            {p.productName}
                                                        </td>
                                                        <td className="p-3.5 font-mono text-muted-foreground">
                                                            {p.productCode || "-"}
                                                        </td>
                                                        <td className="p-3.5">
                                                            <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[9px] font-bold text-primary">
                                                                {p.versionLabel}
                                                            </span>
                                                        </td>
                                                        <td className="p-3.5 text-right font-bold text-muted-foreground">
                                                            {p.invoiceCount} order(s)
                                                        </td>
                                                        <td className="p-3.5 text-right font-black text-foreground text-sm">
                                                            {p.totalQuantity}
                                                        </td>
                                                        <td className="p-3.5 text-right font-black text-sm">
                                                            <span className={isFullyCovered ? "text-emerald-600" : "text-amber-600"}>
                                                                {productAllocatedQty}
                                                            </span>
                                                        </td>
                                                        <td className="p-3.5">
                                                            {assignedBatches.length > 0 ? (
                                                                <div className="flex flex-wrap gap-1 max-w-md">
                                                                    {assignedBatches.map((b, idx) => (
                                                                        <span
                                                                            key={`assigned-batch-${p.productId}-${b.batchNo}-${idx}`}
                                                                            className="inline-flex items-center gap-1 rounded-lg border border-border/70 bg-card px-2 py-0.5 text-[10px] font-medium shadow-xs"
                                                                        >
                                                                            <span className="font-bold text-foreground">{b.lotName}</span>
                                                                            <span className="font-mono text-muted-foreground">({b.batchNo})</span>
                                                                            <span className="font-black text-primary ml-0.5">· {b.quantity} qty</span>
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <span className="text-[11px] text-muted-foreground italic">No batches allocated</span>
                                                            )}
                                                        </td>
                                                        <td className="p-3.5 text-right">
                                                            <span
                                                                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                                                    isFullyCovered
                                                                        ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                                                                        : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                                                                }`}
                                                            >
                                                                {isFullyCovered ? (
                                                                    <>
                                                                        <CheckCircle2 className="h-3 w-3" />
                                                                        Fully Covered
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <AlertTriangle className="h-3 w-3" />
                                                                        Shortage ({diff > 0 ? `-${diff}` : diff})
                                                                    </>
                                                                )}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Step 3 Footer */}
                        <div className="shrink-0 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/60 bg-card px-4 py-4 sm:px-7">
                            <div className="text-xs text-muted-foreground">
                                Ready to create consolidation batch for <strong className="text-foreground">{branch.branchName}</strong> with{" "}
                                <span className="font-bold text-foreground">{selectedIds.size}</span> order(s) and{" "}
                                <span className="font-bold text-foreground">{totalOrderedUnits}</span> total units.
                            </div>

                            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                                <Button
                                    variant="outline"
                                    onClick={() => setStep(2)}
                                    disabled={submitting}
                                    className="rounded-xl font-bold"
                                >
                                    <ArrowLeft className="h-4 w-4 mr-1" />
                                    Back to Stock Allocation
                                </Button>
                                <Button
                                    onClick={handleSubmit}
                                    disabled={!canSubmit}
                                    className="rounded-xl px-5 font-black uppercase tracking-wider"
                                >
                                    {submitting && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                                    Create Consolidation Batch ({selectedIds.size})
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
