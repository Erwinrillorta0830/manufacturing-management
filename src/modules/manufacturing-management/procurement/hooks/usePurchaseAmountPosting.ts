"use client";

import { useState, useEffect, useMemo } from "react";
import {
    ChartOfAccount,
    POLineItem,
    LandedExpenseRow,
    HybridCalculationResult
} from "../components/purchase-amount/types";
import {
    fetchEligibleOrders,
    fetchPurchaseAmountDetails,
    postPurchaseAmounts
} from "../services/purchase-amount-api";
import { isForeignCountry } from "../supplier-country";

export interface PurchaseOrderOption {
    purchase_order_id?: number;
    shipment_id?: number;
    id?: number;
    reference_number?: string;
    purchase_order_no?: string;
    supplier_name?: string | {
        id?: number;
        supplier_name?: string;
        is_foreign?: number | boolean;
        default_currency?: string;
        country?: string;
    } | null;
    is_posted?: number | boolean;
    is_posted_amounts?: number | boolean;
    inventory_status?: number | null;
    payment_status?: number | null;
    status?: string | null;
    is_import?: number;
    currency_code?: string;
    exchange_rate?: number;
    total_amount?: number;
    total_foreign_currency?: number;
    [key: string]: unknown;
}

export function usePurchaseAmountPosting(
    propShipments?: PurchaseOrderOption[],
    propSelectedShipment?: PurchaseOrderOption | null,
    propSetSelectedShipment?: (shipment: PurchaseOrderOption | null) => void
) {
    const [loading, setLoading] = useState(false);
    const [posting, setPosting] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const [chartOfAccounts, setChartOfAccounts] = useState<ChartOfAccount[]>([]);
    const [exchangeRate, setExchangeRate] = useState<number>(58.50);
    const [lineItems, setLineItems] = useState<POLineItem[]>([]);
    
    // Landed cost entries
    const [landedExpenses, setLandedExpenses] = useState<LandedExpenseRow[]>([
        { id: "1", chart_of_account_id: 0, amount: 0, allocation_method: "hybrid" }
    ]);

    const [fetchedOrders, setFetchedOrders] = useState<PurchaseOrderOption[]>([]);
    const [internalSelected, setInternalSelected] = useState<PurchaseOrderOption | null>(null);

    // Fetch purchase orders directly from API to ensure full is_posted status tracking
    useEffect(() => {
        fetchEligibleOrders()
            .then(list => setFetchedOrders(list))
            .catch(() => {});
    }, [propShipments]);

    const allOrders = useMemo(
        () => (fetchedOrders.length > 0 ? fetchedOrders : propShipments || []),
        [fetchedOrders, propShipments]
    );

    const postedOrders = useMemo(() => {
        return allOrders.filter(po => Number(po.is_posted) === 1 || Number(po.is_posted_amounts) === 1);
    }, [allOrders]);

    const eligibleOrders = useMemo(() => {
        return allOrders.filter(po => {
            const isPosted = Number(po.is_posted) === 1 || Number(po.is_posted_amounts) === 1;
            if (isPosted) return false;

            const invStatus = Number(po.inventory_status || 0);
            const payStatus = Number(po.payment_status || 0);
            const statusStr = String(po.status || "").toLowerCase();

            // Must be Received (6/10) or Partially Received (9)
            const isReceived = invStatus === 6 || invStatus === 9 || invStatus === 10 || statusStr.includes("received");
            // Must be Awaiting Payment (1 or 2)
            const isAwaitingPayment = payStatus === 1 || payStatus === 2 || payStatus === 0 || po.payment_status == null;

            return isReceived && isAwaitingPayment;
        });
    }, [allOrders]);

    const selectedShipment = propSelectedShipment || internalSelected || (eligibleOrders.length > 0 ? eligibleOrders[0] : null);

    const handleSelectPO = (po: PurchaseOrderOption) => {
        if (propSetSelectedShipment) propSetSelectedShipment(po);
        setInternalSelected(po);
    };

    const isForeignPO = useMemo(() => {
        if (!selectedShipment) return false;
        const supp = selectedShipment.supplier_name;
        const suppIsForeign = typeof supp === "object" && supp !== null && (
            supp?.is_foreign === 1 ||
            supp?.is_foreign === true ||
            (supp as { default_currency?: string })?.default_currency === "USD" ||
            isForeignCountry(supp?.country)
        );
        return selectedShipment.is_import === 1 || selectedShipment.currency_code === "USD" || Boolean(suppIsForeign);
    }, [selectedShipment]);

    // Fetch PO details when active selection changes
    useEffect(() => {
        if (!selectedShipment?.purchase_order_id && !selectedShipment?.shipment_id) return;
        const poId = selectedShipment.purchase_order_id || selectedShipment.shipment_id;
        if (!poId) return;

        setLoading(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        fetchPurchaseAmountDetails(poId)
            .then(data => {
                if (data.chartOfAccounts) {
                    setChartOfAccounts(data.chartOfAccounts);
                }
                if (data.activeForexRate) {
                    setExchangeRate(data.purchaseOrder?.exchange_rate || data.activeForexRate || 58.50);
                }
                if (data.lineItems) {
                    setLineItems(data.lineItems.map((item: Record<string, unknown>) => {
                        const prodObj = typeof item.product_id === "object" && item.product_id !== null ? (item.product_id as Record<string, unknown>) : null;
                        const pType = prodObj?.product_type ?? prodObj?.product_type_id;
                        const pCode = String(prodObj?.product_code || "").toUpperCase();

                        let categoryVal = "389";
                        if (pType === 390 || String(pType) === "390" || pCode.startsWith("PKG-")) {
                            categoryVal = "390";
                        } else if (pType === 388 || String(pType) === "388" || pCode.startsWith("FG-")) {
                            categoryVal = "388";
                        } else if (pType === 389 || String(pType) === "389" || pCode.startsWith("RM-")) {
                            categoryVal = "389";
                        } else if (prodObj?.product_category) {
                            categoryVal = String(prodObj.product_category);
                        }

                        const weightVal = Number(item.gross_weight) || Number(prodObj?.weight) || Number(prodObj?.product_weight) || 0;

                        return {
                            ...item,
                            product_name: (prodObj?.product_name as string) || `Product #${item.product_id}`,
                            product_category: categoryVal,
                            gross_weight: weightVal
                        } as POLineItem;
                    }));
                }
                if (data.importExpenses && data.importExpenses.length > 0) {
                    setLandedExpenses(data.importExpenses.map((exp: Record<string, unknown>, index: number) => ({
                        id: String(exp.po_import_id || index + 1),
                        chart_of_account_id: Number(exp.chart_of_account_id) || 0,
                        amount: Number(exp.amount) || 0,
                        allocation_method: (exp.allocation_method as string) || "hybrid"
                    })));
                }
            })
            .catch(err => {
                setErrorMessage((err as Error).message || "Failed to load PO amount posting details");
            })
            .finally(() => setLoading(false));
    }, [selectedShipment]);

    // Hybrid Allocation Calculation Engine Preview
    const calculationResult = useMemo<HybridCalculationResult>(() => {
        const totalLandedFee = landedExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        if (lineItems.length === 0 || totalLandedFee === 0) {
            return {
                lineCalculations: lineItems.map(item => {
                    const price = Number(item.unit_price) || 0;
                    const basePhp = isForeignPO ? price * exchangeRate : price;
                    return {
                        ...item,
                        allocated_amount: 0,
                        variance_adjustment: 0,
                        allocated_expense_php: 0,
                        final_landed_unit_cost: basePhp
                    };
                }),
                rmSubPool: 0,
                pkgSubPool: 0,
                totalLandedFee: 0,
                roundingVariance: 0,
                hasMissingWeight: false,
                missingWeightItems: []
            };
        }

        const isPkg = (item: POLineItem) => {
            const p = item.product_id;
            const typeId = typeof p === "object" && p !== null ? (p as { product_type?: number; category?: string | number }).product_type || (p as { product_type?: number; category?: string | number }).category : null;
            const cat = String(item.product_category || typeId || "").toUpperCase();
            return typeId === 390 || cat === "390" || cat === "PKG" || cat === "PACKAGING" || cat === "PACKAGING ITEMS";
        };

        const isRm = (item: POLineItem) => {
            const p = item.product_id;
            const typeId = typeof p === "object" && p !== null ? (p as { product_type?: number; category?: string | number }).product_type || (p as { product_type?: number; category?: string | number }).category : null;
            const cat = String(item.product_category || typeId || "").toUpperCase();
            return typeId === 389 || cat === "389" || cat === "RM" || cat === "RAW MATERIAL" || cat === "RAW MATERIALS";
        };

        const rmItems = lineItems.filter(i => isRm(i));
        const pkgItems = lineItems.filter(i => isPkg(i));
        const fgItems = lineItems.filter(i => !isRm(i) && !isPkg(i));

        const totalRMCommercialVal = rmItems.reduce((sum, i) => sum + (i.received_quantity || 0) * (i.unit_price || 0) * (isForeignPO ? exchangeRate : 1.0), 0);
        const totalPKGCommercialVal = pkgItems.reduce((sum, i) => sum + (i.received_quantity || 0) * (i.unit_price || 0) * (isForeignPO ? exchangeRate : 1.0), 0);
        const totalFGCommercialVal = fgItems.reduce((sum, i) => sum + (i.received_quantity || 0) * (i.unit_price || 0) * (isForeignPO ? exchangeRate : 1.0), 0);
        const totalPOCommercialVal = totalRMCommercialVal + totalPKGCommercialVal + totalFGCommercialVal;

        const rmRatio = totalPOCommercialVal > 0 ? totalRMCommercialVal / totalPOCommercialVal : 0;
        const pkgRatio = totalPOCommercialVal > 0 ? totalPKGCommercialVal / totalPOCommercialVal : 0;
        const fgRatio = totalPOCommercialVal > 0 ? totalFGCommercialVal / totalPOCommercialVal : 0;

        const rmSubPool = totalLandedFee * rmRatio;
        const pkgSubPool = totalLandedFee * pkgRatio;
        const fgSubPool = totalLandedFee * fgRatio;

        const totalRMQty = rmItems.reduce((sum, i) => sum + (i.received_quantity || 0), 0);
        const totalPKGWeight = pkgItems.reduce((sum, i) => sum + (Number(i.gross_weight) || 0) * (i.received_quantity || 0), 0);

        const missingWeightItems = pkgItems.filter(i => !i.gross_weight || Number(i.gross_weight) <= 0).map(i => i.product_name || `Product #${i.product_id}`);

        const rawAllocations = new Map<number, number>();

        for (const item of rmItems) {
            const fee = totalRMQty > 0 ? rmSubPool * ((item.received_quantity || 0) / totalRMQty) : rmSubPool / (rmItems.length || 1);
            rawAllocations.set(item.purchase_order_product_id, fee);
        }

        for (const item of pkgItems) {
            const w = Number(item.gross_weight) || 0;
            const fee = totalPKGWeight > 0 ? pkgSubPool * ((w * (item.received_quantity || 1)) / totalPKGWeight) : pkgSubPool / (pkgItems.length || 1);
            rawAllocations.set(item.purchase_order_product_id, fee);
        }

        for (const item of fgItems) {
            const itemCommVal = (item.received_quantity || 0) * (item.unit_price || 0) * (isForeignPO ? exchangeRate : 1.0);
            const fee = totalFGCommercialVal > 0 ? fgSubPool * (itemCommVal / totalFGCommercialVal) : fgSubPool / (fgItems.length || 1);
            rawAllocations.set(item.purchase_order_product_id, fee);
        }

        let sumRounded = 0;
        let maxCommValue = -1;
        let maxValId = -1;

        const roundMoney = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

        const lineCalcs = lineItems.map(item => {
            const commVal = (item.received_quantity || 0) * (item.unit_price || 0) * (isForeignPO ? exchangeRate : 1.0);
            if (commVal > maxCommValue) {
                maxCommValue = commVal;
                maxValId = item.purchase_order_product_id;
            }
            const raw = rawAllocations.get(item.purchase_order_product_id) || 0;
            const rounded = roundMoney(raw);
            sumRounded += rounded;

            return {
                ...item,
                allocated_amount: rounded,
                variance_adjustment: 0,
                allocated_expense_php: 0,
                final_landed_unit_cost: 0
            };
        });

        const diff = roundMoney(totalLandedFee - sumRounded);
        if (diff !== 0 && maxValId !== -1) {
            const target = lineCalcs.find(i => i.purchase_order_product_id === maxValId);
            if (target) {
                target.variance_adjustment = diff;
                target.allocated_amount = roundMoney(target.allocated_amount + diff);
            }
        }

        for (const item of lineCalcs) {
            const qty = item.received_quantity || 1;
            item.allocated_expense_php = roundMoney(item.allocated_amount / qty);
            const basePhp = (item.unit_price || 0) * (isForeignPO ? exchangeRate : 1.0);
            item.final_landed_unit_cost = roundMoney(basePhp + item.allocated_expense_php);
        }

        return {
            lineCalculations: lineCalcs,
            rmSubPool: roundMoney(rmSubPool),
            pkgSubPool: roundMoney(pkgSubPool),
            totalLandedFee: roundMoney(totalLandedFee),
            roundingVariance: diff,
            hasMissingWeight: missingWeightItems.length > 0,
            missingWeightItems
        };
    }, [lineItems, landedExpenses, exchangeRate, isForeignPO]);

    const handleAddExpenseRow = () => {
        const defaultCoa = chartOfAccounts[0]?.coa_id || chartOfAccounts[0]?.id || 0;
        setLandedExpenses(prev => [
            ...prev,
            { id: String(Date.now()), chart_of_account_id: defaultCoa, amount: 0, allocation_method: "hybrid" }
        ]);
    };

    const handleRemoveExpenseRow = (id: string) => {
        setLandedExpenses(prev => prev.filter(e => e.id !== id));
    };

    const handleUpdateExpenseRow = (id: string, field: keyof LandedExpenseRow, value: LandedExpenseRow[keyof LandedExpenseRow]) => {
        setLandedExpenses(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    };

    const handleExecutePosting = async () => {
        if (!selectedShipment) return;

        if (isForeignPO && calculationResult.hasMissingWeight) {
            setErrorMessage(`Gross Weight is required for Packaging items (${calculationResult.missingWeightItems.join(", ")}).`);
            return;
        }

        setPosting(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        try {
            const poId = selectedShipment.purchase_order_id || selectedShipment.shipment_id;
            const payload = {
                purchase_order_id: poId,
                is_foreign: isForeignPO,
                exchange_rate: isForeignPO ? exchangeRate : 1.0,
                expenses: isForeignPO ? landedExpenses.filter(e => e.chart_of_account_id > 0 && e.amount > 0) : [],
                line_items: calculationResult.lineCalculations.map(calc => ({
                    purchase_order_product_id: calc.purchase_order_product_id,
                    product_id: typeof calc.product_id === "object" && calc.product_id !== null ? (calc.product_id as { product_id: number }).product_id : calc.product_id,
                    product_category: calc.product_category,
                    gross_weight: calc.gross_weight,
                    received_quantity: calc.received_quantity,
                    unit_price: calc.unit_price,
                    discount_type: calc.discount_type,
                    discounted_amount: calc.discounted_amount,
                    vat_amount: calc.vat_amount,
                    withholding_amount: calc.withholding_amount,
                    total_amount: calc.total_amount,
                    allocated_expense_php: calc.allocated_expense_php,
                    final_landed_unit_cost: calc.final_landed_unit_cost
                }))
            };

            await postPurchaseAmounts(payload);
            setSuccessMessage("Purchase amounts & landed cost allocations posted successfully! Inventory costs and PO totals updated.");

            // Refresh orders list
            fetchEligibleOrders().then(list => setFetchedOrders(list)).catch(() => {});
            
            // Mark selected PO as posted in local state
            if (selectedShipment) {
                setFetchedOrders(prev => prev.map(p => {
                    const pId = p.purchase_order_id || p.shipment_id || p.id;
                    return pId === poId ? { ...p, is_posted: 1, is_posted_amounts: 1 } : p;
                }));
            }
        } catch (err) {
            setErrorMessage((err as Error).message || "Failed to post purchase amounts");
        } finally {
            setPosting(false);
        }
    };

    return {
        loading,
        posting,
        successMessage,
        errorMessage,
        eligibleOrders,
        postedOrders,
        selectedShipment,
        handleSelectPO,
        isForeignPO,
        exchangeRate,
        setExchangeRate,
        lineItems,
        setLineItems,
        landedExpenses,
        chartOfAccounts,
        calculationResult,
        handleAddExpenseRow,
        handleRemoveExpenseRow,
        handleUpdateExpenseRow,
        handleExecutePosting
    };
}
