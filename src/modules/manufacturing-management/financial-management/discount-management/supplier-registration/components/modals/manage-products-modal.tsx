"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PackageOpen, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useDiscountTypes } from "../../hooks/useDiscountTypes";
import { useSupplierProducts } from "../../hooks/useSupplierProduct";
import { ProductListItem } from "../product-list-item";
import { AddProductsModal } from "./add-products-modal";

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
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { products, isLoading, addProductsBulk, updateDiscount, removeProduct } =
    useSupplierProducts(supplierId);
  const { discountTypes } = useDiscountTypes();

  // Filter products based on search query
  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const query = searchQuery.toLowerCase();
    return products.filter(
      (p) =>
        (p.product_name?.toLowerCase() ?? "").includes(query) ||
        (p.product_code?.toLowerCase() ?? "").includes(query),
    );
  }, [products, searchQuery]);

  // Get list of assigned product IDs for filtering in AddProductsModal
  const assignedProductIds = useMemo(
    () =>
      products
        .map((p) =>
          Number(
            p.product_id || (p as { id?: number; product_id?: number }).id,
          ),
        )
        .filter((id) => !isNaN(id)),
    [products],
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[800px] max-h-[80vh] gap-0 p-0 flex flex-col" showCloseButton={false}>
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b shrink-0">
            <DialogTitle>Manage Products</DialogTitle>
            <DialogDescription className="mt-0.5">
              {supplierName}
            </DialogDescription>

            {/* Search bar */}
            {!isLoading && products.length > 0 && (
              <div className="relative mt-4">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search assigned products..."
                  className="pl-9 h-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            )}
          </DialogHeader>

          {/* Column headers */}
          {!isLoading && filteredProducts.length > 0 && (
            <div className="grid grid-cols-[1fr_200px_40px] gap-4 px-6 py-2 border-b bg-muted/30 shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Product Details
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Applied Discount
              </span>
              <span />
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="grid grid-cols-[1fr_200px_40px] gap-4 px-2 py-3 items-center"
                  >
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-8" />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <PackageOpen className="h-8 w-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  No products assigned yet.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click &ldquo;Add Product&rdquo; to get started.
                </p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-16 text-center">
                <Search className="h-8 w-8 text-muted-foreground/30 mb-3" />
                <p className="text-sm font-medium text-muted-foreground">
                  No products match your search.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {filteredProducts.map((product) => (
                  <ProductListItem
                    key={product.id}
                    product={product}
                    discountTypes={discountTypes}
                    onDiscountChange={updateDiscount}
                    onRemove={removeProduct}
                  />
                ))}
              </div>
            )}
          </div>

          <DialogFooter className="px-6 py-4 border-t bg-muted/10">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => setAddModalOpen(true)} disabled={isLoading}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Product
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddProductsModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAddProducts={addProductsBulk}
        assignedProductIds={assignedProductIds}
      />
    </>
  );
}
