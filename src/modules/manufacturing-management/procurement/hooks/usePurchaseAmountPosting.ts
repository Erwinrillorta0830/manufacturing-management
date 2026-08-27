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
import {
    LANDED_COST_INVENTORY_STATUS,
    isLandedCostPostingEligible,
    isPurchaseOrderPosted
} from "../landed-cost-eligibility";
import { resolveProductWeightBreakdown } from "../packaging-weight";
import { calculateLandedCost } from "../landed-cost-calculation";
import type { LandedCostAllocationRule } from "../types";

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
    const [exchangeRate, setExchangeRate] = useState<number>(1);
    const [currencyCode, setCurrencyCode] = useState("PHP");
    const [lineItems, setLineItems] = useState<POLineItem[]>([]);
    
    // Landed cost entries
    const [landedExpenses, setLandedExpenses] = useState<LandedExpenseRow[]>([
        { id: "1", chart_of_account_id: 0, amount: 0, allocation_method: "" }
    ]);
    const [allocationRule, setAllocationRule] = useState<LandedCostAllocationRule | "">("");

    const [fetchedOrders, setFetchedOrders] = useState<PurchaseOrderOption[]>([]);
    const [internalSelected, setInternalSelected] = useState<PurchaseOrderOption | null>(null);

    // Fetch purchase orders directly from API to ensure full is_posted status tracking
    useEffect(() => {
        fetchEligibleOrders()
            .then(list => setFetchedOrders(list))
            .catch(() => {});
    }, [propShipments]);

    // The filtered API response is authoritative. Do not fall back to the broad
    // shipment prop when it is empty, otherwise ineligible POs can re-enter the queue.
    const allOrders = useMemo(() => fetchedOrders, [fetchedOrders]);

    const postedOrders = useMemo(() => {
        return allOrders.filter(po => Number(po.inventory_status) === LANDED_COST_INVENTORY_STATUS && isPurchaseOrderPosted(po));
    }, [allOrders]);

    const eligibleOrders = useMemo(() => {
        return allOrders.filter(isLandedCostPostingEligible);
    }, [allOrders]);

    const selectedShipment = useMemo(() => {
        if (propSelectedShipment && isLandedCostPostingEligible(propSelectedShipment)) return propSelectedShipment;
        if (internalSelected && isLandedCostPostingEligible(internalSelected)) return internalSelected;
        return eligibleOrders[0] || null;
    }, [eligibleOrders, internalSelected, propSelectedShipment]);

    const handleSelectPO = (po: PurchaseOrderOption) => {
        if (propSetSelectedShipment) propSetSelectedShipment(po);
        setInternalSelected(po);
    };

    const isForeignPO = useMemo(() => currencyCode !== "PHP", [currencyCode]);

    // Fetch PO details when active selection changes
    useEffect(() => {
        if (!selectedShipment?.purchase_order_id && !selectedShipment?.shipment_id) return;
        const poId = selectedShipment.purchase_order_id || selectedShipment.shipment_id;
        if (!poId) return;

        setLoading(true);
        setErrorMessage(null);
        setSuccessMessage(null);
        setAllocationRule("");
        setLandedExpenses([{ id: "1", chart_of_account_id: 0, amount: 0, allocation_method: "" }]);
        setCurrencyCode("PHP");
        setExchangeRate(1);
        setLineItems([]);

        fetchPurchaseAmountDetails(poId)
            .then(data => {
                const persistedCurrencyCode = String(data.purchaseOrder?.currency_code || "PHP").trim().toUpperCase();
                const persistedExchangeRate = Number(data.purchaseOrder?.exchange_rate);
                setCurrencyCode(persistedCurrencyCode);
                setExchangeRate(persistedCurrencyCode === "PHP"
                    ? 1
                    : Number.isFinite(persistedExchangeRate) && persistedExchangeRate > 0
                        ? persistedExchangeRate
                        : 0);
                if (persistedCurrencyCode !== "PHP" && (!Number.isFinite(persistedExchangeRate) || persistedExchangeRate <= 0)) {
                    throw new Error(`A valid persisted exchange rate is required for ${persistedCurrencyCode} purchase orders.`);
                }
                if (data.chartOfAccounts) {
                    setChartOfAccounts(data.chartOfAccounts);
                }
                if (data.lineItems) {
                    setLineItems(data.lineItems.map((item: Record<string, unknown>) => {
                        const prodObj = typeof item.product_id === "object" && item.product_id !== null ? (item.product_id as Record<string, unknown>) : null;
                        const categoryType = item.category_type;
                        if (categoryType !== "RAW_MATERIAL" && categoryType !== "PACKAGING" && categoryType !== "FINISHED_GOODS") {
                            throw new Error(`Product ${prodObj?.product_id || item.product_id} has no valid RAW_MATERIAL, PACKAGING, or FINISHED_GOODS Category_Type.`);
                        }

                        const weightBreakdown = resolveProductWeightBreakdown(prodObj, {
                            requireComplete: categoryType === "PACKAGING"
                        });
                        const persistedLineGrossWeight = Number(item.line_gross_weight_kg);
                        const lineGrossWeightKg = Number.isFinite(persistedLineGrossWeight)
                            ? persistedLineGrossWeight
                            : weightBreakdown.grossWeightKg * Number(item.received_quantity || 0);
                        const baseUnitCostPhp = Number(item.base_unit_cost_php);
                        const unitPriceForeign = Number(item.unit_price_foreign);
                        if (!Number.isFinite(baseUnitCostPhp) || baseUnitCostPhp < 0) {
                            throw new Error(`Purchase-order line ${item.purchase_order_product_id} has no valid PHP base unit cost.`);
                        }
                        if (persistedCurrencyCode !== "PHP" && (!Number.isFinite(unitPriceForeign) || unitPriceForeign < 0)) {
                            throw new Error(`Purchase-order line ${item.purchase_order_product_id} has no valid ${persistedCurrencyCode} invoice unit price.`);
                        }

                        return {
                            ...item,
                            product_name: (prodObj?.product_name as string) || `Product #${item.product_id}`,
                            category_type: categoryType,
                            gross_weight: Number(item.gross_weight) || weightBreakdown.grossWeightKg,
                            net_weight: weightBreakdown.netWeight,
                            outer_carton_weight: weightBreakdown.outerCartonWeight,
                            pallet_weight: weightBreakdown.palletWeight,
                            unit_gross_weight_kg: weightBreakdown.grossWeightKg,
                            unit_net_weight_kg: weightBreakdown.netWeightKg,
                            unit_outer_carton_weight_kg: weightBreakdown.outerCartonWeightKg,
                            unit_pallet_weight_kg: weightBreakdown.palletWeightKg,
                            line_gross_weight_kg: lineGrossWeightKg,
                            unit_price: baseUnitCostPhp,
                            unit_price_foreign: Number.isFinite(unitPriceForeign) ? unitPriceForeign : baseUnitCostPhp,
                            base_unit_cost_php: baseUnitCostPhp,
                            accepted_quantity: Number(item.accepted_quantity ?? item.received_quantity) || 0
                        } as POLineItem;
                    }));
                }
                const canonicalExpenses = Array.isArray(data.landedCost?.expenses) && data.landedCost.expenses.length > 0
                    ? data.landedCost.expenses
                    : (Array.isArray(data.importExpenses) ? data.importExpenses : []);
                const storedRule = data.landedCost?.computation?.allocation_rule;
                if (canonicalExpenses.length > 0) {
                    if (storedRule === "Value" || storedRule === "Weight" || storedRule === "Volume" || storedRule === "Hybrid") {
                        setAllocationRule(storedRule);
                    }
                    setLandedExpenses(canonicalExpenses.map((exp: Record<string, unknown>, index: number) => ({
                        id: String(exp.po_import_id || index + 1),
                        chart_of_account_id: Number(exp.chart_of_account_id) || 0,
                        amount: Number(exp.amount ?? exp.amount_php) || 0,
                        allocation_method: storedRule || ""
                    })));
                } else if (storedRule) {
                    if (storedRule === "Value" || storedRule === "Weight" || storedRule === "Volume" || storedRule === "Hybrid") {
                        setAllocationRule(storedRule);
                    }
                }
            })
            .catch(err => {
                setErrorMessage((err as Error).message || "Failed to load PO amount posting details");
            })
            .finally(() => setLoading(false));
    }, [selectedShipment]);

    // Shared landed-cost allocation engine preview
    const calculationResult = useMemo<HybridCalculationResult>(() => {
        const totalLandedFee = landedExpenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const calculationInputs = lineItems.map(item => {
            const product = typeof item.product_id === "object" && item.product_id !== null
                ? item.product_id
                : null;
            return {
                key: item.purchase_order_product_id,
                category_type: item.category_type || "RAW_MATERIAL",
                quantity: Number(item.received_quantity) || 0,
                baseUnitCostPhp: Number(item.base_unit_cost_php) || 0,
                lineGrossWeightKg: Number(item.line_gross_weight_kg) || 0,
                volume: Number(product?.cbm_height || 0)
                    * Number(product?.cbm_width || 0)
                    * Number(product?.cbm_length || 0)
            };
        });
        const missingWeightItems = allocationRule === "Hybrid"
            ? lineItems
                .filter(item => item.category_type === "PACKAGING")
                .filter(item => !Number.isFinite(Number(item.line_gross_weight_kg)) || Number(item.line_gross_weight_kg) <= 0)
                .map(item => item.product_name || `Product #${item.product_id}`)
            : [];
        const baseLineCalculations = lineItems.map(item => {
            const basePhp = Number(item.base_unit_cost_php) || 0;
            return {
                ...item,
                allocated_amount: 0,
                variance_adjustment: 0,
                allocated_expense_php: 0,
                final_landed_unit_cost: basePhp
            };
        });

        if (lineItems.length === 0 || totalLandedFee === 0 || !allocationRule || missingWeightItems.length > 0) {
            return {
                lineCalculations: baseLineCalculations,
                rmSubPool: 0,
                pkgSubPool: 0,
                fgSubPool: 0,
                totalLandedFee: totalLandedFee > 0 && allocationRule ? totalLandedFee : 0,
                roundingVariance: 0,
                hasMissingWeight: missingWeightItems.length > 0,
                missingWeightItems
            };
        }

        const calculated = calculateLandedCost(calculationInputs, totalLandedFee, allocationRule);
        return {
            lineCalculations: lineItems.map(item => {
                const result = calculated.lines.find(line => line.key === item.purchase_order_product_id);
                return {
                    ...item,
                    allocated_amount: result?.allocatedExpense || 0,
                    variance_adjustment: result?.roundingVariance || 0,
                    allocated_expense_php: result?.addedUnitCost || 0,
                    final_landed_unit_cost: result?.finalLandedUnitCost || 0
                };
            }),
            rmSubPool: allocationRule === "Hybrid" ? calculated.rmFeePool : 0,
            pkgSubPool: allocationRule === "Hybrid" ? calculated.pkgFeePool : 0,
            fgSubPool: allocationRule === "Hybrid" ? calculated.fgFeePool : 0,
            totalLandedFee: calculated.totalLandedFee,
            roundingVariance: calculated.roundingVariance,
            hasMissingWeight: false,
            missingWeightItems: []
        };
    }, [lineItems, landedExpenses, allocationRule]);

    const handleAddExpenseRow = () => {
        const defaultCoa = chartOfAccounts[0]?.coa_id || chartOfAccounts[0]?.id || 0;
        setLandedExpenses(prev => [
            ...prev,
            { id: String(Date.now()), chart_of_account_id: defaultCoa, amount: 0, allocation_method: allocationRule }
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

        if (!allocationRule) {
            setErrorMessage("Select an allocation rule before posting purchase amounts.");
            return;
        }

        if (isForeignPO && calculationResult.hasMissingWeight) {
            setErrorMessage(`Complete net, outer carton, and pallet weights are required for Packaging items (${calculationResult.missingWeightItems.join(", ")}).`);
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
                allocation_rule: allocationRule,
                expenses: landedExpenses.filter(e => e.chart_of_account_id > 0 && e.amount > 0),
                line_items: calculationResult.lineCalculations.map(calc => ({
                    purchase_order_product_id: calc.purchase_order_product_id,
                    product_id: typeof calc.product_id === "object" && calc.product_id !== null ? (calc.product_id as { product_id: number }).product_id : calc.product_id,
                    category_type: calc.category_type,
                    gross_weight: calc.gross_weight,
                    line_gross_weight_kg: calc.line_gross_weight_kg,
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
        currencyCode,
        exchangeRate,
        setExchangeRate,
        lineItems,
        setLineItems,
        landedExpenses,
        allocationRule,
        setAllocationRule,
        chartOfAccounts,
        calculationResult,
        handleAddExpenseRow,
        handleRemoveExpenseRow,
        handleUpdateExpenseRow,
        handleExecutePosting
    };
}
