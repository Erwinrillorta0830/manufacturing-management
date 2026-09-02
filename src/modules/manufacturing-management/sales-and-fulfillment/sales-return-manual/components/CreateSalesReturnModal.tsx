"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Plus,
  Trash2,
  Save,
  ChevronDown,
  FileText,
  User,
  Calculator,
  CheckCircle,
  Loader2,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  QuotationHeader,
} from "../type";

// Import Child Modal
import { ProductLookupModal } from "./ProductLookupModal";
// Import Provider & Types
import {
  SalesReturnProvider,
  SalesmanOption,
  CustomerOption,
  BranchOption,
  Product,
} from "../providers/fetchProviders";
import { resolveFinalDiscount } from "../utils/discount-resolver";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface SalesReturnGroup {
  key: string;
  code: string;
  description: string;
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

  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [customerCode, setCustomerCode] = useState("");

  const [priceType, setPriceType] = useState("A");

  const [isThirdParty, setIsThirdParty] = useState(false);
  // Success Modal State
  const [isSuccessOpen, setSuccessOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // UI State for Validation
  const [returnTypeError, setReturnTypeError] = useState(false);

  // Bottom Form Fields
  const [orderNo, setOrderNo] = useState("");

  // INVOICE STATE
  const [invoiceNo, setInvoiceNo] = useState("");
  const [appliedInvoiceId, setAppliedInvoiceId] = useState<number | null>(null);
  const [, setSelectedQuotationId] = useState<number | null>(null);
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
  const [lotOptions, setLotOptions] = useState<{ lot_id: number; lot_name: string; }[]>([]);

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

  // QUOTATION STATE
  const [quotationOptions, setQuotationOptions] = useState<QuotationHeader[]>([]);
  const [quotationSearch, setQuotationSearch] = useState("");
  const [isQuotationOpen, setIsQuotationOpen] = useState(false);
  const quotationWrapperRef = useRef<HTMLDivElement>(null);

  // --- RFID State ---
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // --- 3. CART STATE ---
  const [items, setItems] = useState<SalesReturnItem[]>([]);
  const [isProductLookupOpen, setIsProductLookupOpen] = useState(false);

  // --- 4. SEARCHABLE DROPDOWN STATES ---
  const [isSalesmanOpen, setIsSalesmanOpen] = useState(false);
  const [salesmanSearch, setSalesmanSearch] = useState("");
  const salesmanWrapperRef = useRef<HTMLDivElement>(null);

  const [isCustomerOpen, setIsCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const customerWrapperRef = useRef<HTMLDivElement>(null);

  /**
   * Resolves the correct unit price based on the selected salesman's priceType.
   * Falls back to priceA if the specific price type is not available.
   */
  const resolvePrice = useCallback((item: SalesReturnItem | Record<string, unknown>, currentPriceType: string, catalogPrices?: ProductPerPriceType[]): number => {
    const pt = priceTypeOptions.find(p => p.price_type_name === currentPriceType || p.price_type_id.toString() === currentPriceType);

    // For SalesReturnItem mapped structure
    if (pt && Array.isArray((item as SalesReturnItem).availablePrices)) {
      const priceRecord = (item as SalesReturnItem).availablePrices!.find(p => Number(p.price_type_id) === Number(pt.price_type_id));
      if (priceRecord && priceRecord.price !== undefined) {
        return Math.round(Number(priceRecord.price) * 100) / 100;
      }
    }

    // For raw Product data during updateDiscounts
    if (pt && Array.isArray(catalogPrices)) {
      const priceRecord = catalogPrices.find((p: ProductPerPriceType) => Number(p.product_id) === Number((item as Record<string, unknown>).product_id) && Number(p.price_type_id) === Number(pt.price_type_id));
      if (priceRecord && priceRecord.price !== undefined) {
        return Math.round(Number(priceRecord.price) * 100) / 100;
      }
    }

    const price = Number((item as Record<string, unknown>).unitPrice) || 0;
    return Math.round(price * 100) / 100;
  }, [priceTypeOptions]);

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
            quotationsData,
          ] = await Promise.all([
            SalesReturnProvider.getFormSalesmen(),
            SalesReturnProvider.getFormCustomers(),
            SalesReturnProvider.getFormBranches(),
            SalesReturnProvider.getLineDiscounts(),
            SalesReturnProvider.getSalesReturnTypes(),
            SalesReturnProvider.getPriceTypes(),
            SalesReturnProvider.getLots(),
            SalesReturnProvider.getQuotations(),
          ]);
          setSalesmen(salesmenData);
          setCustomers(customersData);
          setBranches(branchesData);
          setLineDiscountOptions(lineDiscountData);
          setReturnTypeOptions(returnTypesData);
          setPriceTypeOptions(priceTypesData);
          setLotOptions(lotsData);
          setQuotationOptions(quotationsData);
        } catch (error) {
          console.error("Failed to load form data", error);
        }
      };
      loadData();
    }
  }, [isOpen]);

  // 🟢 NEW: Effect to automatically update prices when Price Type changes
  useEffect(() => {
    if (items.length > 0) {
      setItems((prevItems) =>
        prevItems.map((item) => {
          const basePrice = resolvePrice(item, priceType);
          const newUnitPrice = basePrice;
          const agPrice = item.agreedPrice !== undefined && item.agreedPrice !== null ? item.agreedPrice : newUnitPrice;

          const newGross = Math.round(item.quantity * agPrice * 100) / 100;
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
  }, [priceType, lineDiscountOptions, items.length, resolvePrice]);

  // 🟢 NEW: Effect to automatically update discounts when Customer changes
  useEffect(() => {
    if (items.length > 0 && customerCode) {
      const updateDiscounts = async () => {
        try {
          const catalog = await SalesReturnProvider.getFullCatalog(customerCode);

          setItems((prevItems) =>
            prevItems.map((item) => {
              const productInfo = catalog.products?.find((p: Product) => Number(p.product_id) === Number(item.productId));
              if (!productInfo) return item;

              const newUnitPrice = resolvePrice(productInfo as unknown as Record<string, unknown>, priceType, catalog.productPrices);
              const agPrice = item.agreedPrice !== undefined && item.agreedPrice !== null ? item.agreedPrice : newUnitPrice;
              const newGross = Math.round(item.quantity * agPrice * 100) / 100;

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
  }, [customerCode, customers, lineDiscountOptions, items.length, priceType, resolvePrice]);

  const handleSelectSalesman = useCallback((salesman: SalesmanOption) => {
    setSelectedSalesmanId(salesman.id.toString());
    setSalesmanSearch(salesman.name);
    setSalesmanCode(salesman.code);

    if (salesman.priceType) {
      const pt = priceTypeOptions.find(p => p.price_type_id.toString() === salesman.priceType.toString());
      if (pt) {
        setPriceType(pt.price_type_name);
      } else {
        setPriceType(salesman.priceType.toString());
      }
    } else {
      setPriceType("A");
    }

    const linkedBranch = branches.find((b) => b.id === salesman.branchId);
    setBranchName(linkedBranch ? linkedBranch.name : "");
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
      } else {
        // Fallback if priceTypeOptions is not yet loaded or doesn't match
        setPriceType(customer.price_type_id.toString());
      }
    }
    setIsCustomerOpen(false);
    setOrderNo("");
    setOrderSearch("");
    setInvoiceNo("");
    setInvoiceSearch("");
  }, [priceTypeOptions]);

  const handleSelectQuotation = useCallback(async (quotationId: number, quoteNumber: string) => {
    setSelectedQuotationId(quotationId);
    setQuotationSearch(quoteNumber);
    setIsQuotationOpen(false);

    try {
      const snapshots = await SalesReturnProvider.getQuotationSnapshots(quotationId);

      // Update existing items if their product ID matches a snapshot
      if (items.length > 0 && snapshots.length > 0) {
        setItems(prevItems => prevItems.map(item => {
          const snapshot = snapshots.find(s => Number(s.product_id) === Number(item.productId));
          if (snapshot) {
            const newAgreedPrice = Number(snapshot.unit_price);
            const newVariance = Math.round((item.unitPrice - newAgreedPrice) * 100) / 100;
            const newGross = Math.round((item.quantity * newAgreedPrice) * 100) / 100;
            const newTotal = Math.round((newGross - (item.discountAmount || 0)) * 100) / 100;

            return {
              ...item,
              agreedPrice: newAgreedPrice,
              priceVariance: newVariance,
              grossAmount: newGross,
              totalAmount: newTotal
            };
          }
          return item;
        }));
      }
    } catch (error) {
      console.error("Failed to load quotation snapshots", error);
      toast.error("Failed to load quotation details.");
    }
  }, [items]);

  // --- 5b. FETCH INVOICES when salesman or customer changes ---
  useEffect(() => {
    if (selectedSalesmanId && customerCode) {
      const fetchInv = async () => {
        try {
          const data = await SalesReturnProvider.getInvoiceReturnList(
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
    } else {
      setInvoiceOptions([]);
    }
  }, [selectedSalesmanId, customerCode, handleSelectSalesman, handleSelectCustomer]);

  // --- 5c. PRE-FILL FROM CLEARANCE ---
  useEffect(() => {
    if (isOpen && fromClearance === "true" && customers.length > 0) {
      const storedData = localStorage.getItem('scm_dispatch_return_data');
      if (storedData) {
        try {
          const data = JSON.parse(storedData);

          // 1. Find and set Customer (DO THIS FIRST as it clears other fields)
          const foundCustomer = customers.find(c =>
            (data.customerCode && c.code === data.customerCode) ||
            (data.customerName && c.name === data.customerName)
          );

          if (foundCustomer) {
            handleSelectCustomer(foundCustomer);
          } else {
            setCustomerCode(data.customerCode || "");
            setCustomerSearch(data.customerName || "");
          }

          // 1.5 Find and set Salesman
          const foundSalesman = salesmen.find(s =>
            (data.salesmanId && s.id === data.salesmanId) ||
            (data.salesmanCode && s.code === data.salesmanCode) ||
            (data.salesmanName && s.name === data.salesmanName)
          );
          if (foundSalesman) {
            handleSelectSalesman(foundSalesman);
          } else {
            setSelectedSalesmanId(data.salesmanId || "");
            setSalesmanCode(data.salesmanCode || "");
            setSalesmanSearch(data.salesmanName || "");
          }

          // 2. Set Invoice & Order
          setInvoiceNo(data.invoiceNo || "");
          setInvoiceSearch(data.invoiceNo || "");
          setOrderNo(data.orderNo || "");
          setOrderSearch(data.orderNo || "");
          setRemarks(data.remarks || "");

          // 2.5 Set Branch (Override if foundSalesman sets it)
          if (data.branchName) {
            setBranchName(data.branchName);
          }

          // 4. Cleanup to prevent re-triggering
          localStorage.removeItem('scm_dispatch_return_data');
          // Clear query param from URL without reloading
          const url = new URL(window.location.href);
          url.searchParams.delete('fromClearance');
          window.history.replaceState({}, '', url.toString());
        } catch (e) {
          console.error("Failed to parse clearance return data", e);
        }
      }
    }
  }, [isOpen, fromClearance, customers, salesmen, handleSelectCustomer, handleSelectSalesman]);

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

      if (
        quotationWrapperRef.current &&
        !quotationWrapperRef.current.contains(target)
      ) {
        setIsQuotationOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [selectedSalesmanId, salesmen, selectedCustomerId, customers]);

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
    setPriceType("A");
    setCustomerCode("");
    setOrderNo("");
    setOrderSearch("");
    setInvoiceNo("");
    setInvoiceSearch("");
    setAppliedInvoiceId(null);
    setRemarks("");
    setSelectedQuotationId(null);
    setQuotationSearch("");
    setIsQuotationOpen(false);
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

    try {
      setIsSubmitting(true);
      const selectedSalesmanObj = salesmen.find(
        (s) => s.id.toString() === selectedSalesmanId,
      );
      const branchId = selectedSalesmanObj
        ? selectedSalesmanObj.branchId
        : null;

      const selectedPt = priceTypeOptions.find(pt => pt.price_type_name === priceType);
      const payloadPriceTypeId = selectedPt ? selectedPt.price_type_id : null;

      const payload = {
        invoiceNo,
        orderNo,
        customer: customerCode,
        salesmanId: selectedSalesmanId,
        salesmanCode: salesmanCode,
        branchId: branchId,
        isThirdParty,
        totalAmount: totalNet,
        returnDate,
        priceType: payloadPriceTypeId,
        remarks,
        items: items,
        appliedInvoiceId: appliedInvoiceId ?? undefined,
      };

      await SalesReturnProvider.submitReturn(payload);

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
          const resultRecord = item as Record<string, unknown>;
          const priceKey = `price${priceType}`;
          const unitPrice =
            Math.round((Number(resultRecord[priceKey]) ||
              Number(resultRecord.unitPrice) ||
              0) * 100) / 100;

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
            description: item.description || "Unknown Item",
            unit: item.unit || "Pcs",
            quantity: qty,
            unitPrice: unitPrice,
            agreedPrice: unitPrice,
            priceVariance: 0,
            grossAmount: initialGross,
            discountType: incomingDiscountType,
            discountAmount: initialDiscountAmt,
            totalAmount: Math.round((initialGross - initialDiscountAmt) * 100) / 100,
            reason: "",
            returnType: "",
          } as SalesReturnItem);
        }
      });
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (
    index: number,
    field: keyof SalesReturnItem,
    value: string | number | null,
  ) => {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value } as SalesReturnItem;

      if (field === "quantity" || field === "unitPrice" || field === "agreedPrice") {
        const agPrice = item.agreedPrice !== undefined && item.agreedPrice !== null ? item.agreedPrice : item.unitPrice;
        item.grossAmount = Math.round(item.quantity * agPrice * 100) / 100;
        item.priceVariance = Math.round(((item.unitPrice || 0) - agPrice) * item.quantity * 100) / 100;
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
  const totalNet = Math.round(items.reduce((sum, item) => sum + (item.totalAmount || 0), 0) * 100) / 100;

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
          <div className="bg-background p-5 rounded-lg border border-border shadow-sm relative">
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
                  <div className="absolute top-[calc(100%+4px)] left-0 w-full z-20 bg-background border border-border rounded-md shadow-xl max-h-60 overflow-y-auto font-medium">
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
                  <div className="absolute top-[calc(100%+4px)] left-0 w-full z-20 bg-background border border-border rounded-md shadow-xl max-h-60 overflow-y-auto font-medium">
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
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide truncate block">
                  Branch
                </label>
                <div className="h-9 w-full bg-muted/20 border border-border rounded-md px-3 flex items-center text-sm font-medium text-foreground italic shadow-sm">
                  {branchName || "-"}
                </div>
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
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide truncate block">
                  Price Type <span className="text-destructive">*</span>
                </label>
                <Select value={priceType} onValueChange={setPriceType}>
                  <SelectTrigger className="w-full h-9 bg-background border-border focus:ring-2 focus:ring-primary shadow-sm text-sm">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border border-border shadow-xl z-50">
                    {priceTypeOptions.length > 0 ? (
                      priceTypeOptions.map((pt) => (
                        <SelectItem key={pt.price_type_id} value={pt.price_type_name}>
                          Type {pt.price_type_name}
                        </SelectItem>
                      ))
                    ) : (
                      <>
                        <SelectItem value="A">Type A</SelectItem>
                        <SelectItem value="B">Type B</SelectItem>
                        <SelectItem value="C">Type C</SelectItem>
                        <SelectItem value="D">Type D</SelectItem>
                        <SelectItem value="E">Type E</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
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
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground mr-1">
                      {items.length} {items.length === 1 ? "item" : "items"} total
                    </span>
                  </div>
                </div>
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
              <Table className="min-w-[1600px]">
                <TableHeader>
                  <TableRow className="bg-primary hover:bg-primary! border-none">
                    <TableHead className="text-white font-semibold h-11 w-[120px] uppercase text-xs">
                      Code
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 min-w-[180px] uppercase text-xs">
                      Description
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 w-[80px] uppercase text-xs">
                      Unit
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 text-center min-w-[100px] uppercase text-xs">
                      Qty
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 text-right min-w-[130px] uppercase text-xs">
                      Unit Price
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 text-right min-w-[130px] uppercase text-xs">
                      Agreed Price
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 text-right min-w-[110px] uppercase text-xs">
                      Variance
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 text-right min-w-[130px] uppercase text-xs">
                      Gross
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 w-[160px] uppercase text-xs">
                      Disc. Type
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 text-right min-w-[140px] uppercase text-xs">
                      Disc. Amt
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 text-right min-w-[150px] uppercase text-xs">
                      Total
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 min-w-[160px] uppercase text-xs">
                      Lot
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 min-w-[160px] uppercase text-xs">
                      Batch
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 min-w-[180px] uppercase text-xs">
                      Reason
                    </TableHead>
                    <TableHead className="text-white font-semibold h-11 w-[200px] uppercase text-xs">
                      Return Type
                    </TableHead>
                    {/* 🟢 REVISED: Delete Column hidden if not Pending */}
                    {true && (
                      <TableHead className="text-white font-semibold h-11 w-[50px]"></TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={12}
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
                              {true ? (
                                <Input
                                  type="number"
                                  className="h-9 w-full text-center text-sm border-border px-2"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    handleItemChange(idx, "quantity", e.target.value)
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
                              {true ? (
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
                              {true ? (
                                (() => {
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
                                })()
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {lineDiscountOptions.find((d) => d.id.toString() == item.discountType)?.discount_type || "None"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right align-middle p-2">
                              <Input type="number" readOnly className="h-9 w-full text-right text-sm bg-muted/30 text-muted-foreground cursor-not-allowed" value={item.discountAmount ? Number(item.discountAmount).toFixed(2) : ""} />
                            </TableCell>
                            <TableCell className="text-right font-bold text-sm text-foreground align-middle whitespace-nowrap">
                              ₱{(Number(item.totalAmount) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="align-middle p-2">
                              {true ? (
                                <LocalSearchableSelect
                                  value={item.lot_id ? item.lot_id.toString() : ""}
                                  onValueChange={(val) => handleItemChange(idx, "lot_id", Number(val))}
                                  options={lotOptions.map(l => ({ value: l.lot_id.toString(), label: l.lot_name }))}
                                  placeholder="Select lot"
                                  className="h-9 text-xs"
                                />
                              ) : (
                                <span className="text-sm text-muted-foreground">{lotOptions.find(l => l.lot_id === item.lot_id)?.lot_name || "-"}</span>
                              )}
                            </TableCell>
                            <TableCell className="align-middle p-2">
                              {true ? (
                                <Input
                                  type="text"
                                  className="h-9 w-full text-left text-sm border-border px-2"
                                  value={item.batch || ""}
                                  onChange={(e) => handleItemChange(idx, "batch", e.target.value)}
                                  placeholder="Batch no."
                                />
                              ) : (
                                <span className="text-sm text-muted-foreground">{item.batch || "-"}</span>
                              )}
                            </TableCell>
                            {/* Reason */}
                            <TableCell className="align-middle p-2">
                              {true ? (
                                <ReasonInputSection
                                  value={item.reason || ""}
                                  onChange={(val) => handleItemChange(idx, "reason", val)}
                                />
                              ) : (
                                <span className="text-sm text-muted-foreground italic truncate block max-w-[120px]" title={item.reason || ""}>
                                  {item.reason || "-"}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="align-middle p-2">
                              {true ? (
                                <LocalSearchableSelect
                                  value={item.returnType || ""}
                                  onValueChange={(val) => {
                                    handleItemChange(idx, "returnType", val);
                                    setReturnTypeError(false);
                                  }}
                                  options={returnTypeOptions.length > 0
                                    ? returnTypeOptions.map((type) => ({ value: type.type_name, label: type.type_name }))
                                    : [
                                      { value: "Good Order", label: "Good Order" },
                                      { value: "Bad Order", label: "Bad Order" }
                                    ]
                                  }
                                  placeholder="Select type"
                                  className={cn(
                                    "h-9 text-xs",
                                    returnTypeError && (!item.returnType || item.returnType === "") && "border-destructive ring-1 ring-destructive/30 bg-destructive/5 text-destructive"
                                  )}
                                />
                              ) : (
                                <Badge variant="outline" className="font-normal">{item.returnType || "Unassigned"}</Badge>
                              )}
                            </TableCell>
                            {true && (
                              <TableCell className="align-middle p-2 text-center">
                                <button onClick={() => handleRemoveItem(idx)} className="text-destructive/70 hover:text-destructive transition-colors" title="Remove row">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}

                      {Object.values(
                        items.filter(i => i.rfidTags && i.rfidTags.length > 0).reduce((acc, item) => {
                          // Find the true index in items
                          const idx = items.findIndex(d => d === item);
                          const rType = item.returnType || "Unassigned";
                          const key = `${item.productId}-${item.unit}-${rType}`;
                          if (!acc[key]) {
                            acc[key] = {
                              key,
                              code: item.code,
                              description: item.description,
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
                            {/* 🟢 REVISED: All inputs disabled if not Pending (canEditAll) */}
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
                                  <div className="w-6" /> // spacer
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
                              {(
                                Number(group.totalGross)
                              ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="align-middle p-2 text-center text-muted-foreground">
                              -
                            </TableCell>
                            <TableCell className="text-right align-middle p-2 text-muted-foreground font-mono">
                              {group.totalDiscount.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-bold text-sm text-primary align-middle">
                              {group.totalNet.toLocaleString()}
                            </TableCell>
                            <TableCell className="align-middle p-2 text-center text-muted-foreground">
                              -
                            </TableCell>
                            <TableCell className="align-middle p-2 text-center text-muted-foreground">
                              -
                            </TableCell>
                            <TableCell className="align-middle p-2 text-center text-muted-foreground">
                              -
                            </TableCell>
                            <TableCell className="align-middle p-2">
                              {group.returnType !== "Unassigned" ? (
                                <Badge
                                  variant="secondary"
                                  className="bg-primary/20 text-primary hover:bg-primary/20 hover:text-primary font-medium"
                                >
                                  {group.returnType}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground/60 italic text-xs">Unassigned</span>
                              )}
                            </TableCell>
                            <TableCell />
                          </TableRow>

                          {/* Child Rows (Individual Scans/Additions) */}
                          {expandedGroups[group.key] && group.children.map(({ item, idx }: { item: SalesReturnItem, idx: number }) => (
                            <TableRow
                              key={item.id || idx}
                              className="border-b border-border hover:bg-muted/20 transition-colors duration-200"
                            >
                              {/* 🟢 REVISED: All inputs disabled if not Pending (canEditAll) */}
                              <TableCell colSpan={2} className="text-sm text-foreground font-bold align-middle pl-10 font-mono">
                                {item.rfidTags && item.rfidTags.length > 0 ? (
                                  <div className="flex items-center gap-1.5 bg-background border border-border pl-2.5 pr-2 py-1 rounded-md w-fit truncate max-w-[200px]" title={item.rfidTags[0]}>
                                    <span className="text-primary truncate">{item.rfidTags[0]}</span>
                                    <span className="text-[10px] text-muted-foreground font-sans uppercase">RFID</span>
                                  </div>
                                ) : null}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground align-middle">
                              </TableCell>
                              <TableCell className="text-center align-middle p-2">
                                {true ? (
                                  item.rfidTags && item.rfidTags.length > 0 ? (
                                    <div className="text-center font-semibold text-sm">{item.quantity}</div>
                                  ) : (
                                    <Input
                                      type="number"
                                      className="h-9 w-full text-center text-sm border-border px-2"
                                      value={item.quantity}
                                      onChange={(e) =>
                                        handleItemChange(
                                          idx,
                                          "quantity",
                                          e.target.value,
                                        )
                                      }
                                    />
                                  )
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
                                {true ? (
                                  <Input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    className="h-9 w-full text-right text-sm border-border px-2"
                                    value={item.agreedPrice !== undefined && item.agreedPrice !== null ? item.agreedPrice : item.unitPrice}
                                    onChange={(e) =>
                                      handleItemChange(
                                        idx,
                                        "agreedPrice",
                                        e.target.value,
                                      )
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
                              <TableCell className="text-right text-sm text-muted-foreground align-middle font-mono">
                                {(
                                  Number(item.grossAmount) || 0
                                ).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </TableCell>
                              <TableCell className="align-middle p-2">
                                {true ? (
                                  (() => {
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
                                  })()
                                ) : (
                                  <span className="text-sm text-muted-foreground">
                                    {lineDiscountOptions.find(
                                      (d) => d.id.toString() == item.discountType,
                                    )?.discount_type || "None"}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right align-middle p-2">
                                <Input
                                  type="number"
                                  readOnly
                                  className="h-9 w-full text-right text-sm bg-muted/30 text-muted-foreground cursor-not-allowed"
                                  value={item.discountAmount ? Number(item.discountAmount).toFixed(2) : ""}
                                />
                              </TableCell>
                              <TableCell className="text-right font-bold text-sm text-foreground align-middle">
                                {(Number(item.totalAmount) || 0).toLocaleString()}
                              </TableCell>
                              <TableCell className="align-middle p-2">
                                {true ? (
                                  <LocalSearchableSelect
                                    value={item.lot_id ? item.lot_id.toString() : ""}
                                    onValueChange={(val) => handleItemChange(idx, "lot_id", Number(val))}
                                    options={lotOptions.map(l => ({ value: l.lot_id.toString(), label: l.lot_name }))}
                                    placeholder="Select lot"
                                    className="h-9 text-xs"
                                  />
                                ) : (
                                  <span className="text-sm text-muted-foreground">{lotOptions.find(l => l.lot_id === item.lot_id)?.lot_name || "-"}</span>
                                )}
                              </TableCell>
                              <TableCell className="align-middle p-2">
                                {true ? (
                                  <Input
                                    type="text"
                                    className="h-9 w-full text-left text-sm border-border px-2"
                                    value={item.batch || ""}
                                    onChange={(e) => handleItemChange(idx, "batch", e.target.value)}
                                    placeholder="Batch no."
                                  />
                                ) : (
                                  <span className="text-sm text-muted-foreground">{item.batch || "-"}</span>
                                )}
                              </TableCell>
                              <TableCell className="align-middle p-2">
                                {true ? (
                                  <ReasonInputSection
                                    value={item.reason || ""}
                                    onChange={(val) => handleItemChange(idx, "reason", val)}
                                  />
                                ) : (
                                  <span className="text-sm text-muted-foreground italic">
                                    {item.reason || "-"}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="align-middle p-2">
                                {true ? (
                                  <LocalSearchableSelect
                                    value={item.returnType || ""}
                                    onValueChange={(val) => {
                                      handleItemChange(idx, "returnType", val);
                                      setReturnTypeError(false);
                                    }}
                                    options={returnTypeOptions.length > 0
                                      ? returnTypeOptions.map((type) => ({ value: type.type_name, label: type.type_name }))
                                      : [
                                        { value: "Good Order", label: "Good Order" },
                                        { value: "Bad Order", label: "Bad Order" }
                                      ]
                                    }
                                    placeholder="Select type"
                                    className={cn(
                                      "h-9 text-sm",
                                      returnTypeError && (!item.returnType || item.returnType === "") && "border-destructive ring-1 ring-destructive/30 bg-destructive/5 text-destructive"
                                    )}
                                  />
                                ) : (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] font-normal"
                                  >
                                    {item.returnType as React.ReactNode}
                                  </Badge>
                                )}
                              </TableCell>
                              {true && (
                                <TableCell className="text-center align-middle">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-destructive hover:text-white hover:bg-destructive"
                                    onClick={() => handleRemoveItem(idx)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
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
                {/* QUOTATION REFERENCE */}
                <div className="space-y-1.5 col-span-2" ref={quotationWrapperRef}>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">
                    Quotation Reference
                  </label>
                  <div className="relative group">
                    <input
                      type="text"
                      className="w-full h-9 border rounded-md text-sm px-3 pr-8 bg-background border-border focus:ring-2 focus:border-primary outline-none transition-all shadow-sm"
                      placeholder="Search Quotation No..."
                      value={quotationSearch}
                      onChange={(e) => {
                        setQuotationSearch(e.target.value);
                        setIsQuotationOpen(true);
                        setSelectedQuotationId(null);
                      }}
                      onFocus={() => setIsQuotationOpen(true)}
                    />
                    <ChevronDown className="h-3 w-3 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    {isQuotationOpen && (
                      <div className="absolute bottom-[calc(100%+4px)] left-0 w-full z-50 bg-background border border-border rounded-md shadow-xl max-h-48 overflow-y-auto divide-y">
                        <div
                          className="px-3 py-2 text-xs font-medium cursor-pointer hover:bg-destructive/10 text-destructive flex items-center gap-2"
                          onClick={() => {
                            setSelectedQuotationId(null);
                            setQuotationSearch("");
                            setIsQuotationOpen(false);
                          }}
                        >
                          <X className="h-3 w-3" /> Clear Selection
                        </div>
                        {quotationOptions
                          .filter(q => (!selectedCustomerId || Number(q.customer_id) === Number(selectedCustomerId)) && (q.quote_number || "").toLowerCase().includes(quotationSearch.toLowerCase()))
                          .map((q) => (
                            <div
                              key={`quote-${q.id}`}
                              className="px-3 py-2 text-sm cursor-pointer hover:bg-primary/10 text-foreground"
                              onClick={() => handleSelectQuotation(Number(q.id), String(q.quote_number))}
                            >
                              <span className="font-medium">{q.quote_number}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
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
                <div className="flex justify-between items-center text-sm text-muted-foreground">
                  <span>Total Gross Amount</span>
                  <span className="font-medium text-foreground tabular-nums">
                    ₱
                    {totalGross.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className={`flex justify-between items-center text-sm ${totalVariance > 0 ? "text-green-600" : totalVariance < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  <span>Price Variance</span>
                  <span className="font-medium tabular-nums">
                    {totalVariance > 0 ? "+" : ""}
                    ₱
                    {totalVariance.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div className="flex justify-between items-center text-sm text-destructive">
                  <span>Total Discount</span>
                  <span className="font-medium tabular-nums">
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
    </div>
  );
}
