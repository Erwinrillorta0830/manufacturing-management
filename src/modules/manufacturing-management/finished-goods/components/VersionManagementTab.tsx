"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitFork, Briefcase, Calculator, Sparkles, XCircle, Clock, CheckCircle2, Star, Send, AlertCircle } from "lucide-react";
import { RoutesBOMTab } from "./RoutesBOMTab";
import { DirectLaborStandardsTab } from "./DirectLaborStandardsTab";
import { OverheadManagementTab } from "./OverheadManagementTab";
import { ProductVersion, RouteStep, OperationType, OverheadType, WorkCenter, QATemplate, Unit, BFFCatalogProduct } from "../types";

export interface VersionManagementTabProps {
    selectedProductId?: string;
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
    activeTab?: string;
    setHasUnsavedChanges: (val: boolean) => void;
    isSyncingYield?: boolean;
    handleSyncHistoricalYield?: () => Promise<void>;
    /** When true, all BOM/routing/labor/overhead fields are locked (read-only). Triggered by Active, Pending Approval, or Rejected status. Draft and Revision statuses remain editable. */
    isVersionLocked?: boolean;
    onSetPrimary?: (versionId: number, versionName?: string) => void;
    onSubmitForApproval?: (versionId?: number) => void;
}

export function VersionManagementTab({
    activeTab,
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
    isVersionLocked = false,
    onSetPrimary,
    onSubmitForApproval
}: VersionManagementTabProps) {
    const [userSubTab, setVersionSubTab] = useState<"routes_bom" | "direct_labor" | "overheads">("routes_bom");
    const versionSubTab = activeTab === "routes_bom" ? "routes_bom" : userSubTab;

    const isPrimary = Boolean(selectedVersion?.is_primary);
    const isActive = selectedVersion?.status === "Active" || selectedVersion?.is_active === true;
    const isRevision = selectedVersion?.status === "Revision" || selectedVersion?.status === "Revision Required";

    return (
        <div className="space-y-6">
            {/* 1. Rejected Version Banner (Immutable Record) */}
            {selectedVersion?.status === "Rejected" && (
                <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3">
                    <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-xs font-bold text-rose-700 dark:text-rose-300">
                            Version Rejected (Immutable History) — <span className="font-extrabold">{selectedVersion.version_name}</span>
                        </p>
                        <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-medium">
                            <strong>Reason:</strong> {selectedVersion.rejection_reason || selectedVersion.approval_remarks || "No rejection reason provided."}
                        </p>
                        <p className="text-[10px] text-rose-600/80 dark:text-rose-400/80 mt-1">
                            This version is an immutable historical record and cannot be edited. To revise this recipe, create a new version on the sidebar and select this version as the base template.
                        </p>
                    </div>
                </div>
            )}

            {/* 2. Pending Approval Review Banner */}
            {(selectedVersion?.status === "Pending Approval" || selectedVersion?.status === "For Approval") && (
                <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
                    <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <div className="flex-1">
                        <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
                            Pending Approval Review — <span className="font-extrabold">{selectedVersion.version_name}</span>
                        </p>
                        <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-0.5">
                            This version has been submitted for QA and engineering review. All recipe parameters and routings are locked in read-only mode pending authorization.
                        </p>
                    </div>
                </div>
            )}

            {/* 3. Active Version Banner */}
            {isActive && selectedVersion && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                    Active Production Version — <span className="font-extrabold">{selectedVersion.version_name}</span>
                                </p>
                                {isPrimary ? (
                                    <span className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase flex items-center gap-1">
                                        <Star className="h-2.5 w-2.5 fill-emerald-500 text-emerald-500" /> Primary Recipe
                                    </span>
                                ) : null}
                            </div>
                            <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                                This version is active and approved for manufacturing job orders. Inputs are locked to protect production integrity.
                            </p>
                        </div>
                    </div>
                    {!isPrimary && selectedVersion.version_id > 0 && onSetPrimary && (
                        <button
                            type="button"
                            onClick={() => onSetPrimary(selectedVersion.version_id, selectedVersion.version_name)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0"
                            title="Set as the Primary active recipe for production job orders"
                        >
                            <Star className="h-3.5 w-3.5 fill-white" /> Make Primary
                        </button>
                    )}
                </div>
            )}

            {/* 4. Revision Required Banner (Editable) */}
            {isRevision && selectedVersion && !isVersionLocked && (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                                Revision Required (In Editor) — <span className="font-extrabold">{selectedVersion.version_name}</span>
                            </p>
                            {(selectedVersion.approval_remarks || selectedVersion.rejection_reason) && (
                                <p className="text-[11px] text-amber-800 dark:text-amber-200 mt-1 font-medium bg-amber-500/15 p-2 rounded-lg border border-amber-500/20">
                                    <strong>Reviewer Feedback / Instructions:</strong> {selectedVersion.approval_remarks || selectedVersion.rejection_reason}
                                </p>
                            )}
                            <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90 mt-1">
                                This version is under revision and can be edited. Update the BOM, workstation routings, labor standards, and overheads below. When finished, click <strong>&quot;Submit for Approval&quot;</strong> to resubmit for review.
                            </p>
                        </div>
                    </div>
                    {onSubmitForApproval && selectedVersionId !== null && (
                        <button
                            type="button"
                            onClick={() => onSubmitForApproval(selectedVersionId)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0 self-center"
                            title="Resubmit for QA Approval"
                        >
                            <Send className="h-3.5 w-3.5" /> Submit for Approval
                        </button>
                    )}
                </div>
            )}

            {/* 5. In-Memory Draft Info Banner */}
            {!isVersionLocked && !isRevision && selectedVersionId !== null && (selectedVersionId < 0 || selectedVersion?.status === "Draft") && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 px-4 py-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                        <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-blue-700 dark:text-blue-300">
                                Draft Version (In Editor) — <span className="font-extrabold">{selectedVersion?.version_name || "New Version"}</span>
                            </p>
                            <p className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-0.5">
                                Configure your routing steps, BOM ingredients, direct labor standards, and overheads below. When finished, click <strong>&quot;Submit for Approval&quot;</strong> to save to the database and submit for QA review.
                            </p>
                        </div>
                    </div>
                    {onSubmitForApproval && (
                        <button
                            type="button"
                            onClick={() => onSubmitForApproval(selectedVersionId)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0"
                            title="Submit for QA Approval"
                        >
                            <Send className="h-3.5 w-3.5" /> Submit for Approval
                        </button>
                    )}
                </div>
            )}

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

            <AnimatePresence mode="wait">
                <motion.div
                    key={versionSubTab}
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    transition={{ duration: 0.14, ease: "easeOut" }}
                >
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
                            isVersionLocked={isVersionLocked}
                        />
                    ) : versionSubTab === "direct_labor" ? (
                        <DirectLaborStandardsTab
                            editedVersionDetails={editedVersionDetails}
                            setEditedVersionDetails={setEditedVersionDetails}
                            setHasUnsavedChanges={setHasUnsavedChanges}
                            isVersionLocked={isVersionLocked}
                        />
                    ) : (
                        <OverheadManagementTab
                            overheadTypes={overheadTypes}
                            setOverheadTypes={setOverheadTypes}
                            editedVersionDetails={editedVersionDetails}
                            setEditedVersionDetails={setEditedVersionDetails}
                            setHasUnsavedChanges={setHasUnsavedChanges}
                            isVersionLocked={isVersionLocked}
                        />
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}
