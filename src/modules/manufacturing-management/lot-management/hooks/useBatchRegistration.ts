import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
    Batch,
    BatchStatus,
    BatchQaStatus,
    CreateBatchPayload,
    UpdateBatchPayload,
    Lot,
    LotKpiMetrics,
    ProductItem
} from "../types";
import {
    fetchBatches,
    createBatch,
    updateBatch,
    deleteBatch,
    fetchProducts
} from "../services/lot-management-api";
import { getFefoPriorityMap, evaluateBatchEligibility, sortBatchesForDisplay } from "../utils/fefoEngine";
import { resolveProductClassification } from "@/modules/manufacturing-management/shared/services/lot-tracking.service";

export function useBatchRegistration(
    lots: Lot[],
    selectedProductId: number | "ALL" = "ALL",
    selectedLotId: number | "ALL" = "ALL",
    selectedBatchId: number | "ALL" = "ALL",
    globalSearchQuery: string = "",
    selectedBranchId: number | "ALL" = "ALL",
    selectedProductType: string | "ALL" = "ALL",
    selectedUomId: number | "ALL" = "ALL"
) {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [products, setProducts] = useState<ProductItem[]>([]);
    const [loadingBatches, setLoadingBatches] = useState(true);
    const [savingBatch, setSavingBatch] = useState(false);
    
    // Filters & Search
    const [selectedLotFilter, setSelectedLotFilter] = useState<number | "ALL">("ALL");
    const [statusFilter, setStatusFilter] = useState<string>("ALL");
    const [batchSearchQuery, setBatchSearchQuery] = useState("");

    // Dialog state
    const [isBatchFormOpen, setIsBatchFormOpen] = useState(false);
    const [editingBatch, setEditingBatch] = useState<Batch | null>(null);

    const [batchFormData, setBatchFormData] = useState<{
        batchNumber: string;
        lotId: number | "";
        productId: number | "";
        itemCode: string;
        quantity: string;
        unitCost: string;
        uomId: number | "";
        manufacturingDate: string;
        expirationDate: string;
        qaStatus: BatchQaStatus;
        status: BatchStatus;
        remarks: string;
    }>({
        batchNumber: "",
        lotId: "",
        productId: "",
        itemCode: "",
        quantity: "1",
        unitCost: "0.00",
        uomId: "",
        manufacturingDate: "",
        expirationDate: "",
        qaStatus: "GOOD",
        status: "ACTIVE",
        remarks: ""
    });

    const [batchFormErrors, setBatchFormErrors] = useState<Record<string, boolean>>({});

    const loadBatches = useCallback(async () => {
        setLoadingBatches(true);
        try {
            const [batchList, productList] = await Promise.all([
                fetchBatches(),
                fetchProducts().catch(() => [])
            ]);
            
            const reconciledBatches = batchList.map((b) => {
                const matchedP = productList.find((p) => Number(p.productId) === Number(b.productId));
                const prodName = (matchedP?.productName && !matchedP.productName.startsWith("Product #"))
                    ? matchedP.productName
                    : (b.productName && !b.productName.startsWith("Product #") ? b.productName : (matchedP?.productName || b.productName || `Product #${b.productId}`));
                const itemCode = (matchedP?.skuCode && !matchedP.skuCode.startsWith("PROD-"))
                    ? matchedP.skuCode
                    : (b.itemCode && !b.itemCode.startsWith("PROD-") ? b.itemCode : (matchedP?.skuCode || b.itemCode || `PROD-${b.productId}`));

                const pType = (matchedP as { productType?: unknown; product_type?: unknown })?.productType || (matchedP as { productType?: unknown; product_type?: unknown })?.product_type || b.productType;
                const pCat = (matchedP as { productCategory?: unknown; category_name?: unknown })?.productCategory || (matchedP as { productCategory?: unknown; category_name?: unknown })?.category_name || b.productCategory;

                return {
                    ...b,
                    productName: prodName,
                    itemCode: itemCode,
                    productType: pType,
                    productCategory: pCat
                };
            });

            setBatches(reconciledBatches);
            setProducts(productList);
        } catch (e) {
            console.error("Failed to load batches:", e);
            toast.error("Failed to load registered batches");
        } finally {
            setLoadingBatches(false);
        }
    }, []);

    useEffect(() => {
        let isMounted = true;
        Promise.all([
            fetchBatches(),
            fetchProducts().catch(() => [])
        ])
            .then(([batchList, productList]) => {
                if (isMounted) {
                    const reconciledBatches = batchList.map((b) => {
                        const matchedP = productList.find((p) => Number(p.productId) === Number(b.productId));
                        const prodName = (matchedP?.productName && !matchedP.productName.startsWith("Product #"))
                            ? matchedP.productName
                            : (b.productName && !b.productName.startsWith("Product #") ? b.productName : (matchedP?.productName || b.productName || `Product #${b.productId}`));
                        const itemCode = (matchedP?.skuCode && !matchedP.skuCode.startsWith("PROD-"))
                            ? matchedP.skuCode
                            : (b.itemCode && !b.itemCode.startsWith("PROD-") ? b.itemCode : (matchedP?.skuCode || b.itemCode || `PROD-${b.productId}`));

                        const pType = (matchedP as { productType?: unknown; product_type?: unknown })?.productType || (matchedP as { productType?: unknown; product_type?: unknown })?.product_type || b.productType;
                        const pCat = (matchedP as { productCategory?: unknown; category_name?: unknown })?.productCategory || (matchedP as { productCategory?: unknown; category_name?: unknown })?.category_name || b.productCategory;

                        return {
                            ...b,
                            productName: prodName,
                            itemCode: itemCode,
                            productType: pType,
                            productCategory: pCat
                        };
                    });

                    setBatches(reconciledBatches);
                    setProducts(productList);
                    setLoadingBatches(false);
                }
            })
            .catch((e) => {
                if (isMounted) {
                    console.error("Failed to load batches:", e);
                    toast.error("Failed to load registered batches");
                    setLoadingBatches(false);
                }
            });
        return () => {
            isMounted = false;
        };
    }, []);

    const openCreateBatchDialog = (preselectedLotId?: number) => {
        const defaultLotId = preselectedLotId || (lots.length > 0 ? lots[0].lotId : "");
        const defaultProduct = products.length > 0 ? products[0] : null;
        const matchedLot = lots.find((l) => l.lotId === defaultLotId);
        const resolvedCost = defaultProduct?.unitCost !== undefined
            ? String(defaultProduct.unitCost)
            : (defaultProduct?.cost_per_unit !== undefined ? String(defaultProduct.cost_per_unit) : "0.00");

        setBatchFormData({
            batchNumber: "",
            lotId: defaultLotId,
            productId: defaultProduct ? defaultProduct.productId : "",
            itemCode: defaultProduct ? defaultProduct.skuCode : "",
            quantity: "1",
            unitCost: resolvedCost || "0.00",
            uomId: matchedLot?.uomId || "",
            manufacturingDate: "",
            expirationDate: "",
            qaStatus: "GOOD",
            status: "ACTIVE",
            remarks: ""
        });
        setEditingBatch(null);
        setBatchFormErrors({});
        setIsBatchFormOpen(true);
    };

    const openEditBatchDialog = (batch: Batch) => {
        setEditingBatch(batch);
        setBatchFormData({
            batchNumber: batch.batchNumber,
            lotId: batch.lotId,
            productId: batch.productId,
            itemCode: batch.itemCode,
            quantity: String(batch.quantity || "0"),
            unitCost: String(batch.unitCost || "0.00"),
            uomId: batch.uomId || "",
            manufacturingDate: batch.manufacturingDate ? batch.manufacturingDate.substring(0, 10) : "",
            expirationDate: batch.expirationDate ? batch.expirationDate.substring(0, 10) : "",
            qaStatus: batch.qaStatus || "GOOD",
            status: batch.status || "ACTIVE",
            remarks: batch.remarks || ""
        });
        setBatchFormErrors({});
        setIsBatchFormOpen(true);
    };

    const closeBatchDialog = () => {
        setIsBatchFormOpen(false);
        setEditingBatch(null);
        setBatchFormErrors({});
    };

    const handleBatchFormChange = (field: string, value: unknown) => {
        if (field === "lotId" && typeof value === "number") {
            const matchedLot = lots.find((l) => l.lotId === value);
            setBatchFormData((prev) => ({
                ...prev,
                lotId: value,
                uomId: matchedLot?.uomId || prev.uomId
            }));
            return;
        }

        if (field === "productId" && typeof value === "number") {
            const matchedProduct = products.find((p) => p.productId === value);
            const resolvedCost = matchedProduct?.unitCost !== undefined
                ? String(matchedProduct.unitCost)
                : (matchedProduct?.cost_per_unit !== undefined ? String(matchedProduct.cost_per_unit) : "");

            setBatchFormData((prev) => ({
                ...prev,
                productId: value,
                itemCode: matchedProduct?.skuCode || prev.itemCode,
                unitCost: resolvedCost !== "" ? resolvedCost : prev.unitCost
            }));
            return;
        }

        setBatchFormData((prev) => ({
            ...prev,
            [field]: value
        }));

        setBatchFormErrors((prev) => ({
            ...prev,
            [field]: false
        }));
    };

    const validateBatchForm = (): boolean => {
        const errors: Record<string, boolean> = {};

        if (!batchFormData.batchNumber.trim()) {
            errors.batchNumber = true;
            toast.error("Batch Number (batch_no) is required");
        }

        if (batchFormData.lotId === "") {
            errors.lotId = true;
            toast.error("Storage Lot selection is required");
        }

        if (batchFormData.productId === "") {
            errors.productId = true;
            toast.error("Product Material selection is required");
        }

        const qty = Number(batchFormData.quantity);
        if (isNaN(qty) || qty <= 0) {
            errors.quantity = true;
            toast.error("Quantity must be a positive number greater than 0");
        }

        if (batchFormData.manufacturingDate && batchFormData.expirationDate) {
            const mfg = new Date(batchFormData.manufacturingDate).getTime();
            const exp = new Date(batchFormData.expirationDate).getTime();
            if (exp < mfg) {
                errors.expirationDate = true;
                toast.error("Expiration Date cannot be earlier than Manufacturing Date");
            }
        }

        setBatchFormErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleCreateBatch = async () => {
        if (!validateBatchForm()) return;
        setSavingBatch(true);
        try {
            const payload: CreateBatchPayload = {
                batch_no: batchFormData.batchNumber.trim(),
                lot_id: Number(batchFormData.lotId),
                product_id: Number(batchFormData.productId),
                item_code: batchFormData.itemCode.trim() || undefined,
                quantity: Number(batchFormData.quantity),
                unit_cost: Number(batchFormData.unitCost) || 0,
                manufacturing_date: batchFormData.manufacturingDate || null,
                expiry_date: batchFormData.expirationDate || null,
                qa_status: batchFormData.qaStatus,
                status: batchFormData.status,
                remarks: batchFormData.remarks.trim() || null
            };

            await createBatch(payload);
            toast.success(`Batch "${batchFormData.batchNumber}" created successfully!`);
            closeBatchDialog();
            await loadBatches();
        } catch (e) {
            console.error("Failed to create batch:", e);
            toast.error(e instanceof Error ? e.message : "Failed to create batch");
        } finally {
            setSavingBatch(false);
        }
    };

    const handleUpdateBatch = async () => {
        if (!editingBatch || !validateBatchForm()) return;
        setSavingBatch(true);
        try {
            const payload: UpdateBatchPayload = {
                batch_no: batchFormData.batchNumber.trim(),
                lot_id: Number(batchFormData.lotId),
                product_id: Number(batchFormData.productId),
                quantity: Number(batchFormData.quantity),
                unit_cost: Number(batchFormData.unitCost) || 0,
                manufacturing_date: batchFormData.manufacturingDate || null,
                expiry_date: batchFormData.expirationDate || null,
                qa_status: batchFormData.qaStatus,
                status: batchFormData.status,
                remarks: batchFormData.remarks.trim() || null
            };

            await updateBatch(editingBatch.batchId, payload);
            toast.success(`Batch "${batchFormData.batchNumber}" updated successfully!`);
            closeBatchDialog();
            await loadBatches();
        } catch (e) {
            console.error("Failed to update batch:", e);
            toast.error(e instanceof Error ? e.message : "Failed to update batch");
        } finally {
            setSavingBatch(false);
        }
    };

    const handleDeleteBatch = async (batchId: number) => {
        setSavingBatch(true);
        try {
            await deleteBatch(batchId);
            toast.success("Batch deleted successfully!");
            await loadBatches();
        } catch (e) {
            console.error("Failed to delete batch:", e);
            toast.error(e instanceof Error ? e.message : "Failed to delete batch");
        } finally {
            setSavingBatch(false);
        }
    };

    const filteredBatches = useMemo(() => {
        const rawFiltered = batches.filter((b) => {
            if (selectedBranchId !== "ALL") {
                const matchedLot = lots.find((l) => Number(l.lotId) === Number(b.lotId));
                if (matchedLot && Number(matchedLot.branchId) !== Number(selectedBranchId)) {
                    return false;
                }
            }
            if (selectedProductType !== "ALL") {
                const cls = resolveProductClassification(b.productType, b.productCategory, b.itemCode, b.productName);
                if (cls.code !== selectedProductType) {
                    return false;
                }
            }
            if (selectedUomId !== "ALL") {
                const matchedLot = lots.find((l) => Number(l.lotId) === Number(b.lotId));
                if (Number(b.uomId) !== Number(selectedUomId) && Number(matchedLot?.uomId) !== Number(selectedUomId)) {
                    return false;
                }
            }
            const matchesProduct = selectedProductId === "ALL" || Number(b.productId) === Number(selectedProductId);
            const matchesGlobalLot = selectedLotId === "ALL" || Number(b.lotId) === Number(selectedLotId);
            const matchesLocalLot = selectedLotFilter === "ALL" || Number(b.lotId) === Number(selectedLotFilter);
            const matchesBatch = selectedBatchId === "ALL" || Number(b.batchId) === Number(selectedBatchId);
            const matchesStatus = statusFilter === "ALL" || b.status === statusFilter || b.qaStatus === statusFilter;
            
            const localQuery = batchSearchQuery.toLowerCase().trim();
            const globalQuery = globalSearchQuery.toLowerCase().trim();

            const matchesText = (q: string) =>
                !q ||
                b.batchNumber.toLowerCase().includes(q) ||
                b.lotName.toLowerCase().includes(q) ||
                b.productName?.toLowerCase().includes(q) ||
                b.itemCode.toLowerCase().includes(q) ||
                b.remarks.toLowerCase().includes(q);

            return (
                matchesProduct &&
                matchesGlobalLot &&
                matchesLocalLot &&
                matchesBatch &&
                matchesStatus &&
                matchesText(localQuery) &&
                matchesText(globalQuery)
            );
        });

        // Sort by FEFO Priority order (#1 FEFO NEXT items at the top)
        const fefoSorted = sortBatchesForDisplay(rawFiltered, selectedProductId);

        return fefoSorted.map((b, idx) => ({ ...b, displayNumber: idx + 1 }));
    }, [
        batches,
        lots,
        selectedBranchId,
        selectedProductType,
        selectedUomId,
        selectedLotFilter,
        selectedLotId,
        selectedBatchId,
        statusFilter,
        batchSearchQuery,
        globalSearchQuery,
        selectedProductId
    ]);

    const kpiMetrics: LotKpiMetrics = useMemo(() => {
        const isAllBranches = selectedBranchId === "ALL";
        const isAllTypes = selectedProductType === "ALL";
        const isAllUoms = selectedUomId === "ALL";
        const isAllProducts = selectedProductId === "ALL";
        const isAllLots = selectedLotId === "ALL";
        const isAllBatches = selectedBatchId === "ALL";
        const globalQuery = globalSearchQuery.toLowerCase().trim();

        const targetBatches = batches.filter((b) => {
            if (!isAllBranches) {
                const matchedLot = lots.find((l) => Number(l.lotId) === Number(b.lotId));
                if (matchedLot && Number(matchedLot.branchId) !== Number(selectedBranchId)) {
                    return false;
                }
            }
            if (!isAllTypes) {
                const cls = resolveProductClassification(b.productType, b.productCategory, b.itemCode, b.productName);
                if (cls.code !== selectedProductType) {
                    return false;
                }
            }
            if (!isAllUoms) {
                const matchedLot = lots.find((l) => Number(l.lotId) === Number(b.lotId));
                if (Number(b.uomId) !== Number(selectedUomId) && Number(matchedLot?.uomId) !== Number(selectedUomId)) {
                    return false;
                }
            }
            if (!isAllProducts && Number(b.productId) !== Number(selectedProductId)) return false;
            if (!isAllLots && Number(b.lotId) !== Number(selectedLotId)) return false;
            if (!isAllBatches && Number(b.batchId) !== Number(selectedBatchId)) return false;
            if (globalQuery) {
                const matches =
                    b.batchNumber.toLowerCase().includes(globalQuery) ||
                    b.lotName.toLowerCase().includes(globalQuery) ||
                    b.productName?.toLowerCase().includes(globalQuery) ||
                    b.itemCode.toLowerCase().includes(globalQuery) ||
                    b.remarks.toLowerCase().includes(globalQuery);
                if (!matches) return false;
            }
            return true;
        });

        const fefoMap = getFefoPriorityMap(targetBatches, selectedProductId);
        const relevantLotIds = new Set(targetBatches.map((b) => b.lotId));
        let branchLots = !isAllBranches ? lots.filter((l) => Number(l.branchId) === Number(selectedBranchId)) : lots;
        if (!isAllUoms) {
            branchLots = branchLots.filter((l) => Number(l.uomId) === Number(selectedUomId));
        }
        const totalLots = isAllBranches && isAllTypes && isAllUoms && isAllProducts && isAllLots && isAllBatches && !globalQuery
            ? lots.length
            : branchLots.filter((l) => relevantLotIds.has(l.lotId)).length;
        const totalBatches = targetBatches.length;

        let totalQuantity = 0;
        let activeQuantity = 0;
        let fefoNextCount = 0;
        let quarantinedOrExpiring = 0;
        const fefoNextBatches: Batch[] = [];

        targetBatches.forEach((b) => {
            const qty = Number(b.quantity || 0);
            totalQuantity += qty;

            const fefoInfo = fefoMap.get(b.batchId);
            if (fefoInfo?.isFefoNext) {
                fefoNextCount++;
                fefoNextBatches.push(b);
            }

            const evalRes = evaluateBatchEligibility(b);
            if (evalRes.isEligible) {
                activeQuantity += qty;
            } else {
                quarantinedOrExpiring++;
            }
        });

        fefoNextBatches.sort((a, b) => {
            const expA = a.expirationDate ? new Date(a.expirationDate).getTime() : Infinity;
            const expB = b.expirationDate ? new Date(b.expirationDate).getTime() : Infinity;
            return expA - expB;
        });

        const selectedProd = !isAllProducts
            ? products.find((p) => Number(p.productId) === Number(selectedProductId))
            : undefined;
        const selectedProductName = selectedProd?.productName || (selectedProd ? `Product #${selectedProd.productId}` : undefined);

        return {
            totalLots,
            totalBatches,
            totalQuantity,
            quarantinedOrExpiring,
            fefoNextCount,
            activeQuantity,
            fefoNextBatches,
            fefoNextBatchNumbers: fefoNextBatches.map((b) => b.batchNumber),
            selectedProductName
        };
    }, [
        lots,
        batches,
        products,
        selectedBranchId,
        selectedProductType,
        selectedUomId,
        selectedProductId,
        selectedLotId,
        selectedBatchId,
        globalSearchQuery
    ]);

    return {
        batches,
        products,
        loadingBatches,
        savingBatch,
        selectedLotFilter,
        setSelectedLotFilter,
        statusFilter,
        setStatusFilter,
        batchSearchQuery,
        setBatchSearchQuery,
        isBatchFormOpen,
        editingBatch,
        batchFormData,
        batchFormErrors,
        openCreateBatchDialog,
        openEditBatchDialog,
        closeBatchDialog,
        handleBatchFormChange,
        handleCreateBatch,
        handleUpdateBatch,
        handleDeleteBatch,
        filteredBatches,
        kpiMetrics,
        loadBatches
    };
}
