"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AddSupplierForm } from "../forms/add-supplier-form";

interface AddSupplierModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddSupplierModal({
  open,
  onClose,
  onSuccess,
}: AddSupplierModalProps) {
  const handleSuccess = () => {
    onSuccess();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            Add New Supplier
          </DialogTitle>
          <DialogDescription className="mt-1">
            Create a new supplier record. Fields marked with * are required.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <AddSupplierForm onSuccess={handleSuccess} onCancel={onClose} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
