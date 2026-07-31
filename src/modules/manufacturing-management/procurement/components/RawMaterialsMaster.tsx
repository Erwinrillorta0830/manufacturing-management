/* eslint-disable */
import React, { useState, useEffect, useMemo } from "react";
import { RawMaterial, Supplier, RegisterRawMaterialPayload, PackagingVariant } from "../types";
import { Search, Layers, ChevronDown, ChevronUp, MapPin, Bookmark, AlertTriangle, Plus, X, Loader2, Info, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CreatableSelect } from "../../finished-goods/components/CreatableSelect";
import { fetchProductInventoryDetails } from "../services/procurement-api";

interface RawMaterialsMasterProps {
    rawMaterials: RawMaterial[];
    suppliers: Supplier[];
    loadingItems: boolean;
    onRegisterRawMaterial: (productDetails: RegisterRawMaterialPayload, supplierIds: number[], packagingVariants?: PackagingVariant[]) => Promise<boolean>;
    onUpdateRawMaterial: (productId: number, productDetails: RegisterRawMaterialPayload, supplierIds: number[], packagingVariants?: PackagingVariant[]) => Promise<boolean>;
}

interface UnitOption {
    unit_id: number;
    unit_name: string;
    unit_shortcut: string;
}

interface SelectOption {
    value: string;
    label: string;
}

