"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  X,
  Plus,
  Trash2,
  Copy,
  Save,
  ChevronDown,
  FileText,
  User,
  Calculator,
  CheckCircle,
  Loader2,
  Check,
  ChevronsUpDown,
  Layers,
  AlertCircle,
  Building2,
  Tag,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import {
  SalesReturnItem,
  API_LineDiscount,
  API_SalesReturnType,
  InvoiceOption,
  PriceTypeOption,
  ProductPerPriceType,
  InvoiceLineItem,
  LotOption,
  SalesmanOption,
  CustomerOption,
  BranchOption,
  Product,
} from "../types/sales-return.types";

// Import Child Modals
import { ProductLookupModal } from "./ProductLookupModal";
import {
  SalesReturnLotBatchModal,
  LotBatchSelectionResult,
  FormSiblingAllocation,
} from "./SalesReturnLotBatchModal";
// Import API Client & Helpers
import { SalesReturnApiClient } from "../services/sales-return.api-client";
import { resolveFinalDiscount } from "../services/sales-return.helpers";
import type { LotAllocationGroup, QAStatus } from "@/modules/manufacturing-management/shared/types/lot-tracking.types";
import { fetchInventoryLots, fetchBatchOnhand } from "@/modules/manufacturing-management/shared/services/lot-tracking.service";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

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
          className={cn("w-full justify-between font-normal text-xs px-2 h-8", !value && "text-muted-foreground", className)}
          disabled={disabled}
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0 z-[9999]" align="start">
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

const RemarksInputSection = React.memo(({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
  const [localRemarks, setLocalRemarks] = useState(value);

  useEffect(() => {
    setLocalRemarks(value);
  }, [value]);

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
        Remarks
      </label>
      <Textarea
        value={localRemarks}
        onChange={(e) => setLocalRemarks(e.target.value)}
        onBlur={() => onChange(localRemarks)}
        className="resize-none h-24 border-border focus:border-primary focus:bg-background"
        placeholder="Add any notes regarding this return..."
      />
    </div>
  );
});
RemarksInputSection.displayName = "RemarksInputSection";

