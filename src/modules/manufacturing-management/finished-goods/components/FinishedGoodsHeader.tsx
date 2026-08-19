"use client";

import React from "react";
import {
    Layers,
    ChevronLeft,
    Plus,
    Save,
    Loader2,
    GitCompare,
    Activity,
    FileText,
    Sliders,
    Shield,
    Star,
    Clock,
    Package
} from "lucide-react";
import { Product, ProductVersion } from "../types";
import { CreatableSelect } from "./CreatableSelect";
import { resolveProductMasterStatus } from "../services/finished-goods-api";

export interface FinishedGoodsHeaderProps {
    isSidebarCollapsed: boolean;
    setIsSidebarCollapsed: (collapsed: boolean) => void;
    loadingBOM: boolean;
    savingBOM: boolean;
    onOpenRegisterParent: () => void;
    onOpenRegisterChild: () => void;
    handleSave: () => void;
    products: Product[];
    selectedProductId: string;
    setSelectedProductId: (id: string) => void;
    selectedProduct: Product | null;
    versions: ProductVersion[];
    selectedVersionId: number | null;
    hasUnsavedChanges: boolean;
    setHasUnsavedChanges: (val: boolean) => void;
    setIsCompareModalOpen: (open: boolean) => void;
    isSyncingYield: boolean;
    handleSyncHistoricalYield: () => void;
    activeTab: string;
    handleTabChange: (tab: string) => void;
}

