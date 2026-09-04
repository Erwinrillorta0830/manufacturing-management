"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
    MmPhysicalInventorySheet,
    MmPhysicalInventoryDetail,
    MmOffsetPairing,
    Branch,
    ProductType,
    PriceType,
    StockType,
} from "../types";
import SearchableSelect from "./SearchableSelect";
import { formatQty, formatMoney } from "./PhysicalInventoryList";
import { ArrowLeft, Plus, Save, Send, Trash2, RotateCcw, AlertTriangle, Layers, LayoutGrid, List, Tag, Loader2, GitCompare, CheckCircle2 } from "lucide-react";

interface Props {
    sheet?: MmPhysicalInventorySheet | null;
    branches: Branch[];
    productTypes?: ProductType[];
    priceTypes?: PriceType[];
    existingSheets?: MmPhysicalInventorySheet[];
    offsetPairings?: MmOffsetPairing[];
    loading: boolean;
    onBack: () => void;
    onSaveHeader: (payload: {
        branch_id: number;
        stock_type?: StockType;
        product_type_id?: number | null;
        price_type_id?: number | null;
        starting_date?: string;
        cutoff_date?: string;
        remarks?: string;
    }) => Promise<void>;
    onPopulateSheet?: (productTypeId?: number | null) => Promise<void>;
    onOpenAddDetailModal: (lotId?: number) => void;
    onRemoveDetail: (detail: MmPhysicalInventoryDetail) => void;
    onSaveInlineCount?: (detail: MmPhysicalInventoryDetail, newPhysCount: number | null) => Promise<void>;
    onSaveInlineRemark?: (detail: MmPhysicalInventoryDetail, remarks: string) => Promise<void>;
    onSaveDraftBatch?: (
        headerPayload?: { remarks?: string },
        modifiedCounts?: Array<{ detailId: number; physical_count: number | null }>,
        modifiedRemarks?: Array<{ detailId: number; remarks: string }>
    ) => Promise<void>;
    onOpenOffsettingModal?: () => void;
    onSubmit: () => void;
    onReturnToDraft?: () => void;
    onCommit?: () => void;
}

