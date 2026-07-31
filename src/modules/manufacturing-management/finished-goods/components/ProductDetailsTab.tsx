import React from "react";
import { toast } from "sonner";
import { Product, Brand, Category, Unit, ProductClass, ProductSegment, ProductSection } from "../types";
import { CreatableSelect } from "./CreatableSelect";
import { getProductImageUrl, uploadProductImage } from "../services/product-image";
import { 
    Tag, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    Layers, 
    Scale, 
    Calendar, 
    Image as ImageIcon, 
    DollarSign, 
    Package, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    FileText, 
    Activity,
    GitBranch,
    Sliders
} from "lucide-react";

interface ProductDetailsTabProps {
    editedDetails: Partial<Product>;
    editFieldErrors: Record<string, string>;
    handleDetailChange: (field: keyof Product, value: unknown) => void;
    customOverhead: number;
    handleCustomOverheadChange: (value: number) => void;
    selectedProduct: Product;
    units: Unit[];
    brands: Brand[];
    categories: Category[];
    classes: ProductClass[];
    segments: ProductSegment[];
    sections: ProductSection[];
    handleCreateBrand: (name: string) => Promise<number | undefined>;
    handleCreateCategory: (name: string) => Promise<number | undefined>;
    handleCreateClass: (name: string) => Promise<number | undefined>;
    handleCreateSegment: (name: string) => Promise<number | undefined>;
    handleCreateSection: (name: string) => Promise<number | undefined>;
    products: Product[];
}

