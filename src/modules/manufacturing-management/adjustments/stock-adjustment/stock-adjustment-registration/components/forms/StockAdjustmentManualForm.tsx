"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch, Control, UseFormSetValue, useFormState, FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  Package,
  Send,
  Search,
  Minus,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Paperclip,
  AlertCircle,
  Printer,
  Layers,
  Check,
  ChevronsUpDown,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { Badge } from "@/components/ui/badge";
import dynamic from "next/dynamic";
import type { LotBatchSelectionResult } from "../LotBatchSelectionModal";
import { resolveProductClassification } from "../../services/lot-tracking.service";
import type { StockAllocationPlan, BatchAllocationResult, LotAllocationGroup } from "../../types/lot-tracking.types";
import {
  StockAdjustmentManualFormSchema,
  StockAdjustmentManualFormValues,
  StockAdjustmentManualItem,
} from "../../types/stock-adjustment-manual.schema";
import { useStockAdjustmentManualForm } from "../../hooks/useStockAdjustmentManualForm";
import { isPostedStatus } from "../../utils/status-utils";
import { formatPhDateTime, getPhCurrentTimestamp } from "../../utils/date-utils";
import { decodeJwtPayload } from "../../utils/auth-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { AttachmentUpload } from "../AttachmentUpload";
import { PdfEngine } from "@/components/pdf-layout-design/PdfEngine";
import { pdfTemplateService } from "@/components/pdf-layout-design/services/pdf-template";
import { PAPER_SIZES } from "@/components/pdf-layout-design/constants";
import { CompanyData } from "@/components/pdf-layout-design/types";

const LotBatchSelectionModal = dynamic(
  () => import("../LotBatchSelectionModal").then((m) => m.LotBatchSelectionModal),
  { ssr: false }
);
const StockAllocationModal = dynamic(
  () => import("../StockAllocationModal").then((m) => m.StockAllocationModal),
  { ssr: false }
);
const ProductSelectionModal = dynamic(
  () => import("../modals/ProductSelectionModal").then((m) => m.ProductSelectionModal),
  { ssr: false }
);

export const INVENTORY_TYPES = [
  { id: "FINISHED_GOODS", label: "Finished Goods" },
  { id: "RAW_MATERIALS", label: "Raw Materials / Packaging" },
] as const;

// ——————————————————————————————————————————————————————————————————————————————
interface StockAdjustmentManualFormProps {
  id: number | null;
  onCancel?: () => void;
  onSuccess: () => void;
  mode?: "creation" | "posting";
  unpostedList?: { id?: number; doc_no: string }[];
  onSelectId?: (id: number) => void;
  userFullName?: string;
}

// ——————————————————————————————————————————————————————————————————————————————
// Buffered quantity input for 60fps typing without re-rendering parent form
interface RowQuantityInputProps {
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
  hasError?: boolean;
}

const RowQuantityInput = React.memo(function RowQuantityInput({
  value,
  onChange,
  disabled = false,
  hasError = false,
}: RowQuantityInputProps) {
  const [prevValue, setPrevValue] = useState(value);
  const [localVal, setLocalVal] = useState<string>(
    value === 0 || value === undefined || value === null ? "" : String(value)
  );
  const [isFocused, setIsFocused] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync from props when value changes externally and input is not focused
  if (value !== prevValue) {
    setPrevValue(value);
    if (!isFocused) {
      setLocalVal(value === 0 || value === undefined || value === null ? "" : String(value));
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalVal(raw);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const parsed = parseInt(raw, 10);
      const safe = isNaN(parsed) ? 0 : Math.max(0, parsed);
      onChange(safe);
    }, 150);
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const parsed = parseInt(localVal, 10);
    const safe = isNaN(parsed) || parsed < 0 ? 0 : parsed;
    setLocalVal(safe === 0 ? "" : String(safe));
    onChange(safe);
  };

  const handleStep = (delta: number) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const current = parseInt(localVal, 10);
    const base = isNaN(current) ? (value || 0) : current;
    const next = Math.max(0, base + delta);
    setLocalVal(next === 0 ? "" : String(next));
    onChange(next);
  };

  return (
    <div
      className={`flex items-center gap-0 w-min bg-background border rounded-md overflow-hidden transition-colors ${
        hasError
          ? "border-red-500 ring-1 ring-red-500/40 bg-red-50/20 dark:bg-red-950/20"
          : "border-border"
      }`}
    >
      <button
        type="button"
        disabled={disabled || (Number(localVal || value || 0) <= 0)}
        className="w-7 h-7 flex items-center justify-center hover:bg-muted text-muted-foreground disabled:opacity-50 transition-colors cursor-pointer"
        onClick={() => handleStep(-1)}
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="number"
        value={localVal}
        placeholder="0"
        disabled={disabled}
        onFocus={(e) => {
          setIsFocused(true);
          e.target.select();
        }}
        onClick={(e) => (e.target as HTMLInputElement).select()}
        onChange={handleChange}
        onBlur={handleBlur}
        className="w-12 h-7 text-center text-xs font-bold border-x border-border focus:outline-none focus:ring-0 bg-transparent p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        min={0}
      />
      <button
        type="button"
        disabled={disabled}
        className="w-7 h-7 flex items-center justify-center hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
        onClick={() => handleStep(1)}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
});

// ——————————————————————————————————————————————————————————————————————————————
// Table row for the main form
interface ProductTableRowProps {
  index: number;
  control: Control<StockAdjustmentManualFormValues>;
  onRemove: (index: number) => void;
  setValue: UseFormSetValue<StockAdjustmentManualFormValues>;
  onOpenLotBatch?: (index: number) => void;
  isReadOnly?: boolean;
  type?: "IN" | "OUT";
}

