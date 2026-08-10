/* eslint-disable */
"use client";

import React, { useState, useEffect } from "react";
import {
    Plus,
    FileText,
    Sliders,
    Briefcase,
    Package,
    Layers,
    Image as ImageIcon
} from "lucide-react";
import { toast } from "sonner";
import { CreatableSelect } from "./CreatableSelect";
import { uploadProductImage } from "../services/product-image";
import { Product, Supplier } from "../types";
import { type RegisterFormField, type RegisterFormErrors, type useFinishedGoods } from "../hooks/useFinishedGoods";

export interface RegisterProductModalProps {
    isOpen: boolean;
    onClose: () => void;
    registrationType: "parent" | "child";
    setRegistrationType: React.Dispatch<React.SetStateAction<"parent" | "child">>;
    registerForm: ReturnType<typeof useFinishedGoods>["registerForm"];
    setRegisterForm: ReturnType<typeof useFinishedGoods>["setRegisterForm"];
    registerFormErrors: RegisterFormErrors;
    clearRegisterFormError: (field: RegisterFormField) => void;
    handleRegisterProduct: (e: React.FormEvent, registrationType: "parent" | "child") => Promise<void>;
    savingBOM: boolean;
    products: Product[];
    suppliers: Supplier[];
    brandOptions: { value: string; label: string }[];
    categoryOptions: { value: string; label: string }[];
    parentOptions: { value: string; label: string }[];
    uomOptions: { value: string; label: string }[];
    segmentOptions: { value: string; label: string }[];
    classOptions: { value: string; label: string }[];
    sectionOptions: { value: string; label: string }[];
    handleCreateBrand: (name: string) => Promise<number | undefined>;
    handleCreateCategory: (name: string) => Promise<number | undefined>;
    handleCreateSegment: (name: string) => Promise<number | undefined>;
    handleCreateClass: (name: string) => Promise<number | undefined>;
    handleCreateSection: (name: string) => Promise<number | undefined>;
}