export default function RawMaterialsMaster({
    rawMaterials,
    suppliers,
    loadingItems,
    onRegisterRawMaterial,
    onUpdateRawMaterial
}: RawMaterialsMasterProps) {
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState<"all" | "raw" | "pkg">("all");
    const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
    const [loadingBatches, setLoadingBatches] = useState(false);
    // disabled-lint-next-line @typescript-eslint/no-explicit-any
    const [productBatches, setProductBatches] = useState<any[]>([]);

    // Modal State & Mode
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<RawMaterial | null>(null); // null = Register, non-null = Edit
    const [saving, setSaving] = useState(false);
    const [units, setUnits] = useState<UnitOption[]>([]);
    const [weightUnits, setWeightUnits] = useState<Array<{ id: number; code: string; name: string }>>([]);
    const [loadingUnits, setLoadingUnits] = useState(false);
    const [brandsList, setBrandsList] = useState<SelectOption[]>([]);
    const [categoriesList, setCategoriesList] = useState<SelectOption[]>([]);
    const [showValidationErrors, setShowValidationErrors] = useState(false);

    // Form fields
    const [formName, setFormName] = useState("");
    const [formCode, setFormCode] = useState("");
    const [formDesc, setFormDesc] = useState("");
    const [formUom, setFormUom] = useState<number | "">("");
    const [formDensity, setFormDensity] = useState("1.000");
    const [formWeight, setFormWeight] = useState("");
    const [formWeightUnitId, setFormWeightUnitId] = useState<number | "">("");
    const [formBrand, setFormBrand] = useState("");
    const [formCategory, setFormCategory] = useState("");
    const [formProductType, setFormProductType] = useState<number>(389);
    const [formParentId, setFormParentId] = useState<string>("");
    const [formUomCount, setFormUomCount] = useState<string>("1");
    const [selectedSupplierIds, setSelectedSupplierIds] = useState<number[]>([]);
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
    const [supplierSearch, setSupplierSearch] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Reset pagination to page 1 on search or filter change
    useEffect(() => {
        setPage(1);
    }, [search, typeFilter]);
    const [packagingVariants, setPackagingVariants] = useState<Array<{ uomId: number | ""; count: string; codeSuffix: string }>>([]);

    const uomOptions = useMemo(() => {
        return units.map(u => ({
            value: String(u.unit_id),
            label: `${u.unit_name} (${u.unit_shortcut})`
        }));
    }, [units]);

    const weightUnitOptions = useMemo(() => {
        return weightUnits.map(u => ({
            value: String(u.id),
            label: `${u.code} (${u.name})`
        }));
    }, [weightUnits]);

    const parentProductOptions = useMemo(() => {
        return rawMaterials
            .filter(rm => {
                if (editingItem && Number(rm.product_id) === Number(editingItem.product_id)) return false;
                return !rm.parent_id;
            })
            .map(rm => ({
                value: String(rm.product_id),
                label: `${rm.product_name} (${rm.product_code || `ID-${rm.product_id}`})`
            }));
    }, [rawMaterials, editingItem]);

    const handleAddVariant = () => {
        setPackagingVariants([...packagingVariants, { uomId: formUom || "", count: "1", codeSuffix: "" }]);
    };

    const handleUpdateVariant = (index: number, field: string, value: any) => {
        const copy = [...packagingVariants];
        copy[index] = { ...copy[index], [field]: value };
        setPackagingVariants(copy);
    };

    const handleRemoveVariant = (index: number) => {
        setPackagingVariants(packagingVariants.filter((_, i) => i !== index));
    };

    // Load metadata lists on modal mount
    useEffect(() => {
        if (!isModalOpen) return;
        setLoadingUnits(true);

        Promise.all([
            fetch("/api/manufacturing/finished-goods/units").then(res => res.json()),
            fetch("/api/manufacturing/finished-goods/brands").then(res => res.json()),
            fetch("/api/manufacturing/finished-goods/categories").then(res => res.json()),
            fetch("/api/manufacturing/finished-goods/weight-units").then(res => res.json())
        ])
            .then(([unitsData, brandsData, categoriesData, weightUnitsData]) => {
                setUnits(unitsData || []);
                const wUnits = (weightUnitsData || []) as Array<{ id: number; code: string; name: string }>;
                setWeightUnits(wUnits);

                // Auto-select UOM and Weight Unit if in Register mode
                if (!editingItem) {
                    if (unitsData && unitsData.length > 0) setFormUom(unitsData[0].unit_id);
                    if (wUnits && wUnits.length > 0) {
                        const kgUnit = wUnits.find(u => u.code.toLowerCase() === "kg" || u.name.toLowerCase().includes("kilo"));
                        setFormWeightUnitId(kgUnit ? kgUnit.id : wUnits[0].id);
                    }
                }
                // disabled-lint-next-line @typescript-eslint/no-explicit-any
                setBrandsList((brandsData || []).map((b: any) => ({ value: String(b.brand_id), label: b.brand_name })));
                // disabled-lint-next-line @typescript-eslint/no-explicit-any
                setCategoriesList((categoriesData || []).map((c: any) => ({ value: String(c.category_id), label: c.category_name })));
            })
            .catch(err => {
                console.error("Failed to load raw material metadata:", err);
                toast.error("Failed to load options metadata");
            })
            .finally(() => {
                setLoadingUnits(false);
            });
    }, [isModalOpen, editingItem]);

    // Reset/Populate form fields depending on Register/Edit mode
    useEffect(() => {
        if (!isModalOpen) {
            setEditingItem(null);
            setFormName("");
            setFormCode("");
            setFormDesc("");
            setFormDensity("1.000");
            setFormWeight("");
            setFormWeightUnitId("");
            setFormBrand("");
            setFormCategory("");
            setFormProductType(389);
            setFormParentId("");
            setFormUomCount("1");
            setSelectedSupplierIds([]);
            setSupplierSearch("");
            setShowValidationErrors(false);
            setPackagingVariants([]);
        } else if (editingItem) {
            setFormName(editingItem.product_name || "");
            setFormCode(editingItem.product_code || "");
            setFormDesc(editingItem.description || "");
            setFormUom(editingItem.unit_of_measurement?.unit_id || "");
            setFormDensity(String(editingItem.density_factor || "1.000"));
            setFormWeight(editingItem.weight && Number(editingItem.weight) > 0 ? String(editingItem.weight) : "");
            const existingWeightUnitId = editingItem.weight_unit_id
                ? (typeof editingItem.weight_unit_id === "object" ? editingItem.weight_unit_id.unit_id : editingItem.weight_unit_id)
                : "";
            setFormWeightUnitId(existingWeightUnitId || "");
            setFormBrand(editingItem.product_brand ? String(editingItem.product_brand) : "");
            setFormCategory(editingItem.product_category ? String(editingItem.product_category) : "");
            setFormProductType(editingItem.product_type || 389);
            setFormParentId(editingItem.parent_id ? String(editingItem.parent_id) : "");
            setFormUomCount(editingItem.unit_of_measurement_count ? String(editingItem.unit_of_measurement_count) : "1");

            // Fetch linked suppliers for this item
            fetch(`/api/manufacturing/procurement/raw-materials?productId=${editingItem.product_id}`)
                .then(res => res.ok ? res.json() : [])
                .then(supplierIds => {
                    setSelectedSupplierIds(supplierIds || []);
                })
                .catch(err => console.error("Failed to load item suppliers:", err));
        }
    }, [isModalOpen, editingItem]);

    // Auto-generate child product code when parent, UOM, or UOM count changes
    useEffect(() => {
        if (formParentId && !editingItem) {
            const parentItem = rawMaterials.find(rm => String(rm.product_id) === String(formParentId));
            if (parentItem && parentItem.product_code) {
                const parentCode = parentItem.product_code;
                const uomShortcut = units.find(u => u.unit_id === Number(formUom))?.unit_shortcut || "UNIT";
                setFormCode(`${parentCode}-${uomShortcut.toUpperCase()}${formUomCount}`);
            }
        }
    }, [formParentId, formUom, formUomCount, rawMaterials, units, editingItem]);

    const isItemPkg = (item: RawMaterial) => {
        return Number(item.product_type) === 390;
    };

    const handleStartEdit = (item: RawMaterial) => {
        setEditingItem(item);
        setIsModalOpen(true);
    };

    const handleCreateBrandOnTheFly = async (name: string) => {
        try {
            const res = await fetch("/api/manufacturing/finished-goods/brands", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ brand_name: name })
            });
            if (!res.ok) throw new Error("Failed to create brand");
            const data = await res.json();
            const newBrand = data.brand;
            if (newBrand) {
                setBrandsList(prev => [...prev, { value: String(newBrand.brand_id), label: newBrand.brand_name }]);
                setFormBrand(String(newBrand.brand_id));
                toast.success(`Brand "${name}" created on the fly`);
            }
            // disabled-lint-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || "Failed to create brand");
        }
    };

    const handleCreateCategoryOnTheFly = async (name: string) => {
        try {
            const res = await fetch("/api/manufacturing/finished-goods/categories", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ category_name: name })
            });
            if (!res.ok) throw new Error("Failed to create category");
            const data = await res.json();
            const newCat = data.category;
            if (newCat) {
                setCategoriesList(prev => [...prev, { value: String(newCat.category_id), label: newCat.category_name }]);
                setFormCategory(String(newCat.category_id));
                toast.success(`Category "${name}" created on the fly`);
            }
            // disabled-lint-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || "Failed to create category");
        }
    };

    const filtered = rawMaterials.filter(m => {
        const matchesSearch = m.product_name.toLowerCase().includes(search.toLowerCase()) ||
            m.product_code?.toLowerCase().includes(search.toLowerCase());

        if (!matchesSearch) return false;

        const isPkg = isItemPkg(m);
        if (typeFilter === "raw") return !isPkg;
        if (typeFilter === "pkg") return isPkg;
        return true;
    });

    // UX Enhancement: Group child records directly beneath their parent records in tree list
    const sortedFiltered = React.useMemo(() => {
        const parents = filtered.filter(rm => !rm.parent_id);
        const children = filtered.filter(rm => !!rm.parent_id);

        const result: RawMaterial[] = [];
        parents.forEach(parent => {
            result.push(parent);
            const parentChildren = children.filter(child => Number(child.parent_id) === parent.product_id);
            result.push(...parentChildren);
        });

        // Add any orphans (children whose parents aren't matching current filters)
        children.forEach(child => {
            if (!result.some(r => r.product_id === child.product_id)) {
                result.push(child);
            }
        });

        return result;
    }, [filtered]);

    const handleToggleExpand = async (productId: number) => {
        if (expandedProductId === productId) {
            setExpandedProductId(null);
            setProductBatches([]);
            return;
        }

        setExpandedProductId(productId);
        setLoadingBatches(true);
        try {
            const data = await fetchProductInventoryDetails(productId);
            setProductBatches(data);
        } catch (e) {
            console.error(e);
            toast.error(e instanceof Error ? e.message : "Failed to load inventory details");
        } finally {
            setLoadingBatches(false);
        }
    };

    const handleToggleSupplier = (supplierId: number) => {
        if (selectedSupplierIds.includes(supplierId)) {
            setSelectedSupplierIds(selectedSupplierIds.filter(id => id !== supplierId));
        } else {
            setSelectedSupplierIds([...selectedSupplierIds, supplierId]);
        }
    };

    const handleFormSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation Checks
        const isNameEmpty = !formName.trim();
        const isCodeEmpty = !formCode.trim();
        const isUomEmpty = !formUom;
        const isCategoryEmpty = !formCategory;
        const isDensityInvalid = !formDensity || parseFloat(formDensity) <= 0;
        const isWeightInvalid = !formWeight || parseFloat(formWeight) <= 0 || isNaN(parseFloat(formWeight));
        const isWeightUnitInvalid = !formWeightUnitId;
        const isUomCountInvalid = !formUomCount || Number(formUomCount) <= 0;

        if (isNameEmpty || isCodeEmpty || isUomEmpty || isCategoryEmpty || isDensityInvalid || isWeightInvalid || isWeightUnitInvalid || isUomCountInvalid) {
            setShowValidationErrors(true);
            toast.error("Please fill out all mandatory fields correctly, including Gross Weight and Weight Unit.");
            return;
        }

        // Uniqueness validation on Product Code (only if changed)
        const normalizedCode = formCode.trim().toUpperCase();
        const originalCode = editingItem?.product_code?.trim().toUpperCase() || "";
        const isCodeChanged = !editingItem || normalizedCode !== originalCode;

        if (isCodeChanged) {
            const codeExists = rawMaterials.some(rm => {
                if (editingItem && Number(rm.product_id) === Number(editingItem.product_id)) return false;
                return rm.product_code?.trim().toUpperCase() === normalizedCode;
            });

            if (codeExists) {
                setShowValidationErrors(true);
                toast.error(`The product code "${normalizedCode}" is already assigned. Please provide a unique product code.`);
                return;
            }
        }

        // Name uniqueness check (only if changed)
        const normalizedNewName = formName.trim().toLowerCase();
        const originalName = editingItem?.product_name?.trim().toLowerCase() || "";
        const isNameChanged = !editingItem || normalizedNewName !== originalName;

        if (isNameChanged) {
            const nameExists = rawMaterials.some(rm => {
                if (editingItem && Number(rm.product_id) === Number(editingItem.product_id)) return false;
                return rm.product_name.trim().toLowerCase() === normalizedNewName;
            });

            if (nameExists) {
                toast.error("A material with this name already exists. Please choose a unique name.");
                return;
            }
        }

        // Check variants validation
        const hasInvalidVariant = packagingVariants.some(v => !v.uomId || !v.count || parseFloat(v.count) <= 0);
        if (hasInvalidVariant) {
            toast.error("Please fill out all packaging variant fields with valid units and conversion counts.");
            return;
        }

        const selectedUomShortcut = units.find(u => u.unit_id === Number(formUom))?.unit_shortcut || "pcs";
        const parsedBaseWeight = parseFloat(formWeight) || 0;
        const selectedWeightUnitIdNum = Number(formWeightUnitId);

        const variantsPayload = packagingVariants.map(v => {
            const vUomShortcut = units.find(u => u.unit_id === Number(v.uomId))?.unit_shortcut || "Unit";
            const cleanSuffix = v.codeSuffix.trim() || `${vUomShortcut.toUpperCase()}${v.count}`;
            const variantCount = parseFloat(v.count) || 1.0;
            return {
                product_name: `${formName.trim()} (${vUomShortcut} of ${v.count} ${selectedUomShortcut})`,
                product_code: `${normalizedCode}-${cleanSuffix}`,
                unit_of_measurement: Number(v.uomId),
                unit_of_measurement_count: variantCount,
                density_factor: parseFloat(formDensity) || 1.0,
                weight: parsedBaseWeight * variantCount,
                weight_unit_id: selectedWeightUnitIdNum,
                product_brand: formBrand ? Number(formBrand) : undefined,
                product_category: formCategory ? Number(formCategory) : undefined,
                product_type: Number(formProductType),
            };
        });

        // Check variant code uniqueness
        for (const variant of variantsPayload) {
            const exists = rawMaterials.some(rm => rm.product_code?.trim().toUpperCase() === variant.product_code.toUpperCase());
            if (exists) {
                toast.error(`The packaging variant code "${variant.product_code}" already exists in the catalog.`);
                return;
            }
        }

        setSaving(true);
        const payload = {
            product_name: formName.trim(),
            product_code: normalizedCode,
            description: formDesc.trim() || undefined,
            unit_of_measurement: Number(formUom),
            density_factor: parseFloat(formDensity) || 1.0,
            weight: parsedBaseWeight,
            weight_unit_id: selectedWeightUnitIdNum,
            product_brand: formBrand ? Number(formBrand) : undefined,
            product_category: formCategory ? Number(formCategory) : undefined,
            product_type: formProductType,
            parent_id: formParentId ? Number(formParentId) : null,
            unit_of_measurement_count: parseFloat(formUomCount) || 1.0
        };

        let success = false;
        if (editingItem) {
            success = await onUpdateRawMaterial(editingItem.product_id, payload, selectedSupplierIds, variantsPayload);
        } else {
            success = await onRegisterRawMaterial(payload, selectedSupplierIds, variantsPayload);
        }

        setSaving(false);
        if (success) {
            setIsModalOpen(false);
        }
    };

    // Group batches by branch name for rendering
    const groupedByBranch = React.useMemo(() => {
        const branchesMap: Record<string, {
            branchName: string;
            branchCode: string;
            // disabled-lint-next-line @typescript-eslint/no-explicit-any
            batches: any[];
            totalQty: number;
        }> = {};

        // disabled-lint-next-line @typescript-eslint/no-explicit-any
        productBatches.forEach((item: any) => {
            const branch = item.branch_id || { branch_name: "Unassigned Warehouse", branch_code: "N/A" };
            const branchName = branch.branch_name;

            if (!branchesMap[branchName]) {
                branchesMap[branchName] = {
                    branchName,
                    branchCode: branch.branch_code,
                    batches: [],
                    totalQty: 0
                };
            }

            branchesMap[branchName].batches.push({
                lot_number: item.lot_number || "BATCH-N/A",
                expiration_date: item.expiration_date,
                qty: Number(item.quantity_received || 0),
                reception_date: item.shipment_id?.date_received || "N/A",
                shipment_ref: item.shipment_id?.reference_number || "N/A"
            });

            branchesMap[branchName].totalQty += Number(item.quantity_received || 0);
        });

        return Object.values(branchesMap);
    }, [productBatches]);

    const getExpirationStatus = (expDate?: string) => {
        if (!expDate) return { text: "No Date", color: "text-muted-foreground bg-muted" };
        const today = new Date();
        const exp = new Date(expDate);
        const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            return { text: "Expired", color: "text-red-500 bg-red-500/10 border border-red-500/20" };
        } else if (diffDays <= 30) {
            return { text: `Expiring: ${diffDays}d`, color: "text-amber-500 bg-amber-500/10 border border-amber-500/20" };
        } else {
            return { text: "Fresh", color: "text-emerald-500 bg-emerald-500/10 border border-emerald-500/20" };
        }
    };

    const filteredSuppliers = suppliers.filter(s =>
        s.supplier_name.toLowerCase().includes(supplierSearch.toLowerCase()) ||
        s.supplier_shortcut?.toLowerCase().includes(supplierSearch.toLowerCase())
    );

    // Helpers to display dynamic UOM conversion strings
    const selectedUomShortcut = React.useMemo(() => {
        return units.find(u => u.unit_id === Number(formUom))?.unit_shortcut || "Unit";
    }, [units, formUom]);

    const parentUomShortcut = React.useMemo(() => {
        if (!formParentId) return "";
        const parent = rawMaterials.find(rm => rm.product_id === Number(formParentId));
        return parent?.unit_of_measurement?.unit_shortcut || "Base Unit";
    }, [rawMaterials, formParentId]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20 border p-4 rounded-xl">
                <div className="space-y-0.5">
                    <h3 className="font-bold text-sm text-foreground flex items-center gap-1.5 shrink-0">
                        <Layers className="h-4.5 w-4.5 text-primary" />
                        Raw Materials & Packaging Master Catalog ({sortedFiltered.length})
                    </h3>
                    <p className="text-[10px] text-muted-foreground">Log incoming cargo, register raw materials, or inspect warehouse batches.</p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto shrink-0">
                    <div className="relative flex-1 sm:max-w-xs">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search ingredients, packaging..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-8 py-2 border rounded-lg text-xs bg-background outline-none focus:ring-1 focus:ring-primary font-medium"
                        />
                        {search && (
                            <button
                                onClick={() => setSearch("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1 transition-colors hover:bg-muted rounded cursor-pointer"
                                title="Clear Search"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-bold px-3 py-2.5 rounded-lg transition-all shadow-sm cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                    >
                        <Plus className="h-4 w-4" /> Register Item
                    </button>
                </div>
            </div>

            {/* Filter segments & Tooltip Note */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-card border px-4 py-3 rounded-xl">
                <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border text-[11px] font-bold">
                    <button
                        onClick={() => setTypeFilter("all")}
                        className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${typeFilter === "all" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        All Items
                    </button>
                    <button
                        onClick={() => setTypeFilter("raw")}
                        className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${typeFilter === "raw" ? "bg-background shadow-sm text-amber-600" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        Raw Materials
                    </button>
                    <button
                        onClick={() => setTypeFilter("pkg")}
                        className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${typeFilter === "pkg" ? "bg-background shadow-sm text-purple-600" : "text-muted-foreground hover:text-foreground"}`}
                    >
                        Packaging Items
                    </button>
                </div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 bg-primary/5 px-3 py-1.5 rounded-lg border border-primary/10">
                    <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span>Keyword auto-detection classifies items by name tag (box, bottle, cap, sticker, packaging).</span>
                </div>
            </div>

            {/* List */}
            <div className="border rounded-xl bg-card overflow-x-auto shadow-sm">
                <table className="w-full text-left border-collapse text-xs min-w-[800px]">
                    <thead>
                        <tr className="bg-muted/50 border-b">
                            <th className="p-3 w-10"></th>
                            <th className="p-3 font-semibold text-muted-foreground">Material Name</th>
                            <th className="p-3 font-semibold text-muted-foreground">Product Code</th>
                            <th className="p-3 font-semibold text-muted-foreground text-center">UOM</th>
                            <th className="p-3 font-semibold text-muted-foreground text-right">Gross Weight</th>
                            <th className="p-3 font-semibold text-muted-foreground text-right">Density Factor</th>
                            <th className="p-3 font-semibold text-muted-foreground text-right font-bold text-foreground">Standard Landed Unit Cost (PHP)</th>
                            <th className="p-3 font-semibold text-muted-foreground text-right w-24">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {loadingItems ? (
                            <tr>
                                <td colSpan={8} className="p-12 text-center text-muted-foreground">
                                    <div className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                                        <span>Loading items...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : sortedFiltered.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="p-12 text-center text-muted-foreground">
                                    No items found.
                                </td>
                            </tr>
                        ) : (
                            (() => {
                                const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / pageSize));
                                const paginatedItems = sortedFiltered.slice((page - 1) * pageSize, page * pageSize);
                                return paginatedItems.map(m => {
                                const isExpanded = expandedProductId === m.product_id;
                                const isPkg = isItemPkg(m);
                                const isChild = !!m.parent_id;

                                // Compute tree connector and parent count details
                                let connector = "";
                                if (isChild) {
                                    const parentChildren = sortedFiltered.filter(c => Number(c.parent_id) === Number(m.parent_id));
                                    const childIndex = parentChildren.findIndex(c => c.product_id === m.product_id);
                                    const isLast = childIndex === parentChildren.length - 1;
                                    connector = isLast ? "└──" : "├──";
                                }

                                const childrenCount = !isChild
                                    ? rawMaterials.filter(c => Number(c.parent_id) === m.product_id).length
                                    : 0;

                                return (
                                    <React.Fragment key={m.product_id}>
                                        <tr
                                            onClick={() => handleToggleExpand(m.product_id)}
                                            className={`${isChild
                                                    ? "bg-muted/20 hover:bg-muted/40 border-l-4 border-l-primary/30"
                                                    : "bg-card hover:bg-muted/10 border-l-2 border-l-transparent hover:border-l-primary"
                                                } cursor-pointer transition-all border-b`}
                                        >
                                            <td className="p-3 text-center">
                                                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                            </td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-2">
                                                    {isChild && (
                                                        <span className="text-primary/60 font-mono text-xs select-none font-bold mr-1">{connector}</span>
                                                    )}
                                                    <div>
                                                        <span className={`font-semibold block ${isChild ? "text-[11px] text-foreground/80" : "text-xs text-foreground"}`}>
                                                            {m.product_name}
                                                        </span>
                                                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                                            <span className={`text-[8px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded ${isPkg ? "text-purple-600 bg-purple-500/10" : "text-amber-600 bg-amber-500/10"}`}>
                                                                {isPkg ? "Packaging Item" : "Raw Material"}
                                                            </span>
                                                            {isChild && (
                                                                <span className="text-[8px] font-bold uppercase tracking-wider text-blue-600 bg-blue-500/10 px-1.5 py-0.5 rounded">
                                                                    UOM factor: 1:{m.unit_of_measurement_count}
                                                                </span>
                                                            )}
                                                            {childrenCount > 0 && (
                                                                <span className="text-[8px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                                                                    {childrenCount} variant{childrenCount > 1 ? "s" : ""}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-3 font-mono text-[11px] text-muted-foreground">
                                                {m.product_code || `ID-${m.product_id}`}
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className="bg-muted px-2 py-0.5 rounded text-[10px] font-bold text-foreground">
                                                    {m.unit_of_measurement?.unit_shortcut || "PCS"}
                                                </span>
                                            </td>
                                            <td className="p-3 text-right font-mono font-medium">
                                                {m.weight && Number(m.weight) > 0 ? (
                                                    <span className="text-foreground font-bold">
                                                        {Number(m.weight).toFixed(2)}{" "}
                                                        {typeof m.weight_unit_id === "object" && m.weight_unit_id
                                                            ? ((m.weight_unit_id as { code?: string; unit_shortcut?: string })?.code || (m.weight_unit_id as { code?: string; unit_shortcut?: string })?.unit_shortcut || "kg")
                                                            : (weightUnits.find(u => u.id === Number(m.weight_unit_id))?.code || "kg")}
                                                    </span>
                                                ) : (
                                                    <span className="text-red-500 font-bold text-[10px] bg-red-500/10 px-1.5 py-0.5 rounded">
                                                        Missing Weight
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-3 text-right font-mono font-medium">
                                                {m.density_factor ? m.density_factor.toFixed(3) : "1.000"} g/mL
                                            </td>
                                            <td className="p-3 text-right font-mono text-xs font-bold text-foreground bg-emerald-500/5">
                                                ₱{m.cost_per_unit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                                                <button
                                                    type="button"
                                                    onClick={() => handleStartEdit(m)}
                                                    className="px-2.5 py-1 text-[10px] font-bold text-primary bg-primary/5 hover:bg-primary/10 border border-primary/20 hover:border-primary/45 rounded-lg transition-all cursor-pointer"
                                                >
                                                    Edit
                                                </button>
                                            </td>
                                        </tr>

                                        {/* Expandable FIFO Stock Breakdown */}
                                        {isExpanded && (
                                            <tr>
                                                <td colSpan={8} className="bg-muted/5 p-4 border-b">
                                                    <div className="space-y-4">
                                                        <h4 className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5 border-b pb-1.5">
                                                            <MapPin className="h-3.5 w-3.5 text-primary" />
                                                            Active Stock Locations & Batch Logs
                                                        </h4>

                                                        {loadingBatches ? (
                                                            <div className="text-center py-4 text-xs text-muted-foreground">Loading stock logs...</div>
                                                        ) : groupedByBranch.length === 0 ? (
                                                            <div className="text-center py-4 text-xs text-muted-foreground italic flex items-center justify-center gap-1.5">
                                                                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                                                No physical stock batches currently recorded at any warehouse location.
                                                            </div>
                                                        ) : (
                                                            <div className="grid gap-4 sm:grid-cols-2">
                                                                {groupedByBranch.map((branchGroup, bIdx) => (
                                                                    <div key={bIdx} className="bg-card border rounded-lg p-3 space-y-2.5">
                                                                        <div className="flex justify-between items-center border-b pb-1">
                                                                            <span className="font-extrabold text-xs text-foreground block">{branchGroup.branchName}</span>
                                                                            <span className="text-[10px] font-black text-primary bg-primary/5 px-2 py-0.5 rounded">
                                                                                {branchGroup.totalQty.toLocaleString()} {m.unit_of_measurement?.unit_shortcut || "PCS"}
                                                                            </span>
                                                                        </div>

                                                                        <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                                                                            {branchGroup.batches.map((batch, btIdx) => {
                                                                                const expStatus = getExpirationStatus(batch.expiration_date);
                                                                                return (
                                                                                    <div key={btIdx} className="flex justify-between items-center text-[10px] py-1 border-b last:border-0 border-muted/30">
                                                                                        <span className="font-bold text-foreground flex items-center gap-1">
                                                                                            <Bookmark className="h-3 w-3 text-primary" />
                                                                                            {batch.lot_number}
                                                                                        </span>
                                                                                        <span className="text-muted-foreground">
                                                                                            {isPkg ? `Rec: ${batch.reception_date}` : `Exp: ${batch.expiration_date || "N/A"}`}
                                                                                        </span>
                                                                                        <span className="font-mono font-bold text-foreground">
                                                                                            {batch.qty.toLocaleString()} units
                                                                                        </span>
                                                                                        {!isPkg && (
                                                                                            <span className={`px-1 rounded text-[8px] font-black uppercase ${expStatus.color}`}>
                                                                                                {expStatus.text}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            });
                            })()
                        )}
                    </tbody>
                </table>
                {/* Table Pagination Controls Footer */}
                {sortedFiltered.length > 0 && (() => {
                    const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / pageSize));
                    return (
                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 border-t bg-muted/20 text-xs text-muted-foreground font-medium">
                            <div className="flex items-center gap-2">
                                <span>Show</span>
                                <select
                                    value={pageSize}
                                    onChange={(e) => {
                                        setPageSize(Number(e.target.value));
                                        setPage(1);
                                    }}
                                    className="rounded border bg-background px-2 py-1 outline-none focus:ring-1 focus:ring-primary text-foreground font-semibold cursor-pointer"
                                >
                                    <option value={10}>10 items</option>
                                    <option value={20}>20 items</option>
                                    <option value={50}>50 items</option>
                                    <option value={100}>100 items</option>
                                </select>
                                <span>
                                    Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, sortedFiltered.length)} of {sortedFiltered.length} items
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="font-semibold text-foreground">Page {page} of {totalPages}</span>
                                <div className="inline-flex rounded-md shadow-sm">
                                    <button
                                        disabled={page <= 1}
                                        onClick={() => setPage(prev => Math.max(1, prev - 1))}
                                        className="px-2.5 py-1 text-xs font-bold rounded-l-md border bg-background hover:bg-muted text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        disabled={page >= totalPages}
                                        onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                                        className="px-2.5 py-1 text-xs font-bold rounded-r-md border-t border-b border-r bg-background hover:bg-muted text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>

            {/* Registration / Edit Modal Overlay - Modern One-Pager Layout */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-card border border-border/80 rounded-2xl shadow-2xl w-full max-w-[1360px] h-[88vh] flex flex-col overflow-hidden scale-in duration-200">

                        {/* Header */}
                        <div className="flex items-center justify-between border-b border-border/60 px-6 py-4 shrink-0 bg-muted/20">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                                    <Layers className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="font-extrabold text-sm text-foreground tracking-tight">
                                        {editingItem ? "Edit Raw Material / Packaging Master" : "Register New Raw Material / Packaging Item"}
                                    </h3>
                                    <p className="text-[10px] text-muted-foreground font-medium">
                                        Configure specifications, weight attributes, approved vendors, and purchase packages in one view.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${editingItem ? "bg-amber-500/10 text-amber-600 border-amber-500/20" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"}`}>
                                    {editingItem ? `Editing ID: ${editingItem.product_id}` : "New Item Registration"}
                                </span>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted/60 transition-colors cursor-pointer"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>
                        </div>

                        {/* Form Body - 3 Columns Non-Scrolling One-Pager */}
                        <form onSubmit={handleFormSubmit} className="flex-1 overflow-hidden p-6 flex flex-col justify-between">
                            <div className="grid grid-cols-12 gap-5 flex-1 min-h-0 overflow-hidden items-stretch">
                                
                                {/* COLUMN 1: Basic Specifications & Physical Properties (4 of 12 cols) */}
                                <div className="col-span-4 bg-muted/10 p-4.5 rounded-xl border border-border/60 flex flex-col justify-between overflow-y-auto space-y-3">
                                    <div>
                                        <h4 className="text-[11px] font-extrabold text-foreground uppercase tracking-wider border-b border-border/60 pb-2 mb-3 flex items-center gap-2">
                                            <Bookmark className="h-4 w-4 text-primary" />
                                            1. Basic Specifications
                                        </h4>

                                        <div className="space-y-3">
                                            {/* Material Name */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                                                    Material Name <span className="text-red-500">*</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g. Soya Bean Oil (Pure Refined)"
                                                    value={formName}
                                                    onChange={e => {
                                                        setFormName(e.target.value);
                                                        if (!editingItem && !formCode) {
                                                            const words = e.target.value.split(/\s+/).filter(Boolean);
                                                            const initials = words.map(w => w[0]).join("").replace(/[^a-zA-Z]/g, "").toUpperCase();
                                                            if (initials) {
                                                                setFormCode(`RM-${initials.substring(0, 5)}`);
                                                            }
                                                        }
                                                    }}
                                                    className={`w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none transition-all duration-200 font-semibold text-foreground ${showValidationErrors && !formName.trim()
                                                            ? "border-red-500 focus:ring-2 focus:ring-red-100 shadow-[0_0_0_2px_rgba(239,68,68,0.15)]"
                                                            : "border-border focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                                        }`}
                                                />
                                            </div>

                                            {/* SKU Code & Item Classification */}
                                            <div className="grid grid-cols-2 gap-2.5">
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                                                        Product Code <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g. RM-SOYA-01"
                                                        value={formCode}
                                                        onChange={e => setFormCode(e.target.value)}
                                                        className={`w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none transition-all duration-200 font-mono text-foreground font-bold ${showValidationErrors && !formCode.trim()
                                                                ? "border-red-500 focus:ring-2 focus:ring-red-100 shadow-[0_0_0_2px_rgba(239,68,68,0.15)]"
                                                                : "border-border focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                                            }`}
                                                    />
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                                                        Classification <span className="text-red-500">*</span>
                                                    </label>
                                                    <select
                                                        value={formProductType}
                                                        onChange={e => setFormProductType(Number(e.target.value))}
                                                        className="w-full rounded-lg border bg-background px-2.5 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-foreground font-semibold transition-all duration-200 h-9"
                                                    >
                                                        <option value={389}>Raw Materials</option>
                                                        <option value={390}>Packaging Items</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Base UOM & Category */}
                                            <div className="grid grid-cols-2 gap-2.5">
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                                                        Base UOM <span className="text-red-500">*</span>
                                                    </label>
                                                    {loadingUnits ? (
                                                        <div className="h-9 flex items-center justify-center border rounded-lg bg-background">
                                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                                        </div>
                                                    ) : (
                                                        <div className={showValidationErrors && !formUom ? "ring-2 ring-red-500/25 rounded-lg border border-red-500" : ""}>
                                                            <CreatableSelect
                                                                options={uomOptions}
                                                                value={formUom ? String(formUom) : ""}
                                                                onValueChange={val => setFormUom(val ? Number(val) : "")}
                                                                placeholder="Base UOM..."
                                                            />
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                                                        Category <span className="text-red-500">*</span>
                                                    </label>
                                                    <div className={showValidationErrors && !formCategory ? "ring-2 ring-red-500/25 rounded-lg border border-red-500" : ""}>
                                                        <CreatableSelect
                                                            options={categoriesList}
                                                            value={formCategory}
                                                            onValueChange={setFormCategory}
                                                            placeholder="Category..."
                                                            onCreateOption={handleCreateCategoryOnTheFly}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Brand & Density Factor */}
                                            <div className="grid grid-cols-2 gap-2.5">
                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Brand</label>
                                                    <CreatableSelect
                                                        options={brandsList}
                                                        value={formBrand}
                                                        onValueChange={setFormBrand}
                                                        placeholder="Brand..."
                                                        onCreateOption={handleCreateBrandOnTheFly}
                                                    />
                                                </div>

                                                <div className="space-y-1">
                                                    <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                                                        Density (g/mL) <span className="text-red-500">*</span>
                                                    </label>
                                                    <input
                                                        type="number"
                                                        step="0.001"
                                                        min="0.001"
                                                        value={formDensity}
                                                        onChange={e => setFormDensity(e.target.value)}
                                                        className={`w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none transition-all duration-200 font-mono font-bold text-foreground ${showValidationErrors && (!formDensity || parseFloat(formDensity) <= 0)
                                                                ? "border-red-500 focus:ring-2 focus:ring-red-100 shadow-[0_0_0_2px_rgba(239,68,68,0.15)]"
                                                                : "border-border focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                                            }`}
                                                    />
                                                </div>
                                            </div>

                                            {/* Gross Weight & Weight Unit */}
                                            <div className="space-y-1">
                                                <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">
                                                    Gross Weight & Unit <span className="text-red-500">*</span>
                                                </label>
                                                <div className="grid grid-cols-12 gap-2">
                                                    <div className="col-span-7">
                                                        <input
                                                            type="number"
                                                            step="0.001"
                                                            min="0.001"
                                                            placeholder="e.g. 2.50"
                                                            value={formWeight}
                                                            onChange={e => setFormWeight(e.target.value)}
                                                            className={`w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none transition-all duration-200 font-mono font-bold text-foreground ${showValidationErrors && (!formWeight || parseFloat(formWeight) <= 0)
                                                                    ? "border-red-500 focus:ring-2 focus:ring-red-100 shadow-[0_0_0_2px_rgba(239,68,68,0.15)]"
                                                                    : "border-border focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                                                }`}
                                                        />
                                                    </div>
                                                    <div className={`col-span-5 ${showValidationErrors && !formWeightUnitId ? "ring-2 ring-red-500/25 rounded-lg border border-red-500" : ""}`}>
                                                        <CreatableSelect
                                                            options={weightUnitOptions}
                                                            value={formWeightUnitId ? String(formWeightUnitId) : ""}
                                                            onValueChange={val => setFormWeightUnitId(val ? Number(val) : "")}
                                                            placeholder="Unit..."
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* COLUMN 2: Stock Hierarchy, Conversion & Notes (4 of 12 cols) */}
                                <div className="col-span-4 bg-muted/10 p-4.5 rounded-xl border border-border/60 flex flex-col justify-between overflow-y-auto space-y-3">
                                    <div className="space-y-3">
                                        <h4 className="text-[11px] font-extrabold text-foreground uppercase tracking-wider border-b border-border/60 pb-2 flex items-center gap-2">
                                            <Layers className="h-4 w-4 text-primary" />
                                            2. Stock Hierarchy & Formula
                                        </h4>

                                        {/* Parent Product Selection */}
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Parent Material (Optional)</label>
                                            <CreatableSelect
                                                options={parentProductOptions}
                                                value={formParentId}
                                                onValueChange={val => {
                                                    setFormParentId(val);
                                                    if (!val) setFormUomCount("1");
                                                }}
                                                placeholder="Search Parent Material..."
                                            />
                                        </div>

                                        {/* UOM Count / Stock Conversion factor */}
                                        <div className="space-y-2 p-3 bg-primary/5 rounded-xl border border-primary/15">
                                            <div className="flex justify-between items-center">
                                                <label className="text-[10px] text-primary font-bold uppercase tracking-wider block">
                                                    UOM Conversion Count <span className="text-red-500">*</span>
                                                </label>
                                                {formParentId && (
                                                    <span className="text-[9px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded">
                                                        Parent Active
                                                    </span>
                                                )}
                                            </div>
                                            <input
                                                type="number"
                                                step="any"
                                                min="0.0001"
                                                value={formUomCount}
                                                onChange={e => setFormUomCount(e.target.value)}
                                                className={`w-full rounded-lg border bg-background px-3 py-1.5 text-xs outline-none transition-all duration-200 font-mono font-bold text-foreground ${showValidationErrors && (!formUomCount || Number(formUomCount) <= 0)
                                                        ? "border-red-500 focus:ring-2 focus:ring-red-100 shadow-[0_0_0_2px_rgba(239,68,68,0.15)]"
                                                        : "border-border focus:ring-2 focus:ring-primary/20 focus:border-primary"
                                                    }`}
                                                placeholder="e.g. 1"
                                            />

                                            {/* Dynamic visual formula preview */}
                                            <div className="p-2.5 rounded-lg bg-background border border-border/60 flex items-center justify-between gap-1.5 text-xs">
                                                <div className="flex flex-col items-center flex-1 bg-muted/30 p-1 rounded border border-border/40">
                                                    <span className="text-[8px] text-muted-foreground font-bold uppercase">Child Unit</span>
                                                    <span className="font-extrabold text-foreground text-[11px] mt-0.5">{selectedUomShortcut}</span>
                                                </div>
                                                <div className="text-primary font-black text-xs select-none">➔</div>
                                                <div className="flex flex-col items-center flex-1 bg-primary/10 p-1 rounded border border-primary/20">
                                                    <span className="text-[8px] text-primary font-bold uppercase">Conversion</span>
                                                    <span className="font-black text-primary text-[11px] mt-0.5">
                                                        {formUomCount || "1.0"} × {formParentId ? (parentUomShortcut || "Base Unit") : selectedUomShortcut}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Description */}
                                        <div className="space-y-1">
                                            <label className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider block">Description & Specs</label>
                                            <textarea
                                                rows={2}
                                                placeholder="Material specifications, storage temperature, quality standards..."
                                                value={formDesc}
                                                onChange={e => setFormDesc(e.target.value)}
                                                className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium text-foreground resize-none font-semibold transition-all duration-200"
                                            />
                                        </div>

                                        {/* Read-Only Standard Landed Cost during editing */}
                                        {editingItem && (
                                            <div className="space-y-1 p-2.5 bg-muted/20 rounded-lg border border-border/50">
                                                <label className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider block">Standard Landed Unit Cost (Read-Only)</label>
                                                <div className="text-sm font-mono font-black text-foreground">
                                                    ₱{editingItem.cost_per_unit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* COLUMN 3: Vendors & Purchase Packages (4 of 12 cols) */}
                                <div className="col-span-4 space-y-4 flex flex-col h-full min-h-0 overflow-hidden">

                                    {/* TOP HALF: Approved Vendors */}
                                    <div className="bg-muted/10 p-4 rounded-xl border border-border/60 space-y-2.5 shrink-0">
                                        <div className="flex justify-between items-center border-b border-border/60 pb-2">
                                            <label className="text-[11px] font-extrabold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                                                <MapPin className="h-3.5 w-3.5 text-primary" />
                                                3. Linked Vendors
                                            </label>
                                            <span className="text-[9px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full border border-primary/20">
                                                {selectedSupplierIds.length} Selected
                                            </span>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Filter vendors..."
                                            value={supplierSearch}
                                            onChange={e => setSupplierSearch(e.target.value)}
                                            className="w-full rounded-lg border bg-background px-3 py-1.5 text-[11px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary font-medium transition-all duration-200"
                                        />
                                        <div className="border rounded-lg bg-background p-2 max-h-[110px] overflow-y-auto divide-y divide-muted/30">
                                            {filteredSuppliers.length === 0 ? (
                                                <div className="text-center py-2 text-[11px] text-muted-foreground">No vendors match</div>
                                            ) : (
                                                filteredSuppliers.map(s => {
                                                    const isChecked = selectedSupplierIds.includes(s.id);
                                                    return (
                                                        <label
                                                            key={s.id}
                                                            className="flex items-center gap-2 py-1 px-1 hover:bg-muted/20 rounded cursor-pointer select-none text-[11px] font-semibold text-foreground"
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => handleToggleSupplier(s.id)}
                                                                className="rounded text-primary focus:ring-0 h-3.5 w-3.5 cursor-pointer"
                                                            />
                                                            <span className="truncate">{s.supplier_name}</span>
                                                            {s.supplier_shortcut && (
                                                                <span className="text-[9px] text-muted-foreground font-mono shrink-0">({s.supplier_shortcut})</span>
                                                            )}
                                                        </label>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>

                                    {/* BOTTOM HALF: Purchase Packaging Variants */}
                                    {!formParentId && (
                                        <div className="bg-muted/20 border border-dashed rounded-xl p-4 flex-1 flex flex-col min-h-0 overflow-hidden space-y-2.5">
                                            <div className="flex justify-between items-center border-b border-border/60 pb-2 shrink-0">
                                                <h4 className="text-[11px] font-extrabold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                                                    <Layers className="h-3.5 w-3.5 text-primary" />
                                                    4. Purchase Packages
                                                </h4>
                                                <span className="text-[9px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-full border border-primary/20">
                                                    {packagingVariants.length} Added
                                                </span>
                                            </div>

                                            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-0">
                                                {packagingVariants.map((v, vIdx) => (
                                                    <div key={vIdx} className="grid grid-cols-12 gap-1.5 bg-background border p-2 rounded-lg relative items-end shadow-xs">
                                                        <div className="col-span-5 space-y-0.5">
                                                            <label className="text-[8px] font-bold text-muted-foreground uppercase block">Unit</label>
                                                            <CreatableSelect
                                                                options={uomOptions}
                                                                value={v.uomId ? String(v.uomId) : ""}
                                                                onValueChange={val => handleUpdateVariant(vIdx, "uomId", val ? Number(val) : "")}
                                                                placeholder="UOM..."
                                                            />
                                                        </div>

                                                        <div className="col-span-3 space-y-0.5">
                                                            <label className="text-[8px] font-bold text-muted-foreground uppercase block">Count</label>
                                                            <input
                                                                type="number"
                                                                step="any"
                                                                min="0.0001"
                                                                placeholder="25"
                                                                value={v.count}
                                                                onChange={e => handleUpdateVariant(vIdx, "count", e.target.value)}
                                                                className="w-full rounded-md border bg-background px-2 py-1 text-[10px] outline-none h-8 font-semibold text-foreground"
                                                            />
                                                        </div>

                                                        <div className="col-span-3 space-y-0.5">
                                                            <label className="text-[8px] font-bold text-muted-foreground uppercase block">Suffix</label>
                                                            <input
                                                                type="text"
                                                                placeholder="BAG25"
                                                                value={v.codeSuffix}
                                                                onChange={e => handleUpdateVariant(vIdx, "codeSuffix", e.target.value.toUpperCase())}
                                                                className="w-full rounded-md border bg-background px-1.5 py-1 text-[10px] outline-none h-8 font-mono font-bold text-foreground"
                                                            />
                                                        </div>

                                                        <div className="col-span-1 flex justify-center pb-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveVariant(vIdx)}
                                                                className="text-muted-foreground hover:text-red-500 p-1 rounded hover:bg-muted/50 transition-colors"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}

                                                {packagingVariants.length === 0 && (
                                                    <div className="text-center py-4 text-[10px] text-muted-foreground italic border border-dashed rounded-lg">
                                                        No purchase packaging variants added yet.
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={handleAddVariant}
                                                className="w-full py-2 border border-dashed border-primary/40 rounded-lg text-xs font-bold text-primary hover:bg-primary/5 transition-colors cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                                            >
                                                <Plus className="h-3.5 w-3.5" />
                                                Add Package Variant
                                            </button>
                                        </div>
                                    )}

                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="border-t border-border/60 pt-4 flex items-center justify-between shrink-0 bg-background/50">
                                <div className="text-[10px] font-medium text-muted-foreground flex items-center gap-1.5">
                                    <Info className="h-3.5 w-3.5 text-primary" />
                                    <span>All required fields (<span className="text-red-500">*</span>) must be completed before saving.</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-xs font-extrabold px-4 py-2.5 rounded-xl transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="bg-primary hover:bg-primary/95 text-primary-foreground text-xs font-extrabold px-6 py-2.5 rounded-xl transition-all shadow-md inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                                    >
                                        {saving ? (
                                            <>
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                Saving Material...
                                            </>
                                        ) : editingItem ? "Update Material Master" : "Save Material Master"}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