const ProductTableRow = React.memo(function ProductTableRow({
  index,
  control,
  onRemove,
  setValue,
  onOpenLotBatch,
  isReadOnly = false,
  type = "IN",
}: ProductTableRowProps) {
  const product_name = useWatch({ control, name: `items.${index}.product_name` });
  const product_code = useWatch({ control, name: `items.${index}.product_code` });
  const productType = useWatch({ control, name: `items.${index}.product_type` });
  const productCategory = useWatch({ control, name: `items.${index}.product_category` });
  const unitName = useWatch({ control, name: `items.${index}.unit_name` });
  const quantity = useWatch({ control, name: `items.${index}.quantity` });
  const costPerUnit = useWatch({ control, name: `items.${index}.cost_per_unit` });
  const brandName = useWatch({ control, name: `items.${index}.brand_name` });
  const lotId = useWatch({ control, name: `items.${index}.lot_id` });
  const lotName = useWatch({ control, name: `items.${index}.lot_name` });
  const batchNo = useWatch({ control, name: `items.${index}.batch_no` });
  const qaStatus = useWatch({ control, name: `items.${index}.qa_status` });
  const lotAllocations = useWatch({ control, name: `items.${index}.lot_allocations` }) as { lot_id: number; lot_name: string; batches: { batch_no: string; quantity: number }[] }[] | undefined;

  const { errors } = useFormState({ control });
  const rowError = Array.isArray(errors.items)
    ? (errors.items[index] as FieldErrors<StockAdjustmentManualItem>)
    : undefined;

  const totalCost = Number(quantity || 0) * Number(costPerUnit || 0);

  const productClassification = useMemo(() => {
    return resolveProductClassification(productType, productCategory).code;
  }, [productType, productCategory]);

  const allocationPolicy = productClassification === 'PKG' ? 'FIFO' : 'FEFO';

  const handleQuantityChange = useCallback((newQty: number) => {
    const safeQty = Math.max(0, newQty);
    setValue(`items.${index}.quantity`, safeQty, { shouldValidate: true });
  }, [setValue, index]);

  const batches = useMemo(() => {
    if (lotAllocations && lotAllocations.length > 0) {
      const bList: string[] = [];
      lotAllocations.forEach((g) => {
        (g.batches || []).forEach((b) => {
          if (b.batch_no) bList.push(b.batch_no);
        });
      });
      if (bList.length > 0) return bList;
    }
    if (!batchNo) return [];
    return String(batchNo)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [batchNo, lotAllocations]);

  const lotBatchDisplayInfo = useMemo(() => {
    if (lotAllocations && lotAllocations.length > 0) {
      const totalLots = lotAllocations.length;
      const totalBatches = lotAllocations.reduce((sum, g) => sum + (g.batches?.length || 0), 0);
      if (totalLots > 1) {
        return `${totalLots} Lots (${totalBatches} Batches)`;
      }
      const singleLot = lotAllocations[0];
      if (singleLot.batches && singleLot.batches.length > 1) {
        return `${singleLot.lot_name || `Lot #${singleLot.lot_id}`}: ${singleLot.batches.length} Batches`;
      }
      if (singleLot.batches && singleLot.batches.length === 1) {
        return `${singleLot.batches[0].batch_no || 'Batch'} (${singleLot.lot_name || `Lot #${singleLot.lot_id}`})`;
      }
    }
    if (batches.length > 1) {
      return `${batches.length} Batches (${lotName || `Lot #${lotId || "—"}`})`;
    }
    if (batches.length === 1) {
      return `${batches[0]} (${lotName || `Lot #${lotId || "—"}`})`;
    }
    return "";
  }, [lotAllocations, batches, lotName, lotId]);

  const batchLabel = useMemo(() => {
    if (batches.length === 0) return "";
    if (batches.length === 1) return `(${batches[0]})`;
    return `(${batches.length} Batches)`;
  }, [batches]);

  const allocatedBatchSum = useMemo(() => {
    if (lotAllocations && lotAllocations.length > 0) {
      return lotAllocations.reduce((sum, g) => {
        return sum + (g.batches || []).reduce((bSum, b) => bSum + Number(b.quantity || 0), 0);
      }, 0);
    }
    return null;
  }, [lotAllocations]);

  const lineQty = Number(quantity || 0);
  const hasQuantityMismatch = useMemo(() => {
    if (type === "IN" && allocatedBatchSum !== null) {
      return lineQty !== allocatedBatchSum;
    }
    return false;
  }, [type, allocatedBatchSum, lineQty]);

  return (
    <tr
      className={`border-b transition-colors ${
        hasQuantityMismatch
          ? "bg-red-500/10 hover:bg-red-500/15 border-red-300 dark:border-red-900/50"
          : rowError
            ? "bg-amber-500/10 hover:bg-amber-500/15 border-amber-300 dark:border-amber-900/50"
            : "hover:bg-muted/10 bg-card border-border/50"
      }`}
    >
      <td
        className={`p-3 text-xs text-center font-bold w-12 border-r transition-colors ${
          hasQuantityMismatch
            ? "text-red-600 dark:text-red-400 bg-red-500/10 border-red-300 dark:border-red-900/50"
            : "text-muted-foreground border-border/50"
        }`}
      >
        {index + 1}
      </td>
      <td className="p-3">
        <span className="text-xs font-bold text-foreground">{brandName || "—"}</span>
      </td>
      <td className="p-3 min-w-[250px]">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-foreground leading-tight">{product_name || "—"}</span>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {product_code && (
              <span className="text-[10px] text-muted-foreground font-mono">{product_code}</span>
            )}
            {type === "OUT" ? (
              <div className="flex items-center gap-1.5 flex-wrap">
                <Badge
                  variant="outline"
                  onClick={() => onOpenLotBatch?.(index)}
                  title={batches.length > 0 ? `Allocated Batches (${allocationPolicy}):\n${batches.join("\n")}` : `Automatic ${allocationPolicy} Allocation`}
                  className="text-[10px] py-0 h-4 px-1.5 font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1 cursor-pointer hover:bg-emerald-500/20 transition-colors"
                >
                  <Layers className="w-2.5 h-2.5 text-emerald-600" />
                  AUTO — {allocationPolicy} {batchLabel}
                </Badge>
                {qaStatus && (
                  <Badge
                    variant={qaStatus === "GOOD" ? "outline" : qaStatus === "DAMAGED" ? "destructive" : "secondary"}
                    className="text-[9px] py-0 h-3.5 px-1 font-mono"
                  >
                    {qaStatus}
                  </Badge>
                )}
              </div>
            ) : (
              <>
                {lotBatchDisplayInfo ? (
                  <Badge
                    variant="outline"
                    onClick={() => onOpenLotBatch?.(index)}
                    title={lotBatchDisplayInfo}
                    className={`text-[10px] py-0 h-4 px-1.5 font-semibold gap-1 cursor-pointer transition-colors ${
                      rowError?.batch_no
                        ? "bg-red-500/15 text-red-700 dark:text-red-300 border border-red-500 ring-1 ring-red-500/30"
                        : "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20"
                    }`}
                  >
                    <Layers className={`w-2.5 h-2.5 ${rowError?.batch_no ? "text-red-600" : "text-primary"}`} />
                    {lotBatchDisplayInfo}
                  </Badge>
                ) : (
                  !isReadOnly && (
                    <button
                      type="button"
                      onClick={() => onOpenLotBatch?.(index)}
                      className={`text-[10px] font-bold rounded px-1.5 py-0.5 flex items-center gap-1 transition-colors cursor-pointer ${
                        rowError?.batch_no
                          ? "text-red-700 dark:text-red-300 bg-red-500/15 border border-red-500 ring-1 ring-red-500/30 animate-pulse"
                          : "text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20"
                      }`}
                    >
                      <Layers className={`w-2.5 h-2.5 ${rowError?.batch_no ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`} />
                      * Assign Lot & Batch
                    </button>
                  )
                )}
                {hasQuantityMismatch && allocatedBatchSum !== null && (
                  <Badge
                    variant="destructive"
                    onClick={() => onOpenLotBatch?.(index)}
                    className="text-[9px] py-0 h-4 px-1.5 font-bold cursor-pointer gap-1 shadow-2xs hover:bg-destructive/90 transition-colors"
                    title={`Quantity Mismatch: Table quantity is ${lineQty.toLocaleString()}, but allocated batch sum is ${allocatedBatchSum.toLocaleString()}. Click to balance batches.`}
                  >
                    <AlertCircle className="w-2.5 h-2.5" />
                    Mismatch ({allocatedBatchSum.toLocaleString()} alloc)
                  </Badge>
                )}
                {rowError?.batch_no && (
                  <span className="text-[10px] text-red-500 font-bold ml-1">
                    {rowError.batch_no.message}
                  </span>
                )}
                {qaStatus && (
                  <Badge
                    variant={qaStatus === "GOOD" ? "outline" : qaStatus === "DAMAGED" ? "destructive" : "secondary"}
                    className="text-[9px] py-0 h-3.5 px-1 font-mono"
                  >
                    {qaStatus}
                  </Badge>
                )}
              </>
            )}
          </div>
        </div>
      </td>
      <td className="p-3">
        <span className="text-[10px] font-bold text-primary bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded uppercase shrink-0">
          {unitName || "-"}
        </span>
      </td>
      <td className="p-3">
        <span className="text-xs font-bold text-foreground">
          ₱{Number(costPerUnit || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </td>
      <td className="p-3">
        <span className="text-xs font-bold text-primary dark:text-primary/70">
          ₱{Number(totalCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </td>
      <td className="p-3 w-32">
        {isReadOnly ? (
          <span className="text-xs font-bold px-3 py-1 bg-muted rounded-md border border-border/50">{quantity}</span>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <RowQuantityInput
              value={Number(quantity || 0)}
              onChange={handleQuantityChange}
              hasError={hasQuantityMismatch || !!rowError?.quantity || Number(quantity || 0) <= 0}
            />
            {hasQuantityMismatch && allocatedBatchSum !== null && (
              <div className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                <AlertCircle className="w-3 h-3 shrink-0" />
                <span>Batches: {allocatedBatchSum.toLocaleString()}</span>
              </div>
            )}
          </div>
        )}
        {rowError?.quantity && (
          <p className="text-[10px] text-red-500 font-bold mt-1">{rowError.quantity.message}</p>
        )}
      </td>
      <td className="p-3 text-center w-16">
        {!isReadOnly && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onRemove(index)}
            className="h-7 w-7 rounded-full text-red-400/50 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all mx-auto"
            title="Remove item"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </td>
    </tr>
  );
});

// ——————————————————————————————————————————————————————————————————————————————
function FormSummary({
  control,
  fieldCount,
}: {
  control: Control<StockAdjustmentManualFormValues>;
  fieldCount: number;
}) {
  const items = useWatch({ control, name: "items" });

  const { totalQuantity, totalAmount } = useMemo(() => {
    const currentItems = items || [];
    let qty = 0;
    let amt = 0;
    for (const item of currentItems) {
      const q = Number(item?.quantity || 0);
      const c = Number(item?.cost_per_unit || 0);
      qty += q;
      amt += q * c;
    }
    return { totalQuantity: qty, totalAmount: amt };
  }, [items]);

  return (
    <div className="border-t border-border px-8 py-5 flex justify-end bg-muted/30">
      <div className="w-full max-w-[400px] space-y-3">
        <div className="flex justify-between items-center text-sm">
          <span className="font-bold text-muted-foreground">Total Items:</span>
          <span className="font-bold text-foreground">
            {fieldCount} product(s)
          </span>
        </div>
        <div className="h-px bg-border w-full" />
        <div className="flex justify-between items-center text-sm">
          <span className="font-bold text-muted-foreground">Total Quantity:</span>
          <span className="font-bold text-foreground">
            {totalQuantity} units
          </span>
        </div>
        <div className="h-px bg-border w-full" />
        <div className="flex justify-between items-center pt-1">
          <span className="font-bold text-muted-foreground text-sm">
            Total Amount:
          </span>
          <span className="text-xl font-bold text-primary dark:text-primary/70">
            ₱
            {Number(totalAmount || 0).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
        </div>

      </div>
    </div>
  );
}

// ——————————————————————————————————————————————————————————————————————————————

// ——————————————————————————————————————————————————————————————————————————————
export function StockAdjustmentManualForm({
  id,
  onCancel,
  onSuccess,
  unpostedList,
  onSelectId,
  userFullName,
}: StockAdjustmentManualFormProps) {
  const router = useRouter();
  const {
    fetchById,
    createAdjustment,
    updateAdjustment,
    fetchProductsBySupplier,
    fetchFinishedGoodsProducts,
    products = [],
    suppliers = [],
    isProductsLoading,
    isSuppliersLoading,
    branches,
    fetchInventory,
    fetchBranchInventory,
    inventoryMap,
    fetchNextDocNo,
    postAdjustment,
    deleteAdjustment,
  } = useStockAdjustmentManualForm();

  const [loading, setLoading] = useState(false);
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false);
  const [pendingExitAction, setPendingExitAction] = useState<string | (() => void) | null>(null);
  const initialValuesRef = useRef<string>("");
  const [showPostConfirmation, setShowPostConfirmation] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [branchOpen, setBranchOpen] = useState(false);
  const [inventoryTypeOpen, setInventoryTypeOpen] = useState(false);
  const [supplierOpen, setSupplierOpen] = useState(false);

  const activeBranches = useMemo(() => {
    return branches.filter(
      (b) =>
        b.isActive === undefined ||
        b.isActive === 1 ||
        b.isActive === true ||
        b.isActive === "1"
    );
  }, [branches]);

  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lotBatchModalOpen, setLotBatchModalOpen] = useState(false);
  const [activeLotBatchIndex, setActiveLotBatchIndex] = useState<number | null>(null);
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);

  const handleOpenLotBatchModal = (index: number) => {
    setActiveLotBatchIndex(index);
    setLotBatchModalOpen(true);
  };

  const handleApplyLotBatch = (result: LotBatchSelectionResult) => {
    if (activeLotBatchIndex !== null && activeLotBatchIndex >= 0) {
      form.setValue(`items.${activeLotBatchIndex}.lot_id`, result.lot_id);
      form.setValue(`items.${activeLotBatchIndex}.lot_name`, result.lot_name);
      form.setValue(`items.${activeLotBatchIndex}.inventory_lot_id`, result.inventory_lot_id);
      form.setValue(`items.${activeLotBatchIndex}.batch_no`, result.batch_no);
      form.setValue(`items.${activeLotBatchIndex}.manufacturing_date`, result.manufacturing_date);
      form.setValue(`items.${activeLotBatchIndex}.expiry_date`, result.expiry_date);
      form.setValue(`items.${activeLotBatchIndex}.qa_status`, result.qa_status);
      form.setValue(`items.${activeLotBatchIndex}.lot_allocations`, result.lot_allocations);
      if (result.unit_cost) {
        form.setValue(`items.${activeLotBatchIndex}.cost_per_unit`, result.unit_cost);
      }
    }
  };

  const handleApplyAllocation = (plan: StockAllocationPlan) => {
    if (activeLotBatchIndex !== null && activeLotBatchIndex >= 0) {
      if (plan.allocations.length > 0) {
        const primary = plan.allocations[0];
        form.setValue(`items.${activeLotBatchIndex}.lot_id`, primary.lot_id);
        form.setValue(`items.${activeLotBatchIndex}.lot_name`, primary.lot_name);
        form.setValue(`items.${activeLotBatchIndex}.inventory_lot_id`, primary.inventory_lot_id);
        form.setValue(`items.${activeLotBatchIndex}.batch_no`, plan.allocations.map(a => a.batch_no).join(', '));
        form.setValue(`items.${activeLotBatchIndex}.manufacturing_date`, primary.manufacturing_date);
        form.setValue(`items.${activeLotBatchIndex}.expiry_date`, primary.expiry_date);
        form.setValue(`items.${activeLotBatchIndex}.qa_status`, primary.qa_status);
        form.setValue(`items.${activeLotBatchIndex}.allocations`, plan.allocations);
        form.setValue(`items.${activeLotBatchIndex}.allocation_plan`, plan);
        if (primary.unit_cost) {
          form.setValue(`items.${activeLotBatchIndex}.cost_per_unit`, primary.unit_cost);
        }
      } else {
        form.setValue(`items.${activeLotBatchIndex}.allocations`, []);
        form.setValue(`items.${activeLotBatchIndex}.allocation_plan`, undefined);
      }
    }
  };

  const [tableSearch, setTableSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const form = useForm<StockAdjustmentManualFormValues>({
    mode: "all",
    resolver: zodResolver(StockAdjustmentManualFormSchema),
    defaultValues: {
      doc_no: "", // Will be fetched via effect
      branch_id: 0,
      inventory_type: "" as unknown as "FINISHED_GOODS",
      supplier_id: 0,
      type: "IN",
      remarks: "",
      items: [],
      isPosted: false,
      stock_adjustment_attachment: [],
    },
  });

  const { fields, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const handleClearForm = useCallback(async () => {
    form.reset({
      doc_no: "",
      branch_id: 0,
      inventory_type: "" as unknown as "FINISHED_GOODS",
      supplier_id: 0,
      type: "IN",
      remarks: "",
      items: [],
      isPosted: false,
      stock_adjustment_attachment: [],
    });

    // Fetch and set the new doc_no for type "IN"
    const nextDocNo = await fetchNextDocNo("IN");
    form.setValue("doc_no", nextDocNo);

    // Update initial values ref to match the reset state
    initialValuesRef.current = JSON.stringify({
      doc_no: nextDocNo,
      branch_id: 0,
      inventory_type: "" as unknown as "FINISHED_GOODS",
      supplier_id: 0,
      type: "IN",
      remarks: "",
      items: [],
      isPosted: false,
      stock_adjustment_attachment: [],
    });
  }, [form, fetchNextDocNo]);

  const generatePDF = useCallback(async () => {
    const values = form.getValues();
    if (!values) return;

    // Retrieve currently logged-in user name from prop or fallback to JWT cookie
    let currentUserName = userFullName || "System User";
    if (!userFullName) {
      try {
        const getCookie = (name: string): string | null => {
          if (typeof window === "undefined") return null;
          const value = `; ${document.cookie}`;
          const parts = value.split(`; ${name}=`);
          if (parts.length === 2) return parts.pop()?.split(";").shift() || null;
          return null;
        };
        const token = getCookie("vos_access_token");
        if (token) {
          const decoded = decodeJwtPayload(token);
          if (decoded) {
            const first = String(decoded.Firstname ?? decoded.FirstName ?? decoded.firstName ?? decoded.firstname ?? decoded.first_name ?? "").trim();
            const last = String(decoded.LastName ?? decoded.Lastname ?? decoded.lastName ?? decoded.lastname ?? decoded.last_name ?? "").trim();
            const email = String(decoded.email ?? decoded.Email ?? "").trim();
            currentUserName = [first, last].filter(Boolean).join(" ") || email || "System User";
          }
        }
      } catch (e) {
        console.error("Failed to decode token for PDF Prepared By:", e);
      }
    }

    // Lazy load company data for PDF generation on demand
    let activeCompany = companyData;
    if (!activeCompany) {
      try {
        const res = await fetch("/api/pdf/company");
        if (res.ok) {
          const result = await res.json();
          activeCompany = result.data?.[0] || (Array.isArray(result.data) ? null : result.data);
          if (activeCompany) setCompanyData(activeCompany);
        }
      } catch (err) {
        console.error("Error fetching company data:", err);
      }
    }

    // --- Find Best Match Template ---
    const templates = await pdfTemplateService.fetchTemplates();
    const template = templates.find(t => t.name === "MEN2")
      || templates.find(t => t.name.toLowerCase().includes("men2"))
      || templates[0];
    const templateName = template?.name || "MEN2";

    const doc = await PdfEngine.generateWithFrame(templateName, activeCompany, (doc, startY, config) => {
      const pageWidth = doc.internal.pageSize.getWidth();
      const margins = {
        top: config.margins?.top ?? 10,
        bottom: config.margins?.bottom ?? 10,
        left: 15,
        right: 15
      };

      // --- Title ---
      const titleY = startY + 5;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(37, 99, 235);
      doc.text("STOCK ADJUSTMENT SLIP", pageWidth / 2, titleY, { align: "center" });

      doc.setDrawColor(37, 99, 235);
      doc.setLineWidth(0.5);
      doc.line(pageWidth / 2 - 40, titleY + 3, pageWidth / 2 + 40, titleY + 3);

      // --- Metadata Section ---
      const metaY = titleY + 10;
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);

      // Left Column
      doc.setFont("helvetica", "bold");
      doc.text("Document No:", margins.left, metaY);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      doc.text(values.doc_no || "-", margins.left + 30, metaY);

      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "bold");
      doc.text("Date Created:", margins.left, metaY + 6);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      const dateStr = values.postedAt || getPhCurrentTimestamp();
      doc.text(formatPhDateTime(dateStr, { formatType: "pdf" }), margins.left + 30, metaY + 6);

      // Right Column
      const rightColX = pageWidth / 2 + 10;
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "bold");
      doc.text("Branch:", rightColX, metaY);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(15, 23, 42);
      const branchObj = branches.find(b => b.id === Number(values.branch_id));
      const branchName = branchObj ? branchObj.branch_name : "Main Warehouse";
      doc.text(String(branchName).toUpperCase(), rightColX + 35, metaY);

      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "bold");
      doc.text("Adjustment Type:", rightColX, metaY + 6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(values.type === "IN" ? 22 : 185, values.type === "IN" ? 101 : 28, values.type === "IN" ? 52 : 28);
      const adjTypeFull = values.type === "IN" ? "Stock In" : values.type === "OUT" ? "Stock Out" : (values.type || "-");
      doc.text(adjTypeFull, rightColX + 35, metaY + 6);

      // --- Product Table (Hierarchical: Product Line -> Lot -> Batches) ---
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tableRows: any[] = [];
      let rowNumber = 1;
      values.items?.forEach((item) => {
        const price = Number(item.cost_per_unit || 0);
        const itemQty = Number(item.quantity || 0);
        const totalAmount = itemQty * price;
        const brandName = item.brand_name || "—";
        const productName = `${item.product_name || "Unknown Product"}${item.product_code ? `\n(${item.product_code})` : ""}`;
        const uomName = item.unit_name || "pcs";
        const classification = resolveProductClassification(
          item.product_type || (typeof item.product_id === "object" ? (item.product_id as { product_type?: unknown })?.product_type : undefined),
          item.product_category || item.category_name || (typeof item.product_id === "object" ? (item.product_id as { product_category?: unknown; category_name?: string })?.product_category || (item.product_id as { category_name?: string })?.category_name : undefined),
          (item.product_code || (typeof item.product_id === "object" ? (item.product_id as { product_code?: string })?.product_code : undefined)) ?? undefined,
          (item.product_name || (typeof item.product_id === "object" ? (item.product_id as { product_name?: string; description?: string })?.description || (item.product_id as { product_name?: string })?.product_name : undefined)) ?? undefined
        );
        const productType = classification.label || "Finished Good";

        // Row 1: Product Header Row
        tableRows.push([
          { content: String(rowNumber++), styles: { halign: "center", fontStyle: "bold", fillColor: [241, 245, 249] } },
          { content: brandName, styles: { halign: "left", fontStyle: "bold", fillColor: [241, 245, 249] } },
          { content: productName, styles: { halign: "left", fontStyle: "bold", fillColor: [241, 245, 249] } },
          { content: String(productType), styles: { halign: "center", fontStyle: "bold", fillColor: [241, 245, 249] } },
          { content: uomName, styles: { halign: "center", fontStyle: "bold", fillColor: [241, 245, 249] } },
          { content: `PHP ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, styles: { halign: "right", fontStyle: "bold", fillColor: [241, 245, 249] } },
          { content: `PHP ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, styles: { halign: "right", fontStyle: "bold", fillColor: [241, 245, 249] } },
          { content: itemQty.toLocaleString(), styles: { halign: "center", fontStyle: "bold", fillColor: [241, 245, 249] } },
        ]);

        // Check for multi-lot allocations
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lotAllocations = (item as unknown as { lot_allocations?: any[] }).lot_allocations || [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allocations = (item as unknown as { allocations?: any[] }).allocations || [];

        if (lotAllocations.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          lotAllocations.forEach((lg: any) => {
            const lotName = lg.lot_name || (lg.lot_id ? `Lot #${lg.lot_id}` : "Unassigned Lot");
            const batches = lg.batches || [];
            const lotGroupTotal =
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              batches.reduce((sum: number, b: any) => sum + (Number(b.quantity) || 0), 0) ||
              Number(lg.allocated_quantity || 0);

            // Row 2: Lot Row
            tableRows.push([
              { content: "", styles: { fillColor: [248, 250, 252] } },
              {
                content: `  Storage Lot: ${lotName} (Lot Total: ${Number(lotGroupTotal).toLocaleString()} ${uomName})`,
                colSpan: 7,
                styles: { halign: "left", fontStyle: "bold", textColor: [37, 99, 235], fillColor: [248, 250, 252] },
              },
            ]);

            // Row 3: Discrete Batches
            if (batches.length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              batches.forEach((b: any) => {
                const bCost = b.unit_cost !== undefined ? Number(b.unit_cost) : price;
                const bQty = Number(b.quantity || 0);
                const bTotal = bQty * bCost;
                const mfgStr = b.manufacturing_date ? ` | Mfg: ${String(b.manufacturing_date).substring(0, 10)}` : "";
                const expStr = b.expiry_date ? ` | Exp: ${String(b.expiry_date).substring(0, 10)}` : "";
                const qaStr = b.qa_status ? ` | QA: ${b.qa_status}` : "";

                tableRows.push([
                  { content: "" },
                  {
                    content: `      • Batch: ${b.batch_no || "N/A"}${mfgStr}${expStr}${qaStr}`,
                    colSpan: 4,
                    styles: { halign: "left", textColor: [51, 65, 85] },
                  },
                  {
                    content: `PHP ${bCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    styles: { halign: "right", textColor: [71, 85, 105] },
                  },
                  {
                    content: `PHP ${bTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    styles: { halign: "right", textColor: [71, 85, 105] },
                  },
                  {
                    content: bQty.toLocaleString(),
                    styles: { halign: "center", textColor: [71, 85, 105] },
                  },
                ]);
              });
            }
          });
        } else if (allocations.length > 0) {
          // Group allocations by lot
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lotMap = new Map<string, any[]>();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          allocations.forEach((alloc: any) => {
            const lotKey = alloc.lot_name || (alloc.lot_id ? `Lot #${alloc.lot_id}` : "Unassigned Lot");
            if (!lotMap.has(lotKey)) lotMap.set(lotKey, []);
            lotMap.get(lotKey)!.push(alloc);
          });

          lotMap.forEach((allocs, lotName) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const lotTotal = allocs.reduce((sum: number, a: any) => sum + Number(a.allocated_quantity || a.quantity || 0), 0);
            tableRows.push([
              { content: "", styles: { fillColor: [248, 250, 252] } },
              {
                content: `  Storage Lot: ${lotName} (Lot Total: ${Number(lotTotal).toLocaleString()} ${uomName})`,
                colSpan: 7,
                styles: { halign: "left", fontStyle: "bold", textColor: [37, 99, 235], fillColor: [248, 250, 252] },
              },
            ]);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            allocs.forEach((alloc: any) => {
              const aQty = Number(alloc.allocated_quantity || alloc.quantity || 0);
              const aCost = alloc.unit_cost !== undefined ? Number(alloc.unit_cost) : price;
              const aTotal = aQty * aCost;
              const mfgStr = alloc.manufacturing_date ? ` | Mfg: ${String(alloc.manufacturing_date).substring(0, 10)}` : "";
              const expStr = alloc.expiry_date ? ` | Exp: ${String(alloc.expiry_date).substring(0, 10)}` : "";
              const qaStr = alloc.qa_status ? ` | QA: ${alloc.qa_status}` : "";

              tableRows.push([
                { content: "" },
                {
                  content: `      • Batch: ${alloc.batch_no || "N/A"}${mfgStr}${expStr}${qaStr}`,
                  colSpan: 4,
                  styles: { halign: "left", textColor: [51, 65, 85] },
                },
                {
                  content: `PHP ${aCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                  styles: { halign: "right", textColor: [71, 85, 105] },
                },
                {
                  content: `PHP ${aTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                  styles: { halign: "right", textColor: [71, 85, 105] },
                },
                {
                  content: aQty.toLocaleString(),
                  styles: { halign: "center", textColor: [71, 85, 105] },
                },
              ]);
            });
          });
        } else {
          // Single lot and batch direct assignment
          const lotName = item.lot_name || (item.lot_id ? `Lot #${item.lot_id}` : "Unassigned Lot");
          const batchNo = item.batch_no || "N/A";
          const mfgStr = item.manufacturing_date ? ` | Mfg: ${String(item.manufacturing_date).substring(0, 10)}` : "";
          const expStr = item.expiry_date ? ` | Exp: ${String(item.expiry_date).substring(0, 10)}` : "";
          const qaStr = item.qa_status ? ` | QA: ${item.qa_status}` : "";

          // Row 2: Lot Row
          tableRows.push([
            { content: "", styles: { fillColor: [248, 250, 252] } },
            {
              content: `  Storage Lot: ${lotName} (Lot Total: ${Number(itemQty).toLocaleString()} ${uomName})`,
              colSpan: 7,
              styles: { halign: "left", fontStyle: "bold", textColor: [37, 99, 235], fillColor: [248, 250, 252] },
            },
          ]);

          // Row 3: Batch Row
          tableRows.push([
            { content: "" },
            {
              content: `      • Batch: ${batchNo}${mfgStr}${expStr}${qaStr}`,
              colSpan: 4,
              styles: { halign: "left", textColor: [51, 65, 85] },
            },
            {
              content: `PHP ${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              styles: { halign: "right", textColor: [71, 85, 105] },
            },
            {
              content: `PHP ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
              styles: { halign: "right", textColor: [71, 85, 105] },
            },
            {
              content: itemQty.toLocaleString(),
              styles: { halign: "center", textColor: [71, 85, 105] },
            },
          ]);
        }
      });

      // Dynamic bottom margin
      const baseSize = config.paperSize === "Custom" ? config.customSize : (PAPER_SIZES[config.paperSize] || PAPER_SIZES.A4);
      const paperHeight = config.orientation === "landscape" ? baseSize.width : baseSize.height;
      const bottomMargin = config.bodyEnd ? (paperHeight - config.bodyEnd) : margins.bottom;

      autoTable(doc, {
        startY: metaY + 12,
        margin: { ...margins, bottom: bottomMargin },
        head: [["#", "Brand", "Product Name", "Product Type", "UOM", "Unit Price", "Total Amount", "Qty"]],
        body: tableRows,
        headStyles: { fillColor: [248, 250, 252], textColor: [71, 85, 105], fontSize: 8, fontStyle: "bold" },
        bodyStyles: { fontSize: 7, textColor: [30, 41, 59] },
        columnStyles: {
          0: { halign: "center", cellWidth: 8 },
          1: { halign: "left", cellWidth: 20 },
          2: { halign: "left" },
          3: { halign: "center", cellWidth: 22 },
          4: { halign: "center", cellWidth: 14 },
          5: { halign: "right", cellWidth: 22 },
          6: { halign: "right", fontStyle: "bold", cellWidth: 24 },
          7: { halign: "center", fontStyle: "bold", cellWidth: 14 }
        },
        theme: "grid",
        styles: { cellPadding: 1.5 }
      });

      const finalY = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 100) + 8;

      // --- Totals & Remarks Section ---
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "normal");
      doc.text("Total Adjusted Amount", pageWidth - margins.right, finalY, { align: "right" });

      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "bold");
      doc.text("REMARKS:", margins.left, finalY);
      doc.setFontSize(7);
      doc.setFont("helvetica", "italic");
      doc.setTextColor(30, 41, 59);
      const remarks = values.remarks || "N/A";
      const splitRemarks = doc.splitTextToSize(remarks.toUpperCase(), 100);
      doc.text(splitRemarks, margins.left, finalY + 5);

      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 58, 138);
      const totalAmountSum = values.items?.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.cost_per_unit || 0)), 0) || 0;
      const formattedAmount = totalAmountSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      doc.text(`PHP ${formattedAmount}`, pageWidth - margins.right, finalY + 7, { align: "right" });

      // --- Signatures Section ---
      let sigY = finalY + 25;

      if (sigY + 20 > paperHeight) {
        doc.addPage();
        sigY = 30;
      }

      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(margins.left, sigY - 5, pageWidth - margins.right, sigY - 5);

      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "bold");
      doc.setLineWidth(0.2);
      doc.setDrawColor(148, 163, 184);

      // Created By
      doc.text("CREATED BY:", margins.left, sigY);
      doc.line(margins.left, sigY + 12, margins.left + 50, sigY + 12);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(currentUserName, margins.left, sigY + 10);
 
      // Posted By
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "bold");
      doc.setLineWidth(0.2);
      doc.setDrawColor(148, 163, 184);
      doc.text("POSTED BY:", pageWidth - margins.right - 50, sigY);
      doc.line(pageWidth - margins.right - 50, sigY + 12, pageWidth - margins.right, sigY + 12);
      
    });

    doc.save(`StockAdjustmentManual_${values.doc_no}.pdf`);
  }, [branches, companyData, form, userFullName]);


  // ——————————————————————————————————————————————————————————————————————————————
  // Targeted modal cleanup: when a modal closes, cleanly restore document.body styles without continuous DOM observer thrashing
  const anyModalOpen =
    isModalOpen ||
    lotBatchModalOpen ||
    showPostConfirmation ||
    showDeleteConfirmation ||
    showUnsavedChangesModal;

  const prevAnyModalOpenRef = useRef(false);

  useEffect(() => {
    // Only run cleanup when a modal was previously open and is now closed
    if (prevAnyModalOpenRef.current && !anyModalOpen) {
      const cleanBodyStyles = () => {
        if (typeof document !== 'undefined') {
          if (document.body.style.pointerEvents === 'none') {
            document.body.style.removeProperty('pointer-events');
          }
          if (document.body.style.overflow === 'hidden') {
            document.body.style.removeProperty('overflow');
          }
        }
      };

      const raf = requestAnimationFrame(cleanBodyStyles);
      const timer = setTimeout(cleanBodyStyles, 120);

      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
    prevAnyModalOpenRef.current = anyModalOpen;
  }, [anyModalOpen]);

  // Memoized modal props to prevent re-instantiating arrays/objects and triggering endless fetch loops in LotBatchSelectionModal
  const activeItem = useMemo(() => {
    if (activeLotBatchIndex === null) return null;
    const allItems = form.getValues("items") || [];
    return allItems[activeLotBatchIndex] || null;
  }, [activeLotBatchIndex, form]);

  const modalExistingFormAllocations = useMemo(() => {
    if (activeLotBatchIndex === null || !lotBatchModalOpen) return undefined;
    const allItems = form.getValues("items") || [];
    return allItems.filter((_, idx) => idx !== activeLotBatchIndex);
  }, [activeLotBatchIndex, lotBatchModalOpen, form]);

  const modalInitialValues = useMemo(() => {
    if (!activeItem || !lotBatchModalOpen) return undefined;
    return {
      lot_id: activeItem.lot_id || undefined,
      lot_name: activeItem.lot_name || undefined,
      inventory_lot_id: activeItem.inventory_lot_id || undefined,
      batch_no: activeItem.batch_no || '',
      manufacturing_date: activeItem.manufacturing_date,
      expiry_date: activeItem.expiry_date,
      unit_cost: activeItem.cost_per_unit || undefined,
      qa_status: activeItem.qa_status || 'GOOD',
      quantity: Number(activeItem.quantity) || 0,
    };
  }, [activeItem, lotBatchModalOpen]);

  const modalInitialAllocations = useMemo(() => {
    if (!activeItem || !lotBatchModalOpen) return undefined;
    if (activeItem.allocations && (activeItem.allocations as unknown[]).length > 0) {
      return activeItem.allocations as BatchAllocationResult[];
    }
    if (activeItem.batch_no && (activeItem.inventory_lot_id || activeItem.lot_id)) {
      return [
        {
          inventory_lot_id: Number(activeItem.inventory_lot_id) || 1,
          lot_id: Number(activeItem.lot_id) || 1,
          batch_no: activeItem.batch_no,
          allocated_quantity: Number(activeItem.quantity) || 1,
          available_quantity: Number(activeItem.current_stock || activeItem.quantity) || 1,
          status: "ACTIVE",
          qa_status: activeItem.qa_status || "GOOD",
        } as BatchAllocationResult,
      ];
    }
    return undefined;
  }, [activeItem, lotBatchModalOpen]);

  useEffect(() => {
    if (id) {
      const loadData = async () => {
        setLoading(true);
        try {
          const data = await fetchById(id);

          // --- Auto-Infer Supplier ID ---
          let finalSupplierId = data.supplier_id
            ? (typeof data.supplier_id === "object" ? (data.supplier_id as { id: number }).id : data.supplier_id)
            : 0;

          // If header supplier is missing, try to get it from the first item with an inferred supplier
          // If header supplier is missing, try to get it from the first item with an inferred supplier
          if (!finalSupplierId && data.items && data.items.length > 0) {
            const firstWithInferred = data.items.find((item) => (item as StockAdjustmentManualItem).inferred_supplier_id);
            if (firstWithInferred) {
              finalSupplierId = (firstWithInferred as StockAdjustmentManualItem).inferred_supplier_id || 0;
            }
          }

          // Robust check for isPosted (handles boolean, number, string, or Directus Buffer)
          const resolvedIsPosted = isPostedStatus(data.isPosted);

          const resolvedInventoryType =
            data.inventory_type || (finalSupplierId ? "RAW_MATERIALS" : "FINISHED_GOODS");

          const resetObj = {
            doc_no: data.doc_no,
            branch_id:
              typeof data.branch_id === "object"
                ? data.branch_id?.id
                : (data.branch_id || 0),
            inventory_type: resolvedInventoryType,
            supplier_id: finalSupplierId,
            type: data.type,
            remarks: data.remarks || "",
            isPosted: resolvedIsPosted,
            postedAt: data.postedAt || "",
            items: data.items.map((item) => ({
              ...item,
              product_id: Number(
                (item.product_id as { id?: number; product_id?: number })?.id ||
                (item.product_id as { id?: number; product_id?: number })?.product_id ||
                item.product_id
              ),
              unit_id: item.unit_id
                ? (typeof item.unit_id === "object" ? (item.unit_id as { unit_id?: number; id?: number })?.unit_id || (item.unit_id as { unit_id?: number; id?: number })?.id : Number(item.unit_id))
                : (item.product_id as { unit_id?: number; unit_of_measurement?: { unit_id?: number } })?.unit_of_measurement?.unit_id || (item.product_id as { unit_id?: number })?.unit_id || undefined,
              product_name:
                (item.product_id as { description?: string; product_name?: string })?.description ||
                (item.product_id as { description?: string; product_name?: string })?.product_name ||
                item.product_name ||
                "Unknown Product",
              product_code:
                (item.product_id as { product_code?: string })?.product_code ||
                item.product_code ||
                "",
              cost_per_unit:
                (item.product_id as { cost_per_unit?: number; price_per_unit?: number })?.cost_per_unit ||
                (item.product_id as { cost_per_unit?: number; price_per_unit?: number })?.price_per_unit ||
                item.cost_per_unit ||
                0,
              current_stock: item.current_stock || 0,
              unit_name:
                item.unit_name ||
                (item.product_id as { unit_name?: string })?.unit_name ||
                "pcs",
              product_type: (item.product_id as { product_type?: unknown })?.product_type || item.product_type,
              product_category: (item.product_id as { product_category?: unknown })?.product_category || item.product_category,
              category_name:
                (item.product_id as { product_category?: { category_name?: string } })?.product_category?.category_name ||
                (item.product_id as { category_name?: string })?.category_name ||
                item.category_name,
              unit_order: (item.product_id as { unit_of_measurement?: { order: number } })?.unit_of_measurement?.order || 1,
              db_id: item.id,
            })),
            posted_by: data.posted_by,
            stock_adjustment_attachment: data.stock_adjustment_attachment || [],
          };

          form.reset(resetObj);
          initialValuesRef.current = JSON.stringify(resetObj);
        } catch (error) {
          toast.error("Failed to load adjustment details");
          console.error("Load error:", error);
        } finally {
          setLoading(false);
        }
      };
      loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ——————————————————————————————————————————————————————————————————————————————
  // Auto-populate combobox display labels when editing (branch & supplier)
  // Runs whenever branches/suppliers load OR when the form values change.
  const watchedBranchId = useWatch({ control: form.control, name: "branch_id" });
  const watchedSupplierId = useWatch({ control: form.control, name: "supplier_id" });
  const watchedInventoryType = useWatch({ control: form.control, name: "inventory_type" });

  useEffect(() => {
    if (watchedBranchId) {
      fetchBranchInventory(Number(watchedBranchId));
    }
  }, [watchedBranchId, fetchBranchInventory]);

  useEffect(() => {
    if (!id) {
      const defaultVal = {
        doc_no: form.getValues("doc_no") || "",
        branch_id: 0,
        inventory_type: "" as unknown as "FINISHED_GOODS",
        supplier_id: 0,
        type: "IN",
        remarks: "",
        items: [],
        isPosted: false,
        stock_adjustment_attachment: [],
      };
      initialValuesRef.current = JSON.stringify(defaultVal);
    }
  }, [id, form]);

  // ——————————————————————————————————————————————————————————————————————————————
  useEffect(() => {
    if (!id) {
      const updateDocNo = async () => {
        const type = form.getValues("type");
        const nextDocNo = await fetchNextDocNo(type);
        form.setValue("doc_no", nextDocNo, { shouldValidate: true });
        try {
          const current = JSON.parse(initialValuesRef.current || "{}");
          current.doc_no = nextDocNo;
          initialValuesRef.current = JSON.stringify(current);
        } catch { }
      };
      updateDocNo();
    }
  }, [id, fetchNextDocNo, form]);

  // ——————————————————————————————————————————————————————————————————————————————
  const watchedTypeToUpdateDocNo = useWatch({ control: form.control, name: "type" });
  useEffect(() => {
    if (!id && watchedTypeToUpdateDocNo) {
      const updateDocNo = async () => {
        const nextDocNo = await fetchNextDocNo(watchedTypeToUpdateDocNo);
        form.setValue("doc_no", nextDocNo);
        try {
          const current = JSON.parse(initialValuesRef.current || "{}");
          current.doc_no = nextDocNo;
          initialValuesRef.current = JSON.stringify(current);
        } catch { }
      };
      updateDocNo();
    }
  }, [id, watchedTypeToUpdateDocNo, fetchNextDocNo, form]);

  // ——————————————————————————————————————————————————————————————————————————————
  useEffect(() => {
    if (watchedInventoryType === "FINISHED_GOODS") {
      fetchFinishedGoodsProducts();
    } else if (watchedSupplierId) {
      fetchProductsBySupplier(Number(watchedSupplierId));
    }
  }, [watchedInventoryType, watchedSupplierId, fetchFinishedGoodsProducts, fetchProductsBySupplier]);

  // ——————————————————————————————————————————————————————————————————————————————
  const isFormLoading = id ? loading : false;
  const isPosted = useWatch({ control: form.control, name: "isPosted" });
  const isReadOnly = !!isPosted;

  // ——————————————————————————————————————————————————————————————————————————————
  const handlePost = async () => {
    if (!id) return;
    // Validate the form before showing the confirmation dialog
    const isValid = await form.trigger();
    if (!isValid) {
      toast.error("Please fill in all required fields correctly before posting.");
      return;
    }

    const currentValues = form.getValues();

    const invalidQtyItem = (currentValues.items || []).find(
      (item) => item.quantity == null || isNaN(Number(item.quantity)) || Number(item.quantity) <= 0
    );
    if (invalidQtyItem) {
      toast.error(
        `Invalid Quantity: Product "${invalidQtyItem.product_name || "Unknown"}" has null or 0 quantity. Please enter a valid quantity before posting.`,
        { duration: 5000 }
      );
      return;
    }

    const unassignedIdx = (currentValues.items || []).findIndex(
      (item) => !item.lot_id || !item.batch_no || String(item.batch_no).trim() === ""
    );
    if (unassignedIdx !== -1) {
      const item = currentValues.items[unassignedIdx];
      toast.error(
        `Lot & Batch required: Please assign Lot & Batch details for item #${unassignedIdx + 1} (${item.product_name || "Product"}) before posting.`,
        { duration: 5000 }
      );
      return;
    }

    setShowPostConfirmation(true);
  };

  const confirmPost = async () => {
    setShowPostConfirmation(false);
    if (!id) return;
    setLoading(true);
    try {
      // Auto-save all pending edits (products, qty, attachments) before posting
      const currentValues = form.getValues();
      await updateAdjustment(id, currentValues);
      await postAdjustment(id);
      toast.success("Adjustment Posted Successfully");
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to post adjustment");
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    setShowDeleteConfirmation(false);
    if (!id) return;
    setLoading(true);
    try {
      await deleteAdjustment(id);
      toast.success("Adjustment Deleted Successfully");
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete adjustment");
    } finally {
      setLoading(false);
    }
  };

  const onInvalid = (errors: FieldErrors<StockAdjustmentManualFormValues>) => {
    console.warn("Validation failed errors:", errors);
    const messages: string[] = [];

    if (errors.branch_id?.message) {
      messages.push(String(errors.branch_id.message));
    }
    if (errors.inventory_type?.message) {
      messages.push(String(errors.inventory_type.message));
    }
    if (errors.supplier_id?.message) {
      messages.push(String(errors.supplier_id.message));
    }
    if (errors.stock_adjustment_attachment?.message) {
      messages.push(String(errors.stock_adjustment_attachment.message));
    }
    if (Array.isArray(errors.items)) {
      errors.items.forEach((itemErr) => {
        if (itemErr?.batch_no?.message) {
          messages.push(String(itemErr.batch_no.message));
        }
      });
    }

    const description = messages.filter(Boolean).join(", ");
    toast.error("Please fill in all required fields correctly.", {
      description: description || undefined,
      duration: 6000,
    });
  };

  const isFormModified = useCallback(() => {
    if (isReadOnly) return false;
    if (form.formState.isDirty) return true;

    try {
      const current = form.getValues();
      const initialStr = initialValuesRef.current;
      if (!initialStr) return false;

      const initial = JSON.parse(initialStr);

      if (Number(current.branch_id) !== Number(initial.branch_id)) return true;
      if (current.inventory_type !== initial.inventory_type) return true;
      if (Number(current.supplier_id) !== Number(initial.supplier_id)) return true;
      if (current.type !== initial.type) return true;
      if ((current.remarks || "") !== (initial.remarks || "")) return true;

      const currentItems = current.items || [];
      const initialItems = initial.items || [];
      if (currentItems.length !== initialItems.length) return true;

      for (let i = 0; i < currentItems.length; i++) {
        const cItem = currentItems[i];
        const iItem = initialItems[i];
        if (Number(cItem?.product_id) !== Number(iItem?.product_id)) return true;
        if (Number(cItem?.quantity) !== Number(iItem?.quantity)) return true;
      }

      const currentAtts = current.stock_adjustment_attachment || [];
      const initialAtts = initial.stock_adjustment_attachment || [];
      if (currentAtts.length !== initialAtts.length) return true;
      for (let i = 0; i < currentAtts.length; i++) {
        const cAtt = typeof currentAtts[i]?.attachment === 'object' ? currentAtts[i].attachment.id : currentAtts[i]?.attachment;
        const iAtt = typeof initialAtts[i]?.attachment === 'object' ? initialAtts[i].attachment.id : initialAtts[i]?.attachment;
        if (cAtt !== iAtt) return true;
      }
    } catch (e) {
      console.error("Error checking form modifications:", e);
    }

    return false;
  }, [form, isReadOnly]);

  const handleCancelOrExit = useCallback((action: string | (() => void) | undefined) => {
    if (isFormModified()) {
      setPendingExitAction(() => action || null);
      setShowUnsavedChangesModal(true);
    } else {
      if (typeof action === "function") {
        action();
      } else if (typeof action === "string") {
        router.push(action);
      } else {
        router.push("/mm/inventory-warehousing/adjustments/stock-adjustment/stock-adjustment-summary");
      }
    }
  }, [isFormModified, router]);

  const confirmDiscardAndExit = useCallback(() => {
    setShowUnsavedChangesModal(false);
    if (typeof pendingExitAction === "function") {
      pendingExitAction();
    } else if (typeof pendingExitAction === "string") {
      router.push(pendingExitAction);
    } else {
      router.push("/mm/inventory-warehousing/adjustments/stock-adjustment/stock-adjustment-summary");
    }
    setPendingExitAction(null);
  }, [pendingExitAction, router]);

  const handleSaveAndExit = useCallback(async () => {
    setShowUnsavedChangesModal(false);
    await form.handleSubmit(
      async (values: StockAdjustmentManualFormValues) => {
        const unassignedIdx = (values.items || []).findIndex(
          (item) => !item.lot_id || !item.batch_no || String(item.batch_no).trim() === ""
        );
        if (unassignedIdx !== -1) {
          const item = values.items[unassignedIdx];
          toast.error(
            `Lot & Batch required: Please assign Lot & Batch details for item #${unassignedIdx + 1} (${item.product_name || "Product"}).`,
            { duration: 5000 }
          );
          return;
        }

        setLoading(true);
        try {
          if (id) {
            await updateAdjustment(id, values);
            toast.success("Adjustment Saved Successfully");
          } else {
            let finalValues = values;
            const expectedPrefix = values.type === "OUT" ? "SAOUT" : "SAIN";
            if (!values.doc_no || !values.doc_no.startsWith(expectedPrefix)) {
              const correctDocNo = await fetchNextDocNo(values.type);
              if (correctDocNo) {
                finalValues = { ...values, doc_no: correctDocNo };
                form.setValue("doc_no", correctDocNo);
              }
            }
            await createAdjustment(finalValues);
            toast.success("Adjustment Created Successfully");
          }
          initialValuesRef.current = JSON.stringify(values);

          if (typeof pendingExitAction === "function") {
            pendingExitAction();
          } else if (typeof pendingExitAction === "string") {
            router.push(pendingExitAction);
          } else {
            router.push("/mm/inventory-warehousing/adjustments/stock-adjustment/stock-adjustment-summary");
          }
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : "Failed to save adjustment";
          toast.error(message);
        } finally {
          setLoading(false);
          setPendingExitAction(null);
        }
      },
      onInvalid
    )();
  }, [id, createAdjustment, updateAdjustment, router, form, pendingExitAction, fetchNextDocNo]);

  // ——————————————————————————————————————————————————————————————————————————————
  const onSubmit = useCallback(
    async (values: StockAdjustmentManualFormValues) => {
      const itemsList = values.items || [];

      // 1. Lot & Batch Assignment Validation
      const unassignedIdx = itemsList.findIndex(
        (item) => !item.lot_id || !item.batch_no || String(item.batch_no).trim() === ""
      );
      if (unassignedIdx !== -1) {
        const item = itemsList[unassignedIdx];
        toast.error(
          `Lot & Batch required: Please assign Lot & Batch details for item #${unassignedIdx + 1} (${item.product_name || "Product"}).`,
          { duration: 5000 }
        );
        return;
      }

      // 2. Quantity vs Allocated Batches Validation
      for (let i = 0; i < itemsList.length; i++) {
        const item = itemsList[i];
        const lineQty = Number(item.quantity || 0);

        if (Array.isArray(item.lot_allocations) && item.lot_allocations.length > 0) {
          const allocatedSum = item.lot_allocations.reduce((sum, g) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return sum + (g.batches || []).reduce((bSum: number, b: any) => bSum + Number(b.quantity || 0), 0);
          }, 0);

          if (lineQty !== allocatedSum) {
            toast.error(
              `Quantity mismatch on line #${i + 1} (${item.product_name || "Product"}): Table quantity (${lineQty.toLocaleString()}) does not match allocated batches sum (${allocatedSum.toLocaleString()}). Please open the allocation modal to update batches or adjust the table quantity.`,
              { duration: 6000 }
            );
            return;
          }
        } else if (Array.isArray(item.allocations) && item.allocations.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const allocatedSum = item.allocations.reduce((sum: number, a: any) => sum + Number(a.allocated_quantity || a.quantity || 0), 0);
          if (lineQty !== allocatedSum) {
            toast.error(
              `Quantity mismatch on line #${i + 1} (${item.product_name || "Product"}): Table quantity (${lineQty.toLocaleString()}) does not match allocated quantity (${allocatedSum.toLocaleString()}). Please update allocations.`,
              { duration: 6000 }
            );
            return;
          }
        }
      }

      setLoading(true);
      try {
        if (id) {
          await updateAdjustment(id, values);
          toast.success("Adjustment Updated Successfully");
          initialValuesRef.current = JSON.stringify(values);
          onSuccess?.();
        } else {
          let finalValues = values;
          const expectedPrefix = values.type === "OUT" ? "SAOUT" : "SAIN";
          if (!values.doc_no || !values.doc_no.startsWith(expectedPrefix)) {
            const correctDocNo = await fetchNextDocNo(values.type);
            if (correctDocNo) {
              finalValues = { ...values, doc_no: correctDocNo };
              form.setValue("doc_no", correctDocNo);
            }
          }
          await createAdjustment(finalValues);
          toast.success("Adjustment Created Successfully");
          await handleClearForm();
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to save adjustment";
        toast.error(message);
      } finally {
        setLoading(false);
      }
    },
    [id, createAdjustment, updateAdjustment, onSuccess, handleClearForm, fetchNextDocNo, form]
  );

  // ——————————————————————————————————————————————————————————————————————————————
  // handleConfirmModalItems — applies modal cart state to form
  const handleConfirmModalItems = useCallback(
    (newItems: StockAdjustmentManualItem[]) => {
      const branchId = form.getValues("branch_id");
      const currentType = form.getValues("type");

      const mapped = newItems.map((item) => ({
        ...item,
        branch_id: branchId,
        type: currentType
      }));

      form.setValue("items", mapped, { shouldValidate: true });

      // Async stock fetch
      mapped.forEach((item, idx) => {
        const pid = Number(item.product_id);
        const cachedStock = inventoryMap.get(pid) ?? 0;
        if (cachedStock === 0) {
          fetchInventory(pid, branchId).then(stock => {
            form.setValue(`items.${idx}.current_stock`, stock);
          }).catch(console.error);
        } else {
          form.setValue(`items.${idx}.current_stock`, cachedStock);
        }
      });
    },
    [form, fetchInventory, inventoryMap]
  );



  const watchedBranchIdForSelect = useWatch({ control: form.control, name: "branch_id" });
  const watchedSupplierIdForSelect = useWatch({ control: form.control, name: "supplier_id" });
  const watchedType = useWatch({ control: form.control, name: "type" });
  const watchedDocNo = useWatch({ control: form.control, name: "doc_no" });
  const watchedAttachments = useWatch({ control: form.control, name: "stock_adjustment_attachment" });
  const watchedPostedAt = useWatch({ control: form.control, name: "postedAt" });
  const watchedPostedBy = useWatch({ control: form.control, name: "posted_by" });

  const watchedItemsList = useWatch({ control: form.control, name: "items" });

  const filteredFields = useMemo(() => {
    return fields.map((field, index) => ({ field, index })).filter(({ index }) => {
      if (!tableSearch.trim()) return true;
      const s = tableSearch.toLowerCase();
      const item = watchedItemsList?.[index];
      return (
        item?.product_name?.toLowerCase().includes(s) ||
        item?.product_code?.toLowerCase().includes(s) ||
        item?.barcode?.toLowerCase().includes(s) ||
        item?.brand_name?.toLowerCase().includes(s)
      );
    });
  }, [fields, tableSearch, watchedItemsList]);

  const totalPages = Math.max(1, Math.ceil(filteredFields.length / rowsPerPage));
  const paginatedFields = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredFields.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredFields, currentPage, rowsPerPage]);

  // Ensure current page is valid when filtering changes total pages
  useEffect(() => {
    if (currentPage > totalPages) {
      queueMicrotask(() => {
        setCurrentPage(totalPages);
      });
    }
  }, [totalPages, currentPage]);

  return (
    <div className="flex flex-col gap-6 p-8 max-w-7xl mx-auto w-full bg-background">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="bg-primary p-2 rounded-lg shadow-sm">
            <Package className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground leading-tight">
              Stock Adjustment Manual Registration
            </h2>
            <p className="text-xs text-muted-foreground font-medium">
              Inventory Management System
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {id && (
            <Button
              type="button"
              variant="outline"
              onClick={generatePDF}
              className="gap-2 h-10 border-border bg-card shadow-sm font-bold text-muted-foreground hover:bg-muted rounded-lg transition-all"
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
          )}
          {onCancel && (
            <Button
              variant="outline"
              onClick={() => handleCancelOrExit(onCancel)}
              className="gap-2 h-10 border-border bg-card shadow-sm font-bold text-muted-foreground hover:bg-muted rounded-lg"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to List
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 mb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {id ? "Edit Stock Adjustment" : "New Stock Adjustment Registrations"}
          </h1>
          {id && (
            <Badge
              variant="outline"
              className={`px-3 py-1 font-bold shadow-sm ${isPosted
                ? 'bg-blue-50 dark:bg-blue-900/20 text-primary/90 dark:blue-400 border-primary/20 dark:border-blue-800/50 uppercase tracking-wider'
                : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:amber-400 border-amber-200 dark:border-amber-800/50 uppercase tracking-wider'
                }`}
            >
              {isPosted ? 'Posted' : 'Draft / Unposted'}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Record stock movement and adjust inventory levels
        </p>

        {isPosted && (
          <div className="flex items-center gap-6 mt-2 animate-in fade-in slide-in-from-left-2 duration-300">
            <div className="flex items-center gap-2 bg-primary/5 dark:bg-blue-900/10 px-3 py-1.5 rounded-lg border border-primary/30 dark:border-blue-800/30">
              <span className="text-[10px] uppercase font-black text-primary/70">Posted At:</span>
              <span className="text-xs font-bold text-primary/90 dark:text-blue-300">
                {watchedPostedAt ? formatPhDateTime(watchedPostedAt) : "-"}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-primary/5 dark:bg-blue-900/10 px-3 py-1.5 rounded-lg border border-primary/30 dark:border-blue-800/30">
              <span className="text-[10px] uppercase font-black text-primary/70">Posted By:</span>
              <span className="text-xs font-bold text-primary/90 dark:text-blue-300">
                {(() => {
                  const postedBy = watchedPostedBy || form.getValues("posted_by");
                  if (typeof postedBy === 'object' && postedBy !== null) {
                    const fname = postedBy.user_fname || "";
                    const lname = postedBy.user_lname || "";
                    const fullName = `${fname} ${lname}`.trim();
                    return fullName || "System User";
                  }
                  return postedBy || "System User";
                })()}
              </span>
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          form.handleSubmit(onSubmit, onInvalid)(e);
        }}
        className="space-y-6"
      >
        <Card className="border-border shadow-sm bg-card">
          <CardHeader className="bg-card border-b border-border py-4 px-6">
            <CardTitle className="text-base font-bold text-foreground">
              Adjustment Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="doc_no" className="text-[10px] uppercase font-bold text-muted-foreground/60 tracking-wider font-sans px-0.5">
                  {unpostedList ? "Review Document" : "Document Number"}
                </Label>
                {unpostedList && onSelectId ? (
                  <Popover open={docOpen} onOpenChange={setDocOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={docOpen}
                        className="w-full h-11 justify-between text-xs font-bold bg-background border-input hover:bg-accent hover:text-accent-foreground px-3"
                      >
                        <span className="truncate">
                          {unpostedList.find((item) => String(item.id) === String(id))?.doc_no || watchedDocNo || "Select Document"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search document..." className="h-9 text-xs" />
                        <CommandList>
                          <CommandEmpty>No document found.</CommandEmpty>
                          <CommandGroup>
                            {unpostedList.map((item) => (
                              <CommandItem
                                key={item.id}
                                value={`${item.doc_no} ${item.id}`}
                                onSelect={() => {
                                  if (item.id) onSelectId(Number(item.id));
                                  setDocOpen(false);
                                }}
                                className="text-xs font-bold cursor-pointer"
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4 shrink-0",
                                    String(id) === String(item.id) ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {item.doc_no}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                ) : (
                  <Input
                    id="doc_no"
                    {...form.register("doc_no")}
                    value={watchedDocNo || ""}
                    readOnly
                    className="bg-muted/50 border-input h-11 text-xs font-semibold"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="branch" className="text-sm font-bold text-muted-foreground">
                  Branch <span className="text-red-500">*</span>
                </Label>
                <Popover open={branchOpen} onOpenChange={setBranchOpen}>
                  <div className="relative">
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={branchOpen}
                        disabled={isReadOnly || !!id || fields.length > 0}
                        className={cn(
                          "w-full h-11 justify-between text-xs font-bold bg-background border-input hover:bg-accent hover:text-accent-foreground px-3",
                          form.formState.errors.branch_id && "border-red-500 bg-red-50 dark:bg-red-900/10"
                        )}
                      >
                        <span className="truncate">
                          {(() => {
                            const b = branches.find((item) => Number(item.id) === Number(watchedBranchIdForSelect));
                            return b ? `${b.branch_name} (${b.branch_code || ""})` : "Select Branch";
                          })()}
                        </span>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {!id && !isReadOnly && fields.length === 0 && watchedBranchIdForSelect ? (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                form.setValue("branch_id", 0, { shouldValidate: true });
                              }}
                              className="p-0.5 rounded-sm hover:bg-muted text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </span>
                          ) : null}
                          <ChevronsUpDown className="h-4 w-4 opacity-50" />
                        </div>
                      </Button>
                    </PopoverTrigger>
                  </div>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search branch..." className="h-9 text-xs" />
                      <CommandList>
                        <CommandEmpty>No branches found.</CommandEmpty>
                        <CommandGroup>
                          {activeBranches.map((b) => {
                            const bCode = b.branch_code ?? "";
                            const isSelected = Number(watchedBranchIdForSelect) === Number(b.id);
                            return (
                              <CommandItem
                                key={b.id}
                                value={`${b.branch_name} ${bCode} ${b.id}`}
                                onSelect={() => {
                                  form.setValue("branch_id", Number(b.id), { shouldValidate: true });
                                  setBranchOpen(false);
                                }}
                                className="cursor-pointer text-xs"
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4 shrink-0",
                                    isSelected ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex items-center justify-between w-full">
                                  <span className="font-medium">{b.branch_name}</span>
                                  <span className="text-[10px] font-bold text-muted-foreground/40 font-mono">
                                    {bCode}
                                  </span>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {form.formState.errors.branch_id && (
                  <p className="text-xs text-red-500 font-medium">
                    {String(form.formState.errors.branch_id.message)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory_type" className="text-sm font-bold text-muted-foreground">
                  Inventory Type <span className="text-red-500">*</span>
                </Label>
                <Popover open={inventoryTypeOpen} onOpenChange={setInventoryTypeOpen}>
                  <div className="relative">
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={inventoryTypeOpen}
                        disabled={isReadOnly || !!id || fields.length > 0}
                        className={cn(
                          "w-full h-11 justify-between text-xs font-bold bg-background border-input hover:bg-accent hover:text-accent-foreground px-3",
                          form.formState.errors.inventory_type && "border-red-500 bg-red-50 dark:bg-red-900/10"
                        )}
                      >
                        <span className="truncate">
                          {(() => {
                            const found = INVENTORY_TYPES.find((t) => t.id === watchedInventoryType);
                            return found ? found.label : "Select Inventory Type";
                          })()}
                        </span>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {!id && !isReadOnly && fields.length === 0 && watchedInventoryType ? (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                form.setValue("inventory_type", "" as unknown as "FINISHED_GOODS", { shouldValidate: true });
                                form.setValue("items", []);
                                form.setValue("supplier_id", 0, { shouldValidate: true });
                              }}
                              className="p-0.5 rounded-sm hover:bg-muted text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </span>
                          ) : null}
                          <ChevronsUpDown className="h-4 w-4 opacity-50" />
                        </div>
                      </Button>
                    </PopoverTrigger>
                  </div>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search inventory type..." className="h-9 text-xs" />
                      <CommandList>
                        <CommandEmpty>No type found.</CommandEmpty>
                        <CommandGroup>
                          {INVENTORY_TYPES.map((t) => {
                            const isSelected = watchedInventoryType === t.id;
                            return (
                              <CommandItem
                                key={t.id}
                                value={`${t.label} ${t.id}`}
                                onSelect={() => {
                                  if (t.id !== watchedInventoryType) {
                                    form.setValue("inventory_type", t.id, { shouldValidate: true });
                                    form.setValue("items", []);
                                    if (t.id === "FINISHED_GOODS") {
                                      form.setValue("supplier_id", 0, { shouldValidate: true });
                                    }
                                  }
                                  setInventoryTypeOpen(false);
                                }}
                                className="cursor-pointer text-xs"
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4 shrink-0",
                                    isSelected ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span className="font-medium">{t.label}</span>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {form.formState.errors.inventory_type && (
                  <p className="text-xs text-red-500 font-medium">
                    {String(form.formState.errors.inventory_type.message)}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier" className="text-sm font-bold text-muted-foreground">
                  Supplier {watchedInventoryType === "RAW_MATERIALS" ? <span className="text-red-500">*</span> : null}
                </Label>
                <Popover open={supplierOpen} onOpenChange={setSupplierOpen}>
                  <div className="relative">
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={supplierOpen}
                        disabled={!watchedInventoryType || watchedInventoryType === "FINISHED_GOODS" || isReadOnly || !!id || fields.length > 0}
                        className={cn(
                          "w-full h-11 justify-between text-xs font-bold bg-background border-input hover:bg-accent hover:text-accent-foreground px-3",
                          watchedInventoryType === "RAW_MATERIALS" && form.formState.errors.supplier_id && "border-red-500 bg-red-50 dark:bg-red-900/10",
                          (watchedInventoryType === "FINISHED_GOODS" || !watchedInventoryType) && "bg-muted/40 cursor-not-allowed opacity-75"
                        )}
                      >
                        <span className="truncate">
                          {(() => {
                            if (!watchedInventoryType) return "Select Inventory Type first";
                            if (watchedInventoryType === "FINISHED_GOODS") return "Not Applicable (Internal Production)";
                            if (isSuppliersLoading) return "Loading suppliers...";
                            const s = suppliers.find((item) => Number(item.id) === Number(watchedSupplierIdForSelect));
                            return s ? `${s.supplier_name}${s.supplier_shortcut ? ` (${s.supplier_shortcut})` : ""}` : "Select Supplier";
                          })()}
                        </span>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {watchedInventoryType === "RAW_MATERIALS" && !id && !isReadOnly && fields.length === 0 && watchedSupplierIdForSelect ? (
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={(e) => {
                                e.stopPropagation();
                                form.setValue("supplier_id", 0, { shouldValidate: true });
                              }}
                              className="p-0.5 rounded-sm hover:bg-muted text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                            </span>
                          ) : null}
                          <ChevronsUpDown className="h-4 w-4 opacity-50" />
                        </div>
                      </Button>
                    </PopoverTrigger>
                  </div>
                  {watchedInventoryType === "RAW_MATERIALS" && (
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search supplier..." className="h-9 text-xs" />
                        <CommandList>
                          <CommandEmpty>
                            {isSuppliersLoading ? "Fetching supplier list..." : "No suppliers found."}
                          </CommandEmpty>
                          <CommandGroup>
                            {suppliers.map((s) => {
                              const isSelected = Number(watchedSupplierIdForSelect) === Number(s.id);
                              return (
                                <CommandItem
                                  key={s.id}
                                  value={`${s.supplier_name} ${s.supplier_shortcut || ""} ${s.id}`}
                                  onSelect={() => {
                                    form.setValue("supplier_id", Number(s.id), { shouldValidate: true });
                                    setSupplierOpen(false);
                                  }}
                                  className="cursor-pointer text-xs"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4 shrink-0",
                                      isSelected ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <span className="font-medium">{s.supplier_name}</span>
                                  {s.supplier_shortcut && (
                                    <span className="text-[10px] font-bold text-muted-foreground/40 font-mono italic ml-2">
                                      {s.supplier_shortcut}
                                    </span>
                                  )}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  )}
                </Popover>
                {watchedInventoryType === "RAW_MATERIALS" && form.formState.errors.supplier_id && (
                  <p className="text-xs text-red-500 font-medium">
                    {String(form.formState.errors.supplier_id.message)}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-bold text-muted-foreground">
                Adjustment Type <span className="text-red-500">*</span>
              </Label>
              <RadioGroup
                value={watchedType}
                onValueChange={async (v) => {
                  const newType = v as "IN" | "OUT";
                  form.setValue("type", newType, { shouldValidate: true, shouldDirty: true });
                  if (!id) {
                    const nextDoc = await fetchNextDocNo(newType);
                    if (nextDoc) {
                      form.setValue("doc_no", nextDoc, { shouldValidate: true, shouldDirty: true });
                    }
                  }
                }}
                className="flex gap-4 pt-1"
                disabled={isReadOnly || !!id}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem
                    value="IN"
                    id="type-in"
                    className="border-primary text-primary h-4 w-4"
                  />
                  <Label htmlFor="type-in" className="text-sm font-bold text-foreground/80">
                    Stock In
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem
                    value="OUT"
                    id="type-out"
                    className="border-input text-primary h-4 w-4"
                  />
                  <Label htmlFor="type-out" className="text-sm font-bold text-foreground/80">
                    Stock Out
                  </Label>
                </div>
              </RadioGroup>
              {form.formState.errors.type && (
                <p className="text-xs text-red-500 font-medium">
                  {String(form.formState.errors.type.message)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="remarks" className="text-sm font-bold text-muted-foreground">
                Remarks
              </Label>
              <Textarea
                id="remarks"
                {...form.register("remarks")}
                placeholder="Additional information about this adjustment..."
                className="min-h-[120px] bg-background border-input focus:ring-primary rounded-xl p-4 text-sm"
                disabled={isReadOnly}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border shadow-sm bg-card">
          <CardHeader className="bg-card border-b border-border py-4 px-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                Product Items
              </CardTitle>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search products in cart..."
                  value={tableSearch}
                  onChange={(e) => {
                    setTableSearch(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9 h-9 text-sm border-input"
                />
              </div>
              <Button
                type="button"
                onClick={generatePDF}
                className="font-bold h-9 px-4 rounded-full shadow-sm flex items-center gap-2 text-sm transition-all border-primary/20 text-primary/90 bg-primary/10 hover:bg-primary/20"
                variant="outline"
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
              {!isReadOnly && (
                <Button
                  type="button"
                  onClick={() => setIsModalOpen(true)}
                  disabled={
                    !watchedBranchIdForSelect ||
                    !watchedInventoryType ||
                    (watchedInventoryType === "RAW_MATERIALS" && !watchedSupplierIdForSelect)
                  }
                  className="font-bold h-9 px-4 rounded-full shadow-sm flex items-center gap-2 text-sm transition-all border-primary/20 text-primary/90 bg-primary/10 hover:bg-primary/20 dark:bg-primary/20 dark:border-primary/40 shrink-0"
                  variant="outline"
                >
                  <Plus className="h-4 w-4" />
                  ADD MORE PRODUCTS
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isFormLoading ? (
              <div className="p-6 space-y-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-10 flex-[3]" />
                    <Skeleton className="h-10 flex-1" />
                    <Skeleton className="h-10 flex-1" />
                    <Skeleton className="h-10 flex-1" />
                  </div>
                ))}
              </div>
            ) : fields.length === 0 ? (
              <div
                className={`rounded-xl m-6 p-16 text-center transition-colors ${
                  form.formState.errors.items
                    ? "bg-red-500/5 border-2 border-dashed border-red-500/60 ring-1 ring-red-500/20"
                    : "bg-muted/10 border-2 border-dashed border-border"
                }`}
              >
                <div className="flex justify-center mb-4">
                  <div className="p-5 rounded-full border border-dashed bg-muted border-border">
                    <Package className="h-10 w-10 text-muted-foreground/30" />
                  </div>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">
                  {!watchedBranchIdForSelect
                    ? "Branch required"
                    : !watchedInventoryType
                    ? "Inventory Type required"
                    : watchedInventoryType === "RAW_MATERIALS" && !watchedSupplierIdForSelect
                    ? "Supplier required"
                    : "Empty Cart"}
                </h3>
                <p className="text-muted-foreground font-medium max-w-xs mx-auto text-sm">
                  {!watchedBranchIdForSelect
                    ? "Select a branch first before adding products."
                    : !watchedInventoryType
                    ? "Select an inventory type (Finished Goods or Raw Materials) first."
                    : watchedInventoryType === "RAW_MATERIALS" && !watchedSupplierIdForSelect
                    ? "Select a supplier to browse and add raw materials / packaging."
                    : 'Click "ADD MORE PRODUCTS" to browse and add items.'}
                </p>
                {form.formState.errors.items && form.formState.errors.items.message && (
                  <p className="text-sm text-red-500 font-bold mt-4">
                    {form.formState.errors.items.message}
                  </p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto min-h-[300px]">
                <table className="w-full text-sm text-left">
                  <thead className="text-[10px] font-bold uppercase text-muted-foreground bg-muted/40 border-b border-border">
                    <tr>
                      <th className="p-3 text-center w-12 border-r border-border/50">#</th>
                      <th className="p-3">Brand</th>
                      <th className="p-3">Product Name</th>
                      <th className="p-3">UOM</th>
                      <th className="p-3">Price</th>
                      <th className="p-3">Total Amount</th>
                      <th className="p-3 w-32 text-center">Quantity</th>
                      <th className="p-3 text-center w-16">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedFields.length === 0 && tableSearch ? (
                      <tr>
                        <td colSpan={8} className="p-8 text-center text-sm text-muted-foreground">
                          No products found matching &quot;{tableSearch}&quot;.
                        </td>
                      </tr>
                    ) : (
                      paginatedFields.map(({ field, index }) => (
                        <ProductTableRow
                          key={field.id}
                          index={index}
                          control={form.control}
                          onRemove={(idx) => setDeletingIndex(idx)}
                          setValue={form.setValue}
                          onOpenLotBatch={handleOpenLotBatchModal}
                          type={watchedType}
                          isReadOnly={isReadOnly}
                        />
                      ))
                    )}
                  </tbody>
                </table>
                <div className="p-4 bg-muted/10 border-t border-border/50 text-sm font-medium text-muted-foreground flex justify-between items-center">
                  <span>{filteredFields.length} total rows</span>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <span className="text-xs">Rows per page</span>
                      <select
                        className="h-8 border border-border rounded-md bg-card px-2 text-xs focus:outline-none"
                        value={rowsPerPage}
                        onChange={(e) => {
                          setRowsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                    <span className="text-xs font-bold text-foreground">Page {currentPage} of {totalPages}</span>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground bg-card"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(1)}
                      >
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground bg-card"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground bg-card"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground bg-card"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(totalPages)}
                      >
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Summary Block */}
            <FormSummary
              control={form.control}
              fieldCount={fields.length}
            />
          </CardContent>
        </Card>

        {/* Attachments Card */}
        <Card
          className={`border shadow-sm bg-card transition-colors ${
            form.formState.errors.stock_adjustment_attachment
              ? "border-red-500/70 ring-1 ring-red-500/20"
              : "border-border/50"
          }`}
        >
          <CardHeader className="bg-card border-b border-border/50 py-4 px-6">
            <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-primary" />
              Attachments
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <AttachmentUpload
              value={watchedAttachments || []}
              onChange={(atts) => form.setValue("stock_adjustment_attachment", atts, { shouldValidate: true })}
              disabled={isReadOnly}
            />
            {form.formState.errors.stock_adjustment_attachment?.message && (
              <p className="text-xs text-red-500 font-bold mt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                {String(form.formState.errors.stock_adjustment_attachment.message)}
              </p>
            )}
          </CardContent>
        </Card>

        <ProductSelectionModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          supplierName={
            watchedInventoryType === "FINISHED_GOODS"
              ? "Internal Production (Finished Goods)"
              : (suppliers.find((s) => String(s.id) === String(watchedSupplierIdForSelect))?.supplier_name || "")
          }
          branchName={
            branches?.find((b) => String(b.id) === String(watchedBranchIdForSelect))?.branch_name || ""
          }
          inventoryType={watchedInventoryType}
          products={products}
          isLoading={isProductsLoading}
          initialSelectedItems={form.getValues("items")}
          onConfirm={handleConfirmModalItems}
        />

        {/* Modal Selection: Stock OUT uses StockAllocationModal (takes from existing inventory batches), Stock IN uses LotBatchSelectionModal (creates/assigns batches) */}
        {lotBatchModalOpen && activeLotBatchIndex !== null && activeItem && (
          watchedType === "OUT" ? (
            <StockAllocationModal
              open={lotBatchModalOpen}
              onOpenChange={setLotBatchModalOpen}
              productId={Number(activeItem.product_id) || 0}
              productName={String(activeItem.product_name || '')}
              productClassification={(() => {
                const c = resolveProductClassification(activeItem.product_type, activeItem.product_category).code;
                return c === "OTHER" ? undefined : c;
              })()}
              branchId={Number(watchedBranchId) || 0}
              requestedQuantity={Number(activeItem.quantity) || 0}
              uomName={String(activeItem.unit_name || 'units')}
              initialAllocations={modalInitialAllocations}
              onConfirm={handleApplyAllocation}
            />
          ) : (
            <LotBatchSelectionModal
              open={lotBatchModalOpen}
              onOpenChange={setLotBatchModalOpen}
              branchId={Number(watchedBranchId) || undefined}
              productId={Number(activeItem.product_id) || undefined}
              productName={String(activeItem.product_name || '') || undefined}
              productCode={String(activeItem.product_code || '') || undefined}
              productUomId={activeItem.unit_id ? Number(activeItem.unit_id) : undefined}
              productUomName={String(activeItem.unit_name || 'units')}
              productType={activeItem.product_type}
              productCategory={activeItem.product_category}
              categoryName={activeItem.category_name as string | undefined}
              requestedQuantity={Number(activeItem.quantity) || 0}
              adjustmentType={watchedType || "IN"}
              initialLotAllocations={activeItem.lot_allocations as LotAllocationGroup[] | undefined}
              existingFormAllocations={modalExistingFormAllocations}
              initialValues={modalInitialValues}
              onConfirm={handleApplyLotBatch}
            />
          )
        )}

        <div className="flex items-center justify-end gap-3 pb-8">
          {onCancel ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => handleCancelOrExit(onCancel)}
              className="h-10 px-8 font-bold border-border text-muted-foreground hover:bg-card rounded-lg"
            >
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => handleCancelOrExit(handleClearForm)}
              className="h-10 px-8 font-bold border-border text-muted-foreground hover:bg-card rounded-lg"
            >
              Clear Form
            </Button>
          )}
          {!isReadOnly && (
            <Button
              type="submit"
              disabled={loading}
              className="h-10 px-8 font-bold bg-primary hover:bg-primary/90 text-white gap-2 shadow-sm rounded-lg"
            >
              {loading ? (
                <span className="animate-spin mr-2">â—Œ</span>
              ) : (
                <Save className="h-4 w-4" />
              )}
              {id ? "Update Adjustment" : "Save Adjustment"}
            </Button>
          )}

          {id && !isReadOnly && (
            <Button
              type="button"
              onClick={() => setShowDeleteConfirmation(true)}
              disabled={loading}
              className="h-10 px-8 font-bold bg-red-600 hover:bg-red-700 text-white gap-2 shadow-sm rounded-lg animate-in fade-in zoom-in-95 duration-200 transition-all duration-300 hover:scale-[1.02] text-xs"
            >
              <Trash2 className="h-4 w-4" />
              Delete Adjustment
            </Button>
          )}

          {id && !isReadOnly && (
            <Button
              type="button"
              onClick={handlePost}
              disabled={loading}
              className="h-10 px-8 font-bold bg-green-600 hover:bg-green-700 text-white gap-2 shadow-sm rounded-lg animate-in fade-in zoom-in-95 duration-200"
            >
              {loading ? (
                <span className="animate-spin mr-2">â—Œ</span>
              ) : (
                <Send className="h-4 w-4" />
              )}
              Post Adjustment
            </Button>
          )}
        </div>
      </form>


      {/* Post Confirmation Modal */}
      <AlertDialog open={showPostConfirmation} onOpenChange={setShowPostConfirmation}>
        <AlertDialogContent className="max-w-md bg-card p-6 rounded-xl shadow-2xl border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
              <Send className="h-5 w-5 text-primary" />
              Confirm Post Adjustment
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground py-4">
              Are you sure you want to post this adjustment? Once posted, the record will become **READ-ONLY** and inventory levels will be updated across the system.
              <br /><br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowPostConfirmation(false)}
              className="flex-1 h-11 font-bold text-muted-foreground border-border hover:bg-muted rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmPost}
              className="flex-1 h-11 font-bold bg-primary hover:bg-primary/90 text-white shadow-md shadow-primary/20 dark:shadow-none rounded-lg"
            >
              Confirm and Post
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation AlertDialog Popup */}
      <AlertDialog open={showDeleteConfirmation} onOpenChange={setShowDeleteConfirmation}>
        <AlertDialogContent className="max-w-md bg-card p-6 rounded-xl shadow-2xl border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Confirm Delete Adjustment
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground py-4">
              Are you sure you want to delete this stock adjustment transaction? This action will permanently remove it from the system.
              <br /><br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirmation(false)}
              className="flex-1 h-11 font-bold text-muted-foreground border-border hover:bg-muted rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              className="flex-1 h-11 font-bold bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-100 dark:shadow-none rounded-lg"
            >
              Confirm and Delete
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Item Delete Confirmation */}
      <AlertDialog
        open={deletingIndex !== null}
        onOpenChange={(open) => !open && setDeletingIndex(null)}
      >
        <AlertDialogContent className="max-w-md bg-card p-6 rounded-xl shadow-2xl border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Remove Item
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground py-4">
              Are you sure you want to remove this item from the adjustment list?
              {deletingIndex !== null && form.getValues(`items.${deletingIndex}.db_id`) && (
                <span className="block mt-2 font-bold text-red-500/80">
                  Note: This is an existing record. Removing it will delete it from this adjustment once you save.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setDeletingIndex(null)}
              className="flex-1 h-11 font-bold text-muted-foreground border-border hover:bg-muted rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (deletingIndex !== null) {
                  remove(deletingIndex);
                  setDeletingIndex(null);
                  toast.success("Item removed from list");
                }
              }}
              className="flex-1 h-11 font-bold bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-100 dark:shadow-none rounded-lg"
            >
              Confirm and Remove
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved Changes Confirmation Dialog */}
      <AlertDialog open={showUnsavedChangesModal} onOpenChange={setShowUnsavedChangesModal}>
        <AlertDialogContent className="max-w-md bg-card p-6 rounded-xl shadow-2xl border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Unsaved Changes
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground py-4 text-xs font-semibold">
              You have unsaved changes in this stock adjustment draft. What would you like to do before leaving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 mt-4">
            <Button
              onClick={handleSaveAndExit}
              disabled={loading}
              className="w-full h-11 font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md rounded-lg text-xs"
            >
              {loading ? <span className="animate-spin mr-2">⌾</span> : null}
              Save and Exit
            </Button>
            <Button
              variant="outline"
              onClick={confirmDiscardAndExit}
              className="w-full h-11 font-bold bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200/50 dark:border-red-800/30 rounded-lg text-xs"
            >
              Discard Changes and Exit
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowUnsavedChangesModal(false);
                setPendingExitAction(null);
              }}
              className="w-full h-11 font-bold text-muted-foreground hover:bg-muted rounded-lg text-xs"
            >
              Keep Editing
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

