import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { 
    RawMaterialItem, 
    UnitOption, 
    WeightUnitOption, 
    SelectOption, 
    RegisterRawMaterialPayload, 
    PackagingVariantPayload,
    PackagingVariantFormState,
    PurchaseQaConfig,
    PurchaseQaParameter,
    PurchaseQaSpecificationInput
} from "../types/raw-materials.types";
import { 
    fetchRawMaterialMetadata, 
    fetchLinkedSuppliers, 
    createBrandOnTheFly, 
    createCategoryOnTheFly,
    fetchProductPurchaseQa,
    fetchPurchaseQaParameters
} from "../services/raw-materials.service";
import { resolveProductWeightBreakdown } from "../../packaging-weight";

function emptyPurchaseQaConfig(): PurchaseQaConfig {
    return { inspectionRequired: false, specifications: [] };
}

function parseWeightForm(
    netWeight: string,
    outerCartonWeight: string,
    palletWeight: string,
    weightUnitId: number | "",
    legacyGrossWeight: string,
    requireComplete: boolean
): { hasComponents: boolean; valid: boolean; grossWeight: number | null } {
    const values = [netWeight, outerCartonWeight, palletWeight];
    const hasComponents = values.some(value => value.trim() !== "");
    if (!hasComponents && !requireComplete) {
        if (!legacyGrossWeight.trim()) return { hasComponents: false, valid: true, grossWeight: null };
        const legacy = Number(legacyGrossWeight);
        return {
            hasComponents: false,
            valid: Number.isFinite(legacy) && legacy > 0 && weightUnitId !== "",
            grossWeight: Number.isFinite(legacy) && legacy > 0 ? legacy : null
        };
    }

    try {
        const breakdown = resolveProductWeightBreakdown({
            net_weight: netWeight,
            outer_carton_weight: outerCartonWeight,
            pallet_weight: palletWeight,
            weight_unit_id: weightUnitId
        }, { requireComplete: true });
        return { hasComponents: true, valid: true, grossWeight: breakdown.grossWeight };
    } catch {
        return { hasComponents: true, valid: false, grossWeight: null };
    }
}

function validatePurchaseQaConfig(
    config: PurchaseQaConfig,
    parameters: PurchaseQaParameter[],
    label: string
): string | null {
    if (!config.inspectionRequired) {
        return config.specifications.length > 0
            ? `${label}: remove all specifications or enable Inspection Required.`
            : null;
    }

    if (config.specifications.length === 0) {
        return `${label}: add at least one QA check when Inspection Required is enabled.`;
    }

    const seen = new Set<number>();
    for (const specification of config.specifications as PurchaseQaSpecificationInput[]) {
        const parameter = parameters.find(item => item.parameterId === specification.parameterId);
        if (!parameter) return `${label}: select a valid QA parameter for every check.`;
        if (seen.has(specification.parameterId)) return `${label}: each QA parameter may only be selected once.`;
        seen.add(specification.parameterId);

        if (parameter.dataType === "Numeric") {
            const minimum = specification.targetMin;
            const maximum = specification.targetMax;
            if (minimum === null && maximum === null) {
                return `${label}: ${parameter.parameterName} needs a minimum or maximum threshold.`;
            }
            if (minimum !== null && (!Number.isFinite(minimum))) {
                return `${label}: ${parameter.parameterName} has an invalid minimum threshold.`;
            }
            if (maximum !== null && (!Number.isFinite(maximum))) {
                return `${label}: ${parameter.parameterName} has an invalid maximum threshold.`;
            }
            if (minimum !== null && maximum !== null && minimum > maximum) {
                return `${label}: ${parameter.parameterName} minimum cannot exceed its maximum.`;
            }
        } else if (parameter.dataType === "Boolean") {
            if (specification.expectedText !== "true" && specification.expectedText !== "false") {
                return `${label}: ${parameter.parameterName} needs an expected Yes or No value.`;
            }
        } else if (!specification.expectedText?.trim()) {
            return `${label}: ${parameter.parameterName} needs an expected value.`;
        }
    }

    return null;
}

