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
    Briefcase
} from "lucide-react";
import { Product, ProductVersion } from "../types";

export interface FinishedGoodsHeaderProps {
    isSidebarCollapsed: boolean;
    setIsSidebarCollapsed: (collapsed: boolean) => void;
    loadingBOM: boolean;
    savingBOM: boolean;
    onOpenRegisterParent: () => void;
    onOpenRegisterChild: () => void;
    handleSave: () => void;
    selectedProduct: Product | null;
    versions: ProductVersion[];
    versionCosts: Record<number, number>;
    selectedVersionId: number | null;
    setSelectedVersionId: (id: number | null) => void;
    hasUnsavedChanges: boolean;
    setHasUnsavedChanges: (val: boolean) => void;
    handleActivateVersion: (versionId?: number, deactivateAll?: boolean) => void;
    handleOpenVersionModal: () => void;
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
    selectedProduct,
    versions,
    versionCosts,
    selectedVersionId,
    setSelectedVersionId,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    handleActivateVersion,
    handleOpenVersionModal,
    setIsCompareModalOpen,
    isSyncingYield,
    handleSyncHistoricalYield,
    activeTab,
    handleTabChange
}: FinishedGoodsHeaderProps) {
    const tabs = [
        { id: "details", label: "Product Details", icon: FileText },
        { id: "version_management", label: "Version Management", icon: Layers },
        { id: "costing", label: "Live Costing & Simulator", icon: Sliders },
        { id: "qa_templates", label: "QA Checklist Templates", icon: Shield },
        { id: "importation", label: "Importation & Landed Cost", icon: Briefcase }
    ];

    return (
        <>
            {/* Topbar */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b px-4 bg-muted/10 rounded-t-xl">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                        className="inline-flex items-center justify-center p-1.5 rounded-lg border bg-background hover:bg-muted text-muted-foreground transition-all mr-1.5 cursor-pointer"
                        title={isSidebarCollapsed ? "Expand Product Catalog" : "Collapse Product Catalog"}
                    >
                        <ChevronLeft className={`h-4 w-4 transform transition-transform duration-200 ${isSidebarCollapsed ? "rotate-180" : ""}`} />
                    </button>
                    <Layers className="h-5 w-5 text-primary" />
                    <h1 className="text-base font-bold tracking-tight">Finished Goods Master</h1>
                    {(loadingBOM || savingBOM) && <Loader2 className="h-4 w-4 text-muted-foreground animate-spin" />}
                </div>
                <div className="flex items-center gap-2">
                    {/* Register Parent Good (Piece) */}
                    <button
                        type="button"
                        onClick={onOpenRegisterParent}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/95 shadow-2xs transition-all cursor-pointer"
                        title="Register a Primary Manufactured Good (Piece / Individual Pouch)"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Register Parent (Piece)
                    </button>

                    {/* Register Child Variant (Box / Case) */}
                    <button
                        type="button"
                        onClick={onOpenRegisterChild}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-background px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10 shadow-2xs transition-all cursor-pointer"
                        title="Register a Packaged Child Variant (Box / Case / Mother Bag)"
                    >
                        <Layers className="h-3.5 w-3.5 text-primary" />
                        Register Child (Box)
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

            {/* Active Product Header Bar */}
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
                                            type="button"
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
                                                type="button"
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
                                        type="button"
                                        onClick={handleOpenVersionModal}
                                        className="inline-flex items-center gap-1 rounded bg-muted border px-2 py-1 text-xs font-semibold hover:bg-accent transition-colors text-foreground cursor-pointer"
                                        title="Register New Version"
                                    >
                                        <Plus className="h-3 w-3" /> New
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setIsCompareModalOpen(true)}
                                        className="inline-flex items-center gap-1 rounded bg-primary/10 border border-primary/20 px-2 py-1 text-xs font-semibold hover:bg-primary/20 transition-colors text-primary cursor-pointer"
                                        title="Compare BOM versions side-by-side"
                                    >
                                        <GitCompare className="h-3 w-3" /> Compare Matrix
                                    </button>

                                    <button
                                        type="button"
                                        disabled={isSyncingYield}
                                        onClick={handleSyncHistoricalYield}
                                        className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-xs font-semibold hover:bg-amber-500/20 transition-colors text-amber-700 dark:text-amber-300 cursor-pointer disabled:opacity-50"
                                        title="Sync expected yield from completed Job Order production records"
                                    >
                                        <Activity className={`h-3 w-3 ${isSyncingYield ? "animate-spin" : ""}`} /> Sync Yield
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

            {/* Tab Navigation Controls */}
            <div className="flex border-b px-4 bg-muted/10 shrink-0">
                {tabs.map((t) => {
                    const Icon = t.icon;
                    const isActive = activeTab === t.id || (t.id === "version_management" && activeTab === "routes_bom");
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => handleTabChange(t.id === "version_management" ? "version_management" : t.id)}
                            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                                isActive
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
        </>
    );
}
