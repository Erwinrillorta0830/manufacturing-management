/* eslint-disable */
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { Branch, SalesOrder, SalesOrderDetail, NetRequirementItem } from "../types";
import { fetchBranches, fetchSalesOrders, fetchNetRequirementsRaw, releaseJobOrder, directAllocate } from "../services/planning-api";

function isSchedulableLine(line: SalesOrderDetail): boolean {
    return line.parent_order_status === "For Production" && line.is_scheduled !== true;
}

export function usePlanningEngineering() {
    // UI State
    const [loadingBranches, setLoadingBranches] = useState(true);
    const [loadingOrders, setLoadingOrders] = useState(true);
    const [loadingRequirements, setLoadingRequirements] = useState(false);
    const [releasingJO, setReleasingJO] = useState(false);
    const [directAllocating, setDirectAllocating] = useState(false);
    const [versionStock, setVersionStock] = useState<number | null>(null);
    const [loadingVersionStock, setLoadingVersionStock] = useState(false);
    const [isDirectAllocDialogOpen, setIsDirectAllocDialogOpen] = useState(false);
    const [allocationProgress, setAllocationProgress] = useState<number>(0);
    const [allocationStatus, setAllocationStatus] = useState<string>("");

    // Master Data & Lists
    const [branches, setBranches] = useState<Branch[]>([]);
    const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
    const [detailsMap, setDetailsMap] = useState<Record<number, SalesOrderDetail[]>>({});
    const [netRequirements, setNetRequirements] = useState<NetRequirementItem[]>([]);
    const [subAssemblyMapping, setSubAssemblyMapping] = useState<Record<number, any[]>>({});

    // Selected Targets
    const [selectedBranchId, setSelectedBranchId] = useState<number | null>(null);
    const [selectedDetailIds, setSelectedDetailIds] = useState<number[]>([]);

    // Clear selected detail IDs when changing branches to prevent invalid operations
    useEffect(() => {
        setSelectedDetailIds([]);
    }, [selectedBranchId]);

    // Release Modal state
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [targetQuantity, setTargetQuantity] = useState<number>(0);
    const [dueDate, setDueDate] = useState<string>("");
    const [shiftOption, setShiftOption] = useState<string>("8");
    const [remarks, setRemarks] = useState<string>("");
    const [joNumber, setJoNumber] = useState<string>("");
    const [assignments, setAssignments] = useState<Record<number, number[]>>({});

    const [rawUnreleasedJobs, setRawUnreleasedJobs] = useState<any[]>([]);
    const [loadingJobs, setLoadingJobs] = useState(false);
    const [releasingDraftId, setReleasingDraftId] = useState<string | null>(null);

    // Filter unreleased jobs based on selected branch
    const unreleasedJobs = useMemo(() => {
        if (selectedBranchId === null) return [];
        return rawUnreleasedJobs.filter(
            (jo) => jo.branch_id !== undefined && jo.branch_id !== null && Number(jo.branch_id) === Number(selectedBranchId)
        );
    }, [rawUnreleasedJobs, selectedBranchId]);

    const loadUnreleasedJobs = async () => {
        setLoadingJobs(true);
        try {
            const res = await fetch("/api/manufacturing/planning-engineering");
            if (res.ok) {
                const data = await res.json();
                const draftOrPlanned = data.filter((j: any) => j.status === "Draft" || j.status === "Planned" || j.status === "Planning");
                setRawUnreleasedJobs(draftOrPlanned);
            }
        } catch (err) {
            console.error("Error loading unreleased job orders:", err);
        } finally {
            setLoadingJobs(false);
        }
    };

    const handleReleaseDraftFromPlanning = async (joId: string) => {
        setReleasingDraftId(joId);
        try {
            const res = await fetch("/api/manufacturing/planning-engineering", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "release-draft",
                    joId
                })
            });
            const data = await res.json();
            if (!res.ok || data.success === false) {
                const shortfallMsg = data.error || "Failed to release job order.";
                if (window.confirm(`${shortfallMsg}\n\nDo you want to forcibly release this Job Order anyway?`)) {
                    const forceRes = await fetch("/api/manufacturing/planning-engineering", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "release-draft",
                            joId,
                            forceRelease: true
                        })
                    });
                    const forceData = await forceRes.json();
                    if (!forceRes.ok || forceData.success === false) {
                        throw new Error(forceData.error || "Failed to forcibly release job order.");
                    }
                    toast.success("Job Order forcibly released successfully!");
                    await loadInitialData(true);
                    return;
                }
                return;
            }
            toast.success("Job Order released successfully!");
            await loadInitialData(true);
        } catch (err: any) {
            console.error("Failed to release Draft JO:", err);
            toast.error(err.message || "Failed to release job order.");
        } finally {
            setReleasingDraftId(null);
        }
    };

    // Initial Fetch: Branches & unfulfilled Sales Orders
    const loadInitialData = async (silent = false) => {
        if (!silent) {
            setLoadingBranches(true);
            setLoadingOrders(true);
            setLoadingJobs(true);
        }
        try {
            const [activeBranches, soResult, draftOrPlanned] = await Promise.all([
                fetchBranches(),
                fetchSalesOrders(),
                fetch("/api/manufacturing/planning-engineering").then(async (res) => {
                    if (res.ok) {
                        const data = await res.json();
                        return data.filter((j: any) => j.status === "Draft" || j.status === "Planned" || j.status === "Planning");
                    }
                    return [];
                }).catch(() => [])
            ]);

            setBranches(activeBranches);
            if (activeBranches.length > 0) {
                setSelectedBranchId((prev) => prev ?? activeBranches[0].id);
            }

            setSalesOrders(soResult.data || []);
            setDetailsMap(soResult.detailsMap || {});
            setRawUnreleasedJobs(draftOrPlanned);
        } catch (err: any) {
            console.error("Error loading initial data:", err);
            toast.error(err.message || "An error occurred while loading planning data.");
        } finally {
            if (!silent) {
                setLoadingBranches(false);
                setLoadingOrders(false);
                setLoadingJobs(false);
            }
        }
    };

    useEffect(() => {
        loadInitialData();
    }, []);

    // Establish Realtime SSE (Server-Sent Events) Connection for inventory movements
    useEffect(() => {
        let eventSource: EventSource | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
        let isDisposed = false;
        let reconnectAttempts = 0;

        const connectSSE = () => {
            if (isDisposed) return;
            if (reconnectAttempts >= 10) {
                console.warn("[Planning Realtime SSE] Maximum reconnect attempts reached (10). Standing by.");
                return;
            }

            try {
                eventSource = new EventSource("/api/manufacturing/inventory/movements/stream");

                eventSource.addEventListener("movement", (event) => {
                    try {
                        const movement = JSON.parse(event.data);
                        console.log(`[Planning Realtime SSE] Inventory movement detected (ID: ${movement.movement_id}). Refreshing planning data...`);
                        
                        // Silent reload to update demand lines, requirements, and unreleased job orders
                        loadInitialData(true);
                    } catch (e) {
                        console.error("[Planning Realtime SSE] Error parsing movement event data:", e);
                    }
                });

                eventSource.onerror = () => {
                    if (eventSource) {
                        eventSource.close();
                        eventSource = null;
                    }
                    if (!isDisposed && reconnectAttempts < 10) {
                        reconnectAttempts++;
                        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                        reconnectTimeout = setTimeout(connectSSE, delay);
                    }
                };

            } catch (err) {
                console.error("[Planning Realtime SSE] Error initializing EventSource:", err);
                if (!isDisposed && reconnectAttempts < 10) {
                    reconnectAttempts++;
                    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                    reconnectTimeout = setTimeout(connectSSE, delay);
                }
            }
        };

        connectSSE();

        return () => {
            isDisposed = true;
            if (eventSource) {
                eventSource.close();
            }
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
            }
        };
    }, []);

    // Flatten all sales order details for list display, filtered by selectedBranchId
    const salesOrderLines = useMemo(() => {
        if (selectedBranchId === null) return [];
        const lines: SalesOrderDetail[] = [];
        salesOrders.forEach((so) => {
            if (so.branch_id === undefined || so.branch_id === null || Number(so.branch_id) !== Number(selectedBranchId)) {
                return;
            }
            const details = detailsMap[so.order_id] || [];
            details.forEach((det) => {
                lines.push({
                    ...det,
                    order_no: so.order_no,
                    customer_name: so.customer_name || so.customer_code
                });
            });
        });
        return lines;
    }, [salesOrders, detailsMap, selectedBranchId]);

    // Fetch BOM components for all unique product IDs in sales orders to find sub-assemblies
    useEffect(() => {
        if (salesOrderLines.length === 0) return;
        const loadSubAssemblyBoms = async () => {
            const uniqueProductIds = Array.from(new Set(salesOrderLines.map((l) => l.product_id?.product_id).filter(Boolean)));
            const mappings: Record<number, any[]> = {};
            await Promise.all(uniqueProductIds.map(async (pId) => {
                try {
                    const res = await fetch(`/api/manufacturing/planning-engineering?productId=${pId}`);
                    if (res.ok) {
                        const data = await res.json();
                        const comps = data.components || [];
                        const subComps = comps.filter((c: any) => c.component_product_id?.product_type === 388 || c.component_product_id?.is_finished_good);
                        if (subComps.length > 0) {
                            mappings[pId] = subComps;
                        }
                    }
                } catch (e) {
                    console.error("Failed to load sub-assemblies for product", pId, e);
                }
            }));
            setSubAssemblyMapping(mappings);
        };
        loadSubAssemblyBoms();
    }, [salesOrderLines]);

    // Gather unique product IDs across loaded demand lines (mapping directly to SKU product IDs)
    const demandProductIds = useMemo(() => {
        const ids = new Set<number>();
        salesOrderLines.forEach((line) => {
            const pInfo = line.product_id;
            if (pInfo && pInfo.product_id) {
                ids.add(pInfo.product_id);
            }
        });
        
        // Also add sub-assembly product IDs!
        Object.values(subAssemblyMapping).forEach((comps) => {
            comps.forEach((c) => {
                const scId = c.component_product_id?.product_id;
                if (scId) ids.add(scId);
            });
        });

        return Array.from(ids);
    }, [salesOrderLines, subAssemblyMapping]);

    // Fetch On-Hand & Safety Stock for the Net Requirements Calculation Grid
    useEffect(() => {
        if (!selectedBranchId || demandProductIds.length === 0) {
            setNetRequirements([]);
            return;
        }

        const runFetchNetRequirements = async () => {
            setLoadingRequirements(true);
            try {
                const data = await fetchNetRequirementsRaw(demandProductIds, selectedBranchId);
                
                // Group gross demands from all outstanding lines, grouping by SKU product_id directly
                const grossDemandMap: Record<number, number> = {};
                salesOrderLines.forEach((line) => {
                    const pInfo = line.product_id;
                    if (pInfo && pInfo.product_id) {
                        const pId = pInfo.product_id;
                        const qty = Number(line.ordered_quantity || 0);
                        grossDemandMap[pId] = (grossDemandMap[pId] || 0) + qty;
                    }
                });

                const calculated: NetRequirementItem[] = [];

                // 1. First pass: calculate parent products requirements
                const parentShortfalls: Record<number, number> = {};
                data.forEach((item: any) => {
                    const pId = Number(item.product_id);
                    const isParent = salesOrderLines.some((l) => l.product_id?.product_id === pId);
                    if (isParent) {
                        const grossDemand = grossDemandMap[pId] || 0;
                        const onHand = Number(item.on_hand || 0);
                        const safetyStock = Number(item.safety_stock || 0);
                        const netShortfall = Math.max(0, grossDemand - (onHand - safetyStock));

                        parentShortfalls[pId] = netShortfall;

                        calculated.push({
                            product_id: pId,
                            product_name: item.product_name,
                            product_code: item.product_code,
                            gross_demand: grossDemand,
                            on_hand: onHand,
                            safety_stock: safetyStock,
                            net_shortfall: netShortfall
                        });
                    }
                });

                // 2. Second pass: calculate sub-assembly requirements based on parent shortfalls
                data.forEach((item: any) => {
                    const pId = Number(item.product_id);
                    const isParent = salesOrderLines.some((l) => l.product_id?.product_id === pId);
                    if (!isParent) {
                        let subAssemblyGrossDemand = 0;
                        const associatedParentNames: string[] = [];

                        Object.entries(subAssemblyMapping).forEach(([parentIdStr, comps]) => {
                            const parentId = Number(parentIdStr);
                            const compNeeded = comps.find((c) => c.component_product_id?.product_id === pId);
                            if (compNeeded) {
                                const parentShortfall = parentShortfalls[parentId] || 0;
                                const qtyPerParent = Number(compNeeded.quantity_required || 0);
                                subAssemblyGrossDemand += parentShortfall * qtyPerParent;
                                
                                const parentLine = salesOrderLines.find((l) => l.product_id?.product_id === parentId);
                                if (parentLine?.product_id?.product_name) {
                                    associatedParentNames.push(parentLine.product_id.product_name);
                                }
                            }
                        });

                        const onHand = Number(item.on_hand || 0);
                        const safetyStock = Number(item.safety_stock || 0);
                        const netShortfall = Math.max(0, subAssemblyGrossDemand - (onHand - safetyStock));

                        calculated.push({
                            product_id: pId,
                            product_name: item.product_name + (associatedParentNames.length > 0 ? ` (Sub-Assembly for ${associatedParentNames.join(", ")})` : ""),
                            product_code: item.product_code,
                            gross_demand: subAssemblyGrossDemand,
                            on_hand: onHand,
                            safety_stock: safetyStock,
                            net_shortfall: netShortfall,
                            is_sub_assembly: true
                        });
                    }
                });

                setNetRequirements(calculated);
            } catch (err: any) {
                console.error("Error fetching net requirements:", err);
            } finally {
                setLoadingRequirements(false);
            }
        };

        runFetchNetRequirements();
    }, [selectedBranchId, demandProductIds, salesOrderLines, subAssemblyMapping]);

    // Helper: Currently selected details
    const selectedLines = useMemo(() => {
        return salesOrderLines.filter((l) => selectedDetailIds.includes(l.detail_id) && isSchedulableLine(l));
    }, [salesOrderLines, selectedDetailIds]);

    // Validation checks for merging selected lines
    const mergeValidation = useMemo(() => {
        if (selectedLines.length === 0) {
            return { isValid: false, reason: "Select sales order lines to begin." };
        }

        // 1. Must share the exact same product SKU
        const productIds = new Set(selectedLines.map((l) => l.product_id?.product_id));
        if (productIds.size > 1) {
            return { isValid: false, reason: "Cannot consolidate: Selected lines must belong to the exact same product SKU." };
        }

        // 2. Must have valid version IDs
        const versions = selectedLines.map((l) => l.bom_version_id);
        const hasMissingVersion = versions.some((v) => v === null || v === undefined);
        if (hasMissingVersion) {
            return {
                isValid: false,
                reason: "Cannot consolidate: Selected product is missing an active recipe version override or standard BOM."
            };
        }

        // 3. Must have matching versions
        const uniqueVersions = new Set(versions);
        if (uniqueVersions.size > 1) {
            return {
                isValid: false,
                reason: "Cannot consolidate: Selected lines have different recipe version overrides. Block merging if versions differ."
            };
        }

        return { isValid: true, reason: "" };
    }, [selectedLines]);

    // Handle toggling select-all
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedDetailIds(salesOrderLines.filter(isSchedulableLine).map((l) => l.detail_id));
        } else {
            setSelectedDetailIds([]);
        }
    };

    // Handle toggling single line
    const handleSelectLine = (detailId: number, checked: boolean) => {
        if (checked) {
            const line = salesOrderLines.find((candidate) => candidate.detail_id === detailId);
            if (!line || !isSchedulableLine(line)) return;
            setSelectedDetailIds((prev) => [...prev, detailId]);
        } else {
            setSelectedDetailIds((prev) => prev.filter((id) => id !== detailId));
        }
    };

    // Open Release Modal & initialize parameters
    const handleInitiateRelease = () => {
        if (!mergeValidation.isValid) return;

        const firstLine = selectedLines[0];
        const targetProductId = firstLine.product_id?.product_id;
        
        // Sum total demand
        const totalDemand = selectedLines.reduce((sum, l) => {
            return sum + Number(l.ordered_quantity || 0);
        }, 0);

        // Find matching shortfall if any to prefill target quantity
        const matchingShortfall = netRequirements.find(
            (r) => r.product_id === targetProductId
        );
        const suggestedQty = matchingShortfall && matchingShortfall.net_shortfall > 0 
            ? matchingShortfall.net_shortfall 
            : totalDemand;

        // Auto generate a JO ID code
        const code = `JO-${Math.floor(100000 + Math.random() * 900000)}`;

        setTargetQuantity(suggestedQty);
        setJoNumber(code);
        setDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
        setShiftOption("8");
        setRemarks(`Consolidated production run for: ${selectedLines.map(l => l.order_no).join(", ")}`);
        setIsConfirmOpen(true);
    };

    // Release JO Submit
    const handleConfirmRelease = async (selectedSubAssemblyVersions?: Record<number, number>) => {
        if (!selectedBranchId || selectedLines.length === 0) return;

        setReleasingJO(true);
        try {
            const firstLine = selectedLines[0];
            const targetProductId = firstLine.product_id?.product_id;
            const targetProductName = firstLine.product_id?.product_name;

            const uniqueSalesOrderIds = Array.from(new Set(selectedLines.map((l) => l.order_id)));

            const payload = {
                jo: {
                    jo_id: joNumber,
                    product_id: targetProductId,
                    product_name: targetProductName,
                    quantity: targetQuantity,
                    due_date: dueDate,
                    status: "Released", // releases directly with lot deduction
                    is_batched: selectedLines.length > 1,
                    branch_id: selectedBranchId,
                    shiftOption: shiftOption,
                    remarks: remarks,
                    bom: {
                        version_id: firstLine.bom_version_id
                    },
                    subAssemblyVersionMap: selectedSubAssemblyVersions || {},
                    assignments: assignments,
                    products: [
                        {
                            product_id: targetProductId,
                            product_name: targetProductName,
                            quantity: targetQuantity,
                            bom: {
                                version_id: firstLine.bom_version_id
                            }
                        }
                    ]
                },
                salesOrderIds: uniqueSalesOrderIds,
                salesOrderDetailIds: selectedLines.map((line) => line.detail_id)
            };

            await releaseJobOrder(payload);

            toast.success(`Job Order ${joNumber} released successfully! FIFO materials locked.`);
            setIsConfirmOpen(false);
            setSelectedDetailIds([]);
            // Reload data to show updated unfulfilled lines & requirements
            loadInitialData(true);
        } catch (err: any) {
            console.error("Error releasing job order:", err);
            toast.error(err.message || "An error occurred during Job Order explosion & release.");
        } finally {
            setReleasingJO(false);
        }
    };

    // Direct Allocate Submit
    const handleConfirmDirectAllocate = async () => {
        if (!selectedBranchId || selectedLines.length === 0) return;
 
        setDirectAllocating(true);
        setAllocationProgress(10);
        setAllocationStatus("Step 1/4: Validating stock levels & sorting FIFO lots...");
        try {
            const firstLine = selectedLines[0];
            const targetProductId = firstLine.product_id?.product_id;
            const targetVersionId = firstLine.bom_version_id;
 
            if (!targetProductId || !targetVersionId) {
                throw new Error("Invalid product or version ID.");
            }
 
            const payload = {
                branchId: selectedBranchId,
                productId: targetProductId,
                recipeVersionId: targetVersionId,
                lines: selectedLines.map(l => ({
                    detail_id: l.detail_id,
                    ordered_quantity: l.ordered_quantity
                }))
            };
 
            await new Promise(r => setTimeout(r, 600));
            setAllocationProgress(40);
            setAllocationStatus("Step 2/4: Deducting physical inventory lots...");

            // Trigger allocation call
            const callPromise = directAllocate(payload);

            await new Promise(r => setTimeout(r, 600));
            setAllocationProgress(70);
            setAllocationStatus("Step 3/4: Writing inventory ledger movements...");

            await new Promise(r => setTimeout(r, 600));
            setAllocationProgress(90);
            setAllocationStatus("Step 4/4: Updating Sales Order detail lines & transition statuses...");

            await callPromise;

            setAllocationProgress(100);
            setAllocationStatus("Allocation Complete!");
            await new Promise(r => setTimeout(r, 400));
 
            toast.success(`Direct allocation successful! Stock deducted and order lines ready for invoicing.`);
            setIsDirectAllocDialogOpen(false);
            setSelectedDetailIds([]);
            loadInitialData(true);
        } catch (err: any) {
            console.error("Error during direct allocation:", err);
            toast.error(err.message || "An error occurred during direct allocation.");
        } finally {
            setDirectAllocating(false);
            setAllocationProgress(0);
            setAllocationStatus("");
        }
    };

    // Load available version stock when selected lines change
    useEffect(() => {
        if (!selectedBranchId || !mergeValidation.isValid || selectedLines.length === 0) {
            setVersionStock(null);
            return;
        }

        const firstLine = selectedLines[0];
        const pId = firstLine.product_id?.product_id;
        const versionId = firstLine.bom_version_id;

        if (!pId || !versionId) {
            setVersionStock(null);
            return;
        }

        const fetchVersionStock = async () => {
            setLoadingVersionStock(true);
            try {
                const res = await fetch(`/api/manufacturing/planning-engineering?action=version-stock&productId=${pId}&branchId=${selectedBranchId}`);
                if (res.ok) {
                    const stockMap = await res.json();
                    const stock = stockMap[versionId] || 0;
                    setVersionStock(stock);
                } else {
                    setVersionStock(0);
                }
            } catch (err) {
                console.error("Failed to load version stock:", err);
                setVersionStock(0);
            } finally {
                setLoadingVersionStock(false);
            }
        };

        fetchVersionStock();
    }, [selectedBranchId, selectedLines, mergeValidation.isValid]);

    return {
        loadingBranches,
        loadingOrders,
        loadingRequirements,
        releasingJO,
        branches,
        salesOrders,
        netRequirements,
        selectedBranchId,
        setSelectedBranchId,
        selectedDetailIds,
        allocationProgress,
        allocationStatus,
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
        versionStock,
        loadingVersionStock,
        isDirectAllocDialogOpen,
        setIsDirectAllocDialogOpen,
        handleConfirmDirectAllocate,
        unreleasedJobs,
        loadingJobs,
        releasingDraftId,
        handleReleaseDraftFromPlanning
    };
}
