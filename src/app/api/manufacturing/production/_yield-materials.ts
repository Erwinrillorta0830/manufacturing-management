/* eslint-disable @typescript-eslint/no-explicit-any */
import { DIRECTUS_URL, headers } from "@/app/api/manufacturing/directus-api";
import { getActiveVersionForProduct, getBOMDetailsForVersion } from "../finished-goods/versions/versions-helper";

export interface ResolvedYieldJobOrder {
    jobOrderId: number;
    jobOrderNo: string;
    productId: number;
    branchId: number | null;
    targetQuantity: number;
    versionId: number | null;
    status?: string | null;
    actualQuantityProduced: number;
}

export interface YieldMaterial {
    materialId: number;
    jobOrderId: number;
    productId: number;
    productName: string;
    productCode: string;
    unitOfMeasure: string;
    allocatedQuantity: number;
    actualConsumedQuantity: number;
    scrapQuantity: number;
    reservedQuantity: number;
    remainingQuantity: number;
    // Retain the Directus names while callers migrate to the typed camelCase contract.
    jo_material_id: number;
    job_order_id: number;
    product_id: number;
    allocated_quantity: number;
    actual_consumed_quantity: number;
    scrap_quantity: number;
    reserved_quantity: number;
    product_name: string;
    product_code: string;
    unit_shortcut: string;
}

export interface ResolvedYieldMaterials {
    jobOrder: ResolvedYieldJobOrder;
    materials: YieldMaterial[];
}

export class YieldMaterialsError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string
    ) {
        super(message);
        this.name = "YieldMaterialsError";
    }
}

function relationId(value: unknown): number {
    if (value && typeof value === "object") {
        const relation = value as Record<string, unknown>;
        return Number(
            relation.job_order_id
            ?? relation.jo_material_id
            ?? relation.product_id
            ?? relation.branch_id
            ?? relation.version_id
            ?? relation.lot_id
            ?? relation.sales_order_detail_id
            ?? relation.order_id
            ?? relation.id
            ?? 0
        );
    }
    return Number(value ?? 0);
}

function requiredNumber(value: unknown, label: string, allowZero = true): number {
    if (value === undefined || value === null || value === "") {
        throw new YieldMaterialsError(502, "MATERIAL_DATA_INVALID", `${label} is missing from the material data.`);
    }

    const result = Number(value);
    if (!Number.isFinite(result) || (allowZero ? result < 0 : result <= 0)) {
        throw new YieldMaterialsError(502, "MATERIAL_DATA_INVALID", `${label} must be a finite ${allowZero ? "non-negative" : "positive"} number.`);
    }
    return result;
}

async function readJson(response: Response, label: string): Promise<any> {
    let payload: any = null;
    const responseText = await response.text();
    try {
        payload = responseText ? JSON.parse(responseText) : null;
    } catch {
        payload = null;
    }

    if (!response.ok) {
        throw new YieldMaterialsError(502, "MATERIAL_LOOKUP_FAILED", `${label} failed with HTTP ${response.status}.`);
    }

    if (!payload || payload.data === undefined || payload.data === null) {
        throw new YieldMaterialsError(502, "MATERIAL_LOOKUP_FAILED", `${label} returned no data.`);
    }

    return payload.data;
}

async function fetchDirectusData(url: string, label: string): Promise<any> {
    try {
        const response = await fetch(url, { headers, cache: "no-store" });
        return await readJson(response, label);
    } catch (error) {
        if (error instanceof YieldMaterialsError) throw error;
        throw new YieldMaterialsError(502, "MATERIAL_LOOKUP_FAILED", `${label} could not be loaded.`);
    }
}

function firstRecord(data: unknown): Record<string, any> | null {
    if (!Array.isArray(data) || data.length === 0 || !data[0] || typeof data[0] !== "object") return null;
    return data[0] as Record<string, any>;
}