export function FinishedGoodsHeader({
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    loadingBOM,
    savingBOM,
    onOpenRegisterParent,
    onOpenRegisterChild,
    handleSave,
    products,
    selectedProductId,
    setSelectedProductId,
    selectedProduct,
    versions,
    selectedVersionId,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    setIsCompareModalOpen,
    isSyncingYield,
    handleSyncHistoricalYield,
    activeTab,
    handleTabChange
}: FinishedGoodsHeaderProps) {
    const tabs = [
        { id: "details", label: "Product Details", icon: FileText },
        { id: "version_management", label: "Version Recipe & Routings", icon: Layers },
        { id: "costing", label: "Live Costing & Simulator", icon: Sliders },
        { id: "quality_importation", label: "Quality & Importation", icon: Shield }
    ];

    // Build hierarchical product options (Parent & Child variants)
    const productOptions = React.useMemo(() => {
        const childrenMap = new Map<string, Product[]>();
        const roots: Product[] = [];

        products.forEach(p => {
            if (p.parent_id) {
                const pIdStr = String(p.parent_id);
                if (!childrenMap.has(pIdStr)) childrenMap.set(pIdStr, []);
                childrenMap.get(pIdStr)!.push(p);
            } else {
                roots.push(p);
            }
        });

        const opts: { value: string; label: string; labelNode?: React.ReactNode; triggerNode?: React.ReactNode }[] = [];

        roots.forEach(root => {
            opts.push({
                value: root.id,
                label: `${root.title} (${root.sku || 'N/A'}) - ${root.baseUom}`,
                triggerNode: (
                    <div className="flex items-center gap-2 min-w-0">
                        <Package className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="font-bold text-foreground truncate">{root.title}</span>
                    </div>
                ),
                labelNode: (
                    <div className="flex items-center justify-between gap-3 w-full py-1 text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="p-1 rounded bg-primary/10 text-primary shrink-0">
                                <Package className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-foreground truncate">{root.title}</span>
                                    <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[8px] font-bold px-1.5 py-0.2 rounded border border-blue-500/20 shrink-0">
                                        Parent
                                    </span>
                                </div>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                    SKU: {root.sku || "N/A"} • Base: {root.baseUom}
                                </span>
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <span className="font-bold text-foreground text-xs">
                                ₱{root.targetSellingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                )
            });

            const children = childrenMap.get(root.id) || [];
            children.forEach(child => {
                opts.push({
                    value: child.id,
                    label: `  ↳ ${child.title} (${child.sku || 'N/A'}) - ${child.baseUom}`,
                    triggerNode: (
                        <div className="flex items-center gap-2 min-w-0">
                            <Layers className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="font-semibold text-foreground truncate">{child.title}</span>
                        </div>
                    ),
                    labelNode: (
                        <div className="flex items-center justify-between gap-3 w-full py-1 pl-5 text-xs">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className="p-1 rounded bg-muted text-muted-foreground shrink-0">
                                    <Layers className="h-3 w-3" />
                                </div>
                                <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="font-semibold text-foreground truncate">{child.title}</span>
                                        <span className="bg-muted text-muted-foreground text-[8px] font-bold px-1 py-0.2 rounded border shrink-0">
                                            Child
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                        SKU: {child.sku || "N/A"} • Base: {child.baseUom}
                                    </span>
                                </div>
                            </div>
                            <div className="text-right shrink-0">
                                <span className="font-semibold text-foreground text-xs">
                                    ₱{child.targetSellingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    )
                });
            });
        });

        return opts;
    }, [products]);

    const currentVer = React.useMemo(() => {
        return versions.find(v => v.version_id === selectedVersionId);
    }, [versions, selectedVersionId]);

    const isActive = currentVer?.is_active || currentVer?.status === "Active";
    const isApproved = currentVer?.status === "Approved" || currentVer?.status === "Active" || !!currentVer?.is_active;
    const isPrimary = !!currentVer?.is_primary;
    const isSubmitted = currentVer?.status === "For Approval" || currentVer?.status === "Pending Approval";
    const isRejected = currentVer?.status === "Rejected";
    const isRevision = currentVer?.status === "Revision Required";

    return (
        <>
            {/* Topbar */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b px-4 bg-muted/10 rounded-t-xl">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className="inline-flex items-center justify-center p-1.5 rounded-lg border bg-background hover:bg-muted text-muted-foreground transition-all mr-1.5 cursor-pointer"
                        title={isSidebarCollapsed ? "Expand Versions Panel" : "Collapse Versions Panel"}
                    >
                        <ChevronLeft className={`h-4 w-4 transform transition-transform duration-200 ${isSidebarCollapsed ? "rotate-180" : ""}`} />
                    </button>
                    <Layers className="h-5 w-5 text-primary" />
                    <h1 className="text-base font-bold tracking-tight">Finished Goods Master</h1>
                    {(loadingBOM || savingBOM) && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
                </div>
                <div className="flex items-center gap-2">
                    {/* Register Parent Product */}
                    <button
                        type="button"
                        onClick={onOpenRegisterParent}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 shadow-2xs transition-all cursor-pointer"
                        title="Register a Primary Manufactured Good"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Register Parent Product
                    </button>

                    {/* Register Child Variant */}
                    <button
                        type="button"
                        onClick={onOpenRegisterChild}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-background px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 shadow-2xs transition-all cursor-pointer"
                        title="Register a Packaged Child Variant"
                    >
                        <Layers className="h-3.5 w-3.5 text-primary" />
                        Register Child Variant
                    </button>

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={savingBOM || !selectedProduct}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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

            {/* Active Product Header Bar with Searchable Product Dropdown */}
            <div className="px-5 py-3 border-b bg-card flex flex-col md:flex-row md:items-center md:justify-between gap-4 shrink-0 shadow-sm">
                {/* Left: Product Selector Dropdown + Metadata */}
                <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        {/* Searchable Product Dropdown */}
                        <div className="w-full sm:w-80 md:w-96">
                            <CreatableSelect
                                options={productOptions}
                                value={selectedProductId}
                                onValueChange={(val) => {
                                    if (hasUnsavedChanges) {
                                        if (!confirm("You have unsaved changes. Are you sure you want to switch products?")) return;
                                        setHasUnsavedChanges(false);
                                    }
                                    setSelectedProductId(val);
                                }}
                                placeholder="Select a finished good product..."
                                searchPlaceholder="Search products by name or SKU..."
                                popoverClassName="w-[440px] md:w-[500px]"
                                className="h-9 text-xs font-bold bg-background shadow-2xs border-border hover:border-primary focus:border-primary transition-all"
                            />
                        </div>

                        {selectedProduct && (
                            <>
                                {selectedProduct.parentProduct ? (
                                    <span className="bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase border border-blue-500/20 shrink-0">
                                        Parent Good
                                    </span>
                                ) : (
                                    <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded text-[10px] font-bold uppercase border shrink-0">
                                        Child Variant
                                    </span>
                                )}

                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border shrink-0 ${
                                    resolveProductMasterStatus(selectedProduct.status, selectedProduct.isActive) === "Inactive"
                                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                                        : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                }`}>
                                    Master Status: {resolveProductMasterStatus(selectedProduct.status, selectedProduct.isActive)}
                                </span>
                            </>
                        )}
                    </div>

                    {selectedProduct && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>SKU: <strong className="text-foreground font-semibold">{selectedProduct.sku || "N/A"}</strong></span>
                            <span>Base UOM: <strong className="text-foreground font-semibold">{selectedProduct.baseUom}</strong></span>
                            {selectedProduct.barcode && (
                                <span>Barcode: <strong className="text-foreground font-semibold">{selectedProduct.barcode}</strong></span>
                            )}
                        </div>
                    )}
                </div>

                {/* Right: Active Version Badge & Quick Action Toolbar */}
                {selectedProduct && (
                    <div className="flex flex-wrap items-center gap-3 self-start md:self-center shrink-0">
                        {currentVer && (
                            <div className="flex items-center gap-1.5 pr-2 border-r border-muted">
                                <span className="text-[11px] font-semibold text-muted-foreground">Version:</span>
                                <span className="text-xs font-bold text-foreground">{currentVer.version_name}</span>
                                {isPrimary && (
                                    <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase flex items-center gap-0.5 shrink-0">
                                        <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" /> Primary Default
                                    </span>
                                )}
                                {isActive ? (
                                    <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase shrink-0">
                                        {isPrimary ? "Active" : "Active Alternate"}
                                    </span>
                                ) : isApproved ? (
                                    <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase shrink-0">
                                        Approved
                                    </span>
                                ) : isSubmitted ? (
                                    <span className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-[9px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
                                        <Clock className="h-2.5 w-2.5" /> Pending Approval
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
                                        {currentVer.status || "Draft"}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Compare Matrix Button */}
                        <button
                            type="button"
                            onClick={() => setIsCompareModalOpen(true)}
                            disabled={versions.length < 2}
                            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                            <GitCompare className="h-3.5 w-3.5 text-indigo-500" />
                            Compare Matrix
                        </button>

                        {/* Sync Yield Button */}
                        <button
                            type="button"
                            onClick={handleSyncHistoricalYield}
                            disabled={isSyncingYield || !selectedVersionId}
                            className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-muted transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                        >
                            {isSyncingYield ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                            ) : (
                                <Activity className="h-3.5 w-3.5 text-amber-500" />
                            )}
                            Sync Yield
                        </button>

                        {/* Target Selling Price */}
                        <div className="flex flex-col text-right pl-3 border-l border-muted">
                            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Target Selling Price</span>
                            <span className="text-sm font-extrabold text-foreground tracking-tight">
                                ₱{selectedProduct.targetSellingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                )}
            </div>


            {/* Module Tab Navigation Bar */}
            <div className="flex border-b border-border/60 gap-1 bg-muted/20 px-6 pt-2 shrink-0 overflow-x-auto">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => {
                                handleTabChange(tab.id);
                            }}
                            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer whitespace-nowrap ${
                                isActive
                                    ? "border-primary text-primary bg-background rounded-t-lg shadow-xs"
                                    : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-t-lg"
                            }`}
                        >
                            <Icon className={`h-4 w-4 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>
        </>
    );
}
