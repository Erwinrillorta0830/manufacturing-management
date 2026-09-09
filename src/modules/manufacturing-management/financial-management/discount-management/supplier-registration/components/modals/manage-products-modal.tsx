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
import { FilterX, PackageOpen, Plus, Search } from "lucide-react";
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
        <DialogContent
          className="max-w-[95vw] md:max-w-[60vw] sm:max-w-[90svw] w-full max-h-[90vh] overflow-y-auto"
          showCloseButton={false}
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
            <Button
              onClick={() => setAddModalOpen(true)}
              disabled={isLoading}
              className="gap-2 h-9"
            >
              <Plus className="h-4 w-4" /> Add Product
            </Button>
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
                />
              </div>
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchQuery("")}
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
                  ) : products.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-48 text-center py-12 text-muted-foreground bg-muted/10">
                        <div className="flex flex-col items-center justify-center">
                          <PackageOpen className="h-10 w-10 opacity-20 mb-2" />
                          <p className="text-sm font-medium">No products assigned yet.</p>
                          <p className="text-xs mt-1">
                            Click &ldquo;Add Product&rdquo; above to assign product discounts.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredProducts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-48 text-center py-12 text-muted-foreground bg-muted/10">
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
                        onDiscountChange={updateDiscount}
                        onRemove={removeProduct}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter className="mt-6 pt-4 border-t">
            <Button variant="outline" onClick={onClose} className="h-9">
              Close
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
