/* eslint-disable */
import { useState, useEffect, useMemo } from "react";
import { useDebounce } from "use-debounce";
import { toast } from "sonner";
import {
    Product,
    ProductVersion,
    Brand,
    Category,
    Unit,
    BOMItem,
    RoutingStep,
    ProductOverhead,
    BFFCatalogProduct,
    OperationType,
    OverheadType,
    Supplier,
    ProductClass,
    ProductSegment,
    ProductSection,
    WorkCenter,
    QATemplate,
    RouteStep
} from "../types";
import { materialTypeFromProduct } from "../material-types";
import {
    fetchBrands,
    fetchCategories,
    fetchUnits,
    fetchVersions,
    fetchBOMDetails,
    saveBOMDetails,
    registerProduct,
    registerNewVersion,
    submitFullVersion,
    createBrand,
    createCategory,
    fetchClasses,
    fetchSegments,
    fetchSections,
    createSegment,
    createClass,
    createSection,
    activateVersion,
    fetchQATemplates,
    createQATemplate,
    saveQATemplate,
    normalizeProductActiveState,
    resolveProductMasterStatus,
    extractId
} from "../services/finished-goods-api";
import { fetchWorkCenters } from "../../work-stations/services/work-stations-api";
import {
    getProductEditValidationErrors,
    getProductRegistrationValidationErrors,
    validateProductEditDetails,
    type ProductValidationFields
} from "../product-validation";

export type RegisterFormField =
    | "title"
    | "sku"
    | "brandId"
    | "categoryId"
    | "parentId"
    | "baseUom"
    | "uomCount"
    | "densityFactor"
    | "expectedYield"
    | "shelfLife"
    | "versionName";

export type RegisterFormErrors = Partial<Record<RegisterFormField, string>>;

export type EditProductFieldErrors = Record<string, string>;