export function RegisterProductModal({
    isOpen,
    onClose,
    registrationType,
    setRegistrationType,
    registerForm,
    setRegisterForm,
    registerFormErrors,
    clearRegisterFormError,
    handleRegisterProduct,
    savingBOM,
    products,
    suppliers,
    brandOptions,
    categoryOptions,
    parentOptions,
    uomOptions,
    segmentOptions,
    classOptions,
    sectionOptions,
    handleCreateBrand,
    handleCreateCategory,
    handleCreateSegment,
    handleCreateClass,
    handleCreateSection
}: RegisterProductModalProps) {
    const [uploadingRegImage, setUploadingRegImage] = useState(false);
    const [registerImagePreview, setRegisterImagePreview] = useState<string | null>(null);
    const [registerImageError, setRegisterImageError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) return;
        setRegisterImagePreview(null);
        setRegisterImageError(null);
    }, [isOpen]);

    useEffect(() => {
        return () => {
            if (registerImagePreview) URL.revokeObjectURL(registerImagePreview);
        };
    }, [registerImagePreview]);

    if (!isOpen) return null;

    const updateRegisterField = (field: RegisterFormField, value: string) => {
        setRegisterForm(prev => ({ ...prev, [field]: value }));
        clearRegisterFormError(field);
        if (field === "baseUom") clearRegisterFormError("parentId");
    };

    const registerError = (field: RegisterFormField) => registerFormErrors[field];

    const registerInputClass = (field: RegisterFormField) =>
        `w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all ${
            registerError(field) ? "border-red-500 focus:ring-red-500" : "border-border"
        }`;

    const registerErrorMessage = (field: RegisterFormField) => {
        const message = registerError(field);
        return message ? (
            <p id={`register-${field}-error`} className="mt-1 text-[11px] font-medium text-red-600" role="alert">
                {message}
            </p>
        ) : null;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-card border border-border/80 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex flex-col gap-3 px-6 py-4 border-b shrink-0 bg-muted/20">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Plus className="h-5 w-5 text-primary" />
                            <div>
                                <h3 className="text-base font-bold text-foreground">
                                    {registrationType === "parent" ? "Register Parent Good (Piece)" : "Register Child Variant (Box / Case)"}
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                    {registrationType === "parent"
                                        ? "Add a master manufactured good (piece/pouch) with core BOM recipe and workstation routings."
                                        : "Add a packaged outer variant (box/case) containing multiple parent pieces."}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors px-3 py-1.5 hover:bg-muted rounded-lg cursor-pointer"
                        >
                            Close
                        </button>
                    </div>

                    {/* Mode Segment Switcher */}
                    <div className="flex items-center gap-2 p-1 bg-muted/40 rounded-lg border border-border/60">
                        <button
                            type="button"
                            onClick={() => {
                                setRegistrationType("parent");
                                setRegisterForm(prev => ({ ...prev, parentId: "", uomCount: "1" }));
                            }}
                            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                registrationType === "parent"
                                    ? "bg-primary text-primary-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            }`}
                        >
                            <Package className="h-3.5 w-3.5" /> Parent Good (Piece / Individual Pouch)
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setRegistrationType("child");
                                setRegisterForm(prev => ({
                                    ...prev,
                                    parentId: "",
                                    title: "",
                                    sku: "",
                                    baseUom: "",
                                    targetSellingPrice: "",
                                    costPerUnit: "",
                                    uomCount: ""
                                }));
                            }}
                            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                registrationType === "child"
                                    ? "bg-primary text-primary-foreground shadow-xs"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                            }`}
                        >
                            <Layers className="h-3.5 w-3.5" /> Child Variant (Box / Case / Mother Bag)
                        </button>
                    </div>
                </div>

                {/* Form */}
                <form
                    noValidate
                    onSubmit={(event) => handleRegisterProduct(event, registrationType)}
                    className="flex-1 overflow-y-auto p-6 space-y-6"
                >
                    {/* Mode Informational Banner */}
                    <div className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2.5 ${
                        registrationType === "parent"
                            ? "bg-primary/5 border-primary/20 text-primary"
                            : "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300"
                    }`}>
                        {registrationType === "parent" ? (
                            <>
                                <Package className="h-4 w-4 shrink-0" />
                                <span><strong>Parent Product Mode:</strong> Registers the primary manufactured unit (Piece/Pouch). Holds the core BOM materials, workstation routings, and direct labor standards.</span>
                            </>
                        ) : (
                            <>
                                <Layers className="h-4 w-4 shrink-0" />
                                <span><strong>Child Variant Mode:</strong> Registers a packaged outer container (Box/Case). Linked to a Parent Good and inherits its master recipe.</span>
                            </>
                        )}
                    </div>
                    {/* Group 1: General Info */}
                    <div className="bg-muted/10 border border-border/40 rounded-xl p-4 space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5" /> 1. Identity & Details
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Product Name <span className="text-red-500">*</span></label>
                                <input
                                    id="register-title"
                                    type="text"
                                    required
                                    placeholder="e.g. Mama Pina's Soya Oil 2L x 6"
                                    value={registerForm.title}
                                    onChange={e => updateRegisterField("title", e.target.value)}
                                    aria-invalid={!!registerError("title")}
                                    aria-describedby={registerError("title") ? "register-title-error" : undefined}
                                    className={registerInputClass("title")}
                                />
                                {registerErrorMessage("title")}
                            </div>
                            <div className="col-span-2">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Short Description</label>
                                <textarea
                                    placeholder="Optional human-readable product description..."
                                    value={registerForm.description}
                                    onChange={e => setRegisterForm(prev => ({ ...prev, description: e.target.value }))}
                                    rows={2}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary resize-none transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">SKU / Code <span className="text-red-500">*</span></label>
                                <input
                                    id="register-sku"
                                    type="text"
                                    required
                                    placeholder="e.g. FG-SOYA-2L"
                                    value={registerForm.sku}
                                    onChange={e => updateRegisterField("sku", e.target.value)}
                                    aria-invalid={!!registerError("sku")}
                                    aria-describedby={registerError("sku") ? "register-sku-error" : undefined}
                                    className={registerInputClass("sku")}
                                />
                                {registerErrorMessage("sku")}
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Barcode (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 4800110229..."
                                    value={registerForm.barcode}
                                    onChange={e => setRegisterForm(prev => ({ ...prev, barcode: e.target.value }))}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Brand <span className="text-red-500">*</span></label>
                                <CreatableSelect
                                    id="register-brand"
                                    options={brandOptions}
                                    value={registerForm.brandId}
                                    onValueChange={(val) => updateRegisterField("brandId", val)}
                                    placeholder="Select brand..."
                                    aria-invalid={!!registerError("brandId")}
                                    aria-describedby={registerError("brandId") ? "register-brandId-error" : undefined}
                                    className={registerError("brandId") ? "border-red-500 focus:ring-red-500" : undefined}
                                    onCreateOption={async (name) => {
                                        const newId = await handleCreateBrand(name);
                                        if (newId) updateRegisterField("brandId", String(newId));
                                    }}
                                />
                                {registerErrorMessage("brandId")}
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Category <span className="text-red-500">*</span></label>
                                <CreatableSelect
                                    id="register-category"
                                    options={categoryOptions}
                                    value={registerForm.categoryId}
                                    onValueChange={(val) => updateRegisterField("categoryId", val)}
                                    placeholder="Select category..."
                                    aria-invalid={!!registerError("categoryId")}
                                    aria-describedby={registerError("categoryId") ? "register-categoryId-error" : undefined}
                                    className={registerError("categoryId") ? "border-red-500 focus:ring-red-500" : undefined}
                                    onCreateOption={async (name) => {
                                        const newId = await handleCreateCategory(name);
                                        if (newId) updateRegisterField("categoryId", String(newId));
                                    }}
                                />
                                {registerErrorMessage("categoryId")}
                            </div>
                            {registrationType === "child" && (
                                <div className="col-span-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                                    <label className="text-[11px] font-bold text-amber-700 dark:text-amber-300 uppercase block">
                                        Select Parent Manufactured Good (Piece / Individual Pouch) <span className="text-red-500">*</span>
                                    </label>
                                    <CreatableSelect
                                        id="register-parent"
                                        options={parentOptions}
                                        value={registerForm.parentId}
                                        onValueChange={(val) => {
                                            const selectedId = val;
                                            clearRegisterFormError("parentId");
                                            clearRegisterFormError("baseUom");
                                            const parentProd = products.find(p => p.id === selectedId);
                                            setRegisterForm(prev => {
                                                if (parentProd) {
                                                    return {
                                                        ...prev,
                                                        parentId: selectedId,
                                                        title: "",
                                                        sku: "",
                                                        baseUom: "",
                                                        targetSellingPrice: "",
                                                        costPerUnit: "",
                                                        uomCount: "",
                                                        expectedYield: parentProd.expectedYieldPercent !== undefined
                                                            ? String(parentProd.expectedYieldPercent)
                                                            : prev.expectedYield,
                                                        description: parentProd.description || prev.description,
                                                        brandId: parentProd.product_brand ? String(parentProd.product_brand) : prev.brandId,
                                                        categoryId: parentProd.product_category ? String(parentProd.product_category) : prev.categoryId,
                                                        classId: parentProd.product_class ? String(parentProd.product_class) : prev.classId,
                                                        segmentId: parentProd.product_segment ? String(parentProd.product_segment) : prev.segmentId,
                                                        sectionId: parentProd.product_section ? String(parentProd.product_section) : prev.sectionId,
                                                        shelfLife: parentProd.product_shelf_life ? String(parentProd.product_shelf_life) : prev.shelfLife,
                                                        densityFactor: parentProd.densityFactor !== undefined
                                                            ? String(parentProd.densityFactor)
                                                            : prev.densityFactor
                                                    };
                                                }
                                                return {
                                                    ...prev,
                                                    parentId: selectedId,
                                                    title: "",
                                                    sku: "",
                                                    baseUom: "",
                                                    targetSellingPrice: "",
                                                    costPerUnit: "",
                                                    uomCount: "",
                                                };
                                            });
                                        }}
                                        placeholder="Select parent piece product..."
                                        aria-invalid={!!registerError("parentId")}
                                        aria-describedby={registerError("parentId") ? "register-parentId-error" : undefined}
                                        className={registerError("parentId") ? "border-red-500 focus:ring-red-500" : undefined}
                                    />
                                    {registerErrorMessage("parentId")}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Group 2: Measurements & Life */}
                    <div className="bg-muted/10 border border-border/40 rounded-xl p-4 space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                            <Sliders className="h-3.5 w-3.5" /> 2. Physicals &amp; Inventory
                        </h4>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Base UOM <span className="text-red-500">*</span></label>
                                <CreatableSelect
                                    id="register-base-uom"
                                    options={uomOptions}
                                    value={registerForm.baseUom}
                                    onValueChange={(val) => updateRegisterField("baseUom", val)}
                                    placeholder="Select Base UOM..."
                                    aria-invalid={!!registerError("baseUom")}
                                    aria-describedby={registerError("baseUom") ? "register-baseUom-error" : undefined}
                                    className={registerError("baseUom") ? "border-red-500 focus:ring-red-500" : undefined}
                                />
                                {registerErrorMessage("baseUom")}
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">
                                    {registrationType === "child" ? "Pieces per Box / Case *" : "Pack Multiplier *"}
                                </label>
                                <input
                                    id="register-uomCount"
                                    type="number"
                                    placeholder={registrationType === "child" ? "e.g. 20" : "1"}
                                    value={registerForm.uomCount}
                                    onChange={e => {
                                        const val = e.target.value;
                                        clearRegisterFormError("uomCount");
                                        const count = Number(val) || 0;
                                        setRegisterForm(prev => {
                                            const parent = products.find(p => p.id === prev.parentId);
                                            if (parent) {
                                                const targetSellingPrice = String((parent.targetSellingPrice || 0) * count);
                                                const costPerUnit = parent.cost_per_unit ? String(parent.cost_per_unit * count) : prev.costPerUnit;
                                                return {
                                                    ...prev,
                                                    uomCount: val,
                                                    targetSellingPrice,
                                                    costPerUnit
                                                };
                                            }
                                            return { ...prev, uomCount: val };
                                        });
                                    }}
                                    aria-invalid={!!registerError("uomCount")}
                                    aria-describedby={registerError("uomCount") ? "register-uomCount-error" : undefined}
                                    className={registerInputClass("uomCount")}
                                />
                                {registerErrorMessage("uomCount")}
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Density conversion factor <span className="text-red-500">*</span></label>
                                <input
                                    id="register-densityFactor"
                                    type="number"
                                    step="0.001"
                                    placeholder="1.0"
                                    value={registerForm.densityFactor}
                                    onChange={e => updateRegisterField("densityFactor", e.target.value)}
                                    aria-invalid={!!registerError("densityFactor")}
                                    aria-describedby={registerError("densityFactor") ? "register-densityFactor-error" : undefined}
                                    className={registerInputClass("densityFactor")}
                                />
                                {registerErrorMessage("densityFactor")}
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Expected Yield (%) <span className="text-red-500">*</span></label>
                                <input
                                    id="register-expectedYield"
                                    type="number"
                                    required
                                    placeholder="e.g. 100"
                                    value={registerForm.expectedYield}
                                    onChange={e => updateRegisterField("expectedYield", e.target.value)}
                                    aria-invalid={!!registerError("expectedYield")}
                                    aria-describedby={registerError("expectedYield") ? "register-expectedYield-error" : undefined}
                                    className={registerInputClass("expectedYield")}
                                />
                                {registerErrorMessage("expectedYield")}
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Shelf Life (Days) <span className="text-red-500">*</span></label>
                                <input
                                    id="register-shelfLife"
                                    type="number"
                                    placeholder="e.g. 365"
                                    value={registerForm.shelfLife}
                                    onChange={e => updateRegisterField("shelfLife", e.target.value)}
                                    aria-invalid={!!registerError("shelfLife")}
                                    aria-describedby={registerError("shelfLife") ? "register-shelfLife-error" : undefined}
                                    className={registerInputClass("shelfLife")}
                                />
                                {registerErrorMessage("shelfLife")}
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Segment (Optional)</label>
                                <CreatableSelect
                                    options={segmentOptions}
                                    value={registerForm.segmentId}
                                    onValueChange={(val) => setRegisterForm(prev => ({ ...prev, segmentId: val }))}
                                    placeholder="Select segment..."
                                    onCreateOption={async (name) => {
                                        const newId = await handleCreateSegment(name);
                                        if (newId) setRegisterForm(prev => ({ ...prev, segmentId: String(newId) }));
                                    }}
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Class (Optional)</label>
                                <CreatableSelect
                                    options={classOptions}
                                    value={registerForm.classId}
                                    onValueChange={(val) => setRegisterForm(prev => ({ ...prev, classId: val }))}
                                    placeholder="Select class..."
                                    onCreateOption={async (name) => {
                                        const newId = await handleCreateClass(name);
                                        if (newId) setRegisterForm(prev => ({ ...prev, classId: String(newId) }));
                                    }}
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Section (Optional)</label>
                                <CreatableSelect
                                    options={sectionOptions}
                                    value={registerForm.sectionId}
                                    onValueChange={(val) => setRegisterForm(prev => ({ ...prev, sectionId: val }))}
                                    placeholder="Select section..."
                                    onCreateOption={async (name) => {
                                        const newId = await handleCreateSection(name);
                                        if (newId) setRegisterForm(prev => ({ ...prev, sectionId: String(newId) }));
                                    }}
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Product Image</label>
                                <div className="flex items-center gap-4 border border-dashed border-border rounded-xl p-4 bg-muted/5 hover:bg-muted/10 transition-all">
                                    {registerForm.productImage ? (
                                        <div className="relative group w-16 h-16 rounded-lg overflow-hidden border bg-background flex items-center justify-center">
                                            <img
                                                src={`${process.env.NEXT_PUBLIC_DIRECTUS_URL || process.env.NEXT_PUBLIC_API_BASE_URL || ""}/assets/${registerForm.productImage}`}
                                                alt="Preview"
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    if (target.src.includes("/assets/")) {
                                                        target.src = "/placeholder-image.png";
                                                    }
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    const oldId = registerForm.productImage;
                                                    setRegisterForm(prev => ({ ...prev, productImage: "" }));
                                                    setRegisterImagePreview(null);
                                                    setRegisterImageError(null);
                                                    if (oldId && oldId.length > 10) {
                                                        try {
                                                            await fetch(`/api/manufacturing/files?id=${oldId}`, { method: "DELETE" });
                                                        } catch (err) {
                                                            console.error("Failed to delete file", err);
                                                        }
                                                    }
                                                }}
                                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[10px] font-bold transition-all uppercase"
                                            >
                                                Remove
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="w-16 h-16 rounded-lg bg-muted/20 border flex items-center justify-center text-muted-foreground/45">
                                            <ImageIcon className="h-5 w-5" />
                                        </div>
                                    )}

                                    <div className="flex-1 space-y-1">
                                        <p className="text-xs font-medium text-foreground">
                                            {registerForm.productImage ? "Image uploaded successfully" : "Select a product image"}
                                        </p>
                                        <label className="inline-flex items-center justify-center rounded-lg border bg-background hover:bg-muted text-foreground px-2.5 py-1 text-xs font-semibold cursor-pointer transition-all">
                                            <span>{uploadingRegImage ? "Uploading..." : "Choose File"}</span>
                                            <input
                                                type="file"
                                                accept="image/*"
                                                disabled={uploadingRegImage}
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;
                                                    const input = e.currentTarget;
                                                    setUploadingRegImage(true);
                                                    setRegisterImageError(null);
                                                    try {
                                                        const newFileId = await uploadProductImage(file);
                                                        setRegisterForm(prev => ({ ...prev, productImage: newFileId }));
                                                        setRegisterImagePreview(URL.createObjectURL(file));
                                                        toast.success("Product image uploaded successfully.");
                                                    } catch (err) {
                                                        const message = err instanceof Error ? err.message : "Failed to upload product image.";
                                                        setRegisterImageError(message);
                                                        toast.error(message);
                                                    } finally {
                                                        setUploadingRegImage(false);
                                                        input.value = "";
                                                    }
                                                }}
                                                className="hidden"
                                            />
                                        </label>
                                        {registerImageError && (
                                            <p className="text-[10px] text-destructive" role="alert">
                                                {registerImageError}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Group 3: Financials & Suppliers */}
                    <div className="bg-muted/10 border border-border/40 rounded-xl p-4 space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                            <Briefcase className="h-3.5 w-3.5" /> 3. Financials &amp; Suppliers
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Target Selling Price (₱)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="e.g. 150.00"
                                    value={registerForm.targetSellingPrice}
                                    onChange={e => setRegisterForm(prev => ({ ...prev, targetSellingPrice: e.target.value }))}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Cost Per Unit (₱)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="e.g. 110.00"
                                    value={registerForm.costPerUnit}
                                    onChange={e => setRegisterForm(prev => ({ ...prev, costPerUnit: e.target.value }))}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                />
                            </div>
                            <div className="col-span-2 space-y-2">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block">Suppliers (Select multiple)</label>
                                <div className="flex flex-wrap gap-1.5 mb-1.5 min-h-[32px] p-2 bg-background border border-dashed rounded-lg">
                                    {registerForm.supplierIds.map(supId => {
                                        const name = suppliers.find(s => String(s.id) === String(supId))?.supplier_name || `Supplier #${supId}`;
                                        return (
                                            <span key={supId} className="bg-primary/10 text-primary border border-primary/20 rounded-full pl-2.5 pr-1 py-0.5 text-xs inline-flex items-center gap-1 font-semibold transition-all hover:bg-primary/15">
                                                {name}
                                                <button
                                                    type="button"
                                                    onClick={() => setRegisterForm(prev => ({
                                                        ...prev,
                                                        supplierIds: prev.supplierIds.filter(id => id !== supId)
                                                    }))}
                                                    className="text-primary hover:text-red-500 font-bold w-4 h-4 rounded-full flex items-center justify-center hover:bg-muted transition-colors"
                                                >
                                                    &times;
                                                </button>
                                            </span>
                                        );
                                    })}
                                    {registerForm.supplierIds.length === 0 && (
                                        <span className="text-xs text-muted-foreground/60 italic self-center">No suppliers mapped to this product yet</span>
                                    )}
                                </div>
                                <CreatableSelect
                                    options={suppliers
                                        .filter(s => !registerForm.supplierIds.includes(String(s.id)))
                                        .map(s => ({
                                            value: String(s.id),
                                            label: s.supplier_name,
                                        }))}
                                    value=""
                                    onValueChange={(val) => {
                                        if (!registerForm.supplierIds.includes(val)) {
                                            setRegisterForm(prev => ({
                                                ...prev,
                                                supplierIds: [...prev.supplierIds, val]
                                            }));
                                        }
                                    }}
                                    placeholder="Choose Supplier to Add..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* Group 4: Version Name */}
                    <div className="bg-muted/10 border border-border/40 rounded-xl p-4 space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5" /> 4. BOM Initial Version
                        </h4>
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Initial Version Name <span className="text-red-500">*</span></label>
                            <input
                                id="register-versionName"
                                type="text"
                                required
                                placeholder="e.g. OIL 1ST VERSION"
                                value={registerForm.versionName}
                                onChange={e => updateRegisterField("versionName", e.target.value)}
                                aria-invalid={!!registerError("versionName")}
                                aria-describedby={registerError("versionName") ? "register-versionName-error" : undefined}
                                className={registerInputClass("versionName")}
                            />
                            {registerErrorMessage("versionName")}
                        </div>
                    </div>

                    {/* Footer Buttons */}
                    <div className="flex justify-end gap-3 pt-3 border-t shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors text-muted-foreground"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={savingBOM}
                            className="px-4 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-lg text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/20"
                        >
                            {savingBOM ? "Registering..." : "Register Product"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
