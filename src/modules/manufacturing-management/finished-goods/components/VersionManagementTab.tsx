"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitFork, Briefcase, Calculator, Sparkles, XCircle, Clock, CheckCircle2, Star, Send, AlertCircle, Undo2, Archive, Edit3, Loader2 } from "lucide-react";
import { RoutesBOMTab } from "./RoutesBOMTab";
import { DirectLaborStandardsTab } from "./DirectLaborStandardsTab";
import { OverheadManagementTab } from "./OverheadManagementTab";
import { ProductVersion, RouteStep, OperationType, OverheadType, WorkCenter, QATemplate, Unit, BFFCatalogProduct } from "../types";

export interface ActiveDraftInfo {
    draft_id?: number | string;
    version_name?: string;
    status?: string;
    [key: string]: unknown;
}

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
    onCreateRevision?: (version: ProductVersion) => void;
    onCancelRevision?: () => void;
    onReopenDraft?: () => void;
    isReopeningDraft?: boolean;
    activeDraft?: ActiveDraftInfo | null;
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
    isSyncingYield,
    handleSyncHistoricalYield,
    isVersionLocked = false,
    onSetPrimary,
    onSubmitForApproval,
    onCreateRevision,
    onCancelRevision,
    onReopenDraft,
    isReopeningDraft = false,
    activeDraft
}: VersionManagementTabProps) {
    const [userSubTab, setVersionSubTab] = useState<"routes_bom" | "direct_labor" | "overheads">("routes_bom");
    const versionSubTab = activeTab === "routes_bom" ? "routes_bom" : userSubTab;

    const hasActiveDraft = Boolean(activeDraft);
    const isPrimary = Boolean(selectedVersion?.is_primary);
    const isActive = selectedVersion?.status === "Active" || selectedVersion?.is_active === true;
    const isRevision = selectedVersion?.status === "Revision" || selectedVersion?.status === "Revision Required";

    return (
        <div className="space-y-6">
            {/* 1. Superseded Version Banner (Immutable History) */}
            {selectedVersion?.status === "Superseded" && (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-slate-500/30 bg-slate-500/10 px-4 py-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        <Archive className="h-4 w-4 text-slate-600 dark:text-slate-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                Superseded Specification (Immutable History) — <span className="font-extrabold">{selectedVersion.version_name}</span>
                            </p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                                This specification has been superseded by a newer approved revision. It is preserved permanently for historical tracking and Job Order audit trails. Inputs are strictly locked.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* 2. Rejected Version Banner (Immutable Record) */}
            {selectedVersion?.status === "Rejected" && (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 flex-wrap">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                        <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-rose-700 dark:text-rose-300">
                                Version Rejected (Immutable History) — <span className="font-extrabold">{selectedVersion.version_name}</span>
                            </p>
                            <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 font-medium">
                                <strong>Reason:</strong> {selectedVersion.rejection_reason || selectedVersion.approval_remarks || "No rejection reason provided."}
                            </p>
                            <p className="text-[10px] text-rose-600/80 dark:text-rose-400/80 mt-1">
                                This version is an immutable historical record and cannot be edited directly. Revise this specification to address reviewer feedback.
                            </p>
                        </div>
                    </div>
                    {onCreateRevision && (
                        <button
                            type="button"
                            onClick={() => onCreateRevision(selectedVersion)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0 self-center"
                            title="Revise this rejected specification to address feedback"
                        >
                            <GitFork className="h-3.5 w-3.5" /> Revise Specification
                        </button>
                    )}
                </div>
            )}

            {/* 3. Pending Approval Review Banner */}
            {(selectedVersion?.status === "Pending Approval" || selectedVersion?.status === "For Approval") && (
                <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
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
                    <div className="flex items-center gap-2 shrink-0">
                        {onReopenDraft && (
                            <button
                                type="button"
                                onClick={onReopenDraft}
                                disabled={isReopeningDraft}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0 disabled:opacity-50"
                                title="Cancel submission and edit again to submit for approval again"
                            >
                                {isReopeningDraft ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Edit3 className="h-3.5 w-3.5" />
                                )}
                                Cancel & Edit Again
                            </button>
                        )}
                        {onCancelRevision && (hasActiveDraft || selectedVersion.is_draft || selectedVersion.version_name?.toLowerCase().includes("rev")) && (
                            <button
                                type="button"
                                onClick={onCancelRevision}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 text-destructive px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0"
                                title="Cancel revision and restore the approved baseline"
                            >
                                <Undo2 className="h-3.5 w-3.5" /> Cancel Revision
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* 4. Active Version Banner */}
            {isActive && selectedVersion && !selectedVersion.is_draft && !isRevision && (
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
                                        <Star className="h-2.5 w-2.5 fill-emerald-500 text-emerald-500" /> Primary Recipe (Active for Current Job Orders)
                                    </span>
                                ) : null}
                            </div>
                            <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">
                                This version is active and approved for manufacturing. Inputs are locked to protect production integrity.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {hasActiveDraft && onCreateRevision ? (
                            <button
                                type="button"
                                onClick={() => onCreateRevision(selectedVersion)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                title="Open the revision draft currently in progress"
                            >
                                <Edit3 className="h-3.5 w-3.5" /> Continue Revision Draft
                            </button>
                        ) : onCreateRevision ? (
                            <button
                                type="button"
                                onClick={() => onCreateRevision(selectedVersion)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                title="Revise this approved specification (creates an isolated draft revision)"
                            >
                                <GitFork className="h-3.5 w-3.5" /> Revise Specification
                            </button>
                        ) : null}
                        {!isPrimary && selectedVersion.version_id > 0 && onSetPrimary && (
                            <button
                                type="button"
                                onClick={() => onSetPrimary(selectedVersion.version_id, selectedVersion.version_name)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                title="Set as the Primary active recipe for current job orders"
                            >
                                <Star className="h-3.5 w-3.5 fill-white" /> Make Primary
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* 4. Revision Required / Active Draft Banner (Editable) */}
            {(selectedVersion?.status === "Draft" || selectedVersion?.status === "Revision Required" || (selectedVersion?.is_draft && selectedVersion?.status !== "Pending Approval" && selectedVersion?.status !== "For Approval")) && selectedVersion && !isVersionLocked && (
                <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex-wrap">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                        <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-amber-700 dark:text-amber-300">
                                {hasActiveDraft ? "Revision Draft (In Editor)" : "Revision Required (In Editor)"} — <span className="font-extrabold">{selectedVersion.version_name}</span>
                                {hasActiveDraft && (
                                    <span className="ml-2 bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/30 text-[10px] font-extrabold px-2 py-0.5 rounded uppercase">
                                        Draft #{String(activeDraft?.draft_id ?? "")}
                                    </span>
                                )}
                            </p>
                            {(selectedVersion.approval_remarks || selectedVersion.rejection_reason) && (
                                <p className="text-[11px] text-amber-800 dark:text-amber-200 mt-1 font-medium bg-amber-500/15 p-2 rounded-lg border border-amber-500/20">
                                    <strong>Reviewer Feedback / Instructions:</strong> {selectedVersion.approval_remarks || selectedVersion.rejection_reason}
                                </p>
                            )}
                            <p className="text-[11px] text-amber-700/90 dark:text-amber-300/90 mt-1">
                                {hasActiveDraft
                                    ? "You are working on an isolated revision draft. Production job orders continue using the approved baseline until this draft is submitted and approved by QA."
                                    : "This version is under revision and can be edited. Update the BOM, workstation routings, labor standards, and overheads below. When finished, click \"Submit for Approval\" to resubmit for review."}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 self-center">
                        {onCancelRevision && (
                            <button
                                type="button"
                                onClick={onCancelRevision}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 bg-destructive/10 hover:bg-destructive/20 text-destructive px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                title="Discard draft modifications and restore the approved baseline"
                            >
                                <Undo2 className="h-3.5 w-3.5" /> Cancel Revision Draft
                            </button>
                        )}
                        {onSubmitForApproval && selectedVersionId !== null && (
                            <button
                                type="button"
                                onClick={() => onSubmitForApproval(selectedVersionId)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-bold transition-all cursor-pointer shadow-2xs"
                                title="Resubmit for QA Approval"
                            >
                                <Send className="h-3.5 w-3.5" /> Submit for Approval
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* 5. In-Memory Draft Info Banner */}
            {!isVersionLocked && !isRevision && !hasActiveDraft && selectedVersionId !== null && (selectedVersionId < 0 || selectedVersion?.status === "Draft") && (
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
