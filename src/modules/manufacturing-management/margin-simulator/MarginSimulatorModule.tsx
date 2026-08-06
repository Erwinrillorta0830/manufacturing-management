"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import { Sliders, RefreshCw, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { fetchProducts, fetchVersions, fetchBOMDetails } from "@/modules/manufacturing-management/finished-goods/services/finished-goods-api";

// Re-using mock product model internally
interface BOMItem {
    id: string;
    name: string;
    quantity: number;
    uom: string;
    wastagePercent: number;
    landedCost: number;
    foreignSourced?: boolean; // Flag to simulate forex spikes
    isForeign?: boolean;
    productId?: number;
    uomId?: number;
    type?: "raw_material" | "packaging" | "sub_assembly" | "by_product" | "finished_good";
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
    routings?: unknown[];
    overheads?: unknown[];
    description?: string;
    barcode?: string;
    densityFactor?: number;
    product_brand?: number;
    product_category?: number;
    product_class?: number;
    product_segment?: number;
    product_section?: number;
    product_shelf_life?: number;
}


const SIMULATOR_PRODUCTS: Product[] = [
    {
        id: "prod-1",
        sku: "BVO-1L-01",
        title: "1L Blended Vegetable Oil",
        baseUom: "L",
        expectedYieldPercent: 95.0,
        targetSellingPrice: 75.0,
        routingCost: 2.90, // Sum of standard routings
        unitOfMeasurementCount: 1,
        bom: [
            { id: "bom-1-1", name: "Refined Palm Oil (Imported)", quantity: 0.65, uom: "L", wastagePercent: 2.0, landedCost: 58.20, foreignSourced: true },
            { id: "bom-1-2", name: "Refined Coconut Oil (Local)", quantity: 0.35, uom: "L", wastagePercent: 1.0, landedCost: 72.50 },
            { id: "bom-1-3", name: "PET Bottle 1L", quantity: 1.0, uom: "pc", wastagePercent: 1.0, landedCost: 3.80 },
            { id: "bom-1-4", name: "Screw Cap (Blue)", quantity: 1.0, uom: "pc", wastagePercent: 0.0, landedCost: 0.45 },
            { id: "bom-1-5", name: "Front Label", quantity: 1.0, uom: "pc", wastagePercent: 3.0, landedCost: 0.85 }
        ]
    },
    {
        id: "prod-2",
        sku: "RPO-2L-02",
        title: "2L Refined Palm Oil",
        baseUom: "L",
        expectedYieldPercent: 98.0,
        targetSellingPrice: 140.0,
        routingCost: 3.70,
        unitOfMeasurementCount: 2,
        bom: [
            { id: "bom-2-1", name: "Refined Palm Oil (Imported)", quantity: 2.02, uom: "L", wastagePercent: 1.5, landedCost: 58.20, foreignSourced: true },
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
        unitOfMeasurementCount: 0.5,
        bom: [
            { id: "bom-3-1", name: "Canola Crude Oil (Imported)", quantity: 0.51, uom: "L", wastagePercent: 2.5, landedCost: 78.40, foreignSourced: true },
            { id: "bom-3-2", name: "Glass Bottle 500ml", quantity: 1.0, uom: "pc", wastagePercent: 4.0, landedCost: 11.20 },
            { id: "bom-3-3", name: "Metal Lug Cap", quantity: 1.0, uom: "pc", wastagePercent: 1.0, landedCost: 1.60 },
            { id: "bom-3-4", name: "Paper Label", quantity: 1.0, uom: "pc", wastagePercent: 2.0, landedCost: 0.95 }
        ]
    }
];

export default function MarginSimulatorModule() {
    const [products, setProducts] = useState<Product[]>(SIMULATOR_PRODUCTS);
    const [selectedId, setSelectedId] = useState("prod-1");
    const [loadingProducts, setLoadingProducts] = useState<boolean>(true);
    const [loadingBOM, setLoadingBOM] = useState<boolean>(false);

    // Searchable Select States
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Promotion Modal States
    const [isPromoOpen, setIsPromoOpen] = useState(false);
    const [newVersionName, setNewVersionName] = useState("");
    const [promoting, setPromoting] = useState(false);

    // Close dropdown on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Filter products list based on search term
    const filteredProducts = useMemo(() => {
        if (!searchTerm.trim()) return products;
        const term = searchTerm.toLowerCase();
        return products.filter(p =>
            p.title.toLowerCase().includes(term) ||
            p.sku.toLowerCase().includes(term)
        );
    }, [products, searchTerm]);

    // Load database products on mount
    useEffect(() => {
        async function loadAllProducts() {
            setLoadingProducts(true);
            try {
                const dbProds = await fetchProducts("", 200);
                if (dbProds && dbProds.length > 0) {
                    const mappedProducts = dbProds.map(p => ({
                        id: String(p.id),
                        sku: p.sku,
                        title: p.title,
                        baseUom: p.baseUom,
                        expectedYieldPercent: 100, // standard fallback
                        targetSellingPrice: p.targetSellingPrice,
                        bom: [],
                        routingCost: 0,
                        has_versions: p.has_versions,
                        unitOfMeasurementCount: p.unit_of_measurement_count
                    }));

                    // Prepend DB products to the mock products so DB items show up first
                    setProducts([...mappedProducts, ...SIMULATOR_PRODUCTS]);

                    // Autoselect the first product with a BOM if available, otherwise just the first product
                    const firstWithVersions = mappedProducts.find(p => p.has_versions);
                    if (firstWithVersions) {
                        setSelectedId(firstWithVersions.id);
                    } else {
                        setSelectedId(mappedProducts[0].id);
                    }
                }
            } catch (err) {
                console.error("Failed to fetch products for margin simulator:", err);
                toast.error("Could not load database products. Using mock data instead.");
            } finally {
                setLoadingProducts(false);
            }
        }
        loadAllProducts();
    }, []);

    const product = useMemo(() => {
        return products.find(p => p.id === selectedId) || products[0] || SIMULATOR_PRODUCTS[0];
    }, [selectedId, products]);

    const initialProduct = SIMULATOR_PRODUCTS[0];

    // Simulator states
    const [simYield, setSimYield] = useState(initialProduct.expectedYieldPercent);
    const [forexMultiplier, setForexMultiplier] = useState(1.0); // Forex inflation e.g. 1.15 (+15% USD strength)
    const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
    const [importedOverrides, setImportedOverrides] = useState<Record<string, boolean>>({});
    const [targetPrice, setTargetPrice] = useState(initialProduct.targetSellingPrice);
    const [savingCurrent, setSavingCurrent] = useState(false);

    // Track which product's sandbox parameters are currently in state to prevent cross-product overwrite on load
    const loadedProductIdRef = useRef<string>("");

    // Fetch BOM recipe dynamically when selectedId changes
    useEffect(() => {
        if (!selectedId) return;

        const currentProd = products.find(p => p.id === selectedId);
        if (!currentProd) return;

        const applySandboxState = (bomItems: BOMItem[], standardYield: number, standardPrice: number) => {
            setSimYield(standardYield);
            setTargetPrice(standardPrice);
            setForexMultiplier(1.0);

            const initialPrices: Record<string, number> = {};
            const initialImported: Record<string, boolean> = {};
            bomItems.forEach(item => {
                initialPrices[item.id] = item.landedCost;
                initialImported[item.id] = !!(item.foreignSourced || item.isForeign);
            });
            setPriceOverrides(initialPrices);
            setImportedOverrides(initialImported);
            loadedProductIdRef.current = selectedId;
        };

        // If mock product, load standard mock details directly
        if (currentProd.id.startsWith("prod-")) {
            applySandboxState(
                currentProd.bom,
                Number(currentProd.expectedYieldPercent) || 100,
                currentProd.targetSellingPrice
            );
            return;
        }

        // Database product: Use cached BOM if already loaded to avoid redundant network calls
        if (currentProd.bom && currentProd.bom.length > 0) {
            applySandboxState(
                currentProd.bom,
                Number(currentProd.expectedYieldPercent) || 100,
                currentProd.targetSellingPrice
            );
            return;
        }

        // Database product: Load versions & active BOM
        async function loadBOM() {
            setLoadingBOM(true);
            try {
                const versions = await fetchVersions(Number(currentProd!.id));
                if (!versions || versions.length === 0) {
                    setProducts(prev => prev.map(p => p.id === currentProd!.id ? { ...p, bom: [], routingCost: 0 } : p));
                    applySandboxState([], 100, currentProd!.targetSellingPrice);
                    return;
                }
                // Fetch details for the first version (latest/active version)
                const activeVersion = versions[0];
                const details = await fetchBOMDetails(Number(currentProd!.id), activeVersion.version_id);
                if (details) {
                    const ingredients = details.routes?.flatMap(r => r.bom_items || []) || [];
                    const mappedBom: BOMItem[] = ingredients.map(ing => ({
                        id: String(ing.id),
                        productId: ing.product_id,
                        name: ing.product_name || `Component #${ing.product_id}`,
                        type: "raw_material" as const,
                        quantity: ing.quantity_required,
                        uom: String(ing.unit_of_measurement || "pc"),
                        uomId: typeof ing.unit_of_measurement === "number" ? ing.unit_of_measurement : 0,
                        wastagePercent: ing.wastage_factor_percentage || 0,
                        landedCost: ing.cost_per_unit || 0,
                        foreignSourced: false,
                        isForeign: ing.is_foreign || false
                    }));
                    const calculatedRoutingCost = details.routes?.reduce((sum, r) => {
                        return sum + ((Number(r.work_center?.overhead_cost_per_hour || 0) * Number(r.setup_time_hours + r.run_time_hours)) / (r.step_batch_size || 1));
                    }, 0) || 0;

                    // Update the product's details in the products list state
                    setProducts(prev => prev.map(p => p.id === currentProd!.id ? {
                        ...p,
                        expectedYieldPercent: Number(details.expected_yield_percentage) || 100,
                        bom: mappedBom,
                        routingCost: calculatedRoutingCost,
                        bomId: details.version_id,
                        versionId: details.version_id,
                        versionName: details.version_name,
                        routings: details.routes || [],
                        overheads: (details as unknown as { overheads?: unknown[] }).overheads || []
                    } : p));

                    applySandboxState(
                        mappedBom,
                        Number(details.expected_yield_percentage) || 100,
                        currentProd!.targetSellingPrice
                    );
                } else {
                    setProducts(prev => prev.map(p => p.id === currentProd!.id ? { ...p, bom: [], routingCost: 0 } : p));
                    applySandboxState([], 100, currentProd!.targetSellingPrice);
                }
            } catch (err) {
                console.error("Error loading simulator BOM:", err);
                toast.error("Failed to load BOM details for the selected product");
            } finally {
                setLoadingBOM(false);
            }
        }
        loadBOM();
    }, [selectedId, products]);



    const handleProductChange = (productId: string) => {
        setSelectedId(productId);
    };

    const toggleImportedStatus = (itemId: string) => {
        setImportedOverrides(prev => {
            const currentVal = prev[itemId] !== undefined
                ? prev[itemId]
                : !!(product.bom.find(item => item.id === itemId)?.foreignSourced || product.bom.find(item => item.id === itemId)?.isForeign);
            const newVal = !currentVal;
            return { ...prev, [itemId]: newVal };
        });
    };

    const handleSaveCurrentVersion = async () => {
        if (!product.bomId) {
            toast.error("No active BOM version to save to.");
            return;
        }

        setSavingCurrent(true);
        try {
            // 1. Format ingredients with overrides and updated imported settings
            const updatedIngredients = product.bom.map(item => ({
                id: item.id,
                productId: item.productId,
                name: item.name,
                type: item.type,
                quantity: item.quantity,
                uom: item.uom,
                uomId: item.uomId,
                wastagePercent: item.wastagePercent,
                landedCost: priceOverrides[item.id] !== undefined ? priceOverrides[item.id] : item.landedCost,
                isForeign: importedOverrides[item.id] !== undefined ? importedOverrides[item.id] : (item.isForeign || item.foreignSourced || false)
            }));

            // 2. Format details payload
            const details = {
                title: product.title,
                sku: product.sku,
                barcode: product.barcode || "",
                baseUom: product.baseUom,
                expectedYieldPercent: simYield,
                targetSellingPrice: targetPrice,
                densityFactor: product.densityFactor || 1.0,
                productBrand: product.product_brand,
                productCategory: product.product_category,
                productClass: product.product_class,
                productSegment: product.product_segment,
                productSection: product.product_section,
                productShelfLife: product.product_shelf_life,
                description: product.description || ""
            };

            // 3. Save details, ingredients, and routings to the current BOM version
            const saveRes = await fetch("/api/manufacturing/finished-goods/bom-details", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    productId: Number(product.id),
                    bomId: product.bomId,
                    details,
                    ingredients: updatedIngredients,
                    routings: product.routings || [],
                    overheads: product.overheads || []
                })
            });

            if (!saveRes.ok) {
                throw new Error("Failed to save BOM overrides to the current version");
            }

            toast.success(`Successfully saved simulator data to active version ${product.versionName || ""}!`);

            // 4. Reload products list to pick up the updated standard costs
            const dbProds = await fetchProducts("", 200);
            if (dbProds && dbProds.length > 0) {
                const mappedProducts = dbProds.map(p => ({
                    id: String(p.id),
                    sku: p.sku,
                    title: p.title,
                    baseUom: p.baseUom,
                    expectedYieldPercent: 100,
                    targetSellingPrice: p.targetSellingPrice,
                    bom: [],
                    routingCost: 0,
                    has_versions: p.has_versions,
                    unitOfMeasurementCount: p.unit_of_measurement_count,
                    description: p.description || "",
                    barcode: p.barcode || "",
                    densityFactor: p.densityFactor || 1.0,
                    product_brand: p.product_brand,
                    product_category: p.product_category,
                    product_class: p.product_class,
                    product_segment: p.product_segment,
                    product_section: p.product_section,
                    product_shelf_life: p.product_shelf_life
                }));

                const updatedProducts = [...mappedProducts, ...SIMULATOR_PRODUCTS].map(p => {
                    if (p.id === selectedId) {
                        return {
                            ...p,
                            expectedYieldPercent: simYield,
                            bom: product.bom.map(item => ({
                                ...item,
                                landedCost: priceOverrides[item.id] !== undefined ? priceOverrides[item.id] : item.landedCost,
                                foreignSourced: importedOverrides[item.id] !== undefined ? importedOverrides[item.id] : (item.foreignSourced || item.isForeign || false),
                                isForeign: importedOverrides[item.id] !== undefined ? importedOverrides[item.id] : (item.foreignSourced || item.isForeign || false)
                            })),
                            routingCost: product.routingCost,
                            bomId: product.bomId,
                            versionId: product.versionId,
                            versionName: product.versionName,
                            routings: product.routings,
                            overheads: product.overheads
                        };
                    }
                    return p;
                });
                setProducts(updatedProducts);
            }
        } catch (err) {
            console.error("Failed saving simulated BOM to current version:", err);
            const errMsg = err instanceof Error ? err.message : "Failed to save to current version";
            toast.error(errMsg);
        } finally {
            setSavingCurrent(false);
        }
    };

    const handlePromoteBOM = async () => {
        if (!newVersionName.trim() || !product.bomId) {
            toast.error("Invalid base version details. Cannot promote.");
            return;
        }

        setPromoting(true);
        try {
            // 1. Create the new version (clones from base BOM)
            const verRes = await fetch("/api/manufacturing/finished-goods/versions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    productId: Number(product.id),
                    baseBomId: product.bomId,
                    expectedYield: simYield,
                    bomName: `BOM v${newVersionName.trim()} for ${product.title}`,
                    versionName: newVersionName.trim()
                })
            });

            if (!verRes.ok) {
                const errText = await verRes.text();
                throw new Error(`Failed to create version: ${errText}`);
            }

            const verJson = await verRes.json();
            if (!verJson.success || !verJson.bom) {
                throw new Error("API did not return success or new BOM data.");
            }

            const newBom = verJson.bom;
            const newBomId = newBom.bom_id;

            // 2. Format ingredients with overrides and updated imported settings
            const updatedIngredients = product.bom.map(item => ({
                id: item.id,
                productId: item.productId,
                name: item.name,
                type: item.type,
                quantity: item.quantity,
                uom: item.uom,
                uomId: item.uomId,
                wastagePercent: item.wastagePercent,
                landedCost: priceOverrides[item.id] !== undefined ? priceOverrides[item.id] : item.landedCost,
                isForeign: importedOverrides[item.id] !== undefined ? importedOverrides[item.id] : (item.isForeign || item.foreignSourced || false)
            }));

            // 3. Format details payload
            const details = {
                title: product.title,
                sku: product.sku,
                barcode: product.barcode || "",
                baseUom: product.baseUom,
                expectedYieldPercent: simYield,
                targetSellingPrice: targetPrice,
                densityFactor: product.densityFactor || 1.0,
                productBrand: product.product_brand,
                productCategory: product.product_category,
                productClass: product.product_class,
                productSegment: product.product_segment,
                productSection: product.product_section,
                productShelfLife: product.product_shelf_life,
                description: product.description || ""
            };

            // 4. Save details, ingredients, and routings to the new BOM version
            const saveRes = await fetch("/api/manufacturing/finished-goods/bom-details", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    productId: Number(product.id),
                    bomId: newBomId,
                    details,
                    ingredients: updatedIngredients,
                    routings: product.routings || [],
                    overheads: product.overheads || []
                })
            });

            if (!saveRes.ok) {
                throw new Error("Failed to save BOM overrides to the new version");
            }

            toast.success(`Successfully promoted simulation to version ${newVersionName.trim()}!`);
            setIsPromoOpen(false);
            setNewVersionName("");

            // 5. Reload products list to pick up the new version
            const dbProds = await fetchProducts("", 200);
            if (dbProds && dbProds.length > 0) {
                const mappedProducts = dbProds.map(p => ({
                    id: String(p.id),
                    sku: p.sku,
                    title: p.title,
                    baseUom: p.baseUom,
                    expectedYieldPercent: 100,
                    targetSellingPrice: p.targetSellingPrice,
                    bom: [],
                    routingCost: 0,
                    has_versions: p.has_versions,
                    unitOfMeasurementCount: p.unit_of_measurement_count,
                    description: p.description || "",
                    barcode: p.barcode || "",
                    densityFactor: p.densityFactor || 1.0,
                    product_brand: p.product_brand,
                    product_category: p.product_category,
                    product_class: p.product_class,
                    product_segment: p.product_segment,
                    product_section: p.product_section,
                    product_shelf_life: p.product_shelf_life
                }));
                setProducts([...mappedProducts, ...SIMULATOR_PRODUCTS]);
                setSelectedId(String(product.id)); // keep current selected product
            }
        } catch (err) {
            console.error("Failed promoting simulated BOM:", err);
            const errMsg = err instanceof Error ? err.message : "Failed to promote simulated version";
            toast.error(errMsg);
        } finally {
            setPromoting(false);
        }
    };

    // Baseline calculation (Unmodified standard)
    const baseMaterialCost = useMemo(() => {
        return product.bom.reduce((sum, item) => {
            const factor = 1 - (item.wastagePercent / 100);
            return sum + ((item.quantity * item.landedCost) / (factor > 0 ? factor : 1));
        }, 0);
    }, [product]);

    const baseUnitCost = useMemo(() => {
        const yieldFactor = (Number(product.expectedYieldPercent) || 100) / 100;
        return (baseMaterialCost + product.routingCost) / (yieldFactor > 0 ? yieldFactor : 1);
    }, [baseMaterialCost, product]);

    const baseMarginPhp = product.targetSellingPrice - baseUnitCost;
    const baseMarginPercent = product.targetSellingPrice > 0 ? (baseMarginPhp / product.targetSellingPrice) * 100 : 0;

    // Simulated calculations
    const simulatedMaterialCost = useMemo(() => {
        return product.bom.reduce((sum, item) => {
            const factor = 1 - (item.wastagePercent / 100);
            let unitCost = priceOverrides[item.id] !== undefined ? priceOverrides[item.id] : item.landedCost;

            // Apply Forex rate fluctuation to foreign-sourced materials
            const isItemForeign = importedOverrides[item.id] !== undefined
                ? importedOverrides[item.id]
                : (item.foreignSourced || item.isForeign || false);
            if (isItemForeign) {
                unitCost = unitCost * forexMultiplier;
            }

            return sum + ((item.quantity * unitCost) / (factor > 0 ? factor : 1));
        }, 0);
    }, [product, priceOverrides, forexMultiplier, importedOverrides]);

    const simulatedUnitCost = useMemo(() => {
        const yieldFactor = (Number(simYield) || 100) / 100;
        return (simulatedMaterialCost + product.routingCost) / (yieldFactor > 0 ? yieldFactor : 1);
    }, [simulatedMaterialCost, product, simYield]);

    const simulatedMarginPhp = targetPrice - simulatedUnitCost;
    const simulatedMarginPercent = targetPrice > 0 ? (simulatedMarginPhp / targetPrice) * 100 : 0;

    const resetSimulation = () => {
        setSimYield(Number(product.expectedYieldPercent) || 100);
        setTargetPrice(product.targetSellingPrice);
        setForexMultiplier(1.0);
        const initialPrices: Record<string, number> = {};
        const initialImported: Record<string, boolean> = {};
        product.bom.forEach(item => {
            initialPrices[item.id] = item.landedCost;
            initialImported[item.id] = !!(item.foreignSourced || item.isForeign);
        });
        setPriceOverrides(initialPrices);
        setImportedOverrides(initialImported);
        toast.success("Simulation parameters reset successfully");
    };

    return (
        <>
            <div className="flex flex-col gap-6 max-w-6xl mx-auto p-4 sm:p-6 bg-background rounded-xl border">
                {/* Header */}
                <div className="flex items-center justify-between border-b pb-4">
                    <div>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            <Sliders className="h-5.5 w-5.5 text-primary" />
                            Cost & Margin What-If Simulator
                        </h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Interactive sandbox to stress-test margins against yield drops, forex spikes, and individual raw material price surges.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {!product.id.startsWith("prod-") && product.bomId && (
                            <>
                                <button
                                    type="button"
                                    onClick={handleSaveCurrentVersion}
                                    disabled={savingCurrent}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/30 hover:bg-primary/5 text-xs font-bold text-primary shadow-xs transition-all cursor-pointer"
                                >
                                    {savingCurrent && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                                    Save to Current Version
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setNewVersionName(`${product.versionName || "1.0"}_simulated`);
                                        setIsPromoOpen(true);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary hover:bg-primary/95 text-xs font-bold text-primary-foreground shadow-xs transition-all cursor-pointer"
                                >
                                    Promote to New BOM Version
                                </button>
                            </>
                        )}
                        <button
                            type="button"
                            onClick={resetSimulation}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-muted text-xs font-semibold text-foreground hover:bg-accent transition-all cursor-pointer"
                        >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Reset Simulator
                        </button>
                    </div>
                </div>

                {/* Selector Grid */}
                <div className="grid gap-6 md:grid-cols-3">
                    {/* Simulator Inputs Sidebar */}
                    <div className="md:col-span-1 space-y-5 border-r pr-0 md:pr-6 border-b md:border-b-0 pb-6 md:pb-0">
                        <div className="space-y-1.5 relative" ref={dropdownRef}>
                            <label className="text-xs font-bold text-muted-foreground">Select Product to Simulate</label>
                            {loadingProducts ? (
                                <div className="h-9 w-full bg-muted animate-pulse rounded-lg border flex items-center justify-center text-[10px] text-muted-foreground font-semibold">
                                    Loading products...
                                </div>
                            ) : (
                                <div>
                                    <button
                                        type="button"
                                        onClick={() => setIsOpen(!isOpen)}
                                        className="w-full inline-flex items-center justify-between rounded-lg border px-3 py-2 text-sm text-left bg-background hover:bg-accent/5 transition-colors focus:ring-1 focus:ring-primary outline-hidden cursor-pointer"
                                    >
                                        <span className="truncate max-w-[85%] font-medium">
                                            {product.title} ({product.sku}){product.unitOfMeasurementCount ? ` — ${product.unitOfMeasurementCount} ` : " "}{product.baseUom}
                                        </span>
                                        <span className="text-[10px] text-muted-foreground ml-2">▼</span>
                                    </button>

                                    {isOpen && (
                                        <div className="absolute left-0 right-0 mt-1 z-50 rounded-lg border bg-background shadow-lg p-2 space-y-2 max-w-sm sm:max-w-none">
                                            <input
                                                type="text"
                                                placeholder="Search product..."
                                                value={searchTerm}
                                                onChange={e => setSearchTerm(e.target.value)}
                                                className="w-full rounded border px-2.5 py-1.5 text-xs outline-hidden focus:ring-1 focus:ring-primary bg-background"
                                                autoFocus
                                            />
                                            <div className="max-h-56 overflow-y-auto space-y-0.5 custom-scrollbar">
                                                {filteredProducts.length === 0 ? (
                                                    <div className="p-3 text-center text-xs text-muted-foreground">
                                                        No products found
                                                    </div>
                                                ) : (
                                                    filteredProducts.map(p => {
                                                        const isSelected = p.id === selectedId;
                                                        return (
                                                            <button
                                                                key={p.id}
                                                                type="button"
                                                                onClick={() => {
                                                                    handleProductChange(p.id);
                                                                    setIsOpen(false);
                                                                    setSearchTerm("");
                                                                }}
                                                                className={`w-full text-left px-3 py-2 rounded-md text-xs transition-colors flex items-center justify-between cursor-pointer ${isSelected
                                                                        ? "bg-primary text-primary-foreground font-bold"
                                                                        : "hover:bg-muted"
                                                                    }`}
                                                            >
                                                                <div className="truncate pr-2">
                                                                    <span className="block font-medium truncate">{p.title}</span>
                                                                    <span className={`block text-[10px] ${isSelected ? "text-primary-foreground/85" : "text-muted-foreground"}`}>
                                                                        {p.sku} {p.unitOfMeasurementCount ? `• ${p.unitOfMeasurementCount} ` : ""}{p.baseUom}
                                                                    </span>
                                                                </div>
                                                                <div className="shrink-0 flex items-center gap-1.5">
                                                                    {!p.id.startsWith("prod-") && p.has_versions && (
                                                                        <span className={`text-[9px] px-1 rounded font-bold uppercase ${isSelected ? "bg-primary-foreground/25 text-primary-foreground" : "bg-primary/15 text-primary"
                                                                            }`}>
                                                                            BOM
                                                                        </span>
                                                                    )}
                                                                    {isSelected && <span className="font-bold">✓</span>}
                                                                </div>
                                                            </button>
                                                        );
                                                    })
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Yield loss override */}
                        <div className="space-y-2 pt-2 border-t">
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold text-muted-foreground">Simulate Yield Drop</span>
                                <span className="font-bold text-amber-600">{Number(simYield).toFixed(1)}%</span>
                            </div>
                            <input
                                type="range"
                                min="60"
                                max="100"
                                step="0.5"
                                value={simYield}
                                onChange={e => setSimYield(parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Severe Loss (60%)</span>
                                <span>Standard Yield ({product.expectedYieldPercent}%)</span>
                            </div>
                        </div>

                        {/* Global Forex Override */}
                        <div className="space-y-2 pt-2 border-t">
                            <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold text-muted-foreground">Global Forex Shift (USD/PHP)</span>
                                <span className="font-bold text-primary">
                                    {forexMultiplier === 1.0 ? "Standard (1.0x)" : `+${((forexMultiplier - 1) * 100).toFixed(0)}% PHP weakening`}
                                </span>
                            </div>
                            <input
                                type="range"
                                min="1.0"
                                max="1.3"
                                step="0.01"
                                value={forexMultiplier}
                                onChange={e => setForexMultiplier(parseFloat(e.target.value))}
                                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>Stable</span>
                                <span>+30% Inflation</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground bg-primary/5 p-1.5 rounded border border-primary/15">
                                Note: Applies only to ingredients flagged as <strong className="text-primary font-bold">Imported</strong> in the recipe tree.
                            </p>
                        </div>

                        {/* Target Price */}
                        <div className="space-y-1.5 pt-2 border-t">
                            <label className="text-xs font-bold text-muted-foreground">Simulated Selling Price (PHP)</label>
                            <div className="relative">
                                <span className="absolute left-2.5 top-2 text-xs text-muted-foreground font-semibold">₱</span>
                                <input
                                    type="number"
                                    step="0.50"
                                    value={targetPrice}
                                    onChange={e => setTargetPrice(parseFloat(e.target.value) || 0)}
                                    className="w-full rounded-lg border pl-6 pr-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Ingredients & Margins Output */}
                    <div className="md:col-span-2 space-y-6">
                        {/* Material overrides table */}
                        <div className="space-y-3">
                            <h3 className="text-sm font-bold tracking-tight">Override Recipe Ingredients Landed Costs</h3>
                            <div className="border rounded-xl overflow-hidden">
                                <table className="w-full text-left text-xs border-collapse">
                                    <thead>
                                        <tr className="bg-muted/40 border-b font-semibold text-muted-foreground">
                                            <th className="p-3">Ingredient</th>
                                            <th className="p-3 text-center">Imported</th>
                                            <th className="p-3 text-center">UOM</th>
                                            <th className="p-3">Standard Cost</th>
                                            <th className="p-3">Simulated Price Override</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {loadingBOM ? (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-muted-foreground text-xs">
                                                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                                                    Loading recipe details...
                                                </td>
                                            </tr>
                                        ) : product.bom.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} className="p-8 text-center text-muted-foreground text-xs">
                                                    <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-amber-500" />
                                                    No ingredients recipe found. Select a product with an active BOM version.
                                                </td>
                                            </tr>
                                        ) : (
                                            product.bom.map(item => {
                                                const overrideVal = priceOverrides[item.id] !== undefined ? priceOverrides[item.id] : item.landedCost;
                                                return (
                                                    <tr key={item.id} className="border-b last:border-0 hover:bg-muted/5">
                                                        <td className="p-3 font-medium">
                                                            <span>{item.name}</span>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => toggleImportedStatus(item.id)}
                                                                    className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out outline-hidden ${(importedOverrides[item.id] !== undefined ? importedOverrides[item.id] : (item.foreignSourced || item.isForeign)) ? "bg-blue-600" : "bg-muted"
                                                                        }`}
                                                                >
                                                                    <span
                                                                        className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow-sm transition duration-200 ease-in-out ${(importedOverrides[item.id] !== undefined ? importedOverrides[item.id] : (item.foreignSourced || item.isForeign)) ? "translate-x-3.5" : "translate-x-0"
                                                                            }`}
                                                                    />
                                                                </button>
                                                                <span className={`text-[9px] font-bold tracking-wider uppercase ${(importedOverrides[item.id] !== undefined ? importedOverrides[item.id] : (item.foreignSourced || item.isForeign)) ? "text-blue-600" : "text-muted-foreground"
                                                                    }`}>
                                                                    {(importedOverrides[item.id] !== undefined ? importedOverrides[item.id] : (item.foreignSourced || item.isForeign)) ? "Imported" : "Domestic"}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-center text-muted-foreground">{item.uom}</td>
                                                        <td className="p-3 font-medium">₱{item.landedCost.toFixed(2)}</td>
                                                        <td className="p-3 w-40">
                                                            <div className="relative">
                                                                <span className="absolute left-1.5 top-1.5 text-[10px] text-muted-foreground">₱</span>
                                                                <input
                                                                    type="number"
                                                                    step="0.1"
                                                                    value={overrideVal}
                                                                    onChange={e => setPriceOverrides(prev => ({ ...prev, [item.id]: parseFloat(e.target.value) || 0 }))}
                                                                    className="w-full rounded border pl-4 pr-1.5 py-1 text-xs bg-background text-right"
                                                                />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Margin Results Comparative Board */}
                        <div className="grid gap-4 sm:grid-cols-2">
                            {/* Standard Baseline */}
                            <div className="rounded-xl border bg-muted/10 p-4 space-y-3">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Baseline (Standard Cost)</span>
                                <div className="space-y-1">
                                    <p className="text-[10px] text-muted-foreground">Base Unit Cost</p>
                                    <p className="text-xl font-extrabold text-foreground">₱{baseUnitCost.toFixed(2)}</p>
                                </div>
                                <div className="border-t pt-2 space-y-1">
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-muted-foreground">Selling Price:</span>
                                        <span className="font-semibold">₱{product.targetSellingPrice.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs pt-1">
                                        <span className="font-bold text-foreground">Gross Margin %:</span>
                                        <span className="font-bold text-foreground">{baseMarginPercent.toFixed(1)}%</span>
                                    </div>
                                </div>
                            </div>

                            {/* Simulated Result */}
                            {(() => {
                                const isLow = simulatedMarginPercent < 15;
                                const isLoss = simulatedMarginPercent < 0;
                                return (
                                    <div className={`rounded-xl border p-4 space-y-3 transition-colors ${isLoss
                                            ? "bg-destructive/5 border-destructive/30 text-destructive-foreground"
                                            : isLow
                                                ? "bg-amber-500/5 border-amber-500/30"
                                                : "bg-emerald-500/5 border-emerald-500/30"
                                        }`}>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Simulated What-If</span>
                                            {isLoss && <AlertTriangle className="h-4 w-4 text-destructive" />}
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] text-muted-foreground">Simulated Unit Cost</p>
                                            <p className={`text-xl font-extrabold ${isLoss ? "text-destructive" : isLow ? "text-amber-600" : "text-emerald-600"}`}>
                                                ₱{simulatedUnitCost.toFixed(2)}
                                            </p>
                                        </div>
                                        <div className="border-t pt-2 space-y-1 text-foreground">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-muted-foreground">Simulated Price:</span>
                                                <span className="font-semibold">₱{targetPrice.toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between items-center text-xs pt-1 border-t border-dashed mt-1">
                                                <span className="font-bold">Simulated Gross Margin %:</span>
                                                <span className={`font-bold text-sm ${isLoss ? "text-destructive" : isLow ? "text-amber-600" : "text-emerald-600"}`}>
                                                    {simulatedMarginPercent.toFixed(1)}%
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            </div>

            {/* Promotion Modal */}
            {isPromoOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs">
                    <div className="w-full max-w-md rounded-xl border bg-background p-6 shadow-xl space-y-4 relative">
                        <div className="space-y-1">
                            <h2 className="text-base font-bold text-foreground">Promote to New BOM Version</h2>
                            <p className="text-xs text-muted-foreground">
                                This will clone the current recipe, apply your simulated landed costs, yields, and selling prices, and activate it as the new standard costing.
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground">New Version Name</label>
                            <input
                                type="text"
                                placeholder="e.g. v1.1, v2.0, vSimulated"
                                value={newVersionName}
                                onChange={e => setNewVersionName(e.target.value)}
                                className="w-full rounded-lg border px-3 py-2 text-sm outline-hidden focus:ring-1 focus:ring-primary bg-background"
                            />
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setIsPromoOpen(false);
                                    setNewVersionName("");
                                }}
                                disabled={promoting}
                                className="px-3.5 py-1.5 rounded-lg border bg-muted text-xs font-semibold text-foreground hover:bg-accent cursor-pointer disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handlePromoteBOM}
                                disabled={promoting || !newVersionName.trim()}
                                className="px-3.5 py-1.5 rounded-lg bg-primary text-xs font-semibold text-primary-foreground hover:bg-primary/95 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {promoting && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                                Promote & Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