export async function resolveYieldJobOrder(reference: string | number): Promise<ResolvedYieldJobOrder> {
    const normalizedReference = String(reference ?? "").trim();
    if (!normalizedReference) {
        throw new YieldMaterialsError(400, "JOB_ORDER_ID_REQUIRED", "A job order ID or number is required.");
    }

    const isNumericId = /^\d+$/.test(normalizedReference);
    const filter = isNumericId
        ? `filter[job_order_id][_eq]=${encodeURIComponent(normalizedReference)}`
        : `filter[job_order_no][_eq]=${encodeURIComponent(normalizedReference)}`;
    const fields = [
        "job_order_id",
        "job_order_no",
        "product_id",
        "branch_id",
        "target_quantity",
        "quantity",
        "version_id",
        "status",
        "actual_quantity_produced"
    ].join(",");
    const data = await fetchDirectusData(
        `${DIRECTUS_URL}/items/manufacturing_job_orders?${filter}&fields=${fields}&limit=1`,
        "Job order lookup"
    );
    const record = firstRecord(data);

    if (!record) {
        throw new YieldMaterialsError(404, "JOB_ORDER_NOT_FOUND", `Job order ${normalizedReference} was not found.`);
    }

    const jobOrderId = relationId(record.job_order_id ?? record.id);
    const productId = relationId(record.product_id);
    if (!Number.isFinite(jobOrderId) || jobOrderId <= 0 || !Number.isFinite(productId) || productId <= 0) {
        throw new YieldMaterialsError(502, "MATERIAL_DATA_INVALID", "The job order has an invalid ID or product ID.");
    }

    const rawTargetQuantity = record.target_quantity ?? record.quantity;
    const targetQuantity = requiredNumber(rawTargetQuantity, "Job-order target quantity", false);
    const branchId = record.branch_id == null ? null : relationId(record.branch_id);
    const versionId = record.version_id == null ? null : relationId(record.version_id);

    return {
        jobOrderId,
        jobOrderNo: String(record.job_order_no || normalizedReference),
        productId,
        branchId: branchId && branchId > 0 ? branchId : null,
        targetQuantity,
        versionId: versionId && versionId > 0 ? versionId : null,
        status: record.status == null ? null : String(record.status),
        actualQuantityProduced: record.actual_quantity_produced == null ? 0 : requiredNumber(record.actual_quantity_produced, "Actual produced quantity")
    };
}

function normalizeMaterialRow(row: Record<string, any>, jobOrderId: number, productMap: Map<number, Record<string, any>>): YieldMaterial {
    const materialId = relationId(row.jo_material_id ?? row.id);
    const rowJobOrderId = relationId(row.job_order_id);
    const productId = relationId(row.product_id);

    if (!Number.isFinite(materialId) || materialId <= 0 || rowJobOrderId !== jobOrderId || !Number.isFinite(productId) || productId <= 0) {
        throw new YieldMaterialsError(502, "MATERIAL_DATA_INVALID", "A material row has an invalid ID or job-order relationship.");
    }

    const allocatedQuantity = requiredNumber(row.allocated_quantity, "Allocated material quantity");
    const actualConsumedQuantity = requiredNumber(row.actual_consumed_quantity, "Actual consumed material quantity");
    const scrapQuantity = requiredNumber(row.scrap_quantity, "Scrap material quantity");
    const reservedQuantity = requiredNumber(row.reserved_quantity, "Reserved material quantity");
    const product = productMap.get(productId);
    const productName = String(product?.product_name || row.product_name || `Product #${productId}`);
    const productCode = String(product?.product_code || row.product_code || "");
    const unitOfMeasure = String(product?.unit_of_measurement?.unit_shortcut || row.unit_shortcut || "units");

    return {
        materialId,
        jobOrderId,
        productId,
        productName,
        productCode,
        unitOfMeasure,
        allocatedQuantity,
        actualConsumedQuantity,
        scrapQuantity,
        reservedQuantity,
        remainingQuantity: Math.max(0, allocatedQuantity - actualConsumedQuantity),
        jo_material_id: materialId,
        job_order_id: jobOrderId,
        product_id: productId,
        allocated_quantity: allocatedQuantity,
        actual_consumed_quantity: actualConsumedQuantity,
        scrap_quantity: scrapQuantity,
        reserved_quantity: reservedQuantity,
        product_name: productName,
        product_code: productCode,
        unit_shortcut: unitOfMeasure
    };
}

