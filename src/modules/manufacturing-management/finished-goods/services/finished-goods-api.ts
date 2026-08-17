/* eslint-disable */
import {
    Product,
    Brand,
    Category,
    Unit,
    ProductVersion,
    BFFCatalogProduct,
    ProductClass,
    ProductSegment,
    ProductSection,
    QATemplate,
    QAParameter,
    RouteStep,
    RouteBOMItem,
    ProductOverhead,
    AssetRecord,
    DepartmentRecord
} from "../types";

/**
 * Client-side services for Finished Goods interacting with the Next.js API BFF.
 */

export function extractId(value: unknown): number | undefined {
    if (value === null || value === undefined || value === "") return undefined;
    if (typeof value === "number") {
        return Number.isFinite(value) && value > 0 ? value : undefined;
    }
    if (typeof value === "string") {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    }
    if (typeof value === "object") {
        const obj = value as Record<string, unknown>;
        const candidate = obj.category_id ?? obj.brand_id ?? obj.unit_id ?? obj.id ?? obj.class_id ?? obj.segment_id ?? obj.section_id ?? obj.product_id;
        return extractId(candidate);
    }
    return undefined;
}

export function normalizeProductActiveState(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
        return value.trim().toLowerCase() !== "false" && value.trim() !== "0";
    }
    return true;
}

export async function fetchProducts(search?: string, limit: number = 100): Promise<Product[]> {
    const query = new URLSearchParams();
    if (search) query.append("search", search);
    query.append("limit", String(limit));
    query.append("excludeRollup", "true");

    const res = await fetch(`/api/manufacturing/finished-goods/products?${query.toString()}`);
    if (!res.ok) throw new Error("Failed to fetch products from BFF");
    const data = await res.json();

    // Map Directus model to local Product interface
    return data.map((p: BFFCatalogProduct) => {
        const parentId = extractId(p.parent_id) ?? null;
        const isActive = normalizeProductActiveState(p.isActive);
        const resolvedStatus = (p as unknown as { status?: string }).status || (isActive ? "Active" : "Inactive");

        return {
            id: String(p.product_id),
            sku: p.product_code || `SKU-${p.product_id}`,
            title: p.product_name,
            description: p.short_description || p.description || "",
            identityKey: p.description || null,
            barcode: p.barcode || "",
            baseUom: p.unit_of_measurement?.unit_shortcut || p.unit_of_measurement?.unit_name || "PCS",
            expectedYieldPercent: 100,
            targetSellingPrice: Number(p.price_per_unit || 0),
            parentProduct: parentId === null,
            parent_id: parentId,
            status: resolvedStatus,
            isActive: resolvedStatus !== "Inactive" && isActive,
            bom: [],
            routings: [],
            densityFactor: p.density_factor ? Number(p.density_factor) : 1.0,
            product_brand: extractId(p.product_brand),
            product_category: extractId(p.product_category),
            product_class: extractId(p.product_class),
            product_segment: extractId(p.product_segment),
            product_section: extractId(p.product_section),
            product_shelf_life: p.product_shelf_life ? Number(p.product_shelf_life) : undefined,
            cost_per_unit: p.cost_per_unit ? Number(p.cost_per_unit) : undefined,
            unit_of_measurement_count: p.unit_of_measurement_count ? Number(p.unit_of_measurement_count) : undefined,
            product_image: p.product_image || undefined,

            has_versions: !!p.has_versions
        };
    });
}

export async function fetchBrands(): Promise<Brand[]> {
    const res = await fetch("/api/manufacturing/finished-goods/brands");
    if (!res.ok) throw new Error("Failed to fetch brands from BFF");
    return res.json();
}

export async function fetchCategories(): Promise<Category[]> {
    const res = await fetch("/api/manufacturing/finished-goods/categories");
    if (!res.ok) throw new Error("Failed to fetch categories from BFF");
    return res.json();
}

