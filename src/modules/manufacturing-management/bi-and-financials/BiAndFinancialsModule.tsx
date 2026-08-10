"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
    TrendingUp,
    Play,
    RefreshCw,
    BarChart3,
    Calculator,
    Layers
} from "lucide-react";
import { toast } from "sonner";
import { fetchProducts, fetchVersions, fetchBOMDetails } from "@/modules/manufacturing-management/finished-goods/services/finished-goods-api";
import {
    BOMItem,
    Product,
    InventoryData,
    SalesOrdersData,
    ProductFamily,
    ProductForecastingSummary
} from "./types";
import { FinancialOverviewTab } from "./components/FinancialOverviewTab";
import { CostingAnalyticsTab } from "./components/CostingAnalyticsTab";
import { MarginAnalysisTab } from "./components/MarginAnalysisTab";

const MONTHS_HISTORICAL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const MONTHS_FORECAST = ["Jul", "Aug", "Sep"];

const MOCK_RAW_MATERIAL_INVENTORY: Record<string, number> = {
    "refined palm oil": 12000,
    "refined coconut oil": 8000,
    "pet bottle 1l": 15000,
    "screw cap": 25000,
    "front label": 18000,
    "pet handle bottle 2l": 5000,
    "handle cap": 9000,
    "sleeve label": 12000,
    "canola crude oil": 4000,
    "glass bottle 500ml": 3000,
    "metal lug cap": 8000,
    "paper label": 10000,
};

const INITIAL_PRODUCTS: Product[] = [
    {
        id: "prod-1",
        sku: "BVO-1L-01",
        title: "1L Blended Vegetable Oil",
        baseUom: "L",
        expectedYieldPercent: 95.0,
        targetSellingPrice: 75.0,
        routingCost: 2.90,
        unitOfMeasurementCount: 1,
        currentInventory: 4200,
        parentProduct: true,
        parent_id: null,
        bom: [
            { id: "bom-1-1", name: "Refined Palm Oil", quantity: 0.65, uom: "L", wastagePercent: 2.0, landedCost: 58.20 },
            { id: "bom-1-2", name: "Refined Coconut Oil", quantity: 0.35, uom: "L", wastagePercent: 1.0, landedCost: 72.50 },
            { id: "bom-1-3", name: "PET Bottle 1L", quantity: 1.0, uom: "pc", wastagePercent: 1.0, landedCost: 3.80 },
            { id: "bom-1-4", name: "Screw Cap", quantity: 1.0, uom: "pc", wastagePercent: 0.0, landedCost: 0.45 },
            { id: "bom-1-5", name: "Front Label", quantity: 1.0, uom: "pc", wastagePercent: 3.0, landedCost: 0.85 }
        ]
    },
    {
        id: "prod-1-box",
        sku: "BVO-1L-BOX",
        title: "1L Blended Vegetable Oil Box x 12",
        baseUom: "BOX",
        expectedYieldPercent: 95.0,
        targetSellingPrice: 850.0,
        routingCost: 5.00,
        unitOfMeasurementCount: 12,
        currentInventory: 150,
        parentProduct: false,
        parent_id: "prod-1",
        bom: []
    },
    {
        id: "prod-2",
        sku: "RPO-2L-02",
        title: "2L Refined Palm Oil",
        baseUom: "L",
        expectedYieldPercent: 98.0,
        targetSellingPrice: 140.0,
        routingCost: 3.70,
        unitOfMeasurementCount: 1,
        currentInventory: 1800,
        parentProduct: true,
        parent_id: null,
        bom: [
            { id: "bom-2-1", name: "Refined Palm Oil", quantity: 2.02, uom: "L", wastagePercent: 1.5, landedCost: 58.20 },
            { id: "bom-2-2", name: "PET Handle Bottle 2L", quantity: 1.0, uom: "pc", wastagePercent: 1.0, landedCost: 6.20 },
            { id: "bom-2-3", name: "Handle Cap", quantity: 1.0, uom: "pc", wastagePercent: 0.0, landedCost: 0.80 },
            { id: "bom-2-4", name: "Sleeve Label", quantity: 1.0, uom: "pc", wastagePercent: 2.0, landedCost: 1.20 }
        ]
    },
    {
        id: "prod-3",
        sku: "RCO-500-03",
        title: "500ml Refined Canola Oil",
        baseUom: "L",
        expectedYieldPercent: 94.0,
        targetSellingPrice: 68.0,
        routingCost: 5.50,
        unitOfMeasurementCount: 1,
        currentInventory: 1800,
        parentProduct: true,
        parent_id: null,
        bom: [
            { id: "bom-3-1", name: "Canola Crude Oil", quantity: 0.51, uom: "L", wastagePercent: 2.5, landedCost: 78.40 },
            { id: "bom-3-2", name: "Glass Bottle 500ml", quantity: 1.0, uom: "pc", wastagePercent: 4.0, landedCost: 11.20 },
            { id: "bom-3-3", name: "Metal Lug Cap", quantity: 1.0, uom: "pc", wastagePercent: 1.0, landedCost: 1.60 },
            { id: "bom-3-4", name: "Paper Label", quantity: 1.0, uom: "pc", wastagePercent: 2.0, landedCost: 0.95 }
        ]
    }
];