const ReasonInputSection = React.memo(({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
  const [localReason, setLocalReason] = useState(value);

  useEffect(() => {
    setLocalReason(value);
  }, [value]);

  return (
    <input
      type="text"
      placeholder="Enter reason"
      className="w-full border border-border rounded h-8 text-sm px-2 outline-none focus:border-primary"
      value={localReason}
      onChange={(e) => setLocalReason(e.target.value)}
      onBlur={() => onChange(localReason)}
    />
  );
});
ReasonInputSection.displayName = "ReasonInputSection";

export function CreateSalesReturnModal({ isOpen, onClose, onSuccess }: Props) {
  const searchParams = useSearchParams();
  const fromClearance = searchParams.get("fromClearance");
  const invoiceNoParam = searchParams.get("invoiceNo");
  const orderNoParam = searchParams.get("orderNo");
  const customerCodeParam = searchParams.get("customerCode");
  // --- 1. FORM STATE ---
  const [returnDate, setReturnDate] = useState(() => {
    const manilaMs = Date.now() + 8 * 60 * 60 * 1000;
    const d = new Date(manilaMs);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  });

  const [selectedSalesmanId, setSelectedSalesmanId] = useState("");
  const [salesmanCode, setSalesmanCode] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchId, setBranchId] = useState<number | null>(null);

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerCode, setCustomerCode] = useState("");

  const [priceType, setPriceType] = useState("A");

  const [isThirdParty, setIsThirdParty] = useState(false);
  // Success Modal State
  const [isSuccessOpen, setSuccessOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // UI State for Validation
  const [returnTypeError, setReturnTypeError] = useState(false);
  const [lotDetailsError, setLotDetailsError] = useState(false);

  // Bottom Form Fields
  const [orderNo, setOrderNo] = useState("");

  // INVOICE STATE
  const [invoiceNo, setInvoiceNo] = useState("");
  const [appliedInvoiceId, setAppliedInvoiceId] = useState<number | null>(null);
  const [remarks, setRemarks] = useState("");

  // --- 2. DATA LISTS ---
  const [salesmen, setSalesmen] = useState<SalesmanOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);

  const [lineDiscountOptions, setLineDiscountOptions] = useState<
    API_LineDiscount[]
  >([]);
  const [returnTypeOptions, setReturnTypeOptions] = useState<
    API_SalesReturnType[]
  >([]);
  const [priceTypeOptions, setPriceTypeOptions] = useState<PriceTypeOption[]>([]);
  const [lotOptions, setLotOptions] = useState<LotOption[]>([]);
  const [lotOnhandMap, setLotOnhandMap] = useState<Record<number, number>>({});

  // INVOICE DATA LIST & DROPDOWN STATE
  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceOption[]>([]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const invoiceWrapperRef = useRef<HTMLDivElement>(null);

  // ORDER NO DROPDOWN STATE
  const [orderSearch, setOrderSearch] = useState("");
  const [isOrderOpen, setIsOrderOpen] = useState(false);
  const orderWrapperRef = useRef<HTMLDivElement>(null);

  const [orderError, setOrderError] = useState(false);
  const [invoiceError, setInvoiceError] = useState(false);

  // --- RFID State ---
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // --- 3. CART & LOT ALLOCATION STATE ---
  const [items, setItems] = useState<SalesReturnItem[]>([]);
  const [invoiceLineItems, setInvoiceLineItems] = useState<InvoiceLineItem[]>([]);
  const [lotBatchModalOpen, setLotBatchModalOpen] = useState(false);
  const [activeLotBatchIndex, setActiveLotBatchIndex] = useState<number | null>(null);

  const handleOpenLotBatchModal = useCallback((index: number) => {
    setActiveLotBatchIndex(index);
    setLotBatchModalOpen(true);
  }, []);

  const handleApplyLotBatch = useCallback((result: LotBatchSelectionResult) => {
    if (activeLotBatchIndex !== null && activeLotBatchIndex >= 0) {
      setItems((prev) => {
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
          if (targetItem.discountType) {
            const selectedOption = lineDiscountOptions.find(d => d.id.toString() === targetItem.discountType?.toString());
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
  }, [activeLotBatchIndex, lineDiscountOptions]);

  const formSiblingAllocations: FormSiblingAllocation[] = useMemo(() => {
    return items.map((item) => ({
      product_id: item.productId,
      product_name: item.description,
      product_code: item.code,
      product_type: item.product_type || item.product_type_name,
      category_name: item.category_name || undefined,
      product_category: item.product_category,
      quantity: item.quantity,
      lot_id: item.lot_id,
      lot_name: item.lot_name,
      lot_allocations: item.lot_allocations,
      batch_no: item.batch,
    }));
  }, [items]);

  // 🟢 NEW: Effect to fetch invoice line items
  useEffect(() => {
    if (appliedInvoiceId) {
      SalesReturnApiClient.getInvoiceDetails(appliedInvoiceId)
        .then((data: InvoiceLineItem[]) => setInvoiceLineItems(data))
        .catch((err: unknown) => console.error("Failed to load invoice items", err));
    } else {
      setInvoiceLineItems([]);
    }
  }, [appliedInvoiceId]);
  const [isProductLookupOpen, setIsProductLookupOpen] = useState(false);

  // --- 4. SEARCHABLE DROPDOWN STATES ---
  const [isSalesmanOpen, setIsSalesmanOpen] = useState(false);
  const [salesmanSearch, setSalesmanSearch] = useState("");
  const salesmanWrapperRef = useRef<HTMLDivElement>(null);

  const [isCustomerOpen, setIsCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const customerWrapperRef = useRef<HTMLDivElement>(null);

  const [isBranchOpen, setIsBranchOpen] = useState(false);
  const [branchSearch, setBranchSearch] = useState("");
  const branchWrapperRef = useRef<HTMLDivElement>(null);

  const [isPriceTypeOpen, setIsPriceTypeOpen] = useState(false);
  const [priceTypeSearch, setPriceTypeSearch] = useState("Type A");
  const priceTypeWrapperRef = useRef<HTMLDivElement>(null);

  /**
   * Resolves the unit price according to 3-tier priority hierarchy:
   * 1. Priority 1: Linked Invoice Line Item (exact historical price)
   * 2. Priority 2: Price Type Fallback (customer/salesman price type)
   * 3. Priority 3: Base Product Price Fallback (cost_per_unit / priceA / price_per_unit)
   */
  const resolvePrice = useCallback((
    item: Partial<SalesReturnItem> | Product,
    currentPriceType?: string,
    catalogPrices?: ProductPerPriceType[],
    invoiceItems?: InvoiceLineItem[]
  ): number => {
    const pId = ("productId" in item && item.productId !== undefined) ? item.productId : ("product_id" in item ? (item as Product).product_id : undefined);

    // Priority 1: Linked Invoice Line Item
    const targetInvoiceItems = invoiceItems || invoiceLineItems;
    if (targetInvoiceItems && targetInvoiceItems.length > 0 && pId !== undefined) {
      const invItem = targetInvoiceItems.find(i => Number(i.product_id) === Number(pId));
      if (invItem && invItem.unit_price !== undefined && invItem.unit_price !== null) {
        return Math.round(Number(invItem.unit_price) * 100) / 100;
      }
    }

    // Priority 2: Price Type Fallback
    if (currentPriceType) {
      const pt = priceTypeOptions.find(p => p.price_type_name === currentPriceType || p.price_type_id.toString() === currentPriceType);

      if (pt && "availablePrices" in item && Array.isArray(item.availablePrices)) {
        const priceRecord = item.availablePrices.find(p => Number(p.price_type_id) === Number(pt.price_type_id));
        if (priceRecord && priceRecord.price !== undefined && priceRecord.price !== null && Number(priceRecord.price) > 0) {
          return Math.round(Number(priceRecord.price) * 100) / 100;
        }
      }

      if (pt && Array.isArray(catalogPrices) && "product_id" in item && item.product_id !== undefined) {
        const priceRecord = catalogPrices.find((p: ProductPerPriceType) => Number(p.product_id) === Number(item.product_id) && Number(p.price_type_id) === Number(pt.price_type_id));
        if (priceRecord && priceRecord.price !== undefined && priceRecord.price !== null && Number(priceRecord.price) > 0) {
          return Math.round(Number(priceRecord.price) * 100) / 100;
        }
      }

      if (pt) {
        const key = `price${pt.price_type_name}` as keyof typeof item;
        if (key in item && item[key] !== undefined && item[key] !== null && Number(item[key]) > 0) {
          return Math.round(Number(item[key]) * 100) / 100;
        }
      }
    }

    // Priority 3: Base Product Price Fallback (cost_per_unit)
    const basePrice = ("cost_per_unit" in item && item.cost_per_unit !== undefined && Number(item.cost_per_unit) > 0)
      ? Number(item.cost_per_unit)
      : ("unitPrice" in item && typeof item.unitPrice === "number")
      ? item.unitPrice
      : 0;

    return Math.round(basePrice * 100) / 100;
  }, [priceTypeOptions, invoiceLineItems]);

  // --- 5. INITIAL LOAD ---
  useEffect(() => {
    if (isOpen) {
      const loadData = async () => {
        try {
          const [
            salesmenData,
            customersData,
            branchesData,
            lineDiscountData,
            returnTypesData,
            priceTypesData,
            lotsData,
          ] = await Promise.all([
            SalesReturnApiClient.getFormSalesmen(),
            SalesReturnApiClient.getFormCustomers(),
            SalesReturnApiClient.getFormBranches(),
            SalesReturnApiClient.getLineDiscounts(),
            SalesReturnApiClient.getSalesReturnTypes(),
            SalesReturnApiClient.getPriceTypes(),
            SalesReturnApiClient.getLots(),
          ]);
          setSalesmen(salesmenData);
          setCustomers(customersData);
          setBranches(branchesData);
          setLineDiscountOptions(lineDiscountData);
          setReturnTypeOptions(returnTypesData);
          setPriceTypeOptions(priceTypesData);
          setLotOptions(lotsData);
        } catch (error) {
          console.error("Failed to load form data", error);
        }
      };
      loadData();
    }
  }, [isOpen]);

  // --- NEW: FETCH LOT CAPACITIES ---
  useEffect(() => {
    if (!branchId || items.length === 0) {
      return;
    }
    const fetchLotCapacities = async () => {
      const uniqueUnitIds = Array.from(new Set(items.map(item => item.unit_id).filter(Boolean))) as number[];
      if (uniqueUnitIds.length === 0) return;
      
      const newMap = { ...lotOnhandMap };
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
  }, [branchId, items]);

  // 🟢 NEW: Effect to automatically update prices when Price Type changes
  useEffect(() => {
    if (items.length > 0) {
      setItems((prevItems) =>
        prevItems.map((item) => {
          const newUnitPrice = resolvePrice(item, priceType, undefined, invoiceLineItems);
          const agPrice = item.agreedPrice !== undefined && item.agreedPrice !== null ? item.agreedPrice : newUnitPrice;

          const newGross = Math.round(item.quantity * newUnitPrice * 100) / 100;
          let newDiscountAmt = 0;

          if (item.discountType) {
            const selectedOption = lineDiscountOptions.find(
              (d) => d.id.toString() === item.discountType?.toString(),
            );
            if (selectedOption) {
              const percentage = parseFloat(selectedOption.total_percent) || 0;
              newDiscountAmt = Math.round(newGross * (percentage / 100) * 100) / 100;
            }
          }

          const newVariance = Math.round((newUnitPrice - agPrice) * item.quantity * 100) / 100;

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
  }, [priceType, lineDiscountOptions, resolvePrice, invoiceLineItems, items.length]);

  // 🟢 NEW: Effect to automatically update discounts when Customer changes
  useEffect(() => {
    if (items.length > 0 && customerCode) {
      const updateDiscounts = async () => {
        try {
          const catalog = await SalesReturnApiClient.getFullCatalog(customerCode);

          setItems((prevItems) =>
            prevItems.map((item) => {
              const productInfo = catalog.products?.find((p: Product) => Number(p.product_id) === Number(item.productId));
              if (!productInfo) return item;

              const newUnitPrice = resolvePrice(productInfo, priceType, catalog.productPrices, invoiceLineItems);
              const agPrice = item.agreedPrice !== undefined && item.agreedPrice !== null ? item.agreedPrice : newUnitPrice;
              const newGross = Math.round(item.quantity * newUnitPrice * 100) / 100;

              const newDiscountType = resolveFinalDiscount(
                productInfo,
                customerCode,
                catalog
              );

              let newDiscountAmt = 0;
              if (newDiscountType) {
                const selectedOption = lineDiscountOptions.find(
                  (d) => d.id.toString() === newDiscountType?.toString(),
                );
                if (selectedOption) {
                  const percentage = parseFloat(selectedOption.total_percent) || 0;
                  newDiscountAmt = Math.round(newGross * (percentage / 100) * 100) / 100;
                }
              }

              const newVariance = Math.round((newUnitPrice - agPrice) * item.quantity * 100) / 100;

              return {
                ...item,
                unitPrice: newUnitPrice,
                agreedPrice: agPrice,
                priceVariance: newVariance,
                grossAmount: newGross,
                discountType: newDiscountType,
                discountAmount: newDiscountAmt,
                totalAmount: Math.round((newGross - newDiscountAmt) * 100) / 100,
                availablePrices: catalog.productPrices?.filter((p: ProductPerPriceType) => Number(p.product_id) === Number(productInfo.product_id)),
              };
            })
          );
        } catch (error) {
          console.error("Failed to update discounts on customer change", error);
        }
      };
      updateDiscounts();
    }
  }, [customerCode, customers, lineDiscountOptions, items.length, priceType, resolvePrice, invoiceLineItems]);

  const handleSelectSalesman = useCallback((salesman: SalesmanOption) => {
    setSelectedSalesmanId(salesman.id.toString());
    setSalesmanSearch(salesman.name);
    setSalesmanCode(salesman.code);

    if (salesman.priceType) {
      const pt = priceTypeOptions.find(p => p.price_type_id.toString() === salesman.priceType.toString());
      if (pt) {
        setPriceType(pt.price_type_name);
        setPriceTypeSearch(`Type ${pt.price_type_name}`);
      } else {
        const ptStr = salesman.priceType.toString();
        setPriceType(ptStr);
        setPriceTypeSearch(ptStr.startsWith("Type ") ? ptStr : `Type ${ptStr}`);
      }
    } else {
      setPriceType("A");
      setPriceTypeSearch("Type A");
    }

    const linkedBranch = branches.find((b) => 
      Number(b.id) === Number(salesman.branchId) ||
      (b.branch_code && salesman.branchId && String(b.branch_code).trim().toLowerCase() === String(salesman.branchId).trim().toLowerCase()) ||
      (b.name && salesman.branchId && String(b.name).trim().toLowerCase() === String(salesman.branchId).trim().toLowerCase())
    );
    const bName = linkedBranch ? (linkedBranch.name || linkedBranch.branch_name || "") : "";
    setBranchName(bName);
    setBranchSearch(bName);
    setBranchId(linkedBranch ? Number(linkedBranch.id) : (salesman.branchId && !isNaN(Number(salesman.branchId)) ? Number(salesman.branchId) : null));
    setIsSalesmanOpen(false);
    setOrderNo("");
    setOrderSearch("");
    setInvoiceNo("");
    setInvoiceSearch("");
  }, [branches, priceTypeOptions]);

  const handleSelectCustomer = useCallback((customer: CustomerOption) => {
    setSelectedCustomerId(customer.id.toString());
    setCustomerSearch(customer.name);
    setCustomerCode(customer.code || "");
    if (customer.price_type_id) {
      const pt = priceTypeOptions.find(p => p.price_type_id.toString() === customer.price_type_id?.toString());
      if (pt) {
        setPriceType(pt.price_type_name);
        setPriceTypeSearch(`Type ${pt.price_type_name}`);
      } else {
        // Fallback if priceTypeOptions is not yet loaded or doesn't match
        const ptStr = customer.price_type_id.toString();
        setPriceType(ptStr);
        setPriceTypeSearch(ptStr.startsWith("Type ") ? ptStr : `Type ${ptStr}`);
      }
    }
    setIsCustomerOpen(false);
    setOrderNo("");
    setOrderSearch("");
    setInvoiceNo("");
    setInvoiceSearch("");
  }, [priceTypeOptions]);

  // --- 5b. FETCH INVOICES when salesman or customer changes ---
  useEffect(() => {
    if (selectedSalesmanId && customerCode) {
      const fetchInv = async () => {
        try {
          const data = await SalesReturnApiClient.getInvoiceReturnList(
            selectedSalesmanId,
            customerCode,
          );
          setInvoiceOptions(data);
        } catch (error) {
          console.error("Failed to fetch invoices", error);
          setInvoiceOptions([]);
        }
      };
      fetchInv();
    } else if (customerCode) {
      const fetchInv = async () => {
        try {
          const data = await SalesReturnApiClient.getInvoiceReturnList(
            undefined,
            customerCode,
          );
          setInvoiceOptions(data);
        } catch (error) {
          console.error("Failed to fetch invoices", error);
          setInvoiceOptions([]);
        }
      };
      fetchInv();
    } else {
      setInvoiceOptions([]);
    }
  }, [selectedSalesmanId, customerCode]);

  // --- 5c. PRE-FILL FROM CLEARANCE / URL PARAMS ---
  useEffect(() => {
    if (!isOpen) return;
    if (customers.length === 0 || salesmen.length === 0) return;

    interface ClearanceReservationItem {
      reservation_id?: number;
      sales_order_detail_id?: number;
      inventory_lot_id?: number;
      product_id?: number;
      lot_id?: number;
      lot_name?: string;
      lot_number?: string;
      batch_no?: string;
      reserved_quantity?: number;
      picked_quantity?: number;
      returned_quantity?: number;
      status?: string;
      manufacturing_date?: string | null;
      expiry_date?: string | null;
    }

    interface ClearancePayloadItem {
      product_id?: number | string;
      product_code?: string;
      product_name?: string;
      uom?: string;
      unit_id?: number | string;
      uom_id?: number | string;
      ordered_quantity?: number | string;
      received_quantity?: number | string;
      returned_quantity?: number | string;
      unit_price?: number | string;
      concern_notes?: string;
      product_type?: number | string | null;
      product_type_name?: string | null;
      product_category?: number | string | null;
      category_name?: string | null;
      lot_id?: number | null;
      lot_name?: string | null;
      inventory_lot_id?: number | null;
      batch?: string | null;
      batch_no?: string | null;
      manufacturing_date?: string | null;
      expiry_date?: string | null;
      reservations?: ClearanceReservationItem[];
      lot_allocations?: LotAllocationGroup[];
    }

    const storedRaw = typeof window !== "undefined" ? localStorage.getItem("scm_dispatch_return_data") : null;

    let data: {
      customerCode?: string;
      customerName?: string;
      invoiceNo?: string;
      orderNo?: string;
      salesmanId?: string;
      salesmanCode?: string;
      salesmanName?: string;
      branchId?: string | number;
      branchName?: string;
      remarks?: string;
      items?: ClearancePayloadItem[];
    } = {};
    if (storedRaw) {
      try {
        data = JSON.parse(storedRaw);
      } catch (e) {
        console.error("Failed to parse clearance return data", e);
      }
    }

    const salesmanIdParam = searchParams.get("salesmanId");
    const targetCustomerCode = customerCodeParam || data.customerCode || "";
    const targetCustomerName = data.customerName || "";
    const targetInvoiceNo = invoiceNoParam || data.invoiceNo || "";
    const targetOrderNo = orderNoParam || data.orderNo || "";
    const targetSalesmanId = salesmanIdParam || data.salesmanId || "";
    const targetSalesmanCode = data.salesmanCode || "";
    const targetSalesmanName = data.salesmanName || "";
    const targetBranchId = data.branchId ? Number(data.branchId) : null;
    const targetBranchName = data.branchName || "";
    const targetRemarks = data.remarks || "";

    // 1. Resolve Customer
    const foundCustomer = customers.find(
      (c: CustomerOption) =>
        (targetCustomerCode && c.code === targetCustomerCode) ||
        (targetCustomerName && c.name === targetCustomerName)
    );

    if (foundCustomer) {
      setSelectedCustomerId(foundCustomer.id.toString());
      setCustomerSearch(foundCustomer.name);
      setCustomerCode(foundCustomer.code || "");
      if (foundCustomer.price_type_id) {
        const pt = priceTypeOptions.find(
          (p) => p.price_type_id.toString() === foundCustomer.price_type_id?.toString()
        );
        const resolvedPt = pt ? pt.price_type_name : foundCustomer.price_type_id.toString();
        setPriceType(resolvedPt);
        setPriceTypeSearch(resolvedPt.startsWith("Type ") ? resolvedPt : `Type ${resolvedPt}`);
      }
    } else if (targetCustomerCode) {
      setCustomerCode(targetCustomerCode);
      setCustomerSearch(targetCustomerName || targetCustomerCode);
    }

    // 2. Set Invoice, Order, and Remarks
    if (targetInvoiceNo) {
      setInvoiceNo(targetInvoiceNo);
      setInvoiceSearch(targetInvoiceNo);
    }
    if (targetOrderNo) {
      setOrderNo(targetOrderNo);
      setOrderSearch(targetOrderNo);
    }
    if (targetRemarks) {
      setRemarks(targetRemarks);
    }

    // 3. Fetch Invoices and link matching invoice / salesman
    const fetchAndLinkInvoice = async () => {
      try {
        const invList = await SalesReturnApiClient.getInvoiceReturnList(
          undefined,
          targetCustomerCode || undefined
        );
        setInvoiceOptions(invList);

        const matchedInv = invList.find(
          (inv: InvoiceOption) =>
            (targetInvoiceNo && inv.invoice_no === targetInvoiceNo) ||
            (targetOrderNo && inv.order_id === targetOrderNo)
        );

        if (matchedInv) {
          setInvoiceNo(matchedInv.invoice_no);
          setInvoiceSearch(matchedInv.invoice_no);
          setOrderNo(matchedInv.order_id);
          setOrderSearch(matchedInv.order_id);
          setAppliedInvoiceId(Number(matchedInv.id));

          if (matchedInv.salesman_id) {
            const foundSalesman = salesmen.find(
              (s) => Number(s.id) === Number(matchedInv.salesman_id)
            );
            if (foundSalesman) {
              setSelectedSalesmanId(foundSalesman.id.toString());
              setSalesmanCode(foundSalesman.code);
              setSalesmanSearch(foundSalesman.name);

              if (foundSalesman.priceType && (!foundCustomer || !foundCustomer.price_type_id)) {
                const pt = priceTypeOptions.find(
                  (p) => p.price_type_id.toString() === foundSalesman.priceType.toString()
                );
                const resolvedPt = pt ? pt.price_type_name : foundSalesman.priceType.toString();
                setPriceType(resolvedPt);
                setPriceTypeSearch(resolvedPt.startsWith("Type ") ? resolvedPt : `Type ${resolvedPt}`);
              }

              const sBranchId = foundSalesman.branchId ? Number(foundSalesman.branchId) : null;
              const linkedBranch = branches.find((b) => 
                (sBranchId && Number(b.id) === sBranchId) ||
                (b.branch_code && foundSalesman.branchId && String(b.branch_code).trim().toLowerCase() === String(foundSalesman.branchId).trim().toLowerCase()) ||
                (b.name && foundSalesman.branchId && String(b.name).trim().toLowerCase() === String(foundSalesman.branchId).trim().toLowerCase())
              );
              const resolvedBId = linkedBranch ? Number(linkedBranch.id) : sBranchId;
              if (resolvedBId) {
                const bName = linkedBranch ? (linkedBranch.name || linkedBranch.branch_name || "") : (targetBranchName || "");
                setBranchName(bName);
                setBranchSearch(bName);
                setBranchId(resolvedBId);
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch/link invoice for clearance return", err);
      }
    };

    fetchAndLinkInvoice();

    // 4. Fallback Salesman / Branch from data if not resolved from invoice
    let resolvedBranchId: number | null = null;
    let resolvedBranchName = targetBranchName || "";

    const foundSalesman = salesmen.find(
      (s) =>
        (targetSalesmanId && s.id.toString() === targetSalesmanId.toString()) ||
        (targetSalesmanCode && s.code === targetSalesmanCode) ||
        (targetSalesmanName && s.name === targetSalesmanName)
    );
    if (foundSalesman) {
      setSelectedSalesmanId(foundSalesman.id.toString());
      setSalesmanCode(foundSalesman.code);
      setSalesmanSearch(foundSalesman.name);
      if (foundSalesman.priceType && (!foundCustomer || !foundCustomer.price_type_id)) {
        const pt = priceTypeOptions.find(
          (p) => p.price_type_id.toString() === foundSalesman.priceType.toString()
        );
        const resolvedPt = pt ? pt.price_type_name : foundSalesman.priceType.toString();
        setPriceType(resolvedPt);
        setPriceTypeSearch(resolvedPt.startsWith("Type ") ? resolvedPt : `Type ${resolvedPt}`);
      }
      const sBranchId = foundSalesman.branchId ? Number(foundSalesman.branchId) : null;
      const linkedBranch = branches.find((b) => 
        (sBranchId && Number(b.id) === sBranchId) ||
        (b.branch_code && foundSalesman.branchId && String(b.branch_code).trim().toLowerCase() === String(foundSalesman.branchId).trim().toLowerCase()) ||
        (b.name && foundSalesman.branchId && String(b.name).trim().toLowerCase() === String(foundSalesman.branchId).trim().toLowerCase())
      );
      resolvedBranchId = linkedBranch ? Number(linkedBranch.id) : sBranchId;
      if (linkedBranch) {
        resolvedBranchName = linkedBranch.name || linkedBranch.branch_name || resolvedBranchName;
      }
    }

    if (!resolvedBranchId && (targetBranchId || targetBranchName)) {
      const matchedBranch = branches.find((b) => 
        (targetBranchId && Number(b.id) === targetBranchId) ||
        (targetBranchName && b.name.trim().toLowerCase() === targetBranchName.trim().toLowerCase()) ||
        (targetBranchName && b.branch_code && b.branch_code.trim().toLowerCase() === targetBranchName.trim().toLowerCase())
      );
      if (matchedBranch) {
        resolvedBranchId = Number(matchedBranch.id);
        resolvedBranchName = matchedBranch.name || matchedBranch.branch_name || resolvedBranchName;
      } else if (targetBranchId) {
        resolvedBranchId = targetBranchId;
      }
    }

    if (resolvedBranchId) {
      setBranchName(resolvedBranchName);
      setBranchSearch(resolvedBranchName);
      setBranchId(resolvedBranchId);
    }

    // 5. Pre-fill products summary from clearance items
    if (Array.isArray(data.items) && data.items.length > 0) {
      const mappedItems: SalesReturnItem[] = data.items
        .filter((it: ClearancePayloadItem) => Number(it.returned_quantity || 0) > 0 || Number(it.ordered_quantity || 0) > 0)
        .map((it: ClearancePayloadItem) => {
          const qty = Number(it.returned_quantity) > 0 ? Number(it.returned_quantity) : Number(it.ordered_quantity || 1);
          const price = Number(it.unit_price || 0);
          const gross = Math.round(qty * price * 100) / 100;
          const pTypeId = it.product_type !== undefined && it.product_type !== null && it.product_type !== "" ? Number(it.product_type) : null;
          const rawUnitId = it.unit_id ?? it.uom_id;
          const parsedUnitId = rawUnitId !== undefined && rawUnitId !== null && rawUnitId !== "" ? Number(rawUnitId) : undefined;

          // Parse source reservations into LotAllocationGroup[]
          let itemLotAllocations: LotAllocationGroup[] = [];
          if (Array.isArray(it.lot_allocations) && it.lot_allocations.length > 0) {
            itemLotAllocations = it.lot_allocations;
          } else if (Array.isArray(it.reservations) && it.reservations.length > 0) {
            let remainingQty = qty;
            const groupedMap = new Map<number, LotAllocationGroup>();

            it.reservations.forEach((res, resIdx) => {
              const resLotId = Number(res.lot_id || it.lot_id || 0);
              const resLotName = res.lot_name || res.lot_number || it.lot_name || (resLotId ? `Lot #${resLotId}` : "Assigned Lot");
              let allocQty = Number(res.returned_quantity || 0);
              if (allocQty <= 0) {
                const picked = Number(res.picked_quantity || res.reserved_quantity || 0);
                allocQty = picked > 0 ? Math.min(remainingQty, picked) : remainingQty;
              }
              allocQty = Math.min(remainingQty, allocQty);
              if (allocQty <= 0 && remainingQty > 0 && resIdx === it.reservations!.length - 1) {
                allocQty = remainingQty;
              }
              if (allocQty > 0) {
                remainingQty -= allocQty;
                if (!groupedMap.has(resLotId)) {
                  groupedMap.set(resLotId, {
                    lot_id: resLotId,
                    lot_name: resLotName,
                    max_batch_capacity: 10,
                    allocated_quantity: 0,
                    batches: [],
                  });
                }
                const grp = groupedMap.get(resLotId)!;
                grp.allocated_quantity += allocQty;
                grp.batches.push({
                  inventory_lot_id: res.inventory_lot_id ? Number(res.inventory_lot_id) : undefined,
                  batch_no: res.batch_no || it.batch || it.batch_no || "",
                  manufacturing_date: res.manufacturing_date || it.manufacturing_date || null,
                  expiry_date: res.expiry_date || it.expiry_date || null,
                  quantity: allocQty,
                  qa_status: "GOOD" as QAStatus,
                });
              }
            });

            // If remainingQty > 0 and we have groups, assign remainder to last batch
            if (remainingQty > 0 && groupedMap.size > 0) {
              const lastGrp = Array.from(groupedMap.values())[groupedMap.size - 1];
              if (lastGrp.batches.length > 0) {
                lastGrp.batches[lastGrp.batches.length - 1].quantity += remainingQty;
                lastGrp.allocated_quantity += remainingQty;
              }
            }
            itemLotAllocations = Array.from(groupedMap.values());
          } else if (it.lot_id || it.batch || it.batch_no) {
            const lId = Number(it.lot_id || 0);
            itemLotAllocations = [{
              lot_id: lId,
              lot_name: it.lot_name || `Lot #${lId}`,
              max_batch_capacity: 10,
              allocated_quantity: qty,
              batches: [{
                inventory_lot_id: it.inventory_lot_id ? Number(it.inventory_lot_id) : undefined,
                batch_no: it.batch || it.batch_no || "",
                manufacturing_date: it.manufacturing_date || null,
                expiry_date: it.expiry_date || null,
                quantity: qty,
                qa_status: "GOOD" as QAStatus,
              }],
            }];
          }

          const firstAlloc = itemLotAllocations[0];
          const firstBatch = firstAlloc?.batches?.[0];
          const primaryLotId = firstAlloc?.lot_id || (it.lot_id ? Number(it.lot_id) : null);
          const primaryLotName = firstAlloc?.lot_name || it.lot_name || null;
          const primaryInvLotId = firstBatch?.inventory_lot_id || (it.inventory_lot_id ? Number(it.inventory_lot_id) : null);
          const primaryBatchNo = firstBatch?.batch_no || it.batch || it.batch_no || null;
          const primaryMfgDate = firstBatch?.manufacturing_date || it.manufacturing_date || null;
          const primaryExpDate = firstBatch?.expiry_date || it.expiry_date || null;

          return {
            productId: Number(it.product_id),
            code: it.product_code || `SKU-${it.product_id}`,
            description: it.product_name || `Product #${it.product_id}`,
            unit: it.uom || "PCS",
            unit_id: parsedUnitId,
            quantity: qty,
            unitPrice: price,
            agreedPrice: price,
            grossAmount: gross,
            discountType: null,
            discountAmount: 0,
            totalAmount: gross,
            returnType: "Good Order",
            reason: it.concern_notes || "",
            product_type: pTypeId,
            product_type_name: it.product_type_name || null,
            product_category: it.product_category ? Number(it.product_category) : undefined,
            category_name: it.category_name || undefined,
            lot_id: primaryLotId,
            lot_name: primaryLotName,
            inventory_lot_id: primaryInvLotId,
            batch: primaryBatchNo,
            manufacturing_date: primaryMfgDate,
            expiry_date: primaryExpDate,
            qa_status: "GOOD" as QAStatus,
            lot_allocations: itemLotAllocations.length > 0 ? itemLotAllocations : undefined,
          };
        });

      if (mappedItems.length > 0) {
        setItems(mappedItems);

        // Auto-enrich product catalog metadata AND source lot/batch dates (mfg & exp)
        const effectiveBranch = resolvedBranchId || branchId;
        Promise.all([
          SalesReturnApiClient.getFullCatalog(targetCustomerCode),
          effectiveBranch ? fetchInventoryLots({ branchId: effectiveBranch }) : fetchInventoryLots({}),
          effectiveBranch ? fetchBatchOnhand({ branchId: effectiveBranch }) : Promise.resolve([]),
        ])
          .then(([catalog, invLots, onhandLots]) => {
            const batchMetaMap = new Map<
              string,
              { mfgDate?: string; expDate?: string; invId?: number; unitCost?: number }
            >();

            (invLots || []).forEach((ib) => {
              const bNo = String(ib.batch_no || "").trim().toLowerCase();
              if (bNo) {
                batchMetaMap.set(bNo, {
                  mfgDate: ib.manufacturing_date ? String(ib.manufacturing_date).substring(0, 10) : undefined,
                  expDate: ib.expiry_date ? String(ib.expiry_date).substring(0, 10) : undefined,
                  invId: ib.inventory_lot_id,
                  unitCost: ib.unit_cost,
                });
              }
            });

            (onhandLots || []).forEach((bo) => {
              const bNo = String(bo.batchNo || "").trim().toLowerCase();
              if (bNo) {
                const existing = batchMetaMap.get(bNo);
                batchMetaMap.set(bNo, {
                  mfgDate: bo.manufacturingDate ? String(bo.manufacturingDate).substring(0, 10) : existing?.mfgDate,
                  expDate: bo.expirationDate ? String(bo.expirationDate).substring(0, 10) : existing?.expDate,
                  invId: bo.inventoryLotId !== null && bo.inventoryLotId !== undefined ? Number(bo.inventoryLotId) : existing?.invId,
                  unitCost: existing?.unitCost,
                });
              }
            });

            const typeMap = new Map<number, string>();
            (catalog?.productTypes || []).forEach((pt) => typeMap.set(Number(pt.id), pt.name));

            const unitMap = new Map<number, { name: string; shortcut: string }>();
            (catalog?.units || []).forEach((u) => {
              unitMap.set(Number(u.unit_id), {
                name: u.unit_name,
                shortcut: u.unit_shortcut,
              });
            });

            setItems((prevItems) =>
              prevItems.map((pi) => {
                const catProd = catalog?.products?.find((p) => Number(p.product_id) === Number(pi.productId));

                const rawPt = typeof catProd?.product_type === "object" && catProd?.product_type !== null
                  ? ((catProd.product_type as { id?: number; type_id?: number }).id ?? (catProd.product_type as { id?: number; type_id?: number }).type_id)
                  : catProd?.product_type;
                const numTypeId = rawPt ? Number(rawPt) : null;
                const pTypeName = typeof catProd?.product_type === "object" && catProd?.product_type !== null
                  ? (catProd.product_type as { name?: string }).name || null
                  : (numTypeId ? typeMap.get(numTypeId) || null : null);

                const rawUom = typeof catProd?.unit_of_measurement === "object" && catProd?.unit_of_measurement !== null
                  ? (catProd.unit_of_measurement as { unit_id?: number; id?: number }).unit_id ?? (catProd.unit_of_measurement as { unit_id?: number; id?: number }).id
                  : catProd?.unit_of_measurement;
                const numUnitId = rawUom ? Number(rawUom) : undefined;
                const uomMeta = numUnitId ? unitMap.get(numUnitId) : undefined;

                const rawCat = typeof catProd?.product_category === "object" && catProd?.product_category !== null
                  ? (catProd.product_category as { category_id?: number; id?: number }).category_id ?? (catProd.product_category as { category_id?: number; id?: number }).id
                  : catProd?.product_category;
                const numCatId = rawCat ? Number(rawCat) : undefined;
                const catName = typeof catProd?.product_category === "object" && catProd?.product_category !== null
                  ? (catProd.product_category as { category_name?: string }).category_name || undefined
                  : undefined;

                // Batch & Date lookup from source batch registry
                const bKey = String(pi.batch || "").trim().toLowerCase();
                let lookedUp = bKey ? batchMetaMap.get(bKey) : undefined;
                let resolvedBatch = pi.batch;
                let resolvedInvId = pi.inventory_lot_id;
                let resolvedMfg = pi.manufacturing_date || lookedUp?.mfgDate || null;
                let resolvedExp = pi.expiry_date || lookedUp?.expDate || null;

                if (!resolvedBatch) {
                  const prodBatch = (invLots || []).find((ib) => Number(ib.product_id) === Number(pi.productId) && ib.batch_no);
                  if (prodBatch) {
                    resolvedBatch = prodBatch.batch_no;
                    resolvedInvId = resolvedInvId || prodBatch.inventory_lot_id;
                    resolvedMfg = resolvedMfg || (prodBatch.manufacturing_date ? String(prodBatch.manufacturing_date).substring(0, 10) : null);
                    resolvedExp = resolvedExp || (prodBatch.expiry_date ? String(prodBatch.expiry_date).substring(0, 10) : null);
                    lookedUp = batchMetaMap.get(prodBatch.batch_no.toLowerCase());
                  }
                }

                // Update lot_allocations with enriched dates & inventoryLotIds
                let updatedAllocations = pi.lot_allocations;
                if (Array.isArray(updatedAllocations) && updatedAllocations.length > 0) {
                  updatedAllocations = updatedAllocations.map((grp) => ({
                    ...grp,
                    batches: (grp.batches || []).map((b) => {
                      const subKey = String(b.batch_no || "").trim().toLowerCase();
                      const subMeta = subKey ? batchMetaMap.get(subKey) : undefined;
                      return {
                        ...b,
                        inventory_lot_id: b.inventory_lot_id ?? subMeta?.invId,
                        manufacturing_date: b.manufacturing_date || subMeta?.mfgDate || resolvedMfg,
                        expiry_date: b.expiry_date || subMeta?.expDate || resolvedExp,
                      };
                    }),
                  }));
                } else if (resolvedBatch && (pi.lot_id || resolvedInvId)) {
                  updatedAllocations = [{
                    lot_id: Number(pi.lot_id || 0),
                    lot_name: pi.lot_name || `Lot #${pi.lot_id || 0}`,
                    max_batch_capacity: 10,
                    allocated_quantity: pi.quantity,
                    batches: [{
                      inventory_lot_id: resolvedInvId || undefined,
                      batch_no: resolvedBatch,
                      manufacturing_date: resolvedMfg,
                      expiry_date: resolvedExp,
                      quantity: pi.quantity,
                      qa_status: "GOOD" as QAStatus,
                    }],
                  }];
                }

                return {
                  ...pi,
                  product_type: pi.product_type || numTypeId,
                  product_type_name: pi.product_type_name || pTypeName,
                  unit_id: pi.unit_id || numUnitId,
                  unit: pi.unit || uomMeta?.shortcut?.toUpperCase() || uomMeta?.name || "PCS",
                  product_category: pi.product_category || numCatId,
                  category_name: pi.category_name || catName,
                  batch: resolvedBatch,
                  inventory_lot_id: resolvedInvId,
                  manufacturing_date: resolvedMfg,
                  expiry_date: resolvedExp,
                  lot_allocations: updatedAllocations,
                };
              })
            );
          })
          .catch((err) => console.error("Failed to enrich product and lot metadata", err));
      }
    }

    // 6. Cleanup
    if (storedRaw) {
      localStorage.removeItem("scm_dispatch_return_data");
    }
  }, [
    isOpen,
    fromClearance,
    invoiceNoParam,
    orderNoParam,
    customerCodeParam,
    customers,
    salesmen,
    branches,
    priceTypeOptions,
    searchParams,
  ]);

  // --- 6. CLICK OUTSIDE HANDLERS ---
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;

      if (
        salesmanWrapperRef.current &&
        !salesmanWrapperRef.current.contains(target)
      ) {
        setIsSalesmanOpen(false);
        const found = salesmen.find(
          (s) => s.id.toString() === selectedSalesmanId,
        );
        if (found) setSalesmanSearch(found.name);
      }

      if (
        customerWrapperRef.current &&
        !customerWrapperRef.current.contains(target)
      ) {
        setIsCustomerOpen(false);
        const found = customers.find(
          (c) => c.id.toString() === selectedCustomerId,
        );
        if (found) setCustomerSearch(found.name);
      }

      if (
        branchWrapperRef.current &&
        !branchWrapperRef.current.contains(target)
      ) {
        setIsBranchOpen(false);
        const found = branches.find((b) => Number(b.id) === branchId);
        if (found) {
          setBranchSearch(found.name || found.branch_name || "");
        } else if (branchName) {
          setBranchSearch(branchName);
        }
      }

      if (
        priceTypeWrapperRef.current &&
        !priceTypeWrapperRef.current.contains(target)
      ) {
        setIsPriceTypeOpen(false);
        const pt = priceTypeOptions.find(
          (p) => p.price_type_name === priceType || p.price_type_id.toString() === priceType
        );
        if (pt) {
          setPriceTypeSearch(`Type ${pt.price_type_name}`);
        } else if (priceType) {
          setPriceTypeSearch(priceType.startsWith("Type ") ? priceType : `Type ${priceType}`);
        }
      }

      if (
        invoiceWrapperRef.current &&
        !invoiceWrapperRef.current.contains(target)
      ) {
        setIsInvoiceOpen(false);
      }

      if (
        orderWrapperRef.current &&
        !orderWrapperRef.current.contains(target)
      ) {
        setIsOrderOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedSalesmanId, salesmen, selectedCustomerId, customers, branchId, branchName, branches, priceType, priceTypeOptions]);

  // --- RESET FUNCTION ---
  const resetForm = () => {
    setItems([]);
    const manilaMs = Date.now() + 8 * 60 * 60 * 1000;
    const d = new Date(manilaMs);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    setReturnDate(`${year}-${month}-${day}`);
    setSelectedSalesmanId("");
    setSalesmanSearch("");
    setSalesmanCode("");
    setSelectedCustomerId("");
    setCustomerSearch("");
    setCustomerCode("");
    setBranchName("");
    setBranchId(null);
    setBranchSearch("");
    setPriceType("A");
    setPriceTypeSearch("Type A");
    setOrderNo("");
    setOrderSearch("");
    setInvoiceNo("");
    setInvoiceSearch("");
    setAppliedInvoiceId(null);
    setRemarks("");
    setIsThirdParty(false);
    setInvoiceOptions([]);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const filteredSalesmen = salesmen.filter((s) =>
    s.name.toLowerCase().includes(salesmanSearch.toLowerCase()),
  );
  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()),
  );
  const filteredBranches = branches.filter((b) => {
    const search = branchSearch.toLowerCase();
    const name = (b.name || b.branch_name || "").toLowerCase();
    const code = (b.branch_code || "").toLowerCase();
    return name.includes(search) || code.includes(search);
  });

  const availablePriceTypes = priceTypeOptions.length > 0
    ? priceTypeOptions
    : [
        { price_type_id: 1, price_type_name: "A", description: "Type A" },
        { price_type_id: 2, price_type_name: "B", description: "Type B" },
        { price_type_id: 3, price_type_name: "C", description: "Type C" },
        { price_type_id: 4, price_type_name: "D", description: "Type D" },
        { price_type_id: 5, price_type_name: "E", description: "Type E" },
      ];

  const filteredPriceTypes = availablePriceTypes.filter((pt) => {
    const search = priceTypeSearch.toLowerCase();
    const name = pt.price_type_name.toLowerCase();
    const withType = `type ${name}`;
    const desc = (pt.description || "").toLowerCase();
    return name.includes(search) || withType.includes(search) || desc.includes(search);
  });

  const handleSelectBranch = useCallback((branch: BranchOption) => {
    const bName = branch.name || branch.branch_name || "";
    setBranchId(Number(branch.id));
    setBranchName(bName);
    setBranchSearch(bName);
    setIsBranchOpen(false);
  }, []);

  const handleSelectPriceType = useCallback((pt: PriceTypeOption | { price_type_id: number; price_type_name: string; description?: string }) => {
    setPriceType(pt.price_type_name);
    setPriceTypeSearch(`Type ${pt.price_type_name}`);
    setIsPriceTypeOpen(false);
  }, []);

  const handleOpenProductLookup = () => {
    if (!returnDate) {
      toast.error("Please select a Return Date before adding products.");
      return;
    }
    if (!selectedSalesmanId) {
      toast.error("Please select a Salesman before adding products.");
      return;
    }
    if (!selectedCustomerId) {
      toast.error("Please select a Customer before adding products.");
      return;
    }
    setIsProductLookupOpen(true);
  };

  const handleCreateReturn = async () => {
    setReturnTypeError(false);
    setLotDetailsError(false);
    setOrderError(false);
    setInvoiceError(false);

    if (!returnDate) {
      toast.error("Return Date is required.");
      return;
    }
    if (items.length === 0) {
      toast.error("Please add at least one product.");
      return;
    }
    if (!orderNo.trim()) {
      toast.error("Order No. is required.");
      setOrderError(true);
      return;
    }

    if (!invoiceNo.trim()) {
      toast.error("Invoice No. is required.");
      setInvoiceError(true);
      return;
    }

    const invalidItems = items.some(
      (item) => !item.returnType || item.returnType === "",
    );

    if (invalidItems) {
      toast.error("Please select a Return Type for all items.");
      setReturnTypeError(true);
      return;
    }

    const missingLotDetails = items.some(
      (item) => {
        const hasAlloc = (item.lot_allocations && item.lot_allocations.length > 0) || (item.lot_id && item.batch);
        return !hasAlloc;
      }
    );
    if (missingLotDetails) {
      toast.error("Please assign Lot and Batch allocations for all products.");
      setLotDetailsError(true);
      return;
    }

    try {
      setIsSubmitting(true);
      const selectedSalesmanObj = salesmen.find(
        (s) => s.id.toString() === selectedSalesmanId,
      );
      const payloadBranchId = branchId !== null ? branchId : (selectedSalesmanObj ? selectedSalesmanObj.branchId : null);

      const selectedPt = priceTypeOptions.find(pt => pt.price_type_name === priceType);
      const payloadPriceTypeId = selectedPt ? selectedPt.price_type_id : null;

      const payload = {
        invoiceNo,
        orderNo,
        customer: customerCode,
        salesmanId: selectedSalesmanId,
        salesmanCode: salesmanCode,
        branchId: payloadBranchId,
        isThirdParty,
        totalAmount: totalNet,
        returnDate,
        priceType: payloadPriceTypeId,
        remarks,
        items: items.map(item => ({
          ...item,
          quantity: Number(item.quantity || 0),
          unitPrice: Number(item.unitPrice || 0),
          agreedPrice: item.agreedPrice !== undefined && item.agreedPrice !== null ? Number(item.agreedPrice) : Number(item.unitPrice || 0),
          priceVariance: Number(item.priceVariance || 0),
          grossAmount: Number(item.grossAmount || 0),
          discountAmount: Number(item.discountAmount || 0),
          totalAmount: Number(item.totalAmount || 0),
          manufacturing_date: item.manufacturing_date || null,
          expiry_date: item.expiry_date || null,
        })),
        appliedInvoiceId: appliedInvoiceId ?? undefined,
      };

      await SalesReturnApiClient.submitReturn(payload);

      setSuccessOpen(true);
    } catch (err: unknown) {
      console.error(err);
      toast.error("Failed to create Sales Return.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinalize = () => {
    setSuccessOpen(false);
    if (onSuccess) onSuccess();
    handleClose();
  };

  // --- 9. ITEM LOGIC ---
  const handleAddProducts = (newItems: Partial<SalesReturnItem>[]) => {
    setItems((prev) => {
      const updated = [...prev];
      newItems.forEach((item) => {
        const rawId = item.product_id || item.productId || item.id;
        const productId = Number(rawId);

        // Strict mapping for unit checking to prevent different UOMs from merging
        const isRfidItem = !!item.rfidTags && item.rfidTags.length > 0;
        const existingIndex = updated.findIndex(
          (i) => {
            const existingIsRfid = !!i.rfidTags && i.rfidTags.length > 0;
            return i.productId === productId && i.unit === item.unit && i.unitPrice === Number(item.unitPrice) && existingIsRfid === isRfidItem;
          }
        );
        const qty = item.quantity || 1;

        if (existingIndex >= 0) {
          const existing = { ...updated[existingIndex] };
          existing.quantity += qty;
          existing.grossAmount = Math.round(existing.quantity * existing.unitPrice * 100) / 100;

          if (existing.discountType) {
            const selectedOption = lineDiscountOptions.find(
              (d) => d.id.toString() === existing.discountType?.toString(),
            );
            if (selectedOption) {
              const percentage = parseFloat(selectedOption.total_percent) || 0;
              existing.discountAmount = Math.round((existing.grossAmount || 0) * (percentage / 100) * 100) / 100;
            }
          }

          existing.totalAmount = Math.round(((existing.grossAmount || 0) - (existing.discountAmount || 0)) * 100) / 100;
          if (item.rfidTags) {
            existing.rfidTags = [...(existing.rfidTags || []), ...item.rfidTags];
          }
          updated[existingIndex] = existing;
        } else {
          const unitPrice = resolvePrice(item, priceType, undefined, invoiceLineItems);

          const incomingDiscountType = item.discountType || "";
          let initialDiscountAmt = 0;
          const initialGross = Math.round(unitPrice * qty * 100) / 100;

          if (incomingDiscountType) {
            const selectedOption = lineDiscountOptions.find(
              (d) => d.id.toString() === incomingDiscountType.toString(),
            );
            if (selectedOption) {
              const percentage = parseFloat(selectedOption.total_percent) || 0;
              initialDiscountAmt =
                Math.round(initialGross * (percentage / 100) * 100) / 100;
            }
          }

          updated.push({
            ...item,
            productId,
            product_id: productId,
            code: item.code || "N/A",
            description: item.description || item.product_name || "Unknown Item",
            unit: item.unit || "Pcs",
            unit_id: item.unit_id ? Number(item.unit_id) : (item.unit_of_measurement ? Number(item.unit_of_measurement) : undefined),
            quantity: qty,
            unitPrice: unitPrice,
            agreedPrice: unitPrice,
            priceVariance: 0,
            grossAmount: initialGross,
            discountType: incomingDiscountType,
            discountAmount: initialDiscountAmt,
            totalAmount: Math.round((initialGross - initialDiscountAmt) * 100) / 100,
            lot_id: null,
            batch: "",
            manufacturing_date: "",
            expiry_date: "",
            reason: "",
            returnType: "",
            product_type: item.product_type || null,
            product_type_name: item.product_type_name || null,
            product_category: item.product_category,
            category_name: item.category_name,
          } as SalesReturnItem);
        }
      });
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDuplicateItem = (index: number) => {
    setItems((prev) => {
      const target = prev[index];
      if (!target) return prev;
      const duplicated: SalesReturnItem = {
        ...target,
        id: undefined,
        lot_id: null,
        lot_name: undefined,
        inventory_lot_id: undefined,
        batch: "",
        manufacturing_date: "",
        expiry_date: "",
        qa_status: undefined,
        lot_allocations: [],
        returnType: "",
        reason: target.reason || "",
      };
      const updated = [...prev];
      updated.splice(index + 1, 0, duplicated);
      return updated;
    });
  };

  const handleItemChange = (
    index: number,
    field: keyof SalesReturnItem,
    value: string | number | null,
  ) => {
    setItems((prev) => {
      const updated = [...prev];
      const parsedValue = (field === "agreedPrice" || field === "unitPrice" || field === "quantity") && value !== "" && value !== null
        ? Number(value)
        : value;
      const item = { ...updated[index], [field]: parsedValue } as SalesReturnItem;

      if (field === "quantity" || field === "unitPrice" || field === "agreedPrice") {
        const agPrice = item.agreedPrice !== undefined && item.agreedPrice !== null ? Number(item.agreedPrice) : Number(item.unitPrice || 0);
        item.grossAmount = Math.round(Number(item.quantity || 0) * Number(item.unitPrice || 0) * 100) / 100;
        item.priceVariance = Math.round(((Number(item.unitPrice) || 0) - agPrice) * Number(item.quantity || 0) * 100) / 100;
        if (item.discountType) {
          const selectedOption = lineDiscountOptions.find(
            (d) => d.id.toString() === item.discountType?.toString(),
          );
          if (selectedOption) {
            const percentage = parseFloat(selectedOption.total_percent) || 0;
            item.discountAmount = Math.round((item.grossAmount || 0) * (percentage / 100) * 100) / 100;
          }
        }
      }

      if (field === "discountType") {
        if (value === "" || value === null) {
          item.discountAmount = 0;
        } else {
          const selectedOption = lineDiscountOptions.find(
            (d) => d.id.toString() === value.toString(),
          );
          if (selectedOption) {
            const percentage = parseFloat(selectedOption.total_percent) || 0;
            item.discountAmount = Math.round((item.grossAmount || 0) * (percentage / 100) * 100) / 100;
          }
        }
      }

      item.totalAmount = Math.round(((item.grossAmount || 0) - (item.discountAmount || 0)) * 100) / 100;
      
      // Validation check for lot capacity
      if ((field === "quantity" || field === "lot_id") && item.lot_id) {
        const onhand = lotOnhandMap[item.lot_id] ?? 0;
        const lot = lotOptions.find(l => l.lot_id === item.lot_id);
        const maxCap = lot?.max_batch_capacity ?? 0;
        const availableCap = maxCap > 0 ? Math.max(0, maxCap - onhand) : 0;
        
        if (maxCap > 0 && item.quantity > availableCap) {
          item.quantity = availableCap;
          
          // Recalculate based on clamped quantity
          const agPrice = item.agreedPrice !== undefined && item.agreedPrice !== null ? item.agreedPrice : item.unitPrice;
          item.grossAmount = Math.round(item.quantity * Number(item.unitPrice || 0) * 100) / 100;
          item.priceVariance = Math.round(((item.unitPrice || 0) - agPrice) * item.quantity * 100) / 100;
          
          if (item.discountType) {
            const selectedOption = lineDiscountOptions.find((d) => d.id.toString() === item.discountType?.toString());
            if (selectedOption) {
              const percentage = parseFloat(selectedOption.total_percent) || 0;
              item.discountAmount = Math.round((item.grossAmount || 0) * (percentage / 100) * 100) / 100;
            }
          }
          item.totalAmount = Math.round(((item.grossAmount || 0) - (item.discountAmount || 0)) * 100) / 100;
          
          toast.warning("Lot Capacity Reached", {
            id: `capacity-toast-${index}`,
            description: `Quantity capped to max available (${availableCap}). Please add a new product line for the remainder.`,
          });
        }
      }
      
      updated[index] = item;
      return updated;
    });
  };

  const totalGross = Math.round(items.reduce(
    (sum, item) => sum + (item.grossAmount || 0),
    0,
  ) * 100) / 100;
  const totalVariance = Math.round(items.reduce(
    (sum, item) => sum + (item.priceVariance || 0),
    0,
  ) * 100) / 100;
  const totalDiscount = Math.round(items.reduce(
    (sum, item) => sum + (item.discountAmount || 0),
    0,
  ) * 100) / 100;
  const totalNet = Math.round((totalGross - totalDiscount) * 100) / 100;

  const filteredInvoices = invoiceOptions.filter((inv) =>
    !inv.isPosted && inv.invoice_no.toLowerCase().includes(invoiceSearch.toLowerCase()),
  );

  const filteredOrders = invoiceOptions.filter((inv) =>
    !inv.isPosted && inv.order_id.toLowerCase().includes(orderSearch.toLowerCase()),
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-2 md:p-4 animate-in fade-in duration-300">
      <div className="bg-background w-full h-full md:max-w-[1300px] md:h-[95vh] md:rounded-xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-white/20 animate-in zoom-in-95 duration-300 ease-out">
        <div className="flex justify-between items-center px-6 py-4 border-b border-border bg-background">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">
                Create Sales Return
              </h2>
              <p className="text-xs text-muted-foreground">
                Fill in the details below to process a return
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="bg-destructive hover:bg-destructive text-white p-2 rounded-md shadow-sm transition-all duration-200 active:scale-95 flex items-center justify-center"
            title="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          <div className="bg-background p-5 rounded-lg border border-border shadow-sm relative z-30">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary rounded-l-lg"></div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-4">

              <div className="space-y-1.5 relative" ref={salesmanWrapperRef}>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide truncate block">
                  Salesman <span className="text-destructive">*</span>
                </label>
                <div className="relative group">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary" />
                  <input
                    type="text"
                    className="w-full h-9 border border-border rounded-md text-sm pl-9 pr-8 bg-background outline-none focus:ring-2 focus:border-primary shadow-sm"
                    placeholder="Search Salesman..."
                    value={salesmanSearch}
                    onChange={(e) => {
                      setSalesmanSearch(e.target.value);
                      setIsSalesmanOpen(true);
                      setSelectedSalesmanId("");
                      setSalesmanCode("");
                      setBranchName("");
                    }}
                    onFocus={() => {
                      setIsSalesmanOpen(true);
                      setSalesmanSearch("");
                    }}
                  />
                  <ChevronDown className="h-4 w-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {isSalesmanOpen && (
                  <div className="absolute top-[calc(100%+4px)] left-0 w-full z-50 bg-background border border-border rounded-md shadow-xl max-h-60 overflow-y-auto font-medium">
                    {filteredSalesmen.map((s) => (
                      <div
                        key={s.id}
                        className="px-4 py-2.5 text-sm cursor-pointer hover:bg-primary/10 text-foreground"
                        onClick={() => handleSelectSalesman(s)}
                      >
                        {s.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide truncate block">
                  Salesman Code
                </label>
                <div className="h-9 w-full bg-muted/20 border border-border rounded-md px-3 flex items-center text-sm font-medium text-foreground italic shadow-sm">
                  {salesmanCode || "-"}
                </div>
              </div>

              <div className="space-y-1.5 relative" ref={customerWrapperRef}>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide truncate block">
                  Customer <span className="text-destructive">*</span>
                </label>
                <div className="relative group">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary" />
                  <input
                    type="text"
                    className="w-full h-9 border border-border rounded-md text-sm pl-9 pr-8 bg-background outline-none focus:ring-2 focus:border-primary shadow-sm"
                    placeholder="Search Customer..."
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setIsCustomerOpen(true);
                    }}
                    onFocus={() => {
                      setIsCustomerOpen(true);
                      setCustomerSearch("");
                    }}
                  />
                  <ChevronDown className="h-4 w-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {isCustomerOpen && (
                  <div className="absolute top-[calc(100%+4px)] left-0 w-full z-50 bg-background border border-border rounded-md shadow-xl max-h-60 overflow-y-auto font-medium">
                    {filteredCustomers.map((c) => (
                      <div
                        key={c.id}
                        className="px-4 py-2.5 text-sm cursor-pointer hover:bg-primary/10 text-foreground"
                        onClick={() => handleSelectCustomer(c)}
                      >
                        <div className="flex flex-col">
                          <span>{c.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {c.code}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Customer Code */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide truncate block">
                  Customer Code
                </label>
                <div className="h-9 w-full bg-muted/20 border border-border rounded-md px-3 flex items-center text-sm font-medium text-foreground italic shadow-sm">
                  {customerCode || "-"}
                </div>
              </div>

              {/* ROW 2 */}
              {/* Branch */}
              <div className="space-y-1.5 relative" ref={branchWrapperRef}>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide truncate block">
                  Branch <span className="text-destructive">*</span>
                </label>
                <div className="relative group">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary" />
                  <input
                    type="text"
                    className="w-full h-9 border border-border rounded-md text-sm pl-9 pr-8 bg-background outline-none focus:ring-2 focus:border-primary shadow-sm"
                    placeholder="Search Branch..."
                    value={branchSearch}
                    onChange={(e) => {
                      setBranchSearch(e.target.value);
                      setIsBranchOpen(true);
                      setBranchId(null);
                      setBranchName("");
                    }}
                    onFocus={() => {
                      setIsBranchOpen(true);
                      setBranchSearch("");
                    }}
                  />
                  <ChevronDown className="h-4 w-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {isBranchOpen && (
                  <div className="absolute top-[calc(100%+4px)] left-0 w-full z-50 bg-background border border-border rounded-md shadow-xl max-h-60 overflow-y-auto font-medium">
                    {filteredBranches.length > 0 ? (
                      filteredBranches.map((b) => (
                        <div
                          key={b.id}
                          className="px-4 py-2.5 text-sm cursor-pointer hover:bg-primary/10 text-foreground"
                          onClick={() => handleSelectBranch(b)}
                        >
                          <div className="flex flex-col">
                            <span>{b.name || b.branch_name}</span>
                            {b.branch_code && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {b.branch_code}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-2.5 text-sm text-muted-foreground italic">
                        No branches found
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Return Date */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide truncate block">
                  Return Date <span className="text-destructive">*</span>
                </label>
                <Input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="h-9 w-full bg-background border-border shadow-sm text-sm"
                />
              </div>

              {/* Received Date Placeholder */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide truncate block">
                  Received Date
                </label>
                <div className="h-9 w-full bg-muted/20 border border-border rounded-md px-3 flex items-center text-sm font-medium text-muted-foreground italic shadow-sm opacity-60">
                  (Auto-generated)
                </div>
              </div>

              {/* Price Type */}
              <div className="space-y-1.5 relative" ref={priceTypeWrapperRef}>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide truncate block">
                  Price Type <span className="text-destructive">*</span>
                </label>
                <div className="relative group">
                  <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary" />
                  <input
                    type="text"
                    className="w-full h-9 border border-border rounded-md text-sm pl-9 pr-8 bg-background outline-none focus:ring-2 focus:border-primary shadow-sm"
                    placeholder="Search Price Type..."
                    value={priceTypeSearch}
                    onChange={(e) => {
                      setPriceTypeSearch(e.target.value);
                      setIsPriceTypeOpen(true);
                    }}
                    onFocus={() => {
                      setIsPriceTypeOpen(true);
                      setPriceTypeSearch("");
                    }}
                  />
                  <ChevronDown className="h-4 w-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
                {isPriceTypeOpen && (
                  <div className="absolute top-[calc(100%+4px)] left-0 w-full z-50 bg-background border border-border rounded-md shadow-xl max-h-60 overflow-y-auto font-medium">
                    {filteredPriceTypes.length > 0 ? (
                      filteredPriceTypes.map((pt) => (
                        <div
                          key={pt.price_type_id}
                          className="px-4 py-2.5 text-sm cursor-pointer hover:bg-primary/10 text-foreground"
                          onClick={() => handleSelectPriceType(pt)}
                        >
                          <div className="flex flex-col">
                            <span>Type {pt.price_type_name}</span>
                            {pt.description && pt.description !== `Type ${pt.price_type_name}` && (
                              <span className="text-[10px] text-muted-foreground">
                                {pt.description}
                              </span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-2.5 text-sm text-muted-foreground italic">
                        No price types found
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Third Party Checkbox */}
              <div className="flex items-center space-x-2 pt-2 col-span-2 lg:col-span-4 translate-y-2">
                <Checkbox
                  id="create-manual-isThirdParty"
                  checked={isThirdParty}
                  onCheckedChange={(c) => setIsThirdParty(c as boolean)}
                  className="data-[state=checked]:bg-primary border-border"
                />
                <label
                  htmlFor="create-manual-isThirdParty"
                  className="text-sm font-medium text-foreground cursor-pointer select-none"
                >
                  Third Party Transaction
                </label>
              </div>

            </div>
          </div>

          {/* 2. PRODUCT TABLE (UNCHANGED) */}
          {/* ... keeping your existing product table component ... */}
          <div className="bg-background rounded-lg border border-border shadow-sm overflow-hidden flex flex-col">
            <div className="flex justify-between items-center px-5 py-4 bg-background border-b border-border">
              <h3 className="font-bold text-foreground flex items-center gap-2">
                <div className="bg-primary/10 p-1.5 rounded text-primary">
                  <Calculator className="h-4 w-4" />
                </div>
                Products Summary
              </h3>
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={handleOpenProductLookup}
                  className="bg-primary hover:bg-primary text-white shadow-primary/20 shadow-md"
                >
                  <Plus className="h-4 w-4 mr-1.5" /> Add Product
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto relative pb-4">
              <Table className="min-w-[1100px]">
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
                    <TableHead className="text-white font-semibold h-11 min-w-[230px] uppercase text-xs">
                      Lot &amp; Batch Allocation
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 w-[80px] uppercase text-xs">
                      Unit
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 text-center min-w-[90px] uppercase text-xs">
                      Qty
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 text-right min-w-[110px] uppercase text-xs">
                      Unit Price
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 text-right min-w-[110px] uppercase text-xs">
                      Agreed Price
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 text-right min-w-[100px] uppercase text-xs">
                      Variance
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 text-right min-w-[110px] uppercase text-xs">
                      Gross
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 w-[160px] uppercase text-xs">
                      Disc. Type
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 text-right min-w-[110px] uppercase text-xs">
                      Disc. Amount
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 text-right min-w-[110px] uppercase text-xs">
                      Net Amount
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 w-[160px] uppercase text-xs">
                      Return Type
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 min-w-[90px] sticky right-0 bg-primary z-20 text-center shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={15}
                        className="h-24 text-center text-muted-foreground text-sm"
                      >
                        No products found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {/* 1. RENDER MANUAL ITEMS (No RFID) */}
                      {items.map((item, idx) => {
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
                              <Input
                                type="number"
                                className="h-9 w-full text-center text-sm border-border px-2"
                                value={item.quantity}
                                onChange={(e) =>
                                  handleItemChange(idx, "quantity", e.target.value)
                                }
                              />
                            </TableCell>
                            {/* Unit Price */}
                            <TableCell className="text-right align-middle p-2 bg-muted/10">
                              <span className="text-sm text-foreground">
                                {Number(item.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </span>
                            </TableCell>
                            {/* Agreed Price */}
                            <TableCell className="text-center align-middle p-2">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                className="h-9 w-full text-right text-sm border-border px-2"
                                value={item.agreedPrice !== undefined && item.agreedPrice !== null ? item.agreedPrice : item.unitPrice}
                                onChange={(e) =>
                                  handleItemChange(idx, "agreedPrice", e.target.value)
                                }
                              />
                            </TableCell>
                            {/* Variance */}
                            <TableCell className={`text-right align-middle font-mono text-sm whitespace-nowrap ${(item.priceVariance || 0) > 0 ? "text-green-600" : (item.priceVariance || 0) < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                              {(item.priceVariance || 0) > 0 ? "+" : ""}{(item.priceVariance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            {/* Gross */}
                            <TableCell className="text-right text-sm text-muted-foreground align-middle font-mono whitespace-nowrap">
                              {(Number(item.grossAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="align-middle p-2">
                              {(() => {
                                const noDiscountOpt = lineDiscountOptions.find(o => o.discount_type === "No Discount");
                                const defaultVal = noDiscountOpt ? noDiscountOpt.id.toString() : "No Discount";
                                const currentDiscVal = item.discountType?.toString() ? (
                                  lineDiscountOptions.some(o => o.id.toString() === item.discountType?.toString())
                                    ? item.discountType.toString()
                                    : defaultVal
                                ) : defaultVal;
                                return (
                                  <LocalSearchableSelect
                                    value={currentDiscVal}
                                    onValueChange={(val) => handleItemChange(idx, "discountType", val)}
                                    options={lineDiscountOptions.map((opt) => ({
                                      value: opt.id.toString(),
                                      label: opt.discount_type,
                                    }))}
                                    placeholder="Select Discount..."
                                    className="h-9 w-full text-xs"
                                  />
                                );
                              })()}
                            </TableCell>

                            {/* Disc. Amount */}
                            <TableCell className="text-right text-sm text-foreground align-middle font-mono whitespace-nowrap bg-muted/10">
                              {(Number(item.discountAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>

                            {/* Net Amount */}
                            <TableCell className="text-right text-sm font-bold text-primary align-middle font-mono whitespace-nowrap bg-primary/5">
                              {(Number(item.totalAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>

                            {/* Return Type */}
                            <TableCell className="align-middle p-2">
                              <LocalSearchableSelect
                                value={item.returnType || ""}
                                onValueChange={(val) => handleItemChange(idx, "returnType", val)}
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
                            </TableCell>

                            {/* Actions */}
                            <TableCell className="align-middle p-2 text-center whitespace-nowrap sticky right-0 bg-background z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDuplicateItem(idx)}
                                  className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md"
                                  title="Duplicate Item"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveItem(idx)}
                                  className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 rounded-md"
                                  title="Remove Item"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}

                      {/* 2. RENDER RFID GROUPED ITEMS */}
                      {Object.values(
                        items.filter(i => i.rfidTags && i.rfidTags.length > 0).reduce((acc, item) => {
                          const idx = items.findIndex(d => d === item);
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
                            <TableCell className="text-right text-sm text-amber-600 dark:text-amber-500 font-semibold align-middle font-mono">
                              - ₱{(Number(group.totalDiscount)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right text-sm font-bold text-primary align-middle font-mono">
                              ₱{(Number(group.totalNet)).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="align-middle p-2 text-center text-muted-foreground">
                              <Badge variant="outline" className="font-normal text-[11px]">
                                {group.returnType || "-"}
                              </Badge>
                            </TableCell>
                            <TableCell className="sticky right-0 bg-muted/10 z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]" />
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
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="h-9 w-full text-right text-sm border-border px-2"
                                    value={item.agreedPrice !== undefined && item.agreedPrice !== null ? item.agreedPrice : item.unitPrice}
                                    onChange={(e) =>
                                      handleItemChange(idx, "agreedPrice", e.target.value)
                                    }
                                  />
                                </TableCell>
                                <TableCell className={`text-right align-middle font-mono text-sm whitespace-nowrap ${(item.priceVariance || 0) > 0 ? "text-green-600" : (item.priceVariance || 0) < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                  {(item.priceVariance || 0) > 0 ? "+" : ""}{(item.priceVariance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-right text-sm text-muted-foreground align-middle font-mono">
                                  {(Number(item.grossAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="align-middle p-2">
                                  <span className="text-xs text-muted-foreground">
                                    {lineDiscountOptions.find((d) => d.id.toString() == item.discountType)?.discount_type || "None"}
                                  </span>
                                </TableCell>
                                <TableCell className="text-right text-sm text-foreground align-middle font-mono bg-muted/10">
                                  {(Number(item.discountAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="text-right text-sm font-bold text-primary align-middle font-mono bg-primary/5">
                                  {(Number(item.totalAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </TableCell>
                                <TableCell className="align-middle p-2">
                                  <LocalSearchableSelect
                                    value={item.returnType || ""}
                                    onValueChange={(val) => handleItemChange(idx, "returnType", val)}
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
                                </TableCell>
                                <TableCell className="text-center align-middle whitespace-nowrap sticky right-0 bg-background z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md"
                                      onClick={() => handleDuplicateItem(idx)}
                                      title="Duplicate row"
                                    >
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-white hover:bg-destructive"
                                      onClick={() => handleRemoveItem(idx)}
                                      title="Remove row"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </TableCell>
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

          {/* 3. BOTTOM SUMMARY */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20">
            <div className="space-y-4 bg-background p-5 rounded-lg border border-border shadow-sm h-full">
              <h4 className="font-bold text-foreground text-sm mb-2">
                Additional Information
              </h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5" ref={orderWrapperRef}>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                    Order No. <span className="text-destructive">*</span>
                  </label>
                  <div className="relative group">
                    <input
                      type="text"
                      className={`w-full h-9 border rounded-md text-sm px-3 pr-8 bg-background outline-none transition-all shadow-sm ${orderError
                        ? "border-destructive bg-destructive/5 ring-1 ring-destructive"
                        : "border-border focus:ring-2 focus:border-primary"
                        }`}
                      placeholder="Search Order No..."
                      value={orderSearch || orderNo}
                      onChange={(e) => {
                        setOrderSearch(e.target.value);
                        setOrderNo(e.target.value);
                        setIsOrderOpen(true);
                      }}
                      onFocus={() => setIsOrderOpen(true)}
                    />
                    <ChevronDown className="h-3 w-3 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    {isOrderOpen && (
                      <div className="absolute bottom-[calc(100%+4px)] left-0 w-full z-50 bg-background border border-border rounded-md shadow-xl max-h-48 overflow-y-auto divide-y">
                        {/* 🟢 Clear Option */}
                        <div
                          className="px-3 py-2 text-xs font-medium cursor-pointer hover:bg-destructive/10 text-destructive flex items-center gap-2"
                          onClick={() => {
                            setOrderNo("");
                            setOrderSearch("");
                            setAppliedInvoiceId(null);
                            setIsOrderOpen(false);
                          }}
                        >
                          <X className="h-3 w-3" /> Clear Selection
                        </div>
                        {filteredOrders.length > 0 ? (
                          filteredOrders.map((inv) => (
                            <div
                              key={`order-${inv.id}`}
                              className="px-3 py-2 text-sm cursor-pointer hover:bg-primary/10 text-foreground"
                              onClick={() => {
                                setOrderNo(inv.order_id);
                                setOrderSearch(inv.order_id);
                                setIsOrderOpen(false);
                                // Auto-fill invoice
                                setInvoiceNo(inv.invoice_no);
                                setInvoiceSearch(inv.invoice_no);
                                setAppliedInvoiceId(Number(inv.id));
                                if (inv.salesman_id) {
                                  const foundSalesman = salesmen.find(s => Number(s.id) === Number(inv.salesman_id));
                                  if (foundSalesman) {
                                    setSelectedSalesmanId(foundSalesman.id.toString());
                                    setSalesmanSearch(foundSalesman.name);
                                    setSalesmanCode(foundSalesman.code);
                                    const linkedBranch = branches.find(b => b.id === foundSalesman.branchId);
                                    if (linkedBranch) {
                                      setBranchName(linkedBranch.name);
                                      setBranchId(Number(linkedBranch.id));
                                    }
                                  }
                                }
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
                            {selectedSalesmanId && customerCode ? "No orders found" : "Select salesman & customer first"}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* INVOICE NO DROPDOWN */}
                <div className="space-y-1.5" ref={invoiceWrapperRef}>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                    Invoice No. <span className="text-destructive">*</span>
                  </label>
                  <div className="relative group">
                    <input
                      type="text"
                      className={`w-full h-9 border rounded-md text-sm px-3 pr-8 bg-background outline-none transition-all shadow-sm ${invoiceError
                        ? "border-destructive bg-destructive/5 ring-1 ring-destructive"
                        : "border-border focus:ring-2 focus:border-primary"
                        }`}
                      placeholder="Search Invoice No..."
                      value={invoiceSearch || invoiceNo}
                      onChange={(e) => {
                        setInvoiceSearch(e.target.value);
                        setInvoiceNo(e.target.value);
                        setIsInvoiceOpen(true);
                        setAppliedInvoiceId(null);
                      }}
                      onFocus={() => setIsInvoiceOpen(true)}
                    />
                    <ChevronDown className="h-3 w-3 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    {isInvoiceOpen && (
                      <div className="absolute bottom-[calc(100%+4px)] left-0 w-full z-50 bg-background border border-border rounded-md shadow-xl max-h-48 overflow-y-auto divide-y">
                        {/* 🟢 Clear Option */}
                        <div
                          className="px-3 py-2 text-xs font-medium cursor-pointer hover:bg-destructive/10 text-destructive flex items-center gap-2"
                          onClick={() => {
                            setInvoiceNo("");
                            setInvoiceSearch("");
                            setAppliedInvoiceId(null);
                            setIsInvoiceOpen(false);
                          }}
                        >
                          <X className="h-3 w-3" /> Clear Selection
                        </div>
                        {filteredInvoices.length > 0 ? (
                          filteredInvoices.map((inv) => (
                            <div
                              key={`inv-${inv.id}`}
                              className="px-3 py-2 text-sm cursor-pointer hover:bg-primary/10 text-foreground"
                              onClick={() => {
                                setInvoiceNo(inv.invoice_no);
                                setInvoiceSearch(inv.invoice_no);
                                setAppliedInvoiceId(Number(inv.id));
                                setIsInvoiceOpen(false);
                                // Auto-fill order
                                setOrderNo(inv.order_id);
                                setOrderSearch(inv.order_id);
                                if (inv.salesman_id) {
                                  const foundSalesman = salesmen.find(s => Number(s.id) === Number(inv.salesman_id));
                                  if (foundSalesman) {
                                    setSelectedSalesmanId(foundSalesman.id.toString());
                                    setSalesmanSearch(foundSalesman.name);
                                    setSalesmanCode(foundSalesman.code);
                                    const linkedBranch = branches.find(b => b.id === foundSalesman.branchId);
                                    if (linkedBranch) {
                                      setBranchName(linkedBranch.name);
                                      setBranchId(Number(linkedBranch.id));
                                    }
                                  }
                                }
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
                            {selectedSalesmanId && customerCode ? "No invoices found" : "Select salesman & customer first"}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <RemarksInputSection
                value={remarks}
                onChange={setRemarks}
              />
            </div>

            <div className="bg-background rounded-lg border border-border p-0 shadow-sm overflow-hidden h-fit">
              <div className="p-4 bg-muted/30 border-b border-border">
                <h4 className="font-bold text-foreground">Financial Summary</h4>
              </div>
              <div className="p-6 space-y-4">
                <div className={`flex justify-between items-center text-sm ${totalVariance > 0 ? "text-emerald-600 dark:text-emerald-500 font-semibold" : totalVariance < 0 ? "text-rose-600 dark:text-rose-500 font-semibold" : "text-muted-foreground"}`}>
                  <span>Total Price Variance</span>
                  <span className="font-medium tabular-nums font-mono">
                    {totalVariance > 0 ? "+" : ""}
                    ₱
                    {totalVariance.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="my-2 border-t border-dashed border-border"></div>
                <div className="flex justify-between items-center text-sm text-muted-foreground">
                  <span>Total Gross Amount</span>
                  <span className="font-medium text-foreground tabular-nums">
                    ₱
                    {totalGross.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className={`flex justify-between items-center text-sm ${totalDiscount > 0 ? "text-amber-600 dark:text-amber-500 font-semibold" : "text-muted-foreground"}`}>
                  <span>Total Discount</span>
                  <span className="font-medium tabular-nums font-mono">
                    - ₱
                    {totalDiscount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="my-2 border-t border-dashed border-border"></div>
                <div className="flex justify-between items-center">
                  <span className="text-base font-bold text-foreground">
                    Net Amount
                  </span>
                  <span className="text-2xl font-bold text-primary tabular-nums">
                    ₱
                    {totalNet.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER ACTIONS */}
        <div className="p-4 bg-background border-t border-border flex justify-end gap-3 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateReturn}
            disabled={isSubmitting}
            className="bg-primary hover:bg-primary text-white shadow-primary/20 shadow-lg"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 mx-auto animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {isSubmitting ? "Submitting..." : "Create Sales Return"}
          </Button>
        </div>
      </div>

      <ProductLookupModal
        isOpen={isProductLookupOpen}
        onClose={() => setIsProductLookupOpen(false)}
        onConfirm={handleAddProducts}
        priceType={priceType}
        customerCode={customerCode}
        lineDiscounts={lineDiscountOptions}
        priceTypeOptions={priceTypeOptions}
      />

      {/* SUCCESS MODAL */}
      <Dialog
        open={isSuccessOpen}
        onOpenChange={(open) => !open && handleFinalize()}
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
                Sales Return created successfully.
              </div>
            </div>

            <Button
              onClick={handleFinalize}
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-base rounded-xl shadow-primary/20 shadow-lg transition-all active:scale-95"
            >
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* LOT & BATCH SELECTION MODAL */}
      {activeLotBatchIndex !== null && activeLotBatchIndex >= 0 && items[activeLotBatchIndex] && (
        <SalesReturnLotBatchModal
          open={lotBatchModalOpen}
          onOpenChange={setLotBatchModalOpen}
          branchId={branchId ? Number(branchId) : undefined}
          productId={items[activeLotBatchIndex].productId}
          productName={items[activeLotBatchIndex].description}
          productCode={items[activeLotBatchIndex].code}
          productUomId={items[activeLotBatchIndex].unit_id}
          productUomName={items[activeLotBatchIndex].unit}
          productType={items[activeLotBatchIndex].product_type || items[activeLotBatchIndex].product_type_name}
          productCategory={items[activeLotBatchIndex].product_category}
          categoryName={items[activeLotBatchIndex].category_name as string | undefined}
          returnType={items[activeLotBatchIndex].returnType}
          requestedQuantity={items[activeLotBatchIndex].quantity}
          adjustmentType="IN"
          initialValues={{
            lot_id: items[activeLotBatchIndex].lot_id || undefined,
            lot_name: items[activeLotBatchIndex].lot_name || undefined,
            inventory_lot_id: items[activeLotBatchIndex].inventory_lot_id || undefined,
            batch_no: items[activeLotBatchIndex].batch || "",
            manufacturing_date: items[activeLotBatchIndex].manufacturing_date,
            expiry_date: items[activeLotBatchIndex].expiry_date,
            qa_status: items[activeLotBatchIndex].qa_status || "GOOD",
            lot_allocations: items[activeLotBatchIndex].lot_allocations,
            total_quantity: items[activeLotBatchIndex].quantity,
          }}
          initialLotAllocations={items[activeLotBatchIndex].lot_allocations}
          existingFormAllocations={formSiblingAllocations.filter((_, idx) => idx !== activeLotBatchIndex)}
          onConfirm={handleApplyLotBatch}
        />
      )}
    </div>
  );
}
