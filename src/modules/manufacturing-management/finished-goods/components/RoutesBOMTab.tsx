/* eslint-disable */
"use client";

import React from "react";
import { Plus, Trash2, Shield, Settings, Clock, Layers, Users, Briefcase } from "lucide-react";
import { RouteStep, RouteBOMItem, OperationType, WorkCenter, QATemplate, Unit, VersionLaborPosition, BFFCatalogProduct } from "../types";
import { BOMMaterialSelect } from "./BOMMaterialSelect";
import { MaterialTypeSelect } from "./MaterialTypeSelect";
import { CreatableSelect } from "./CreatableSelect";
import { Button } from "@/components/ui/button";
import { calculateMaterialCost } from "../costing";
import { getProductFamilyUOMOptions, extractProductUomShortcut } from "../utils/uom-rules";
import { formatNumberWithCommas } from "../utils/formatters";
import {
    MATERIAL_TYPE_OPTIONS,
    MaterialType,
    materialTypeFromProduct
} from "../material-types";

function materialClassification(item: RouteBOMItem) {
    const materialType = item.material_type || materialTypeFromProduct(item.product_type, item.has_versions);
    const label = MATERIAL_TYPE_OPTIONS.find(option => option.value === materialType)?.label;

    if (!materialType || !label) {
        return { label: item.product_id ? "Unclassified" : "Select a material type", className: "bg-muted text-muted-foreground border-border" };
    }

    const classNameByType: Record<MaterialType, string> = {
        raw_material: "bg-blue-500/10 text-blue-600 border-blue-500/20",
        packaging: "bg-amber-500/10 text-amber-600 border-amber-500/20",
        sub_assembly: "bg-violet-500/10 text-violet-600 border-violet-500/20",
        finished_good: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
    };

    return { label, className: classNameByType[materialType] };
}

interface RoutesBOMTabProps {
    editedRoutes: RouteStep[];
    setEditedRoutes: React.Dispatch<React.SetStateAction<RouteStep[]>>;
    operationTypes: OperationType[];
    workCenters: WorkCenter[];
    qaTemplates: QATemplate[];
    units: Unit[];
    catalogProducts?: BFFCatalogProduct[];
    setHasUnsavedChanges: (val: boolean) => void;
    setOperationTypes?: React.Dispatch<React.SetStateAction<OperationType[]>>;
    editedVersionDetails?: any;
    setEditedVersionDetails?: any;
    /** When true, all fields are read-only. */
    isVersionLocked?: boolean;
}

