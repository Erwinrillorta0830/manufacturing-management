"use client";

import React, { useState, useMemo, useEffect } from "react";
import { 
    TrendingUp, 
    Layers, 
    AlertTriangle, 
    CheckCircle, 
    Play, 
    Calendar, 
    Settings, 
    Search,
    RefreshCw,
    ShoppingBag
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { 
    ResponsiveContainer, 
    Area, 
    Line, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    Legend, 
    ComposedChart
} from "recharts";
import { fetchProducts, fetchVersions, fetchBOMDetails } from "@/modules/manufacturing-management/finished-goods/services/finished-goods-api";

interface BOMItem {
    id: string;
    productId?: number;
    name: string;
    quantity: number;
    uom: string;
    wastagePercent: number;
    landedCost: number;
}

interface Product {
    id: string;
    sku: string;
    title: string;
    baseUom: string;
    expectedYieldPercent: number;
    targetSellingPrice: number;
    bom: BOMItem[];
    routingCost: number;
    has_versions?: boolean;
    unitOfMeasurementCount?: number;
    bomId?: number;
    versionId?: number;
    versionName?: string;
    currentInventory: number;
    parent_id?: string | number | null;
    parentProduct?: boolean;
}

// 6 Months Historical + 3 Months Forecast months labels
const MONTHS_HISTORICAL = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const MONTHS_FORECAST = ["Jul", "Aug", "Sep"];

// Mock static inventory levels for raw ingredients
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

// Standard initial mock products
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

interface InventoryData {
    ledger: {
        id: number;
        productId: string | number;
        quantity: number | string;
        branchId?: string | number;
    }[];
    products: {
        product_id: string | number;
        product_name: string;
        product_code: string;
    }[];
}

interface SalesOrderDetail {
    product_id: string | number | { product_id: string | number; product_name: string };
    quantity: number | string;
    order_id: string | number;
}

interface SalesOrder {
    order_id: string | number;
    created_date?: string;
    created_on?: string;
    date?: string;
}

interface SalesOrdersData {
    data: SalesOrder[];
    detailsMap: Record<number, SalesOrderDetail[]>;
}

interface ProductFamily {
    id: string;
    sku: string;
    title: string;
    baseUom: string;
    currentInventory: number;
    targetSellingPrice: number;
    expectedYieldPercent: number;
    bom: BOMItem[];
    routingCost: number;
    has_versions?: boolean;
    bomId?: number;
    versionId?: number;
    versionName?: string;
    displayUom: string;
    displayDivisor: number;
    children: Product[];
    parentProductObj: Product;
}

const UOM_ORDERS: Record<string, number> = {
    "PCS": 1, "EAC": 1, "JAR": 1, "ml": 0, "L": 0, "g": 0, "pc": 1,
    "IB": 2, "BAG": 2, "PCK": 2, "TIE": 2, "CON": 2,
    "BOX": 3, "CSE": 3, "KG": 3
};

export default function BiAndFinancialsModule() {
    const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
    const [, setLoadingProducts] = useState<boolean>(true);
    const [selectedProductId, setSelectedProductId] = useState<string>("prod-1");
    const [searchTerm, setSearchTerm] = useState("");

    // DB Fetch States
    const [inventoryData, setInventoryData] = useState<InventoryData | null>(null);
    const [salesOrdersData, setSalesOrdersData] = useState<SalesOrdersData | null>(null);

    // Forecasting Controls
    const [forecastModel, setForecastModel] = useState<"sma" | "exponential" | "seasonal">("exponential");
    const [alpha, setAlpha] = useState<number>(0.3); // Exponential smoothing weight
    const [demandMultiplier, setDemandMultiplier] = useState<number>(1.15); // +15% demand surge
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

    // Load DB products and their active BOMs, inventory, and sales orders on mount
    useEffect(() => {
        async function loadAllData() {
            setLoadingProducts(true);
            try {
                // Fetch inventory and sales invoices concurrently
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
                        currentInventory: Math.floor(500 + Math.random() * 4000), // simulated stock
                        parent_id: p.parent_id,
                        parentProduct: p.parentProduct
                    }));

                    // Fetch BOM recipe for the first database product with versions to initialize cache
                    const firstWithVersions = mapped.find(p => p.has_versions);
                    const listToSet = [...mapped, ...INITIAL_PRODUCTS];
                    setProducts(listToSet);
                    
                    if (firstWithVersions) {
                        setSelectedProductId(firstWithVersions.id);
                        setExpandedProdId(firstWithVersions.id);
                        
                        // Async load BOM details for this active product
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

    // Sync actual inventory ledger when inventoryData is fetched
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

    // Lazy load BOM details for expanded product row
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

    // Compute actual historical sales for the active product family from salesOrdersData
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
            const monthIndex = date.getMonth(); // 0-11
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

    // Generate stable, consistent historical sales data based on SKU / product characteristics (with dynamic actual fallback)
    const historicalSalesData = useMemo(() => {
        if (!activeFamily) return [];
        if (actualHistoricalSales) {
            return actualHistoricalSales;
        }

        const seedValue = activeFamily.sku.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0);
        const baseSales = 2000 + (seedValue % 6) * 1200; // between 2000 and 9200 base sales
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

    // Calculate predictions for the next 3 months based on selected model
    const forecastedSalesData = useMemo(() => {
        const history = historicalSalesData.map(h => h.sales);
        const predictions: number[] = [];

        if (forecastModel === "sma") {
            // Simple Moving Average (Average of last 3 periods)
            const tempHistory = [...history];
            for (let i = 0; i < 3; i++) {
                const avg = tempHistory.slice(-3).reduce((sum, val) => sum + val, 0) / 3;
                predictions.push(avg);
                tempHistory.push(avg);
            }
        } else if (forecastModel === "exponential") {
            // Exponential Smoothing: F_(t+1) = a * Y_t + (1 - a) * F_t
            let currentForecast = history[0];
            for (let i = 1; i < history.length; i++) {
                currentForecast = alpha * history[i] + (1 - alpha) * currentForecast;
            }
            // Extrapolate the last forecast forward
            predictions.push(currentForecast);
            predictions.push(currentForecast * 1.02); // assuming tiny growth
            predictions.push(currentForecast * 1.04);
        } else {
            // Seasonal Index projection
            const averageBase = history.reduce((s, v) => s + v, 0) / history.length;
            const seasonalFactors = [0.92, 0.96, 1.12]; // Jul, Aug, Sep indexes
            predictions.push(averageBase * seasonalFactors[0]);
            predictions.push(averageBase * seasonalFactors[1]);
            predictions.push(averageBase * seasonalFactors[2]);
        }

        // Apply demand multiplier
        return MONTHS_FORECAST.map((month, idx) => ({
            month,
            sales: Number((predictions[idx] * demandMultiplier).toFixed(2)),
            type: "forecast" as const
        }));
    }, [historicalSalesData, forecastModel, alpha, demandMultiplier]);

    // Combine historical and forecasted data for Recharts
    const chartData = useMemo(() => {
        const formattedHistory = historicalSalesData.map(d => ({
            month: d.month,
            "Historical Sales": d.sales,
            "Projected Demand": null
        }));

        const lastHistoricalVal = historicalSalesData[historicalSalesData.length - 1].sales;

        // Connect the projection line to the last historical point smoothly
        const formattedForecast = [
            {
                month: historicalSalesData[historicalSalesData.length - 1].month,
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
        return forecastedSalesData[0].sales;
    }, [forecastedSalesData]);

    const next90DaysForecastVolume = useMemo(() => {
        return forecastedSalesData.reduce((sum, d) => sum + d.sales, 0);
    }, [forecastedSalesData]);

    const rawMaterialStockMap = useMemo(() => {
        const map: Record<string, number> = {};
        if (!inventoryData || !inventoryData.ledger || !inventoryData.products) return map;

        // Group ledger by productId
        const stockMap: Record<number, number> = {};
        inventoryData.ledger.forEach((entry) => {
            const pId = Number(entry.productId);
            const qty = Number(entry.quantity) || 0;
            stockMap[pId] = (stockMap[pId] || 0) + qty;
        });

        // Map product name (lowercased) to its aggregated stock quantity
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
            const monthIndex = date.getMonth(); // 0-11
            
            // Jun is month index 5
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

    // Compute materials explosions and deficit levels for ALL families (with real inventory and sales forecasting)
    const productForecastingSummary = useMemo(() => {
        return productFamilies.map(fam => {
            const selectedVariantId = selectedVariantIdMap[fam.id] || fam.parentProductObj.id;
            
            // Find selected product in the family
            let selectedProd: Product = fam.parentProductObj;
            if (selectedVariantId !== fam.parentProductObj.id) {
                const child = fam.children.find(c => c.id === selectedVariantId);
                if (child) {
                    selectedProd = child;
                }
            }

            // Determine the BOM to explode
            let activeBom: BOMItem[] = selectedProd.bom || [];
            let activeVersionName = selectedProd.versionName || "V1";

            // If selected variant has no BOM, but has parent and parent has BOM, derive/scale it
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

            // Deficit in terms of the selected variant UOM
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

    // Filter summary list based on search term
    const filteredSummary = useMemo(() => {
        if (!searchTerm.trim()) return productForecastingSummary;
        const term = searchTerm.toLowerCase();
        return productForecastingSummary.filter(p => 
            p.title.toLowerCase().includes(term) || 
            p.sku.toLowerCase().includes(term)
        );
    }, [productForecastingSummary, searchTerm]);

    // Total counts
    const productsWithShortages = useMemo(() => {
        return productForecastingSummary.filter(p => p.hasMaterialShortage).length;
    }, [productForecastingSummary]);

    // Bulk creation of Job Orders for forecasted deficit
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
                        Sales Forecasting & Demand Planner
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

            {/* Data Source Alerts */}
            {(isUsingMockProducts || isUsingSimulatedData) && (
                <div className="flex flex-col gap-2">
                    {isUsingMockProducts && (
                        <div className="flex items-center gap-2 p-3 bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 rounded-lg text-xs font-semibold">
                            <AlertTriangle className="h-4 w-4 text-rose-500 shrink-0" />
                            <div>
                                No products found in the database. Showing sandbox mock products for demonstration.
                            </div>
                        </div>
                    )}
                    {!isUsingMockProducts && isUsingSimulatedData && (
                        <div className="flex items-center gap-2 p-3 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 rounded-lg text-xs font-semibold">
                            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                            <div>
                                No transaction history (sales invoices or returns) found in the database. Displaying simulated forecasting data.
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Metrics Dashboard */}
            <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                <div className="rounded-xl border bg-muted/10 p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active Family Selected</span>
                        <ShoppingBag className="h-4 w-4 text-primary" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-extrabold text-foreground truncate">{activeFamily?.title}</p>
                        <p className="text-[10px] text-muted-foreground">SKU: {activeFamily?.sku}</p>
                    </div>
                </div>

                <div className="rounded-xl border bg-muted/10 p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Forecast 30-Day Demand</span>
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-lg font-extrabold text-foreground">
                            {next30DaysForecastVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {activeFamily?.displayUom}
                        </p>
                        <p className="text-[10px] text-emerald-600 font-semibold">
                            Projected revenue: ₱{(next30DaysForecastVolume * (activeFamily?.targetSellingPrice || 0) * (activeFamily?.displayDivisor || 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                    </div>
                </div>

                <div className="rounded-xl border bg-muted/10 p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">90-Day Accumulation</span>
                        <Calendar className="h-4 w-4 text-violet-500" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-lg font-extrabold text-foreground">
                            {next90DaysForecastVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {activeFamily?.displayUom}
                        </p>
                        <p className="text-[10px] text-muted-foreground">July to September Projection</p>
                    </div>
                </div>

                <div className="rounded-xl border bg-muted/10 p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Supply Alerts</span>
                        {productsWithShortages > 0 ? (
                            <AlertTriangle className="h-4 w-4 text-amber-500 animate-pulse" />
                        ) : (
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                        )}
                    </div>
                    <div className="space-y-1">
                        <p className={`text-lg font-extrabold ${productsWithShortages > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                            {productsWithShortages} Family Shortage
                        </p>
                        <p className="text-[10px] text-muted-foreground">Requires raw material POs</p>
                    </div>
                </div>
            </div>

            {/* Chart Grid & Settings */}
            <div className="grid gap-6 md:grid-cols-3">
                {/* Visual Chart */}
                <div className="md:col-span-2 border rounded-xl p-4 sm:p-5 bg-background space-y-4">
                    <div className="flex items-center justify-between border-b pb-3">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
                                <TrendingUp className="h-4.5 w-4.5 text-primary" />
                                Trendline Forecast Analysis (in {activeFamily?.displayUom})
                            </h3>
                            {isUsingSimulatedData ? (
                                <span className="text-[9px] font-extrabold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                                    Simulated
                                </span>
                            ) : (
                                <span className="text-[9px] font-extrabold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                    Live DB Data
                                </span>
                            )}
                        </div>
                        <div className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                            Model: {forecastModel.toUpperCase()}
                        </div>
                    </div>

                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted)/0.3)" />
                                <XAxis 
                                    dataKey="month" 
                                    stroke="hsl(var(--muted-foreground))" 
                                    fontSize={11} 
                                    tickLine={false} 
                                />
                                <YAxis 
                                    stroke="hsl(var(--muted-foreground))" 
                                    fontSize={11} 
                                    tickLine={false} 
                                    axisLine={false} 
                                    tickFormatter={(val) => val.toLocaleString()}
                                />
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: "hsl(var(--popover))", 
                                        borderColor: "hsl(var(--border))",
                                        color: "hsl(var(--popover-foreground))",
                                        borderRadius: "8px",
                                        fontSize: "12px",
                                        boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)"
                                    }}
                                    itemStyle={{ color: "hsl(var(--popover-foreground))" }}
                                    labelStyle={{ color: "hsl(var(--popover-foreground))", fontWeight: 600, marginBottom: "4px" }}
                                />
                                <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "10px" }} />
                                <defs>
                                    <linearGradient id="historyColor" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.25}/>
                                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.0}/>
                                    </linearGradient>
                                </defs>
                                <Area 
                                    type="monotone" 
                                    dataKey="Historical Sales" 
                                    stroke="hsl(var(--primary))" 
                                    strokeWidth={2.5}
                                    fillOpacity={1} 
                                    fill="url(#historyColor)" 
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="Projected Demand" 
                                    stroke="hsl(var(--emerald-500)/0.8)" 
                                    strokeDasharray="4 4"
                                    strokeWidth={2.5} 
                                    dot={{ stroke: "hsl(var(--emerald-500))", strokeWidth: 2, r: 4 }}
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Settings Panel */}
                <div className="border rounded-xl p-4 sm:p-5 bg-background space-y-5">
                    <h3 className="text-sm font-bold tracking-tight flex items-center gap-1.5 border-b pb-3">
                        <Settings className="h-4.5 w-4.5 text-primary" />
                        Forecasting Model Configuration
                    </h3>

                    {/* Choose forecasting algorithm */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-muted-foreground">Select Mathematical Model</label>
                        <div className="grid grid-cols-1 gap-2.5">
                            {[
                                { id: "exponential", label: "Exponential Smoothing", desc: "Weighted smoothing average favoring recent data." },
                                { id: "sma", label: "Simple Moving Average", desc: "Averages last 3 months to project trend." },
                                { id: "seasonal", label: "Seasonal Index Projection", desc: "Averages values with fixed seasonal indices." }
                            ].map(model => (
                                <button
                                    key={model.id}
                                    type="button"
                                    onClick={() => setForecastModel(model.id as "exponential" | "sma" | "seasonal")}
                                    className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all cursor-pointer ${
                                        forecastModel === model.id 
                                            ? "border-primary bg-primary/5 font-semibold text-primary" 
                                            : "hover:bg-muted/30 border-muted"
                                    }`}
                                >
                                    <span className="block font-bold">{model.label}</span>
                                    <span className="block text-[10px] text-muted-foreground mt-0.5 leading-normal">{model.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Exponential Smoothing Weight */}
                    {forecastModel === "exponential" && (
                        <div className="space-y-2 pt-2 border-t">
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold text-muted-foreground">Alpha Smoothing Parameter</span>
                                <span className="font-extrabold text-primary">{alpha.toFixed(2)}</span>
                            </div>
                            <input 
                                type="range"
                                min="0.05"
                                max="0.95"
                                step="0.05"
                                value={alpha}
                                onChange={e => setAlpha(parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <div className="flex justify-between text-[9px] text-muted-foreground">
                                <span>Smooth (0.05)</span>
                                <span>Responsive (0.95)</span>
                            </div>
                        </div>
                    )}

                    {/* Simulated demand surge */}
                    <div className="space-y-2 pt-2 border-t">
                        <div className="flex justify-between items-center text-xs">
                            <span className="font-semibold text-muted-foreground">What-If Sales Growth Multiplier</span>
                            <span className="font-extrabold text-emerald-600">
                                {demandMultiplier === 1.0 ? "Baseline (1.0x)" : `${demandMultiplier > 1 ? "+" : ""}${((demandMultiplier - 1) * 100).toFixed(0)}%`}
                            </span>
                        </div>
                        <input 
                            type="range"
                            min="0.70"
                            max="2.00"
                            step="0.05"
                            value={demandMultiplier}
                            onChange={e => setDemandMultiplier(parseFloat(e.target.value))}
                            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-emerald-500"
                        />
                        <div className="flex justify-between text-[9px] text-muted-foreground">
                            <span>-30% Downturn</span>
                            <span>+100% Sales Peak</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Product Demand Explorer & Material Requirements Explosion */}
            <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h3 className="text-sm font-bold tracking-tight flex items-center gap-1.5">
                        <Layers className="h-4.5 w-4.5 text-primary" />
                        SKU Inventory & Predicted Material Deficit (30 Days Forecast)
                    </h3>
                    <div className="relative w-full sm:w-60">
                        <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Filter product SKU..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full rounded border pl-8 pr-2.5 py-1 text-xs outline-hidden focus:ring-1 focus:ring-primary bg-background"
                        />
                    </div>
                </div>

                <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-muted/40 border-b font-semibold text-muted-foreground">
                                <th className="p-3">SKU / Product</th>
                                <th className="p-3 text-center">Current Inventory</th>
                                <th className="p-3 text-center">Predicted 30d Sales</th>
                                <th className="p-3 text-center">Net Deficit</th>
                                <th className="p-3 text-center">Supply Status</th>
                                <th className="p-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredSummary.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                                        No products match the SKU filter.
                                    </td>
                                </tr>
                            ) : (
                                filteredSummary.map(prod => {
                                    const isExpanded = expandedProdId === prod.id;
                                    const hasDeficit = prod.netDeficit > 0;
                                    return (
                                        <React.Fragment key={prod.id}>
                                            <tr className={`border-b hover:bg-muted/5 transition-colors cursor-pointer ${isExpanded ? "bg-muted/20" : ""}`} onClick={() => handleExpandRow(prod.id)}>
                                                <td className="p-3 font-semibold">
                                                    <div>
                                                        <span className="block">{prod.title}</span>
                                                        <span className="block text-[10px] text-muted-foreground font-normal">{prod.sku} (Display: {prod.displayUom})</span>
                                                    </div>
                                                </td>
                                                <td className="p-3 text-center font-medium">
                                                    {prod.currentInventoryDisplay.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {prod.displayUom}
                                                </td>
                                                <td className="p-3 text-center font-bold text-primary">
                                                    {prod.forecastedDemand30d.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {prod.displayUom}
                                                </td>
                                                <td className="p-3 text-center font-extrabold text-foreground">
                                                    {prod.netDeficit > 0 ? (
                                                        <span className="text-amber-600">
                                                            -{prod.netDeficit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {prod.displayUom}
                                                        </span>
                                                    ) : (
                                                        <span className="text-emerald-600">Sufficient</span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-center">
                                                    {prod.hasMaterialShortage ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                                            <AlertTriangle className="h-3 w-3" />
                                                            Material Shortage
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                                            <CheckCircle className="h-3 w-3" />
                                                            Ready to Schedule
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedProductId(prod.id)}
                                                            className={`px-2.5 py-1 rounded border text-[10px] font-bold cursor-pointer transition-all ${
                                                                selectedProductId === prod.id
                                                                    ? "bg-primary text-primary-foreground border-primary"
                                                                    : "hover:bg-muted border-muted"
                                                            }`}
                                                        >
                                                            Plot Chart
                                                        </button>
                                                        {hasDeficit && (
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    toast.success(`Dispatched Forecast JO for ${prod.title}: ${prod.netDeficit} ${prod.displayUom}`);
                                                                }}
                                                                className="px-2.5 py-1 rounded bg-primary/10 hover:bg-primary/15 text-primary text-[10px] font-bold cursor-pointer transition-all border border-primary/20"
                                                            >
                                                                Schedule JO
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                            
                                            {/* Expandable row: BOM Requirements Explosion & Breakdown */}
                                            <AnimatePresence initial={false}>
                                                {isExpanded && (
                                                    <tr>
                                                        <td colSpan={6} className="bg-muted/10 p-4 border-b">
                                                            <motion.div
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: "auto", opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                                transition={{ duration: 0.2 }}
                                                                className="overflow-hidden"
                                                            >
                                                                <div className="space-y-4 pl-3">
                                                                    {/* Family Variants Breakdown */}
                                                                    <div className="space-y-2 border-b pb-3">
                                                                        <div className="flex items-center justify-between">
                                                                            <h5 className="text-[10px] font-extrabold text-foreground uppercase tracking-wider">
                                                                                Product Family Variants Breakdown
                                                                            </h5>
                                                                            <span className="text-[9.5px] font-bold text-primary animate-pulse">
                                                                                Select a variant below to load its recipe / BOM
                                                                            </span>
                                                                        </div>
                                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                                            {/* Parent variant */}
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => handleSelectVariant(prod.id, prod.parentProductObj.id)}
                                                                                className={`w-full text-left border rounded-lg p-2.5 bg-background flex flex-col gap-0.5 transition-all hover:bg-muted/10 cursor-pointer ${
                                                                                    prod.selectedVariantId === prod.parentProductObj.id
                                                                                        ? "border-primary ring-1 ring-primary/20 bg-primary/[0.02]"
                                                                                        : "border-muted"
                                                                                }`}
                                                                            >
                                                                                <div className="flex items-center justify-between w-full">
                                                                                    <span className="font-bold text-[11px] truncate text-foreground">{prod.parentProductObj.title}</span>
                                                                                    {prod.selectedVariantId === prod.parentProductObj.id && (
                                                                                        <span className="inline-flex items-center text-[9px] font-extrabold text-primary bg-primary/10 px-1.5 py-0.2 rounded-full">
                                                                                            Active BOM
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <span className="text-[9px] text-muted-foreground">Unit: {prod.parentProductObj.baseUom} (Base Product)</span>
                                                                                <span className="text-[10px] font-bold text-primary mt-1">Stock: {prod.parentProductObj.currentInventory.toLocaleString()} {prod.parentProductObj.baseUom}</span>
                                                                            </button>
                                                                            {/* Children variants */}
                                                                            {prod.children.map((child, cIdx) => (
                                                                                <button
                                                                                    key={cIdx}
                                                                                    type="button"
                                                                                    onClick={() => handleSelectVariant(prod.id, child.id)}
                                                                                    className={`w-full text-left border rounded-lg p-2.5 bg-background flex flex-col gap-0.5 transition-all hover:bg-muted/10 cursor-pointer ${
                                                                                        prod.selectedVariantId === child.id
                                                                                            ? "border-primary ring-1 ring-primary/20 bg-primary/[0.02]"
                                                                                            : "border-muted"
                                                                                    }`}
                                                                                >
                                                                                    <div className="flex items-center justify-between w-full">
                                                                                        <span className="font-bold text-[11px] truncate text-foreground">{child.title}</span>
                                                                                        {prod.selectedVariantId === child.id && (
                                                                                            <span className="inline-flex items-center text-[9px] font-extrabold text-primary bg-primary/10 px-1.5 py-0.2 rounded-full">
                                                                                                Active BOM
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <span className="text-[9px] text-muted-foreground">Unit: {child.baseUom} (Pack Size: {child.unitOfMeasurementCount})</span>
                                                                                    <span className="text-[10px] font-bold text-violet-600 mt-1">Stock: {child.currentInventory.toLocaleString()} {child.baseUom}</span>
                                                                                </button>
                                                                            ))}
                                                                        </div>
                                                                    </div>

                                                                    <div className="flex items-center justify-between">
                                                                        <h4 className="text-xs font-extrabold text-foreground uppercase tracking-wider">
                                                                            BOM Ingredients Requirement Explosion for {prod.selectedVariantTitle} (Deficit: {prod.netDeficitInVariant.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {prod.selectedVariantUom})
                                                                        </h4>
                                                                        <span className="text-[10px] text-muted-foreground font-semibold">
                                                                            Active Recipe: {prod.versionName || "V1"}
                                                                        </span>
                                                                    </div>
                                                                    
                                                                    {prod.bom.length === 0 ? (
                                                                        <p className="text-[10px] text-muted-foreground py-2 flex items-center gap-1">
                                                                            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                                                            No active BOM loaded. Ensure this product is configured with a recipe in Planning.
                                                                        </p>
                                                                    ) : (
                                                                        <div className="border rounded-lg overflow-hidden bg-background">
                                                                            <table className="w-full text-left text-[11px] border-collapse">
                                                                                <thead>
                                                                                    <tr className="bg-muted/50 border-b font-semibold text-muted-foreground">
                                                                                        <th className="p-2.5">Material Ingredient</th>
                                                                                        <th className="p-2.5 text-center">Required Qty</th>
                                                                                        <th className="p-2.5 text-center">Current Stock</th>
                                                                                        <th className="p-2.5 text-center">Safety Stock Limit</th>
                                                                                        <th className="p-2.5 text-right">Status</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {prod.ingredientsRequirements.map((ing, idx) => (
                                                                                        <tr key={idx} className="border-b last:border-0 hover:bg-muted/10">
                                                                                            <td className="p-2.5 font-semibold text-foreground">{ing.name}</td>
                                                                                            <td className="p-2.5 text-center font-medium">{ing.required.toFixed(1)} {ing.uom}</td>
                                                                                            <td className="p-2.5 text-center">{ing.stock.toLocaleString()} {ing.uom}</td>
                                                                                            <td className="p-2.5 text-center text-muted-foreground">{ing.safetyStock.toFixed(1)} {ing.uom}</td>
                                                                                            <td className="p-2.5 text-right">
                                                                                                {ing.isShortage ? (
                                                                                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                                                                                                        <AlertTriangle className="h-3 w-3" />
                                                                                                        Order Deficit ({(ing.required - ing.stock).toFixed(0)} {ing.uom})
                                                                                                    </span>
                                                                                                ) : (
                                                                                                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                                                                                        <CheckCircle className="h-3 w-3" />
                                                                                                        Sufficient
                                                                                                    </span>
                                                                                                )}
                                                                                            </td>
                                                                                        </tr>
                                                                                    ))}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </motion.div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </AnimatePresence>
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
