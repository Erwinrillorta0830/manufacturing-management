/* eslint-disable */
import React, { useState, useEffect, useMemo } from "react";
import { Loader2, ArrowRight, ArrowLeft, Check, UserPlus, ShieldAlert, CheckCircle, Clock, Package, Layers } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import { Branch, SalesOrderDetail } from "../types";
import { OperatorSelect } from "./OperatorSelect";
import { SearchableVersionSelect } from "./SearchableVersionSelect";
import { SubmittingLoadingOverlay } from "./SubmittingLoadingOverlay";
import { calculateContainerizationMetrics, formatHoursToHMS } from "../utils/containerization-helper";
import { calculateUnitCOGSBreakdown } from "../utils/cogs-helper";

interface ReleaseJODialogProps {
    isConfirmOpen: boolean;
    setIsConfirmOpen: (open: boolean) => void;
    selectedLines: SalesOrderDetail[];
    branches: Branch[];
    selectedBranchId: number | null;
    joNumber: string;
    setJoNumber: (val: string) => void;
    targetQuantity: number;
    setTargetQuantity: (val: number) => void;
    dueDate: string;
    setDueDate: (val: string) => void;
    shiftOption: string;
    setShiftOption: (val: string) => void;
    remarks: string;
    setRemarks: (val: string) => void;
    releasingJO: boolean;
    handleConfirmRelease: (selectedSubAssemblyVersions?: Record<number, number>) => void;
    assignments: Record<number, number[]>;
    setAssignments: React.Dispatch<React.SetStateAction<Record<number, number[]>>>;
}