export const RoutesBOMTab: React.FC<RoutesBOMTabProps> = ({
    editedRoutes,
    setEditedRoutes,
    operationTypes,
    workCenters,
    qaTemplates,
    units,
    catalogProducts,
    setHasUnsavedChanges,
    setOperationTypes,
    editedVersionDetails,
    setEditedVersionDetails,
    isVersionLocked = false
}) => {
    const operationOptions = React.useMemo(() => {
        return operationTypes.map(op => ({
            value: String(op.id),
            label: op.operation_name
        }));
    }, [operationTypes]);

    const workCenterOptions = React.useMemo(() => {
        return workCenters.map(wc => ({
            value: String(wc.work_center_id),
            label: wc.work_center_name
        }));
    }, [workCenters]);

    const [productionPositions, setProductionPositions] = React.useState<any[]>([]);

    React.useEffect(() => {
        fetch("/api/manufacturing/finished-goods/positions")
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                if (Array.isArray(data)) setProductionPositions(data);
            })
            .catch((err) => console.error("Error loading production positions:", err));
    }, []);

    const positionOptions = React.useMemo(() => {
        return productionPositions.map(p => {
            const daily = Number(p.daily_rate || 505);
            const hourly = Number(p.hourly_rate || (daily / 8) || 63.13);
            return {
                value: p.position_name,
                label: `${p.position_name} (₱${daily.toFixed(2)}/day | ₱${hourly.toFixed(2)}/hr)`
            };
        });
    }, [productionPositions]);

    // Version-Level Direct Labor Standards Handlers
    const handleAddVersionLaborPosition = () => {
        if (!setEditedVersionDetails) return;
        const defaultPos = productionPositions[0];
        const daily = defaultPos ? Number(defaultPos.daily_rate || 505) : 505;
        const hourly = defaultPos ? Number(defaultPos.hourly_rate || (daily / 8) || 63.13) : 63.13;
        const newPos: VersionLaborPosition = {
            id: `vpos-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            position_name: defaultPos?.position_name || "OPERATOR",
            manpower_count: 1,
            hourly_rate: hourly,
            daily_rate: daily,
            hours_required: 1
        };
        const currentList = editedVersionDetails?.labor_positions || [];
        setEditedVersionDetails((prev: any) => ({
            ...prev,
            labor_positions: [...currentList, newPos]
        }));
        setHasUnsavedChanges(true);
    };

    const handleUpdateVersionLaborPosition = (index: number, field: keyof VersionLaborPosition, value: any) => {
        if (!setEditedVersionDetails) return;
        const currentList = [...(editedVersionDetails?.labor_positions || [])];
        if (!currentList[index]) return;

        let updatedItem = { ...currentList[index], [field]: value };

        if (field === "position_name") {
            const match = productionPositions.find(p => p.position_name.toLowerCase() === String(value).toLowerCase());
            if (match) {
                const daily = Number(match.daily_rate || 505);
                const hourly = Number(match.hourly_rate || (daily / 8) || 63.13);
                updatedItem.position_id = match.id || null;
                updatedItem.daily_rate = daily;
                updatedItem.hourly_rate = hourly;
            }
        } else if (field === "hourly_rate") {
            const hRate = parseFloat(value);
            if (!isNaN(hRate)) {
                updatedItem.daily_rate = Math.round(hRate * 8 * 100) / 100;
            }
        } else if (field === "daily_rate") {
            const dRate = parseFloat(value);
            if (!isNaN(dRate)) {
                updatedItem.hourly_rate = Math.round((dRate / 8) * 100) / 100;
            }
        }

        currentList[index] = updatedItem;
        setEditedVersionDetails((prev: any) => ({
            ...prev,
            labor_positions: currentList
        }));
        setHasUnsavedChanges(true);
    };

    const handleDeleteVersionLaborPosition = (index: number) => {
        if (!setEditedVersionDetails) return;
        const currentList = [...(editedVersionDetails?.labor_positions || [])];
        const updatedList = currentList.filter((_, idx) => idx !== index);
        setEditedVersionDetails((prev: any) => ({
            ...prev,
            labor_positions: updatedList
        }));
        setHasUnsavedChanges(true);
    };

    const handleCreateOperationType = async (name: string, routeId: number) => {
        try {
            const res = await fetch("/api/manufacturing/finished-goods/operations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.operation) {
                    const newOp = data.operation;
                    handleUpdateRoute(routeId, "operation_id", newOp.id);

                    const refreshRes = await fetch("/api/manufacturing/finished-goods/operations");
                    if (refreshRes.ok && setOperationTypes) {
                        setOperationTypes(await refreshRes.json());
                    }
                }
            }
        } catch (e) {
            console.error("Failed to create new operation type on the fly:", e);
        }
    };

    const handleAddRoute = () => {
        const nextSeq = editedRoutes.length > 0
            ? Math.max(...editedRoutes.map(r => r.sequence_order)) + 1
            : 1;

        const newRoute: RouteStep = {
            route_id: -Math.floor(Math.random() * 1000000),
            version_id: 0,
            work_center_id: null,
            operation_id: null,
            sequence_order: nextSeq,
            setup_time_hours: 0,
            run_time_hours: 0,
            step_batch_size: 1,
            qa_template_id: null,
            bom_items: []
        };

        setEditedRoutes(prev => [...prev, newRoute]);
        setHasUnsavedChanges(true);
    };

    const handleDeleteRoute = (routeId: number) => {
        setEditedRoutes(prev => prev.filter(r => r.route_id !== routeId));
        setHasUnsavedChanges(true);
    };

    const handleUpdateRoute = (routeId: number, field: keyof RouteStep, value: unknown) => {
        setEditedRoutes(prev => prev.map(r => r.route_id === routeId ? { ...r, [field]: value } : r));
        setHasUnsavedChanges(true);
    };

    const handleAddIngredient = (routeId: number) => {
        setEditedRoutes(prev => prev.map(r => {
            if (r.route_id !== routeId) return r;
            const newBomItem: RouteBOMItem = {
                id: -Math.floor(Math.random() * 1000000),
                route_id: routeId,
                product_id: 0,
                material_type: null,
                quantity_required: 0,
                product_type: null,
                has_versions: false,
                unit_of_measurement: null,
                wastage_factor_percentage: 0,
                cost_per_unit: 0
            };
            return {
                ...r,
                bom_items: [...(r.bom_items || []), newBomItem]
            };
        }));
        setHasUnsavedChanges(true);
    };

    const handleDeleteIngredient = (routeId: number, bomItemId: number) => {
        setEditedRoutes(prev => prev.map(r => {
            if (r.route_id !== routeId) return r;
            return {
                ...r,
                bom_items: (r.bom_items || []).filter(b => b.id !== bomItemId)
            };
        }));
        setHasUnsavedChanges(true);
    };

    const handleUpdateIngredient = (routeId: number, bomItemId: number, field: keyof RouteBOMItem, value: unknown) => {
        setEditedRoutes(prev => prev.map(r => {
            if (r.route_id !== routeId) return r;
            return {
                ...r,
                bom_items: (r.bom_items || []).map(b => b.id === bomItemId ? { ...b, [field]: value } : b)
            };
        }));
        setHasUnsavedChanges(true);
    };

    const handleChangeMaterialType = (routeId: number, bomItemId: number, value: MaterialType | "") => {
        setEditedRoutes(prev => prev.map(r => {
            if (r.route_id !== routeId) return r;
            return {
                ...r,
                bom_items: (r.bom_items || []).map(b => b.id === bomItemId ? {
                    ...b,
                    material_type: value || null,
                    product_id: 0,
                    product_name: "",
                    product_code: "",
                    product_type: null,
                    has_versions: false,
                    unit_of_measurement: null,
                    cost_per_unit: 0
                } : b)
            };
        }));
        setHasUnsavedChanges(true);
    };

    const handleSelectProduct = (routeId: number, bomItemId: number, prod: BFFCatalogProduct, materialType: MaterialType | null) => {
        const initialUom = extractProductUomShortcut(prod, units) || "";
        setEditedRoutes(prev => prev.map(r => {
            if (r.route_id !== routeId) return r;
            return {
                ...r,
                bom_items: (r.bom_items || []).map(b => {
                    if (b.id !== bomItemId) return b;
                    return {
                        ...b,
                        product_id: Number(prod.product_id),
                        product_name: prod.product_name,
                        product_code: prod.product_code || "",
                        product_type: prod.product_type ?? null,
                        has_versions: Boolean(prod.has_versions),
                        material_type: materialType,
                        cost_per_unit: Number(prod.cost_per_unit || prod.price_per_unit || 0),
                        unit_of_measurement: initialUom
                    };
                })
            };
        }));
        setHasUnsavedChanges(true);
    };

    const unitOptions = React.useMemo(() => {
        return units.map(u => ({
            value: u.unit_shortcut,
            label: `${u.unit_name} (${u.unit_shortcut})`
        }));
    }, [units]);

    // Derived Version Direct Labor Calculations
    const versionLaborPositions: VersionLaborPosition[] = editedVersionDetails?.labor_positions || [];
    const baseQuantity = Number(editedVersionDetails?.base_quantity) > 0 ? Number(editedVersionDetails.base_quantity) : 1;
    const unitShortcut = units.find(u => u.unit_id === editedVersionDetails?.uom_id)?.unit_shortcut || "Units";

    const totalLaborBatchCost = React.useMemo(() => {
        return versionLaborPositions.reduce((sum, pos) => {
            const count = Number(pos.manpower_count) || 0;
            const rate = Number(pos.hourly_rate) || 0;
            const hours = Number(pos.hours_required) || 0;
            return sum + (count * rate * hours);
        }, 0);
    }, [versionLaborPositions]);

    const laborCostPerUnit = baseQuantity > 0 ? totalLaborBatchCost / baseQuantity : 0;
    const totalManpowerCount = versionLaborPositions.reduce((sum, pos) => sum + (Number(pos.manpower_count) || 0), 0);
    const totalLaborHoursRequired = versionLaborPositions.reduce((sum, pos) => sum + (Number(pos.hours_required) || 0), 0);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-medium text-foreground">Routing Steps &amp; BOM Ingredients</h3>
                    <p className="text-xs text-muted-foreground">Configure the sequence of operations, setup times, work centers, and assign raw materials directly under each step.</p>
                </div>
                <Button
                    id="add-route-step-top-btn"
                    aria-label="Add Route Step"
                    onClick={handleAddRoute}
                    disabled={isVersionLocked}
                    className="inline-flex items-center gap-1.5 h-9 text-xs rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Plus className="h-3.5 w-3.5" /> Add Route Step
                </Button>
            </div>

            {editedVersionDetails && setEditedVersionDetails && (
                <div className="space-y-4">
                    {/* BOM Version Specifications Card */}
                    <div className="bg-card border border-border/85 rounded-xl p-5 shadow-xs space-y-4">
                        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 border-b pb-2">
                            <Layers className="h-4 w-4 text-primary/80" /> BOM Version Specifications
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <label htmlFor="version-name-input" className="text-[11px] font-bold text-muted-foreground uppercase">Version Name</label>
                                <input
                                    id="version-name-input"
                                    type="text"
                                    disabled={isVersionLocked}
                                    value={editedVersionDetails.version_name || ""}
                                    onChange={e => {
                                        setEditedVersionDetails((prev: any) => ({ ...prev, version_name: e.target.value }));
                                        setHasUnsavedChanges(true);
                                    }}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all disabled:opacity-60 disabled:bg-muted/30"
                                />
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="version-base-qty-input" className="text-[11px] font-bold text-muted-foreground uppercase">Base Quantity (Batch Size)</label>
                                <div className="relative">
                                    <input
                                        id="version-base-qty-input"
                                        type="number"
                                        step="0.0001"
                                        disabled={isVersionLocked}
                                        value={editedVersionDetails.base_quantity !== undefined ? editedVersionDetails.base_quantity : 1}
                                        onChange={e => {
                                            setEditedVersionDetails((prev: any) => ({ ...prev, base_quantity: parseFloat(e.target.value) || 0 }));
                                            setHasUnsavedChanges(true);
                                        }}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all pr-12 disabled:opacity-60 disabled:bg-muted/30"
                                    />
                                    <span className="absolute right-3 top-2.5 text-xs font-semibold text-muted-foreground">
                                        {unitShortcut}
                                    </span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="version-expected-yield-input" className="text-[11px] font-bold text-muted-foreground uppercase">Expected Yield (%)</label>
                                <input
                                    id="version-expected-yield-input"
                                    type="number"
                                    step="0.01"
                                    min="1"
                                    max="100"
                                    disabled={isVersionLocked}
                                    value={editedVersionDetails.expected_yield_percentage !== undefined ? editedVersionDetails.expected_yield_percentage : 100}
                                    onChange={e => {
                                        setEditedVersionDetails((prev: any) => ({ ...prev, expected_yield_percentage: parseFloat(e.target.value) || 0 }));
                                        setHasUnsavedChanges(true);
                                    }}
                                    className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all disabled:opacity-60 disabled:bg-muted/30"
                                />
                            </div>
                        </div>
                        {editedRoutes.length > 0 && (() => {
                            const stepCapacities = editedRoutes.map(r => {
                                const matchedWc = workCenters.find(wc => wc.work_center_id === r.work_center_id) || r.work_center;
                                return Number(matchedWc?.capacity_per_hour ?? 0);
                            });
                            const validCapacities = stepCapacities.filter(cap => cap > 0);
                            const capacitiesToUse = validCapacities.length > 0 ? validCapacities : stepCapacities;
                            const bottleneckRate = capacitiesToUse.length > 0 ? Math.min(...capacitiesToUse) : 0;
                            const avgRate = capacitiesToUse.length > 0 ? capacitiesToUse.reduce((sum, cap) => sum + cap, 0) / capacitiesToUse.length : 0;

                            return (
                                <div className="pt-3 border-t border-border/50 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
                                    <div>
                                        <span className="font-semibold text-foreground">Line Bottleneck Capacity: </span>
                                        <span className="font-mono text-primary bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10">
                                            {bottleneckRate.toFixed(4)}{" "}
                                            {unitShortcut}/hour
                                        </span>
                                    </div>
                                    <div>
                                        <span className="font-semibold text-foreground">Average Work Center Capacity: </span>
                                        <span className="font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-900/30">
                                            {avgRate.toFixed(4)}{" "}
                                            {unitShortcut}/hour
                                        </span>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {editedRoutes.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 rounded-xl border border-dashed bg-muted/5 border-muted text-center space-y-2">
                    <Layers className="h-10 w-10 text-muted-foreground opacity-40 mb-1" />
                    <h4 className="text-sm font-medium text-foreground">
                        {isVersionLocked ? "No route steps configured for this version" : "No route steps added yet"}
                    </h4>
                    <p className="text-xs text-muted-foreground max-w-sm">
                        {isVersionLocked
                            ? "This version is locked in read-only mode. Workstation routings and BOM components cannot be modified."
                            : "Route steps outline the physical workstations and operations required to produce this version."}
                    </p>
                    {!isVersionLocked && (
                        <Button id="create-first-step-btn" aria-label="Create First Step" onClick={handleAddRoute} variant="outline" size="sm" className="mt-3 text-xs cursor-pointer">
                            Create First Step
                        </Button>
                    )}
                </div>
            ) : (
                <div className="space-y-6">
                    {editedRoutes.map((r, index) => {
                        const stepNum = index + 1;
                        return (
                            <div
                                key={r.route_id}
                                className="rounded-xl border bg-card text-card-foreground shadow-xs overflow-hidden border-muted/50"
                            >
                                {/* Header */}
                                <div className="flex justify-between items-center px-4 py-3 bg-muted/10 border-b border-muted/50">
                                    <div className="flex items-center gap-2">
                                        <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs">
                                            {stepNum}
                                        </div>
                                        <h4 className="text-sm font-semibold">Route Step #{stepNum}</h4>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1 text-xs">
                                            <span className="text-muted-foreground">Seq:</span>
                                            <input
                                                id={`route-seq-input-${r.route_id}`}
                                                aria-label={`Sequence order for step ${stepNum}`}
                                                type="number"
                                                disabled={isVersionLocked}
                                                value={r.sequence_order}
                                                onChange={(e) => handleUpdateRoute(r.route_id, "sequence_order", parseInt(e.target.value) || 0)}
                                                className="w-12 h-7 px-1.5 rounded border border-muted bg-background text-foreground text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                                            />
                                        </div>
                                        {!isVersionLocked && (
                                            <Button
                                                id={`delete-route-btn-${r.route_id}`}
                                                aria-label={`Delete Route Step ${stepNum}`}
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => handleDeleteRoute(r.route_id)}
                                                className="h-7 w-7 text-destructive hover:bg-destructive/15 rounded-md cursor-pointer"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                </div>

                                {/* Step Form Fields - clean aligned grid */}
                                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-start">
                                    {/* Operation */}
                                    <div className="space-y-1.5">
                                        <label htmlFor={`route-op-select-${r.route_id}`} className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide flex items-center gap-1">
                                            <Settings className="h-3 w-3" /> Operation
                                        </label>
                                        <CreatableSelect
                                            options={operationOptions}
                                            value={r.operation_id ? String(r.operation_id) : ""}
                                            disabled={isVersionLocked}
                                            onValueChange={(val) => {
                                                handleUpdateRoute(r.route_id, "operation_id", val ? parseInt(val) : null);
                                            }}
                                            onCreateOption={(name) => handleCreateOperationType(name, r.route_id)}
                                            placeholder="Select Operation..."
                                            className="h-9 text-xs"
                                        />
                                    </div>

                                    {/* Work Center */}
                                    <div className="space-y-1.5">
                                        <label htmlFor={`route-wc-select-${r.route_id}`} className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide flex items-center gap-1">
                                            <Layers className="h-3 w-3" /> Work Station / Center
                                        </label>
                                        <CreatableSelect
                                            options={workCenterOptions}
                                            value={r.work_center_id ? String(r.work_center_id) : ""}
                                            disabled={isVersionLocked}
                                            onValueChange={(val) => {
                                                handleUpdateRoute(r.route_id, "work_center_id", val ? parseInt(val) : null);
                                                const selectedWorkCenter = workCenters.find(wc => wc.work_center_id === (val ? parseInt(val) : null));
                                                if (selectedWorkCenter && selectedWorkCenter.capacity_per_hour) {
                                                    handleUpdateRoute(r.route_id, "step_batch_size", selectedWorkCenter.capacity_per_hour);
                                                }
                                            }}
                                            placeholder="Select Work Center..."
                                            className={`h-9 text-xs ${!r.work_center_id ? "border-red-500 focus:ring-red-500" : ""}`}
                                        />
                                        {!r.work_center_id ? (
                                            <span className="text-[10px] font-semibold text-red-600 block leading-tight">
                                                Work Center required
                                            </span>
                                        ) : (() => {
                                            const selectedWorkCenter = workCenters.find(wc => wc.work_center_id === r.work_center_id);
                                            return selectedWorkCenter ? (
                                                <span className="text-[10px] text-muted-foreground block truncate leading-tight" title={`Machine rate: ₱${Number(selectedWorkCenter.overhead_cost_per_hour || 0).toFixed(2)}/hr | Cap: ${Number(selectedWorkCenter.capacity_per_hour || 1).toFixed(2)}/hr`}>
                                                    ₱{Number(selectedWorkCenter.overhead_cost_per_hour || 0).toFixed(2)}/hr • Cap: {Number(selectedWorkCenter.capacity_per_hour || 1).toFixed(2)}/hr
                                                </span>
                                            ) : null;
                                        })()}
                                    </div>

                                    {/* Setup Time */}
                                    <div className="space-y-1.5">
                                        <label htmlFor={`setup-time-h-${r.route_id}`} className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide flex items-center gap-1">
                                            <Clock className="h-3 w-3" /> Setup Time (hh&quot;mm&quot;ss)
                                        </label>
                                        <div className="flex items-center gap-1 bg-slate-950/20 px-2 h-9 rounded-lg border border-muted focus-within:ring-1 focus-within:ring-primary focus-within:bg-background w-full">
                                            {/* Hours */}
                                            <input
                                                id={`setup-time-h-${r.route_id}`}
                                                aria-label={`Setup time hours for step ${stepNum}`}
                                                type="number"
                                                min="0"
                                                disabled={isVersionLocked}
                                                value={Math.floor(Math.round((r.setup_time_hours || 0) * 3600) / 3600) || ""}
                                                onChange={(e) => {
                                                    const h = parseInt(e.target.value) || 0;
                                                    const totalS = Math.round((r.setup_time_hours || 0) * 3600);
                                                    const currentMins = Math.floor((totalS % 3600) / 60);
                                                    const currentSecs = totalS % 60;
                                                    handleUpdateRoute(r.route_id, "setup_time_hours", h + (currentMins / 60) + (currentSecs / 3600));
                                                }}
                                                className="w-10 bg-transparent border-0 outline-hidden p-0 text-xs text-right text-foreground focus:ring-0 placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
                                                placeholder="0"
                                            />
                                            <span className="text-muted-foreground/30 font-bold select-none">&quot;</span>
                                            {/* Minutes */}
                                            <input
                                                id={`setup-time-m-${r.route_id}`}
                                                aria-label={`Setup time minutes for step ${stepNum}`}
                                                type="number"
                                                min="0"
                                                max="59"
                                                disabled={isVersionLocked}
                                                value={Math.floor((Math.round((r.setup_time_hours || 0) * 3600) % 3600) / 60) || ""}
                                                onChange={(e) => {
                                                    const m = Math.min(59, Math.max(0, parseInt(e.target.value) || 0));
                                                    const totalS = Math.round((r.setup_time_hours || 0) * 3600);
                                                    const currentHrs = Math.floor(totalS / 3600);
                                                    const currentSecs = totalS % 60;
                                                    handleUpdateRoute(r.route_id, "setup_time_hours", currentHrs + (m / 60) + (currentSecs / 3600));
                                                }}
                                                className="w-6 bg-transparent border-0 outline-hidden p-0 text-xs text-center text-foreground focus:ring-0 placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
                                                placeholder="00"
                                            />
                                            <span className="text-muted-foreground/30 font-bold select-none">&quot;</span>
                                            {/* Seconds */}
                                            <input
                                                id={`setup-time-s-${r.route_id}`}
                                                aria-label={`Setup time seconds for step ${stepNum}`}
                                                type="number"
                                                min="0"
                                                max="59"
                                                disabled={isVersionLocked}
                                                value={Math.round((r.setup_time_hours || 0) * 3600) % 60 || ""}
                                                onChange={(e) => {
                                                    const s = Math.min(59, Math.max(0, parseInt(e.target.value) || 0));
                                                    const totalS = Math.round((r.setup_time_hours || 0) * 3600);
                                                    const currentHrs = Math.floor(totalS / 3600);
                                                    const currentMins = Math.floor((totalS % 3600) / 60);
                                                    handleUpdateRoute(r.route_id, "setup_time_hours", currentHrs + (currentMins / 60) + (s / 3600));
                                                }}
                                                className="w-6 bg-transparent border-0 outline-hidden p-0 text-xs text-left text-foreground focus:ring-0 placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
                                                placeholder="00"
                                            />
                                        </div>
                                    </div>

                                    {/* Run Time */}
                                    <div className="space-y-1.5">
                                        <label htmlFor={`run-time-h-${r.route_id}`} className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide flex items-center gap-1">
                                            <Clock className="h-3 w-3" /> Run Time (hh&quot;mm&quot;ss)
                                        </label>
                                        <div className="flex items-center gap-1 bg-slate-950/20 px-2 h-9 rounded-lg border border-muted focus-within:ring-1 focus-within:ring-primary focus-within:bg-background w-full">
                                            {/* Hours */}
                                            <input
                                                id={`run-time-h-${r.route_id}`}
                                                aria-label={`Run time hours for step ${stepNum}`}
                                                type="number"
                                                min="0"
                                                disabled={isVersionLocked}
                                                value={Math.floor(Math.round((r.run_time_hours || 0) * 3600) / 3600) || ""}
                                                onChange={(e) => {
                                                    const h = parseInt(e.target.value) || 0;
                                                    const totalS = Math.round((r.run_time_hours || 0) * 3600);
                                                    const currentMins = Math.floor((totalS % 3600) / 60);
                                                    const currentSecs = totalS % 60;
                                                    handleUpdateRoute(r.route_id, "run_time_hours", h + (currentMins / 60) + (currentSecs / 3600));
                                                }}
                                                className="w-10 bg-transparent border-0 outline-hidden p-0 text-xs text-right text-foreground focus:ring-0 placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
                                                placeholder="0"
                                            />
                                            <span className="text-muted-foreground/30 font-bold select-none">&quot;</span>
                                            {/* Minutes */}
                                            <input
                                                id={`run-time-m-${r.route_id}`}
                                                aria-label={`Run time minutes for step ${stepNum}`}
                                                type="number"
                                                min="0"
                                                max="59"
                                                disabled={isVersionLocked}
                                                value={Math.floor((Math.round((r.run_time_hours || 0) * 3600) % 3600) / 60) || ""}
                                                onChange={(e) => {
                                                    const m = Math.min(59, Math.max(0, parseInt(e.target.value) || 0));
                                                    const totalS = Math.round((r.run_time_hours || 0) * 3600);
                                                    const currentHrs = Math.floor(totalS / 3600);
                                                    const currentSecs = totalS % 60;
                                                    handleUpdateRoute(r.route_id, "run_time_hours", currentHrs + (m / 60) + (currentSecs / 3600));
                                                }}
                                                className="w-6 bg-transparent border-0 outline-hidden p-0 text-xs text-center text-foreground focus:ring-0 placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
                                                placeholder="00"
                                            />
                                            <span className="text-muted-foreground/30 font-bold select-none">&quot;</span>
                                            {/* Seconds */}
                                            <input
                                                id={`run-time-s-${r.route_id}`}
                                                aria-label={`Run time seconds for step ${stepNum}`}
                                                type="number"
                                                min="0"
                                                max="59"
                                                disabled={isVersionLocked}
                                                value={Math.round((r.run_time_hours || 0) * 3600) % 60 || ""}
                                                onChange={(e) => {
                                                    const s = Math.min(59, Math.max(0, parseInt(e.target.value) || 0));
                                                    const totalS = Math.round((r.run_time_hours || 0) * 3600);
                                                    const currentHrs = Math.floor(totalS / 3600);
                                                    const currentMins = Math.floor((totalS % 3600) / 60);
                                                    handleUpdateRoute(r.route_id, "run_time_hours", currentHrs + (currentMins / 60) + (s / 3600));
                                                }}
                                                className="w-6 bg-transparent border-0 outline-hidden p-0 text-xs text-left text-foreground focus:ring-0 placeholder:text-muted-foreground/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none disabled:opacity-50"
                                                placeholder="00"
                                            />
                                        </div>
                                    </div>

                                    {/* Step Batch Size */}
                                    <div className="space-y-1.5">
                                        <label htmlFor={`step-batch-size-${r.route_id}`} className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide flex items-center gap-1">
                                            <Layers className="h-3 w-3" /> Step Batch Size
                                        </label>
                                        <input
                                            id={`step-batch-size-${r.route_id}`}
                                            aria-label={`Step batch size for step ${stepNum}`}
                                            type="number"
                                            disabled={isVersionLocked}
                                            value={r.step_batch_size ?? 1}
                                            onChange={(e) => handleUpdateRoute(r.route_id, "step_batch_size", parseFloat(e.target.value) || 1)}
                                            className="w-full h-9 px-2.5 rounded-lg border border-muted bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:bg-muted/30"
                                        />
                                    </div>

                                    {/* QA Template */}
                                    <div className="space-y-1.5">
                                        <label htmlFor={`qa-template-select-${r.route_id}`} className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide flex items-center gap-1">
                                            <Shield className="h-3 w-3" /> QA Template (Checklist)
                                        </label>
                                        <select
                                            id={`qa-template-select-${r.route_id}`}
                                            aria-label={`QA Template for step ${stepNum}`}
                                            disabled={isVersionLocked}
                                            value={r.qa_template_id || ""}
                                            onChange={(e) => handleUpdateRoute(r.route_id, "qa_template_id", e.target.value ? parseInt(e.target.value) : null)}
                                            className="w-full h-9 px-2.5 rounded-lg border border-muted bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:bg-muted/30"
                                        >
                                            <option value="">No QA checklist required</option>
                                            {qaTemplates.map(qa => (
                                                <option key={qa.template_id} value={qa.template_id}>{qa.template_name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Nested BOM Ingredients Table */}
                                <div className="border-t border-muted/50 p-4 bg-muted/5">
                                    <div className="flex justify-between items-center mb-3">
                                        <h5 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">BOM Ingredients Required in Step #{stepNum}</h5>
                                    </div>

                                    {(r.bom_items || []).length === 0 ? (
                                        <div className="text-center py-6 border border-dashed rounded-lg border-muted bg-card">
                                            <p className="text-xs text-muted-foreground">No ingredients linked to this routing step yet.</p>
                                            {!isVersionLocked && (
                                                <Button
                                                    id={`add-ingredient-empty-btn-${r.route_id}`}
                                                    aria-label={`Add First Ingredient for step ${stepNum}`}
                                                    onClick={() => handleAddIngredient(r.route_id)}
                                                    variant="outline"
                                                    size="sm"
                                                    className="mt-2 h-7 text-[10px] cursor-pointer"
                                                >
                                                    <Plus className="h-3 w-3 mr-1" /> Add First Ingredient
                                                </Button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto rounded-lg border border-muted/60 bg-card">
                                            <table className="min-w-[1080px] w-full border-collapse text-left text-xs">
                                                <thead>
                                                    <tr className="bg-muted/10 border-b border-muted/60 text-muted-foreground font-bold">
                                                        <th className="p-2.5 w-[17%] min-w-[175px] whitespace-nowrap">Material Type</th>
                                                        <th className="p-2.5 w-[30%]">Material</th>
                                                        <th className="p-2.5 w-[15%]">Qty Required</th>
                                                        <th className="p-2.5 w-[15%]">UOM</th>
                                                        <th className="p-2.5 w-[12%]">Wastage %</th>
                                                        <th className="p-2.5 w-[12%]">Landed Cost</th>
                                                        <th className="p-2.5 w-[12%]">Ingredient Cost (pre-yield)</th>
                                                        {!isVersionLocked && <th className="p-2.5 w-[6%] text-center">Action</th>}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {(r.bom_items || []).map((b) => {
                                                        const compCost = calculateMaterialCost({
                                                             quantity: b.quantity_required,
                                                             unitCost: b.cost_per_unit || 0,
                                                             wastagePercent: b.wastage_factor_percentage
                                                         });
                                                        const selectedMaterialType = b.material_type || materialTypeFromProduct(b.product_type, b.has_versions);
                                                        return (
                                                            <tr key={b.id} className="border-b border-muted/50 hover:bg-muted/5">
                                                                <td className="p-1.5 align-middle min-w-[175px]">
                                                                    <MaterialTypeSelect
                                                                        value={selectedMaterialType || ""}
                                                                        disabled={isVersionLocked}
                                                                        onChange={(val) => handleChangeMaterialType(
                                                                            r.route_id,
                                                                            b.id,
                                                                            val as MaterialType | ""
                                                                        )}
                                                                    />
                                                                </td>
                                                                <td className="p-1.5 align-middle">
                                                                    <BOMMaterialSelect
                                                                        value={b.product_id || undefined}
                                                                        productName={b.product_name}
                                                                        productCode={b.product_code}
                                                                        type={selectedMaterialType}
                                                                        disabled={isVersionLocked || !selectedMaterialType}
                                                                        placeholder={selectedMaterialType ? "Choose Material..." : "Select material type first"}
                                                                        onSelectProduct={(prod) => handleSelectProduct(r.route_id, b.id, prod, selectedMaterialType)}
                                                                    />
                                                                </td>
                                                                <td className="p-1.5 align-middle">
                                                                    <input
                                                                        id={`bom-qty-${b.id}`}
                                                                        aria-label="Quantity Required"
                                                                        type="number"
                                                                        step="0.0001"
                                                                        disabled={isVersionLocked}
                                                                        value={b.quantity_required}
                                                                        onChange={(e) => handleUpdateIngredient(r.route_id, b.id, "quantity_required", parseFloat(e.target.value) || 0)}
                                                                        className="w-full h-8 px-2 border border-muted bg-background text-foreground text-xs rounded focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:bg-muted/30"
                                                                    />
                                                                </td>
                                                                <td className="p-1.5 align-middle">
                                                                    {(() => {
                                                                        const isMaterialSelected = Boolean(b.product_id && Number(b.product_id) > 0);
                                                                        const matched = units.find(u => Number(u.unit_id) === Number(b.unit_of_measurement) || u.unit_shortcut === b.unit_of_measurement);
                                                                        const selectValue = matched ? matched.unit_shortcut : String(b.unit_of_measurement || "");
                                                                        const categoryOptions = getProductFamilyUOMOptions(b.product_id, selectValue, catalogProducts || [], units);
                                                                        return (
                                                                            <CreatableSelect
                                                                                options={categoryOptions}
                                                                                value={selectValue}
                                                                                disabled={isVersionLocked || !isMaterialSelected}
                                                                                onValueChange={(val) => handleUpdateIngredient(r.route_id, b.id, "unit_of_measurement", val)}
                                                                                placeholder={isMaterialSelected ? "Select UOM..." : "Select material first"}
                                                                                className="h-8 py-0 px-2 text-xs"
                                                                            />
                                                                        );
                                                                    })()}
                                                                </td>
                                                                <td className="p-1.5 align-middle">
                                                                    <input
                                                                        id={`bom-wastage-${b.id}`}
                                                                        aria-label="Wastage Percentage"
                                                                        type="number"
                                                                        disabled={isVersionLocked}
                                                                        value={b.wastage_factor_percentage}
                                                                        onChange={(e) => handleUpdateIngredient(r.route_id, b.id, "wastage_factor_percentage", parseFloat(e.target.value) || 0)}
                                                                        className="w-full h-8 px-2 border border-muted bg-background text-foreground text-xs rounded focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:bg-muted/30"
                                                                    />
                                                                </td>
                                                                <td className="p-1.5 align-middle">
                                                                    <input
                                                                        id={`bom-landed-cost-${b.id}`}
                                                                        aria-label="Landed Cost"
                                                                        type="number"
                                                                        step="0.01"
                                                                        disabled={isVersionLocked}
                                                                        value={b.cost_per_unit || 0}
                                                                        onChange={(e) => handleUpdateIngredient(r.route_id, b.id, "cost_per_unit", parseFloat(e.target.value) || 0)}
                                                                        className="w-full h-8 px-2 border border-muted bg-background text-foreground text-xs rounded focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50 disabled:bg-muted/30"
                                                                    />
                                                                </td>
                                                                <td className="p-1.5 align-middle text-right font-medium pr-3 text-muted-foreground font-mono">
                                                                    ₱{compCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                </td>
                                                                {!isVersionLocked && (
                                                                    <td className="p-1.5 align-middle text-center">
                                                                        <Button
                                                                            id={`delete-ingredient-btn-${b.id}`}
                                                                            aria-label="Delete Ingredient"
                                                                            variant="ghost"
                                                                            size="icon"
                                                                            onClick={() => handleDeleteIngredient(r.route_id, b.id)}
                                                                            className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md cursor-pointer"
                                                                        >
                                                                            <Trash2 className="h-3.5 w-3.5" />
                                                                        </Button>
                                                                    </td>
                                                                )}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                            {!isVersionLocked && (
                                                <div className="p-2 border-t border-muted/50 bg-muted/5 flex justify-end">
                                                    <Button
                                                        id={`add-ingredient-bottom-btn-${r.route_id}`}
                                                        aria-label={`Add Ingredient for step ${stepNum}`}
                                                        onClick={() => handleAddIngredient(r.route_id)}
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 text-[11px] font-bold text-primary hover:bg-primary/10 rounded-md inline-flex items-center gap-1 cursor-pointer"
                                                    >
                                                        <Plus className="h-3.5 w-3.5" /> Add Ingredient
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
