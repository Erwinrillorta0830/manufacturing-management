import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
    PurchaseQaSpecificationInput,
    PriceControlValue,
    TaxRateOption,
    RawMaterialValidationErrors
} from "../types/raw-materials.types";
import { 
    fetchRawMaterialMetadata, 
    fetchProductSupplierLinks,
    createBrandOnTheFly, 
    createCategoryOnTheFly,
    fetchProductPurchaseQa,
    fetchPurchaseQaParameters
} from "../services/raw-materials.service";
import {
    isPackagingMaterialProductType,
    resolveProductWeightBreakdown,
    validateProductWeightForProductType
} from "../../packaging-weight";
import { resolveParentSharedAttributes } from "../parent-inheritance";

function emptyPurchaseQaConfig(): PurchaseQaConfig {
    return { inspectionRequired: false, specifications: [] };
}

function normalizeUomId(value: unknown): number | null {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return normalizeUomId(record.unit_id ?? record.id ?? record.value);
    }

    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function rawMaterialUomId(item: RawMaterialItem | null | undefined): number | null {
    return normalizeUomId(item?.unit_of_measurement);
}

function haveSameSupplierIds(left: number[], right: number[]): boolean {
    if (left.length !== right.length) return false;
    const rightSet = new Set(right);
    return left.every(id => rightSet.has(id));
}

function getSelectedDensityRequirement(
    units: UnitOption[],
    uomId: number | ""
): boolean | null {
    if (uomId === "") return null;
    return units.find(unit => unit.unit_id === Number(uomId))?.requiresDensity ?? null;
}