export function ReleaseJODialog({
    isConfirmOpen,
    setIsConfirmOpen,
    selectedLines,
    branches,
    selectedBranchId,
    joNumber,
    setJoNumber,
    targetQuantity,
    setTargetQuantity,
    dueDate,
    setDueDate,
    shiftOption,
    setShiftOption,
    remarks,
    setRemarks,
    releasingJO,
    handleConfirmRelease,
    assignments,
    setAssignments
}: ReleaseJODialogProps) {
    const [currentStep, setCurrentStep] = useState(1);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [hasLoadedDetails, setHasLoadedDetails] = useState(false);
    const [routings, setRoutings] = useState<any[]>([]);
    const [components, setComponents] = useState<any[]>([]);
    const [inventories, setInventories] = useState<Record<number, any>>({});
    const [operators, setOperators] = useState<any[]>([]);
    const [bomBaseQty, setBomBaseQty] = useState(1);
    const [searchQuery, setSearchQuery] = useState("");
    const [subAssemblyBoms, setSubAssemblyBoms] = useState<Record<number, any[]>>({});
    const [subAssemblyRoutings, setSubAssemblyRoutings] = useState<Record<number, { setup_time_hours: number; run_time_hours_per_unit: number; base_quantity: number }>>({});
    const [subAssemblyVersions, setSubAssemblyVersions] = useState<Record<number, any[]>>({});
    const [selectedSubAssemblyVersions, setSelectedSubAssemblyVersions] = useState<Record<number, number>>({});
    const [loadingSubVersion, setLoadingSubVersion] = useState<Record<number, boolean>>({});
    const [printSelection, setPrintSelection] = useState<Record<string, boolean>>({});

    const selectedBranch = branches.find((b) => b.id === selectedBranchId);

    // Reset step on open/close
    useEffect(() => {
        if (!isConfirmOpen) {
            setCurrentStep(1);
            setRoutings([]);
            setComponents([]);
            setInventories({});
            setAssignments({});
            setSearchQuery("");
            setSubAssemblyBoms({});
            setSubAssemblyRoutings({});
            setSubAssemblyVersions({});
            setSelectedSubAssemblyVersions({});
            setLoadingSubVersion({});
            setPrintSelection({});
            setHasLoadedDetails(false);
        }
    }, [isConfirmOpen, setAssignments]);

    // Fetch master operators list once dialog opens
    useEffect(() => {
        if (isConfirmOpen) {
            fetch("/api/manufacturing/planning-engineering?action=users")
                .then((r) => r.json())
                .then((data) => setOperators(Array.isArray(data) ? data : []))
                .catch((err) => console.error("Failed to fetch operators:", err));
        }
    }, [isConfirmOpen]);

    // Fetch BOM & Routing details on Step 2
    useEffect(() => {
        if (isConfirmOpen && selectedLines.length > 0 && currentStep >= 2 && !hasLoadedDetails) {
            const loadDetails = async () => {
                setLoadingDetails(true);
                try {
                    const first = selectedLines[0];
                    const pId = first.product_id.product_id;
                    const bId = first.bom_version_id;
                    const url = `/api/manufacturing/planning-engineering?action=wizard-step-2&productId=${pId}&bomId=${bId || ""}&branchId=${selectedBranchId || 1}`;
                    const res = await fetch(url);
                    if (res.ok) {
                        const data = await res.json();
                        setRoutings(data.routings || []);
                        setComponents(data.components || []);
                        setSubAssemblyBoms(data.subAssemblyBoms || {});
                        setSubAssemblyRoutings(data.subAssemblyRoutings || {});
                        setSubAssemblyVersions(data.subAssemblyVersions || {});
                        setSelectedSubAssemblyVersions(data.selectedSubAssemblyVersions || {});
                        setInventories(data.inventories || {});
                        if (data.bom) {
                            setBomBaseQty(Number(data.bom.base_quantity || 1));
                        }
                        setHasLoadedDetails(true);
                    }
                } catch (err) {
                    console.error("Failed to load wizard details:", err);
                } finally {
                    setLoadingDetails(false);
                }
            };
            loadDetails();
        }
    }, [isConfirmOpen, selectedLines, currentStep, selectedBranchId, hasLoadedDetails]);

    const handleSubAssemblyVersionChange = async (subProdId: number, versionId: number) => {
        setSelectedSubAssemblyVersions(prev => ({ ...prev, [subProdId]: versionId }));
        setLoadingSubVersion(prev => ({ ...prev, [subProdId]: true }));
        try {
            const url = `/api/manufacturing/planning-engineering?action=sub-assembly-version-details&productId=${subProdId}&versionId=${versionId}&branchId=${selectedBranchId || 1}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setSubAssemblyBoms(prev => ({ ...prev, [subProdId]: data.bomItems || [] }));
                setSubAssemblyRoutings(prev => ({ ...prev, [subProdId]: data.routing || { setup_time_hours: 0, run_time_hours_per_unit: 0, base_quantity: 1 } }));
                if (data.inventories) {
                    setInventories(prev => ({ ...prev, ...data.inventories }));
                }
            }
        } catch (e) {
            console.error("Failed to load sub-assembly version details:", e);
        } finally {
            setLoadingSubVersion(prev => ({ ...prev, [subProdId]: false }));
        }
    };

    // Initialize default print selections for shortfalls
    useEffect(() => {
        const initialSelections: Record<string, boolean> = {};
        components.forEach((comp) => {
            const compProductId = comp.component_product_id?.product_id;
            const needed = (Number(comp.quantity_required) * (1 + (Number(comp.wastage_factor_percentage || 0) / 100))) * (targetQuantity / bomBaseQty);
            const available = compProductId ? (inventories[Number(compProductId)]?.on_hand || 0) : 0;
            const shortfall = Math.max(0, needed - available);

            if (shortfall > 0) {
                const children = subAssemblyBoms[Number(compProductId)] || [];
                const isSubAssembly = children.length > 0 || comp.component_product_id?.product_type === 388 || comp.component_product_id?.is_finished_good;
                initialSelections[`parent-${compProductId}`] = !isSubAssembly;

                if (isSubAssembly) {
                    const children = subAssemblyBoms[Number(compProductId)] || [];
                    children.forEach((cc) => {
                        const ccId = cc.component_product_id?.product_id;
                        const ccNeeded = Number(cc.quantity_required) * shortfall;
                        const ccAvailable = ccId ? (inventories[Number(ccId)]?.on_hand || 0) : 0;
                        const ccShortfall = Math.max(0, ccNeeded - ccAvailable);
                        if (ccShortfall > 0) {
                            initialSelections[`child-${compProductId}-${ccId}`] = true;
                        }
                    });
                }
            }
        });
        setPrintSelection(initialSelections);
    }, [components, inventories, subAssemblyBoms, targetQuantity, bomBaseQty]);

    // Calculate time metrics (Main assembly + Sub-assembly shortfall runs)
    const boxSetupHours = routings.reduce((sum, r) => sum + Number(r.setup_time_hours || 0), 0);
    const boxBatchCount = bomBaseQty > 0 ? (targetQuantity / bomBaseQty) : 1;
    const boxRunHours = boxBatchCount * routings.reduce((sum, r) => sum + Number(r.run_time_hours || 0), 0);
    const boxEstimatedHours = boxSetupHours + boxRunHours;

    let subAssemblyEstimatedHours = 0;
    components.forEach((comp) => {
        const compProductId = Number(comp.component_product_id?.product_id || 0);
        const needed = (Number(comp.quantity_required || 0) * (1 + (Number(comp.wastage_factor_percentage || 0) / 100))) * (targetQuantity / bomBaseQty);
        const available = compProductId ? Number(inventories[compProductId]?.on_hand || 0) : 0;
        const shortfall = Math.max(0, needed - available);
        const subRoute = compProductId ? (subAssemblyRoutings[compProductId] || (subAssemblyRoutings as any)[String(compProductId)]) : null;
        if (shortfall > 0 && subRoute) {
            const subBaseQty = Number(subRoute.base_quantity || 6986.19);
            const subBatches = subBaseQty > 0 ? (shortfall / subBaseQty) : 1;
            const subSetup = Number(subRoute.setup_time_hours || 0);
            const subRunPerBatch = Number((subRoute as any).total_run_time_hours || (subRoute as any).run_time_hours || (Number(subRoute.run_time_hours_per_unit || 0) * subBaseQty));
            const subRun = subRunPerBatch * subBatches;
            subAssemblyEstimatedHours += (subSetup + subRun);
        }
    });

    const totalSetupHours = boxSetupHours;
    const totalRunHours = boxRunHours;
    const totalEstimatedHours = boxEstimatedHours + subAssemblyEstimatedHours;

    const containerMetrics = useMemo(() => {
        if (!selectedLines || selectedLines.length === 0) return null;
        const first = selectedLines[0];
        const prodObj = first.product_id as any;
        if (!prodObj) return null;
        return calculateContainerizationMetrics(
            prodObj.product_name || prodObj.product_code || "Product",
            targetQuantity,
            prodObj.unit_of_measurement_count
        );
    }, [selectedLines, targetQuantity]);

    const cogsBreakdown = useMemo(() => {
        if (!selectedLines || selectedLines.length === 0) return null;
        const first = selectedLines[0];
        const prodObj = first.product_id as any;
        if (!prodObj) return null;

        const bomItemsForCosting = components.map((comp) => ({
            quantity_required: Number(comp.quantity_required || 0),
            wastage_factor_percentage: Number(comp.wastage_factor_percentage || 0),
            cost_per_unit: Number(comp.component_product_id?.cost_per_unit || comp.cost_per_unit || 0)
        }));

        const routeStepsForCosting = routings.map((r) => ({
            sequence_order: Number(r.sequence_order || 0),
            work_center_id: Number(r.work_center_id || 0),
            setup_time_hours: Number(r.setup_time_hours || 0),
            run_time_hours: Number(r.run_time_hours || 0),
            step_batch_size: Number(r.step_batch_size || 1),
            work_center_overhead_cost_per_hour: Number(r.work_center?.overhead_cost_per_hour || r.overhead_cost_per_hour || 0)
        }));

        return calculateUnitCOGSBreakdown(
            bomBaseQty,
            (first as any).expected_yield_percentage || prodObj.expected_yield_percentage,
            (first as any).custom_overhead || prodObj.custom_overhead,
            bomItemsForCosting,
            routeStepsForCosting,
            Number(prodObj.target_selling_price || prodObj.targetSellingPrice || 0)
        );
    }, [selectedLines, components, routings, bomBaseQty]);

    const hasShortfalls = components.some((comp) => {
        const compProductId = comp.component_product_id?.product_id;
        const needed = (Number(comp.quantity_required) * (1 + (Number(comp.wastage_factor_percentage || 0) / 100))) * (targetQuantity / bomBaseQty);
        const available = compProductId ? (inventories[Number(compProductId)]?.on_hand || 0) : 0;
        return Math.max(0, needed - available) > 0;
    });

    const handlePrintProcurementRequest = () => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) return;

        const dateStr = new Date().toLocaleDateString();
        const branchName = selectedBranch?.branch_name || "Main Branch";

        let tableRowsHtml = "";
        components.forEach((comp) => {
            const compProductId = comp.component_product_id?.product_id;
            const needed = (Number(comp.quantity_required) * (1 + (Number(comp.wastage_factor_percentage || 0) / 100))) * (targetQuantity / bomBaseQty);
            const available = compProductId ? (inventories[Number(compProductId)]?.on_hand || 0) : 0;
            const shortfall = Math.max(0, needed - available);
            const uom = comp.unit_of_measurement || "pcs";
            const children = subAssemblyBoms[Number(compProductId)] || [];
            const isSubAssembly = children.length > 0 || comp.component_product_id?.product_type === 388 || comp.component_product_id?.is_finished_good;

            if (shortfall > 0 && printSelection[`parent-${compProductId}`]) {
                tableRowsHtml += `
                    <tr>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">
                            ${comp.component_product_id?.product_name || `Product #${compProductId}`}
                            <div style="font-size: 9px; color: #64748b; font-weight: normal; margin-top: 1px;">
                                ${comp.component_product_id?.product_code || ""}
                            </div>
                        </td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: center;">${needed.toLocaleString(undefined, {maximumFractionDigits:2})} ${uom}</td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #64748b;">${available.toLocaleString(undefined, {maximumFractionDigits:2})} ${uom}</td>
                        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: #e11d48;">${shortfall.toLocaleString(undefined, {maximumFractionDigits:2})} ${uom}</td>
                    </tr>
                `;
            }

            if (isSubAssembly && shortfall > 0) {
                const children = subAssemblyBoms[Number(compProductId)] || [];
                children.forEach((cc) => {
                    const ccId = cc.component_product_id?.product_id;
                    const ccNeeded = Number(cc.quantity_required) * shortfall;
                    const ccAvailable = ccId ? (inventories[Number(ccId)]?.on_hand || 0) : 0;
                    const ccShortfall = Math.max(0, ccNeeded - ccAvailable);
                    const ccUom = cc.unit_of_measurement || "pcs";

                    if (ccShortfall > 0 && printSelection[`child-${compProductId}-${ccId}`]) {
                        tableRowsHtml += `
                            <tr>
                                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold; padding-left: 20px; color: #475569;">
                                    ↳ ${cc.component_product_id?.product_name || `Product #${ccId}`}
                                    <div style="font-size: 8px; color: #94a3b8; font-weight: normal; margin-top: 1px; padding-left: 10px;">
                                        Sub-ingredient for ${comp.component_product_id?.product_name} | Code: ${cc.component_product_id?.product_code || ""}
                                    </div>
                                </td>
                                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #475569;">${ccNeeded.toLocaleString(undefined, {maximumFractionDigits:2})} ${ccUom}</td>
                                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #94a3b8;">${ccAvailable.toLocaleString(undefined, {maximumFractionDigits:2})} ${ccUom}</td>
                                <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold; color: #e11d48;">${ccShortfall.toLocaleString(undefined, {maximumFractionDigits:2})} ${ccUom}</td>
                            </tr>
                        `;
                    }
                });
            }
        });

        const html = `
            <html>
                <head>
                    <title>MRP Procurement Request - JO Release Shortfall</title>
                    <style>
                        @page { size: portrait; margin: 10mm; }
                        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; margin: 0; padding: 10px; line-height: 1.4; font-size: 11px; }
                        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #334155; padding-bottom: 12px; margin-bottom: 15px; }
                        .title { font-size: 18px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
                        .meta-info { font-size: 11px; line-height: 1.5; text-align: right; color: #475569; }
                        .jo-summary { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 15px; margin-bottom: 15px; }
                        .jo-summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; font-size: 11px; }
                        .jo-summary-label { font-weight: bold; color: #64748b; font-size: 9px; text-transform: uppercase; margin-bottom: 2px; }
                        .jo-summary-value { font-weight: 700; color: #0f172a; font-size: 12px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
                        th { background-color: #f1f5f9; color: #1e293b; padding: 6px 8px; font-weight: bold; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; border-bottom: 2px solid #cbd5e1; }
                        .footer { border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; margin-top: 25px; }
                        .sign-line { margin-top: 30px; display: flex; justify-content: space-between; }
                        .sign-box { border-top: 1px dashed #475569; width: 180px; text-align: center; padding-top: 5px; font-size: 10px; font-weight: bold; color: #334155; }
                        @media print {
                            body { padding: 0; margin: 0; font-size: 10px; }
                            .no-print { display: none !important; }
                            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                            tr { page-break-inside: avoid; }
                        }
                    </style>
                </head>
                <body onload="window.print(); window.close()">
                    <div class="no-print" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <span style="font-size: 10px; font-weight: bold; color: #fff; background-color: #e11d48; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px;">MRP Shortage Warning</span>
                    </div>

                    <div class="header">
                        <div>
                            <div class="title">MRP Procurement Request</div>
                            <div style="font-size: 11px; color: #64748b; margin-top: 3px;">Generated by Quality & Production Planning Console</div>
                        </div>
                        <div class="meta-info">
                            <div><strong>Request Date:</strong> ${dateStr}</div>
                            <div><strong>Target Branch:</strong> ${branchName}</div>
                            <div><strong>Request ID:</strong> PR-${joNumber}-${Math.floor(1000 + Math.random() * 9000)}</div>
                        </div>
                    </div>

                    <div class="jo-summary">
                        <div class="jo-summary-grid">
                            <div>
                                <div class="jo-summary-label">Target Job Order</div>
                                <div class="jo-summary-value">${joNumber}</div>
                            </div>
                            <div>
                                <div class="jo-summary-label">Plan Output Quantity</div>
                                <div class="jo-summary-value">${targetQuantity.toLocaleString()} units</div>
                            </div>
                            <div>
                                <div class="jo-summary-label">Estimated Days</div>
                                <div class="jo-summary-value">${(totalEstimatedHours / (Number(shiftOption) || 8)).toFixed(1)} Days</div>
                            </div>
                        </div>
                    </div>

                    <h3 style="font-size: 12px; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; padding-bottom: 5px; margin-bottom: 10px; color: #0f172a;">Shortfall Materials Checklist</h3>
                    <table>
                        <thead>
                            <tr>
                                <th style="text-align: left; padding: 6px 8px;">Raw Material</th>
                                <th style="width: 20%; padding: 6px 8px;">Total Needed</th>
                                <th style="width: 20%; padding: 6px 8px;">On Hand Stock</th>
                                <th style="width: 20%; padding: 6px 8px;">Shortfall (Required Buy)</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>

                    <div class="sign-line">
                        <div class="sign-box">Prepared By (Planner)</div>
                        <div class="sign-box">Approved By (QA Manager)</div>
                        <div class="sign-box">Received By (Purchasing)</div>
                    </div>

                    <div class="footer">
                        <div>ERP Automated Material Requirements Planning (MRP)</div>
                        <div>Page 1 of 1</div>
                    </div>
                </body>
            </html>
        `;

        printWindow.document.write(html);
        printWindow.document.close();
    };

    // Toggle operator assignment
    const handleToggleOperator = (seq: number, opId: number) => {
        setAssignments((prev) => {
            const current = prev[seq] || [];
            if (current.includes(opId)) {
                return { ...prev, [seq]: current.filter((id) => id !== opId) };
            } else {
                return { ...prev, [seq]: [...current, opId] };
            }
        });
    };

    return (
        <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
            <DialogContent className="max-w-6xl w-[94vw] max-h-[92vh] flex flex-col p-6 overflow-hidden bg-card text-foreground border-border sm:max-w-6xl">
                <DialogHeader className="border-b border-border pb-3">
                    <DialogTitle className="text-lg font-bold flex items-center justify-between text-foreground">
                        <span>Release Production Run</span>
                        <span className="text-xs bg-primary/20 text-primary border border-primary/30 px-2.5 py-0.5 rounded-full font-semibold">
                            Step {currentStep} of 3
                        </span>
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground text-xs">
                        Configure targets, verify component sufficiency, and dispatch tasks to operators.
                    </DialogDescription>
                </DialogHeader>

                {/* Progress Indicators */}
                <div className="flex items-center gap-1.5 px-1 py-1">
                    {[1, 2, 3].map((s) => (
                        <div
                            key={s}
                            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                                s <= currentStep ? "bg-primary" : "bg-muted"
                            }`}
                        />
                    ))}
                </div>

                {selectedLines.length > 0 && (
                    <div className="py-2 space-y-4 flex-1 overflow-y-auto max-h-[68vh] px-1">
                        
                        {/* STEP 1: CONFIGURE HEADER PARAMETERS */}
                        {currentStep === 1 && (
                            <div className="space-y-4">
                                <div className="bg-muted/50 border border-border/80 rounded-xl p-3 text-xs space-y-2">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Target Product SKU:</span>
                                        <span className="font-bold text-foreground">{selectedLines[0].product_id.product_name}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Recipe Version:</span>
                                        <span className="font-bold text-primary">{selectedLines[0].bom_version_name || "Default"}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Target Branch:</span>
                                        <span className="font-semibold text-foreground">{selectedBranch?.branch_name}</span>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                            Job Order Reference #
                                        </label>
                                        <Input
                                            value={joNumber}
                                            onChange={(e) => setJoNumber(e.target.value)}
                                            className="h-9 font-semibold bg-card border-input text-foreground"
                                            placeholder="JO-XXXXXX"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                            Target Production Quantity
                                        </label>
                                        <Input
                                            type="number"
                                            value={targetQuantity}
                                            onChange={(e) => setTargetQuantity(Math.max(1, Number(e.target.value)))}
                                            className="h-9 font-semibold bg-card border-input text-foreground"
                                        />
                                        <p className="text-[10px] text-muted-foreground">
                                            Scale quantity up or down according to branch net requirements or batch sizing.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                                Due Date
                                            </label>
                                            <Input
                                                type="date"
                                                value={dueDate}
                                                onChange={(e) => setDueDate(e.target.value)}
                                                className="h-9 font-semibold bg-card border-input text-foreground"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                                Shift Option (Hours)
                                            </label>
                                            <Input
                                                type="number"
                                                step="0.1"
                                                min="0.1"
                                                max="24"
                                                value={shiftOption}
                                                onChange={(e) => setShiftOption(e.target.value)}
                                                className="h-9 font-semibold bg-card border-input text-foreground font-mono"
                                                placeholder="e.g. 8.0"
                                                required
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                            Remarks
                                        </label>
                                        <Input
                                            value={remarks}
                                            onChange={(e) => setRemarks(e.target.value)}
                                            className="h-9 text-xs bg-card border-input text-foreground"
                                            placeholder="Add planning notes here..."
                                        />
                                    </div>
                                </div>
                            </div>
                        )}                        {/* STEP 2: TIME & MATERIAL SUFFICIENCY */}
                        {currentStep === 2 && (
                            <div className="space-y-4">
                                {loadingDetails ? (
                                    <div className="flex flex-col items-center justify-center py-10 space-y-3">
                                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                        <p className="text-xs text-muted-foreground font-medium">Analyzing BOM and routes...</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* Time Summary Breakdown Cards */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            {/* Main Assembly Card */}
                                            <div className="bg-card border border-border rounded-xl p-3 flex flex-col justify-between">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Package className="h-4 w-4 text-primary" />
                                                    <span className="text-xs font-bold text-foreground">📦 Assembly</span>
                                                </div>
                                                <div>
                                                    <div className="text-base font-black text-foreground">
                                                        {boxEstimatedHours.toFixed(1)} hrs
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground font-medium">
                                                        {Number(shiftOption) > 0 ? `~${(boxEstimatedHours / Number(shiftOption)).toFixed(1)} Days` : `${boxEstimatedHours.toFixed(1)} hrs`}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Sub-Assembly Card */}
                                            <div className={`bg-card border rounded-xl p-3 flex flex-col justify-between ${subAssemblyEstimatedHours > 0 ? "border-sky-500/30 bg-sky-500/5" : "border-border"}`}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Layers className="h-4 w-4 text-sky-500" />
                                                    <span className="text-xs font-bold text-foreground">🧩 Sub-Assembly</span>
                                                </div>
                                                <div>
                                                    <div className="text-base font-black text-foreground">
                                                        {subAssemblyEstimatedHours.toFixed(1)} hrs
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground font-medium">
                                                        {subAssemblyEstimatedHours > 0 && Number(shiftOption) > 0
                                                            ? `~${(subAssemblyEstimatedHours / Number(shiftOption)).toFixed(1)} Days`
                                                            : "No piece shortfalls"}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Total Duration Card */}
                                            <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 flex flex-col justify-between">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Clock className="h-4 w-4 text-primary" />
                                                    <span className="text-xs font-bold text-foreground">⏱️ Total Lead Time</span>
                                                </div>
                                                <div>
                                                    <div className="text-base font-black text-primary font-mono tracking-tight">
                                                        {formatHoursToHMS(totalEstimatedHours)}
                                                    </div>
                                                    <div className="text-[10px] text-primary/80 font-bold">
                                                        {Number(shiftOption) > 0 ? `~${(totalEstimatedHours / Number(shiftOption)).toFixed(1)} Days (${totalEstimatedHours.toFixed(1)} hrs)` : `${totalEstimatedHours.toFixed(1)} hrs Total`}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Batch Yield & Pallet Containerization Banner */}
                                        {containerMetrics && (
                                            <div className="bg-muted/40 border border-border rounded-xl p-3.5 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Package className="h-4 w-4 text-emerald-500" />
                                                        <span className="text-xs font-bold text-foreground uppercase tracking-wider text-[11px]">
                                                            📦 Plant Production & Pallet Containerization
                                                        </span>
                                                    </div>
                                                    <Badge variant="outline" className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
                                                        {containerMetrics.expectedYieldPercentage}% Yield Factor
                                                    </Badge>
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                                                    <div className="bg-background border border-border/60 rounded-lg p-2">
                                                        <span className="text-[10px] font-medium text-muted-foreground block">🌾 Batch Mix & Sacks</span>
                                                        <span className="font-extrabold text-foreground text-xs">{containerMetrics.mixCount} Mixes</span>
                                                        <span className="text-[10px] text-muted-foreground block">({containerMetrics.sackCount} Sacks / {(containerMetrics.flourGramsTotal / 1000).toLocaleString()} kg Flour)</span>
                                                    </div>
                                                    <div className="bg-background border border-border/60 rounded-lg p-2">
                                                        <span className="text-[10px] font-medium text-muted-foreground block">🏭 Expected Net Pcs</span>
                                                        <span className="font-extrabold text-foreground text-xs">{Math.round(containerMetrics.netPieces).toLocaleString()} Pcs</span>
                                                        <span className="text-[10px] text-muted-foreground block">({(containerMetrics.scrapRate * 100).toFixed(1)}% Waste Scrap)</span>
                                                    </div>
                                                    <div className="bg-background border border-border/60 rounded-lg p-2">
                                                        <span className="text-[10px] font-medium text-muted-foreground block">📦 Cases / Bundles</span>
                                                        <span className="font-extrabold text-foreground text-xs">{containerMetrics.totalCasesBundlesFull} Full</span>
                                                        <span className="text-[10px] text-muted-foreground block">(+{containerMetrics.remainingPcs} pcs remaining)</span>
                                                    </div>
                                                    <div className="bg-background border border-border/60 rounded-lg p-2">
                                                        <span className="text-[10px] font-medium text-muted-foreground block">🚛 Pallet Allocation</span>
                                                        <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-xs">{containerMetrics.totalPalletsFull} Pallets</span>
                                                        <span className="text-[10px] text-muted-foreground block">(+{containerMetrics.remainingCasesBundles} cases/bundles)</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Live Unit COGS & Cost Breakdown Banner */}
                                        {cogsBreakdown && (
                                            <div className="bg-sky-500/5 border border-sky-500/20 dark:bg-sky-950/20 dark:border-sky-500/30 rounded-xl p-3.5 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="text-[10px] font-extrabold bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/30">
                                                            💰 Unit COGS & Labor Breakdown
                                                        </Badge>
                                                        <span className="text-[11px] font-semibold text-muted-foreground">
                                                            Base COGS: <strong className="text-foreground">₱{cogsBreakdown.baseUnitCOGS.toFixed(2)}</strong> / unit
                                                        </span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-xs font-black text-sky-600 dark:text-sky-400">
                                                            ₱{cogsBreakdown.adjustedUnitCOGS.toFixed(2)} / unit
                                                        </span>
                                                        <span className="text-[9px] text-muted-foreground block font-medium">
                                                            (Adjusted for {cogsBreakdown.expectedYieldPercentage}% Yield)
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-3 gap-2 pt-1 text-[11px]">
                                                    <div className="bg-background border border-border/60 rounded-lg p-2">
                                                        <span className="text-[10px] font-medium text-muted-foreground block">🥦 Direct Materials</span>
                                                        <span className="font-extrabold text-foreground text-xs">₱{cogsBreakdown.materialCostPerUnit.toFixed(2)}</span>
                                                        <span className="text-[9px] text-muted-foreground block">Raw Materials & Packaging</span>
                                                    </div>
                                                    <div className="bg-background border border-border/60 rounded-lg p-2">
                                                        <span className="text-[10px] font-medium text-muted-foreground block">👥 Direct Labor</span>
                                                        <span className="font-extrabold text-foreground text-xs">₱{cogsBreakdown.directLaborCostPerUnit.toFixed(2)}</span>
                                                        <span className="text-[9px] text-muted-foreground block">
                                                            {cogsBreakdown.isCustomLaborOverride ? "Fixed Version Override" : "Work Center Hourly Rate"}
                                                        </span>
                                                    </div>
                                                    <div className="bg-background border border-border/60 rounded-lg p-2">
                                                        <span className="text-[10px] font-medium text-muted-foreground block">🏭 Factory Overhead</span>
                                                        <span className="font-extrabold text-foreground text-xs">₱{cogsBreakdown.factoryOverheadCostPerUnit.toFixed(2)}</span>
                                                        <span className="text-[9px] text-muted-foreground block">Power, Steam & Depreciation</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Material Checklist */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center mb-1">
                                                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider text-[10px]">
                                                    Component Sufficiency Checklist
                                                </h4>
                                                {hasShortfalls && (
                                                    <Button
                                                        type="button"
                                                        onClick={handlePrintProcurementRequest}
                                                        variant="outline"
                                                        size="xs"
                                                        className="h-6 gap-1 bg-amber-500/10 dark:bg-amber-950/20 hover:bg-amber-500/20 dark:hover:bg-amber-900/30 text-amber-600 dark:text-amber-400 border-amber-500/20 dark:border-amber-500/30 font-bold text-[10px]"
                                                    >
                                                        Print Procurement Request
                                                    </Button>
                                                )}
                                            </div>
                                            {components.length === 0 ? (
                                                <p className="text-xs text-muted-foreground py-3 text-center">No raw material requirements specified.</p>
                                            ) : (
                                                <div className="border border-border rounded-xl overflow-hidden">
                                                    <table className="w-full text-[11px] text-left border-collapse">
                                                        <thead>
                                                            <tr className="bg-muted text-muted-foreground border-b border-border font-bold uppercase tracking-wider text-[9px]">
                                                                <th className="p-2.5 w-8 text-center">PR</th>
                                                                <th className="p-2.5">Raw Material / Component</th>
                                                                <th className="p-2.5 text-center">Needed</th>
                                                                <th className="p-2.5 text-center">On Hand</th>
                                                                <th className="p-2.5 text-center">Shortfall</th>
                                                                <th className="p-2.5 text-right">Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {components.map((comp, index) => {
                                                                const compProductId = comp.component_product_id?.product_id;
                                                                const needed = (Number(comp.quantity_required) * (1 + (Number(comp.wastage_factor_percentage || 0) / 100))) * (targetQuantity / bomBaseQty);
                                                                const available = compProductId ? (inventories[Number(compProductId)]?.on_hand || 0) : 0;
                                                                const shortfall = Math.max(0, needed - available);
                                                                const isSufficient = shortfall === 0;
                                                                const uom = comp.unit_of_measurement || "pcs";
                                                                const children = subAssemblyBoms[Number(compProductId)] || [];
                                                                const isSubAssembly = children.length > 0 || comp.component_product_id?.product_type === 388 || comp.component_product_id?.is_finished_good;

                                                                return (
                                                                    <React.Fragment key={`${compProductId || "null"}_${index}`}>
                                                                        <tr className="border-b border-border bg-card hover:bg-muted/40">
                                                                            <td className="p-2.5 text-center">
                                                                                {shortfall > 0 && (
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={!!printSelection[`parent-${compProductId}`]}
                                                                                        onChange={(e) => setPrintSelection(prev => ({
                                                                                            ...prev,
                                                                                            [`parent-${compProductId}`]: e.target.checked
                                                                                        }))}
                                                                                        className="h-3.5 w-3.5 rounded border-input bg-card text-primary focus:ring-primary cursor-pointer"
                                                                                    />
                                                                                )}
                                                                            </td>
                                                                            <td className="p-2.5">
                                                                                <div className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5 flex items-center gap-1.5">
                                                                                    {comp.component_product_id?.category_name || "Uncategorized"}
                                                                                    {isSubAssembly && (
                                                                                        <span className="text-[7px] bg-sky-500/10 dark:bg-sky-950 text-sky-600 dark:text-sky-400 border border-sky-500/20 px-1 rounded-sm uppercase font-black">
                                                                                            Sub-Assembly
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <div className="font-bold text-foreground">{comp.component_product_id?.product_name || `Product #${compProductId}`}</div>
                                                                                <div className="text-[9px] text-muted-foreground/80">{comp.component_product_id?.product_code || ""}</div>
                                                                                
                                                                                {/* Sub-Assembly Version Selector & Routing Details */}
                                                                                {isSubAssembly && (
                                                                                    <div className="mt-2 space-y-2 p-2.5 bg-sky-500/5 dark:bg-sky-950/20 rounded-lg border border-sky-500/20">
                                                                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                                                                            <div className="flex-1 min-w-[240px] max-w-md">
                                                                                                <SearchableVersionSelect
                                                                                                    versions={subAssemblyVersions[Number(compProductId)] || []}
                                                                                                    selectedVersionId={selectedSubAssemblyVersions[Number(compProductId)]}
                                                                                                    onVersionChange={(vId) => handleSubAssemblyVersionChange(Number(compProductId), vId)}
                                                                                                    loading={!!loadingSubVersion[Number(compProductId)]}
                                                                                                    productName={comp.component_product_id?.product_name || "Sub-Assembly"}
                                                                                                />
                                                                                            </div>
                                                                                            
                                                                                            {/* Sub-Assembly Route Duration Preview */}
                                                                                            {subAssemblyRoutings[Number(compProductId)] && (
                                                                                                <div className="text-[10px] bg-card/90 px-2.5 py-1 rounded-md border border-sky-500/30 flex flex-wrap items-center gap-2 font-mono shadow-sm shrink-0">
                                                                                                    <Clock className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                                                                                                    <span>
                                                                                                        Setup: <strong className="text-foreground">{subAssemblyRoutings[Number(compProductId)].setup_time_hours}h</strong>
                                                                                                    </span>
                                                                                                    <span>|</span>
                                                                                                    <span>
                                                                                                        Run Rate: <strong className="text-foreground">{subAssemblyRoutings[Number(compProductId)].run_time_hours_per_unit.toFixed(3)}h/unit</strong>
                                                                                                    </span>
                                                                                                    {shortfall > 0 && (
                                                                                                        <span className="text-sky-600 dark:text-sky-400 font-bold ml-1">
                                                                                                            (= {(subAssemblyRoutings[Number(compProductId)].setup_time_hours + (subAssemblyRoutings[Number(compProductId)].run_time_hours_per_unit * shortfall / (subAssemblyRoutings[Number(compProductId)].base_quantity || 1))).toFixed(1)} hrs est.)
                                                                                                        </span>
                                                                                                    )}
                                                                                                </div>
                                                                                            )}
                                                                                        </div>

                                                                                        {/* Auto-spawn Child JO indicator */}
                                                                                        {shortfall > 0 && (
                                                                                            <div className="text-[9.5px] text-sky-700 dark:text-sky-300 font-medium flex items-center gap-1.5 pt-1 border-t border-sky-500/10">
                                                                                                <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse shrink-0" />
                                                                                                <span>Auto-Spawns Child Job Order: <strong className="font-mono bg-sky-500/10 px-1 py-0.5 rounded">{joNumber}-SUB{compProductId}</strong> for <strong className="font-bold">{shortfall.toLocaleString(undefined, {maximumFractionDigits:2})} {uom}</strong></span>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                )}

                                                                                {inventories[Number(compProductId)]?.recommended_lots?.length > 0 && (
                                                                                    <div className="mt-1 space-y-0.5">
                                                                                        <div className="text-[7.5px] text-primary/80 font-bold uppercase tracking-wider">Recommended Lots:</div>
                                                                                        <div className="flex flex-wrap gap-1">
                                                                                            {inventories[Number(compProductId)].recommended_lots.slice(0, 3).map((lot: any, lIdx: number) => (
                                                                                                <span key={lIdx} className="text-[8px] bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded font-mono font-medium">
                                                                                                    {lot.lot_no} ({Number(lot.available).toFixed(0)})
                                                                                                </span>
                                                                                            ))}
                                                                                            {inventories[Number(compProductId)].recommended_lots.length > 3 && (
                                                                                                <span className="text-[8px] text-muted-foreground self-center">
                                                                                                    +{inventories[Number(compProductId)].recommended_lots.length - 3} more
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </td>
                                                                            <td className="p-2.5 text-center font-semibold text-foreground">
                                                                                {needed.toLocaleString(undefined, {maximumFractionDigits:2})} <span className="text-[9px] text-muted-foreground font-normal">{uom}</span>
                                                                            </td>
                                                                            <td className="p-2.5 text-center text-muted-foreground">
                                                                                {available.toLocaleString(undefined, {maximumFractionDigits:2})} <span className="text-[9px] text-muted-foreground font-normal">{uom}</span>
                                                                            </td>
                                                                            <td className={`p-2.5 text-center font-bold ${shortfall > 0 ? (isSubAssembly ? "text-sky-600 dark:text-sky-400" : "text-red-600 dark:text-red-400") : "text-muted-foreground/60"}`}>
                                                                                {shortfall > 0 ? (
                                                                                    <>
                                                                                        {shortfall.toLocaleString(undefined, {maximumFractionDigits:2})} <span className={`text-[9px] font-normal ${isSubAssembly ? "text-sky-600/60 dark:text-sky-400/60" : "text-red-600/60 dark:text-red-400/60"}`}>{uom}</span>
                                                                                    </>
                                                                                ) : "-"}
                                                                            </td>
                                                                            <td className="p-2.5 text-right">
                                                                                {isSubAssembly && shortfall > 0 ? (
                                                                                    <span className="inline-flex items-center gap-1 text-[8px] font-bold text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-500/20 uppercase tracking-wide">
                                                                                        Spawns Child JO
                                                                                    </span>
                                                                                ) : isSufficient ? (
                                                                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                                                                        <CheckCircle className="h-2.5 w-2.5" /> Available
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-red-600 dark:text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
                                                                                        <ShieldAlert className="h-2.5 w-2.5" /> Purchase Req
                                                                                    </span>
                                                                                )}
                                                                            </td>
                                                                        </tr>

                                                                        {/* Indented child raw materials for Sub-Assemblies */}
                                                                        {isSubAssembly && children.length > 0 && children.map((cc: any, subIndex: number) => {
                                                                            const ccId = cc.component_product_id?.product_id;
                                                                            const subBaseQty = Number(cc.base_quantity || 1);
                                                                            const ccNeeded = (Number(cc.quantity_required) * (1 + (Number(cc.wastage_factor_percentage || 0) / 100))) * (shortfall / subBaseQty);
                                                                            const ccAvailable = ccId ? (inventories[Number(ccId)]?.on_hand || 0) : 0;
                                                                            const ccShortfall = Math.max(0, ccNeeded - ccAvailable);
                                                                            const ccUom = cc.unit_of_measurement || "pcs";
                                                                            const ccSufficient = ccShortfall === 0;

                                                                            return (
                                                                                <tr key={`child_${compProductId}_${ccId}_${subIndex}`} className="border-b border-border/50 bg-background/40 hover:bg-muted/20 text-[10px]">
                                                                                    <td className="p-2.5 text-center">
                                                                                        {ccShortfall > 0 && (
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={!!printSelection[`child-${compProductId}-${ccId}`]}
                                                                                                onChange={(e) => setPrintSelection(prev => ({
                                                                                                    ...prev,
                                                                                                    [`child-${compProductId}-${ccId}`]: e.target.checked
                                                                                                }))}
                                                                                                className="h-3 w-3 rounded border-input bg-card text-primary focus:ring-primary cursor-pointer"
                                                                                            />
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="p-2.5 pl-6">
                                                                                        <span className="text-muted-foreground/60 font-bold mr-1.5">↳</span>
                                                                                        <span className="font-semibold text-foreground">{cc.component_product_id?.product_name || `Product #${ccId}`}</span>
                                                                                        <span className="text-[8px] text-muted-foreground/80 ml-1.5 font-mono">({cc.component_product_id?.product_code || ""})</span>
                                                                                        {inventories[Number(ccId)]?.recommended_lots?.length > 0 && (
                                                                                            <div className="mt-1 pl-3 flex flex-wrap gap-1">
                                                                                                {inventories[Number(ccId)].recommended_lots.slice(0, 2).map((lot: any, lIdx: number) => (
                                                                                                    <span key={lIdx} className="text-[7.5px] bg-primary/10 text-primary/90 border border-primary/15 px-1 py-0 rounded font-mono">
                                                                                                        {lot.lot_no} ({Number(lot.available).toFixed(0)})
                                                                                                    </span>
                                                                                                ))}
                                                                                            </div>
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="p-2.5 text-center text-muted-foreground">
                                                                                        {ccNeeded.toLocaleString(undefined, {maximumFractionDigits:2})} <span className="text-[8px] text-muted-foreground/60">{ccUom}</span>
                                                                                    </td>
                                                                                    <td className="p-2.5 text-center text-muted-foreground">
                                                                                        {ccAvailable.toLocaleString(undefined, {maximumFractionDigits:2})} <span className="text-[8px] text-muted-foreground/60">{ccUom}</span>
                                                                                    </td>
                                                                                    <td className={`p-2.5 text-center font-bold ${ccShortfall > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/60"}`}>
                                                                                        {ccShortfall > 0 ? ccShortfall.toLocaleString(undefined, {maximumFractionDigits:2}) : "-"}
                                                                                    </td>
                                                                                    <td className="p-2.5 text-right pr-4">
                                                                                        {ccSufficient ? (
                                                                                            <Badge variant="outline" className="h-5 text-[8px] text-emerald-600 dark:text-emerald-400 bg-emerald-500/5 border-emerald-500/20 py-0 px-1.5 font-bold">Stock OK</Badge>
                                                                                        ) : (
                                                                                            <Badge variant="outline" className="h-5 text-[8px] text-amber-600 dark:text-amber-400 bg-amber-500/5 border-amber-500/20 py-0 px-1.5 font-bold">MRP Shortfall</Badge>
                                                                                        )}
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </React.Fragment>
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
                        )}

                        {/* STEP 3: LABOR & OPERATOR ASSIGNMENT */}
                        {currentStep === 3 && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold text-foreground uppercase tracking-wider text-[10px]">
                                        Workstation Dispatching & Operator Assignment
                                    </h4>
                                    <div className="text-[10px] text-muted-foreground font-semibold bg-muted border border-border px-2 py-0.5 rounded-md">
                                        {Object.values(assignments).flat().length} Total Assignments
                                    </div>
                                </div>

                                {routings.length === 0 ? (
                                    <p className="text-xs text-muted-foreground py-3 text-center">No routing sequence steps defined.</p>
                                ) : (
                                    <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
                                        {routings.map((route, index) => {
                                            const seq = Number(route.sequence_order);
                                            const assigned = assignments[seq] || [];
                                            const stepRunTime = targetQuantity * Number(route.run_time_hours || 0);

                                            return (
                                                <div key={`${route.routing_id || "route"}_${index}`} className="border border-border bg-card/20 rounded-xl p-4 space-y-3.5 hover:border-border/60 transition-all duration-300">
                                                    <div className="flex justify-between items-start border-b border-border/60 pb-2">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] font-black bg-muted text-muted-foreground border border-border px-2 py-0.5 rounded-md">
                                                                    Step {seq}0
                                                                </span>
                                                                <h5 className="text-xs font-bold text-foreground">{route.operation_name || "Production Operation"}</h5>
                                                            </div>
                                                            <p className="text-[10px] text-muted-foreground">
                                                                Work Center: <span className="font-semibold text-foreground">{route.work_center_name || "Factory Work Center"}</span>
                                                            </p>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-[10px] bg-primary/10 border border-primary/20 text-primary px-2.5 py-0.5 rounded-full font-bold">
                                                                {stepRunTime.toFixed(1)} hrs needed
                                                            </span>
                                                            <div className="text-[9px] text-muted-foreground mt-1">
                                                                {assigned.length} Operator{assigned.length !== 1 ? "s" : ""} Assigned
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-2">
                                                        <div className="flex items-center justify-between text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                                                            <span>Assign Operators for this Workstation</span>
                                                        </div>
                                                        <OperatorSelect
                                                            operators={operators}
                                                            assignedIds={assigned}
                                                            onToggleOperator={(opId) => handleToggleOperator(seq, opId)}
                                                            placeholder="Select operators..."
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                )}

                <DialogFooter className="border-t border-border pt-3 gap-2 flex items-center justify-between sm:justify-between w-full">
                    <div>
                        {currentStep > 1 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setCurrentStep((prev) => prev - 1)}
                                className="border-input hover:bg-accent text-foreground h-8"
                            >
                                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
                            </Button>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsConfirmOpen(false)}
                            disabled={releasingJO}
                            className="text-muted-foreground hover:text-foreground h-8 hover:bg-accent"
                        >
                            Cancel
                        </Button>
                        {currentStep < 3 ? (
                            <Button
                                size="sm"
                                onClick={() => setCurrentStep((prev) => prev + 1)}
                                disabled={loadingDetails || !joNumber || targetQuantity <= 0}
                                className="bg-primary hover:bg-primary/90 text-white h-8 font-semibold shadow-lg shadow-primary/20"
                            >
                                Next <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                onClick={() => handleConfirmRelease(selectedSubAssemblyVersions)}
                                disabled={releasingJO}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 font-semibold shadow-lg shadow-emerald-500/20"
                            >
                                {releasingJO ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Releasing...
                                    </>
                                ) : (
                                    "Confirm & Release"
                                )}
                            </Button>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
            <SubmittingLoadingOverlay isOpen={releasingJO} title="Releasing Sales Order Production Run..." />
        </Dialog>
    );
}
