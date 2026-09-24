/* eslint-disable */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Loader2, ArrowRight, ArrowLeft, Check, UserPlus, ShieldAlert, CheckCircle, Clock, Package, Layers, Printer } from "lucide-react";
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
import { Branch, SalesOrderDetail, SalesOrderReleaseGroup } from "../types";
import { OperatorSelect } from "./OperatorSelect";
import { SearchableVersionSelect } from "./SearchableVersionSelect";
import { SubmittingLoadingOverlay } from "./SubmittingLoadingOverlay";
import { calculateContainerizationMetrics, formatHoursToHMS, formatInventoryQuantity } from "../utils/containerization-helper";
import {
    calculateMaterialSpend,
    formatManufacturingMoney,
    formatManufacturingUnitCostForDisplay,
    getFactoryOverheadBasisLabel
} from "../utils/cogs-helper";
import { calculateProductionMetrics } from "../utils/production-metrics";
import { calculateAggregateRunHours, calculatePerUnitMaterialRequirement, calculateReleaseMaterialRequirementPlan, calculateRequiredBatchCount, DEFAULT_PRODUCTION_SHIFT_HOURS, formatProductionValue, isPieceProductionUom, normalizeProductionOutputQuantity, readUomId, resolveProductionShiftHours } from "../utils/production-timing";
import { buildReleaseSummaryHtml, type ReleaseSummaryComponent, type ReleaseSummaryFinancials, type ReleaseSummaryRoutingStep } from "../utils/release-summary-print";

interface ReleaseJODialogProps {
    isConfirmOpen: boolean;
    setIsConfirmOpen: (open: boolean) => void;
    selectedLines: SalesOrderDetail[];
    releaseGroups: SalesOrderReleaseGroup[];
    branches: Branch[];
    selectedBranchId: number | null;
    joNumber: string;
    setJoNumber: (val: string) => void;
    targetQuantity: number;
    setTargetQuantity: (val: number) => void;
    plannedDate: string;
    setPlannedDate: (val: string) => void;
    dueDate: string;
    setDueDate: (val: string) => void;
    shiftOption: string;
    setShiftOption: (val: string) => void;
    remarks: string;
    setRemarks: (val: string) => void;
    releasingJO: boolean;
    handleConfirmRelease: (
        selectedSubAssemblyVersions?: Record<number, number>,
        groupConfigurations?: Record<string, { subAssemblyVersions: Record<number, number>; assignments: Record<number, number[]> }>,
        initialize?: boolean,
        materialTargetQuantity?: number,
        timingTargetQuantity?: number
    ) => void;
    priority: number;
    setPriority: (val: number) => void;
    assignments: Record<number, number[]>;
    setAssignments: React.Dispatch<React.SetStateAction<Record<number, number[]>>>;
}

