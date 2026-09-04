"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  AlertCircle,
  Clock,
  CheckCircle2,
  GitBranch,
  Layers,
  Sparkles,
  SlidersHorizontal,
  RotateCcw,
  Scale,
  ShieldAlert,
  AlertTriangle,
  Plus,
  Trash2,
  Gauge,
  Boxes,
} from "lucide-react";
import { StockConversionProduct, UnitTarget } from "../types/stock-conversion.types";
import {
  MMLot,
  MMInventoryLot,
  LotAllocationGroup,
  BatchRowAllocation,
  QAStatus,
  ProductClassification,
} from "@/modules/manufacturing-management/shared/types/lot-tracking.types";
import {
  fetchLotsByBranch,
  fetchBatchOnhand,
  fetchInventoryLots,
  fetchProductOnhand,
  resolveProductClassification,
  buildLotStoredProductSummaryMap,
  checkLotProductTypeCompatibility,
  isBadStockLot,
} from "@/modules/manufacturing-management/shared/services/lot-tracking.service";
import { allocateStockSync } from "@/modules/manufacturing-management/shared/services/stock-allocation.engine";
import { SearchableSelect } from "@/modules/manufacturing-management/shared/components/SearchableSelect";
import { getPhCurrentTimestamp } from "../utils/date-utils";
import { toast } from "sonner";

export interface OutputBatchDetails {
  targetLotId?: number;
  targetBatchNo?: string;
  targetMfgDate?: string | null;
  targetExpDate?: string | null;
  targetAllocations?: LotAllocationGroup[];
  sourceBatchSummary?: string;
  sourceLotId?: number;
  sourceInventoryLotId?: number;
  sourceBatchNo?: string;
  sourceMfgDate?: string | null;
  sourceExpDate?: string | null;
  sourceAllocations?: Array<{
    inventory_lot_id?: number;
    lot_id?: number;
    batch_no?: string;
    allocated_quantity?: number;
    manufacturing_date?: string | null;
    expiry_date?: string | null;
    qa_status?: string;
    unit_cost?: number;
  }>;
}

interface StockConversionModalProps {
  product: StockConversionProduct | null;
  branchId?: number;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    qtyToConvert: number,
    targetUnit: UnitTarget,
    convertedQuantity: number,
    outputBatch?: OutputBatchDetails
  ) => void;
}

