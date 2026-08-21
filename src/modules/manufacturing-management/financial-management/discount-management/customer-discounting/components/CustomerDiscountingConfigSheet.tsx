// src/modules/financial-management/accounting/discount-management/customer-discounting/components/CustomerDiscountingConfigSheet.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode, WheelEvent } from "react";
import { Check, ChevronsUpDown, Loader2, Plus, Save, Search, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { customerDiscountingApi } from "../providers/customerDiscountingApi";
import type {
  CustomerDiscountingCategory,
  CustomerDiscountingCustomer,
  CustomerDiscountingProduct,
  CustomerDiscountingSupplier,
  DiscountOption,
  ProductRule,
  SupplierCategoryRule,
} from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: CustomerDiscountingCustomer | null;
  discountTypes: DiscountOption[];
  suppliers: CustomerDiscountingSupplier[];
  supplierCategoryRules: SupplierCategoryRule[];
  productRules: ProductRule[];
  loading: boolean;
  saving: boolean;
  onUpdateGlobalDiscount: (discountTypeId: number | null) => Promise<void>;
  onAddSupplierCategoryRule: (payload: {
    supplierId: number;
    categoryId: number | null;
    discountTypeId: number;
  }) => Promise<boolean>;
  onAddProductRule: (payload: {
    productId: number;
    discountTypeId: number | null;
    unitPrice: number | null;
  }) => Promise<boolean>;
  onDeleteSupplierCategoryRule: (id: number) => Promise<void>;
  onDeleteProductRule: (id: number) => Promise<void>;
};

type SelectOption = {
  value: string;
  label: string;
};

type PendingConfirmation =
  | {
      type: "global";
      discountTypeId: number | null;
      discountName: string;
    }
  | {
      type: "supplier-category";
      mode: "add" | "update";
      supplierId: number;
      supplierName: string;
      categoryId: number | null;
      categoryName: string;
      discountTypeId: number;
      discountName: string;
    }
  | {
      type: "product";
      mode: "add" | "update";
      productId: number;
      productName: string;
      discountTypeId: number | null;
      discountName: string;
    }
  | {
      type: "delete-supplier-category";
      rule: SupplierCategoryRule;
    }
  | {
      type: "delete-product";
      rule: ProductRule;
    };

const noneValue = "none";

/**
 * Formats discount percentages consistently across tabs and rule tables.
 */
function percentLabel(value: number) {
  return `${Number(value || 0).toFixed(2)}%`;
}

/**
 * Builds a compact user-facing label for discount relations.
 */
function discountText(discount: DiscountOption | null) {
  return discount ? `${discount.discountType} (${percentLabel(discount.totalPercent)})` : "No discount";
}

/**
 * Combines parent product name and code so selected products stay identifiable.
 */
function productPickerLabel(product: CustomerDiscountingProduct) {
  return product.productCode ? `${product.productName} (${product.productCode})` : product.productName;
}

/**
 * Shows a stable product label without exposing null relation ids.
 */
function productRuleLabel(rule: ProductRule) {
  return rule.productName || (rule.productId ? `Product #${rule.productId}` : "N/A");
}

/**
 * Returns the selected option label for confirmation copy.
 */
function optionLabel(options: SelectOption[], value: string, fallback: string) {
  return options.find((option) => option.value === value)?.label ?? fallback;
}

/**
 * Keeps nested dropdowns scrollable inside the sheet.
 */
function scrollDropdownWithWheel(event: WheelEvent<HTMLDivElement>) {
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.scrollTop += event.deltaY;
}

/**
 * Sheet UI for managing global, supplier/category, and product customer discounts.
 */
