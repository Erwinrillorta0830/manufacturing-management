"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FilterX, Loader2, PackageOpen, Save, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useDiscountTypes } from "../../hooks/useDiscountTypes";
import { useSupplierProducts } from "../../hooks/useSupplierProduct";
import { ProductPerSupplierWithDetails } from "../../types/product-per-suppplier.schema";
import { ProductListItem } from "../product-list-item";

interface ManageProductsModalProps {
  supplierId: number | null;
  supplierName: string;
  open: boolean;
  onClose: () => void;
}

export function ManageProductsModal({
  supplierId,
  supplierName,
  open,
  onClose,
}: ManageProductsModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const { products, isLoading, updateDiscount, removeProduct, refresh } =
    useSupplierProducts(supplierId);
  const { discountTypes } = useDiscountTypes();

  // Local working copy for staging changes before saving
  const [localProducts, setLocalProducts] = useState<
    ProductPerSupplierWithDetails[]
  >([]);
  const [pendingRemovals, setPendingRemovals] = useState<number[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Synchronize local products state when fetched products change or modal opens
  useEffect(() => {
    if (open) {
      setLocalProducts(products);
      setPendingRemovals([]);
    }
  }, [products, open]);

  // Handle local discount change
  const handleLocalDiscountChange = (
    productPerSupplierId: number,
    discountTypeId: number | null,
  ) => {
    setLocalProducts((prev) =>
      prev.map((item) =>
        item.id === productPerSupplierId
          ? { ...item, discount_type: discountTypeId }
          : item,
      ),
    );
  };

  // Handle local removal
  const handleLocalRemove = (productPerSupplierId: number) => {
    setPendingRemovals((prev) => [...prev, productPerSupplierId]);
  };

  // Remaining products after pending removals
  const activeProducts = useMemo(() => {
    return localProducts.filter((p) => !pendingRemovals.includes(p.id));
  }, [localProducts, pendingRemovals]);

  // Filter products based on search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return activeProducts;
    const query = searchQuery.toLowerCase();
    return activeProducts.filter(
      (p) =>
        (p.product_name?.toLowerCase() ?? "").includes(query) ||
        (p.product_code?.toLowerCase() ?? "").includes(query),
    );
  }, [activeProducts, searchQuery]);

  // Check if there are uncommitted changes
  const hasPendingChanges = useMemo(() => {
    if (pendingRemovals.length > 0) return true;
    return localProducts.some((local) => {
      const original = products.find((p) => p.id === local.id);
      return original && original.discount_type !== local.discount_type;
    });
  }, [localProducts, products, pendingRemovals]);

  // Execute batch save operation
  const handleSave = async () => {
    if (isSaving || !hasPendingChanges) return;
    setIsSaving(true);

    try {
      // 1. Process removals
      for (const removeId of pendingRemovals) {
        await removeProduct(removeId);
      }

      // 2. Process discount updates
      const modifiedProducts = localProducts.filter((local) => {
        if (pendingRemovals.includes(local.id)) return false;
        const original = products.find((p) => p.id === local.id);
        return original && original.discount_type !== local.discount_type;
      });

      for (const item of modifiedProducts) {
        await updateDiscount(item.id, item.discount_type);
      }

      toast.success("Changes saved successfully");
      await refresh();
      onClose();
    } catch (error) {
      console.error("Error saving product discounts:", error);
      toast.error("Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  // Guard close action during saving
  const handleClose = () => {
    if (isSaving) return;
    setPendingRemovals([]);
    setLocalProducts(products);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
      <DialogContent
        className="max-w-[95vw] md:max-w-[60vw] sm:max-w-[90svw] w-full max-h-[90vh] overflow-y-auto"
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header */}
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
          <div>
            <DialogTitle className="text-xl font-bold">
              Manage Product Discounts - {supplierName}
            </DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Assign product discount rules for this supplier.
            </p>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Search Filter */}
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search assigned products..."
                className="pl-9 h-9 text-sm bg-muted/30 focus-visible:ring-primary"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isSaving}
              />
            </div>
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSearchQuery("")}
                disabled={isSaving}
                className="h-9 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
              >
                <FilterX className="h-3 w-3" /> Clear
              </Button>
            )}
          </div>

          {/* Table Container */}
          <div className="rounded-md border shadow-sm overflow-hidden bg-card">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent border-b">
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-foreground py-3 px-6">
                    Product Details
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-foreground py-3 px-6 w-[280px]">
                    Applied Discount
                  </TableHead>
                  <TableHead className="text-xs font-bold uppercase tracking-wider text-right text-foreground py-3 px-6 w-[80px]">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y min-h-[160px]">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell className="py-3 px-6">
                        <div className="space-y-1.5">
                          <Skeleton className="h-4 w-3/4" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </TableCell>
                      <TableCell className="py-3 px-6 w-[280px]">
                        <Skeleton className="h-9 w-full" />
                      </TableCell>
                      <TableCell className="py-3 px-6 w-[80px] text-right">
                        <Skeleton className="h-8 w-8 ml-auto" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : activeProducts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="h-48 text-center py-12 text-muted-foreground bg-muted/10"
                    >
                      <div className="flex flex-col items-center justify-center">
                        <PackageOpen className="h-10 w-10 opacity-20 mb-2" />
                        <p className="text-sm font-medium">
                          No products assigned to this supplier.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredProducts.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="h-48 text-center py-12 text-muted-foreground bg-muted/10"
                    >
                      <div className="flex flex-col items-center justify-center">
                        <Search className="h-10 w-10 opacity-20 mb-2" />
                        <p className="text-sm font-medium">
                          No products match your search query.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredProducts.map((product) => (
                    <ProductListItem
                      key={product.id}
                      product={product}
                      discountTypes={discountTypes}
                      disabled={isSaving}
                      onDiscountChange={handleLocalDiscountChange}
                      onRemove={handleLocalRemove}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="mt-6 pt-4 border-t gap-2 sm:gap-3">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSaving}
            className="h-9"
          >
            Close
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !hasPendingChanges}
            className="h-9 gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" /> Save
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
