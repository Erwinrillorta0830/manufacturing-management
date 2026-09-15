"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  X,
  Loader2,
  Plus,
  Trash2,
  Printer,
  Save,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Link as LinkIcon,
  FileText,
  Search,
  ChevronDown,
  Check,
  ChevronsUpDown,
  Layers,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";

import { SalesReturnApiClient } from "../services/sales-return.api-client";
import {
  SalesReturn,
  SalesReturnItem,
  SalesReturnStatusCard,
  InvoiceOption,
  API_LineDiscount,
  API_SalesReturnType,
  PriceTypeOption,
  SalesmanOption,
  InvoiceLineItem,
  BranchOption,
  LotOption,
} from "../types/sales-return.types";
import {
  LotBatchSelectionModal,
  LotBatchSelectionResult,
  FormSiblingAllocation,
} from "./LotBatchSelectionModal";
import { ProductLookupModal } from "./ProductLookupModal";
import { SalesReturnPrintSlip } from "./SalesReturnPrintSlip";
import { createRoot } from "react-dom/client";

interface SalesReturnGroup {
  key: string;
  code: string;
  description: string;
  productType?: string;
  unit: string;
  returnType: string;
  unitPrice: number;
  agreedPrice: number;
  totalQty: number;
  totalVariance: number;
  totalGross: number;
  totalDiscount: number;
  totalNet: number;
  children: { item: SalesReturnItem; idx: number }[];
}

// =============================================================================
// OPTIMIZED SUB-COMPONENTS (PERFORMANCE FIX)
// =============================================================================

const RemarksInputSection = React.memo(({ value, onChange, disabled, isLoading }: { value: string, onChange: (val: string) => void, disabled?: boolean, isLoading?: boolean }) => {
  const [localRemarks, setLocalRemarks] = useState(value);

  useEffect(() => {
    setLocalRemarks(value);
  }, [value]);

  return (
    <div className="space-y-2">
      <Label className="text-xs uppercase font-bold text-muted-foreground">
        Remarks
      </Label>
      {isLoading ? (
        <Skeleton className="min-h-[120px] w-full rounded-md" />
      ) : (
        <Textarea
          value={localRemarks}
          onChange={(e) => setLocalRemarks(e.target.value)}
          onBlur={() => onChange(localRemarks)}
          disabled={disabled}
          className="resize-none min-h-[120px] border-border focus:border-primary bg-background shadow-sm"
          placeholder="Enter return remarks..."
        />
      )}
    </div>
  );
});
RemarksInputSection.displayName = "RemarksInputSection";

const ReasonInputSection = React.memo(({ value, onChange, disabled }: { value: string, onChange: (val: string) => void, disabled?: boolean }) => {
  const [localReason, setLocalReason] = useState(value);

  useEffect(() => {
    setLocalReason(value);
  }, [value]);

  return (
    <Input
      className="h-9 w-full text-sm border-border bg-background"
      placeholder="Enter reason..."
      value={localReason}
      onChange={(e) => setLocalReason(e.target.value)}
      onBlur={() => onChange(localReason)}
      disabled={disabled}
    />
  );
});
ReasonInputSection.displayName = "ReasonInputSection";

interface Props {
  returnId: number;
  initialData: SalesReturn;
  onClose: () => void;
  onSuccess: () => void;
}

