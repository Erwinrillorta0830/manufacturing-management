"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import imageCompression from "browser-image-compression";
import Image from "next/image";
import React, { useEffect, useState } from "react";
import { useForm, FieldErrors } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
  UnitOption,
  User,
} from "@/modules/manufacturing-management/asset-management/types";
import { Check, Loader2, UploadCloud, X } from "lucide-react";
import { assetService } from "../../services/assetService";
import { cn, formatPHP, getAssetImageUrl, formatDateTimeForDB, parseDateTimeSafe } from "../../utils/lib";
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
  const [units, setUnits] = useState<UnitOption[]>([]);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isLegacyAsset, setIsLegacyAsset] = useState(false);

  const form = useForm<AssetFormValues>({
    resolver: zodResolver(assetFormSchema),
    defaultValues: {
      item_name: "",
      item_type: "",
      item_classification: "",
      asset_type: "Administrative",
      depreciation_method: "Straight Line",
      barcode: "",
      rfid_code: "",
      condition: "Good",
      quantity: 1,
      cost_per_item: 0,
      acquisition_cost: 0,
      residual_value: 0,
      life_span: 1,
      useful_life_months: 60,
      maximum_unit_produced_capacity: 0,
      production_unit_id: null,
      date_acquired: new Date(),
      depreciation_start_date: new Date(),
      department: 0,
      employee: null,
      item_image: null,
      serial: "",
      is_active_warning: 0,
      asset_origin: "New",
    },
  });

  // Sync Form with Asset Data
  useEffect(() => {
    if (asset && isOpen) {
      const acqCost = asset.acquisition_cost != null ? Number(asset.acquisition_cost) : (Number(asset.cost_per_item || 0) * Number(asset.quantity || 1));
      const resVal = Number(asset.residual_value || 0);
      const usefulMonths = asset.useful_life_months != null ? Number(asset.useful_life_months) : (Number(asset.life_span || 1) * 12);
      const maxCap = asset.maximum_unit_produced_capacity != null ? Number(asset.maximum_unit_produced_capacity) : 0;
      const parsedAcqDate = parseDateTimeSafe(asset.date_acquired) || new Date();
      const parsedDepDate = parseDateTimeSafe(asset.depreciation_start_date) || parsedAcqDate;

      const parsedOpeningDate = parseDateTimeSafe(asset.opening_production_date) || parsedAcqDate;
      const isExistingOrigin =
        asset.asset_origin === "Existing" ||
        (asset.opening_book_value != null && Number(asset.opening_book_value) < acqCost) ||
        Number(asset.opening_accumulated_depreciation || 0) > 0 ||
        Number(asset.opening_production_units || 0) > 0;

      setIsLegacyAsset(isExistingOrigin);

      form.reset({
        item_name: asset.item_name,
        item_type: asset.item_type_name || "",
        item_classification: asset.classification_name || "",
        asset_type: asset.asset_type === "Production" ? "Production" : "Administrative",
        depreciation_method: (asset.depreciation_method as "Straight Line" | "Units of Production") || "Straight Line",
        barcode: asset.barcode || "",
        rfid_code: asset.rfid_code || "",
        condition: asset.condition,
        quantity: 1,
        cost_per_item: asset.cost_per_item,
        acquisition_cost: acqCost,
        residual_value: resVal,
        life_span: asset.life_span,
        useful_life_months: usefulMonths,
        maximum_unit_produced_capacity: maxCap,
        production_unit_id: asset.production_unit_id || null,
        date_acquired: parsedAcqDate,
        depreciation_start_date: parsedDepDate,
        asset_origin: isExistingOrigin ? "Existing" : "New",
        opening_book_value: asset.opening_book_value != null ? Number(asset.opening_book_value) : acqCost,
        opening_accumulated_depreciation: asset.opening_accumulated_depreciation != null ? Number(asset.opening_accumulated_depreciation) : 0,
        opening_production_units: asset.opening_production_units != null ? Number(asset.opening_production_units) : 0,
        opening_production_date: parsedOpeningDate,
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
          const [depData, userData, typeData, classData, unitData] = await Promise.all([
            assetService.getDepartments(),
            assetService.getUsers(),
            assetService.getItemTypes(),
            assetService.getItemClassifications(),
            assetService.getUnits(),
          ]);

          setDepartments(depData);
          setUsers(userData);
          setTypes(typeData);
          setClassifications(classData);
          setUnits(Array.isArray(unitData) ? unitData : []);
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

      const resolvedAssetOrigin = isLegacyAsset ? "Existing" : (values.asset_origin || "New");

      await assetService.updateAsset(
        asset.id,
        asset.item_id,
        { ...values, asset_origin: resolvedAssetOrigin },
        finalImageValue,
      );

      const selectedDepartment = departments.find(
        (d) => d.department_id === values.department,
      );
      const selectedEmployee = users.find((u) => u.user_id === values.employee);
      const selectedUnit = units.find((u) => u.unit_id === Number(values.production_unit_id));

      const dbDateStr = formatDateTimeForDB(values.date_acquired);
      const depStartDateStr = isLegacyAsset && values.depreciation_start_date
        ? formatDateTimeForDB(values.depreciation_start_date).split(" ")[0]
        : dbDateStr.split(" ")[0];

      const acqCostVal = values.acquisition_cost != null ? Number(values.acquisition_cost) : (Number(values.cost_per_item) || 0) * (Number(values.quantity) || 1);
      const usefulMonthsVal = values.useful_life_months != null ? Number(values.useful_life_months) : Number(values.life_span || 1) * 12;

      const updatedFields: Partial<AssetTableData> & { id: number } = {
        id: asset.id,
        item_name: values.item_name,
        item_type_name: values.item_type,
        classification_name: values.item_classification,
        condition: values.condition,
        cost_per_item: values.cost_per_item,
        quantity: values.quantity,
        total: (Number(values.cost_per_item) || 0) * (Number(values.quantity) || 1),
        life_span: values.life_span != null ? Number(values.life_span) : undefined,
        date_acquired: dbDateStr,

        asset_type: values.asset_type,
        depreciation_method: values.depreciation_method,
        asset_origin: resolvedAssetOrigin,
        acquisition_cost: acqCostVal,
        residual_value: Number(values.residual_value || 0),
        useful_life_months: usefulMonthsVal,
        maximum_unit_produced_capacity: values.maximum_unit_produced_capacity != null ? Number(values.maximum_unit_produced_capacity) : null,
        production_unit_id: values.production_unit_id ? Number(values.production_unit_id) : null,
        production_unit: selectedUnit?.unit_name || null,
        production_unit_shortcut: selectedUnit?.unit_shortcut || null,
        depreciation_start_date: depStartDateStr,

        opening_book_value:
          values.opening_book_value != null ? Number(values.opening_book_value) : acqCostVal,
        opening_accumulated_depreciation:
          values.opening_accumulated_depreciation != null ? Number(values.opening_accumulated_depreciation) : 0,
        opening_production_units:
          values.opening_production_units != null ? Number(values.opening_production_units) : 0,
        opening_production_date: values.opening_production_date
          ? (typeof values.opening_production_date === "string" ? values.opening_production_date : values.opening_production_date.toISOString())
          : null,

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
        is_active_warning: values.is_active_warning != null ? Number(values.is_active_warning) : undefined,
      };

      onLocalUpdate(updatedFields);
      toast.success("Asset updated successfully!");
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update asset");
    } finally {
      setLoading(false);
    }
  };

  const onInvalid = () => {
    toast.error("Please input all required fields.");
  };

  if (!asset) return null;

  const watchDepMethod = form.watch("depreciation_method");
  const watchCost = form.watch("cost_per_item") || 0;
  const watchAcqCost = form.watch("acquisition_cost") != null && form.watch("acquisition_cost")! > 0 ? form.watch("acquisition_cost")! : watchCost;
  const watchResValue = form.watch("residual_value") || 0;
  const watchUsefulMonths = form.watch("useful_life_months") || (form.watch("life_span") || 1) * 12;
  const watchMaxCapacity = form.watch("maximum_unit_produced_capacity") || 0;
  const watchProdUnitId = form.watch("production_unit_id");
  const watchOpeningBookValue = form.watch("opening_book_value");
  const watchOpeningUnits = form.watch("opening_production_units") || 0;
  const selectedUnitObj = units.find((u) => u.unit_id === Number(watchProdUnitId));

  const effectiveOpeningBookValue =
    watchOpeningBookValue != null && Number(watchOpeningBookValue) > 0
      ? Number(watchOpeningBookValue)
      : watchAcqCost;

  const remainingDepreciableBasis = Math.max(0, effectiveOpeningBookValue - watchResValue);
  const remainingCapacityAtCutover = Math.max(0, watchMaxCapacity - watchOpeningUnits);

  const monthlyStraightLine = watchUsefulMonths > 0 ? remainingDepreciableBasis / watchUsefulMonths : 0;
  const uopRate = remainingCapacityAtCutover > 0 ? remainingDepreciableBasis / remainingCapacityAtCutover : (watchMaxCapacity > 0 ? remainingDepreciableBasis / watchMaxCapacity : 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-[95vw] md:max-w-5xl lg:max-w-6xl max-h-[95vh] overflow-y-auto p-0 rounded-2xl"
      >
        <DialogHeader className="p-6 pb-0 gap-0">
          <DialogTitle className="text-lg font-semibold flex items-center">
            Edit Asset
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Modify asset specifications and depreciation configurations.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit, onInvalid)}
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
              <FormField
                control={form.control}
                name="item_name"
                render={({ field }) => (
                  <FormItem>
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

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start w-full">
                {/* Item Type */}
                <FormField
                  control={form.control}
                  name="item_type"
                  render={({ field }) => (
                    <FormItem className="w-full flex flex-col">
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
                          placeholder="Select or type type..."
                          className="w-full"
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
                    <FormItem className="w-full flex flex-col">
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
                          className="w-full"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Asset Type */}
                <FormField
                  control={form.control}
                  name="asset_type"
                  render={({ field }) => (
                    <FormItem className="w-full flex flex-col">
                      <FormLabel>Asset Type *</FormLabel>
                      <Select
                        onValueChange={(val: "Administrative" | "Production") => {
                          field.onChange(val);
                          if (val === "Production") {
                            form.setValue("depreciation_method", "Units of Production", {
                              shouldValidate: true,
                              shouldDirty: true,
                              shouldTouch: true,
                            });
                          } else {
                            form.setValue("depreciation_method", "Straight Line", {
                              shouldValidate: true,
                              shouldDirty: true,
                              shouldTouch: true,
                            });
                          }
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10 w-full whitespace-nowrap [&>span]:truncate">
                            <SelectValue placeholder="Select Asset Type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Administrative">Administrative</SelectItem>
                          <SelectItem value="Production">Production Machinery</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Depreciation Method */}
                <FormField
                  control={form.control}
                  name="depreciation_method"
                  render={({ field }) => (
                    <FormItem className="w-full flex flex-col">
                      <FormLabel>Depreciation Method *</FormLabel>
                      <Select
                        onValueChange={(val: "Straight Line" | "Units of Production") => {
                          field.onChange(val);
                          if (val === "Units of Production") {
                            form.setValue("asset_type", "Production", {
                              shouldValidate: true,
                              shouldDirty: true,
                              shouldTouch: true,
                            });
                          }
                        }}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger className="h-10 w-full whitespace-nowrap [&>span]:truncate">
                            <SelectValue placeholder="Select Method" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Straight Line">Straight Line (SL)</SelectItem>
                          <SelectItem value="Units of Production">Units of Production (UOP)</SelectItem>
                        </SelectContent>
                      </Select>
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
                          onValueChange={(val) => {
                            field.onChange(val);
                            if (!isLegacyAsset && val) {
                              form.setValue("depreciation_start_date", val, {
                                shouldValidate: true,
                                shouldDirty: true,
                              });
                            }
                          }}
                          placeholder="Pick date & time..."
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* SECTION 3: FINANCIALS & DEPRECIATION */}
            <div className="space-y-4">
              <Separator />
              <div className="text-sm font-semibold text-foreground">
                Financial Baseline &amp; Depreciation Setup
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start w-full">
                <FormField
                  control={form.control}
                  name="cost_per_item"
                  render={({ field }) => (
                    <FormItem className="w-full flex flex-col">
                      <FormLabel>Acquisition Cost (PHP) *</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={field.value === 0 ? "" : (field.value ?? "")}
                          className="h-10"
                          onChange={(e) => {
                            const val = e.target.value;
                            const num = val === "" ? 0 : parseFloat(val) || 0;
                            field.onChange(num);
                            form.setValue("acquisition_cost", num);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="residual_value"
                  render={({ field }) => (
                    <FormItem className="w-full flex flex-col">
                      <FormLabel>Residual Value (PHP)</FormLabel>
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
                  name="condition"
                  render={({ field }) => (
                    <FormItem className="w-full flex flex-col">
                      <FormLabel>Condition</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className="h-10 w-full">
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

                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem className="w-full flex flex-col">
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
              </div>

              {/* METHOD-SPECIFIC CONFIGURATION */}
              {watchDepMethod === "Straight Line" ? (
                <div className="p-4 rounded-xl border border-border/80 bg-muted/20">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start w-full">
                    <FormField
                      control={form.control}
                      name="life_span"
                      render={({ field }) => (
                        <FormItem className="w-full flex flex-col">
                          <FormLabel>Useful Life (Years) *</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              step="0.1"
                              placeholder="e.g. 5"
                              className="h-10 bg-background"
                              value={field.value === 0 ? "" : (field.value ?? 5)}
                              onChange={(e) => {
                                const val = e.target.value;
                                const years = val === "" ? 0 : parseFloat(val) || 0;
                                field.onChange(years);
                                form.setValue("useful_life_months", Math.round(years * 12));
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="w-full flex flex-col space-y-2">
                      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                        Straight-Line Monthly Rate
                      </div>
                      <div className="h-10 rounded-md border bg-background px-3 flex items-center justify-between">
                        <span className="text-muted-foreground text-xs font-medium">Rate:</span>
                        <span className="font-bold text-foreground text-sm">
                          {formatPHP(monthlyStraightLine)}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            / month ({Math.round(watchUsefulMonths)} mos)
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-border/80 bg-muted/20">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start w-full">
                    <FormField
                      control={form.control}
                      name="maximum_unit_produced_capacity"
                      render={({ field }) => (
                        <FormItem className="w-full flex flex-col">
                          <FormLabel>Max Lifetime Capacity *</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="10000"
                              className="h-10 bg-background"
                              value={field.value === 0 ? "" : (field.value ?? "")}
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
                      name="production_unit_id"
                      render={({ field }) => (
                        <FormItem className="w-full flex flex-col">
                          <FormLabel>Production Unit (UoM) *</FormLabel>
                          <FormControl>
                            <AssetSearchableSelect
                              options={units.map((u) => ({
                                value: u.unit_id.toString(),
                                label: `${u.unit_name}${u.unit_shortcut ? ` (${u.unit_shortcut})` : ""}`,
                              }))}
                              value={field.value ? field.value.toString() : ""}
                              onValueChange={(val) => field.onChange(val ? Number(val) : null)}
                              placeholder="Select UoM..."
                              allowClear={true}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="w-full flex flex-col space-y-2">
                      <div className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                        UOP Depreciation Rate
                      </div>
                      <div className="h-10 rounded-md border bg-background px-3 flex items-center justify-between">
                        <span className="text-muted-foreground text-xs font-medium">Rate:</span>
                        <span className="font-bold text-foreground text-sm">
                          {formatPHP(uopRate)}{" "}
                          <span className="text-xs font-normal text-muted-foreground">
                            / {selectedUnitObj?.unit_shortcut || selectedUnitObj?.unit_name || "unit"}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 3B: LEGACY ASSET MIGRATION & OPENING CARRYING VALUE */}
              <div className="p-4 rounded-xl border border-border/80 bg-muted/20 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-foreground flex items-center gap-2">
                      <span>Existing / Migrated Asset (Opening Balance Setup)</span>
                      {isLegacyAsset && (
                        <span className="text-[10px] font-bold uppercase bg-primary/10 text-primary px-2 py-0.5 rounded border border-primary/20">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Enable if this asset was already in service prior to system implementation and requires an opening carrying balance.
                    </p>
                  </div>
                  <Switch
                    checked={isLegacyAsset}
                    onCheckedChange={(checked) => {
                      setIsLegacyAsset(checked);
                      form.setValue("asset_origin", checked ? "Existing" : "New");
                      if (!checked) {
                        form.setValue("opening_book_value", undefined);
                        form.setValue("opening_accumulated_depreciation", 0);
                        form.setValue("opening_production_units", 0);
                      }
                    }}
                  />
                </div>

                {isLegacyAsset && (
                  <div className="space-y-4 pt-3 border-t border-border/60">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start w-full">
                      <FormField
                        control={form.control}
                        name="opening_book_value"
                        render={({ field }) => (
                          <FormItem className="w-full flex flex-col">
                            <FormLabel className="text-xs">
                              Opening Carrying Value (PHP)
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder={watchAcqCost > 0 ? String(watchAcqCost) : "0.00"}
                                className="h-10 bg-background"
                                value={field.value ?? ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  const num = val === "" ? undefined : parseFloat(val) || 0;
                                  field.onChange(num);
                                  if (num !== undefined) {
                                    form.setValue("opening_accumulated_depreciation", Math.max(0, watchAcqCost - num));
                                  }
                                }}
                              />
                            </FormControl>
                            <span className="text-[10px] text-muted-foreground">
                              Assessed carrying value at cutover
                            </span>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="opening_accumulated_depreciation"
                        render={({ field }) => (
                          <FormItem className="w-full flex flex-col">
                            <FormLabel className="text-xs">
                              Prior Accum. Dep. (PHP)
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                className="h-10 bg-background"
                                value={field.value === 0 ? "" : (field.value ?? "")}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  field.onChange(val === "" ? 0 : parseFloat(val) || 0);
                                }}
                              />
                            </FormControl>
                            <span className="text-[10px] text-muted-foreground">
                              Historical wear &amp; tear prior to cutover
                            </span>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {watchDepMethod === "Units of Production" ? (
                        <FormField
                          control={form.control}
                          name="opening_production_units"
                          render={({ field }) => (
                            <FormItem className="w-full flex flex-col">
                              <FormLabel className="text-xs">
                                Prior Units Produced ({selectedUnitObj?.unit_shortcut || selectedUnitObj?.unit_name || "UoM"})
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.0001"
                                  placeholder="0"
                                  className="h-10 bg-background"
                                  value={field.value === 0 ? "" : (field.value ?? "")}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    field.onChange(val === "" ? 0 : parseFloat(val) || 0);
                                  }}
                                />
                              </FormControl>
                              <span className="text-[10px] text-muted-foreground">
                                Units produced before system
                              </span>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ) : (
                        <FormField
                          control={form.control}
                          name="depreciation_start_date"
                          render={({ field }) => (
                            <FormItem className="w-full flex flex-col">
                              <FormLabel className="text-xs">Depreciation Start Date</FormLabel>
                              <FormControl>
                                <AssetDateTimePicker
                                  value={field.value}
                                  onValueChange={field.onChange}
                                  placeholder="Pick start date..."
                                />
                              </FormControl>
                              <span className="text-[10px] text-muted-foreground">
                                When calculations begin
                              </span>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}

                      <FormField
                        control={form.control}
                        name="opening_production_date"
                        render={({ field }) => (
                          <FormItem className="w-full flex flex-col">
                            <FormLabel className="text-xs">Cutover / Assessment Date</FormLabel>
                            <FormControl>
                              <AssetDateTimePicker
                                value={field.value}
                                onValueChange={field.onChange}
                                placeholder="Pick cutover date..."
                              />
                            </FormControl>
                            <span className="text-[10px] text-muted-foreground">
                              Cutover date
                            </span>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-background border border-border">
                        <span className="text-muted-foreground block text-[11px]">Starting Carrying Basis:</span>
                        <span className="font-bold text-foreground text-sm mt-0.5 block">{formatPHP(effectiveOpeningBookValue)}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-background border border-border">
                        <span className="text-muted-foreground block text-[11px]">Remaining Depreciable:</span>
                        <span className="font-bold text-foreground text-sm mt-0.5 block">{formatPHP(remainingDepreciableBasis)}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-background border border-primary/30 bg-primary/5">
                        <span className="text-primary block text-[11px] font-medium">Effective Future Rate:</span>
                        <span className="font-bold text-primary text-sm mt-0.5 block">
                          {watchDepMethod === "Units of Production"
                            ? `${formatPHP(uopRate)} / ${selectedUnitObj?.unit_shortcut || selectedUnitObj?.unit_name || "unit"}`
                            : `${formatPHP(monthlyStraightLine)} / month`}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 border-t border-border/80">
               

              <div className="flex items-center justify-end gap-3">
                <Button variant="outline" type="button" onClick={onClose} disabled={loading}>
                  Cancel
                </Button>
                <Button type="submit" className="min-w-48 font-semibold shadow-sm" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating Asset...
                    </>
                  ) : (
                    <>
                      <Check className="mr-1.5 h-4 w-4" />
                      {isLegacyAsset
                        ? (watchDepMethod === "Units of Production"
                            ? "Update Existing Asset (UOP)"
                            : "Update Existing Asset (Straight Line)")
                        : (watchDepMethod === "Units of Production"
                            ? "Update Asset (UOP)"
                            : "Update Asset (Straight Line)")}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