function densityPolicyError(
    units: UnitOption[],
    uomId: number | "",
    label: string
): string | null {
    if (uomId === "") return null;
    if (!units.some(unit => unit.unit_id === Number(uomId))) {
        return `${label} UOM is invalid or unavailable.`;
    }
    if (getSelectedDensityRequirement(units, uomId) === null) {
        return `${label} UOM has no configured density policy.`;
    }
    return null;
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

function emptyRawMaterialValidationErrors(): RawMaterialValidationErrors {
    return { base: {}, variants: {} };
}

function hasValidationErrors(errors: RawMaterialValidationErrors): boolean {
    return Boolean(
        errors.global
        || Object.keys(errors.base).length > 0
        || Object.values(errors.variants).some(fields => Object.keys(fields).length > 0)
    );
}

function firstValidationError(errors: RawMaterialValidationErrors): string {
    if (errors.global) return errors.global;

    const baseError = Object.values(errors.base)[0];
    if (baseError) return baseError;

    for (const fields of Object.values(errors.variants)) {
        const variantError = Object.values(fields)[0];
        if (variantError) return variantError;
    }

    return "Please fill out all mandatory fields correctly.";
}

function collectWeightValidationErrors(
    target: Record<string, string>,
    fields: {
        netWeight: string;
        outerCartonWeight: string;
        palletWeight: string;
        weightUnitId: number | "";
        legacyWeight: string;
    },
    productType: number,
    label: string
): string | null {
    const validationError = validateProductWeightForProductType({
        weight: fields.legacyWeight,
        net_weight: fields.netWeight,
        outer_carton_weight: fields.outerCartonWeight,
        pallet_weight: fields.palletWeight,
        weight_unit_id: fields.weightUnitId
    }, productType);

    if (!validationError) return null;

    const isPackagingMaterial = isPackagingMaterialProductType(productType);
    const hasWeightComponents = [
        fields.netWeight,
        fields.outerCartonWeight,
        fields.palletWeight
    ].some(value => value.trim() !== "");
    const netWeightInvalid = fields.netWeight.trim() !== ""
        && (!Number.isFinite(Number(fields.netWeight)) || Number(fields.netWeight) < 0);
    const outerCartonWeightInvalid = fields.outerCartonWeight.trim() !== ""
        && (!Number.isFinite(Number(fields.outerCartonWeight)) || Number(fields.outerCartonWeight) < 0);
    const palletWeightInvalid = fields.palletWeight.trim() !== ""
        && (!Number.isFinite(Number(fields.palletWeight)) || Number(fields.palletWeight) < 0);
    const weightUnitInvalid = fields.weightUnitId !== ""
        && (!Number.isFinite(Number(fields.weightUnitId)) || Number(fields.weightUnitId) <= 0);
    const componentValuesComplete = fields.netWeight.trim() !== ""
        && fields.outerCartonWeight.trim() !== ""
        && fields.palletWeight.trim() !== "";
    const grossWeight = componentValuesComplete
        && !netWeightInvalid
        && !outerCartonWeightInvalid
        && !palletWeightInvalid
        ? Number(fields.netWeight) + Number(fields.outerCartonWeight) + Number(fields.palletWeight)
        : Number(fields.legacyWeight) || 0;
    const grossWeightInvalid = (isPackagingMaterial || hasWeightComponents) && grossWeight <= 0;
    const message = `${label}: ${validationError}`;

    if (isPackagingMaterial || hasWeightComponents) {
        if (!fields.netWeight.trim() || netWeightInvalid || grossWeightInvalid) target.netWeight = message;
        if (!fields.outerCartonWeight.trim() || outerCartonWeightInvalid || grossWeightInvalid) target.outerCartonWeight = message;
        if (!fields.palletWeight.trim() || palletWeightInvalid || grossWeightInvalid) target.palletWeight = message;
        if (fields.weightUnitId === "" || weightUnitInvalid) target.weightUnit = message;
        if (grossWeightInvalid) target.grossWeight = message;
    } else {
        if (!fields.legacyWeight.trim() || !Number.isFinite(Number(fields.legacyWeight)) || Number(fields.legacyWeight) <= 0) {
            target.grossWeight = message;
        }
        if (fields.weightUnitId === "" || weightUnitInvalid) target.weightUnit = message;
    }

    return validationError;
}

export function useRawMaterialForm(
    rawMaterials: RawMaterialItem[],
    onRegisterRawMaterial: (productDetails: RegisterRawMaterialPayload, supplierIds?: number[], packagingVariants?: PackagingVariantPayload[]) => Promise<boolean>,
    onUpdateRawMaterial: (productId: number, productDetails: RegisterRawMaterialPayload, supplierIds?: number[], packagingVariants?: PackagingVariantPayload[]) => Promise<boolean>
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
    const [itemGroupsList, setItemGroupsList] = useState<SelectOption[]>([]);
    const [taxRatesList, setTaxRatesList] = useState<TaxRateOption[]>([]);
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
    const [formProductClass, setFormProductClass] = useState<number | "">("");
    const [formProductSegment, setFormProductSegment] = useState<number | "">("");
    const [formProductSection, setFormProductSection] = useState<number | "">("");
    const [formItemGroupId, setFormItemGroupId] = useState<number | "">("");
    const [formTaxRateId, setFormTaxRateId] = useState<number | "">("");
    const [formRegulatoryCode, setFormRegulatoryCode] = useState("");
    const [formRegulatoryNotes, setFormRegulatoryNotes] = useState("");
    const [formPriceControl, setFormPriceControl] = useState<PriceControlValue | null>(null);
    const [formBarcode, setFormBarcode] = useState("");
    const [formMaintainingQuantity, setFormMaintainingQuantity] = useState("0");
    const [formProductImage, setFormProductImage] = useState<string | null>(null);
    const [formPurchaseQa, setFormPurchaseQa] = useState<PurchaseQaConfig>(emptyPurchaseQaConfig());
    const [formProductType, setFormProductType] = useState<number>(389);
    const [formIsActive, setFormIsActive] = useState(true);
    const [formParentId, setFormParentId] = useState<string>("");
    const [formUomCount, setFormUomCount] = useState<string>("");
    const [selectedSupplierIds, setSelectedSupplierIds] = useState<number[]>([]);
    const [cascadeToChildren, setCascadeToChildren] = useState(true);
    const [packagingVariants, setPackagingVariants] = useState<PackagingVariantFormState[]>([]);
    const supplierLinkRequestId = useRef(0);

    const syncVariantSupplierSnapshots = useCallback((supplierIds: number[]) => {
        setPackagingVariants(previous => previous.map(variant => {
            if (variant.isExisting) {
                return {
                    ...variant,
                    suppliersInherited: haveSameSupplierIds(variant.supplierIds, supplierIds)
                };
            }

            return {
                ...variant,
                supplierIds: [...supplierIds],
                suppliersInherited: true
            };
        }));
    }, []);

    const selectedParent = useMemo(
        () => formParentId
            ? rawMaterials.find(rm => String(rm.product_id) === String(formParentId))
            : undefined,
        [formParentId, rawMaterials]
    );

    const uomOptions = useMemo(() => {
        return units.map(u => ({
            value: String(u.unit_id),
            label: `${u.unit_name} (${u.unit_shortcut})${rawMaterialUomId(selectedParent) === u.unit_id ? " — same as parent (select another)" : ""}`,
            disabled: rawMaterialUomId(selectedParent) === u.unit_id,
            requiresDensity: u.requiresDensity
        }));
    }, [units, selectedParent]);

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
                return !rm.parent_id && Number(rm.product_type) === Number(formProductType);
            })
            .map(rm => ({
                value: String(rm.product_id),
                label: `${rm.product_name} (${rm.product_code || `ID-${rm.product_id}`})`
            }));
    }, [rawMaterials, editingItem, formProductType]);

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
    const parentRelationshipError = useMemo(() => {
        if (!formParentId) return null;
        if (!selectedParent) return "The selected parent material is no longer available.";
        if (selectedParent.parent_id) return "A child variant cannot be selected as a parent material.";
        if (Number(selectedParent.product_type) !== Number(formProductType)) {
            return "The parent material and Category Type must match.";
        }

        const parentUomId = rawMaterialUomId(selectedParent);
        const childUomId = normalizeUomId(formUom);
        if (!parentUomId) return "The selected parent material has no valid Primary UOM. Refresh the material data before saving.";
        if (childUomId && childUomId === parentUomId) {
            return "A child material must use a different Primary UOM from its parent material.";
        }

        return null;
    }, [formParentId, formProductType, formUom, selectedParent]);

    const parentUomChangeError = useMemo(() => {
        if (!editingItem || formParentId || existingFamilyChildren.length === 0) return null;

        const parentUomId = normalizeUomId(formUom);
        if (!parentUomId) return null;

        const conflictingChild = existingFamilyChildren.find(child => rawMaterialUomId(child) === parentUomId);
        return conflictingChild
            ? `Primary UOM cannot match child material ${conflictingChild.product_name}. Select a different UOM before saving.`
            : null;
    }, [editingItem, existingFamilyChildren, formParentId, formUom]);

    const effectiveParentRelationshipError = parentRelationshipError || parentUomChangeError;
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

    const collectValidationErrors = (): RawMaterialValidationErrors => {
        const errors = emptyRawMaterialValidationErrors();
        const addBaseError = (field: string, message: string) => {
            if (!errors.base[field]) errors.base[field] = message;
        };

        const normalizedCode = formCode.trim().toUpperCase();
        const originalCode = editingItem?.product_code?.trim().toUpperCase() || "";
        const isCodeChanged = !editingItem || normalizedCode !== originalCode;
        const normalizedName = formName.trim().toLowerCase();
        const originalName = editingItem?.product_name?.trim().toLowerCase() || "";
        const isNameChanged = !editingItem || normalizedName !== originalName;

        if (!formName.trim()) {
            addBaseError("name", "Material name is required.");
        } else if (isNameChanged && rawMaterials.some(rawMaterial => {
            if (editingItem && Number(rawMaterial.product_id) === Number(editingItem.product_id)) return false;
            return rawMaterial.product_name.trim().toLowerCase() === normalizedName;
        })) {
            addBaseError("name", "A material with this name already exists. Please choose a unique name.");
        }

        if (!formCode.trim()) {
            addBaseError("code", "SKU code is required.");
        } else if (isCodeChanged && rawMaterials.some(rawMaterial => {
            if (editingItem && Number(rawMaterial.product_id) === Number(editingItem.product_id)) return false;
            return rawMaterial.product_code?.trim().toUpperCase() === normalizedCode;
        })) {
            addBaseError("code", `The product code "${normalizedCode}" is already assigned. Please provide a unique product code.`);
        }

        if (!formCategory) addBaseError("category", "Category is required.");

        const densityRequirement = getSelectedDensityRequirement(units, formUom);
        const primaryUomPolicyError = densityPolicyError(units, formUom, "Primary");
        if (!formUom) {
            addBaseError("uom", "Primary UOM is required.");
        } else if (primaryUomPolicyError) {
            addBaseError("uom", primaryUomPolicyError);
        }

        if (!formUomCount || !Number.isFinite(Number(formUomCount)) || Number(formUomCount) <= 0) {
            addBaseError("uomCount", "UOM ratio must be greater than 0.");
        }

        if (densityRequirement === true && (
            !formDensity
            || !Number.isFinite(Number(formDensity))
            || Number(formDensity) <= 0
        )) {
            addBaseError("density", "Density is required and must be greater than 0.");
        }

        collectWeightValidationErrors(
            errors.base,
            {
                netWeight: formNetWeight,
                outerCartonWeight: formOuterCartonWeight,
                palletWeight: formPalletWeight,
                weightUnitId: formWeightUnitId,
                legacyWeight: formWeight
            },
            formProductType,
            "Base material"
        );

        const parsedSafetyStock = Number(formMaintainingQuantity);
        if (!Number.isSafeInteger(parsedSafetyStock) || parsedSafetyStock < 0) {
            addBaseError("safetyStock", "Safety Stock must be a whole number greater than or equal to 0.");
        }

        if (effectiveParentRelationshipError) {
            addBaseError("parent", effectiveParentRelationshipError);
        }

        if (loadingPurchaseQa || (editingItem && !purchaseQaReady)) {
            errors.global = purchaseQaError || "Purchase QA configuration is still loading. Please try again.";
        }

        const purchaseQaErrorMessage = validatePurchaseQaConfig(formPurchaseQa, purchaseQaParameters, "Base material QA");
        if (purchaseQaErrorMessage) addBaseError("purchaseQa", purchaseQaErrorMessage);

        const baseUomId = normalizeUomId(formUom);
        const generatedVariantCodes = new Map<string, number>();

        packagingVariants.forEach((variant, index) => {
            const variantErrors: Record<string, string> = {};
            const variantUomId = normalizeUomId(variant.uomId);
            const usesParentUom = baseUomId !== null && variantUomId === baseUomId;
            const variantUomPolicyError = densityPolicyError(units, variant.uomId, `Variant ${index + 1}`);
            const variantDensityRequirement = getSelectedDensityRequirement(units, variant.uomId);

            if (!variantUomId) {
                variantErrors.uom = `Variant ${index + 1}: Outer Package UOM is required.`;
            } else if (usesParentUom) {
                variantErrors.uom = `Variant ${index + 1}: The parent Primary UOM cannot be used as an Outer Package UOM.`;
            } else if (variantUomPolicyError) {
                variantErrors.uom = variantUomPolicyError;
            }

            if (!variant.count || !Number.isFinite(Number(variant.count)) || Number(variant.count) <= 0) {
                variantErrors.count = `Variant ${index + 1}: Conversion ratio must be greater than 0.`;
            }

            if (variantDensityRequirement === true && (
                !variant.density
                || !Number.isFinite(Number(variant.density))
                || Number(variant.density) <= 0
            )) {
                variantErrors.density = `Variant ${index + 1}: Density is required and must be greater than 0.`;
            }

            collectWeightValidationErrors(
                variantErrors,
                {
                    netWeight: variant.netWeight,
                    outerCartonWeight: variant.outerCartonWeight,
                    palletWeight: variant.palletWeight,
                    weightUnitId: variant.weightUnitId,
                    legacyWeight: variant.weight
                },
                formProductType,
                `Variant ${index + 1}`
            );

            const variantSafetyStock = Number(variant.maintainingQuantity);
            if (!Number.isSafeInteger(variantSafetyStock) || variantSafetyStock < 0) {
                variantErrors.safetyStock = `Variant ${index + 1}: Safety Stock must be a whole number greater than or equal to 0.`;
            }

            const variantQaError = validatePurchaseQaConfig(variant.purchaseQa, purchaseQaParameters, `Variant ${index + 1} QA`);
            if (variantQaError) variantErrors.purchaseQa = variantQaError;

            const variantUomShortcut = units.find(unit => unit.unit_id === variantUomId)?.unit_shortcut || "Unit";
            const cleanSuffix = variant.codeSuffix.trim() || `${variantUomShortcut.toUpperCase()}${variant.count}`;
            const generatedCode = `${normalizedCode}-${cleanSuffix}`.toUpperCase();
            if (normalizedCode && rawMaterials.some(rawMaterial => {
                if (variant.productId && Number(rawMaterial.product_id) === Number(variant.productId)) return false;
                return rawMaterial.product_code?.trim().toUpperCase() === generatedCode;
            })) {
                variantErrors.code = `Variant ${index + 1}: The packaging variant code "${generatedCode}" already exists in the catalog.`;
            }

            const previousIndex = generatedVariantCodes.get(generatedCode);
            if (previousIndex !== undefined) {
                variantErrors.code = `Variant ${index + 1}: The generated packaging variant code "${generatedCode}" must be unique.`;
                const previousErrors = errors.variants[previousIndex] || {};
                previousErrors.code = `Variant ${previousIndex + 1}: The generated packaging variant code "${generatedCode}" must be unique.`;
                errors.variants[previousIndex] = previousErrors;
            } else {
                generatedVariantCodes.set(generatedCode, index);
            }

            if (Object.keys(variantErrors).length > 0) {
                errors.variants[index] = variantErrors;
            }
        });

        return errors;
    };

    const validationErrors = showValidationErrors
        ? collectValidationErrors()
        : emptyRawMaterialValidationErrors();

    const handleProductTypeChange = (value: number) => {
        if (!classificationLocked) setFormProductType(value);
    };

    const handlePrimaryUomChange = (value: number | "") => {
        if (String(formUom) !== String(value)) setFormDensity("");
        setFormUom(value);
    };

    const resetChildSpecificFields = useCallback(() => {
        setFormUom("");
        setFormUomCount("");
        setFormDensity("");
        setFormWeight("");
        setFormNetWeight("");
        setFormOuterCartonWeight("");
        setFormPalletWeight("");
        setFormWeightUnitId("");
        setPackagingVariants([]);
    }, []);

    const applyParentSharedAttributes = useCallback((parentItem: RawMaterialItem) => {
        const shared = resolveParentSharedAttributes(parentItem);
        setFormProductType(shared.product_type || 389);
        setFormBrand(shared.product_brand == null ? "" : String(shared.product_brand));
        setFormCategory(shared.product_category == null ? "" : String(shared.product_category));
        setFormProductClass(shared.product_class == null ? "" : shared.product_class);
        setFormProductSegment(shared.product_segment == null ? "" : shared.product_segment);
        setFormProductSection(shared.product_section == null ? "" : shared.product_section);
        setFormItemGroupId(shared.item_group_id == null ? "" : shared.item_group_id);
        setFormTaxRateId(shared.tax_rate_id == null ? "" : shared.tax_rate_id);
        setFormRegulatoryCode(shared.regulatory_code || "");
        setFormRegulatoryNotes(shared.regulatory_notes || "");
        setFormPriceControl(shared.price_control);
    }, []);

    const handleAddVariant = () => {
        setPackagingVariants([...packagingVariants, {
            uomId: "",
            count: "",
            density: "",
            weight: "",
            netWeight: "",
            outerCartonWeight: "",
            palletWeight: "",
            weightUnitId: "",
            codeSuffix: "",
            isActive: true,
            barcode: "",
            maintainingQuantity: "0",
            productImage: null,
            purchaseQa: emptyPurchaseQaConfig(),
            supplierIds: [...selectedSupplierIds],
            suppliersInherited: true
        }]);
    };

    const handleAddPresetVariant = (presetType: "bag25" | "sack50" | "drum200" | "ibc1000" | "fibc1000" | "case12") => {
        const baseUomId = formUom === "" ? null : Number(formUom);
        const eligibleUnits = units.filter(unit => baseUomId === null || unit.unit_id !== baseUomId);
        const findUom = (keywords: string[]) => {
            return eligibleUnits.find(u => {
                const sc = (u.unit_shortcut || "").toLowerCase();
                const nm = (u.unit_name || "").toLowerCase();
                return keywords.some(k => sc.includes(k) || nm.includes(k));
            })?.unit_id || "";
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

        if (!uomId) {
            toast.error(`No eligible Outer Package UOM is available for the "${codeSuffix}" preset.`);
            return;
        }

        setPackagingVariants([...packagingVariants, {
            uomId,
            count,
            density: "",
            weight: "",
            netWeight: "",
            outerCartonWeight: "",
            palletWeight: "",
            weightUnitId: "",
            codeSuffix,
            isActive: true,
            barcode: "",
            maintainingQuantity: "0",
            productImage: null,
            purchaseQa: emptyPurchaseQaConfig(),
            supplierIds: [...selectedSupplierIds],
            suppliersInherited: true
        }]);
        toast.info(`Added preset variant "${codeSuffix}"`);
    };

    const handleUpdateVariant = (index: number, field: string, value: unknown) => {
        const copy = [...packagingVariants];
        const current = copy[index];
        copy[index] = field === "uomId" && String(current.uomId) !== String(value)
            ? { ...current, uomId: value as number | "", density: "" }
            : { ...current, [field]: value };
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
                const initialUomId = editingItem?.unit_of_measurement?.unit_id || "";
                if (meta.units.find(unit => unit.unit_id === Number(initialUomId))?.requiresDensity !== true) {
                    setFormDensity("");
                }
                setPackagingVariants(previous => previous.map(variant => (
                    meta.units.find(unit => unit.unit_id === Number(variant.uomId))?.requiresDensity === true
                        ? variant
                        : { ...variant, density: "" }
                )));
                setWeightUnits(meta.weightUnits);
                setBrandsList(meta.brands);
                setCategoriesList(meta.categories);
                setItemGroupsList(meta.itemGroups);
                setTaxRatesList(meta.taxRates);

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
        supplierLinkRequestId.current += 1;
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
        setFormProductClass("");
        setFormProductSegment("");
        setFormProductSection("");
        setFormItemGroupId("");
        setFormTaxRateId("");
        setFormRegulatoryCode("");
        setFormRegulatoryNotes("");
        setFormPriceControl(null);
        setFormBarcode("");
        setFormMaintainingQuantity("0");
        setFormProductImage(null);
        setFormPurchaseQa(emptyPurchaseQaConfig());
        setFormProductType(389);
        setFormIsActive(true);
        setFormParentId("");
        setFormUomCount("");
        setSelectedSupplierIds([]);
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
        setFormDensity(item.density_factor != null ? String(item.density_factor) : "");
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
        setFormProductClass(item.product_class == null ? "" : Number(item.product_class));
        setFormProductSegment(item.product_segment == null ? "" : Number(item.product_segment));
        setFormProductSection(item.product_section == null ? "" : Number(item.product_section));
        setFormItemGroupId(item.item_group_id == null ? "" : Number(item.item_group_id));
        setFormTaxRateId(item.tax_rate_id == null ? "" : Number(item.tax_rate_id));
        setFormRegulatoryCode(item.regulatory_code || "");
        setFormRegulatoryNotes(item.regulatory_notes || "");
        setFormPriceControl(item.price_control || null);
        if (parentItem) applyParentSharedAttributes(parentItem);
        setFormIsActive(item.isActive !== 0);
        setFormParentId(item.parent_id ? String(item.parent_id) : "");
        setFormUomCount(item.unit_of_measurement_count ? String(item.unit_of_measurement_count) : "1");

        // Load existing child variants of this family item.
        const existingChildren = rawMaterials.filter(rm => Number(rm.parent_id) === Number(item.product_id));
        const familyRootId = item.parent_id ? Number(item.parent_id) : item.product_id;
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
                    density: c.density_factor != null ? String(c.density_factor) : "",
                    weight: c.weight != null && Number(c.weight) > 0 ? String(c.weight) : "",
                    netWeight: c.net_weight != null ? String(c.net_weight) : "",
                    outerCartonWeight: c.outer_carton_weight != null ? String(c.outer_carton_weight) : "",
                    palletWeight: c.pallet_weight != null ? String(c.pallet_weight) : "",
                    weightUnitId: typeof c.weight_unit_id === "object"
                        ? (c.weight_unit_id?.id || c.weight_unit_id?.unit_id || "")
                        : (c.weight_unit_id || ""),
                    codeSuffix: suffix,
                    isExisting: true,
                    isActive: c.isActive !== 0,
                    barcode: c.barcode || "",
                    maintainingQuantity: String(c.maintaining_quantity ?? 0),
                    productImage: c.product_image || null,
                    purchaseQa: emptyPurchaseQaConfig(),
                    supplierIds: [],
                    suppliersInherited: false
                };
            }));
        } else {
            setPackagingVariants([]);
        }

        void loadPurchaseQaForFamily(item.product_id, existingChildren.map(child => child.product_id));

        setSelectedSupplierIds([]);
        const supplierRequestId = ++supplierLinkRequestId.current;
        const familySupplierProductIds = [...new Set([
            familyRootId,
            item.product_id,
            ...existingChildren.map(child => child.product_id)
        ])];
        fetchProductSupplierLinks(familySupplierProductIds)
            .then(linksByProduct => {
                if (supplierRequestId !== supplierLinkRequestId.current) return;
                const parentSupplierIds = linksByProduct.get(familyRootId) || [];
                setSelectedSupplierIds(parentSupplierIds);
                setPackagingVariants(previous => previous.map(variant => {
                    const variantSupplierIds = variant.productId
                        ? linksByProduct.get(variant.productId) || []
                        : parentSupplierIds;
                    return {
                        ...variant,
                        supplierIds: [...variantSupplierIds],
                        suppliersInherited: haveSameSupplierIds(variantSupplierIds, parentSupplierIds)
                    };
                }));
            })
            .catch(error => {
                if (supplierRequestId !== supplierLinkRequestId.current) return;
                const message = error instanceof Error ? error.message : "Failed to load linked suppliers.";
                toast.error(message);
            });
    }, [applyParentSharedAttributes, loadPurchaseQaForFamily, rawMaterials]);

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

        const parentItem = val
            ? rawMaterials.find(rm => String(rm.product_id) === String(val))
            : undefined;

        if (val && !parentItem) return;

        setFormParentId(val);
        if (parentItem) {
            applyParentSharedAttributes(parentItem);
            resetChildSpecificFields();
            setSelectedSupplierIds([]);
            const supplierRequestId = ++supplierLinkRequestId.current;
            fetchProductSupplierLinks([parentItem.product_id])
                .then(linksByProduct => {
                    if (supplierRequestId !== supplierLinkRequestId.current) return;
                    const supplierIds = linksByProduct.get(parentItem.product_id) || [];
                    setSelectedSupplierIds(supplierIds);
                    syncVariantSupplierSnapshots(supplierIds);
                })
                .catch(error => {
                    if (supplierRequestId !== supplierLinkRequestId.current) return;
                    const message = error instanceof Error ? error.message : "Failed to load inherited suppliers.";
                    toast.error(message);
                });
        } else {
            setFormBrand("");
            setFormCategory("");
            setFormProductClass("");
            setFormProductSegment("");
            setFormProductSection("");
            setFormItemGroupId("");
            setFormTaxRateId("");
            setFormRegulatoryCode("");
            setFormRegulatoryNotes("");
            setFormPriceControl(null);
            resetChildSpecificFields();
            setSelectedSupplierIds([]);
            supplierLinkRequestId.current += 1;
        }
        if (val && !editingItem) {
            if (parentItem && parentItem.product_code) {
                const parentCode = parentItem.product_code;
                const uomShortcut = units.find(u => u.unit_id === Number(formUom))?.unit_shortcut || "UNIT";
                setFormCode(`${parentCode}-${uomShortcut.toUpperCase()}${formUomCount}`);
            }
        }
    };

    const handleClearParentSelection = () => {
        if (parentSelectionLocked) return;
        setFormParentId("");
        setFormBrand("");
        setFormCategory("");
        setFormProductClass("");
        setFormProductSegment("");
        setFormProductSection("");
        setFormItemGroupId("");
        setFormTaxRateId("");
        setFormRegulatoryCode("");
        setFormRegulatoryNotes("");
        setFormPriceControl(null);
        resetChildSpecificFields();
        setSelectedSupplierIds([]);
        supplierLinkRequestId.current += 1;
        setSubmitError(null);
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

    const handleToggleSupplier = useCallback((supplierId: number) => {
        const nextIds = new Set(selectedSupplierIds);
        if (nextIds.has(supplierId)) {
            nextIds.delete(supplierId);
        } else {
            nextIds.add(supplierId);
        }
        const nextSupplierIds = [...nextIds];
        setSelectedSupplierIds(nextSupplierIds);
        syncVariantSupplierSnapshots(nextSupplierIds);
    }, [selectedSupplierIds, syncVariantSupplierSnapshots]);

    const attemptSave = async () => {
        if (saving) return;

        setSubmitError(null);
        setShowValidationErrors(true);

        const currentValidationErrors = collectValidationErrors();
        if (hasValidationErrors(currentValidationErrors)) {
            toast.error(firstValidationError(currentValidationErrors));
            return;
        }

        const isPackagingMaterial = isPackagingMaterialProductType(formProductType);
        const normalizedCode = formCode.trim().toUpperCase();
        const densityRequirement = getSelectedDensityRequirement(units, formUom);
        const parsedWeight = formWeight.trim() !== "" ? Number(formWeight) : null;
        const parsedWeightUnitId = formWeightUnitId === "" ? null : Number(formWeightUnitId);
        const parsedSafetyStock = Number(formMaintainingQuantity);
        const weightForm = parseWeightForm(
            formNetWeight,
            formOuterCartonWeight,
            formPalletWeight,
            formWeightUnitId,
            formWeight,
            isPackagingMaterial
        );

        const parsedBaseWeight = weightForm.grossWeight ?? parsedWeight;
        const parsedNetWeight = weightForm.hasComponents ? Number(formNetWeight) : null;
        const parsedOuterCartonWeight = weightForm.hasComponents ? Number(formOuterCartonWeight) : null;
        const parsedPalletWeight = weightForm.hasComponents ? Number(formPalletWeight) : null;
        const selectedWeightUnitIdNum = parsedWeightUnitId;
        const parsedDensity = densityRequirement === true ? Number(formDensity) : null;
        const parsedUomCount = Number(formUomCount);

        const variantsPayload = packagingVariants.map(v => {
            const vUomShortcut = units.find(u => u.unit_id === Number(v.uomId))?.unit_shortcut || "Unit";
            const cleanSuffix = v.codeSuffix.trim() || `${vUomShortcut.toUpperCase()}${v.count}`;
            const variantCount = parseFloat(v.count);
            const variantWeight = parseWeightForm(
                v.netWeight,
                v.outerCartonWeight,
                v.palletWeight,
                v.weightUnitId,
                v.weight,
                isPackagingMaterial
            );
            const variantWeightUnitId = v.weightUnitId === "" ? null : Number(v.weightUnitId);
            const variantDensityRequirement = getSelectedDensityRequirement(units, v.uomId);
            const variantDensity = variantDensityRequirement === true ? Number(v.density) : null;
            return {
                product_id: v.productId,
                product_code: `${normalizedCode}-${cleanSuffix}`,
                unit_of_measurement: Number(v.uomId),
                unit_of_measurement_count: variantCount,
                density_factor: variantDensity,
                weight: variantWeight.grossWeight,
                net_weight: variantWeight.hasComponents ? Number(v.netWeight) : undefined,
                outer_carton_weight: variantWeight.hasComponents ? Number(v.outerCartonWeight) : undefined,
                pallet_weight: variantWeight.hasComponents ? Number(v.palletWeight) : undefined,
                weight_unit_id: variantWeightUnitId,
                product_brand: formBrand ? Number(formBrand) : undefined,
                product_category: formCategory ? Number(formCategory) : undefined,
                product_type: formProductType,
                product_class: formProductClass === "" ? null : Number(formProductClass),
                product_segment: formProductSegment === "" ? null : Number(formProductSegment),
                product_section: formProductSection === "" ? null : Number(formProductSection),
                item_group_id: formItemGroupId === "" ? null : Number(formItemGroupId),
                tax_rate_id: formTaxRateId === "" ? null : Number(formTaxRateId),
                regulatory_code: formRegulatoryCode.trim() || null,
                regulatory_notes: formRegulatoryNotes.trim() || null,
                isActive: v.isActive ? 1 : 0,
                barcode: v.barcode.trim() || undefined,
                maintaining_quantity: Number(v.maintainingQuantity),
                product_image: v.productImage,
                purchaseQa: v.purchaseQa,
                codeSuffix: cleanSuffix
            };
        });

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
            product_class: formProductClass === "" ? null : Number(formProductClass),
            product_segment: formProductSegment === "" ? null : Number(formProductSegment),
            product_section: formProductSection === "" ? null : Number(formProductSection),
            item_group_id: formItemGroupId === "" ? null : Number(formItemGroupId),
            tax_rate_id: formTaxRateId === "" ? null : Number(formTaxRateId),
            regulatory_code: formRegulatoryCode.trim() || null,
            regulatory_notes: formRegulatoryNotes.trim() || null,
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
                const supplierIdsForSave = editingItem.parent_id || formParentId ? undefined : selectedSupplierIds;
                success = await onUpdateRawMaterial(editingItem.product_id, payload, supplierIdsForSave, variantsPayload);
            } else {
                const supplierIdsForSave = formParentId ? undefined : selectedSupplierIds;
                success = await onRegisterRawMaterial(payload, supplierIdsForSave, variantsPayload);
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

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void attemptSave();
    };

    const handleSaveClick = () => {
        void attemptSave();
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
        itemGroupsList,
        taxRatesList,
        showValidationErrors,
        validationErrors,
        formName,
        setFormName,
        formCode,
        setFormCode,
        formDesc,
        setFormDesc,
        formUom,
        setFormUom: handlePrimaryUomChange,
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
        formItemGroupId,
        setFormItemGroupId,
        formTaxRateId,
        setFormTaxRateId,
        formRegulatoryCode,
        setFormRegulatoryCode,
        formRegulatoryNotes,
        setFormRegulatoryNotes,
        formPriceControl,
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
        purchaseQaError,
        formProductType,
        setFormProductType: handleProductTypeChange,
        classificationLocked,
        inheritedProductType,
        classificationLockMessage,
        parentSelectionLocked,
        parentSelectionLockMessage,
        parentRelationshipError: effectiveParentRelationshipError,
        formIsActive,
        setFormIsActive,
        formParentId,
        setFormParentId: handleParentChange,
        clearParentSelection: handleClearParentSelection,
        formUomCount,
        setFormUomCount,
        selectedSupplierIds,
        handleToggleSupplier,
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
        handleFormSubmit,
        handleSaveClick
    };
}
