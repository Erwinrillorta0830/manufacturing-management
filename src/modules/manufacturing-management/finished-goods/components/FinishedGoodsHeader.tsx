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
    Briefcase,
    Star
} from "lucide-react";
import { Product, ProductVersion } from "../types";
import { CreatableSelect } from "./CreatableSelect";

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
    handleActivateVersion: (
        versionId?: number,
        action?: "set_active" | "set_primary" | "deactivate" | "deactivate_all",
        deactivateAll?: boolean
    ) => void;
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

    const versionOptions = React.useMemo(() => {
        return versions.map((v) => {
            const cost = versionCosts[v.version_id];
            const costStr = cost !== undefined && cost > 0 ? ` (Est: ₱${cost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})` : "";
            const statusLabel = v.is_primary ? "PRIMARY DEFAULT" : v.is_active ? "ACTIVE ALTERNATE" : (v.status || "DRAFT");
            
            return {
                value: String(v.version_id),
                label: `${v.version_name} [${statusLabel}]${costStr}`,
                labelNode: (
                    <div className="flex items-center justify-between gap-3 w-full text-xs">
                        <span className="font-bold truncate">{v.version_name}{costStr}</span>
                        {v.is_primary ? (
                            <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase flex items-center gap-0.5 shrink-0">
                                <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" /> Primary
                            </span>
                        ) : v.is_active || v.status === "Active" ? (
                            <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[9px] font-extrabold px-1.5 py-0.5 rounded uppercase shrink-0">
                                Active
                            </span>
                        ) : (
                            <span className="bg-muted text-muted-foreground border text-[9px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0">
                                {v.status || "Draft"}
                            </span>
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
                        title={isSidebarCollapsed ? "Expand Product Catalog" : "Collapse Product Catalog"}
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
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border shrink-0 ${
                                (selectedProduct as unknown as { status?: string }).status === "Inactive"
                                    ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                                    : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            }`}>
                                Master Status: {(selectedProduct as unknown as { status?: string }).status || "Active"}
                            </span>
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
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase">Viewing Version</label>
                            <div className="flex items-center gap-2 flex-wrap">
                                {versions.length > 0 ? (
                                    <div className="w-64">
                                        <CreatableSelect
                                            options={versionOptions}
                                            value={selectedVersionId ? String(selectedVersionId) : ""}
                                            onValueChange={(val) => {
                                                if (hasUnsavedChanges) {
                                                    if (!confirm("You have unsaved changes. Are you sure you want to switch versions?")) return;
                                                    setHasUnsavedChanges(false);
                                                }
                                                setSelectedVersionId(val ? Number(val) : null);
                                            }}
                                            placeholder="Search version..."
                                            className="h-8 text-xs bg-background font-semibold"
                                        />
                                    </div>
                                ) : (
                                    <span className="text-xs text-muted-foreground italic font-medium">No versions registered yet</span>
                                )}

                                {selectedVersionId && (() => {
                                    const currentVer = versions.find(v => v.version_id === selectedVersionId);
                                    if (!currentVer) return null;

                                    const isActive = currentVer.is_active || currentVer.status === "Active";
                                    const isApproved = currentVer.status === "Approved" || currentVer.status === "Active" || !!currentVer.is_active;
                                    const isPrimary = !!currentVer.is_primary;

                                    return (
                                        <div className="flex items-center gap-1.5">
                                            {isPrimary ? (
                                                <span className="bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                                    <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Primary Default
                                                </span>
                                            ) : isActive ? (
                                                <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider">
                                                    Active Alternate
                                                </span>
                                            ) : (
                                                <span className="bg-muted border text-muted-foreground rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider">
                                                    {currentVer.status || "Draft"}
                                                </span>
                                            )}

                                            {!isPrimary && isApproved && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (confirm(`Set version "${currentVer.version_name}" as Primary Default for master cost rollups and default Job Orders?`)) {
                                                            handleActivateVersion(selectedVersionId, "set_primary");
                                                        }
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                                    title="Designate this version as Primary Default for COGS rollup and default JO creation"
                                                >
                                                    <Star className="h-3.5 w-3.5 fill-white" /> Make Primary
                                                </button>
                                            )}

                                            {!isActive && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        handleActivateVersion(selectedVersionId, "set_active");
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                                    title="Activate this version as an alternate active BOM"
                                                >
                                                    Activate (Alternate)
                                                </button>
                                            )}

                                            {!isApproved && (
                                                <span className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[10px] font-semibold px-2 py-1 rounded flex items-center gap-1">
                                                    <span>⚠️ Unapproved — Activate first to make Primary</span>
                                                </span>
                                            )}

                                            {isActive && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (confirm(`Deactivate version "${currentVer.version_name}"?`)) {
                                                            handleActivateVersion(selectedVersionId, "deactivate");
                                                        }
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 px-2.5 py-1 text-xs font-bold text-destructive transition-all cursor-pointer"
                                                    title="Deactivate this version"
                                                >
                                                    Deactivate
                                                </button>
                                            )}
                                        </div>
                                    );
                                })()}

                                <button
                                    type="button"
                                    onClick={handleOpenVersionModal}
                                    className="inline-flex items-center gap-1 rounded bg-muted border px-2 py-1 text-xs font-semibold hover:bg-accent transition-colors text-foreground cursor-pointer"
                                    title="Register New Version"
                                >
                                    <Plus className="h-3 w-3" /> New
                                </button>

                                {versions.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => setIsCompareModalOpen(true)}
                                        className="inline-flex items-center gap-1 rounded bg-primary/10 border border-primary/20 px-2 py-1 text-xs font-semibold hover:bg-primary/20 transition-colors text-primary cursor-pointer"
                                        title="Compare BOM versions side-by-side"
                                    >
                                        <GitCompare className="h-3 w-3" /> Compare Matrix
                                    </button>
                                )}

                                {versions.length > 0 && (
                                    <button
                                        type="button"
                                        disabled={isSyncingYield}
                                        onClick={handleSyncHistoricalYield}
                                        className="inline-flex items-center gap-1 rounded bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-xs font-semibold hover:bg-amber-500/20 transition-colors text-amber-700 dark:text-amber-300 cursor-pointer disabled:opacity-50"
                                        title="Sync expected yield from completed Job Order production records"
                                    >
                                        <Activity className={`h-3 w-3 ${isSyncingYield ? "animate-spin" : ""}`} /> Sync Yield
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="text-right">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Target Selling Price</span>
                            <span className="text-sm font-extrabold text-foreground">₱{selectedProduct.targetSellingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
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
