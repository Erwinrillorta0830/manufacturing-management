"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
    FileSpreadsheet,
    AlertTriangle,
    RefreshCw,
    Layers,
    Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import BOMCostingFilters from "./components/BOMCostingFilters";
import BOMCostingSummaryCards from "./components/BOMCostingSummaryCards";
import BOMCostingTreeTable from "./components/BOMCostingTreeTable";
import BOMCostingExport from "./components/BOMCostingExport";
import {
    ProductOption,
    VersionOption,
    BOMCostingReportData
} from "./types";

export default function BOMCostingReportModule() {
    const [products, setProducts] = useState<ProductOption[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<ProductOption | null>(null);
    const [versions, setVersions] = useState<VersionOption[]>([]);
    const [selectedVersion, setSelectedVersion] = useState<VersionOption | null>(null);
    const [targetQuantity, setTargetQuantity] = useState<number>(1);
    const [reportData, setReportData] = useState<BOMCostingReportData | null>(null);

    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
    const [isLoadingVersions, setIsLoadingVersions] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // 1. Fetch products catalog on initial mount
    const fetchProducts = useCallback(async () => {
        try {
            setIsLoadingProducts(true);
            setErrorMessage(null);
            const res = await fetch("/api/bia/costing/bom-costing-report?action=products");
            const data = await res.json();
            if (!res.ok || !data.ok) {
                const msg = data.error || "Failed to load product catalog.";
                setErrorMessage(msg);
                toast.error(msg);
                return;
            }
            setProducts(data.products || []);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error connecting to server";
            setErrorMessage(msg);
            toast.error(msg);
        } finally {
            setIsLoadingProducts(false);
        }
    }, []);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    // 2. Fetch versions when a product is selected
    const handleSelectProduct = async (prod: ProductOption) => {
        setSelectedProduct(prod);
        setSelectedVersion(null);
        setReportData(null);
        setErrorMessage(null);

        try {
            setIsLoadingVersions(true);
            const res = await fetch(`/api/bia/costing/bom-costing-report?action=versions&productId=${prod.product_id}`);
            const data = await res.json();
            if (!res.ok || !data.ok) {
                const msg = data.error || `Failed to fetch versions for product #${prod.product_id}`;
                toast.error(msg);
                setVersions([]);
                return;
            }

            const verList: VersionOption[] = data.versions || [];
            setVersions(verList);

            if (verList.length > 0) {
                // Pick primary or active version
                const primary = verList.find(v => v.is_primary) || verList.find(v => v.status.toLowerCase() === "active") || verList[0];
                setSelectedVersion(primary);
                setTargetQuantity(primary.base_quantity || 1);
            } else {
                toast.warning(`Product "${prod.product_name}" does not have any manufacturing versions created yet.`);
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Network error fetching versions";
            toast.error(msg);
            setVersions([]);
        } finally {
            setIsLoadingVersions(false);
        }
    };

    // 3. Select specific version
    const handleSelectVersion = (ver: VersionOption) => {
        setSelectedVersion(ver);
        setTargetQuantity(ver.base_quantity || 1);
        setReportData(null);
    };

    // 4. Generate BOM Costing Report
    const handleGenerate = async () => {
        if (!selectedProduct || !selectedVersion) {
            toast.error("Please select a target product and manufacturing version.");
            return;
        }

        try {
            setIsGenerating(true);
            setErrorMessage(null);

            const url = `/api/bia/costing/bom-costing-report?action=report&productId=${selectedProduct.product_id}&versionId=${selectedVersion.version_id}&targetQuantity=${targetQuantity}`;
            const res = await fetch(url);
            const resJson = await res.json();

            if (!res.ok || !resJson.ok) {
                const msg = resJson.error || "Failed to generate BOM Costing Report.";
                setErrorMessage(msg);
                toast.error(msg);
                return;
            }

            setReportData(resJson.data);
            toast.success(`BOM Costing generated for ${resJson.data.targetProduct.product_name} (${resJson.data.summary.totalComponentsCount} components decomposed).`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Error generating report";
            setErrorMessage(msg);
            toast.error(msg);
        } finally {
            setIsGenerating(false);
        }
    };

    // 5. Reset report state
    const handleReset = () => {
        setSelectedProduct(null);
        setSelectedVersion(null);
        setVersions([]);
        setTargetQuantity(1);
        setReportData(null);
        setErrorMessage(null);
        toast.info("Report parameters cleared.");
    };

    return (
        <div className="space-y-4">
            {/* Page Header Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-foreground">
                            Bill of Materials (BOM) Costing Report
                        </h1>
                        <p className="text-xs text-muted-foreground">
                            Multi-level breakdown of component quantities and unit material costs required per product.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <BOMCostingExport data={reportData} />
                </div>
            </div>

            {/* Filter & Simulation Bar */}
            <BOMCostingFilters
                products={products}
                selectedProduct={selectedProduct}
                onSelectProduct={handleSelectProduct}
                versions={versions}
                selectedVersion={selectedVersion}
                onSelectVersion={handleSelectVersion}
                targetQuantity={targetQuantity}
                onChangeTargetQuantity={setTargetQuantity}
                onGenerate={handleGenerate}
                onReset={handleReset}
                isLoadingProducts={isLoadingProducts}
                isLoadingVersions={isLoadingVersions}
                isGenerating={isGenerating}
            />

            {/* Error Display */}
            {errorMessage && (
                <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-xs text-destructive flex items-start gap-3"
                >
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="space-y-1 flex-1">
                        <div className="font-semibold">Unable to generate report</div>
                        <div>{errorMessage}</div>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerate}
                        className="h-7 text-xs border-destructive/30 hover:bg-destructive/20 text-destructive"
                    >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Retry
                    </Button>
                </motion.div>
            )}

            {/* Content Area */}
            {isGenerating ? (
                <div className="rounded-xl border bg-card p-12 text-center shadow-xs flex flex-col items-center justify-center space-y-3">
                    <Sparkles className="h-8 w-8 text-primary animate-spin" />
                    <div className="text-sm font-semibold text-foreground">Decomposing Multi-Level Bill of Materials...</div>
                    <p className="text-xs text-muted-foreground max-w-sm">
                        Traversing assembly routes, computing scrap factors, and rolling up unit material valuations.
                    </p>
                </div>
            ) : reportData ? (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-4"
                >
                    <BOMCostingSummaryCards data={reportData} />
                    <BOMCostingTreeTable data={reportData} />
                </motion.div>
            ) : (
                <div className="rounded-xl border border-dashed bg-card/50 p-12 text-center shadow-xs flex flex-col items-center justify-center space-y-3">
                    <div className="p-3 rounded-full bg-primary/10 text-primary">
                        <Layers className="h-6 w-6" />
                    </div>
                    <div className="space-y-1">
                        <div className="text-sm font-semibold text-foreground">No Costing Report Generated Yet</div>
                        <p className="text-xs text-muted-foreground max-w-md">
                            Select a target product and active manufacturing version above, adjust the target batch size if desired, and click <strong>Generate Costing Report</strong>.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
