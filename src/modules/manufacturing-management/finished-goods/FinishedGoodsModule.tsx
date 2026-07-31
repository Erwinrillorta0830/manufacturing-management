/* eslint-disable */
"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
    Search,
    Plus,
    Save,
    Layers,
    FileText,
    Sliders,
    AlertCircle,
    Loader2,
    Briefcase,
    ChevronLeft,
    ChevronDown,
    Image as ImageIcon,
    Package,
    Shield,
} from "lucide-react";
import { toast } from "sonner";
import { ProductDetailsTab } from "./components/ProductDetailsTab";
import { RoutesBOMTab } from "./components/RoutesBOMTab";
import { QATemplatesTab } from "./components/QATemplatesTab";
import { CostRollupTab } from "./components/CostRollupTab";
import { ImportationTab } from "./components/ImportationTab";
import { useFinishedGoods, type RegisterFormField } from "./hooks/useFinishedGoods";
import { Product, BOMItem, RoutingStep } from "./types";
import { CreatableSelect } from "./components/CreatableSelect";
import { calculateCostBreakdown, calculateMarginSummary, calculateOverheadSummary, calculateRouteBreakdown } from "./costing";
import { getProductImageUrl, uploadProductImage } from "./services/product-image";

export default function FinishedGoodsModule() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const requestedTab = searchParams.get("tab");
    const validTabs = ["details", "routes_bom", "costing", "qa_templates", "importation"];
    const initialTab = requestedTab && validTabs.includes(requestedTab) ? requestedTab : "details";
    const [uploadingRegImage, setUploadingRegImage] = useState(false);
    const [registerImagePreview, setRegisterImagePreview] = useState<string | null>(null);
    const [registerImageError, setRegisterImageError] = useState<string | null>(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const {
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
        selectedProductId,
        setSelectedProductId,
        selectedProduct,
        searchQuery,
        setSearchQuery,
        versions,
        versionCosts,
        selectedVersionId,
        setSelectedVersionId,
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
        hasUnsavedChanges,
        setHasUnsavedChanges,
        operationTypes,
        setOperationTypes,
        simulatedForexRate,
        setSimulatedForexRate,
        handleRegisterProduct,
        handleRegisterNewVersion,
        handleSave,
        handleActivateVersion,
        handleAddQATemplate,
        handleSaveQATemplate,
        editedVersionDetails,
        setEditedVersionDetails,
        handleCustomOverheadChange,
        allCatalogProducts
    } = useFinishedGoods(initialTab);

    useEffect(() => {
        if (isRegisterModalOpen) return;
        setRegisterImagePreview(null);
        setRegisterImageError(null);
    }, [isRegisterModalOpen]);

    useEffect(() => {
        return () => {
            if (registerImagePreview) URL.revokeObjectURL(registerImagePreview);
        };
    }, [registerImagePreview]);

    // Synchronize new editedRoutes state to legacy editedBOM and editedRoutings for costing simulation
    useEffect(() => {
        const ingredients: BOMItem[] = [];
        const routings: RoutingStep[] = [];

        editedRoutes.forEach(r => {
            const workCenter = workCenters.find(wc => wc.work_center_id === r.work_center_id);
            const machineRate = workCenter ? Number(workCenter.overhead_cost_per_hour || 0) : 0;

            routings.push({
                id: String(r.route_id),
                sequence: r.sequence_order,
                name: `Step ${r.sequence_order}`,
                operationId: r.operation_id || undefined,
                stepBatchSize: r.step_batch_size || 1,
                machineHourlyRate: machineRate,
                durationHours: r.run_time_hours,
                requiresQA: !!r.qa_template_id
            });

            if (r.bom_items) {
                r.bom_items.forEach(b => {
                    const matchedProd = allCatalogProducts.find(p => p.product_id === b.product_id);
                    const prodName = matchedProd ? matchedProd.product_name : (b.product_name || `Component #${b.product_id}`);

                    ingredients.push({
                        id: String(b.id),
                        productId: b.product_id,
                        name: prodName,
                        type: "raw_material",
                        quantity: b.quantity_required,
                        uom: String(b.unit_of_measurement || "pc"),
                        wastagePercent: b.wastage_factor_percentage,
                        landedCost: b.cost_per_unit || 0
                    });
                });
            }
        });

        setEditedBOM(ingredients);
        setEditedRoutings(routings);
    }, [editedRoutes, setEditedBOM, setEditedRoutings, workCenters, allCatalogProducts]);

    // Local Simulation States
    const [simulationYield, setSimulationYield] = useState<number>(100);
    const [simulationPriceOverrides, setSimulationPriceOverrides] = useState<Record<string, number>>({});
    const [simulationTargetPrice, setSimulationTargetPrice] = useState<number>(0);

    // Importation / Landed Cost Calculator States
    const [importNetWeight, setImportNetWeight] = useState<number>(21500);
    const [importPriceUsd, setImportPriceUsd] = useState<number>(1.355);
    const [importFxRate, setImportFxRate] = useState<number>(62.00);
    const [importThcFee, setImportThcFee] = useState<number>(42510);
    const [importStorageFee, setImportStorageFee] = useState<number>(2846.23);
    const [importCustomSop, setImportCustomSop] = useState<number>(20000);
    const [importTruckingFee, setImportTruckingFee] = useState<number>(42000);
    const [importOtherPortFees, setImportOtherPortFees] = useState<number>(11898.21);
    const [importCustomDuty, setImportCustomDuty] = useState<number>(13394.85);
    const [importIpf, setImportIpf] = useState<number>(2000);
    const [importVat, setImportVat] = useState<number>(253684.78);
    const [importDensityFactor, setImportDensityFactor] = useState<number>(0.880);
    const [automateCustoms, setAutomateCustoms] = useState<boolean>(true);

    // Sync tab param on load
    useEffect(() => {
        const tab = searchParams.get("tab");
        if (tab && validTabs.includes(tab)) {
            setActiveTab(tab);
        } else if (tab) {
            setActiveTab("details");
            router.replace("/mm/finished-goods?tab=details");
        }
    }, [searchParams, setActiveTab, router]);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab);
        router.replace(`/mm/finished-goods?tab=${tab}`);
    };

    const handleOpenVersionModal = () => {
        let matchedUomId = 0;
        if (selectedProduct && units.length > 0) {
            const matchedUnit = units.find(u => u.unit_shortcut === selectedProduct.baseUom);
            matchedUomId = matchedUnit ? matchedUnit.unit_id : units[0].unit_id;
        }

        const defaultVersionName = `v${versions.length + 1}.0`;
        const activeVerId = selectedVersionId ? String(selectedVersionId) : "";

        setVersionForm({
            versionName: defaultVersionName,
            baseQuantity: 1,
            uomId: matchedUomId,
            expectedYield: selectedProduct ? Number(selectedProduct.expectedYieldPercent) || 100 : 100,
            baseVersionId: activeVerId
        });
        setIsVersionModalOpen(true);
    };

    // Sync simulation defaults when active details or ingredients load
    useEffect(() => {
        if (selectedProduct) {
            setSimulationTargetPrice(selectedProduct.targetSellingPrice);
        }
    }, [selectedProduct]);

    useEffect(() => {
        if (editedDetails.expectedYieldPercent !== undefined) {
            setSimulationYield(Number(editedDetails.expectedYieldPercent) || 100);
        }
    }, [editedDetails.expectedYieldPercent]);

    useEffect(() => {
        const initialPrices: Record<string, number> = {};
        editedBOM.forEach(item => {
            initialPrices[item.id] = item.landedCost;
        });
        setSimulationPriceOverrides(initialPrices);
    }, [editedBOM]);

    const handleDetailChange = (field: keyof Product, value: unknown) => {
        setHasUnsavedChanges(true);
        setEditedDetails(prev => ({ ...prev, [field]: value }));

        const errorKeys: Partial<Record<keyof Product, string>> = {
            title: "title",
            sku: "sku",
            product_brand: "productBrand",
            product_category: "productCategory",
            baseUom: "unit_of_measurement",
            unit_of_measurement_count: "unitOfMeasurementCount",
            densityFactor: "densityFactor",
            expectedYieldPercent: "expected_yield_percentage",
            product_shelf_life: "productShelfLife"
        };
        const errorKey = errorKeys[field];
        if (errorKey) {
            setEditFieldErrors(prev => {
                const next = { ...prev };
                delete next[errorKey];
                return next;
            });
        }

        if (field === "expectedYieldPercent") {
            setEditedVersionDetails(prev => ({
                ...prev,
                expected_yield_percentage: value === undefined ? undefined : Number(value)
            }));
        }
    };


    useEffect(() => {
        const expectedYield = editedVersionDetails.expected_yield_percentage;
        if (expectedYield !== undefined) {
            setEditedDetails(current => current.expectedYieldPercent === expectedYield
                ? current
                : { ...current, expectedYieldPercent: expectedYield });
        }

    }, [editedVersionDetails.expected_yield_percentage]);

    // Importation Derived Calculations
    const importForeignPeso = importNetWeight * importPriceUsd * importFxRate;

    // Dynamic Bureau of Customs (BOC) Formulations
    let finalCustomDuty = importCustomDuty;
    let finalIpf = importIpf;
    let finalVat = importVat;
    let finalOtherPortFees = importOtherPortFees;

    if (automateCustoms) {
        // 1. Insurance in freight (typically 2% of invoice custom value)
        const insurance = importForeignPeso * 0.02;
        const cud = importForeignPeso + insurance;

        // 2. Customs Duty (e.g. 3% standard rate on Canola/Soya)
        finalCustomDuty = cud * 0.03;

        // 3. Brokerage Fee slide-rate schedule
        let brokerage = 2000;
        if (cud <= 10000) brokerage = 500;
        else if (cud <= 50000) brokerage = 1000;
        else if (cud <= 200000) brokerage = 2000;
        else if (cud <= 500000) brokerage = 3500;
        else if (cud <= 1000000) brokerage = 5000;
        else if (cud <= 2000000) brokerage = 7500;
        else brokerage = 10000;

        // 4. Import Processing Fee (IPF) slide-rate schedule
        let ipf = 250;
        if (cud <= 250000) ipf = 250;
        else if (cud <= 500000) ipf = 500;
        else if (cud <= 750000) ipf = 750;
        else if (cud <= 1000000) ipf = 1000;
        else ipf = 1500;

        // 5. Fixed CDS (Doc Stamp) & CSF (Container Security)
        const cds = 280;
        const csf = 277;

        // Combined CSF & IPF field
        finalIpf = ipf + csf;

        // Formulate other port fees with Arrastre (₱5,888.23) + Wharfage (₱581.67) + CDS (₱280)
        finalOtherPortFees = 5888.23 + 581.67 + cds;

        // 6. 12% Import VAT Formula
        finalVat = (cud + finalCustomDuty + brokerage + 5888.23 + 581.67 + cds + ipf + csf) * 0.12;
    }

    const importTotalShippingPort = importThcFee + importStorageFee + importCustomSop + importTruckingFee + finalOtherPortFees;
    const importTotalDutiesTaxes = finalCustomDuty + finalIpf + finalVat;
    const importTotalLandedCost = importForeignPeso + importTotalShippingPort + importTotalDutiesTaxes;
    const importLandedCostPerKg = importTotalLandedCost / (importNetWeight > 0 ? importNetWeight : 1);
    const importLandedCostPerL = importLandedCostPerKg * importDensityFactor;
    const importTotalForCogs = importTotalLandedCost - finalVat;
    const importCogsPerKg = importTotalForCogs / (importNetWeight > 0 ? importNetWeight : 1);
    const importCogsPerL = importCogsPerKg * importDensityFactor;

    const handleApplyImportLandedCost = () => {
        const updatedOverrides = { ...simulationPriceOverrides };
        let count = 0;
        editedBOM.forEach(item => {
            if (item.name.toLowerCase().includes("oil") || item.name.toLowerCase().includes("olein")) {
                updatedOverrides[item.id] = parseFloat(importCogsPerL.toFixed(4));
                count++;
            }
        });
        setSimulationPriceOverrides(updatedOverrides);
        toast.success(`Applied computed COGS cost (₱${importCogsPerL.toFixed(4)}/L) to ${count} oil ingredients in simulator sandbox!`);
    };

    const calculateCurrentCost = (priceOverrides: Record<string, number>, expectedYieldPercentage: number) => {
        let materialsCost = 0;
        let machineOverheadCost = 0;
        let machineHours = 0;
        let totalMachineCost = 0;

        editedRoutes.forEach(route => {
            const workCenter = workCenters.find(wc => wc.work_center_id === route.work_center_id);
            const routeBreakdown = calculateRouteBreakdown({
                stepBatchSize: route.step_batch_size || 1,
                machineHourlyRate: workCenter?.overhead_cost_per_hour || 0,
                setupTimeHours: route.setup_time_hours,
                runTimeHours: route.run_time_hours,
                baseQuantity: Number(editedVersionDetails.base_quantity) || 1,
                materials: (route.bom_items || []).map(item => ({
                    quantity: item.quantity_required,
                    unitCost: priceOverrides[String(item.id)] ?? Number(item.cost_per_unit || 0),
                    wastagePercent: item.wastage_factor_percentage
                }))
            });

            materialsCost += routeBreakdown.materialsCost;
            machineOverheadCost += routeBreakdown.machineOverheadCost;
            machineHours += routeBreakdown.machineHours;
            totalMachineCost += routeBreakdown.totalMachineCost;
        });

        return calculateCostBreakdown({
            materialsCost,
            machineOverheadCost,
            customOverheadCost: editedVersionDetails.custom_overhead,
            expectedYieldPercentage,
            baseQuantity: Number(editedVersionDetails.base_quantity) || 1,
            machineHours,
            totalMachineCost
        });
    };

    const standardCostBreakdown = useMemo(
        () => calculateCurrentCost({}, Number(editedVersionDetails.expected_yield_percentage) || 100),
        [editedRoutes, workCenters, editedVersionDetails]
    );

    const simulatedCostBreakdown = useMemo(
        () => calculateCurrentCost(simulationPriceOverrides, Number(simulationYield) || 100),
        [editedRoutes, workCenters, editedVersionDetails, simulationPriceOverrides, simulationYield]
    );

    const standardPrice = Number(editedDetails.targetSellingPrice) || 0;

    const standardOverheads = useMemo(() => {
        return {
            ...calculateOverheadSummary(
                standardCostBreakdown.customOverheadCost,
                editedOverheads.map(item => item.amount)
            ),
            items: editedOverheads
        };
    }, [standardCostBreakdown.customOverheadCost, editedOverheads]);

    const standardMarginSummary = useMemo(
        () => calculateMarginSummary(
            standardPrice,
            standardCostBreakdown.unitCost,
            standardOverheads.excludedFromCogs
        ),
        [standardPrice, standardCostBreakdown.unitCost, standardOverheads.excludedFromCogs]
    );

    const simulatedOverheads = useMemo(() => {
        return {
            ...calculateOverheadSummary(
                simulatedCostBreakdown.customOverheadCost,
                editedOverheads.map(item => item.amount)
            ),
            items: editedOverheads
        };
    }, [simulatedCostBreakdown.customOverheadCost, editedOverheads]);

    const simulatedMarginSummary = useMemo(
        () => calculateMarginSummary(
            Number(simulationTargetPrice),
            simulatedCostBreakdown.unitCost,
            simulatedOverheads.excludedFromCogs
        ),
        [simulationTargetPrice, simulatedCostBreakdown.unitCost, simulatedOverheads.excludedFromCogs]
    );

    const treeProducts = useMemo(() => {
        const childrenMap = new Map<string, Product[]>();
        const roots: Product[] = [];

        const matchesProduct = (product: Product, query: string) => {
            const normalizedQuery = query.toLowerCase();
            return product.title.toLowerCase().includes(normalizedQuery)
                || product.sku.toLowerCase().includes(normalizedQuery)
                || product.barcode.toLowerCase().includes(normalizedQuery);
        };

        products.forEach(p => {
            if (p.parent_id) {
                const pIdStr = String(p.parent_id);
                if (!childrenMap.has(pIdStr)) {
                    childrenMap.set(pIdStr, []);
                }
                childrenMap.get(pIdStr)!.push(p);
            } else {
                roots.push(p);
            }
        });

        if (searchQuery.trim()) {
            const query = searchQuery.trim();
            const matchingRoots: Product[] = [];

            roots.forEach(root => {
                const rootMatches = matchesProduct(root, query);
                const children = childrenMap.get(root.id) || [];
                const matchingChildren = children.filter(child => matchesProduct(child, query));

                if (rootMatches || matchingChildren.length > 0) {
                    matchingRoots.push(root);
                }
            });

            return { roots: matchingRoots, childrenMap };
        }

        return { roots, childrenMap };
    }, [products, searchQuery]);

    // disabled-lint-next-line @typescript-eslint/no-unused-vars
    const existingRoutingNames = useMemo(() => {
        const names = new Set<string>();
        products.forEach(p => {
            if (p.routings) {
                p.routings.forEach(r => {
                    if (r.name) {
                        names.add(r.name.trim());
                    }
                });
            }
        });
        return Array.from(names);
    }, [products]);

    // Searchable Select Option Maps
    const parentOptions = useMemo(() => {
        return products
            .filter(p => !p.parent_id)
            .map(p => ({
                value: String(p.id),
                label: `${p.title} (${p.sku}) - ${p.baseUom}`
            }));
    }, [products]);

    const brandOptions = useMemo(() => {
        return brands.map(b => ({
            value: String(b.brand_id),
            label: b.brand_name
        }));
    }, [brands]);

    const categoryOptions = useMemo(() => {
        return categories.map(c => ({
            value: String(c.category_id),
            label: c.category_name
        }));
    }, [categories]);

    const segmentOptions = useMemo(() => {
        return segments.map(s => ({
            value: String(s.segment_id),
            label: s.segment_name
        }));
    }, [segments]);

    const classOptions = useMemo(() => {
        return classes.map(c => ({
            value: String(c.class_id),
            label: c.class_name
        }));
    }, [classes]);

    const sectionOptions = useMemo(() => {
        return sections.map(s => ({
            value: String(s.section_id),
            label: s.section_name
        }));
    }, [sections]);

    const uomOptions = useMemo(() => {
        return units.map(u => ({
            value: u.unit_shortcut,
            label: `${u.unit_name} (${u.unit_shortcut})`
        }));
    }, [units]);

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
        <div className="flex h-full min-h-[calc(100vh-120px)] flex-1 flex-col overflow-hidden bg-background">
            {/* Topbar */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b px-4 bg-muted/10 rounded-t-xl">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className="inline-flex items-center justify-center p-1.5 rounded-lg border bg-background hover:bg-muted text-muted-foreground transition-all mr-1.5"
                        title={isSidebarCollapsed ? "Expand Product Catalog" : "Collapse Product Catalog"}
                    >
                        <ChevronLeft className={`h-4 w-4 transform transition-transform duration-200 ${isSidebarCollapsed ? "rotate-180" : ""}`} />
                    </button>
                    <Layers className="h-5 w-5 text-primary" />
                    <h1 className="text-base font-bold tracking-tight">Finished Goods Master</h1>
                    {(loadingBOM || savingBOM) && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
                </div>
                <div className="flex items-center gap-2 relative">
                    <div className="relative inline-flex rounded-lg shadow-sm">
                        <button
                            type="button"
                            onClick={() => {
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
                                resetRegisterFormErrors();
                                setIsRegisterModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-l-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all cursor-pointer border-r border-primary-foreground/10"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Register Product
                        </button>

                        <button
                            type="button"
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="inline-flex items-center rounded-r-lg bg-primary px-2 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all cursor-pointer"
                        >
                            <ChevronDown className="h-3.5 w-3.5" />
                        </button>

                        {isMenuOpen && (
                            <>
                                <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setIsMenuOpen(false)}
                                />
                                <div className="absolute right-0 top-full mt-1.5 w-56 rounded-lg bg-card border border-border/80 shadow-lg py-1 z-20 text-xs text-foreground font-semibold divide-y divide-border/40 animate-in slide-in-from-top-1 duration-150">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsMenuOpen(false);
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
                                            resetRegisterFormErrors();
                                            setIsRegisterModalOpen(true);
                                        }}
                                        className="w-full text-left px-3 py-2 hover:bg-muted text-foreground flex items-center gap-2"
                                    >
                                        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                                        Register New Product
                                    </button>
                                    {selectedProduct && !selectedProduct.parent_id && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsMenuOpen(false);
                                                setRegisterForm({
                                                    title: selectedProduct.title,
                                                    sku: "",
                                                    baseUom: "",
                                                    targetSellingPrice: "",
                                                    barcode: "",
                                                    densityFactor: String(selectedProduct.densityFactor || "1.0"),
                                                    expectedYield: "",
                                                    versionName: "v1.0",
                                                    brandId: selectedProduct.product_brand ? String(selectedProduct.product_brand) : "",
                                                    categoryId: selectedProduct.product_category ? String(selectedProduct.product_category) : "",
                                                    description: selectedProduct.description || "",
                                                    costPerUnit: "",
                                                    uomCount: "",
                                                    classId: selectedProduct.product_class ? String(selectedProduct.product_class) : "",
                                                    segmentId: selectedProduct.product_segment ? String(selectedProduct.product_segment) : "",
                                                    sectionId: selectedProduct.product_section ? String(selectedProduct.product_section) : "",
                                                    shelfLife: selectedProduct.product_shelf_life ? String(selectedProduct.product_shelf_life) : "",
                                                    productImage: "",
                                                    parentId: selectedProduct.id,
                                                    supplierIds: [] as string[]
                                                });
                                                resetRegisterFormErrors();
                                                setIsRegisterModalOpen(true);
                                            }}
                                            className="w-full text-left px-3 py-2 hover:bg-muted text-foreground flex items-center gap-2"
                                        >
                                            <Layers className="h-3.5 w-3.5 text-primary" />
                                            <div>
                                                <span className="block">Add Child Variant</span>
                                                <span className="block text-[9px] text-muted-foreground font-normal truncate max-w-[180px]">
                                                    Parent: {selectedProduct.title}
                                                </span>
                                            </div>
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={savingBOM || !selectedProduct}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {savingBOM ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Save className="h-3.5 w-3.5" />
                        )}
                        {savingBOM ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </div>

            <div className="flex flex-1 min-h-0 overflow-hidden border rounded-b-xl">
                {!isSidebarCollapsed && (
                    <div className="w-80 shrink-0 border-r flex flex-col bg-muted/20 animate-in slide-in-from-left duration-200">
                        {/* Product Search Box */}
                        <div className="p-3 border-b">
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Search products or SKUs..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full rounded-lg border bg-background pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>
                        </div>

                        {/* Products list items */}
                        <div className="flex-1 overflow-y-auto p-2 space-y-1">
                            {loadingProducts ? (
                                <div className="flex flex-col items-center justify-center p-8 gap-1.5 text-muted-foreground">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    <span className="text-xs">Loading products...</span>
                                </div>
                            ) : (
                                treeProducts.roots.map((root) => {
                                    const children = treeProducts.childrenMap.get(root.id) || [];
                                    const displayedChildren = searchQuery.trim()
                                        ? children.filter(c => c.title.toLowerCase().includes(searchQuery.trim().toLowerCase()) || c.sku.toLowerCase().includes(searchQuery.trim().toLowerCase()) || c.barcode.toLowerCase().includes(searchQuery.trim().toLowerCase()))
                                        : children;

                                    return (
                                        <div key={root.id} className="space-y-1 mb-1">
                                            {/* Render Parent */}
                                            <button
                                                onClick={() => {
                                                    if (hasUnsavedChanges) {
                                                        if (!confirm("You have unsaved changes. Are you sure you want to navigate away?")) return;
                                                        setHasUnsavedChanges(false);
                                                    }
                                                    setSelectedProductId(root.id);
                                                }}
                                                className={`w-full flex flex-col text-left p-3 rounded-lg border transition-all ${selectedProductId === root.id
                                                        ? "bg-card border-primary shadow-sm ring-1 ring-primary/20"
                                                        : "bg-transparent border-transparent hover:bg-muted"
                                                    }`}
                                            >
                                                <div className="flex items-start justify-between w-full gap-2 min-w-0">
                                                    <span className="text-sm font-semibold truncate flex-1 min-w-0 flex items-center gap-1.5">
                                                        <Package className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                                                        {root.title}
                                                    </span>
                                                    <span className="shrink-0 bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-[4px] text-[9px] font-bold tracking-wider uppercase border border-blue-500/20">
                                                        Parent
                                                    </span>
                                                </div>
                                                <div className="mt-1.5 flex items-center justify-between w-full text-xs text-muted-foreground pl-5">
                                                    <span className="truncate pr-1">SKU: {root.sku || "N/A"} [{root.baseUom}]</span>
                                                    <span className="font-semibold bg-muted px-1.5 py-0.5 rounded text-foreground shrink-0">
                                                        ₱{root.targetSellingPrice.toFixed(2)}
                                                    </span>
                                                </div>
                                            </button>

                                            {/* Render Children */}
                                            {displayedChildren.length > 0 && (
                                                <div className="pl-4 ml-3 border-l border-border/60 space-y-1 mt-1">
                                                    {displayedChildren.map(child => (
                                                        <button
                                                            key={child.id}
                                                            onClick={() => {
                                                                if (hasUnsavedChanges) {
                                                                    if (!confirm("You have unsaved changes. Are you sure you want to navigate away?")) return;
                                                                    setHasUnsavedChanges(false);
                                                                }
                                                                setSelectedProductId(child.id);
                                                            }}
                                                            className={`w-full flex flex-col text-left p-2.5 rounded-lg border transition-all relative ${selectedProductId === child.id
                                                                    ? "bg-card border-primary/70 shadow-sm ring-1 ring-primary/10"
                                                                    : "bg-transparent border-transparent hover:bg-muted/70"
                                                                }`}
                                                        >
                                                            {/* Connection line indicator */}
                                                            <div className="absolute left-[-16px] top-1/2 -translate-y-1/2 w-3 border-t border-border/60" />

                                                            <div className="flex items-start justify-between w-full gap-2 min-w-0">
                                                                <span className="text-xs font-medium truncate flex-1 min-w-0 flex items-center gap-1.5 text-muted-foreground">
                                                                    <Sliders className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                                                                    {child.title}
                                                                </span>
                                                                <span className="shrink-0 bg-muted/60 text-muted-foreground px-1 py-0.5 rounded-[4px] text-[8px] font-bold tracking-wider uppercase border border-border">
                                                                    Variant
                                                                </span>
                                                            </div>
                                                            <div className="mt-1 flex items-center justify-between w-full text-[11px] text-muted-foreground/80 pl-4.5">
                                                                <span className="truncate pr-1">SKU: {child.sku || "N/A"} [{child.baseUom}]</span>
                                                                <span className="font-semibold text-foreground">
                                                                    ₱{child.targetSellingPrice.toFixed(2)}
                                                                </span>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                            {!loadingProducts && treeProducts.roots.length === 0 && (
                                <div className="p-8 text-center text-xs text-muted-foreground">
                                    No products found
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Right Side: Product Detail Tabs */}
                <div className="flex-1 overflow-hidden flex flex-col bg-background">
                    {selectedProduct && (
                        <div className="px-6 py-4 border-b bg-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0 shadow-sm">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h2 className="text-base font-bold text-foreground truncate">{selectedProduct.title}</h2>
                                    {selectedProduct.parentProduct && (
                                        <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border border-blue-500/20 shrink-0">
                                            Parent Good
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                                    <span>SKU: <strong className="text-foreground font-semibold">{selectedProduct.sku || "N/A"}</strong></span>
                                    <span>Base UOM: <strong className="text-foreground font-semibold">{selectedProduct.baseUom}</strong></span>
                                    {selectedProduct.barcode && (
                                        <span>Barcode: <strong className="text-foreground font-semibold">{selectedProduct.barcode}</strong></span>
                                    )}
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-4 self-start sm:self-center shrink-0 border-l pl-4 border-muted">
                                {versions.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Viewing Version</label>
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={selectedVersionId || ""}
                                                onChange={e => {
                                                    if (hasUnsavedChanges) {
                                                        if (!confirm("You have unsaved changes. Are you sure you want to switch versions?")) return;
                                                        setHasUnsavedChanges(false);
                                                    }
                                                    setSelectedVersionId(Number(e.target.value) || null);
                                                }}
                                                className="rounded border px-2 py-1 bg-background text-xs font-semibold text-foreground outline-none focus:ring-1 focus:ring-primary"
                                            >
                                                {versions.map((v, idx) => {
                                                    const cost = versionCosts[v.version_id];
                                                    const costStr = cost !== undefined && cost > 0 ? ` (Est: ₱${cost.toFixed(2)})` : "";
                                                    const activeStr = v.is_active ? " [ACTIVE]" : "";
                                                    return (
                                                        <option key={`${v.version_id}-${idx}`} value={v.version_id}>
                                                            {v.version_name}{activeStr}{costStr}
                                                        </option>
                                                    );
                                                })}
                                            </select>

                                            {selectedVersionId && !versions.find(v => v.version_id === selectedVersionId)?.is_active && (
                                                <button
                                                    onClick={() => handleActivateVersion(selectedVersionId)}
                                                    className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 border-none px-2 py-1 text-xs font-bold text-white transition-all cursor-pointer shadow-sm shadow-emerald-950/20"
                                                    title="Set this version as active"
                                                >
                                                    Set Active
                                                </button>
                                            )}

                                            {selectedVersionId && versions.find(v => v.version_id === selectedVersionId)?.is_active && (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider">
                                                        Active
                                                    </span>
                                                    <button
                                                        onClick={() => {
                                                            if (confirm("Are you sure you want to deactivate all BOM versions for this product?")) {
                                                                handleActivateVersion(undefined, true);
                                                            }
                                                        }}
                                                        className="inline-flex items-center gap-1 rounded bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 px-2 py-1 text-xs font-bold text-destructive transition-all cursor-pointer"
                                                        title="Deactivate this version"
                                                    >
                                                        Deactivate
                                                    </button>
                                                </div>
                                            )}

                                            <button
                                                onClick={handleOpenVersionModal}
                                                className="inline-flex items-center gap-1 rounded bg-muted border px-2 py-1 text-xs font-semibold hover:bg-accent transition-colors text-foreground"
                                                title="Register New Version"
                                            >
                                                <Plus className="h-3 w-3" /> New
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div className="text-right">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Target Selling Price</span>
                                    <span className="text-sm font-extrabold text-foreground">₱{selectedProduct.targetSellingPrice.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Tab Navigation */}
                    <div className="flex border-b px-4 bg-muted/10 shrink-0">
                        {[
                            { id: "details", label: "Product Details", icon: FileText },
                            { id: "routes_bom", label: "Routes & BOM", icon: Layers },
                            { id: "costing", label: "Live Costing & Simulator", icon: Sliders },
                            { id: "qa_templates", label: "QA Checklist Templates", icon: Shield },
                            { id: "importation", label: "Importation & Landed Cost", icon: Briefcase }
                        ].map((t) => {
                            const Icon = t.icon;
                            return (
                                <button
                                    key={t.id}
                                    onClick={() => handleTabChange(t.id)}
                                    className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all -mb-[1px] ${activeTab === t.id
                                            ? "border-primary text-primary"
                                            : "border-transparent text-muted-foreground hover:text-foreground"
                                        }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>

                    {Object.keys(editFieldErrors).length > 0 && (
                        <div className="mx-6 mt-4 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs text-red-700" role="alert">
                            <p className="font-semibold">Please correct the highlighted fields before saving.</p>
                            <ul className="mt-1 list-disc pl-4">
                                {Object.values(editFieldErrors).map((message, index) => (
                                    <li key={`${message}-${index}`}>{message}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Tab Contents */}
                    <div className="flex-1 overflow-y-auto p-6 min-h-0 relative">
                        {loadingProducts && !selectedProduct ? (
                            <div className="flex flex-col items-center justify-center p-20 text-muted-foreground h-full">
                                <Loader2 className="h-10 w-10 animate-spin text-primary mb-3" />
                                <span className="text-sm font-semibold">Loading product database...</span>
                                <span className="text-xs text-muted-foreground mt-1">Please wait while we retrieve finished goods and configuration options.</span>
                            </div>
                        ) : selectedProduct ? (
                            <>
                                {activeTab === "details" && (
                                    <ProductDetailsTab
                                        editedDetails={editedDetails}
                                        editFieldErrors={editFieldErrors}
                                        handleDetailChange={handleDetailChange}
                                        customOverhead={editedVersionDetails.custom_overhead ?? 0}
                                        handleCustomOverheadChange={handleCustomOverheadChange}
                                        selectedProduct={selectedProduct}
                                        units={units}
                                        brands={brands}
                                        categories={categories}
                                        classes={classes}
                                        segments={segments}
                                        sections={sections}
                                        handleCreateBrand={handleCreateBrand}
                                        handleCreateCategory={handleCreateCategory}
                                        handleCreateClass={handleCreateClass}
                                        handleCreateSegment={handleCreateSegment}
                                        handleCreateSection={handleCreateSection}
                                        products={products}
                                    />
                                )}

                                {activeTab !== "details" && versions.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center p-20 text-center max-w-md mx-auto my-auto h-full">
                                        <Layers className="h-16 w-16 mb-4 text-muted-foreground/30" />
                                        <h3 className="text-base font-bold mb-2 text-foreground">No Registered Versions</h3>
                                        <p className="text-xs text-muted-foreground mb-6">
                                            To start configuring the Bill of Materials (BOM) and manufacturing routings for <strong>{selectedProduct.title}</strong>, please register an initial version.
                                        </p>
                                        <button
                                            onClick={handleOpenVersionModal}
                                            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-all text-xs"
                                        >
                                            <Plus className="h-4 w-4" /> Register Initial Version
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {activeTab === "routes_bom" && (
                                            <RoutesBOMTab
                                                editedRoutes={editedRoutes}
                                                setEditedRoutes={setEditedRoutes}
                                                operationTypes={operationTypes}
                                                workCenters={workCenters}
                                                qaTemplates={qaTemplates}
                                                units={units}
                                                setHasUnsavedChanges={setHasUnsavedChanges}
                                                setOperationTypes={setOperationTypes}
                                                editedVersionDetails={editedVersionDetails}
                                                setEditedVersionDetails={setEditedVersionDetails}
                                            />
                                        )}

                                        {activeTab === "qa_templates" && (
                                            <QATemplatesTab
                                                qaTemplates={qaTemplates}
                                                units={units}
                                                handleAddQATemplate={handleAddQATemplate}
                                                handleSaveQATemplate={handleSaveQATemplate}
                                            />
                                        )}

                                        {activeTab === "costing" && (
                                            <CostRollupTab
                                                standardPrice={standardPrice}
                                                standardCogs={standardCostBreakdown.unitCost}
                                                standardBreakdown={standardCostBreakdown}
                                                standardOverheads={standardOverheads}
                                                standardGrossProfit={standardMarginSummary.grossProfit}
                                                standardGrossMarginPercent={standardMarginSummary.grossMarginPercent}
                                                standardNetProfit={standardMarginSummary.netProfit}
                                                standardNetMarginPercent={standardMarginSummary.netMarginPercent}
                                                simulationYield={simulationYield}
                                                setSimulationYield={setSimulationYield}
                                                simulationTargetPrice={simulationTargetPrice}
                                                setSimulationTargetPrice={setSimulationTargetPrice}
                                                simulationPriceOverrides={simulationPriceOverrides}
                                                setSimulationPriceOverrides={setSimulationPriceOverrides}
                                                editedBOM={editedBOM}
                                                selectedProduct={selectedProduct}
                                                selectedVersionId={selectedVersionId}
                                                simulatedGrossProfit={simulatedMarginSummary.grossProfit}
                                                simulatedGrossMarginPercent={simulatedMarginSummary.grossMarginPercent}
                                                simulatedNetProfit={simulatedMarginSummary.netProfit}
                                                simulatedCogs={simulatedCostBreakdown.unitCost}
                                                simulatedBreakdown={simulatedCostBreakdown}
                                                simulatedOverheads={simulatedOverheads}
                                                simulatedNetMarginPercent={simulatedMarginSummary.netMarginPercent}
                                                simulatedForexRate={simulatedForexRate}
                                                setSimulatedForexRate={setSimulatedForexRate}
                                            />
                                        )}

                                        {activeTab === "importation" && (
                                            <ImportationTab
                                                importNetWeight={importNetWeight}
                                                setImportNetWeight={setImportNetWeight}
                                                importPriceUsd={importPriceUsd}
                                                setImportPriceUsd={setImportPriceUsd}
                                                importFxRate={importFxRate}
                                                setImportFxRate={setImportFxRate}
                                                importDensityFactor={importDensityFactor}
                                                setImportDensityFactor={setImportDensityFactor}
                                                importThcFee={importThcFee}
                                                setImportThcFee={setImportThcFee}
                                                importStorageFee={importStorageFee}
                                                setImportStorageFee={setImportStorageFee}
                                                importCustomSop={importCustomSop}
                                                setImportCustomSop={setImportCustomSop}
                                                importTruckingFee={importTruckingFee}
                                                setImportTruckingFee={setImportTruckingFee}
                                                importOtherPortFees={automateCustoms ? finalOtherPortFees : importOtherPortFees}
                                                setImportOtherPortFees={setImportOtherPortFees}
                                                importCustomDuty={automateCustoms ? finalCustomDuty : importCustomDuty}
                                                setImportCustomDuty={setImportCustomDuty}
                                                importVat={automateCustoms ? finalVat : importVat}
                                                setImportVat={setImportVat}
                                                importIpf={automateCustoms ? finalIpf : importIpf}
                                                setImportIpf={setImportIpf}
                                                importForeignPeso={importForeignPeso}
                                                importTotalShippingPort={importTotalShippingPort}
                                                importTotalDutiesTaxes={importTotalDutiesTaxes}
                                                importTotalLandedCost={importTotalLandedCost}
                                                importLandedCostPerKg={importLandedCostPerKg}
                                                importLandedCostPerL={importLandedCostPerL}
                                                importTotalForCogs={importTotalForCogs}
                                                importCogsPerKg={importCogsPerKg}
                                                importCogsPerL={importCogsPerL}
                                                handleApplyImportLandedCost={handleApplyImportLandedCost}
                                                automateCustoms={automateCustoms}
                                                setAutomateCustoms={setAutomateCustoms}
                                            />
                                        )}
                                    </>
                                )}
                                {loadingBOM && (
                                    <div className="absolute inset-0 bg-background/55 backdrop-blur-xs flex items-center justify-center z-50 animate-in fade-in duration-150">
                                        <div className="bg-card border rounded-xl shadow-lg p-5 flex flex-col items-center gap-2 max-w-xs text-center border-primary/20">
                                            <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                            <h4 className="text-xs font-bold text-foreground">Loading Version Recipe...</h4>
                                            <p className="text-[10px] text-muted-foreground">Fetching bill of materials, routing sequences, and overhead variables from database.</p>
                                        </div>
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-20 text-muted-foreground">
                                <AlertCircle className="h-10 w-10 mb-2 text-muted" />
                                <span>No product selected</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {savingBOM && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-background/55 backdrop-blur-sm animate-in fade-in duration-150"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="finished-goods-saving-title"
                >
                    <div className="bg-card border rounded-xl shadow-lg p-6 flex flex-col gap-4 w-80 text-center border-primary/20" tabIndex={-1}>
                        <div className="flex flex-col items-center gap-1">
                            <h4 id="finished-goods-saving-title" className="text-xs font-bold text-foreground uppercase tracking-wider">Processing Request</h4>
                            <p className="text-[10px] text-muted-foreground font-mono">{saveStatus}</p>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden relative">
                            <div
                                className="bg-primary h-full rounded-full transition-all duration-300 ease-out"
                                style={{ width: `${saveProgress}%` }}
                            />
                        </div>
                        <div className="flex justify-between items-center text-[10px] font-mono font-bold text-muted-foreground">
                            <span>PROGRESS</span>
                            <span className="text-primary">{saveProgress}%</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Version Registration Modal */}
            {isVersionModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-card border border-border/80 rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-muted/20">
                            <div className="flex items-center gap-2">
                                <Plus className="h-5 w-5 text-primary" />
                                <div>
                                    <h3 className="text-base font-bold text-foreground">Register New BOM Version</h3>
                                    <p className="text-xs text-muted-foreground">Add a new version for manufacturing specifications.</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsVersionModalOpen(false)}
                                className="text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors px-3 py-1.5 hover:bg-muted rounded-lg"
                            >
                                Close
                            </button>
                        </div>

                        {/* Form */}
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleRegisterNewVersion(versionForm);
                            }}
                            className="p-6 space-y-4 text-xs"
                        >
                            {/* Version Name */}
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Version Name <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. OIL 2ND VERSION EASY MIX"
                                    value={versionForm.versionName}
                                    onChange={e => setVersionForm(prev => ({ ...prev, versionName: e.target.value }))}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                />
                            </div>

                            {/* Base Qty & Base UOM */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Base Quantity</label>
                                    <input
                                        type="number"
                                        min="1"
                                        required
                                        value={versionForm.baseQuantity}
                                        onChange={e => setVersionForm(prev => ({ ...prev, baseQuantity: parseInt(e.target.value) || 1 }))}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Base UOM</label>
                                    <select
                                        value={versionForm.uomId}
                                        onChange={e => setVersionForm(prev => ({ ...prev, uomId: parseInt(e.target.value) || 0 }))}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                    >
                                        {units.map(u => (
                                            <option key={u.unit_id} value={u.unit_id}>{u.unit_name} ({u.unit_shortcut})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Expected Yield & Clone Source */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Expected Yield (%)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="100"
                                        required
                                        value={versionForm.expectedYield}
                                        onChange={e => setVersionForm(prev => ({ ...prev, expectedYield: parseInt(e.target.value) || 100 }))}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Clone Source</label>
                                    <select
                                        value={versionForm.baseVersionId}
                                        onChange={e => setVersionForm(prev => ({ ...prev, baseVersionId: e.target.value }))}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                    >
                                        <option value="">Start Blank (No Clone)</option>
                                        {versions.map(v => (
                                            <option key={v.id} value={String(v.id)}>{v.version_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Footer Buttons */}
                            <div className="flex justify-end gap-3 pt-3 border-t shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsVersionModalOpen(false)}
                                    className="px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors text-muted-foreground"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingBOM}
                                    className="px-4 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-lg text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/20 flex items-center gap-1.5"
                                >
                                    {savingBOM && (
                                        <div className="h-3 w-3 animate-spin border border-current border-t-transparent rounded-full" />
                                    )}
                                    {savingBOM ? "Registering..." : "Register Version"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Product Registration Modal Popup */}
            {isRegisterModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-card border border-border/80 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-muted/20">
                            <div className="flex items-center gap-2">
                                <Plus className="h-5 w-5 text-primary animate-pulse" />
                                <div>
                                    <h3 className="text-base font-bold text-foreground">Register Product & BOM Version</h3>
                                    <p className="text-xs text-muted-foreground">Add new product master record and link its initial bill of materials version.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsRegisterModalOpen(false)}
                                className="text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors px-3 py-1.5 hover:bg-muted rounded-lg"
                            >
                                Close
                            </button>
                        </div>

                        {/* Form */}
                        <form noValidate onSubmit={handleRegisterProduct} className="flex-1 overflow-y-auto p-6 space-y-6">
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
                                    <div className="col-span-2">
                                        <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Parent Product (Optional)</label>
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
                                                            title: parentProd.title,
                                                            sku: "",
                                                            baseUom: "",
                                                            uomCount: "",
                                                            expectedYield: "",
                                                            description: parentProd.description || prev.description,
                                                            brandId: parentProd.product_brand ? String(parentProd.product_brand) : prev.brandId,
                                                            categoryId: parentProd.product_category ? String(parentProd.product_category) : prev.categoryId,
                                                            classId: parentProd.product_class ? String(parentProd.product_class) : prev.classId,
                                                            segmentId: parentProd.product_segment ? String(parentProd.product_segment) : prev.segmentId,
                                                            sectionId: parentProd.product_section ? String(parentProd.product_section) : prev.sectionId,
                                                            shelfLife: parentProd.product_shelf_life ? String(parentProd.product_shelf_life) : prev.shelfLife,
                                                            densityFactor: String(parentProd.densityFactor || "1.0")
                                                        };
                                                    }
                                                    return {
                                                        ...prev,
                                                        parentId: selectedId,
                                                        sku: "",
                                                        baseUom: "",
                                                        uomCount: "",
                                                        expectedYield: ""
                                                    };
                                                });
                                            }}
                                            placeholder="Select parent product..."
                                            aria-invalid={!!registerError("parentId")}
                                            aria-describedby={registerError("parentId") ? "register-parentId-error" : undefined}
                                            className={registerError("parentId") ? "border-red-500 focus:ring-red-500" : undefined}
                                        />
                                        {registerErrorMessage("parentId")}
                                    </div>
                                </div>
                            </div>

                            {/* Group 2: Measurements & Life */}
                            <div className="bg-muted/10 border border-border/40 rounded-xl p-4 space-y-4">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                                    <Sliders className="h-3.5 w-3.5" /> 2. Physicals & Inventory
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
                                        <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">UOM Count (Pack Mult) <span className="text-red-500">*</span></label>
                                        <input
                                            id="register-uomCount"
                                            type="number"
                                            placeholder="e.g. 1"
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
                                                    {/* disabled-lint-next-line @next/next/no-img-element */}
                                                    <img
                                                        src={registerImagePreview || getProductImageUrl(registerForm.productImage)}
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
                                    <Briefcase className="h-3.5 w-3.5" /> 3. Financials & Suppliers
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
                                    onClick={() => setIsRegisterModalOpen(false)}
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
            )}
        </div>
    );
}
