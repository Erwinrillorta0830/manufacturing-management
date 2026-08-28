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

export function useBatchRegistration(lots: Lot[], selectedProductId: number | "ALL" = "ALL") {
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

                return {
                    ...b,
                    productName: prodName,
                    itemCode: itemCode
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

                        return {
                            ...b,
                            productName: prodName,
                            itemCode: itemCode
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
        const matchedLot = lots.find((l) => l.lotId === defaultLotId);
        const defaultProd = products.length > 0 ? products[0] : null;
        const defaultProdId = defaultProd ? defaultProd.productId : "";
        const initialCost = defaultProd?.unitCost !== undefined
            ? String(defaultProd.unitCost)
            : (defaultProd?.cost_per_unit !== undefined ? String(defaultProd.cost_per_unit) : "0.00");
        
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
        const autoSeq = String(batches.length + 1).padStart(3, "0");
        const suggestedBatchNo = `BAT-${todayStr}-${autoSeq}`;

        setBatchFormData({
            batchNumber: suggestedBatchNo,
            lotId: defaultLotId,
            productId: defaultProdId,
            itemCode: defaultProd ? defaultProd.skuCode : "",
            quantity: "1",
            unitCost: initialCost,
            uomId: matchedLot?.uomId || "",
            manufacturingDate: new Date().toISOString().slice(0, 10),
            expirationDate: "",
            qaStatus: "GOOD",
            status: "ACTIVE",
            remarks: ""
        });
        setBatchFormErrors({});
        setEditingBatch(null);
        setIsBatchFormOpen(true);
    };

    const openEditBatchDialog = (batch: Batch) => {
        setBatchFormData({
            batchNumber: batch.batchNumber,
            lotId: batch.lotId,
            productId: batch.productId || (products.length > 0 ? products[0].productId : ""),
            itemCode: batch.itemCode || "",
            quantity: String(batch.quantity || 1),
            unitCost: String(batch.unitCost || "0.00"),
            uomId: batch.uomId !== null ? batch.uomId : "",
            manufacturingDate: batch.manufacturingDate ? batch.manufacturingDate.slice(0, 10) : "",
            expirationDate: batch.expirationDate ? batch.expirationDate.slice(0, 10) : "",
            qaStatus: batch.qaStatus || "GOOD",
            status: batch.status || "ACTIVE",
            remarks: batch.remarks || ""
        });
        setBatchFormErrors({});
        setEditingBatch(batch);
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
            const matchedLot = lots.find((l) => l.lotId === Number(batchFormData.lotId));
            const targetBranchId = matchedLot?.branchId || 1;

            const payload: CreateBatchPayload = {
                batch_no: batchFormData.batchNumber.trim(),
                lot_id: Number(batchFormData.lotId),
                branch_id: targetBranchId,
                product_id: Number(batchFormData.productId),
                manufacturing_date: batchFormData.manufacturingDate || null,
                expiry_date: batchFormData.expirationDate || null,
                unit_cost: Number(batchFormData.unitCost || 0),
                qa_status: batchFormData.qaStatus,
                status: batchFormData.status,
                remarks: batchFormData.remarks.trim() || undefined,
                quantity: Number(batchFormData.quantity || 1),
                item_code: batchFormData.itemCode.trim() || undefined
            };

            await createBatch(payload);
            toast.success(`Batch "${batchFormData.batchNumber.trim()}" registered successfully!`);
            closeBatchDialog();
            await loadBatches();
        } catch (e) {
            console.error("Failed to register batch:", e);
            toast.error(e instanceof Error ? e.message : "Failed to register batch");
        } finally {
            setSavingBatch(false);
        }
    };

    const handleUpdateBatch = async () => {
        if (!editingBatch) return;
        if (!validateBatchForm()) return;
        setSavingBatch(true);
        try {
            const matchedLot = lots.find((l) => l.lotId === Number(batchFormData.lotId));
            const targetBranchId = matchedLot?.branchId || editingBatch.branchId || 1;

            const payload: UpdateBatchPayload = {
                batch_no: batchFormData.batchNumber.trim(),
                lot_id: Number(batchFormData.lotId),
                branch_id: targetBranchId,
                product_id: Number(batchFormData.productId),
                manufacturing_date: batchFormData.manufacturingDate || null,
                expiry_date: batchFormData.expirationDate || null,
                unit_cost: Number(batchFormData.unitCost || 0),
                qa_status: batchFormData.qaStatus,
                status: batchFormData.status,
                remarks: batchFormData.remarks.trim() || undefined,
                quantity: Number(batchFormData.quantity || 1)
            };

            await updateBatch(editingBatch.batchId, payload);
            toast.success("Batch updated successfully!");
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
            const matchesLot = selectedLotFilter === "ALL" || b.lotId === selectedLotFilter;
            const matchesStatus = statusFilter === "ALL" || b.status === statusFilter || b.qaStatus === statusFilter;
            const query = batchSearchQuery.toLowerCase().trim();
            const matchesSearch =
                !query ||
                b.batchNumber.toLowerCase().includes(query) ||
                b.lotName.toLowerCase().includes(query) ||
                b.productName?.toLowerCase().includes(query) ||
                b.itemCode.toLowerCase().includes(query) ||
                b.remarks.toLowerCase().includes(query);

            return matchesLot && matchesStatus && matchesSearch;
        });

        // Sort by FEFO Priority order (#1 FEFO NEXT items at the top)
        const fefoSorted = sortBatchesForDisplay(rawFiltered, selectedProductId);

        return fefoSorted.map((b, idx) => ({ ...b, displayNumber: idx + 1 }));
    }, [batches, selectedLotFilter, statusFilter, batchSearchQuery, selectedProductId]);

    const kpiMetrics: LotKpiMetrics = useMemo(() => {
        const fefoMap = getFefoPriorityMap(batches, selectedProductId);
        const totalLots = lots.length;
        const totalBatches = batches.length;

        let totalQuantity = 0;
        let activeQuantity = 0;
        let fefoNextCount = 0;
        let quarantinedOrExpiring = 0;

        batches.forEach((b) => {
            const qty = Number(b.quantity || 0);
            totalQuantity += qty;

            const fefoInfo = fefoMap.get(b.batchId);
            if (fefoInfo?.isFefoNext) {
                fefoNextCount++;
            }

            const evalRes = evaluateBatchEligibility(b);
            if (evalRes.isEligible) {
                activeQuantity += qty;
            } else {
                quarantinedOrExpiring++;
            }
        });

        return {
            totalLots,
            totalBatches,
            totalQuantity,
            quarantinedOrExpiring,
            fefoNextCount,
            activeQuantity
        };
    }, [lots, batches, selectedProductId]);

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
