/* eslint-disable */
"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
    Search,
    Plus,
    Loader2,
    Package,
    Layers,
    AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { ProductDetailsTab } from "./components/ProductDetailsTab";
import { QATemplatesTab } from "./components/QATemplatesTab";
import { CostRollupTab } from "./components/CostRollupTab";
import { ImportationTab } from "./components/ImportationTab";
import { VersionCompareModal } from "./components/VersionCompareModal";
import { FinishedGoodsHeader } from "./components/FinishedGoodsHeader";
import { VersionManagementTab } from "./components/VersionManagementTab";
import { RegisterProductModal } from "./components/RegisterProductModal";
import { fetchHistoricalYield, applyHistoricalYield } from "./services/historical-yield.service";
import { useFinishedGoods } from "./hooks/useFinishedGoods";
import { Product, BOMItem, RoutingStep } from "./types";
import { calculateCostBreakdown, calculateMarginSummary, calculateOverheadSummary, calculateRouteBreakdown } from "./costing";

export default function FinishedGoodsModule() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const requestedTab = searchParams.get("tab");
    const validTabs = ["details", "version_management", "routes_bom", "costing", "qa_templates", "importation"];
    const initialTab = requestedTab && validTabs.includes(requestedTab) ? (requestedTab === "routes_bom" ? "version_management" : requestedTab) : "details";
    const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
    const [isSyncingYield, setIsSyncingYield] = useState(false);

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
        selectedVersion,
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
        overheadTypes,
        setOverheadTypes,
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

    const handleSyncHistoricalYield = async () => {
        if (!selectedProductId || !selectedVersionId) {
            toast.error("Please select a product and version first.");
            return;
        }
        setIsSyncingYield(true);
        try {
            const data = await fetchHistoricalYield(selectedProductId);

            if (data.totalJobsAnalyzed === 0) {
                toast.info("No completed Job Orders found for this product yet. Defaulting to 98.5%.");
            }

            await applyHistoricalYield(selectedVersionId, data.averageActualYield);

            setEditedVersionDetails((prev: any) => ({
                ...prev,
                expected_yield_percentage: data.averageActualYield
            }));
            setHasUnsavedChanges(true);

            toast.success(`Applied historical yield of ${data.averageActualYield}% from ${data.totalJobsAnalyzed} completed Job Orders!`);
        } catch (err: any) {
            console.error("Historical yield error:", err);
            toast.error(err.message || "Failed to sync historical yield");
        } finally {
            setIsSyncingYield(false);
        }
    };

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
    const [registrationType, setRegistrationType] = useState<"parent" | "child">("parent");

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

    // Sidebar Pagination State
    const [sidebarPage, setSidebarPage] = useState(1);
    const [sidebarPageSize] = useState(10);

    useEffect(() => {
        setSidebarPage(1);
    }, [searchQuery]);

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
        const insurance = importForeignPeso * 0.02;
        const cud = importForeignPeso + insurance;

        finalCustomDuty = cud * 0.03;

        let brokerage = 2000;
        if (cud <= 10000) brokerage = 500;
        else if (cud <= 50000) brokerage = 1000;
        else if (cud <= 200000) brokerage = 2000;
        else if (cud <= 500000) brokerage = 3500;
        else if (cud <= 1000000) brokerage = 5000;
        else if (cud <= 2000000) brokerage = 7500;
        else brokerage = 10000;

        let ipf = 250;
        if (cud <= 250000) ipf = 250;
        else if (cud <= 500000) ipf = 500;
        else if (cud <= 750000) ipf = 750;
        else if (cud <= 1000000) ipf = 1000;
        else ipf = 1500;

        const cds = 280;
        const csf = 277;

        finalIpf = ipf + csf;
        finalOtherPortFees = 5888.23 + 581.67 + cds;
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
        let lineElapsedHours = 0;
        let totalMachineCost = 0;

        editedRoutes.forEach(route => {
            const stepDur = (Number(route.setup_time_hours) || 0) + (Number(route.run_time_hours) || 0);
            if (stepDur > lineElapsedHours) {
                lineElapsedHours = stepDur;
            }

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

        const baseQuantity = Number(editedVersionDetails.base_quantity) > 0 ? Number(editedVersionDetails.base_quantity) : 1;
        const laborPositions = editedVersionDetails.labor_positions || [];
        const totalLaborCost = laborPositions.reduce((sum, pos) => {
            const count = Number(pos.manpower_count) || 0;
            const hourly = Number(pos.hourly_rate) || 0;
            const hours = Number(pos.hours_required) || 0;
            return sum + (count * hourly * hours);
        }, 0);
        const directLaborCost = totalLaborCost / baseQuantity;

        return calculateCostBreakdown({
            materialsCost,
            directLaborCost,
            machineOverheadCost,
            customOverheadCost: editedVersionDetails.custom_overhead,
            expectedYieldPercentage,
            baseQuantity,
            machineHours,
            lineElapsedHours,
            totalMachineCost,
            laborPositions
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

    const handleOpenRegisterParent = () => {
        setRegistrationType("parent");
        setRegisterForm({
            title: "",
            sku: "",
            baseUom: "Pcs",
            targetSellingPrice: "",
            barcode: "",
            densityFactor: "1.0",
            expectedYield: "100",
            versionName: "v1.0",
            brandId: "",
            categoryId: "",
            description: "",
            costPerUnit: "",
            uomCount: "1",
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
    };

    const handleOpenRegisterChild = () => {
        setRegistrationType("child");
        const defaultParentId = selectedProduct && !selectedProduct.parent_id
            ? selectedProduct.id
            : (products.find(p => !p.parent_id)?.id || "");
        
        const parentProd = products.find(p => String(p.id) === String(defaultParentId));
        
        setRegisterForm({
            title: parentProd ? `${parentProd.title} (Box of 20)` : "",
            sku: "",
            baseUom: "Case",
            targetSellingPrice: parentProd ? String((parentProd.targetSellingPrice || 0) * 20) : "",
            barcode: "",
            densityFactor: String(parentProd?.densityFactor || "1.0"),
            expectedYield: "100",
            versionName: "v1.0",
            brandId: parentProd?.product_brand ? String(parentProd.product_brand) : "",
            categoryId: parentProd?.product_category ? String(parentProd.product_category) : "",
            description: parentProd?.description || "",
            costPerUnit: "",
            uomCount: "20",
            classId: parentProd?.product_class ? String(parentProd.product_class) : "",
            segmentId: parentProd?.product_segment ? String(parentProd.product_segment) : "",
            sectionId: parentProd?.product_section ? String(parentProd.product_section) : "",
            shelfLife: parentProd?.product_shelf_life ? String(parentProd.product_shelf_life) : "",
            productImage: "",
            parentId: defaultParentId,
            supplierIds: [] as string[]
        });
        resetRegisterFormErrors();
        setIsRegisterModalOpen(true);
    };

    return (
        <div className="flex h-full min-h-[calc(100vh-120px)] flex-1 flex-col overflow-hidden bg-background">
            {/* Header Bar & Tab Controls */}
            <FinishedGoodsHeader
                isSidebarCollapsed={isSidebarCollapsed}
                setIsSidebarCollapsed={setIsSidebarCollapsed}
                loadingBOM={loadingBOM}
                savingBOM={savingBOM}
                onOpenRegisterParent={handleOpenRegisterParent}
                onOpenRegisterChild={handleOpenRegisterChild}
                handleSave={handleSave}
                selectedProduct={selectedProduct}
                versions={versions}
                versionCosts={versionCosts}
                selectedVersionId={selectedVersionId}
                setSelectedVersionId={setSelectedVersionId}
                hasUnsavedChanges={hasUnsavedChanges}
                setHasUnsavedChanges={setHasUnsavedChanges}
                handleActivateVersion={handleActivateVersion}
                handleOpenVersionModal={handleOpenVersionModal}
                setIsCompareModalOpen={setIsCompareModalOpen}
                isSyncingYield={isSyncingYield}
                handleSyncHistoricalYield={handleSyncHistoricalYield}
                activeTab={activeTab}
                handleTabChange={handleTabChange}
            />

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
                                (() => {
                                    const totalSidebarPages = Math.max(1, Math.ceil(treeProducts.roots.length / sidebarPageSize));
                                    const paginatedRoots = treeProducts.roots.slice((sidebarPage - 1) * sidebarPageSize, sidebarPage * sidebarPageSize);
                                    return paginatedRoots.map((root) => {
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
                                                    className={`w-full flex flex-col text-left p-3 rounded-lg border transition-all cursor-pointer ${selectedProductId === root.id
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
                                                                className={`w-full flex flex-col text-left p-2.5 rounded-lg border transition-all relative cursor-pointer ${selectedProductId === child.id
                                                                        ? "bg-card border-primary/70 shadow-sm ring-1 ring-primary/10"
                                                                        : "bg-transparent border-transparent hover:bg-muted/70"
                                                                    }`}
                                                            >
                                                                {/* Connection line indicator */}
                                                                <div className="absolute left-[-16px] top-1/2 -translate-y-1/2 w-3 border-t border-border/60" />

                                                                <div className="flex items-start justify-between w-full gap-2 min-w-0">
                                                                    <span className="text-xs font-medium truncate flex-1 min-w-0 flex items-center gap-1.5">
                                                                        <Layers className="h-3 w-3 text-muted-foreground shrink-0" />
                                                                        {child.title}
                                                                    </span>
                                                                    <span className="shrink-0 bg-muted text-muted-foreground px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold tracking-wider uppercase border border-border">
                                                                        Child
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
                                    });
                                })()
                            )}
                            {!loadingProducts && treeProducts.roots.length === 0 && (
                                <div className="p-8 text-center text-xs text-muted-foreground">
                                    No products found
                                </div>
                            )}
                        </div>

                        {/* Sidebar Pagination Footer */}
                        {treeProducts.roots.length > 0 && (() => {
                            const totalPages = Math.max(1, Math.ceil(treeProducts.roots.length / sidebarPageSize));
                            return (
                                <div className="p-2.5 border-t bg-muted/20 flex items-center justify-between text-xs text-muted-foreground font-medium shrink-0">
                                    <span>
                                        Page {sidebarPage} of {totalPages}
                                    </span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            disabled={sidebarPage <= 1}
                                            onClick={() => setSidebarPage(prev => Math.max(1, prev - 1))}
                                            className="px-2 py-1 text-[11px] font-bold rounded border bg-background hover:bg-muted text-foreground disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                                        >
                                            Prev
                                        </button>
                                        <button
                                            disabled={sidebarPage >= totalPages}
                                            onClick={() => setSidebarPage(prev => Math.min(totalPages, prev + 1))}
                                            className="px-2 py-1 text-[11px] font-bold rounded border bg-background hover:bg-muted text-foreground disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-all"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Right Side: Product Detail Tabs */}
                <div className="flex-1 overflow-hidden flex flex-col bg-background">
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
                                            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-all text-xs cursor-pointer"
                                        >
                                            <Plus className="h-4 w-4" /> Register Initial Version
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        {(activeTab === "version_management" || activeTab === "routes_bom") && (
                                            <VersionManagementTab
                                                selectedProductId={selectedProductId}
                                                selectedVersionId={selectedVersionId}
                                                selectedVersion={selectedVersion}
                                                editedVersionDetails={editedVersionDetails}
                                                setEditedVersionDetails={setEditedVersionDetails}
                                                editedRoutes={editedRoutes}
                                                setEditedRoutes={setEditedRoutes}
                                                operationTypes={operationTypes}
                                                setOperationTypes={setOperationTypes}
                                                overheadTypes={overheadTypes}
                                                setOverheadTypes={setOverheadTypes}
                                                workCenters={workCenters}
                                                qaTemplates={qaTemplates}
                                                units={units}
                                                setHasUnsavedChanges={setHasUnsavedChanges}
                                                isSyncingYield={isSyncingYield}
                                                handleSyncHistoricalYield={handleSyncHistoricalYield}
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
                                                versionOverheadItems={editedVersionDetails.overhead_items}
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
                                className="text-muted-foreground hover:text-foreground text-sm font-semibold transition-colors px-3 py-1.5 hover:bg-muted rounded-lg cursor-pointer"
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
                                            <option key={v.version_id} value={String(v.version_id)}>{v.version_name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Footer Buttons */}
                            <div className="flex justify-end gap-3 pt-3 border-t shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsVersionModalOpen(false)}
                                    className="px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors text-muted-foreground cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingBOM}
                                    className="px-4 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-lg text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/20 flex items-center gap-1.5 cursor-pointer"
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
            <RegisterProductModal
                isOpen={isRegisterModalOpen}
                onClose={() => setIsRegisterModalOpen(false)}
                registrationType={registrationType}
                setRegistrationType={setRegistrationType}
                registerForm={registerForm}
                setRegisterForm={setRegisterForm}
                registerFormErrors={registerFormErrors}
                clearRegisterFormError={clearRegisterFormError}
                handleRegisterProduct={handleRegisterProduct}
                savingBOM={savingBOM}
                products={products}
                suppliers={suppliers}
                brandOptions={brandOptions}
                categoryOptions={categoryOptions}
                parentOptions={parentOptions}
                uomOptions={uomOptions}
                segmentOptions={segmentOptions}
                classOptions={classOptions}
                sectionOptions={sectionOptions}
                handleCreateBrand={handleCreateBrand}
                handleCreateCategory={handleCreateCategory}
                handleCreateSegment={handleCreateSegment}
                handleCreateClass={handleCreateClass}
                handleCreateSection={handleCreateSection}
            />

            {/* Version Comparison Modal */}
            <VersionCompareModal
                isOpen={isCompareModalOpen}
                onClose={() => setIsCompareModalOpen(false)}
                productId={selectedProductId}
                productTitle={selectedProduct?.title || "Finished Good"}
                versions={versions}
                currentVersionId={selectedVersionId}
            />
        </div>
    );
}