// 🟢 LOCAL SEARCHABLE SELECT TO FIX SCROLL ISSUES IN DIALOG
const LocalSearchableSelect = ({
  options,
  value,
  onValueChange,
  placeholder = "Select...",
  className,
  disabled = false,
}: {
  options: { value: string; label: string }[];
  value: string;
  onValueChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const selectedLabel = options.find((opt) => opt.value === value)?.label;

  return (
    <Popover open={open} onOpenChange={setOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", !value && "text-muted-foreground", className)}
          disabled={disabled}
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
          <CommandList className="max-h-[200px] overflow-y-auto">
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={opt.label}
                  onSelect={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === opt.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

const ReadOnlyField = ({
  label,
  value,
  isLoading = false,
  className = "",
}: {
  label: string;
  value: string | number | undefined;
  isLoading?: boolean;
  className?: string;
}) => (
  <div className={cn("space-y-1", className)} title={String(value || "-")}>
    <Label className="text-[10px] uppercase tracking-wide font-bold text-muted-foreground w-full truncate block">
      {label}
    </Label>
    <div className="w-full h-9 px-3 flex items-center bg-muted/20 border border-border rounded-md text-sm font-medium text-foreground shadow-sm truncate">
      {isLoading ? (
        <Skeleton className="h-4 w-3/4" />
      ) : (
        <span className="truncate">{value || "-"}</span>
      )}
    </div>
  </div>
);

export function UpdateSalesReturnModal({
  returnId,
  initialData,
  onClose,
  onSuccess,
}: Props) {
  const searchParams = useSearchParams();
  const prefillRemarks = searchParams.get("prefillRemarks");

  // --- STATE ---
  const [headerData, setHeaderData] = useState<SalesReturn>(initialData);

  // 🟢 Effect to pre-fill remarks from Clearance if redirected
  useEffect(() => {
    if (prefillRemarks) {
      setHeaderData((prev) => {
        const currentRemarks = prev?.remarks || "";
        if (currentRemarks.includes(prefillRemarks)) return prev;
        return {
          ...prev,
          remarks: currentRemarks
            ? `${currentRemarks}\n\n[From Clearance]: ${prefillRemarks}`
            : prefillRemarks,
        };
      });

      // Clean up URL to prevent re-applying on refresh
      const url = new URL(window.location.href);
      url.searchParams.delete('prefillRemarks');
      window.history.replaceState({}, '', url.toString());
    }
  }, [prefillRemarks]);

  const [details, setDetails] = useState<SalesReturnItem[]>([]);
  const [invoiceLineItems, setInvoiceLineItems] = useState<InvoiceLineItem[]>([]);
  const [appliedInvoiceId, setAppliedInvoiceId] = useState<number | null>(null);

  const [statusCardData, setStatusCardData] =
    useState<SalesReturnStatusCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInvoicePosted, setIsInvoicePosted] = useState<boolean>(false);

  const [discountOptions, setDiscountOptions] = useState<API_LineDiscount[]>(
    [],
  );
  const [returnTypeOptions, setReturnTypeOptions] = useState<
    API_SalesReturnType[]
  >([]);
  const [salesmenOptions, setSalesmenOptions] = useState<SalesmanOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [customerOptions, setCustomerOptions] = useState<{value: string | number; label: string}[]>([]);
  const [lotOptions, setLotOptions] = useState<LotOption[]>([]);
  const [lotOnhandMap, setLotOnhandMap] = useState<Record<number, number>>({});

  const [isProductLookupOpen, setIsProductLookupOpen] = useState(false);
  const [isUpdateConfirmOpen, setIsUpdateConfirmOpen] = useState(false);
  const [isUpdateSuccessOpen, setIsUpdateSuccessOpen] = useState(false);
  const [isReceiveConfirmOpen, setIsReceiveConfirmOpen] = useState(false);
  const [isInvoiceLookupOpen, setIsInvoiceLookupOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [returnTypeError, setReturnTypeError] = useState(false);
  const [lotDetailsError, setLotDetailsError] = useState(false);
  const [orderError, setOrderError] = useState(false);
  const [invoiceError, setInvoiceError] = useState(false);

  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceOption[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");

  const [priceTypeOptions, setPriceTypeOptions] = useState<PriceTypeOption[]>([]);

  // Order/Invoice Dropdown State
  const [isOrderDropdownOpen, setIsOrderDropdownOpen] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const orderDropdownRef = useRef<HTMLDivElement>(null);
  const [isInvoiceDropdownOpen, setIsInvoiceDropdownOpen] = useState(false);
  const [invoiceDropdownSearch, setInvoiceDropdownSearch] = useState("");
  const invoiceDropdownRef = useRef<HTMLDivElement>(null);

  // RFID State
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Lot & Batch Modal State
  const [lotBatchModalOpen, setLotBatchModalOpen] = useState(false);
  const [activeLotBatchIndex, setActiveLotBatchIndex] = useState<number | null>(null);

  const handleOpenLotBatchModal = useCallback((index: number) => {
    setActiveLotBatchIndex(index);
    setLotBatchModalOpen(true);
  }, []);

  const handleApplyLotBatch = useCallback((result: LotBatchSelectionResult) => {
    if (activeLotBatchIndex !== null && activeLotBatchIndex >= 0) {
      setDetails((prev) => {
        if (activeLotBatchIndex >= prev.length) return prev;
        const updated = [...prev];
        const targetItem = { ...updated[activeLotBatchIndex] };

        const totalAllocQty = result.total_quantity || 
          (result.lot_allocations?.reduce((sum, g) => 
            sum + (g.batches?.reduce((bSum, b) => bSum + Number(b.quantity || 0), 0) || Number(g.allocated_quantity || 0)), 0) ?? targetItem.quantity);

        targetItem.lot_id = result.lot_id;
        targetItem.lot_name = result.lot_name;
        targetItem.inventory_lot_id = result.inventory_lot_id;
        targetItem.batch = result.batch_no;
        targetItem.manufacturing_date = result.manufacturing_date;
        targetItem.expiry_date = result.expiry_date;
        targetItem.qa_status = result.qa_status;
        targetItem.lot_allocations = result.lot_allocations;

        if (totalAllocQty > 0 && targetItem.quantity !== totalAllocQty) {
          targetItem.quantity = totalAllocQty;
          const agPrice = targetItem.agreedPrice !== undefined && targetItem.agreedPrice !== null ? targetItem.agreedPrice : targetItem.unitPrice;
          const newGross = Math.round(totalAllocQty * agPrice * 100) / 100;
          let newDiscountAmt = 0;
          if (targetItem.discountType && targetItem.discountType !== "No Discount") {
            const selectedOption = discountOptions.find(d => d.id.toString() === targetItem.discountType?.toString());
            if (selectedOption) {
              const percentage = parseFloat(selectedOption.total_percent) || 0;
              newDiscountAmt = Math.round(newGross * (percentage / 100) * 100) / 100;
            }
          }
          targetItem.grossAmount = newGross;
          targetItem.discountAmount = newDiscountAmt;
          targetItem.totalAmount = Math.round((newGross - newDiscountAmt) * 100) / 100;
          targetItem.priceVariance = Math.round((targetItem.unitPrice - agPrice) * totalAllocQty * 100) / 100;
        }

        updated[activeLotBatchIndex] = targetItem;
        return updated;
      });
    }
  }, [activeLotBatchIndex, discountOptions]);

  const formSiblingAllocations: FormSiblingAllocation[] = useMemo(() => {
    return details.map((item) => ({
      product_id: item.productId,
      product_name: item.description,
      product_code: item.code,
      quantity: item.quantity,
      lot_id: item.lot_id,
      lot_name: item.lot_name,
      lot_allocations: item.lot_allocations,
      batch_no: item.batch,
    }));
  }, [details]);

  // 🟢 REVISED: Edit Permissions Logic
  const isPending = headerData.status === "Pending";
  const isReceived = headerData.status === "Received";

  // Rule 1: Everything is editable if Pending
  // Rule 2: Only Remarks and Applied To are editable if Received
  const canEditAll = isPending;
  const canEditLimited = isPending || isReceived;

  // --- INITIAL LOAD ---
  useEffect(() => {
    const loadFullDetails = async () => {
      setLoading(true);
      try {
        const [
          items,
          statusData,
          discounts,
          retTypes,
          salesmen,
          customersData,
          lots,
          priceTypesData,
          branchesData,
        ] = await Promise.all([
          SalesReturnApiClient.getProductsSummary(returnId, headerData.returnNo),
          SalesReturnApiClient.getStatusCardData(returnId),
          SalesReturnApiClient.getLineDiscounts(),
          SalesReturnApiClient.getSalesReturnTypes(),
          SalesReturnApiClient.getFormSalesmen(),
          SalesReturnApiClient.getCustomersList(),
          SalesReturnApiClient.getLots(),
          SalesReturnApiClient.getPriceTypes(),
          SalesReturnApiClient.getFormBranches(),
        ]);

        setDetails(items);
        setStatusCardData(statusData);
        if (statusData?.appliedInvoiceId) {
          setAppliedInvoiceId(statusData.appliedInvoiceId);
        }
        if (statusData?.isInvoicePosted) {
          setIsInvoicePosted(statusData.isInvoicePosted);
        }
        setDiscountOptions(discounts);
        setReturnTypeOptions(retTypes);
        setSalesmenOptions(salesmen);
        setBranches(branchesData);
        setCustomerOptions(customersData || []);
        setLotOptions(lots);
        setPriceTypeOptions(priceTypesData);

        // Fetch invoices filtered by salesman and customer
        try {
          const invoices = await SalesReturnApiClient.getInvoiceReturnList(
            headerData.salesmanId?.toString(),
            headerData.customerCode,
          );
          setInvoiceOptions(invoices);
        } catch {
          setInvoiceOptions([]);
        }
      } catch (err) {
        console.error("Failed to load details", err);
      } finally {
        setLoading(false);
      }
    };

    if (returnId) {
      loadFullDetails();
    }
  }, [returnId, headerData.returnNo, headerData.customerCode, headerData.salesmanId]);

  // 🟢 NEW: Effect to automatically update prices when Price Type changes
  useEffect(() => {
    if (details.length > 0) {
      setDetails((prevDetails) =>
        prevDetails.map((item) => {
          const resolvedPt = priceTypeOptions.find(p => String(p.price_type_id) === String(headerData.priceType) || String(p.price_type_name) === String(headerData.priceType))?.price_type_name || headerData.priceType;
          const key = `price${resolvedPt}` as keyof SalesReturnItem;
          const invoiceItem = invoiceLineItems.find(i => Number(i.product_id) === Number(item.productId));
          const basePrice = invoiceItem ? Number(invoiceItem.unit_price) : (Number(item[key]) || Number(item.priceA) || Number(item.unitPrice) || 0);

          const newUnitPrice = basePrice;
          const agPrice = item.agreedPrice !== undefined && item.agreedPrice !== null ? item.agreedPrice : newUnitPrice;

          const newGross = Math.round(Number(item.quantity) * agPrice * 100) / 100;
          let newDiscountAmt = 0;

          if (item.discountType && item.discountType !== "No Discount") {
            const selectedOption = discountOptions.find(
              (d) => d.id.toString() === item.discountType?.toString(),
            );
            if (selectedOption) {
              const percentage = parseFloat(selectedOption.total_percent) || 0;
              newDiscountAmt = Math.round(newGross * (percentage / 100) * 100) / 100;
            }
          }

          const newVariance = Math.round((newUnitPrice - agPrice) * Number(item.quantity) * 100) / 100;

          return {
            ...item,
            unitPrice: newUnitPrice,
            agreedPrice: agPrice,
            priceVariance: newVariance,
            grossAmount: newGross,
            discountAmount: newDiscountAmt,
            totalAmount: Math.round((newGross - newDiscountAmt) * 100) / 100,
          };
        })
      );
    }
  }, [headerData.priceType, discountOptions, invoiceLineItems, details.length, priceTypeOptions]);

  // Click outside handler for order/invoice dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (orderDropdownRef.current && !orderDropdownRef.current.contains(target)) {
        setIsOrderDropdownOpen(false);
      }
      if (invoiceDropdownRef.current && !invoiceDropdownRef.current.contains(target)) {
        setIsInvoiceDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // --- HELPERS ---
  const getSalesmanName = (id: string | number) =>
    salesmenOptions.find((opt) => String(opt.id) === String(id))?.name ||
    String(id) ||
    "-";
  const getSalesmanCode = (id: string | number) => {
    const found = salesmenOptions.find(
      (opt) => String(opt.id) === String(id),
    );
    return found ? found.code : "N/A";
  };
  const getSalesmanBranch = (id?: string | number) => {
    if (!id) return "N/A";
    const s = salesmenOptions.find((opt) => String(opt.id) === String(id));
    if (!s) return "N/A";
    const branch = branches.find((b) => String(b.id) === String(s.branchId));
    return branch ? branch.name : "N/A";
  };
  
  const getResolvedPriceType = (ptId?: string | number) => {
    if (!ptId) return "N/A";
    const pt = priceTypeOptions.find(p => String(p.price_type_id) === String(ptId) || String(p.price_type_name) === String(ptId));
    return pt ? pt.price_type_name : String(ptId);
  };

  const getCustomerName = (code: string | number) =>
    customerOptions.find((opt) => String(opt.value) === String(code))?.label ||
    String(code) ||
    "-";

  // --- HANDLERS: EDIT TABLE ---
  const handleDetailChange = (index: number, field: keyof SalesReturnItem, value: string | number | null) => {
    setDetails((prev) => {
      const newDetails = [...prev];
      const item = { ...newDetails[index], [field]: value };

      const qty = Number(item.quantity || 0);
      const price = Number(item.unitPrice || 0);
      const agPrice = item.agreedPrice !== undefined && item.agreedPrice !== null ? Number(item.agreedPrice) : price;

      const gross = Math.round(qty * agPrice * 100) / 100;
      const variance = Math.round((price - agPrice) * qty * 100) / 100;

      let disc = 0;
      if (item.discountType && item.discountType !== "No Discount") {
        const selectedDisc = discountOptions.find(
          (d) => d.id.toString() === item.discountType?.toString(),
        );
        if (selectedDisc) {
          const percentage = parseFloat(selectedDisc.total_percent);
          disc = Math.round(gross * (percentage / 100) * 100) / 100;
        }
      }

      item.priceVariance = variance;
      item.discountAmount = disc;
      item.grossAmount = gross;
      item.totalAmount = Math.round((gross - disc) * 100) / 100;

      // Validation check for lot capacity
      if ((field === "quantity" || field === "lot_id") && item.lot_id) {
        const onhand = lotOnhandMap[item.lot_id] ?? 0;
        const lot = lotOptions.find((l) => l.lot_id === item.lot_id);
        const maxCap = lot?.max_batch_capacity ?? 0;
        const availableCap = maxCap > 0 ? Math.max(0, maxCap - onhand) : 0;
        
        if (maxCap > 0 && Number(item.quantity || 0) > availableCap) {
          item.quantity = availableCap;
          
          const newQty = item.quantity;
          const newGross = Math.round(newQty * agPrice * 100) / 100;
          const newVariance = Math.round((price - agPrice) * newQty * 100) / 100;
          let newDisc = 0;
          if (item.discountType && item.discountType !== "No Discount") {
            const selectedDisc = discountOptions.find(
              (d) => d.id.toString() === item.discountType?.toString(),
            );
            if (selectedDisc) {
              const percentage = parseFloat(selectedDisc.total_percent);
              newDisc = Math.round(newGross * (percentage / 100) * 100) / 100;
            }
          }
          item.priceVariance = newVariance;
          item.discountAmount = newDisc;
          item.grossAmount = newGross;
          item.totalAmount = Math.round((newGross - newDisc) * 100) / 100;

          toast.warning("Lot Capacity Reached", {
            id: `capacity-toast-${index}`,
            description: `Quantity capped to max available (${availableCap}). Please add a new product line for the remainder.`,
          });
        }
      }

      newDetails[index] = item;
      return newDetails;
    });
  };

  const handleDeleteRow = (index: number) => {
    setDetails((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddProductsToEdit = (newItems: (Partial<SalesReturnItem> & { price?: number, product_name?: string })[]) => {
    if (!newItems || newItems.length === 0) return;

    setDetails((prev) => {
      const updated = [...prev];
      newItems.forEach((item, index) => {
        const rawId = item.product_id || item.productId || item.id;
        const productId = Number(rawId);

        const isRfidItem = !!item.rfidTags && item.rfidTags.length > 0;
        const existingIndex = updated.findIndex(
          (i) => {
            const existingIsRfid = !!i.rfidTags && i.rfidTags.length > 0;
            return i.productId === productId && i.unit === item.unit && i.unitPrice === Number(item.unitPrice) && existingIsRfid === isRfidItem;
          }
        );
        const qty = Number(item.quantity) || 1;

        if (existingIndex >= 0) {
          const existing = { ...updated[existingIndex] };
          existing.quantity = Number(existing.quantity || 0) + qty;

          const existingPrice = Number(existing.unitPrice || 0);
          const existingAgPrice = existing.agreedPrice !== undefined && existing.agreedPrice !== null ? Number(existing.agreedPrice) : existingPrice;

          existing.grossAmount = Math.round(existing.quantity * existingAgPrice * 100) / 100;
          existing.priceVariance = Math.round((existingPrice - existingAgPrice) * existing.quantity * 100) / 100;

          if (existing.discountType && existing.discountType !== "No Discount") {
            const selectedDisc = discountOptions.find(
              (d) => d.id.toString() === existing.discountType?.toString()
            );
            if (selectedDisc) {
              const percentage = parseFloat(selectedDisc.total_percent);
              existing.discountAmount = Math.round(existing.grossAmount * (percentage / 100) * 100) / 100;
            }
          }

          existing.totalAmount = Math.round((existing.grossAmount - (Number(existing.discountAmount) || 0)) * 100) / 100;
          if (item.rfidTags) {
            existing.rfidTags = [...(existing.rfidTags || []), ...item.rfidTags];
          }
          updated[existingIndex] = existing;
        } else {
          const invoiceItem = invoiceLineItems.find(i => Number(i.product_id) === productId);
          const price = invoiceItem ? Number(invoiceItem.unit_price) : (Math.round((Number(item.unitPrice) || Number(item.price) || 0) * 100) / 100);
          const agPrice = item.agreedPrice !== undefined && item.agreedPrice !== null ? Number(item.agreedPrice) : price;
          const gross = Math.round(agPrice * qty * 100) / 100;
          const incomingDiscountType = item.discountType || "";
          let initialDiscountAmt = 0;

          if (incomingDiscountType && incomingDiscountType !== "No Discount") {
            const selectedDisc = discountOptions.find(
              (d) => d.id.toString() === incomingDiscountType.toString(),
            );
            if (selectedDisc) {
              const percentage = parseFloat(selectedDisc.total_percent) || 0;
              initialDiscountAmt = Math.round(gross * (percentage / 100) * 100) / 100;
            }
          }

          const variance = Math.round((price - agPrice) * qty * 100) / 100;
          const resultRecord = item as Record<string, unknown>;

          updated.push({
            id: `added-${Date.now()}-${index}-${Math.floor(Math.random() * 10000)}`,
            productId: productId,
            code: item.code || "N/A",
            description: item.description || item.product_name || "Unknown Item",
            unit: item.unit || "Pcs",
            unit_id: item.unit_id ? Number(item.unit_id) : (resultRecord.unit_of_measurement ? Number(resultRecord.unit_of_measurement) : undefined),
            quantity: qty,
            unitPrice: price,
            agreedPrice: agPrice,
            priceVariance: variance,
            grossAmount: gross,
            discountType: incomingDiscountType || null,
            discountAmount: initialDiscountAmt,
            totalAmount: Math.round((gross - initialDiscountAmt) * 100) / 100,
            lot_id: null,
            batch: "",
            manufacturing_date: "",
            expiry_date: "",
            reason: "",
            returnType: "",
            product_type: item.product_type || null,
            product_type_name: item.product_type_name || (resultRecord.product_type_name as string) || null,
          });
        }
      });
      return updated;
    });
    setIsProductLookupOpen(false);
  };

  // --- HANDLERS: UPDATE ---
  const handleUpdateClick = () => {
    setReturnTypeError(false);
    setOrderError(false);
    setInvoiceError(false);

    if (!headerData.orderNo || !headerData.orderNo.toString().trim()) {
      toast.error("Order No. is required.");
      setOrderError(true);
      return;
    }

    if (!headerData.invoiceNo || !headerData.invoiceNo.toString().trim()) {
      toast.error("Invoice No. is required.");
      setInvoiceError(true);
      return;
    }

    const hasIncompleteItems = details.some(
      (item) => !item.returnType || item.returnType === "",
    );
    if (hasIncompleteItems) {
      toast.error("Please select a 'Return Type' for all items.");
      setReturnTypeError(true);
      return;
    }

    const missingLotDetails = details.some(
      (item) => {
        const hasAlloc = item.lot_allocations && item.lot_allocations.length > 0;
        const hasPrimary = item.lot_id && item.batch && item.manufacturing_date && item.expiry_date;
        return !hasAlloc && !hasPrimary;
      }
    );
    if (missingLotDetails) {
      toast.error("Please assign Lot and Batch details for all items.");
      setLotDetailsError(true);
      return;
    }

    setIsUpdateConfirmOpen(true);
  };

  // --- NEW: FETCH LOT CAPACITIES ---
  useEffect(() => {
    const selectedSalesmanObj = salesmenOptions.find(
      (s) => String(s.id) === String(headerData.salesmanId)
    );
    const branchId = selectedSalesmanObj ? selectedSalesmanObj.branchId : null;
    
    if (!branchId || details.length === 0) {
      return;
    }
    const fetchLotCapacities = async () => {
      const uniqueUnitIds = Array.from(new Set(details.map(item => item.unit_id).filter(Boolean))) as number[];
      if (uniqueUnitIds.length === 0) return;
      
      const newMap: Record<number, number> = { ...lotOnhandMap };
      let updated = false;

      await Promise.all(uniqueUnitIds.map(async (unitId) => {
        try {
          const res = await SalesReturnApiClient.getLotOnhandMap(branchId, unitId);
          for (const [lotId, qty] of Object.entries(res)) {
            if (newMap[Number(lotId)] !== qty) {
              newMap[Number(lotId)] = qty as number;
              updated = true;
            }
          }
        } catch (err) {
          console.error("Failed to fetch lot capacity", err);
        }
      }));

      if (updated) {
        setLotOnhandMap(newMap);
      }
    };
    fetchLotCapacities();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerData.salesmanId, details]);

  const handleReceiveClick = () => {
    setReturnTypeError(false);
    setLotDetailsError(false);
    setOrderError(false);
    setInvoiceError(false);

    if (loading) {
      toast.error("Please wait for sales return details to finish loading.");
      return;
    }

    if (details.length === 0) {
      toast.error("Cannot receive an empty sales return. Please add products first.");
      return;
    }

    const hasZeroQuantity = details.some(
      (item) => !item.quantity || Number(item.quantity) <= 0,
    );
    if (hasZeroQuantity) {
      toast.error("All product lines must have a quantity greater than 0 before receiving.");
      return;
    }

    if (!totalNet || totalNet <= 0 || !totalGross || totalGross <= 0) {
      toast.error("Cannot receive a sales return with zero or invalid total amount.");
      return;
    }

    if (!headerData.orderNo || !headerData.orderNo.toString().trim()) {
      toast.error("Order No. is required.");
      setOrderError(true);
      return;
    }

    if (!headerData.invoiceNo || !headerData.invoiceNo.toString().trim()) {
      toast.error("Invoice No. is required.");
      setInvoiceError(true);
      return;
    }

    const hasIncompleteItems = details.some(
      (item) => !item.returnType || item.returnType === "",
    );
    if (hasIncompleteItems) {
      toast.error("Please select a 'Return Type' for all items.");
      setReturnTypeError(true);
      return;
    }

    const missingLotDetails = details.some(
      (item) => {
        const hasAlloc = item.lot_allocations && item.lot_allocations.length > 0;
        const hasPrimary = item.lot_id && item.batch && item.manufacturing_date && item.expiry_date;
        return !hasAlloc && !hasPrimary;
      }
    );
    if (missingLotDetails) {
      toast.error("Please assign Lot and Batch details for all items before receiving.");
      setLotDetailsError(true);
      return;
    }

    setIsReceiveConfirmOpen(true);
  };

  const handleConfirmUpdate = async () => {
    for (const item of details) {
      if (item.lot_id) {
        const lot = lotOptions.find((l) => l.lot_id === item.lot_id);
        const onhand = lotOnhandMap[item.lot_id] ?? 0;
        const maxCap = lot?.max_batch_capacity ?? 0;
        const incomingQty = Number(item.quantity) || 0;
        const availableCap = maxCap > 0 ? Math.max(0, maxCap - onhand) : 0;
        if (maxCap > 0 && incomingQty > availableCap) {
          toast.error("Lot Capacity Exceeded", {
            description: `Lot "${lot?.lot_name}" has only ${availableCap} available capacity (Max: ${maxCap}, Onhand: ${onhand}). Please select a different lot.`
          });
          return;
        }
      }
    }

    try {
      setIsUpdating(true);
      const selectedSalesmanObj = salesmenOptions.find(
        (s) => s.id.toString() === headerData.salesmanId?.toString(),
      );
      const branchId = selectedSalesmanObj ? selectedSalesmanObj.branchId : undefined;

      const payload = {
        returnId: headerData.id,
        returnNo: headerData.returnNo,
        items: details.map(item => ({
          ...item,
          quantity: Number(item.quantity || 0),
          manufacturing_date: item.manufacturing_date || null,
          expiry_date: item.expiry_date || null,
        })),
        remarks: headerData.remarks || "",
        invoiceNo: headerData.invoiceNo,
        orderNo: headerData.orderNo,
        appliedInvoiceId,
        isThirdParty: headerData.isThirdParty,
        branchId,
      };

      const res = await SalesReturnApiClient.updateReturn(payload);
      if (res && res.success === false) {
        toast.error(res.error || "Failed to update sales return.");
        return;
      }
      setIsUpdateConfirmOpen(false);
      setIsUpdateSuccessOpen(true);
    } catch (error) {
      console.error("Update failed", error);
      const errMsg = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast.error(errMsg);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleConfirmReceive = async () => {
    try {
      setIsReceiving(true);
      // Auto-save changes before marking as Received
      const selectedSalesmanObj = salesmenOptions.find(
        (s) => s.id.toString() === headerData.salesmanId?.toString(),
      );
      const branchId = selectedSalesmanObj ? selectedSalesmanObj.branchId : undefined;

      const savePayload = {
        returnId: headerData.id,
        returnNo: headerData.returnNo,
        items: details.map(item => ({
          ...item,
          quantity: Number(item.quantity || 0),
          manufacturing_date: item.manufacturing_date || null,
          expiry_date: item.expiry_date || null,
        })),
        remarks: headerData.remarks || "",
        invoiceNo: headerData.invoiceNo,
        orderNo: headerData.orderNo,
        appliedInvoiceId,
        isThirdParty: headerData.isThirdParty,
        branchId,
      };
      const saveRes = await SalesReturnApiClient.updateReturn(savePayload);
      if (saveRes && saveRes.success === false) {
        toast.error(saveRes.error || "Failed to update sales return.");
        return;
      }
      // Then update status with extra fields
      const manilaMs = Date.now() + 8 * 60 * 60 * 1000;
      const d = new Date(manilaMs);
      const now = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}T${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}`;
      await SalesReturnApiClient.updateStatus(headerData.id, "Received", true, now);
      setHeaderData({ ...headerData, status: "Received", isReceived: true, receivedAt: now });
      setStatusCardData((prev) =>
        prev
          ? { ...prev, isReceived: true, transactionStatus: "Received" }
          : null,
      );
      setIsReceiveConfirmOpen(false);
      setIsUpdateSuccessOpen(true);
    } catch (error) {
      console.error("Receive failed", error);
      const errMsg = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast.error(errMsg);
    } finally {
      setIsReceiving(false);
    }
  };

  const handlePrintInNewTab = () => {
    const printData = {
      returnNo: headerData.returnNo,
      returnDate: headerData.returnDate,
      status: headerData.status,
      remarks: headerData.remarks,
      salesmanName: getSalesmanName(headerData.salesmanId),
      salesmanCode: getSalesmanCode(headerData.salesmanId),
      customerName: getCustomerName(headerData.customerCode),
      customerCode: headerData.customerCode,
      branchName: getSalesmanBranch(headerData.salesmanId),
      items: details.map((item) => ({
        ...item,
        discountTypeName:
          discountOptions.find((d) => d.id.toString() === item.discountType?.toString())?.discount_type || "No Discount",
      })),
      totalAmount: details.reduce(
        (acc, item) => acc + (item.totalAmount || 0),
        0,
      ),
    };

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Pop-up blocked.");
      return;
    }

    printWindow.document.write(
      "<html><head><title>Print Preview</title></head><body><div id='print-root'></div></body></html>",
    );
    document
      .querySelectorAll('link[rel="stylesheet"], style')
      .forEach((node) => {
        printWindow.document.head.appendChild(node.cloneNode(true));
      });
    const styleOverride = printWindow.document.createElement("style");
    styleOverride.innerHTML = `
      body { background-color: #e5e7eb; padding: 40px; display: flex; justify-content: center; }
      #print-root { background-color: white; }
      .hidden { display: block !important; }
    `;
    printWindow.document.head.appendChild(styleOverride);
    const root = createRoot(printWindow.document.getElementById("print-root")!);
    root.render(<SalesReturnPrintSlip data={printData} />);
    printWindow.setTimeout(() => {
      printWindow.print();
    }, 1000);
  };

  // --- RENDER ---
  const totalGross = Math.round(details.reduce(
    (acc, i) => acc + (Number(i.grossAmount) || 0),
    0,
  ) * 100) / 100;
  const totalVariance = Math.round(details.reduce(
    (acc, i) => acc + (Number(i.priceVariance) || 0),
    0,
  ) * 100) / 100;
  const totalDiscount = Math.round(details.reduce(
    (acc, i) => acc + (Number(i.discountAmount) || 0),
    0,
  ) * 100) / 100;
  const totalNet = Math.round(details.reduce(
    (acc, i) => acc + (Number(i.totalAmount) || 0),
    0,
  ) * 100) / 100;
  const filteredInvoices = invoiceOptions.filter((inv) =>
    inv.invoice_no.toLowerCase().includes(invoiceSearch.toLowerCase()),
  );

  const filteredOrderDropdown = invoiceOptions.filter((inv) =>
    inv.order_id.toLowerCase().includes(orderSearch.toLowerCase()),
  );
  const filteredInvoiceDropdown = invoiceOptions.filter((inv) =>
    inv.invoice_no.toLowerCase().includes(invoiceDropdownSearch.toLowerCase()),
  );

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="w-full max-w-[95vw] lg:max-w-7xl h-[90vh] flex flex-col p-0 overflow-hidden bg-background border-0 shadow-2xl rounded-xl [&>button]:hidden"
      >
        {/* HEADER */}
        <div className="px-8 py-5 border-b border-border flex justify-between items-center bg-background shrink-0">
          <div>
            <DialogTitle className="text-2xl font-bold text-foreground">
              {isPending ? "Edit Sales Return" : "Return Details"}
            </DialogTitle>
            <div className="flex items-center gap-2 mt-1">
              {loading ? (
                <Skeleton className="h-5 w-44 rounded" />
              ) : (
                <>
                  <span className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs font-bold uppercase tracking-wider">
                    {headerData.returnNo}
                  </span>
                  <span className="text-muted-foreground text-sm">|</span>
                  <span className="text-sm text-muted-foreground">
                    {headerData.returnDate}
                  </span>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading || isUpdating || isReceiving}
            className="bg-destructive hover:bg-destructive text-white p-2 rounded-md shadow-sm transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="flex-1 overflow-y-auto p-8 space-y-8 bg-muted/50">
          {/* METADATA */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4 bg-background p-5 rounded-xl border border-border shadow-sm relative">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary rounded-l-xl"></div>

            <ReadOnlyField label="Salesman" value={getSalesmanName(headerData.salesmanId)} isLoading={loading} />
            <ReadOnlyField label="Salesman Code" value={getSalesmanCode(headerData.salesmanId)} isLoading={loading} />
            <ReadOnlyField label="Customer" value={getCustomerName(headerData.customerCode)} isLoading={loading} />
            <ReadOnlyField label="Customer Code" value={headerData.customerCode} isLoading={loading} />

            <ReadOnlyField label="Branch" value={getSalesmanBranch(headerData.salesmanId)} isLoading={loading} />
            <ReadOnlyField label="Return Date" value={headerData.returnDate} isLoading={loading} />
            <ReadOnlyField label="Received Date" value={headerData.status === "Received" && headerData.receivedAt ? headerData.receivedAt : "-"} isLoading={loading} />
            <ReadOnlyField label="Price Type" value={getResolvedPriceType(headerData.priceType)} isLoading={loading} />

            <div className="flex items-center space-x-2 pt-2 col-span-2 lg:col-span-4">
              <Checkbox
                id="isThirdParty"
                checked={headerData.isThirdParty || false}
                disabled={!canEditAll || loading}
                onCheckedChange={(checked) =>
                  setHeaderData({
                    ...headerData,
                    isThirdParty: checked as boolean,
                  })
                }
              />
              <Label
                htmlFor="isThirdParty"
                className="text-sm font-medium text-foreground cursor-pointer"
              >
                Third Party Transaction
              </Label>
            </div>
          </div>

          {/* PRODUCT TABLE */}
          <div className="space-y-4">
            <div className="flex justify-between items-end">
              <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                <span className="h-5 w-1 bg-primary rounded-full"></span>
                Products Summary
              </h3>
              {/* 🟢 REVISED: Add Button hidden if not Pending */}
              {canEditAll && (
                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    disabled={loading}
                    className="bg-primary hover:bg-primary text-white gap-2 shadow-md shadow-primary/20 disabled:opacity-50"
                    onClick={() => setIsProductLookupOpen(true)}
                  >
                    <Plus className="h-4 w-4" /> Add Product
                  </Button>
                </div>
              )}
            </div>

            <div className="border border-border rounded-xl overflow-hidden bg-background shadow-sm">
              <div className="overflow-x-auto pb-4">
                <Table className="min-w-[1200px]">
                  <TableHeader>
                    <TableRow className="bg-primary hover:bg-primary! border-none">
                      <TableHead className="text-white font-semibold h-11 w-[120px] uppercase text-xs">
                        Code
                      </TableHead>
                      <TableHead className="text-white font-semibold h-11 min-w-[200px] uppercase text-xs">
                        Description
                      </TableHead>
                      <TableHead className="text-white font-semibold h-11 min-w-[130px] uppercase text-xs">
                        Product Type
                      </TableHead>
                      <TableHead className="text-white font-semibold h-11 min-w-[180px] uppercase text-xs">
                        Lot &amp; Batch Allocation
                      </TableHead>
                      <TableHead className="text-white font-semibold h-11 w-[80px] uppercase text-xs">
                        Unit
                      </TableHead>
                      <TableHead className="text-white font-semibold h-11 text-center min-w-[100px] uppercase text-xs">
                        Qty
                      </TableHead>
                      <TableHead className="text-white font-semibold h-11 text-right min-w-[120px] uppercase text-xs">
                        Unit Price
                      </TableHead>
                      <TableHead className="text-white font-semibold h-11 text-right min-w-[120px] uppercase text-xs">
                        Agreed Price
                      </TableHead>
                      <TableHead className="text-white font-semibold h-11 text-right min-w-[100px] uppercase text-xs">
                        Variance
                      </TableHead>
                      <TableHead className="text-white font-semibold h-11 text-right min-w-[120px] uppercase text-xs">
                        Gross
                      </TableHead>
                      <TableHead className="text-white font-semibold h-11 w-[150px] uppercase text-xs">
                        Disc. Type
                      </TableHead>
                      <TableHead className="text-white font-semibold h-11 w-[160px] uppercase text-xs">
                        Return Type
                      </TableHead>
                      {canEditAll && (
                        <TableHead className="text-white font-semibold h-11 min-w-[90px] sticky right-0 bg-primary z-20 text-center shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                          Actions
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      Array.from({ length: 5 }).map((_, rowIndex) => (
                        <TableRow key={`skeleton-row-${rowIndex}`} className="border-b border-border">
                          <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[180px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-[140px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[40px]" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-[60px] mx-auto" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-[80px] ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-[100px]" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-[100px]" /></TableCell>
                          {canEditAll && <TableCell><Skeleton className="h-8 w-8 rounded-md mx-auto" /></TableCell>}
                        </TableRow>
                      ))
                    ) : details.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={canEditAll ? 13 : 12}
                          className="h-24 text-center text-muted-foreground text-sm"
                        >
                          No products found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {/* 1. RENDER MANUAL ITEMS (No RFID) */}
                        {details.map((item, idx) => {
                          const isManual = !item.rfidTags || item.rfidTags.length === 0;
                          if (!isManual) return null;
                          
                          const hasAllocations = Boolean(
                            (item.lot_allocations && item.lot_allocations.length > 0) ||
                            (item.lot_id && item.batch)
                          );

                          const allocatedSum = item.lot_allocations && item.lot_allocations.length > 0
                            ? item.lot_allocations.reduce((sum, g) => 
                                sum + (g.batches?.reduce((bSum, b) => bSum + Number(b.quantity || 0), 0) || Number(g.allocated_quantity || 0)), 0)
                            : (item.lot_id && item.batch ? item.quantity : null);

                          const hasQtyMismatch = allocatedSum !== null && allocatedSum !== Number(item.quantity);

                          const displayInfo = item.lot_allocations && item.lot_allocations.length > 0
                            ? (item.lot_allocations.length === 1
                                ? `${item.lot_allocations[0].lot_name || `Lot #${item.lot_allocations[0].lot_id}`} • ${item.lot_allocations[0].batches.map(b => b.batch_no).filter(Boolean).join(', ')} (${allocatedSum} ${item.unit})`
                                : `${item.lot_allocations.length} Lots • ${item.lot_allocations.reduce((acc, g) => acc + (g.batches?.length || 1), 0)} Batches (${allocatedSum} ${item.unit})`)
                            : (item.lot_id && item.batch
                                ? `${lotOptions.find(l => l.lot_id === item.lot_id)?.lot_name || `Lot #${item.lot_id}`} • ${item.batch}`
                                : null);

                          const isBadQA = item.qa_status && item.qa_status !== 'GOOD';

                          return (
                            <TableRow
                              key={item.id || idx}
                              className="border-b border-border hover:bg-muted/20 transition-colors duration-200"
                            >
                              <TableCell className="text-sm text-foreground font-bold align-middle font-mono">
                                {item.code}
                              </TableCell>
                              <TableCell className="align-middle">
                                <div
                                  className="text-sm text-foreground font-medium"
                                  title={item.description}
                                >
                                  {item.description}
                                </div>
                              </TableCell>

                              {/* PRODUCT TYPE CELL */}
                              <TableCell className="align-middle p-2">
                                <span className="text-xs text-muted-foreground font-medium">
                                  {item.product_type_name || "-"}
                                </span>
                              </TableCell>
                              
                              {/* LOT & BATCH ALLOCATION CELL */}
                              <TableCell className="align-middle p-2">
                                <div className="flex flex-col gap-1">
                                  {hasAllocations && displayInfo ? (
                                    <Badge
                                      variant="outline"
                                      onClick={() => handleOpenLotBatchModal(idx)}
                                      className={cn(
                                        "text-[11px] py-1 px-2 font-medium cursor-pointer transition-colors max-w-[280px] truncate justify-start gap-1.5 shadow-2xs hover:opacity-85",
                                        isBadQA
                                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                                          : "bg-primary/10 text-primary border-primary/30"
                                      )}
                                      title={`Click to edit allocations:\n${displayInfo}`}
                                    >
                                      <Layers className="w-3.5 h-3.5 shrink-0" />
                                      <span className="truncate">{displayInfo}</span>
                                    </Badge>
                                  ) : (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleOpenLotBatchModal(idx)}
                                      className={cn(
                                        "h-8 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20 justify-start gap-1.5 shadow-2xs",
                                        lotDetailsError && !hasAllocations && "border-destructive ring-1 ring-destructive/30 bg-destructive/5 text-destructive"
                                      )}
                                    >
                                      <Plus className="w-3.5 h-3.5 text-amber-600" />
                                      Assign Lot &amp; Batch
                                    </Button>
                                  )}

                                  {hasQtyMismatch && (
                                    <Badge
                                      variant="destructive"
                                      onClick={() => handleOpenLotBatchModal(idx)}
                                      className="text-[10px] py-0.5 px-1.5 font-bold cursor-pointer gap-1 shadow-2xs hover:bg-destructive/90 transition-colors w-fit"
                                      title={`Quantity Mismatch: Table quantity is ${item.quantity}, but allocated batch sum is ${allocatedSum}. Click to balance batches.`}
                                    >
                                      <AlertCircle className="w-3 h-3" />
                                      Mismatch ({allocatedSum} alloc)
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>

                              <TableCell className="text-sm text-muted-foreground align-middle">
                                <Badge
                                  variant="outline"
                                  className="text-foreground bg-background border-border font-normal"
                                >
                                  {item.unit}
                                </Badge>
                              </TableCell>
                              {/* Quantity */}
                              <TableCell className="text-center align-middle p-2">
                                {canEditAll ? (
                                  <Input
                                    type="number"
                                    className="h-9 w-full text-center text-sm border-border px-2"
                                    value={item.quantity}
                                    onChange={(e) =>
                                      handleDetailChange(idx, "quantity", e.target.value)
                                    }
                                  />
                                ) : (
                                  <span className="text-sm font-semibold text-foreground">
                                    {item.quantity}
                                  </span>
                                )}
                              </TableCell>
                              {/* Unit Price */}
                              <TableCell className="text-right align-middle p-2 bg-muted/10">
                                <span className="text-sm text-foreground">
                                  {Number(item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              </TableCell>
                              {/* Agreed Price */}
                              <TableCell className="text-center align-middle p-2">
                                {canEditAll ? (
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="h-9 w-full text-right text-sm border-border px-2"
                                    value={item.agreedPrice !== undefined && item.agreedPrice !== null ? item.agreedPrice : item.unitPrice}
                                    onChange={(e) =>
                                      handleDetailChange(idx, "agreedPrice", e.target.value)
                                    }
                                  />
                                ) : (
                                  <span className="text-sm text-foreground">
                                    {Number(item.agreedPrice !== undefined && item.agreedPrice !== null ? item.agreedPrice : item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                )}
                              </TableCell>
                              {/* Variance */}
                              <TableCell className={`text-right align-middle font-mono text-sm whitespace-nowrap ${(item.priceVariance || 0) > 0 ? "text-green-600" : (item.priceVariance || 0) < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                {(item.priceVariance || 0) > 0 ? "+" : ""}{(item.priceVariance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </TableCell>
                              {/* Gross */}
                              <TableCell className="text-right text-sm text-muted-foreground align-middle font-mono whitespace-nowrap">
                                {(Number(item.grossAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </TableCell>
                              {/* Discount */}
                              <TableCell className="align-middle p-2">
                                {canEditAll ? (
                                  (() => {
                                    const noDiscountOpt = discountOptions.find(o => o.discount_type === "No Discount");
                                    const defaultVal = noDiscountOpt ? noDiscountOpt.id.toString() : "No Discount";
                                    const currentDiscVal = item.discountType?.toString() ? (
                                      discountOptions.some(o => o.id.toString() === item.discountType?.toString())
                                        ? item.discountType.toString()
                                        : defaultVal
                                    ) : defaultVal;
                                    return (
                                      <LocalSearchableSelect
                                        value={currentDiscVal}
                                        onValueChange={(val) => handleDetailChange(idx, "discountType", val)}
                                        options={discountOptions.map((opt) => ({
                                          value: opt.id.toString(),
                                          label: opt.discount_type,
                                        }))}
                                        placeholder="Select Discount..."
                                        className="h-9 w-full text-xs"
                                      />
                                    );
                                  })()
                                ) : (
                                  <span className="text-xs text-muted-foreground">
                                    {discountOptions.find((d) => d.id.toString() == item.discountType)?.discount_type || "None"}
                                  </span>
                                )}
                              </TableCell>

                              {/* Return Type */}
                              <TableCell className="align-middle p-2">
                                {canEditAll ? (
                                  <LocalSearchableSelect
                                    value={item.returnType || ""}
                                    onValueChange={(val) => handleDetailChange(idx, "returnType", val)}
                                    options={
                                      returnTypeOptions.length > 0
                                        ? returnTypeOptions.map((rt) => ({
                                            value: rt.type_name,
                                            label: rt.type_name,
                                          }))
                                        : [
                                            { value: "Good Order", label: "Good Order" },
                                            { value: "Bad Order", label: "Bad Order" },
                                          ]
                                    }
                                    placeholder="Select Return Type..."
                                    className={cn(
                                      "h-9 w-full text-xs",
                                      returnTypeError && !item.returnType && "border-destructive ring-1 ring-destructive/30 bg-destructive/5"
                                    )}
                                  />
                                ) : (
                                  <Badge variant="outline" className="font-normal text-xs">
                                    {item.returnType || "-"}
                                  </Badge>
                                )}
                              </TableCell>

                              {/* Actions */}
                              {canEditAll && (
                                <TableCell className="align-middle p-2 text-center whitespace-nowrap sticky right-0 bg-background z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteRow(idx)}
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-md"
                                    title="Remove Item"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}

                        {/* 2. RENDER RFID GROUPED ITEMS */}
                        {Object.values(
                          details.filter(i => i.rfidTags && i.rfidTags.length > 0).reduce((acc, item) => {
                            const idx = details.findIndex(d => d === item);
                            const rType = item.returnType || "Unassigned";
                            const key = `${item.productId}-${item.unit}-${rType}`;
                            if (!acc[key]) {
                              acc[key] = {
                                key,
                                code: item.code,
                                description: item.description,
                                productType: item.product_type_name || (typeof item.product_type === "string" ? item.product_type : undefined),
                                unit: item.unit,
                                returnType: rType,
                                unitPrice: item.unitPrice,
                                agreedPrice: item.agreedPrice !== undefined && item.agreedPrice !== null ? item.agreedPrice : item.unitPrice,
                                totalQty: 0,
                                totalVariance: 0,
                                totalGross: 0,
                                totalDiscount: 0,
                                totalNet: 0,
                                children: [],
                              };
                            }
                            acc[key].totalQty += Number(item.quantity) || 0;
                            acc[key].totalVariance += Number(item.priceVariance) || 0;
                            acc[key].totalGross += Number(item.grossAmount) || 0;
                            acc[key].totalDiscount += Number(item.discountAmount) || 0;
                            acc[key].totalNet += Number(item.totalAmount) || 0;
                            acc[key].children.push({ item, idx });
                            return acc;
                          }, {} as Record<string, SalesReturnGroup>)
                        ).map((group: SalesReturnGroup) => (
                          <React.Fragment key={group.key}>
                            {/* Parent Summary Row */}
                            <TableRow className="bg-muted/10 font-semibold border-b border-border">
                              <TableCell className="text-sm text-foreground align-middle font-mono">
                                <div className="flex items-center gap-2">
                                  {group.children.length > 0 ? (
                                    <button
                                      type="button"
                                      onClick={() => setExpandedGroups(prev => ({ ...prev, [group.key]: !prev[group.key] }))}
                                      className="p-1 hover:bg-muted rounded-md transition-colors text-foreground"
                                    >
                                      <ChevronDown className={`h-4 w-4 transition-transform ${expandedGroups[group.key] ? 'rotate-180' : ''}`} />
                                    </button>
                                  ) : (
                                    <div className="w-6" />
                                  )}
                                  <span>{group.code}</span>
                                </div>
                              </TableCell>
                              <TableCell className="align-middle">
                                <div
                                  className="text-sm text-foreground font-medium"
                                  title={group.description}
                                >
                                  {group.description}
                                </div>
                              </TableCell>
                              <TableCell className="align-middle p-2 text-xs text-muted-foreground">
                                {group.productType ? (
                                  <Badge variant="outline" className="font-normal text-[11px]">
                                    {group.productType}
                                  </Badge>
                                ) : "-"}
                              </TableCell>
                              <TableCell className="align-middle p-2 text-xs text-muted-foreground">
                                <Badge variant="outline" className="font-normal text-[11px]">
                                  {group.children.length} RFID scan(s)
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground align-middle">
                                <Badge
                                  variant="outline"
                                  className="text-foreground bg-background border-border font-normal"
                                >
                                  {group.unit}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center align-middle p-2 text-primary text-sm font-bold">
                                {group.totalQty}
                              </TableCell>
                              <TableCell className="text-right align-middle p-2 text-muted-foreground bg-muted/10">
                                -
                              </TableCell>
                              <TableCell className="text-right align-middle p-2 text-muted-foreground">
                                -
                              </TableCell>
                              <TableCell className={`text-right align-middle font-mono text-sm whitespace-nowrap ${(group.totalVariance || 0) > 0 ? "text-green-600" : (group.totalVariance || 0) < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                {(group.totalVariance || 0) > 0 ? "+" : ""}{(group.totalVariance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="text-right text-sm text-muted-foreground align-middle font-mono">
                                {(Number(group.totalGross)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="align-middle p-2 text-center text-muted-foreground">
                                -
                              </TableCell>
                              <TableCell className="align-middle p-2 text-center text-muted-foreground">
                                <Badge variant="outline" className="font-normal text-[11px]">
                                  {group.returnType || "-"}
                                </Badge>
                              </TableCell>
                              {canEditAll && (
                                <TableCell className="sticky right-0 bg-muted/10 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]" />
                              )}
                            </TableRow>

                            {/* Child Rows */}
                            {expandedGroups[group.key] && group.children.map(({ item, idx }: { item: SalesReturnItem, idx: number }) => {
                              const hasAllocations = Boolean(
                                (item.lot_allocations && item.lot_allocations.length > 0) ||
                                (item.lot_id && item.batch)
                              );

                              const allocatedSum = item.lot_allocations && item.lot_allocations.length > 0
                                ? item.lot_allocations.reduce((sum, g) => 
                                    sum + (g.batches?.reduce((bSum, b) => bSum + Number(b.quantity || 0), 0) || Number(g.allocated_quantity || 0)), 0)
                                : (item.lot_id && item.batch ? item.quantity : null);

                              const displayInfo = item.lot_allocations && item.lot_allocations.length > 0
                                ? (item.lot_allocations.length === 1
                                    ? `${item.lot_allocations[0].lot_name || `Lot #${item.lot_allocations[0].lot_id}`} • ${item.lot_allocations[0].batches.map(b => b.batch_no).filter(Boolean).join(', ')} (${allocatedSum} ${item.unit})`
                                    : `${item.lot_allocations.length} Lots (${allocatedSum} ${item.unit})`)
                                : (item.lot_id && item.batch ? `${item.batch}` : null);

                              return (
                                <TableRow
                                  key={item.id || idx}
                                  className="border-b border-border hover:bg-muted/20 transition-colors duration-200"
                                >
                                  <TableCell colSpan={2} className="text-sm text-foreground font-bold align-middle pl-10 font-mono">
                                    {item.rfidTags && item.rfidTags.length > 0 ? (
                                      <div className="flex items-center gap-1.5 bg-background border border-border pl-2.5 pr-2 py-1 rounded-md w-fit truncate max-w-[200px]" title={item.rfidTags[0]}>
                                        <span className="text-primary truncate">{item.rfidTags[0]}</span>
                                        <span className="text-[10px] text-muted-foreground font-sans uppercase">RFID</span>
                                      </div>
                                    ) : null}
                                  </TableCell>
                                  <TableCell className="align-middle p-2 text-xs text-muted-foreground">
                                    {item.product_type_name || "-"}
                                  </TableCell>
                                  <TableCell className="align-middle p-2">
                                    {hasAllocations && displayInfo ? (
                                      <Badge
                                        variant="outline"
                                        onClick={() => handleOpenLotBatchModal(idx)}
                                        className="text-[10px] py-0.5 px-1.5 font-medium cursor-pointer transition-colors bg-primary/10 text-primary border-primary/30 gap-1"
                                      >
                                        <Layers className="w-3 h-3 shrink-0" />
                                        <span className="truncate">{displayInfo}</span>
                                      </Badge>
                                    ) : (
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenLotBatchModal(idx)}
                                        className="h-7 text-[10px] font-semibold text-amber-700 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20"
                                      >
                                        Assign
                                      </Button>
                                    )}
                                  </TableCell>
                                  <TableCell className="text-sm text-muted-foreground align-middle">
                                    {item.unit}
                                  </TableCell>
                                  <TableCell className="text-center align-middle p-2">
                                    <div className="text-center font-semibold text-sm">{item.quantity}</div>
                                  </TableCell>
                                  <TableCell className="text-right align-middle p-2 bg-muted/10">
                                    <span className="text-sm text-foreground">
                                      {Number(item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-center align-middle p-2">
                                    {canEditAll ? (
                                      <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        className="h-9 w-full text-right text-sm border-border px-2"
                                        value={item.agreedPrice !== undefined && item.agreedPrice !== null ? item.agreedPrice : item.unitPrice}
                                        onChange={(e) =>
                                          handleDetailChange(idx, "agreedPrice", e.target.value)
                                        }
                                      />
                                    ) : (
                                      <span className="text-sm text-foreground">
                                        {Number(item.agreedPrice !== undefined && item.agreedPrice !== null ? item.agreedPrice : item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className={`text-right align-middle font-mono text-sm whitespace-nowrap ${(item.priceVariance || 0) > 0 ? "text-green-600" : (item.priceVariance || 0) < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                    {(item.priceVariance || 0) > 0 ? "+" : ""}{(item.priceVariance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="text-right text-sm text-muted-foreground align-middle font-mono">
                                    {(Number(item.grossAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </TableCell>
                                  <TableCell className="align-middle p-2">
                                    <span className="text-xs text-muted-foreground">
                                      {discountOptions.find((d) => d.id.toString() == item.discountType)?.discount_type || "None"}
                                    </span>
                                  </TableCell>
                                  <TableCell className="align-middle p-2">
                                    {canEditAll ? (
                                      <LocalSearchableSelect
                                        value={item.returnType || ""}
                                        onValueChange={(val) => handleDetailChange(idx, "returnType", val)}
                                        options={
                                          returnTypeOptions.length > 0
                                            ? returnTypeOptions.map((rt) => ({
                                                value: rt.type_name,
                                                label: rt.type_name,
                                              }))
                                            : [
                                                { value: "Good Order", label: "Good Order" },
                                                { value: "Bad Order", label: "Bad Order" },
                                              ]
                                        }
                                        placeholder="Select Return Type..."
                                        className={cn(
                                          "h-9 w-full text-xs",
                                          returnTypeError && !item.returnType && "border-destructive ring-1 ring-destructive/30 bg-destructive/5"
                                        )}
                                      />
                                    ) : (
                                      <Badge variant="outline" className="font-normal text-xs">
                                        {item.returnType || "-"}
                                      </Badge>
                                    )}
                                  </TableCell>
                                  {canEditAll && (
                                    <TableCell className="text-center align-middle whitespace-nowrap sticky right-0 bg-background z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-white hover:bg-destructive"
                                        onClick={() => handleDeleteRow(idx)}
                                        title="Remove row"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </TableCell>
                                  )}
                                </TableRow>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>

          {/* BOTTOM FORM GRID */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
            <div className="md:col-span-2 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5" ref={orderDropdownRef}>
                  <Label className="text-xs uppercase font-bold text-muted-foreground">
                    Order No. <span className="text-destructive">*</span>
                  </Label>
                  {/* Order No Dropdown */}
                  {loading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : canEditAll ? (
                    <div className="relative group">
                      <input
                        type="text"
                        className={`w-full h-9 border rounded-md text-sm px-3 pr-8 bg-background outline-none transition-all shadow-sm ${orderError
                            ? "border-destructive bg-destructive/5 ring-1 ring-destructive"
                            : "border-border focus:ring-2 focus:border-primary"
                          }`}
                        placeholder="Search Order No..."
                        value={orderSearch || headerData.orderNo || ""}
                        onChange={(e) => {
                          setOrderSearch(e.target.value);
                          setHeaderData({ ...headerData, orderNo: e.target.value });
                          setIsOrderDropdownOpen(true);
                        }}
                        onFocus={() => setIsOrderDropdownOpen(true)}
                      />
                      <ChevronDown className="h-3 w-3 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      {isOrderDropdownOpen && (
                        <div className="absolute bottom-[calc(100%+4px)] left-0 w-full z-50 bg-background border border-border rounded-md shadow-xl max-h-48 overflow-y-auto">
                          {filteredOrderDropdown.length > 0 ? (
                            filteredOrderDropdown.map((inv) => (
                              <div
                                key={`order-${inv.id}`}
                                className="px-3 py-2 text-sm cursor-pointer hover:bg-primary/10 text-foreground"
                                onClick={() => {
                                  setHeaderData({
                                    ...headerData,
                                    orderNo: inv.order_id,
                                    invoiceNo: inv.invoice_no,
                                  });
                                  setOrderSearch(inv.order_id);
                                  setInvoiceDropdownSearch(inv.invoice_no);
                                  setAppliedInvoiceId(Number(inv.id));
                                  setIsOrderDropdownOpen(false);
                                }}
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">{inv.order_id}</span>
                                  <span className="text-[10px] text-muted-foreground">Invoice: {inv.invoice_no}</span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                              No orders found
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-md text-sm font-medium text-foreground">
                      {headerData.orderNo || "-"}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5" ref={invoiceDropdownRef}>
                  <Label className="text-xs uppercase font-bold text-muted-foreground">
                    Invoice No. <span className="text-destructive">*</span>
                  </Label>
                  {/* Invoice No Dropdown */}
                  {loading ? (
                    <Skeleton className="h-9 w-full" />
                  ) : canEditAll ? (
                    <div className="relative group">
                      <input
                        type="text"
                        className={`w-full h-9 border rounded-md text-sm px-3 pr-8 bg-background outline-none transition-all shadow-sm ${invoiceError
                            ? "border-destructive bg-destructive/5 ring-1 ring-destructive"
                            : "border-border focus:ring-2 focus:border-primary"
                          }`}
                        placeholder="Search Invoice No..."
                        value={invoiceDropdownSearch || headerData.invoiceNo || ""}
                        onChange={(e) => {
                          setInvoiceDropdownSearch(e.target.value);
                          setHeaderData({ ...headerData, invoiceNo: e.target.value });
                          setIsInvoiceDropdownOpen(true);
                        }}
                        onFocus={() => setIsInvoiceDropdownOpen(true)}
                      />
                      <ChevronDown className="h-3 w-3 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      {isInvoiceDropdownOpen && (
                        <div className="absolute bottom-[calc(100%+4px)] left-0 w-full z-50 bg-background border border-border rounded-md shadow-xl max-h-48 overflow-y-auto">
                          {filteredInvoiceDropdown.length > 0 ? (
                            filteredInvoiceDropdown.map((inv) => (
                              <div
                                key={`inv-${inv.id}`}
                                className="px-3 py-2 text-sm cursor-pointer hover:bg-primary/10 text-foreground"
                                onClick={() => {
                                  setHeaderData({
                                    ...headerData,
                                    invoiceNo: inv.invoice_no,
                                    orderNo: inv.order_id,
                                  });
                                  setInvoiceDropdownSearch(inv.invoice_no);
                                  setOrderSearch(inv.order_id);
                                  setAppliedInvoiceId(Number(inv.id));
                                  setIsInvoiceDropdownOpen(false);
                                }}
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">{inv.invoice_no}</span>
                                  <span className="text-[10px] text-muted-foreground">Order: {inv.order_id}</span>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                              No invoices found
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-full px-3 py-2.5 bg-muted/30 border border-border rounded-md text-sm font-medium text-foreground">
                      {headerData.invoiceNo || "-"}
                    </div>
                  )}
                </div>
              </div>
              <RemarksInputSection
                value={headerData.remarks || ""}
                onChange={(val) => setHeaderData({ ...headerData, remarks: val })}
                disabled={!canEditLimited}
                isLoading={loading}
              />
            </div>

            {/* FINANCIAL SUMMARY */}
            <div className="space-y-5">
              <div className="bg-background p-6 rounded-xl border border-primary/20 shadow-sm space-y-3 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">
                    Gross Amount
                  </span>
                  <div className="font-semibold text-foreground">
                    {loading ? (
                      <Skeleton className="h-5 w-24" />
                    ) : (
                      `₱${totalGross.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}`
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground font-medium">
                    Discount Amount
                  </span>
                  <div className={`font-semibold font-mono ${totalDiscount > 0 ? "text-amber-600 dark:text-amber-500" : "text-foreground"}`}>
                    {loading ? (
                      <Skeleton className="h-5 w-24" />
                    ) : (
                      `₱${totalDiscount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}`
                    )}
                  </div>
                </div>
                <div className="flex justify-between items-center text-sm pt-1 border-t border-muted/50 mt-1">
                  <span className="text-muted-foreground font-medium">
                    Price Variance Logged
                  </span>
                  <div className={`font-mono font-bold ${totalVariance > 0 ? "text-emerald-600 dark:text-emerald-500" : totalVariance < 0 ? "text-rose-600 dark:text-rose-500" : "text-slate-500"}`}>
                    {loading ? (
                      <Skeleton className="h-5 w-24" />
                    ) : (
                      `${totalVariance > 0 ? "+" : ""}₱${totalVariance.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}`
                    )}
                  </div>
                </div>
                <div className="h-px bg-muted my-3"></div>
                <div className="flex justify-between items-center">
                  <span className="text-foreground font-bold text-base">
                    Net Amount
                  </span>
                  <div className="font-bold text-primary text-xl">
                    {loading ? (
                      <Skeleton className="h-7 w-32" />
                    ) : (
                      `₱${totalNet.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}`
                    )}
                  </div>
                </div>

                <div className="h-px bg-muted my-3"></div>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <div className="flex justify-between items-center col-span-2">
                    <span className="text-muted-foreground font-medium">
                      Applied to
                    </span>
                    {/* 🟢 REVISED: Editable if Pending or Received (canEditLimited) */}
                    {loading && !statusCardData ? (
                      <Skeleton className="h-6 w-28" />
                    ) : (canEditLimited && !isInvoicePosted) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs border-primary/20 text-primary hover:bg-primary/10 px-2"
                        onClick={() => setIsInvoiceLookupOpen(true)}
                      >
                        {statusCardData?.appliedTo || "Select Invoice"}{" "}
                        <LinkIcon className="ml-1 h-3 w-3" />
                      </Button>
                    ) : (
                      <span className="text-foreground font-medium">
                        {statusCardData?.appliedTo || "-"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="border-t border-border p-5 bg-background flex justify-end gap-3 shrink-0">
          <Button variant="outline" onClick={handlePrintInNewTab} disabled={loading || isUpdating || isReceiving}>
            <Printer className="h-4 w-4 mr-2" /> Print Slip
          </Button>
          <Button variant="outline" onClick={onClose} disabled={loading || isUpdating || isReceiving}>
            Close
          </Button>
          <Button
            className="min-w-[100px]"
            onClick={handleReceiveClick}
            disabled={loading || !isPending || isReceiving || isUpdating || details.length === 0 || totalNet <= 0}
          >
            {isReceiving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Receive
          </Button>
          <Button
            className="bg-primary hover:bg-primary text-white min-w-40"
            onClick={handleUpdateClick}
            disabled={loading || !canEditLimited || isUpdating || isReceiving}
          >
            {isUpdating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Update Sales Return
          </Button>
        </div>
      </DialogContent>

      {/* 2. INVOICE LOOKUP - 🟢 REVISED: Shows Amount */}
      <Dialog open={isInvoiceLookupOpen} onOpenChange={setIsInvoiceLookupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Select Invoice{" "}
              <Badge variant="secondary" className="text-xs font-normal">
                {invoiceOptions.length} Found
              </Badge>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search Invoice No..."
                className="pl-10"
                value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
              />
            </div>
            <div className="max-h-[300px] overflow-y-auto border rounded-md divide-y">
              {/* 🟢 NEW: Clear Selection Option */}
              <div
                className="p-3 hover:bg-destructive/10 cursor-pointer flex items-center gap-3 transition-colors text-destructive font-medium border-b"
                onClick={() => {
                  if (isInvoicePosted) {
                    toast.error("This invoice has already been posted. Once an invoice is posted, it is locked and cannot be unlinked or changed.");
                    return;
                  }
                  setStatusCardData((prev) => ({
                    ...prev!,
                    appliedTo: "",
                  }));
                  setAppliedInvoiceId(null);
                  setIsInvoicePosted(false);
                  setIsInvoiceLookupOpen(false);
                }}
              >
                <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
                  <X className="h-4 w-4" />
                </div>
                <div className="text-sm">Clear Selection (Unlink)</div>
              </div>

              {filteredInvoices.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  No invoices found.
                </div>
              ) : (
                filteredInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-3 hover:bg-primary/10 cursor-pointer flex items-center gap-3 transition-colors justify-between"
                    onClick={() => {
                      if (isInvoicePosted) {
                        toast.error("This invoice has already been posted. Once an invoice is posted, it is locked and cannot be unlinked or changed.");
                        return;
                      }
                      setStatusCardData((prev) => ({
                        ...prev!,
                        appliedTo: inv.invoice_no,
                      }));
                      setAppliedInvoiceId(Number(inv.id));
                      setIsInvoicePosted(false);
                      setIsInvoiceLookupOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          {inv.invoice_no}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ID: {inv.id}
                        </div>
                      </div>
                    </div>
                    {/* 🟢 REVISED: Display Amount on Right Side */}
                    <span className="text-xs text-muted-foreground font-mono">
                      ₱
                      {Number(inv.amount || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CONFIRM DIALOGS (Update, Success, Receive) remain same structure */}
      <Dialog open={isUpdateConfirmOpen} onOpenChange={setIsUpdateConfirmOpen}>
        <DialogContent className="max-w-[400px] p-6 bg-background rounded-xl shadow-2xl border-0">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Save className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-lg font-bold">
                Confirm Update
              </DialogTitle>
              <div className="text-sm text-muted-foreground">
                Are you sure you want to save changes to Sales Return{" "}
                <span className="font-bold">{headerData.returnNo}</span>?
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setIsUpdateConfirmOpen(false)}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmUpdate}
              disabled={isUpdating}
              className="bg-primary hover:bg-primary text-white"
            >
              {isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Confirm Update"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isUpdateSuccessOpen}
        onOpenChange={(open) => {
          if (!open) {
            onSuccess();
            onClose();
          }
        }}
      >
        <DialogContent className="max-w-[400px] p-8 bg-background rounded-2xl shadow-2xl border-0 focus:outline-none z-60">
          <div className="flex flex-col items-center text-center gap-6">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center animate-in zoom-in duration-300">
              <CheckCircle className="h-10 w-10 text-primary" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-xl font-bold text-foreground">
                Success!
              </DialogTitle>
              <div className="text-muted-foreground">
                Sales Return updated successfully.
              </div>
            </div>
            <Button
              onClick={() => {
                onSuccess();
                onClose();
              }}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base rounded-xl shadow-primary/20 shadow-lg transition-all active:scale-95"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ProductLookupModal
        isOpen={isProductLookupOpen}
        onClose={() => setIsProductLookupOpen(false)}
        onConfirm={handleAddProductsToEdit}
        priceType={headerData.priceType || "A"}
        customerCode={headerData.customerCode}
        lineDiscounts={discountOptions}
        includeInactive={true}
        priceTypeOptions={priceTypeOptions}
      />

      <Dialog
        open={isReceiveConfirmOpen}
        onOpenChange={setIsReceiveConfirmOpen}
      >
        <DialogContent className="max-w-[400px] p-6 bg-background rounded-xl shadow-2xl border-0">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <AlertTriangle className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-lg font-bold">
                Confirm Receipt
              </DialogTitle>
              <div className="text-sm text-muted-foreground">
                Are you sure you want to mark Return{" "}
                <span className="font-bold">{headerData.returnNo}</span> as
                RECEIVED?
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <Button
              variant="outline"
              onClick={() => setIsReceiveConfirmOpen(false)}
              disabled={isReceiving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmReceive}
              disabled={isReceiving}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isReceiving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Confirm"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* LOT & BATCH SELECTION MODAL */}
      {activeLotBatchIndex !== null && activeLotBatchIndex >= 0 && details[activeLotBatchIndex] && (
        <LotBatchSelectionModal
          open={lotBatchModalOpen}
          onOpenChange={setLotBatchModalOpen}
          branchId={(() => {
            const s = salesmenOptions.find((opt) => String(opt.id) === String(headerData.salesmanId));
            return s?.branchId ? Number(s.branchId) : undefined;
          })()}
          productId={details[activeLotBatchIndex].productId}
          productName={details[activeLotBatchIndex].description}
          productCode={details[activeLotBatchIndex].code}
          productUomId={details[activeLotBatchIndex].unit_id}
          productUomName={details[activeLotBatchIndex].unit}
          requestedQuantity={details[activeLotBatchIndex].quantity}
          adjustmentType="IN"
          initialValues={{
            lot_id: details[activeLotBatchIndex].lot_id || undefined,
            lot_name: details[activeLotBatchIndex].lot_name || undefined,
            inventory_lot_id: details[activeLotBatchIndex].inventory_lot_id || undefined,
            batch_no: details[activeLotBatchIndex].batch || "",
            manufacturing_date: details[activeLotBatchIndex].manufacturing_date,
            expiry_date: details[activeLotBatchIndex].expiry_date,
            qa_status: details[activeLotBatchIndex].qa_status || "GOOD",
            lot_allocations: details[activeLotBatchIndex].lot_allocations,
            total_quantity: details[activeLotBatchIndex].quantity,
          }}
          initialLotAllocations={details[activeLotBatchIndex].lot_allocations}
          existingFormAllocations={formSiblingAllocations.filter((_, idx) => idx !== activeLotBatchIndex)}
          onConfirm={handleApplyLotBatch}
        />
      )}
    </Dialog>
  );
}
