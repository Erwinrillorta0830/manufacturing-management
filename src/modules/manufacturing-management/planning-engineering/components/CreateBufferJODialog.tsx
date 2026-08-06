/* eslint-disable */
import React, { useState, useEffect, useMemo } from "react";
import { Loader2, ArrowRight, ArrowLeft } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Branch } from "../types";
import { toast } from "sonner";
import { SubmittingLoadingOverlay } from "./SubmittingLoadingOverlay";
import { calculateContainerizationMetrics } from "../utils/containerization-helper";
import { calculateUnitCOGSBreakdown } from "../utils/cogs-helper";
import { Step1BasicDetails } from "./buffer-jo/Step1BasicDetails";
import { Step2BOMReview } from "./buffer-jo/Step2BOMReview";
import { Step3Scheduling } from "./buffer-jo/Step3Scheduling";
import { Step4Review } from "./buffer-jo/Step4Review";

interface CreateBufferJODialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    branches: Branch[];
    initialBranchId: number | null;
    onSuccess: () => void;
}

export function CreateBufferJODialog({
    isOpen,
    onOpenChange,
    branches,
    initialBranchId,
    onSuccess
}: CreateBufferJODialogProps) {
    const [currentStep, setCurrentStep] = useState(1);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [hasLoadedDetails, setHasLoadedDetails] = useState(false);

    // Master list data
    const [products, setProducts] = useState<any[]>([]);
    const [versions, setVersions] = useState<any[]>([]);
    const [operators, setOperators] = useState<any[]>([]);

    // Form selection states
    const [selectedBranchId, setSelectedBranchId] = useState<string>("");
    const [selectedParentProductId, setSelectedParentProductId] = useState<string>("");
    const [selectedProductId, setSelectedProductId] = useState<string>("");
    const [selectedVersionId, setSelectedVersionId] = useState<string>("");
    const [joNumber, setJoNumber] = useState("");
    const [targetQuantity, setTargetQuantity] = useState<number>(100);
    const [dueDate, setDueDate] = useState("");
    const [shiftOption, setShiftOption] = useState("8.0");
    const [remarks, setRemarks] = useState("");

    // Details loaded from version selection (BOM & Routings)
    const [routings, setRoutings] = useState<any[]>([]);
    const [components, setComponents] = useState<any[]>([]);
    const [inventories, setInventories] = useState<Record<number, any>>({});
    const [bomBaseQty, setBomBaseQty] = useState(1);
    const [subAssemblyBoms, setSubAssemblyBoms] = useState<Record<number, any[]>>({});
    const [subAssemblyRoutings, setSubAssemblyRoutings] = useState<Record<number, { setup_time_hours: number; run_time_hours_per_unit: number; base_quantity: number }>>({});
    const [subAssemblyVersions, setSubAssemblyVersions] = useState<Record<number, any[]>>({});
    const [selectedSubAssemblyVersions, setSelectedSubAssemblyVersions] = useState<Record<number, number>>({});
    const [loadingSubVersion, setLoadingSubVersion] = useState<Record<number, boolean>>({});
    const [printSelection, setPrintSelection] = useState<Record<string, boolean>>({});
    const [assignments, setAssignments] = useState<Record<number, number[]>>({});

    const selectedBranch = branches.find((b) => String(b.id) === selectedBranchId);
    const selectedProduct = products.find((p) => String(p.product_id) === selectedProductId);

    const getProductParentId = (p: any) => {
        if (!p) return null;
        if (p.parent_id && typeof p.parent_id === "object") {
            return Number((p.parent_id as any).product_id);
        }
        return p.parent_id ? Number(p.parent_id) : null;
    };

    const parentProducts = useMemo(() => {
        return products.filter((prod) => getProductParentId(prod) === null);
    }, [products]);

    const parentProductOptions = useMemo(() => {
        return parentProducts.map((prod) => {
            const uomName = prod.unit_of_measurement?.unit_name || "";
            const unitCount = prod.unit_of_measurement_count !== undefined && prod.unit_of_measurement_count !== null
                ? Number(prod.unit_of_measurement_count)
                : 1;
            const suffix = uomName ? ` ${uomName} (${unitCount})` : "";
            return {
                value: String(prod.product_id),
                label: `${prod.product_name}${suffix}`
            };
        });
    }, [parentProducts]);

    const familyProducts = useMemo(() => {
        if (!selectedParentProductId) return [];
        return products.filter((p) => {
            const pId = String(p.product_id);
            const parentId = getProductParentId(p);
            return pId === selectedParentProductId || (parentId !== null && String(parentId) === selectedParentProductId);
        });
    }, [products, selectedParentProductId]);

    const uomOptions = useMemo(() => {
        return familyProducts.map((prod) => {
            const uomName = prod.unit_of_measurement?.unit_name || "";
            const uomShortcut = prod.unit_of_measurement?.unit_shortcut || "PCS";
            return {
                product_id: String(prod.product_id),
                product_code: prod.product_code,
                uom_name: uomName,
                uom_shortcut: uomShortcut,
                multiplier: prod.unit_of_measurement_count || 1
            };
        });
    }, [familyProducts]);

    // Initial load: active branch defaults & products list
    useEffect(() => {
        if (isOpen) {
            setCurrentStep(1);
            setRoutings([]);
            setComponents([]);
            setInventories({});
            setAssignments({});
            setSubAssemblyBoms({});
            setPrintSelection({});
            setSelectedParentProductId("");
            setSelectedProductId("");
            setSelectedVersionId("");
            setVersions([]);
            setRemarks("");
            setHasLoadedDetails(false);

            // Setup default JO Code
            const code = `JO-BUF-${Math.floor(100000 + Math.random() * 900000)}`;
            setJoNumber(code);

            // Default due date to +7 days
            setDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);

            // Set branch id
            if (initialBranchId) {
                setSelectedBranchId(String(initialBranchId));
            } else if (branches.length > 0) {
                setSelectedBranchId(String(branches[0].id));
            }

            // Load products
            setLoadingProducts(true);
            fetch("/api/manufacturing/finished-goods/products?excludeRollup=true")
                .then((r) => r.json())
                .then((data) => {
                    if (Array.isArray(data)) {
                        const active = data.filter((p: any) => (p.isActive === true || p.isActive === 1 || p.isActive === undefined) && Number(p.product_type) === 388);
                        setProducts(active);
                    }
                })
                .catch((err) => console.error("Error loading products:", err))
                .finally(() => setLoadingProducts(false));

            // Load operators
            fetch("/api/manufacturing/planning-engineering?action=users")
                .then((r) => r.json())
                .then((data) => setOperators(Array.isArray(data) ? data : []))
                .catch((err) => console.error("Failed to fetch operators:", err));
        }
    }, [isOpen, initialBranchId, branches]);

    // Auto-select UOM when parent product changes
    useEffect(() => {
        if (selectedParentProductId) {
            const parentProd = products.find(p => String(p.product_id) === selectedParentProductId);
            if (parentProd) {
                setSelectedProductId(String(parentProd.product_id));
            } else {
                const family = products.filter(p => String(getProductParentId(p)) === selectedParentProductId);
                if (family.length > 0) {
                    setSelectedProductId(String(family[0].product_id));
                } else {
                    setSelectedProductId("");
                }
            }
        } else {
            setSelectedProductId("");
        }
    }, [selectedParentProductId, products]);

    // Load versions when product is selected
    useEffect(() => {
        if (selectedProductId) {
            setLoadingVersions(true);
            setVersions([]);
            setSelectedVersionId("");
            
            const currentProd = products.find(p => String(p.product_id) === selectedProductId);
            const parentId = currentProd ? getProductParentId(currentProd) : null;

            fetch(`/api/manufacturing/finished-goods/versions?productId=${selectedProductId}`)
                .then((r) => r.json())
                .then((data) => {
                    if (Array.isArray(data) && data.length > 0) {
                        setVersions(data);
                        const active = data.find((v: any) => v.status === "Active" || v.status === "Approved" || v.is_active);
                        if (active) {
                            setSelectedVersionId(String(active.version_id));
                        } else {
                            setSelectedVersionId("");
                        }
                        setLoadingVersions(false);
                    } else if (parentId) {
                        fetch(`/api/manufacturing/finished-goods/versions?productId=${parentId}`)
                            .then((r) => r.json())
                            .then((parentData) => {
                                if (Array.isArray(parentData)) {
                                    setVersions(parentData);
                                    const active = parentData.find((v: any) => v.status === "Active" || v.status === "Approved" || v.is_active);
                                    if (active) {
                                        setSelectedVersionId(String(active.version_id));
                                    } else {
                                        setSelectedVersionId("");
                                    }
                                }
                            })
                            .catch((err) => console.error("Failed to load parent versions:", err))
                            .finally(() => setLoadingVersions(false));
                    } else {
                        setVersions([]);
                        setSelectedVersionId("");
                        setLoadingVersions(false);
                    }
                })
                .catch((err) => {
                    console.error("Failed to load versions:", err);
                    setLoadingVersions(false);
                });
        } else {
            setVersions([]);
            setSelectedVersionId("");
        }
    }, [selectedProductId, products]);

    // Reset loaded details when selection changes or returning to Step 1
    useEffect(() => {
        if (currentStep === 1) {
            setRoutings([]);
            setComponents([]);
            setSubAssemblyBoms({});
            setSubAssemblyRoutings({});
            setHasLoadedDetails(false);
        }
    }, [currentStep, selectedProductId, selectedVersionId]);

    // Load BOM & Routing details on Step 2
    useEffect(() => {
        if (isOpen && selectedProductId && selectedVersionId && currentStep === 2 && !hasLoadedDetails) {
            const loadDetails = async () => {
                setLoadingDetails(true);
                try {
                    const url = `/api/manufacturing/planning-engineering?action=wizard-step-2&productId=${selectedProductId}&bomId=${selectedVersionId}&branchId=${selectedBranchId || 1}`;
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
    }, [isOpen, selectedProductId, selectedVersionId, currentStep, selectedBranchId, hasLoadedDetails]);

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

    // Calculate time metrics
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

    const totalEstimatedHours = boxEstimatedHours + subAssemblyEstimatedHours;

    // Dynamic UOM labels
    const selectedProdObj = products.find((p) => String(p.product_id) === selectedProductId);
    const parentUomLabel = (selectedProdObj?.unit_of_measurement?.unit_name || selectedProdObj?.uom_name || selectedProdObj?.uom_shortcut || "Box").toUpperCase();

    const containerMetrics = useMemo(() => {
        if (!selectedProdObj) return null;
        const verObj = versions.find((v) => String(v.version_id) === String(selectedVersionId));
        return calculateContainerizationMetrics(
            (selectedProdObj as any).product_name || selectedProdObj.title || selectedProdObj.sku || "Product",
            targetQuantity,
            selectedProdObj.unit_of_measurement_count,
            verObj?.expected_yield_percentage
        );
    }, [selectedProdObj, versions, selectedVersionId, targetQuantity]);

    const cogsBreakdown = useMemo(() => {
        if (!selectedProdObj) return null;
        const verObj = versions.find((v) => String(v.version_id) === String(selectedVersionId));
        
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
            verObj?.expected_yield_percentage,
            verObj?.custom_overhead,
            bomItemsForCosting,
            routeStepsForCosting,
            Number(selectedProdObj.targetSellingPrice || (selectedProdObj as any).target_selling_price || 0)
        );
    }, [selectedProdObj, versions, selectedVersionId, components, routings, bomBaseQty]);

    const subAssemblyUomList = Array.from(new Set(
        components
            .filter(comp => {
                const cId = comp.component_product_id?.product_id;
                const children = subAssemblyBoms[Number(cId)] || [];
                return children.length > 0 || comp.component_product_id?.product_type === 388 || comp.component_product_id?.is_finished_good;
            })
            .map(comp => comp.unit_of_measurement || "Piece")
    ));
    const subAssemblyUomLabel = subAssemblyUomList.length > 0 ? subAssemblyUomList.join(", ") : "Piece";

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
                    <title>MRP Procurement Request - Buffer JO Release Shortfall</title>
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

    const handleNextStep = () => {
        if (currentStep === 1) {
            if (!selectedProductId || !selectedVersionId) {
                toast.error("Please select a product and an approved recipe version.");
                return;
            }
            const selVer = versions.find((v: any) => String(v.version_id) === selectedVersionId);
            const isApproved = selVer && (selVer.status === "Approved" || selVer.status === "Active" || selVer.is_active);
            if (!isApproved) {
                toast.error("Selected recipe version is not yet approved. Only approved versions can be used for production.");
                return;
            }
            if (targetQuantity <= 0) {
                toast.error("Please enter a valid target quantity.");
                return;
            }
            if (!selectedBranchId) {
                toast.error("Please select a target branch.");
                return;
            }
            if (!joNumber.trim()) {
                toast.error("Please enter a Job Order Reference #.");
                return;
            }
        }
        setCurrentStep((prev) => prev + 1);
    };

    const printPickingList = (joId: string, productName: string, qty: number) => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) return;

        const branchName = branches?.find((b: any) => Number(b.id) === Number(selectedBranchId))?.branch_name || `Branch #${selectedBranchId}`;

        const printRows: string[] = [];

        components.forEach((comp) => {
            const compProductId = comp.component_product_id?.product_id;
            const children = subAssemblyBoms[Number(compProductId)] || [];
            const isSubAssembly = children.length > 0 || comp.component_product_id?.product_type === 388 || comp.component_product_id?.is_finished_good;
            const name = comp.component_product_id?.product_name || `Component #${compProductId}`;
            const code = comp.component_product_id?.product_code || "";
            const uom = comp.unit_of_measurement || "pcs";
            
            const needed = (Number(comp.quantity_required) * (1 + (Number(comp.wastage_factor_percentage || 0) / 100))) * (qty / bomBaseQty);

            printRows.push(`
                <tr style="border-bottom: 1px solid #ddd; background: ${isSubAssembly ? '#f9f9f9' : '#fff'};">
                    <td style="padding: 10px; font-weight: bold;">
                        ${isSubAssembly ? `<span style="font-size: 8px; background: #e0f2fe; color: #0369a1; padding: 2px 5px; border-radius: 3px; margin-right: 5px; font-family: sans-serif; font-weight: 900;">SUB-ASSEMBLY</span>` : ""}
                        ${name} <span style="font-size: 10px; color: #666; font-weight: normal;">(${code})</span>
                    </td>
                    <td style="padding: 10px; text-align: right; font-weight: bold;">${Number(needed).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${uom}</td>
                    <td style="padding: 10px; text-align: center; border-left: 1px solid #ddd;">[ &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; ]</td>
                    <td style="padding: 10px; font-style: italic; color: #666;"></td>
                </tr>
            `);

            if (isSubAssembly) {
                const children = subAssemblyBoms[Number(compProductId)] || [];
                children.forEach((child) => {
                    const childId = child.component_product_id?.product_id;
                    const childName = child.component_product_id?.product_name || `Child #${childId}`;
                    const childCode = child.component_product_id?.product_code || "";
                    const childUom = child.unit_of_measurement || "pcs";
                    
                    const childNeeded = (Number(child.quantity_required) * (1 + (Number(child.wastage_factor_percentage || 0) / 100))) * (needed / (child.bom_base_quantity || 1));

                    printRows.push(`
                        <tr style="border-bottom: 1px solid #eee; background: #fff;">
                            <td style="padding: 10px 10px 10px 30px; color: #555;">
                                <span style="color: #999; margin-right: 5px;">↳</span>
                                ${childName} <span style="font-size: 10px; color: #888;">(${childCode})</span>
                            </td>
                            <td style="padding: 10px; text-align: right; font-weight: bold; color: #555;">${Number(childNeeded).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${childUom}</td>
                            <td style="padding: 10px; text-align: center; border-left: 1px solid #ddd;">[ &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; ]</td>
                            <td style="padding: 10px; font-style: italic; color: #666;"></td>
                        </tr>
                    `);
                });
            }
        });

        const htmlContent = `
            <html>
            <head>
                <title>Material Pick List - ${joId}</title>
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
                    .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
                    .title { font-size: 24px; font-weight: bold; text-transform: uppercase; }
                    .meta { display: grid; grid-template-cols: 2fr 1fr; margin-top: 10px; font-size: 14px; }
                    th { background-color: #f5f5f5; padding: 10px; text-align: left; border-bottom: 2px solid #ddd; }
                    @media print {
                        body { padding: 0; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="title">Material Picking List (WMS)</span>
                        <span style="font-weight: bold; background: #7c3aed; color: #fff; padding: 5px 10px; border-radius: 4px;">${joId}</span>
                    </div>
                    <div class="meta">
                        <div>
                            <strong>Target Product:</strong> ${productName}<br/>
                            <strong>Production Qty:</strong> ${qty.toLocaleString()} units<br/>
                            <strong>Date Created:</strong> ${new Date().toLocaleDateString()}<br/>
                        </div>
                        <div style="text-align: right;">
                            <strong>Warehouse Branch:</strong> ${branchName}<br/>
                            <strong>Status:</strong> Released for Picking
                        </div>
                    </div>
                </div>
                
                <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px;">
                    <thead>
                        <tr style="background-color: #f5f5f5;">
                            <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: left;">Raw Material / Component</th>
                            <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: right;">Needed Quantity</th>
                            <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: center; width: 120px;">Picked Check</th>
                            <th style="padding: 10px; border-bottom: 2px solid #ddd; text-align: left; width: 150px;">Bin / Lot Notes</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${printRows.join("")}
                    </tbody>
                </table>
                
                <div style="margin-top: 50px; display: flex; justify-content: space-between; font-size: 12px;">
                    <div>
                        <strong>Picked By:</strong> ________________________<br/>
                        Date: ________________________
                    </div>
                    <div>
                        <strong>Verified By (WIP Supervisor):</strong> ________________________<br/>
                        Date: ________________________
                    </div>
                </div>

                <div class="no-print" style="margin-top: 30px; text-align: center;">
                    <button onclick="window.print();" style="background: #7c3aed; color: #fff; border: none; padding: 10px 20px; border-radius: 6px; font-weight: bold; cursor: pointer;">Print Picklist</button>
                </div>

                <script>
                    window.onload = function() {
                        window.print();
                    };
                </script>
            </body>
            </html>
        `;

        printWindow.document.write(htmlContent);
        printWindow.document.close();
    };

    const handleConfirmRelease = async () => {
        if (!selectedProductId || !selectedBranchId) return;

        setSubmitting(true);
        try {
            const payload = {
                jo: {
                    jo_id: joNumber,
                    product_id: Number(selectedProductId),
                    product_name: selectedProduct?.product_name || `Product #${selectedProductId}`,
                    quantity: Number(targetQuantity),
                    due_date: dueDate,
                    status: "Released",
                    is_batched: false,
                    branch_id: Number(selectedBranchId),
                    shiftOption: shiftOption,
                    remarks: remarks || `Manual/Buffer production run`,
                    bom: {
                        version_id: selectedVersionId ? Number(selectedVersionId) : null
                    },
                    subAssemblyVersionMap: selectedSubAssemblyVersions,
                    assignments: assignments,
                    products: [
                        {
                            product_id: Number(selectedProductId),
                            product_name: selectedProduct?.product_name || `Product #${selectedProductId}`,
                            quantity: Number(targetQuantity),
                            bom: {
                                version_id: selectedVersionId ? Number(selectedVersionId) : null
                            }
                        }
                    ]
                },
                salesOrderIds: []
            };

            const res = await fetch("/api/manufacturing/planning-engineering", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Failed to create Buffer Job Order.");
            }

            toast.success(`Buffer Job Order ${joNumber} released successfully!`);
            printPickingList(
                joNumber,
                selectedProduct?.product_name || `Product #${selectedProductId}`,
                Number(targetQuantity)
            );
            onOpenChange(false);
            onSuccess();
        } catch (err: any) {
            console.error("Error creating manual job order:", err);
            toast.error(err.message || "An error occurred during Job Order creation & release.");
        } finally {
            setSubmitting(false);
        }
    };

    const selectedVersion = versions.find((v) => String(v.version_id) === String(selectedVersionId));

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl w-[94vw] max-h-[92vh] flex flex-col p-6 overflow-hidden bg-card text-foreground border-border sm:max-w-6xl">
                <DialogHeader className="border-b border-border pb-3">
                    <DialogTitle className="text-lg font-bold flex items-center justify-between text-foreground">
                        <span>Create Buffer Job Order</span>
                        <span className="text-xs bg-primary/20 text-primary border border-primary/30 px-2.5 py-0.5 rounded-full font-semibold">
                            Step {currentStep} of 4
                        </span>
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground text-xs">
                        Create a forecasting/buffer production run directly without linked Sales Orders.
                    </DialogDescription>
                </DialogHeader>

                {/* Progress Indicators */}
                <div className="flex items-center gap-1.5 px-1 py-1">
                    {[1, 2, 3, 4].map((s) => (
                        <div
                            key={s}
                            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                                s <= currentStep ? "bg-primary" : "bg-muted"
                            }`}
                        />
                    ))}
                </div>

                <div className="py-2 space-y-4 flex-1 overflow-y-auto max-h-[68vh] px-1">
                    {currentStep === 1 && (
                        <Step1BasicDetails
                            branches={branches}
                            selectedBranchId={selectedBranchId}
                            setSelectedBranchId={setSelectedBranchId}
                            joNumber={joNumber}
                            setJoNumber={setJoNumber}
                            loadingProducts={loadingProducts}
                            parentProductOptions={parentProductOptions}
                            selectedParentProductId={selectedParentProductId}
                            setSelectedParentProductId={setSelectedParentProductId}
                            uomOptions={uomOptions}
                            selectedProductId={selectedProductId}
                            setSelectedProductId={setSelectedProductId}
                            loadingVersions={loadingVersions}
                            versions={versions}
                            selectedVersionId={selectedVersionId}
                            setSelectedVersionId={setSelectedVersionId}
                            targetQuantity={targetQuantity}
                            setTargetQuantity={setTargetQuantity}
                            dueDate={dueDate}
                            setDueDate={setDueDate}
                            shiftOption={shiftOption}
                            setShiftOption={setShiftOption}
                            remarks={remarks}
                            setRemarks={setRemarks}
                        />
                    )}

                    {currentStep === 2 && (
                        <Step2BOMReview
                            loadingDetails={loadingDetails}
                            parentUomLabel={parentUomLabel}
                            boxEstimatedHours={boxEstimatedHours}
                            shiftOption={shiftOption}
                            subAssemblyEstimatedHours={subAssemblyEstimatedHours}
                            subAssemblyUomLabel={subAssemblyUomLabel}
                            totalEstimatedHours={totalEstimatedHours}
                            containerMetrics={containerMetrics}
                            cogsBreakdown={cogsBreakdown}
                            components={components}
                            targetQuantity={targetQuantity}
                            bomBaseQty={bomBaseQty}
                            inventories={inventories}
                            subAssemblyBoms={subAssemblyBoms}
                            subAssemblyVersions={subAssemblyVersions}
                            selectedSubAssemblyVersions={selectedSubAssemblyVersions}
                            handleSubAssemblyVersionChange={handleSubAssemblyVersionChange}
                            loadingSubVersion={loadingSubVersion}
                            subAssemblyRoutings={subAssemblyRoutings}
                            joNumber={joNumber}
                            printSelection={printSelection}
                            setPrintSelection={setPrintSelection}
                            hasShortfalls={hasShortfalls}
                            handlePrintProcurementRequest={handlePrintProcurementRequest}
                        />
                    )}

                    {currentStep === 3 && (
                        <Step3Scheduling
                            routings={routings}
                            targetQuantity={targetQuantity}
                            assignments={assignments}
                            operators={operators}
                            handleToggleOperator={handleToggleOperator}
                        />
                    )}

                    {currentStep === 4 && (
                        <Step4Review
                            selectedBranch={selectedBranch}
                            joNumber={joNumber}
                            selectedProduct={selectedProduct}
                            selectedVersion={selectedVersion}
                            targetQuantity={targetQuantity}
                            dueDate={dueDate}
                            shiftOption={shiftOption}
                            totalEstimatedHours={totalEstimatedHours}
                            components={components}
                            bomBaseQty={bomBaseQty}
                            inventories={inventories}
                            routings={routings}
                            assignments={assignments}
                            operators={operators}
                            remarks={remarks}
                        />
                    )}
                </div>

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
                            onClick={() => onOpenChange(false)}
                            disabled={submitting}
                            className="text-muted-foreground hover:text-foreground h-8 hover:bg-accent"
                        >
                            Cancel
                        </Button>
                        {currentStep < 4 ? (
                            <Button
                                size="sm"
                                onClick={handleNextStep}
                                disabled={loadingDetails || !joNumber || targetQuantity <= 0 || !selectedProductId || !selectedVersionId}
                                className="bg-primary hover:bg-primary/90 text-white h-8 font-semibold shadow-lg shadow-primary/20"
                            >
                                Next <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                            </Button>
                        ) : (
                            <Button
                                size="sm"
                                onClick={handleConfirmRelease}
                                disabled={submitting}
                                className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 font-semibold shadow-lg shadow-emerald-500/20"
                            >
                                {submitting ? (
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
            <SubmittingLoadingOverlay isOpen={submitting} title="Creating & Releasing Buffer Job Order..." />
        </Dialog>
    );
}
