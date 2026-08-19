"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import imageCompression from "browser-image-compression";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import {
  Loader2,
  Plus,
  UploadCloud,
  X,
} from "lucide-react";
import { cn } from "../../utils/lib";

import { Button } from "@/components/ui/button";

import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxEmpty,
  ComboboxLabel,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { assetService } from "../../services/assetService";
import {
  AssetSearchableSelect,
  AssetCreatableSelect,
  AssetDateTimePicker,
} from "../ui-selects";
import {
  assetFormSchema,
  AssetFormValues,
  AssetTableData,
  Department,
  ItemClassification,
  ItemType,
  User,
} from "@/modules/manufacturing-management/asset-management/types";

interface AddAssetModalProps {
  onSuccess: () => void;
  onLocalAppend: (asset: AssetTableData) => void;
}

interface AssetItem {
  id: number;
  item_name: string;
  item_type?: { type_name?: string };
  item_classification?: { classification_name?: string };
}

export default function AddAssetModal({
  onLocalAppend,
}: AddAssetModalProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [types, setTypes] = useState<ItemType[]>([]);
  const [classifications, setClassifications] = useState<ItemClassification[]>(
    [],
  );
  const [items, setItems] = useState<AssetItem[]>([]);
  const [itemNameSearch, setItemNameSearch] = useState("");
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
      life_span: 5,
      date_acquired: new Date(),
      department: 0,
      employee: null,
      serial: "",
      is_active_warning: 0,
    },
  });

  useEffect(() => {
    if (open) {
      const fetchData = async () => {
        try {
          const [depData, userData, typeData, classData, itemData] =
            await Promise.all([
              assetService.getDepartments(),
              assetService.getUsers(),
              assetService.getItemTypes(),
              assetService.getItemClassifications(),
              assetService.getItems(),
            ]);

          setDepartments(Array.isArray(depData) ? depData : []);
          setUsers(Array.isArray(userData) ? userData : []);
          setTypes(Array.isArray(typeData) ? typeData : []);
          setClassifications(Array.isArray(classData) ? classData : []);
          setItems(Array.isArray(itemData) ? itemData : []);
        } catch (error) {
          console.error("Failed to load dropdown data", error);
          toast.error("Failed to load form options");
        }
      };
      fetchData();
    }
  }, [open]);

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      const now = new Date();
      form.reset({
        item_name: "",
        item_type: "",
        item_classification: "",
        barcode: "",
        rfid_code: "",
        condition: "Good",
        quantity: 1,
        cost_per_item: 0,
        life_span: 5,
        date_acquired: now,
        department: 0,
        employee: null,
        serial: "",
        is_active_warning: 0,
      });
      setSelectedFile(null);
      setPreviewUrl(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const uploadToDirectus = async (file: File) => {
    try {
      // 1. Compress the image before uploading to save time/bandwidth
      const options = {
        maxSizeMB: 1, // Max size 1MB
        maxWidthOrHeight: 1024, // Max resolution 1024px
        useWebWorker: true,
      };

      console.log("DEBUG: Compressing file...");
      const compressedFile = await imageCompression(file, options);

      const formData = new FormData();
      formData.append("file", compressedFile);

      const res = await fetch("/api/manufacturing/asset-management/asset-image-upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");

      const result = await res.json();
      return result?.data?.id; // Returning the UUID string
    } catch (error) {
      console.error("Upload Error:", error);
      throw error;
    }
  };

  const onSubmit = async (values: AssetFormValues) => {
    setLoading(true);
    try {
      let finalImageValue = null;

      if (selectedFile) {
        finalImageValue = await uploadToDirectus(selectedFile);
      }

      const submissionData = {
        ...values,
        date_acquired: format(values.date_acquired, "yyyy-MM-dd"),
        cost_per_item: Number(values.cost_per_item),
        quantity: Number(values.quantity),
        life_span: Number(values.life_span),
        department: Number(values.department),
        employee: values.employee ? Number(values.employee) : null,
        item_type: values.item_type,
        item_classification: values.item_classification,
        barcode: values.barcode || "",
        rfid_code: values.rfid_code || "",
        serial: values.serial || "",
        is_active_warning: values.is_active_warning,
        encoder: 133,
        item_image: finalImageValue,
      };

      const res = await fetch("/api/manufacturing/asset-management", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submissionData),
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || "Failed to save asset");
      }

      const selectedDepartment = departments.find(
        (d) => d.department_id === values.department,
      );
      const selectedEmployee = users.find((u) => u.user_id === values.employee);

      const d = values.date_acquired ? new Date(values.date_acquired) : new Date();
      const isoDateStr = d.toISOString();

      // 👇 Build full display row — id and item_id come from API, rest from form + resolved names
      const newAssetRow: AssetTableData = {
        id: result.data.id,
        item_id: result.data.item_id,
        item_name: values.item_name,
        item_type_name: values.item_type,
        classification_name: values.item_classification,
        condition: values.condition,
        cost_per_item: values.cost_per_item,
        quantity: values.quantity,
        total: values.cost_per_item * values.quantity,
        life_span: values.life_span,
        date_acquired: isoDateStr,
        department: values.department,
        department_name: selectedDepartment?.department_name ?? "Unassigned",
        employee: values.employee,
        assigned_to_name: selectedEmployee
          ? `${selectedEmployee.user_fname} ${selectedEmployee.user_lname}`.trim()
          : "Unassigned",
        item_image: finalImageValue,
        barcode: values.barcode || null,
        rfid_code: values.rfid_code || null,
        serial: values.serial || null,
        is_active_warning: values.is_active_warning,
        encoder: 133,
      };

      onLocalAppend(newAssetRow);
      toast.success("Asset saved successfully!");
      setOpen(false);
      resetForm();
      // onSuccess();
    } catch (error: unknown) {
      console.error("Asset creation error:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to save asset",
      );
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    form.reset({
      item_name: "",
      item_type: "",
      item_classification: "",
      barcode: "",
      rfid_code: "",
      condition: "Good",
      quantity: 1,
      cost_per_item: 0,
      life_span: 5,
      date_acquired: new Date(),
      department: 0,
      employee: null,
      serial: "",
      is_active_warning: 0,
    });
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Add New Asset
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] md:max-w-4xl lg:max-w-5xl max-h-[95vh] overflow-y-auto p-0 rounded-2xl">
        <DialogHeader className="p-6 pb-0 gap-0">
          <DialogTitle className="text-lg font-semibold flex items-center">
            Create New Asset
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Fill in the details below to add a new asset to the inventory.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="px-6 pb-8 space-y-6"
          >
            {/* SECTION 0: IMAGE */}
            <div className="space-y-4">
              <Separator />
              <div
                className={cn(
                  "border border-dashed rounded-lg p-4 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer bg-muted/50",
                  previewUrl ? "border-primary/50" : "border-muted",
                )}
                onClick={() => document.getElementById("image-upload")?.click()}
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
                  id="image-upload"
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
              <FormField
                control={form.control}
                name="item_name"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Item Name *</FormLabel>
                    <Combobox
                      value={field.value}
                      onValueChange={(val) => {
                        if (val) {
                          form.setValue("item_name", val);
                          const item = items.find((i) => i.item_name === val);
                          if (item) {
                            if (item.item_type?.type_name) {
                              form.setValue("item_type", item.item_type.type_name);
                            }
                            if (item.item_classification?.classification_name) {
                              form.setValue("item_classification", item.item_classification.classification_name);
                            }
                          }
                          setItemNameSearch("");
                        }
                      }}
                      inputValue={itemNameSearch}
                      onInputValueChange={(val) => {
                        setItemNameSearch(val);
                        field.onChange(val); // Continuously update form value as user types
                      }}
                    >
                      <ComboboxInput placeholder="Search or type asset name..." showTrigger={true} />
                      <ComboboxContent align="start" className="w-(--radix-popover-trigger-width) p-0 pointer-events-auto z-[100]">
                        <ComboboxList className="max-h-[200px] overflow-y-auto" onWheel={(e) => e.stopPropagation()}>
                          <ComboboxGroup>
                            <ComboboxLabel>Existing Assets</ComboboxLabel>
                            {Array.from(
                              new Map(
                                items
                                  .filter((item) =>
                                    item.item_name.toLowerCase().includes(itemNameSearch.toLowerCase()),
                                  )
                                  .map((item) => [item.item_name.toLowerCase(), item]),
                              ).values(),
                            ).map((item) => (
                              <ComboboxItem key={item.id} value={item.item_name}>
                                <div className="flex flex-col">
                                  <span>{item.item_name}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {item.item_type?.type_name} • {item.item_classification?.classification_name}
                                  </span>
                                </div>
                              </ComboboxItem>
                            ))}
                          </ComboboxGroup>
                          <ComboboxEmpty className="p-2 text-sm text-muted-foreground">
                            New item will be created.
                          </ComboboxEmpty>
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                {/* ITEM TYPE FIELD */}
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

                {/* CLASSIFICATION FIELD */}
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="barcode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Barcode</FormLabel>
                      <Input
                        placeholder="Optional"
                        {...field}
                        value={field.value ?? ""}
                        className="h-10"
                      />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="rfid_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RFID Code</FormLabel>
                      <Input
                        placeholder="Optional"
                        {...field}
                        value={field.value ?? ""}
                        className="h-10"
                      />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="serial"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Serial Number</FormLabel>
                      <Input
                        placeholder="Optional"
                        {...field}
                        value={field.value ?? ""}
                        className="h-10"
                      />
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
                          value={field.value > 0 ? field.value.toString() : ""}
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
                          placeholder="e.g. 5"
                          className="h-10"
                          value={field.value === 0 ? "" : (field.value ?? "")}
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
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
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

              <Separator />
            </div>
            <div className="flex items-center justify-end gap-3 pt-4">
              <Button
                variant="outline"
                type="button"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="min-w-30" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Asset
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
