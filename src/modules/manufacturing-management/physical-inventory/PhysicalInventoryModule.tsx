"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
    ClipboardCheck,
    Layers,
    TrendingUp,
    TrendingDown,
    AlertCircle,
    Plus,
    ShieldCheck,
    Loader2
} from "lucide-react";
import { toast } from "sonner";
import { PhysicalCountSheet, Branch, StorageLotDetails, RecipeVersionDetails, ProductDetails } from "./types";
import { formatCurrency } from "./utils";
import CountSheetsList from "./components/CountSheetsList";
import NewCountSheetModal from "./components/NewCountSheetModal";
import CountSheetEditor from "./components/CountSheetEditor";
import CommitConfirmationModal from "./components/CommitConfirmationModal";
import {
    fetchCountSheets,
    fetchCountSheetById,
    createCountSheet,
    updateCountSheetDraft,
    commitCountSheet,
    cancelCountSheet,
    fetchBranches
} from "./services/physical-inventory-api";

interface RawLineItem {
    id: string | number;
    date_encoded?: string;
    product_id?: string | number | ProductDetails | null;
    version_id?: string | number | RecipeVersionDetails | null;
    lot_id?: string | number | StorageLotDetails | null;
    batch_no?: string | null;
    uom?: string;
    unit_price?: number | string;
    system_count?: number | string;
    physical_count?: number | string | null;
    offset_match?: number | string | null;
}

interface RawCountSheet {
    id: string | number;
    ph_no?: string;
    sheet_no?: string;
    date_encoded?: string;
    starting_date?: string;
    cutOff_date?: string;
    cutoff_date?: string;
    price_type?: string;
    stock_type?: string;
    branch_id: string | number | Branch;
    remarks?: string;
    notes?: string;
    isComitted?: boolean | number | { data?: number[] } | unknown;
    is_committed?: boolean | number | { data?: number[] } | unknown;
    committed_at?: string | null;
    committed_by?: string | number | null;
    isCancelled?: boolean | number | { data?: number[] } | unknown;
    is_cancelled?: boolean | number | { data?: number[] } | unknown;
    cancelled_at?: string | null;
    total_amount?: number | string;
    supplier_id?: number | string;
    category_id?: number | string;
    encoder_id?: number | string;
    encoded_by?: number | string;
    available_lots?: StorageLotDetails[];
    available_versions?: RecipeVersionDetails[];
    details?: RawLineItem[];
    line_items?: RawLineItem[];
}

function parseBufferOrBool(val: unknown): boolean {
    if (val === true || val === 1 || val === "1") return true;
    if (val === false || val === 0 || val === "0" || val === null || val === undefined) return false;
    if (typeof val === "object" && val !== null) {
        const obj = val as { data?: unknown };
        if (Array.isArray(obj.data) && obj.data.length > 0) {
            return Number(obj.data[0]) === 1;
        }
        if (typeof obj.data === "number") {
            return obj.data === 1;
        }
    }
    return false;
}