export function CustomerDiscountingConfigSheet({
  open,
  onOpenChange,
  customer,
  discountTypes,
  suppliers,
  supplierCategoryRules,
  productRules,
  loading,
  saving,
  onUpdateGlobalDiscount,
  onAddSupplierCategoryRule,
  onAddProductRule,
  onDeleteSupplierCategoryRule,
  onDeleteProductRule,
}: Props) {
  const [globalOverride, setGlobalOverride] = useState<{ customerCode: string; value: string } | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [categoryId, setCategoryId] = useState(noneValue);
  const [supplierCategoryOptions, setSupplierCategoryOptions] = useState<CustomerDiscountingCategory[]>([]);
  const [supplierCategoryLoading, setSupplierCategoryLoading] = useState(false);
  const [supplierDiscountId, setSupplierDiscountId] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productOptions, setProductOptions] = useState<CustomerDiscountingProduct[]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<CustomerDiscountingProduct | null>(null);
  const [productDiscountId, setProductDiscountId] = useState("");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);

  const discountOptions = useMemo(
    () => [
      { value: noneValue, label: "No Discount" },
      ...discountTypes.map((item) => ({
        value: String(item.id),
        label: `${item.discountType} (${percentLabel(item.totalPercent)})`,
      })),
    ],
    [discountTypes],
  );

  const globalDiscountId =
    customer && globalOverride?.customerCode === customer.customerCode
      ? globalOverride.value
      : customer?.globalDiscount
        ? String(customer.globalDiscount.id)
        : noneValue;
  const selectedSupplierId = supplierId ? Number(supplierId) : null;
  const selectedCategoryId = categoryId && categoryId !== noneValue ? Number(categoryId) : null;
  const matchingSupplierCategoryRule = useMemo(() => {
    if (!selectedSupplierId) return null;
    return supplierCategoryRules.find((rule) =>
      rule.supplierId === selectedSupplierId
      && (rule.categoryId ?? null) === selectedCategoryId,
    ) ?? null;
  }, [selectedCategoryId, selectedSupplierId, supplierCategoryRules]);
  const matchingProductRule = useMemo(() => {
    if (!selectedProduct) return null;
    return productRules.find((rule) => rule.productId === selectedProduct.productId) ?? null;
  }, [productRules, selectedProduct]);
  const activeCategoryOptions = selectedSupplierId ? supplierCategoryOptions : [];

  // Product search stays local to the Product tab and waits until there is enough input.
  useEffect(() => {
    if (!open || productQuery.trim().length < 2 || selectedProduct) {
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(() => {
      setProductLoading(true);
      customerDiscountingApi.searchProducts(productQuery)
        .then((rows) => {
          if (!cancelled) setProductOptions(rows);
        })
        .catch(() => {
          if (!cancelled) setProductOptions([]);
        })
        .finally(() => {
          if (!cancelled) setProductLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, productQuery, selectedProduct]);

  // Supplier/category configuration should only show categories represented by the selected supplier.
  useEffect(() => {
    if (!open || !selectedSupplierId) {
      return;
    }

    let cancelled = false;
    const handle = window.setTimeout(() => {
      setSupplierCategoryLoading(true);
      customerDiscountingApi.getSupplierCategories(selectedSupplierId)
        .then((rows) => {
          if (!cancelled) setSupplierCategoryOptions(rows);
        })
        .catch(() => {
          if (!cancelled) setSupplierCategoryOptions([]);
        })
        .finally(() => {
          if (!cancelled) setSupplierCategoryLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, selectedSupplierId]);

  const resetSupplierForm = () => {
    setSupplierId("");
    setCategoryId(noneValue);
    setSupplierCategoryOptions([]);
    setSupplierCategoryLoading(false);
    setSupplierDiscountId("");
  };

  const resetProductForm = () => {
    setProductQuery("");
    setProductOptions([]);
    setSelectedProduct(null);
    setProductDiscountId("");
  };

  const confirmGlobalDiscount = () => {
    setPendingConfirmation({
      type: "global",
      discountTypeId: globalDiscountId === noneValue ? null : Number(globalDiscountId),
      discountName: optionLabel(discountOptions, globalDiscountId, "No Discount"),
    });
  };

  const confirmSupplierCategoryRule = () => {
    if (!selectedSupplierId || !supplierDiscountId) return;

    const supplierName = suppliers.find((item) => item.id === selectedSupplierId)?.supplierName ?? `Supplier #${selectedSupplierId}`;
    const categoryName = selectedCategoryId
      ? activeCategoryOptions.find((item) => item.categoryId === selectedCategoryId)?.categoryName ?? `Category #${selectedCategoryId}`
      : "N/A";

    setPendingConfirmation({
      type: "supplier-category",
      mode: matchingSupplierCategoryRule ? "update" : "add",
      supplierId: selectedSupplierId,
      supplierName,
      categoryId: selectedCategoryId,
      categoryName,
      discountTypeId: Number(supplierDiscountId),
      discountName: optionLabel(discountOptions, supplierDiscountId, "Selected discount"),
    });
  };

  const confirmProductRule = () => {
    if (!selectedProduct || !productDiscountId) return;

    setPendingConfirmation({
      type: "product",
      mode: matchingProductRule ? "update" : "add",
      productId: selectedProduct.productId,
      discountTypeId: Number(productDiscountId),
      discountName: optionLabel(discountOptions, productDiscountId, "Selected discount"),
      productName: productPickerLabel(selectedProduct),
    });
  };

  const canSaveProduct = !!selectedProduct && !!productDiscountId;

  const confirmationCopy = (() => {
    if (!pendingConfirmation) {
      return { title: "", description: "", action: "Confirm", destructive: false };
    }

    switch (pendingConfirmation.type) {
      case "global":
        return {
          title: "Update global discount?",
          description: `Set this customer's global discount to ${pendingConfirmation.discountName}.`,
          action: "Update",
          destructive: false,
        };
      case "supplier-category":
        return {
          title: `${pendingConfirmation.mode === "update" ? "Update" : "Add"} supplier/category discount?`,
          description: `${pendingConfirmation.supplierName} / ${pendingConfirmation.categoryName} will use ${pendingConfirmation.discountName}.`,
          action: pendingConfirmation.mode === "update" ? "Update" : "Add",
          destructive: false,
        };
      case "product":
        return {
          title: `${pendingConfirmation.mode === "update" ? "Update" : "Add"} product discount?`,
          description: `${pendingConfirmation.productName} will use ${pendingConfirmation.discountName}.`,
          action: pendingConfirmation.mode === "update" ? "Update" : "Add",
          destructive: false,
        };
      case "delete-supplier-category":
        return {
          title: "Delete supplier/category discount?",
          description: `Remove the ${pendingConfirmation.rule.supplierName || `Supplier #${pendingConfirmation.rule.supplierId}`} / ${
            pendingConfirmation.rule.categoryId ? pendingConfirmation.rule.categoryName : "N/A"
          } discount rule.`,
          action: "Delete",
          destructive: true,
        };
      case "delete-product":
        return {
          title: "Delete product discount?",
          description: `Remove the product discount rule for ${productRuleLabel(pendingConfirmation.rule)}.`,
          action: "Delete",
          destructive: true,
        };
    }
  })();

  const runPendingConfirmation = async () => {
    const confirmation = pendingConfirmation;
    if (!confirmation) return;

    if (confirmation.type === "global") {
      await onUpdateGlobalDiscount(confirmation.discountTypeId);
      setPendingConfirmation(null);
      return;
    }

    if (confirmation.type === "supplier-category") {
      const success = await onAddSupplierCategoryRule({
        supplierId: confirmation.supplierId,
        categoryId: confirmation.categoryId,
        discountTypeId: confirmation.discountTypeId,
      });
      if (success) resetSupplierForm();
      setPendingConfirmation(null);
      return;
    }

    if (confirmation.type === "product") {
      const existingRule = productRules.find((rule) => rule.productId === confirmation.productId);
      const success = await onAddProductRule({
        productId: confirmation.productId,
        discountTypeId: confirmation.discountTypeId,
        unitPrice: existingRule?.unitPrice ?? null,
      });
      if (success) resetProductForm();
      setPendingConfirmation(null);
      return;
    }

    if (confirmation.type === "delete-supplier-category") {
      await onDeleteSupplierCategoryRule(confirmation.rule.id);
      setPendingConfirmation(null);
      return;
    }

    await onDeleteProductRule(confirmation.rule.id);
    setPendingConfirmation(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[960px]">
        <SheetHeader>
          <SheetTitle>Customer Discounting</SheetTitle>
          <SheetDescription>
            {customer ? `${customer.customerName} (${customer.customerCode})` : "Configure customer pricing rules"}
          </SheetDescription>
        </SheetHeader>

        {!customer ? null : (
          <Tabs defaultValue="global" className="mt-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="global">Global</TabsTrigger>
              <TabsTrigger value="supplier-category">Supplier / Category</TabsTrigger>
              <TabsTrigger value="product">Product</TabsTrigger>
            </TabsList>

            <TabsContent value="global" className="space-y-4 pt-4">
              <div className="rounded-md border p-4">
                <div className="space-y-2">
                  <Label>Global Discount Type</Label>
                  <ConfigSearchableSelect
                    value={globalDiscountId}
                    onValueChange={(value) => {
                      if (customer) setGlobalOverride({ customerCode: customer.customerCode, value });
                    }}
                    options={discountOptions}
                    placeholder="Select global discount"
                  />
                </div>
                <Button
                  className="mt-4"
                  disabled={saving}
                  onClick={confirmGlobalDiscount}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Global Discount
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="supplier-category" className="space-y-4 pt-4">
              <div className="grid gap-3 rounded-md border p-4 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                <div className="space-y-2">
                  <Label>Trade Supplier</Label>
                  <ConfigSearchableSelect
                    value={supplierId}
                    onValueChange={(value) => {
                      setSupplierId(value);
                      setCategoryId(noneValue);
                      setSupplierCategoryOptions([]);
                      setSupplierCategoryLoading(false);
                    }}
                    options={suppliers.map((item) => ({ value: String(item.id), label: item.supplierName }))}
                    placeholder="Select supplier"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <ConfigSearchableSelect
                    value={categoryId}
                    onValueChange={setCategoryId}
                    options={[
                      { value: noneValue, label: "All supplier categories" },
                      ...activeCategoryOptions.map((item) => ({ value: String(item.categoryId), label: item.categoryName })),
                    ]}
                    placeholder={supplierCategoryLoading ? "Loading categories..." : "Select category"}
                    disabled={!selectedSupplierId || supplierCategoryLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Discount Type</Label>
                  <ConfigSearchableSelect
                    value={supplierDiscountId}
                    onValueChange={setSupplierDiscountId}
                    options={discountOptions.filter((item) => item.value !== noneValue)}
                    placeholder="Select discount"
                  />
                </div>
                <Button
                  disabled={saving || !supplierId || !supplierDiscountId}
                  onClick={confirmSupplierCategoryRule}
                >
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  {matchingSupplierCategoryRule ? "Update" : "Add"}
                </Button>
              </div>

              <RuleTable
                loading={loading}
                emptyText="No supplier/category rules yet."
                headers={["Supplier", "Category", "Discount", "Action"]}
              >
                {supplierCategoryRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.supplierName || `Supplier #${rule.supplierId}`}</TableCell>
                    <TableCell>{rule.categoryId ? rule.categoryName : "All categories"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{discountText(rule.discount)}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={saving}
                        onClick={() => setPendingConfirmation({ type: "delete-supplier-category", rule })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </RuleTable>
            </TabsContent>

            <TabsContent value="product" className="space-y-4 pt-4">
              <div className="rounded-md border p-4">
                <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_auto] md:items-end">
                  <div className="relative space-y-2">
                    <Label>Product</Label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={selectedProduct ? productPickerLabel(selectedProduct) : productQuery}
                        onChange={(event) => {
                          if (event.target.value.trim().length < 2) setProductOptions([]);
                          setSelectedProduct(null);
                          setProductQuery(event.target.value);
                        }}
                        placeholder="Search product name, code, or barcode"
                        className="pl-8"
                      />
                    </div>
                    {(productLoading || productOptions.length > 0) && !selectedProduct ? (
                      <div
                        className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 shadow-md"
                        onWheel={scrollDropdownWithWheel}
                      >
                        {productLoading ? (
                          <div className="p-3 text-sm text-muted-foreground">Searching...</div>
                        ) : productOptions.map((product) => (
                          <button
                            key={product.productId}
                            type="button"
                            className="flex w-full flex-col rounded-sm px-3 py-2 text-left text-sm hover:bg-muted"
                            onClick={() => {
                              setSelectedProduct(product);
                              setProductQuery(productPickerLabel(product));
                              setProductOptions([]);
                            }}
                          >
                            <span className="font-medium">{product.productName}</span>
                            <span className="text-xs text-muted-foreground">
                              {product.productCode || "No code"} | {product.barcode || "No barcode"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {product.categoryName || "No category"} | Applies to child/UOM variants
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {selectedProduct ? (
                      <div className="text-xs text-muted-foreground">
                        Applies to child and UOM variants automatically.
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    <Label>Discount Type</Label>
                    <ConfigSearchableSelect
                      value={productDiscountId}
                      onValueChange={setProductDiscountId}
                      options={discountOptions.filter((item) => item.value !== noneValue)}
                      placeholder="Select discount"
                    />
                  </div>
                  <Button disabled={saving || !canSaveProduct} onClick={confirmProductRule}>
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                    {matchingProductRule ? "Update" : "Add"}
                  </Button>
                </div>
              </div>

              <RuleTable
                loading={loading}
                emptyText="No product rules yet."
                headers={["Product", "Category", "Discount", "Action"]}
              >
                {productRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <div className="font-medium">{productRuleLabel(rule)}</div>
                      <div className="text-xs text-muted-foreground">
                        {rule.productCode || "No code"} | {rule.barcode || "No barcode"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Applies to child/UOM variants
                      </div>
                    </TableCell>
                    <TableCell>{rule.categoryName || "No category"}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline" className="w-fit">{discountText(rule.discount)}</Badge>
                        {rule.unitPrice === null ? null : (
                          <span className="text-xs text-muted-foreground">
                            Unit price override: {Number(rule.unitPrice).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={saving}
                        onClick={() => setPendingConfirmation({ type: "delete-product", rule })}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </RuleTable>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
      <AlertDialog open={pendingConfirmation !== null} onOpenChange={(nextOpen) => { if (!nextOpen) setPendingConfirmation(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmationCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmationCopy.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              variant={confirmationCopy.destructive ? "destructive" : "default"}
              onClick={(event) => {
                event.preventDefault();
                void runPendingConfirmation();
              }}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {confirmationCopy.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

/**
 * Local searchable select with explicit wheel handling for sheet dropdowns.
 */
function ConfigSearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select option...",
  disabled = false,
  className,
}: {
  options: SelectOption[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = useMemo(() => {
    return options.find((option) => option.value === value)?.label;
  }, [options, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", !value && "text-muted-foreground", className)}
          disabled={disabled}
        >
          <span className="truncate">{selectedLabel || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={`Search ${placeholder.toLowerCase()}...`} />
          <CommandList
            className="max-h-64 overflow-y-auto overscroll-contain"
            onWheel={scrollDropdownWithWheel}
          >
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Shared rule table wrapper for supplier/category and product discount tabs.
 */
function RuleTable({
  loading,
  emptyText,
  headers,
  children,
}: {
  loading: boolean;
  emptyText: string;
  headers: [string, string, string, string];
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;

  return (
    <div className="overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{headers[0]}</TableHead>
            <TableHead>{headers[1]}</TableHead>
            <TableHead>{headers[2]}</TableHead>
            <TableHead className="text-right">{headers[3]}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="ml-auto h-8 w-8" /></TableCell>
              </TableRow>
            ))
          ) : hasChildren ? (
            children
          ) : (
            <TableRow>
              <TableCell colSpan={4} className="h-24 text-center text-sm text-muted-foreground">
                {emptyText}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
