/* eslint-disable */
"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { Loader2, RefreshCw, ClipboardList, Layers, Database, Printer, Factory, AlertTriangle, History, Pencil, Check, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { usePlanningEngineering } from "./hooks/usePlanningEngineering";
import { NetRequirementsTable } from "./components/NetRequirementsTable";
import { ConsolidationPanel } from "./components/ConsolidationPanel";
import { DemandLinesTable } from "./components/DemandLinesTable";
import { InProductionSalesOrdersTable } from "./components/InProductionSalesOrdersTable";
import { ReleaseJODialog } from "./components/ReleaseJODialog";
import { CreateBufferJODialog } from "./components/CreateBufferJODialog";
import { PlanningSummaryCards } from "./components/PlanningSummaryCards";
import { JOFilterBar } from "./components/JOFilterBar";
import { JOTable } from "./components/JOTable";
import { JobOrderTraveler } from "./components/JobOrderTraveler";
import { fetchJobMaterials } from "./services/planning-api";
import Link from "next/link";
import { resolveJobOrderJourney } from "../shared/job-order-journey";
import { JobOrderJourneyBar } from "../shared/components/JobOrderJourneyBar";
import { JobOrderStatusBadge } from "../shared/components/JobOrderStatusBadge";
import { NextStepCallout } from "../shared/components/NextStepCallout";
import { StatusLegendPopover } from "../shared/components/StatusLegendPopover";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isCancelledJobOrderStatus, isJobOrderStatus, isTerminatedJobOrder, JOB_ORDER_STATUS, normalizeJobOrderStatus } from "../job-order-status";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type MaterialLoadState = {
    status: "idle" | "loading" | "success" | "error";
    message?: string;
};

function MaterialLoadErrorState({ message, onRetry }: { message?: string; onRetry: () => void }) {
    return (
        <div role="alert" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-500/30 bg-red-500/5 px-6 py-8 text-center">
            <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
            <div className="space-y-1">
                <p className="font-bold text-red-700 dark:text-red-300">Required materials unavailable</p>
                <p className="max-w-xl text-sm text-muted-foreground">
                    {message || "The BOM could not be loaded."} Allocation and release are disabled until the materials are available.
                </p>
            </div>
            <Button type="button" variant="outline" onClick={onRetry} className="font-bold border-red-500/30 text-red-700 hover:bg-red-500/10 dark:text-red-300">
                Retry materials
            </Button>
        </div>
    );
}

function NoMaterialsState() {
    return (
        <div role="status" className="flex flex-col items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-6 py-8 text-center">
            <Database className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
            <p className="font-bold text-emerald-700 dark:text-emerald-300">No materials required</p>
            <p className="text-sm text-muted-foreground">This Job Order has no BOM material rows. Material reservation is not applicable.</p>
        </div>
    );
}

function matchesJobOrderSearch(jobOrder: any, searchQuery: string): boolean {
    const query = searchQuery.toLowerCase().trim();
    return !query
        || String(jobOrder.jo_id || "").toLowerCase().includes(query)
        || String(jobOrder.product_name || "").toLowerCase().includes(query)
        || String(jobOrder.remarks || "").toLowerCase().includes(query);
}

