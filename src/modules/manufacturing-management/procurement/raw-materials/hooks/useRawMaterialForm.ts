import { useState, useEffect, useMemo, useCallback } from "react";
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
    const [cascadeToChildren, setCascadeToChildren] = useState(true);
    const [packagingVariants, setPackagingVariants] = useState<Array<{ productId?: number; uomId: number | ""; count: string; codeSuffix: string; isExisting?: boolean }>>([]);

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
        const defaultUomObj = units.find(u => {
            const sc = (u.unit_shortcut || "").toLowerCase();
            const name = (u.unit_name || "").toLowerCase();
            return sc === "bag" || sc === "box" || sc === "pck" || sc === "ib" || name.includes("bag") || name.includes("box") || name.includes("pack");
        });
        const defaultUom = defaultUomObj ? defaultUomObj.unit_id : (units.length > 1 ? units[1].unit_id : (formUom || ""));
        setPackagingVariants([...packagingVariants, { uomId: defaultUom, count: "25", codeSuffix: "" }]);
    };

    const handleAddPresetVariant = (presetType: "bag25" | "sack50" | "drum200" | "ibc1000" | "fibc1000" | "case12") => {
        const findUom = (keywords: string[]) => {
            return units.find(u => {
                const sc = (u.unit_shortcut || "").toLowerCase();
                const nm = (u.unit_name || "").toLowerCase();
                return keywords.some(k => sc.includes(k) || nm.includes(k));
            })?.unit_id || (units.length > 0 ? units[0].unit_id : (formUom || ""));
        };

        let uomId: number | "" = "";
        let count = "1";
        let codeSuffix = "";

        switch (presetType) {
            case "bag25":
                uomId = findUom(["bag", "pck", "sack"]);
                count = "25";
                codeSuffix = "BAG25";
                break;
            case "sack50":
                uomId = findUom(["sack", "bag"]);
                count = "50";
                codeSuffix = "SACK50";
                break;
            case "drum200":
                uomId = findUom(["drum", "bbl", "barrel"]);
                count = "200";
                codeSuffix = "DRUM200";
                break;
            case "ibc1000":
                uomId = findUom(["tote", "ibc", "tnk", "tank"]);
                count = "1000";
                codeSuffix = "IBC1000";
                break;
            case "fibc1000":
                uomId = findUom(["sack", "tote", "bag"]);
                count = "1000";
                codeSuffix = "FIBC1000";
                break;
            case "case12":
                uomId = findUom(["box", "case", "ctn", "pack"]);
                count = "12";
                codeSuffix = "CASE12";
                break;
        }

        setPackagingVariants([...packagingVariants, { uomId, count, codeSuffix }]);
        toast.info(`Added preset variant "${codeSuffix}"`);
    };

    const handleUpdateVariant = (index: number, field: string, value: string | number) => {
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

        let isSubscribed = true;
        const load = async () => {
            try {
                setLoadingUnits(true);
                const meta = await fetchRawMaterialMetadata();
                if (!isSubscribed) return;
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
            } catch (err) {
                console.error("Failed to load raw material metadata:", err);
                toast.error("Failed to load options metadata");
            } finally {
                if (isSubscribed) setLoadingUnits(false);
            }
        };

        load();
        return () => {
            isSubscribed = false;
        };
    }, [isModalOpen, editingItem]);

    // Populate / Reset form when editingItem changes or modal opens
    const resetForm = useCallback(() => {
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
        setCascadeToChildren(true);
    }, []);

    const populateForm = useCallback((item: RawMaterialItem) => {
        setFormName(item.product_name || "");
        setFormCode(item.product_code || "");
        setFormDesc(item.description || "");
        setFormUom(item.unit_of_measurement?.unit_id || "");
        setFormDensity(String(item.density_factor || "1.000"));
        setFormWeight(item.weight && Number(item.weight) > 0 ? String(item.weight) : "");

        let existingWeightUnitId: number | "" = "";
        if (item.weight_unit_id) {
            if (typeof item.weight_unit_id === "object") {
                const wObj = item.weight_unit_id as { unit_id?: number; id?: number };
                existingWeightUnitId = wObj.unit_id || wObj.id || "";
            } else {
                existingWeightUnitId = item.weight_unit_id;
            }
        }
        setFormWeightUnitId(existingWeightUnitId);

        let brandVal = "";
        if (item.product_brand) {
            brandVal = typeof item.product_brand === "object"
                ? String((item.product_brand as { brand_id?: number }).brand_id || "")
                : String(item.product_brand);
        }
        setFormBrand(brandVal);

        let catVal = "";
        if (item.product_category) {
            catVal = typeof item.product_category === "object"
                ? String((item.product_category as { category_id?: number }).category_id || "")
                : String(item.product_category);
        }
        setFormCategory(catVal);

        setFormProductType(item.product_type || 389);
        setFormParentId(item.parent_id ? String(item.parent_id) : "");
        setFormUomCount(item.unit_of_measurement_count ? String(item.unit_of_measurement_count) : "1");

        // Load existing child variants of this family item
        const existingChildren = rawMaterials.filter(rm => Number(rm.parent_id) === Number(item.product_id));
        if (existingChildren.length > 0) {
            setPackagingVariants(existingChildren.map(c => {
                const parentCodeNorm = (item.product_code || "").trim().toUpperCase();
                const childCodeNorm = (c.product_code || "").trim().toUpperCase();
                let suffix = "";
                if (childCodeNorm.startsWith(`${parentCodeNorm}-`)) {
                    suffix = childCodeNorm.slice(parentCodeNorm.length + 1);
                } else {
                    const parts = childCodeNorm.split("-");
                    suffix = parts.length > 1 ? parts[parts.length - 1] : "";
                }

                return {
                    productId: c.product_id,
                    uomId: c.unit_of_measurement?.unit_id || "",
                    count: String(c.unit_of_measurement_count || "1"),
                    codeSuffix: suffix,
                    isExisting: true
                };
            }));
        } else {
            setPackagingVariants([]);
        }

        fetchLinkedSuppliers(item.product_id)
            .then(supplierIds => setSelectedSupplierIds(supplierIds || []))
            .catch(err => console.error("Failed to load item suppliers:", err));
    }, [rawMaterials]);

    const handleStartEdit = (item: RawMaterialItem) => {
        setEditingItem(item);
        populateForm(item);
        setIsModalOpen(true);
    };

    const handleOpenModal = () => {
        setEditingItem(null);
        resetForm();
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingItem(null);
        resetForm();
    };

    const handleParentChange = (val: string) => {
        setFormParentId(val);
        if (val && !editingItem) {
            const parentItem = rawMaterials.find(rm => String(rm.product_id) === String(val));
            if (parentItem && parentItem.product_code) {
                const parentCode = parentItem.product_code;
                const uomShortcut = units.find(u => u.unit_id === Number(formUom))?.unit_shortcut || "UNIT";
                setFormCode(`${parentCode}-${uomShortcut.toUpperCase()}${formUomCount}`);
            }
        }
    };

    const handleCreateBrand = async (name: string) => {
        try {
            const newOpt = await createBrandOnTheFly(name);
            setBrandsList(prev => [...prev, newOpt]);
            setFormBrand(newOpt.value);
            toast.success(`Brand "${name}" created on the fly`);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Failed to create brand";
            toast.error(msg);
        }
    };

    const handleCreateCategory = async (name: string) => {
        try {
            const newOpt = await createCategoryOnTheFly(name);
            setCategoriesList(prev => [...prev, newOpt]);
            setFormCategory(newOpt.value);
            toast.success(`Category "${name}" created on the fly`);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Failed to create category";
            toast.error(msg);
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
                product_id: v.productId,
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
                codeSuffix: cleanSuffix
            };
        });

        // Check variant code uniqueness
        for (const variant of variantsPayload) {
            const exists = rawMaterials.some(rm => {
                if (variant.product_id && Number(rm.product_id) === Number(variant.product_id)) return false;
                return rm.product_code?.trim().toUpperCase() === variant.product_code.toUpperCase();
            });
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
            unit_of_measurement_count: parseFloat(formUomCount) || 1.0,
            cascadeToChildren
        };

        let success = false;
        if (editingItem) {
            success = await onUpdateRawMaterial(editingItem.product_id, payload, selectedSupplierIds, variantsPayload);
        } else {
            success = await onRegisterRawMaterial(payload, selectedSupplierIds, variantsPayload);
        }

        setSaving(false);
        if (success) {
            handleCloseModal();
        }
    };

    return {
        isModalOpen,
        setIsModalOpen,
        handleOpenModal,
        handleCloseModal,
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
        setFormParentId: handleParentChange,
        formUomCount,
        setFormUomCount,
        selectedSupplierIds,
        handleToggleSupplier,
        supplierSearch,
        setSupplierSearch,
        packagingVariants,
        handleAddVariant,
        handleAddPresetVariant,
        handleUpdateVariant,
        handleRemoveVariant,
        cascadeToChildren,
        setCascadeToChildren,
        uomOptions,
        weightUnitOptions,
        parentProductOptions,
        handleCreateBrand,
        handleCreateCategory,
        handleFormSubmit
    };
}
