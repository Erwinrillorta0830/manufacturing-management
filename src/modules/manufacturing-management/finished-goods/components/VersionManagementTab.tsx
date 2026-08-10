"use client";

import React, { useState } from "react";
import { GitFork, Briefcase, Calculator, Activity } from "lucide-react";
import { RoutesBOMTab } from "./RoutesBOMTab";
import { DirectLaborStandardsTab } from "./DirectLaborStandardsTab";
import { OverheadManagementTab } from "./OverheadManagementTab";
import { ProductVersion, RouteStep, OperationType, OverheadType, WorkCenter, QATemplate, Unit, BFFCatalogProduct } from "../types";

export interface VersionManagementTabProps {
    selectedProductId: string;
    selectedVersionId: number | null;
    selectedVersion: ProductVersion | null;
    editedVersionDetails: Partial<ProductVersion>;
    setEditedVersionDetails: React.Dispatch<React.SetStateAction<Partial<ProductVersion>>>;
    editedRoutes: RouteStep[];
    setEditedRoutes: React.Dispatch<React.SetStateAction<RouteStep[]>>;
    operationTypes: OperationType[];
    setOperationTypes: React.Dispatch<React.SetStateAction<OperationType[]>>;
    overheadTypes: OverheadType[];
    setOverheadTypes: React.Dispatch<React.SetStateAction<OverheadType[]>>;
    workCenters: WorkCenter[];
    qaTemplates: QATemplate[];
    units: Unit[];
    allCatalogProducts?: BFFCatalogProduct[];
    setHasUnsavedChanges: (val: boolean) => void;
    isSyncingYield: boolean;
    handleSyncHistoricalYield: () => Promise<void>;
}

export function VersionManagementTab({
    selectedProductId,
    selectedVersionId,
    selectedVersion,
    editedVersionDetails,
    setEditedVersionDetails,
    editedRoutes,
    setEditedRoutes,
    operationTypes,
    setOperationTypes,
    overheadTypes,
    setOverheadTypes,
    workCenters,
    qaTemplates,
    units,
    allCatalogProducts,
    setHasUnsavedChanges,
    isSyncingYield,
    handleSyncHistoricalYield
}: VersionManagementTabProps) {
    const [versionSubTab, setVersionSubTab] = useState<"routes_bom" | "direct_labor" | "overheads">("routes_bom");

    return (
        <div className="space-y-6">
            {/* Historical Yield Sync & Version Controls Card */}
            <div className="bg-card border rounded-xl p-4 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                        <Activity className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-foreground">Historical Yield Sync &amp; Version Specifications</h4>
                            {selectedVersion?.version_name && (
                                <span className="bg-primary/10 text-primary border border-primary/20 text-[10px] font-bold px-2 py-0.5 rounded">
                                    {selectedVersion.version_name}
                                </span>
                            )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            Target Yield: <strong className="text-foreground">{editedVersionDetails.expected_yield_percentage ?? 100}%</strong>.
                            Sync with completed Job Orders to automatically update expected yield from actual shop floor performance.
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    disabled={isSyncingYield || !selectedProductId || !selectedVersionId}
                    onClick={handleSyncHistoricalYield}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all disabled:opacity-50 cursor-pointer shrink-0"
                    title="Sync expected yield from completed Job Order production records"
                >
                    <Activity className={`h-3.5 w-3.5 ${isSyncingYield ? "animate-spin" : ""}`} />
                    {isSyncingYield ? "Syncing Historical Yield..." : "Sync Yield from Job Orders"}
                </button>
            </div>

            {/* Inner Sub-tab Navigation under Version Management */}
            <div className="flex border-b border-border/60 gap-2 bg-muted/20 px-3 pt-2 rounded-t-xl shrink-0">
                <button
                    type="button"
                    onClick={() => setVersionSubTab("routes_bom")}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                        versionSubTab === "routes_bom"
                            ? "border-primary text-primary bg-background rounded-t-lg shadow-xs"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <GitFork className="h-3.5 w-3.5" />
                    Routes &amp; BOM
                </button>
                <button
                    type="button"
                    onClick={() => setVersionSubTab("direct_labor")}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                        versionSubTab === "direct_labor"
                            ? "border-primary text-primary bg-background rounded-t-lg shadow-xs"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <Briefcase className="h-3.5 w-3.5 text-primary" />
                    Direct Labor Standards
                </button>
                <button
                    type="button"
                    onClick={() => setVersionSubTab("overheads")}
                    className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold border-b-2 transition-all -mb-[1px] cursor-pointer ${
                        versionSubTab === "overheads"
                            ? "border-primary text-primary bg-background rounded-t-lg shadow-xs"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                >
                    <Calculator className="h-3.5 w-3.5" />
                    Overhead Management
                </button>
            </div>

            {versionSubTab === "routes_bom" ? (
                <RoutesBOMTab
                    editedRoutes={editedRoutes}
                    setEditedRoutes={setEditedRoutes}
                    operationTypes={operationTypes}
                    workCenters={workCenters}
                    qaTemplates={qaTemplates}
                    units={units}
                    catalogProducts={allCatalogProducts}
                    setHasUnsavedChanges={setHasUnsavedChanges}
                    setOperationTypes={setOperationTypes}
                    editedVersionDetails={editedVersionDetails}
                    setEditedVersionDetails={setEditedVersionDetails}
                />
            ) : versionSubTab === "direct_labor" ? (
                <DirectLaborStandardsTab
                    editedVersionDetails={editedVersionDetails}
                    setEditedVersionDetails={setEditedVersionDetails}
                    setHasUnsavedChanges={setHasUnsavedChanges}
                />
            ) : (
                <OverheadManagementTab
                    overheadTypes={overheadTypes}
                    setOverheadTypes={setOverheadTypes}
                    editedVersionDetails={editedVersionDetails}
                    setEditedVersionDetails={setEditedVersionDetails}
                    setHasUnsavedChanges={setHasUnsavedChanges}
                />
            )}
        </div>
    );
}