export function useFinishedGoods(initialTab: string = "details") {
    // UI Layout & Tab States
    const [activeTab, setActiveTab] = useState(initialTab);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

    // Metadata tables
    const [brands, setBrands] = useState<Brand[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [classes, setClasses] = useState<ProductClass[]>([]);
    const [segments, setSegments] = useState<ProductSegment[]>([]);
    const [sections, setSections] = useState<ProductSection[]>([]);
    const [overheadTypes, setOverheadTypes] = useState<OverheadType[]>([]);
    const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);
    const [simulatedForexRate, setSimulatedForexRate] = useState<number>(61.39);
    const [debouncedForexRate] = useDebounce(simulatedForexRate, 300);

    // New Metadata states
    const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
    const [qaTemplates, setQaTemplates] = useState<QATemplate[]>([]);

    // Loading & Saving indicators
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [loadingBOM, setLoadingBOM] = useState(false);
    const [savingBOM, setSavingBOM] = useState(false);
    const [saveProgress, setSaveProgress] = useState(0);
    const [saveStatus, setSaveStatus] = useState("");

    // Catalog search
    const [products, setProducts] = useState<Product[]>([]);
    const [allCatalogProducts, setAllCatalogProducts] = useState<BFFCatalogProduct[]>([]);
    const [selectedProductId, setSelectedProductId] = useState<string>("");
    const [searchQuery, setSearchQuery] = useState("");

    // Version Registration Modal states
    const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
    const [versionForm, setVersionForm] = useState({
        versionName: "",
        baseQuantity: 1,
        uomId: 0,
        expectedYield: 100,
        baseVersionId: ""
    });

    // Versions
    const [versions, setVersions] = useState<ProductVersion[]>([]);
    const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
    const [activeBOMId, setActiveBOMId] = useState<number | null>(null);
    const [versionCosts, setVersionCosts] = useState<Record<number, number>>({});

    // New Selected Version Details
    const [selectedVersion, setSelectedVersion] = useState<ProductVersion | null>(null);
    const [editedVersionDetails, setEditedVersionDetails] = useState<Partial<ProductVersion>>({});
    const [editedRoutes, setEditedRoutes] = useState<RouteStep[]>([]);

    // Registration Modal
    const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
    const [registerForm, setRegisterForm] = useState({
        title: "",
        sku: "",
        baseUom: "L",
        targetSellingPrice: "",
        barcode: "",
        densityFactor: "1.0",
        expectedYield: "100",
        versionName: "v1.0",
        brandId: "",
        categoryId: "",
        description: "",
        costPerUnit: "",
        uomCount: "0",
        classId: "",
        segmentId: "",
        sectionId: "",
        shelfLife: "",
        productImage: "",
        parentId: "",
        supplierIds: [] as string[]
    });
    const [registerFormErrors, setRegisterFormErrors] = useState<RegisterFormErrors>({});

    // Form Edits (Legacy compatibility states)
    const [editedDetails, setEditedDetails] = useState<Partial<Product>>({});
    const [editFieldErrors, setEditFieldErrors] = useState<EditProductFieldErrors>({});
    const [editedBOM, setEditedBOM] = useState<BOMItem[]>([]);
    const [editedRoutings, setEditedRoutings] = useState<RoutingStep[]>([]);
    const [editedOverheads, setEditedOverheads] = useState<ProductOverhead[]>([]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    // Selected product helper
    const selectedProduct = useMemo(() => {
        if (!selectedProductId) return null;
        return products.find(p => p.id === selectedProductId) || null;
    }, [products, selectedProductId]);

    // Fetch Forex Rate in a separate, non-blocking useEffect
    useEffect(() => {
        async function loadForexRate() {
            try {
                const forexRes = await fetch("https://open.er-api.com/v6/latest/USD");
                if (forexRes.ok) {
                    const forexData = await forexRes.json();
                    const liveRate = forexData.rates?.PHP;
                    if (liveRate) {
                        setSimulatedForexRate(parseFloat(liveRate.toFixed(2)));
                    }
                }
            } catch (e) {
                console.error("Failed to load forex rate:", e);
            }
        }
        loadForexRate();
    }, []);

    // Fetch metadata and read-only workstation lookup data on mount.
    useEffect(() => {
        async function loadMetadata() {
            setLoadingProducts(true);
            try {
                const [bList, cList, uList, prodRes, overheadRes, operationsRes, supRes, classesList, segmentsList, sectionsList, wcList, qaList] = await Promise.all([
                    fetchBrands(),
                    fetchCategories(),
                    fetchUnits(),
                    fetch("/api/manufacturing/finished-goods/products?limit=-1&excludeRollup=true"),
                    fetch("/api/manufacturing/finished-goods/overhead-types"),
                    fetch("/api/manufacturing/finished-goods/operations"),
                    fetch("/api/manufacturing/procurement/suppliers"),
                    fetchClasses().catch(() => []),
                    fetchSegments().catch(() => []),
                    fetchSections().catch(() => []),
                    fetchWorkCenters().catch(() => []),
                    fetchQATemplates().catch(() => [])
                ]);
                setBrands(bList);
                setCategories(cList);
                setUnits(uList);
                setClasses(classesList);
                setSegments(segmentsList);
                setSections(sectionsList);
                setWorkCenters(wcList);
                setQaTemplates(qaList);
                if (supRes && supRes.ok) {
                    setSuppliers(await supRes.json());
                }
                if (prodRes.ok) {
                    const prodData = await prodRes.json();
                    setAllCatalogProducts(prodData);
                }
                if (overheadRes.ok) {
                    setOverheadTypes(await overheadRes.json());
                }
                if (operationsRes.ok) {
                    setOperationTypes(await operationsRes.json());
                }
            } catch (e) {
                console.error("Failed to load metadata:", e);
                toast.error("Error loading brand, category, or UOM options");
            } finally {
                setLoadingProducts(false);
            }
        }
        loadMetadata();
    }, []);

    // Keep the full hierarchy in state so searching for a child can still
    // render its parent in the catalog tree.
    useEffect(() => {
        const finishedGoods = allCatalogProducts.filter((p: BFFCatalogProduct) => !p.product_type || Number(p.product_type) === 388);

        const mapped: Product[] = finishedGoods.map((p: BFFCatalogProduct) => {
            const parentId = p.parent_id && typeof p.parent_id === "object"
                ? Number((p.parent_id as any).product_id)
                : (p.parent_id ? Number(p.parent_id) : null);
            const resolvedStatus = resolveProductMasterStatus((p as unknown as { status?: string }).status, p.isActive);
            return {
                id: String(p.product_id),
                sku: p.product_code || `SKU-${p.product_id}`,
                title: p.product_name,
                description: p.short_description || p.description || "",
                identityKey: p.description || null,
                barcode: p.barcode || "",
                baseUom: p.unit_of_measurement?.unit_shortcut || "PCS",
                expectedYieldPercent: 100,
                targetSellingPrice: Number(p.price_per_unit || 0),
                parentProduct: parentId === null,
                parent_id: parentId,
                status: resolvedStatus,
                isActive: resolvedStatus === "Active",
                bom: [],
                routings: [],
                densityFactor: p.density_factor ? Number(p.density_factor) : 1.0,
                product_brand: typeof p.product_brand === "object" && p.product_brand !== null ? Number((p.product_brand as any).brand_id ?? (p.product_brand as any).id) : (p.product_brand ? Number(p.product_brand) : undefined),
                product_category: typeof p.product_category === "object" && p.product_category !== null ? Number((p.product_category as any).category_id ?? (p.product_category as any).id) : (p.product_category ? Number(p.product_category) : undefined),
                product_class: typeof p.product_class === "object" && p.product_class !== null ? Number((p.product_class as any).class_id ?? (p.product_class as any).id) : (p.product_class ? Number(p.product_class) : undefined),
                product_segment: typeof p.product_segment === "object" && p.product_segment !== null ? Number((p.product_segment as any).segment_id ?? (p.product_segment as any).id) : (p.product_segment ? Number(p.product_segment) : undefined),
                product_section: typeof p.product_section === "object" && p.product_section !== null ? Number((p.product_section as any).section_id ?? (p.product_section as any).id) : (p.product_section ? Number(p.product_section) : undefined),
                product_shelf_life: p.product_shelf_life ? Number(p.product_shelf_life) : undefined,
                cost_per_unit: p.cost_per_unit ? Number(p.cost_per_unit) : undefined,
                unit_of_measurement_count: p.unit_of_measurement_count ? Number(p.unit_of_measurement_count) : undefined,
                product_image: p.product_image || undefined,

                has_versions: !!p.has_versions
            };
        });

        setProducts(mapped);

        if (mapped.length > 0) {
            setSelectedProductId(prev => {
                const exists = mapped.some((p: Product) => p.id === prev);
                return exists ? prev : "";
            });
        }
    }, [allCatalogProducts]);

    // Load Versions when Selected Product changes
    useEffect(() => {
        setVersions([]);
        setSelectedVersionId(null);
        setSelectedVersion(null);
        setActiveBOMId(null);
        setEditedVersionDetails({});
        setEditedRoutes([]);
        setEditedBOM([]);
        setEditedRoutings([]);
        setEditedOverheads([]);
        setHasUnsavedChanges(false);

        if (!selectedProductId) return;
        const numericId = Number(selectedProductId);
        if (isNaN(numericId) || numericId <= 0) {
            return;
        }

        let cancelled = false;

        async function loadVersions() {
            setLoadingBOM(true);
            try {
                const list = await fetchVersions(numericId);
                if (cancelled) return;
                const sortedList = (list || []).sort((a: any, b: any) => {
                    const timeA = a.updated_at ? new Date(a.updated_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
                    const timeB = b.updated_at ? new Date(b.updated_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
                    if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) return timeB - timeA;
                    return b.version_id - a.version_id;
                });
                setVersions(sortedList);
                if (sortedList && sortedList.length > 0) {
                    const activeVer = sortedList.find((v: any) => v.is_active || v.status === "Active");
                    setSelectedVersionId(activeVer ? activeVer.version_id : sortedList[0].version_id);
                } else {
                    setSelectedVersionId(null);
                }
            } catch (e) {
                if (cancelled) return;
                console.error("Failed loading product versions:", e);
                setVersions([]);
                setSelectedVersionId(null);
            } finally {
                if (!cancelled) setLoadingBOM(false);
            }
        }
        loadVersions();

        return () => {
            cancelled = true;
        };
    }, [selectedProductId]);

    // Load dynamic cost for currently selected version when selectedVersionId or debouncedForexRate changes
    useEffect(() => {
        if (!selectedVersionId || !selectedProductId) return;
        const numericId = Number(selectedProductId);
        const vId = selectedVersionId as number;
        if (!versions.some(version => version.version_id === vId && Number(version.product_id) === numericId)) return;

        async function loadSelectedVersionCost() {
            try {
                const res = await fetch(`/api/manufacturing/finished-goods/bom-cost?productId=${numericId}&versionId=${vId}&forexRate=${debouncedForexRate}`);
                if (res.ok) {
                    const costData = await res.json();
                    setVersionCosts(prev => ({
                        ...prev,
                        [vId]: costData.cost
                    }));
                } else {
                    setVersionCosts(prev => ({
                        ...prev,
                        [vId]: 0
                    }));
                }
            } catch {
                setVersionCosts(prev => ({
                    ...prev,
                    [vId]: 0
                }));
            }
        }
        loadSelectedVersionCost();
    }, [selectedVersionId, selectedProductId, debouncedForexRate, versions]);

    // Load BOM & Routings when Selected Version or simulatedForexRate changes
    useEffect(() => {
        if (!selectedProductId || !selectedProduct) return;
        const numericId = Number(selectedProductId);
        if (isNaN(numericId) || numericId <= 0) return;

        const baseDetails = {
            sku: selectedProduct.sku,
            title: selectedProduct.title,
            description: selectedProduct.description,
            barcode: selectedProduct.barcode,
            baseUom: selectedProduct.baseUom,
            expectedYieldPercent: selectedProduct.expectedYieldPercent || 100,
            targetSellingPrice: selectedProduct.targetSellingPrice,
            densityFactor: selectedProduct.densityFactor || 1.0,
            product_brand: selectedProduct.product_brand,
            product_category: selectedProduct.product_category,
            product_class: selectedProduct.product_class,
            product_segment: selectedProduct.product_segment,
            product_section: selectedProduct.product_section,
            product_shelf_life: selectedProduct.product_shelf_life,
            cost_per_unit: selectedProduct.cost_per_unit,
            unit_of_measurement_count: selectedProduct.unit_of_measurement_count,
            product_image: selectedProduct.product_image,
            parent_id: selectedProduct.parent_id,
            status: resolveProductMasterStatus(selectedProduct.status, selectedProduct.isActive),
            isActive: resolveProductMasterStatus(selectedProduct.status, selectedProduct.isActive) === "Active"
        };

        if (selectedVersionId === null || !versions.some((v) => v.version_id === selectedVersionId && Number(v.product_id) === numericId)) {
            setSelectedVersion(null);
            setEditedVersionDetails({});
            setEditedRoutes([]);
            setActiveBOMId(null);
            setEditedDetails(baseDetails);
            setEditedBOM([]);
            setEditedRoutings([]);
            setEditedOverheads([]);
            setHasUnsavedChanges(false);
            return;
        }

        // If this is a local draft version (< 0), keep in-memory UI draft and skip backend fetch
        if (selectedVersionId < 0) {
            const draftVer = versions.find((v) => v.version_id === selectedVersionId);
            if (draftVer) {
                setSelectedVersion(draftVer);
            }
            return;
        }

        async function loadRecipe() {
            setLoadingBOM(true);
            try {
                const versionObj = await fetchBOMDetails(numericId, selectedVersionId!, debouncedForexRate);
                if (cancelled) return;
                if (versionObj) {
                    setSelectedVersion(versionObj);
                    setEditedVersionDetails({
                        version_id: versionObj.version_id,
                        version_name: versionObj.version_name,
                        base_quantity: versionObj.base_quantity,
                        expected_yield_percentage: versionObj.expected_yield_percentage,
                        custom_overhead: versionObj.custom_overhead ?? 0,
                        overhead_items: (versionObj as any).overhead_items || [],
                        labor_positions: (versionObj as any).labor_positions || [],
                        status: versionObj.status,
                        uom_id: versionObj.uom_id,
                        valid_from: versionObj.valid_from,
                        valid_to: versionObj.valid_to
                    });
                    const normalizedRoutes = (versionObj.routes || []).map(route => ({
                        ...route,
                        bom_items: (route.bom_items || []).map(item => ({
                            ...item,
                            material_type: item.material_type || materialTypeFromProduct(item.product_type, item.has_versions)
                        }))
                    }));
                    setEditedRoutes(normalizedRoutes);
                    setActiveBOMId(versionObj.version_id);

                    // Populate legacy details for backward compatibility with UI components
                    setEditedDetails({
                        ...baseDetails,
                        expectedYieldPercent: versionObj.expected_yield_percentage,
                    });

                    // Format routes as ingredients and routings for older tabs
                    const ingredients: BOMItem[] = [];
                    const routings: RoutingStep[] = [];

                    if (versionObj.routes) {
                        versionObj.routes.forEach(r => {
                            routings.push({
                                id: String(r.route_id),
                                sequence: r.sequence_order,
                                name: `Step ${r.sequence_order}`,
                                operationId: r.operation_id || undefined,
                                machineHourlyRate: 0,
                                durationHours: r.run_time_hours,
                                stepBatchSize: r.step_batch_size || 1,
                                requiresQA: !!r.qa_template_id
                            });

                            if (r.bom_items) {
                                r.bom_items.forEach(b => {
                                    const foundUnit = units.find(u => u.unit_id === b.unit_of_measurement || u.unit_shortcut === b.unit_of_measurement);
                                    const foundProd = allCatalogProducts.find(p => p.product_id === b.product_id);
                                    ingredients.push({
                                        id: String(b.id),
                                        productId: b.product_id,
                                        name: foundProd ? foundProd.product_name : (b.product_name || `Unresolved Material (ID #${b.product_id} - Archived or Missing)`),
                                        type: "raw_material",
                                        quantity: b.quantity_required,
                                        uom: foundUnit ? foundUnit.unit_shortcut : String(b.unit_of_measurement || "pc"),
                                        wastagePercent: b.wastage_factor_percentage,
                                        landedCost: b.cost_per_unit || 0
                                    });
                                });
                            }
                        });
                    }
                    setEditedBOM(ingredients);
                    setEditedRoutings(routings);
                    setEditedOverheads(versionObj.overheads ?? []);
                    setHasUnsavedChanges(false);
                } else {
                    setSelectedVersion(null);
                    setEditedVersionDetails({});
                    setEditedRoutes([]);
                    setActiveBOMId(null);
                    setEditedDetails(baseDetails);
                    setEditedBOM([]);
                    setEditedRoutings([]);
                    setEditedOverheads([]);
                    setHasUnsavedChanges(false);
                }
            } catch (e) {
                if (cancelled) return;
                console.error("Failed to load BOM version details:", e);
            } finally {
                if (!cancelled) setLoadingBOM(false);
            }
        }
        let cancelled = false;
        loadRecipe();

        return () => {
            cancelled = true;
        };
    }, [selectedVersionId, selectedProductId, selectedProduct, simulatedForexRate, debouncedForexRate, versions, units, allCatalogProducts]);

    // Handlers
    const handleCustomOverheadChange = (value: number) => {
        setHasUnsavedChanges(true);
        setEditedVersionDetails(prev => ({
            ...prev,
            custom_overhead: Number.isFinite(value) && value >= 0 ? value : 0
        }));
    };

    const clearRegisterFormError = (field: RegisterFormField) => {
        setRegisterFormErrors(current => {
            if (!current[field]) return current;
            const next = { ...current };
            delete next[field];
            return next;
        });
    };

    const resetRegisterFormErrors = () => setRegisterFormErrors({});

    const handleRegisterProduct = async (
        e: React.FormEvent,
        registrationType: "parent" | "child" = "parent"
    ) => {
        e.preventDefault();

        const matchedUnit = units.find(u => u.unit_shortcut === registerForm.baseUom);
        const errors = getProductRegistrationValidationErrors({
            productDetails: {
                product_name: registerForm.title,
                product_code: registerForm.sku,
                product_brand: registerForm.brandId,
                product_category: registerForm.categoryId,
                unit_of_measurement: matchedUnit?.unit_id,
                unit_of_measurement_count: registerForm.uomCount,
                density_factor: registerForm.densityFactor,
                product_shelf_life: registerForm.shelfLife,

            },
            versionName: registerForm.versionName,
            expectedYield: registerForm.expectedYield
        }) as RegisterFormErrors;

        if (registrationType === "child" && !registerForm.parentId) {
            errors.parentId = "Parent manufactured good is required for a child variant.";
        }

        if (registerForm.baseUom.trim() && !matchedUnit) {
            errors.baseUom = "Base UOM is invalid. Please select a valid unit of measurement.";
        }

        if (Object.keys(errors).length > 0) {
            setRegisterFormErrors(errors);
            const firstInvalidField = Object.keys(errors)[0];
            window.requestAnimationFrame(() => {
                const firstInvalidElementId = firstInvalidField === "parentId"
                    ? "register-parent"
                    : `register-${firstInvalidField}`;
                document.getElementById(firstInvalidElementId)?.focus();
            });
            toast.error("Please complete the highlighted fields.");
            return;
        }

        setRegisterFormErrors({});

        setSavingBOM(true);
        setSaveProgress(10);
        setSaveStatus("Validating submission parameters...");
        
        let progress = 10;
        const interval = setInterval(() => {
            if (progress < 90) {
                if (progress < 30) {
                    progress += 5;
                    setSaveStatus("Creating new product SKU entry...");
                } else if (progress < 60) {
                    progress += 3;
                    setSaveStatus("Registering initial version (v1.0)...");
                } else {
                    progress += 2;
                    setSaveStatus("Linking associated supplier catalog...");
                }
                setSaveProgress(Math.min(progress, 90));
            }
        }, 150);

        try {
            if (!matchedUnit) throw new Error("Base UOM is invalid. Please select a valid unit of measurement.");
            const unitId = matchedUnit.unit_id;

            const brandVal = registerForm.brandId ? Number(registerForm.brandId) : undefined;
            const categoryVal = registerForm.categoryId ? Number(registerForm.categoryId) : undefined;
            const classVal = registerForm.classId ? Number(registerForm.classId) : undefined;
            const segmentVal = registerForm.segmentId ? Number(registerForm.segmentId) : undefined;
            const sectionVal = registerForm.sectionId ? Number(registerForm.sectionId) : undefined;
            const shelfLifeVal = registerForm.shelfLife ? Number(registerForm.shelfLife) : undefined;
            const uomCountVal = registerForm.uomCount ? Number(registerForm.uomCount) : 0;
            const costPerUnitVal = registerForm.costPerUnit ? Number(registerForm.costPerUnit) : 0;

            const res = await registerProduct(
                {
                    product_name: registerForm.title.trim(),
                    product_code: registerForm.sku.trim(),
                    short_description: registerForm.description.trim(),
                    barcode: registerForm.barcode.trim(),
                    price_per_unit: Number(registerForm.targetSellingPrice) || 0,
                    cost_per_unit: costPerUnitVal,
                    density_factor: Number(registerForm.densityFactor) || 1.0,
                    unit_of_measurement: unitId,
                    unit_of_measurement_count: uomCountVal,
                    product_brand: brandVal,
                    product_category: categoryVal,
                    product_class: classVal,
                    product_segment: segmentVal,
                    product_section: sectionVal,
                    product_shelf_life: shelfLifeVal,
                    product_image: registerForm.productImage || undefined,
                    parent_id: registerForm.parentId ? Number(registerForm.parentId) : null,

                },
                registerForm.versionName.trim(),
                registerForm.supplierIds.map(Number),
                Number(registerForm.expectedYield),
                1,
                unitId
            );

            if (res.success && res.productId) {
                clearInterval(interval);
                setSaveProgress(100);
                setSaveStatus("Product registered successfully!");
                await new Promise(resolve => setTimeout(resolve, 650));

                toast.success(`Successfully registered "${registerForm.title}"!`);
                setIsRegisterModalOpen(false);

                // Reset registration form
                setRegisterForm({
                    title: "",
                    sku: "",
                    baseUom: "L",
                    targetSellingPrice: "",
                    barcode: "",
                    densityFactor: "1.0",
                    expectedYield: "100",
                    versionName: "v1.0",
                    brandId: "",
                    categoryId: "",
                    description: "",
                    costPerUnit: "",
                    uomCount: "0",
                    classId: "",
                    segmentId: "",
                    sectionId: "",
                    shelfLife: "",
                    productImage: "",
                    parentId: "",
                    supplierIds: [] as string[]
                });

                // Reload products list
                const resList = await fetch("/api/manufacturing/finished-goods/products?limit=-1");
                const dataList = await resList.json();
                setAllCatalogProducts(dataList);
                const finishedGoods = dataList.filter((p: BFFCatalogProduct) => Number(p.product_type) === 388);
                const list: Product[] = finishedGoods.map((p: BFFCatalogProduct) => {
                     const parentId = p.parent_id && typeof p.parent_id === "object"
                          ? Number((p.parent_id as any).product_id)
                          : (p.parent_id ? Number(p.parent_id) : null);
                      return {
                        id: String(p.product_id),
                        sku: p.product_code || `SKU-${p.product_id}`,
                        title: p.product_name,
                        description: p.short_description || p.description || "",
                        identityKey: p.description || null,
                        barcode: p.barcode || "",
                        baseUom: p.unit_of_measurement?.unit_shortcut || "PCS",
                        expectedYieldPercent: 100,
                        targetSellingPrice: Number(p.price_per_unit || 0),
                        parentProduct: parentId === null,
                        parent_id: parentId,
                        isActive: normalizeProductActiveState(p.isActive),
                        bom: [],
                        routings: [],
                        densityFactor: p.density_factor ? Number(p.density_factor) : 1.0,
                        product_brand: p.product_brand ? Number(p.product_brand) : undefined,
                        product_category: p.product_category ? Number(p.product_category) : undefined,
                        product_class: p.product_class ? Number(p.product_class) : undefined,
                        product_segment: p.product_segment ? Number(p.product_segment) : undefined,
                        product_section: p.product_section ? Number(p.product_section) : undefined,
                        product_shelf_life: p.product_shelf_life ? Number(p.product_shelf_life) : undefined,
                        cost_per_unit: p.cost_per_unit ? Number(p.cost_per_unit) : undefined,
                        unit_of_measurement_count: p.unit_of_measurement_count ? Number(p.unit_of_measurement_count) : undefined,
                        product_image: p.product_image || undefined,

                        has_versions: !!p.has_versions
                      };
                });
                setProducts(list);

                // Select new product & trigger version select
                setSelectedProductId(String(res.productId));
                const vList = await fetchVersions(res.productId);
                setVersions(vList);
                if (vList && vList.length > 0) {
                    // New product starts with a Draft version — just select the first one
                    setSelectedVersionId(vList[0].version_id);
                }

                // Switch tab immediately to Product Details
                setActiveTab("details");
            }
        } catch (err) {
            clearInterval(interval);
            setSaveProgress(0);
            setSaveStatus("");
            const error = err instanceof Error ? err : new Error(String(err));
            const apiError = error as Error & {
                status?: number;
                code?: string;
                fields?: ProductValidationFields;
            };
            if (apiError.code === "PRODUCT_REQUIRED_FIELDS" && apiError.fields) {
                const fields = apiError.fields as RegisterFormErrors;
                setRegisterFormErrors(fields);
                const firstInvalidField = Object.keys(fields)[0];
                if (firstInvalidField) {
                    document.getElementById(`register-${firstInvalidField}`)?.focus();
                }
                toast.error("Please complete the highlighted fields.");
                return;
            }
            if (apiError.code === "VERSION_NAME_CONFLICT") {
                const message = apiError.message || "A version with this name already exists. Please choose a unique version name.";
                toast.error(message);
                return;
            }
            if (apiError.code === "PRODUCT_PARENT_UOM_CONFLICT") {
                const message = apiError.message || "A product with this Product Name and Unit of Measurement already exists.";
                setRegisterFormErrors({ title: message, baseUom: message, parentId: message });
                document.getElementById("register-base-uom")?.focus();
                toast.error(message);
                return;
            }
            console.error("Product registration error:", err);
            toast.error(error.message || "Failed to register product");
        } finally {
            clearInterval(interval);
            setSavingBOM(false);
        }
    };

    const handleRegisterNewVersion = async (form: typeof versionForm) => {
        const numericId = Number(selectedProductId);
        if (isNaN(numericId) || numericId <= 0) {
            toast.error("Please select a product first.");
            return;
        }

        if (!form.versionName.trim()) {
            toast.error("Version Name is required.");
            return;
        }

        const trimmedName = form.versionName.trim();
        const exists = versions.some(v => v.version_name.trim().toLowerCase() === trimmedName.toLowerCase());
        if (exists) {
            toast.error(`A version with name "${trimmedName}" already exists. Please choose a unique name.`);
            return;
        }

        setSavingBOM(true);
        setSaveProgress(20);
        setSaveStatus("Registering draft version in database...");

        try {
            const baseVerId = form.baseVersionId ? Number(form.baseVersionId) : null;
            const yieldNum = Number(form.expectedYield) || 100;
            const baseQtyNum = Number(form.baseQuantity) || 1;
            const uomIdNum = form.uomId ? Number(form.uomId) : undefined;

            setSaveStatus("Saving version to database...");
            const res = await registerNewVersion(
                numericId,
                baseVerId,
                yieldNum,
                trimmedName,
                baseQtyNum,
                uomIdNum
            );

            if (!res || !res.version || !res.version.version_id) {
                throw new Error("Failed to register version in database");
            }

            const createdVer = res.version;
            const newVersionId = createdVer.version_id;

            setSaveStatus("Loading version details...");
            const list = await fetchVersions(numericId);
            const sortedList = (list || []).sort((a: any, b: any) => {
                const timeA = a.updated_at ? new Date(a.updated_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
                const timeB = b.updated_at ? new Date(b.updated_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
                if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) return timeB - timeA;
                return b.version_id - a.version_id;
            });
            setVersions(sortedList);
            setSelectedVersionId(newVersionId);
            setActiveBOMId(newVersionId);
            setHasUnsavedChanges(false);
            setIsVersionModalOpen(false);

            toast.success(`Draft version "${trimmedName}" created! Configure recipes below and click "Submit for Approval" when ready.`);
        } catch (e) {
            console.error("Draft version creation error:", e);
            const error = e instanceof Error ? e : new Error(String(e));
            toast.error(error.message || "Failed to create draft version");
        } finally {
            setSavingBOM(false);
            setSaveProgress(0);
            setSaveStatus("");
        }
    };

    const handleSave = async () => {
        const numericProductId = Number(selectedProductId);
        if (isNaN(numericProductId) || numericProductId <= 0) {
            toast.error("Invalid product selected");
            return;
        }

        const fallbackBrandId = Number(brands[0]?.brand_id ?? (brands[0] as any)?.id ?? 0);
        const fallbackCategoryId = Number(categories[0]?.category_id ?? (categories[0] as any)?.id ?? 0);
        const fallbackUomId = Number(units[0]?.unit_id ?? (units[0] as any)?.id ?? 0);

        const rawBrand = editedDetails.product_brand ?? (selectedProduct as any)?.product_brand ?? (selectedProduct as any)?.brand_id;
        const parsedBrand = typeof rawBrand === "object" && rawBrand !== null ? Number(rawBrand.brand_id ?? rawBrand.id) : Number(rawBrand);
        const brandId = Number.isFinite(parsedBrand) && parsedBrand > 0 ? parsedBrand : fallbackBrandId;

        const rawCat = editedDetails.product_category ?? (selectedProduct as any)?.product_category ?? (selectedProduct as any)?.category_id;
        const parsedCat = typeof rawCat === "object" && rawCat !== null ? Number(rawCat.category_id ?? rawCat.id) : Number(rawCat);
        const categoryId = Number.isFinite(parsedCat) && parsedCat > 0 ? parsedCat : fallbackCategoryId;

        const matchedUnit = units.find(u => u.unit_shortcut === editedDetails.baseUom);
        const rawUom = matchedUnit?.unit_id ?? (editedDetails as any)?.uom_id ?? (selectedProduct as any)?.unit_of_measurement ?? (selectedProduct as any)?.uom_id;
        const parsedUom = typeof rawUom === "object" && rawUom !== null ? Number(rawUom.unit_id ?? rawUom.id) : Number(rawUom);
        const uomId = Number.isFinite(parsedUom) && parsedUom > 0 ? parsedUom : fallbackUomId;

        const uomCount = Number(editedDetails.unit_of_measurement_count ?? (selectedProduct as any)?.unit_of_measurement_count ?? (selectedProduct as any)?.uom_count ?? 1);
        const densityFactor = Number(editedDetails.densityFactor ?? (selectedProduct as any)?.densityFactor ?? (selectedProduct as any)?.density_factor ?? 1);
        const shelfLife = Number(editedDetails.product_shelf_life ?? (selectedProduct as any)?.product_shelf_life ?? (selectedProduct as any)?.shelf_life ?? 365);
        const expectedYield = Number(editedDetails.expectedYieldPercent ?? editedVersionDetails?.expected_yield_percentage ?? (selectedProduct as any)?.expectedYieldPercent ?? 100);

        const editValidationInput = {
            ...editedDetails,
            title: editedDetails.title || selectedProduct?.title || "Untitled Product",
            sku: editedDetails.sku || selectedProduct?.sku || `SKU-${numericProductId}`,
            productBrand: brandId > 0 ? brandId : (fallbackBrandId > 0 ? fallbackBrandId : undefined),
            productCategory: categoryId > 0 ? categoryId : (fallbackCategoryId > 0 ? fallbackCategoryId : undefined),
            unitOfMeasurementCount: uomCount > 0 ? uomCount : 1,
            productShelfLife: shelfLife > 0 ? shelfLife : 365,
            densityFactor: densityFactor > 0 ? densityFactor : 1,
            unit_of_measurement: uomId > 0 ? uomId : (fallbackUomId > 0 ? fallbackUomId : undefined),
            expected_yield_percentage: expectedYield > 0 && expectedYield <= 100 ? expectedYield : 100
        };
        const validationErrors = getProductEditValidationErrors(editValidationInput) as EditProductFieldErrors;
        if (Object.keys(validationErrors).length > 0) {
            setEditFieldErrors(validationErrors);
            toast.error("Please complete the required product fields.");
            return;
        }

        const validatedDetails = validateProductEditDetails(editValidationInput);

        const targetParentId = editedDetails.parent_id !== undefined ? extractId(editedDetails.parent_id) ?? null : (extractId(selectedProduct?.parent_id) ?? null);

        if (targetParentId) {
            const duplicateUom = allCatalogProducts.some(p => {
                if (String(p.product_id) === selectedProductId) return false;
                const pParentId = extractId(p.parent_id) ?? null;
                const pUomId = extractId(p.unit_of_measurement);
                return pParentId === targetParentId && pUomId === uomId;
            });
            if (duplicateUom) {
                const message = "This parent product already has a variant using this UOM. Choose another UOM.";
                setEditFieldErrors({ baseUom: message });
                toast.error(message);
                return;
            }
        } else {
            const normalizedTitle = validatedDetails.title.trim().toLowerCase();
            const duplicateIdentity = allCatalogProducts.some(p => {
                if (String(p.product_id) === selectedProductId) return false;
                const pParentId = extractId(p.parent_id) ?? null;
                if (pParentId !== null) return false;
                const pName = String(p.product_name || "").trim().toLowerCase();
                const pUomId = extractId(p.unit_of_measurement);
                return pName === normalizedTitle && pUomId === uomId;
            });
            if (duplicateIdentity) {
                const message = "A product with this Product Name and Unit of Measurement already exists.";
                setEditFieldErrors({ title: message, baseUom: message });
                toast.error(message);
                return;
            }
        }

        const invalidBomRow = editedRoutes.flatMap(route => (route.bom_items || []).map((item, index) => ({
            routeId: route.route_id,
            rowNumber: index + 1,
            item,
            materialType: item.material_type || materialTypeFromProduct(item.product_type, item.has_versions)
        }))).find(row => !row.materialType || !Number.isFinite(Number(row.item.product_id)) || Number(row.item.product_id) <= 0);

        if (invalidBomRow) {
            const issue = !invalidBomRow.materialType ? "select a Material Type" : "select a Material";
            toast.error(`Route ${invalidBomRow.routeId}, BOM row ${invalidBomRow.rowNumber}: ${issue} before saving.`);
            return;
        }

        const routesPayload = editedRoutes.map(route => ({
            ...route,
            bom_items: (route.bom_items || []).map(item => ({
                ...item,
                material_type: item.material_type || materialTypeFromProduct(item.product_type, item.has_versions)
            }))
        }));

        setEditFieldErrors({});
        setSavingBOM(true);
        setSaveProgress(5);
        setSaveStatus("Updating product details...");
        
        let progress = 5;
        const interval = setInterval(() => {
            if (progress < 90) {
                if (progress < 25) {
                    progress += 4;
                    setSaveStatus("Saving product details...");
                } else if (progress < 50) {
                    progress += 3;
                    setSaveStatus("Synchronizing operation routing stages...");
                } else if (progress < 75) {
                    progress += 2;
                    setSaveStatus("Recalculating material cost rollups (COGS)...");
                } else {
                    progress += 1;
                    setSaveStatus("Updating database standard costs...");
                }
                setSaveProgress(Math.min(progress, 90));
            }
        }, 200);

        try {
            const detailsPayload = {
                version_name: editedVersionDetails.version_name || "",
                base_quantity: Number(editedVersionDetails.base_quantity ?? 1),
                uom_id: editedVersionDetails.uom_id || null,
                expected_yield_percentage: validatedDetails.expectedYield,
                custom_overhead: Number(editedVersionDetails.custom_overhead ?? 0),
                overhead_items: editedVersionDetails.overhead_items || [],
                labor_positions: editedVersionDetails.labor_positions || [],
                version_status: editedVersionDetails.status || "Draft",
                valid_from: editedVersionDetails.valid_from || null,
                valid_to: editedVersionDetails.valid_to || null,

                title: validatedDetails.title,
                sku: validatedDetails.sku,
                barcode: editedDetails.barcode || "",
                baseUom: editedDetails.baseUom,
                targetSellingPrice: editedDetails.targetSellingPrice || 0,
                densityFactor: validatedDetails.densityFactor,
                productBrand: validatedDetails.productBrand,
                productCategory: validatedDetails.productCategory,
                shortDescription: editedDetails.description || "",
                costPerUnit: editedDetails.cost_per_unit ?? 0,
                unitOfMeasurementCount: validatedDetails.unitOfMeasurementCount,
                productClass: editedDetails.product_class,
                productSegment: editedDetails.product_segment,
                productSection: editedDetails.product_section,
                productShelfLife: validatedDetails.productShelfLife,
                productImage: editedDetails.product_image,
                parent_id: editedDetails.parent_id !== undefined ? (editedDetails.parent_id ? Number(editedDetails.parent_id) : null) : null,
                unit_of_measurement: validatedDetails.unitOfMeasurement,
                status: (editedDetails as unknown as { status?: string }).status || (selectedProduct as unknown as { status?: string })?.status || "Active"
            };

            let saveSucceeded = false;

            if (selectedVersionId !== null && selectedVersionId < 0) {
                // Local UI draft version: submit as Draft to MySQL database
                const draftPayload = {
                    productId: numericProductId,
                    versionName: (editedVersionDetails?.version_name || selectedVersion?.version_name || "v1.0").trim(),
                    baseQuantity: Number(editedVersionDetails?.base_quantity ?? selectedVersion?.base_quantity ?? 1),
                    uomId: Number(editedVersionDetails?.uom_id ?? selectedVersion?.uom_id) || undefined,
                    expectedYield: Number(editedVersionDetails?.expected_yield_percentage ?? selectedVersion?.expected_yield_percentage ?? 100),
                    status: "Draft",
                    routes: routesPayload,
                    labor_positions: editedVersionDetails?.labor_positions || [],
                    overhead_items: editedVersionDetails?.overhead_items || [],
                    custom_overhead: Number(editedVersionDetails?.custom_overhead || 0)
                };
                const vRes = await submitFullVersion(draftPayload);
                if (!vRes.success || !vRes.version) {
                    throw new Error(vRes.error || "Failed to persist draft version to database");
                }
                const newVersionId = vRes.version.version_id;
                // Also update product details
                await saveBOMDetails(
                    numericProductId,
                    newVersionId,
                    detailsPayload,
                    routesPayload,
                    editedOverheads
                );
                const list = await fetchVersions(numericProductId);
                setVersions(list);
                setSelectedVersionId(newVersionId);
                setActiveBOMId(newVersionId);
                saveSucceeded = true;
            } else {
                const targetVersionId = (selectedVersionId && selectedVersionId > 0)
                    ? selectedVersionId
                    : (activeBOMId && activeBOMId > 0
                        ? activeBOMId
                        : (versions.find(v => v.version_id > 0)?.version_id || null));

                if (!targetVersionId) {
                    throw new Error("No version selected or found for this product. Please select or register a version first.");
                }

                const res = await saveBOMDetails(
                    numericProductId,
                    targetVersionId,
                    detailsPayload,
                    routesPayload,
                    editedOverheads
                );
                saveSucceeded = res.success;
                setActiveBOMId(targetVersionId);
                const list = await fetchVersions(numericProductId);
                const sortedList = (list || []).sort((a: any, b: any) => {
                    const timeA = a.updated_at ? new Date(a.updated_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0);
                    const timeB = b.updated_at ? new Date(b.updated_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0);
                    if (!isNaN(timeA) && !isNaN(timeB) && timeA !== timeB) return timeB - timeA;
                    return b.version_id - a.version_id;
                });
                setVersions(sortedList);
            }

            if (saveSucceeded) {
                clearInterval(interval);
                setSaveProgress(100);
                setSaveStatus("Saved successfully!");
                await new Promise(resolve => setTimeout(resolve, 650));

                setProducts(prev => prev.map(p => {
                    if (p.id === selectedProductId) {
                        const updatedParentId = editedDetails.parent_id !== undefined ? (editedDetails.parent_id ? Number(editedDetails.parent_id) : null) : p.parent_id;
                        const identityParent = updatedParentId ? products.find(parent => parent.id === String(updatedParentId)) : null;
                        const identityName = identityParent?.title || editedDetails.title || p.title;
                        const identityUom = matchedUnit?.unit_shortcut || editedDetails.baseUom || p.baseUom;
                        const resolvedIdentityKey = updatedParentId ? `${identityName} - ${identityUom.trim().toUpperCase()}` : identityName;
                        const updatedStatus = (editedDetails as unknown as { status?: string }).status || (p as unknown as { status?: string }).status || "Active";
                        return {
                            ...p,
                            sku: editedDetails.sku || p.sku,
                            title: editedDetails.title || p.title,
                            description: editedDetails.description !== undefined ? editedDetails.description : p.description,
                            identityKey: resolvedIdentityKey || p.identityKey || null,
                            barcode: editedDetails.barcode || p.barcode,
                            baseUom: editedDetails.baseUom || p.baseUom,
                            targetSellingPrice: editedDetails.targetSellingPrice || p.targetSellingPrice,
                            densityFactor: editedDetails.densityFactor || p.densityFactor,
                            product_brand: editedDetails.product_brand,
                            product_category: editedDetails.product_category,
                            product_class: editedDetails.product_class,
                            product_segment: editedDetails.product_segment,
                            product_section: editedDetails.product_section,
                            product_shelf_life: editedDetails.product_shelf_life,
                            cost_per_unit: editedDetails.cost_per_unit,
                            unit_of_measurement_count: editedDetails.unit_of_measurement_count,
                            product_image: editedDetails.product_image,
                            parent_id: updatedParentId,
                            parentProduct: updatedParentId === null,
                            status: updatedStatus,
                            isActive: updatedStatus !== "Inactive"
                        };
                    }
                    return p;
                }));

                setAllCatalogProducts(prev => prev.map(p => {
                    if (String(p.product_id) === selectedProductId) {
                        const updatedParentId = editedDetails.parent_id !== undefined ? (editedDetails.parent_id ? Number(editedDetails.parent_id) : null) : (p.parent_id && typeof p.parent_id === "object" ? (p.parent_id as any).product_id : p.parent_id);
                        const updatedUnitOfMeasurement = matchedUnit ? {
                            unit_id: matchedUnit.unit_id,
                            unit_name: matchedUnit.unit_name,
                            unit_shortcut: matchedUnit.unit_shortcut
                        } : p.unit_of_measurement;
                        const updatedStatus = (editedDetails as unknown as { status?: string }).status || (p as unknown as { status?: string }).status || "Active";
                        return {
                            ...p,
                            status: updatedStatus,
                            isActive: updatedStatus === "Inactive" ? 0 : 1,
                            product_code: editedDetails.sku || p.product_code,
                            product_name: editedDetails.title || p.product_name,
                            description: editedDetails.description || p.description,
                            short_description: editedDetails.description || p.short_description,
                            barcode: editedDetails.barcode || p.barcode,
                            price_per_unit: editedDetails.targetSellingPrice || p.price_per_unit,
                            density_factor: editedDetails.densityFactor || p.density_factor,
                            product_brand: editedDetails.product_brand,
                            product_category: editedDetails.product_category,
                            product_class: editedDetails.product_class,
                            product_segment: editedDetails.product_segment,
                            product_section: editedDetails.product_section,
                            product_shelf_life: editedDetails.product_shelf_life,
                            cost_per_unit: editedDetails.cost_per_unit,
                            unit_of_measurement_count: editedDetails.unit_of_measurement_count,
                            product_image: editedDetails.product_image,
                            parent_id: updatedParentId,

                            unit_of_measurement: updatedUnitOfMeasurement
                        };
                    }
                    return p;
                }));

                const vList = await fetchVersions(numericProductId);
                setVersions(vList);
                setHasUnsavedChanges(false);
                setEditFieldErrors({});
                toast.success("Finished good configuration saved successfully!");
            }
        } catch (err) {
            clearInterval(interval);
            setSaveProgress(0);
            setSaveStatus("");
            const error = err as Error & { code?: string; fields?: Record<string, string> };
            if (error.fields && Object.keys(error.fields).length > 0) {
                setEditFieldErrors(error.fields);
            } else if (error.code === "PRODUCT_PARENT_UOM_CONFLICT") {
                setEditFieldErrors({ baseUom: error.message || "A product with this Product Name and Unit of Measurement already exists." });
            } else {
                console.error("Save error:", err);
            }
            toast.error(error.message || "Error saving configuration");
        } finally {
            clearInterval(interval);
            setSavingBOM(false);
        }
    };

    const handleActivateVersion = async (
        bomId?: number,
        action: "set_active" | "set_primary" | "deactivate" | "deactivate_all" = "set_active",
        deactivateAll?: boolean
    ) => {
        if (!selectedProductId) return;
        const numericProductId = Number(selectedProductId);
        const isDeactivate = deactivateAll || action === "deactivate_all";
        setSavingBOM(true);
        setSaveProgress(10);
        setSaveStatus(
            isDeactivate
                ? "Deactivating product versions..."
                : "Activating version..."
        );
        
        let progress = 10;
        const interval = setInterval(() => {
            if (progress < 90) {
                progress += 5;
                setSaveStatus(isDeactivate ? "Updating status records..." : "Setting version active status...");
                setSaveProgress(Math.min(progress, 90));
            }
        }, 120);

        try {
            const res = await activateVersion(numericProductId, bomId, action, deactivateAll);
            if (res.success) {
                clearInterval(interval);
                setSaveProgress(100);
                setSaveStatus("Status updated successfully!");
                await new Promise(resolve => setTimeout(resolve, 650));

                const msg = isDeactivate
                    ? "Version deactivated successfully!"
                    : "Version set as Active!";
                toast.success(msg);
                if (!isDeactivate) {
                    setProducts(prev => prev.map(p => p.id === String(numericProductId) ? { ...p, status: "Active", isActive: true } : p));
                    setEditedDetails(prev => ({ ...prev, status: "Active", isActive: true }));
                }
                const list = await fetchVersions(numericProductId);
                setVersions(list);
            }
        } catch (e) {
            clearInterval(interval);
            setSaveProgress(0);
            setSaveStatus("");
            console.error("Failed to update version status:", e);
            const error = e instanceof Error ? e : new Error(String(e));
            toast.error(error.message || "Failed to update version status");
        } finally {
            clearInterval(interval);
            setSavingBOM(false);
        }
    };

    const handleSubmitVersionForApproval = async (versionId?: number) => {
        const vId = versionId || selectedVersionId;
        if (!selectedProductId || !vId) return;
        const numericProductId = Number(selectedProductId);
        const currentVer = versions.find(v => v.version_id === vId);

        // 1. Validate routing operation steps
        if (!editedRoutes || editedRoutes.length === 0) {
            toast.error("Cannot submit for approval: At least one workstation routing operation step is required.");
            return;
        }

        // 2. Validate BOM ingredients across all routes
        const totalBomItems = editedRoutes.reduce((sum, r) => sum + (r.bom_items || []).length, 0);
        if (totalBomItems === 0) {
            toast.error("Cannot submit for approval: At least one raw material or BOM ingredient component is required.");
            return;
        }

        // 3. Validate BOM ingredient rows
        const invalidBomRow = editedRoutes.flatMap(route => (route.bom_items || []).map((item, index) => ({
            routeId: route.route_id,
            rowNumber: index + 1,
            item,
            materialType: item.material_type || materialTypeFromProduct(item.product_type, item.has_versions)
        }))).find(row => !row.materialType || !Number.isFinite(Number(row.item.product_id)) || Number(row.item.product_id) <= 0 || !Number.isFinite(Number(row.item.quantity_required)) || Number(row.item.quantity_required) <= 0);

        if (invalidBomRow) {
            const issue = !invalidBomRow.materialType 
                ? "select a Material Type" 
                : (!Number.isFinite(Number(invalidBomRow.item.product_id)) || Number(invalidBomRow.item.product_id) <= 0)
                    ? "select a Material"
                    : "enter a valid required quantity (> 0)";
            toast.error(`Route ${invalidBomRow.routeId}, BOM row ${invalidBomRow.rowNumber}: ${issue} before submitting.`);
            return;
        }

        // 4. Validate Direct Labor positions
        const laborPositions = editedVersionDetails?.labor_positions || currentVer?.labor_positions || selectedVersion?.labor_positions || [];
        if (!laborPositions || laborPositions.length === 0) {
            toast.error("Cannot submit for approval: At least one direct labor position standard is required.");
            return;
        }

        // 5. Validate Overhead allocations
        const overheadItems = editedVersionDetails?.overhead_items || currentVer?.overhead_items || selectedVersion?.overhead_items || [];
        const customOverhead = Number(editedVersionDetails?.custom_overhead ?? currentVer?.custom_overhead ?? selectedVersion?.custom_overhead ?? 0);
        if ((!overheadItems || overheadItems.length === 0) && customOverhead <= 0) {
            toast.error("Cannot submit for approval: At least one version overhead allocation or rate is required.");
            return;
        }

        setSavingBOM(true);
        setSaveProgress(20);
        setSaveStatus("Submitting version for approval...");
        try {
            if (vId < 0) {
                // Local UI draft version: POST entire package to MySQL database with status: "Pending Approval"
                const payload = {
                    productId: numericProductId,
                    versionName: (editedVersionDetails?.version_name || currentVer?.version_name || "").trim(),
                    baseQuantity: Number(editedVersionDetails?.base_quantity ?? currentVer?.base_quantity ?? 1),
                    uomId: Number(editedVersionDetails?.uom_id ?? currentVer?.uom_id) || undefined,
                    expectedYield: Number(editedVersionDetails?.expected_yield_percentage ?? currentVer?.expected_yield_percentage ?? 100),
                    status: "Pending Approval",
                    routes: editedRoutes,
                    labor_positions: editedVersionDetails?.labor_positions || [],
                    overhead_items: editedVersionDetails?.overhead_items || [],
                    custom_overhead: Number(editedVersionDetails?.custom_overhead || 0)
                };

                const res = await submitFullVersion(payload);
                if (res.success && res.version) {
                    setSaveProgress(100);
                    toast.success(`Version '${res.version.version_name}' submitted for approval!`);
                    const list = await fetchVersions(numericProductId);
                    setVersions(list);
                    setSelectedVersionId(res.version.version_id);
                    setHasUnsavedChanges(false);
                }
            } else {
                // Existing DB version in Inactive status: save current edits & set status to "For Approval"
                if (hasUnsavedChanges) {
                    await handleSave();
                }
                const res = await activateVersion(numericProductId, vId, "submit_for_approval");
                if (res.success) {
                    setSaveProgress(100);
                    toast.success(`Version '${currentVer?.version_name || vId}' submitted for approval!`);
                    const list = await fetchVersions(numericProductId);
                    setVersions(list);
                    setSelectedVersionId(vId);
                    setHasUnsavedChanges(false);
                }
            }
        } catch (e) {
            console.error("Failed to submit version for approval:", e);
            const error = e instanceof Error ? e : new Error(String(e));
            toast.error(error.message || "Failed to submit version for approval");
        } finally {
            setSavingBOM(false);
            setSaveProgress(0);
            setSaveStatus("");
        }
    };

    const handleCreateBrand = async (name: string): Promise<number | undefined> => {
        try {
            const res = await createBrand(name);
            if (res.success && res.brand) {
                toast.success(`Brand "${name}" created successfully!`);
                setBrands(prev => [...prev, res.brand].sort((a, b) => a.brand_name.localeCompare(b.brand_name)));
                return res.brand.brand_id;
            }
        } catch (e) {
            console.error("Failed to create brand:", e);
            const error = e instanceof Error ? e : new Error(String(e));
            toast.error(error.message || "Failed to create brand");
        }
    };

    const handleCreateCategory = async (name: string): Promise<number | undefined> => {
        try {
            const res = await createCategory(name);
            if (res.success && res.category) {
                toast.success(`Category "${name}" created successfully!`);
                setCategories(prev => [...prev, res.category].sort((a, b) => a.category_name.localeCompare(b.category_name)));
                return res.category.category_id;
            }
        } catch (e) {
            console.error("Failed to create category:", e);
            const error = e instanceof Error ? e : new Error(String(e));
            toast.error(error.message || "Failed to create category");
        }
    };

    const handleCreateSegment = async (name: string): Promise<number | undefined> => {
        try {
            const res = await createSegment(name);
            if (res.success && res.segment) {
                toast.success(`Segment "${name}" created successfully!`);
                setSegments(prev => [...prev, res.segment].sort((a, b) => a.segment_name.localeCompare(b.segment_name)));
                return res.segment.segment_id;
            }
        } catch (e) {
            console.error("Failed to create segment:", e);
            const error = e instanceof Error ? e : new Error(String(e));
            toast.error(error.message || "Failed to create segment");
        }
    };

    const handleCreateClass = async (name: string): Promise<number | undefined> => {
        try {
            const res = await createClass(name);
            if (res.success && res.class) {
                toast.success(`Class "${name}" created successfully!`);
                setClasses(prev => [...prev, res.class].sort((a, b) => a.class_name.localeCompare(b.class_name)));
                return res.class.class_id;
            }
        } catch (e) {
            console.error("Failed to create class:", e);
            const error = e instanceof Error ? e : new Error(String(e));
            toast.error(error.message || "Failed to create class");
        }
    };

    const handleCreateSection = async (name: string): Promise<number | undefined> => {
        try {
            const res = await createSection(name);
            if (res.success && res.section) {
                toast.success(`Section "${name}" created successfully!`);
                setSections(prev => [...prev, res.section].sort((a, b) => a.section_name.localeCompare(b.section_name)));
                return res.section.section_id;
            }
        } catch (e) {
            console.error("Failed to create section:", e);
            const error = e instanceof Error ? e : new Error(String(e));
            toast.error(error.message || "Failed to create section");
        }
    };

    // QA Templates CRUD Handlers
    const handleAddQATemplate = async (template: Omit<QATemplate, "template_id">) => {
        try {
            const res = await createQATemplate(template);
            if (res.success && res.template) {
                toast.success(`QA template "${template.template_name}" created successfully!`);
                setQaTemplates(prev => [...prev, res.template].sort((a, b) => a.template_name.localeCompare(b.template_name)));
                return res.template;
            }
        } catch (e) {
            console.error("Failed to create QA template:", e);
            const error = e instanceof Error ? e : new Error(String(e));
            toast.error(error.message || "Failed to create QA template");
        }
    };

    const handleSaveQATemplate = async (templateId: number, template: Partial<QATemplate>) => {
        try {
            const res = await saveQATemplate(templateId, template);
            if (res.success && res.template) {
                toast.success(`QA template updated successfully!`);
                setQaTemplates(prev => prev.map(t => t.template_id === templateId ? res.template : t));
                return res.template;
            }
        } catch (e) {
            console.error("Failed to update QA template:", e);
            const error = e instanceof Error ? e : new Error(String(e));
            toast.error(error.message || "Failed to update QA template");
        }
    };

    return {
        handleCreateBrand,
        handleCreateCategory,
        handleCreateSegment,
        handleCreateClass,
        handleCreateSection,
        activeTab,
        setActiveTab,
        isSidebarCollapsed,
        setIsSidebarCollapsed,
        brands,
        categories,
        units,
        suppliers,
        classes,
        segments,
        sections,
        workCenters,
        qaTemplates,
        loadingProducts,
        loadingBOM,
        savingBOM,
        saveProgress,
        saveStatus,
        products,
        setProducts,
        allCatalogProducts,
        selectedProductId,
        setSelectedProductId,
        selectedProduct,
        searchQuery,
        setSearchQuery,
        versions,
        setVersions,
        versionCosts,
        selectedVersionId,
        setSelectedVersionId,
        activeBOMId,
        selectedVersion,
        editedVersionDetails,
        setEditedVersionDetails,
        editedRoutes,
        setEditedRoutes,
        isVersionModalOpen,
        setIsVersionModalOpen,
        versionForm,
        setVersionForm,
        isRegisterModalOpen,
        setIsRegisterModalOpen,
        registerForm,
        setRegisterForm,
        registerFormErrors,
        clearRegisterFormError,
        resetRegisterFormErrors,
        editedDetails,
        setEditedDetails,
        editFieldErrors,
        setEditFieldErrors,
        editedBOM,
        setEditedBOM,
        editedRoutings,
        setEditedRoutings,
        editedOverheads,
        setEditedOverheads,
        hasUnsavedChanges,
        setHasUnsavedChanges,
        overheadTypes,
        setOverheadTypes,
        operationTypes,
        setOperationTypes,
        simulatedForexRate,
        setSimulatedForexRate,
        handleRegisterProduct,
        handleCustomOverheadChange,
        handleRegisterNewVersion,
        handleSave,
        handleActivateVersion,
        handleSubmitVersionForApproval,
        handleAddQATemplate,
        handleSaveQATemplate
    };
}