export async function loadYieldMaterials(reference: string | number): Promise<ResolvedYieldMaterials> {
    const jobOrder = await resolveYieldJobOrder(reference);
    const fields = [
        "jo_material_id",
        "job_order_id",
        "product_id",
        "allocated_quantity",
        "actual_consumed_quantity",
        "scrap_quantity",
        "reserved_quantity"
    ].join(",");
    const rawRows = await fetchDirectusData(
        `${DIRECTUS_URL}/items/manufacturing_job_order_materials?filter[job_order_id][_eq]=${encodeURIComponent(String(jobOrder.jobOrderId))}&fields=${fields}&limit=-1`,
        `Materials lookup for Job Order ${jobOrder.jobOrderNo}`
    );

    if (!Array.isArray(rawRows)) {
        throw new YieldMaterialsError(502, "MATERIAL_LOOKUP_FAILED", "The materials lookup returned an invalid collection.");
    }

    const rawProductIds = rawRows
        .map((row: any) => relationId(row?.product_id))
        .filter((productId: number) => Number.isFinite(productId) && productId > 0);
    const productMap = new Map<number, Record<string, any>>();

    if (rawProductIds.length > 0) {
        const productIds = [...new Set(rawProductIds)].join(",");
        try {
            const products = await fetchDirectusData(
                `${DIRECTUS_URL}/items/products?filter[product_id][_in]=${encodeURIComponent(productIds)}&fields=product_id,product_name,product_code,unit_of_measurement.unit_shortcut&limit=-1`,
                "Material product enrichment"
            );
            if (Array.isArray(products)) {
                products.forEach((product: Record<string, any>) => productMap.set(Number(product.product_id), product));
            }
        } catch (error) {
            // Product labels are optional; the material IDs and accounting quantities are not.
            if (error instanceof YieldMaterialsError) {
                console.warn("Material product enrichment unavailable:", error.message);
            }
        }
    }

    return {
        jobOrder,
        materials: rawRows.map((row: Record<string, any>) => normalizeMaterialRow(row, jobOrder.jobOrderId, productMap))
    };
}

function getBomItems(version: Record<string, any>, routes: any[]): any[] {
    if (Array.isArray(version.bom_items)) return version.bom_items;
    return routes.flatMap((route: any) => Array.isArray(route?.bom_items) ? route.bom_items : []);
}

export async function verifyZeroComponentBOM(jobOrder: ResolvedYieldJobOrder): Promise<void> {
    const details = jobOrder.versionId
        ? await getBOMDetailsForVersion(jobOrder.productId, jobOrder.versionId)
        : await getActiveVersionForProduct(jobOrder.productId);
    const version = details.version as unknown as Record<string, any> | null;

    if (!version) {
        throw new YieldMaterialsError(502, "MATERIAL_BOM_UNVERIFIED", `The BOM/version for Job Order ${jobOrder.jobOrderNo} could not be verified.`);
    }

    const requiredComponents = getBomItems(version, details.routes)
        .filter((item: any) => Number(item?.quantity_required ?? item?.quantity ?? 0) > 0);
    if (requiredComponents.length > 0) {
        throw new YieldMaterialsError(
            422,
            "MATERIALS_REQUIRED_NOT_FOUND",
            `Job Order ${jobOrder.jobOrderNo} requires material components, but no material rows were found.`
        );
    }
}

export function calculateIncrementalMaterialConsumption(
    material: Pick<YieldMaterial, "allocatedQuantity" | "actualConsumedQuantity">,
    quantityProduced: number,
    targetQuantity: number
): number {
    if (!Number.isFinite(quantityProduced) || quantityProduced <= 0) {
        throw new YieldMaterialsError(400, "INVALID_YIELD_QUANTITY", "Produced quantity must be a positive number.");
    }
    if (!Number.isFinite(targetQuantity) || targetQuantity <= 0) {
        throw new YieldMaterialsError(502, "MATERIAL_DATA_INVALID", "Job-order target quantity must be a positive number.");
    }

    const yieldRatio = quantityProduced / targetQuantity;
    const scaledRequired = material.allocatedQuantity * yieldRatio;
    return Math.max(0, scaledRequired - material.actualConsumedQuantity);
}
