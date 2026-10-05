"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Send,
  Save,
  ArrowRight,
  AlertCircle,
  Eye,
  Calendar,
  Layers,
  ArrowLeft,
  Building2,
  CheckCircle2,
  Boxes,
  Sparkles,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { TransferStatusBadge } from "./components/TransferStatusBadge";
import { SearchableSelect, type Option } from "./components/SearchableSelect";
import { RowQuantityInput } from "./components/RowQuantityInput";
import { LotBatchSelectionModal } from "./components/LotBatchSelectionModal";
import { lotTransferService } from "./services/lot-transfer.service";
import {
  fetchBranches,
  fetchLotsByBranch,
  fetchLotTransferBatchStats,
  type MMLot,
  type LotTransferLotStats,
} from "./services/lot-tracking.service";
import type { BranchOption, LotTransfer, LotTransferFormLine, LotTransferFormValues, LotTransferStatus, ProductTypeOption } from "./types";

interface LotTransferRequestModuleProps {
  userBranchId?: number | null;
  transferId?: number;
  initialCreating?: boolean;
  backHref?: string;
}

export const LotTransferRequestModule: React.FC<LotTransferRequestModuleProps> = ({
  userBranchId,
  transferId,
  initialCreating = false,
}) => {
  // View state: 'list' | 'create' | 'view'
  const [viewState, setViewState] = useState<"list" | "create" | "view">(
    initialCreating ? "create" : transferId ? "view" : "list"
  );

  // Active branches state (only isActive === true)
  const [activeBranches, setActiveBranches] = useState<BranchOption[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);

  // Selected branch for filtering (List view)
  const [filterBranchId, setFilterBranchId] = useState<number | null>(
    userBranchId || null
  );

  // Form State: First input is selected branch (starts empty, no auto-fill)!
  const [formBranchId, setFormBranchId] = useState<number | null>(null);

  // Product Types state (Step 1)
  const [productTypes, setProductTypes] = useState<ProductTypeOption[]>([]);
  const [loadingProductTypes, setLoadingProductTypes] = useState(false);
  const [formProductTypeId, setFormProductTypeId] = useState<number | null>(null);

  // Listing state
  const [transfers, setTransfers] = useState<LotTransfer[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Lots available for the selected branch in form
  const [lots, setLots] = useState<MMLot[]>([]);
  const [lotBatchStats, setLotBatchStats] = useState<
    Record<number, LotTransferLotStats>
  >({});
  const [loadingLots, setLoadingLots] = useState(false);

  // Form Fields
  const [sourceLotId, setSourceLotId] = useState<number | null>(null);
  const [targetLotId, setTargetLotId] = useState<number | null>(null);
  const [transferDate, setTransferDate] = useState<string>(
    new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Manila" })
  );
  const [reason, setReason] = useState<string>("");
  const [lines, setLines] = useState<LotTransferFormLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submittingAction, setSubmittingAction] = useState<"draft" | "submit" | null>(null);
  const [submittingDraftId, setSubmittingDraftId] = useState<number | null>(null);

  // Modal for adding batch
  const [batchModalOpen, setBatchModalOpen] = useState(false);

  // Selected transfer for view details
  const [activeTransfer, setActiveTransfer] = useState<LotTransfer | null>(null);

  // 1. Load active branches (strictly isActive === true)
  const loadBranches = useCallback(async () => {
    setLoadingBranches(true);
    try {
      const data = await fetchBranches();
      setActiveBranches(data);
      // Maintain user's explicit selection if valid, but do NOT auto-fill formBranchId initially
      if (data.length > 0) {
        setFormBranchId((prev) => {
          if (prev && data.some((b) => b.id === prev)) return prev;
          return null;
        });
        setFilterBranchId((prev) => {
          if (prev && data.some((b) => b.id === prev)) return prev;
          if (userBranchId && data.some((b) => b.id === userBranchId)) return userBranchId;
          return null; // All branches
        });
      }
    } catch {
      toast.error("Failed to load active branches");
    } finally {
      setLoadingBranches(false);
    }
  }, [userBranchId]);

  // 2. Load lots specifically for the active form branch with authoritative batch stats
  const loadLotsForBranch = useCallback(async (bId: number | null, pTypeId?: number | null) => {
    if (!bId) {
      setLots([]);
      setLotBatchStats({});
      return;
    }
    setLoadingLots(true);
    try {
      const [lotsData, stats] = await Promise.all([
        fetchLotsByBranch(bId),
        fetchLotTransferBatchStats(bId, pTypeId).catch(() => ({})),
      ]);
      setLots(lotsData);
      setLotBatchStats(stats);
    } catch {
      toast.error("Failed to load lots for selected branch");
      setLots([]);
      setLotBatchStats({});
    } finally {
      setLoadingLots(false);
    }
  }, []);

  // 3. Load product types (Step 1)
  const loadProductTypes = useCallback(async () => {
    setLoadingProductTypes(true);
    try {
      const data = await lotTransferService.fetchProductTypes();
      setProductTypes(data);
      if (data.length > 0) {
        setFormProductTypeId((prev) => (prev && data.some((pt) => pt.id === prev) ? prev : null));
      }
    } catch {
      toast.error("Failed to load product classifications");
    } finally {
      setLoadingProductTypes(false);
    }
  }, []);

  // 4. Load transfers list
  const loadTransfers = useCallback(async () => {
    setLoading(true);
    try {
      const filter: Parameters<typeof lotTransferService.listTransfers>[0] = {
        branchId: filterBranchId || undefined,
        search: search.trim() || undefined,
      };
      if (statusFilter !== "ALL") {
        filter.status = statusFilter as LotTransferStatus;
      }
      const res = await lotTransferService.listTransfers(filter);
      setTransfers(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
    } catch {
      setTransfers([]);
    } finally {
      setLoading(false);
    }
  }, [filterBranchId, search, statusFilter]);

  // Initial load
  useEffect(() => {
    loadBranches();
    loadProductTypes();
  }, [loadBranches, loadProductTypes]);

  // When formBranchId or formProductTypeId changes, load lots and authoritative batch stats
  useEffect(() => {
    if (formBranchId) {
      loadLotsForBranch(formBranchId, formProductTypeId);
    } else {
      setLots([]);
      setLotBatchStats({});
    }
  }, [formBranchId, formProductTypeId, loadLotsForBranch]);

  useEffect(() => {
    if (viewState === "list") {
      loadTransfers();
    }
  }, [viewState, loadTransfers]);

  useEffect(() => {
    if (transferId) {
      setLoading(true);
      lotTransferService
        .getTransferById(transferId)
        .then((data) => {
          setActiveTransfer(data);
          setViewState("view");
        })
        .finally(() => setLoading(false));
    }
  }, [transferId]);

  // Branch options for Select (strictly active branches)
  const branchOptions: Option[] = useMemo(() => {
    return activeBranches.map((b) => ({
      value: b.id,
      label: b.branchName,
      subLabel: b.branchCode ? `Code: ${b.branchCode} • Active` : "Active",
    }));
  }, [activeBranches]);

  // Source lot options for select dropdown - strictly HIDE incompatible lots, inactive lots, and lots with no matching batches
  const sourceLotOptions: Option[] = useMemo(() => {
    return lots
      .filter((l) => {
        if (l.status !== "ACTIVE") return false;
        const stats = lotBatchStats[l.lot_id];
        return stats ? stats.matchingBatchesToMove > 0 : false;
      })
      .map((l) => {
        const stats = lotBatchStats[l.lot_id];
        const unitLabel = l.unit_name || stats?.unitName || "";
        const matchingCount = stats ? stats.matchingBatchesToMove : 0;
        const matchingQty = stats ? stats.matchingQtyToMove : 0;
        return {
          value: l.lot_id,
          label: l.lot_name,
          subLabel: `${matchingCount} ${matchingCount === 1 ? "batch" : "batches"} to move (${matchingQty.toLocaleString()} ${unitLabel}) • Occupancy: ${stats?.totalOccupancy.toLocaleString()}/${stats?.maxCapacity && stats.maxCapacity > 0 ? stats.maxCapacity.toLocaleString() : "∞"} ${unitLabel}`,
        };
      });
  }, [lots, lotBatchStats]);

  const selectedBranch = activeBranches.find((b) => b.id === formBranchId);

  // Product type options for select dropdown
  const productTypeOptions: Option[] = useMemo(() => {
    return productTypes.map((pt) => ({
      value: pt.id,
      label: pt.name,
      subLabel: pt.description || (pt.name.toLowerCase().includes("packaging") ? "FIFO Inventory Rule" : "FEFO Inventory Rule"),
    }));
  }, [productTypes]);

  const selectedProductType = useMemo(
    () => productTypes.find((pt) => pt.id === formProductTypeId),
    [productTypes, formProductTypeId]
  );
  const sourceLot = lots.find((l) => l.lot_id === sourceLotId);
  const targetLot = lots.find((l) => l.lot_id === targetLotId);

  // Target lot options - strictly hide incompatible UOM lots, inactive lots, and source lot
  const targetLotOptions: Option[] = useMemo(() => {
    return lots
      .filter((l) => {
        // Exclude the source lot itself
        if (l.lot_id === sourceLotId) return false;
        // Exclude inactive lots
        if (l.status !== "ACTIVE") return false;
        // Strictly HIDE incompatible UOM lots if source lot has a specified UOM
        if (sourceLot?.unit_id && l.unit_id && sourceLot.unit_id !== l.unit_id) {
          return false;
        }
        return true;
      })
      .map((l) => {
        const stats = lotBatchStats[l.lot_id];
        const occupied = stats ? stats.totalOccupancy : 0;
        const max = l.max_batch_capacity;
        const availableSpace = max > 0 ? Math.max(0, max - occupied) : 999999;
        const unitLabel = l.unit_name || stats?.unitName || "";
        const subLabel =
          max > 0
            ? `Capacity Left: ${availableSpace.toLocaleString()} / Max: ${max.toLocaleString()} ${unitLabel} (Current: ${occupied.toLocaleString()})`
            : `Current Stock: ${occupied.toLocaleString()} ${unitLabel}`;
        return {
          value: l.lot_id,
          label: l.lot_name,
          subLabel,
          disabled: max > 0 && availableSpace <= 0,
        };
      });
  }, [lots, sourceLotId, sourceLot, lotBatchStats]);

  // UOM Compatibility Analysis
  const uomMismatch = useMemo(() => {
    if (!sourceLot || !targetLot) return null;
    if (sourceLot.unit_id && targetLot.unit_id && sourceLot.unit_id !== targetLot.unit_id) {
      return `UOM Mismatch: Source lot uses ${sourceLot.unit_name || `UOM #${sourceLot.unit_id}`} while Destination lot uses ${targetLot.unit_name || `UOM #${targetLot.unit_id}`}. Cross-UOM transfer without conversion is strictly forbidden.`;
    }
    return null;
  }, [sourceLot, targetLot]);

  // Target Lot Capacity Analysis (Current Occupied + Transfer Total vs Max Capacity)
  const targetLotCurrentOccupied = useMemo(() => {
    if (!targetLotId) return 0;
    return lotBatchStats[targetLotId]?.totalOccupancy || 0;
  }, [targetLotId, lotBatchStats]);

  const totalTransferQty = useMemo(() => {
    return lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }, [lines]);

  const targetLotCapacityStats = useMemo(() => {
    if (!targetLot || targetLot.max_batch_capacity <= 0) return null;
    const maxCapacity = targetLot.max_batch_capacity;
    const projectedOccupancy = targetLotCurrentOccupied + totalTransferQty;
    const remaining = Math.max(0, maxCapacity - projectedOccupancy);
    const isExceeded = projectedOccupancy > maxCapacity;
    const excess = isExceeded ? projectedOccupancy - maxCapacity : 0;

    return {
      maxCapacity,
      currentOccupied: targetLotCurrentOccupied,
      incomingTransfer: totalTransferQty,
      projectedOccupancy,
      remaining,
      isExceeded,
      excess,
    };
  }, [targetLot, targetLotCurrentOccupied, totalTransferQty]);

  const capacityWarning = useMemo(() => {
    if (!targetLotCapacityStats) return null;
    if (targetLotCapacityStats.isExceeded) {
      return `Destination lot capacity exceeded! Max capacity is ${targetLotCapacityStats.maxCapacity.toLocaleString()} ${targetLot?.unit_name || ""}. Current stock (${targetLotCapacityStats.currentOccupied.toLocaleString()}) + incoming transfer (${targetLotCapacityStats.incomingTransfer.toLocaleString()}) = ${targetLotCapacityStats.projectedOccupancy.toLocaleString()} (exceeds by ${targetLotCapacityStats.excess.toLocaleString()} ${targetLot?.unit_name || ""}).`;
    }
    return null;
  }, [targetLotCapacityStats, targetLot]);

  // Handle changing branch in form (First Input)
  const handleBranchChange = (newBranchId: number) => {
    if (newBranchId === formBranchId) return;
    setFormBranchId(newBranchId);
    setSourceLotId(null);
    setTargetLotId(null);
    if (lines.length > 0) {
      setLines([]);
      toast.info("Source lot, destination lot, and line items reset for newly selected branch.");
    }
  };

  // Handle changing product type classification in form (Step 1)
  const handleProductTypeChange = (newTypeId: number) => {
    if (newTypeId === formProductTypeId) return;
    setFormProductTypeId(newTypeId);
    setSourceLotId(null);
    setTargetLotId(null);
    if (lines.length > 0) {
      setLines([]);
      toast.info("Source lot, destination lot, and transfer line items reset because product classification was changed.");
    }
  };

  const handleAddLine = (newLine: LotTransferFormLine) => {
    setLines((prev) => [...prev, newLine]);
  };

  const handleRemoveLine = (idx: number) => {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleLineQtyChange = (idx: number, qty: number) => {
    setLines((prev) =>
      prev.map((line, i) => (i === idx ? { ...line, quantity: qty } : line))
    );
  };

  const resetForm = () => {
    setFormBranchId(null);
    setFormProductTypeId(null);
    setSourceLotId(null);
    setTargetLotId(null);
    setTransferDate(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Manila" }));
    setReason("");
    setLines([]);
  };

  const handleSave = async (submitAfter: boolean) => {
    if (!formBranchId) {
      toast.error("Please select a valid active Branch first.");
      return;
    }
    if (!formProductTypeId) {
      toast.error("Please select a Product Classification in Step 1.");
      return;
    }
    if (!sourceLotId || !targetLotId) {
      toast.error("Both Source and Destination Storage Lots must be selected.");
      return;
    }
    if (sourceLotId === targetLotId) {
      toast.error("Source and Destination Lots must be different.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Please enter a valid transfer reason.");
      return;
    }
    if (lines.length === 0) {
      toast.error("Please add at least one line item to transfer.");
      return;
    }
    if (uomMismatch) {
      toast.error(uomMismatch);
      return;
    }
    if (capacityWarning) {
      toast.error(capacityWarning);
      return;
    }

    setSubmitting(true);
    setSubmittingAction(submitAfter ? "submit" : "draft");
    const toastId = toast.loading(
      submitAfter
        ? "Submitting transfer request for QA approval..."
        : "Saving transfer draft..."
    );

    try {
      const payload: LotTransferFormValues = {
        branchId: formBranchId,
        productTypeId: formProductTypeId,
        productTypeName: selectedProductType?.name,
        transferDate,
        sourceLotId,
        targetLotId,
        reason: reason.trim(),
        lines,
      };

      await lotTransferService.createTransfer(
        payload,
        submitAfter ? "Submitted" : "Draft"
      );
      toast.success(
        submitAfter
          ? "Lot transfer submitted for QA approval!"
          : "Lot transfer draft saved successfully!",
        { id: toastId }
      );
      resetForm();
      setViewState("list");
      loadTransfers();
    } catch {
      toast.dismiss(toastId);
    } finally {
      setSubmitting(false);
      setSubmittingAction(null);
    }
  };

  const handleSubmitDraft = async (id: number) => {
    setSubmittingDraftId(id);
    const toastId = toast.loading("Submitting transfer request for QA approval...");
    try {
      await lotTransferService.submitTransfer(id);
      toast.success("Transfer submitted for QA approval!", { id: toastId });
      loadTransfers();
    } catch {
      toast.dismiss(toastId);
    } finally {
      setSubmittingDraftId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-4 space-y-4 max-w-7xl mx-auto w-full">
      {/* View: CREATE TRANSFER */}
      {viewState === "create" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b pb-4">
            <div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    resetForm();
                    setViewState("list");
                  }}
                  className="gap-1 h-8 px-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </Button>
                <h1 className="text-xl font-bold tracking-tight">Create Lot Transfer Request</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5 ml-8">
                Transfer batch inventory between internal storage lots with FEFO/FIFO validation.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => handleSave(false)}
                disabled={submitting}
                className="gap-1.5 min-w-[130px]"
              >
                {submittingAction === "draft" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    Saving Draft...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save as Draft
                  </>
                )}
              </Button>
              <Button
                onClick={() => handleSave(true)}
                disabled={submitting}
                className="gap-1.5 min-w-[200px]"
              >
                {submittingAction === "submit" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting for QA Approval...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit for QA Approval
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* STEP 1: OPERATING SCOPE - BRANCH & PRODUCT TYPE SELECTION */}
          <div className="p-5 border-2 border-primary/20 rounded-xl bg-card shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-primary flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  Step 1: Select Active Branch & Product Classification *
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Define the operating facility and product category. Transfers are strictly scoped to a single product classification with FEFO/FIFO rule enforcement.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {selectedBranch && (
                  <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px] gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Active Branch
                  </Badge>
                )}
                {selectedProductType && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] gap-1 ${
                      selectedProductType.name.toLowerCase().includes("packaging")
                        ? "bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/30 dark:text-blue-400"
                        : "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/30 dark:text-amber-400"
                    }`}
                  >
                    {selectedProductType.name.toLowerCase().includes("packaging") ? (
                      <>
                        <Calendar className="w-3 h-3 text-blue-600" />
                        FIFO (First In, First Out)
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-amber-600" />
                        FEFO (First Expired, First Out)
                      </>
                    )}
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Branch Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-primary" />
                  Active Branch *
                </label>
                <SearchableSelect
                  options={branchOptions}
                  value={formBranchId}
                  onChange={(val) => handleBranchChange(Number(val))}
                  placeholder={loadingBranches ? "Loading active branches..." : "Select a branch"}
                  disabled={loadingBranches || submitting}
                />
                <span className="text-[11px] text-muted-foreground block">
                  Available storage lots and batch inventories are strictly scoped to this facility.
                </span>
              </div>

              {/* Product Type Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Boxes className="w-3.5 h-3.5 text-primary" />
                  Product Type / Classification *
                </label>
                <SearchableSelect
                  options={productTypeOptions}
                  value={formProductTypeId}
                  onChange={(val) => handleProductTypeChange(Number(val))}
                  placeholder={loadingProductTypes ? "Loading product types..." : "Select a product type"}
                  disabled={loadingProductTypes || submitting}
                />
                <span className="text-[11px] text-muted-foreground block">
                  {selectedProductType?.name.toLowerCase().includes("packaging")
                    ? "Packaging materials follow FIFO (earliest receipt date first)."
                    : "Raw materials and finished goods enforce FEFO (nearest expiry first)."}
                </span>
              </div>
            </div>
          </div>

          {/* STEP 2: Storage Lots & Transfer Date */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Source Lot */}
            <div className="p-4 border rounded-xl bg-card shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  Source Storage Lot *
                </label>
                {sourceLot && (
                  (() => {
                    const stats = lotBatchStats[sourceLot.lot_id];
                    if (!stats) return null;
                    const unitLabel = sourceLot.unit_name || stats.unitName || "";
                    const hasMatching = stats.matchingBatchesToMove > 0;
                    return (
                      <Badge
                        variant={hasMatching ? "secondary" : "outline"}
                        className={`text-[10px] ${
                          hasMatching
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : "text-muted-foreground border-border"
                        }`}
                      >
                        {hasMatching
                          ? `${stats.matchingBatchesToMove} ${stats.matchingBatchesToMove === 1 ? "batch" : "batches"} to move (${stats.matchingQtyToMove.toLocaleString()} ${unitLabel}) • Occupancy: ${stats.totalOccupancy.toLocaleString()}/${stats.maxCapacity > 0 ? stats.maxCapacity.toLocaleString() : "∞"} ${unitLabel}`
                          : `No matching batches to move • Occupancy: ${stats.totalOccupancy.toLocaleString()}/${stats.maxCapacity > 0 ? stats.maxCapacity.toLocaleString() : "∞"} ${unitLabel}`}
                      </Badge>
                    );
                  })()
                )}
              </div>
              <SearchableSelect
                options={sourceLotOptions.filter((opt) => opt.value !== targetLotId)}
                value={sourceLotId}
                onChange={(val) => {
                  const newSourceId = Number(val);
                  setSourceLotId(newSourceId);
                  const newSource = lots.find((l) => l.lot_id === newSourceId);
                  if (targetLot && newSource?.unit_id && targetLot.unit_id && newSource.unit_id !== targetLot.unit_id) {
                    setTargetLotId(null);
                    toast.warning("Destination lot reset because its UOM is incompatible with the selected source lot.");
                  }
                  if (lines.length > 0) {
                    setLines([]);
                    toast.info("Line items cleared due to source lot change.");
                  }
                }}
                placeholder={loadingLots ? "Loading lots..." : !formBranchId ? "Select a branch first" : "Select source lot..."}
                emptyText="No storage lots with available batches to move."
                disabled={loadingLots || !formBranchId}
              />
            </div>

            {/* Target Lot */}
            <div className="p-4 border rounded-xl bg-card shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <ArrowRight className="w-3.5 h-3.5 text-primary" />
                  Destination Storage Lot *
                </label>
                {targetLot && (
                  (() => {
                    const max = targetLot.max_batch_capacity;
                    if (max <= 0) return null;
                    const stats = targetLotCapacityStats;
                    const isExceeded = stats?.isExceeded;
                    const unitLabel = targetLot.unit_name || "";
                    return (
                      <Badge
                        variant={isExceeded ? "destructive" : "outline"}
                        className={`text-[10px] ${
                          isExceeded
                            ? ""
                            : stats && stats.remaining === 0
                            ? "border-amber-500 text-amber-600 bg-amber-50 dark:bg-amber-950/20"
                            : "text-muted-foreground border-border"
                        }`}
                      >
                        {isExceeded
                          ? `Exceeded by ${stats.excess.toLocaleString()} • Max: ${max.toLocaleString()} ${unitLabel}`
                          : stats && stats.remaining === 0
                          ? `At Full Capacity (0 left) / Max: ${max.toLocaleString()} ${unitLabel}`
                          : `Capacity Left: ${stats ? stats.remaining.toLocaleString() : max.toLocaleString()} / Max: ${max.toLocaleString()} ${unitLabel}`}
                      </Badge>
                    );
                  })()
                )}
              </div>
              <SearchableSelect
                options={targetLotOptions}
                value={targetLotId}
                onChange={(val) => setTargetLotId(Number(val))}
                placeholder={
                  loadingLots
                    ? "Loading lots..."
                    : !formBranchId
                    ? "Select a branch first"
                    : !sourceLotId
                    ? "Select source lot first"
                    : targetLotOptions.length === 0
                    ? "No compatible destination lots found"
                    : "Select destination lot..."
                }
                disabled={loadingLots || !formBranchId || !sourceLotId}
              />
              {capacityWarning && (
                <div className="text-xs text-destructive flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  {capacityWarning}
                </div>
              )}
            </div>

            {/* Transfer Date */}
            <div className="p-4 border rounded-xl bg-card shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  Transfer Date *
                </label>
              </div>
              <Input
                type="date"
                value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          {/* UOM Incompatibility Banner */}
          {uomMismatch && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uomMismatch}</span>
            </div>
          )}

          {/* Reason Field */}
          <div className="p-4 border rounded-xl bg-card shadow-sm space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Transfer Reason / Operational Justification *
            </label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Relocation for production packaging, staging for work-center, inventory balancing"
              className="h-9 text-sm"
            />
          </div>

          {/* Lines Table Section */}
          <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b bg-muted/20">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-sm">Transfer Line Items</h3>
                <Badge variant="secondary">{lines.length} items</Badge>
              </div>

              <Button
                size="sm"
                onClick={() => {
                  if (!formBranchId) {
                    toast.warning("Please select a Branch first.");
                    return;
                  }
                  if (!formProductTypeId) {
                    toast.warning("Please select a Product Classification first.");
                    return;
                  }
                  if (!sourceLotId) {
                    toast.warning("Please select a Source Lot first.");
                    return;
                  }
                  if (!targetLotId) {
                    toast.warning("Please select a Destination Lot first.");
                    return;
                  }
                  if (uomMismatch) {
                    toast.error(uomMismatch);
                    return;
                  }
                  const stats = lotBatchStats[sourceLotId];
                  if (!stats || stats.matchingBatchesToMove === 0) {
                    toast.warning("The selected Source Lot has no matching batches to move for this product classification.");
                    return;
                  }
                  setBatchModalOpen(true);
                }}
                disabled={
                  !formBranchId ||
                  !formProductTypeId ||
                  !sourceLotId ||
                  !targetLotId ||
                  Boolean(uomMismatch) ||
                  (lotBatchStats[sourceLotId || 0]?.matchingBatchesToMove || 0) === 0
                }
                className="gap-1.5 h-8 text-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Batch to Transfer
              </Button>
            </div>

            {lines.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground space-y-2">
                <Layers className="w-8 h-8 mx-auto opacity-30" />
                <p className="text-sm">No batches added to this transfer yet.</p>
                <p className="text-xs text-muted-foreground/75">
                  Select branch and storage lots above, then click &ldquo;Add Batch to Transfer&rdquo;.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-12 text-center" title="Line Number">#</TableHead>
                    <TableHead title="Product Name / SKU">Product</TableHead>
                    <TableHead title="Source Batch Number">Source Batch</TableHead>
                    <TableHead title="Target Batch Number">Target Batch #</TableHead>
                    <TableHead title="Manufacturing Date">Mfg Date</TableHead>
                    <TableHead title="Expiration Date">Expiry Date</TableHead>
                    <TableHead className="text-right" title="Available Stock in Source Lot">Available</TableHead>
                    <TableHead className="w-36 text-right" title="Quantity to Transfer">Transfer Qty</TableHead>
                    <TableHead title="Remarks">Remarks</TableHead>
                    <TableHead className="w-12 text-center" title="Action"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => {
                    const pDesc = line.productDescription;
                    const pName = line.productName && line.productName !== "-" ? line.productName : "";
                    const pCode = line.productCode && line.productCode !== "-" ? line.productCode : "";
                    const primaryTitle = pDesc || pName || (line.productId ? `Product #${line.productId}` : "-");
                    const mfgDate = line.sourceManufacturingDate ? String(line.sourceManufacturingDate).slice(0, 10) : "-";
                    const expDate = line.sourceExpiryDate ? String(line.sourceExpiryDate).slice(0, 10) : "-";
                    const lineRemarks = line.lineRemarks || reason || "-";

                    return (
                      <TableRow key={idx}>
                        <TableCell className="text-center font-mono text-xs text-muted-foreground" title={`Line ${idx + 1}`}>
                          {idx + 1}
                        </TableCell>
                        <TableCell title={primaryTitle}>
                          <div className="font-semibold text-sm leading-tight text-foreground">
                            {primaryTitle}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            {pDesc && pName && <span>{pName}</span>}
                            {pCode && <span>• Code: {pCode}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-medium" title={line.sourceBatchNo || "-"}>
                          {line.sourceBatchNo || "-"}
                        </TableCell>
                        <TableCell className="font-mono text-xs" title={line.targetBatchNo}>
                          {line.targetBatchNo}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap" title={mfgDate}>
                          {mfgDate}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap" title={expDate}>
                          {expDate}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs" title={`${line.sourceOnHand.toLocaleString()} ${line.uomName || "-"}`}>
                          {line.sourceOnHand.toLocaleString()} {line.uomName || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <RowQuantityInput
                            value={line.quantity}
                            onChange={(val) => handleLineQtyChange(idx, val)}
                            max={line.sourceOnHand}
                            min={0.0001}
                          />
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground" title={lineRemarks}>
                          {lineRemarks}
                        </TableCell>
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveLine(idx)}
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Remove batch line"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Batch Selector Modal */}
          {formBranchId && formProductTypeId && sourceLotId && targetLotId && (
            <LotBatchSelectionModal
              open={batchModalOpen}
              onOpenChange={setBatchModalOpen}
              branchId={formBranchId}
              productTypeId={formProductTypeId}
              productTypeName={selectedProductType?.name}
              sourceLotId={sourceLotId}
              sourceLotName={sourceLot?.lot_name}
              targetLotId={targetLotId}
              targetLotName={targetLot?.lot_name}
              targetMaxCapacity={targetLot?.max_batch_capacity}
              targetCurrentStock={targetLotCurrentOccupied}
              targetUomName={targetLot?.unit_name}
              existingLines={lines}
              onAddLine={handleAddLine}
            />
          )}
        </div>
      )}

      {/* View: LIST TRANSFERS */}
      {viewState === "list" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">Lot Transfer Requests</h1>
              <p className="text-sm text-muted-foreground">
                Manage, draft, and track batch transfers across manufacturing storage lots.
              </p>
            </div>

            <Button
              onClick={() => {
                resetForm();
                setViewState("create");
              }}
              className="gap-1.5"
            >
              <Plus className="w-4 h-4" />
              New Transfer Request
            </Button>
          </div>

          {/* Search & Filter Bar with Active Branch Combobox */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Branch Filter (Active branches only) */}
            <div className="w-60">
              <SearchableSelect
                options={[
                  { value: 0, label: "All Active Branches" },
                  ...branchOptions,
                ]}
                value={filterBranchId || 0}
                onChange={(val) => setFilterBranchId(Number(val) > 0 ? Number(val) : null)}
                placeholder="Select a branch..."
                triggerClassName="h-9"
              />
            </div>

            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search request #, reason, batch..."
                className="pl-9 h-9"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 px-3 border rounded-md text-sm bg-background font-medium"
              >
                <option value="ALL">All Statuses</option>
                <option value="Draft">Draft</option>
                <option value="Submitted">Submitted</option>
                <option value="Approved">Approved</option>
                <option value="Posted">Posted</option>
                <option value="Rejected">Rejected</option>
                <option value="Cancelled">Cancelled</option>
                <option value="Reversed">Reversed</option>
              </select>

              <Button
                variant="outline"
                size="icon"
                onClick={loadTransfers}
                disabled={loading}
                className="h-9 w-9"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {/* Transfers Table */}
          <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead title="Transfer Request Number, Date & Branch">Request & Details</TableHead>
                  <TableHead title="Workflow Status">Status</TableHead>
                  <TableHead title="Storage Route (Source → Target Lot)">Storage Route</TableHead>
                  <TableHead className="text-right" title="Total Transfer Quantity & Lines">Total Qty & Lines</TableHead>
                  <TableHead title="Transfer Reason / Operational Justification">Reason</TableHead>
                  <TableHead className="text-right" title="Actions">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && transfers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 opacity-40" />
                      Loading lot transfers...
                    </TableCell>
                  </TableRow>
                ) : transfers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No lot transfer requests found.
                    </TableCell>
                  </TableRow>
                ) : (
                  transfers.map((item) => {
                    const branchDisplay = item.branchName && item.branchName !== "-" ? item.branchName : item.branchId ? `Branch #${item.branchId}` : "-";
                    const sourceLotDisplay = item.sourceLotName || `Lot #${item.sourceLotId}`;
                    const targetLotDisplay = item.targetLotName || `Lot #${item.targetLotId}`;
                    const lineCount = item.lineCount || item.details?.length || 1;

                    return (
                      <TableRow key={item.id} className="hover:bg-muted/40 transition-colors">
                        <TableCell title={`${item.requestNo} • ${item.transferDate} • ${branchDisplay}`}>
                          <div className="font-mono font-bold text-xs text-foreground">
                            {item.requestNo}
                          </div>
                          <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                            <span>{item.transferDate}</span>
                            <span>•</span>
                            <span className="truncate max-w-[130px]">{branchDisplay}</span>
                          </div>
                        </TableCell>
                        <TableCell title={`Status: ${item.status}`}>
                          <TransferStatusBadge status={item.status} />
                        </TableCell>
                        <TableCell title={`${sourceLotDisplay} → ${targetLotDisplay}`}>
                          <div className="flex items-center gap-1 text-xs font-semibold text-foreground flex-wrap">
                            <span>{sourceLotDisplay}</span>
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span>{targetLotDisplay}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right" title={`${item.quantity.toLocaleString()} total units across ${lineCount} line(s)`}>
                          <div className="font-mono font-bold text-xs text-foreground">
                            {item.quantity.toLocaleString()}
                          </div>
                          <div className="text-[11px] font-mono text-muted-foreground">
                            {lineCount} {lineCount === 1 ? "line" : "lines"}
                          </div>
                        </TableCell>
                        <TableCell title={item.reason || "No operational justification provided"}>
                          <div className="text-xs text-muted-foreground max-w-[220px] truncate">
                            {item.reason || "-"}
                          </div>
                        </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              setLoading(true);
                              const full = await lotTransferService.getTransferById(item.id);
                              setActiveTransfer(full);
                              setViewState("view");
                            } catch {
                              setActiveTransfer(item);
                              setViewState("view");
                            } finally {
                              setLoading(false);
                            }
                          }}
                          className="h-8 text-xs gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </Button>
                        {item.status === "Draft" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSubmitDraft(item.id)}
                            disabled={submittingDraftId === item.id}
                            className="h-8 text-xs gap-1 text-primary min-w-[75px]"
                          >
                            {submittingDraftId === item.id ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Submitting...
                              </>
                            ) : (
                              <>
                                <Send className="w-3 h-3" />
                                Submit
                              </>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* View: DETAIL VIEW */}
      {viewState === "view" && activeTransfer && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
            <div className="flex items-center gap-3 flex-wrap">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveTransfer(null);
                  setViewState("list");
                }}
                className="gap-1.5 h-8 px-2.5 text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Requests
              </Button>
              <div className="h-4 w-[1px] bg-border hidden sm:block" />
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Transfer {activeTransfer.requestNo}
              </h1>
              <TransferStatusBadge status={activeTransfer.status} />
            </div>

            {activeTransfer.status === "Draft" && (
              <Button
                onClick={() => {
                  handleSubmitDraft(activeTransfer.id);
                  setViewState("list");
                }}
                disabled={submittingDraftId === activeTransfer.id}
                className="gap-1.5 min-w-[170px]"
              >
                {submittingDraftId === activeTransfer.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting for Approval...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit for Approval
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Workflow Stepper */}
          {(() => {
            const steps = [
              { label: "Draft", key: "Draft" },
              { label: "Submitted", key: "Submitted" },
              { label: "Approved", key: "Approved" },
              { label: "Posted", key: "Posted" },
            ];

            const isRejected = activeTransfer.status === "Rejected";
            const statusMap: Record<string, number> = {
              Draft: 0,
              Submitted: 1,
              "Pending Approval": 1,
              Approved: 2,
              Posted: 3,
            };

            const activeStepIdx = isRejected ? 1 : statusMap[activeTransfer.status] ?? 0;

            return (
              <div className="p-4 border rounded-xl bg-card/60 shadow-sm">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  Transfer Request Lifecycle
                </div>
                <div className="relative flex items-center justify-between max-w-2xl mx-auto px-4">
                  {/* Background Track Line */}
                  <div className="absolute left-8 right-8 top-1/2 -translate-y-1/2 h-1 bg-muted rounded-full -z-0" />
                  <div
                    className="absolute left-8 top-1/2 -translate-y-1/2 h-1 bg-primary rounded-full transition-all duration-300 -z-0"
                    style={{
                      width: `${(activeStepIdx / (steps.length - 1)) * 100}%`,
                    }}
                  />

                  {steps.map((step, idx) => {
                    const isPassed = idx <= activeStepIdx;
                    const isCurrent = idx === activeStepIdx;

                    return (
                      <div
                        key={step.key}
                        className="relative z-10 flex flex-col items-center gap-1.5 bg-card px-2"
                      >
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all border ${
                            isRejected && isCurrent
                              ? "bg-destructive text-destructive-foreground border-destructive"
                              : isPassed
                              ? "bg-primary text-primary-foreground border-primary shadow-sm"
                              : "bg-muted text-muted-foreground border-muted-foreground/30"
                          }`}
                        >
                          {isPassed ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            idx + 1
                          )}
                        </div>
                        <span
                          className={`text-xs font-medium ${
                            isCurrent
                              ? isRejected
                                ? "text-destructive font-bold"
                                : "text-primary font-bold"
                              : isPassed
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {isRejected && isCurrent ? "Rejected" : step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Header Summary KPI Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 border rounded-xl bg-card shadow-sm space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
                <Building2 className="w-3.5 h-3.5 text-primary" />
                Branch & Date
              </div>
              <div className="font-bold text-base text-foreground mt-1">
                {activeTransfer.branchName && activeTransfer.branchName !== "-"
                  ? activeTransfer.branchName
                  : activeTransfer.branchId
                  ? `Branch #${activeTransfer.branchId}`
                  : "-"}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <Calendar className="w-3 h-3" />
                <span>Target Date: {activeTransfer.transferDate}</span>
              </div>
            </div>

            <div className="p-4 border rounded-xl bg-card shadow-sm space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
                <Layers className="w-3.5 h-3.5 text-primary" />
                Storage Route
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="font-mono text-xs bg-muted/40">
                  {activeTransfer.sourceLotName || `Lot #${activeTransfer.sourceLotId}`}
                </Badge>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <Badge variant="secondary" className="font-mono text-xs bg-primary/10 text-primary border-primary/20">
                  {activeTransfer.targetLotName || `Lot #${activeTransfer.targetLotId}`}
                </Badge>
              </div>
            </div>

            <div className="p-4 border rounded-xl bg-card shadow-sm space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
                <Boxes className="w-3.5 h-3.5 text-primary" />
                Total Line Items
              </div>
              <div className="font-bold text-xl text-foreground mt-0.5 font-mono">
                {activeTransfer.details?.length || 0} <span className="text-xs font-normal text-muted-foreground">SKU Line(s)</span>
              </div>
            </div>

            <div className="p-4 border rounded-xl bg-card shadow-sm space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                Total Transfer Qty
              </div>
              <div className="font-bold text-xl text-primary mt-0.5 font-mono">
                {(
                  activeTransfer.details?.reduce(
                    (acc, item) => acc + (Number(item.quantity) || 0),
                    0
                  ) || 0
                ).toLocaleString()}{" "}
                <span className="text-xs font-normal text-muted-foreground">Units</span>
              </div>
            </div>
          </div>

          {/* Reason Card */}
          {activeTransfer.reason && (
            <div className="p-4 border rounded-xl bg-card shadow-sm space-y-1">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Transfer Reason / Justification
              </div>
              <div className="text-sm text-foreground">{activeTransfer.reason}</div>
            </div>
          )}

          {/* Details Table */}
          <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
            <div className="p-3 border-b bg-muted/20 flex items-center justify-between font-semibold text-sm">
              <span>Transfer Line Details ({activeTransfer.details?.length || 0})</span>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-12 text-center" title="Line Number">#</TableHead>
                  <TableHead title="Product Name / Description / SKU">Product & SKU</TableHead>
                  <TableHead title="Source Batch -> Target Batch">Batch Transformation</TableHead>
                  <TableHead className="text-right" title="Quantity">Quantity</TableHead>
                  <TableHead title="Manufacturing & Expiry Dates">Dates (Mfg / Expiry)</TableHead>
                  <TableHead title="Remarks">Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeTransfer.details?.map((d, i) => {
                  const pDesc = d.productDescription;
                  const pName = d.productName && d.productName !== "-" ? d.productName : "";
                  const pCode = d.productCode && d.productCode !== "-" ? d.productCode : "";
                  const primaryTitle = pDesc || pName || (d.productId ? `Product #${d.productId}` : "-");
                  const mfgDate = d.sourceManufacturingDate ? String(d.sourceManufacturingDate).slice(0, 10) : "-";
                  const expDate = d.sourceExpiryDate ? String(d.sourceExpiryDate).slice(0, 10) : "-";
                  const lineRemarks = d.lineRemarks || activeTransfer.reason || "-";

                  return (
                    <TableRow key={d.detailId || i} className="hover:bg-muted/20">
                      <TableCell className="text-center font-mono text-xs text-muted-foreground" title={`Line ${d.lineNo || i + 1}`}>
                        {d.lineNo || i + 1}
                      </TableCell>
                      <TableCell title={primaryTitle}>
                        <div className="font-semibold text-sm leading-tight text-foreground">
                          {primaryTitle}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          {pDesc && pName && <span>{pName}</span>}
                          {pCode && <span className="font-mono text-[11px]">Code: {pCode}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="font-mono text-xs bg-background">
                            {d.sourceBatchNo}
                          </Badge>
                          <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                          <Badge variant="secondary" className="font-mono text-xs bg-primary/10 text-primary border-primary/20">
                            {d.targetBatchNo}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold text-foreground" title={d.quantity.toLocaleString()}>
                        {d.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        <div className="flex flex-col gap-0.5">
                          <div><span className="font-semibold text-foreground">Mfg:</span> {mfgDate}</div>
                          <div><span className="font-semibold text-foreground">Exp:</span> {expDate}</div>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={lineRemarks}>
                        {lineRemarks}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
};
export default LotTransferRequestModule;
