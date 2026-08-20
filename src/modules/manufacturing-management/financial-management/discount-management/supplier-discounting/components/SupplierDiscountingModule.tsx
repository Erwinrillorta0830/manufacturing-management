// src/modules/financial-management/accounting/discount-management/supplier-discounting/components/SupplierDiscountingModule.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FilterX, Loader2, PackageSearch, Percent, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useSupplierDiscounting } from "../hooks/useSupplierDiscounting";
import { supplierDiscountingApi } from "../providers/supplierDiscountingApi";
import type {
  SupplierDiscountModuleData,
  SupplierDiscountFilterState,
  SupplierDiscountOption,
  SupplierDiscountProduct,
} from "../types";

const PRODUCT_PAGE_SIZE = 10;
const DISCOUNT_FILTER_ALL = "all";

type SupplierDiscountingModuleProps = {
  initialModuleData: SupplierDiscountModuleData;
  metadataError?: string | null;
};

/**
 * Formats nullable currency values without showing misleading zeroes.
 */
function money(value: number | null) {
  if (value === null) return "Not set";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Keeps select values serializable while preserving null as the empty option.
 */
function numberValue(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function discountText(discount: SupplierDiscountOption | null) {
  if (!discount) return "No discount";
  return `${discount.discountType} (${discount.totalPercent.toFixed(2)}%)`;
}

function discountFilterQuery(value: string): {
  discountState: SupplierDiscountFilterState;
  discountTypeId: number | null;
} {
  if (value === "none" || value === "any") {
    return { discountState: value, discountTypeId: null };
  }

  if (value.startsWith("type:")) {
    const discountTypeId = numberValue(value.replace("type:", ""));
    return discountTypeId
      ? { discountState: "specific", discountTypeId }
      : { discountState: "all", discountTypeId: null };
  }

  return { discountState: "all", discountTypeId: null };
}

function ProductIdentity({ product }: { product: SupplierDiscountProduct }) {
  return (
    <div className="min-w-0">
      <div className="whitespace-normal break-words font-medium">{product.productName}</div>
      <div className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
        {product.productCode ? <span>{product.productCode}</span> : null}
        {product.barcode ? <span>{product.barcode}</span> : null}
      </div>
    </div>
  );
}

/**
 * Renders the supplier discounting workspace for product selection and rule maintenance.
 */
export default function SupplierDiscountingModule({
  initialModuleData,
  metadataError,
}: SupplierDiscountingModuleProps) {
  const {
    moduleData,
    selectedSupplier,
    productPage,
    selectedProductIds,
    productsLoading,
    productError,
    setProductError,
    moduleDataLoading,
    saving,
    loadProducts,
    selectSupplier,
    toggleProduct,
    setSelectedProductIds,
    applyBulkDiscount,
    deleteRule,
    refreshModuleData,
  } = useSupplierDiscounting(initialModuleData);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [brandId, setBrandId] = useState<number | null>(null);
  const [currentDiscountFilter, setCurrentDiscountFilter] = useState(DISCOUNT_FILTER_ALL);
  const [discountTypeId, setDiscountTypeId] = useState<number | null>(null);
  const [metadataMessage, setMetadataMessage] = useState(metadataError ?? null);
  const [page, setPage] = useState(1);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [preflighting, setPreflighting] = useState(false);
  const [pendingApplyId, setPendingApplyId] = useState<number | null>(null);
  const [pendingApplyNewCount, setPendingApplyNewCount] = useState(0);
  const selectedSupplierId = selectedSupplier?.id ?? null;
  const supplierFiltersReady = !selectedSupplierId || productPage.filterOptions.supplierId === selectedSupplierId;
  const categoryOptions = useMemo(() => {
    if (!selectedSupplierId) return moduleData.categories;
    return supplierFiltersReady ? productPage.filterOptions.categories : [];
  }, [moduleData.categories, productPage.filterOptions.categories, selectedSupplierId, supplierFiltersReady]);
  const brandOptions = useMemo(() => {
    if (!selectedSupplierId) return moduleData.brands;
    return supplierFiltersReady ? productPage.filterOptions.brands : [];
  }, [moduleData.brands, productPage.filterOptions.brands, selectedSupplierId, supplierFiltersReady]);
  const currentDiscountQuery = useMemo(
    () => selectedSupplierId
      ? discountFilterQuery(currentDiscountFilter)
      : { discountState: "all" as SupplierDiscountFilterState, discountTypeId: null },
    [currentDiscountFilter, selectedSupplierId],
  );
  const loadCurrentProducts = useCallback(() => loadProducts({
    page,
    pageSize: PRODUCT_PAGE_SIZE,
    search,
    categoryId,
    brandId,
    supplierId: selectedSupplierId,
    discountState: currentDiscountQuery.discountState,
    discountTypeId: currentDiscountQuery.discountTypeId,
  }), [
    brandId,
    categoryId,
    currentDiscountQuery.discountState,
    currentDiscountQuery.discountTypeId,
    loadProducts,
    page,
    search,
    selectedSupplierId,
  ]);
  const pendingDeleteProduct = useMemo(
    () => (pendingDeleteId ? productPage.products.find((product) => product.ruleId === pendingDeleteId) ?? null : null),
    [pendingDeleteId, productPage.products],
  );

  const visibleProductIds = useMemo(
    () => productPage.products.map((product) => product.productId),
    [productPage.products],
  );
  const allVisibleSelected = visibleProductIds.length > 0
    && visibleProductIds.every((productId) => selectedProductIds.includes(productId));
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadCurrentProducts();
    }, 250);

    return () => window.clearTimeout(timer);
  }, [loadCurrentProducts]);

  useEffect(() => {
    if (!selectedSupplierId || !supplierFiltersReady) return;

    if (categoryId && !categoryOptions.some((category) => category.categoryId === categoryId)) {
      setCategoryId(null);
      setPage(1);
    }

    if (brandId && !brandOptions.some((brand) => brand.brandId === brandId)) {
      setBrandId(null);
      setPage(1);
    }
  }, [brandId, brandOptions, categoryId, categoryOptions, selectedSupplierId, supplierFiltersReady]);

  useEffect(() => {
    setMetadataMessage(metadataError ?? null);
  }, [metadataError]);

  /**
   * Selects or clears every product visible on the current product page.
   */
  function toggleCurrentPage(checked: boolean) {
    setSelectedProductIds((current) => {
      if (checked) return Array.from(new Set([...current, ...visibleProductIds]));
      return current.filter((productId) => !visibleProductIds.includes(productId));
    });
  }

  function resetFilters() {
    setSearch("");
    setCategoryId(null);
    setBrandId(null);
    setCurrentDiscountFilter(DISCOUNT_FILTER_ALL);
    setDiscountTypeId(null);
    selectSupplier(null);
    setSelectedProductIds([]);
    setPage(1);
  }

  async function handleApplyBulkDiscount() {
    if (!selectedSupplier) { toast.error("Select a supplier first"); return; }
    if (!discountTypeId) { toast.error("Select a discount first"); return; }
    if (selectedProductIds.length === 0) { toast.error("Select at least one parent product"); return; }
    if (preflighting) return;

    setPreflighting(true);
    try {
      const preflight = await supplierDiscountingApi.preflightRules({
        supplierId: selectedSupplier.id,
        productIds: selectedProductIds,
      });
      setPendingApplyNewCount(preflight.newLinks.length);
      setPendingApplyId(discountTypeId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to inspect existing supplier discounts");
    } finally {
      setPreflighting(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-3 sm:p-4 lg:p-6">
      <section className="flex flex-col gap-3 rounded-md border bg-background p-4 shadow-sm">
        {metadataMessage ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <span>{metadataMessage}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={moduleDataLoading}
              onClick={async () => {
                const loaded = await refreshModuleData();
                if (loaded) setMetadataMessage(null);
              }}
            >
              {moduleDataLoading ? <Loader2 className="size-3 animate-spin" /> : null}
              Retry
            </Button>
          </div>
        ) : null}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-normal">Supplier Discounting</h1>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Manage item-level supplier discounts for parent products and apply bulk updates by category or brand.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{moduleData.suppliers.length} trade suppliers</Badge>
            <Badge variant="outline">{moduleData.discountTypes.length} discounts</Badge>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_auto]">
          <div className="grid gap-1.5 text-sm">
            <span className="font-medium">Supplier</span>
            <SearchableSelect
              className="w-full"
              value={selectedSupplier?.id ? String(selectedSupplier.id) : ""}
              onValueChange={(value) => {
                setCurrentDiscountFilter(DISCOUNT_FILTER_ALL);
                setDiscountTypeId(null);
                setPage(1);
                selectSupplier(numberValue(value));
              }}
              options={[
                { value: "", label: "Select supplier" },
                ...moduleData.suppliers.map((supplier) => ({
                  value: String(supplier.id),
                  label: supplier.supplierName,
                })),
              ]}
              placeholder="Select supplier"
            />
          </div>

          <div className="grid gap-1.5 text-sm">
            <span className="font-medium">Category</span>
            <SearchableSelect
              className="w-full"
              disabled={saving || !supplierFiltersReady}
              value={categoryId ? String(categoryId) : ""}
              onValueChange={(value) => {
                setCategoryId(numberValue(value));
                setSelectedProductIds([]);
                setPage(1);
              }}
              options={[
                { value: "", label: "All categories" },
                ...categoryOptions.map((category) => ({
                  value: String(category.categoryId),
                  label: category.categoryName,
                })),
              ]}
              placeholder="All categories"
            />
          </div>

          <div className="grid gap-1.5 text-sm">
            <span className="font-medium">Brand</span>
            <SearchableSelect
              className="w-full"
              disabled={saving || !supplierFiltersReady}
              value={brandId ? String(brandId) : ""}
              onValueChange={(value) => {
                setBrandId(numberValue(value));
                setSelectedProductIds([]);
                setPage(1);
              }}
              options={[
                { value: "", label: "All brands" },
                ...brandOptions.map((brand) => ({
                  value: String(brand.brandId),
                  label: brand.brandName,
                })),
              ]}
              placeholder="All brands"
            />
          </div>

          <div className="grid gap-1.5 text-sm">
            <span className="font-medium">Current Discount</span>
            <SearchableSelect
              className="w-full"
              disabled={saving || !selectedSupplierId}
              value={currentDiscountFilter}
              onValueChange={(value) => {
                setCurrentDiscountFilter(value || DISCOUNT_FILTER_ALL);
                setSelectedProductIds([]);
                setPage(1);
              }}
              options={[
                { value: DISCOUNT_FILTER_ALL, label: "All discounts" },
                { value: "none", label: "No discount" },
                { value: "any", label: "Any discount" },
                ...moduleData.discountTypes.map((discount) => ({
                  value: `type:${discount.id}`,
                  label: discountText(discount),
                })),
              ]}
              placeholder="All discounts"
            />
          </div>

          <div className="grid gap-1.5 text-sm">
            <span className="font-medium">Apply Discount</span>
            <SearchableSelect
              className="w-full"
              disabled={saving || preflighting}
              value={discountTypeId ? String(discountTypeId) : ""}
              onValueChange={(value) => setDiscountTypeId(numberValue(value))}
              options={[
                { value: "", label: "Select discount" },
                ...moduleData.discountTypes.map((discount) => ({
                  value: String(discount.id),
                  label: discountText(discount),
                })),
              ]}
              placeholder="Select discount"
            />
          </div>

          <div className="flex items-end gap-2">
            <Button
              type="button"
              className="w-full xl:w-auto"
              disabled={saving || preflighting || selectedProductIds.length === 0 || !discountTypeId}
              title={
                selectedProductIds.length === 0
                  ? "Select at least one product to apply a discount"
                  : !discountTypeId
                    ? "Select a discount type first"
                    : undefined
              }
              onClick={() => void handleApplyBulkDiscount()}
            >
              {saving || preflighting ? <Loader2 className="animate-spin" /> : <Percent />}
              {preflighting ? "Checking..." : "Apply"}
            </Button>
            <Button type="button" variant="outline" size="icon" disabled={saving} onClick={resetFilters} aria-label="Reset filters">
              <FilterX />
            </Button>
          </div>
        </div>
      </section>

      <section>
        <Card className="overflow-hidden rounded-md">
          <CardHeader className="gap-3 border-b">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PackageSearch className="size-4" />
                  Supplier Products
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Review and manage parent-product discounts for the selected supplier.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => void loadCurrentProducts()}
              >
                <RefreshCw />
                Refresh
              </Button>
            </div>
              <Input
                value={search}
                disabled={saving}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSelectedProductIds([]);
                  setPage(1);
                }}
                placeholder="Search product name, code, or barcode"
                aria-label="Search parent products"
              />
          </CardHeader>
          <CardContent className="p-0">
            {productError ? (
              <div className="flex items-center justify-between gap-3 border-b px-3 py-2 text-sm text-destructive">
                <span>{productError}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={productsLoading}
                  onClick={() => {
                    setProductError(null);
                    void loadCurrentProducts();
                  }}
                >
                  {productsLoading ? <Loader2 className="size-3 animate-spin" /> : null}
                  Retry
                </Button>
              </div>
            ) : null}
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allVisibleSelected}
                      disabled={visibleProductIds.length === 0 || saving}
                      onCheckedChange={(checked) => toggleCurrentPage(checked === true)}
                      aria-label="Select all products on this page"
                    />
                  </TableHead>
                  <TableHead className="w-[28%]">Product</TableHead>
                  <TableHead className="w-[16%]">Category</TableHead>
                  <TableHead className="w-[15%]">Brand</TableHead>
                  <TableHead className="w-[20%]">Discount</TableHead>
                  <TableHead className="w-[12%] text-right">Cost</TableHead>
                  <TableHead className="w-[9%] text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productsLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                      Loading parent products...
                    </TableCell>
                  </TableRow>
                ) : productPage.products.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-28 text-center text-muted-foreground">
                      {productPage.emptyStateMessage ?? "No parent products found."}
                    </TableCell>
                  </TableRow>
                ) : productPage.products.map((product) => (
                  <TableRow
                    key={product.productId}
                    data-state={selectedProductIds.includes(product.productId) ? "selected" : undefined}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedProductIds.includes(product.productId)}
                        disabled={saving}
                        onCheckedChange={(checked) => toggleProduct(product.productId, checked === true)}
                        aria-label={`Select ${product.productName}`}
                      />
                    </TableCell>
                    <TableCell className="min-w-0 whitespace-normal">
                      <ProductIdentity product={product} />
                    </TableCell>
                    <TableCell className="whitespace-normal break-words">{product.categoryName || "Uncategorized"}</TableCell>
                    <TableCell className="whitespace-normal break-words">{product.brandName || "No brand"}</TableCell>
                    <TableCell className="whitespace-normal">
                      <Badge variant="outline" className="max-w-full whitespace-normal text-left">
                        {discountText(product.discount)}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-normal text-right tabular-nums">{money(product.costPerUnit)}</TableCell>
                    <TableCell className="text-right">
                      {product.ruleId && product.discount ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          disabled={saving}
                          onClick={() => setPendingDeleteId(product.ruleId)}
                          aria-label={`Clear ${product.productName} supplier discount`}
                        >
                          <Trash2 />
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-col gap-3 border-t p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedProductIds.length} selected - {productPage.pagination.total} matching parent products
              </p>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      aria-disabled={page <= 1 || saving}
                      aria-label={page <= 1 ? "No previous page" : "Previous page"}
                      className={cn((page <= 1 || saving) && "pointer-events-none opacity-50")}
                      onClick={(event) => {
                        event.preventDefault();
                        if (!saving) setPage((current) => Math.max(1, current - 1));
                      }}
                    />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-3 text-sm tabular-nums text-muted-foreground">
                      {productPage.pagination.page} / {productPage.pagination.totalPages}
                    </span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext
                      aria-disabled={page >= productPage.pagination.totalPages || saving}
                      aria-label={page >= productPage.pagination.totalPages ? "No next page" : "Next page"}
                      className={cn((page >= productPage.pagination.totalPages || saving) && "pointer-events-none opacity-50")}
                      onClick={(event) => {
                        event.preventDefault();
                        if (!saving) setPage((current) => Math.min(productPage.pagination.totalPages, current + 1));
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          </CardContent>
        </Card>

      </section>

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => { if (!open) setPendingDeleteId(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove supplier discount</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear the discount for &ldquo;{pendingDeleteProduct?.productName ?? "this product"}&rdquo;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={saving}
              onClick={async () => {
                const id = pendingDeleteId;
                setPendingDeleteId(null);
                if (!id) return;

                const cleared = await deleteRule(id);
                if (cleared) {
                  void loadCurrentProducts();
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingApplyId !== null} onOpenChange={(open) => { if (!open && !saving) setPendingApplyId(null); }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Apply supplier discount</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingApplyNewCount > 0
                ? `${pendingApplyNewCount} new rule${pendingApplyNewCount !== 1 ? "s" : ""} will be created`
                : null}
              {pendingApplyNewCount > 0 && selectedProductIds.length - pendingApplyNewCount > 0 ? " and " : null}
              {selectedProductIds.length - pendingApplyNewCount > 0
                ? `${selectedProductIds.length - pendingApplyNewCount} existing rule${selectedProductIds.length - pendingApplyNewCount !== 1 ? "s" : ""} will be updated`
                : null}
              . Do you want to proceed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              disabled={saving}
              onClick={async (event) => {
                event.preventDefault();
                const id = pendingApplyId;
                if (id == null) return;
                const saved = await applyBulkDiscount(id);
                if (saved) setDiscountTypeId(null);
                void loadCurrentProducts();
                setPendingApplyId(null);
              }}
            >
              {saving ? <>Saving<Loader2 className="ml-1 size-3 animate-spin" /></> : "Proceed"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
