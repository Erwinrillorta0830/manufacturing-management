/* eslint-disable */
import React, { useState, useEffect, useMemo } from "react";
import { Loader2, ArrowRight, ArrowLeft, Check, ShieldAlert, CheckCircle, Clock, Package, Layers } from "lucide-react";
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
import { Branch } from "../types";
import { toast } from "sonner";
import { SearchableSelect } from "./SearchableSelect";
import { OperatorSelect } from "./OperatorSelect";
import { SearchableVersionSelect } from "./SearchableVersionSelect";
import { SubmittingLoadingOverlay } from "./SubmittingLoadingOverlay";
import { calculateContainerizationMetrics, formatHoursToHMS } from "../utils/containerization-helper";
import { calculateUnitCOGSBreakdown } from "../utils/cogs-helper";

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

    // Operator searching
    const [searchQuery, setSearchQuery] = useState("");

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
            setSearchQuery("");
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

            // First try to fetch versions for the child product/variant
            fetch(`/api/manufacturing/finished-goods/versions?productId=${selectedProductId}`)
                .then((r) => r.json())
                .then((data) => {
                    if (Array.isArray(data) && data.length > 0) {
                        setVersions(data);
                        // Auto-select first active or approved version only
                        const active = data.find((v: any) => v.status === "Active" || v.status === "Approved" || v.is_active);
                        if (active) {
                            setSelectedVersionId(String(active.version_id));
                        } else {
                            setSelectedVersionId("");
                        }
                        setLoadingVersions(false);
                    } else if (parentId) {
                        // Fall back to parent versions if child has none
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

    // Calculate time metrics (Box assembly + Child Piece sub-assembly shortfall runs)
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

    // Resolve dynamic UOM labels for parent product and sub-assemblies
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
            const selectedVersion = versions.find((v) => String(v.version_id) === selectedVersionId);

            const payload = {
                jo: {
                    jo_id: joNumber,
                    product_id: Number(selectedProductId),
                    product_name: selectedProduct?.product_name || `Product #${selectedProductId}`,
                    quantity: Number(targetQuantity),
                    due_date: dueDate,
                    status: "Released", // releases directly with lot deduction
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
                salesOrderIds: [] // Bypasses sales order allocation logic
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

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-6xl w-[94vw] max-h-[92vh] flex flex-col p-6 overflow-hidden bg-card text-foreground border-border sm:max-w-6xl">
                <DialogHeader className="border-b border-border pb-3">
                    <DialogTitle className="text-lg font-bold flex items-center justify-between text-foreground">
                        <span>Create Buffer Job Order</span>
                        <span className="text-xs bg-primary/20 text-primary border border-primary/30 px-2.5 py-0.5 rounded-full font-semibold">
                            Step {currentStep} of 3
                        </span>
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground text-xs">
                        Create a forecasting/buffer production run directly without linked Sales Orders.
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

                <div className="py-2 space-y-4 flex-1 overflow-y-auto max-h-[68vh] px-1">
                    
                    {/* STEP 1: CONFIGURE HEADER PARAMETERS */}
                    {currentStep === 1 && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                        Target Branch
                                    </label>
                                    <Select
                                        value={selectedBranchId}
                                        onValueChange={setSelectedBranchId}
                                    >
                                        <SelectTrigger className="h-9 font-semibold bg-card border-input text-foreground">
                                            <SelectValue placeholder="Select branch" />
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

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                        Job Order Reference #
                                    </label>
                                    <Input
                                        value={joNumber}
                                        onChange={(e) => setJoNumber(e.target.value)}
                                        className="h-9 font-semibold bg-card border-input text-foreground"
                                        placeholder="JO-BUF-XXXXXX"
                                    />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                    Product Name
                                </label>
                                {loadingProducts ? (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                        Loading finished goods...
                                    </div>
                                ) : (
                                    <SearchableSelect
                                        options={parentProductOptions}
                                        value={selectedParentProductId}
                                        onValueChange={setSelectedParentProductId}
                                        placeholder="Select Product Name..."
                                        className="h-9 font-semibold text-xs"
                                    />
                                )}
                            </div>

                            {selectedParentProductId && uomOptions.length > 0 && (
                                <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                        Available Unit of Measurement (UOM)
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                        {uomOptions.map((opt) => {
                                            const isSelected = selectedProductId === opt.product_id;
                                            return (
                                                <button
                                                    key={opt.product_id}
                                                    type="button"
                                                    onClick={() => setSelectedProductId(opt.product_id)}
                                                    className={`flex items-center justify-between p-2.5 rounded-xl border text-left transition-all duration-200 group ${
                                                        isSelected
                                                            ? "bg-primary/10 border-primary text-foreground shadow-sm ring-1 ring-primary/30"
                                                            : "bg-card border-border hover:border-muted-foreground/30 hover:bg-accent/5"
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2.5 font-sans">
                                                        <div
                                                            className={`flex items-center justify-center h-8 w-11 rounded-lg text-[10px] font-bold transition-all duration-200 ${
                                                                isSelected
                                                                    ? "bg-primary text-primary-foreground scale-105"
                                                                    : "bg-muted text-muted-foreground group-hover:bg-muted/80"
                                                            }`}
                                                        >
                                                            {opt.uom_shortcut.toUpperCase()}
                                                        </div>
                                                        <div className="space-y-0.5">
                                                            <div className="text-xs font-bold text-foreground truncate max-w-[140px]">
                                                                {opt.uom_name || "Standard Unit"}
                                                            </div>
                                                            <div className="text-[9px] font-medium text-muted-foreground font-mono">
                                                                {opt.product_code}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1 font-sans">
                                                        {isSelected ? (
                                                            <div className="h-4 w-4 rounded-full bg-primary flex items-center justify-center text-primary-foreground animate-in zoom-in duration-200">
                                                                <Check className="h-2.5 w-2.5 stroke-[3]" />
                                                            </div>
                                                        ) : (
                                                            <div className="h-4 w-4 rounded-full border border-muted-foreground/30 group-hover:border-muted-foreground/50 transition-colors" />
                                                        )}
                                                        {opt.multiplier > 1 && (
                                                            <span className="text-[9px] bg-secondary text-secondary-foreground border border-secondary/30 px-1 py-0.5 rounded font-bold">
                                                                Pack of {opt.multiplier}
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                        Recipe Version
                                    </label>
                                    {loadingVersions ? (
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground h-9">
                                            <Loader2 className="h-3 w-3 animate-spin text-primary" />
                                            Loading recipes...
                                        </div>
                                    ) : (
                                        <>
                                            <Select
                                                value={selectedVersionId}
                                                onValueChange={setSelectedVersionId}
                                                disabled={!selectedProductId || versions.every((v: any) => v.status !== "Active" && v.status !== "Approved" && !v.is_active)}
                                            >
                                                <SelectTrigger className="h-9 font-semibold bg-card border-input text-foreground">
                                                    <SelectValue placeholder={
                                                        !selectedProductId
                                                            ? "Select product first"
                                                            : versions.length === 0
                                                            ? "No recipe versions found"
                                                            : versions.every((v: any) => v.status !== "Active" && v.status !== "Approved" && !v.is_active)
                                                            ? "No approved versions available"
                                                            : "Select version"
                                                    } />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {versions.map((v) => {
                                                        const isApproved = v.status === "Approved" || v.status === "Active" || v.is_active;
                                                        return (
                                                            <SelectItem key={v.version_id} value={String(v.version_id)} disabled={!isApproved}>
                                                                {v.version_name} ({v.status}){!isApproved ? " - Not Approved" : ""}
                                                            </SelectItem>
                                                        );
                                                    })}
                                                </SelectContent>
                                            </Select>
                                            {selectedProductId && !loadingVersions && versions.every((v: any) => v.status !== "Active" && v.status !== "Approved" && !v.is_active) && (
                                                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium mt-1 flex items-center gap-1">
                                                    <ShieldAlert size={13} className="shrink-0" />
                                                    <span>No approved versions available. Please approve in Product Version Approval.</span>
                                                </p>
                                            )}
                                        </>
                                    )}
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
                                </div>
                            </div>

                            {selectedProductId && versions.length === 0 && !loadingVersions && (
                                <div className="bg-amber-950/20 border border-amber-500/20 text-amber-400 rounded-xl p-3 text-xs flex gap-2 items-center">
                                    <ShieldAlert className="h-5 w-5 shrink-0" />
                                    <span>Warning: This product has no recipe versions configured. You cannot proceed without configuring a recipe version first.</span>
                                </div>
                            )}

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
                                    placeholder="Add planning/buffer notes here..."
                                />
                            </div>
                        </div>
                    )}

                    {/* STEP 2: TIME & MATERIAL SUFFICIENCY */}
                    {currentStep === 2 && (
                        <div className="space-y-4">
                            {loadingDetails ? (
                                <div className="flex flex-col items-center justify-center py-10 space-y-3">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                    <p className="text-xs text-muted-foreground font-medium">Analyzing BOM and routes...</p>
                                </div>
                            ) : (
                                <>
                                    {/* Time Summary Categorized Breakdown */}
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {/* Box Assembly Card */}
                                        <div className="bg-card border border-border rounded-xl p-3 flex flex-col justify-between">
                                            <div className="flex items-center gap-2 mb-1">
                                                <Package className="h-4 w-4 text-primary" />
                                                <span className="text-xs font-bold text-foreground">📦 {parentUomLabel} Assembly</span>
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

                                        {/* Sub-Assembly Piece Card */}
                                        <div className={`bg-card border rounded-xl p-3 flex flex-col justify-between ${subAssemblyEstimatedHours > 0 ? "border-sky-500/30 bg-sky-500/5" : "border-border"}`}>
                                            <div className="flex items-center gap-2 mb-1">
                                                <Layers className="h-4 w-4 text-sky-500" />
                                                <span className="text-xs font-bold text-foreground">🧩 Sub-Assembly ({subAssemblyUomLabel})</span>
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
                                            <p className="text-xs text-muted-foreground/80 py-3 text-center">No raw material requirements specified.</p>
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
                                                                                <td className="p-2.5 pl-6 text-muted-foreground">
                                                                                    ↳ {cc.component_product_id?.product_name || `Product #${ccId}`}
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
                        {currentStep < 3 ? (
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
