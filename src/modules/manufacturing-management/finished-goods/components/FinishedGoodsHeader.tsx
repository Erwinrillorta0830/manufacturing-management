"use client";

import React from "react";
import {
    Layers,
    ChevronLeft,
    Plus,
    Save,
    Send,
    Loader2,
    FileText,
    Sliders,
    Shield,
    Package,
    Star,
    Clock
} from "lucide-react";
import { Product, ProductVersion } from "../types";
import { CreatableSelect } from "./CreatableSelect";


export interface FinishedGoodsHeaderProps {
    isSidebarCollapsed: boolean;
    setIsSidebarCollapsed: (collapsed: boolean) => void;
    loadingBOM: boolean;
    loadingProducts?: boolean;
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
    selectedVersion?: ProductVersion | null;
    setSelectedVersionId?: (id: number) => void;
    versionCosts?: Record<number, number>;
    handleSubmitVersionForApproval?: (versionId?: number) => void;
    handleActivateVersion?: (versionId: number, action: "set_active" | "set_primary" | "deactivate") => void;
    handleOpenVersionModal?: () => void;
    hasUnsavedChanges: boolean;
    setHasUnsavedChanges: (val: boolean) => void;
    setIsCompareModalOpen: (open: boolean) => void;
    isSyncingYield: boolean;
    handleSyncHistoricalYield: () => void;
    activeTab?: string;
    handleTabChange?: (tab: string) => void;
    onRequestSwitchProduct?: (id: string) => void;
}

export function FinishedGoodsHeader({
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    loadingBOM,
    loadingProducts = false,
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
    selectedVersion,
    setSelectedVersionId,
    versionCosts = {},
    handleSubmitVersionForApproval,
    handleActivateVersion,
    handleOpenVersionModal,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    setIsCompareModalOpen,
    isSyncingYield,
    handleSyncHistoricalYield,
    activeTab,
    handleTabChange,
    onRequestSwitchProduct
}: FinishedGoodsHeaderProps) {

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

    // Build rich searchable version options
    const versionOptions = React.useMemo(() => {
        return versions.map((v) => {
            const cost = versionCosts[v.version_id];
            const costStr = cost !== undefined && cost > 0
                ? ` (Est: ₱${cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
                : "";
            const isVerActive = v.status === "Active";
            const isVerForApproval = v.status === "For Approval";

            return {
                value: String(v.version_id),
                label: `${v.version_name}${costStr}`,
                triggerNode: (
                    <div className="flex items-center justify-between gap-1.5 min-w-0 w-full">
                        <span className="font-bold text-foreground truncate">{v.version_name}</span>
                        {isVerActive ? (
                            <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase flex items-center gap-0.5 shrink-0">
                                <Star className="h-2.5 w-2.5 fill-emerald-500 text-emerald-500" /> Active
                            </span>
                        ) : isVerForApproval ? (
                            <span className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-[9px] font-semibold px-1.5 py-0.2 rounded flex items-center gap-0.5 shrink-0">
                                <Clock className="h-2.5 w-2.5" /> For Approval
                            </span>
                        ) : (
                            <span className="bg-muted text-muted-foreground border text-[9px] font-bold px-1.5 py-0.2 rounded uppercase shrink-0">
                                Inactive
                            </span>
                        )}
                    </div>
                ),
                labelNode: (
                    <div className="flex items-center justify-between gap-3 w-full py-1 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                            <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                            <div className="flex flex-col min-w-0">
                                <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-foreground truncate">{v.version_name}</span>
                                    {isVerActive ? (
                                        <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[8px] font-extrabold px-1.5 py-0.2 rounded uppercase flex items-center gap-0.5 shrink-0">
                                            <Star className="h-2 w-2 fill-emerald-500 text-emerald-500" /> Active
                                        </span>
                                    ) : isVerForApproval ? (
                                        <span className="bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/30 text-[8px] font-semibold px-1.5 py-0.2 rounded flex items-center gap-0.5 shrink-0">
                                            <Clock className="h-2 w-2" /> For Approval
                                        </span>
                                    ) : (
                                        <span className="bg-muted text-muted-foreground border text-[8px] font-bold px-1.5 py-0.2 rounded uppercase shrink-0">
                                            Inactive
                                        </span>
                                    )}
                                </div>
                                <span className="text-[10px] text-muted-foreground">
                                    Yield: {v.expected_yield_percentage || 100}% • Batch: {v.base_quantity || 1}
                                </span>
                            </div>
                        </div>
                        {cost !== undefined && cost > 0 && (
                            <div className="text-right shrink-0">
                                <span className="font-bold text-foreground text-xs">
                                    ₱{cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        )}
                    </div>
                )
            };
        });
    }, [versions, versionCosts]);

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

            {/* Product Selector Sub-header */}
            <div className="px-5 py-3 border-b bg-card flex items-center gap-3 shrink-0 shadow-sm">
                {/* Searchable Product Dropdown */}
                <div className="w-full sm:w-80 md:w-96">
                    <CreatableSelect
                        options={productOptions}
                        value={selectedProductId}
                        isLoading={loadingProducts || (products.length === 0 && loadingBOM)}
                        onValueChange={(val) => {
                            if (onRequestSwitchProduct) {
                                onRequestSwitchProduct(val);
                            } else {
                                setSelectedProductId(val);
                            }
                        }}
                        placeholder={loadingProducts ? "Loading products..." : "Select a finished good product..."}
                        searchPlaceholder="Search products by name or SKU..."
                        popoverClassName="w-[440px] md:w-[500px]"
                        className="h-9 text-xs font-bold bg-background shadow-2xs border-border hover:border-primary focus:border-primary transition-all"
                    />
                </div>
                {loadingProducts && !selectedProduct ? (
                    <div className="flex items-center gap-3 text-xs animate-pulse">
                        <div className="h-3.5 w-20 bg-muted rounded" />
                        <div className="h-3.5 w-24 bg-muted rounded" />
                    </div>
                ) : selectedProduct ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                        <span className="font-mono text-[11px]">SKU: <strong className="text-foreground font-semibold">{selectedProduct.sku || "N/A"}</strong></span>
                        <span className="font-mono text-[11px]">Base UOM: <strong className="text-foreground font-semibold">{selectedProduct.baseUom}</strong></span>
                        {selectedProduct.targetSellingPrice > 0 && (
                            <span className="font-mono text-[11px]">Selling Price: <strong className="text-foreground font-semibold">₱{selectedProduct.targetSellingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                        )}
                    </div>
                ) : null}
            </div>
        </>
    );
}
