"use client";

import { useState, useMemo, useCallback } from "react";
import { useSuppliers } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-discount/hooks/useSuppliers";
import { Building2 } from "lucide-react";
import { SupplierDataTable } from "./components/data-table";
import { createColumns } from "./components/data-table/columns";
import { ManageProductsModal } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-discount/components/modals/manage-products-modal";
import { Supplier } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-discount/types/supplier.schema";
import { DataTableSkeleton } from "./components/data-table/DataTableSkeleton";
import { ErrorPage } from "@/app/(manufacturing-management)/mm/_components/ErrorPage";

export default function SupplierRepresentativeModulePage() {
  const { suppliers, isLoading, error, refresh, setSearchQuery } =
    useSuppliers();
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(
    null,
  );
  const [manageDiscountOpen, setManageDiscountOpen] = useState(false);

  // Handle manage discount for supplier
  const handleManageDiscount = useCallback((supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setManageDiscountOpen(true);
  }, []);

  // Create columns with handlers
  const columns = useMemo(
    () =>
      createColumns({
        onView: handleManageDiscount,
      }),
    [handleManageDiscount],
  );

  if (isLoading && suppliers.length === 0) {
    return (
      <div className="p-4 md:p-6">
        <DataTableSkeleton />
      </div>
    );
  }

  if (error.hasError) {
    return (
      <div>
        <ErrorPage
          title="Data Connection Error"
          message={error.message}
          onRefresh={refresh}
        />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-background animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-extrabold tracking-tight">Supplier Discount</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Manage supplier-specific information and product discount configurations.
          </p>
        </div>
      </div>

      {/* Main Content & Filters */}
      <SupplierDataTable
        columns={columns}
        data={suppliers || []}
        searchPlaceholder="Search by name, TIN, or contact person..."
        onSearchChange={setSearchQuery}
        onRefresh={refresh}
        isLoading={isLoading}
      />

      {/* Manage Product Discounts Modal */}
      {selectedSupplier && (
        <ManageProductsModal
          supplierId={selectedSupplier.id ?? null}
          supplierName={selectedSupplier.supplier_name}
          open={manageDiscountOpen}
          onClose={() => {
            setManageDiscountOpen(false);
            setSelectedSupplier(null);
          }}
        />
      )}
    </div>
  );
}