export const ProductDetailsTab: React.FC<ProductDetailsTabProps> = ({
    editedDetails,
    editFieldErrors,
    handleDetailChange,
    customOverhead,
    handleCustomOverheadChange,
    selectedProduct,
    units,
    brands,
    categories,
    classes,
    segments,
    sections,
    handleCreateBrand,
    handleCreateCategory,
    handleCreateClass,
    handleCreateSegment,
    handleCreateSection,
    products
}) => {
    const [uploadingImage, setUploadingImage] = React.useState(false);
    const [imagePreview, setImagePreview] = React.useState<string | null>(null);
    const [imageUploadError, setImageUploadError] = React.useState<string | null>(null);
    const fieldError = (field: string) => editFieldErrors[field];

    React.useEffect(() => {
        setImagePreview(null);
        setImageUploadError(null);
    }, [selectedProduct.id]);

    React.useEffect(() => {
        return () => {
            if (imagePreview) URL.revokeObjectURL(imagePreview);
        };
    }, [imagePreview]);

    const parentOptions = React.useMemo(() => {
        const baseOptions = products
            .filter((p) => p.id !== selectedProduct.id && !p.parent_id)
            .map((p) => ({
                value: String(p.id),
                label: `${p.title} (${p.sku}) - ${p.baseUom}`
            }));
        return [
            { value: "", label: "None (This is a parent product)" },
            ...baseOptions
        ];
    }, [products, selectedProduct.id]);

    const uomOptions = React.useMemo(() => {
        if (!units || units.length === 0) {
            return [
                { value: "L", label: "Liter (L)" },
                { value: "KG", label: "Kilogram (KG)" },
                { value: "PCS", label: "Piece (PCS)" }
            ];
        }
        return units.map((u) => ({
            value: u.unit_shortcut,
            label: `${u.unit_name} (${u.unit_shortcut})`
        }));
    }, [units]);

    const isParent = !selectedProduct.parent_id;
    
    const familyChildren = React.useMemo(() => {
        return products.filter(p => String(p.parent_id) === String(selectedProduct.id));
    }, [products, selectedProduct.id]);
    
    const parentProductObj = React.useMemo(() => {
        if (!selectedProduct.parent_id) return null;
        return products.find(p => String(p.id) === String(selectedProduct.parent_id)) || null;
    }, [products, selectedProduct.parent_id]);
    
    const siblingProducts = React.useMemo(() => {
        if (!selectedProduct.parent_id) return [];
        return products.filter(p => String(p.parent_id) === String(selectedProduct.parent_id));
    }, [products, selectedProduct.parent_id]);

    const brandOptions = React.useMemo(() => {
        return brands.map((b) => ({
            value: String(b.brand_id),
            label: b.brand_name
        }));
    }, [brands]);

    const categoryOptions = React.useMemo(() => {
        return categories.map((c) => ({
            value: String(c.category_id),
            label: c.category_name
        }));
    }, [categories]);

    const segmentOptions = React.useMemo(() => {
        return segments.map((s) => ({
            value: String(s.segment_id),
            label: s.segment_name
        }));
    }, [segments]);

    const classOptions = React.useMemo(() => {
        return classes.map((c) => ({
            value: String(c.class_id),
            label: c.class_name
        }));
    }, [classes]);

    const sectionOptions = React.useMemo(() => {
        return sections.map((s) => ({
            value: String(s.section_id),
            label: s.section_name
        }));
    }, [sections]);

    return (
        <div className="max-w-4xl space-y-6">
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                        <Package className="h-5 w-5 text-primary" /> Product Details
                    </h2>
                    {selectedProduct.parentProduct && (
                        <span className="bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
                            Parent Product
                        </span>
                    )}
                </div>
                <p className="text-xs text-muted-foreground">Manage hierarchy, measurements, and cost metrics for this finished good.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Identity & Classification Card */}
                <div className="bg-card/55 border border-border/80 rounded-xl p-5 shadow-sm space-y-4">
                    <h3 className="text-sm font-semibold text-foreground border-b pb-2 flex items-center gap-2">
                        <Tag className="h-4 w-4 text-primary/80" /> Identity & Classification
                    </h3>
                    
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-muted-foreground uppercase">Product Title <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={editedDetails.title || ""}
                                    onChange={e => handleDetailChange("title", e.target.value)}
                                    aria-invalid={!!fieldError("title")}
                                    aria-describedby={fieldError("title") ? "edit-title-error" : undefined}
                                    className={`w-full rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all ${fieldError("title") ? "border-red-500 focus:ring-red-500" : "border-border"}`}
                                />
                                {fieldError("title") && <p id="edit-title-error" className="text-[10px] text-red-600" role="alert">{fieldError("title")}</p>}
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase">SKU / Code <span className="text-red-500">*</span></label>
                                <input 
                                    type="text" 
                                    required
                                    value={editedDetails.sku || ""} 
                                    onChange={e => handleDetailChange("sku", e.target.value)}
                                    aria-invalid={!!fieldError("sku")}
                                    aria-describedby={fieldError("sku") ? "edit-sku-error" : undefined}
                                    className={`w-full rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all ${fieldError("sku") ? "border-red-500 focus:ring-red-500" : "border-border"}`}
                                />
                                {fieldError("sku") && (
                                    <p id="edit-sku-error" className="text-[10px] text-red-600" role="alert">
                                        {fieldError("sku")}
                                    </p>
                                )}
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase">Barcode / EAN</label>
                                <input 
                                    type="text" 
                                    value={editedDetails.barcode || ""} 
                                    onChange={e => handleDetailChange("barcode", e.target.value)}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase">Brand <span className="text-red-500">*</span></label>
                                <CreatableSelect
                                    options={brandOptions}
                                    value={editedDetails.product_brand ? String(editedDetails.product_brand) : ""}
                                    onValueChange={(val) => handleDetailChange("product_brand", val ? Number(val) : undefined)}
                                    placeholder="Select brand..."
                                    aria-invalid={!!fieldError("productBrand")}
                                    aria-describedby={fieldError("productBrand") ? "edit-brand-error" : undefined}
                                    className={fieldError("productBrand") ? "border-red-500" : undefined}
                                    onCreateOption={async (name) => {
                                        const newId = await handleCreateBrand(name);
                                        if (newId) handleDetailChange("product_brand", newId);
                                    }}
                                />
                                {fieldError("productBrand") && <p id="edit-brand-error" className="text-[10px] text-red-600" role="alert">{fieldError("productBrand")}</p>}
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase">Category <span className="text-red-500">*</span></label>
                                <CreatableSelect
                                    options={categoryOptions}
                                    value={editedDetails.product_category ? String(editedDetails.product_category) : ""}
                                    onValueChange={(val) => handleDetailChange("product_category", val ? Number(val) : undefined)}
                                    placeholder="Select category..."
                                    aria-invalid={!!fieldError("productCategory")}
                                    aria-describedby={fieldError("productCategory") ? "edit-category-error" : undefined}
                                    className={fieldError("productCategory") ? "border-red-500" : undefined}
                                    onCreateOption={async (name) => {
                                        const newId = await handleCreateCategory(name);
                                        if (newId) handleDetailChange("product_category", newId);
                                    }}
                                />
                                {fieldError("productCategory") && <p id="edit-category-error" className="text-[10px] text-red-600" role="alert">{fieldError("productCategory")}</p>}
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-muted-foreground uppercase">Parent Product (Optional)</label>
                            <CreatableSelect
                                options={parentOptions}
                                value={editedDetails.parent_id ? String(editedDetails.parent_id) : ""}
                                onValueChange={(val) => handleDetailChange("parent_id", val ? Number(val) : null)}
                                placeholder="Select parent product..."
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase">Segment</label>
                                <CreatableSelect
                                    options={segmentOptions}
                                    value={editedDetails.product_segment ? String(editedDetails.product_segment) : ""}
                                    onValueChange={(val) => handleDetailChange("product_segment", val ? Number(val) : undefined)}
                                    placeholder="Segment..."
                                    onCreateOption={async (name) => {
                                        const newId = await handleCreateSegment(name);
                                        if (newId) handleDetailChange("product_segment", newId);
                                    }}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase">Class</label>
                                <CreatableSelect
                                    options={classOptions}
                                    value={editedDetails.product_class ? String(editedDetails.product_class) : ""}
                                    onValueChange={(val) => handleDetailChange("product_class", val ? Number(val) : undefined)}
                                    placeholder="Class..."
                                    onCreateOption={async (name) => {
                                        const newId = await handleCreateClass(name);
                                        if (newId) handleDetailChange("product_class", newId);
                                    }}
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase">Section</label>
                                <CreatableSelect
                                    options={sectionOptions}
                                    value={editedDetails.product_section ? String(editedDetails.product_section) : ""}
                                    onValueChange={(val) => handleDetailChange("product_section", val ? Number(val) : undefined)}
                                    placeholder="Section..."
                                    onCreateOption={async (name) => {
                                        const newId = await handleCreateSection(name);
                                        if (newId) handleDetailChange("product_section", newId);
                                    }}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[11px] font-bold text-muted-foreground uppercase">Product Image</label>
                            <div className="flex items-center gap-4 border border-dashed border-border rounded-xl p-4 bg-muted/5 hover:bg-muted/10 transition-all">
                                {editedDetails.product_image ? (
                                    <div className="relative group w-20 h-20 rounded-lg overflow-hidden border bg-background flex items-center justify-center">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img 
                                            src={imagePreview || getProductImageUrl(String(editedDetails.product_image))}
                                            alt="Preview" 
                                            className="w-full h-full object-cover"
                                            onError={(e) => {
                                                const target = e.target as HTMLImageElement;
                                                if (target.src.includes("/assets/")) {
                                                    // Fallback if not a UUID
                                                    target.src = "/placeholder-image.png";
                                                }
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const oldId = editedDetails.product_image;
                                                handleDetailChange("product_image", undefined);
                                                setImagePreview(null);
                                                setImageUploadError(null);
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
                                    <div className="w-20 h-20 rounded-lg bg-muted/20 border flex items-center justify-center text-muted-foreground/45">
                                        <ImageIcon className="h-6 w-6" />
                                    </div>
                                )}
                                
                                <div className="flex-1 space-y-1">
                                    <p className="text-xs font-medium text-foreground">
                                        {editedDetails.product_image ? "Image uploaded successfully" : "Select a product image"}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground">PNG, JPG, or WEBP up to 5MB</p>
                                    <label className="inline-flex items-center justify-center rounded-lg border bg-background hover:bg-muted text-foreground px-3 py-1.5 text-xs font-semibold cursor-pointer transition-all">
                                        <span>{uploadingImage ? "Uploading..." : "Choose File"}</span>
                                        <input 
                                            type="file" 
                                            accept="image/*"
                                            disabled={uploadingImage}
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                const input = e.currentTarget;
                                                setUploadingImage(true);
                                                setImageUploadError(null);
                                                try {
                                                    const newFileId = await uploadProductImage(file);
                                                    handleDetailChange("product_image", newFileId);
                                                    setImagePreview(URL.createObjectURL(file));
                                                    toast.success("Product image uploaded successfully.");
                                                } catch (err) {
                                                    const message = err instanceof Error ? err.message : "Failed to upload product image.";
                                                    setImageUploadError(message);
                                                    toast.error(message);
                                                } finally {
                                                    setUploadingImage(false);
                                                    input.value = "";
                                                }
                                            }}
                                            className="hidden"
                                        />
                                    </label>
                                    {imageUploadError && (
                                        <p className="text-[10px] text-destructive" role="alert">
                                            {imageUploadError}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-[11px] font-bold text-muted-foreground uppercase">Short Description</label>
                            <textarea 
                                rows={2}
                                value={editedDetails.description || ""} 
                                onChange={e => handleDetailChange("description", e.target.value)}
                                className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary resize-none transition-all"
                            />
                            {selectedProduct.identityKey && (
                                <p className="text-[10px] text-muted-foreground">
                                    System identity: {selectedProduct.identityKey}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Physical Specifications & Lifespan Card */}
                <div className="space-y-6">
                    <div className="bg-card/55 border border-border/80 rounded-xl p-5 shadow-sm space-y-4">
                        <h3 className="text-sm font-semibold text-foreground border-b pb-2 flex items-center gap-2">
                            <Scale className="h-4 w-4 text-primary/80" /> Measurements & Physicals
                        </h3>
                        
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase">Base UOM <span className="text-red-500">*</span></label>
                                <CreatableSelect
                                    options={uomOptions}
                                    value={editedDetails.baseUom || ""}
                                    onValueChange={(val) => handleDetailChange("baseUom", val)}
                                    placeholder="Select Base UOM..."
                                    aria-invalid={!!fieldError("unit_of_measurement")}
                                    aria-describedby={fieldError("unit_of_measurement") ? "edit-uom-error" : undefined}
                                    className={fieldError("unit_of_measurement") ? "border-red-500" : undefined}
                                />
                                {fieldError("unit_of_measurement") && <p id="edit-uom-error" className="text-[10px] text-red-600" role="alert">{fieldError("unit_of_measurement")}</p>}
                            </div>

                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase">UOM Count (Pack Multiplier) <span className="text-red-500">*</span></label>
                                <input 
                                    type="number" 
                                    required
                                    value={editedDetails.unit_of_measurement_count || ""} 
                                    onChange={e => {
                                        const valStr = e.target.value;
                                        const valNum = valStr ? Number(valStr) : undefined;
                                        handleDetailChange("unit_of_measurement_count", valNum);
                                        
                                        if (valNum !== undefined && editedDetails.parent_id) {
                                            const parent = products.find(p => String(p.id) === String(editedDetails.parent_id));
                                            if (parent) {
                                                handleDetailChange("targetSellingPrice", (parent.targetSellingPrice || 0) * valNum);
                                                if (parent.cost_per_unit) {
                                                    handleDetailChange("cost_per_unit", parent.cost_per_unit * valNum);
                                                }
                                            }
                                        }
                                    }}
                                    aria-invalid={!!fieldError("unitOfMeasurementCount")}
                                    aria-describedby={fieldError("unitOfMeasurementCount") ? "edit-uom-count-error" : undefined}
                                    className={`w-full rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all ${fieldError("unitOfMeasurementCount") ? "border-red-500 focus:ring-red-500" : "border-border"}`}
                                />
                                {fieldError("unitOfMeasurementCount") && <p id="edit-uom-count-error" className="text-[10px] text-red-600" role="alert">{fieldError("unitOfMeasurementCount")}</p>}
                            </div>

                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase">Density Factor (KG/L) <span className="text-red-500">*</span></label>
                                <input 
                                    type="number" 
                                    step="0.001"
                                    required
                                    value={editedDetails.densityFactor !== undefined ? editedDetails.densityFactor : ""}
                                    onChange={e => handleDetailChange("densityFactor", e.target.value === "" ? undefined : Number(e.target.value))}
                                    aria-invalid={!!fieldError("densityFactor")}
                                    aria-describedby={fieldError("densityFactor") ? "edit-density-error" : undefined}
                                    className={`w-full rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all ${fieldError("densityFactor") ? "border-red-500 focus:ring-red-500" : "border-border"}`}
                                />
                                {fieldError("densityFactor") && <p id="edit-density-error" className="text-[10px] text-red-600" role="alert">{fieldError("densityFactor")}</p>}
                            </div>

                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase">Expected Yield % <span className="text-red-500">*</span></label>
                                <div className="relative">
                                    <Activity className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                                    <input 
                                    type="number"
                                    step="0.1"
                                    required
                                    value={editedDetails.expectedYieldPercent ?? ""}
                                    onChange={e => handleDetailChange("expectedYieldPercent", e.target.value === "" ? undefined : Number(e.target.value))}
                                    aria-invalid={!!fieldError("expected_yield_percentage")}
                                    aria-describedby={fieldError("expected_yield_percentage") ? "edit-yield-error" : undefined}
                                    className={`w-full rounded-lg border bg-background pl-9 pr-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all ${fieldError("expected_yield_percentage") ? "border-red-500 focus:ring-red-500" : "border-border"}`}
                                />
                                {fieldError("expected_yield_percentage") && <p id="edit-yield-error" className="text-[10px] text-red-600" role="alert">{fieldError("expected_yield_percentage")}</p>}
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                                    <Calendar className="h-3 w-3 text-muted-foreground" /> Shelf Life (Days) <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    type="number" 
                                    required
                                    value={editedDetails.product_shelf_life || ""} 
                                    onChange={e => handleDetailChange("product_shelf_life", e.target.value ? Number(e.target.value) : undefined)}
                                    aria-invalid={!!fieldError("productShelfLife")}
                                    aria-describedby={fieldError("productShelfLife") ? "edit-shelf-life-error" : undefined}
                                    className={`w-full rounded-lg border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all ${fieldError("productShelfLife") ? "border-red-500 focus:ring-red-500" : "border-border"}`}
                                    placeholder="e.g. 365"
                                />
                                {fieldError("productShelfLife") && <p id="edit-shelf-life-error" className="text-[10px] text-red-600" role="alert">{fieldError("productShelfLife")}</p>}
                            </div>

                        </div>
                    </div>

                    {/* Financial Configurations Card */}
                    <div className="bg-card/55 border border-border/80 rounded-xl p-5 shadow-sm space-y-4">
                        <h3 className="text-sm font-semibold text-foreground border-b pb-2 flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-primary/80" /> Financials & Overheads
                        </h3>
                        
                        <div className="grid grid-cols-3 gap-3">
                            <div className="space-y-1 col-span-3">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase">Cost Per Unit (₱)</label>
                                <input 
                                    type="number" 
                                    step="0.01"
                                    value={editedDetails.cost_per_unit || ""} 
                                    onChange={e => handleDetailChange("cost_per_unit", e.target.value ? parseFloat(e.target.value) : undefined)}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                />
                            </div>

                            <div className="space-y-1 col-span-3">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase">Target Selling Price (₱)</label>
                                <input 
                                    type="number" 
                                    step="0.01"
                                    value={editedDetails.targetSellingPrice || 0} 
                                    onChange={e => handleDetailChange("targetSellingPrice", parseFloat(e.target.value) || 0)}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                />
                            </div>

                            <div className="space-y-1 col-span-3">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase">Custom Overhead Rate (₱)</label>
                                <input 
                                    type="number" 
                                    step="0.01"
                                    value={customOverhead}
                                    min="0"
                                    onChange={e => handleCustomOverheadChange(e.target.value === "" ? 0 : parseFloat(e.target.value))}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Product Family Tree Card */}
                <div className="bg-card/55 border border-border/80 rounded-xl p-5 shadow-sm space-y-4 md:col-span-2">
                    <h3 className="text-sm font-semibold text-foreground border-b pb-2 flex items-center gap-2">
                        <GitBranch className="h-4 w-4 text-primary/80" /> Product Family Tree
                    </h3>
                    <div className="space-y-4">
                        {isParent ? (
                            <div className="space-y-3">
                                {/* Parent Node */}
                                <div className="flex items-center gap-2.5 bg-primary/5 border border-primary/20 rounded-lg p-3">
                                    <Package className="h-4 w-4 text-primary" />
                                    <div>
                                        <p className="text-xs font-bold text-primary">{selectedProduct.title} (Parent)</p>
                                        <p className="text-[10px] text-muted-foreground">SKU: {selectedProduct.sku || "N/A"} • Base UOM: {selectedProduct.baseUom}</p>
                                    </div>
                                </div>
                                
                                {/* Connector & Children */}
                                <div className="pl-4 ml-5 border-l-2 border-dashed border-border/80 py-1 space-y-2">
                                    {familyChildren.length > 0 ? (
                                        familyChildren.map(child => (
                                            <div key={child.id} className="flex items-center gap-2 bg-muted/45 border border-border/40 rounded-lg p-2.5 hover:bg-muted/65 transition-all">
                                                <Sliders className="h-3.5 w-3.5 text-muted-foreground/60" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] font-semibold text-foreground truncate">{child.title}</p>
                                                    <p className="text-[9px] text-muted-foreground">SKU: {child.sku || "N/A"} • Variant UOM: {child.baseUom}</p>
                                                </div>
                                                <div className="text-[11px] font-bold text-foreground bg-muted px-2 py-0.5 rounded">
                                                    ₱{child.targetSellingPrice.toFixed(2)}
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="flex flex-col items-center justify-center p-6 border border-dashed rounded-lg bg-muted/10 text-muted-foreground">
                                            <p className="text-[11px] font-medium italic">No child configurations registered for this parent yet.</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* Parent Node */}
                                {parentProductObj && (
                                    <div className="flex items-center gap-2.5 bg-muted/50 border border-border rounded-lg p-3">
                                        <Package className="h-4 w-4 text-muted-foreground/80" />
                                        <div>
                                            <p className="text-xs font-bold text-foreground">{parentProductObj.title} (Parent)</p>
                                            <p className="text-[10px] text-muted-foreground">SKU: {parentProductObj.sku || "N/A"} • Base UOM: {parentProductObj.baseUom}</p>
                                        </div>
                                    </div>
                                )}
                                
                                {/* Connector & Sibling Variants */}
                                <div className="pl-4 ml-5 border-l-2 border-dashed border-border/80 py-1 space-y-2">
                                    {siblingProducts.map(sibling => {
                                        const isCurrent = sibling.id === selectedProduct.id;
                                        return (
                                            <div 
                                                key={sibling.id} 
                                                className={`flex items-center gap-2 border p-2.5 rounded-lg transition-all ${
                                                    isCurrent 
                                                        ? "bg-primary/5 border-primary/20 ring-1 ring-primary/10" 
                                                        : "bg-muted/30 border-border/40 hover:bg-muted/50"
                                                }`}
                                            >
                                                <Sliders className={`h-3.5 w-3.5 ${isCurrent ? "text-primary" : "text-muted-foreground/60"}`} />
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-[11px] font-semibold truncate ${isCurrent ? "text-primary" : "text-foreground"}`}>
                                                        {sibling.title} {isCurrent && <span className="text-[9px] font-bold text-primary/80 uppercase ml-1">(Current)</span>}
                                                    </p>
                                                    <p className="text-[9px] text-muted-foreground">SKU: {sibling.sku || "N/A"} • Variant UOM: {sibling.baseUom}</p>
                                                </div>
                                                <div className="text-[11px] font-bold text-foreground bg-muted px-2 py-0.5 rounded">
                                                    ₱{sibling.targetSellingPrice.toFixed(2)}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

