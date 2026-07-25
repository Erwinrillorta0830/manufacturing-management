"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Plus, Search, Edit, DollarSign, Activity, Settings, Check, LayoutGrid, Image as ImageIcon, ChevronsLeft, ChevronsRight, RefreshCw, Info, Calendar, User, X, ChevronDown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { WorkCenter, AssetRecord, DepartmentRecord } from "@/modules/manufacturing-management/finished-goods/types";
import { 
    fetchWorkCenters, 
    createWorkCenter, 
    saveWorkCenter, 
    fetchAssets, 
    fetchDepartments 
} from "@/modules/manufacturing-management/finished-goods/services/finished-goods-api";
import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";

import { formatNumber, formatCurrency } from "@/lib/utils";

export default function WorkStationsModule() {
    const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
    const [assets, setAssets] = useState<AssetRecord[]>([]);
    const [departments, setDepartments] = useState<DepartmentRecord[]>([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [departmentFilter, setDepartmentFilter] = useState<string | number>("ALL");
    const [deptFilterSearch, setDeptFilterSearch] = useState("");
    const [isDeptFilterDropdownOpen, setIsDeptFilterDropdownOpen] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingWorkCenter, setEditingWorkCenter] = useState<WorkCenter | null>(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    const [viewingWorkCenter, setViewingWorkCenter] = useState<WorkCenter | null>(null);

    const handleOpenViewModal = (wc: WorkCenter) => {
        setViewingWorkCenter(wc);
        setIsViewModalOpen(true);
    };

    // Form inputs
    const [wcName, setWcName] = useState("");
    const [overheadCost, setOverheadCost] = useState("0");
    const [capacity, setCapacity] = useState("0");
    const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
    const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
    const [isActive, setIsActive] = useState(true);
    const [validationAttempted, setValidationAttempted] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [isTransitioning, setIsTransitioning] = useState(false);

    // Searchable dropdown state in modal
    const [assetSearch, setAssetSearch] = useState("");
    const [isAssetDropdownOpen, setIsAssetDropdownOpen] = useState(false);

    // Formats Asset label to display in UI (hiding raw database IDs)
    const getAssetLabel = (asset: AssetRecord): string => {
        const name = typeof asset.item_id === 'object' ? asset.item_id?.item_name || "" : "";
        const rfid = asset.rfid_code || "";
        const condition = asset.condition || "";

        let label = name;
        if (!label) {
            label = rfid || asset.barcode || "Equipment Asset";
        } else if (rfid) {
            label = `${label} (RFID: ${rfid})`;
        }
        if (condition) {
            label = `${label} - ${condition}`;
        }
        return label;
    };

    const formatTimestamp = (dateStr?: string | null) => {
        if (!dateStr) return "N/A";
        try {
            const date = new Date(dateStr);
            return date.toLocaleString("en-PH", {
                timeZone: "Asia/Manila",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true
            });
        } catch {
            return dateStr;
        }
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const [wcList, assetList, deptList] = await Promise.all([
                fetchWorkCenters(),
                fetchAssets().catch(() => []),
                fetchDepartments().catch(() => [])
            ]);
            setWorkCenters(wcList);
            setAssets(assetList);
            setDepartments(deptList);
        } catch (e) {
            console.error("Failed to load work stations data:", e);
            toast.error("Failed to load work stations data");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // Filtered departments for top department filter search
    const filteredDeptOptions = useMemo(() => {
        if (!deptFilterSearch.trim()) return departments;
        const query = deptFilterSearch.toLowerCase();
        return departments.filter(d => (d.department_name || "").toLowerCase().includes(query));
    }, [departments, deptFilterSearch]);

    // Filtered Work Centers list
    const filteredWorkCenters = useMemo(() => {
        const departmentsById = new Map(
            departments.map(department => [Number(department.department_id), department])
        );
        const filtered = workCenters.filter(wc => {
            const query = searchQuery.toLowerCase().trim();
            const matchesQuery = !query || 
                wc.work_center_name.toLowerCase().includes(query) ||
                (typeof wc.asset?.item_id === 'object' ? wc.asset?.item_id?.item_name || "" : "").toLowerCase().includes(query) ||
                (wc.asset?.rfid_code || "").toLowerCase().includes(query) ||
                (wc.asset?.barcode || "").toLowerCase().includes(query) ||
                (wc.department || departmentsById.get(Number(wc.department_id)))?.department_name?.toLowerCase().includes(query);

            const matchesStatus = statusFilter === "ALL" || 
                (statusFilter === "ACTIVE" ? Boolean(wc.is_active) : !Boolean(wc.is_active));

            const matchesDept = departmentFilter === "ALL" || 
                Number(wc.department_id) === Number(departmentFilter);

            return matchesQuery && matchesStatus && matchesDept;
        });

        // Priority the newly created data to show first (newest ID first)
        return [...filtered].sort((a, b) => b.work_center_id - a.work_center_id);
    }, [departments, workCenters, searchQuery, statusFilter, departmentFilter]);

    // Reset page to 1 when search query, filter result length, or page size changes
    useEffect(() => {
        setCurrentPage(1);
    }, [filteredWorkCenters.length, pageSize]);

    const totalPages = Math.ceil(filteredWorkCenters.length / pageSize);
    const startIndex = (currentPage - 1) * pageSize;
    const paginatedWorkCenters = useMemo(() => {
        return filteredWorkCenters.slice(startIndex, startIndex + pageSize);
    }, [filteredWorkCenters, startIndex, pageSize]);

    const handleOpenCreateModal = () => {
        setEditingWorkCenter(null);
        setWcName("");
        setOverheadCost("0");
        setCapacity("0");
        setSelectedAssetId(null);
        setSelectedDeptId(null);
        setIsActive(true);
        setAssetSearch("");
        setValidationAttempted(false);
        setIsModalOpen(true);
    };

    const handleCloseAssetDropdown = () => {
        setIsAssetDropdownOpen(false);
        const matchedAsset = assets.find(a => a.id === selectedAssetId);
        setAssetSearch(matchedAsset ? getAssetLabel(matchedAsset) : "");
    };

    const handleOpenEditModal = (wc: WorkCenter, isFromView = false) => {
        setEditingWorkCenter(wc);
        setWcName(wc.work_center_name);
        setOverheadCost(wc.overhead_cost_per_hour != null ? String(Number(wc.overhead_cost_per_hour)) : "0");
        setCapacity(wc.capacity_per_hour != null ? String(Math.round(Number(wc.capacity_per_hour))) : "0");
        setSelectedAssetId(wc.asset_id || null);
        setSelectedDeptId(wc.department_id || null);
        setIsActive(Boolean(wc.is_active));

        // Prepopulate searches (without prepending raw ID)
        const matchedAsset = assets.find(a => a.id === wc.asset_id);
        setAssetSearch(matchedAsset ? getAssetLabel(matchedAsset) : "");

        setValidationAttempted(false);
        setIsTransitioning(isFromView);
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setValidationAttempted(true);
        const trimmedName = wcName.trim();
        if (!trimmedName) {
            toast.error("Work station name is required.");
            return;
        }

        const capacityTrimmed = capacity.trim();
        const capacityNum = Number(capacityTrimmed);
        if (!capacityTrimmed || isNaN(capacityNum) || !Number.isInteger(capacityNum) || capacityNum <= 0) {
            toast.error("Capacity per hour is required and must be a whole number greater than zero.");
            return;
        }

        if (!selectedAssetId) {
            toast.error("Asset Equipment Association is required.");
            return;
        }

        const selectedAsset = assets.find(a => a.id === selectedAssetId);
        if (selectedAsset && selectedAsset.is_active === false && selectedAssetId !== editingWorkCenter?.asset_id) {
            toast.error("The selected Asset / Equipment is inactive and cannot be assigned to a work station.");
            return;
        }

        if (!selectedDeptId) {
            toast.error("Owner Department is required.");
            return;
        }

        const costNum = Number(overheadCost);
        if (isNaN(costNum) || costNum < 0) {
            toast.error("Overhead cost per hour must be a number greater than or equal to zero.");
            return;
        }

        const costStr = String(overheadCost);
        const decimalPart = costStr.split(".")[1];
        if (decimalPart && decimalPart.length > 3) {
            toast.error("Overhead cost per hour cannot have more than 3 decimal places.");
            return;
        }

        const isDuplicate = workCenters.some(wc => 
            wc.work_center_name?.trim().toLowerCase() === trimmedName.toLowerCase() &&
            wc.work_center_id !== editingWorkCenter?.work_center_id
        );

        if (isDuplicate) {
            toast.error("Work station name already exists. Please choose a unique name.");
            return;
        }

        setSaving(true);
        try {
            const payload = {
                work_center_name: trimmedName,
                asset_id: selectedAssetId,
                department_id: selectedDeptId,
                overhead_cost_per_hour: parseFloat(overheadCost) || 0,
                capacity_per_hour: parseInt(capacity, 10) || 0,
                is_active: isActive
            };

            let success = false;
            if (editingWorkCenter) {
                const res = await saveWorkCenter(editingWorkCenter.work_center_id, payload);
                success = res.success;
            } else {
                const res = await createWorkCenter(payload);
                success = res.success;
            }

            if (success) {
                toast.success(editingWorkCenter ? "Work station updated successfully!" : "Work station created successfully!");
                setIsModalOpen(false);
                await loadData();
            }
        } catch (e) {
            console.error("Failed to save work station:", e);
            const error = e instanceof Error ? e : new Error(String(e));
            toast.error(error.message || "Failed to save work station");
        } finally {
            setSaving(false);
        }
    };

    // Auto-filter asset matches (excluding inactive assets)
    const filteredAssets = useMemo(() => {
        const selectableAssets = assets.filter(a => {
            const isActive = a.is_active !== false;
            const isCurrentlyAssigned = selectedAssetId !== null && a.id === selectedAssetId;
            return isActive || isCurrentlyAssigned;
        });

        if (!assetSearch.trim()) return selectableAssets;
        const search = assetSearch.toLowerCase();
        return selectableAssets.filter(a => {
            const assetName = typeof a.item_id === 'object' ? a.item_id?.item_name || "" : "";
            return assetName.toLowerCase().includes(search) ||
                (a.rfid_code || "").toLowerCase().includes(search) ||
                (a.barcode || "").toLowerCase().includes(search);
        });
    }, [assets, assetSearch, selectedAssetId]);



    return (
        <div className="flex flex-col gap-6 w-full">
            {/* Header section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                        <Settings className="h-5 w-5 text-primary" /> Work Stations &amp; Centers Master
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1 font-medium">Configure manufacturing lines, machinery associations, and standard capacity per hour.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button 
                        variant="outline"
                        size="icon"
                        onClick={loadData}
                        disabled={loading}
                        className="h-9 w-9 border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                        title="Refresh Work Stations"
                    >
                        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    </Button>
                    <Button 
                        onClick={handleOpenCreateModal}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2.5 rounded-lg shadow-md shadow-primary/20"
                    >
                        <Plus className="h-4 w-4" /> Add Work Station
                    </Button>
                </div>
            </div>

            {/* Filter and search block */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 bg-muted/10 p-3 rounded-lg border border-border/50">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground opacity-70" />
                    <input
                        type="text"
                        placeholder="Search by work station name, asset, or department..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-9 pl-10 pr-3 rounded-lg border border-muted bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                </div>

                {/* Status Filter */}
                <div className="w-full md:w-[150px] shrink-0">
                    <Select
                        value={statusFilter}
                        onValueChange={(val) => setStatusFilter(val)}
                    >
                        <SelectTrigger className="w-full h-9 bg-background border border-border text-foreground text-xs">
                            <SelectValue placeholder="All Statuses" />
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={4} className="bg-popover border border-border text-foreground text-xs">
                            <SelectItem value="ALL">All Statuses</SelectItem>
                            <SelectItem value="ACTIVE">Active</SelectItem>
                            <SelectItem value="INACTIVE">Inactive</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Searchable Department Filter */}
                <div className="relative w-full md:w-[200px] shrink-0">
                    <button
                        type="button"
                        onClick={() => setIsDeptFilterDropdownOpen(prev => !prev)}
                        className="w-full h-9 px-3 rounded-lg border border-border bg-background text-foreground text-xs flex items-center justify-between font-normal"
                    >
                        <span className="truncate">
                            {departmentFilter === "ALL"
                                ? "All Departments"
                                : departments.find(d => Number(d.department_id) === Number(departmentFilter))?.department_name || "All Departments"}
                        </span>
                        <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0 ml-1" />
                    </button>

                    {isDeptFilterDropdownOpen && (
                        <>
                            <div className="fixed inset-0 z-20" onClick={() => setIsDeptFilterDropdownOpen(false)} />
                            <div className="absolute right-0 mt-1 w-56 max-h-56 overflow-hidden rounded-lg bg-popover border border-border shadow-xl py-1.5 z-30 flex flex-col text-xs">
                                <div className="px-2 pb-1.5 border-b border-border/50">
                                    <input
                                        type="text"
                                        placeholder="Search department..."
                                        value={deptFilterSearch}
                                        onChange={(e) => setDeptFilterSearch(e.target.value)}
                                        className="w-full h-7 px-2 rounded bg-muted/20 border border-border text-foreground text-[11px] outline-none focus:ring-1 focus:ring-primary"
                                        autoFocus
                                    />
                                </div>
                                <div className="flex-1 overflow-y-auto max-h-40 py-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDepartmentFilter("ALL");
                                            setIsDeptFilterDropdownOpen(false);
                                        }}
                                        className={`w-full text-left px-3 py-1.5 hover:bg-muted text-foreground flex items-center justify-between ${departmentFilter === "ALL" ? "font-semibold text-primary" : ""}`}
                                    >
                                        <span>All Departments</span>
                                        {departmentFilter === "ALL" && <Check className="h-3.5 w-3.5 text-primary" />}
                                    </button>
                                    {filteredDeptOptions.length === 0 ? (
                                        <div className="px-3 py-2 text-muted-foreground italic text-[11px]">No departments found</div>
                                    ) : (
                                        filteredDeptOptions.map(dept => (
                                            <button
                                                key={dept.department_id}
                                                type="button"
                                                onClick={() => {
                                                    setDepartmentFilter(dept.department_id);
                                                    setIsDeptFilterDropdownOpen(false);
                                                }}
                                                className={`w-full text-left px-3 py-1.5 hover:bg-muted text-foreground flex items-center justify-between ${Number(departmentFilter) === Number(dept.department_id) ? "font-semibold text-primary" : ""}`}
                                            >
                                                <span className="truncate">{dept.department_name}</span>
                                                {Number(departmentFilter) === Number(dept.department_id) && <Check className="h-3.5 w-3.5 text-primary" />}
                                            </button>
                                        ))
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Main Table view */}
            <div className="overflow-x-auto rounded-xl border border-muted/50 bg-card text-card-foreground shadow-sm">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-20 gap-3 text-muted-foreground">
                        <div className="h-6 w-6 animate-spin border-2 border-primary border-t-transparent rounded-full" />
                        <span className="text-xs font-medium">Loading Work Stations data...</span>
                    </div>
                ) : filteredWorkCenters.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 text-center text-muted-foreground">
                        <LayoutGrid className="h-12 w-12 text-muted/30 mb-2" />
                        <span className="text-sm font-semibold">No Work Stations found</span>
                        <p className="text-xs max-w-xs mt-1">Click the &quot;Add Work Station&quot; button to register a workstation in the system.</p>
                    </div>
                ) : (
                    <table className="w-full border-collapse text-left text-xs">
                        <thead>
                            <tr className="bg-muted/10 border-b border-muted/50 text-muted-foreground font-bold uppercase tracking-wider text-[10px]">
                                <th className="p-4 pl-6">Work Station Name</th>
                                <th className="p-4">
                                    <DollarSign className="h-3.5 w-3.5 inline mr-0.5" /> Overhead Cost / Hour
                                </th>
                                <th className="p-4">
                                    <Activity className="h-3.5 w-3.5 inline mr-0.5" /> Capacity / Hour
                                </th>
                                <th className="p-4">Associated Asset</th>
                                <th className="p-4">Department</th>
                                <th className="p-4">Availability Status</th>
                                <th className="p-4 text-center w-[12%]">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedWorkCenters.map(wc => (
                                <tr 
                                    key={wc.work_center_id} 
                                    onClick={() => handleOpenViewModal(wc)}
                                    className="border-b border-muted/40 hover:bg-muted/25 dark:hover:bg-muted/15 active:bg-muted/30 transition-colors cursor-pointer"
                                >
                                    <td className="p-4 pl-6 align-middle font-semibold text-foreground text-sm">
                                        {wc.work_center_name}
                                    </td>
                                    <td className="p-4 align-middle text-muted-foreground font-medium">
                                        {new Intl.NumberFormat("en-PH", {
                                            style: "currency",
                                            currency: "PHP",
                                            minimumFractionDigits: 3,
                                            maximumFractionDigits: 3
                                        }).format(Number(wc.overhead_cost_per_hour) || 0)}
                                    </td>
                                    <td className="p-4 align-middle text-muted-foreground font-medium">
                                        {formatNumber(Number(wc.capacity_per_hour) || 0, "en-PH", 0)} units
                                    </td>
                                    <td className="p-4 align-middle text-muted-foreground">
                                        {(() => {
                                            const linkedAsset = wc.asset || assets.find(a => a.id === wc.asset_id);
                                            if (!linkedAsset) {
                                                return <span className="text-muted-foreground/50 italic">None linked</span>;
                                            }
                                            const matchedCatalogAsset = assets.find(a => a.id === wc.asset_id || a.id === linkedAsset.id);
                                            const assetName = typeof linkedAsset.item_id === 'object' 
                                                ? linkedAsset.item_id?.item_name || "" 
                                                : (typeof matchedCatalogAsset?.item_id === 'object' ? matchedCatalogAsset?.item_id?.item_name || "" : "");
                                            const rfidCode = linkedAsset.rfid_code || matchedCatalogAsset?.rfid_code || "";
                                            const barcodeCode = linkedAsset.barcode || matchedCatalogAsset?.barcode || "";
                                            const condition = linkedAsset.condition || matchedCatalogAsset?.condition || "Good";
                                            const itemImage = linkedAsset.item_image || matchedCatalogAsset?.item_image || null;

                                            const isAssetInactive = (matchedCatalogAsset?.is_active === false || linkedAsset?.is_active === false);

                                            return (
                                                <div className="flex items-center gap-3">
                                                    {itemImage ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img 
                                                            src={itemImage} 
                                                            alt={assetName || "Asset"} 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setPreviewImage(itemImage);
                                                            }}
                                                            className="w-10 h-10 object-cover rounded border border-border shrink-0 cursor-zoom-in hover:scale-105 transition-transform"
                                                        />
                                                    ) : (
                                                        <div className="w-10 h-10 bg-muted/20 border border-dashed rounded flex items-center justify-center text-muted-foreground/30 shrink-0">
                                                            <ImageIcon className="h-4.5 w-4.5" />
                                                        </div>
                                                    )}
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-foreground">
                                                            {assetName || rfidCode || barcodeCode || "Asset"}
                                                        </span>
                                                        {assetName && rfidCode && (
                                                            <span className="text-[10px] text-muted-foreground">RFID: {rfidCode}</span>
                                                        )}
                                                        <span className="text-[10px] text-muted-foreground">Cond: {condition}</span>
                                                        {isAssetInactive && (
                                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded mt-0.5 w-fit">
                                                                <AlertTriangle className="h-3 w-3 shrink-0" />
                                                                Asset Inactive
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td className="p-4 align-middle text-muted-foreground">
                                        {(() => {
                                            const dept = departments.find(d => d.department_id === wc.department_id) || wc.department;
                                            return dept ? (
                                                <span className="bg-primary/5 text-primary border border-primary/10 px-2 py-0.5 rounded font-medium">
                                                    {dept.department_name}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground/50 italic">None mapped</span>
                                            );
                                        })()}
                                    </td>
                                    <td className="p-4 align-middle">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                                            Boolean(wc.is_active) 
                                                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" 
                                                : "bg-destructive/10 text-destructive border border-destructive/20"
                                        }`}>
                                            {Boolean(wc.is_active) ? "Active" : "Inactive"}
                                        </span>
                                    </td>
                                    <td className="p-4 align-middle text-center" onClick={e => e.stopPropagation()}>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleOpenEditModal(wc)}
                                            className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-md"
                                            title="Edit Details"
                                        >
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Pagination Controls */}
            {!loading && filteredWorkCenters.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2 text-sm text-muted-foreground px-1">
                    <div className="flex items-center gap-2">
                        <span>Rows per page</span>
                        <Select
                            value={String(pageSize)}
                            onValueChange={(val) => {
                                setPageSize(Number(val));
                            }}
                        >
                            <SelectTrigger className="w-[70px] h-8 bg-background border border-border text-foreground">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent position="popper" sideOffset={4} className="bg-popover border border-border text-foreground">
                                {[10, 20, 30, 40, 50].map((size) => (
                                    <SelectItem key={size} value={String(size)}>
                                        {size}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span className="ml-2 font-medium">
                            Showing {filteredWorkCenters.length > 0 ? startIndex + 1 : 0}-
                            {Math.min(startIndex + pageSize, filteredWorkCenters.length)} of{" "}
                            {filteredWorkCenters.length} items
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(1)}
                            disabled={currentPage === 1}
                            className="h-8 w-8 p-0"
                        >
                            <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="h-8 px-3 text-foreground"
                        >
                            Previous
                        </Button>
                        
                        <div className="flex items-center gap-1 px-2 font-semibold text-xs">
                            <span>Page</span>
                            <span className="text-foreground">{currentPage}</span>
                            <span>of</span>
                            <span>{totalPages || 1}</span>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="h-8 px-3 text-foreground"
                        >
                            Next
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setCurrentPage(totalPages)}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className="h-8 w-8 p-0"
                        >
                            <ChevronsRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Custom Create / Edit Modal popup */}
            {isModalOpen && (
                <div className={`fixed inset-0 flex items-center justify-center ${isViewModalOpen ? "z-[52]" : "z-50"} bg-black/80 backdrop-blur-md ${isTransitioning ? "" : "animate-in fade-in duration-100"}`}>
                    <div className="bg-card border border-border/85 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-muted/20">
                            <div className="flex items-center gap-2">
                                <Settings className="h-5 w-5 text-primary animate-spin" style={{ animationDuration: "10s" }} />
                                <div>
                                    <h3 className="text-base font-bold text-foreground">
                                        {editingWorkCenter ? "Edit Work Station" : "Register Work Station"}
                                    </h3>
                                    <p className="text-xs text-muted-foreground">Specify machinery, line costs, capacity, and owner department.</p>
                                </div>
                            </div>
                        </div>

                        {/* Modal Form Body */}
                        <form onSubmit={handleSave} noValidate className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
                            {/* Work Center Name */}
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Work Station Name <span className="text-destructive">*</span></label>
                                <input
                                    type="text"
                                    placeholder="e.g. Mixing Vat Station #3"
                                    value={wcName}
                                    onChange={e => setWcName(e.target.value)}
                                    className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 transition-all ${validationAttempted && !wcName.trim() ? "border-destructive focus:ring-destructive focus:ring-1" : "border-border focus:ring-primary"}`}
                                />
                            </div>

                            {/* Cost and Capacity */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Overhead Cost / Hour (₱)</label>
                                    <input
                                        type="number"
                                        step="0.001"
                                        min="0"
                                        value={overheadCost}
                                        onChange={e => {
                                            const val = e.target.value;
                                            if (val === "" || /^\d*(\.\d{0,3})?$/.test(val)) {
                                                setOverheadCost(val);
                                            }
                                        }}
                                        onKeyDown={(e) => {
                                            if (["-", "e", "E", "+"].includes(e.key)) {
                                                e.preventDefault();
                                            }
                                        }}
                                        onPaste={(e) => {
                                            const pasted = e.clipboardData.getData("text");
                                            if (/[^0-9.]/.test(pasted)) {
                                                e.preventDefault();
                                                return;
                                            }
                                            const parts = pasted.split(".");
                                            if (parts.length > 1 && parts[1].length > 3) {
                                                e.preventDefault();
                                            }
                                        }}
                                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary transition-all"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Capacity / Hour (Units) <span className="text-destructive">*</span></label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={capacity}
                                        onChange={e => setCapacity(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (["-", "e", "E", "+", "."].includes(e.key)) {
                                                e.preventDefault();
                                            }
                                        }}
                                        onPaste={(e) => {
                                            const pasted = e.clipboardData.getData("text");
                                            if (/[^0-9]/.test(pasted)) {
                                                e.preventDefault();
                                            }
                                        }}
                                        className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 transition-all ${validationAttempted && (!capacity.trim() || isNaN(Number(capacity)) || Number(capacity) <= 0) ? "border-destructive focus:ring-destructive focus:ring-1" : "border-border focus:ring-primary"}`}
                                    />
                                </div>
                            </div>

                            {/* Searchable dropdown: Asset / Equipment */}
                            <div className="space-y-1 relative">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Asset Equipment Association <span className="text-destructive">*</span></label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Search asset or equipment RFID..."
                                        value={assetSearch}
                                        onChange={e => {
                                            setAssetSearch(e.target.value);
                                            setIsAssetDropdownOpen(true);
                                        }}
                                        onFocus={() => setIsAssetDropdownOpen(true)}
                                        onKeyDown={e => {
                                            if (e.key === "Enter") {
                                                e.preventDefault();
                                                if (filteredAssets.length > 0) {
                                                    const firstAsset = filteredAssets[0];
                                                    setSelectedAssetId(firstAsset.id);
                                                    setAssetSearch(getAssetLabel(firstAsset));
                                                    setIsAssetDropdownOpen(false);
                                                } else {
                                                    const matchedAsset = assets.find(a => a.id === selectedAssetId);
                                                    setAssetSearch(matchedAsset ? getAssetLabel(matchedAsset) : "");
                                                    setIsAssetDropdownOpen(false);
                                                }
                                            } else if (e.key === "Tab" || e.key === "Escape") {
                                                const matchedAsset = assets.find(a => a.id === selectedAssetId);
                                                setAssetSearch(matchedAsset ? getAssetLabel(matchedAsset) : "");
                                                setIsAssetDropdownOpen(false);
                                            }
                                        }}
                                        className={`w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-1 transition-all ${validationAttempted && !selectedAssetId ? "border-destructive focus:ring-destructive focus:ring-1" : "border-border focus:ring-primary"}`}
                                    />
                                    {selectedAssetId && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSelectedAssetId(null);
                                                setAssetSearch("");
                                            }}
                                            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground font-bold"
                                        >
                                            &times;
                                        </button>
                                    )}
                                </div>

                                {isAssetDropdownOpen && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={handleCloseAssetDropdown} />
                                        <div className="absolute left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg bg-card border border-border shadow-lg py-1 z-20 text-xs">
                                            {filteredAssets.length === 0 ? (
                                                <div className="px-3 py-2 text-muted-foreground italic">No matching equipment found.</div>
                                            ) : (
                                                filteredAssets.map(asset => {
                                                    const label = getAssetLabel(asset);
                                                    return (
                                                        <button
                                                            key={asset.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setSelectedAssetId(asset.id);
                                                                setAssetSearch(label);
                                                                setIsAssetDropdownOpen(false);
                                                            }}
                                                            className="w-full text-left px-3 py-2 hover:bg-muted text-foreground flex items-center justify-between"
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                {asset.item_image ? (
                                                                    // eslint-disable-next-line @next/next/no-img-element
                                                                    <img 
                                                                        src={asset.item_image} 
                                                                        alt={label} 
                                                                        className="w-7 h-7 object-cover rounded border border-border shrink-0"
                                                                    />
                                                                ) : (
                                                                    <div className="w-7 h-7 bg-muted/20 border border-dashed rounded flex items-center justify-center text-muted-foreground/30 shrink-0">
                                                                        <ImageIcon className="h-3.5 w-3.5" />
                                                                    </div>
                                                                )}
                                                                <span>{label}</span>
                                                            </div>
                                                            {selectedAssetId === asset.id && <Check className="h-3.5 w-3.5 text-primary" />}
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </>
                                )}
                                {selectedAssetId && (() => {
                                    const selectedAsset = assets.find(a => a.id === selectedAssetId);
                                    if (selectedAsset && selectedAsset.is_active === false) {
                                        return (
                                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1.5 mt-1.5">
                                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                                <span>Warning: The assigned asset is currently set to INACTIVE in Asset Management.</span>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}
                            </div>

                            {/* Owner Department */}
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Owner Department <span className="text-destructive">*</span></label>
                                <Select
                                    value={selectedDeptId ? String(selectedDeptId) : "none"}
                                    onValueChange={(val) => {
                                        if (val === "none") {
                                            setSelectedDeptId(null);
                                        } else {
                                            setSelectedDeptId(Number(val));
                                        }
                                    }}
                                >
                                    <SelectTrigger className={`w-full h-[38px] rounded-lg bg-background border text-foreground text-sm ${validationAttempted && !selectedDeptId ? "border-destructive focus:ring-destructive" : "border-border"}`}>
                                        <SelectValue placeholder="Select department..." />
                                    </SelectTrigger>
                                    <SelectContent position="popper" sideOffset={4} className="bg-popover border border-border text-foreground">
                                        <SelectItem value="none">None</SelectItem>
                                        {departments.map((dept) => (
                                            <SelectItem key={dept.department_id} value={String(dept.department_id)}>
                                                {dept.department_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Status */}
                            <div className="space-y-1">
                                <label className="text-[11px] font-bold text-muted-foreground uppercase block mb-1">Status</label>
                                <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={isActive}
                                        onChange={(e) => setIsActive(e.target.checked)}
                                        className="h-4.5 w-4.5 rounded border-muted bg-background text-primary focus:ring-0"
                                    />
                                    Active &amp; Operational on Factory Floor
                                </label>
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="flex justify-end gap-3 pt-3 border-t shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted transition-colors text-muted-foreground"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-4 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-lg text-xs transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-primary/20 flex items-center gap-1.5"
                                >
                                    {saving && (
                                        <div className="h-3 w-3 animate-spin border border-current border-t-transparent rounded-full" />
                                    )}
                                    {saving ? "Saving..." : "Save Work Station"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* View Details Modal popup */}
            {isViewModalOpen && viewingWorkCenter && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-100">
                    <div className="bg-card border border-border/85 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0 bg-muted/20">
                            <div className="flex items-center gap-2">
                                <Info className="h-5 w-5 text-primary" />
                                <div>
                                    <h3 className="text-base font-bold text-foreground">Work Station Profile</h3>
                                    <p className="text-xs text-muted-foreground">Detailed parameters and metadata for the workstation.</p>
                                </div>
                            </div>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-foreground">
                            {/* Work Station Name & Status */}
                            <div className="flex justify-between items-start gap-4">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Work Station Name</span>
                                    <h4 className="text-lg font-bold text-foreground">{viewingWorkCenter.work_center_name}</h4>
                                </div>
                                <div className="text-right space-y-1">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Status</span>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                                        Boolean(viewingWorkCenter.is_active) 
                                            ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" 
                                            : "bg-destructive/10 text-destructive border border-destructive/20"
                                    }`}>
                                        {Boolean(viewingWorkCenter.is_active) ? "Active" : "Inactive"}
                                    </span>
                                </div>
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 gap-4 bg-muted/10 p-4 rounded-xl border border-border/50">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Overhead Cost / Hour</span>
                                    <span className="text-sm font-semibold text-foreground">
                                        {formatCurrency(viewingWorkCenter.overhead_cost_per_hour)}
                                    </span>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Capacity / Hour</span>
                                    <span className="text-sm font-semibold text-foreground">
                                        {formatNumber(Number(viewingWorkCenter.capacity_per_hour) || 0, "en-PH", 0)} units
                                    </span>
                                </div>
                                <div className="space-y-1 col-span-2 pt-2 border-t border-border/30">
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Owner Department</span>
                                    <span className="text-xs font-semibold text-foreground">
                                        {(() => {
                                            const dept = departments.find(d => d.department_id === viewingWorkCenter.department_id) || viewingWorkCenter.department;
                                            return dept ? (
                                                <span className="bg-primary/5 text-primary border border-primary/10 px-2 py-0.5 rounded font-medium inline-block mt-0.5">
                                                    {dept.department_name}
                                                </span>
                                            ) : (
                                                <span className="text-muted-foreground/50 italic">None mapped</span>
                                            );
                                        })()}
                                    </span>
                                </div>
                            </div>

                            {/* Associated Asset / Equipment */}
                            <div className="space-y-2">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Associated Asset &amp; Equipment</span>
                                {(() => {
                                    const linkedAsset = viewingWorkCenter.asset || assets.find(a => a.id === viewingWorkCenter.asset_id);
                                    if (!linkedAsset) {
                                        return (
                                            <div className="border border-dashed border-border/80 rounded-xl p-6 text-center text-muted-foreground bg-muted/5">
                                                <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground/20 mb-1.5" />
                                                <span className="font-semibold text-xs block text-muted-foreground/70">No Asset Associated</span>
                                                <p className="text-[10px] text-muted-foreground/50 mt-0.5">Use the Edit Modal to link a piece of machinery or equipment.</p>
                                            </div>
                                        );
                                    }
                                    const matchedCatalogAsset = assets.find(a => a.id === viewingWorkCenter.asset_id || a.id === linkedAsset.id);
                                    const assetName = typeof linkedAsset.item_id === 'object' 
                                        ? linkedAsset.item_id?.item_name || "" 
                                        : (typeof matchedCatalogAsset?.item_id === 'object' ? matchedCatalogAsset?.item_id?.item_name || "" : "");
                                    const rfidCode = linkedAsset.rfid_code || matchedCatalogAsset?.rfid_code || "N/A";
                                    const barcodeCode = linkedAsset.barcode || matchedCatalogAsset?.barcode || "N/A";
                                    const condition = linkedAsset.condition || matchedCatalogAsset?.condition || "Good";
                                    const itemImage = linkedAsset.item_image || matchedCatalogAsset?.item_image || null;

                                    const isAssetInactive = (matchedCatalogAsset?.is_active === false || linkedAsset?.is_active === false);

                                    return (
                                        <div className="space-y-2">
                                            {isAssetInactive && (
                                                <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2.5">
                                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                                    <span>Warning: The assigned equipment asset is currently set as <strong>INACTIVE</strong> in Asset Management.</span>
                                                </div>
                                            )}
                                            <div className="border border-border/60 rounded-xl p-4 flex flex-col md:flex-row gap-4 bg-background">
                                            {/* Left: Image Container */}
                                            <div className="w-full md:w-1/3 shrink-0">
                                                {itemImage ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img 
                                                        src={itemImage} 
                                                        alt={assetName || "Asset image"} 
                                                        onClick={() => setPreviewImage(itemImage)}
                                                        className="w-full h-24 object-cover rounded-lg border border-border bg-muted/5 shrink-0 cursor-zoom-in hover:scale-102 transition-transform"
                                                    />
                                                ) : (
                                                    <div className="w-full h-24 bg-muted/20 border border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground/30 gap-1 shrink-0">
                                                        <ImageIcon className="h-6 w-6" />
                                                        <span className="text-[9px] font-semibold uppercase tracking-wider">No Image</span>
                                                    </div>
                                                )}
                                            </div>
                                            {/* Right: Info details */}
                                            <div className="flex-1 space-y-2">
                                                <div>
                                                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Asset/Item Name</span>
                                                    <span className="font-bold text-foreground text-sm">{assetName || "Equipment Asset"}</span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-[11px]">
                                                    <div>
                                                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">RFID Code</span>
                                                        <span className="font-semibold text-foreground truncate block">{rfidCode}</span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Barcode</span>
                                                        <span className="font-semibold text-foreground truncate block">{barcodeCode}</span>
                                                    </div>
                                                    <div className="col-span-2">
                                                        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block">Condition</span>
                                                        <span className="font-semibold text-foreground">{condition}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                                })()}
                            </div>

                            {/* Metadata */}
                            <div className="pt-4 border-t border-border/30 grid grid-cols-2 gap-4 text-muted-foreground">
                                <div className="flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                                    <div className="min-w-0">
                                        <span className="text-[9px] font-bold uppercase tracking-wider block text-muted-foreground/50">Created At</span>
                                        <span className="font-medium text-foreground/80 truncate block">{formatTimestamp(viewingWorkCenter.created_at)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <User className="h-4 w-4 text-muted-foreground/60 shrink-0" />
                                    <div className="min-w-0">
                                        <span className="text-[9px] font-bold uppercase tracking-wider block text-muted-foreground/50">Created By</span>
                                        <span className="font-medium text-foreground/80 truncate block">{viewingWorkCenter.created_by_name || "System"}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="flex justify-end gap-3 p-4 border-t shrink-0 bg-muted/10">
                            <button
                                type="button"
                                onClick={() => {
                                    handleOpenEditModal(viewingWorkCenter, true);
                                    setTimeout(() => {
                                        setIsViewModalOpen(false);
                                    }, 200);
                                }}
                                className="px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-muted hover:text-foreground transition-colors text-muted-foreground flex items-center gap-1.5"
                            >
                                <Edit className="h-3.5 w-3.5" /> Edit Details
                            </button>
                            <button
                                type="button"
                                onClick={() => setIsViewModalOpen(false)}
                                className="px-5 py-2 bg-primary hover:bg-primary/95 text-primary-foreground font-semibold rounded-lg text-xs transition-colors shadow-md shadow-primary/20"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {previewImage && (
                <div 
                    className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
                    onClick={() => setPreviewImage(null)}
                >
                    <div 
                        className="relative max-w-5xl max-h-[90vh] p-2 bg-card border border-border/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Close Button */}
                        <button
                            type="button"
                            onClick={() => setPreviewImage(null)}
                            className="absolute top-4 right-4 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-colors focus:outline-none"
                        >
                            <X className="h-4 w-4" />
                        </button>
                        
                        {/* Image */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={previewImage}
                            alt="Asset Preview Large"
                            className="max-w-full max-h-[85vh] object-contain rounded-xl animate-in zoom-in-95 duration-200"
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