export default function PhysicalInventoryForm({
    sheet,
    branches,
    productTypes = [],
    priceTypes = [],
    existingSheets = [],
    loading,
    onBack,
    onSaveHeader,
    onPopulateSheet,
    onOpenAddDetailModal,
    onRemoveDetail,
    onSaveInlineCount,
    onSaveInlineRemark,
    onSaveDraftBatch,
    onSubmit,
    onReturnToDraft,
}: Props) {
    const isNew = !sheet || !sheet.physical_inventory_id;
    const isDraft = sheet?.status === "DRAFT" || isNew;
    const isPendingReview = sheet?.status === "PENDING_REVIEW";
    const isReadOnly = !isDraft;

    const [remarksMap, setRemarksMap] = useState<Record<number, string>>({});

    const [branchId, setBranchId] = useState<number>(() => {
        if (!sheet?.branch_id) return 0;
        return typeof sheet.branch_id === "object" ? sheet.branch_id.id || 0 : sheet.branch_id;
    });

    const extractPtId = (val: unknown): number => {
        if (!val) return 0;
        if (typeof val === "object" && val !== null) {
            const obj = val as Record<string, unknown>;
            return Number(obj.id ?? obj.product_type_id ?? 0);
        }
        const num = Number(val);
        return !isNaN(num) && num > 0 ? num : 0;
    };

    const extractPriceTypeId = (val: unknown): number => {
        if (!val) return 0;
        if (typeof val === "object" && val !== null) {
            const obj = val as Record<string, unknown>;
            return Number(obj.price_type_id ?? obj.id ?? 0);
        }
        const num = Number(val);
        return !isNaN(num) && num > 0 ? num : 0;
    };

    const [productTypeId, setProductTypeId] = useState<number>(() => extractPtId(sheet?.product_type_id));
    const [priceTypeId, setPriceTypeId] = useState<number>(() => extractPriceTypeId(sheet?.price_type_id));

    const handleProductTypeChange = (newPtId: number) => {
        setProductTypeId(newPtId);
        if (newPtId > 0 && !priceTypeId) {
            const pt = productTypes.find((p) => p.id === newPtId);
            if (pt?.default_purchase_price_type_id && pt.default_purchase_price_type_id > 0) {
                setPriceTypeId(pt.default_purchase_price_type_id);
            }
        }
    };

    const formatDateTimeInput = (val: string | null | undefined): string => {
        if (!val) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, "0");
            const day = String(now.getDate()).padStart(2, "0");
            const hours = String(now.getHours()).padStart(2, "0");
            const mins = String(now.getMinutes()).padStart(2, "0");
            return `${year}-${month}-${day}T${hours}:${mins}`;
        }
        const str = String(val).trim();
        if (str.includes("T")) {
            const parts = str.split("T");
            const datePart = parts[0];
            const timePart = parts[1].slice(0, 5);
            return `${datePart}T${timePart}`;
        }
        if (str.includes(" ")) {
            const parts = str.split(" ");
            const datePart = parts[0];
            const timePart = (parts[1] || "00:00").slice(0, 5);
            return `${datePart}T${timePart}`;
        }
        return `${str}T00:00`;
    };

    const branchHasCommittedOpening = useMemo(() => {
        if (!branchId || branchId <= 0 || !existingSheets || existingSheets.length === 0) return false;
        return existingSheets.some((s) => {
            const bId = typeof s.branch_id === "object" ? s.branch_id?.id : s.branch_id;
            const isCancelled = s.isCancelled === true || s.isCancelled === 1 || s.status === "CANCELLED";
            const isCommitted = s.isCommitted === true || s.isCommitted === 1 || String(s.status) === "COMMITTED" || String(s.status) === "POSTED";
            return (
                bId === branchId &&
                s.stock_type === "OPENING" &&
                !isCancelled &&
                isCommitted &&
                s.physical_inventory_id !== sheet?.physical_inventory_id
            );
        });
    }, [existingSheets, branchId, sheet?.physical_inventory_id]);

    const lastCommittedCutoffDate = useMemo(() => {
        if (!branchId || branchId <= 0 || !existingSheets || existingSheets.length === 0) return null;
        const committedBranchSheets = existingSheets.filter((s) => {
            const bId = typeof s.branch_id === "object" ? s.branch_id?.id : s.branch_id;
            const isCancelled = s.isCancelled === true || s.isCancelled === 1 || s.status === "CANCELLED";
            const isCommitted = s.isCommitted === true || s.isCommitted === 1 || String(s.status) === "COMMITTED" || String(s.status) === "POSTED";
            return bId === branchId && !isCancelled && isCommitted && s.physical_inventory_id !== sheet?.physical_inventory_id;
        });
        if (committedBranchSheets.length === 0) return null;
        committedBranchSheets.sort((a, b) => {
            const dateA = new Date(a.cutoff_date || a.starting_date || a.created_at || 0).getTime();
            const dateB = new Date(b.cutoff_date || b.starting_date || b.created_at || 0).getTime();
            return dateB - dateA;
        });
        return committedBranchSheets[0].cutoff_date || null;
    }, [existingSheets, branchId, sheet?.physical_inventory_id]);

    const [stockType, setStockType] = useState<StockType>(() => {
        if (sheet?.stock_type) return sheet.stock_type;
        return branchHasCommittedOpening ? "REGULAR" : "OPENING";
    });
    const [startingDate, setStartingDate] = useState<string>(() => formatDateTimeInput(sheet?.starting_date));
    const [cutoffDate, setCutoffDate] = useState<string>(() => formatDateTimeInput(sheet?.cutoff_date));
    const [remarks, setRemarks] = useState<string>(sheet?.remarks || "");
    const [countsMap, setCountsMap] = useState<Record<number, string>>({});
    const [viewMode, setViewMode] = useState<"GROUPED" | "FLAT">("GROUPED");
    const [saving, setSaving] = useState(false);
    const [savingDraft, setSavingDraft] = useState(false);
    const [draftSavedToast, setDraftSavedToast] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (sheet) {
            const bId = typeof sheet.branch_id === "object" ? sheet.branch_id?.id : sheet.branch_id;
            if (bId) setBranchId(bId);
            if (sheet.stock_type) setStockType(sheet.stock_type);
            const ptId = extractPtId(sheet.product_type_id);
            setProductTypeId(ptId);
            const prId = extractPriceTypeId(sheet.price_type_id);
            if (prId > 0) {
                setPriceTypeId(prId);
            } else if (priceTypes.length > 0) {
                setPriceTypeId((prev) => (prev > 0 ? prev : priceTypes[0].price_type_id));
            }
            if (sheet.starting_date) {
                setStartingDate(formatDateTimeInput(sheet.starting_date));
            } else if (lastCommittedCutoffDate) {
                setStartingDate(formatDateTimeInput(lastCommittedCutoffDate));
            }
            if (sheet.cutoff_date) setCutoffDate(formatDateTimeInput(sheet.cutoff_date));
            setRemarks(sheet.remarks || "");
        } else {
            if (priceTypes.length > 0) {
                setPriceTypeId((prev) => (prev > 0 ? prev : priceTypes[0].price_type_id));
            }
            setStockType(branchHasCommittedOpening ? "REGULAR" : "OPENING");
            if (lastCommittedCutoffDate) {
                setStartingDate(formatDateTimeInput(lastCommittedCutoffDate));
            }
        }
    }, [sheet, priceTypes, branchHasCommittedOpening, lastCommittedCutoffDate]);

    const handleHeaderSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!branchId || branchId <= 0) {
            setError("Please select an active Branch.");
            return;
        }
        try {
            setSaving(true);
            await onSaveHeader({
                branch_id: branchId,
                stock_type: stockType,
                product_type_id: productTypeId > 0 ? productTypeId : null,
                price_type_id: priceTypeId > 0 ? priceTypeId : null,
                starting_date: startingDate,
                cutoff_date: cutoffDate,
                remarks: remarks.trim(),
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to save header";
            setError(msg);
        } finally {
            setSaving(false);
        }
    };

    const details = useMemo(() => sheet?.details || [], [sheet?.details]);

    // Unsaved Changes / Dirty State Tracking
    const isHeaderRemarksDirty = useMemo(() => {
        return remarks.trim() !== (sheet?.remarks || "").trim();
    }, [remarks, sheet?.remarks]);

    const isCountsDirty = useMemo(() => {
        for (const [dIdStr, valStr] of Object.entries(countsMap)) {
            if (valStr === undefined) continue;
            const dId = Number(dIdStr);
            const detailObj = details.find((d) => (d.physical_inventory_detail_id || d.id) === dId);
            if (!detailObj) continue;

            const origPhys = detailObj.physical_count;
            const origStr = origPhys !== null && origPhys !== undefined ? String(Math.round(Number(origPhys))) : "";
            if (valStr.trim() !== origStr.trim()) {
                return true;
            }
        }
        return false;
    }, [countsMap, details]);

    const isItemRemarksDirty = useMemo(() => {
        for (const [dIdStr, remarkStr] of Object.entries(remarksMap)) {
            if (remarkStr === undefined) continue;
            const dId = Number(dIdStr);
            const detailObj = details.find((d) => (d.physical_inventory_detail_id || d.id) === dId);
            if (!detailObj) continue;

            const origRemark = (detailObj.remarks || "").trim();
            if (remarkStr.trim() !== origRemark) {
                return true;
            }
        }
        return false;
    }, [remarksMap, details]);

    const hasUnsavedChanges = isHeaderRemarksDirty || isCountsDirty || isItemRemarksDirty;

    const handleSaveDraft = async () => {
        setError(null);
        setSavingDraft(true);
        try {
            const modifiedHeader = isHeaderRemarksDirty ? { remarks: remarks.trim() } : undefined;

            const modifiedCounts: Array<{ detailId: number; physical_count: number | null }> = [];
            for (const [dIdStr, valStr] of Object.entries(countsMap)) {
                const dId = Number(dIdStr);
                const detailObj = details.find((d) => (d.physical_inventory_detail_id || d.id) === dId);
                if (!detailObj) continue;

                const origPhys = detailObj.physical_count;
                const origStr = origPhys !== null && origPhys !== undefined ? String(Math.round(Number(origPhys))) : "";
                if (valStr.trim() !== origStr.trim()) {
                    const num = valStr.trim() === "" ? null : Math.round(Number(valStr));
                    if (num === null || (!isNaN(num) && num >= 0)) {
                        modifiedCounts.push({ detailId: dId, physical_count: num });
                    }
                }
            }

            const modifiedRemarks: Array<{ detailId: number; remarks: string }> = [];
            for (const [dIdStr, remarkStr] of Object.entries(remarksMap)) {
                const dId = Number(dIdStr);
                const detailObj = details.find((d) => (d.physical_inventory_detail_id || d.id) === dId);
                if (!detailObj) continue;

                const origRemark = (detailObj.remarks || "").trim();
                if (remarkStr.trim() !== origRemark) {
                    modifiedRemarks.push({ detailId: dId, remarks: remarkStr.trim() });
                }
            }

            if (onSaveDraftBatch) {
                await onSaveDraftBatch(modifiedHeader, modifiedCounts, modifiedRemarks);
            } else {
                if (modifiedHeader && sheet?.physical_inventory_id) {
                    await onSaveHeader({ branch_id: branchId, remarks: remarks.trim() });
                }
                for (const item of modifiedCounts) {
                    const detailObj = details.find((d) => (d.physical_inventory_detail_id || d.id) === item.detailId);
                    if (detailObj && onSaveInlineCount) {
                        await onSaveInlineCount(detailObj, item.physical_count);
                    }
                }
                for (const item of modifiedRemarks) {
                    const detailObj = details.find((d) => (d.physical_inventory_detail_id || d.id) === item.detailId);
                    if (detailObj && onSaveInlineRemark) {
                        await onSaveInlineRemark(detailObj, item.remarks);
                    }
                }
            }

            setCountsMap({});
            setRemarksMap({});

            setDraftSavedToast(true);
            setTimeout(() => setDraftSavedToast(false), 4500);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Failed to save draft progress.";
            setError(msg);
        } finally {
            setSavingDraft(false);
        }
    };

    const groupedByLot = React.useMemo(() => {
        const map = new Map<string, { lotName: string; lotObj: unknown; items: MmPhysicalInventoryDetail[] }>();
        for (const d of details) {
            const lName = typeof d.lot_id === "object" && d.lot_id !== null ? (d.lot_id as { lot_name?: string }).lot_name || "Unassigned Lot" : `Lot #${d.lot_id || "N/A"}`;
            if (!map.has(lName)) {
                map.set(lName, {
                    lotName: lName,
                    lotObj: d.lot_id,
                    items: [],
                });
            }
            map.get(lName)!.items.push(d);
        }
        return Array.from(map.values());
    }, [details]);

    const getLotName = (l: unknown) => {
        if (typeof l === "object" && l !== null) {
            return (l as { lot_name?: string }).lot_name || "N/A";
        }
        return `Lot #${l || "N/A"}`;
    };

    const getProductCode = (p: unknown) => {
        if (typeof p === "object" && p !== null) {
            return (p as { product_code?: string }).product_code || "SKU";
        }
        return `Prod #${p || "N/A"}`;
    };

    const getProductName = (p: unknown) => {
        if (typeof p === "object" && p !== null) {
            return (p as { product_name?: string }).product_name || "Product";
        }
        return "Product";
    };

    const getUnitShortcut = (u: unknown, p: unknown) => {
        let shortcut = "";
        if (typeof u === "object" && u !== null && (u as { unit_shortcut?: string; unit_name?: string }).unit_shortcut) {
            shortcut = (u as { unit_shortcut?: string }).unit_shortcut || "";
        } else if (typeof u === "object" && u !== null && (u as { unit_name?: string }).unit_name) {
            shortcut = (u as { unit_name?: string }).unit_name || "";
        } else if (typeof p === "object" && p !== null && (p as { unit_of_measurement?: { unit_shortcut?: string; unit_name?: string } }).unit_of_measurement?.unit_shortcut) {
            shortcut = (p as { unit_of_measurement?: { unit_shortcut?: string } }).unit_of_measurement?.unit_shortcut || "";
        } else if (typeof p === "object" && p !== null && (p as { unit_of_measurement?: { unit_name?: string } }).unit_of_measurement?.unit_name) {
            shortcut = (p as { unit_of_measurement?: { unit_name?: string } }).unit_of_measurement?.unit_name || "";
        }

        const count = typeof p === "object" && p !== null ? Number((p as { unit_of_measurement_count?: number }).unit_of_measurement_count || 0) : 0;
        const baseUom = shortcut || "UOM";

        if (count > 1) {
            return `${baseUom} (${count} pcs/${baseUom.toLowerCase()})`;
        }
        return baseUom;
    };

    const summaryPieces = useMemo(() => {
        let sysPcs = 0;
        let physPcs = 0;
        let sysUom = 0;
        let physUom = 0;
        let diffCostSum = 0;

        for (const d of details) {
            const prodObj = typeof d.product_id === "object" && d.product_id !== null ? (d.product_id as unknown as Record<string, unknown>) : null;
            const uomCountRaw = prodObj ? Number(prodObj.unit_of_measurement_count || 0) : 0;
            const uomCount = uomCountRaw > 0 ? uomCountRaw : 1;

            const dId = d.physical_inventory_detail_id || d.id || 0;
            const sys = Number(d.system_count || 0);
            const origPhys = d.physical_count;
            const rawInput = dId ? countsMap[dId] : undefined;
            const hasInput = rawInput !== undefined && rawInput !== "";
            const hasSavedCount = dId && countsMap[dId] !== undefined ? countsMap[dId] !== "" : (origPhys !== null && origPhys !== undefined);
            const phys = hasInput ? Number(rawInput) : (hasSavedCount ? Number(origPhys || 0) : 0);

            const sysItemPcs = sys * uomCount;
            const physItemPcs = phys * uomCount;
            const varItemUom = phys - sys;
            const unitCost = Number(d.unit_cost || 0);

            sysUom += sys;
            physUom += phys;
            sysPcs += sysItemPcs;
            physPcs += physItemPcs;
            diffCostSum += varItemUom * unitCost;
        }

        const varPcs = physPcs - sysPcs;
        const varUom = physUom - sysUom;

        const finalSysPcs = sysPcs > 0 ? sysPcs : (sheet?.total_system_quantity || 0);
        const finalPhysPcs = physPcs > 0 ? physPcs : (sheet?.total_physical_quantity || 0);
        const finalVarPcs = sysPcs > 0 ? varPcs : (sheet?.total_variance || 0);
        const finalDiffCost = diffCostSum !== 0 ? diffCostSum : (sheet?.total_difference_cost || 0);

        return {
            totalSystemPieces: finalSysPcs,
            totalPhysicalPieces: finalPhysPcs,
            totalVariancePieces: finalVarPcs,
            totalSystemUom: sysUom,
            totalPhysicalUom: physUom,
            totalVarianceUom: varUom,
            totalDifferenceCost: finalDiffCost,
        };
    }, [details, countsMap, sheet?.total_system_quantity, sheet?.total_physical_quantity, sheet?.total_variance, sheet?.total_difference_cost]);

    return (
        <div className="space-y-6">
            {/* Top Navigation */}
            <div className="flex items-center justify-between bg-card p-4 rounded-xl border shadow-xs">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onBack}
                        className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                    <div>
                        <h2 className="text-lg font-bold text-foreground">
                            {isNew ? "Create Physical Inventory Sheet" : `Physical Inventory #${sheet?.pi_no}`}
                        </h2>
                        <p className="text-xs text-muted-foreground">
                            {isNew
                                ? "Onboard opening stock or establish physical count balance reconciliations."
                                : `Status: ${sheet?.status} | Type: ${sheet?.stock_type}`}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {isDraft && !isNew && (
                        <>
                            <button
                                type="button"
                                onClick={handleSaveDraft}
                                disabled={!hasUnsavedChanges || loading || saving || savingDraft}
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed ${hasUnsavedChanges
                                    ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20 ring-2 ring-emerald-500/30 cursor-pointer"
                                    : "bg-card text-slate-500 dark:text-slate-400 border border-border cursor-not-allowed"
                                    }`}
                                title={hasUnsavedChanges ? "Click to save draft progress" : "All changes saved"}
                            >
                                {savingDraft ? (
                                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                                ) : hasUnsavedChanges ? (
                                    <Save className="h-4 w-4 text-white" />
                                ) : (
                                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                )}
                                <span>{savingDraft ? "Saving Draft..." : hasUnsavedChanges ? "Save Draft" : "Draft Saved"}</span>
                                {hasUnsavedChanges && (
                                    <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse ml-0.5" />
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={onSubmit}
                                disabled={loading || saving || savingDraft || details.length === 0}
                                className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs disabled:opacity-50"
                            >
                                <Send className="h-4 w-4" />
                                Submit for Review
                            </button>
                        </>
                    )}

                    {isPendingReview && onReturnToDraft && (
                        <button
                            type="button"
                            onClick={onReturnToDraft}
                            disabled={loading}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors shadow-xs"
                        >
                            <RotateCcw className="h-4 w-4" />
                            Return to Draft
                        </button>
                    )}

                    {isPendingReview && (
                        <Link
                            href={`/mm/physical-inventory-offsetting?id=${sheet?.physical_inventory_id || ""}`}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs"
                        >
                            <GitCompare className="h-4 w-4" />
                            Go to Offsetting Module to Commit
                        </Link>
                    )}
                </div>
            </div>

            {draftSavedToast && (
                <div className="p-3.5 bg-emerald-50/90 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-semibold text-emerald-900 dark:text-emerald-200 flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-emerald-600 text-white rounded-md shrink-0">
                            <CheckCircle2 className="h-4 w-4" />
                        </div>
                        <div>
                            <div className="font-bold text-sm">Draft Progress Saved</div>
                            <div className="text-emerald-700 dark:text-emerald-300 mt-0.5">
                                All header details and physical count inputs have been staged in <strong>DRAFT</strong> status. No stock ledger postings or lot master modifications occurred.
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setDraftSavedToast(false)}
                        className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300 text-base font-bold px-2 py-1"
                    >
                        &times;
                    </button>
                </div>
            )}

            {isPendingReview && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 bg-indigo-50/90 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs text-indigo-900 dark:text-indigo-200 shadow-xs">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-600 text-white rounded-lg shrink-0">
                            <GitCompare className="h-5 w-5" />
                        </div>
                        <div>
                            <div className="font-bold text-sm">Inventory Sheet Pending Offsetting Audit & Review</div>
                            <div className="text-indigo-700 dark:text-indigo-300 mt-0.5">
                                Direct committing is disabled in this entry form. Please proceed to the <strong>Physical Inventory Offsetting Module</strong> to reconcile lot variances and commit final stock adjustments.
                            </div>
                        </div>
                    </div>
                    <Link
                        href={`/mm/physical-inventory-offsetting?id=${sheet?.physical_inventory_id || ""}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs shrink-0"
                    >
                        Go to Offsetting Module &rarr;
                    </Link>
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 p-3 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-lg dark:bg-rose-950 dark:text-rose-300">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Header Form */}
            <form onSubmit={handleHeaderSubmit} className="bg-card border rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b pb-2">
                    <h3 className="text-sm font-semibold text-foreground">Header Information</h3>
                    {productTypeId > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                            <Tag className="h-3 w-3" />
                            Scope: {productTypes.find((pt) => pt.id === productTypeId)?.name || productTypes.find((pt) => pt.id === productTypeId)?.type_name || `Type #${productTypeId}`}
                        </span>
                    )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Branch *</label>
                        <SearchableSelect
                            options={branches.map((b) => ({
                                value: b.id,
                                label: b.branch_name || b.branchName || `Branch #${b.id}`,
                                sublabel: b.branch_code || b.branchCode || undefined,
                            }))}
                            value={branchId}
                            onChange={(val) => {
                                const newBId = Number(val);
                                setBranchId(newBId);
                                if (!sheet || isNew) {
                                    const committedForNewBranch = existingSheets.filter((s) => {
                                        const bId = typeof s.branch_id === "object" ? s.branch_id?.id : s.branch_id;
                                        const isCancelled = s.isCancelled === true || s.isCancelled === 1 || s.status === "CANCELLED";
                                        const isCommitted = s.isCommitted === true || s.isCommitted === 1 || String(s.status) === "COMMITTED" || String(s.status) === "POSTED";
                                        return bId === newBId && !isCancelled && isCommitted && s.physical_inventory_id !== sheet?.physical_inventory_id;
                                    });
                                    if (committedForNewBranch.length > 0) {
                                        committedForNewBranch.sort((a, b) => {
                                            const dateA = new Date(a.cutoff_date || a.starting_date || a.created_at || 0).getTime();
                                            const dateB = new Date(b.cutoff_date || b.starting_date || b.created_at || 0).getTime();
                                            return dateB - dateA;
                                        });
                                        const lastCutoff = committedForNewBranch[0].cutoff_date;
                                        if (lastCutoff) {
                                            setStartingDate(formatDateTimeInput(lastCutoff));
                                        }
                                    }
                                }
                            }}
                            placeholder="Select Branch..."
                            searchPlaceholder="Search branches..."
                            disabled={isReadOnly || (details.length > 0 && !isNew)}
                            required
                        />
                        {details.length > 0 && !isNew && (
                            <p className="text-[10px] text-amber-600 mt-0.5">Branch locked while sheet contains detail rows.</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Product Type Filter</label>
                        <select
                            value={productTypeId}
                            onChange={(e) => handleProductTypeChange(Number(e.target.value))}
                            disabled={isReadOnly || (details.length > 0 && !isNew)}
                            className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20 disabled:opacity-70"
                        >
                            <option value={0}>All Product Types (Unfiltered)</option>
                            {productTypes.map((pt) => (
                                <option key={pt.id} value={pt.id}>
                                    {pt.name || pt.type_name || `Type #${pt.id}`}
                                </option>
                            ))}
                        </select>
                        {details.length > 0 && !isNew && (
                            <p className="text-[10px] text-amber-600 mt-0.5">Product filter locked while sheet contains detail rows.</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Price Type Basis *</label>
                        <select
                            value={priceTypeId}
                            onChange={(e) => setPriceTypeId(Number(e.target.value))}
                            disabled={isReadOnly || (details.length > 0 && !isNew)}
                            className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20 disabled:opacity-70"
                        >
                            <option value={0}>Standard Cost / Default Price (0.00)</option>
                            {priceTypes.map((pt: PriceType) => (
                                <option key={pt.price_type_id} value={pt.price_type_id}>
                                    {pt.price_type_name}
                                </option>
                            ))}
                        </select>
                        {details.length > 0 && !isNew && (
                            <p className="text-[10px] text-amber-600 mt-0.5">Price basis locked while sheet contains detail rows.</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Stock Count Type *</label>
                        <select
                            value={stockType}
                            onChange={(e) => setStockType(e.target.value as StockType)}
                            disabled={isReadOnly || (details.length > 0 && !isNew) || (isNew && branchHasCommittedOpening)}
                            className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20 disabled:opacity-70"
                        >
                            <option value="OPENING" disabled={isNew && branchHasCommittedOpening}>
                                Opening Inventory (Initial Onboarding) {isNew && branchHasCommittedOpening ? "- Already Committed" : ""}
                            </option>
                            <option value="REGULAR">Regular Physical Inventory</option>
                        </select>
                        {details.length > 0 && !isNew && (
                            <p className="text-[10px] text-amber-600 mt-0.5">Stock count type locked while sheet contains detail rows.</p>
                        )}
                        {isNew && branchHasCommittedOpening && (
                            <p className="text-[10px] text-amber-600 mt-1 font-medium">
                                Committed Opening Inventory already established for this branch. Stock count type set to Regular.
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Starting Date & Time *</label>
                        <input
                            type="datetime-local"
                            value={startingDate}
                            onChange={(e) => setStartingDate(e.target.value)}
                            disabled={isReadOnly || (details.length > 0 && !isNew)}
                            className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20 disabled:opacity-70"
                            required
                        />
                        {details.length > 0 && !isNew ? (
                            <p className="text-[10px] text-amber-600 mt-0.5">Starting date locked while sheet contains detail rows.</p>
                        ) : lastCommittedCutoffDate ? (
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1 font-medium">
                                ✓ Auto-set from branch&apos;s last committed cutoff date ({formatDateTimeInput(lastCommittedCutoffDate).replace("T", " ")})
                            </p>
                        ) : null}
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-muted-foreground mb-1">Cutoff Date & Time *</label>
                        <input
                            type="datetime-local"
                            value={cutoffDate}
                            onChange={(e) => setCutoffDate(e.target.value)}
                            disabled={isReadOnly || (details.length > 0 && !isNew)}
                            className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20 disabled:opacity-70"
                            required
                        />
                        {details.length > 0 && !isNew && (
                            <p className="text-[10px] text-amber-600 mt-0.5">Cutoff date locked while sheet contains detail rows.</p>
                        )}
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1">Remarks / Notes</label>
                    <input
                        type="text"
                        placeholder="Add optional notes or audit reference..."
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        disabled={isReadOnly}
                        className="w-full px-3 py-2 text-sm bg-background border rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20 disabled:opacity-70"
                    />
                </div>

                {isDraft && (
                    <div className="flex justify-end pt-2">
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-foreground bg-secondary hover:bg-secondary/80 border rounded-lg transition-colors"
                        >
                            <Save className="h-4 w-4" />
                            {saving ? "Saving Header..." : isNew ? "Create Sheet Header" : "Update Header Info"}
                        </button>
                    </div>
                )}
            </form>

            {/* Line Items Section */}
            {!isNew && (
                <div className="space-y-4">
                    {/* Header Summary Cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-card border p-3.5 rounded-xl shadow-xs">
                            <div className="text-xs text-muted-foreground font-medium">Total System Count</div>
                            <div className="text-lg font-bold font-mono text-foreground mt-0.5">
                                {formatQty(summaryPieces.totalSystemPieces)}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                                {formatQty(summaryPieces.totalSystemUom)} uom containers
                            </div>
                        </div>
                        <div className="bg-card border p-3.5 rounded-xl shadow-xs">
                            <div className="text-xs text-muted-foreground font-medium">Total Physical Count</div>
                            <div className="text-lg font-bold font-mono text-foreground mt-0.5">
                                {formatQty(summaryPieces.totalPhysicalPieces)}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                                {formatQty(summaryPieces.totalPhysicalUom)} uom containers
                            </div>
                        </div>
                        <div className="bg-card border p-3.5 rounded-xl shadow-xs">
                            <div className="text-xs text-muted-foreground font-medium">Total Variance</div>
                            <div
                                className={`text-lg font-bold font-mono mt-0.5 ${summaryPieces.totalVariancePieces > 0
                                    ? "text-emerald-600"
                                    : summaryPieces.totalVariancePieces < 0
                                        ? "text-rose-600"
                                        : "text-foreground"
                                    }`}
                            >
                                {summaryPieces.totalVariancePieces > 0
                                    ? `+${formatQty(summaryPieces.totalVariancePieces)}`
                                    : formatQty(summaryPieces.totalVariancePieces)}
                            </div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                                {summaryPieces.totalVarianceUom > 0
                                    ? `+${formatQty(summaryPieces.totalVarianceUom)}`
                                    : formatQty(summaryPieces.totalVarianceUom)} uom containers
                            </div>
                        </div>
                        <div className="bg-card border p-3.5 rounded-xl shadow-xs">
                            <div className="text-xs text-muted-foreground font-medium">Difference Cost</div>
                            <div className="text-lg font-bold font-mono text-foreground mt-0.5">
                                {formatMoney(summaryPieces.totalDifferenceCost)}
                            </div>
                        </div>
                    </div>

                    {/* Line Items Container */}
                    <div className="space-y-4">
                        {/* Section Header with Actions & View Mode Toggle */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card p-4 rounded-xl border shadow-xs">
                            <div>
                                <h3 className="text-sm font-bold text-foreground">Physical Count Line Items</h3>
                                <p className="text-xs text-muted-foreground">Products, lots, batches, and counted quantities</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-end">
                                {/* View Mode Switcher */}
                                <div className="inline-flex items-center p-0.5 bg-muted rounded-lg border text-xs font-medium">
                                    <button
                                        type="button"
                                        onClick={() => setViewMode("GROUPED")}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${viewMode === "GROUPED"
                                            ? "bg-background text-foreground font-bold shadow-xs"
                                            : "text-muted-foreground hover:text-foreground"
                                            }`}
                                    >
                                        <LayoutGrid className="h-3.5 w-3.5" />
                                        Grouped by Lot
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setViewMode("FLAT")}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${viewMode === "FLAT"
                                            ? "bg-background text-foreground font-bold shadow-xs"
                                            : "text-muted-foreground hover:text-foreground"
                                            }`}
                                    >
                                        <List className="h-3.5 w-3.5" />
                                        Flat Table
                                    </button>
                                </div>

                                {isDraft && (
                                    <div className="flex items-center gap-2">
                                        {onPopulateSheet && (
                                            <button
                                                type="button"
                                                onClick={() => onPopulateSheet?.(productTypeId > 0 ? productTypeId : null)}
                                                disabled={loading || saving}
                                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-800 bg-sky-100 hover:bg-sky-200 border border-sky-300 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800 rounded-lg transition-colors shadow-xs disabled:opacity-50"
                                                title="Fetch real-time inventory movements & system counts to auto-populate product line items"
                                            >
                                                <RotateCcw className="h-3.5 w-3.5" />
                                                Auto-Populate System Stock
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => onOpenAddDetailModal()}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 transition-colors shadow-xs"
                                        >
                                            <Plus className="h-3.5 w-3.5" />
                                            Add Storage Lot
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {details.length === 0 ? (
                            <div className="bg-card border rounded-xl p-12 text-center text-muted-foreground shadow-xs flex flex-col items-center justify-center gap-3 animate-in fade-in-50">
                                {loading || saving ? (
                                    <>
                                        <Loader2 className="h-8 w-8 text-primary animate-spin" />
                                        <span className="text-sm font-semibold text-foreground">
                                            Loading inventory line items...
                                        </span>
                                        <span className="text-xs text-muted-foreground max-w-sm">
                                            Fetching system counts and auto-populating stock ledger data. Please wait a moment.
                                        </span>
                                    </>
                                ) : (
                                    <span>
                                        {isDraft
                                            ? "No line items added yet. Click \"Add Product Count\" to begin."
                                            : "No line items recorded for this physical inventory sheet."}
                                    </span>
                                )}
                            </div>
                        ) : viewMode === "GROUPED" ? (
                            /* GROUPED BY LOT VIEW */
                            <div className="space-y-4">
                                {groupedByLot.map((group) => {
                                    let lotSysUom = 0;
                                    let lotPhysUom = 0;
                                    let lotVarUom = 0;
                                    let lotSysPcs = 0;
                                    let lotPhysPcs = 0;
                                    let lotVarPcs = 0;
                                    let lotDiffCost = 0;

                                    group.items.forEach((d, index) => {
                                        const prodObj = typeof d.product_id === "object" && d.product_id !== null ? (d.product_id as unknown as Record<string, unknown>) : null;
                                        const uomCountRaw = prodObj ? Number(prodObj.unit_of_measurement_count || 0) : 0;
                                        const uomCount = uomCountRaw > 0 ? uomCountRaw : 1;

                                        const dId = d.physical_inventory_detail_id || d.id || index;
                                        const sys = d.system_count || 0;
                                        const origPhys = d.physical_count;
                                        const rawInput = dId ? countsMap[dId] : undefined;
                                        const hasInput = rawInput !== undefined && rawInput !== "";
                                        const hasSavedCount = dId && countsMap[dId] !== undefined ? countsMap[dId] !== "" : (origPhys !== null && origPhys !== undefined);
                                        const phys = hasInput ? Number(rawInput) : (hasSavedCount ? Number(origPhys || 0) : 0);
                                        const varQty = (hasInput || hasSavedCount) ? phys - sys : 0 - sys;
                                        const unitCost = d.unit_cost || 0;
                                        const diffCost = varQty * unitCost;

                                        lotSysUom += sys;
                                        lotPhysUom += phys;
                                        lotVarUom += varQty;
                                        lotSysPcs += sys * uomCount;
                                        lotPhysPcs += phys * uomCount;
                                        lotVarPcs += varQty * uomCount;
                                        lotDiffCost += diffCost;
                                    });

                                    const lotVarStyle =
                                        lotVarPcs > 0
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300"
                                            : lotVarPcs < 0
                                                ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300"
                                                : "bg-muted/60 text-muted-foreground border-border";

                                    const getGroupLotUom = (g: { lotObj: unknown; items: MmPhysicalInventoryDetail[] }) => {
                                        if (typeof g.lotObj === "object" && g.lotObj !== null) {
                                            const l = g.lotObj as Record<string, unknown>;
                                            const u = l.unit_id;
                                            if (typeof u === "object" && u !== null) {
                                                const uObj = u as { unit_shortcut?: string; unit_name?: string };
                                                const shortcut = uObj.unit_shortcut || uObj.unit_name || "";
                                                if (shortcut) return shortcut;
                                            } else if (typeof u === "string" || typeof u === "number") {
                                                if (u) return String(u);
                                            }
                                            if (typeof l.unit_shortcut === "string" && l.unit_shortcut) return l.unit_shortcut;
                                            if (typeof l.unit_name === "string" && l.unit_name) return l.unit_name;
                                        }
                                        if (g.items.length > 0) {
                                            const first = g.items[0];
                                            const u = first.unit_id;
                                            if (typeof u === "object" && u !== null) {
                                                const uObj = u as { unit_shortcut?: string; unit_name?: string };
                                                const shortcut = uObj.unit_shortcut || uObj.unit_name || "";
                                                if (shortcut) return shortcut;
                                            }
                                            const p = first.product_id;
                                            if (typeof p === "object" && p !== null) {
                                                const pObj = p as { unit_of_measurement?: { unit_shortcut?: string; unit_name?: string } };
                                                const shortcut = pObj.unit_of_measurement?.unit_shortcut || pObj.unit_of_measurement?.unit_name || "";
                                                if (shortcut) return shortcut;
                                            }
                                        }
                                        return "";
                                    };

                                    const lotUomName = getGroupLotUom(group) || "UOM";

                                    return (
                                        <div key={group.lotName} className="bg-card border rounded-xl shadow-xs overflow-hidden transition-all hover:shadow-md">
                                            {/* Lot Section Header */}
                                            <div className="p-4 border-b bg-muted/40 flex flex-wrap items-center justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 bg-primary/10 text-primary rounded-lg border border-primary/20">
                                                        <Layers className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h4 className="text-sm font-bold text-foreground">{group.lotName}</h4>
                                                            {lotUomName && lotUomName !== "UOM" && (
                                                                <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 tracking-wider">
                                                                    UOM: {lotUomName}
                                                                </span>
                                                            )}
                                                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-primary/15 text-primary">
                                                                {group.items.length} {group.items.length === 1 ? "item" : "items"}
                                                            </span>
                                                        </div>
                                                        <p className="text-[11px] text-muted-foreground mt-0.5">Manufacturing Storage Lot</p>
                                                    </div>
                                                </div>

                                                {/* Lot Summary Statistics & Per-Lot Add Action */}
                                                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                                                    <div className="px-2.5 py-1 bg-background border rounded-md flex items-center gap-1.5 font-mono">
                                                        <span className="text-muted-foreground text-[10px] uppercase font-semibold">System:</span>
                                                        <span className="font-bold">{formatQty(lotSysPcs)} pcs</span>
                                                        <span className="text-muted-foreground text-[10px] font-normal">({formatQty(lotSysUom)} {lotUomName.toLowerCase()})</span>
                                                    </div>
                                                    <div className="px-2.5 py-1 bg-background border rounded-md flex items-center gap-1.5 font-mono">
                                                        <span className="text-muted-foreground text-[10px] uppercase font-semibold">Physical:</span>
                                                        <span className="font-bold text-foreground">{formatQty(lotPhysPcs)} pcs</span>
                                                        <span className="text-muted-foreground text-[10px] font-normal">({formatQty(lotPhysUom)} {lotUomName.toLowerCase()})</span>
                                                    </div>
                                                    <div className={`px-2.5 py-1 border rounded-md flex items-center gap-1.5 font-mono font-bold ${lotVarStyle}`}>
                                                        <span className="text-[10px] uppercase font-semibold">Variance:</span>
                                                        <span>{lotVarPcs > 0 ? `+${formatQty(lotVarPcs)}` : formatQty(lotVarPcs)} pcs</span>
                                                        <span className="font-normal text-[10px]">({lotVarUom > 0 ? `+${formatQty(lotVarUom)}` : formatQty(lotVarUom)} {lotUomName.toLowerCase()})</span>
                                                    </div>
                                                    <div className="px-2.5 py-1 bg-background border rounded-md flex items-center gap-1.5 font-mono">
                                                        <span className="text-muted-foreground text-[10px] uppercase font-semibold">Diff Cost:</span>
                                                        <span className="font-bold">{formatMoney(lotDiffCost)}</span>
                                                    </div>
                                                    {isDraft && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const lId = typeof group.lotObj === "object" && group.lotObj !== null ? (group.lotObj as { lot_id?: number }).lot_id || 0 : Number(group.lotObj || 0);
                                                                onOpenAddDetailModal(lId > 0 ? lId : undefined);
                                                            }}
                                                            className="flex items-center gap-1.5 px-3 py-1 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 transition-colors shadow-xs ml-1"
                                                            title={`Add a new batch or product count to ${group.lotName}`}
                                                        >
                                                            <Plus className="h-3.5 w-3.5" />
                                                            Add Line Item
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Inner Line Items Table */}
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left text-xs">
                                                    <thead className="bg-muted/20 border-b font-semibold text-muted-foreground uppercase tracking-wider text-[11px]">
                                                        <tr>
                                                            <th className="px-3 py-2">Product Code</th>
                                                            <th className="px-3 py-2">Product Name</th>
                                                            <th className="px-3 py-2">Batch #</th>
                                                            <th className="px-3 py-2">Mfg / Expiry</th>
                                                            <th className="px-3 py-2">UOM</th>
                                                            <th className="px-3 py-2 text-right text-indigo-700 dark:text-indigo-300 font-bold">Total Pcs</th>
                                                            <th className="px-3 py-2">Condition</th>
                                                            <th className="px-3 py-2 text-right">System</th>
                                                            <th className="px-3 py-2 text-right">Physical</th>
                                                            <th className="px-3 py-2 text-right">Variance</th>
                                                            <th className="px-3 py-2 text-right">Unit Cost</th>
                                                            <th className="px-3 py-2 text-right">Diff Cost</th>
                                                            <th className="px-3 py-2">Remarks</th>
                                                            {isDraft && <th className="px-3 py-2 text-right">Actions</th>}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-border">
                                                        {group.items.map((d, index) => {
                                                            const dId = d.physical_inventory_detail_id || d.id || index;
                                                            const sys = d.system_count || 0;
                                                            const origPhys = d.physical_count;
                                                            const rawInput = countsMap[dId];
                                                            const hasInput = rawInput !== undefined && rawInput !== "";
                                                            const hasSavedCount = countsMap[dId] !== undefined ? countsMap[dId] !== "" : (origPhys !== null && origPhys !== undefined);
                                                            const phys = hasInput ? Number(rawInput) : (hasSavedCount ? Number(origPhys || 0) : 0);
                                                            const varQty = (hasInput || hasSavedCount) ? phys - sys : 0 - sys;
                                                            const unitCost = d.unit_cost || 0;
                                                            const diffCost = varQty * unitCost;

                                                            const varStyle =
                                                                varQty > 0
                                                                    ? "text-emerald-600 dark:text-emerald-400 font-bold"
                                                                    : varQty < 0
                                                                        ? "text-rose-600 dark:text-rose-400 font-bold"
                                                                        : "text-muted-foreground";

                                                            return (
                                                                <tr key={dId} className="hover:bg-muted/30 transition-colors">
                                                                    <td className="px-3 py-2.5 font-mono font-semibold">{getProductCode(d.product_id)}</td>
                                                                    <td className="px-3 py-2.5 font-medium max-w-xs truncate">{getProductName(d.product_id)}</td>
                                                                    <td className="px-3 py-2.5 font-mono text-primary font-semibold">{d.batch_no || "N/A"}</td>
                                                                    <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                                                                        <div>Mfg: {d.manufacturing_date || "—"}</div>
                                                                        <div>Exp: {d.expiration_date || "—"}</div>
                                                                    </td>
                                                                    <td className="px-3 py-2.5 font-semibold text-muted-foreground">{getUnitShortcut(d.unit_id, d.product_id)}</td>
                                                                    <td className="px-3 py-2.5 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                                                        {(() => {
                                                                            const prodObj = typeof d.product_id === "object" && d.product_id !== null ? (d.product_id as unknown as Record<string, unknown>) : null;
                                                                            const uomCountRaw = prodObj ? Number(prodObj.unit_of_measurement_count || 0) : 0;
                                                                            const uomCount = uomCountRaw > 0 ? uomCountRaw : 1;
                                                                            const sysItemPcs = sys * uomCount;
                                                                            const physItemPcs = phys * uomCount;
                                                                            return (
                                                                                <div>
                                                                                    <div>{sysItemPcs.toLocaleString()} pcs</div>
                                                                                    {physItemPcs > 0 && physItemPcs !== sysItemPcs ? (
                                                                                        <div className="text-[10px] text-muted-foreground font-normal">
                                                                                            Counted: {physItemPcs.toLocaleString()} pcs
                                                                                        </div>
                                                                                    ) : null}
                                                                                </div>
                                                                            );
                                                                        })()}
                                                                    </td>
                                                                    <td className="px-3 py-2.5">
                                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border">
                                                                            {d.inventory_condition}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-3 py-2.5 text-right font-mono">{formatQty(sys)}</td>
                                                                    <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">
                                                                        {isDraft ? (
                                                                            <div className="inline-flex items-center justify-end">
                                                                                <input
                                                                                    type="number"
                                                                                    min="0"
                                                                                    step="1"
                                                                                    value={rawInput !== undefined ? rawInput : (hasSavedCount ? String(Math.round(Number(origPhys))) : "")}
                                                                                    onChange={(e) => {
                                                                                        const val = e.target.value;
                                                                                        setCountsMap((prev) => ({ ...prev, [dId]: val }));
                                                                                    }}
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === "Enter") {
                                                                                            (e.target as HTMLInputElement).blur();
                                                                                        }
                                                                                    }}
                                                                                    className="w-24 px-2 py-1 text-right font-mono font-bold text-xs bg-background border border-primary/40 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20 shadow-xs"
                                                                                    placeholder=""
                                                                                />
                                                                            </div>
                                                                        ) : (
                                                                            hasInput || hasSavedCount ? formatQty(phys) : "—"
                                                                        )}
                                                                    </td>
                                                                    <td className={`px-3 py-2.5 text-right font-mono ${varStyle}`}>
                                                                        {varQty > 0 ? `+${formatQty(varQty)}` : formatQty(varQty)}
                                                                    </td>
                                                                    <td className="px-3 py-2.5 text-right font-mono">{formatMoney(unitCost)}</td>
                                                                    <td className="px-3 py-2.5 text-right font-mono font-semibold">{formatMoney(diffCost)}</td>
                                                                    <td className="px-3 py-2.5 min-w-[180px] max-w-xs">
                                                                        {isDraft ? (
                                                                            <div className="space-y-0.5">
                                                                                <input
                                                                                    type="text"
                                                                                    value={remarksMap[dId] !== undefined ? remarksMap[dId] : (d.remarks || "")}
                                                                                    onChange={(e) => {
                                                                                        const val = e.target.value;
                                                                                        setRemarksMap((prev) => ({ ...prev, [dId]: val }));
                                                                                    }}
                                                                                    onKeyDown={(e) => {
                                                                                        if (e.key === "Enter") {
                                                                                            (e.target as HTMLInputElement).blur();
                                                                                        }
                                                                                    }}
                                                                                    placeholder={Math.abs(varQty) > 0.0001 ? "Reason required *" : "Remarks..."}
                                                                                    className={`w-full px-2 py-1 text-xs bg-background border rounded-lg focus:outline-hidden focus:ring-2 ${Math.abs(varQty) > 0.0001 && !d.remarks?.trim()
                                                                                        ? "border-rose-400 focus:ring-rose-400 bg-rose-50/50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 placeholder:text-rose-400 font-medium"
                                                                                        : "border-input focus:ring-primary/20"
                                                                                        }`}
                                                                                />
                                                                                {Math.abs(varQty) > 0.0001 && !d.remarks?.trim() && (
                                                                                    <p className="text-[10px] font-semibold text-rose-600">Variance reason required</p>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            <span className="truncate text-muted-foreground">{d.remarks || "—"}</span>
                                                                        )}
                                                                    </td>
                                                                    {isDraft && (
                                                                        <td className="px-3 py-2.5 text-right">
                                                                            {sys <= 0 && (!d.remarks || !String(d.remarks).toLowerCase().includes("auto-populated")) ? (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => onRemoveDetail(d)}
                                                                                    className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded transition-colors"
                                                                                    title="Remove Detail"
                                                                                >
                                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                                </button>
                                                                            ) : (
                                                                                <button
                                                                                    type="button"
                                                                                    disabled
                                                                                    className="p-1 text-muted-foreground/30 cursor-not-allowed rounded"
                                                                                    title="Deletion restricted for system stock line items"
                                                                                >
                                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                                </button>
                                                                            )}
                                                                        </td>
                                                                    )}
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            /* FLAT TABLE VIEW */
                            <div className="bg-card border rounded-xl shadow-xs overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-muted/50 border-b font-semibold text-muted-foreground uppercase tracking-wider">
                                            <tr>
                                                <th className="px-3 py-2.5">Lot</th>
                                                <th className="px-3 py-2.5">Product Code</th>
                                                <th className="px-3 py-2.5">Product Name</th>
                                                <th className="px-3 py-2.5">Batch #</th>
                                                <th className="px-3 py-2.5">Mfg / Expiry</th>
                                                <th className="px-3 py-2.5">UOM</th>
                                                <th className="px-3 py-2.5 text-right text-indigo-700 dark:text-indigo-300 font-bold">Total Pcs</th>
                                                <th className="px-3 py-2.5">Condition</th>
                                                <th className="px-3 py-2.5 text-right">System</th>
                                                <th className="px-3 py-2.5 text-right">Physical</th>
                                                <th className="px-3 py-2.5 text-right">Variance</th>
                                                <th className="px-3 py-2.5 text-right">Unit Cost</th>
                                                <th className="px-3 py-2.5 text-right">Diff Cost</th>
                                                <th className="px-3 py-2.5">Remarks</th>
                                                {isDraft && <th className="px-3 py-2.5 text-right">Actions</th>}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                            {details.map((d, index) => {
                                                const dId = d.physical_inventory_detail_id || d.id || index;
                                                const sys = d.system_count || 0;
                                                const origPhys = d.physical_count;
                                                const rawInput = countsMap[dId];
                                                const hasInput = rawInput !== undefined && rawInput !== "";
                                                const hasSavedCount = countsMap[dId] !== undefined ? countsMap[dId] !== "" : (origPhys !== null && origPhys !== undefined && Number(origPhys) > 0);
                                                const phys = hasInput ? Number(rawInput) : (hasSavedCount ? Number(origPhys || 0) : 0);
                                                const varQty = (hasInput || hasSavedCount) ? phys - sys : 0 - sys;
                                                const unitCost = d.unit_cost || 0;
                                                const diffCost = varQty * unitCost;

                                                const varStyle =
                                                    varQty > 0
                                                        ? "text-emerald-600 dark:text-emerald-400 font-bold"
                                                        : varQty < 0
                                                            ? "text-rose-600 dark:text-rose-400 font-bold"
                                                            : "text-muted-foreground";

                                                return (
                                                    <tr key={dId} className="hover:bg-muted/30 transition-colors">
                                                        <td className="px-3 py-2.5 font-medium">{getLotName(d.lot_id)}</td>
                                                        <td className="px-3 py-2.5 font-mono font-semibold">{getProductCode(d.product_id)}</td>
                                                        <td className="px-3 py-2.5 font-medium max-w-xs truncate">{getProductName(d.product_id)}</td>
                                                        <td className="px-3 py-2.5 font-mono text-primary font-semibold">{d.batch_no || "N/A"}</td>
                                                        <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                                                            <div>Mfg: {d.manufacturing_date || "—"}</div>
                                                            <div>Exp: {d.expiration_date || "—"}</div>
                                                        </td>
                                                        <td className="px-3 py-2.5 font-semibold text-muted-foreground">{getUnitShortcut(d.unit_id, d.product_id)}</td>
                                                        <td className="px-3 py-2.5 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                                            {(() => {
                                                                const prodObj = typeof d.product_id === "object" && d.product_id !== null ? (d.product_id as unknown as Record<string, unknown>) : null;
                                                                const uomCountRaw = prodObj ? Number(prodObj.unit_of_measurement_count || 0) : 0;
                                                                const uomCount = uomCountRaw > 0 ? uomCountRaw : 1;
                                                                const sysItemPcs = sys * uomCount;
                                                                const physItemPcs = phys * uomCount;
                                                                return (
                                                                    <div>
                                                                        <div>{sysItemPcs.toLocaleString()} pcs</div>
                                                                        {physItemPcs > 0 && physItemPcs !== sysItemPcs ? (
                                                                            <div className="text-[10px] text-muted-foreground font-normal">
                                                                                Counted: {physItemPcs.toLocaleString()} pcs
                                                                            </div>
                                                                        ) : null}
                                                                    </div>
                                                                );
                                                            })()}
                                                        </td>
                                                        <td className="px-3 py-2.5">
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border">
                                                                {d.inventory_condition}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-mono">{formatQty(sys)}</td>
                                                        <td className="px-3 py-2.5 text-right font-mono font-bold text-foreground">
                                                            {isDraft ? (
                                                                <div className="inline-flex items-center justify-end">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        step="1"
                                                                        value={rawInput !== undefined ? rawInput : (hasSavedCount ? String(Math.round(Number(origPhys))) : "")}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setCountsMap((prev) => ({ ...prev, [dId]: val }));
                                                                        }}
                                                                        onBlur={async () => {
                                                                            const valStr = countsMap[dId];
                                                                            if (valStr !== undefined) {
                                                                                const num = valStr.trim() === "" ? 0 : Math.round(Number(valStr));
                                                                                if (!isNaN(num) && num >= 0 && onSaveInlineCount) {
                                                                                    await onSaveInlineCount(d, num);
                                                                                }
                                                                            }
                                                                        }}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === "Enter") {
                                                                                (e.target as HTMLInputElement).blur();
                                                                            }
                                                                        }}
                                                                        className="w-24 px-2 py-1 text-right font-mono font-bold text-xs bg-background border border-primary/40 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-primary/20 shadow-xs"
                                                                        placeholder=""
                                                                    />
                                                                </div>
                                                            ) : (
                                                                hasInput || hasSavedCount ? formatQty(phys) : "—"
                                                            )}
                                                        </td>
                                                        <td className={`px-3 py-2.5 text-right font-mono ${varStyle}`}>
                                                            {varQty > 0 ? `+${formatQty(varQty)}` : formatQty(varQty)}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-mono">{formatMoney(unitCost)}</td>
                                                        <td className="px-3 py-2.5 text-right font-mono font-semibold">{formatMoney(diffCost)}</td>
                                                        <td className="px-3 py-2.5 min-w-[180px] max-w-xs">
                                                            {isDraft ? (
                                                                <div className="space-y-0.5">
                                                                    <input
                                                                        type="text"
                                                                        value={remarksMap[dId] !== undefined ? remarksMap[dId] : (d.remarks || "")}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setRemarksMap((prev) => ({ ...prev, [dId]: val }));
                                                                        }}
                                                                        onBlur={async () => {
                                                                            const rVal = remarksMap[dId];
                                                                            if (rVal !== undefined && onSaveInlineRemark) {
                                                                                await onSaveInlineRemark(d, rVal);
                                                                            }
                                                                        }}
                                                                        onKeyDown={(e) => {
                                                                            if (e.key === "Enter") {
                                                                                (e.target as HTMLInputElement).blur();
                                                                            }
                                                                        }}
                                                                        placeholder={Math.abs(varQty) > 0.0001 ? "Reason required *" : "Remarks..."}
                                                                        className={`w-full px-2 py-1 text-xs bg-background border rounded-lg focus:outline-hidden focus:ring-2 ${Math.abs(varQty) > 0.0001 && !d.remarks?.trim()
                                                                            ? "border-rose-400 focus:ring-rose-400 bg-rose-50/50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 placeholder:text-rose-400 font-medium"
                                                                            : "border-input focus:ring-primary/20"
                                                                            }`}
                                                                    />
                                                                    {Math.abs(varQty) > 0.0001 && !d.remarks?.trim() && (
                                                                        <p className="text-[10px] font-semibold text-rose-600">Variance reason required</p>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <span className="truncate text-muted-foreground">{d.remarks || "—"}</span>
                                                            )}
                                                        </td>
                                                        {isDraft && (
                                                            <td className="px-3 py-2.5 text-right">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => onRemoveDetail(d)}
                                                                    className="p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded transition-colors"
                                                                    title="Remove Detail"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </button>
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
