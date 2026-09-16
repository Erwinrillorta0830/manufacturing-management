/* eslint-disable */
import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { isJobOrderStatus, JOB_ORDER_STATUS } from "../../job-order-status";
import { Branch, SalesOrder, SalesOrderDetail, NetRequirementItem } from "../types";
import { fetchBranches, fetchSalesOrders, fetchNetRequirementsRaw, releaseJobOrder, releaseMultipleJobOrders, directAllocate } from "../services/planning-api";
import { buildSalesOrderDemandGroups, buildSalesOrderReleaseGroups, isSchedulableSalesOrderLine, remainingQuantity } from "../utils/demand-groups";

function salesOrderDateValue(value: string | undefined): number {
    const timestamp = Date.parse(value || "");
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareNewestSalesOrders(left: SalesOrder, right: SalesOrder): number {
    const createdDateDifference = salesOrderDateValue(right.created_date) - salesOrderDateValue(left.created_date);
    if (createdDateDifference !== 0) return createdDateDifference;

    const orderDateDifference = salesOrderDateValue(right.order_date) - salesOrderDateValue(left.order_date);
    if (orderDateDifference !== 0) return orderDateDifference;

    return Number(right.order_id) - Number(left.order_id);
}

function parseValidBranchId(value: unknown): number | null {
    const branchId = Number(value);
    return Number.isSafeInteger(branchId) && branchId > 0 ? branchId : null;
}

export function usePlanningEngineering() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const requestedDeepLinkJo = searchParams.get("jo");

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
    const [productionSalesOrders, setProductionSalesOrders] = useState<SalesOrder[]>([]);
    const [productionDetailsMap, setProductionDetailsMap] = useState<Record<number, SalesOrderDetail[]>>({});
    const [loadingProductionOrders, setLoadingProductionOrders] = useState(true);
    const [productionOrdersError, setProductionOrdersError] = useState<string | null>(null);
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
    const [plannedDate, setPlannedDate] = useState<string>(new Date().toISOString().split("T")[0]);
    const [dueDate, setDueDate] = useState<string>("");
    const [shiftOption, setShiftOption] = useState<string>("8");
    const [priority, setPriority] = useState<number>(0);
    const [remarks, setRemarks] = useState<string>("");
    const [joNumber, setJoNumber] = useState<string>("");
    const [assignments, setAssignments] = useState<Record<number, number[]>>({});

    const [rawUnreleasedJobs, setRawUnreleasedJobs] = useState<any[]>([]);
    const [loadingJobs, setLoadingJobs] = useState(false);
    const [releasingDraftId, setReleasingDraftId] = useState<string | null>(null);
    const [pendingDeepLinkJo, setPendingDeepLinkJo] = useState<string | null>(null);
    const [deepLinkJo, setDeepLinkJo] = useState<any | null>(null);
    const [deepLinkNotice, setDeepLinkNotice] = useState<string | null>(null);
    const productionRequestIdRef = useRef(0);

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
                // The queue keeps released Job Orders visible so users can see
                // where they moved after scheduling instead of losing them.
                const queuedJobs = data.filter((j: any) => isJobOrderStatus(
                    j.status,
                    JOB_ORDER_STATUS.DRAFT,
                    JOB_ORDER_STATUS.FOR_PICKING,
                    JOB_ORDER_STATUS.PICKED
                ));
                setRawUnreleasedJobs(queuedJobs);
            }
        } catch (err) {
            console.error("Error loading unreleased job orders:", err);
        } finally {
            setLoadingJobs(false);
        }
    };

    const handleReleaseDraftFromPlanning = async (joId: string | number) => {
        setReleasingDraftId(String(joId));
        try {
            const res = await fetch("/api/manufacturing/planning-engineering", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "initialize",
                    joId,
                    usePhysicalOnHand: true
                })
            });
            const data = await res.json();
            if (!res.ok || data.success === false) {
                const errorMsg = data.error || "Failed to release job order.";
                // Only material shortfalls offer the force-release escape hatch;
                // other failures (e.g. wrong status, missing branch) must not
                // prompt for a forced release that cannot succeed.
                const isShortfall = data.code === "MATERIAL_SHORTAGE" || /Still insufficient raw materials|material reservations are short/i.test(errorMsg);
                if (!isShortfall) {
                    toast.error(errorMsg);
                    return;
                }
                if (window.confirm(`${errorMsg}\n\nDo you want to forcibly release this Job Order anyway?`)) {
                    const forceRes = await fetch("/api/manufacturing/planning-engineering", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            action: "initialize",
                            joId,
                            usePhysicalOnHand: true,
                            force: true,
                            overrideReason: "Authorized planning shortage override"
                        })
                    });
                    const forceData = await forceRes.json();
                    if (!forceRes.ok || forceData.success === false) {
                        throw new Error(forceData.error || "Failed to forcibly release job order.");
                    }
                    toast.success("Job Order forcibly released. It stays in the queue — next step: stage materials.");
                    await loadInitialData(true);
                    return;
                }
                return;
            }
            toast.success("Job Order initialized. Next step: stage its materials on the shop floor.");
            await loadInitialData(true);
        } catch (err: any) {
            console.error("Failed to release Draft JO:", err);
            toast.error(err.message || "Failed to release job order.");
        } finally {
            setReleasingDraftId(null);
        }
    };

    const loadInProductionSalesOrders = async () => {
        const requestId = ++productionRequestIdRef.current;
        setLoadingProductionOrders(true);
        try {
            const result = await fetchSalesOrders("in-production");
            if (requestId !== productionRequestIdRef.current) return;
            setProductionSalesOrders(result.data || []);
            setProductionDetailsMap(result.detailsMap || {});
            setProductionOrdersError(null);
        } catch (err) {
            if (requestId !== productionRequestIdRef.current) return;
            const message = err instanceof Error ? err.message : "Failed to load Sales Orders in production.";
            console.error("Error loading Sales Orders in production:", err);
            setProductionSalesOrders([]);
            setProductionDetailsMap({});
            setProductionOrdersError(message);
        } finally {
            if (requestId === productionRequestIdRef.current) {
                setLoadingProductionOrders(false);
            }
        }
    };

    // Initial Fetch: Branches & For Production Sales Orders
    const loadInitialData = async (silent = false) => {
        if (!silent) {
            setLoadingBranches(true);
            setLoadingOrders(true);
            setLoadingJobs(true);
        }
        void loadInProductionSalesOrders();
        try {
            const [activeBranches, soResult, queuedJobs] = await Promise.all([
                fetchBranches(),
                fetchSalesOrders(),
                fetch("/api/manufacturing/planning-engineering").then(async (res) => {
                    if (res.ok) {
                        const data = await res.json();
                        return data.filter((j: any) => isJobOrderStatus(
                            j.status,
                            JOB_ORDER_STATUS.DRAFT,
                            JOB_ORDER_STATUS.FOR_PICKING,
                            JOB_ORDER_STATUS.PICKED
                        ));
                    }
                    return [];
                }).catch(() => [])
            ]);

            setBranches(activeBranches);

            setSalesOrders(soResult.data || []);
            setDetailsMap(soResult.detailsMap || {});
            setRawUnreleasedJobs(queuedJobs);
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

    const openCreatedJobOrder = async (jobOrderNo: string) => {
        const normalizedJobOrderNo = String(jobOrderNo || "").trim();
        if (!normalizedJobOrderNo) {
            throw new Error("The created Job Order did not return a valid reference.");
        }

        await loadInitialData(true);
        setDeepLinkNotice(null);
        setPendingDeepLinkJo(normalizedJobOrderNo);
        router.replace(`/mm/planning-engineering?jo=${encodeURIComponent(normalizedJobOrderNo)}`, { scroll: false });
    };

    // Deep link support: /mm/planning-engineering?jo=JO-XXXX selects the
    // Job Order's branch and opens its planning details. This also reacts to
    // redirects that update the query string while the page is mounted.
    useEffect(() => {
        setPendingDeepLinkJo(requestedDeepLinkJo);
        if (requestedDeepLinkJo) {
            setDeepLinkNotice(null);
        } else {
            setDeepLinkJo(null);
        }
    }, [requestedDeepLinkJo]);

    useEffect(() => {
        if (!pendingDeepLinkJo || loadingJobs || loadingBranches) return;
        const requestedReference = pendingDeepLinkJo.trim().toLowerCase();
        const match = rawUnreleasedJobs.find((jo: any) => [jo.jo_id, jo.job_order_no]
            .some((reference) => String(reference ?? "").trim().toLowerCase() === requestedReference));
        if (match) {
            const persistedBranchId = parseValidBranchId(match.branch_id);
            const isActiveBranch = persistedBranchId !== null
                && branches.some((branch) => Number(branch.id) === persistedBranchId);
            if (isActiveBranch) {
                setSelectedBranchId(persistedBranchId);
                setDeepLinkJo(match);
            } else {
                setDeepLinkNotice(`Job Order ${pendingDeepLinkJo} has no active target branch and cannot be opened in a branch-scoped planning view.`);
            }
        } else {
            setDeepLinkNotice(`Job Order ${pendingDeepLinkJo} is not in the planning queue. It may already be released or in production, belongs to another branch, or does not exist.`);
        }
        setPendingDeepLinkJo(null);
    }, [pendingDeepLinkJo, rawUnreleasedJobs, loadingJobs, loadingBranches, branches]);

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
        [...salesOrders].sort(compareNewestSalesOrders).forEach((so) => {
            if (so.order_status !== "For Production") return;
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

    // Keep every line in the grouped demand view so scheduled/fulfilled lines
    // remain visible as read-only context. Only schedulable lines flow into
    // planning, selection, and Job Order creation.
    const salesOrderGroups = useMemo(() => {
        const orderById = new Map(salesOrders.map((order) => [Number(order.order_id), order]));
        const grouped = new Map<number, SalesOrderDetail[]>();
        for (const line of salesOrderLines) {
            const orderLines = grouped.get(line.order_id) || [];
            orderLines.push(line);
            grouped.set(line.order_id, orderLines);
        }

        return [...grouped.entries()].map(([orderId, lines]) => ({
            order: orderById.get(orderId) || {
                order_id: orderId,
                order_no: lines[0]?.order_no || `SO #${orderId}`,
                customer_code: lines[0]?.customer_name || "",
                order_date: "",
                order_status: lines[0]?.parent_order_status || "",
                total_amount: 0,
                net_amount: 0,
                remarks: "",
                created_date: "",
                branch_id: selectedBranchId
            },
            lines,
            selectableLines: lines.filter(isSchedulableSalesOrderLine)
        }));
    }, [salesOrders, salesOrderLines, selectedBranchId]);

    const productionSalesOrderGroups = useMemo(
        () => buildSalesOrderDemandGroups(
            productionSalesOrders.filter((order) => order.order_status === "In Production"),
            productionDetailsMap,
            selectedBranchId
        ),
        [productionSalesOrders, productionDetailsMap, selectedBranchId]
    );

    const planningLines = useMemo(
        () => salesOrderLines.filter(isSchedulableSalesOrderLine),
        [salesOrderLines]
    );

    // Fetch BOM components for all unique product IDs in sales orders to find sub-assemblies
    useEffect(() => {
        if (planningLines.length === 0) {
            setSubAssemblyMapping({});
            return;
        }
        const loadSubAssemblyBoms = async () => {
            const uniqueProductIds = Array.from(new Set(planningLines.map((l) => l.product_id?.product_id).filter(Boolean)));
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
    }, [planningLines]);

    // Gather unique product IDs across loaded demand lines (mapping directly to SKU product IDs)
    const demandProductIds = useMemo(() => {
        const ids = new Set<number>();
        planningLines.forEach((line) => {
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
    }, [planningLines, subAssemblyMapping]);

    // Fetch On-Hand & Safety Stock for the Net Requirements Calculation Grid
    useEffect(() => {
        const branchId = parseValidBranchId(selectedBranchId);
        if (branchId === null || demandProductIds.length === 0) {
            setNetRequirements([]);
            return;
        }

        const runFetchNetRequirements = async () => {
            setLoadingRequirements(true);
            try {
                const data = await fetchNetRequirementsRaw(demandProductIds, branchId);
                
                // Group gross demands from all outstanding lines, grouping by SKU product_id directly
                const grossDemandMap: Record<number, number> = {};
                planningLines.forEach((line) => {
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
                    const isParent = planningLines.some((l) => l.product_id?.product_id === pId);
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
                    const isParent = planningLines.some((l) => l.product_id?.product_id === pId);
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
                                
                                const parentLine = planningLines.find((l) => l.product_id?.product_id === parentId);
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
    }, [selectedBranchId, demandProductIds, planningLines, subAssemblyMapping]);

    // Helper: Currently selected details
    const selectedLines = useMemo(() => {
        return salesOrderLines.filter((l) => selectedDetailIds.includes(l.detail_id) && isSchedulableSalesOrderLine(l));
    }, [salesOrderLines, selectedDetailIds]);

    const releaseGroups = useMemo(
        () => buildSalesOrderReleaseGroups(selectedLines),
        [selectedLines]
    );

    // Validation checks for merging selected lines
    const mergeValidation = useMemo(() => {
        if (selectedLines.length === 0) {
            return { isValid: false, reason: "Select sales order lines to begin." };
        }

        const hasInvalidIdentity = selectedLines.some((line) =>
            !Number.isInteger(Number(line.product_id?.product_id))
            || Number(line.product_id?.product_id) <= 0
            || !Number.isInteger(Number(line.bom_version_id))
            || Number(line.bom_version_id) <= 0
        );
        if (hasInvalidIdentity || releaseGroups.length !== new Set(selectedLines.map((line) => `${line.product_id?.product_id}:${line.bom_version_id}`)).size) {
            return {
                isValid: false,
                reason: "Cannot release: every selected line must have a valid product and active recipe version."
            };
        }

        return { isValid: releaseGroups.length > 0, reason: "" };
    }, [selectedLines, releaseGroups]);

    // Handle toggling select-all
    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedDetailIds(salesOrderLines.filter(isSchedulableSalesOrderLine).map((l) => l.detail_id));
        } else {
            setSelectedDetailIds([]);
        }
    };

    // Handle toggling single line
    const handleSelectLine = (detailId: number, checked: boolean) => {
        if (checked) {
            const line = salesOrderLines.find((candidate) => candidate.detail_id === detailId);
            if (!line || !isSchedulableSalesOrderLine(line)) return;
            setSelectedDetailIds((prev) => [...prev, detailId]);
        } else {
            setSelectedDetailIds((prev) => prev.filter((id) => id !== detailId));
        }
    };

    // Open Release Modal & initialize parameters
    const handleInitiateRelease = () => {
        if (parseValidBranchId(selectedBranchId) === null) {
            toast.error("Please select a target branch before releasing a Job Order.");
            return;
        }
        if (!mergeValidation.isValid) return;

        // Sum total demand
        // Sales-Order-linked JO quantity is authoritative: it is the sum of
        // each selected line's remaining unfulfilled quantity. Net
        // requirements may inform planning, but must not change this link.
        const totalRemaining = selectedLines.reduce((sum, line) => sum + remainingQuantity(line), 0);
        if (totalRemaining <= 0) {
            toast.error("The selected Sales Order lines have no remaining quantity to schedule.");
            return;
        }

        // Auto generate a JO ID code
        const code = `JO-${Math.floor(100000 + Math.random() * 900000)}`;

        setTargetQuantity(0);
        setJoNumber(code);
        setPlannedDate(new Date().toISOString().split("T")[0]);
        setDueDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]);
        setShiftOption("");
        setPriority(0);
        setRemarks(`Production run for: ${selectedLines.map(l => l.order_no).join(", ")}`);
        setIsConfirmOpen(true);
    };

    // Release JO Submit
    const handleConfirmRelease = async (
        selectedSubAssemblyVersions?: Record<number, number>,
        groupConfigurations?: Record<string, { subAssemblyVersions: Record<number, number>; assignments: Record<number, number[]> }>,
        initialize = false
    ) => {
        const branchId = parseValidBranchId(selectedBranchId);
        if (branchId === null) {
            toast.error("Please select a target branch before creating a Job Order.");
            return;
        }
        if (selectedLines.length === 0) return;

        const maxAvailableQuantity = selectedLines.reduce((sum, line) => sum + remainingQuantity(line), 0);
        if (releaseGroups.length === 1 && (!Number.isFinite(targetQuantity) || targetQuantity <= 0)) {
            toast.error("Enter a valid Job Order target quantity.");
            return;
        }
        if (releaseGroups.length === 1 && targetQuantity < maxAvailableQuantity - 0.000001) {
            toast.error(`The requested Job Order quantity (${targetQuantity}) is less than the required Sales Order quantity (${maxAvailableQuantity}). Job Order quantity cannot be less than Sales Order quantity.`);
            return;
        }

        setReleasingJO(true);
        try {
            let createdJobOrderNo = "";
            if (releaseGroups.length > 1) {
                const result = await releaseMultipleJobOrders({
                    action: "release-multiple",
                    initialize,
                    usePhysicalOnHand: initialize,
                    baseJoNumber: joNumber,
                    shared: { branchId, plannedDate, dueDate, priority, shiftOption, remarks },
                    jobs: releaseGroups.map((group) => {
                        const configuration = groupConfigurations?.[group.key];
                        return {
                            productId: group.productId,
                            productName: group.productName,
                            bomVersionId: group.bomVersionId,
                            quantity: group.totalRemainingQuantity,
                            salesOrderIds: group.salesOrderIds,
                            salesOrderDetailIds: group.salesOrderDetailIds,
                            subAssemblyVersionMap: configuration?.subAssemblyVersions || {},
                            assignments: configuration?.assignments || {}
                        };
                    })
                });
                const firstCreatedJob = result.jobs?.[0];
                createdJobOrderNo = String(firstCreatedJob?.jo_id || firstCreatedJob?.job_order_no || "").trim();
                if (!createdJobOrderNo) {
                    throw new Error("The created Job Orders did not return a valid Job Order reference.");
                }
                toast.success(initialize
                    ? `${result.jobs?.length || releaseGroups.length} Job Orders initialized and ready for material picking.`
                    : `${result.jobs?.length || releaseGroups.length} Job Orders saved as Draft.`);
            } else {
                const firstLine = selectedLines[0];
                const targetProductId = firstLine.product_id?.product_id;
                const targetProductName = firstLine.product_id?.product_name;
                const uniqueSalesOrderIds = Array.from(new Set(selectedLines.map((l) => l.order_id)));
                const result = await releaseJobOrder({
                    jo: {
                        jo_id: joNumber,
                        product_id: targetProductId,
                        product_name: targetProductName,
                        quantity: targetQuantity,
                        due_date: dueDate,
                        start_date: plannedDate,
                        uom_id: Number((firstLine.product_id as any)?.uom_id || 0) || null,
                        priority,
                        status: JOB_ORDER_STATUS.DRAFT,
                        is_batched: selectedLines.length > 1,
                        branch_id: branchId,
                        shiftOption,
                        remarks,
                        bom: { version_id: firstLine.bom_version_id },
                        subAssemblyVersionMap: selectedSubAssemblyVersions || {},
                        assignments,
                        products: [{
                            product_id: targetProductId,
                            product_name: targetProductName,
                            quantity: targetQuantity,
                            bom: { version_id: firstLine.bom_version_id }
                        }]
                    },
                    salesOrderIds: uniqueSalesOrderIds,
                    salesOrderDetailIds: selectedLines.map((line) => line.detail_id),
                    initialize,
                    usePhysicalOnHand: initialize
                });
                createdJobOrderNo = String(result.jo_id || result.job_order_no || joNumber).trim();

                if (!initialize) {
                    toast.success(`Job Order ${joNumber} saved as Draft. Initialize it from the Job Order Queue when ready.`);
                } else {
                    toast.success(`Job Order ${joNumber} initialized and ready for material picking.`);
                }
            }
            setIsConfirmOpen(false);
            setSelectedDetailIds([]);
            // Refresh the queue before redirecting so the deep-link resolver
            // can open the newly created JO and select its persisted branch.
            await openCreatedJobOrder(createdJobOrderNo);
        } catch (err: any) {
            console.error("Error releasing job order:", err);
            toast.error(err.message || "An error occurred during Job Order explosion & release.");
        } finally {
            setReleasingJO(false);
        }
    };

    // Direct Allocate Submit
    const handleConfirmDirectAllocate = async () => {
        const branchId = parseValidBranchId(selectedBranchId);
        if (branchId === null) {
            toast.error("Please select a target branch before direct allocation.");
            return;
        }
        if (selectedLines.length === 0) return;
        if (releaseGroups.length !== 1) {
            toast.error("Direct allocation is available only when one product and recipe version group is selected.");
            return;
        }
 
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
                branchId,
                productId: targetProductId,
                recipeVersionId: targetVersionId,
                lines: selectedLines.map(l => ({
                    detail_id: l.detail_id,
                    ordered_quantity: remainingQuantity(l)
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
        if (parseValidBranchId(selectedBranchId) === null || !mergeValidation.isValid || releaseGroups.length !== 1 || selectedLines.length === 0) {
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
    }, [selectedBranchId, selectedLines, releaseGroups, mergeValidation.isValid]);

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
        deepLinkJo,
        clearDeepLinkJo: () => setDeepLinkJo(null),
        deepLinkNotice,
        setDeepLinkNotice,
        salesOrderLines,
        salesOrderGroups,
        productionSalesOrderGroups,
        loadingProductionOrders,
        productionOrdersError,
        loadInProductionSalesOrders,
        selectedLines,
        releaseGroups,
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
