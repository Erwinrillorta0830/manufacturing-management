/* eslint-disable */
"use client";

import React, { useState } from "react";
import { Loader2, RefreshCw, ClipboardList, Layers, Database, Printer } from "lucide-react";
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
import { ReleaseJODialog } from "./components/ReleaseJODialog";
import { CreateBufferJODialog } from "./components/CreateBufferJODialog";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
        dueDate,
        setDueDate,
        shiftOption,
        setShiftOption,
        remarks,
        setRemarks,
        joNumber,
        setJoNumber,
        loadInitialData,
        salesOrderLines,
        selectedLines,
        mergeValidation,
        handleSelectAll,
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
        loadingJobs,
        releasingDraftId,
        handleReleaseDraftFromPlanning
    } = usePlanningEngineering();
    const [isBufferDialogOpen, setIsBufferDialogOpen] = useState(false);

    const [selectedUnreleasedJo, setSelectedUnreleasedJo] = useState<any | null>(null);
    const [joMaterials, setJoMaterials] = useState<any[]>([]);
    const [loadingMaterials, setLoadingMaterials] = useState(false);
    const [familyActiveTab, setFamilyActiveTab] = useState<string>("family-all");
    const [childJoMaterials, setChildJoMaterials] = useState<Record<string, any[]>>({});

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

    const familyGroups = React.useMemo(() => {
        if (!unreleasedJobs || unreleasedJobs.length === 0) return [];

        const childrenMap = new Map<string, any[]>();
        const allNos = new Set(unreleasedJobs.map((j: any) => String(j.jo_id || j.job_order_no || "")));
        const allIds = new Set(unreleasedJobs.map((j: any) => Number(j.job_order_id || j.id || 0)));

        unreleasedJobs.forEach((j: any) => {
            const joNo = String(j.jo_id || j.job_order_no || "");
            const pId = Number(j.parent_job_order_id || 0);

            let parentKey: string | null = null;
            if (pId > 0 && allIds.has(pId)) {
                const parentObj = unreleasedJobs.find((p: any) => Number(p.job_order_id || p.id) === pId);
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

        unreleasedJobs.forEach((j: any) => {
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

        unreleasedJobs.forEach((j: any) => {
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
    }, [unreleasedJobs]);

    const familyChildJobs = React.useMemo(() => {
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

    const handleOpenDetails = async (jo: any, silent = false) => {
        setSelectedUnreleasedJo(jo);
        setFamilyActiveTab("family-all");
        if (!silent) setLoadingMaterials(true);
        try {
            const res = await fetch(`/api/manufacturing/planning-engineering?action=job-materials&joId=${jo.order_id}`);
            if (res.ok) {
                const data = await res.json();
                setJoMaterials(data);
            }

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

            if (relatedJobs.length > 0) {
                const childMatMap: Record<string, any[]> = {};
                await Promise.all(
                    relatedJobs.map(async (rj: any) => {
                        try {
                            const rRes = await fetch(`/api/manufacturing/planning-engineering?action=job-materials&joId=${rj.order_id}`);
                            if (rRes.ok) {
                                childMatMap[rj.jo_id] = await rRes.json();
                            }
                        } catch (e) {
                            console.error("Error loading child materials:", e);
                        }
                    })
                );
                setChildJoMaterials(childMatMap);
            } else {
                setChildJoMaterials({});
            }
        } catch (err) {
            console.error("Failed to load materials for unreleased JO details modal:", err);
        } finally {
            if (!silent) setLoadingMaterials(false);
        }
    };

    const handleConfirmReserveAction = async () => {
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
                    qty,
                    isSubAssembly
                })
            });
            const data = await res.json();
            if (!res.ok || data.success === false) {
                throw new Error(data.error || "Failed to reserve lot.");
            }
            toast.success(`Successfully reserved ${qty.toLocaleString()} units from ${lotNo}!`);
            if (selectedUnreleasedJo) {
                await handleOpenDetails(selectedUnreleasedJo, true);
            }
            setConfirmReserveData(null);
        } catch (err: any) {
            toast.error(err.message || "Failed to reserve lot.");
        } finally {
            setReservingLot(false);
        }
    };

    const handleConfirmUnreserveAction = async () => {
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
                await handleOpenDetails(selectedUnreleasedJo, true);
            }
            setConfirmUnreserveData(null);
        } catch (err: any) {
            toast.error(err.message || "Failed to unreserve lot.");
        } finally {
            setReservingLot(false);
        }
    };

    const handlePrintShortfall = () => {
        if (!selectedUnreleasedJo) return;

        const isFamily = familyChildJobs.length > 0 && familyActiveTab === "family-all";
        const shortfallItems: any[] = [];

        // Parent materials
        joMaterials.forEach((m: any) => {
            const needed = Number(m.allocated_quantity || 0);
            const reserved = Number(m.reserved_quantity || 0);
            const shortfall = needed - reserved;
            if (shortfall > 0) {
                shortfallItems.push({
                    joId: selectedUnreleasedJo.jo_id,
                    productName: selectedUnreleasedJo.product_name,
                    materialName: m.product_name,
                    unit: m.unit_shortcut,
                    needed,
                    reserved,
                    shortfall,
                    isSubAssembly: m.is_sub_assembly
                });
            }
        });

        // Child materials if family view
        if (isFamily) {
            familyChildJobs.forEach((child: any) => {
                const cMats = childJoMaterials[child.jo_id] || [];
                cMats.forEach((m: any) => {
                    const needed = Number(m.allocated_quantity || 0);
                    const reserved = Number(m.reserved_quantity || 0);
                    const shortfall = needed - reserved;
                    if (shortfall > 0) {
                        shortfallItems.push({
                            joId: child.jo_id,
                            productName: child.product_name,
                            materialName: m.product_name,
                            unit: m.unit_shortcut,
                            needed,
                            reserved,
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
                <title>Material Shortfall Report - ${selectedUnreleasedJo.jo_id}</title>
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
                        <div class="meta">Generated for Job Order: <strong>${selectedUnreleasedJo.jo_id}</strong> ${isFamily ? `(Family Group)` : ''}</div>
                    </div>
                    <div style="text-align: right;" class="meta">
                        <div>Date Printed: ${new Date().toLocaleString()}</div>
                        <div>Status: DRAFT ALLOCATION</div>
                    </div>
                </div>

                <div class="info-box">
                    <strong>Primary Product:</strong> ${selectedUnreleasedJo.product_name} &bull; 
                    <strong>Target Run Qty:</strong> ${selectedUnreleasedJo.quantity?.toLocaleString()} pcs &bull; 
                    <strong>Shift Duration:</strong> ${selectedUnreleasedJo.shiftOption || 8} hrs
                </div>

                <table>
                    <thead>
                        <tr>
                            <th>Job Order ID</th>
                            <th>Target Product</th>
                            <th>Material Required</th>
                            <th style="text-align: right;">Required</th>
                            <th style="text-align: right;">Reserved</th>
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
        if (!selectedUnreleasedJo) return;

        const isFamily = familyChildJobs.length > 0 && familyActiveTab === "family-all";
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
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: right; font-weight: bold; color: #059669;">${Number(m.reserved_quantity || 0).toLocaleString()} ${m.unit_shortcut}</td>
                    <td style="padding: 8px; border: 1px solid #e5e7eb; text-align: center;">${Number(m.allocated_quantity || 0) <= Number(m.reserved_quantity || 0) ? '<span style="color:#059669; font-weight:bold;">✓ RESERVED</span>' : '<span style="color:#dc2626; font-weight:bold;">⚠ SHORTFALL</span>'}</td>
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
                                <th style="padding: 8px; border: 1px solid #e5e7eb; text-align: right;">Reserved</th>
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

        let bodyContent = renderJoPrintBlock(selectedUnreleasedJo, joMaterials, "📦 Parent Assembly Run", "#2563eb");

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
                <title>Job Order Worksheet - ${selectedUnreleasedJo.jo_id}</title>
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
                        <div class="meta">Manufacturing Operations &bull; Job Order: <strong>${selectedUnreleasedJo.jo_id}</strong> ${isFamily ? '(Family Run)' : ''}</div>
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

    return (
        <div className="space-y-6 p-1 sm:p-2">
            {/* Header banner */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-card border rounded-xl p-6 shadow-sm">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight">Planning & Engineering</h1>
                    <p className="text-sm text-muted-foreground">
                        Harvest sales order demand, run branch-scoped Net Requirements calculations, batch consolidate orders, and explode/release Job Orders.
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
                                value={String(selectedBranchId || "")}
                                onValueChange={(val) => setSelectedBranchId(Number(val))}
                            >
                                <SelectTrigger className="w-[200px] h-9 font-semibold text-sm">
                                    <SelectValue placeholder="Select target branch" />
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

            {/* Tabs-based Layout Dashboard */}
            <Tabs defaultValue="demand" className="w-full space-y-6">
                <TabsList className="grid grid-cols-3 max-w-[600px] h-10 bg-muted/60 p-1 border rounded-lg">
                    <TabsTrigger value="demand" className="flex items-center gap-2 font-semibold text-sm">
                        <ClipboardList className="h-4 w-4 text-primary" />
                        Demand Harvesting
                    </TabsTrigger>
                    <TabsTrigger value="inventory" className="flex items-center gap-2 font-semibold text-sm">
                        <Database className="h-4 w-4 text-primary" />
                        Net Requirements
                    </TabsTrigger>
                    <TabsTrigger value="queue" className="flex items-center gap-2 font-semibold text-sm">
                        <Layers className="h-4 w-4 text-primary" />
                        Job Orders Queue
                    </TabsTrigger>
                </TabsList>

                {/* TAB 1: Demand Harvesting & Consolidation */}
                <TabsContent value="demand" className="space-y-6 outline-none">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                        {/* Left Column: Demand Lines Table (8 cols for maximum width) */}
                        <div className="lg:col-span-8">
                            <DemandLinesTable
                                loadingOrders={loadingOrders}
                                salesOrderLines={salesOrderLines}
                                selectedDetailIds={selectedDetailIds}
                                handleSelectLine={handleSelectLine}
                            />
                        </div>
                        {/* Right Column: Consolidation Action Panel (4 cols) */}
                        <div className="lg:col-span-4">
                            <ConsolidationPanel
                                selectedLines={selectedLines}
                                mergeValidation={mergeValidation}
                                handleInitiateRelease={handleInitiateRelease}
                                versionStock={versionStock}
                                loadingVersionStock={loadingVersionStock}
                                handleInitiateDirectAllocate={() => setIsDirectAllocDialogOpen(true)}
                            />
                        </div>
                    </div>
                </TabsContent>

                {/* TAB 2: Net Requirements */}
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

                {/* TAB 3: Job Orders Queue */}
                <TabsContent value="queue" className="space-y-6 outline-none">
                    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="space-y-1">
                                <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
                                    <Layers className="h-5 w-5 text-primary" />
                                    Unreleased Job Orders Queue
                                </h2>
                                <p className="text-sm text-muted-foreground">
                                    Monitor Draft or Planned Job Orders waiting for raw material stock replenishment or crew planning.
                                </p>
                            </div>
                            {loadingJobs && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    Updating queue...
                                </div>
                            )}
                        </div>

                        {unreleasedJobs.length === 0 ? (
                            <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-lg bg-muted/20">
                                No unreleased (Draft or Planned) job orders found in this branch.
                            </div>
                        ) : (
                            <div className="overflow-x-auto border rounded-lg">
                                <table className="w-full text-sm text-left text-muted-foreground border-collapse">
                                    <thead className="text-xs uppercase bg-muted/40 font-bold border-b text-foreground">
                                        <tr>
                                            <th className="px-4 py-3">Job Order ID</th>
                                            <th className="px-4 py-3">Product Name</th>
                                            <th className="px-4 py-3 text-right">Target Qty</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Remarks / Constraints</th>
                                            <th className="px-4 py-3 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y text-foreground/90">
                                        {familyGroups.map((fg) => {
                                            if (!fg.isFamily) {
                                                const jo = fg.parentJo;
                                                return (
                                                    <tr key={jo.jo_id} className="hover:bg-muted/10">
                                                        <td className="px-4 py-3 font-semibold text-primary">{jo.jo_id}</td>
                                                        <td className="px-4 py-3 font-medium">{jo.product_name}</td>
                                                        <td className="px-4 py-3 text-right font-semibold">{jo.quantity?.toLocaleString()} pcs</td>
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                                jo.status === "Draft" 
                                                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                                                    : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                                            }`}>
                                                                {jo.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-xs max-w-xs truncate text-muted-foreground" title={jo.remarks || ""}>
                                                            {jo.remarks || "No planning constraints logged."}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleOpenDetails(jo)}
                                                                className="border-primary/30 hover:border-primary text-primary hover:bg-primary/5 font-bold h-8 text-xs px-3 transition-all duration-200"
                                                            >
                                                                Manage / View Details
                                                            </Button>
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            return (
                                                <React.Fragment key={`family-group-${fg.familyId}`}>
                                                    {/* Family Header Banner */}
                                                    <tr className="bg-sky-500/10 dark:bg-sky-950/40 border-t-2 border-b border-sky-500/30">
                                                        <td colSpan={6} className="px-4 py-2.5">
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2 text-xs font-bold text-sky-700 dark:text-sky-300">
                                                                    <span className="bg-sky-500/20 text-sky-600 dark:text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                                                                        <Layers className="h-3 w-3" /> Family JO Group
                                                                    </span>
                                                                    <span className="font-mono text-foreground font-extrabold">{fg.familyId}</span>
                                                                    <span className="text-[11px] text-muted-foreground font-medium">
                                                                        ({1 + fg.childJos.length} Jobs in Family: 1 Parent Assembly + {fg.childJos.length} Sub-Assembly Runs)
                                                                    </span>
                                                                </div>
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleOpenDetails(fg.parentJo)}
                                                                    className="h-7 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-sm px-3"
                                                                >
                                                                    Manage Entire Family ({1 + fg.childJos.length} JOs)
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>

                                                    {/* Parent JO Row */}
                                                    <tr className="hover:bg-muted/10 bg-card/60">
                                                        <td className="px-4 py-3 font-semibold text-primary flex items-center gap-2">
                                                            <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded uppercase font-black shrink-0">
                                                                📦 Parent JO
                                                            </span>
                                                            <span>{fg.parentJo.jo_id}</span>
                                                        </td>
                                                        <td className="px-4 py-3 font-bold text-foreground">{fg.parentJo.product_name}</td>
                                                        <td className="px-4 py-3 text-right font-semibold">{fg.parentJo.quantity?.toLocaleString()} pcs</td>
                                                        <td className="px-4 py-3">
                                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                                fg.parentJo.status === "Draft" 
                                                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                                                    : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                                            }`}>
                                                                {fg.parentJo.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-3 text-xs max-w-xs truncate text-muted-foreground" title={fg.parentJo.remarks || ""}>
                                                            {fg.parentJo.remarks || "No planning constraints logged."}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => handleOpenDetails(fg.parentJo)}
                                                                className="border-primary/30 hover:border-primary text-primary hover:bg-primary/5 font-bold h-8 text-xs px-3 transition-all duration-200"
                                                            >
                                                                Manage Family
                                                            </Button>
                                                        </td>
                                                    </tr>

                                                    {/* Child Sub-Assembly JO Rows */}
                                                    {fg.childJos.map((cJo: any) => (
                                                        <tr key={cJo.jo_id} className="hover:bg-sky-500/5 bg-sky-500/[0.02]">
                                                            <td className="px-4 py-3 font-semibold text-sky-600 dark:text-sky-400 pl-8 flex items-center gap-2">
                                                                <span className="text-muted-foreground font-normal">↳</span>
                                                                <span className="text-[9px] bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded uppercase font-black shrink-0">
                                                                    🧩 Sub-Assembly
                                                                </span>
                                                                <span>{cJo.jo_id}</span>
                                                            </td>
                                                            <td className="px-4 py-3 font-medium text-foreground">{cJo.product_name}</td>
                                                            <td className="px-4 py-3 text-right font-semibold">{cJo.quantity?.toLocaleString()} pcs</td>
                                                            <td className="px-4 py-3">
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                                                                    cJo.status === "Draft" 
                                                                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                                                        : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                                                }`}>
                                                                    {cJo.status}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-xs max-w-xs truncate text-muted-foreground" title={cJo.remarks || ""}>
                                                                {cJo.remarks || "Auto-spawned for sub-assembly shortfall."}
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => handleOpenDetails(cJo)}
                                                                    className="text-sky-600 hover:text-sky-700 hover:bg-sky-500/10 font-bold h-8 text-xs px-3 transition-all duration-200"
                                                                >
                                                                    View Details
                                                                </Button>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Release Job Order Dialog */}
            <ReleaseJODialog
                isConfirmOpen={isConfirmOpen}
                setIsConfirmOpen={setIsConfirmOpen}
                selectedLines={selectedLines}
                branches={branches}
                selectedBranchId={selectedBranchId}
                joNumber={joNumber}
                setJoNumber={setJoNumber}
                targetQuantity={targetQuantity}
                setTargetQuantity={setTargetQuantity}
                dueDate={dueDate}
                setDueDate={setDueDate}
                shiftOption={shiftOption}
                setShiftOption={setShiftOption}
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
                onSuccess={loadInitialData}
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
                                        This action will immediately deduct inventory lots using FIFO selection, post negative ledger entries, and transition the Sales Order to &quot;For Invoicing&quot;. This cannot be undone.
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
                        setSelectedUnreleasedJo(null);
                        setJoMaterials([]);
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
                                    {selectedUnreleasedJo?.jo_id}
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground mt-1">
                                    Product: <span className="font-bold text-foreground">{selectedUnreleasedJo?.product_name}</span> • Quantity: <span className="font-bold text-foreground">{selectedUnreleasedJo?.quantity?.toLocaleString()} pcs</span>
                                </DialogDescription>
                            </div>
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                                selectedUnreleasedJo?.status === "Draft" 
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                    : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                            }`}>
                                {selectedUnreleasedJo?.status}
                            </span>
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
                        {familyChildJobs.length > 0 && familyActiveTab === "family-all" ? (
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
                                            <span className="text-xs text-muted-foreground font-medium">({selectedUnreleasedJo?.product_name})</span>
                                        </div>
                                        <span className="text-xs font-bold text-foreground bg-muted px-3 py-1 rounded-full border border-border">
                                            {selectedUnreleasedJo?.quantity?.toLocaleString()} pcs
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs bg-muted/30 p-3 rounded-xl border border-border/50">
                                        <div><span className="text-muted-foreground font-medium">Planning Remarks:</span> <span className="font-bold ml-1 text-foreground">{selectedUnreleasedJo?.remarks || "None"}</span></div>
                                        <div><span className="text-muted-foreground font-medium">Shift Option:</span> <span className="font-bold ml-1 text-foreground">{selectedUnreleasedJo?.shiftOption || "8"} hours</span></div>
                                        <div>
                                            <span className="text-muted-foreground font-medium">Parent Run Duration:</span> 
                                            <span className="font-bold ml-1 text-primary">
                                                {(() => {
                                                    const setup = selectedUnreleasedJo?.routing_tasks?.reduce((sum: number, t: any) => sum + Number(t.planned_setup_hours || 0), 0) || 0;
                                                    const run = selectedUnreleasedJo?.routing_tasks?.reduce((sum: number, t: any) => sum + Number(t.planned_run_hours || 0), 0) || 0;
                                                    return `${(setup + run).toFixed(1)} hrs`;
                                                })()}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Parent Packaging & Assembly Materials</h4>
                                        {loadingMaterials ? (
                                            <div className="flex items-center justify-center py-6 gap-2 text-xs text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                                Loading materials...
                                            </div>
                                        ) : (
                                            <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
                                                <table className="w-full text-xs text-left text-muted-foreground border-collapse">
                                                    <thead className="uppercase bg-muted/50 font-bold border-b text-foreground tracking-wider">
                                                        <tr>
                                                            <th className="px-4 py-3">Raw Material / Component</th>
                                                            <th className="px-4 py-3 text-right">Required</th>
                                                            <th className="px-4 py-3 text-right">Reserved</th>
                                                            <th className="px-4 py-3">Status</th>
                                                            <th className="px-4 py-3">Candidate Lots & Action</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y text-foreground/90">
                                                        {joMaterials.map((mat) => {
                                                            const needed = Number(mat.allocated_quantity || 0);
                                                            const reserved = Number(mat.reserved_quantity || 0);
                                                            const shortfall = needed - reserved;
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
                                                                        {needed.toLocaleString()} <span className="text-xs text-muted-foreground">{mat.unit_shortcut}</span>
                                                                    </td>
                                                                    <td className="px-4 py-3.5 text-right font-black text-primary text-sm">
                                                                        {reserved.toLocaleString()} <span className="text-xs text-muted-foreground">{mat.unit_shortcut}</span>
                                                                    </td>
                                                                    <td className="px-4 py-3.5">
                                                                        {isMet ? (
                                                                            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-extrabold px-2.5 py-1 text-xs shadow-sm">
                                                                                ✓ Fully Reserved
                                                                            </Badge>
                                                                        ) : (
                                                                            <div className="flex flex-col items-start gap-1.5">
                                                                                <Badge variant="destructive" className="font-extrabold px-2.5 py-1 text-xs shadow-sm">
                                                                                    ⚠ Shortfall: {shortfall.toLocaleString()} {mat.unit_shortcut}
                                                                                </Badge>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-4 py-3.5">
                                                                        {(!mat.candidate_lots || mat.candidate_lots.length === 0) ? (
                                                                            <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 font-medium flex items-center justify-between gap-3">
                                                                                <span>{mat.is_sub_assembly ? "Auto-spawned in sub-assembly JO below." : "No Passed lots found in this branch."}</span>
                                                                                {!mat.is_sub_assembly && (
                                                                                    <Button
                                                                                        size="xs"
                                                                                        onClick={() => {
                                                                                            setSelectedUnreleasedJo(null);
                                                                                            setJoMaterials([]);
                                                                                            window.location.href = "/mm/incoming-shipments";
                                                                                        }}
                                                                                        className="bg-amber-600 hover:bg-amber-500 text-white font-bold h-7 text-[10px] px-2.5 rounded-md shadow-sm shrink-0"
                                                                                    >
                                                                                        Log Receipt
                                                                                    </Button>
                                                                                )}
                                                                            </div>
                                                                        ) : (
                                                                            <div className="space-y-2 max-w-md">
                                                                                {mat.candidate_lots.map((lot: any) => {
                                                                                    const isReserved = !!lot.reservation_id;
                                                                                    return (
                                                                                        <div 
                                                                                            key={`parent-lot-${lot.receipt_id || lot.lot_no}`} 
                                                                                            className={`text-xs p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                                                                                                isReserved 
                                                                                                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200 shadow-sm" 
                                                                                                    : "bg-card border-border hover:border-primary/40"
                                                                                            }`}
                                                                                        >
                                                                                            <div className="flex flex-col min-w-0">
                                                                                                <div className="flex items-center gap-1.5 font-bold font-mono text-foreground truncate">
                                                                                                    <span>Lot: {lot.lot_no}</span>
                                                                                                    {isReserved && (
                                                                                                        <span className="text-[9px] font-black uppercase text-emerald-600 bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded">
                                                                                                            Reserved ({lot.reserved_qty_for_this_lot?.toLocaleString()})
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                                <div className="text-[10px] text-muted-foreground mt-0.5">Source: {lot.receipt_no}</div>
                                                                                            </div>
                                                                                            <div className="flex items-center gap-2 shrink-0">
                                                                                                <span className={`font-mono font-bold ${isReserved ? "text-emerald-600" : "text-foreground"}`}>
                                                                                                    {lot.available.toLocaleString()} avail
                                                                                                </span>
                                                                                                {!mat.is_sub_assembly && (
                                                                                                    isReserved ? (
                                                                                                        <Button
                                                                                                            size="xs"
                                                                                                            variant="ghost"
                                                                                                            onClick={() => setConfirmUnreserveData({ joId: selectedUnreleasedJo.order_id, materialId: mat.jo_material_id || mat.id, reservationId: lot.reservation_id, qty: lot.reserved_qty_for_this_lot, lotNo: lot.lot_no, productName: mat.product_name })}
                                                                                                            className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 font-bold h-6 px-2 text-[10px] transition-all"
                                                                                                        >
                                                                                                            Unreserve
                                                                                                        </Button>
                                                                                                    ) : (
                                                                                                        shortfall > 0 && lot.available > 0 && (
                                                                                                            <Button
                                                                                                                size="xs"
                                                                                                                onClick={() => setConfirmReserveData({ joId: selectedUnreleasedJo.order_id, materialId: mat.jo_material_id || mat.id, productId: mat.product_id, receivingId: lot.receipt_id, qty: Math.min(shortfall, lot.available), lotNo: lot.lot_no, productName: mat.product_name })}
                                                                                                                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-6 px-2.5 text-[10px] shadow-sm rounded-md transition-all"
                                                                                                            >
                                                                                                                Reserve
                                                                                                            </Button>
                                                                                                        )
                                                                                                    )
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })}
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
                                                    <span className="text-xs text-muted-foreground font-medium">({childJo.product_name})</span>
                                                </div>
                                                <span className="text-xs font-bold text-sky-700 dark:text-sky-300 bg-sky-500/10 px-3 py-1 rounded-full border border-sky-500/20">
                                                    {childJo.quantity?.toLocaleString()} pcs
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs bg-sky-500/5 p-3 rounded-xl border border-sky-500/10">
                                                <div><span className="text-muted-foreground font-medium">Planning Remarks:</span> <span className="font-bold ml-1 text-foreground">{childJo.remarks || "Auto-spawned"}</span></div>
                                                <div><span className="text-muted-foreground font-medium">Shift Option:</span> <span className="font-bold ml-1 text-foreground">{childJo.shiftOption || "8"} hours</span></div>
                                                <div>
                                                    <span className="text-muted-foreground font-medium">Sub-Assembly Run Duration:</span> 
                                                    <span className="font-bold ml-1 text-sky-700 dark:text-sky-300">
                                                        {(cSetup + cRun).toFixed(1)} hrs
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
                                                                <th className="px-4 py-3 text-right">Reserved</th>
                                                                <th className="px-4 py-3">Status</th>
                                                                <th className="px-4 py-3">Candidate Lots & Action</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y text-foreground/90">
                                                            {cMaterials.length === 0 ? (
                                                                <tr>
                                                                    <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground font-medium">
                                                                        <div className="flex flex-col items-center justify-center space-y-1">
                                                                            <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
                                                                            <span>Loading ingredient materials...</span>
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            ) : (
                                                                cMaterials.map((cMat: any) => {
                                                                    const needed = Number(cMat.allocated_quantity || 0);
                                                                    const reserved = Number(cMat.reserved_quantity || 0);
                                                                    const shortfall = needed - reserved;
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
                                                                                {reserved.toLocaleString()} <span className="text-xs text-muted-foreground">{cMat.unit_shortcut}</span>
                                                                            </td>
                                                                            <td className="px-4 py-3.5">
                                                                                {isMet ? (
                                                                                    <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-extrabold px-2.5 py-1 text-xs shadow-sm">
                                                                                        ✓ Fully Reserved
                                                                                    </Badge>
                                                                                ) : (
                                                                                    <div className="flex flex-col items-start gap-1.5">
                                                                                        <Badge variant="destructive" className="font-extrabold px-2.5 py-1 text-xs shadow-sm">
                                                                                            ⚠ Shortfall: {shortfall.toLocaleString()} {cMat.unit_shortcut}
                                                                                        </Badge>
                                                                                    </div>
                                                                                )}
                                                                            </td>
                                                                            <td className="px-4 py-3.5">
                                                                                {(!cMat.candidate_lots || cMat.candidate_lots.length === 0) ? (
                                                                                    <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 font-medium flex items-center justify-between gap-3">
                                                                                        <span>No Passed lots found in this branch.</span>
                                                                                        <Button
                                                                                            size="xs"
                                                                                            onClick={() => {
                                                                                                setSelectedUnreleasedJo(null);
                                                                                                setJoMaterials([]);
                                                                                                window.location.href = "/mm/incoming-shipments";
                                                                                            }}
                                                                                            className="bg-amber-600 hover:bg-amber-500 text-white font-bold h-7 text-[10px] px-2.5 rounded-md shadow-sm shrink-0"
                                                                                        >
                                                                                            Log Receipt
                                                                                        </Button>
                                                                                    </div>
                                                                                ) : (
                                                                                    <div className="space-y-2 max-w-md">
                                                                                        {cMat.candidate_lots.map((lot: any) => {
                                                                                            const isReserved = !!lot.reservation_id;
                                                                                            return (
                                                                                                <div 
                                                                                                    key={`child-lot-${lot.receipt_id || lot.lot_no}`} 
                                                                                                    className={`text-xs p-2.5 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                                                                                                        isReserved 
                                                                                                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200 shadow-sm" 
                                                                                                            : "bg-card border-border hover:border-sky-500/40"
                                                                                                    }`}
                                                                                                >
                                                                                                    <div className="flex flex-col min-w-0">
                                                                                                        <div className="flex items-center gap-1.5 font-bold font-mono text-foreground truncate">
                                                                                                            <span>Lot: {lot.lot_no}</span>
                                                                                                            {isReserved && (
                                                                                                                <span className="text-[9px] font-black uppercase text-emerald-600 bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded">
                                                                                                                    Reserved ({lot.reserved_qty_for_this_lot?.toLocaleString()})
                                                                                                                </span>
                                                                                                            )}
                                                                                                        </div>
                                                                                                        <div className="text-[10px] text-muted-foreground mt-0.5">Source: {lot.receipt_no}</div>
                                                                                                    </div>
                                                                                                    <div className="flex items-center gap-2 shrink-0">
                                                                                                        <span className={`font-mono font-bold ${isReserved ? "text-emerald-600" : "text-foreground"}`}>
                                                                                                            {lot.available.toLocaleString()} avail
                                                                                                        </span>
                                                                                                        {isReserved ? (
                                                                                                            <Button
                                                                                                                size="xs"
                                                                                                                variant="ghost"
                                                                                                                onClick={() => setConfirmUnreserveData({ joId: childJo.order_id, materialId: cMat.jo_material_id || cMat.id, reservationId: lot.reservation_id, qty: lot.reserved_qty_for_this_lot, lotNo: lot.lot_no, productName: cMat.product_name })}
                                                                                                                className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 font-bold h-6 px-2 text-[10px] transition-all"
                                                                                                            >
                                                                                                                Unreserve
                                                                                                            </Button>
                                                                                                        ) : (
                                                                                                            shortfall > 0 && lot.available > 0 && (
                                                                                                                <Button
                                                                                                                    size="xs"
                                                                                                                    onClick={() => setConfirmReserveData({ joId: childJo.order_id, materialId: cMat.jo_material_id || cMat.id, productId: cMat.product_id, receivingId: lot.receipt_id, qty: Math.min(shortfall, lot.available), lotNo: lot.lot_no, productName: cMat.product_name })}
                                                                                                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-6 px-2.5 text-[10px] shadow-sm rounded-md transition-all"
                                                                                                                >
                                                                                                                    Reserve
                                                                                                                </Button>
                                                                                                            )
                                                                                                        )}
                                                                                                    </div>
                                                                                                </div>
                                                                                            );
                                                                                        })}
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
                                        <div><span className="text-muted-foreground">Planning Remarks:</span> <span className="font-medium ml-1">{selectedUnreleasedJo?.remarks || "None"}</span></div>
                                        <div><span className="text-muted-foreground">Shift Option:</span> <span className="font-medium ml-1">{selectedUnreleasedJo?.shiftOption || "8"} hours</span></div>
                                        <div>
                                            <span className="text-muted-foreground">Estimated Duration:</span> 
                                            <span className="font-medium ml-1">
                                                {(() => {
                                                    const setup = selectedUnreleasedJo?.routing_tasks?.reduce((sum: number, t: any) => sum + Number(t.planned_setup_hours || 0), 0) || 0;
                                                    const run = selectedUnreleasedJo?.routing_tasks?.reduce((sum: number, t: any) => sum + Number(t.planned_run_hours || 0), 0) || 0;
                                                    const parentTotal = setup + run;
                                                    
                                                    const pId = Number(selectedUnreleasedJo?.job_order_id || selectedUnreleasedJo?.id || 0);
                                                    const joNo = selectedUnreleasedJo?.jo_id || selectedUnreleasedJo?.job_order_no;
                                                    const childJos = unreleasedJobs.filter((c: any) => 
                                                        (c.parent_job_order_id && Number(c.parent_job_order_id) === pId) ||
                                                        (joNo && c.jo_id && String(c.jo_id).startsWith(`${joNo}-SUB`))
                                                    );
                                                    const subTotal = childJos.reduce((sum: number, c: any) => {
                                                        const cTasks = c.routing_tasks || [];
                                                        return sum + cTasks.reduce((tsum: number, t: any) => tsum + Number(t.planned_setup_hours || 0) + Number(t.planned_run_hours || 0), 0);
                                                    }, 0);

                                                    const combinedTotal = parentTotal + subTotal;
                                                    if (combinedTotal === 0) return "Not estimated";
                                                    const shiftHours = Number(selectedUnreleasedJo?.shiftOption || 8) || 8;
                                                    const days = (combinedTotal / shiftHours).toFixed(1);
                                                    
                                                    if (subTotal > 0) {
                                                        return `${combinedTotal.toFixed(1)} hrs (~${days} Days) [Parent: ${parentTotal.toFixed(1)}h, Sub-Assemblies: ${subTotal.toFixed(1)}h]`;
                                                    }
                                                    return `${combinedTotal.toFixed(1)} hrs (~${days} Days)`;
                                                })()}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">BOM Materials Allocation Worksheet</h4>
                                    
                                    {loadingMaterials ? (
                                        <div className="flex flex-col items-center justify-center py-12 space-y-2">
                                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                            <span className="text-sm text-muted-foreground font-medium">Resolving raw material reservations...</span>
                                        </div>
                                    ) : (
                                        <div className="border rounded-xl overflow-hidden bg-card shadow-sm">
                                            <table className="w-full text-sm text-left text-muted-foreground border-collapse">
                                                <thead className="text-xs uppercase bg-muted/40 font-bold border-b text-foreground">
                                                    <tr>
                                                        <th className="px-4 py-3">Raw Material</th>
                                                        <th className="px-4 py-3 text-right">Required</th>
                                                        <th className="px-4 py-3 text-right">Reserved</th>
                                                        <th className="px-4 py-3">Status</th>
                                                        <th className="px-4 py-3">Candidate Lots & Action</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y text-foreground/90">
                                                    {joMaterials.map((mat) => {
                                                        const needed = Number(mat.allocated_quantity || 0);
                                                        const reserved = Number(mat.reserved_quantity || 0);
                                                        const shortfall = needed - reserved;
                                                        const isMet = shortfall <= 0;

                                                        const totalAvailSubStock = mat.is_sub_assembly 
                                                            ? (mat.candidate_lots || []).reduce((acc: number, c: any) => acc + Number(c.available || 0), 0)
                                                            : 0;

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
                                                                    {needed.toLocaleString()} {mat.unit_shortcut}
                                                                </td>
                                                                <td className="px-4 py-4 text-right font-semibold text-primary">
                                                                    {reserved.toLocaleString()} {mat.unit_shortcut}
                                                                </td>
                                                                <td className="px-4 py-4">
                                                                    {isMet ? (
                                                                        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-extrabold px-2.5 py-1 text-xs shadow-sm">
                                                                            ✓ Fully Reserved
                                                                        </Badge>
                                                                    ) : (
                                                                        <div className="flex flex-col items-start gap-1.5">
                                                                            <Badge variant="destructive" className="font-extrabold px-2.5 py-1 text-xs shadow-sm">
                                                                                ⚠ Shortfall: {shortfall.toLocaleString()} {mat.unit_shortcut}
                                                                            </Badge>
                                                                        </div>
                                                                    )}
                                                                </td>
                                                                <td className="px-4 py-4">
                                                                    {(!mat.candidate_lots || mat.candidate_lots.length === 0) ? (
                                                                        <div className="text-xs text-amber-600 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20 font-medium flex items-center justify-between gap-3">
                                                                            <span>{mat.is_sub_assembly ? "No completed manufacturing lots found." : "No Passed lots found in this branch."}</span>
                                                                            {!mat.is_sub_assembly && (
                                                                                <Button
                                                                                    size="xs"
                                                                                    onClick={() => {
                                                                                        setSelectedUnreleasedJo(null);
                                                                                        setJoMaterials([]);
                                                                                        window.location.href = "/mm/incoming-shipments";
                                                                                    }}
                                                                                    className="bg-amber-600 hover:bg-amber-500 text-white font-bold h-7 text-[10px] px-2.5 rounded-md shadow-sm shrink-0"
                                                                                >
                                                                                    Log Receipt
                                                                                </Button>
                                                                            )}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="space-y-2 max-w-md">
                                                                            {mat.candidate_lots.map((lot: any) => {
                                                                                const isReserved = !!lot.reservation_id;
                                                                                return (
                                                                                    <div 
                                                                                        key={lot.receipt_id || lot.lot_no} 
                                                                                        className={`text-xs p-2.5 rounded-lg border flex items-center justify-between gap-3 transition-all ${
                                                                                            isReserved 
                                                                                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-950 dark:text-emerald-200" 
                                                                                                : "bg-card border-border hover:border-primary/40"
                                                                                        }`}
                                                                                    >
                                                                                        <div className="flex flex-col min-w-0">
                                                                                            <div className="flex items-center gap-1.5 font-bold font-mono text-foreground truncate">
                                                                                                <span>Lot: {lot.lot_no}</span>
                                                                                                {isReserved && (
                                                                                                    <span className="text-[9px] font-black uppercase text-emerald-600 bg-emerald-100 dark:bg-emerald-900/60 px-1.5 py-0.5 rounded">
                                                                                                        Reserved ({lot.reserved_qty_for_this_lot?.toLocaleString()})
                                                                                                    </span>
                                                                                                )}
                                                                                            </div>
                                                                                            <div className="text-[10px] text-muted-foreground mt-0.5">Source: {lot.receipt_no}</div>
                                                                                        </div>
                                                                                        <div className="flex items-center gap-2 shrink-0">
                                                                                            <span className={`font-mono font-bold ${isReserved ? "text-emerald-600" : "text-foreground"}`}>
                                                                                                {lot.available.toLocaleString()} available
                                                                                            </span>
                                                                                            {!mat.is_sub_assembly && (
                                                                                                isReserved ? (
                                                                                                    <Button
                                                                                                        size="xs"
                                                                                                        variant="ghost"
                                                                                                        onClick={() => setConfirmUnreserveData({ joId: selectedUnreleasedJo.order_id, materialId: mat.jo_material_id || mat.id, reservationId: lot.reservation_id, qty: lot.reserved_qty_for_this_lot, lotNo: lot.lot_no, productName: mat.product_name })}
                                                                                                        className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 font-bold h-6 px-2 text-[10px] transition-all"
                                                                                                    >
                                                                                                        Unreserve
                                                                                                    </Button>
                                                                                                ) : (
                                                                                                    shortfall > 0 && lot.available > 0 && (
                                                                                                        <Button
                                                                                                            size="xs"
                                                                                                            onClick={() => setConfirmReserveData({ joId: selectedUnreleasedJo.order_id, materialId: mat.jo_material_id || mat.id, productId: mat.product_id, receivingId: lot.receipt_id, qty: Math.min(shortfall, lot.available), lotNo: lot.lot_no, productName: mat.product_name })}
                                                                                                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-6 px-2.5 text-[10px] shadow-sm rounded-md transition-all"
                                                                                                        >
                                                                                                            Reserve
                                                                                                        </Button>
                                                                                                    )
                                                                                                )
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                );
                                                                            })}
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
                                className="font-bold h-10 px-4 text-xs flex items-center gap-1.5 border-amber-500/30 text-amber-600 hover:text-amber-500 hover:bg-amber-500/10 dark:text-amber-400" 
                                onClick={handlePrintShortfall}
                            >
                                <Printer className="h-4 w-4" />
                                Print Shortfall
                            </Button>
                            <Button 
                                variant="outline" 
                                className="font-bold h-10 px-4 text-xs flex items-center gap-1.5 border-primary/30 text-primary hover:bg-primary/10" 
                                onClick={handlePrintJobOrder}
                            >
                                <Printer className="h-4 w-4" />
                                Print Job Order
                            </Button>
                        </div>

                        <div className="flex items-center gap-3">
                            <Button 
                                variant="outline" 
                                className="font-bold h-10 px-5 text-xs" 
                                onClick={() => {
                                    setSelectedUnreleasedJo(null);
                                    setJoMaterials([]);
                                }}
                            >
                                Close Details
                            </Button>
                        <Button
                            onClick={async () => {
                                const parentId = selectedUnreleasedJo.order_id;
                                setSelectedUnreleasedJo(null);
                                setJoMaterials([]);
                                
                                // Release parent JO
                                await handleReleaseDraftFromPlanning(parentId);

                                // If family view, also release all child JOs in family
                                for (const child of familyChildJobs) {
                                    if (child.order_id) {
                                        await handleReleaseDraftFromPlanning(child.order_id);
                                    }
                                }
                            }}
                            disabled={releasingDraftId === selectedUnreleasedJo?.order_id || loadingMaterials}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-10 px-5 text-xs shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all duration-200"
                        >
                            {releasingDraftId === selectedUnreleasedJo?.order_id 
                                ? "Releasing..." 
                                : familyChildJobs.length > 0 
                                    ? `Release Entire Family (${1 + familyChildJobs.length} Job Orders)`
                                    : "Release to Shop Floor"}
                        </Button>
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
        </div>
    );
}
