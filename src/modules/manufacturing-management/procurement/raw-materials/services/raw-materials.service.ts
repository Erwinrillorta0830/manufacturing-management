import { 
    UnitOption, 
    WeightUnitOption, 
    SelectOption,
    TaxRateOption,
    PurchaseQaConfig,
    PurchaseQaParameter,
    BatchItem
} from "../types/raw-materials.types";
import { getDensityRequirement } from "../density-policy";

interface InventoryDetailsResponse {
    batches?: unknown;
    error?: unknown;
}

export async function fetchProductInventoryDetails(productId: number): Promise<BatchItem[]> {
    if (!Number.isSafeInteger(productId) || productId <= 0) {
        throw new Error("Invalid product ID for inventory details.");
    }

    const res = await fetch(`/api/manufacturing/inventory?productId=${encodeURIComponent(productId)}`, {
        cache: "no-store"
    });
    const responseBody = await res.json().catch(() => null) as InventoryDetailsResponse | null;
    if (!res.ok) {
        if (res.status >= 500) {
            throw new Error("Unable to load inventory data at this time.");
        }

        const errorMessage = typeof responseBody?.error === "string" ? responseBody.error : null;
        throw new Error(errorMessage || "Failed to load inventory details.");
    }

    if (!responseBody || !Array.isArray(responseBody.batches)) {
        throw new Error("Inventory details returned an invalid response.");
    }

    if (responseBody.batches.some(batch => !batch || typeof batch !== "object")) {
        throw new Error("Inventory details returned an invalid response.");
    }

    return responseBody.batches as BatchItem[];
}

export async function fetchRawMaterialMetadata(): Promise<{
    units: UnitOption[];
    weightUnits: WeightUnitOption[];
    brands: SelectOption[];
    categories: SelectOption[];
    itemGroups: SelectOption[];
    taxRates: TaxRateOption[];
}> {
    const [unitsRes, brandsRes, categoriesRes, weightUnitsRes, sharedMetadataRes] = await Promise.all([
        fetch("/api/manufacturing/finished-goods/units").then(res => res.json()),
        fetch("/api/manufacturing/finished-goods/brands").then(res => res.json()),
        fetch("/api/manufacturing/finished-goods/categories").then(res => res.json()),
        fetch("/api/manufacturing/finished-goods/weight-units").then(res => res.json()),
        fetch("/api/manufacturing/procurement/raw-materials/metadata").then(async res => {
            if (!res.ok) throw new Error(`Failed to load shared raw-material metadata (${res.status}).`);
            return res.json();
        })
    ]);

    const units: UnitOption[] = Array.isArray(unitsRes)
        ? unitsRes.map((unit: {
            unit_id: number;
            unit_name: string;
            unit_shortcut: string;
            density_required?: boolean | null;
        }) => ({
            unit_id: unit.unit_id,
            unit_name: unit.unit_name,
            unit_shortcut: unit.unit_shortcut,
            requiresDensity: typeof unit.density_required === "boolean"
                ? unit.density_required
                : getDensityRequirement(unit)
        }))
        : [];
    const weightUnits: WeightUnitOption[] = weightUnitsRes || [];
    const brands: SelectOption[] = (brandsData => (brandsData || []).map((b: { brand_id: number; brand_name: string }) => ({ value: String(b.brand_id), label: b.brand_name })))(brandsRes);
    const categories: SelectOption[] = (categoriesData => (categoriesData || []).map((c: { category_id: number; category_name: string }) => ({ value: String(c.category_id), label: c.category_name })))(categoriesRes);
    const itemGroups: SelectOption[] = Array.isArray(sharedMetadataRes?.itemGroups)
        ? sharedMetadataRes.itemGroups.map((group: { id: number; code?: string; name: string }) => ({
            value: String(group.id),
            label: group.code ? `${group.name} (${group.code.replace(/_/g, " ")})` : group.name
        }))
        : [];
    const taxRates: TaxRateOption[] = Array.isArray(sharedMetadataRes?.taxRates)
        ? sharedMetadataRes.taxRates.map((taxRate: { id: number; vatRate?: number; withholdingRate?: number }) => ({
            value: String(taxRate.id),
            label: `VAT ${(Number(taxRate.vatRate || 0) * 100).toFixed(2)}% / EWT ${(Number(taxRate.withholdingRate || 0) * 100).toFixed(2)}%`,
            vatRate: Number(taxRate.vatRate || 0),
            withholdingRate: Number(taxRate.withholdingRate || 0)
        }))
        : [];

    return { units, weightUnits, brands, categories, itemGroups, taxRates };
}

