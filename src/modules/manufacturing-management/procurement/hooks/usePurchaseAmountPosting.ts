"use client";

import { useEffect, useMemo, useState } from "react";
import {
    ExpenseTypeOption,
    POLineItem,
    LandedExpenseRow,
    HybridCalculationResult,
    PurchaseAmountLandingRow,
    PurchaseOrderOption
} from "../components/purchase-amount/types";
import {
    fetchEligibleOrders,
    fetchPurchaseAmountDetails,
    postPurchaseAmounts
} from "../services/purchase-amount-api";
import {
    isLandedCostPostingEligible,
    isPurchaseOrderPosted
} from "../landed-cost-eligibility";
import { resolveProductWeightBreakdown } from "../packaging-weight";
import { calculateLandedCost } from "../landed-cost-calculation";
import type { LandedCostAllocationRule } from "../types";

const ALLOCATION_RULES = ["Quantity", "Value", "Weight", "Volume", "Hybrid"] as const;

export type { PurchaseOrderOption } from "../components/purchase-amount/types";

interface PurchaseAmountExpenseRecord extends Record<string, unknown> {
    overhead_id?: number | string | null;
    chart_of_account_id?: number | string | null;
    expense_type?: string | null;
    amount?: number | string | null;
    amount_php?: number | string | null;
    po_import_id?: number | string | null;
}

interface PurchaseAmountDetails {
    purchaseOrder?: PurchaseOrderOption;
    lineItems?: Array<Record<string, unknown>>;
    importExpenses?: PurchaseAmountExpenseRecord[];
    expenseTypes?: ExpenseTypeOption[];
    exchangeRate?: number | string | null;
    landedCost?: {
        computation?: {
            allocation_rule?: string | null;
            exchange_rate?: number | string | null;
        } | null;
        expenses?: PurchaseAmountExpenseRecord[];
    };
}

function isAllocationRule(value: unknown): value is LandedCostAllocationRule {
    return typeof value === "string" && (ALLOCATION_RULES as readonly string[]).includes(value);
}

function emptyExpenseRow(id = "1"): LandedExpenseRow {
    return {
        id,
        overhead_id: null,
        expense_type: "",
        amount: 0,
        allocation_method: ""
    };
}

function positiveNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function roundPhp(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

function purchaseOrderId(order: PurchaseOrderOption | null | undefined): number | null {
    const value = order?.purchase_order_id || order?.shipment_id || order?.id;
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function supplierName(order: PurchaseOrderOption): string {
    if (typeof order.supplier_name === "object" && order.supplier_name !== null) {
        return String(order.supplier_name.supplier_name || (order.supplier_name.id ? `Supplier #${order.supplier_name.id}` : "N/A"));
    }
    return String(order.supplier_name || "N/A");
}

function finiteNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLandingRows(orders: PurchaseOrderOption[]): PurchaseAmountLandingRow[] {
    const rowsByPurchaseOrderId = new Map<number, PurchaseAmountLandingRow>();

    for (const order of orders) {
        const id = purchaseOrderId(order);
        if (!id) continue;

        const isPosted = isPurchaseOrderPosted(order);
        const isEligible = isLandedCostPostingEligible(order);
        if (!isPosted && !isEligible) continue;

        const existing = rowsByPurchaseOrderId.get(id);
        if (existing?.isPosted && !isPosted) continue;

        const currencyCode = String(order.currency_code || (order.is_import === 1 ? "USD" : "PHP")).trim().toUpperCase();
        rowsByPurchaseOrderId.set(id, {
            purchaseOrderId: id,
            purchaseOrderNo: String(order.purchase_order_no || order.reference_number || `PO #${id}`),
            supplierName: supplierName(order),
            purchaseType: currencyCode === "PHP" ? "LOCAL PURCHASE" : "FOREIGN IMPORT",
            currencyCode,
            totalAmountPhp: finiteNumber(order.total_amount ?? order.total_php_value),
            totalForeignCurrency: finiteNumber(order.total_foreign_currency),
            status: isPosted ? "Posted & Capitalized" : "Awaiting Posting",
            isPosted,
            canEdit: !isPosted && isEligible,
            canViewLedger: isPosted,
            sourceOrder: order
        });
    }

    return [...rowsByPurchaseOrderId.values()];
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

    const [expenseTypes, setExpenseTypes] = useState<ExpenseTypeOption[]>([]);
    const [exchangeRate, setExchangeRate] = useState<number>(1);
    const [currencyCode, setCurrencyCode] = useState("PHP");
    const [lineItems, setLineItems] = useState<POLineItem[]>([]);
    const [landedExpenses, setLandedExpenses] = useState<LandedExpenseRow[]>([emptyExpenseRow()]);
    const [allocationRule, setAllocationRule] = useState<LandedCostAllocationRule | "">("");

    const [fetchedOrders, setFetchedOrders] = useState<PurchaseOrderOption[]>([]);
    const [internalSelected, setInternalSelected] = useState<PurchaseOrderOption | null>(null);

    useEffect(() => {
        let active = true;
        setLoading(true);
        fetchEligibleOrders()
            .then(list => {
                if (active) setFetchedOrders(list);
            })
            .catch(error => {
                if (active) setErrorMessage((error as Error).message || "Failed to fetch purchase orders.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [propShipments]);

    // The API response is authoritative. The broad shipment prop is not used
    // as a fallback because it can contain POs that are no longer eligible.
    const allOrders = fetchedOrders;

    const landingRows = useMemo(() => normalizeLandingRows(allOrders), [allOrders]);

    const postedOrders = useMemo(() => {
        return allOrders.filter(isPurchaseOrderPosted);
    }, [allOrders]);

    const eligibleOrders = useMemo(() => {
        return allOrders.filter(isLandedCostPostingEligible);
    }, [allOrders]);

    const selectedShipment = useMemo(() => {
        if (propSelectedShipment && isLandedCostPostingEligible(propSelectedShipment)) return propSelectedShipment;
        if (internalSelected && isLandedCostPostingEligible(internalSelected)) return internalSelected;
        return null;
    }, [internalSelected, propSelectedShipment]);

    const handleSelectPO = (po: PurchaseOrderOption) => {
        setErrorMessage(null);
        setSuccessMessage(null);
        if (!isLandedCostPostingEligible(po)) {
            setErrorMessage("Only eligible, unposted purchase orders can be edited.");
            return;
        }
        if (propSetSelectedShipment) propSetSelectedShipment(po);
        setInternalSelected(po);
    };

    const clearSelectedPO = () => {
        if (propSetSelectedShipment) propSetSelectedShipment(null);
        setInternalSelected(null);
    };

    const isForeignPO = useMemo(() => currencyCode !== "PHP", [currencyCode]);

    // Fetch PO details when the user selects an eligible PO.
    useEffect(() => {
        const poId = purchaseOrderId(selectedShipment);
        if (!poId) {
            setLineItems([]);
            setLandedExpenses([emptyExpenseRow()]);
            setExpenseTypes([]);
            setAllocationRule("");
            setCurrencyCode("PHP");
            setExchangeRate(1);
            return;
        }

        let active = true;
        setLoading(true);
        setErrorMessage(null);
        setSuccessMessage(null);
        setAllocationRule("");
        setLandedExpenses([emptyExpenseRow()]);
        setExpenseTypes([]);
        setCurrencyCode("PHP");
        setExchangeRate(1);
        setLineItems([]);

        fetchPurchaseAmountDetails(poId)
            .then(rawData => {
                if (!active) return;
                const data = rawData as PurchaseAmountDetails;
                const persistedCurrencyCode = String(data.purchaseOrder?.currency_code || "PHP").trim().toUpperCase();
                const persistedExchangeRate = Number(
                    data.landedCost?.computation?.exchange_rate
                    ?? data.exchangeRate
                    ?? data.purchaseOrder?.exchange_rate
                );

                setCurrencyCode(persistedCurrencyCode);
                setExchangeRate(persistedCurrencyCode === "PHP"
                    ? 1
                    : Number.isFinite(persistedExchangeRate) && persistedExchangeRate > 0
                        ? persistedExchangeRate
                        : 0);
                if (persistedCurrencyCode !== "PHP" && (!Number.isFinite(persistedExchangeRate) || persistedExchangeRate <= 0)) {
                    throw new Error(`A valid persisted exchange rate is required for ${persistedCurrencyCode} purchase orders.`);
                }

                setExpenseTypes(Array.isArray(data.expenseTypes) ? data.expenseTypes : []);

                if (data.lineItems) {
                    setLineItems(data.lineItems.map(item => {
                        const prodObj = typeof item.product_id === "object" && item.product_id !== null
                            ? item.product_id as Record<string, unknown>
                            : null;
                        const categoryType = item.category_type;
                        if (categoryType !== "RAW_MATERIAL" && categoryType !== "PACKAGING" && categoryType !== "FINISHED_GOODS") {
                            throw new Error(`Product ${prodObj?.product_id || item.product_id} has no valid RAW_MATERIAL, PACKAGING, or FINISHED_GOODS Category_Type.`);
                        }

                        const weightBreakdown = resolveProductWeightBreakdown(prodObj, {
                            requireComplete: categoryType === "PACKAGING"
                        });
                        const persistedLineGrossWeight = Number(item.line_gross_weight_kg);
                        const receivedQuantity = Number(item.received_quantity || 0);
                        const lineGrossWeightKg = Number.isFinite(persistedLineGrossWeight)
                            ? persistedLineGrossWeight
                            : weightBreakdown.grossWeightKg * receivedQuantity;
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
                if (isAllocationRule(storedRule)) setAllocationRule(storedRule);

                if (canonicalExpenses.length > 0) {
                    setLandedExpenses(canonicalExpenses.map((expense, index) => {
                        const overheadId = positiveNumber(expense.overhead_id);
                        const amount = Number(expense.amount ?? expense.amount_php ?? 0);
                        const typeOption = overheadId
                            ? data.expenseTypes?.find(type => type.id === overheadId)
                            : undefined;
                        return {
                            id: String(expense.po_import_id || expense.id || index + 1),
                            overhead_id: overheadId,
                            expense_type: String(expense.expense_type || typeOption?.label || ""),
                            amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
                            allocation_method: storedRule || "",
                            legacyChartOfAccountId: positiveNumber(expense.chart_of_account_id)
                        };
                    }));
                }
            })
            .catch(error => {
                if (active) setErrorMessage((error as Error).message || "Failed to load PO amount posting details.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [selectedShipment]);

    const validExpenseTypeIds = useMemo(() => new Set(expenseTypes.map(type => type.id)), [expenseTypes]);

    const hasInvalidExpenseRows = useMemo(() => landedExpenses.some(expense => {
        const amount = Number(expense.amount);
        if (!Number.isFinite(amount) || amount < 0) return true;
        if (expense.overhead_id && amount <= 0) return true;
        return amount > 0 && (!expense.overhead_id || !validExpenseTypeIds.has(expense.overhead_id));
    }), [landedExpenses, validExpenseTypeIds]);

    const calculationResult = useMemo<HybridCalculationResult>(() => {
        const totalLandedFee = landedExpenses.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
        const effectiveBaseUnitCost = (item: POLineItem): number => {
            if (isForeignPO) {
                const invoiceUnitPrice = Number(item.unit_price_foreign);
                if (Number.isFinite(invoiceUnitPrice) && Number.isFinite(exchangeRate) && exchangeRate > 0) {
                    return roundPhp(invoiceUnitPrice * exchangeRate);
                }
            }
            return Number(item.base_unit_cost_php) || 0;
        };
        const calculationInputs = lineItems.map(item => {
            const product = typeof item.product_id === "object" && item.product_id !== null
                ? item.product_id
                : null;
            return {
                key: item.purchase_order_product_id,
                category_type: item.category_type || "RAW_MATERIAL",
                quantity: Number(item.accepted_quantity ?? item.received_quantity) || 0,
                baseUnitCostPhp: effectiveBaseUnitCost(item),
                lineGrossWeightKg: Number(item.line_gross_weight_kg) || 0,
                volume: Number(product?.cbm_height || 0)
                    * Number(product?.cbm_width || 0)
                    * Number(product?.cbm_length || 0)
            };
        });
        const missingWeightItems = allocationRule === "Weight"
            ? lineItems
                .filter(item => !Number.isFinite(Number(item.line_gross_weight_kg)) || Number(item.line_gross_weight_kg) <= 0)
                .map(item => item.product_name || `Product #${item.product_id}`)
            : allocationRule === "Hybrid"
                ? lineItems
                    .filter(item => item.category_type === "PACKAGING")
                    .filter(item => !Number.isFinite(Number(item.line_gross_weight_kg)) || Number(item.line_gross_weight_kg) <= 0)
                    .map(item => item.product_name || `Product #${item.product_id}`)
                : [];
        const baseLineCalculations = lineItems.map(item => {
            const basePhp = effectiveBaseUnitCost(item);
            return {
                ...item,
                base_unit_cost_php: basePhp,
                unit_price: basePhp,
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
        const subPool = (category: POLineItem["category_type"]) => calculated.lines
            .filter(line => line.category_type === category)
            .reduce((sum, line) => sum + line.allocatedExpense, 0);

        return {
            lineCalculations: lineItems.map(item => {
                const result = calculated.lines.find(line => line.key === item.purchase_order_product_id);
                const basePhp = effectiveBaseUnitCost(item);
                return {
                    ...item,
                    base_unit_cost_php: basePhp,
                    unit_price: basePhp,
                    allocated_amount: result?.allocatedExpense || 0,
                    variance_adjustment: result?.roundingVariance || 0,
                    allocated_expense_php: result?.addedUnitCost || 0,
                    final_landed_unit_cost: result?.finalLandedUnitCost || basePhp
                };
            }),
            rmSubPool: allocationRule === "Hybrid" ? calculated.rmFeePool : subPool("RAW_MATERIAL"),
            pkgSubPool: allocationRule === "Hybrid" ? calculated.pkgFeePool : subPool("PACKAGING"),
            fgSubPool: allocationRule === "Hybrid" ? calculated.fgFeePool : subPool("FINISHED_GOODS"),
            totalLandedFee: calculated.totalLandedFee,
            roundingVariance: calculated.roundingVariance,
            hasMissingWeight: false,
            missingWeightItems: []
        };
    }, [allocationRule, exchangeRate, isForeignPO, landedExpenses, lineItems]);

    const canPost = Boolean(
        selectedShipment
        && lineItems.length > 0
        && allocationRule
        && (!isForeignPO || Number.isFinite(exchangeRate) && exchangeRate > 0)
        && !hasInvalidExpenseRows
        && !calculationResult.hasMissingWeight
        && !loading
        && !posting
    );

    const postDisabledReason = useMemo(() => {
        if (!selectedShipment) return "Select a received purchase order first.";
        if (loading) return "Loading purchase-order details...";
        if (lineItems.length === 0) return "No accepted line items are available for posting.";
        if (isForeignPO && (!Number.isFinite(exchangeRate) || exchangeRate <= 0)) return "Enter a positive forex exchange rate.";
        if (!allocationRule) return "Select an allocation rule before posting purchase amounts.";
        if (hasInvalidExpenseRows) return "Select a valid operational expense type for every expense amount.";
        if (calculationResult.hasMissingWeight) return "Complete the required packaging or line weights before posting.";
        return "";
    }, [allocationRule, calculationResult.hasMissingWeight, exchangeRate, hasInvalidExpenseRows, isForeignPO, lineItems.length, loading, selectedShipment]);

    const handleAddExpenseRow = () => {
        setLandedExpenses(previous => [
            ...previous,
            emptyExpenseRow(String(Date.now()))
        ]);
    };

    const handleRemoveExpenseRow = (id: string) => {
        setLandedExpenses(previous => previous.filter(expense => expense.id !== id));
    };

    const handleUpdateExpenseRow = (
        id: string,
        field: keyof LandedExpenseRow,
        value: LandedExpenseRow[keyof LandedExpenseRow]
    ) => {
        setLandedExpenses(previous => previous.map(expense => expense.id === id ? { ...expense, [field]: value } : expense));
    };

    const handleExecutePosting = async (): Promise<boolean> => {
        if (!selectedShipment) return false;
        if (!allocationRule) {
            setErrorMessage("Select an allocation rule before posting purchase amounts.");
            return false;
        }
        if (isForeignPO && (!Number.isFinite(exchangeRate) || exchangeRate <= 0)) {
            setErrorMessage("Enter a positive forex exchange rate before posting.");
            return false;
        }
        if (hasInvalidExpenseRows) {
            setErrorMessage("Select a valid operational expense type for every expense amount before posting.");
            return false;
        }
        if (calculationResult.hasMissingWeight) {
            setErrorMessage(`Complete the required weights for: ${calculationResult.missingWeightItems.join(", ")}.`);
            return false;
        }

        setPosting(true);
        setErrorMessage(null);
        setSuccessMessage(null);

        try {
            const poId = purchaseOrderId(selectedShipment);
            if (!poId) throw new Error("The selected purchase order has no valid identifier.");
            const payload = {
                purchase_order_id: poId,
                is_foreign: isForeignPO,
                exchange_rate: isForeignPO ? exchangeRate : 1.0,
                allocation_rule: allocationRule,
                expenses: landedExpenses
                    .filter(expense => Number(expense.amount) > 0)
                    .map(expense => ({
                        overhead_id: expense.overhead_id,
                        amount_php: Number(expense.amount)
                    })),
                line_items: calculationResult.lineCalculations.map(calc => ({
                    purchase_order_product_id: calc.purchase_order_product_id,
                    product_id: typeof calc.product_id === "object" && calc.product_id !== null
                        ? calc.product_id.product_id
                        : calc.product_id,
                    category_type: calc.category_type,
                    gross_weight: calc.gross_weight,
                    line_gross_weight_kg: calc.line_gross_weight_kg,
                    received_quantity: calc.received_quantity,
                    unit_price: calc.unit_price,
                    base_unit_cost_php: calc.base_unit_cost_php,
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
            setSuccessMessage("Purchase amounts and landed-cost allocations posted successfully. Costs are now locked.");
            const refreshed = await fetchEligibleOrders().catch(() => null);
            if (refreshed) setFetchedOrders(refreshed);
            clearSelectedPO();
            return true;
        } catch (error) {
            setErrorMessage((error as Error).message || "Failed to post purchase amounts.");
            return false;
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
        landingRows,
        selectedShipment,
        handleSelectPO,
        clearSelectedPO,
        isForeignPO,
        currencyCode,
        exchangeRate,
        setExchangeRate,
        lineItems,
        setLineItems,
        landedExpenses,
        allocationRule,
        setAllocationRule,
        expenseTypes,
        hasInvalidExpenseRows,
        canPost,
        postDisabledReason,
        calculationResult,
        handleAddExpenseRow,
        handleRemoveExpenseRow,
        handleUpdateExpenseRow,
        handleExecutePosting
    };
}