export async function fetchUnits(): Promise<Unit[]> {
    const res = await fetch("/api/manufacturing/finished-goods/units");
    if (!res.ok) throw new Error("Failed to fetch units from BFF");
    return res.json();
}

export async function fetchClasses(): Promise<ProductClass[]> {
    const res = await fetch("/api/manufacturing/finished-goods/classes");
    if (!res.ok) throw new Error("Failed to fetch classes from BFF");
    return res.json();
}

export async function fetchSegments(): Promise<ProductSegment[]> {
    const res = await fetch("/api/manufacturing/finished-goods/segments");
    if (!res.ok) throw new Error("Failed to fetch segments from BFF");
    return res.json();
}

export async function fetchSections(): Promise<ProductSection[]> {
    const res = await fetch("/api/manufacturing/finished-goods/sections");
    if (!res.ok) throw new Error("Failed to fetch sections from BFF");
    return res.json();
}

export async function fetchVersions(productId: number): Promise<ProductVersion[]> {
    const res = await fetch(`/api/manufacturing/finished-goods/versions?productId=${productId}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch versions from BFF");
    return res.json();
}

export async function fetchBOMDetails(productId: number, versionId: number, forexRate?: number): Promise<ProductVersion | null> {
    const query = new URLSearchParams({
        productId: String(productId),
        versionId: String(versionId)
    });
    if (forexRate) {
        query.append("forexRate", String(forexRate));
    }
    const res = await fetch(`/api/manufacturing/finished-goods/bom-details?${query.toString()}`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch BOM details from BFF");
    return res.json();
}

export async function saveBOMDetails(
    productId: number,
    versionId: number | null,
    details: {
        version_name: string;
        base_quantity: number;
        uom_id?: number | null;
        expected_yield_percentage: number;
        custom_overhead?: number;
        status: string;
        valid_from?: string | null;
        valid_to?: string | null;
        title?: string;
        sku?: string;
        barcode?: string;
        baseUom?: string;
        targetSellingPrice?: number;
        densityFactor?: number;
        productBrand?: number;
        productCategory?: number;
        shortDescription?: string;
        costPerUnit?: number;
        unitOfMeasurementCount?: number;
        productClass?: number;
        productSegment?: number;
        productSection?: number;
        productShelfLife?: number;
        productImage?: string;
        parent_id?: number | null;
        unit_of_measurement?: number | null;
    },
    routes: RouteStep[],
    overheads: ProductOverhead[] = []
): Promise<{ success: boolean; rollup?: unknown }> {
    const res = await fetch("/api/manufacturing/finished-goods/bom-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, versionId, details, routes, overheads })
    });
    if (!res.ok) {
        let msg = "Failed to save BOM details via BFF";
        let code: string | undefined;
        let fields: Record<string, string> | undefined;
        try {
            const errJson = await res.json();
            if (errJson && errJson.error) msg = errJson.error;
            if (errJson && errJson.code) code = errJson.code;
            if (errJson && errJson.fields) fields = errJson.fields;
        } catch { }
        const error = new Error(msg) as Error & {
            status?: number;
            code?: string;
            fields?: Record<string, string>;
        };
        error.status = res.status;
        error.code = code;
        error.fields = fields;
        throw error;
    }
    const payload = await res.json();
    if (!payload?.success) {
        throw new Error("The product update was not confirmed by the server.");
    }
    return payload;
}

export async function registerProduct(
    productDetails: {
        product_name: string;
        product_code: string;
        short_description?: string;
        barcode?: string;
        price_per_unit?: number;
        cost_per_unit?: number;
        density_factor?: number;
        unit_of_measurement?: number;
        unit_of_measurement_count?: number;
        product_brand?: number;
        product_category?: number;
        product_class?: number;
        product_segment?: number;
        product_section?: number;
        product_shelf_life?: number;
        product_image?: string;
        parent_id?: number | null;
    },
    versionName: string,
    supplierIds?: number[],
    expectedYield?: number,
    baseQuantity?: number,
    uomId?: number
): Promise<{ success: boolean; productId: number; version: ProductVersion }> {
    const res = await fetch("/api/manufacturing/finished-goods/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productDetails, versionName, supplierIds, expectedYield, baseQuantity, uomId })
    });
    if (!res.ok) {
        let msg = "Failed to register product via BFF";
        let code: string | undefined;
        let fields: Record<string, string> | undefined;
        try {
            const errJson = await res.json();
            if (errJson && errJson.error) msg = errJson.error;
            if (errJson && errJson.code) code = errJson.code;
            if (errJson && errJson.fields) fields = errJson.fields;
        } catch { }
        const error = new Error(msg) as Error & {
            status?: number;
            code?: string;
            fields?: Record<string, string>;
        };
        error.status = res.status;
        error.code = code;
        error.fields = fields;
        throw error;
    }
    return res.json();
}

export async function registerNewVersion(
    productId: number,
    baseVersionId: number | null,
    expectedYield: number,
    versionName: string,
    baseQuantity?: number,
    uomId?: number
): Promise<{ success: boolean; version: ProductVersion }> {
    const res = await fetch("/api/manufacturing/finished-goods/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, baseVersionId, expectedYield, versionName, baseQuantity, uomId })
    });
    if (!res.ok) {
        let msg = "Failed to register version via BFF";
        let code: string | undefined;
        let fields: Record<string, string> | undefined;
        try {
            const errJson = await res.json();
            if (errJson && errJson.error) msg = errJson.error;
            if (errJson && errJson.code) code = errJson.code;
            if (errJson && errJson.fields) fields = errJson.fields;
        } catch { }
        const error = new Error(msg) as Error & {
            status?: number;
            code?: string;
            fields?: Record<string, string>;
        };
        error.status = res.status;
        error.code = code;
        error.fields = fields;
        throw error;
    }
    return res.json();
}

export async function createBrand(brandName: string): Promise<{ success: boolean; brand: Brand }> {
    const res = await fetch("/api/manufacturing/finished-goods/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_name: brandName })
    });
    if (!res.ok) throw new Error("Failed to create brand via BFF");
    return res.json();
}

export async function createCategory(categoryName: string): Promise<{ success: boolean; category: Category }> {
    const res = await fetch("/api/manufacturing/finished-goods/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_name: categoryName })
    });
    if (!res.ok) throw new Error("Failed to create category via BFF");
    return res.json();
}

export async function createSegment(segmentName: string): Promise<{ success: boolean; segment: ProductSegment }> {
    const res = await fetch("/api/manufacturing/finished-goods/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment_name: segmentName })
    });
    if (!res.ok) throw new Error("Failed to create segment via BFF");
    return res.json();
}

export async function createClass(className: string): Promise<{ success: boolean; class: ProductClass }> {
    const res = await fetch("/api/manufacturing/finished-goods/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ class_name: className })
    });
    if (!res.ok) throw new Error("Failed to create class via BFF");
    return res.json();
}

export async function createSection(sectionName: string): Promise<{ success: boolean; section: ProductSection }> {
    const res = await fetch("/api/manufacturing/finished-goods/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_name: sectionName })
    });
    if (!res.ok) throw new Error("Failed to create section via BFF");
    return res.json();
}

export async function activateVersion(
    productId: number,
    versionId?: number,
    action: "set_active" | "set_primary" | "deactivate" | "deactivate_all" = "set_active",
    deactivateAll?: boolean
): Promise<{ success: boolean }> {
    const effectiveAction = deactivateAll ? "deactivate_all" : action;
    const res = await fetch("/api/manufacturing/finished-goods/versions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, versionId, action: effectiveAction, deactivateAll: deactivateAll || effectiveAction === "deactivate_all" })
    });
    if (!res.ok) {
        let msg = "Failed to update version status via BFF";
        try {
            const errJson = await res.json();
            if (errJson && errJson.error) msg = errJson.error;
        } catch { }
        throw new Error(msg);
    }
    return res.json();
}

// ─── QA Templates API Helpers ────────────────────────────────────────────────
export async function fetchQATemplates(): Promise<QATemplate[]> {
    const res = await fetch("/api/manufacturing/finished-goods/qa-templates");
    if (!res.ok) throw new Error("Failed to fetch QA templates from BFF");
    return res.json();
}

export async function createQATemplate(template: Omit<QATemplate, "template_id">): Promise<{ success: boolean; template: QATemplate }> {
    const res = await fetch("/api/manufacturing/finished-goods/qa-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template)
    });
    if (!res.ok) throw new Error("Failed to create QA template via BFF");
    return res.json();
}

export async function saveQATemplate(templateId: number, template: Partial<QATemplate>): Promise<{ success: boolean; template: QATemplate }> {
    const res = await fetch(`/api/manufacturing/finished-goods/qa-templates/${templateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(template)
    });
    if (!res.ok) throw new Error("Failed to update QA template via BFF");
    return res.json();
}

