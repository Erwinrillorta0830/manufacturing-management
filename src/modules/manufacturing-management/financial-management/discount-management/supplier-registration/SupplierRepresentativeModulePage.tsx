"use client";

import { useState, useMemo, useCallback } from "react";
import { useSuppliers } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/hooks/useSuppliers";
import { SupplierDataTable } from "./components/data-table";
import { createColumns } from "./components/data-table/columns";
import { SupplierDetailsModal } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/components/modals/suppliers-detail-modal";
import { Button } from "@/components/ui/button";
import { Supplier } from "@/modules/manufacturing-management/financial-management/discount-management/supplier-registration/types/supplier.schema";
import { Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { EditSupplierModal } from "./components/modals/edit-supplier-modal";
import { DataTableSkeleton } from "@/app/(manufacturing-management)/mm/_components/DataTableSkeleton";
import { AddSupplierModal } from "./components/modals/add-supplier-modal";
import { ErrorPage } from "@/app/(manufacturing-management)/mm/_components/ErrorPage";

export default function SupplierRepresentativeModulePage() {
  const { suppliers, isLoading, error, refresh, setSearchQuery } =
    useSuppliers();
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(
    null,
  );
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  // Handle view supplier
  const handleView = useCallback((supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setViewModalOpen(true);
  }, []);

  // Handle edit supplier
  const handleEdit = useCallback((supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setEditModalOpen(true);
  }, []);

  // Handle edit success
  const handleEditSuccess = () => {
    refresh();
    toast.success("Supplier updated successfully");
  };

  // Handle add supplier success
  const handleAddSuccess = () => {
    refresh();
    toast.success("Supplier created successfully");
  };

  // Create columns with handlers
  const columns = useMemo(
    () =>
      createColumns({
        onView: handleView,
        onEdit: handleEdit,
      }),
    [handleView, handleEdit],
  );

  if (isLoading) {
    return (
      <div className="p-6">
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
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={refresh}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
          <Button onClick={() => setAddModalOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Supplier
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <SupplierDataTable
        columns={columns}
        data={suppliers || []}
        searchPlaceholder="Search by name, TIN, or contact person..."
        onSearchChange={setSearchQuery}
      />

      {/* Supplier Details Modal */}
      <SupplierDetailsModal
        supplier={selectedSupplier}
        open={viewModalOpen}
        onClose={() => {
          setViewModalOpen(false);
          setSelectedSupplier(null);
        }}
      />

      {/* Edit Supplier Modal */}
      <EditSupplierModal
        supplier={selectedSupplier}
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedSupplier(null);
        }}
        onSuccess={handleEditSuccess}
      />

      {/* Add Supplier Modal */}
      <AddSupplierModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={handleAddSuccess}
      />
    </div>
  );
}