export function ReleaseJODialog({
    isConfirmOpen,
    setIsConfirmOpen,
    selectedLines: selectedLinesProp,
    releaseGroups,
    branches,
    selectedBranchId,
    joNumber: joNumberProp,
    setJoNumber,
    targetQuantity: targetQuantityProp,
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
    releasingJO,
    handleConfirmRelease,
    assignments: assignmentsProp,
    setAssignments: setAssignmentsProp
}: ReleaseJODialogProps) {
    const [currentStep, setCurrentStep] = useState(1);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [hasLoadedDetails, setHasLoadedDetails] = useState(false);
    const [routings, setRoutings] = useState<any[]>([]);
    const [components, setComponents] = useState<any[]>([]);
    const [bomData, setBomData] = useState<any | null>(null);
    const [inventories, setInventories] = useState<Record<number, any>>({});
    const [operators, setOperators] = useState<any[]>([]);
    const [bomBaseQty, setBomBaseQty] = useState(1);
    const [searchQuery, setSearchQuery] = useState("");
    const [subAssemblyBoms, setSubAssemblyBoms] = useState<Record<number, any[]>>({});
    const [subAssemblyRoutings, setSubAssemblyRoutings] = useState<Record<number, { setup_time_hours: number; run_time_hours_per_unit: number; base_quantity: number }>>({});
    const [subAssemblyVersions, setSubAssemblyVersions] = useState<Record<number, any[]>>({});
    const [singleSelectedSubAssemblyVersions, setSingleSelectedSubAssemblyVersions] = useState<Record<number, number>>({});
    const [activeGroupIndex, setActiveGroupIndex] = useState(0);
    const [groupAssignments, setGroupAssignments] = useState<Record<string, Record<number, number[]>>>({});
    const [groupSubAssemblyVersions, setGroupSubAssemblyVersions] = useState<Record<string, Record<number, number>>>({});
    const [loadingSubVersion, setLoadingSubVersion] = useState<Record<number, boolean>>({});
    const [printSelection, setPrintSelection] = useState<Record<string, boolean>>({});

    const parseValidBranchId = (value: unknown): number | null => {
        const branchId = Number(value);
        return Number.isSafeInteger(branchId) && branchId > 0 ? branchId : null;
    };

    const normalizeInventoryMap = (value: any): Record<number, any> => {
        if (!Array.isArray(value)) return value || {};
        return value.reduce((map: Record<number, any>, item: any) => {
            const productId = Number(item?.product_id);
            if (productId > 0) map[productId] = item;
            return map;
        }, {});
    };

    const normalizedReleaseGroups = releaseGroups.length > 0 ? releaseGroups : [{
        key: "single",
        productId: Number(selectedLinesProp[0]?.product_id?.product_id || 0),
        productName: selectedLinesProp[0]?.product_id?.product_name || "",
        bomVersionId: Number(selectedLinesProp[0]?.bom_version_id || 0),
        bomVersionName: selectedLinesProp[0]?.bom_version_name || "Default",
        lines: selectedLinesProp,
        totalRemainingQuantity: targetQuantityProp,
        salesOrderIds: [...new Set(selectedLinesProp.map((line) => line.order_id))],
        salesOrderDetailIds: selectedLinesProp.map((line) => line.detail_id)
    }];
    const isMultiRelease = normalizedReleaseGroups.length > 1;
    const activeReleaseGroup = normalizedReleaseGroups[activeGroupIndex] || normalizedReleaseGroups[0];
    const activeGroupKey = activeReleaseGroup?.key || "single";
    const selectedLines = activeReleaseGroup?.lines || selectedLinesProp;
    const maxAvailableQuantity = useMemo(() => selectedLines.reduce((sum, line) => {
        const resolved = Number(line.remaining_quantity);
        if (Number.isFinite(resolved)) return sum + Math.max(0, resolved);
        const ordered = Number(line.ordered_quantity || 0);
        const fulfilled = Math.max(Number(line.allocated_quantity || 0), Number(line.served_quantity || 0));
        const planned = Number(line.planned_quantity || 0);
        return sum + Math.max(0, ordered - fulfilled - planned);
    }, 0), [selectedLines]);
    const requestedTargetQuantity = isMultiRelease
        ? activeReleaseGroup.totalRemainingQuantity
        : maxAvailableQuantity > 0 ? maxAvailableQuantity : targetQuantityProp;
    const releaseSummaryUom = (selectedLines[0]?.product_id as any)?.uom_name
        || (selectedLines[0]?.product_id as any)?.uom
        || (selectedLines[0] as any)?.unit_of_measurement
        || "units";
    const operationalRequestedTargetQuantity = normalizeProductionOutputQuantity(requestedTargetQuantity, releaseSummaryUom);
    const rawTargetQuantity = Math.max(requestedTargetQuantity, targetQuantityProp);
    const targetQuantity = normalizeProductionOutputQuantity(
        rawTargetQuantity,
        releaseSummaryUom
    );
    const joNumber = isMultiRelease
        ? `${joNumberProp}-${String(activeGroupIndex + 1).padStart(2, "0")}`
        : joNumberProp;
    const assignments = isMultiRelease ? (groupAssignments[activeGroupKey] || {}) : assignmentsProp;
    const selectedSubAssemblyVersions = isMultiRelease
        ? (groupSubAssemblyVersions[activeGroupKey] || {})
        : singleSelectedSubAssemblyVersions;
    const setSelectedSubAssemblyVersions = (value: React.SetStateAction<Record<number, number>>) => {
        if (isMultiRelease) {
            setGroupSubAssemblyVersions((previous) => ({
                ...previous,
                [activeGroupKey]: typeof value === "function" ? value(previous[activeGroupKey] || {}) : value
            }));
        } else {
            setSingleSelectedSubAssemblyVersions(value);
        }
    };
    const selectedBranch = branches.find((b) => b.id === selectedBranchId);
    // Reset step on open/close
    useEffect(() => {
        if (!isConfirmOpen) {
            setCurrentStep(1);
            setRoutings([]);
            setComponents([]);
            setBomData(null);
            setInventories({});
            setAssignmentsProp({});
            setSearchQuery("");
            setSubAssemblyBoms({});
            setSubAssemblyRoutings({});
            setSubAssemblyVersions({});
            setSingleSelectedSubAssemblyVersions({});
            setGroupAssignments({});
            setGroupSubAssemblyVersions({});
            setActiveGroupIndex(0);
            setLoadingSubVersion({});
            setPrintSelection({});
            setHasLoadedDetails(false);
        }
    }, [isConfirmOpen, setAssignmentsProp]);

    const updateAssignments = (value: React.SetStateAction<Record<number, number[]>>) => {
        if (isMultiRelease) {
            setGroupAssignments((previous) => ({
                ...previous,
                [activeGroupKey]: typeof value === "function" ? value(previous[activeGroupKey] || {}) : value
            }));
        } else {
            setAssignmentsProp(value);
        }
    };

    // Fetch master operators list once dialog opens
    useEffect(() => {
        if (isConfirmOpen) {
            fetch("/api/manufacturing/planning-engineering?action=users")
                .then((r) => r.json())
                .then((data) => setOperators(Array.isArray(data) ? data : []))
                .catch((err) => console.error("Failed to fetch operators:", err));
        }
    }, [isConfirmOpen]);

    // Fetch BOM & Routing details on dialog open
    useEffect(() => {
        if (isConfirmOpen && selectedLines.length > 0 && !hasLoadedDetails) {
            const loadDetails = async () => {
                setLoadingDetails(true);
                try {
                    const first = selectedLines[0];
                    const pId = first.product_id.product_id;
                    const bId = first.bom_version_id;
                    const branchId = parseValidBranchId(selectedBranchId) || 1;
                    const url = `/api/manufacturing/planning-engineering?action=wizard-step-2&productId=${pId}&bomId=${bId || ""}&branchId=${branchId}&usePhysicalOnHand=true&requestedQuantity=${encodeURIComponent(requestedTargetQuantity)}&plannedQuantity=${encodeURIComponent(targetQuantity)}`;
                    const res = await fetch(url);
                    if (res.ok) {
                        const data = await res.json();
                        setRoutings(data.routings || []);
                        setComponents(data.components || []);
                        setBomData(data.bom || null);
                        setSubAssemblyBoms(data.subAssemblyBoms || {});
                        setSubAssemblyRoutings(data.subAssemblyRoutings || {});
                        setSubAssemblyVersions(data.subAssemblyVersions || {});
                        setSelectedSubAssemblyVersions(data.selectedSubAssemblyVersions || {});
                        setInventories(normalizeInventoryMap(data.inventories));
                        if (data.bom) {
                            const baseQty = Number(data.bom.base_quantity);
                            setBomBaseQty(baseQty);
                            if (!isMultiRelease && baseQty > 0) {
                                const requestedQuantity = requestedTargetQuantity > 0 ? requestedTargetQuantity : baseQty;
                                setTargetQuantity(requestedQuantity);
                            }
                            // Shift option is the available production capacity per day.
                            // Recipe net runtime is calculated separately and must not be
                            // used here because it represents only one recipe batch.
                            setShiftOption(resolveProductionShiftHours(
                                data.bom.shift_option,
                                data.bom.shift_hours,
                                data.bom.target_shift_hours
                            ).toFixed(1));
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
    }, [isConfirmOpen, selectedLines, selectedBranchId, hasLoadedDetails, isMultiRelease, targetQuantityProp, requestedTargetQuantity, targetQuantity, setTargetQuantity]);

    const handleSubAssemblyVersionChange = async (subProdId: number, versionId: number) => {
        const branchId = parseValidBranchId(selectedBranchId);
        if (branchId === null) {
            console.error("Cannot load sub-assembly details without a valid target branch.");
            return;
        }
        setSelectedSubAssemblyVersions(prev => ({ ...prev, [subProdId]: versionId }));
        setLoadingSubVersion(prev => ({ ...prev, [subProdId]: true }));
        try {
            const url = `/api/manufacturing/planning-engineering?action=sub-assembly-version-details&productId=${subProdId}&versionId=${versionId}&branchId=${branchId}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                setSubAssemblyBoms(prev => ({ ...prev, [subProdId]: data.bomItems || [] }));
                if (data.routing) {
                    setSubAssemblyRoutings(prev => ({ ...prev, [subProdId]: data.routing }));
                } else {
                    setSubAssemblyRoutings(prev => {
                        const next = { ...prev };
                        delete next[subProdId];
                        return next;
                    });
                }
                if (data.inventories) {
                    setInventories(prev => ({ ...prev, ...normalizeInventoryMap(data.inventories) }));
                }
            }
        } catch (e) {
            console.error("Failed to load sub-assembly version details:", e);
        } finally {
            setLoadingSubVersion(prev => ({ ...prev, [subProdId]: false }));
        }
    };

    const requiredBatchCount = bomBaseQty > 0 && targetQuantity > 0
        ? calculateRequiredBatchCount(targetQuantity, bomBaseQty)
        : 0;

    const containerMetrics = useMemo(() => {
        if (!selectedLines || selectedLines.length === 0) return null;
        const first = selectedLines[0] as any;
        const prodObj = first?.product_id;
        if (!prodObj) return null;
        const verObj = bomData || first?.version_id || first?.bom_version_id || first?.version;
        return calculateContainerizationMetrics(
            prodObj.product_name || prodObj.product_code || "Product",
            targetQuantity,
            prodObj.unit_of_measurement_count || prodObj.pcs_per_bundle || prodObj.pcs_per_case || prodObj.uom_count,
            verObj?.expected_yield_percentage || prodObj.expected_yield_percentage,
            verObj?.scrap_rate || verObj?.scrap_percentage || verObj?.wastage_factor_percentage,
            verObj?.cutting_unit_weight_grams || verObj?.unit_weight_grams || prodObj.net_weight_grams || prodObj.piece_weight_grams,
            verObj?.cases_per_pallet || prodObj.cases_per_pallet || prodObj.bundles_per_pallet,
            verObj?.sacks_per_mix || verObj?.sacks_per_batch,
            verObj?.batch_weight_per_sack || verObj?.base_batch_weight_grams,
            components,
            bomBaseQty,
            requestedTargetQuantity,
            bomData?.containerization_profile || null
        );
    }, [selectedLines, targetQuantity, requestedTargetQuantity, components, bomBaseQty, bomData]);

    const materialTargetQuantity = targetQuantity > 0 ? targetQuantity : null;
    const productionTimingTargetQuantity = rawTargetQuantity;

    const productionMetricsResult = useMemo(() => {
        if (!hasLoadedDetails || routings.length === 0 || targetQuantity <= 0) {
            return { metrics: null, error: null };
        }

        if (bomBaseQty <= 0) {
            return { metrics: null, error: "Recipe base quantity must be greater than zero." };
        }

        try {
            const first = selectedLines[0] as any;
            const product = first?.product_id as any;
            const metrics = calculateProductionMetrics({
                targetQuantity,
                timingTargetQuantity: productionTimingTargetQuantity,
                baseQuantity: bomBaseQty,
                targetUomId: readUomId(first?.uom_id ?? first?.unit_of_measurement ?? first?.uom),
                baseUomId: readUomId(bomData?.uom_id ?? bomData?.unit_of_measurement ?? bomData?.uom),
                routes: routings.map((route) => ({
                    sequence_order: Number(route.sequence_order || 0),
                    setup_time_hours: Number(route.setup_time_hours || 0),
                    run_time_hours: Number(route.run_time_hours || 0),
                    step_batch_size: route.step_batch_size == null ? undefined : Number(route.step_batch_size),
                    work_center_overhead_cost_per_hour: Number(
                        route.work_center?.overhead_cost_per_hour ?? route.overhead_cost_per_hour ?? 0
                    ),
                    work_center_capacity_per_hour: Number(route.work_center?.capacity_per_hour || 0)
                })),
                bomItems: components.map((component) => ({
                    quantity_required: Number(component.quantity_required || 0),
                    wastage_factor_percentage: Number(component.wastage_factor_percentage || 0),
                    cost_per_unit: Number(component.component_product_id?.cost_per_unit ?? component.cost_per_unit ?? 0)
                })),
                laborPositions: Array.isArray(bomData?.labor_positions) ? bomData.labor_positions : [],
                overheadItems: Array.isArray(bomData?.overhead_items) ? bomData.overhead_items : [],
                customOverhead: bomData?.custom_overhead ?? (first as any)?.custom_overhead ?? product?.custom_overhead,
                expectedYieldPercentage: bomData?.expected_yield_percentage
                    ?? (first as any)?.expected_yield_percentage
                    ?? product?.expected_yield_percentage,
                targetSellingPrice: Number(product?.target_selling_price || product?.targetSellingPrice || 0),
                materialCostPerUnit: bomData?.material_cost_per_unit
            });
            return { metrics, error: null };
        } catch (error) {
            return {
                metrics: null,
                error: error instanceof Error ? error.message : "Unable to calculate production metrics."
            };
        }
    }, [hasLoadedDetails, routings, targetQuantity, productionTimingTargetQuantity, bomBaseQty, selectedLines, components, bomData]);

    const productionMetrics = productionMetricsResult.metrics;
    const productionMetricsError = productionMetricsResult.error;
    const boxEstimatedHours = productionMetrics?.lineLeadTimeHours || 0;

    const getMaterialRequirementPlan = useCallback((
        quantityRequired: number,
        wastagePercentage: number
    ) => calculateReleaseMaterialRequirementPlan(
        requestedTargetQuantity,
        targetQuantity,
        quantityRequired,
        wastagePercentage,
        materialTargetQuantity
    ), [materialTargetQuantity, requestedTargetQuantity, targetQuantity]);
    const getNestedMaterialRequirement = useCallback((
        outputQuantity: number,
        quantityRequired: number,
        wastagePercentage: number
    ) => calculatePerUnitMaterialRequirement(
        outputQuantity,
        quantityRequired,
        materialTargetQuantity === null ? wastagePercentage : 0
    ), [materialTargetQuantity]);

    let subAssemblyEstimatedHours = 0;
    components.forEach((comp) => {
        const compProductId = Number(comp.component_product_id?.product_id || 0);
        const needed = getMaterialRequirementPlan(
            Number(comp.quantity_required || 0),
            Number(comp.wastage_factor_percentage || 0)
        ).plannedRequired;
        const available = compProductId ? Number(inventories[compProductId]?.on_hand || 0) : 0;
        const shortfall = Math.max(0, needed - available);
        const subRoute = compProductId ? (subAssemblyRoutings[compProductId] || (subAssemblyRoutings as any)[String(compProductId)]) : null;
        if (shortfall > 0 && subRoute) {
            const subBaseQty = Number(subRoute.base_quantity);
            if (!Number.isFinite(subBaseQty) || subBaseQty <= 0) return;
            const subSetup = Number(subRoute.setup_time_hours || 0);
            const subRunPerUnit = Number((subRoute as any).run_time_hours_per_unit || 0);
            subAssemblyEstimatedHours += calculateAggregateRunHours(
                shortfall,
                subBaseQty,
                subSetup,
                subRunPerUnit
            );
        }
    });

    const totalEstimatedHours = boxEstimatedHours;

    // Initialize default print selections using the same material basis as the checklist.
    useEffect(() => {
        const initialSelections: Record<string, boolean> = {};
        components.forEach((comp) => {
            const compProductId = comp.component_product_id?.product_id;
            const materialPlan = getMaterialRequirementPlan(
                Number(comp.quantity_required || 0),
                Number(comp.wastage_factor_percentage || 0)
            );
            const needed = materialPlan.plannedRequired;
            const available = compProductId ? (inventories[Number(compProductId)]?.on_hand || 0) : 0;
            const shortfall = Math.max(0, needed - available);

            if (shortfall > 0) {
                const children = subAssemblyBoms[Number(compProductId)] || [];
                const isSubAssembly = children.length > 0 || comp.component_product_id?.product_type === 388 || comp.component_product_id?.is_finished_good;
                initialSelections[`parent-${compProductId}`] = !isSubAssembly;

                if (isSubAssembly) {
                    children.forEach((cc) => {
                        const ccId = cc.component_product_id?.product_id;
                        const ccNeeded = getNestedMaterialRequirement(
                            shortfall,
                            Number(cc.quantity_required || 0),
                            Number(cc.wastage_factor_percentage || 0)
                        );
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
    }, [components, inventories, subAssemblyBoms, getMaterialRequirementPlan, getNestedMaterialRequirement]);

    const cogsBreakdown = productionMetrics?.cogsBreakdown || null;

    const directMaterialSpend = useMemo(() => {
        if (!cogsBreakdown) return null;
        return {
            requested: calculateMaterialSpend(cogsBreakdown.materialCostPerUnit, requestedTargetQuantity),
            fullBatch: calculateMaterialSpend(cogsBreakdown.materialCostPerUnit, targetQuantity)
        };
    }, [cogsBreakdown, requestedTargetQuantity, targetQuantity]);

    const releaseSummaryComponents = useMemo<ReleaseSummaryComponent[]>(() => components.map((comp) => {
        const compProductId = Number(comp.component_product_id?.product_id || 0);
        const materialPlan = getMaterialRequirementPlan(
            Number(comp.quantity_required || 0),
            Number(comp.wastage_factor_percentage || 0)
        );
        const needed = materialPlan.plannedRequired;
        const available = compProductId ? Number(inventories[compProductId]?.on_hand || 0) : 0;
        const shortfall = Math.max(0, needed - available);
        return {
            name: comp.component_product_id?.product_name || `Product #${compProductId}`,
            code: comp.component_product_id?.product_code || "",
            category: comp.component_product_id?.category_name || "Uncategorized",
            uom: comp.unit_of_measurement || "pcs",
            kilogramsPerUnit: comp.component_product_id?.kilograms_per_inventory_unit ?? null,
            needed,
            demandNeeded: materialPlan.demandRequired,
            available,
            sufficient: shortfall <= 0
        };
    }), [components, inventories, getMaterialRequirementPlan]);

    const releaseSummaryRouting = useMemo<ReleaseSummaryRoutingStep[]>(() => [...routings]
        .sort((left, right) => Number(left.sequence_order || 0) - Number(right.sequence_order || 0))
        .map((route) => {
            const sequence = Number(route.sequence_order || 0);
            const assignedIds = assignments[sequence] || [];
            const operatorNames = assignedIds.map((operatorId) => {
                const operator = operators.find((candidate: any) => Number(candidate.user_id || candidate.id) === Number(operatorId));
                const fullName = operator
                    ? `${operator.user_fname || operator.first_name || ""} ${operator.user_lname || operator.last_name || ""}`.trim()
                    : "";
                return fullName || `Operator #${operatorId}`;
            });
            return {
                sequence,
                operation: route.operation_name || "Production Operation",
                workCenter: route.work_center_name || "Factory Work Center",
                hours: productionMetrics?.routeMetrics.find((metric) => metric.sequenceOrder === sequence)?.elapsedHours || 0,
                operators: operatorNames
            };
        }), [routings, assignments, operators, productionMetrics]);

    const releaseSummaryFinancials = useMemo<ReleaseSummaryFinancials | null>(() => cogsBreakdown ? {
        materials: Number(cogsBreakdown.materialCostPerUnit || 0),
        directLabor: Number(cogsBreakdown.directLaborCostPerUnit || 0),
        machineOverhead: Number(cogsBreakdown.machineOverheadCostPerUnit || 0),
        configuredOverhead: Number(cogsBreakdown.fixedOverheadCostPerUnit || 0),
        configuredOverheadBasis: getFactoryOverheadBasisLabel(cogsBreakdown.factoryOverheadBasis),
        baseCogs: Number(cogsBreakdown.baseUnitCOGS || 0),
        adjustedCogs: Number(cogsBreakdown.adjustedUnitCOGS || 0)
    } : null, [cogsBreakdown]);

    const releaseSummaryOrders = useMemo(() => [...new Set(selectedLines
        .map((line) => String(line.order_no || "").trim())
        .filter((orderNo) => orderNo.length > 0))], [selectedLines]);

    const releaseSummaryShortfallCount = releaseSummaryComponents.filter((component) => !component.sufficient).length;
    const hasShortfalls = releaseSummaryShortfallCount > 0;
    const releaseSummaryReady = hasLoadedDetails && releaseSummaryShortfallCount === 0 && !productionMetricsError;

    const handlePrintSummary = () => {
        const printWin = window.open("", "_blank");
        if (!printWin) return;
        printWin.document.write(buildReleaseSummaryHtml({
            joNumber,
            productName: selectedLines[0]?.product_id?.product_name || "Product",
            recipeVersion: selectedLines[0]?.bom_version_name || "Default",
            branchName: selectedBranch?.branch_name || "Main Branch",
            targetQuantity,
            uom: releaseSummaryUom,
            plannedDate,
            dueDate,
            shiftHours: shiftOption,
            targetDurationHours: totalEstimatedHours,
            consolidatedOrders: releaseSummaryOrders,
            remarks,
            components: releaseSummaryComponents,
            routingSteps: releaseSummaryRouting,
            financials: releaseSummaryFinancials,
            allChecksPassed: releaseSummaryReady
        }));
        printWin.document.close();
    };

    const handlePrintProcurementRequest = () => {
        const printWindow = window.open("", "_blank");
        if (!printWindow) return;

        const dateStr = new Date().toLocaleDateString();
        const branchName = selectedBranch?.branch_name || "Main Branch";

        let tableRowsHtml = "";
        components.forEach((comp) => {
            const compProductId = comp.component_product_id?.product_id;
            const needed = getMaterialRequirementPlan(
                Number(comp.quantity_required || 0),
                Number(comp.wastage_factor_percentage || 0)
            ).plannedRequired;
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
                    const ccNeeded = getNestedMaterialRequirement(
                        shortfall,
                        Number(cc.quantity_required || 0),
                        Number(cc.wastage_factor_percentage || 0)
                    );
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
                                <div class="jo-summary-value">${(totalEstimatedHours / resolveProductionShiftHours(shiftOption)).toFixed(1)} Days</div>
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
        updateAssignments((prev) => {
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
                            Step {currentStep} of 4
                        </span>
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground text-xs">
                        Configure targets, verify component sufficiency, and dispatch tasks to operators.
                    </DialogDescription>
                </DialogHeader>

                {/* Progress Indicators */}
                <div className="flex items-center gap-2 px-1 py-1">
                    {[
                        { step: 1, label: "Header" },
                        { step: 2, label: "Materials & Timing" },
                        { step: 3, label: "Team" },
                        { step: 4, label: "Review" }
                    ].map(({ step, label }) => (
                        <div key={step} className="flex flex-1 items-center gap-2">
                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                                step < currentStep
                                    ? "bg-emerald-500 text-white"
                                    : step === currentStep
                                        ? "bg-primary text-primary-foreground"
                                        : "bg-muted text-muted-foreground"
                            }`}>
                                {step < currentStep ? "✓" : step}
                            </span>
                            <span className={`text-[11px] font-semibold ${step === currentStep ? "text-foreground" : "text-muted-foreground"}`}>
                                {label}
                            </span>
                            {step < 4 && <span className="h-px flex-1 bg-border" />}
                        </div>
                    ))}
                </div>

                {isMultiRelease && (
                    <div className="flex flex-wrap gap-2 rounded-lg border border-primary/20 bg-primary/[0.03] p-2">
                        {normalizedReleaseGroups.map((group, index) => (
                            <Button
                                key={group.key}
                                type="button"
                                variant={index === activeGroupIndex ? "default" : "outline"}
                                size="sm"
                                className="h-8 text-[10px] font-bold"
                                onClick={() => {
                                    setActiveGroupIndex(index);
                                    setHasLoadedDetails(false);
                                    setRoutings([]);
                                    setComponents([]);
                                    setInventories({});
                                }}
                            >
                                JO {index + 1}: {group.productName} ({group.totalRemainingQuantity.toLocaleString()})
                            </Button>
                        ))}
                    </div>
                )}

                {selectedLines.length > 0 && (
                    <div className="py-2 space-y-4 flex-1 overflow-x-hidden overflow-y-auto max-h-[68vh] px-1">
                        
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
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Target UOM:</span>
                                        <span className="font-semibold text-foreground">{(selectedLines[0].product_id as any)?.uom_name || (selectedLines[0].product_id as any)?.uom || "Pieces"}</span>
                                    </div>
                                    <div className="flex justify-between pt-1 border-t border-border/50">
                                        <span className="text-muted-foreground">Recipe Batch Size (Base Qty):</span>
                                        {loadingDetails ? (
                                            <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono text-xs flex items-center gap-1">
                                                <Loader2 className="h-3 w-3 animate-spin text-emerald-600" /> Loading...
                                            </span>
                                        ) : (
                                            <span className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">{bomBaseQty.toLocaleString()}</span>
                                        )}
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Ordered Quantity (from SO):</span>
                                        <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">{maxAvailableQuantity.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Required Full Batches:</span>
                                        <span className="font-bold text-amber-600 dark:text-amber-400 font-mono">{requiredBatchCount || "—"}</span>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                            Job Order Reference #
                                        </label>
                                        <Input
                                            value={joNumberProp}
                                            onChange={(e) => setJoNumber(e.target.value)}
                                            className="h-9 font-semibold bg-card border-input text-foreground"
                                            placeholder="JO-XXXXXX"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                                Ordered Quantity (From SO)
                                            </label>
                                            <Input
                                                type="text"
                                                value={maxAvailableQuantity.toLocaleString()}
                                                readOnly
                                                disabled
                                                className="h-9 font-semibold bg-muted text-muted-foreground border-input font-mono"
                                            />
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                                                <span>Target Production Quantity</span>
                                                {loadingDetails && (
                                                    <span className="text-[9px] text-muted-foreground font-normal flex items-center gap-1 lowercase">
                                                        <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
                                                        loading batch size...
                                                    </span>
                                                )}
                                            </label>
                                            <div className="relative">
                                                <Input
                                                    type="number"
                                                    value={loadingDetails ? "" : (targetQuantity || "")}
                                                    min={1}
                                                    step={isPieceProductionUom(releaseSummaryUom) ? 1 : "any"}
                                                    onChange={(e) => {
                                                        const next = Number(e.target.value);
                                                        setTargetQuantity(Number.isFinite(next) && next > 0 ? next : 0);
                                                    }}
                                                    disabled={isMultiRelease || loadingDetails}
                                                    placeholder={loadingDetails ? "Calculating batch size..." : "e.g. 1000"}
                                                    className="h-9 font-semibold bg-card border-input text-foreground font-mono"
                                                />
                                                {loadingDetails && (
                                                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground">
                                        {`The target is not increased to a full recipe batch. ${isPieceProductionUom(releaseSummaryUom) ? "Piece-unit targets use whole pieces. " : ""}Recipe batch estimate: ${requiredBatchCount || 0} batch${requiredBatchCount === 1 ? "" : "es"}. SO demand is ${formatProductionValue(requestedTargetQuantity)} units.`}
                                    </p>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                                                Planned Production Date
                                            </label>
                                            <Input
                                                type="date"
                                                value={plannedDate}
                                                onChange={(e) => setPlannedDate(e.target.value)}
                                                className="h-9 font-semibold bg-card border-input text-foreground"
                                                required
                                            />
                                        </div>
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
                                    </div>

                                    <div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                                                <span>Hours per Shift</span>
                                                {loadingDetails && (
                                                    <span className="text-[9px] text-muted-foreground font-normal flex items-center gap-1 lowercase">
                                                        <Loader2 className="h-2.5 w-2.5 animate-spin text-primary" />
                                                        calculating...
                                                    </span>
                                                )}
                                            </label>
                                            <div className="relative">
                                                <Input
                                                    type="number"
                                                    step="any"
                                                    min="0.1"
                                                    max="24"
                                                    value={shiftOption}
                                                    disabled={loadingDetails}
                                                    onChange={(e) => setShiftOption(e.target.value)}
                                                    className="h-9 font-semibold bg-card border-input text-foreground font-mono"
                                                    placeholder={loadingDetails ? "Loading..." : `e.g. ${DEFAULT_PRODUCTION_SHIFT_HOURS.toFixed(1)}`}
                                                    required
                                                />
                                                <p className="mt-1 text-[10px] text-muted-foreground">
                                                    Used to convert the batch-adjusted runtime into estimated production days.
                                                </p>
                                                {loadingDetails && (
                                                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center">
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                                                    </div>
                                                )}
                                            </div>
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
                                                {productionMetricsError && (
                                                    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
                                                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                                                        <span>{productionMetricsError}</span>
                                                    </div>
                                                )}

                                                {/* Time Summary Breakdown Cards */}
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                            {/* Main Assembly Card */}
                                            <div className="bg-card border border-border rounded-xl p-3 flex flex-col justify-between">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Package className="h-4 w-4 text-primary" />
                                                        <span className="text-xs font-bold text-foreground">📦 Bottleneck-Paced Assembly</span>
                                                </div>
                                                <div>
                                                    <div className="text-base font-black text-foreground">
                                                        {formatProductionValue(boxEstimatedHours)} hrs
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground font-medium">
                                                        ~{formatProductionValue(boxEstimatedHours / resolveProductionShiftHours(shiftOption))} Days
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
                                                         {formatProductionValue(subAssemblyEstimatedHours)} hrs
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground font-medium">
                                                        {subAssemblyEstimatedHours > 0
                                                            ? `~${formatProductionValue(subAssemblyEstimatedHours / resolveProductionShiftHours(shiftOption))} Days`
                                                            : "No piece shortfalls"}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Total Duration Card */}
                                            <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 flex flex-col justify-between">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Clock className="h-4 w-4 text-primary" />
                                                    <span className="text-xs font-bold text-foreground">⏱️ Primary JO Lead Time</span>
                                                </div>
                                                <div>
                                                    <div className="text-base font-black text-primary font-mono tracking-tight">
                                                        {formatHoursToHMS(totalEstimatedHours)}
                                                    </div>
                                                    <div className="text-[10px] text-primary/80 font-bold">
                                                        ~{formatProductionValue(totalEstimatedHours / resolveProductionShiftHours(shiftOption))} Days ({formatProductionValue(totalEstimatedHours)} hrs)
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
                                                        <span className="font-extrabold text-foreground text-xs">{containerMetrics.mixCount} Full Mixes</span>
                                                        <span className="text-[10px] text-muted-foreground block">
                                                            Demand: {containerMetrics.requestedMixCount.toFixed(2)} mixes
                                                            {containerMetrics.hasSackEstimate ? ` / ${containerMetrics.requestedSackCount.toFixed(2)} ${containerMetrics.containerUnitLabel}` : ""}
                                                            {containerMetrics.hasFlourWeightEstimate ? ` / ${(containerMetrics.requestedFlourGrams / 1000).toFixed(2)} kg` : ""}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground block">
                                                            Planned: {containerMetrics.mixCount} mixes
                                                            {containerMetrics.hasSackEstimate ? ` / ${containerMetrics.sackCount.toFixed(2)} ${containerMetrics.containerUnitLabel}` : ""}
                                                            {containerMetrics.hasFlourWeightEstimate ? ` / ${(containerMetrics.flourGramsTotal / 1000).toFixed(2)} kg` : ""}
                                                        </span>
                                                    </div>
                                                    <div className="bg-background border border-border/60 rounded-lg p-2">
                                                        <span className="text-[10px] font-medium text-muted-foreground block">🏭 Expected Net Pcs</span>
                                                        <span className="font-extrabold text-foreground text-xs">{containerMetrics.hasOutputEstimate ? `${Math.round(containerMetrics.netPieces).toLocaleString()} Pcs` : "Not configured"}</span>
                                                        {containerMetrics.hasOutputEstimate && containerMetrics.expectedYieldPercentage < 100 && <span className="text-[10px] text-muted-foreground block">({containerMetrics.expectedYieldPercentage.toFixed(1)}% Expected Yield)</span>}
                                                    </div>
                                                    <div className="bg-background border border-border/60 rounded-lg p-2">
                                                        <span className="text-[10px] font-medium text-muted-foreground block">📦 Cases / Bundles</span>
                                                        <span className="font-extrabold text-foreground text-xs">{containerMetrics.hasOutputEstimate ? `${containerMetrics.totalCasesBundlesFull} Full` : "Not configured"}</span>
                                                        {containerMetrics.hasOutputEstimate && <span className="text-[10px] text-muted-foreground block">(+{containerMetrics.remainingPcs} pcs remaining)</span>}
                                                    </div>
                                                    <div className="bg-background border border-border/60 rounded-lg p-2">
                                                        <span className="text-[10px] font-medium text-muted-foreground block">🚛 Pallet Allocation</span>
                                                        <span className="font-extrabold text-emerald-600 dark:text-emerald-400 text-xs">{containerMetrics.hasPalletEstimate ? `${containerMetrics.totalPalletsFull} Pallets` : "Not configured"}</span>
                                                        {containerMetrics.hasPalletEstimate && <span className="text-[10px] text-muted-foreground block">(+{containerMetrics.remainingCasesBundles} cases/bundles)</span>}
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
                                                             Base COGS: <strong className="text-foreground">₱{formatManufacturingUnitCostForDisplay(cogsBreakdown.baseUnitCOGS)}</strong> / unit
                                                        </span>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-xs font-black text-sky-600 dark:text-sky-400">
                                                        ₱{formatManufacturingUnitCostForDisplay(cogsBreakdown.adjustedUnitCOGS)} / unit
                                                        </span>
                                                        <span className="text-[9px] text-muted-foreground block font-medium">
                                                            (Adjusted for {cogsBreakdown.expectedYieldPercentage}% Yield)
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-1 text-[11px]">
                                                    <div className="bg-background border border-border/60 rounded-lg p-2">
                                                        <span className="text-[10px] font-medium text-muted-foreground block">🥦 Direct Materials</span>
                                                        <span className="font-extrabold text-foreground text-xs">₱{formatProductionValue(cogsBreakdown.materialCostPerUnit)} / unit</span>
                                                        <span className="text-[9px] text-muted-foreground block">Demand: ₱{formatManufacturingMoney(directMaterialSpend?.requested)}</span>
                                                        <span className="text-[9px] text-muted-foreground block">Full batch: ₱{formatManufacturingMoney(directMaterialSpend?.fullBatch)}</span>
                                                    </div>
                                                    <div className="bg-background border border-border/60 rounded-lg p-2">
                                                        <span className="text-[10px] font-medium text-muted-foreground block">👥 Direct Labor</span>
                                                         <span className="font-extrabold text-foreground text-xs">₱{formatProductionValue(cogsBreakdown.directLaborCostPerUnit)}</span>
                                                        <span className="text-[9px] text-muted-foreground block">
                                                            BOM Labor Standard
                                                        </span>
                                                    </div>
                                                    <div className="bg-background border border-border/60 rounded-lg p-2">
                                                        <span className="text-[10px] font-medium text-muted-foreground block">🏭 Machine & Routing Overhead</span>
                                                        <span className="font-extrabold text-foreground text-xs">₱{formatProductionValue(cogsBreakdown.machineOverheadCostPerUnit)} / unit</span>
                                                        <span className="text-[9px] text-muted-foreground block">
                                                            Work-center runtime
                                                        </span>
                                                    </div>
                                                    <div className="bg-background border border-border/60 rounded-lg p-2">
                                                        <span className="text-[10px] font-medium text-muted-foreground block">Configured Factory Overhead</span>
                                                        <span className="font-extrabold text-foreground text-xs">₱{formatProductionValue(cogsBreakdown.fixedOverheadCostPerUnit)} / unit</span>
                                                        <span className="text-[9px] text-muted-foreground block">
                                                            {getFactoryOverheadBasisLabel(cogsBreakdown.factoryOverheadBasis)}
                                                        </span>
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
                                                                <th className="p-2.5 text-center">Planned / Demand</th>
                                                                <th className="p-2.5 text-center">On Hand</th>
                                                                <th className="p-2.5 text-center">Shortfall</th>
                                                                <th className="p-2.5 text-right">Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {releaseSummaryComponents.map((summaryComponent, index) => {
                                                                const comp = components[index];
                                                                const compProductId = comp.component_product_id?.product_id;
                                                                const materialPlan = getMaterialRequirementPlan(
                                                                    Number(comp.quantity_required || 0),
                                                                    Number(comp.wastage_factor_percentage || 0)
                                                                );
                                                                const needed = summaryComponent.needed;
                                                                const available = summaryComponent.available;
                                                                const shortfall = Math.max(0, needed - available);
                                                                const isSufficient = summaryComponent.sufficient;
                                                                const uom = comp.unit_of_measurement || "pcs";
                                                                const kilogramsPerUnit = comp.component_product_id?.kilograms_per_inventory_unit;
                                                                const neededDisplay = formatInventoryQuantity(needed, uom, kilogramsPerUnit);
                                                                const demandDisplay = formatInventoryQuantity(materialPlan.demandRequired, uom, kilogramsPerUnit);
                                                                const availableDisplay = formatInventoryQuantity(available, uom, kilogramsPerUnit);
                                                                const shortfallDisplay = formatInventoryQuantity(shortfall, uom, kilogramsPerUnit);
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
                                                                                                        Setup: <strong className="text-foreground">{formatProductionValue(subAssemblyRoutings[Number(compProductId)].setup_time_hours)}h</strong>
                                                                                                    </span>
                                                                                                    <span>|</span>
                                                                                                    <span>
                                                                                                        Run Rate: <strong className="text-foreground">{formatProductionValue(subAssemblyRoutings[Number(compProductId)].run_time_hours_per_unit)}h/unit</strong>
                                                                                                    </span>
                                                                                                    {shortfall > 0 && (
                                                                                                        <span className="text-sky-600 dark:text-sky-400 font-bold ml-1">
                                                                                                    (= {formatProductionValue(calculateAggregateRunHours(
                                                                                                        shortfall,
                                                                                                        subAssemblyRoutings[Number(compProductId)].base_quantity,
                                                                                                        subAssemblyRoutings[Number(compProductId)].setup_time_hours,
                                                                                                        subAssemblyRoutings[Number(compProductId)].run_time_hours_per_unit
                                                                                                    ))} hrs est.)
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
                                                                                <div>{neededDisplay.quantity}</div>
                                                                                {neededDisplay.kilograms && <div className="text-[9px] font-normal text-muted-foreground">≈ {neededDisplay.kilograms}</div>}
                                                                                <div className="text-[9px] font-normal text-muted-foreground">
                                                                                    Demand: {demandDisplay.quantity}{demandDisplay.kilograms ? ` (≈ ${demandDisplay.kilograms})` : ""}
                                                                                </div>
                                                                            </td>
                                                                            <td className="p-2.5 text-center text-muted-foreground">
                                                                                <div>{availableDisplay.quantity}</div>
                                                                                {availableDisplay.kilograms && <div className="text-[9px] text-muted-foreground">≈ {availableDisplay.kilograms}</div>}
                                                                            </td>
                                                                            <td className={`p-2.5 text-center font-bold ${shortfall > 0 ? (isSubAssembly ? "text-sky-600 dark:text-sky-400" : "text-red-600 dark:text-red-400") : "text-muted-foreground/60"}`}>
                                                                                {shortfall > 0 ? (
                                                                                    <>
                                                                                        {shortfallDisplay.quantity}
                                                                                        {shortfallDisplay.kilograms && <span className="block text-[9px] font-normal">≈ {shortfallDisplay.kilograms}</span>}
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
                    const ccNeeded = getNestedMaterialRequirement(
                        shortfall,
                        Number(cc.quantity_required || 0),
                        Number(cc.wastage_factor_percentage || 0)
                                                                            );
                                                                            const ccAvailable = ccId ? (inventories[Number(ccId)]?.on_hand || 0) : 0;
                                                                            const ccShortfall = Math.max(0, ccNeeded - ccAvailable);
                                                                            const ccUom = cc.unit_of_measurement || "pcs";
                                                                            const ccKilogramsPerUnit = cc.component_product_id?.kilograms_per_inventory_unit;
                                                                            const ccNeededDisplay = formatInventoryQuantity(ccNeeded, ccUom, ccKilogramsPerUnit);
                                                                            const ccAvailableDisplay = formatInventoryQuantity(ccAvailable, ccUom, ccKilogramsPerUnit);
                                                                            const ccShortfallDisplay = formatInventoryQuantity(ccShortfall, ccUom, ccKilogramsPerUnit);
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
                                                                                        <div>{ccNeededDisplay.quantity}</div>
                                                                                        {ccNeededDisplay.kilograms && <div className="text-[8px] text-muted-foreground/60">{ccNeededDisplay.kilograms}</div>}
                                                                                    </td>
                                                                                    <td className="p-2.5 text-center text-muted-foreground">
                                                                                        <div>{ccAvailableDisplay.quantity}</div>
                                                                                        {ccAvailableDisplay.kilograms && <div className="text-[8px] text-muted-foreground/60">{ccAvailableDisplay.kilograms}</div>}
                                                                                    </td>
                                                                                    <td className={`p-2.5 text-center font-bold ${ccShortfall > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground/60"}`}>
                                                                                        {ccShortfall > 0 ? <>
                                                                                            <div>{ccShortfallDisplay.quantity}</div>
                                                                                            {ccShortfallDisplay.kilograms && <div className="text-[8px] font-normal text-muted-foreground">{ccShortfallDisplay.kilograms}</div>}
                                                                                        </> : "-"}
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
                                                            const stepMetric = productionMetrics?.routeMetrics.find(
                                                                (metric) => metric.sequenceOrder === seq
                                                            );
                                                            const stepRunTime = stepMetric?.elapsedHours || 0;

                                            return (
                                                <div key={`${route.routing_id || "route"}_${index}`} className="border border-border bg-card/20 rounded-xl p-4 space-y-3.5 hover:border-border/60 transition-all duration-300">
                                                    <div className="flex justify-between items-start border-b border-border/60 pb-2">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[9px] font-black bg-muted text-muted-foreground border border-border px-2 py-0.5 rounded-md">
                                                                    Step {seq}
                                                                </span>
                                                                <h5 className="text-xs font-bold text-foreground">{route.operation_name || "Production Operation"}</h5>
                                                            </div>
                                                            <p className="text-[10px] text-muted-foreground">
                                                                Work Center: <span className="font-semibold text-foreground">{route.work_center_name || "Factory Work Center"}</span>
                                                            </p>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-[10px] bg-primary/10 border border-primary/20 text-primary px-2.5 py-0.5 rounded-full font-bold">
                                                                 {formatProductionValue(stepRunTime)} hrs needed
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

                        {/* STEP 4: REVIEW & CONFIRM */}
                        {currentStep === 4 && (
                            <div className="space-y-3">
                                {isMultiRelease && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {normalizedReleaseGroups.map((group, index) => (
                                            <div key={group.key} className="rounded-xl border border-primary/20 bg-primary/[0.03] p-3 text-xs space-y-1.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-bold text-foreground">JO {index + 1} · {group.productName}</span>
                                                    <span className="font-mono font-bold text-primary">{joNumberProp}-{String(index + 1).padStart(2, "0")}</span>
                                                </div>
                                                <div className="text-muted-foreground">{group.bomVersionName} · {group.lines.length} detail line{group.lines.length === 1 ? "" : "s"}</div>
                                                <div className="font-bold text-emerald-700">Full remaining: {group.totalRemainingQuantity.toLocaleString()} {group.lines[0]?.product_id?.uom || "units"}</div>
                                                <div className="text-muted-foreground">Operators assigned: {Object.values(groupAssignments[group.key] || {}).reduce((sum, ids) => sum + ids.length, 0)}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                                    {/* 1. General Job Order Parameters */}
                                    <section className="min-w-0 rounded-xl border border-border bg-card p-3.5 lg:col-start-1 lg:row-start-1" aria-label="General Job Order Parameters">
                                        <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-foreground border-b border-border pb-2 mb-2">
                                            General Job Order Parameters
                                        </h4>
                                        <dl className="space-y-1.5 text-[11px]">
                                            {[
                                                { label: "Job Order Reference", value: <span className="font-mono font-bold text-foreground">{joNumber}</span> },
                                                { label: "Product Name", value: selectedLines[0]?.product_id?.product_name || "N/A" },
                                                { label: "Recipe Version", value: selectedLines[0]?.bom_version_name || "Default" },
                                                { label: "Target Branch", value: selectedBranch?.branch_name || "N/A" },
                                                { label: "Target Quantity", value: `${targetQuantity.toLocaleString()} ${releaseSummaryUom}` },
                                                { label: "Planned Date / Due", value: `${plannedDate || "Not set"} / ${dueDate || "Not set"}` },
                                                { label: "Target Duration", value: `${formatProductionValue(totalEstimatedHours)} hrs (Shift: ${shiftOption} hrs)` },
                                                { label: "Consolidated Orders", value: releaseSummaryOrders.length > 0 ? releaseSummaryOrders.join(", ") : "—" }
                                            ].map((row) => (
                                                <div key={row.label} className="flex min-w-0 items-start justify-between gap-3">
                                                    <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
                                                    <dd className="min-w-0 max-w-[65%] break-words text-right font-semibold text-foreground">{row.value}</dd>
                                                </div>
                                            ))}
                                        </dl>
                                    </section>

                                    {/* 2. Remarks and readiness context */}
                                    <section className="min-w-0 rounded-xl border border-border bg-card p-3.5 lg:col-start-1 lg:row-start-2" aria-label="Remarks and Order Context">
                                        <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-foreground border-b border-border pb-2 mb-2">
                                            Remarks / Order Context
                                        </h4>
                                        <div className="space-y-1.5 text-[11px] text-foreground">
                                            <p>
                                                {releaseSummaryOrders.length > 0
                                                    ? `Production run initialized for Sales Order${releaseSummaryOrders.length === 1 ? "" : "s"}: ${releaseSummaryOrders.join(", ")}.`
                                                    : "Production run initialized for the selected demand."}
                                            </p>
                                            <p className={releaseSummaryReady ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
                                                {releaseSummaryReady
                                                    ? "All component allocations passed. Ready for picking."
                                                    : `${releaseSummaryShortfallCount} component shortfall${releaseSummaryShortfallCount === 1 ? "" : "s"} detected. Child job orders / procurement requests will be generated on release.`}
                                            </p>
                                            {remarks.trim() && (
                                                <p className="border-t border-border/60 pt-1.5 text-foreground">
                                                    <span className="font-semibold">Planning Remarks:</span>{" "}
                                                    <span className="italic">&quot;{remarks}&quot;</span>
                                                </p>
                                            )}
                                        </div>
                                    </section>

                                    {/* 3. Component Sufficiency Summary */}
                                    <section className="min-w-0 rounded-xl border border-border bg-card p-3.5 lg:col-start-2 lg:row-start-1" aria-label="Component Sufficiency Summary">
                                        <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-foreground border-b border-border pb-2 mb-2">
                                            Component Sufficiency Summary
                                        </h4>
                                        <div className="max-h-[260px] overflow-x-hidden overflow-y-auto pr-0.5">
                                            <table className="w-full table-fixed text-[10px]">
                                                <thead className="sticky top-0 bg-card">
                                                    <tr className="text-left text-[9px] uppercase tracking-wider text-muted-foreground">
                                                        <th className="w-[48%] py-1.5 pr-2 font-bold">Component</th>
                                                        <th className="w-[18%] py-1.5 pr-2 text-right font-bold">Req. Qty</th>
                                                        <th className="w-[18%] py-1.5 pr-2 text-right font-bold">Available</th>
                                                        <th className="w-[16%] py-1.5 text-right font-bold">Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-border/60">
                                                    {releaseSummaryComponents.map((component, index) => (
                                                        <tr key={`${component.name}-${index}`}>
                                                            <td className="min-w-0 break-words py-1.5 pr-2">
                                                                <div className="break-words font-bold text-foreground">{component.name}</div>
                                                                {component.code && <div className="break-words text-[9px] text-muted-foreground">{component.code}</div>}
                                                            </td>
                                                            <td className="py-1.5 pr-2 text-right font-semibold tabular-nums">
                                                                {component.needed.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="font-normal text-muted-foreground">{component.uom}</span>
                                                            </td>
                                                            <td className="py-1.5 pr-2 text-right text-muted-foreground tabular-nums">
                                                                {component.available.toLocaleString(undefined, { maximumFractionDigits: 2 })} <span className="font-normal">{component.uom}</span>
                                                            </td>
                                                            <td className="py-1.5 text-right">
                                                                {component.sufficient ? (
                                                                    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-600 dark:text-emerald-400">Sufficient</span>
                                                                ) : (
                                                                    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-red-500/30 bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-600 dark:text-red-400">Insufficient</span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {releaseSummaryComponents.length === 0 && (
                                                        <tr>
                                                            <td colSpan={4} className="py-3 text-center text-muted-foreground">No raw material requirements specified.</td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </section>

                                    {/* 4. Routing Steps & Financial Sanity Check */}
                                    <section className="min-w-0 rounded-xl border border-border bg-card p-3.5 lg:col-start-2 lg:row-start-2" aria-label="Routing Steps and Financial Sanity Check">
                                        <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-foreground border-b border-border pb-2 mb-2">
                                            Routing Steps &amp; Financial Sanity Check
                                        </h4>
                                        <div className="space-y-1.5">
                                            {releaseSummaryRouting.map((step) => (
                                                <div key={`route-${step.sequence}-${step.operation}`} className="flex items-start justify-between gap-2 text-[11px]">
                                                    <div className="min-w-0">
                                                        <div className="truncate font-bold text-foreground">Step {step.sequence}: {step.operation}</div>
                                                        <div className="flex min-w-0 flex-wrap items-center gap-x-1 text-[9px] text-muted-foreground">
                                                            <span className="shrink-0 font-semibold">Op {step.sequence} ({step.operators.length > 0 ? "Assigned" : "Unassigned"})</span>
                                                            <span className="min-w-0 break-words">{step.workCenter}</span>
                                                            {step.operators.length > 0 && <span className="min-w-0 break-words">· {step.operators.join(", ")}</span>}
                                                        </div>
                                                    </div>
                                                     <span className="shrink-0 whitespace-nowrap font-mono font-semibold text-foreground">{formatProductionValue(step.hours)} hrs</span>
                                                </div>
                                            ))}
                                            {releaseSummaryRouting.length === 0 && (
                                                <p className="text-[10px] text-muted-foreground">No routing steps defined.</p>
                                            )}
                                        </div>
                                        <div className="mt-2 space-y-1 border-t border-border pt-2 text-[11px]">
                                            {releaseSummaryFinancials ? (
                                                <>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Direct Materials / unit</span>
                                                        <span className="font-mono font-semibold text-foreground">₱{formatProductionValue(releaseSummaryFinancials.materials)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Direct Labor / unit</span>
                                                        <span className="font-mono font-semibold text-foreground">₱{formatProductionValue(releaseSummaryFinancials.directLabor)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">Machine &amp; Routing Overhead / unit</span>
                                                        <span className="font-mono font-semibold text-foreground">₱{formatProductionValue(releaseSummaryFinancials.machineOverhead)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="text-muted-foreground">
                                                            Configured Factory Overhead / unit
                                                            <span className="ml-1 text-[10px]">({releaseSummaryFinancials.configuredOverheadBasis})</span>
                                                        </span>
                                                        <span className="font-mono font-semibold text-foreground">₱{formatProductionValue(releaseSummaryFinancials.configuredOverhead)}</span>
                                                    </div>
                                                    <div className="flex justify-between border-t border-border/60 pt-1">
                                                        <span className="font-bold text-foreground">Est. Unit COGS (Base)</span>
                                                        <span className="font-mono font-bold text-foreground">₱{formatManufacturingUnitCostForDisplay(releaseSummaryFinancials.baseCogs)}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span className="font-bold text-sky-700 dark:text-sky-400">Est. Unit COGS (Yield-Adjusted)</span>
                                                        <span className="font-mono font-black text-sky-700 dark:text-sky-400">₱{formatManufacturingUnitCostForDisplay(releaseSummaryFinancials.adjustedCogs)}</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <p className="text-[10px] text-muted-foreground">Costing data unavailable.</p>
                                            )}
                                        </div>
                                    </section>
                                </div>

                            </div>
                        )}

                    </div>
                )}

                <DialogFooter className="flex w-full flex-wrap items-center justify-between gap-2 border-t border-border pt-3 sm:justify-between">
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
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsConfirmOpen(false)}
                            disabled={releasingJO}
                            className="text-muted-foreground hover:text-foreground h-8 hover:bg-accent"
                        >
                            Cancel
                        </Button>
                        {currentStep < 4 ? (
                            <Button
                                size="sm"
                                onClick={() => setCurrentStep((prev) => prev + 1)}
                                 disabled={loadingDetails || !joNumber || targetQuantity <= 0 || (currentStep === 2 && !!productionMetricsError)}
                                className="bg-primary hover:bg-primary/90 text-white h-8 font-semibold shadow-lg shadow-primary/20"
                            >
                                {currentStep === 3 ? "Next: Review" : "Next"} <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                            </Button>
                        ) : (
                            <>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handlePrintSummary}
                                    disabled={releasingJO || loadingDetails}
                                    className="border-border text-foreground hover:bg-accent h-8 font-semibold"
                                >
                                    <Printer className="mr-1.5 h-3.5 w-3.5" /> Print Summary
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleConfirmRelease(
                                        selectedSubAssemblyVersions,
                                        isMultiRelease
                                            ? Object.fromEntries(normalizedReleaseGroups.map((group) => [
                                                group.key,
                                                {
                                                    subAssemblyVersions: groupSubAssemblyVersions[group.key] || {},
                                                    assignments: groupAssignments[group.key] || {}
                                                }
                                            ]))
                                            : undefined,
                                        false,
                                        materialTargetQuantity ?? undefined,
                                        productionTimingTargetQuantity
                                    )}
                                    disabled={releasingJO || !!productionMetricsError}
                                    className="border-primary/30 text-primary hover:bg-primary/5 h-8 font-semibold"
                                >
                                    {releasingJO ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                    Save Draft
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleConfirmRelease(
                                        selectedSubAssemblyVersions,
                                        isMultiRelease
                                            ? Object.fromEntries(normalizedReleaseGroups.map((group) => [
                                                group.key,
                                                {
                                                    subAssemblyVersions: groupSubAssemblyVersions[group.key] || {},
                                                    assignments: groupAssignments[group.key] || {}
                                                }
                                            ]))
                                            : undefined,
                                        true,
                                        materialTargetQuantity ?? undefined,
                                        productionTimingTargetQuantity
                                    )}
                                    disabled={releasingJO || !!productionMetricsError || !plannedDate || priority < 0}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 font-semibold shadow-lg shadow-emerald-500/20"
                                >
                                    {releasingJO ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Initializing...
                                        </>
                                    ) : (
                                        "Initialize JO"
                                    )}
                                </Button>
                            </>
                        )}
                    </div>
                </DialogFooter>
            </DialogContent>
            <SubmittingLoadingOverlay isOpen={releasingJO} title="Releasing Sales Order Production Run..." />
        </Dialog>
    );
}