export async function fetchAssets(): Promise<AssetRecord[]> {
    const res = await fetch("/api/manufacturing/finished-goods/assets");
    if (!res.ok) throw new Error("Failed to fetch assets from BFF");
    return res.json();
}

export async function fetchDepartments(): Promise<DepartmentRecord[]> {
    const res = await fetch("/api/manufacturing/finished-goods/departments");
    if (!res.ok) throw new Error("Failed to fetch departments from BFF");
    return res.json();
}

export async function createAsset(asset: Omit<AssetRecord, "id">): Promise<{ success: boolean; asset: AssetRecord }> {
    const res = await fetch("/api/manufacturing/finished-goods/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(asset)
    });
    if (!res.ok) throw new Error("Failed to create asset via BFF");
    return res.json();
}

export async function saveAsset(assetId: number, asset: Partial<AssetRecord>): Promise<{ success: boolean; asset: AssetRecord }> {
    const res = await fetch(`/api/manufacturing/finished-goods/assets/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(asset)
    });
    if (!res.ok) throw new Error("Failed to update asset via BFF");
    return res.json();
}

export async function deleteAsset(assetId: number): Promise<{ success: boolean }> {
    const res = await fetch(`/api/manufacturing/finished-goods/assets/${assetId}`, {
        method: "DELETE"
    });
    if (!res.ok) throw new Error("Failed to delete asset via BFF");
    return res.json();
}

// disabled-lint-next-line @typescript-eslint/no-explicit-any
export async function fetchItems(): Promise<any[]> {
    const res = await fetch("/api/manufacturing/finished-goods/items");
    if (!res.ok) throw new Error("Failed to fetch items from BFF");
    return res.json();
}

export async function createItem(item: { item_name: string; item_type?: number; item_classification?: number }): Promise<{ success: boolean; item: any }> {
    const res = await fetch("/api/manufacturing/finished-goods/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item)
    });
    if (!res.ok) throw new Error("Failed to create catalog item via BFF");
    return res.json();
}

// disabled-lint-next-line @typescript-eslint/no-explicit-any
export async function fetchItemTypes(): Promise<any[]> {
    const res = await fetch("/api/manufacturing/finished-goods/item-types");
    if (!res.ok) throw new Error("Failed to fetch item types from BFF");
    return res.json();
}

// disabled-lint-next-line @typescript-eslint/no-explicit-any
export async function fetchItemClassifications(): Promise<any[]> {
    const res = await fetch("/api/manufacturing/finished-goods/item-classifications");
    if (!res.ok) throw new Error("Failed to fetch item classifications from BFF");
    return res.json();
}

export async function createItemType(name: string): Promise<{ success: boolean; type: any }> {
    const res = await fetch("/api/manufacturing/finished-goods/item-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error("Failed to create item type via BFF");
    return res.json();
}

export async function createItemClassification(name: string): Promise<{ success: boolean; classification: any }> {
    const res = await fetch("/api/manufacturing/finished-goods/item-classifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
    });
    if (!res.ok) throw new Error("Failed to create item classification via BFF");
    return res.json();
}