export default function PhysicalInventoryModule() {
    const [countSheets, setCountSheets] = useState<PhysicalCountSheet[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [activeTab, setActiveTab] = useState<"sheets" | "editor" | "history">("sheets");
    const [activeSheetId, setActiveSheetId] = useState<string | null>(null);
    const [activeSheet, setActiveSheet] = useState<PhysicalCountSheet | null>(null);
    const [availableLots, setAvailableLots] = useState<StorageLotDetails[]>([]);
    const [availableVersions, setAvailableVersions] = useState<RecipeVersionDetails[]>([]);
    const [isSheetLoading, setIsSheetLoading] = useState<boolean>(false);
    const [branches, setBranches] = useState<Branch[]>([]);

    // Modal states
    const [isNewModalOpen, setIsNewModalOpen] = useState(false);
    const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
    const [sheetToCommit, setSheetToCommit] = useState<PhysicalCountSheet | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch initial sheets & branches
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [sheetsData, branchesData] = await Promise.all([
                fetchCountSheets(),
                fetchBranches()
            ]);

            setBranches(branchesData || []);

            // Map API response to PhysicalCountSheet format
            const mappedSheets: PhysicalCountSheet[] = (sheetsData || []).map((s: RawCountSheet) => {
                const isCommitted = parseBufferOrBool(s.isComitted) || parseBufferOrBool(s.is_committed);
                const isCancelled = parseBufferOrBool(s.isCancelled) || parseBufferOrBool(s.is_cancelled);

                const branchIdVal = typeof s.branch_id === "object" ? (s.branch_id?.id || s.branch_id?.branch_id) : s.branch_id;
                const foundBranch = (branchesData || []).find((b: Branch) => String(b.id || b.branch_id) === String(branchIdVal));

                const branchName = typeof s.branch_id === "object"
                    ? (s.branch_id?.branchName || s.branch_id?.branch_name || s.branch_id?.name)
                    : (foundBranch?.branchName || foundBranch?.branch_name || foundBranch?.name || `Facility #${branchIdVal}`);

                return {
                    id: String(s.id),
                    ph_no: s.ph_no || `PI-${s.id}`,
                    date_encoded: s.date_encoded || new Date().toISOString(),
                    starting_date: s.starting_date || s.date_encoded || new Date().toISOString(),
                    cutOff_date: s.cutOff_date || s.cutoff_date || new Date().toISOString(),
                    price_type: s.price_type || "Selling Price",
                    stock_type: s.stock_type || "Finished Goods",
                    branch_id: Number(branchIdVal || 1),
                    branch_name: branchName,
                    remarks: s.remarks || "",
                    isComitted: isCommitted,
                    committed_at: s.committed_at || null,
                    committed_by: s.committed_by || null,
                    isCancelled: isCancelled,
                    cancelled_at: s.cancelled_at || null,
                    total_amount: Number(s.total_amount || 0),
                    supplier_id: Number(s.supplier_id || 0),
                    category_id: Number(s.category_id || 0),
                    encoder_id: Number(s.encoder_id || s.encoded_by || 1),
                    encoder_name: "System Auditor",
                    line_items: []
                };
            });

            setCountSheets(mappedSheets);
        } catch (err) {
            console.error("Error loading physical inventory count sheets:", err);
            toast.error("Failed to load physical inventory sheets from database.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Fetch details for active selected sheet
    const loadSheetDetails = useCallback(async (sheetId: string) => {
        setIsSheetLoading(true);
        try {
            const rawSheet = await fetchCountSheetById(sheetId);
            if (!rawSheet) return;

            setAvailableLots(rawSheet.available_lots || []);
            setAvailableVersions(rawSheet.available_versions || []);

            const isCommitted = parseBufferOrBool(rawSheet.isComitted) || parseBufferOrBool(rawSheet.is_committed);
            const isCancelled = parseBufferOrBool(rawSheet.isCancelled) || parseBufferOrBool(rawSheet.is_cancelled);

            const branchIdVal = typeof rawSheet.branch_id === "object" ? (rawSheet.branch_id?.id || rawSheet.branch_id?.branch_id) : rawSheet.branch_id;
            const foundBranch = branches.find((b: Branch) => String(b.id || b.branch_id) === String(branchIdVal));

            const branchName = typeof rawSheet.branch_id === "object"
                ? (rawSheet.branch_id?.branchName || rawSheet.branch_id?.branch_name || rawSheet.branch_id?.name)
                : (foundBranch?.branchName || foundBranch?.branch_name || foundBranch?.name || `Facility #${branchIdVal}`);

            const lineItems = (rawSheet.details || rawSheet.line_items || []).map((d: RawLineItem) => {
                const sysCount = Number(d.system_count || 0);
                const physCount = d.physical_count !== null && d.physical_count !== undefined ? Number(d.physical_count) : null;
                const unitPrice = Number(d.unit_price || 0);
                const variance = physCount !== null ? physCount - sysCount : 0;
                const diffCost = variance * unitPrice;

                return {
                    id: String(d.id),
                    ph_id: String(rawSheet.id),
                    date_encoded: d.date_encoded || new Date().toISOString(),
                    product_id: d.product_id,
                    product_code: typeof d.product_id === "object" ? (d.product_id?.product_code || d.product_id?.code) : `SKU-${d.product_id}`,
                    product_name: typeof d.product_id === "object" ? (d.product_id?.product_name || d.product_id?.name) : `Product #${d.product_id}`,
                    version_id: d.version_id,
                    lot_id: d.lot_id,
                    batch_no: d.batch_no || undefined,
                    uom: typeof d.product_id === "object" ? (d.product_id?.unit_of_measurement?.unit_shortcut || d.uom || "PCS") : (d.uom || "PCS"),
                    unit_price: unitPrice,
                    system_count: sysCount,
                    physical_count: physCount,
                    variance: variance,
                    difference_cost: diffCost,
                    amount: (physCount !== null ? physCount : sysCount) * unitPrice,
                    offset_match: d.offset_match ? Number(d.offset_match) : null
                };
            });

            const fullSheet: PhysicalCountSheet = {
                id: String(rawSheet.id),
                ph_no: rawSheet.ph_no || `PI-${rawSheet.id}`,
                date_encoded: rawSheet.date_encoded || new Date().toISOString(),
                starting_date: rawSheet.starting_date || rawSheet.date_encoded || new Date().toISOString(),
                cutOff_date: rawSheet.cutOff_date || rawSheet.cutoff_date || new Date().toISOString(),
                price_type: rawSheet.price_type || "Selling Price",
                stock_type: rawSheet.stock_type || "Finished Goods",
                branch_id: Number(branchIdVal || 1),
                branch_name: branchName,
                remarks: rawSheet.remarks || "",
                isComitted: isCommitted,
                committed_at: rawSheet.committed_at || null,
                committed_by: rawSheet.committed_by || null,
                isCancelled: isCancelled,
                cancelled_at: rawSheet.cancelled_at || null,
                total_amount: Number(rawSheet.total_amount || 0),
                supplier_id: Number(rawSheet.supplier_id || 0),
                category_id: Number(rawSheet.category_id || 0),
                encoder_id: Number(rawSheet.encoder_id || rawSheet.encoded_by || 1),
                encoder_name: "System Auditor",
                line_items: lineItems
            };

            setActiveSheet(fullSheet);
        } catch (err) {
            console.error("Error loading count sheet details:", err);
            toast.error("Failed to load details for this count sheet.");
        } finally {
            setIsSheetLoading(false);
        }
    }, [branches]);

    useEffect(() => {
        if (activeSheetId) {
            loadSheetDetails(activeSheetId);
        }
    }, [activeSheetId, loadSheetDetails]);

    // KPI Metrics calculation
    const kpiMetrics = useMemo(() => {
        const totalSheetsCount = countSheets.length;
        const draftSheetsCount = countSheets.filter(s => !s.isComitted && !s.isCancelled).length;
        const committedSheetsCount = countSheets.filter(s => s.isComitted).length;

        let totalNetReconciledCost = 0;
        countSheets.forEach(s => {
            if (s.isComitted) {
                totalNetReconciledCost += s.total_amount;
            }
        });

        return {
            totalSheetsCount,
            draftSheetsCount,
            committedSheetsCount,
            totalNetReconciledCost
        };
    }, [countSheets]);

    // Handlers
    const handleCreateSheetSubmit = async (payload: { branch_id: number; cutoff_date: string; remarks?: string }) => {
        setIsSubmitting(true);
        try {
            const created = await createCountSheet(payload);
            toast.success(`Physical inventory sheet #${created.ph_no || created.id} created with real stock snapshot!`);
            setIsNewModalOpen(false);
            await loadData();
            if (created.id) {
                setActiveSheetId(String(created.id));
                setActiveTab("editor");
            }
        } catch (err) {
            const error = err as Error;
            toast.error(error.message || "Failed to create count sheet.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSaveSheet = async (updatedSheet: PhysicalCountSheet) => {
        setIsSubmitting(true);
        try {
            const itemsPayload = updatedSheet.line_items.map(item => ({
                id: item.id,
                physical_count: item.physical_count,
                lot_id: typeof item.lot_id === "object" ? (item.lot_id?.lot_id || item.lot_id?.id) : item.lot_id,
                version_id: typeof item.version_id === "object" ? (item.version_id?.version_id || item.version_id?.id) : item.version_id,
                batch_no: item.batch_no,
                product_id: typeof item.product_id === "object" ? (item.product_id?.product_id || item.product_id?.id) : item.product_id,
                unit_price: item.unit_price,
                system_count: item.system_count,
            }));

            await updateCountSheetDraft(updatedSheet.id, itemsPayload, updatedSheet.remarks);
            toast.success("Draft counts, storage locations, and recipe versions saved successfully.");
            await loadSheetDetails(updatedSheet.id);
        } catch (err) {
            const error = err as Error;
            toast.error(error.message || "Failed to save draft counts.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleProceedToCommit = (updatedSheet: PhysicalCountSheet) => {
        setSheetToCommit(updatedSheet);
        setIsCommitModalOpen(true);
    };

    const handleConfirmCommit = async (sheetId: string) => {
        setIsSubmitting(true);
        try {
            await commitCountSheet(sheetId);
            toast.success("Count sheet committed and posted to inventory_movements ledger!");
            setIsCommitModalOpen(false);
            await loadData();
            setActiveTab("sheets");
        } catch (err) {
            const error = err as Error;
            toast.error(error.message || "Failed to commit count sheet to ledger.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancelSheet = async (sheetId: string) => {
        try {
            await cancelCountSheet(sheetId);
            toast.info("Count sheet cancelled.");
            await loadData();
            if (activeSheetId === sheetId) {
                setActiveTab("sheets");
            }
        } catch (err) {
            const error = err as Error;
            toast.error(error.message || "Failed to cancel count sheet.");
        }
    };

    const handleSelectSheetToEdit = (sheet: PhysicalCountSheet) => {
        setActiveSheetId(sheet.id);
        setActiveTab("editor");
    };

    const handleOpenCommitModalFromList = (sheet: PhysicalCountSheet) => {
        setSheetToCommit(sheet);
        setIsCommitModalOpen(true);
    };

    return (
        <div className="space-y-6">
            {/* KPI Cards Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Total Count Sheets */}
                <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between shadow-xs">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Total Audits</span>
                        <h4 className="text-xl font-black text-foreground mt-1">{kpiMetrics.totalSheetsCount} Sheets</h4>
                        <span className="text-[9px] text-muted-foreground block mt-0.5">Physical count records</span>
                    </div>
                    <div className="bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 text-amber-500">
                        <ClipboardCheck className="h-5 w-5" />
                    </div>
                </div>

                {/* Draft Sheets */}
                <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between shadow-xs">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Draft Sheets</span>
                        <h4 className="text-xl font-black text-foreground mt-1">{kpiMetrics.draftSheetsCount} Drafts</h4>
                        <span className="text-[9px] text-muted-foreground block mt-0.5">Awaiting count completion</span>
                    </div>
                    <div className="bg-primary/10 p-3 rounded-xl border border-primary/20 text-primary">
                        <Layers className="h-5 w-5" />
                    </div>
                </div>

                {/* Committed Audits */}
                <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between shadow-xs">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Committed Audits</span>
                        <h4 className="text-xl font-black text-foreground mt-1">{kpiMetrics.committedSheetsCount} Finalized</h4>
                        <span className="text-[9px] text-muted-foreground block mt-0.5">Posted to ledger</span>
                    </div>
                    <div className="bg-blue-500/10 p-3 rounded-xl border border-blue-500/20 text-blue-500">
                        <ShieldCheck className="h-5 w-5" />
                    </div>
                </div>

                {/* Net Reconciled Cost */}
                <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between shadow-xs">
                    <div>
                        <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Net Reconciled Cost</span>
                        <h4 className={`text-xl font-black mt-1 ${kpiMetrics.totalNetReconciledCost >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                            {formatCurrency(kpiMetrics.totalNetReconciledCost)}
                        </h4>
                        <span className="text-[9px] text-muted-foreground block mt-0.5">Committed ledger variance</span>
                    </div>
                    <div className={`p-3 rounded-xl border ${kpiMetrics.totalNetReconciledCost >= 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" : "bg-rose-500/10 border-rose-500/20 text-rose-500"}`}>
                        {kpiMetrics.totalNetReconciledCost >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                    </div>
                </div>
            </div>

            {/* Sub-Header Bar & Actions */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-end gap-4 bg-card border border-border p-3.5 rounded-2xl">

                {/* Primary Action Button */}
                <button
                    onClick={() => setIsNewModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-xl shadow-sm transition-all hover:scale-[1.01]"
                >
                    <Plus className="h-4 w-4" />
                    New Count Sheet
                </button>
            </div>

            {/* Main Content Render */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 bg-card border border-border rounded-2xl">
                    <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
                    <p className="text-sm font-semibold text-muted-foreground">Loading physical inventory sheets from database...</p>
                </div>
            ) : (
                <>
                    {activeTab === "sheets" && (
                        <CountSheetsList
                            countSheets={countSheets}
                            branches={branches}
                            onSelectSheet={handleSelectSheetToEdit}
                            onCommitSheet={handleOpenCommitModalFromList}
                            onCancelSheet={handleCancelSheet}
                            onCreateNew={() => setIsNewModalOpen(true)}
                        />
                    )}

                    {activeTab === "editor" && (
                        isSheetLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 bg-card border border-border rounded-2xl">
                                <Loader2 className="h-8 w-8 text-primary animate-spin mb-2" />
                                <p className="text-sm font-semibold text-muted-foreground">Loading count sheet details...</p>
                            </div>
                        ) : activeSheet ? (
                            <CountSheetEditor
                                countSheet={activeSheet}
                                availableLots={availableLots}
                                availableVersions={availableVersions}
                                onSaveDraft={handleSaveSheet}
                                onProceedToCommit={handleProceedToCommit}
                                onBackToList={() => setActiveTab("sheets")}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16 bg-card border border-border rounded-2xl text-center p-6">
                                <AlertCircle className="h-10 w-10 text-muted-foreground mb-3" />
                                <h3 className="text-base font-bold text-foreground">No Count Sheet Selected</h3>
                                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                                    Please select an existing count sheet from the list or create a new count sheet to begin auditing.
                                </p>
                                <button
                                    onClick={() => setActiveTab("sheets")}
                                    className="mt-4 px-4 py-2 bg-secondary hover:bg-secondary/80 text-foreground font-semibold text-xs rounded-xl transition-all"
                                >
                                    Go to Count Sheets List
                                </button>
                            </div>
                        )
                    )}

                    {activeTab === "history" && (
                        <CountSheetsList
                            countSheets={countSheets.filter(s => s.isComitted)}
                            branches={branches}
                            onSelectSheet={handleSelectSheetToEdit}
                            onCommitSheet={handleOpenCommitModalFromList}
                            onCancelSheet={handleCancelSheet}
                            onCreateNew={() => setIsNewModalOpen(true)}
                        />
                    )}
                </>
            )}

            {/* New Count Sheet Modal */}
            <NewCountSheetModal
                isOpen={isNewModalOpen}
                onClose={() => setIsNewModalOpen(false)}
                onSubmit={handleCreateSheetSubmit}
                branches={branches}
                isSubmitting={isSubmitting}
            />

            {/* Commit Confirmation Modal */}
            {sheetToCommit && (
                <CommitConfirmationModal
                    isOpen={isCommitModalOpen}
                    onClose={() => setIsCommitModalOpen(false)}
                    onConfirm={handleConfirmCommit}
                    countSheet={sheetToCommit}
                    isSubmitting={isSubmitting}
                />
            )}
        </div>
    );
}