export function useRawMaterialForm(
    rawMaterials: RawMaterialItem[],
    onRegisterRawMaterial: (productDetails: RegisterRawMaterialPayload, supplierIds: number[], packagingVariants?: PackagingVariantPayload[]) => Promise<boolean>,
    onUpdateRawMaterial: (productId: number, productDetails: RegisterRawMaterialPayload, supplierIds: number[], packagingVariants?: PackagingVariantPayload[]) => Promise<boolean>
) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<RawMaterialItem | null>(null);
    const [saving, setSaving] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);

    const [units, setUnits] = useState<UnitOption[]>([]);
    const [weightUnits, setWeightUnits] = useState<WeightUnitOption[]>([]);
    const [loadingUnits, setLoadingUnits] = useState(false);
    const [brandsList, setBrandsList] = useState<SelectOption[]>([]);
    const [categoriesList, setCategoriesList] = useState<SelectOption[]>([]);
    const [showValidationErrors, setShowValidationErrors] = useState(false);
    const [purchaseQaParameters, setPurchaseQaParameters] = useState<PurchaseQaParameter[]>([]);
    const [loadingPurchaseQa, setLoadingPurchaseQa] = useState(false);
    const [purchaseQaReady, setPurchaseQaReady] = useState(true);
    const [purchaseQaError, setPurchaseQaError] = useState<string | null>(null);

    // Form fields
    const [formName, setFormName] = useState("");
    const [formCode, setFormCode] = useState("");
    const [formDesc, setFormDesc] = useState("");
    const [formUom, setFormUom] = useState<number | "">("");
    const [formDensity, setFormDensity] = useState("");
    const [formWeight, setFormWeight] = useState("");
    const [formNetWeight, setFormNetWeight] = useState("");
    const [formOuterCartonWeight, setFormOuterCartonWeight] = useState("");
    const [formPalletWeight, setFormPalletWeight] = useState("");
    const [formWeightUnitId, setFormWeightUnitId] = useState<number | "">("");
    const [formBrand, setFormBrand] = useState("");
    const [formCategory, setFormCategory] = useState("");
    const [formBarcode, setFormBarcode] = useState("");
    const [formMaintainingQuantity, setFormMaintainingQuantity] = useState("0");
    const [formProductImage, setFormProductImage] = useState<string | null>(null);
    const [formPurchaseQa, setFormPurchaseQa] = useState<PurchaseQaConfig>(emptyPurchaseQaConfig());
    const [formProductType, setFormProductType] = useState<number>(389);
    const [formIsActive, setFormIsActive] = useState(true);
    const [formParentId, setFormParentId] = useState<string>("");
    const [formUomCount, setFormUomCount] = useState<string>("");
    const [selectedSupplierIds, setSelectedSupplierIds] = useState<number[]>([]);
    const [supplierSearch, setSupplierSearch] = useState("");
    const [cascadeToChildren, setCascadeToChildren] = useState(true);
    const [packagingVariants, setPackagingVariants] = useState<PackagingVariantFormState[]>([]);

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

    const selectedParent = useMemo(
        () => formParentId
            ? rawMaterials.find(rm => String(rm.product_id) === String(formParentId))
            : undefined,
        [formParentId, rawMaterials]
    );
    const existingFamilyChildren = useMemo(
        () => editingItem
            ? rawMaterials.filter(rm => Number(rm.parent_id) === Number(editingItem.product_id))
            : [],
        [editingItem, rawMaterials]
    );
    const activeFamilyChildren = useMemo(
        () => existingFamilyChildren.filter(rm => rm.isActive != null && Number(rm.isActive) !== 0),
        [existingFamilyChildren]
    );
    const isEditingChild = Boolean(editingItem?.parent_id);
    const parentSelectionLocked = Boolean(editingItem && activeFamilyChildren.length > 0);
    const classificationLocked = Boolean(formParentId || isEditingChild || existingFamilyChildren.length > 0);
    const inheritedProductType = selectedParent?.product_type
        ?? (isEditingChild
            ? rawMaterials.find(rm => Number(rm.product_id) === Number(editingItem?.parent_id))?.product_type
            : undefined)
        ?? (existingFamilyChildren.length > 0 ? formProductType : undefined);
    const classificationLockMessage = formParentId
        ? "Classification is inherited from the selected parent material."
        : existingFamilyChildren.length > 0
            ? "Classification is locked while child variants exist in this family."
            : "Classification is inherited from the parent material.";
    const parentSelectionLockMessage = "Parent selection is locked while active child variants exist in this family.";

    const handleProductTypeChange = (value: number) => {
        if (!classificationLocked) setFormProductType(value);
    };

    const handleAddVariant = () => {
        setPackagingVariants([...packagingVariants, {
            uomId: "",
            count: "",
            netWeight: "",
            outerCartonWeight: "",
            palletWeight: "",
            codeSuffix: "",
            isActive: true,
            barcode: "",
            maintainingQuantity: "0",
            productImage: null,
            purchaseQa: emptyPurchaseQaConfig()
        }]);
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

        setPackagingVariants([...packagingVariants, {
            uomId,
            count,
            netWeight: "",
            outerCartonWeight: "",
            palletWeight: "",
            codeSuffix,
            isActive: true,
            barcode: "",
            maintainingQuantity: "0",
            productImage: null,
            purchaseQa: emptyPurchaseQaConfig()
        }]);
        toast.info(`Added preset variant "${codeSuffix}"`);
    };

    const handleUpdateVariant = (index: number, field: string, value: unknown) => {
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

                try {
                    setLoadingPurchaseQa(true);
                    setPurchaseQaParameters(await fetchPurchaseQaParameters());
                    setPurchaseQaError(null);
                } catch (qaError) {
                    const message = qaError instanceof Error ? qaError.message : "Failed to load purchase QA parameters.";
                    setPurchaseQaError(message);
                    toast.error(message);
                } finally {
                    setLoadingPurchaseQa(false);
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
        setFormUom("");
        setFormDensity("");
        setFormWeight("");
        setFormNetWeight("");
        setFormOuterCartonWeight("");
        setFormPalletWeight("");
        setFormWeightUnitId("");
        setFormBrand("");
        setFormCategory("");
        setFormBarcode("");
        setFormMaintainingQuantity("0");
        setFormProductImage(null);
        setFormPurchaseQa(emptyPurchaseQaConfig());
        setFormProductType(389);
        setFormIsActive(true);
        setFormParentId("");
        setFormUomCount("");
        setSelectedSupplierIds([]);
        setSupplierSearch("");
        setShowValidationErrors(false);
        setPurchaseQaReady(true);
        setPurchaseQaError(null);
        setPackagingVariants([]);
        setCascadeToChildren(true);
    }, []);

    const loadPurchaseQaForFamily = useCallback(async (parentId: number, childIds: number[]) => {
        setLoadingPurchaseQa(true);
        setPurchaseQaReady(false);
        setPurchaseQaError(null);
        try {
            const ids = [parentId, ...childIds];
            const configs = await Promise.all(ids.map(id => fetchProductPurchaseQa(id)));
            const configByProductId = new Map(childIds.map((id, index) => [id, configs[index + 1]]));
            setFormPurchaseQa(configs[0] || emptyPurchaseQaConfig());
            setPackagingVariants(previous => previous.map(variant => ({
                ...variant,
                purchaseQa: variant.productId ? (configByProductId.get(variant.productId) || emptyPurchaseQaConfig()) : emptyPurchaseQaConfig()
            })));
            setPurchaseQaReady(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to load purchase QA configuration.";
            setPurchaseQaError(message);
            toast.error(message);
        } finally {
            setLoadingPurchaseQa(false);
        }
    }, []);

    const populateForm = useCallback((item: RawMaterialItem) => {
        setFormName(item.product_name || "");
        setFormCode(item.product_code || "");
        setFormDesc(item.description || "");
        setFormBarcode(item.barcode || "");
        setFormMaintainingQuantity(String(item.maintaining_quantity ?? 0));
        setFormProductImage(item.product_image || null);
        setFormPurchaseQa(emptyPurchaseQaConfig());
        setPurchaseQaReady(false);
        setPurchaseQaError(null);
        setFormUom(item.unit_of_measurement?.unit_id || "");
        setFormDensity(String(item.density_factor || "1.000"));
        setFormWeight(item.weight && Number(item.weight) > 0 ? String(item.weight) : "");
        setFormNetWeight(item.net_weight != null ? String(item.net_weight) : "");
        setFormOuterCartonWeight(item.outer_carton_weight != null ? String(item.outer_carton_weight) : "");
        setFormPalletWeight(item.pallet_weight != null ? String(item.pallet_weight) : "");

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

        const parentItem = item.parent_id
            ? rawMaterials.find(rm => Number(rm.product_id) === Number(item.parent_id))
            : undefined;
        setFormProductType(parentItem?.product_type || item.product_type || 389);
        setFormIsActive(item.isActive !== 0);
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
                    netWeight: c.net_weight != null ? String(c.net_weight) : "",
                    outerCartonWeight: c.outer_carton_weight != null ? String(c.outer_carton_weight) : "",
                    palletWeight: c.pallet_weight != null ? String(c.pallet_weight) : "",
                    codeSuffix: suffix,
                    isExisting: true,
                    isActive: c.isActive !== 0,
                    barcode: c.barcode || "",
                    maintainingQuantity: String(c.maintaining_quantity ?? 0),
                    productImage: c.product_image || null,
                    purchaseQa: emptyPurchaseQaConfig()
                };
            }));
        } else {
            setPackagingVariants([]);
        }

        void loadPurchaseQaForFamily(item.product_id, existingChildren.map(child => child.product_id));

        fetchLinkedSuppliers(item.product_id)
            .then(supplierIds => setSelectedSupplierIds(supplierIds || []))
            .catch(err => console.error("Failed to load item suppliers:", err));
    }, [loadPurchaseQaForFamily, rawMaterials]);

    const handleStartEdit = (item: RawMaterialItem) => {
        setEditingItem(item);
        setSubmitError(null);
        populateForm(item);
        setIsModalOpen(true);
    };

    const handleOpenModal = () => {
        setEditingItem(null);
        setSubmitError(null);
        resetForm();
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingItem(null);
        setSubmitError(null);
        resetForm();
    };

    const handleParentChange = (val: string) => {
        if (parentSelectionLocked) return;

        setFormParentId(val);
        const parentItem = val
            ? rawMaterials.find(rm => String(rm.product_id) === String(val))
            : undefined;
        if (parentItem?.product_type) {
            setFormProductType(Number(parentItem.product_type));
        }
        if (val && !editingItem) {
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
        setSubmitError(null);

        // Validation Checks
        const isPackagingMaterial = Number(formProductType) === 390;
        const isNameEmpty = !formName.trim();
        const isCodeEmpty = !formCode.trim();
        const isUomEmpty = !formUom;
        const isCategoryEmpty = !formCategory;
        const isDensityInvalid = !formDensity || !Number.isFinite(Number(formDensity)) || Number(formDensity) <= 0;
        const isUomCountInvalid = !formUomCount || !Number.isFinite(Number(formUomCount)) || Number(formUomCount) <= 0;
        const hasWeightValue = formWeight.trim() !== "";
        const hasWeightUnitValue = formWeightUnitId !== "";
        const parsedWeight = hasWeightValue ? Number(formWeight) : null;
        const parsedWeightUnitId = hasWeightUnitValue ? Number(formWeightUnitId) : null;
        const isWeightValueInvalid = hasWeightValue && (!Number.isFinite(parsedWeight) || (parsedWeight as number) <= 0);
        const isWeightUnitInvalid = hasWeightUnitValue && (!Number.isFinite(parsedWeightUnitId) || (parsedWeightUnitId as number) <= 0);
        const isWeightPairIncomplete = hasWeightValue !== hasWeightUnitValue;
        const weightForm = parseWeightForm(
            formNetWeight,
            formOuterCartonWeight,
            formPalletWeight,
            formWeightUnitId,
            formWeight,
            isPackagingMaterial
        );
        const isWeightInvalid = isPackagingMaterial
            ? !weightForm.valid || !hasWeightUnitValue
            : weightForm.hasComponents
                ? !weightForm.valid || !hasWeightUnitValue
                : isWeightPairIncomplete || isWeightValueInvalid || isWeightUnitInvalid;

        if (isNameEmpty || isCodeEmpty || isUomEmpty || isCategoryEmpty || isDensityInvalid || isWeightInvalid || isUomCountInvalid) {
            setShowValidationErrors(true);
            toast.error(isPackagingMaterial
                ? "Please fill out Net Weight, Outer Carton Weight, Pallet Weight, and Weight Unit. Gross Weight is calculated automatically."
                : "Please fill out all mandatory fields correctly.");
            return;
        }

        if (editingItem && !purchaseQaReady) {
            setShowValidationErrors(true);
            toast.error(purchaseQaError || "Purchase QA configuration is still loading. Please try again.");
            return;
        }

        const parsedSafetyStock = Number(formMaintainingQuantity);
        if (!Number.isSafeInteger(parsedSafetyStock) || parsedSafetyStock < 0) {
            setShowValidationErrors(true);
            toast.error("Safety Stock must be a whole number greater than or equal to 0.");
            return;
        }

        const purchaseQaErrorMessage = validatePurchaseQaConfig(formPurchaseQa, purchaseQaParameters, "Base material QA");
        if (purchaseQaErrorMessage) {
            setShowValidationErrors(true);
            toast.error(purchaseQaErrorMessage);
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
        const hasInvalidVariant = packagingVariants.some(v =>
            !v.uomId ||
            !v.count ||
            !Number.isFinite(Number(v.count)) ||
            Number(v.count) <= 0 ||
            (isPackagingMaterial && !parseWeightForm(
                v.netWeight,
                v.outerCartonWeight,
                v.palletWeight,
                formWeightUnitId,
                "",
                true
            ).valid)
        );
        if (hasInvalidVariant) {
            toast.error("Please fill out all packaging variant fields with valid units and conversion counts.");
            return;
        }

        for (const [index, variant] of packagingVariants.entries()) {
            const variantSafetyStock = Number(variant.maintainingQuantity);
            if (!Number.isSafeInteger(variantSafetyStock) || variantSafetyStock < 0) {
                setShowValidationErrors(true);
                toast.error(`Variant ${index + 1}: Safety Stock must be a whole number greater than or equal to 0.`);
                return;
            }
            const variantQaError = validatePurchaseQaConfig(variant.purchaseQa, purchaseQaParameters, `Variant ${index + 1} QA`);
            if (variantQaError) {
                setShowValidationErrors(true);
                toast.error(variantQaError);
                return;
            }
        }

        if (packagingVariants.length > 0 && isPackagingMaterial && (!weightForm.valid || !hasWeightUnitValue)) {
            toast.error("Weight components and Weight Unit are required for the packaging family and every variant.");
            setShowValidationErrors(true);
            return;
        }

        const parsedBaseWeight = weightForm.grossWeight ?? parsedWeight;
        const parsedNetWeight = weightForm.hasComponents ? Number(formNetWeight) : null;
        const parsedOuterCartonWeight = weightForm.hasComponents ? Number(formOuterCartonWeight) : null;
        const parsedPalletWeight = weightForm.hasComponents ? Number(formPalletWeight) : null;
        const selectedWeightUnitIdNum = parsedWeightUnitId;
        const parsedDensity = Number(formDensity);
        const parsedUomCount = Number(formUomCount);

        const variantsPayload = packagingVariants.map(v => {
            const vUomShortcut = units.find(u => u.unit_id === Number(v.uomId))?.unit_shortcut || "Unit";
            const cleanSuffix = v.codeSuffix.trim() || `${vUomShortcut.toUpperCase()}${v.count}`;
            const variantCount = parseFloat(v.count);
            const variantWeight = parseWeightForm(
                v.netWeight,
                v.outerCartonWeight,
                v.palletWeight,
                formWeightUnitId,
                "",
                isPackagingMaterial
            );
            return {
                product_id: v.productId,
                product_code: `${normalizedCode}-${cleanSuffix}`,
                unit_of_measurement: Number(v.uomId),
                unit_of_measurement_count: variantCount,
                density_factor: parsedDensity,
                weight: isPackagingMaterial
                    ? variantWeight.grossWeight
                    : (parsedBaseWeight == null ? null : parsedBaseWeight * variantCount),
                net_weight: variantWeight.hasComponents ? Number(v.netWeight) : undefined,
                outer_carton_weight: variantWeight.hasComponents ? Number(v.outerCartonWeight) : undefined,
                pallet_weight: variantWeight.hasComponents ? Number(v.palletWeight) : undefined,
                weight_unit_id: selectedWeightUnitIdNum as number,
                product_brand: formBrand ? Number(formBrand) : undefined,
                product_category: formCategory ? Number(formCategory) : undefined,
                isActive: v.isActive ? 1 : 0,
                barcode: v.barcode.trim() || undefined,
                maintaining_quantity: Number(v.maintainingQuantity),
                product_image: v.productImage,
                purchaseQa: v.purchaseQa,
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
            density_factor: parsedDensity,
            weight: parsedBaseWeight,
            net_weight: parsedNetWeight,
            outer_carton_weight: parsedOuterCartonWeight,
            pallet_weight: parsedPalletWeight,
            weight_unit_id: selectedWeightUnitIdNum,
            product_brand: formBrand ? Number(formBrand) : undefined,
            product_category: formCategory ? Number(formCategory) : undefined,
            product_type: formProductType,
            parent_id: formParentId ? Number(formParentId) : null,
            unit_of_measurement_count: parsedUomCount,
            isActive: formIsActive ? 1 : 0,
            barcode: formBarcode.trim() || undefined,
            maintaining_quantity: parsedSafetyStock,
            product_image: formProductImage,
            purchaseQa: formPurchaseQa,
            cascadeToChildren
        };

        let success = false;
        try {
            if (editingItem) {
                success = await onUpdateRawMaterial(editingItem.product_id, payload, selectedSupplierIds, variantsPayload);
            } else {
                success = await onRegisterRawMaterial(payload, selectedSupplierIds, variantsPayload);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to save raw material.";
            setSubmitError(message);
            toast.error(message);
        } finally {
            setSaving(false);
        }

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
        submitError,
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
        formNetWeight,
        setFormNetWeight,
        formOuterCartonWeight,
        setFormOuterCartonWeight,
        formPalletWeight,
        setFormPalletWeight,
        formWeightUnitId,
        setFormWeightUnitId,
        formBrand,
        setFormBrand,
        formCategory,
        setFormCategory,
        formBarcode,
        setFormBarcode,
        formMaintainingQuantity,
        setFormMaintainingQuantity,
        formProductImage,
        setFormProductImage,
        formPurchaseQa,
        setFormPurchaseQa,
        purchaseQaParameters,
        loadingPurchaseQa,
        purchaseQaReady,
        purchaseQaError,
        formProductType,
        setFormProductType: handleProductTypeChange,
        classificationLocked,
        inheritedProductType,
        classificationLockMessage,
        parentSelectionLocked,
        parentSelectionLockMessage,
        formIsActive,
        setFormIsActive,
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