export async function createBrandOnTheFly(name: string): Promise<SelectOption> {
    const res = await fetch("/api/manufacturing/finished-goods/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: name })
    });
    if (!res.ok) throw new Error("Failed to create brand");
    const data = await res.json();
    const newBrand = data.brand;
    if (!newBrand) throw new Error("Invalid response creating brand");
    return { value: String(newBrand.brand_id), label: newBrand.brand_name };
}

export async function createCategoryOnTheFly(name: string): Promise<SelectOption> {
    const res = await fetch("/api/manufacturing/finished-goods/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_name: name })
    });
    if (!res.ok) throw new Error("Failed to create category");
    const data = await res.json();
    const newCat = data.category;
    if (!newCat) throw new Error("Invalid response creating category");
    return { value: String(newCat.category_id), label: newCat.category_name };
}

export async function fetchLinkedSuppliers(productId: number): Promise<number[]> {
    const linksByProduct = await fetchProductSupplierLinks([productId]);
    return linksByProduct.get(productId) || [];
}

export interface ProductSupplierLink {
    product_id: number;
    supplier_id: number;
}

function positiveId(value: unknown): number | null {
    if (value && typeof value === "object") {
        const record = value as Record<string, unknown>;
        return positiveId(record.id ?? record.product_id ?? record.supplier_id);
    }

    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function fetchProductSupplierLinks(productIds: number[]): Promise<Map<number, number[]>> {
    const uniqueProductIds = [...new Set(productIds)];
    if (uniqueProductIds.some(productId => !Number.isSafeInteger(productId) || productId <= 0)) {
        throw new Error("Product supplier lookup requires positive product IDs.");
    }

    const linksByProduct = new Map(uniqueProductIds.map(productId => [productId, [] as number[]]));
    if (uniqueProductIds.length === 0) return linksByProduct;

    const res = await fetch(
        `/api/manufacturing/procurement/product-per-supplier?productIds=${uniqueProductIds.join(",")}`,
        { cache: "no-store" }
    );
    const body = await res.json().catch(() => null) as { error?: unknown } | unknown;
    if (!res.ok) {
        const message = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
            ? (body as { error: string }).error
            : "Failed to load product supplier links.";
        throw new Error(message);
    }
    if (!Array.isArray(body)) {
        throw new Error("Product supplier links returned an invalid response.");
    }

    for (const rawLink of body) {
        if (!rawLink || typeof rawLink !== "object") {
            throw new Error("Product supplier links returned an invalid relationship.");
        }
        const link = rawLink as Partial<ProductSupplierLink>;
        const productId = positiveId(link.product_id);
        const supplierId = positiveId(link.supplier_id);
        if (productId === null || supplierId === null || !linksByProduct.has(productId)) {
            throw new Error("Product supplier links returned an invalid relationship.");
        }

        const supplierIds = linksByProduct.get(productId) || [];
        if (!supplierIds.includes(supplierId)) supplierIds.push(supplierId);
        linksByProduct.set(productId, supplierIds);
    }

    return linksByProduct;
}

export async function fetchPurchaseQaParameters(): Promise<PurchaseQaParameter[]> {
    const res = await fetch("/api/manufacturing/qa/parameters");
    if (!res.ok) throw new Error("Failed to load purchase QA parameters.");
    const body = await res.json();
    return Array.isArray(body?.data) ? body.data : [];
}

export async function fetchProductPurchaseQa(productId: number): Promise<PurchaseQaConfig> {
    const res = await fetch(`/api/manufacturing/qa/specifications?productId=${encodeURIComponent(productId)}`);
    if (!res.ok) throw new Error("Failed to load product purchase QA configuration.");
    const body = await res.json();
    const specifications = Array.isArray(body?.data)
        ? body.data.map((specification: {
            specId: number;
            parameterId: number;
            targetMin: number | null;
            targetMax: number | null;
            expectedText: string | null;
            isCritical: boolean;
        }) => ({
            specId: specification.specId,
            parameterId: specification.parameterId,
            targetMin: specification.targetMin,
            targetMax: specification.targetMax,
            expectedText: specification.expectedText,
            isCritical: specification.isCritical
        }))
        : [];
    return { inspectionRequired: specifications.length > 0, specifications };
}