function JobOrderStatusHistoryPanel({ history }: { history?: any[] }) {
    const rows = Array.isArray(history) ? history : [];
    if (rows.length === 0) return null;

    return (
        <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Status history</h3>
            </div>
            <div className="space-y-2">
                {rows.slice(0, 8).map((entry, index) => {
                    const previous = entry.old_status || entry.previous_status || "Created";
                    const next = entry.new_status || "Unknown";
                    const changedAt = entry.changed_at ? new Date(entry.changed_at).toLocaleString() : "Time not recorded";
                    return (
                        <div key={entry.history_id || entry.id || `${next}-${changedAt}-${index}`} className="flex flex-col gap-1 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <div className="min-w-0">
                                <span className="font-semibold text-muted-foreground">{previous}</span>
                                <span className="mx-2 text-muted-foreground">-&gt;</span>
                                <span className="font-bold text-foreground">{next}</span>
                                {entry.workflow_action && <span className="ml-2 text-[10px] font-mono text-muted-foreground">({entry.workflow_action})</span>}
                            </div>
                            <time className="shrink-0 text-[10px] text-muted-foreground" dateTime={entry.changed_at || undefined}>{changedAt}</time>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export default function PlanningEngineeringModule() {
    const {
        loadingBranches,
        loadingOrders,
        loadingRequirements,
        releasingJO,
        branches,
        netRequirements,
        selectedBranchId,
        setSelectedBranchId,
        selectedDetailIds,
        isConfirmOpen,
        setIsConfirmOpen,
        targetQuantity,
        setTargetQuantity,
        plannedDate,
        setPlannedDate,
        dueDate,
        setDueDate,
        shiftOption,
        setShiftOption,
        priority,
        setPriority,
        remarks,
        setRemarks,
        joNumber,
        setJoNumber,
        loadInitialData,
        openCreatedJobOrder,
        salesOrderLines,
        salesOrderGroups,
        productionSalesOrderGroups,
        loadingProductionOrders,
        productionOrdersError,
        loadInProductionSalesOrders,
        selectedLines,
        releaseGroups,
        mergeValidation,
        handleSelectLine,
        handleInitiateRelease,
        handleConfirmRelease,
        assignments,
        setAssignments,
        directAllocating,
        allocationProgress,
        allocationStatus,
        versionStock,
        loadingVersionStock,
        isDirectAllocDialogOpen,
        setIsDirectAllocDialogOpen,
        handleConfirmDirectAllocate,
        unreleasedJobs,
        cancelledJobs,
        loadingJobs,
        releasingDraftId,
        handleReleaseDraftFromPlanning,
        deepLinkJo,
        clearDeepLinkJo,
        deepLinkNotice,
        setDeepLinkNotice
    } = usePlanningEngineering();

    const handleTargetBranchChange = (value: string) => {
        const branchId = Number(value);
        setSelectedBranchId(Number.isSafeInteger(branchId) && branchId > 0 ? branchId : null);
    };
    const hasValidTargetBranch = selectedBranchId !== null && Number.isSafeInteger(selectedBranchId) && selectedBranchId > 0;

    const [activeMainTab, setActiveMainTab] = useState<"demand" | "production" | "inventory" | "queue" | "cancelled">("demand");
    const [showWorkflowGuide, setShowWorkflowGuide] = useState(true);
    const [isBufferDialogOpen, setIsBufferDialogOpen] = useState(false);
    const [selectedUnreleasedJo, setSelectedUnreleasedJo] = useState<any | null>(null);
    const [joMaterials, setJoMaterials] = useState<any[]>([]);
    const [loadingMaterials, setLoadingMaterials] = useState(false);
    const [materialLoadState, setMaterialLoadState] = useState<MaterialLoadState>({ status: "idle" });
    const [familyActiveTab, setFamilyActiveTab] = useState<string>("family-all");
    const [childJoMaterials, setChildJoMaterials] = useState<Record<string, any[]>>({});
    const [childMaterialLoadStates, setChildMaterialLoadStates] = useState<Record<string, MaterialLoadState>>({});
    const materialRequestIdRef = useRef(0);
    const [isTravelerOpen, setIsTravelerOpen] = useState(false);

    // Filter bar state for JO Queue
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [cancelledSearchQuery, setCancelledSearchQuery] = useState("");

    // Quantity editing state for Draft JOs
    const [isEditingQuantity, setIsEditingQuantity] = useState(false);
    const [editQuantityValue, setEditQuantityValue] = useState("");
    const [updatingQuantity, setUpdatingQuantity] = useState(false);

    const handleSaveQuantity = async () => {
        if (isCancelledJobOrderStatus(selectedUnreleasedJo?.status)) {
            toast.error("Cancelled Job Orders are read-only.");
            return;
        }
        const num = Number(editQuantityValue);
        if (!Number.isFinite(num) || num <= 0) {
            toast.error("Please enter a valid positive target quantity.");
            return;
        }
        const joToUpdate = activeFamilyJo || selectedUnreleasedJo;
        if (!joToUpdate) return;
        const joId = joToUpdate.jo_id;
        setUpdatingQuantity(true);
        try {
            const res = await fetch("/api/manufacturing/planning-engineering", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    joId: joId,
                    patch: {
                        quantity: num
                    }
                })
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || "Failed to update Job Order quantity.");
            }
            toast.success(`Job Order ${joId} target quantity updated to ${num.toLocaleString()} pcs!`);
            setIsEditingQuantity(false);
            await loadInitialData();
            const updatedJo = { ...joToUpdate, quantity: num, target_quantity: num };
            await handleOpenDetails(updatedJo, familyActiveTab);
        } catch (err: any) {
            toast.error(err.message || "Failed to update quantity.");
        } finally {
            setUpdatingQuantity(false);
        }
    };

    // Deep link support: /mm/planning-engineering?jo=JO-XXXX opens the item.
    useEffect(() => {
        if (!deepLinkJo) return;
        setActiveMainTab("queue");
        void handleOpenDetails(deepLinkJo);
        clearDeepLinkJo();
    }, [deepLinkJo]);

    const [confirmReserveData, setConfirmReserveData] = useState<{
        joId: string;
        materialId: number;
        productId: number;
        receivingId: number;
        qty: number;
        lotNo: string;
        productName: string;
        isSubAssembly?: boolean;
    } | null>(null);

    const [reservingLot, setReservingLot] = useState(false);

    const [confirmUnreserveData, setConfirmUnreserveData] = useState<{
        joId: string;
        materialId: number;
        reservationId: number;
        qty: number;
        lotNo: string;
        productName: string;
        isSubAssembly?: boolean;
    } | null>(null);

    // Filter unreleased jobs
    const filteredUnreleasedJobs = useMemo(() => {
        return unreleasedJobs.filter((jo: any) => {
            const normalizedFilter = normalizeJobOrderStatus(statusFilter);
            const matchesStatus = statusFilter === "all" || (normalizedFilter !== null && isJobOrderStatus(
                jo.status,
                normalizedFilter
            ));
            return matchesStatus && matchesJobOrderSearch(jo, searchQuery);
        });
    }, [unreleasedJobs, statusFilter, searchQuery]);

    const filteredCancelledJobs = useMemo(
        () => cancelledJobs.filter((jobOrder: any) => matchesJobOrderSearch(jobOrder, cancelledSearchQuery)),
        [cancelledJobs, cancelledSearchQuery]
    );

    const cancelledFamilyGroups = useMemo(
        () => filteredCancelledJobs.map((jobOrder: any) => ({
            familyId: String(jobOrder.jo_id || jobOrder.job_order_no || jobOrder.id),
            parentJo: jobOrder,
            childJos: [],
            isFamily: false
        })),
        [filteredCancelledJobs]
    );

    const familyGroups = useMemo(() => {
        if (!filteredUnreleasedJobs || filteredUnreleasedJobs.length === 0) return [];

        const childrenMap = new Map<string, any[]>();
        const allNos = new Set(filteredUnreleasedJobs.map((j: any) => String(j.jo_id || j.job_order_no || "")));
        const allIds = new Set(filteredUnreleasedJobs.map((j: any) => Number(j.job_order_id || j.id || 0)));

        filteredUnreleasedJobs.forEach((j: any) => {
            const joNo = String(j.jo_id || j.job_order_no || "");
            const pId = Number(j.parent_job_order_id || 0);

            let parentKey: string | null = null;
            if (pId > 0 && allIds.has(pId)) {
                const parentObj = filteredUnreleasedJobs.find((p: any) => Number(p.job_order_id || p.id) === pId);
                if (parentObj) parentKey = String(parentObj.jo_id || parentObj.job_order_no);
            } else if (joNo.includes("-SUB")) {
                const pNo = joNo.split("-SUB")[0];
                if (allNos.has(pNo)) {
                    parentKey = pNo;
                }
            }

            if (parentKey) {
                const existing = childrenMap.get(parentKey) || [];
                existing.push(j);
                childrenMap.set(parentKey, existing);
            }
        });

        const groups: { familyId: string; parentJo: any; childJos: any[]; isFamily: boolean }[] = [];
        const processedNos = new Set<string>();

        filteredUnreleasedJobs.forEach((j: any) => {
            const joNo = String(j.jo_id || j.job_order_no || "");
            const isChild = j.parent_job_order_id || joNo.includes("-SUB");

            if (!isChild && !processedNos.has(joNo)) {
                processedNos.add(joNo);
                const children = childrenMap.get(joNo) || [];
                children.forEach(c => processedNos.add(String(c.jo_id || c.job_order_no)));

                groups.push({
                    familyId: joNo,
                    parentJo: j,
                    childJos: children,
                    isFamily: children.length > 0
                });
            }
        });

        filteredUnreleasedJobs.forEach((j: any) => {
            const joNo = String(j.jo_id || j.job_order_no || "");
            if (!processedNos.has(joNo)) {
                processedNos.add(joNo);
                groups.push({
                    familyId: joNo,
                    parentJo: j,
                    childJos: [],
                    isFamily: false
                });
            }
        });

        return groups;
    }, [filteredUnreleasedJobs]);

    const familyChildJobs = useMemo(() => {
        if (!selectedUnreleasedJo) return [];
        const joNo = String(selectedUnreleasedJo.jo_id || selectedUnreleasedJo.job_order_no || "");
        const parentNo = joNo.includes("-SUB") ? joNo.split("-SUB")[0] : joNo;
        const parentId = Number(selectedUnreleasedJo.parent_job_order_id || 0);

        return unreleasedJobs.filter((j: any) => {
            const cNo = String(j.jo_id || j.job_order_no || "");
            const cParentId = Number(j.parent_job_order_id || 0);
            if (cNo === joNo) return false;

            const isRelated = (parentId > 0 && (cParentId === parentId || Number(j.job_order_id || j.id) === parentId)) ||
                (cNo.startsWith(`${parentNo}-SUB`)) ||
                (cNo === parentNo);
            return isRelated;
        });
    }, [selectedUnreleasedJo, unreleasedJobs]);

    const activeFamilyJo = useMemo(() => {
        if (!selectedUnreleasedJo) return null;
        if (familyActiveTab === "family-all" || familyActiveTab === "parent") {
            return selectedUnreleasedJo;
        }
        return familyChildJobs.find((child: any) => child.jo_id === familyActiveTab) || selectedUnreleasedJo;
    }, [familyActiveTab, familyChildJobs, selectedUnreleasedJo]);

    const isReadOnlyDetails = isCancelledJobOrderStatus(selectedUnreleasedJo?.status);
    const isTerminatedDetails = isTerminatedJobOrder(activeFamilyJo);
    const terminalEvidenceImageUrl = isTerminatedDetails
        ? activeFamilyJo?.termination_image_url
        : activeFamilyJo?.cancellation_image_url;
    const terminalEvidenceLabel = isTerminatedDetails ? "Termination evidence" : "Cancellation evidence";
    const terminalEvidenceDescription = isTerminatedDetails
        ? "Attachment and audit details recorded when this Job Order was terminated."
        : "Attachment and audit details recorded when this Job Order was cancelled.";
    const terminalReasonLabel = isTerminatedDetails ? "Termination reason" : "Cancellation reason";
    const terminalActorLabel = isTerminatedDetails ? "Terminated by" : "Cancelled by";
    const terminalActorName = activeFamilyJo?.cancelled_by_name
        || (activeFamilyJo?.cancelled_by ? `User #${activeFamilyJo.cancelled_by}` : "Not recorded");

    const activeFamilyMaterials = useMemo(() => {
        if (!activeFamilyJo || familyActiveTab === "family-all" || familyActiveTab === "parent") {
            return joMaterials;
        }
        return childJoMaterials[activeFamilyJo.jo_id] || [];
    }, [activeFamilyJo, childJoMaterials, familyActiveTab, joMaterials]);

    const isFamilyOverview = familyChildJobs.length > 0 && familyActiveTab === "family-all";

    // Only Draft Job Orders can be initialized; initialized JOs are read-only
    // from this planning detail view.
    const releasableFamilyMembers = useMemo(() => {
        if (!activeFamilyJo || isCancelledJobOrderStatus(selectedUnreleasedJo?.status)) return [];
        const members = isFamilyOverview ? [activeFamilyJo, ...familyChildJobs] : [activeFamilyJo];
        return members.filter((jo: any) => isJobOrderStatus(
            jo?.status,
            JOB_ORDER_STATUS.DRAFT
        ));
    }, [activeFamilyJo, familyChildJobs, isFamilyOverview, selectedUnreleasedJo]);

    const activeMaterialLoadState = useMemo<MaterialLoadState>(() => {
        if (!activeFamilyJo || familyActiveTab === "family-all" || familyActiveTab === "parent") {
            return materialLoadState;
        }
        return childMaterialLoadStates[activeFamilyJo.jo_id] || { status: "idle" };
    }, [activeFamilyJo, childMaterialLoadStates, familyActiveTab, materialLoadState]);

    const familyMaterialsReady = materialLoadState.status === "success" && familyChildJobs.every(
        (child: any) => childMaterialLoadStates[child.jo_id]?.status === "success"
    );
    const materialActionsReady = !loadingMaterials && (
        isFamilyOverview ? familyMaterialsReady : activeMaterialLoadState.status === "success"
    );

    const handleOpenDetails = async (jo: any, tabToRestore = "family-all") => {
        const requestId = ++materialRequestIdRef.current;
        setSelectedUnreleasedJo(jo);
        setFamilyActiveTab(tabToRestore);
        setJoMaterials([]);
        setChildJoMaterials({});
        setMaterialLoadState({ status: "loading" });
        setChildMaterialLoadStates({});
        setLoadingMaterials(true);

        const joNo = String(jo.jo_id || jo.job_order_no || "");
        const parentNo = joNo.includes("-SUB") ? joNo.split("-SUB")[0] : joNo;
        const pId = Number(jo.parent_job_order_id || 0);

        const relatedJobs = unreleasedJobs.filter((j: any) => {
            const cNo = String(j.jo_id || j.job_order_no || "");
            const cParentId = Number(j.parent_job_order_id || 0);
            if (cNo === joNo) return false;
            return (pId > 0 && (cParentId === pId || Number(j.job_order_id || j.id) === pId)) ||
                (cNo.startsWith(`${parentNo}-SUB`)) ||
                (cNo === parentNo);
        });

        let parentMaterials: any[] = [];
        let parentError: unknown = null;
        try {
            parentMaterials = await fetchJobMaterials(jo.job_order_id || jo.id || jo.order_id);
        } catch (error) {
            parentError = error;
            console.error("Failed to load materials for unreleased JO details modal:", error);
        }

        const childMatMap: Record<string, any[]> = {};
        const childLoadStates: Record<string, MaterialLoadState> = {};
        await Promise.all(relatedJobs.map(async (rj: any) => {
            const childKey = String(rj.jo_id);
            try {
                childMatMap[childKey] = await fetchJobMaterials(rj.job_order_id || rj.id || rj.order_id);
                childLoadStates[childKey] = { status: "success" };
            } catch (error) {
                childMatMap[childKey] = [];
                childLoadStates[childKey] = {
                    status: "error",
                    message: error instanceof Error ? error.message : "The BOM could not be loaded."
                };
                console.error(`Failed to load materials for child Job Order ${childKey}:`, error);
            }
        }));

        if (requestId !== materialRequestIdRef.current) return;

        setJoMaterials(parentMaterials);
        setMaterialLoadState(parentError ? {
            status: "error",
            message: parentError instanceof Error ? parentError.message : "The BOM could not be loaded."
        } : { status: "success" });
        setChildJoMaterials(childMatMap);
        setChildMaterialLoadStates(childLoadStates);
        setLoadingMaterials(false);
    };

    const clearDetails = () => {
        materialRequestIdRef.current += 1;
        setSelectedUnreleasedJo(null);
        setJoMaterials([]);
        setChildJoMaterials({});
        setMaterialLoadState({ status: "idle" });
        setChildMaterialLoadStates({});
        setLoadingMaterials(false);
    };

    const retryCurrentMaterials = () => {
        if (selectedUnreleasedJo) {
            void handleOpenDetails(selectedUnreleasedJo, familyActiveTab);
        }
    };

    const handleConfirmReserveAction = async () => {
        if (isCancelledJobOrderStatus(selectedUnreleasedJo?.status)) {
            toast.error("Cancelled Job Orders are read-only.");
            return;
        }
        if (!materialActionsReady) {
            toast.error("Required materials are unavailable. Retry the materials lookup before reserving stock.");
            return;
        }
        if (!confirmReserveData) return;
        const { joId, materialId, productId, receivingId, qty, lotNo, isSubAssembly } = confirmReserveData;
        setReservingLot(true);
        try {
            const res = await fetch("/api/manufacturing/planning-engineering", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "reserve-lot",
                    joId,
                    materialId,
                    productId,
                    receivingId,
                    lotNo,
                    qty,
                    isSubAssembly,
                    idempotencyKey: `planning-reserve:${joId}:${materialId}:${receivingId || "mfg"}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
                })
            });
            const data = await res.json();
            if (!res.ok || data.success === false) {
                throw new Error(data.error || "Failed to reserve lot.");
            }
            toast.success(`Successfully reserved ${qty.toLocaleString()} units from ${lotNo}!`);
            if (selectedUnreleasedJo) {
                await handleOpenDetails(selectedUnreleasedJo, familyActiveTab);
            }
            setConfirmReserveData(null);
        } catch (err: any) {
            toast.error(err.message || "Failed to reserve lot.");
        } finally {
            setReservingLot(false);
        }
    };

    const handleConfirmUnreserveAction = async () => {
        if (isCancelledJobOrderStatus(selectedUnreleasedJo?.status)) {
            toast.error("Cancelled Job Orders are read-only.");
            return;
        }
        if (!materialActionsReady) {
            toast.error("Required materials are unavailable. Retry the materials lookup before removing a reservation.");
            return;
        }
        if (!confirmUnreserveData) return;
        const { joId, materialId, reservationId, qty, lotNo, isSubAssembly } = confirmUnreserveData;
        setReservingLot(true);
        try {
            const res = await fetch("/api/manufacturing/planning-engineering", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "unreserve-lot",
                    joId,
                    materialId,
                    reservationId,
                    isSubAssembly
                })
            });
            const data = await res.json();
            if (!res.ok || data.success === false) {
                throw new Error(data.error || "Failed to unreserve lot.");
            }
            toast.success(`Successfully removed reservation of ${qty.toLocaleString()} units from ${lotNo}!`);
            if (selectedUnreleasedJo) {
                await handleOpenDetails(selectedUnreleasedJo, familyActiveTab);
            }
            setConfirmUnreserveData(null);
        } catch (err: any) {
            toast.error(err.message || "Failed to unreserve lot.");
        } finally {
            setReservingLot(false);
        }
    };

    const handlePrintShortfall = () => {
        if (!materialActionsReady) {
            toast.error("Required materials are unavailable. Retry the materials lookup before printing.");
            return;
        }
        if (!activeFamilyJo) return;

        const isFamily = isFamilyOverview;
        const shortfallItems: any[] = [];

        activeFamilyMaterials.forEach((m: any) => {
            const needed = Number(m.allocated_quantity || 0);
            const onHand = Number(m.available_stock ?? m.reserved_quantity ?? 0);
            const shortfall = needed - onHand;
            if (shortfall > 0) {
                shortfallItems.push({
                    joId: activeFamilyJo.jo_id,
                    productName: activeFamilyJo.product_name,
                    materialName: m.product_name,
                    unit: m.unit_shortcut,
                    needed,
                    reserved: onHand,
                    shortfall,
                    isSubAssembly: m.is_sub_assembly
                });
            }
        });

        if (isFamily) {
            familyChildJobs.forEach((child: any) => {
                const cMats = childJoMaterials[child.jo_id] || [];
                cMats.forEach((m: any) => {
                    const needed = Number(m.allocated_quantity || 0);
                    const onHand = Number(m.available_stock ?? m.reserved_quantity ?? 0);
                    const shortfall = needed - onHand;
                    if (shortfall > 0) {
                        shortfallItems.push({
                            joId: child.jo_id,
                            productName: child.product_name,
                            materialName: m.product_name,
                            unit: m.unit_shortcut,
                            needed,
                    reserved: onHand,
                            shortfall,
                            isSubAssembly: m.is_sub_assembly
                        });
                    }
                });
            });
        }

        const printWin = window.open("", "_blank");
        if (!printWin) {
            toast.error("Please allow popups to print the shortfall report.");
            return;
        }

        const rowsHtml = shortfallItems.length === 0
            ? `<tr><td colspan="6" style="text-align:center; padding: 20px; color: #059669; font-weight: bold;">✓ All raw materials are fully reserved! No shortfalls found.</td></tr>`
            : shortfallItems.map(item => `
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${item.joId}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${item.productName}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">${item.materialName} ${item.isSubAssembly ? '<span style="color:#0284c7;">(Sub-Assembly)</span>' : ''}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${item.needed.toLocaleString()} ${item.unit}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">${item.reserved.toLocaleString()} ${item.unit}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold; color: #dc2626;">${item.shortfall.toLocaleString()} ${item.unit}</td>
                </tr>
            `).join("");

        printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Material Shortfall Report - ${activeFamilyJo.jo_id}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; color: #111827; }
                    .header { border-bottom: 3px solid #dc2626; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-end; }
                    .title { font-size: 22px; font-weight: 800; color: #dc2626; text-transform: uppercase; letter-spacing: 0.5px; }
                    .meta { font-size: 12px; color: #4b5563; }
                    .info-box { background: #fef2f2; border: 1px solid #fecaca; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 13px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 13px; }
                    th { background-color: #f3f4f6; color: #1f2937; padding: 10px 8px; border: 1px solid #d1d5db; text-align: left; text-transform: uppercase; font-size: 11px; }
                    .footer { margin-top: 50px; display: flex; justify-content: space-between; font-size: 12px; }
                    .signature-line { border-top: 1px solid #9ca3af; width: 200px; text-align: center; padding-top: 6px; margin-top: 40px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <div class="title">⚠️ Material Shortfall Pick Report</div>
                        <div class="meta">Generated for Job Order: <strong>${activeFamilyJo.jo_id}</strong> ${isFamily ? `(Family Group)` : ''}</div>
                    </div>
                    <div style="text-align: right;" class="meta">
                        <div>Date Printed: ${new Date().toLocaleString()}</div>
                        <div>Status: DRAFT ALLOCATION</div>
                    </div>
                </div>

                <div class="info-box">
                    <strong>Primary Product:</strong> ${activeFamilyJo.product_name} &bull;
                    <strong>Target Run Qty:</strong> ${activeFamilyJo.quantity?.toLocaleString()} pcs &bull;
                    <strong>Shift Duration:</strong> ${activeFamilyJo.shiftOption || 8} hrs
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Job Order ID</th>
                            <th>Target Product</th>
                            <th>Material Required</th>
                            <th style="text-align: right;">Required</th>
                            <th style="text-align: right;">On-Hand Stock</th>
                            <th style="text-align: right;">Shortfall Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>

                <div class="footer">
                    <div>
                        <div class="signature-line">Warehouse Specialist</div>
                    </div>
                    <div>
                        <div class="signature-line">Production Planner</div>
                    </div>
                </div>
                <script>
                    window.onload = function() {
                        window.print();
                    }
                </script>
            </body>
            </html>
        `);
        printWin.document.close();
    };

    const handlePrintJobOrder = () => {
        if (!materialActionsReady) {
            toast.error("Required materials are unavailable. Retry the materials lookup before printing.");
            return;
        }
        if (!activeFamilyJo) return;

        const isFamily = isFamilyOverview;
        const printWin = window.open("", "_blank");
        if (!printWin) {
            toast.error("Please allow popups to print the job order.");
            return;
        }

        const renderJoPrintBlock = (jo: any, mats: any[], title: string, color: string) => {
            const setup = jo?.routing_tasks?.reduce((sum: number, t: any) => sum + Number(t.planned_setup_hours || 0), 0) || 0;
            const run = jo?.routing_tasks?.reduce((sum: number, t: any) => sum + Number(t.planned_run_hours || 0), 0) || 0;

            const matRows = (mats || []).map((m: any) => `
                <tr>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; font-weight: bold;">${m.product_name} ${m.is_sub_assembly ? '<span style="color: #0284c7;">(Sub-Assembly)</span>' : ''}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">${Number(m.allocated_quantity || 0).toLocaleString()} ${m.unit_shortcut}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right; font-weight: bold; color: #059669;">${Number(m.available_stock ?? m.reserved_quantity ?? 0).toLocaleString()} ${m.unit_shortcut}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${Number(m.allocated_quantity || 0) <= Number(m.available_stock ?? m.reserved_quantity ?? 0) ? '<span style="color:#059669; font-weight:bold;">✓ STOCK AVAILABLE</span>' : '<span style="color:#dc2626; font-weight:bold;">⚠ SHORTFALL</span>'}</td>
                </tr>
            `).join("");

            return `
                <div style="border: 2px solid ${color}; border-radius: 10px; padding: 18px; margin-bottom: 25px;">
                    <div style="display: flex; justify-content: space-between; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; margin-bottom: 15px;">
                        <div>
                            <span style="background: ${color}; color: white; padding: 4px 10px; border-radius: 6px; font-weight: 800; font-size: 11px; text-transform: uppercase;">${title}</span>
                            <h2 style="margin: 8px 0 0 0; font-size: 20px; color: #111827;">${jo.jo_id}</h2>
                            <div style="font-size: 13px; color: #4b5563; margin-top: 3px;"><strong>Product:</strong> ${jo.product_name}</div>
                        </div>
                        <div style="text-align: right; font-size: 13px;">
                            <div style="font-size: 18px; font-weight: 800; color: #111827;">${jo.quantity?.toLocaleString()} pcs</div>
                            <div style="color: #6b7280;">Shift: <strong>${jo.shiftOption || 8} hrs</strong></div>
                            <div style="color: #6b7280;">Duration: <strong>${(setup + run).toFixed(1)} hrs</strong></div>
                        </div>
                    </div>

                    <h4 style="margin: 15px 0 8px 0; font-size: 12px; text-transform: uppercase; color: #4b5563;">Material Allocation Worksheet</h4>
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <thead>
                            <tr style="background: #f9fafb;">
                                <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: left;">Material</th>
                                <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">Required</th>
                                <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">On-Hand Stock</th>
                                <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${matRows}
                        </tbody>
                    </table>
                </div>
            `;
        };

        const activeTitle = activeFamilyJo.jo_id?.includes("-SUB") ? "🧩 Sub-Assembly Piece Run" : "📦 Parent Assembly Run";
        const activeColor = activeFamilyJo.jo_id?.includes("-SUB") ? "#0284c7" : "#2563eb";
        let bodyContent = renderJoPrintBlock(activeFamilyJo, activeFamilyMaterials, activeTitle, activeColor);

        if (isFamily) {
            familyChildJobs.forEach((child: any) => {
                const cMats = childJoMaterials[child.jo_id] || [];
                bodyContent += renderJoPrintBlock(child, cMats, "🧩 Sub-Assembly Piece Run", "#0284c7");
            });
        }

        printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Job Order Worksheet - ${activeFamilyJo.jo_id}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; color: #111827; }
                    .header { border-bottom: 3px solid #2563eb; padding-bottom: 12px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-end; }
                    .title { font-size: 22px; font-weight: 800; color: #1e40af; text-transform: uppercase; letter-spacing: 0.5px; }
                    .meta { font-size: 12px; color: #4b5563; }
                    .footer { margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px; }
                    .signature-line { border-top: 1px solid #9ca3af; width: 180px; text-align: center; padding-top: 6px; margin-top: 40px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <div class="title">📄 Production Job Order Worksheet</div>
                        <div class="meta">Manufacturing Operations &bull; Job Order: <strong>${activeFamilyJo.jo_id}</strong> ${isFamily ? '(Family Run)' : ''}</div>
                    </div>
                    <div style="text-align: right;" class="meta">
                        <div>Date Printed: ${new Date().toLocaleString()}</div>
                        <div>Status: <strong>DRAFT / PENDING RELEASE</strong></div>
                    </div>
                </div>

                ${bodyContent}

                <div class="footer">
                    <div>
                        <div class="signature-line">Operator Sign-Off</div>
                    </div>
                    <div>
                        <div class="signature-line">QC Inspector</div>
                    </div>
                    <div>
                        <div class="signature-line">Production Supervisor</div>
                    </div>
                </div>
                <script>
                    window.onload = function() {
                        window.print();
                    }
                </script>
            </body>
            </html>
        `);
        printWin.document.close();
    };

    const handleReleaseCurrentView = async () => {
        if (isCancelledJobOrderStatus(selectedUnreleasedJo?.status)) {
            toast.error("Cancelled Job Orders are read-only.");
            return;
        }
        if (!materialActionsReady) {
            toast.error("Required materials are unavailable. Retry the materials lookup before releasing the Job Order.");
            return;
        }
        if (releasableFamilyMembers.length === 0) return;

        const membersToRelease = releasableFamilyMembers;

        clearDetails();

        for (const member of membersToRelease) {
            const jobOrderId = member.job_order_id || member.id || member.order_id;
            if (jobOrderId) {
                await handleReleaseDraftFromPlanning(jobOrderId);
            }
        }
    };

    const shortfallCount = netRequirements.filter((n: any) => n.net_shortfall > 0).length;

    return (
        <div className="space-y-6 p-1 sm:p-2">
            {/* Summary Cards */}
            <PlanningSummaryCards
                demandLinesCount={salesOrderGroups.length}
                shortfallItemsCount={shortfallCount}
                unreleasedJobsCount={unreleasedJobs.length}
                familyGroupsCount={familyGroups.filter((group) => group.isFamily).length}
                onSelectTab={setActiveMainTab}
            />

            {/* Header banner */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card border rounded-xl p-6 shadow-sm">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight">Job Order Planning & MRP Engine</h1>
                    <p className="text-sm text-muted-foreground">
                        Schedule unlinked For Production demand by branch, run branch-scoped Net Requirements calculations, and create Job Orders for the shop floor.
                    </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    {/* Branch Dropdown */}
                    {loadingBranches ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            Loading branches...
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold uppercase text-muted-foreground tracking-wider">Target Branch:</span>
                            <Select
                                value={selectedBranchId === null ? "" : String(selectedBranchId)}
                                onValueChange={handleTargetBranchChange}
                            >
                                <SelectTrigger className="w-[200px] h-9 font-semibold text-sm" aria-label="Target Branch" aria-required="true">
                                    <SelectValue placeholder="Select Target Branch..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {branches.map((b) => (
                                        <SelectItem key={b.id} value={String(b.id)}>
                                             {b.branch_name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    <Button variant="default" className="h-9 font-semibold" onClick={() => setIsBufferDialogOpen(true)}>
                        Create Buffer JO
                    </Button>

                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => loadInitialData()} title="Reload Data">
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {!loadingBranches && !hasValidTargetBranch && (
                <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{branches.length > 0 ? "Select Target Branch... to load branch-scoped demand, inventory, and MRP data." : "No active target branches are available. Contact an administrator before creating a Job Order."}</span>
                </div>
            )}

            {/* Tabs-based Layout Dashboard */}
            <Tabs value={activeMainTab} onValueChange={(val) => setActiveMainTab(val as "demand" | "production" | "inventory" | "queue" | "cancelled")} className="w-full space-y-6">
                {deepLinkNotice && (
                    <div className="flex items-start justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        <span className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            {deepLinkNotice}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeepLinkNotice(null)}
                            className="h-7 shrink-0 px-2 text-[11px] font-bold text-amber-700 hover:bg-amber-500/10 dark:text-amber-400"
                        >
                            Dismiss
                        </Button>
                    </div>
                )}
                {showWorkflowGuide && (
                    <div className="flex flex-col gap-3 rounded-xl border border-primary/20 bg-primary/[0.04] p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                            <p className="text-xs font-bold uppercase tracking-wider text-primary">How this page works</p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                <span><strong className="text-foreground">1.</strong> Review demand</span>
                                <span className="text-border">→</span>
                                <span><strong className="text-foreground">2.</strong> Save or initialize a Job Order</span>
                                <span className="text-border">→</span>
                                <span>
                                    <strong className="text-foreground">3.</strong>{" "}
                                    <Link href="/mm/material-staging" className="text-primary underline underline-offset-2">Stage materials</Link>
                                </span>
                                <span className="text-border">→</span>
                                <span>
                                    <strong className="text-foreground">4.</strong>{" "}
                                    <Link href="/mm/production-workflow" className="text-primary underline underline-offset-2">Produce</Link>
                                </span>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <StatusLegendPopover />
                            <Button variant="ghost" size="sm" onClick={() => setShowWorkflowGuide(false)} className="h-8 text-xs">
                                Dismiss
                            </Button>
                        </div>
                    </div>
                )}
                <TabsList className="grid w-full max-w-6xl grid-cols-2 rounded-xl bg-muted/60 p-1 lg:grid-cols-5">
                    <TabsTrigger value="demand" className="flex items-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs">
                        <ClipboardList className="h-4 w-4 text-primary" />
                        <span>For Production Demand</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4.5 min-w-4.5 flex items-center justify-center font-mono">
                            {salesOrderGroups.length}
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="production" className="flex items-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs">
                        <Factory className="h-4 w-4 text-sky-600" />
                        <span>In Production SOs</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4.5 min-w-4.5 flex items-center justify-center font-mono bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold">
                            {productionSalesOrderGroups.length}
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="inventory" className="flex items-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs">
                        <Database className="h-4 w-4 text-indigo-500" />
                        <span>Net Requirements</span>
                        {shortfallCount > 0 && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4.5 min-w-4.5 flex items-center justify-center font-mono">
                                {shortfallCount}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="queue" className="flex items-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs">
                        <Layers className="h-4 w-4 text-sky-500" />
                        <span>Job Order Queue</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4.5 min-w-4.5 flex items-center justify-center font-mono bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold">
                            {unreleasedJobs.length}
                        </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="cancelled" className="flex items-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs">
                        <XCircle className="h-4 w-4 text-rose-500" />
                        <span>Cancelled JOs</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4.5 min-w-4.5 flex items-center justify-center font-mono bg-rose-500/10 text-rose-600 dark:text-rose-400 font-bold">
                            {cancelledJobs.length}
                        </Badge>
                    </TabsTrigger>
                </TabsList>


                {/* TAB 1: Demand Harvesting & Consolidation */}
                <TabsContent value="demand" className="space-y-6 outline-none">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* Left Column: Demand Lines Table */}
                        <div className="lg:col-span-8">
                            <DemandLinesTable
                                loadingOrders={loadingOrders}
                                salesOrderGroups={salesOrderGroups}
                                selectedDetailIds={selectedDetailIds}
                                handleSelectLine={handleSelectLine}
                            />
                        </div>
                        {/* Right Column: Consolidation Action Panel */}
                        <div className="lg:col-span-4">
                            <ConsolidationPanel
                                selectedLines={selectedLines}
                                releaseGroups={releaseGroups}
                                mergeValidation={mergeValidation}
                                hasValidTargetBranch={hasValidTargetBranch}
                                handleInitiateRelease={handleInitiateRelease}
                                versionStock={versionStock}
                                loadingVersionStock={loadingVersionStock}
                                canDirectAllocate={releaseGroups.length === 1}
                                handleInitiateDirectAllocate={() => setIsDirectAllocDialogOpen(true)}
                            />
                        </div>
                    </div>
                </TabsContent>

                {/* TAB 2: Sales Orders in Production */}
                <TabsContent value="production" className="space-y-6 outline-none">
                    <InProductionSalesOrdersTable
                        loadingOrders={loadingProductionOrders}
                        error={productionOrdersError}
                        salesOrderGroups={productionSalesOrderGroups}
                        onRetry={() => { void loadInProductionSalesOrders(); }}
                    />
                </TabsContent>

                {/* TAB 3: Net Requirements */}
                <TabsContent value="inventory" className="space-y-6 outline-none">
                    <div className="bg-card border rounded-xl shadow-sm">
                        <NetRequirementsTable
                            loadingRequirements={loadingRequirements}
                            netRequirements={netRequirements}
                            selectedBranchId={selectedBranchId}
                            branches={branches}
                        />
                    </div>
                </TabsContent>

                {/* TAB 4: Job Orders Queue */}
                <TabsContent value="queue" className="space-y-6 outline-none">
                    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="space-y-1">
                                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                                    <Layers className="h-5 w-5 text-primary" />
                                    Job Order Queue
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Track scheduled and released Job Orders from release through staging. Each row shows the current stage and the next step.
                                </p>
                            </div>
                            {loadingJobs && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    Updating queue...
                                </div>
                            )}
                        </div>

                        {/* Filter Bar */}
                        <JOFilterBar
                            searchQuery={searchQuery}
                            setSearchQuery={setSearchQuery}
                            statusFilter={statusFilter}
                            setStatusFilter={setStatusFilter}
                            totalCount={unreleasedJobs.length}
                            filteredCount={filteredUnreleasedJobs.length}
                        />

                        {/* Job Orders Table */}
                        <JOTable
                            unreleasedJobs={filteredUnreleasedJobs}
                            familyGroups={familyGroups}
                            loadingJobs={loadingJobs}
                            handleOpenDetails={handleOpenDetails}
                        />
                    </div>
                </TabsContent>

                {/* TAB 5: Cancelled Job Orders */}
                <TabsContent value="cancelled" className="space-y-6 outline-none">
                    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="space-y-1">
                                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                                    <XCircle className="h-5 w-5 text-rose-500" />
                                    Cancelled Job Orders
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Review cancelled Job Orders and their planning history. Cancelled records are read-only and require no further workflow action.
                                </p>
                            </div>
                            {loadingJobs && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                                    <Loader2 className="h-4 w-4 animate-spin text-rose-500" />
                                    Updating cancelled orders...
                                </div>
                            )}
                        </div>

                        <JOFilterBar
                            searchQuery={cancelledSearchQuery}
                            setSearchQuery={setCancelledSearchQuery}
                            statusFilter={JOB_ORDER_STATUS.CANCELLED}
                            setStatusFilter={() => undefined}
                            lockedStatus={{ value: JOB_ORDER_STATUS.CANCELLED, label: JOB_ORDER_STATUS.CANCELLED }}
                            totalCount={cancelledJobs.length}
                            filteredCount={filteredCancelledJobs.length}
                        />

                        <JOTable
                            unreleasedJobs={filteredCancelledJobs}
                            familyGroups={cancelledFamilyGroups}
                            loadingJobs={loadingJobs}
                            handleOpenDetails={handleOpenDetails}
                            readOnly
                        />
                    </div>
                </TabsContent>
            </Tabs>

            {/* Release Job Order Dialog */}
            <ReleaseJODialog
                isConfirmOpen={isConfirmOpen}
                setIsConfirmOpen={setIsConfirmOpen}
                selectedLines={selectedLines}
                releaseGroups={releaseGroups}
                branches={branches}
                selectedBranchId={selectedBranchId}
                joNumber={joNumber}
                setJoNumber={setJoNumber}
                targetQuantity={targetQuantity}
                setTargetQuantity={setTargetQuantity}
                plannedDate={plannedDate}
                setPlannedDate={setPlannedDate}
                dueDate={dueDate}
                setDueDate={setDueDate}
                shiftOption={shiftOption}
                setShiftOption={setShiftOption}
                priority={priority}
                setPriority={setPriority}
                remarks={remarks}
                setRemarks={setRemarks}
                releasingJO={releasingJO}
                handleConfirmRelease={handleConfirmRelease}
                assignments={assignments}
                setAssignments={setAssignments}
            />

            {/* Create Buffer Job Order Dialog */}
            <CreateBufferJODialog
                isOpen={isBufferDialogOpen}
                onOpenChange={setIsBufferDialogOpen}
                branches={branches}
                initialBranchId={selectedBranchId}
                onSuccess={openCreatedJobOrder}
            />

            {/* Direct Allocation Confirmation Dialog */}
            <AlertDialog open={isDirectAllocDialogOpen} onOpenChange={setIsDirectAllocDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Confirm Direct Allocation & Invoice Bypass</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            {directAllocating ? (
                                <div className="space-y-4 py-4 text-foreground">
                                    <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-primary">
                                        <span className="animate-pulse">{allocationStatus}</span>
                                        <span>{allocationProgress}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden border">
                                        <div
                                            className="h-full bg-green-500 rounded-full transition-all duration-300 ease-out"
                                            style={{ width: `${allocationProgress}%` }}
                                        />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground animate-pulse text-center">
                                        Processing inventory movement deductions and sales order status updates...
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3 text-sm text-muted-foreground">
                                    <p>
                                        Are you sure you want to directly allocate inventory for the selected Sales Order lines?
                                    </p>
                                    <div className="bg-muted/50 p-3 rounded-lg text-xs space-y-1 font-medium border text-foreground">
                                        <div><strong>Product:</strong> {selectedLines[0]?.product_id?.product_name}</div>
                                        <div><strong>Recipe Version:</strong> {selectedLines[0]?.bom_version_name || "Default"}</div>
                                        <div><strong>Allocated Quantity:</strong> {selectedLines.reduce((sum, l) => sum + Number(l.ordered_quantity), 0).toLocaleString()}</div>
                                        <div><strong>Available Version Stock:</strong> {versionStock?.toLocaleString()}</div>
                                    </div>
                                    <p className="text-xs">
                                        This action will immediately deduct inventory lots using FIFO selection, post negative ledger entries, and transition the Sales Order to &quot;For Consolidation&quot; when all detail lines are fulfilled. This cannot be undone.
                                    </p>
                                </div>
                            )}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {!directAllocating && (
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={(e) => {
                                    e.preventDefault();
                                    handleConfirmDirectAllocate();
                                }}
                                className="bg-green-600 hover:bg-green-700 text-white font-bold"
                            >
                                Confirm & Allocate
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    )}
                </AlertDialogContent>
            </AlertDialog>

            {/* Unreleased JO Details Modal */}
            <Dialog
                open={selectedUnreleasedJo !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        clearDetails();
                    }
                }}
            >
                <DialogContent className="sm:max-w-[1250px] max-h-[92vh] flex flex-col bg-background border border-border/80 shadow-2xl rounded-2xl p-0 overflow-hidden">
                    {/* Header */}
                    <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-background p-6 border-b border-border/50 shrink-0 space-y-3">
                        <div className="flex justify-between items-center gap-4 pr-6">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-1 rounded-full">
                                        Planning & Allocation Details
                                    </span>
                                    {familyChildJobs.length > 0 && (
                                        <span className="text-[10px] font-black uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                                            <Layers className="h-3 w-3" /> Family JO Group ({1 + familyChildJobs.length} Jobs)
                                        </span>
                                    )}
                                </div>
                                <DialogTitle className="font-extrabold text-xl tracking-tight text-foreground mt-2">
                                    {activeFamilyJo?.jo_id}
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground mt-1">
                                    Product: <span className="font-bold text-foreground">{activeFamilyJo?.product_name}</span> • Quantity: <span className="font-bold text-foreground">{activeFamilyJo?.quantity?.toLocaleString()} pcs</span>
                                </DialogDescription>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                    <JobOrderStatusBadge status={activeFamilyJo?.status} className="px-3 py-1 text-xs font-bold" />
                                    {isTerminatedDetails && (
                                        <Badge variant="outline" className="border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300">
                                            Terminated
                                        </Badge>
                                    )}
                                </div>
                                <JobOrderJourneyBar
                                    journey={resolveJobOrderJourney({ status: activeFamilyJo?.status, jobOrderNo: activeFamilyJo?.jo_id })}
                                    compact
                                />
                            </div>
                        </div>

                        {/* Family Job Order Switcher Bar */}
                        {familyChildJobs.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 bg-muted/60 p-1 rounded-xl text-xs font-semibold pt-1 border border-border/40">
                                <button
                                    onClick={() => setFamilyActiveTab("family-all")}
                                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${familyActiveTab === "family-all" ? "bg-card text-foreground shadow-sm font-bold border border-border" : "text-muted-foreground hover:text-foreground"}`}
                                >
                                    <span>✨ Entire Family View ({1 + familyChildJobs.length} JOs)</span>
                                </button>
                                <button
                                    onClick={() => setFamilyActiveTab("parent")}
                                    className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${familyActiveTab === "parent" ? "bg-card text-primary shadow-sm font-bold border border-border" : "text-muted-foreground hover:text-foreground"}`}
                                >
                                    <span>📦 Parent: {selectedUnreleasedJo?.jo_id?.includes("-SUB") ? selectedUnreleasedJo?.jo_id?.split("-SUB")[0] : selectedUnreleasedJo?.jo_id}</span>
                                </button>
                                {familyChildJobs.map((child: any) => (
                                    <button
                                        key={child.jo_id}
                                        onClick={() => setFamilyActiveTab(child.jo_id)}
                                        className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${familyActiveTab === child.jo_id ? "bg-card text-sky-600 dark:text-sky-400 shadow-sm font-bold border border-border" : "text-muted-foreground hover:text-foreground"}`}
                                    >
                                        <span>🧩 Sub-Assembly: {child.jo_id}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-0 bg-muted/5">
                        <NextStepCallout
                            action={resolveJobOrderJourney({ status: activeFamilyJo?.status, jobOrderNo: activeFamilyJo?.jo_id }).nextAction}
                            blockers={resolveJobOrderJourney({ status: activeFamilyJo?.status, jobOrderNo: activeFamilyJo?.jo_id }).blockers}
                            title="What's next"
                        />
                        {isReadOnlyDetails && (
                            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 shadow-sm">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">{terminalEvidenceLabel}</h3>
                                        <p className="mt-1 text-xs text-muted-foreground">{terminalEvidenceDescription}</p>
                                    </div>
                                    {activeFamilyJo?.cancelled_at && (
                                        <time className="text-[10px] text-muted-foreground" dateTime={activeFamilyJo.cancelled_at}>
                                            {new Date(activeFamilyJo.cancelled_at).toLocaleString()}
                                        </time>
                                    )}
                                </div>
                                {terminalEvidenceImageUrl ? (
                                    <img
                                        src={terminalEvidenceImageUrl}
                                        alt={`${terminalEvidenceLabel} for ${activeFamilyJo?.jo_id || "Job Order"}`}
                                        className="max-h-80 w-full rounded-lg border border-rose-500/20 bg-background object-contain"
                                    />
                                ) : (
                                    <p className="rounded-lg border border-dashed border-rose-500/20 bg-background/60 px-4 py-6 text-center text-xs text-muted-foreground">
                                        No {isTerminatedDetails ? "termination" : "cancellation"} evidence image is attached to this record.
                                    </p>
                                )}
                                <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                                    <div>
                                        <span className="text-muted-foreground">{terminalReasonLabel}:</span>{" "}
                                        <span className="font-semibold text-foreground">{activeFamilyJo?.cancellation_reason || "Not recorded"}</span>
                                    </div>
                                    <div>
                                        <span className="text-muted-foreground">{terminalActorLabel}:</span>{" "}
                                        <span className="font-semibold text-foreground">{terminalActorName}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <JobOrderStatusHistoryPanel history={activeFamilyJo?.status_history} />
                        {isFamilyOverview ? (
                            /* DUAL / MULTI FAMILY VIEW: Render Parent & Child JOs side-by-side / stacked */
                            <div className="space-y-8">
                                {/* CARD 1: PARENT JOB ORDER */}
                                <div className="bg-card border-2 border-primary/20 rounded-2xl p-5 shadow-sm space-y-5">
                                    <div className="flex items-center justify-between border-b border-border/60 pb-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-md font-extrabold uppercase tracking-wide">
                                                📦 Parent Assembly Run
                                            </span>
                                            <h3 className="font-extrabold text-lg text-foreground">{selectedUnreleasedJo?.jo_id}</h3>
                                            <span className="text-xs text-muted-foreground font-medium">
                                                ({selectedUnreleasedJo?.product_name} • <strong className="text-foreground font-semibold">{selectedUnreleasedJo?.uom_name || selectedUnreleasedJo?.unit_of_measurement || "Pieces"}</strong>)
                                            </span>
                                        </div>
                                        <span className="text-xs font-bold text-foreground bg-muted px-3 py-1 rounded-full border border-border">
                                            {selectedUnreleasedJo?.quantity?.toLocaleString()} {selectedUnreleasedJo?.uom_name || selectedUnreleasedJo?.uom_shortcut || "pcs"}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs bg-muted/30 p-3 rounded-xl border border-border/50">
                                        <div><span className="text-muted-foreground font-medium">Planning Remarks:</span> <span className="font-bold ml-1 text-foreground">{selectedUnreleasedJo?.remarks || "None"}</span></div>
                                        <div><span className="text-muted-foreground font-medium">Shift Option:</span> <span className="font-bold ml-1 text-foreground">{selectedUnreleasedJo?.shiftOption || "8"} hours</span></div>
                                        <div>
                                            <span className="text-muted-foreground font-medium">Parent Run Lead Time:</span>
                                            <span className="font-bold ml-1 text-primary">
                                                {(() => {
                                                    const tasks = selectedUnreleasedJo?.routing_tasks || [];
                                                    const shiftHrs = Number(selectedUnreleasedJo?.shiftOption || selectedUnreleasedJo?.shift_option || 8) || 8;
                                                    const maxRun = Math.max(0, ...tasks.map((t: any) => Number(t.planned_run_hours || 0)));
                                                    const initialSetup = Number(tasks[0]?.planned_setup_hours || 0);
                                                    const leadTime = maxRun + initialSetup;
                                                    const totalWorkload = tasks.reduce((sum: number, t: any) => sum + Number(t.planned_setup_hours || 0) + Number(t.planned_run_hours || 0), 0);
                                                    return `${(leadTime / shiftHrs).toFixed(1)} days (${leadTime.toFixed(1)} line hrs • ${totalWorkload.toFixed(1)} mach-hrs)`;
                                                })()}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Parent Packaging & Assembly Materials</h4>
                                        {materialLoadState.status === "loading" ? (
                                            <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                                Loading materials...
                                            </div>
                                        ) : materialLoadState.status === "error" ? (
                                            <MaterialLoadErrorState message={materialLoadState.message} onRetry={retryCurrentMaterials} />
                                        ) : materialLoadState.status === "success" && joMaterials.length === 0 ? (
                                            <NoMaterialsState />
                                        ) : (
                                            <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
                                                <table className="w-full text-xs text-left text-muted-foreground border-collapse">
                                                    <thead className="uppercase bg-muted/50 font-bold border-b text-foreground tracking-wider">
                                                        <tr>
                                                            <th className="px-4 py-3">Raw Material / Component</th>
                                                            <th className="px-4 py-3 text-right">Required</th>
                                                            <th className="px-4 py-3 text-right">On-Hand Stock</th>
                                                            <th className="px-4 py-3">Status</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y text-foreground/90">
                                                        {joMaterials.map((mat) => {
                                                            const needed = Number(mat.allocated_quantity || 0);
                                                            const onHand = Number(mat.available_stock ?? mat.reserved_quantity ?? 0);
                                                            const shortfall = needed - onHand;
                                                            const isMet = shortfall <= 0;

                                                            return (
                                                                <tr key={`parent-mat-${mat.id || mat.jo_material_id}`} className="hover:bg-muted/10 align-top">
                                                                    <td className="px-4 py-3.5 font-bold text-foreground">
                                                                        <div className="flex flex-col gap-0.5">
                                                                            <span className="text-sm font-extrabold">{mat.product_name}</span>
                                                                            {mat.is_sub_assembly && (
                                                                                <span className="text-[9px] uppercase font-black text-sky-600 dark:text-sky-400 bg-sky-500/10 border border-sky-500/20 px-2 py-0.5 rounded-md w-max">
                                                                                    🧩 Sub-Assembly Component
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3.5 text-right font-bold text-foreground text-sm">
                                                                        <div className="flex items-center justify-end gap-2">
                                                                            <span>{needed.toLocaleString()} <span className="text-xs text-muted-foreground">{mat.unit_shortcut}</span></span>
                                                                        {!isReadOnlyDetails && String(selectedUnreleasedJo?.status || "").toLowerCase() === "draft" && (
                                                                                isEditingQuantity ? (
                                                                                    <div className="flex items-center gap-1 ml-1">
                                                                                        <input
                                                                                            type="number"
                                                                                            min="1"
                                                                                            value={editQuantityValue}
                                                                                            onChange={(e) => setEditQuantityValue(e.target.value)}
                                                                                            className="w-20 h-7 px-2 border border-primary rounded-md text-xs font-bold bg-background text-foreground focus:outline-none"
                                                                                            autoFocus
                                                                                        />
                                                                                        <Button
                                                                                            size="sm"
                                                                                            onClick={handleSaveQuantity}
                                                                                            disabled={updatingQuantity}
                                                                                            className="h-7 px-2 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 gap-1"
                                                                                        >
                                                                                            {updatingQuantity ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                                                                                        </Button>
                                                                                        <Button
                                                                                            size="sm"
                                                                                            variant="ghost"
                                                                                            onClick={() => setIsEditingQuantity(false)}
                                                                                            className="h-7 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                                                                                        >
                                                                                            <X className="h-3.5 w-3.5" />
                                                                                        </Button>
                                                                                    </div>
                                                                                ) : (
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            setEditQuantityValue(String(selectedUnreleasedJo?.quantity || ""));
                                                                                            setIsEditingQuantity(true);
                                                                                        }}
                                                                                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-md transition-colors border border-primary/20 ml-1"
                                                                                        title="Edit Job Order Quantity"
                                                                                    >
                                                                                        <Pencil className="h-3 w-3" /> Edit Qty
                                                                                    </button>
                                                                                )
                                                                            )}
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-4 py-3.5 text-right font-black text-primary text-sm">
                                                                        {onHand.toLocaleString()} <span className="text-xs text-muted-foreground">{mat.unit_shortcut}</span>
                                                                    </td>
                                                                    <td className="px-4 py-3.5">
                                                                        {isMet ? (
                                                                            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-extrabold px-2.5 py-1 text-xs shadow-sm">
                                                                                ✓ Stock Available
                                                                            </Badge>
                                                                        ) : (
                                                                            <div className="flex flex-col items-start gap-1.5">
                                                                                <Badge variant="destructive" className="font-extrabold px-2.5 py-1 text-xs shadow-sm">
                                                                                    ⚠ Shortfall: {shortfall.toLocaleString()} {mat.unit_shortcut}
                                                                                </Badge>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* CARD 2+: CHILD SUB-ASSEMBLY JOB ORDERS */}
                                {familyChildJobs.map((childJo: any) => {
                                    const cMaterials = childJoMaterials[childJo.jo_id] || [];
                                    const cMaterialLoadState = childMaterialLoadStates[childJo.jo_id] || { status: "loading" as const };
                                    const cSetup = childJo?.routing_tasks?.reduce((sum: number, t: any) => sum + Number(t.planned_setup_hours || 0), 0) || 0;
                                    const cRun = childJo?.routing_tasks?.reduce((sum: number, t: any) => sum + Number(t.planned_run_hours || 0), 0) || 0;

                                    return (
                                        <div key={`child-card-${childJo.jo_id}`} className="bg-sky-500/[0.03] border-2 border-sky-500/30 rounded-2xl p-5 shadow-sm space-y-5">
                                            <div className="flex items-center justify-between border-b border-sky-500/20 pb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-500/30 px-2.5 py-1 rounded-md font-extrabold uppercase tracking-wide">
                                                        🧩 Sub-Assembly Piece Run
                                                    </span>
                                                    <h3 className="font-extrabold text-lg text-foreground">{childJo.jo_id}</h3>
                                                    <span className="text-xs text-muted-foreground font-medium">
                                                        ({childJo.product_name} • <strong className="text-foreground font-semibold">{childJo.uom_name || childJo.unit_of_measurement || "Pieces"}</strong>)
                                                    </span>
                                                </div>
                                                <span className="text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-500/10 px-3 py-1 rounded-full border border-sky-500/20">
                                                    {childJo.quantity?.toLocaleString()} {childJo.uom_name || childJo.uom_shortcut || "pcs"}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs bg-sky-500/5 p-3 rounded-xl border border-sky-500/10">
                                                <div><span className="text-muted-foreground font-medium">Planning Remarks:</span> <span className="font-bold ml-1 text-foreground">{childJo.remarks || "Auto-spawned"}</span></div>
                                                <div><span className="text-muted-foreground font-medium">Shift Option:</span> <span className="font-bold ml-1 text-foreground">{childJo.shiftOption || "8"} hours</span></div>
                                                <div>
                                                    <span className="text-muted-foreground font-medium">Sub-Assembly Lead Time:</span>
                                                    <span className="font-bold ml-1 text-sky-700 dark:text-sky-300">
                                                        {(() => {
                                                            const tasks = childJo.routing_tasks || [];
                                                            const shiftHrs = Number(childJo.shiftOption || childJo.shift_option || 8) || 8;
                                                            const maxRun = Math.max(0, ...tasks.map((t: any) => Number(t.planned_run_hours || 0)));
                                                            const initialSetup = Number(tasks[0]?.planned_setup_hours || 0);
                                                            const leadTime = maxRun + initialSetup;
                                                            const totalWorkload = tasks.reduce((sum: number, t: any) => sum + Number(t.planned_setup_hours || 0) + Number(t.planned_run_hours || 0), 0);
                                                            return `${(leadTime / shiftHrs).toFixed(1)} days (${leadTime.toFixed(1)} line hrs • ${totalWorkload.toFixed(1)} mach-hrs)`;
                                                        })()}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Ingredient Raw Materials Allocation Worksheet</h4>
                                                <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
                                                    <table className="w-full text-xs text-left text-muted-foreground border-collapse">
                                                        <thead className="uppercase bg-muted/50 font-bold border-b text-foreground tracking-wider">
                                                            <tr>
                                                                <th className="px-4 py-3">Raw Material / Component</th>
                                                                <th className="px-4 py-3 text-right">Required</th>
                                                                <th className="px-4 py-3 text-right">On-Hand Stock</th>
                                                                <th className="px-4 py-3">Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y text-foreground/90">
                                                            {cMaterialLoadState.status === "loading" ? (
                                                                <tr>
                                                                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground font-medium">
                                                                        <div className="flex flex-col items-center justify-center space-y-1">
                                                                            <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
                                                                            <span>Loading ingredient materials...</span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ) : cMaterialLoadState.status === "error" ? (
                                                                <tr>
                                                                    <td colSpan={4} className="px-4 py-4">
                                                                        <MaterialLoadErrorState message={cMaterialLoadState.message} onRetry={retryCurrentMaterials} />
                                                                    </td>
                                                                </tr>
                                                            ) : cMaterials.length === 0 ? (
                                                                <tr>
                                                                    <td colSpan={4} className="px-4 py-4">
                                                                        <NoMaterialsState />
                                                                    </td>
                                                                </tr>
                                                            ) : (
                                                                cMaterials.map((cMat: any) => {
                                                                    const needed = Number(cMat.allocated_quantity || 0);
                                                                    const onHand = Number(cMat.available_stock ?? cMat.reserved_quantity ?? 0);
                                                                    const shortfall = needed - onHand;
                                                                    const isMet = shortfall <= 0;

                                                                    return (
                                                                        <tr key={`child-mat-${cMat.id || cMat.jo_material_id}`} className="hover:bg-sky-500/5 align-top">
                                                                            <td className="px-4 py-3.5 font-bold text-foreground">
                                                                                <span className="text-sm font-extrabold">{cMat.product_name}</span>
                                                                            </td>
                                                                            <td className="px-4 py-3.5 text-right font-bold text-foreground text-sm">
                                                                                {needed.toLocaleString()} <span className="text-xs text-muted-foreground">{cMat.unit_shortcut}</span>
                                                                            </td>
                                                                            <td className="px-4 py-3.5 text-right font-black text-sky-600 dark:text-sky-400 text-sm">
                                                                                {onHand.toLocaleString()} <span className="text-xs text-muted-foreground">{cMat.unit_shortcut}</span>
                                                                            </td>
                                                                            <td className="px-4 py-3.5">
                                                                                {isMet ? (
                                                                                    <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-extrabold px-2.5 py-1 text-xs shadow-sm">
                                                                                        ✓ Stock Available
                                                                                    </Badge>
                                                                                ) : (
                                                                                    <div className="flex flex-col items-start gap-1.5">
                                                                                        <Badge variant="destructive" className="font-extrabold px-2.5 py-1 text-xs shadow-sm">
                                                                                            ⚠ Shortfall: {shortfall.toLocaleString()} {cMat.unit_shortcut}
                                                                                        </Badge>
                                                                                    </div>
                                                                                )}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            /* SINGLE JOB ORDER VIEW */
                            <>
                                <div className="bg-card border rounded-xl p-4 space-y-2 text-sm">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div><span className="text-muted-foreground">Planning Remarks:</span> <span className="font-medium ml-1">{activeFamilyJo?.remarks || "None"}</span></div>
                                        <div><span className="text-muted-foreground">Shift Option:</span> <span className="font-medium ml-1">{activeFamilyJo?.shiftOption || "8"} hours</span></div>
                                        <div>
                                            <span className="text-muted-foreground">Estimated Duration:</span>
                                            <span className="font-medium ml-1">
                                                {(() => {
                                                    const tasks = activeFamilyJo?.routing_tasks || [];
                                                    const total = tasks.reduce((sum: number, t: any) => sum + Number(t.planned_setup_hours || 0) + Number(t.planned_run_hours || 0), 0);
                                                    if (total === 0) return "Not estimated";
                                                    const shiftHours = Number(activeFamilyJo?.shiftOption || 8) || 8;
                                                    const days = (total / shiftHours).toFixed(1);
                                                    return `${total.toFixed(1)} hrs (~${days} Days)`;
                                                })()}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">BOM Materials Allocation Worksheet</h4>

                                    {materialLoadState.status === "loading" ? (
                                        <div className="flex flex-col items-center justify-center py-12 space-y-2">
                                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                            <span className="text-sm text-muted-foreground font-medium">Resolving raw material stock levels...</span>
                                        </div>
                                    ) : materialLoadState.status === "error" ? (
                                        <MaterialLoadErrorState message={materialLoadState.message} onRetry={retryCurrentMaterials} />
                                    ) : materialLoadState.status === "success" && activeFamilyMaterials.length === 0 ? (
                                        <NoMaterialsState />
                                    ) : (
                                        <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
                                            <table className="w-full text-sm text-left text-muted-foreground border-collapse">
                                                <thead className="text-xs uppercase bg-muted/40 font-bold border-b text-foreground">
                                                    <tr>
                                                        <th className="px-4 py-3">Raw Material</th>
                                                        <th className="px-4 py-3 text-right">Required</th>
                                                        <th className="px-4 py-3 text-right">On-Hand Stock</th>
                                                        <th className="px-4 py-3">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y text-foreground/90">
                                                    {activeFamilyMaterials.map((mat) => {
                                                        const needed = Number(mat.allocated_quantity || 0);
                                                        const onHand = Number(mat.available_stock ?? mat.reserved_quantity ?? 0);
                                                        const shortfall = needed - onHand;
                                                        const isMet = shortfall <= 0;

                                                        return (
                                                            <tr key={mat.id || mat.jo_material_id} className="hover:bg-muted/5 align-top">
                                                                <td className="px-4 py-4 font-semibold text-foreground">
                                                                    <div className="flex flex-col">
                                                                        <span>{mat.product_name}</span>
                                                                        {mat.is_sub_assembly && (
                                                                            <span className="text-[9px] uppercase font-extrabold text-blue-600 bg-blue-50 dark:bg-blue-950/30 px-2 py-0.5 rounded-md w-max mt-1">
                                                                                Sub-Assembly Byproduct
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-4 text-right font-semibold">
                                                                    <div className="flex items-center justify-end gap-2">
                                                                        <span>{needed.toLocaleString()} {mat.unit_shortcut}</span>
                                                                        {!isReadOnlyDetails && String(activeFamilyJo?.status || "").toLowerCase() === "draft" && (
                                                                            isEditingQuantity ? (
                                                                                <div className="flex items-center gap-1 ml-1">
                                                                                    <input
                                                                                        type="number"
                                                                                        min="1"
                                                                                        value={editQuantityValue}
                                                                                        onChange={(e) => setEditQuantityValue(e.target.value)}
                                                                                        className="w-20 h-7 px-2 border border-primary rounded-md text-xs font-bold bg-background text-foreground focus:outline-none"
                                                                                        autoFocus
                                                                                    />
                                                                                    <Button
                                                                                        size="sm"
                                                                                        onClick={handleSaveQuantity}
                                                                                        disabled={updatingQuantity}
                                                                                        className="h-7 px-2 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 gap-1"
                                                                                    >
                                                                                        {updatingQuantity ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Save
                                                                                    </Button>
                                                                                    <Button
                                                                                        size="sm"
                                                                                        variant="ghost"
                                                                                        onClick={() => setIsEditingQuantity(false)}
                                                                                        className="h-7 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                                                                                    >
                                                                                        <X className="h-3.5 w-3.5" />
                                                                                    </Button>
                                                                                </div>
                                                                            ) : (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setEditQuantityValue(String(activeFamilyJo?.quantity || ""));
                                                                                        setIsEditingQuantity(true);
                                                                                    }}
                                                                                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-md transition-colors border border-primary/20 ml-1"
                                                                                    title="Edit Job Order Quantity"
                                                                                >
                                                                                    <Pencil className="h-3 w-3" /> Edit Qty
                                                                                </button>
                                                                            )
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-4 text-right font-semibold text-primary">
                                                                    {onHand.toLocaleString()} {mat.unit_shortcut}
                                                                </td>
                                                                <td className="px-4 py-4">
                                                                    {isMet ? (
                                                                        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-extrabold px-2.5 py-1 text-xs shadow-sm">
                                                                            ✓ Stock Available
                                                                        </Badge>
                                                                    ) : (
                                                                        <div className="flex flex-col items-start gap-1.5">
                                                                            <Badge variant="destructive" className="font-extrabold px-2.5 py-1 text-xs shadow-sm">
                                                                                ⚠ Shortfall: {shortfall.toLocaleString()} {mat.unit_shortcut}
                                                                            </Badge>
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 bg-muted/20 border-t shrink-0 flex flex-wrap justify-between items-center gap-3">
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                className="font-bold h-10 px-4 text-xs flex items-center gap-1.5 border-sky-500/30 text-sky-600 hover:text-sky-500 hover:bg-sky-500/10 dark:text-sky-400"
                                onClick={() => setIsTravelerOpen(true)}
                                disabled={!materialActionsReady}
                            >
                                <Printer className="h-4 w-4" />
                                Traveler Sheet
                            </Button>
                            <Button
                                variant="outline"
                                className="font-bold h-10 px-4 text-xs flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                                onClick={handlePrintJobOrder}
                                disabled={!materialActionsReady}
                            >
                                <Printer className="h-4 w-4" />
                                Print Job Order
                            </Button>
                        </div>

                        <div className="flex items-center gap-3">
                            <Button
                                variant="outline"
                                className="font-bold h-10 px-5 text-xs"
                                onClick={clearDetails}
                            >
                                Close Details
                            </Button>
                            {releasableFamilyMembers.length > 0 && (
                                <Button
                                onClick={handleReleaseCurrentView}
                                    disabled={releasingDraftId === activeFamilyJo?.order_id || !materialActionsReady}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-10 px-5 text-xs shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all duration-200"
                                >
                                    {releasingDraftId === activeFamilyJo?.order_id
                                        ? "Releasing..."
                                        : isFamilyOverview
                                            ? releasableFamilyMembers.length === 1 + familyChildJobs.length
                                                ? `Release Entire Family (${releasableFamilyMembers.length} Job Orders)`
                                                : `Release Releasable Members (${releasableFamilyMembers.length})`
                                                : "Initialize JO"}
                                </Button>
                            )}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Custom Reserve Confirmation Dialog */}
            <AlertDialog open={confirmReserveData !== null} onOpenChange={(open) => { if (!open && !reservingLot) setConfirmReserveData(null); }}>
                <AlertDialogContent className="rounded-2xl max-w-md border border-border shadow-2xl p-6 bg-background">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-lg font-extrabold text-foreground flex items-center gap-2">
                            Confirm Material Reservation
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-4 pt-2 text-sm text-muted-foreground">
                                <p>
                                    Are you sure you want to reserve stock from this lot for the production run?
                                </p>
                                <div className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-xl space-y-1.5 font-medium text-foreground">
                                    <div><span className="text-muted-foreground">Material:</span> <span className="font-bold">{confirmReserveData?.productName}</span></div>
                                    <div><span className="text-muted-foreground">Lot Number:</span> <span className="font-mono font-bold">{confirmReserveData?.lotNo}</span></div>
                                    <div><span className="text-muted-foreground">Qty to Reserve:</span> <span className="font-extrabold text-emerald-600">{confirmReserveData?.qty?.toLocaleString()} units</span></div>
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-6 flex gap-3">
                        <AlertDialogCancel disabled={reservingLot} className="font-bold h-10 px-5 rounded-lg border-border">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleConfirmReserveAction();
                            }}
                            disabled={reservingLot}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-10 px-5 rounded-lg shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                        >
                            {reservingLot ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Reserving...
                                </>
                            ) : (
                                "Confirm Reservation"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Custom Unreserve Confirmation Dialog */}
            <AlertDialog open={confirmUnreserveData !== null} onOpenChange={(open) => { if (!open && !reservingLot) setConfirmUnreserveData(null); }}>
                <AlertDialogContent className="rounded-2xl max-w-md border border-border shadow-2xl p-6 bg-background">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-lg font-extrabold text-foreground flex items-center gap-2">
                            Remove Reservation
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-4 pt-2 text-sm text-muted-foreground">
                                <p className="text-red-500/80">
                                    Warning: Unreserving this lot will make the allocated quantity available to other planning Job Orders.
                                </p>
                                <div className="bg-red-500/5 border border-red-500/10 p-4 rounded-xl space-y-1.5 font-medium text-foreground">
                                    <div><span className="text-muted-foreground">Material:</span> <span className="font-bold">{confirmUnreserveData?.productName}</span></div>
                                    <div><span className="text-muted-foreground">Lot Number:</span> <span className="font-mono font-bold">{confirmUnreserveData?.lotNo}</span></div>
                                    <div><span className="text-muted-foreground">Qty to Free:</span> <span className="font-extrabold text-red-600">{confirmUnreserveData?.qty?.toLocaleString()} units</span></div>
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="mt-6 flex gap-3">
                        <AlertDialogCancel disabled={reservingLot} className="font-bold h-10 px-5 rounded-lg border-border">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleConfirmUnreserveAction();
                            }}
                            disabled={reservingLot}
                            className="bg-red-600 hover:bg-red-500 text-white font-bold h-10 px-5 rounded-lg shadow-md shadow-red-500/10 hover:shadow-red-500/20 transition-all flex items-center justify-center gap-2"
                        >
                            {reservingLot ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Unreserving...
                                </>
                            ) : (
                                "Confirm Unreserve"
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Printable Job Order Traveler Sheet */}
            {isTravelerOpen && activeFamilyJo && (
                <JobOrderTraveler
                    isOpen={isTravelerOpen}
                    onClose={() => setIsTravelerOpen(false)}
                    jobOrder={activeFamilyJo}
                    materials={activeFamilyMaterials}
                    operations={activeFamilyJo.operations || activeFamilyJo.routing_tasks || activeFamilyJo.routes || []}
                    childJobOrders={isFamilyOverview ? familyChildJobs.map((child: any) => ({
                        jobOrder: child,
                        materials: childJoMaterials[child.jo_id] || [],
                        operations: child.operations || child.routing_tasks || child.routes || []
                    })) : []}
                    branchName={branches.find((b: any) => Number(b.id) === Number(selectedBranchId))?.branch_name || "Manufacturing Facility"}
                />
            )}
        </div>
    );
}