export function StockConversionModal({
  product,
  branchId,
  isOpen,
  onClose,
  onConfirm,
}: StockConversionModalProps) {
  const [qtyToConvert, setQtyToConvert] = useState<number | "">("");
  const [selectedTargetUnit, setSelectedTargetUnit] = useState<number | null>(null);

  // Lots & Source Batches
  const [lots, setLots] = useState<MMLot[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rawBranchOnhand, setRawBranchOnhand] = useState<any[]>([]);
  const [rawBranchInvLots, setRawBranchInvLots] = useState<MMInventoryLot[]>([]);
  const [sourceBatches, setSourceBatches] = useState<MMInventoryLot[]>([]);

  // Target Multi-Lot & Multi-Batch Allocations
  const [targetLotGroups, setTargetLotGroups] = useState<LotAllocationGroup[]>([]);

  // Toolbar Dates (stored locally until user clicks 'Apply to all')
  const [toolbarDates, setToolbarDates] = useState<Record<number, { mfg: string; exp: string }>>({});

  // Live stock from Spring Boot /api/mm-product-onhand
  const [liveProductQty, setLiveProductQty] = useState<number | null>(null);

  // Allocation Mode: AUTO (FEFO) vs MANUAL for source stock
  const [allocationMode, setAllocationMode] = useState<"AUTO" | "MANUAL">("AUTO");
  const [manualAllocations, setManualAllocations] = useState<Record<number, number>>({});

  // Target Product Classification (RM, PKG, FG, OTHER)
  const targetClassification = useMemo(() => {
    if (!product) return { code: "OTHER" as ProductClassification, label: "Unclassified" };
    return resolveProductClassification(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (product as any).productType || (product as any).product_type,
      product.category,
      product.productCode,
      product.productName
    );
  }, [product]);

  // Active Draft Session Allocations for cross-lot checks
  const activeDraftTargetAllocations = useMemo(() => {
    return targetLotGroups.map((g) => {
      const groupQty = (g.batches || []).reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
      return {
        lot_id: Number(g.lot_id),
        product_id: product?.productId,
        product_name: product?.productName,
        product_code: product?.productCode,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        product_type: (product as any)?.productType || (product as any)?.product_type,
        category_name: product?.category,
        allocated_quantity: groupQty,
      };
    });
  }, [targetLotGroups, product]);

  // Map of Stored Products & Product Classifications per Lot
  const lotStoredSummaryMap = useMemo(() => {
    return buildLotStoredProductSummaryMap(rawBranchOnhand, lots, activeDraftTargetAllocations, rawBranchInvLots);
  }, [rawBranchOnhand, lots, activeDraftTargetAllocations, rawBranchInvLots]);

  // Auto-generate batch number helper
  const generateBatchNo = useCallback(() => {
    const dateStr = getPhCurrentTimestamp().slice(0, 10).replace(/-/g, "");
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `CONV-${dateStr}-${rand}`;
  }, []);

  useEffect(() => {
    if (isOpen && product) {
      const timer = setTimeout(() => {
        setQtyToConvert("");
        setSelectedTargetUnit(null);
        setAllocationMode("AUTO");
        setManualAllocations({});
        setTargetLotGroups([]);
        setToolbarDates({});
      }, 0);

      // Load branch lots & live source batch on-hand balances
      if (branchId) {
        Promise.all([
          fetchLotsByBranch(branchId),
          fetchBatchOnhand({ branchId }),
          fetchInventoryLots({ branchId }),
          fetchProductOnhand({ branchId, productId: product.productId }),
        ])
          .then(([lotsData, allBranchOnhand, invLotsData, productOnhandData]) => {
            setRawBranchOnhand(allBranchOnhand || []);
            setRawBranchInvLots(invLotsData || []);

            // Compute current stock for every lot in the branch
            const lotStockMap = new Map<number, number>();
            (allBranchOnhand || []).forEach((b) => {
              const lId = Number(b.lotId);
              if (lId > 0) {
                lotStockMap.set(lId, (lotStockMap.get(lId) || 0) + Number(b.onhandQuantity || 0));
              }
            });

            const enrichedLots: MMLot[] = (lotsData || []).map((l) => ({
              ...l,
              current_stock_quantity: lotStockMap.get(Number(l.lot_id)) || 0,
            }));

            // Filter onhand data for this specific source product
            const onhandData = (allBranchOnhand || []).filter(
              (oh) => Number(oh.productId) === Number(product.productId)
            );

            // Resolve live product-level total from Spring Boot /api/mm-product-onhand
            const productOnhandEntry = (productOnhandData || []).find(
              (p) => Number(p.productId) === Number(product.productId)
            );
            const liveQty = productOnhandEntry
              ? Number(productOnhandEntry.onhandQuantity || 0)
              : null;
            setLiveProductQty(liveQty);

            // Build live batches strictly from live on-hand movement balances (Spring Boot)
            const liveBatches: MMInventoryLot[] = (onhandData || [])
              .filter((oh) => Number(oh.onhandQuantity || 0) > 0)
              .map((oh) => ({
                inventory_lot_id: Number(oh.inventoryLotId || oh.lotId || 1),
                lot_id: Number(oh.lotId || 1),
                branch_id: Number(oh.branchId || branchId),
                product_id: Number(oh.productId || product.productId),
                batch_no: String(oh.batchNo || "BATCH"),
                manufacturing_date: (oh.manufacturingDate as string) || null,
                expiry_date: (oh.expirationDate as string) || null,
                unit_cost: product.pricePerUnit || 0,
                qa_status: (oh.inventoryCondition as QAStatus) || "GOOD",
                status: "ACTIVE",
                available_quantity: Number(oh.onhandQuantity || 0),
                lot_name: oh.lotName || `Lot #${oh.lotId}`,
                product_name: oh.productName || product.productName,
                product_code: oh.productCode || product.productCode,
              }));

            // Fallback if no specific batch onhand exists but product running stock is positive
            const prodQty = liveQty !== null ? liveQty : Math.max(0, Number(product.quantity) || 0);
            if (liveBatches.length === 0 && prodQty > 0) {
              liveBatches.push({
                inventory_lot_id: 1,
                lot_id: lotsData[0]?.lot_id || 1,
                branch_id: branchId,
                product_id: product.productId,
                batch_no: "DEFAULT-BATCH",
                manufacturing_date: null,
                expiry_date: null,
                unit_cost: product.pricePerUnit || 0,
                qa_status: "GOOD",
                status: "ACTIVE",
                available_quantity: prodQty,
                lot_name: lotsData[0]?.lot_name || "Main Lot",
                product_name: product.productName,
                product_code: product.productCode,
              });
            }

            setLots(enrichedLots);
            setSourceBatches(liveBatches);
          })
          .catch((err) => {
            console.error("[StockConversionModal] Load error:", err);
            toast.error("Batch Inventory Error", {
              description: (err as Error).message || "Failed to fetch batches from Spring Boot",
            });
          });
      }

      return () => clearTimeout(timer);
    }
  }, [isOpen, product, branchId]);

  // Selected Target Unit Object
  const targetUnit = product?.availableUnits?.find((u) => u.unitId === selectedTargetUnit);

  // Unit of Measurement (UOM) Math Calculations
  let convertedAmount = 0;
  let wholeUnits = 0;
  let actualSourceQtyUsed = 0;
  let remainderSourceUnits = 0;
  let requiredRatio = 1;

  if (product && qtyToConvert && targetUnit) {
    const sourceFactor = Number(product.conversionFactor) || 1;
    const targetFactor = Number(targetUnit.conversionFactor) || 1;

    const totalBaseUnits = Number(qtyToConvert) * sourceFactor;

    if (targetFactor > 0) {
      convertedAmount = totalBaseUnits / targetFactor;
      wholeUnits = Math.floor(convertedAmount);
      actualSourceQtyUsed = (wholeUnits * targetFactor) / sourceFactor;
      remainderSourceUnits = Number((Number(qtyToConvert) - actualSourceQtyUsed).toFixed(4));

      const stepInSource = targetFactor / sourceFactor;
      requiredRatio = stepInSource >= 1 ? Math.round(stepInSource * 100) / 100 : stepInSource;
    }
  }

  const hasRemainderError = remainderSourceUnits > 0;
  const totalBaseUnits = qtyToConvert ? Number(qtyToConvert) * (product?.conversionFactor || 1) : 0;
  const targetFactor = targetUnit ? Number(targetUnit.conversionFactor) || 1 : 1;
  const isUomRequirementNotMet = !!(qtyToConvert && targetUnit && totalBaseUnits < targetFactor);

  // Same UOM Check
  const isSameUom = Boolean(
    targetUnit &&
      product?.currentUnitId &&
      Number(targetUnit.unitId) === Number(product.currentUnitId) &&
      (Number(product.conversionFactor) || 1) === (Number(targetUnit.conversionFactor) || 1)
  );

  // Invalid Conversion Factor Check
  const isInvalidUomFactor = Boolean(
    targetUnit &&
      ((Number(targetUnit.conversionFactor) || 0) <= 0 || (Number(product?.conversionFactor) || 0) <= 0)
  );

  // Compute Source FEFO Allocation Plan
  const fefoPlan = useMemo(() => {
    if (!sourceBatches.length || !qtyToConvert) return null;
    return allocateStockSync(sourceBatches, Number(qtyToConvert), { strategy: "FEFO" });
  }, [sourceBatches, qtyToConvert]);

  // Synchronize manual allocations when FEFO plan changes and in AUTO mode
  const populateManualFromFefo = () => {
    if (fefoPlan && fefoPlan.allocations) {
      const initialMap: Record<number, number> = {};
      fefoPlan.allocations.forEach((a) => {
        initialMap[a.inventory_lot_id] = a.allocated_quantity;
      });
      setManualAllocations(initialMap);
    }
  };

  // Active allocations for source stock based on mode
  const activeAllocations = useMemo(() => {
    if (allocationMode === "AUTO") {
      return fefoPlan?.allocations || [];
    }
    return sourceBatches
      .filter((b) => (manualAllocations[b.inventory_lot_id] || 0) > 0)
      .map((b) => ({
        inventory_lot_id: b.inventory_lot_id,
        lot_id: b.lot_id,
        lot_name: b.lot_name,
        batch_no: b.batch_no,
        allocated_quantity: manualAllocations[b.inventory_lot_id] || 0,
        expiry_date: b.expiry_date,
      }));
  }, [allocationMode, fefoPlan, sourceBatches, manualAllocations]);

  const totalAllocatedQty = useMemo(() => {
    if (allocationMode === "AUTO") {
      return fefoPlan?.totalAllocated || 0;
    }
    return Object.values(manualAllocations).reduce((sum, v) => sum + (Number(v) || 0), 0);
  }, [allocationMode, fefoPlan, manualAllocations]);

  // Derive default expiration date from earliest allocated source batch
  const defaultExpDate = useMemo(() => {
    if (activeAllocations.length > 0) {
      return activeAllocations.find((a) => !!a.expiry_date)?.expiry_date?.substring(0, 10) || "";
    }
    return "";
  }, [activeAllocations]);

  const todayStr = getPhCurrentTimestamp().substring(0, 10);

  // Live total available stock
  const totalAvailableStock = useMemo(() => {
    if (liveProductQty !== null) return liveProductQty;
    if (sourceBatches.length > 0) {
      return sourceBatches.reduce((sum, b) => sum + (Number(b.available_quantity) || 0), 0);
    }
    return Number(product?.quantity) || 0;
  }, [liveProductQty, sourceBatches, product?.quantity]);

  // ── Initialize Target Lot Groups (without auto-fill or auto-selection) ──
  useEffect(() => {
    if (wholeUnits > 0 && lots.length > 0) {
      setTargetLotGroups((prev) => {
        if (prev.length === 0) {
          return [
            {
              lot_id: 0,
              lot_name: "",
              max_batch_capacity: 10,
              unit_id: targetUnit?.unitId ? Number(targetUnit.unitId) : null,
              unit_name: targetUnit?.name || null,
              current_stock_quantity: 0,
              allocated_quantity: 0,
              batches: [
                {
                  batch_no: "",
                  quantity: 0,
                  manufacturing_date: todayStr,
                  expiry_date: defaultExpDate || null,
                  qa_status: "GOOD",
                },
              ],
            },
          ];
        }
        return prev;
      });
    }
  }, [wholeUnits, lots, targetUnit, defaultExpDate, todayStr]);

  // Total allocated across all target lot groups and batches
  const totalTargetAllocated = useMemo(() => {
    return targetLotGroups.reduce((lotSum, group) => {
      const bSum = (group.batches || []).reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
      return lotSum + bSum;
    }, 0);
  }, [targetLotGroups]);

  const targetQuantityDiff = wholeUnits - totalTargetAllocated;
  const isTargetQuantityBalanced = wholeUnits > 0 && totalTargetAllocated === wholeUnits;

  // ── Target Multi-Lot & Multi-Batch Mutation Handlers ──────────────

  const handleAddLotGroup = () => {
    if (lots.length === 0) return;

    setTargetLotGroups((prev) => [
      ...prev,
      {
        lot_id: 0,
        lot_name: "",
        max_batch_capacity: 10,
        unit_id: targetUnit?.unitId ? Number(targetUnit.unitId) : null,
        unit_name: targetUnit?.name || null,
        current_stock_quantity: 0,
        allocated_quantity: 0,
        batches: [
          {
            batch_no: "",
            quantity: 0,
            manufacturing_date: todayStr,
            expiry_date: defaultExpDate || null,
            qa_status: "GOOD",
          },
        ],
      },
    ]);
  };

  const handleRemoveLotGroup = (gIdx: number) => {
    setTargetLotGroups((prev) => prev.filter((_, idx) => idx !== gIdx));
  };

  const handleChangeLot = (gIdx: number, newLotIdStr: string) => {
    const newLotId = Number(newLotIdStr);
    const matchedLot = lots.find((l) => Number(l.lot_id) === newLotId);
    if (!matchedLot) return;

    setTargetLotGroups((prev) =>
      prev.map((g, idx) => {
        if (idx !== gIdx) return g;
        return {
          ...g,
          lot_id: matchedLot.lot_id,
          lot_name: matchedLot.lot_name,
          max_batch_capacity: matchedLot.max_batch_capacity || 10,
          unit_id: matchedLot.unit_id,
          unit_name: matchedLot.unit_name,
          current_stock_quantity: matchedLot.current_stock_quantity || 0,
        };
      })
    );
  };

  const handleAddBatchRow = (gIdx: number) => {
    setTargetLotGroups((prev) =>
      prev.map((g, idx) => {
        if (idx !== gIdx) return g;
        return {
          ...g,
          batches: [
            ...g.batches,
            {
              batch_no: "",
              quantity: 0,
              manufacturing_date: todayStr,
              expiry_date: defaultExpDate || null,
              qa_status: "GOOD",
            },
          ],
        };
      })
    );
  };

  const handleRemoveBatchRow = (gIdx: number, bIdx: number) => {
    setTargetLotGroups((prev) =>
      prev.map((g, idx) => {
        if (idx !== gIdx) return g;
        if (g.batches.length <= 1) return g;
        return {
          ...g,
          batches: g.batches.filter((_, bI) => bI !== bIdx),
        };
      })
    );
  };

  const handleBatchChange = (
    gIdx: number,
    bIdx: number,
    field: keyof BatchRowAllocation,
    val: unknown
  ) => {
    setTargetLotGroups((prev) =>
      prev.map((g, idx) => {
        if (idx !== gIdx) return g;
        const updatedBatches = g.batches.map((b, bI) => {
          if (bI !== bIdx) return b;
          return {
            ...b,
            [field]: field === "quantity" ? Math.max(0, Number(val) || 0) : val,
          };
        });
        const groupTotal = updatedBatches.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
        return {
          ...g,
          allocated_quantity: groupTotal,
          batches: updatedBatches,
        };
      })
    );
  };

  const handleFillBatch = (gIdx: number, bIdx: number) => {
    const allocatedElsewhere = targetLotGroups.reduce((lotSum, g, lotI) => {
      const bSum = g.batches.reduce((bS, b, batchI) => {
        if (lotI === gIdx && batchI === bIdx) return bS;
        return bS + (Number(b.quantity) || 0);
      }, 0);
      return lotSum + bSum;
    }, 0);

    const needed = Math.max(0, wholeUnits - allocatedElsewhere);
    handleBatchChange(gIdx, bIdx, "quantity", needed);
  };

  // Atomically apply Mfg Date and Expiry Date to all batches in this lot group
  const handleApplyDatesToAll = (groupIndex: number, mfgDate?: string, expDate?: string) => {
    setTargetLotGroups((prevGroups) =>
      prevGroups.map((g, i) => {
        if (i === groupIndex) {
          return {
            ...g,
            batches: (g.batches || []).map((b) => ({
              ...b,
              ...(mfgDate ? { manufacturing_date: mfgDate } : {}),
              ...(expDate ? { expiry_date: expDate } : {}),
            })),
          };
        }
        return g;
      })
    );
    toast.success("Dates applied to all batch splits in this lot");
  };

  // Atomically apply Mfg Date and Expiry Date across all lots & batches
  const handleApplyDatesToAllLots = (mfgDate?: string, expDate?: string) => {
    setTargetLotGroups((prevGroups) =>
      prevGroups.map((g) => ({
        ...g,
        batches: (g.batches || []).map((b) => ({
          ...b,
          ...(mfgDate ? { manufacturing_date: mfgDate } : {}),
          ...(expDate ? { expiry_date: expDate } : {}),
        })),
      }))
    );
    toast.success("Dates applied across all storage lots and batches");
  };

  // ── Multi-Layer Validation Engine ─────────────────────────────────
  const validationErrors = useMemo(() => {
    const errs: string[] = [];

    // 1. UOM Selection & Integrity
    if (!selectedTargetUnit) {
      errs.push("Target unit of measurement (UOM) must be selected.");
    } else if (isSameUom) {
      errs.push(`Source and Target UOM are identical (${product?.currentUnit}). Stock conversion requires transforming into a distinct unit.`);
    } else if (isInvalidUomFactor) {
      errs.push("Invalid conversion factor configured for selected units.");
    } else if (isUomRequirementNotMet) {
      errs.push(`UOM Minimum Not Met: Requires at least ${requiredRatio} ${product?.currentUnit}(s) to produce 1 ${targetUnit?.name}, but only ${qtyToConvert || 0} provided.`);
    } else if (hasRemainderError) {
      errs.push(`Inexact Conversion Ratio: Converting ${qtyToConvert} ${product?.currentUnit}(s) leaves an unused remainder of ${remainderSourceUnits} ${product?.currentUnit}(s).`);
    }

    // 2. Quantity & Stock Availability
    if (!qtyToConvert || Number(qtyToConvert) <= 0) {
      errs.push("Quantity to convert must be greater than 0.");
    } else if (Number(qtyToConvert) > totalAvailableStock) {
      errs.push(`Requested quantity (${qtyToConvert} ${product?.currentUnit}) exceeds total available stock (${totalAvailableStock} ${product?.currentUnit}).`);
    }

    // 3. Source Batch Allocations
    if (allocationMode === "MANUAL" && qtyToConvert && totalAllocatedQty !== Number(qtyToConvert)) {
      errs.push(`Manual source batch allocation incomplete: Allocated ${totalAllocatedQty} / ${qtyToConvert} ${product?.currentUnit}(s).`);
    }

    // 4. Target Multi-Lot & Multi-Batch Allocations Validation
    if (wholeUnits > 0) {
      if (targetLotGroups.length === 0) {
        errs.push("At least one target storage rack / lot must be assigned.");
      }

      // Quantity Balance Check
      if (totalTargetAllocated !== wholeUnits) {
        if (totalTargetAllocated < wholeUnits) {
          errs.push(`Target output under-allocated! Allocating ${totalTargetAllocated.toLocaleString()} / ${wholeUnits.toLocaleString()} ${targetUnit?.name} (short by ${(wholeUnits - totalTargetAllocated).toLocaleString()} ${targetUnit?.name}).`);
        } else {
          errs.push(`Target output over-allocated! Allocating ${totalTargetAllocated.toLocaleString()} / ${wholeUnits.toLocaleString()} ${targetUnit?.name} (exceeds by ${(totalTargetAllocated - wholeUnits).toLocaleString()} ${targetUnit?.name}).`);
        }
      }

      // Per-Lot Validations
      targetLotGroups.forEach((group, gIdx) => {
        if (!group.lot_id || Number(group.lot_id) === 0) {
          errs.push(`Storage Rack #${gIdx + 1}: Please select a storage rack / lot.`);
          return;
        }

        const lotUomId = group.unit_id ? Number(group.unit_id) : null;
        const isUomMismatch = Boolean(lotUomId && targetUnit && Number(targetUnit.unitId) !== lotUomId);
        const groupQty = (group.batches || []).reduce((sum, b) => sum + Number(b.quantity || 0), 0);
        const currentStock = Number(group.current_stock_quantity || 0);
        const maxCap = Number(group.max_batch_capacity || 0);
        const projectedStock = currentStock + groupQty;
        const availableSpace = Math.max(0, maxCap - currentStock);

        const lotStored = lotStoredSummaryMap.get(Number(group.lot_id));
        const typeCompat = checkLotProductTypeCompatibility(lotStored, targetClassification);
        if (typeCompat.isTypeMismatch) {
          const sourceKind = lotStored?.is_draft_allocation ? "Form Draft" : "Warehouse";
          errs.push(
            `Lot #${gIdx + 1} (${group.lot_name}): Product Type Conflict! Storage rack currently holds ${sourceKind} (${lotStored?.primary_classification_label || "Other"}), but conversion output is "${targetClassification.label}". Cannot store conflicting product types together.`
          );
        }

        if (isUomMismatch) {
          errs.push(`Lot #${gIdx + 1} (${group.lot_name}): Unit Mismatch! Storage rack is designated for "${group.unit_name || `UOM #${lotUomId}`}", but conversion output is "${targetUnit?.name}".`);
        } else if (maxCap > 0) {
          if (currentStock >= maxCap && groupQty > 0) {
            errs.push(`Lot #${gIdx + 1} (${group.lot_name}): Storage rack is already full (${currentStock.toLocaleString()} / ${maxCap.toLocaleString()} ${targetUnit?.name}). No additional quantity can be stored.`);
          } else if (projectedStock > maxCap) {
            const overage = projectedStock - maxCap;
            errs.push(`Lot #${gIdx + 1} (${group.lot_name}): Allocating ${groupQty.toLocaleString()} ${targetUnit?.name} exceeds capacity! Current stock: ${currentStock.toLocaleString()} ${targetUnit?.name}, Max capacity: ${maxCap.toLocaleString()} ${targetUnit?.name}. Only ${availableSpace.toLocaleString()} ${targetUnit?.name} space remains (exceeded by ${overage.toLocaleString()} ${targetUnit?.name}).`);
          }
        }

        // Bad Stock vs Standard Storage Rack Check
        const lotObj = lots.find((l) => Number(l.lot_id) === Number(group.lot_id));
        const lotIsBad = isBadStockLot(lotObj);

        (group.batches || []).forEach((b, bIdx) => {
          const batchIsBad = b.qa_status && b.qa_status !== "GOOD";
          if (batchIsBad && !lotIsBad) {
            errs.push(
              `Lot #${gIdx + 1} (${group.lot_name}), Batch #${bIdx + 1} (${b.batch_no || "Unassigned"}): Cannot allocate bad/damaged stock (${b.qa_status}) into standard storage rack. Bad stock must be placed in a Bad Stock / Quarantine rack or branch.`
            );
          } else if (!batchIsBad && lotIsBad) {
            errs.push(
              `Lot #${gIdx + 1} (${group.lot_name}), Batch #${bIdx + 1} (${b.batch_no || "Unassigned"}): Cannot allocate GOOD stock into a Bad Stock / Quarantine storage rack. Only DAMAGED, QUARANTINED, or EXPIRED stock can be allocated here.`
            );
          }
        });

        // Per-Batch Row Validations
        if (!group.batches || group.batches.length === 0) {
          errs.push(`Lot #${gIdx + 1} (${group.lot_name}): Must contain at least 1 batch split.`);
        } else {
          group.batches.forEach((b, bIdx) => {
            const bQty = Number(b.quantity || 0);
            if (!b.batch_no || String(b.batch_no).trim() === "") {
              errs.push(`Lot #${gIdx + 1}, Batch #${bIdx + 1}: Batch number is required.`);
            }
            if (bQty <= 0) {
              errs.push(`Lot #${gIdx + 1}, Batch #${bIdx + 1}: Quantity must be greater than 0.`);
            }
            if (!b.manufacturing_date) {
              errs.push(`Lot #${gIdx + 1}, Batch #${bIdx + 1}: Manufacturing date is required.`);
            }
            if (!b.expiry_date) {
              errs.push(`Lot #${gIdx + 1}, Batch #${bIdx + 1}: Expiration date is required.`);
            }
          });
        }
      });
    }

    return errs;
  }, [
    selectedTargetUnit,
    isSameUom,
    isInvalidUomFactor,
    isUomRequirementNotMet,
    hasRemainderError,
    qtyToConvert,
    totalAvailableStock,
    allocationMode,
    totalAllocatedQty,
    wholeUnits,
    targetLotGroups,
    totalTargetAllocated,
    product?.currentUnit,
    requiredRatio,
    remainderSourceUnits,
    targetUnit,
    lotStoredSummaryMap,
    targetClassification,
    lots,
  ]);

  const isValid = validationErrors.length === 0;

  if (!product) return null;

  const handleConfirm = () => {
    if (isValid && qtyToConvert && targetUnit && wholeUnits > 0) {
      const sourceSummary = activeAllocations
        .map((a) => `${a.batch_no} (${a.allocated_quantity} ${product.currentUnit})`)
        .join(", ");

      const primarySource = activeAllocations[0];
      const primaryBatchMatch = sourceBatches.find((sb) => sb.inventory_lot_id === primarySource?.inventory_lot_id);

      const firstGroup = targetLotGroups[0];
      const firstBatch = firstGroup?.batches[0];

      onConfirm(Number(qtyToConvert), targetUnit, wholeUnits, {
        targetLotId: firstGroup?.lot_id,
        targetBatchNo: firstBatch?.batch_no,
        targetMfgDate: firstBatch?.manufacturing_date || null,
        targetExpDate: firstBatch?.expiry_date || null,
        targetAllocations: targetLotGroups,
        sourceBatchSummary: sourceSummary,
        sourceLotId: primarySource?.lot_id ?? primaryBatchMatch?.lot_id,
        sourceInventoryLotId: primarySource?.inventory_lot_id ?? primaryBatchMatch?.inventory_lot_id,
        sourceBatchNo: primarySource?.batch_no ?? primaryBatchMatch?.batch_no,
        sourceMfgDate: primaryBatchMatch?.manufacturing_date || null,
        sourceExpDate: primarySource?.expiry_date || primaryBatchMatch?.expiry_date || null,
        sourceAllocations: activeAllocations.map((a) => {
          const match = sourceBatches.find((sb) => sb.inventory_lot_id === a.inventory_lot_id);
          return {
            inventory_lot_id: a.inventory_lot_id,
            lot_id: a.lot_id ?? match?.lot_id,
            batch_no: a.batch_no ?? match?.batch_no,
            allocated_quantity: a.allocated_quantity,
            manufacturing_date: match?.manufacturing_date ?? null,
            expiry_date: a.expiry_date ?? match?.expiry_date ?? null,
            qa_status: match?.qa_status ?? "GOOD",
            unit_cost: match?.unit_cost ?? product.pricePerUnit ?? 0,
          };
        }),
      });
    }
  };

  const getConversionRatioInfo = (targetUom: UnitTarget) => {
    const sFactor = Number(product?.conversionFactor) || 1;
    const tFactor = Number(targetUom.conversionFactor) || 1;

    if (sFactor > tFactor) {
      const ratio = Math.round((sFactor / tFactor) * 100) / 100;
      return {
        badge: `1 ${product?.currentUnit} = ${ratio} ${targetUom.name}`,
        desc: `1 ${product?.currentUnit} unpacks into ${ratio} ${targetUom.name}(s)`,
      };
    } else if (sFactor < tFactor) {
      const ratio = Math.round((tFactor / sFactor) * 100) / 100;
      return {
        badge: `${ratio} ${product?.currentUnit} = 1 ${targetUom.name}`,
        desc: `Requires ${ratio} ${product?.currentUnit}(s) to assemble 1 ${targetUom.name}`,
      };
    } else {
      return {
        badge: `1 : 1 Ratio`,
        desc: `1 ${product?.currentUnit} converts directly to 1 ${targetUom.name}`,
      };
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="max-w-5xl sm:max-w-6xl w-[96vw] h-[92vh] max-h-[92vh] p-0 flex flex-col bg-card border-border shadow-2xl overflow-hidden"
      >
        <DialogHeader className="p-5 pb-4 border-b border-border bg-muted/20 shrink-0 flex flex-row items-center justify-between">
          <div className="space-y-1">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Boxes className="w-5 h-5 text-primary" />
              Multi-Lot & Multi-Batch Stock Conversion
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2">
              <span>{product.productDescription || product.productName}</span>
              {product.productCode && <Badge variant="outline" className="text-[10px] font-mono">{product.productCode}</Badge>}
              <Badge variant="secondary" className="text-[10px] uppercase font-bold">{product.brand}</Badge>
            </DialogDescription>
          </div>

          {wholeUnits > 0 && targetUnit && (
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">Target Output</span>
              <div className="text-base font-mono font-black text-primary">
                {wholeUnits.toLocaleString()} <span className="text-xs font-normal text-muted-foreground uppercase">{targetUnit.name}(S)</span>
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="p-6 space-y-6 flex-1 overflow-y-auto min-h-0">
          {/* Source Stock & Quantity Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 bg-primary/5 border border-primary/20 rounded-xl p-3.5">
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">
                Current Available Stock
              </span>
              <div className="text-2xl font-black text-foreground">
                {totalAvailableStock}{" "}
                <span className="text-xs font-bold text-muted-foreground uppercase">
                  {product.currentUnit}(S)
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="qtyToConvert" className="text-xs font-semibold text-foreground flex items-center gap-2">
                Quantity to Convert *
              </Label>
              <Input
                id="qtyToConvert"
                type="number"
                min={1}
                max={totalAvailableStock}
                value={qtyToConvert}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : "";
                  setQtyToConvert(val);
                }}
                placeholder="Enter quantity to convert..."
                className="h-11 text-sm font-bold"
              />
            </div>
          </div>

          {/* Convert To Target Units (UOM Selection) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Scale className="w-3.5 h-3.5 text-primary" /> Convert To (Target UOM) *
              </Label>
              {targetUnit && (
                <span className="text-[11px] font-medium text-muted-foreground">
                  Source: <strong className="text-foreground">{product.currentUnit}</strong> &rarr; Target: <strong className="text-primary">{targetUnit.name}</strong>
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {product.availableUnits?.map((u, idx) => {
                const ratioInfo = getConversionRatioInfo(u);
                const isSelected = selectedTargetUnit === u.unitId;
                const isThisSameUom = Number(u.unitId) === Number(product.currentUnitId);

                return (
                  <div
                    key={`${u.unitId}-${u.targetProductId || ""}-${idx}`}
                    className={`border rounded-xl p-3.5 cursor-pointer transition-all flex flex-col justify-between ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-1 ring-primary shadow-sm"
                        : isThisSameUom
                        ? "border-border/50 bg-muted/20 opacity-70 hover:opacity-100"
                        : "border-border bg-card hover:border-primary/40 hover:bg-muted/30"
                    }`}
                    onClick={() => setSelectedTargetUnit(u.unitId)}
                  >
                    <div className="font-bold flex items-center justify-between text-xs text-foreground gap-2">
                      <span className="truncate flex items-center gap-1.5">
                        {u.name}
                        {isThisSameUom && (
                          <span className="text-[9px] text-muted-foreground font-normal">(Current)</span>
                        )}
                      </span>
                      <Badge variant="outline" className="text-[9px] font-mono py-0 h-4 shrink-0 bg-background/60">
                        {ratioInfo.badge}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                      {ratioInfo.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Dynamic Conversion Output & UOM Validation Card */}
          {selectedTargetUnit && targetUnit && (
            <div className="animate-in fade-in space-y-3">
              {isSameUom ? (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider py-0.5 border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10">
                        Identical Unit of Measurement
                      </Badge>
                    </div>
                    <div className="text-base font-bold text-amber-700 dark:text-amber-400">
                      Cannot convert between identical units ({product.currentUnit} &rarr; {targetUnit.name})
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Stock conversion requires transforming inventory between different packaging or unit hierarchies (e.g. PCS to BOX or BOTTLE to CASE).
                    </p>
                  </div>
                  <div className="p-3 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                </div>
              ) : qtyToConvert && Number(qtyToConvert) > totalAvailableStock ? (
                <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-[9px] font-bold uppercase tracking-wider py-0.5">
                        Insufficient Stock
                      </Badge>
                    </div>
                    <div className="text-xl font-black text-destructive">
                      Exceeds Available Stock
                    </div>
                    <p className="text-xs text-destructive/90">
                      Requested {qtyToConvert} {product.currentUnit}(s), but only {totalAvailableStock} {product.currentUnit}(s) are available in branch batches.
                    </p>
                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setQtyToConvert(totalAvailableStock)}
                        className="h-7 text-xs border-destructive/40 hover:bg-destructive/10 text-foreground font-semibold"
                      >
                        Set to Max Available ({totalAvailableStock} {product.currentUnit}s)
                      </Button>
                    </div>
                  </div>
                  <div className="p-3 bg-destructive/20 text-destructive rounded-full shrink-0">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                </div>
              ) : isUomRequirementNotMet ? (
                <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive" className="text-[9px] font-bold uppercase tracking-wider py-0.5">
                        UOM Minimum Requirement Not Met
                      </Badge>
                    </div>
                    <div className="text-xl font-black text-destructive">
                      0 <span className="text-sm font-bold uppercase">{targetUnit.name}(S)</span>
                    </div>
                    <p className="text-xs text-destructive/90">
                      Need at least {requiredRatio} {product.currentUnit}(s) to assemble 1 {targetUnit.name}, but only {qtyToConvert || 0} provided.
                    </p>
                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setQtyToConvert(requiredRatio)}
                        className="h-7 text-xs border-destructive/40 hover:bg-destructive/10 text-foreground font-semibold"
                      >
                        Set to minimum ({requiredRatio} {product.currentUnit}s &rarr; 1 {targetUnit.name})
                      </Button>
                    </div>
                  </div>
                  <div className="p-3 bg-destructive/20 text-destructive rounded-full shrink-0">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                </div>
              ) : hasRemainderError ? (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider py-0.5 border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10">
                        Inexact Ratio • {remainderSourceUnits} {product.currentUnit}(s) Excess Remainder
                      </Badge>
                    </div>
                    <div className="text-xl font-black text-amber-700 dark:text-amber-400">
                      {wholeUnits} <span className="text-sm font-bold uppercase">{targetUnit.name}(S)</span>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Converting {qtyToConvert} {product.currentUnit}(s) leaves an excess of <strong>{remainderSourceUnits} {product.currentUnit}(s)</strong> unused (Ratio: {requiredRatio} {product.currentUnit}(s) = 1 {targetUnit.name}).
                    </p>
                    <div className="pt-2 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setQtyToConvert(actualSourceQtyUsed)}
                        className="h-7 text-xs border-amber-500/40 hover:bg-amber-500/10 text-foreground font-semibold"
                      >
                        Adjust to exact {actualSourceQtyUsed} {product.currentUnit}s ({wholeUnits} {targetUnit.name}s)
                      </Button>
                      {actualSourceQtyUsed + requiredRatio <= totalAvailableStock && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setQtyToConvert(actualSourceQtyUsed + requiredRatio)}
                          className="h-7 text-xs border-amber-500/40 hover:bg-amber-500/10 text-foreground font-semibold"
                        >
                          Round up to {actualSourceQtyUsed + requiredRatio} {product.currentUnit}s ({wholeUnits + 1} {targetUnit.name}s)
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="p-3 bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                </div>
              ) : wholeUnits > 0 ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                      Expected Output
                    </span>
                    <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 mt-0.5">
                      {wholeUnits} <span className="text-sm font-bold uppercase">{targetUnit.name}(S)</span>
                    </div>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1">
                      Exactly consumes {Number(qtyToConvert)} {product.currentUnit}(s) with 0 remainder.
                    </p>
                  </div>
                  <div className="p-3 bg-emerald-500/20 text-emerald-600 rounded-full">
                    <ArrowRight className="w-5 h-5" />
                  </div>
                </div>
              ) : (
                <div className="bg-muted/30 border border-border/60 rounded-xl p-4 text-xs text-muted-foreground text-center">
                  Enter a quantity above to calculate expected output units.
                </div>
              )}
            </div>
          )}

          {/* SOURCE BATCH ALLOCATION SECTION (AUTO FEFO / MANUAL SELECTION) */}
          {qtyToConvert ? (
            <div className="space-y-3 border border-border rounded-xl p-4 bg-muted/20">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" /> Source Batch Allocation (Consuming {qtyToConvert} {product.currentUnit})
                </Label>

                {/* Mode Selector Tabs */}
                <div className="flex items-center gap-1 bg-background border border-border p-0.5 rounded-lg shadow-sm">
                  <button
                    type="button"
                    onClick={() => setAllocationMode("AUTO")}
                    className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all flex items-center gap-1.5 ${
                      allocationMode === "AUTO"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Sparkles className="w-3 h-3" /> Auto (FEFO)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      populateManualFromFefo();
                      setAllocationMode("MANUAL");
                    }}
                    className={`px-3 py-1 text-[11px] font-bold rounded-md transition-all flex items-center gap-1.5 ${
                      allocationMode === "MANUAL"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <SlidersHorizontal className="w-3 h-3" /> Manual Selection
                  </button>
                </div>
              </div>

              {/* AUTO FEFO VIEW */}
              {allocationMode === "AUTO" ? (
                <div className="space-y-2 pt-1">
                  {fefoPlan && fefoPlan.allocations.length > 0 ? (
                    <div className="space-y-1.5">
                      {fefoPlan.allocations.map((alloc, idx) => (
                        <div
                          key={`${alloc.inventory_lot_id}-${alloc.batch_no || ""}-${idx}`}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-card border border-border text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-foreground">{alloc.batch_no}</span>
                            <span className="text-[10px] text-muted-foreground">
                              ({alloc.lot_name || `Lot #${alloc.lot_id}`})
                            </span>
                            {alloc.expiry_date && (
                              <span className="text-[10px] text-emerald-600 font-mono">
                                Exp: {alloc.expiry_date.substring(0, 10)}
                              </span>
                            )}
                          </div>
                          <div className="font-bold text-primary text-xs">
                            Consume: {alloc.allocated_quantity} {product.currentUnit}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic p-2">
                      No matching batches found for automatic allocation.
                    </p>
                  )}
                </div>
              ) : (
                /* MANUAL BATCH ALLOCATION TABLE */
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pb-1">
                    <span>Select and specify the quantity to consume from each batch:</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={populateManualFromFefo}
                      className="h-6 px-2 text-[10px] gap-1 text-primary hover:bg-primary/10"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset to FEFO
                    </Button>
                  </div>

                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {sourceBatches.map((batch, idx) => {
                      const batchKey = batch.inventory_lot_id;
                      const uniqueKey = `${batchKey}-${batch.batch_no || ""}-${idx}`;
                      const allocated = manualAllocations[batchKey] || 0;
                      const maxAvail = batch.available_quantity || 0;

                      return (
                        <div
                          key={uniqueKey}
                          className={`p-2.5 rounded-lg border transition-all flex items-center justify-between gap-3 text-xs ${
                            allocated > 0 ? "bg-primary/5 border-primary/40" : "bg-card border-border"
                          }`}
                        >
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-foreground">{batch.batch_no}</span>
                              <span className="text-[10px] text-muted-foreground">
                                ({batch.lot_name || `Lot #${batch.lot_id}`})
                              </span>
                              <Badge variant="outline" className="text-[9px] py-0 h-4 bg-muted/40 font-mono">
                                Available: {maxAvail} {product.currentUnit}
                              </Badge>
                            </div>
                            {batch.expiry_date ? (
                              <span className="text-[10px] text-emerald-600 font-mono">
                                Exp: {batch.expiry_date?.substring(0, 10)}
                              </span>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min={0}
                                max={maxAvail}
                                value={allocated || ""}
                                onFocus={(e) => e.target.select()}
                                onClick={(e) => (e.target as HTMLInputElement).select()}
                                onChange={(e) => {
                                  const val = Math.min(maxAvail, Math.max(0, Number(e.target.value) || 0));
                                  setManualAllocations((prev) => ({
                                    ...prev,
                                    [batchKey]: val,
                                  }));
                                }}
                                placeholder="0"
                                className="w-20 h-8 text-xs font-bold text-right"
                              />
                              <span className="text-[10px] text-muted-foreground font-semibold">
                                {product.currentUnit}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-[10px] font-bold text-primary hover:bg-primary/10 border-primary/30"
                              onClick={() => {
                                const currentAllocatedElsewhere = Object.entries(manualAllocations)
                                  .filter(([k]) => Number(k) !== batchKey)
                                  .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
                                const needed = Math.max(0, Number(qtyToConvert) - currentAllocatedElsewhere);
                                const fillQty = Math.min(maxAvail, needed);
                                setManualAllocations((prev) => ({
                                  ...prev,
                                  [batchKey]: fillQty,
                                }));
                              }}
                            >
                              Fill
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Status / Summary Bar */}
              <div className="flex items-center justify-between text-[11px] pt-2 border-t border-border/50">
                <span className="text-muted-foreground">
                  Total Source Allocated:{" "}
                  <strong
                    className={
                      totalAllocatedQty === Number(qtyToConvert)
                        ? "text-emerald-600 font-bold"
                        : "text-amber-600 font-bold"
                    }
                  >
                    {totalAllocatedQty} / {qtyToConvert} {product.currentUnit}
                  </strong>
                </span>

                {totalAllocatedQty === Number(qtyToConvert) ? (
                  <span className="text-emerald-600 font-bold flex items-center gap-1 text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Fully Allocated
                  </span>
                ) : (
                  <span className="text-amber-600 font-bold text-[11px]">
                    {totalAllocatedQty < Number(qtyToConvert)
                      ? `Need ${Number(qtyToConvert) - totalAllocatedQty} more ${product.currentUnit}`
                      : `Exceeds by ${totalAllocatedQty - Number(qtyToConvert)} ${product.currentUnit}`}
                  </span>
                )}
              </div>
            </div>
          ) : null}

          {/* TARGET MULTI-LOT & MULTI-BATCH ALLOCATION SECTION */}
          {wholeUnits > 0 && targetUnit && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Target Output Allocation (Multi-Lot & Multi-Batch)
                  </h4>
                </div>
              </div>

              {/* TARGET ALLOCATION SUMMARY TRACKER BAR */}
              <div
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all ${
                  isTargetQuantityBalanced
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300"
                    : targetQuantityDiff > 0
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm ${
                      isTargetQuantityBalanced
                        ? "bg-emerald-500 text-white"
                        : targetQuantityDiff > 0
                        ? "bg-amber-500 text-white"
                        : "bg-rose-500 text-white"
                    }`}
                  >
                    {isTargetQuantityBalanced ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                  </div>
                  <div>
                    <div className="text-xs font-black uppercase tracking-wider">
                      {isTargetQuantityBalanced
                        ? "Output Allocation Balanced & Ready"
                        : targetQuantityDiff > 0
                        ? `Under-Allocated: ${targetQuantityDiff.toLocaleString()} ${targetUnit.name} Remaining`
                        : `Over-Allocated: ${Math.abs(targetQuantityDiff).toLocaleString()} ${targetUnit.name} Excess`}
                    </div>
                    <div className="text-xs opacity-80 mt-0.5">
                      Total Allocated:{" "}
                      <strong className="font-mono font-black">{totalTargetAllocated.toLocaleString()}</strong> / Target:{" "}
                      <strong className="font-mono font-black">{wholeUnits.toLocaleString()}</strong> {targetUnit.name} across{" "}
                      {targetLotGroups.length} lot(s).
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {targetLotGroups.length > 1 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const firstGroupMfg =
                          toolbarDates[0]?.mfg ??
                          (targetLotGroups[0]?.batches[0]?.manufacturing_date
                            ? String(targetLotGroups[0].batches[0].manufacturing_date).substring(0, 10)
                            : todayStr);
                        const firstGroupExp =
                          toolbarDates[0]?.exp ??
                          (targetLotGroups[0]?.batches[0]?.expiry_date
                            ? String(targetLotGroups[0].batches[0].expiry_date).substring(0, 10)
                            : (defaultExpDate || ""));
                        handleApplyDatesToAllLots(firstGroupMfg, firstGroupExp);
                      }}
                      className="h-8 text-xs font-bold gap-1.5 shrink-0 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 shadow-xs cursor-pointer"
                      title="Apply dates from first lot to all lots & batches"
                    >
                      Apply Dates to All Lots
                    </Button>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddLotGroup}
                    className="h-8 text-xs font-bold gap-1.5 shrink-0 bg-background border-border shadow-sm hover:bg-muted cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Assign Another Storage Lot
                  </Button>
                </div>
              </div>

              {/* TARGET LOT GROUPS LIST */}
              <div className="space-y-4">
                {targetLotGroups.map((group, gIdx) => {
                  const groupLot = lots.find((l) => Number(l.lot_id) === Number(group.lot_id));
                  const lotUomId = groupLot?.unit_id ?? group.unit_id;
                  const isUomMismatch = Boolean(
                    lotUomId &&
                      targetUnit &&
                      Number(targetUnit.unitId) !== Number(lotUomId)
                  );

                  const currentStockQty = Number(groupLot?.current_stock_quantity || group.current_stock_quantity || 0);
                  const maxCap = Number(groupLot?.max_batch_capacity || group.max_batch_capacity || 0);
                  const groupAllocated = (group.batches || []).reduce((sum, b) => sum + Number(b.quantity || 0), 0);
                  const projectedTotalStock = currentStockQty + groupAllocated;
                  const availableSpace = Math.max(0, maxCap - currentStockQty);
                  const isCapacityExceeded = maxCap > 0 && projectedTotalStock > maxCap;
                  const isLotFull = maxCap > 0 && currentStockQty >= maxCap && groupAllocated > 0;
                  const overage = Math.max(0, projectedTotalStock - maxCap);
                  const lotCapacityUtilization = maxCap > 0 ? Math.min(100, Math.round((projectedTotalStock / maxCap) * 100)) : 0;

                  const lotStored = lotStoredSummaryMap.get(Number(group.lot_id));
                  const typeCompat = checkLotProductTypeCompatibility(lotStored, targetClassification);
                  const isTypeConflict = typeCompat.isTypeMismatch;

                  const isGroupBadStock = isBadStockLot(groupLot);
                  const hasBadStockConflict = isGroupBadStock
                    ? (group.batches || []).some((b) => b.qa_status === "GOOD")
                    : (group.batches || []).some((b) => b.qa_status && b.qa_status !== "GOOD");

                  return (
                    <div
                      key={`target-lot-group-${gIdx}`}
                      className={`bg-card rounded-xl border transition-all shadow-sm ${
                        hasBadStockConflict
                          ? "border-destructive dark:border-destructive/80 ring-2 ring-destructive/40"
                          : isTypeConflict
                          ? "border-destructive dark:border-destructive/80 ring-1 ring-destructive/30"
                          : isUomMismatch
                          ? "border-amber-400 dark:border-amber-700"
                          : isLotFull || isCapacityExceeded
                          ? "border-destructive dark:border-destructive/80 ring-1 ring-destructive/20"
                          : "border-border"
                      }`}
                    >
                      {/* LOT HEADER & SELECTOR */}
                      <div className="p-3.5 border-b border-border bg-muted/20 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 rounded-t-xl">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1 w-full lg:w-auto">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-black flex items-center justify-center shrink-0">
                              #{gIdx + 1}
                            </span>
                            <div className="w-72 sm:w-80">
                              {(() => {
                                const groupIsBad = (group.batches || []).some((b) => b.qa_status && b.qa_status !== "GOOD");
                                const compatibleLots = lots.filter((lot) => {
                                  if (lot.status && lot.status !== "ACTIVE") return false;
                                  const lUomId = lot.unit_id ? Number(lot.unit_id) : null;
                                  const isUomMatch = !lUomId || (targetUnit && Number(targetUnit.unitId) === lUomId);
                                  if (!isUomMatch) return false;
                                  const stored = lotStoredSummaryMap.get(Number(lot.lot_id));
                                  const tCompat = checkLotProductTypeCompatibility(stored, targetClassification);
                                  if (!tCompat.isCompatible) return false;
                                  const lotIsBad = isBadStockLot(lot);
                                  if (groupIsBad && !lotIsBad) return false;
                                  if (!groupIsBad && lotIsBad) return false;
                                  return true;
                                });

                                const optionsLots = (lots || []).filter(
                                  (l) => (group.lot_id && Number(l.lot_id) === Number(group.lot_id)) || compatibleLots.some((c) => Number(c.lot_id) === Number(l.lot_id)) || compatibleLots.length === 0
                                );

                                return (
                                  <SearchableSelect
                                    options={optionsLots.map((lot) => {
                                      const lUomId = lot.unit_id ? Number(lot.unit_id) : null;
                                      const lStock = Number(lot.current_stock_quantity || 0);
                                      const lCap = Number(lot.max_batch_capacity || 0);
                                      const isMism = Boolean(
                                        lUomId &&
                                          targetUnit &&
                                          Number(targetUnit.unitId) !== lUomId
                                      );
                                      const isF = lCap > 0 && lStock >= lCap;
                                      const stored = lotStoredSummaryMap.get(Number(lot.lot_id));
                                      const tCompat = checkLotProductTypeCompatibility(stored, targetClassification);
                                      const isTConflict = tCompat.isTypeMismatch;
                                      const isDraft = stored?.is_draft_allocation;
                                      const typeSourceLabel = isDraft ? "Form Draft" : "Warehouse";
                                      const lotIsBad = isBadStockLot(lot);

                                      let badgeText: string | undefined;
                                      let badgeClass = "bg-muted text-muted-foreground border-border/60 font-mono";

                                      if (isTConflict && stored) {
                                        badgeText = `Type Mismatch: ${typeSourceLabel} (${stored.primary_classification_label})`;
                                        badgeClass = "bg-destructive/15 text-destructive border-destructive/40 font-bold";
                                      } else if (isMism) {
                                        badgeText = `Unit Mismatch (${lot.unit_name || `UOM #${lUomId}`})`;
                                        badgeClass = "bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40 font-bold";
                                      } else if (isF) {
                                        badgeText = `Full (${lStock}/${lCap})`;
                                        badgeClass = "bg-destructive/15 text-destructive border-destructive/40 font-bold";
                                      } else if (lotIsBad) {
                                        badgeText = "Bad Stock / Quarantine";
                                        badgeClass = "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40 font-bold";
                                      } else if (stored && !stored.is_empty && stored.primary_classification === targetClassification.code) {
                                        badgeText = `Type: Matched (${stored.primary_classification_label})${isDraft ? " [Draft]" : ""}`;
                                        badgeClass = "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40 font-bold";
                                      } else if (stored?.is_empty) {
                                        badgeText = "Empty Lot";
                                        badgeClass = "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30 font-semibold";
                                      } else if (lCap > 0) {
                                        badgeText = `Stock: ${lStock}/${lCap} (${Math.round((lStock / lCap) * 100)}%)`;
                                      }

                                      const prefix = isTConflict ? "🚫 " : isMism ? "⚠️ " : isF ? "🚫 " : "";
                                      const capStr = lCap ? ` (Cap: ${lCap})` : "";
                                      const storedTypeStr = stored && !stored.is_empty ? ` • Stored: ${stored.primary_classification_label}` : " • [Empty Lot]";

                                      return {
                                        value: String(lot.lot_id),
                                        label: `${prefix}${lot.lot_name}${capStr}`,
                                        subLabel: `Current Stock: ${lStock.toLocaleString()} ${lot.unit_name || targetUnit?.name || "units"}${lCap ? ` • Max Cap: ${lCap.toLocaleString()}` : ""}${storedTypeStr}`,
                                        badge: badgeText,
                                        badgeClassName: badgeClass,
                                      };
                                    })}
                                    value={group.lot_id ? String(group.lot_id) : ""}
                                    onValueChange={(val) => handleChangeLot(gIdx, val)}
                                    placeholder="Select Storage Rack / Lot..."
                                    searchPlaceholder="Search lot name..."
                                    emptyMessage="No compatible storage lots found for this UOM and product type."
                                    className="h-8 text-xs font-bold"
                                  />
                                );
                              })()}
                            </div>
                          </div>

                          {/* Lot Badges */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Product Type Status Badge */}
                            {isTypeConflict ? (
                              <Badge variant="outline" className="text-[9px] bg-destructive/10 text-destructive border-destructive/30 font-bold">
                                Type Mismatch: {lotStored?.is_draft_allocation ? "Form Draft" : "Warehouse"} ({lotStored?.primary_classification_label})
                              </Badge>
                            ) : lotStored && !lotStored.is_empty && lotStored.primary_classification === targetClassification.code ? (
                              <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-bold">
                                Type: Matched ({lotStored.primary_classification_label}) {lotStored.is_draft_allocation ? "[Draft]" : ""}
                              </Badge>
                            ) : lotStored?.is_empty ? (
                              <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30">
                                Type: Unassigned (Empty Lot)
                              </Badge>
                            ) : null}

                            {/* Bad Stock Status Badge */}
                            {isGroupBadStock ? (
                              <Badge variant="outline" className={`text-[9px] font-bold flex items-center gap-1 ${
                                hasBadStockConflict
                                  ? "bg-destructive/15 text-destructive border-destructive/40 animate-pulse"
                                  : "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/40"
                              }`}>
                                <AlertTriangle className="w-3 h-3" />
                                {hasBadStockConflict
                                  ? "Bad Stock Rack: GOOD stock shouldn't be allocated here"
                                  : "Bad Stock Rack (Damaged / Quarantined / Expired)"}
                              </Badge>
                            ) : hasBadStockConflict ? (
                              <Badge variant="destructive" className="text-[9px] flex items-center gap-1 font-bold animate-pulse shadow-sm">
                                <AlertTriangle className="w-3 h-3" />
                                Standard Rack: Bad stock shouldn&apos;t be allocated here
                              </Badge>
                            ) : null}

                            {isUomMismatch ? (
                              <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30">
                                Designated: {group.unit_name || `#${lotUomId}`} (Mismatch)
                              </Badge>
                            ) : lotUomId ? (
                              <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30">
                                UOM: {group.unit_name || targetUnit.name}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[9px] bg-muted/40 text-muted-foreground">
                                UOM: Unrestricted
                              </Badge>
                            )}

                            {!isUomMismatch && maxCap > 0 && (
                              <Badge
                                variant={isCapacityExceeded || isLotFull ? "destructive" : "secondary"}
                                className="text-[9px] font-mono font-bold flex items-center gap-1"
                              >
                                <Gauge className="w-3 h-3" />
                                {projectedTotalStock.toLocaleString()} / {maxCap.toLocaleString()} ({lotCapacityUtilization}%)
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Lot Group Total & Remove */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 w-full lg:w-auto shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0">
                          <div className="text-left sm:text-right">
                            <span className="text-[9px] uppercase font-bold text-muted-foreground block">Allocated in this Rack</span>
                            <span className="text-xs font-mono font-black text-foreground">
                              {groupAllocated.toLocaleString()} {targetUnit.name}
                            </span>
                          </div>

                          {targetLotGroups.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveLotGroup(gIdx)}
                              className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                              title="Remove Storage Lot"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* PRODUCT TYPE CONFLICT ALERT BANNER */}
                      {isTypeConflict && (
                        <div className="p-3 bg-destructive/10 border-b border-destructive/30 text-xs text-destructive space-y-1">
                          <div className="flex items-center gap-1.5 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0" />
                            <span>Incompatible Storage Rack (Product Type Conflict)</span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-destructive/90">
                            Storage Rack <strong>&quot;{group.lot_name}&quot;</strong> currently stores {lotStored?.is_draft_allocation ? "items in current form draft" : "warehouse inventory"} of type <strong>&quot;{lotStored?.primary_classification_label || "Other"}&quot;</strong> (Total: {lotStored?.total_stored_quantity.toLocaleString()} units).
                            You cannot store <strong>&quot;{targetClassification.label}&quot;</strong> products into this rack. Please select an empty or matching storage rack.
                          </p>
                        </div>
                      )}

                      {/* STORED PRODUCTS SUMMARY BAR */}
                      {lotStored && !lotStored.is_empty && !isTypeConflict && (
                        <div className="px-3.5 py-1.5 bg-muted/30 border-b border-border/50 text-[11px] flex items-center justify-between flex-wrap gap-2">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <Boxes className="w-3.5 h-3.5 text-primary shrink-0" />
                            <span>Stored in Rack:</span>
                            <span className="font-semibold text-foreground">
                              {lotStored.stored_products.map((p: { product_name?: string; product_code?: string; product_id: number; onhand_quantity: number; is_draft?: boolean }) => `${p.product_name || p.product_code || `Product #${p.product_id}`} (${p.onhand_quantity.toLocaleString()}${p.is_draft ? " [Draft]" : ""})`).join(", ")}
                            </span>
                          </span>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Type: <strong className="text-foreground">{lotStored.primary_classification_label}</strong>
                          </span>
                        </div>
                      )}

                      {/* LOT CAPACITY & UOM STATUS CARD */}
                      {isUomMismatch ? (
                        <div className="p-3 bg-amber-500/10 border-b border-border/60 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                          <div className="flex items-center gap-1.5 font-bold">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>Incompatible Storage Rack (Unit Mismatch)</span>
                          </div>
                          <p className="text-[11px] leading-relaxed">
                            Storage Rack <strong>&quot;{group.lot_name}&quot;</strong> is designated for <strong>&quot;{group.unit_name || `UOM #${lotUomId}`}&quot;</strong> (Current Stock: {currentStockQty.toLocaleString()} {group.unit_name || `UOM #${lotUomId}`}), while conversion output is <strong>&quot;{targetUnit.name}&quot;</strong>.
                          </p>
                        </div>
                      ) : (
                        <div className="p-3 bg-muted/10 border-b border-border/60 space-y-2">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div className="p-2 bg-card rounded-lg border border-border/60">
                              <span className="text-[9px] uppercase font-bold text-muted-foreground block">1. Current Stock</span>
                              <div className="text-xs font-mono font-bold text-foreground mt-0.5">
                                {currentStockQty.toLocaleString()} <span className="text-[9px] font-normal text-muted-foreground">{targetUnit.name}</span>
                              </div>
                            </div>

                            <div className="p-2 bg-primary/5 rounded-lg border border-primary/20">
                              <span className="text-[9px] uppercase font-bold text-primary block">2. Allocating Now</span>
                              <div className="text-xs font-mono font-black text-primary mt-0.5">
                                +{groupAllocated.toLocaleString()} <span className="text-[9px] font-normal text-muted-foreground">{targetUnit.name}</span>
                              </div>
                            </div>

                            <div className="p-2 bg-card rounded-lg border border-border/60">
                              <span className="text-[9px] uppercase font-bold text-muted-foreground block">3. Available Space</span>
                              <div className={`text-xs font-mono font-bold mt-0.5 ${availableSpace <= 0 ? "text-destructive font-black" : "text-emerald-600 dark:text-emerald-400"}`}>
                                {availableSpace.toLocaleString()} <span className="text-[9px] font-normal text-muted-foreground">{targetUnit.name}</span>
                              </div>
                            </div>

                            <div className={`p-2 rounded-lg border ${isCapacityExceeded ? "bg-destructive/10 border-destructive/30" : "bg-card border-border/60"}`}>
                              <span className="text-[9px] uppercase font-bold text-muted-foreground block">4. Projected Total</span>
                              <div className={`text-xs font-mono font-bold mt-0.5 ${isCapacityExceeded ? "text-destructive font-black" : "text-foreground"}`}>
                                {projectedTotalStock.toLocaleString()} <span className="text-[9px] font-normal text-muted-foreground">/ {maxCap.toLocaleString()}</span>
                              </div>
                            </div>
                          </div>

                          {/* Dual-Segment Visual Capacity Meter */}
                          {maxCap > 0 && (
                            <div className="space-y-1 pt-1">
                              <div className="w-full bg-muted rounded-full h-2 overflow-hidden border border-border/60 flex">
                                <div
                                  className="h-full bg-primary/70 transition-all duration-300"
                                  style={{ width: `${Math.min(100, Math.round((currentStockQty / maxCap) * 100))}%` }}
                                  title={`Current Stock: ${currentStockQty}`}
                                />
                                <div
                                  className={`h-full transition-all duration-300 ${isCapacityExceeded ? "bg-destructive" : "bg-emerald-500"}`}
                                  style={{
                                    width: `${Math.min(
                                      100 - Math.min(100, Math.round((currentStockQty / maxCap) * 100)),
                                      Math.round((groupAllocated / maxCap) * 100)
                                    )}%`,
                                  }}
                                  title={`Allocating: +${groupAllocated}`}
                                />
                              </div>
                            </div>
                          )}

                          {/* Over Capacity Warning */}
                          {isCapacityExceeded && (
                            <div className="flex items-center justify-between flex-wrap gap-2 text-destructive text-xs pt-1">
                              <div className="flex items-center gap-1 font-semibold">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>Exceeds capacity by {overage.toLocaleString()} {targetUnit.name}!</span>
                              </div>
                              {availableSpace > 0 && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    if (group.batches.length === 1) {
                                      handleBatchChange(gIdx, 0, "quantity", availableSpace);
                                    }
                                  }}
                                  className="h-6 px-2 text-[10px] font-bold border-destructive/40 hover:bg-destructive/20 text-destructive"
                                >
                                  Cap to Available Space ({availableSpace} {targetUnit.name})
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* BATCH ROWS FOR THIS LOT */}
                      <div className="p-3.5 space-y-2.5">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Batch Splits in {group.lot_name}
                          </Label>

                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Toolbar Dates & Apply to all */}
                            <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border/60">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase">Mfg:</span>
                                <Input
                                  type="date"
                                  value={
                                    toolbarDates[gIdx]?.mfg ??
                                    (group.batches[0]?.manufacturing_date
                                      ? String(group.batches[0].manufacturing_date).substring(0, 10)
                                      : "")
                                  }
                                  onChange={(e) => {
                                    const current = toolbarDates[gIdx] || {
                                      mfg: group.batches[0]?.manufacturing_date
                                        ? String(group.batches[0].manufacturing_date).substring(0, 10)
                                        : "",
                                      exp: group.batches[0]?.expiry_date
                                        ? String(group.batches[0].expiry_date).substring(0, 10)
                                        : "",
                                    };
                                    setToolbarDates({ ...toolbarDates, [gIdx]: { ...current, mfg: e.target.value } });
                                  }}
                                  className="h-7 text-xs w-32 bg-background px-2 py-0"
                                  title="Select manufacturing date to apply to all splits in this lot"
                                />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase">Exp:</span>
                                <Input
                                  type="date"
                                  value={
                                    toolbarDates[gIdx]?.exp ??
                                    (group.batches[0]?.expiry_date
                                      ? String(group.batches[0].expiry_date).substring(0, 10)
                                      : "")
                                  }
                                  onChange={(e) => {
                                    const current = toolbarDates[gIdx] || {
                                      mfg: group.batches[0]?.manufacturing_date
                                        ? String(group.batches[0].manufacturing_date).substring(0, 10)
                                        : "",
                                      exp: group.batches[0]?.expiry_date
                                        ? String(group.batches[0].expiry_date).substring(0, 10)
                                        : "",
                                    };
                                    setToolbarDates({ ...toolbarDates, [gIdx]: { ...current, exp: e.target.value } });
                                  }}
                                  className="h-7 text-xs w-32 bg-background px-2 py-0"
                                  title="Select expiration date to apply to all splits in this lot"
                                />
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  const currentMfg =
                                    toolbarDates[gIdx]?.mfg ??
                                    (group.batches[0]?.manufacturing_date
                                      ? String(group.batches[0].manufacturing_date).substring(0, 10)
                                      : "");
                                  const currentExp =
                                    toolbarDates[gIdx]?.exp ??
                                    (group.batches[0]?.expiry_date
                                      ? String(group.batches[0].expiry_date).substring(0, 10)
                                      : "");

                                  handleApplyDatesToAll(gIdx, currentMfg, currentExp);
                                }}
                                className="h-7 text-xs font-bold px-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 cursor-pointer"
                                title="Apply selected dates to all batches in this lot"
                              >
                                Apply to all
                              </Button>
                            </div>

                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleAddBatchRow(gIdx)}
                              className="h-7 px-2 text-[10px] gap-1 text-primary hover:bg-primary/10 font-bold border border-primary/20 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" /> Add Batch Split
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          {group.batches.map((batch, bIdx) => (
                            <div
                              key={`batch-row-${gIdx}-${bIdx}`}
                              className="p-3 rounded-xl border border-border bg-card/60 flex flex-col md:flex-row items-stretch md:items-end gap-2.5 text-xs shadow-xs"
                            >
                              {/* Batch Number */}
                              <div className="flex-1 min-w-[170px] space-y-1">
                                <div className="flex items-center justify-between">
                                  <Label className="text-[10px] font-bold text-muted-foreground uppercase">Batch No *</Label>
                                  <button
                                    type="button"
                                    onClick={() => handleBatchChange(gIdx, bIdx, "batch_no", generateBatchNo())}
                                    className="text-[9px] text-primary hover:underline font-semibold"
                                  >
                                    Generate
                                  </button>
                                </div>
                                <Input
                                  value={batch.batch_no}
                                  onChange={(e) => handleBatchChange(gIdx, bIdx, "batch_no", e.target.value)}
                                  placeholder="Please enter batch no"
                                  className="h-8 text-xs font-mono font-medium"
                                />
                              </div>

                              {/* Quantity */}
                              <div className="w-28 shrink-0 space-y-1">
                                <div className="flex items-center justify-between">
                                  <Label className="text-[10px] font-bold text-muted-foreground uppercase truncate">Qty ({targetUnit.name}) *</Label>
                                  <button
                                    type="button"
                                    onClick={() => handleFillBatch(gIdx, bIdx)}
                                    className="text-[9px] text-primary hover:underline font-semibold"
                                  >
                                    Fill
                                  </button>
                                </div>
                                <Input
                                  type="number"
                                  min={0}
                                  value={batch.quantity === 0 || batch.quantity === undefined || batch.quantity === null ? "" : batch.quantity}
                                  onFocus={(e) => e.target.select()}
                                  onClick={(e) => (e.target as HTMLInputElement).select()}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === "") {
                                      handleBatchChange(gIdx, bIdx, "quantity", 0);
                                    } else {
                                      const num = parseInt(val, 10);
                                      handleBatchChange(gIdx, bIdx, "quantity", isNaN(num) ? 0 : Math.max(0, num));
                                    }
                                  }}
                                  placeholder="0"
                                  className="h-8 text-xs font-bold font-mono"
                                />
                              </div>

                              {/* Manufacturing Date */}
                              <div className="w-36 shrink-0 space-y-1">
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase block">Mfg Date *</Label>
                                <Input
                                  type="date"
                                  value={batch.manufacturing_date || ""}
                                  onChange={(e) => handleBatchChange(gIdx, bIdx, "manufacturing_date", e.target.value)}
                                  className="h-8 text-xs"
                                />
                              </div>

                              {/* Expiration Date */}
                              <div className="w-36 shrink-0 space-y-1">
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase block">Exp Date *</Label>
                                <Input
                                  type="date"
                                  value={batch.expiry_date || ""}
                                  onChange={(e) => handleBatchChange(gIdx, bIdx, "expiry_date", e.target.value)}
                                  className="h-8 text-xs"
                                />
                              </div>

                              {/* QA Status */}
                              <div className="w-36 shrink-0 space-y-1">
                                <Label className="text-[10px] font-bold text-muted-foreground uppercase block">QA Status *</Label>
                                <Select
                                  value={batch.qa_status || "GOOD"}
                                  onValueChange={(val) => handleBatchChange(gIdx, bIdx, "qa_status", val as QAStatus)}
                                >
                                  <SelectTrigger className={`h-8 text-xs font-semibold ${
                                    (!isGroupBadStock && batch.qa_status && batch.qa_status !== 'GOOD') || (isGroupBadStock && batch.qa_status === 'GOOD')
                                      ? 'border-destructive ring-1 ring-destructive/40 text-destructive bg-destructive/5'
                                      : ''
                                  }`}>
                                    <SelectValue placeholder="Status" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="GOOD" className="text-xs">
                                      <span className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> GOOD
                                      </span>
                                    </SelectItem>
                                    <SelectItem value="DAMAGED" className="text-xs">
                                      <span className="flex items-center gap-1.5 font-bold text-rose-600 dark:text-rose-400">
                                        <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> DAMAGED
                                      </span>
                                    </SelectItem>
                                    <SelectItem value="QUARANTINED" className="text-xs">
                                      <span className="flex items-center gap-1.5 font-bold text-amber-600 dark:text-amber-400">
                                        <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> QUARANTINED
                                      </span>
                                    </SelectItem>
                                    <SelectItem value="EXPIRED" className="text-xs">
                                      <span className="flex items-center gap-1.5 font-bold text-purple-600 dark:text-purple-400">
                                        <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /> EXPIRED
                                      </span>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                {!isGroupBadStock && batch.qa_status && batch.qa_status !== 'GOOD' && (
                                  <span className="text-[10px] text-destructive font-bold flex items-center gap-1 mt-0.5 leading-tight">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    Bad stock shouldn&apos;t be allocated here
                                  </span>
                                )}
                                {isGroupBadStock && batch.qa_status === 'GOOD' && (
                                  <span className="text-[10px] text-destructive font-bold flex items-center gap-1 mt-0.5 leading-tight">
                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                    Good stock shouldn&apos;t be allocated here
                                  </span>
                                )}
                              </div>

                              {/* Remove Button */}
                              <div className="w-8 shrink-0 flex items-center justify-center">
                                {group.batches.length > 1 ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveBatchRow(gIdx, bIdx)}
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                                    title="Remove Batch Split"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                ) : (
                                  <div className="w-8 h-8" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* BATCH GENEALOGY TREE TRACE */}
              <div className="bg-card border border-border/70 rounded-lg p-3 space-y-1 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-foreground">
                  <GitBranch className="w-3.5 h-3.5 text-primary" />
                  <span>Genealogy & Traceability Matrix:</span>
                </div>
                <div className="font-mono text-[11px] text-muted-foreground pl-4 space-y-1 pt-1">
                  <div>
                    Outputs ({totalTargetAllocated} {targetUnit.name}):
                  </div>
                  {targetLotGroups.map((g, gIdx) => (
                    <div key={`tree-group-${gIdx}`} className="pl-3 border-l border-primary/30 space-y-0.5">
                      <div className="font-bold text-foreground">
                        Rack: {g.lot_name} (Total: {(g.batches || []).reduce((s, b) => s + Number(b.quantity || 0), 0)} {targetUnit.name})
                      </div>
                      {g.batches.map((b, bIdx) => (
                        <div key={`tree-b-${gIdx}-${bIdx}`} className="pl-3 border-l border-primary/20 text-[10px]">
                          ├── Target Batch: <strong className="text-primary">{b.batch_no}</strong> ({b.quantity} {targetUnit.name} &bull; Exp: {b.expiry_date || "N/A"})
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="pt-1">
                    Sources Consumed ({Number(qtyToConvert)} {product.currentUnit}):
                  </div>
                  {activeAllocations.map((a, idx) => (
                    <div key={`tree-src-${idx}`} className="pl-3 border-l border-muted-foreground/30 text-[10px]">
                      └── Source Batch: <strong className="text-foreground">{a.batch_no}</strong> ({a.allocated_quantity} {product.currentUnit} &bull; Exp: {a.expiry_date || "N/A"})
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* VALIDATION ERROR ALERTS SUMMARY */}
          {!isValid && validationErrors.length > 0 && selectedTargetUnit && qtyToConvert && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3.5 text-xs text-destructive space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold">
                <ShieldAlert className="w-4 h-4" />
                <span>Conversion Requirements Incomplete:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 pl-1 text-[11px]">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 px-6 border-t border-border bg-muted/10 gap-2 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isValid && qtyToConvert && wholeUnits > 0 ? (
              <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Ready for Conversion ({wholeUnits} {targetUnit?.name} across {targetLotGroups.length} lot(s))
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={!isValid}
              className="text-xs gap-1.5 font-bold"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Confirm Conversion
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
