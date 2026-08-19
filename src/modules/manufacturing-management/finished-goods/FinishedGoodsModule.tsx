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
    AlertCircle,
    Lock,
    Star,
    Clock,
    Send
} from "lucide-react";
import { toast } from "sonner";
import { ProductDetailsTab } from "./components/ProductDetailsTab";
import { QualityImportationTab } from "./components/QualityImportationTab";
import { CostRollupTab } from "./components/CostRollupTab";
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
    const validTabs = ["details", "version_management", "routes_bom", "costing", "quality_importation", "qa_templates", "importation"];
    const initialTab = requestedTab && validTabs.includes(requestedTab)
        ? (requestedTab === "routes_bom" ? "version_management" : requestedTab === "qa_templates" || requestedTab === "importation" ? "quality_importation" : requestedTab)
        : "details";
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
        handleSubmitVersionForApproval,
        handleAddQATemplate,
        handleSaveQATemplate,
        editedVersionDetails,
        setEditedVersionDetails,
        handleCustomOverheadChange,
        allCatalogProducts
    } = useFinishedGoods(initialTab);

    const requestedProductId = searchParams.get("productId");

    useEffect(() => {
        if (requestedProductId && products.length > 0) {
            const found = products.find(p => p.id === requestedProductId || p.sku === requestedProductId);
            if (found && found.id !== selectedProductId) {
                setSelectedProductId(found.id);
            }
        }
    }, [requestedProductId, products, selectedProductId, setSelectedProductId]);

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
                    const prodName = matchedProd ? matchedProd.product_name : (b.product_name || `Unresolved Material (ID #${b.product_id} - Archived or Missing)`);

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

    // Version Search Filter State
    const [versionSearchQuery, setVersionSearchQuery] = useState("");

    const displayedVersions = useMemo(() => {
        if (!versionSearchQuery.trim()) return versions;
        const q = versionSearchQuery.trim().toLowerCase();
        return versions.filter(v =>
            (v.version_name && v.version_name.toLowerCase().includes(q)) ||
            (v.status && v.status.toLowerCase().includes(q))
        );
    }, [versions, versionSearchQuery]);

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

        const nextVerNum = `v${versions.length + 1}.0`;
        const skuCode = selectedProduct?.sku?.trim();
        const defaultVersionName = skuCode ? `${skuCode} - ${nextVerNum}` : nextVerNum;
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
            label: `${u.unit_name} (${u.unit_shortcut})`,
            order: typeof (u as any).unit_order === "number" ? (u as any).unit_order : typeof (u as any).order === "number" ? (u as any).order : typeof (u as any).sort === "number" ? (u as any).sort : undefined
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

        let targetParent: Product | null = null;
        if (selectedProduct) {
            const pParentId = typeof selectedProduct.parent_id === "object" && selectedProduct.parent_id !== null
                ? Number((selectedProduct.parent_id as any).product_id)
                : selectedProduct.parent_id ? Number(selectedProduct.parent_id) : undefined;
            if (pParentId) {
                targetParent = products.find(p => String(p.id) === String(pParentId)) || selectedProduct;
            } else {
                targetParent = selectedProduct;
            }
        }

        if (targetParent) {
            const targetParentIdStr = String(targetParent.id);
            const childVariants = products.filter(p => {
                const pParentId = typeof p.parent_id === "object" && p.parent_id !== null
                    ? Number((p.parent_id as any).product_id)
                    : p.parent_id ? Number(p.parent_id) : undefined;
                return String(pParentId) === targetParentIdStr && p.isActive !== false;
            });
            const used = new Set<string>();
            if (targetParent.baseUom) used.add(targetParent.baseUom.trim().toUpperCase());
            childVariants.forEach(c => {
                if (c.baseUom) used.add(c.baseUom.trim().toUpperCase());
            });

            // Find first available packaging UOM (order > 1 or non-base)
            const availableUom = uomOptions.find(u => {
                const shortcut = (u.value || "").trim().toUpperCase();
                const isPackaging = ["BOX", "CASE", "CS", "BX", "TIE", "BNDL", "BUNDLE", "PACK", "PK", "CRATE", "PALLET", "DRUM", "BAG", "MBAG"].includes(shortcut) || !["PCS", "PC", "PIECE", "POUCH", "BOT", "BOTTLE", "CAN", "KG", "L", "G", "ML", "UNIT"].includes(shortcut);
                return isPackaging && !used.has(shortcut);
            });
            const chosenUom = availableUom?.value || "Box";
            const count = 20;

            const extractRelId = (val: unknown): number | undefined => {
                if (val === null || val === undefined || val === "") return undefined;
                if (typeof val === "number") return Number.isFinite(val) ? val : undefined;
                if (typeof val === "string") {
                    const parsed = parseInt(val, 10);
                    return Number.isFinite(parsed) ? parsed : undefined;
                }
                if (typeof val === "object" && val !== null) {
                    for (const k of ["id", "brand_id", "category_id", "class_id", "segment_id", "section_id", "product_id", "unit_id"]) {
                        if (k in val && typeof (val as Record<string, unknown>)[k] === "number") {
                            return (val as Record<string, unknown>)[k] as number;
                        }
                    }
                }
                return undefined;
            };

            const parentCatId = extractRelId(targetParent.product_category);
            const parentBrandId = extractRelId(targetParent.product_brand);
            const parentClassId = extractRelId(targetParent.product_class);
            const parentSegmentId = extractRelId(targetParent.product_segment);
            const parentSectionId = extractRelId(targetParent.product_section);

            const uomObj = uomOptions.find(o => o.value === chosenUom);
            const uomName = uomObj ? uomObj.label.split("(")[0].trim() : chosenUom;
            const dynamicTitle = `${targetParent.title} (${uomName} of ${count})`;
            const cleanParentSku = (targetParent.sku || "").trim();
            const cleanUomUpper = chosenUom.trim().toUpperCase();
            const dynamicSku = cleanParentSku ? (cleanParentSku.toUpperCase().endsWith(`-${cleanUomUpper}`) ? cleanParentSku : `${cleanParentSku}-${cleanUomUpper}`) : "";
            const dynamicVersion = dynamicSku ? `${dynamicSku} - v1.0` : "v1.0";

            setRegisterForm({
                parentId: targetParentIdStr,
                title: dynamicTitle,
                sku: dynamicSku,
                baseUom: chosenUom,
                targetSellingPrice: targetParent.targetSellingPrice ? String(targetParent.targetSellingPrice * count) : "",
                barcode: "",
                densityFactor: targetParent.densityFactor !== undefined ? String(targetParent.densityFactor) : "1.0",
                expectedYield: "100",
                versionName: dynamicVersion,
                brandId: parentBrandId ? String(parentBrandId) : "",
                categoryId: parentCatId ? String(parentCatId) : "",
                description: targetParent.description || "",
                costPerUnit: targetParent.cost_per_unit ? String(targetParent.cost_per_unit * count) : "",
                uomCount: String(count),
                classId: parentClassId ? String(parentClassId) : "",
                segmentId: parentSegmentId ? String(parentSegmentId) : "",
                sectionId: parentSectionId ? String(parentSectionId) : "",
                shelfLife: targetParent.product_shelf_life ? String(targetParent.product_shelf_life) : "",
                productImage: "",
                supplierIds: [] as string[]
            });
        } else {
            setRegisterForm({
                title: "",
                sku: "",
                baseUom: "",
                targetSellingPrice: "",
                barcode: "",
                densityFactor: "1.0",
                expectedYield: "100",
                versionName: "v1.0",
                brandId: "",
                categoryId: "",
                description: "",
                costPerUnit: "",
                uomCount: "",
                classId: "",
                segmentId: "",
                sectionId: "",
                shelfLife: "",
                productImage: "",
                parentId: "",
                supplierIds: [] as string[]
            });
        }
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
                products={products}
                selectedProductId={selectedProductId}
                setSelectedProductId={setSelectedProductId}
                selectedProduct={selectedProduct}
                versions={versions}
                selectedVersionId={selectedVersionId}
                hasUnsavedChanges={hasUnsavedChanges}
                setHasUnsavedChanges={setHasUnsavedChanges}
                setIsCompareModalOpen={setIsCompareModalOpen}
                isSyncingYield={isSyncingYield}
                handleSyncHistoricalYield={handleSyncHistoricalYield}
                activeTab={activeTab}
                handleTabChange={handleTabChange}
            />

            <div className="flex flex-1 min-h-0 overflow-hidden border rounded-b-xl">
                {!isSidebarCollapsed && (
                    <div className="w-80 shrink-0 border-r flex flex-col bg-muted/20 animate-in slide-in-from-left duration-200">
                        {/* Version Sidebar Header */}
                        <div className="p-3 border-b bg-card/60 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <Layers className="h-4 w-4 text-primary shrink-0" />
                                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                                    Product Versions
                                </span>
                                <span className="text-[10px] font-bold bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                    {versions.length}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={handleOpenVersionModal}
                                disabled={!selectedProduct}
                                className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Register a new version recipe"
                            >
                                <Plus className="h-3 w-3" />
                                New
                            </button>
                        </div>

                        {/* Version Search / Filter Box */}
                        {versions.length > 3 && (
                            <div className="p-2.5 border-b bg-background/50">
                                <div className="relative">
                                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                    <input
                                        type="text"
                                        placeholder="Filter versions..."
                                        value={versionSearchQuery}
                                        onChange={e => setVersionSearchQuery(e.target.value)}
                                        className="w-full rounded-lg border bg-background pl-8 pr-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Versions List */}
                        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                            {loadingBOM && versions.length === 0 ? (
                                <div className="flex flex-col items-center justify-center p-8 gap-1.5 text-muted-foreground">
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    <span className="text-xs">Loading versions...</span>
                                </div>
                            ) : !selectedProduct ? (
                                <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground gap-2 h-40">
                                    <Layers className="h-8 w-8 opacity-30" />
                                    <span className="text-xs text-muted-foreground">Select a product to view versions</span>
                                </div>
                            ) : displayedVersions.length > 0 ? (
                                displayedVersions.map((v) => {
                                    const isSelected = v.version_id === selectedVersionId;
                                    const isPrimary = !!v.is_primary;
                                    const isActive = v.is_active || v.status === "Active";
                                    const isApproved = v.status === "Approved" || v.status === "Active" || !!v.is_active;
                                    const isSubmitted = v.status === "For Approval" || v.status === "Pending Approval";
                                    const isRejected = v.status === "Rejected";
                                    const isRevision = v.status === "Revision Required";
                                    const cost = versionCosts[v.version_id];

                                    return (
                                        <div
                                            key={v.version_id}
                                            onClick={() => {
                                                if (hasUnsavedChanges) {
                                                    if (!confirm("You have unsaved changes. Are you sure you want to switch versions?")) return;
                                                    setHasUnsavedChanges(false);
                                                }
                                                setSelectedVersionId(v.version_id);
                                            }}
                                            className={`p-3 rounded-xl border transition-all cursor-pointer relative flex flex-col gap-2 ${
                                                isSelected
                                                    ? "bg-card border-primary shadow-sm ring-1 ring-primary/20"
                                                    : "bg-background/80 border-border hover:bg-muted/70 hover:border-muted-foreground/30"
                                            }`}
                                        >
                                            {/* Top Row: Version Name + Status Badge */}
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                                    <span className={`text-xs font-bold truncate ${isSelected ? "text-primary font-extrabold" : "text-foreground"}`}>
                                                        {v.version_name}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                                                    {isPrimary && (
                                                        <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase flex items-center gap-0.5 shrink-0">
                                                            <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" /> Primary
                                                        </span>
                                                    )}
                                                    {isActive ? (
                                                        <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase shrink-0">
                                                            Active
                                                        </span>
                                                    ) : isApproved ? (
                                                        <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase shrink-0">
                                                            Approved
                                                        </span>
                                                    ) : isSubmitted ? (
                                                        <span className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-[9px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                                                            <Clock className="h-2.5 w-2.5" /> Pending
                                                        </span>
                                                    ) : isRejected ? (
                                                        <span className="bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30 text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase shrink-0">
                                                            Rejected
                                                        </span>
                                                    ) : isRevision ? (
                                                        <span className="bg-orange-500/10 text-orange-700 dark:text-orange-300 border border-orange-500/30 text-[9px] font-semibold px-1.5 py-0.5 rounded uppercase shrink-0">
                                                            Revision
                                                        </span>
                                                    ) : (
                                                        <span className="bg-muted text-muted-foreground border text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0">
                                                            {v.status || "Draft"}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Middle Row: Yield, Base Qty */}
                                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                                <div className="flex items-center gap-2">
                                                    <span>Yield: <strong className="text-foreground">{v.expected_yield_percentage || 100}%</strong></span>
                                                    <span>Base: <strong className="text-foreground">{v.base_quantity || 1} {selectedProduct?.baseUom || ""}</strong></span>
                                                </div>
                                            </div>

                                            {/* Bottom Row: Quick Actions for active selected version */}
                                            {isSelected && (
                                                <div className="flex items-center gap-1.5 pt-1.5 border-t border-border/50 mt-0.5 flex-wrap">
                                                    {!isPrimary && isApproved && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                if (confirm(`Set version "${v.version_name}" as Primary Default for master cost rollups and default Job Orders?`)) {
                                                                    handleActivateVersion(v.version_id, "set_primary");
                                                                }
                                                            }}
                                                            className="inline-flex items-center gap-1 rounded bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 text-[10px] font-bold transition-all cursor-pointer shadow-2xs"
                                                            title="Designate as Primary Default"
                                                        >
                                                            <Star className="h-2.5 w-2.5 fill-white" /> Make Primary
                                                        </button>
                                                    )}

                                                    {isApproved && !isActive && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleActivateVersion(v.version_id, "set_active");
                                                            }}
                                                            className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-0.5 text-[10px] font-bold transition-all cursor-pointer shadow-2xs"
                                                            title="Activate as alternate BOM"
                                                        >
                                                            Activate
                                                        </button>
                                                    )}

                                                    {(v.status === "Draft" || !v.status || v.status === "Revision Required") && handleSubmitVersionForApproval && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSubmitVersionForApproval(v.version_id);
                                                            }}
                                                            className="inline-flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 text-[10px] font-bold transition-all cursor-pointer shadow-2xs"
                                                            title="Submit for Approval"
                                                        >
                                                            <Send className="h-2.5 w-2.5" /> Submit
                                                        </button>
                                                    )}

                                                    {isActive && !isPrimary && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleActivateVersion(v.version_id, "deactivate");
                                                            }}
                                                            className="inline-flex items-center gap-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 px-2 py-0.5 text-[10px] font-bold transition-all cursor-pointer"
                                                            title="Deactivate this alternate version"
                                                        >
                                                            Deactivate
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="p-6 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                                    <span>No versions found for this product.</span>
                                    <button
                                        type="button"
                                        onClick={handleOpenVersionModal}
                                        className="inline-flex items-center gap-1 text-primary font-bold hover:underline cursor-pointer"
                                    >
                                        <Plus className="h-3 w-3" /> Create First Version
                                    </button>
                                </div>
                            )}
                        </div>
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
                        ) : !selectedProduct ? (
                            <div className="flex flex-col items-center justify-center p-16 text-center max-w-lg mx-auto my-auto h-full space-y-4">
                                <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                                    <Package className="h-8 w-8" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-base font-bold text-foreground">Select a Finished Good Product</h3>
                                    <p className="text-xs text-muted-foreground max-w-sm">
                                        Choose a manufactured good from the top dropdown to view its product details, version recipes, BOM costs, and workstation routings.
                                    </p>
                                </div>
                                <div className="flex items-center gap-3 pt-2 flex-wrap justify-center">
                                    <button
                                        type="button"
                                        onClick={handleOpenRegisterParent}
                                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/95 transition-all shadow-2xs cursor-pointer"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        Register Parent Product
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleOpenRegisterChild}
                                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-background px-3.5 py-2 text-xs font-semibold text-primary hover:bg-primary/10 transition-all shadow-2xs cursor-pointer"
                                    >
                                        <Layers className="h-3.5 w-3.5" />
                                        Register Child Variant
                                    </button>
                                </div>
                            </div>
                        ) : (
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
                                                activeTab={activeTab}
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

                                        {(activeTab === "quality_importation" || activeTab === "qa_templates" || activeTab === "importation") && (
                                            <QualityImportationTab
                                                qaTemplates={qaTemplates}
                                                units={units}
                                                handleAddQATemplate={handleAddQATemplate}
                                                handleSaveQATemplate={handleSaveQATemplate}
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
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>

            {loadingBOM && (
                <div className="fixed inset-0 z-[95] bg-background/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-150">
                    <div className="bg-card border rounded-xl shadow-lg p-5 flex flex-col items-center gap-2 max-w-xs text-center border-primary/20">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <h4 className="text-xs font-bold text-foreground">Loading Version Recipe...</h4>
                        <p className="text-[10px] text-muted-foreground">Fetching bill of materials, routing sequences, and overhead variables from database.</p>
                    </div>
                </div>
            )}

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
                    <div className="bg-card border border-border/80 rounded-2xl shadow-2xl   overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
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
                                    placeholder="e.g. FG-OIL-500ML - v2.0"
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
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1 flex items-center justify-between">
                                        <span>Base UOM</span>
                                        <span className="text-[9px] text-muted-foreground font-semibold lowercase">(bound to product)</span>
                                    </label>
                                    <div className="w-full rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm text-muted-foreground font-semibold flex items-center justify-between cursor-not-allowed">
                                        <span>{selectedProduct?.baseUom || "PCS"}</span>
                                        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                    </div>
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
