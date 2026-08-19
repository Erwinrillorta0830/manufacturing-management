"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import imageCompression from "browser-image-compression";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  assetFormSchema,
  AssetFormValues,
  AssetTableData,
  Department,
  ItemClassification,
  ItemType,
  User,
} from "@/modules/manufacturing-management/asset-management/types";
import { Loader2, UploadCloud, X } from "lucide-react";
import { assetService } from "../../services/assetService";
import { cn, getAssetImageUrl } from "../../utils/lib";
import {
  AssetSearchableSelect,
  AssetCreatableSelect,
  AssetDateTimePicker,
} from "../ui-selects";

interface EditAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: AssetTableData | null;
  onSuccess?: () => void;
  onLocalUpdate: (updated: Partial<AssetTableData> & { id: number }) => void;
}

export default function EditAssetModal({
  asset,
  isOpen,
  onClose,
  onLocalUpdate,
}: EditAssetModalProps) {
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [types, setTypes] = useState<ItemType[]>([]);
  const [classifications, setClassifications] = useState<ItemClassification[]>(
    [],
  );

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);


  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      item_name: "",
      item_type: "",
      item_classification: "",
      barcode: "",
      rfid_code: "",
      condition: "Good",
      quantity: 1,
      cost_per_item: 0,
      life_span: 1,
      date_acquired: new Date(),
      department: 0,
      employee: null,
      item_image: null,
      serial: "",
      is_active_warning: 0,
    },
  });

  // Sync Form with Asset Data
  useEffect(() => {
    if (asset && isOpen) {
      form.reset({
        item_name: asset.item_name,
        item_type: asset.item_type_name || "",
        item_classification: asset.classification_name || "",
        barcode: asset.barcode || "",
        rfid_code: asset.rfid_code || "",
        condition: asset.condition,
        quantity: 1, // Fixed to 1
        cost_per_item: asset.cost_per_item,
        life_span: asset.life_span,
        date_acquired: new Date(asset.date_acquired),
        department: asset.department || 0,
        employee: asset.employee,
        item_image: asset.item_image,
        serial: asset.serial || "",
        is_active_warning: asset.is_active_warning || 0,
      });

      setPreviewUrl(getAssetImageUrl(asset.item_image));
    }
  }, [asset, isOpen, form]);

  // Fetch Options
  useEffect(() => {
    if (isOpen) {
      const fetchData = async () => {
        try {
          const [depData, userData, typeData, classData] = await Promise.all([
            assetService.getDepartments(),
            assetService.getUsers(),
            assetService.getItemTypes(),
            assetService.getItemClassifications(),
          ]);

          setDepartments(depData);
          setUsers(userData);
          setTypes(typeData);
          setClassifications(classData);
        } catch {
          toast.error("Failed to load options");
        }
      };
      fetchData();
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const uploadToDirectus = async (file: File) => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
    };
    const compressedFile = await imageCompression(file, options);
    const formData = new FormData();
    formData.append("file", compressedFile);

    const res = await fetch("/api/manufacturing/asset-management/asset-image-upload", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error("Upload failed");
    const result = await res.json();
    return result?.data?.id;
  };

  const onSubmit = async (values: AssetFormValues) => {
    if (!asset) return;
    setLoading(true);
    try {
      let finalImageValue = asset.item_image;

      if (selectedFile) {
        finalImageValue = await uploadToDirectus(selectedFile);
      } else if (previewUrl === null) {
        finalImageValue = null;
      }

      await assetService.updateAsset(
        asset.id,
        asset.item_id,
        values,
        finalImageValue,
      );

      const selectedDepartment = departments.find(
        (d) => d.department_id === values.department,
      );
      const selectedEmployee = users.find((u) => u.user_id === values.employee);
      const d = values.date_acquired ? new Date(values.date_acquired) : new Date();
      const isoDateStr = d.toISOString();

      // 👇 Build the locally-patched version of the row from form values
      // This mirrors exactly what fetchAssets would return for this row
      const updatedFields: Partial<AssetTableData> & { id: number } = {
        id: asset.id,
        item_name: values.item_name,
        item_type_name: values.item_type,
        classification_name: values.item_classification,
        condition: values.condition,
        cost_per_item: values.cost_per_item,
        quantity: values.quantity,
        total: (Number(values.cost_per_item) || 0) * (Number(values.quantity) || 1),
        life_span: values.life_span,
        date_acquired: isoDateStr,
        department: values.department,
        department_name:
          selectedDepartment?.department_name ?? asset.department_name,
        employee: values.employee,
        assigned_to_name: selectedEmployee
          ? `${selectedEmployee.user_fname} ${selectedEmployee.user_lname}`.trim()
          : "Unassigned",
        item_image: finalImageValue,
        barcode: values.barcode ?? null,
        rfid_code: values.rfid_code ?? null,
        serial: values.serial ?? null,
        is_active_warning: values.is_active_warning,
      };

      onLocalUpdate(updatedFields); // 👈 patch just this row, no refetch
      toast.success("Asset updated successfully!");
      onClose();

      // NOTE: onSuccess (full refetch) is intentionally NOT called here anymore.
      // It's kept in the props as a fallback you can call manually if ever needed.

      // toast.success("Asset updated successfully!");
      // onClose();
      // onSuccess();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update asset");
    } finally {
      setLoading(false);
    }
  };

  if (!asset) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] md:max-w-4xl lg:max-w-5xl max-h-[95vh] overflow-y-auto p-0 rounded-2xl">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle>Edit Asset: {asset.item_name}</DialogTitle>
          <DialogDescription>
            Modify asset identifiers and assignments. Values are handled in PHP.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="px-6 pb-8 space-y-6"
          >
            {/* IMAGE SECTION */}
            <div className="space-y-4">
              <Separator />
              <div
                className={cn(
                  "border border-dashed rounded-lg p-4 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer bg-muted/50",
                  previewUrl ? "border-primary/50" : "border-muted",
                )}
                onClick={() =>
                  document.getElementById("edit-image-upload")?.click()
                }
              >
                {previewUrl ? (
                  <div className="relative w-full aspect-video max-h-48 overflow-hidden rounded-md">
                    <Image
                      src={previewUrl}
                      alt="Preview"
                      width={400}
                      height={200}
                      className="object-contain"
                      unoptimized
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewUrl(null);
                        setSelectedFile(null);
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="p-4">
                      <UploadCloud className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PNG, JPG or WebP (max. 2MB)
                      </p>
                    </div>
                  </>
                )}
                <input
                  id="edit-image-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            {/* SECTION 1: GENERAL INFO */}
            <div className="space-y-4">
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="item_name"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel>Item Name *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Asset item name"
                          className="h-10"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Item Type */}
                <FormField
                  control={form.control}
                  name="item_type"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Item Type *</FormLabel>
                      <FormControl>
                        <AssetCreatableSelect
                          options={Array.from(
                            new Map(
                              types.map((t) => [
                                t.type_name.toLowerCase(),
                                { value: t.type_name, label: t.type_name },
                              ])
                            ).values()
                          )}
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder="Select or type item type..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Classification */}
                <FormField
                  control={form.control}
                  name="item_classification"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Classification *</FormLabel>
                      <FormControl>
                        <AssetCreatableSelect
                          options={Array.from(
                            new Map(
                              classifications.map((c) => [
                                c.classification_name.toLowerCase(),
                                {
                                  value: c.classification_name,
                                  label: c.classification_name,
                                },
                              ])
                            ).values()
                          )}
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder="Select or type classification..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* SECTION 2: TRACKING & ASSIGNMENT */}
            <div className="space-y-4">
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="barcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Barcode</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Optional"
                          className="h-10"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rfid_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RFID Code</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Optional"
                          className="h-10"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="serial"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Serial Number</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          placeholder="Optional"
                          className="h-10"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="is_active_warning"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Security Tag</FormLabel>
                      <Select
                        onValueChange={(val: string) =>
                          field.onChange(Number(val))
                        }
                        value={field.value?.toString() ?? "0"}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="Select Status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">Activated</SelectItem>
                          <SelectItem value="0">Deactivated</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Department */}
                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem className="flex flex-col flex-1">
                      <FormLabel>Department *</FormLabel>
                      <FormControl>
                        <AssetSearchableSelect
                          options={departments.map((d) => ({
                            value: d.department_id.toString(),
                            label: d.department_name,
                          }))}
                          value={
                            field.value && field.value > 0
                              ? field.value.toString()
                              : ""
                          }
                          onValueChange={(val) =>
                            field.onChange(val ? parseInt(val) : 0)
                          }
                          placeholder="Select department..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Employee */}
                <FormField
                  control={form.control}
                  name="employee"
                  render={({ field }) => (
                    <FormItem className="flex flex-col flex-1">
                      <FormLabel>Assigned To</FormLabel>
                      <FormControl>
                        <AssetSearchableSelect
                          options={users.map((u) => ({
                            value: u.user_id.toString(),
                            label:
                              `${u.user_fname || ""} ${u.user_lname || ""}`.trim() ||
                              `User #${u.user_id}`,
                          }))}
                          value={field.value ? field.value.toString() : ""}
                          onValueChange={(val) =>
                            field.onChange(val ? parseInt(val) : null)
                          }
                          placeholder="Select employee..."
                          allowClear={true}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Date Acquired */}
                <FormField
                  control={form.control}
                  name="date_acquired"
                  render={({ field }) => (
                    <FormItem className="flex flex-col flex-1">
                      <FormLabel>Date Acquired</FormLabel>
                      <FormControl>
                        <AssetDateTimePicker
                          value={field.value}
                          onValueChange={field.onChange}
                          placeholder="Pick date & time..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* SECTION 3: FINANCIALS & CONDITION */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 items-start">
                <FormField
                  control={form.control}
                  name="cost_per_item"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cost (PHP)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={field.value === 0 ? "" : (field.value ?? "")}
                          className="h-10"
                          onChange={(e) => {
                            const val = e.target.value;
                            field.onChange(val === "" ? 0 : parseFloat(val) || 0);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Qty</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          disabled
                          className="h-10 bg-muted"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="life_span"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Life (Yrs)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Years"
                          value={field.value === 0 ? "" : (field.value ?? "")}
                          className="h-10"
                          onChange={(e) => {
                            const val = e.target.value;
                            field.onChange(val === "" ? 0 : parseInt(val) || 0);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="condition"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Condition</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Good">Good</SelectItem>
                          <SelectItem value="Bad">Bad</SelectItem>
                          <SelectItem value="Under Maintenance">
                            Maintenance
                          </SelectItem>
                          <SelectItem value="Discontinued">
                            Discontinued
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update Asset
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
