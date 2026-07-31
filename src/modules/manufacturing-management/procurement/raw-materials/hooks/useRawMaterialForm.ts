import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { 
    RawMaterialItem, 
    UnitOption, 
    WeightUnitOption, 
    SelectOption, 
    RegisterRawMaterialPayload, 
    PackagingVariantPayload 
} from "../types/raw-materials.types";
import { 
    fetchRawMaterialMetadata, 
    fetchLinkedSuppliers, 
    createBrandOnTheFly, 
    createCategoryOnTheFly 
} from "../services/raw-materials.service";

export function useRawMaterialForm(
    rawMaterials: RawMaterialItem[],
    onRegisterRawMaterial: (productDetails: RegisterRawMaterialPayload, supplierIds: number[], packagingVariants?: PackagingVariantPayload[]) => Promise<boolean>,
    onUpdateRawMaterial: (productId: number, productDetails: RegisterRawMaterialPayload, supplierIds: number[], packagingVariants?: PackagingVariantPayload[]) => Promise<boolean>
) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<RawMaterialItem | null>(null);
    const [saving, setSaving] = useState(false);

    const [units, setUnits] = useState<UnitOption[]>([]);
    const [weightUnits, setWeightUnits] = useState<WeightUnitOption[]>([]);
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
    const [supplierSearch, setSupplierSearch] = useState("");
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

        fetchRawMaterialMetadata()
            .then(meta => {
                setUnits(meta.units);
                setWeightUnits(meta.weightUnits);
                setBrandsList(meta.brands);
                setCategoriesList(meta.categories);

                if (!editingItem) {
                    if (meta.units && meta.units.length > 0) setFormUom(meta.units[0].unit_id);
                    if (meta.weightUnits && meta.weightUnits.length > 0) {
                        const kgUnit = meta.weightUnits.find(u => u.code.toLowerCase() === "kg" || u.name.toLowerCase().includes("kilo"));
                        setFormWeightUnitId(kgUnit ? kgUnit.id : meta.weightUnits[0].id);
                    }
                }
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
                ? (typeof editingItem.weight_unit_id === "object" ? editingItem.weight_unit_id.unit_id || (editingItem.weight_unit_id as any).id : editingItem.weight_unit_id)
                : "";
            setFormWeightUnitId(existingWeightUnitId || "");
            setFormBrand(editingItem.product_brand ? String(typeof editingItem.product_brand === "object" ? (editingItem.product_brand as any).brand_id : editingItem.product_brand) : "");
            setFormCategory(editingItem.product_category ? String(typeof editingItem.product_category === "object" ? (editingItem.product_category as any).category_id : editingItem.product_category) : "");
            setFormProductType(editingItem.product_type || 389);
            setFormParentId(editingItem.parent_id ? String(editingItem.parent_id) : "");
            setFormUomCount(editingItem.unit_of_measurement_count ? String(editingItem.unit_of_measurement_count) : "1");

            fetchLinkedSuppliers(editingItem.product_id)
                .then(supplierIds => setSelectedSupplierIds(supplierIds || []))
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

    const handleStartEdit = (item: RawMaterialItem) => {
        setEditingItem(item);
        setIsModalOpen(true);
    };

    const handleCreateBrand = async (name: string) => {
        try {
            const newOpt = await createBrandOnTheFly(name);
            setBrandsList(prev => [...prev, newOpt]);
            setFormBrand(newOpt.value);
            toast.success(`Brand "${name}" created on the fly`);
        } catch (e: any) {
            toast.error(e.message || "Failed to create brand");
        }
    };

    const handleCreateCategory = async (name: string) => {
        try {
            const newOpt = await createCategoryOnTheFly(name);
            setCategoriesList(prev => [...prev, newOpt]);
            setFormCategory(newOpt.value);
            toast.success(`Category "${name}" created on the fly`);
        } catch (e: any) {
            toast.error(e.message || "Failed to create category");
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

        // Uniqueness validation on Product Code
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

        // Name uniqueness check
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

    return {
        isModalOpen,
        setIsModalOpen,
        editingItem,
        handleStartEdit,
        saving,
        loadingUnits,
        units,
        weightUnits,
        brandsList,
        categoriesList,
        showValidationErrors,
        formName,
        setFormName,
        formCode,
        setFormCode,
        formDesc,
        setFormDesc,
        formUom,
        setFormUom,
        formDensity,
        setFormDensity,
        formWeight,
        setFormWeight,
        formWeightUnitId,
        setFormWeightUnitId,
        formBrand,
        setFormBrand,
        formCategory,
        setFormCategory,
        formProductType,
        setFormProductType,
        formParentId,
        setFormParentId,
        formUomCount,
        setFormUomCount,
        selectedSupplierIds,
        handleToggleSupplier,
        supplierSearch,
        setSupplierSearch,
        packagingVariants,
        handleAddVariant,
        handleUpdateVariant,
        handleRemoveVariant,
        uomOptions,
        weightUnitOptions,
        parentProductOptions,
        handleCreateBrand,
        handleCreateCategory,
        handleFormSubmit
    };
}