const UOM_ORDERS: Record<string, number> = {
    "PCS": 1, "EAC": 1, "JAR": 1, "ml": 0, "L": 0, "g": 0, "pc": 1,
    "IB": 2, "BAG": 2, "PCK": 2, "TIE": 2, "CON": 2,
    "BOX": 3, "CSE": 3, "KG": 3
};

export default function BiAndFinancialsModule() {
    const [activeTab, setActiveTab] = useState<"overview" | "costing" | "margin">("overview");
    const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
    const [, setLoadingProducts] = useState<boolean>(true);
    const [selectedProductId, setSelectedProductId] = useState<string>("prod-1");
    const [searchTerm, setSearchTerm] = useState("");

    // DB Fetch States
    const [inventoryData, setInventoryData] = useState<InventoryData | null>(null);
    const [salesOrdersData, setSalesOrdersData] = useState<SalesOrdersData | null>(null);

    // Forecasting Controls
    const [forecastModel, setForecastModel] = useState<"sma" | "exponential" | "seasonal">("exponential");
    const [alpha, setAlpha] = useState<number>(0.3);
    const [demandMultiplier, setDemandMultiplier] = useState<number>(1.15);
    const [expandedProdId, setExpandedProdId] = useState<string | null>("prod-1");
    const [creatingJO, setCreatingJO] = useState(false);
    const [selectedVariantIdMap, setSelectedVariantIdMap] = useState<Record<string, string>>({});

    const handleSelectVariant = async (familyId: string, variantId: string) => {
        setSelectedVariantIdMap(prev => ({
            ...prev,
            [familyId]: variantId
        }));

        const currentProd = products.find(p => p.id === variantId);
        if (!currentProd || currentProd.id.startsWith("prod-") || (currentProd.bom && currentProd.bom.length > 0)) {
            return;
        }

        try {
            const versions = await fetchVersions(Number(variantId));
            if (!versions || versions.length === 0) return;
            const details = await fetchBOMDetails(Number(variantId), versions[0].version_id);
            if (details) {
                const ingredients = details.routes?.flatMap(r => r.bom_items || []) || [];
                const mappedBom: BOMItem[] = ingredients.map(ing => ({
                    id: String(ing.id),
                    name: ing.product_name || "Unknown",
                    quantity: ing.quantity_required,
                    uom: String(ing.unit_of_measurement),
                    wastagePercent: ing.wastage_factor_percentage,
                    landedCost: ing.cost_per_unit || 0
                }));
                setProducts(prev => prev.map(p => p.id === variantId ? {
                    ...p,
                    expectedYieldPercent: Number(details.expected_yield_percentage) || 100,
                    bom: mappedBom,
                    bomId: details.version_id,
                    versionId: details.version_id,
                    versionName: details.version_name
                } : p));
            }
        } catch (err) {
            console.error("Failed to load BOM for variant:", err);
        }
    };

    useEffect(() => {
        async function loadAllData() {
            setLoadingProducts(true);
            try {
                const [invRes, salesRes] = await Promise.all([
                    fetch("/api/manufacturing/inventory").then(r => r.ok ? r.json() : null),
                    fetch("/api/manufacturing/sales-invoice?limit=250").then(r => r.ok ? r.json() : null)
                ]);
                if (invRes) setInventoryData(invRes);
                if (salesRes) setSalesOrdersData(salesRes);
            } catch (err) {
                console.error("Failed to load backend inventory or sales invoices/returns:", err);
            }

            try {
                const dbProds = await fetchProducts("", 50);
                if (dbProds && dbProds.length > 0) {
                    const mapped = dbProds.map(p => ({
                        id: String(p.id),
                        sku: p.sku,
                        title: p.title,
                        baseUom: p.baseUom,
                        expectedYieldPercent: 100,
                        targetSellingPrice: p.targetSellingPrice || 80,
                        bom: [] as BOMItem[],
                        routingCost: 0,
                        has_versions: p.has_versions,
                        unitOfMeasurementCount: p.unit_of_measurement_count || 1,
                        currentInventory: Math.floor(500 + Math.random() * 4000),
                        parent_id: p.parent_id,
                        parentProduct: p.parentProduct
                    }));

                    const firstWithVersions = mapped.find(p => p.has_versions);
                    const listToSet = [...mapped, ...INITIAL_PRODUCTS];
                    setProducts(listToSet);

                    if (firstWithVersions) {
                        setSelectedProductId(firstWithVersions.id);
                        setExpandedProdId(firstWithVersions.id);

                        const versions = await fetchVersions(Number(firstWithVersions.id));
                        if (versions && versions.length > 0) {
                            const details = await fetchBOMDetails(Number(firstWithVersions.id), versions[0].version_id);
                            if (details) {
                                const ingredients = details.routes?.flatMap(r => r.bom_items || []) || [];
                                const mappedBom: BOMItem[] = ingredients.map(ing => ({
                                    id: String(ing.id),
                                    name: ing.product_name || "Unknown",
                                    quantity: ing.quantity_required,
                                    uom: String(ing.unit_of_measurement),
                                    wastagePercent: ing.wastage_factor_percentage,
                                    landedCost: ing.cost_per_unit || 0
                                }));
                                setProducts(prev => prev.map(p => p.id === firstWithVersions.id ? {
                                    ...p,
                                    expectedYieldPercent: Number(details.expected_yield_percentage) || 100,
                                    bom: mappedBom,
                                    bomId: details.version_id,
                                    versionId: details.version_id,
                                    versionName: details.version_name
                                } : p));
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Error loading products for forecasting:", err);
                toast.error("Could not fetch database products. Using sandbox mock products.");
            } finally {
                setLoadingProducts(false);
            }
        }
        loadAllData();
    }, []);

    useEffect(() => {
        if (!inventoryData || !inventoryData.ledger) return;

        const stockMap: Record<number, number> = {};
        inventoryData.ledger.forEach((entry) => {
            const pId = Number(entry.productId);
            const qty = Number(entry.quantity) || 0;
            stockMap[pId] = (stockMap[pId] || 0) + qty;
        });

        setProducts(prev => prev.map(p => {
            const dbId = Number(p.id);
            if (!isNaN(dbId) && stockMap[dbId] !== undefined) {
                return {
                    ...p,
                    currentInventory: stockMap[dbId]
                };
            }
            return p;
        }));
    }, [inventoryData]);

    const handleExpandRow = async (productId: string) => {
        if (expandedProdId === productId) {
            setExpandedProdId(null);
            return;
        }
        setExpandedProdId(productId);

        const currentProd = products.find(p => p.id === productId);
        if (!currentProd || currentProd.id.startsWith("prod-") || (currentProd.bom && currentProd.bom.length > 0)) {
            return;
        }

        try {
            const versions = await fetchVersions(Number(productId));
            if (!versions || versions.length === 0) return;
            const details = await fetchBOMDetails(Number(productId), versions[0].version_id);
            if (details) {
                const ingredients = details.routes?.flatMap(r => r.bom_items || []) || [];
                const mappedBom: BOMItem[] = ingredients.map(ing => ({
                    id: String(ing.id),
                    name: ing.product_name || "Unknown",
                    quantity: ing.quantity_required,
                    uom: String(ing.unit_of_measurement),
                    wastagePercent: ing.wastage_factor_percentage,
                    landedCost: ing.cost_per_unit || 0
                }));
                setProducts(prev => prev.map(p => p.id === productId ? {
                    ...p,
                    expectedYieldPercent: Number(details.expected_yield_percentage) || 100,
                    bom: mappedBom,
                    bomId: details.version_id,
                    versionId: details.version_id,
                    versionName: details.version_name
                } : p));
            }
        } catch (err) {
            console.error("Failed to load BOM for expansion:", err);
        }
    };

    const productFamilies = useMemo(() => {
        const groups: Record<string, Product[]> = {};

        products.forEach(p => {
            const fId = p.parent_id ? String(p.parent_id) : p.id;
            if (!groups[fId]) {
                groups[fId] = [];
            }
            groups[fId].push(p);
        });

        const list: ProductFamily[] = [];

        Object.keys(groups).forEach(fId => {
            const familyProducts = groups[fId];

            let parentProd = familyProducts.find(p => p.parent_id === null || p.parentProduct === true);
            if (!parentProd) {
                let minOrder = 999;
                familyProducts.forEach(p => {
                    const o = UOM_ORDERS[p.baseUom] !== undefined ? UOM_ORDERS[p.baseUom] : 1;
                    if (o < minOrder) {
                        minOrder = o;
                        parentProd = p;
                    }
                });
            }
            if (!parentProd) parentProd = familyProducts[0];

            let displayProd: Product | undefined;
            let maxOrder = -1;
            familyProducts.forEach(p => {
                const o = UOM_ORDERS[p.baseUom] !== undefined ? UOM_ORDERS[p.baseUom] : 1;
                if (o > maxOrder) {
                    maxOrder = o;
                    displayProd = p;
                }
            });

            const useDisplay = !!displayProd && maxOrder >= 2;
            const displayUom = (useDisplay && displayProd) ? displayProd.baseUom : parentProd.baseUom;
            const displayDivisor = (useDisplay && displayProd) ? (displayProd.unitOfMeasurementCount || 1) : 1;

            let totalBaseInventory = 0;
            familyProducts.forEach(p => {
                const count = p.unitOfMeasurementCount || 1;
                totalBaseInventory += p.currentInventory * count;
            });

            list.push({
                id: parentProd.id,
                sku: parentProd.sku,
                title: parentProd.title,
                baseUom: parentProd.baseUom,
                currentInventory: totalBaseInventory,
                targetSellingPrice: parentProd.targetSellingPrice,
                expectedYieldPercent: parentProd.expectedYieldPercent,
                bom: parentProd.bom || [],
                routingCost: parentProd.routingCost,
                has_versions: parentProd.has_versions,
                bomId: parentProd.bomId,
                versionId: parentProd.versionId,
                versionName: parentProd.versionName,
                displayUom,
                displayDivisor,
                children: familyProducts.filter(p => p.id !== parentProd!.id),
                parentProductObj: parentProd
            });
        });

        return list;
    }, [products]);

    const activeFamily = useMemo(() => {
        return productFamilies.find(f => f.id === selectedProductId) || productFamilies[0];
    }, [selectedProductId, productFamilies]);

    const actualHistoricalSales = useMemo(() => {
        if (!activeFamily) return null;
        if (!salesOrdersData || !salesOrdersData.data || !salesOrdersData.detailsMap) {
            return null;
        }

        const monthlyVolumes: Record<string, number> = {
            "Jan": 0, "Feb": 0, "Mar": 0, "Apr": 0, "May": 0, "Jun": 0
        };

        const familyProductCounts: Record<number, number> = {};

        const parentDbId = Number(activeFamily.parentProductObj.id);
        if (!isNaN(parentDbId)) {
            familyProductCounts[parentDbId] = activeFamily.parentProductObj.unitOfMeasurementCount || 1;
        }

        activeFamily.children.forEach(child => {
            const childDbId = Number(child.id);
            if (!isNaN(childDbId)) {
                familyProductCounts[childDbId] = child.unitOfMeasurementCount || 1;
            }
        });

        let totalQtyFoundInBase = 0;

        salesOrdersData.data.forEach((so) => {
            const dateStr = so.created_date || so.created_on || so.date;
            if (!dateStr) return;

            const date = new Date(dateStr);
            const monthIndex = date.getMonth();
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const monthName = monthNames[monthIndex];

            if (monthlyVolumes[monthName] !== undefined) {
                const details = salesOrdersData.detailsMap[Number(so.order_id)] || [];
                details.forEach((det) => {
                    const detProductId = typeof det.product_id === "object" && det.product_id !== null
                        ? Number(det.product_id.product_id)
                        : Number(det.product_id);

                    if (familyProductCounts[detProductId] !== undefined) {
                        const qty = Number(det.quantity) || 0;
                        const factor = familyProductCounts[detProductId];
                        const baseQty = qty * factor;
                        monthlyVolumes[monthName] += baseQty;
                        totalQtyFoundInBase += baseQty;
                    }
                });
            }
        });

        if (totalQtyFoundInBase === 0) return null;

        const divisor = activeFamily.displayDivisor;
        return MONTHS_HISTORICAL.map(month => ({
            month,
            sales: Number((monthlyVolumes[month] / divisor).toFixed(2)),
            type: "historical" as const
        }));
    }, [salesOrdersData, activeFamily]);

    const historicalSalesData = useMemo(() => {
        if (!activeFamily) return [];
        if (actualHistoricalSales) {
            return actualHistoricalSales;
        }

        const seedValue = activeFamily.sku.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const baseSales = 2000 + (seedValue % 6) * 1200;
        const divisor = activeFamily.displayDivisor;

        return MONTHS_HISTORICAL.map((month, idx) => {
            const variance = Math.sin(idx + seedValue) * 400;
            const trend = idx * 180;
            const actualSalesInBase = Math.max(1200, Math.floor(baseSales + trend + variance));
            return {
                month,
                sales: Number((actualSalesInBase / divisor).toFixed(2)),
                type: "historical" as const
            };
        });
    }, [activeFamily, actualHistoricalSales]);

    const forecastedSalesData = useMemo(() => {
        const history = historicalSalesData.map(h => h.sales);
        const predictions: number[] = [];

        if (forecastModel === "sma") {
            const tempHistory = [...history];
            for (let i = 0; i < 3; i++) {
                const avg = tempHistory.slice(-3).reduce((sum, val) => sum + val, 0) / 3;
                predictions.push(avg);
                tempHistory.push(avg);
            }
        } else if (forecastModel === "exponential") {
            let currentForecast = history[0];
            for (let i = 1; i < history.length; i++) {
                currentForecast = alpha * history[i] + (1 - alpha) * currentForecast;
            }
            predictions.push(currentForecast);
            predictions.push(currentForecast * 1.02);
            predictions.push(currentForecast * 1.04);
        } else {
            const averageBase = history.reduce((s, v) => s + v, 0) / history.length;
            const seasonalFactors = [0.92, 0.96, 1.12];
            predictions.push(averageBase * seasonalFactors[0]);
            predictions.push(averageBase * seasonalFactors[1]);
            predictions.push(averageBase * seasonalFactors[2]);
        }

        return MONTHS_FORECAST.map((month, idx) => ({
            month,
            sales: Number((predictions[idx] * demandMultiplier).toFixed(2)),
            type: "forecast" as const
        }));
    }, [historicalSalesData, forecastModel, alpha, demandMultiplier]);

    const chartData = useMemo(() => {
        const formattedHistory = historicalSalesData.map(d => ({
            month: d.month,
            "Historical Sales": d.sales,
            "Projected Demand": null
        }));

        const lastHistoricalVal = historicalSalesData[historicalSalesData.length - 1]?.sales || 0;

        const formattedForecast = [
            {
                month: historicalSalesData[historicalSalesData.length - 1]?.month || "",
                "Historical Sales": null,
                "Projected Demand": lastHistoricalVal
            },
            ...forecastedSalesData.map(d => ({
                month: d.month,
                "Historical Sales": null,
                "Projected Demand": d.sales
            }))
        ];

        return [...formattedHistory, ...formattedForecast.slice(1)];
    }, [historicalSalesData, forecastedSalesData]);

    const next30DaysForecastVolume = useMemo(() => {
        return forecastedSalesData[0]?.sales || 0;
    }, [forecastedSalesData]);

    const next90DaysForecastVolume = useMemo(() => {
        return forecastedSalesData.reduce((sum, d) => sum + d.sales, 0);
    }, [forecastedSalesData]);

    const rawMaterialStockMap = useMemo(() => {
        const map: Record<string, number> = {};
        if (!inventoryData || !inventoryData.ledger || !inventoryData.products) return map;

        const stockMap: Record<number, number> = {};
        inventoryData.ledger.forEach((entry) => {
            const pId = Number(entry.productId);
            const qty = Number(entry.quantity) || 0;
            stockMap[pId] = (stockMap[pId] || 0) + qty;
        });

        inventoryData.products.forEach((prod) => {
            const pId = Number(prod.product_id);
            const stockQty = stockMap[pId] || 0;
            if (prod.product_name) {
                map[prod.product_name.toLowerCase().trim()] = stockQty;
            }
        });

        return map;
    }, [inventoryData]);

    const productActualJunSales = useMemo(() => {
        const map: Record<string, number> = {};
        if (!salesOrdersData || !salesOrdersData.data || !salesOrdersData.detailsMap) {
            return map;
        }

        salesOrdersData.data.forEach((so) => {
            const dateStr = so.created_date || so.created_on || so.date;
            if (!dateStr) return;

            const date = new Date(dateStr);
            const monthIndex = date.getMonth();

            if (monthIndex === 5) {
                const details = salesOrdersData.detailsMap[Number(so.order_id)] || [];
                details.forEach((det) => {
                    const pId = typeof det.product_id === "object" && det.product_id !== null
                        ? String(det.product_id.product_id)
                        : String(det.product_id);
                    const qty = Number(det.quantity) || 0;
                    map[pId] = (map[pId] || 0) + qty;
                });
            }
        });
        return map;
    }, [salesOrdersData]);

    const productForecastingSummary = useMemo<ProductForecastingSummary[]>(() => {
        return productFamilies.map(fam => {
            const selectedVariantId = selectedVariantIdMap[fam.id] || fam.parentProductObj.id;

            let selectedProd: Product = fam.parentProductObj;
            if (selectedVariantId !== fam.parentProductObj.id) {
                const child = fam.children.find(c => c.id === selectedVariantId);
                if (child) {
                    selectedProd = child;
                }
            }

            let activeBom: BOMItem[] = selectedProd.bom || [];
            let activeVersionName = selectedProd.versionName || "V1";

            if (activeBom.length === 0 && selectedProd.id !== fam.parentProductObj.id && fam.parentProductObj.bom && fam.parentProductObj.bom.length > 0) {
                const multiplier = selectedProd.unitOfMeasurementCount || 1;
                activeBom = fam.parentProductObj.bom.map(ing => ({
                    ...ing,
                    quantity: ing.quantity * multiplier
                }));
                activeVersionName = `${fam.parentProductObj.versionName || "V1"} (Auto-scaled x${multiplier})`;
            }

            let familyJunSalesInBase = 0;
            const parentJunSales = productActualJunSales[fam.parentProductObj.id] || 0;
            familyJunSalesInBase += parentJunSales * (fam.parentProductObj.unitOfMeasurementCount || 1);

            fam.children.forEach(child => {
                const childJunSales = productActualJunSales[child.id] || 0;
                familyJunSalesInBase += childJunSales * (child.unitOfMeasurementCount || 1);
            });

            let baseline30DayInBase = 0;
            if (familyJunSalesInBase > 0) {
                baseline30DayInBase = Math.round(familyJunSalesInBase * demandMultiplier);
            } else {
                const seedValue = fam.sku.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
                const baseSales = 2000 + (seedValue % 6) * 1200;
                const lastVal = baseSales + 900;
                baseline30DayInBase = Math.round(lastVal * demandMultiplier);
            }

            const forecastedDemand30dDisplay = Number((baseline30DayInBase / fam.displayDivisor).toFixed(2));
            const netDeficitInBase = Math.max(0, baseline30DayInBase - fam.currentInventory);
            const netDeficitDisplay = Number((netDeficitInBase / fam.displayDivisor).toFixed(2));

            const variantCountMultiplier = selectedProd.unitOfMeasurementCount || 1;
            const netDeficitInVariant = netDeficitInBase / variantCountMultiplier;

            const ingredientsRequirements = activeBom.map(ing => {
                const wastageFactor = 1 - (ing.wastagePercent / 100);
                const reqQty = (netDeficitInVariant * ing.quantity) / (wastageFactor > 0 ? wastageFactor : 1);

                const rawName = ing.name.toLowerCase().trim();
                let currentStock = 5000;

                const dbStockKey = Object.keys(rawMaterialStockMap).find(k => rawName.includes(k) || k.includes(rawName));
                if (dbStockKey !== undefined) {
                    currentStock = rawMaterialStockMap[dbStockKey];
                } else {
                    const matchedStockKey = Object.keys(MOCK_RAW_MATERIAL_INVENTORY).find(k => rawName.includes(k));
                    if (matchedStockKey) {
                        currentStock = MOCK_RAW_MATERIAL_INVENTORY[matchedStockKey];
                    }
                }
                const safetyStock = reqQty * 0.4;
                const isShortage = currentStock < reqQty;

                return {
                    name: ing.name,
                    required: reqQty,
                    stock: currentStock,
                    safetyStock,
                    isShortage,
                    uom: ing.uom
                };
            });

            const hasMaterialShortage = ingredientsRequirements.some(ing => ing.isShortage);

            return {
                id: fam.id,
                sku: fam.sku,
                title: fam.title,
                baseUom: fam.baseUom,
                displayUom: fam.displayUom,
                displayDivisor: fam.displayDivisor,
                currentInventoryDisplay: Number((fam.currentInventory / fam.displayDivisor).toFixed(2)),
                forecastedDemand30d: forecastedDemand30dDisplay,
                netDeficit: netDeficitDisplay,
                ingredientsRequirements,
                hasMaterialShortage,
                children: fam.children,
                parentProductObj: fam.parentProductObj,
                selectedVariantId,
                selectedVariantTitle: selectedProd.title,
                selectedVariantUom: selectedProd.baseUom,
                netDeficitInVariant,
                bom: activeBom,
                versionName: activeVersionName
            };
        });
    }, [productFamilies, selectedVariantIdMap, demandMultiplier, rawMaterialStockMap, productActualJunSales]);

    const filteredSummary = useMemo(() => {
        if (!searchTerm.trim()) return productForecastingSummary;
        const term = searchTerm.toLowerCase();
        return productForecastingSummary.filter(p =>
            p.title.toLowerCase().includes(term) ||
            p.sku.toLowerCase().includes(term)
        );
    }, [productForecastingSummary, searchTerm]);

    const productsWithShortages = useMemo(() => {
        return productForecastingSummary.filter(p => p.hasMaterialShortage).length;
    }, [productForecastingSummary]);

    const handleGenerateProductionJOs = () => {
        setCreatingJO(true);
        setTimeout(() => {
            const createdRefIds: string[] = [];
            let joCreatedCount = 0;

            productForecastingSummary.forEach(p => {
                if (p.netDeficit > 0) {
                    const joRef = `JO-FORECAST-${Math.floor(1000 + Math.random() * 9000)}`;
                    createdRefIds.push(`${joRef} for ${p.title} (${p.netDeficit} ${p.baseUom})`);
                    joCreatedCount++;
                }
            });

            if (joCreatedCount > 0) {
                toast.success(`Successfully dispatched ${joCreatedCount} Forecast Job Orders!`);
                createdRefIds.forEach(ref => {
                    toast.info(`Created: ${ref}`, { duration: 6000 });
                });
            } else {
                toast.warning("All inventory levels are fully sufficient to meet forecasted demand. No Job Orders needed.");
            }
            setCreatingJO(false);
        }, 1500);
    };

    const isUsingSimulatedData = actualHistoricalSales === null;
    const isUsingMockProducts = products.length === 0 || products.every(p => p.id.startsWith("prod-"));

    return (
        <div className="flex flex-col gap-6 max-w-6xl mx-auto p-4 sm:p-6 bg-background rounded-xl border">
            {/* Header section */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b pb-4 gap-4">
                <div>
                    <h1 className="text-xl font-bold flex items-center gap-2">
                        <TrendingUp className="h-5.5 w-5.5 text-primary" />
                        Sales Forecasting &amp; Demand Planner
                    </h1>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Aggregate historical sales, configure statistical smoothing algorithms, and explode demand forecasts into raw materials requirements.
                    </p>
                </div>
                <div className="flex items-center gap-2.5">
                    <button
                        type="button"
                        onClick={handleGenerateProductionJOs}
                        disabled={creatingJO}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-primary hover:bg-primary/95 text-xs font-bold text-primary-foreground shadow-xs transition-all cursor-pointer disabled:opacity-50"
                    >
                        {creatingJO ? (
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <Play className="h-3.5 w-3.5 fill-current" />
                        )}
                        Dispatch Production Forecast JOs
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex items-center gap-2 border-b pb-2">
                <button
                    type="button"
                    onClick={() => setActiveTab("overview")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeTab === "overview"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "hover:bg-muted text-muted-foreground"
                    }`}
                >
                    <BarChart3 className="h-4 w-4" />
                    Financial Overview &amp; Chart
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("costing")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeTab === "costing"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "hover:bg-muted text-muted-foreground"
                    }`}
                >
                    <Calculator className="h-4 w-4" />
                    Costing &amp; Model Configuration
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("margin")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        activeTab === "margin"
                            ? "bg-primary text-primary-foreground shadow-xs"
                            : "hover:bg-muted text-muted-foreground"
                    }`}
                >
                    <Layers className="h-4 w-4" />
                    SKU &amp; Material Explosion
                </button>
            </div>

            {/* Tab Contents */}
            {activeTab === "overview" && (
                <FinancialOverviewTab
                    isUsingMockProducts={isUsingMockProducts}
                    isUsingSimulatedData={isUsingSimulatedData}
                    activeFamily={activeFamily}
                    next30DaysForecastVolume={next30DaysForecastVolume}
                    next90DaysForecastVolume={next90DaysForecastVolume}
                    productsWithShortages={productsWithShortages}
                    forecastModel={forecastModel}
                    chartData={chartData}
                />
            )}

            {activeTab === "costing" && (
                <CostingAnalyticsTab
                    forecastModel={forecastModel}
                    setForecastModel={setForecastModel}
                    alpha={alpha}
                    setAlpha={setAlpha}
                    demandMultiplier={demandMultiplier}
                    setDemandMultiplier={setDemandMultiplier}
                    activeFamily={activeFamily}
                />
            )}

            {activeTab === "margin" && (
                <MarginAnalysisTab
                    searchTerm={searchTerm}
                    setSearchTerm={setSearchTerm}
                    filteredSummary={filteredSummary}
                    expandedProdId={expandedProdId}
                    handleExpandRow={handleExpandRow}
                    selectedProductId={selectedProductId}
                    setSelectedProductId={setSelectedProductId}
                    handleSelectVariant={handleSelectVariant}
                />
            )}
        </div>
    );
}
